# 「Run Intent」整合進 ASCIIFlow 選單——實作回報

> 把上一輪做的獨立 HTML 工具,改成 ASCIIFlow 工具列上的一個選單按鈕、彈出對話框——已實作、已測試、已在真實瀏覽器(含完整假網路回應模擬)驗證。

---

## 1. 這是什麼、跟畫圖功能完全無關

工具列最上面(help 按鈕左邊)多了一個 `[intent]` 按鈕,點下去會彈出一個對話框:

```
┌─────────────────────────────────────────┐
│ run intent                               │
├─────────────────────────────────────────┤
│ MCP endpoint (saved only in this browser)│
│ [___________________________________]    │
│                                           │
│ intent: [選擇一個 intent... (48 found) ▾] [reload] │
│ (選中後這裡顯示該 intent 的說明文字)         │
│                                           │
│ testArgs (JSON):                         │
│ [textarea]                               │
│                                           │
│ lastResult:                              │
│ [textarea]                               │
│                                           │
│ [run intent]        (執行狀態訊息)         │
└─────────────────────────────────────────┘
```

這是一個**跟畫 ASCII 圖完全無關的除錯/維運小工具**,只是借用 ASCIIFlow 現成的對話框元件(`ControlledDialog`)當容器——程式碼裡有明確標註「unrelated to drawing」,方便日後回頭看程式碼時一眼看出這是額外掛上去的功能,不是核心繪圖邏輯的一部分。

---

## 2. 存取金鑰現況(2026-07-13 更新——已改為寫進程式碼,經你三次明確確認)

這份報告最初寫成的時候,設計是「金鑰絕不寫進程式碼」——對話框有一個「MCP endpoint」輸入框,你自己貼上端點網址,只存在你瀏覽器的 localStorage 裡。原因是:這個分支(`claude/asciflow-door-module-locm0t`)**每次 push 都會自動部署到公開的 GitHub Pages 網址**(`.github/workflows/pages.yaml` 設定的),寫死金鑰等於公開發布給任何造訪者。

**你後續三次明確要求把這個網址(含 `accessKey=qwe12326`)設成寫死的預設值**,其中一次是直接回答我「這樣做金鑰會永久曝光、git 紀錄也洗不掉,你確定嗎」這個問題。既然你已經在知情的狀況下明確要求,現在的實作是:

- `client/store/index.ts` 的 `DEFAULT_INTENT_MCP_URL` 常數,值就是這個網址(含金鑰)——**已經寫進程式碼、已經 commit、已經 push、已經部署到公開網址**。
- 對話框開啟時,如果瀏覽器 localStorage 沒有存過別的值,欄位會**自動帶入這個預設值**,不用手動貼。
- 如果你想在自己的瀏覽器換一把不同的金鑰,還是可以直接改欄位內容,一樣會存到 localStorage,蓋過這個預設值——但**預設值本身已經是公開資訊**,任何人打開瀏覽器開發者工具看原始碼或打包後的 JS 都能看到,進而呼叫 `intent_action_run` 對你的 Google Sheets/Apps Script 專案做任何 IntentAction 允許的操作。**如果這把金鑰的曝光讓你在意,建議之後去 Cloudflare Worker 那邊把 `accessKey=qwe12326` 換成新的值**——舊的字串會永遠留在這個 repo 的 git 歷史裡,換掉金鑰本身(而不是只改程式碼)才能真正讓舊金鑰失效。

---

## 3. 運作方式

1. 打開對話框,第一次使用需要先貼上你的 MCP 端點網址。
2. 貼上後點 `[reload]`(或如果之前已經存過網址,對話框打開時會自動載入),會呼叫 `intent_action_list` 讀出所有 intent 名稱,填進下拉選單。
3. 選一個 intent 之後,會**再呼叫一次 `intent_action_list`(帶上 intentName)** 取得該 intent 完整的說明文字、`testArgs`、`lastResult`(這是因為批次列表 API 本身不含 `lastResult`,要單筆查詢才有——完全比照你原本 `readintentlist.js` 的兩段式讀取邏輯)。
4. 你可以直接修改 `testArgs` 欄位裡的 JSON,點 `[run intent]` 會呼叫 `intent_action_run`,把執行結果寫進 `lastResult` 欄位,並顯示成功/失敗狀態。

跟你原本兩支 CLI 腳本(`run-intent.js`、`readintentlist.js`)呼叫的是**完全相同的 JSON-RPC over HTTP 協定**,同一個 `tools/call` 格式,同一套「回應包在 `content[0].text` 裡」的解包邏輯——只是這次包成一個 React 對話框元件,而不是命令列。

---

## 4. 真實驗證

因為這個開發環境的網路政策不允許直接連到你的 Cloudflare Worker 網址(沙盒環境的既有限制,不是這個功能的問題),我用兩層方式驗證,確保邏輯是對的:

1. **先用我在這個對話階段裡連接到的 `googlemcpv1` MCP 工具,直接呼叫真正的 `intent_action_list`/`intent_action_run`**,拿到你專案裡**真實的 48 個 intent 清單**,以及執行 `listSheetNames` 得到跟你範例完全一致的 9 個工作表名稱結果——確認回應資料的實際格式(哪些欄位在哪一層)。
2. **用這份真實抓到的資料格式,在 headless Chromium 裡完整跑一次 ASCIIFlow 的真實介面**:攔截網路請求、用剛剛驗證過的真實格式回傳假資料,實際點擊工具列的 `[intent]` 按鈕、輸入端點網址、點 reload、選擇 intent、確認欄位正確填入、點擊執行、確認結果正確顯示,最後關閉對話框重新打開,確認**端點網址有記住、但表單其他欄位會重新載入**(符合預期)。

兩層驗證都通過。**唯一沒辦法在這裡驗證的是你的網址在真實網路環境下、跨網域(CORS)呼叫是否會被瀏覽器擋下**——這個要麻煩你自己在瀏覽器裡實際試一次點擊執行,如果 Cloudflare Worker 沒有回傳允許跨網域的標頭,瀏覽器主控台會出現 CORS 相關錯誤;如果真的遇到,請告訴我,我可以幫忙看要在 Worker 端加什麼標頭,或者調整前端呼叫方式。

### 4.1 寫死預設值之後的追加驗證

改成寫死預設值後,重新建置、重新用**全新、沒有任何 localStorage 資料**的瀏覽器分頁測試,確認:
- 對話框一打開,「MCP endpoint」欄位**已經自動帶入這個網址**,不用手動輸入任何東西。
- 送出的請求網址(含 query string)跟預設值完全一致。
- intent 清單**自動載入**,不需要先手動貼網址再按 reload。

全專案回歸測試重新跑過,178 個測試維持全數通過,TypeScript 型別檢查乾淨。

## 5. 測試與型別檢查

- 全專案回歸測試:**178 個測試全數通過**,沒有任何既有功能被影響(這次沒有新增 `.spec.ts`——這個功能是網路串接 + UI 表單,核心邏輯簡單,原本獨立 HTML 版本已經過 Playwright 端到端驗證,這次改為在真實 ASCIIFlow 介面裡再次端到端驗證,涵蓋比單元測試更真實的路徑)。
- TypeScript 型別檢查乾淨。

## 6. 檔案清單(本次新增/修改)

- `client/intent_run.tsx`(新增——對話框元件、MCP 呼叫邏輯)
- `client/store/index.ts`(新增 `intentMcpUrl` 持久化設定)
- `client/toolbar.tsx`(工具列新增 `[intent]` 按鈕)
- `INTENT_RUN_INTEGRATION.md`(本文件)
