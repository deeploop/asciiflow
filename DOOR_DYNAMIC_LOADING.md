# 門型「執行期動態載入」實作報告(免重新編譯)

> 對應程式:`client/door_registry.ts`、`client/doors.ts`、`client/store/index.ts`、`client/toolbar.tsx`
> 對應測試:`client/doors.spec.ts`(`describe("custom (runtime-loaded) door registry", ...)`)
> 範例檔案:`custom_doors.example.json`、`custom_doors.example.txt`

---

## 1. 你的草案裡有一個會導致功能失效的設計問題

草案提出用 `export let ACTIVE_DOOR_REGISTRY` 這種「模組層級可變變數」來存放合併後的門型清單,並在載入新檔案時重新賦值。**這個做法在這個專案裡實際上不會動。**

原因:這個 React 應用的畫面更新完全依賴 **Zustand store**(`useAppStore`)的訂閱機制——元件只有在它訂閱的 store 狀態改變時才會重新渲染。`export let X` 這種模組變數的重新賦值,對 React 來說是「看不見」的事件,不會觸發任何重新渲染。實際情況會是:你選好檔案、`updateDoorRegistryAndRegex()` 執行完畢、資料也確實更新了——但畫面上的選單**不會馬上更新**,要等到使用者做了其他會觸發 Zustand 狀態改變的操作(比如切換工具、拖曳畫布)時,才會「順便」把新按鈕畫出來。這種「有時候會動、有時候不會動」的行為在測試時很容易被忽略(因為開發者自己操作應用時常常會無意間觸發別的重新渲染),但終端使用者會遇到「明明載入成功、選單卻沒反應」的困惑體驗。

### 修正後的作法

保留「模組層級可變狀態」放實際的門型資料(這部分沒問題,因為 `doors.ts` 裡的函式本來就是普通函式,不是 React 元件,不需要活在 Zustand 裡),但額外在 Zustand store 裡放一個**純粹用來觸發重新渲染的版本號**:

```typescript
// store/index.ts,AppState 裡:
doorRegistryVersion: number;

// 載入新檔案時:
loadCustomDoorTypes(registry) {
  setCustomDoorRegistryModule(merged);      // 更新 doors.ts 模組狀態(真正的資料)
  writePersistent("customDoorRegistry", merged); // 持久化
  useAppStore.setState((s) => ({
    doorRegistryVersion: s.doorRegistryVersion + 1, // ← 這一行才是「讓畫面真的更新」的關鍵
    doorType: validDoorType(s.doorType),
  }));
},
```

工具列的門面板訂閱這個版本號(`useAppStore((s) => s.doorRegistryVersion)`),每次版本號改變就重新呼叫 `getDoorTypes()` 取得最新清單並重新渲染。資料本身不放進 Zustand(避免資料重複),但「資料變了」這件事透過版本號正確地通知 React——兩全其美。

---

## 2. 資安考量:草案沒提到,但實際上是必要的一道防線

門型代號最終會被組進 `new RegExp(...)`,用來掃描畫布上的門標籤、解析 Excel 匯入資料。**如果直接把使用者上傳檔案裡的代號原封不動塞進正規表示式,一個像 `.*` 或 `(SD)` 這樣的「代號」就可能讓正規表示式的語意完全跑掉**——輕則辨識錯亂,重則造成非預期的比對結果。

因應方式是在代號進入合併清單之前,強制檢查格式:

```typescript
const VALID_DOOR_CODE = /^[A-Z]{1,4}$/;  // 只接受 1~4 個大寫英文字母
```

只要代號不符合這個格式,`validateDoorConfig()` 就直接拒絕,連公式都不會去解析——這保證了不管使用者上傳什麼內容,能真正進入 `setCustomDoorRegistry()`、進而影響正規表示式建構的字串,永遠只會是安全的英文字母組合。

---

## 3. 公式也要驗證——而且這次測試真的抓到一個我自己犯的錯

`validateDoorConfig()` 不只檢查代號格式與欄位是否齊全,還會**真的把公式丟進既有的 `renderDoorLine()` 引擎跑過幾個寬度(14、15、20、30)**,確認:

1. 公式本身能正確解析(不會拋例外)。
2. 輸出長度剛好等於指定寬度——這就是 `DOOR_TEMPLATE_FORMAT.md` 提到的「寬度不變量」。

寫測試的過程中,我用了跟前一次示範「DD 雙開彈簧門」一樣的公式 `'▼' + '─' * (W-4) + '▼'` 當測試假資料,結果**驗證器直接判定它不合法**——因為 `▼` 是單一字元端帽(佔 1 格),應該對應 `(W-2)`,`(W-4)` 是給像 BS 那種雙字元端帽(`●├`/`┤●`)用的公式。也就是說,**前一次在瀏覽器裡人工檢查、看起來「畫面正確」的示範,其實 row1 特徵列比框線窄了 2 格**,只是視覺上不明顯所以沒被肉眼發現。

這是新增驗證機制帶來的直接效益:以前公式錯誤只能靠人工目視或畫面跑版才會發現,現在**任何一筆定義在被接受之前,都會先過一次程式化的寬度檢查**,包含我自己手寫的公式在內。已修正 `custom_doors.example.json/.txt` 裡的公式為正確版本(`(W-2)`)。

---

## 4. 定義檔格式(兩種都支援,自動判斷)

### 4.1 JSON 格式(`custom_doors.example.json`)

```json
{
  "DD": {
    "name": "雙開彈簧門",
    "englishName": "Double Swing Door",
    "row1_formula": "'▼' + '─' * (W-2) + '▼'"
  },
  "RD": {
    "name": "捲門",
    "englishName": "Roller Shutter Door",
    "row1_formula": "'▤' * W"
  }
}
```

### 4.2 純文字區塊格式(`custom_doors.example.txt`)——你草案裡提的格式,已實作

```
=== DOOR: DD ===
name: 雙開彈簧門
englishName: Double Swing Door
row1_formula: '▼' + '─' * (W-2) + '▼'

=== DOOR: RD ===
name: 捲門
englishName: Roller Shutter Door
row1_formula: '▤' * W
```

`parseDoorRegistryFile()` 會自動判斷檔案是 JSON 還是文字區塊格式(看內容開頭是不是 `{`),兩種格式解析後走同一套驗證邏輯。**任何一筆資料驗證失敗,只有那一筆會被跳過並回報原因,不會讓整個檔案載入失敗**——這點跟 Excel 門表匯入的「部分成功」設計一致。

---

## 5. 完整流程(已在瀏覽器實測,非模擬)

1. 開啟 door 面板,點 **[load door types]**,選擇 `.json` 或 `.txt` 定義檔。
2. 每一筆資料先驗證(代號格式、必填欄位、公式寬度),只有通過的才會被加入。
3. 選單**立即**多出新按鈕(圖見下方截圖),不需重新整理頁面。
4. 新門型可以直接點選、在畫布蓋章、匯出 Excel 時也會正確帶出中文/英文名稱。
5. **重新整理頁面後,已載入的自訂門型仍然存在**(存在 `localStorage`)。
6. 點 **[reset custom types]** 只會移除自訂載入的門型,六個內建門型不受影響。

實測用的正是上面附的 `custom_doors.example.json`——不是憑空模擬,是真的透過瀏覽器的檔案選擇對話框機制載入、蓋章、重新整理、清除,全程截圖存證。

---

## 6. 型別安全的取捨(誠實說明,不是含糊帶過)

草案的框架暗示「可以同時保有 TypeScript 型別保護,又能動態載入」,但這兩者有一個地方**無法兩全**:

- `DoorTypeCode` 原本是 `"SD" | "BS" | "LM" | "SL" | "FD" | "GD"` 這種在編譯期就固定死的字面量聯合型別。
- 一旦允許執行期載入未知代號(`"DD"`、`"RD"`,或使用者自己取的任何合法代號),TypeScript **不可能在編譯的當下就知道這些代號存在**——這是動態載入本質上的限制,不是實作沒做好。

所以這次把 `DoorTypeCode` 放寬成 `string`,另外保留 `BuiltInDoorTypeCode`(原本的字面量聯合型別)給那些「明確只想處理內建門型」的地方使用(例如測試裡想斷言「內建門型清單」時)。**公式語法本身的安全性完全不受影響**——`row1_formula` 一樣是透過 `renderDoorLine()` 的手寫 token 解析器執行,不是 `eval()`,這部分的保護跟門型代號是否為字面量型別無關。

---

## 7. 這次沒有做的事

- **沒有做視覺化的公式編輯器**(例如即時預覽輸入的公式渲染結果)——目前驗證失敗只會回報文字錯誤訊息(如「輸出了 12 個字元,必須恰好是 14」),使用者要自己對照 `DOOR_TEMPLATE_FORMAT.md` 修正公式。
- **多檔案載入採「合併」而非「取代」**——重複載入不同檔案,新代號會疊加;若兩個檔案定義了同一個代號,後載入的會覆蓋先前的(含覆蓋內建門型),沒有另外跳出「是否要覆蓋」的確認對話框。如果你預期使用情境是「不同人各自維護一份完整定義檔、不该互相疊加」,這裡可能需要改成「取代」語意,请告诉我要不要调整。
- **沒有做定義檔的「匯出」功能**——目前可以匯入自訂門型,但沒有一個按鈕能把目前載入的自訂門型清單存成檔案帶走(例如分享給同事)。這是合理的下一步,但這次沒做。

## 8. 附圖

截圖顯示:載入 `custom_doors.example.json` 後,選單從 6 個按鈕變成 8 個(多出 `DD 雙開彈簧門`、`RD 捲門`,且 `DD` 為當前選中狀態),下方畫布正確蓋出兩個新門型的印章,公式渲染寬度與外框完全對齊,右下角 toast 顯示「loaded 2 door type(s): DD, RD」。此圖為實際瀏覽器截圖,非示意圖。
