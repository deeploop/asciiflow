# 如何用 AI 快速建立新的 `AF_` Intent——中文說明

> 對應 `AF_INTENT_AI_PROMPT.md`——這份是「怎麼用」的中文說明,那份是**可以直接複製貼給 AI 的英文 prompt 本體**(prompt 本身用英文寫是刻意的,跟之前 `DOOR_TEMPLATE_AI_PROMPT.md` 的慣例一致,英文對大部分模型執行指令類任務的穩定度較好)。

---

## 1. 為什麼需要這份 prompt

上一輪把 `run intent` 對話框改成「輸入輸出都是純文字,不用打 JSON」之後,這個對話框其實對**新建立的 intent 程式碼**有三個隱性規定:

1. **名字要以 `AF_` 開頭**——不然選單裡根本看不到它(選單現在只顯示 `AF_` 開頭的 intent)。
2. **你的函式收到的參數,固定是 `{ raw: "使用者打的那段純文字" }`**——不是 `{a, b}` 這種自訂欄位,因為輸入框本來就只是一塊純文字,系統會自動幫你包成 `{"raw": ...}` 再送出去。
3. **你的函式回傳的東西,要能被「自動拆包」還原成乾淨的純文字**——回傳純字串、`{raw: "字串"}`、`{raw: [陣列]}`、或裸陣列都可以正確顯示成好讀的多行文字;如果隨便回傳一個自訂形狀的物件,對話框還是能顯示,但顯示出來的會是一坨 JSON,不會是乾淨的文字。

如果你(或幫你寫程式的 AI)不知道這三條規則,寫出來的 intent 在這個對話框裡用起來就會很難看——要嘛收不到你打的文字,要嘛結果框裡跳出一坨 `{"ok":true,...}` 而不是乾淨的答案。這份 prompt 就是把這三條規則講清楚,讓 AI 一次就寫對。

---

## 2. 怎麼用

1. 打開 `AF_INTENT_AI_PROMPT.md`,把「## PROMPT (copy from here)」底下那一整段複製起來。
2. 貼給一個**有 `intent_action_create` 這個工具可以呼叫的 AI**(例如我自己,在這個對話裡就可以直接用)。
3. 在後面接上你實際想要的功能,例如:

   > 建立一個叫 `AF_wordCount` 的新 intent,輸入多行文字,針對每一行算出字數,輸出「第幾行:幾個字」這樣的格式,一行輸入對一行輸出。

4. AI 看到這份 prompt 之後,就會知道要:
   - 把名字取成 `AF_wordCount`(不是 `wordCount`)
   - 函式寫成 `(args) => { const lines = (args.raw ?? "").split("\n"); ... }`(從 `args.raw` 拿到你打的文字,用換行拆成一行一行)
   - 回傳 `{ raw: "算好的多行結果字串" }`,而不是回傳一個自訂物件
   - `testArgs` 也用同樣的 `{"raw": "..."}` 格式,給一個看得出效果的範例輸入

---

## 3. 對照:一個完整範例

prompt 裡附的範例(把每一行文字轉大寫):

```javascript
// intentName: "AF_upperCaseLines"
(args) => {
  const lines = (args.raw ?? "").split("\n");
  return { raw: lines.map((l) => l.toUpperCase()).join("\n") };
}
```

在對話框裡的實際體驗:

```
testArgs (plain text):
hello
world

[run intent]

lastResult (plain text):
HELLO
WORLD
```

輸入框打兩行小寫,按執行,結果框直接看到兩行大寫——**使用者從頭到尾沒看過任何一個 JSON 符號**,即使背後傳輸的其實是 `{"raw":"hello\nworld"}` 送出去、`{"raw":"HELLO\nWORLD"}` 收回來。

---

## 4. 這份 prompt 的可靠度

這份 prompt 裡描述的「輸入是 `{raw: 文字}`、輸出支援哪幾種格式會被自動拆包成純文字」,**完全對應上一輪實際寫好、測試過的程式碼**(`client/af_raw_format.ts` 的 `packRaw`/`unpackRaw`,16 個單元測試 + 用假資料在真實瀏覽器裡跑過整個流程,包含你原本範例裡的陣列格式 `{"raw":["第1行","第2行","第3行"]}` 轉純文字那個案例)。這次沒有另外去你的試算表建立一個測試用 intent 來驗證——因為那會真的寫一筆新資料進你的 `IntentActions` 分頁,跟單純讀取確認不同,所以我這次只根據已經驗證過的程式邏輯來寫這份 prompt,沒有動你的試算表。如果你想要,我也可以照這份 prompt 直接幫你建一個測試用的 intent(例如上面的 `AF_upperCaseLines`),建完馬上驗證,驗證完可以留著或刪掉,由你決定。
