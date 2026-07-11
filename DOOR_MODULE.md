# ASCIIFlow 門模組(Door Module)設計與實作報告

> 分支:`claude/asciflow-door-module-locm0t`
> 日期:2026-07-10

---

## 1. 需求摘要

在 ASCIIFlow(純前端 ASCII 圖表繪製工具)上新增「門模組」,達成三個目標:

1. **快速繪製門符號**:提供 6 種門型 × 4 種開向的範本(template),點一下畫布即可蓋章式(stamp)放置,並自動編號。
2. **Excel 快速匯入/匯出**:一鍵匯出畫布上所有門的「門表(door schedule)」為 Excel 可直接開啟的 CSV(UTF-8 BOM);也可從 Excel 存出的 CSV 匯入,依座標自動批次繪製所有門。
3. **部署測試**:透過 GitHub Actions 自動建置並部署到 GitHub Pages 供線上試用。

## 2. 門型與開向代號定義

### 2.1 門型(6 種)

| 代號 | 中文名稱 | 英文名稱 | 符號特徵(範本頂列) |
|------|----------|----------|----------------------|
| SD | 懸吊門 | Suspension Door | `●──────●` 上軌吊輪 |
| BS | 緩衝懸吊門 | Buffer Suspension Door | `●├────┤●` 兩端緩衝器 |
| LM | 拉門 | Sliding Door | `◄═══════` 單向滑軌 |
| SL | 推拉門 | Sliding Door | `◄══════►` 雙向滑軌 |
| FD | 折門 | Folding Door | `/\/\/\/\` 折疊摺頁 |
| GD | 幽靈門 | Ghost Door | `░░░░░░░░` 隱藏式(暗門) |

### 2.2 開向(4 種)

以符號「上方=室外、下方=室內」為約定:

| 代號 | 中文名稱 | 英文 | 符號標記 |
|------|----------|------|----------|
| IL | 內開左開 | Inward Left | `▼◄` |
| IR | 內開右開 | Inward Right | `▼►` |
| OL | 外開左開 | Outward Left | `▲◄` |
| OR | 外開右開 | Outward Right | `▲►` |

### 2.3 編號規則

每次放置自動產生流水號(依門型獨立計數):`SD01`、`SD02`、`BS01`……
完整標籤格式為 **`代號+流水號-開向`**,例如 `SD01-IL`。
此標籤同時是匯出掃描的依據(正規表示式 `(SD|BS|LM|SL|FD|GD)(\d+)-(IL|IR|OL|OR)`),所以「畫布本身就是資料庫」,不需要另外維護物件模型。

## 3. 符號範本設計

範本為 4 列的小圖塊,寬度隨標籤長度自動調整。以「SD01-IL(懸吊門、內開左開)」為例:

```
●────────────●      ← 門型特徵列(每種門型不同)
┌────────────┐
│ SD01-IL ▼◄ │      ← 標籤 + 開向標記
└────────────┘
```

六種門型的完整示意:

```
●────────────●   ●├──────────┤●   ◄═════════════
┌────────────┐   ┌────────────┐   ┌────────────┐
│ SD01-IL ▼◄ │   │ BS01-IR ▼► │   │ LM01-OL ▲◄ │
└────────────┘   └────────────┘   └────────────┘
   懸吊門 SD        緩衝懸吊門 BS        拉門 LM

◄════════════►   /\/\/\/\/\/\/\   ░░░░░░░░░░░░░░
┌────────────┐   ┌────────────┐   ┌────────────┐
│ SL01-OR ▲► │   │ FD01-IL ▼◄ │   │ GD01-IR ▼► │
└────────────┘   └────────────┘   └────────────┘
   推拉門 SL          折門 FD          幽靈門 GD
```

設計取捨:

- **不在畫布內使用中文字**:ASCIIFlow 目前尚未支援全形字(CJK)的格點渲染(上游 issue #85),中文會造成格點錯位,因此畫布內只用代號,中文名稱保留在 UI 面板與 Excel 匯出欄位中。
- 所有字元皆取自既有 `UNICODE` 字元集(`●├┤═/\░▼▲◄►` 等 Source Code Pro 皆可正確渲染)。
- 範本置中於游標,按住拖曳可即時預覽(scratch layer),放開才落版(commit),完整支援 undo/redo。

## 4. 操作流程(快速繪製)

1. 工具列新增 **door** 工具(快捷鍵 `Alt+7`)。
2. 選取後,第二列出現「門面板」:
   - 門型按鈕:`[SD 懸吊門] [BS 緩衝懸吊門] [LM 拉門] [SL 推拉門] [FD 折門] [GD 幽靈門]`
   - 開向按鈕:`[IL 內開左] [IR 內開右] [OL 外開左] [OR 外開右]`
   - `[export excel]`(匯出門表)、`[import excel]`(匯入門表)
3. 在畫布上點擊(或拖曳定位後放開)即放置一樘門,編號自動遞增。
4. 鍵盤加速:door 模式下按 `1`–`6` 切換門型;方向鍵 `←/→` 切左/右開、`↑/↓` 切外/內開。
5. 放置後的門符號是一般字元,可用 select 工具整批搬移、複製、刪除。

## 5. Excel 匯入/匯出設計(v2:原生 .xlsx,SheetJS)

### 5.1 實作方式

- 採用 **SheetJS(`xlsx` 0.18.5)** 於純前端讀寫原生 Excel 檔,零後端。
- 匯出:`XLSX.utils.json_to_sheet` + `XLSX.writeFile` 直接觸發下載 `doors-schedule.xlsx`。
- 匯入:`<input type="file">` → `FileReader` 讀成 `ArrayBuffer` → `XLSX.read(data, { type: "array" })` → 第一張工作表 `sheet_to_json` 還原為門列表。SheetJS 會自動判別格式,**.xlsx / .xls / .csv 都走同一條匯入路徑**。
- 代價:bundle 由約 286KB 增為約 707KB(SheetJS 約 +420KB min)。

### 5.2 匯出格式(門表)

檔名 `doors-schedule.xlsx`,工作表 `Doors`,欄位:

| 編號 | 代號 | 中文名稱 | 英文名稱 | 開向代號 | 開向 | X | Y |
|------|------|----------|----------|----------|------|---|---|
| SD01 | SD | 懸吊門 | Suspension Door | IL | 內開左開 | 12 | 5 |

- `X, Y` 為標籤左上角在畫布上的格點座標(匯入時可完整還原位置)。
- 匯出時即時掃描畫布標籤,手動修改過的編號也會如實反映。

### 5.3 匯入格式

支援兩種:

1. **完整格式**:直接匯回上面匯出的檔案(round-trip)。
2. **最簡格式**:每列只要有 `代號`(或完整編號如 `SD01-IL`)、`開向代號`、`X`、`Y` 即可 — **欄位順序不限、有無標題列皆可**,無效列(未知代號、缺座標)會被略過並統計。

匯入行為:每列於 `(X,Y)` 蓋上一個門範本;有給編號就用給定編號,沒給則自動接續現有流水號;整批匯入為單一 undo 步驟,匯入結果(成功樘數/略過列數)以 toast 提示。

### 5.4 範本註冊表(Configuration as Code)

門型定義集中在 `DOOR_REGISTRY`,每種門型的特徵列以公式字串描述(`W` 為符號寬度),由安全的迷你解析器 `renderDoorLine()` 展開 — 不使用 `eval()`,以 regex 斷詞 + 遞迴下降解析四則運算:

```typescript
SD: { name: "懸吊門", englishName: "Suspension Door",
      row1_formula: "'●' + '─' * (W-2) + '●'" },
FD: { name: "折門",   englishName: "Folding Door",
      row1_formula: "'/\\' * W" },  // 圖樣自動平鋪並截斷至 W
```

新增門型只需在註冊表加一筆設定,不用改任何程式邏輯。

## 6. 技術架構

### 6.1 新增 / 修改檔案

| 檔案 | 內容 |
|------|------|
| `client/doors.ts`(新增) | 門型/開向定義、範本產生器 `doorTemplate()`、畫布掃描 `scanDoors()`、`doorsToCsv()` / `parseDoorsCsv()`、自動編號 |
| `client/doors.spec.ts`(新增) | 單元測試:範本、掃描、CSV round-trip |
| `client/draw/door.ts`(新增) | `DrawDoor` 工具,實作 `IDrawFunction`(start/move 預覽、end 落版、handleKey 快捷鍵) |
| `client/store/index.ts` | 新增 `ToolMode.DOOR`、`doorType` / `doorDirection` 狀態(localStorage 持久化)、doorTool 實例 |
| `client/toolbar.tsx` | door 工具頁籤、DoorPanel(門型/開向選擇 + 匯入匯出)、help 說明 |
| `client/controller.ts` | `Alt+7` 快捷鍵 |
| `client/index.html` | 資產路徑改為相對路徑(GitHub Pages 子路徑相容) |
| `.github/workflows/pages.yaml`(新增) | GitHub Pages 自動部署 |

### 6.2 與既有架構的整合方式

- 完全遵循既有 **command pattern**:`DrawDoor` 只寫 scratch layer,`commitScratch()` 落版,天然獲得 undo/redo 與 localStorage 持久化。
- 範本 → `textToLayer()` → scratch,與貼上(paste)走同一條路徑,無需改動渲染器。
- 匯出掃描走 `layerToText()` + 正規表示式,不新增任何持久化格式,分享連結(share URL)內的門也能匯出。

## 7. 測試計畫

| 層級 | 內容 |
|------|------|
| 單元測試(mocha) | 範本尺寸與內容、`scanDoors()` 座標正確性、CSV 匯出→匯入 round-trip、無標題列/最簡欄位解析、自動編號遞增 |
| 建置驗證 | `bazel test //client:all`、`bazel build client:site` |
| 線上驗證 | GitHub Pages 部署後實際操作(放置、匯出、匯入) |

## 8. 部署(GitHub Pages 測試環境)

- 新增 workflow(`.github/workflows/pages.yaml`):push 到本分支時,以 Bazel 建置 `site/...`,並將產出發佈到 `gh-pages` 分支(workflow 的 GITHUB_TOKEN 沒有權限直接透過 API 開啟 Pages,故採 gh-pages 分支模式)。
- **首次需手動開啟一次**:GitHub 儲存庫 → Settings → Pages → Build and deployment → Source 選「Deploy from a branch」→ Branch 選 `gh-pages` / `/ (root)` → Save。之後每次 push 本分支即自動重新部署。
- 測試網址:`https://deeploop.github.io/asciiflow/`。
- 因部署在子路徑,`index.html` 的 `/public/...` 絕對路徑已改為相對路徑;App 使用 HashRouter,路由不受子路徑影響。已在本地以 Playwright 模擬 `/asciiflow/` 子路徑實測 gh-pages 分支的實際產出:資產零 404、門工具正常。
- 正式版仍走原有 Cloudflare Pages workflow(main 分支),兩者互不干擾。

## 9. 已知限制與後續建議

1. **畫布內不支援中文標註**(上游 issue #85 CJK 支援);目前以代號+Excel 對照表解決。
2. **符號是純字元**,放置後與門「物件」脫鉤(上游 issue #58 無物件模型);編輯標籤文字即等於編輯資料,掃描以標籤為準。
3. 後續可擴充:原生 .xlsx(SheetJS)、門扇寬度參數化(依實際門寬決定符號寬度)、牆線自動開口、更多五金代號。
