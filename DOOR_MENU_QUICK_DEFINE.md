# 門型選單「快速定義檔」計畫書(現況核實版)

> 對應程式:`client/door_registry.ts`(新)、`client/doors.ts`、`client/store/index.ts`
> 對應測試:`client/doors.spec.ts`(既有測試已用 `Object.values(DOOR_REGISTRY)` 泛用遍歷,自動涵蓋未來新增的門型)

---

## 1. 先講結論:你的計畫書有一半已經做完了,另一半這次補上了

你附的 AI 草擬計畫書提出三個步驟。核對現有程式碼後:

| 計畫書步驟 | 現況 | 這次的動作 |
|-----------|------|-----------|
| Step 1:獨立設定檔 | `DOOR_REGISTRY` 早就是集中設定,但混在 `doors.ts` 裡,不是獨立檔案 | ✅ 拆成 `client/door_registry.ts`,就是你要的「快速定義檔」 |
| Step 2:選單動態化(`Object.entries().map()`) | **早就做了**——`toolbar.tsx` 第 467 行的 `DOOR_TYPES.map(...)` 就是動態產生按鈕,CSS 也早有 `flex-wrap: wrap`,門型變多會自動換行,不會撐爆工具列 | 不需要動 |
| Step 3:預設值保護(Fallback) | **沒做**——預設門型寫死字串 `"SD"`,而且如果 `localStorage` 殘留一個已被刪除的門型代號,畫布蓋章時會直接壞掉(存取 `undefined.row1_formula` 拋例外) | ✅ 補上動態預設值 + 失效代號保護 |

另外我在核對過程中發現一個**你的草擬計畫書沒提到、但實際上是唯一真正擋住「純改設定檔就生效」這個目標的關卡**:型別系統與掃描用的正規表示式。這才是這次的重點工作。

---

## 2. 真正的關卡:不是 UI,是 TypeScript 型別和三個正規表示式

在這次修改之前:

```typescript
// doors.ts(舊)
export type DoorTypeCode = "SD" | "BS" | "LM" | "SL" | "FD" | "GD";  // 手動維護的清單

const DOOR_LABEL_REGEX = /(SD|BS|LM|SL|FD|GD)(\d+)-(IL|IR|OL|OR)/g;   // 手動維護
const TYPE_FIELD = /^(SD|BS|LM|SL|FD|GD)$/i;                          // 手動維護
const LABEL_FIELD = /^(SD|BS|LM|SL|FD|GD)(\d+)(?:-(IL|IR|OL|OR))?$/i; // 手動維護
```

`DOOR_REGISTRY` 的型別是 `Record<DoorTypeCode, DoorConfig>`——這代表**如果你在 `DOOR_REGISTRY` 加一個新代號(如 `"DD"`)卻沒同步加進 `DoorTypeCode` 這行,TypeScript 編譯直接報錯**:「Object literal may only specify known properties」。就算你手動同步了型別,畫布上蓋章後的**掃描辨識**(`scanDoors`,決定匯出 Excel 時抓哪些門)與 **Excel 匯入解析**(`TYPE_FIELD`/`LABEL_FIELD`,決定匯入時認不認得這個代號)還是兩個完全獨立、要手動改的正規表示式——漏改的話,新門型能蓋章、能存圖,但**匯出 Excel 抓不到它、匯入也認不出它**,是那種不會馬上爆炸、但會讓功能悄悄不完整的錯誤。

---

## 3. 這次的修正:讓型別和正規表示式都「長」出來,不用手動同步

### 3.1 新檔案 `client/door_registry.ts`——你的快速定義檔

```typescript
export interface DoorConfig {
  name: string;
  englishName: string;
  row1_formula: string;
}

export const DOOR_REGISTRY = {
  SD: { name: "懸吊門", englishName: "Suspension Door", row1_formula: "'●' + '─' * (W-2) + '●'" },
  BS: { name: "緩衝懸吊門", englishName: "Buffer Suspension Door", row1_formula: "'●├' + '─' * (W-4) + '┤●'" },
  LM: { name: "拉門", englishName: "Sliding Door", row1_formula: "'◄' + '═' * (W-1)" },
  SL: { name: "推拉門", englishName: "Sliding Door", row1_formula: "'◄' + '═' * (W-2) + '►'" },
  FD: { name: "折門", englishName: "Folding Door", row1_formula: "'/\\' * W" },
  GD: { name: "幽靈門", englishName: "Ghost Door", row1_formula: "'░' * W" },
} satisfies Record<string, DoorConfig>;

export type DoorTypeCode = keyof typeof DOOR_REGISTRY;   // ← 型別「長」出來,不是手寫的
export const DOOR_TYPE_CODES = Object.keys(DOOR_REGISTRY) as DoorTypeCode[];
```

關鍵是 `export type DoorTypeCode = keyof typeof DOOR_REGISTRY;`——型別直接**從物件的 key 反推**,不再是另外手寫的清單。你以後加一個新門型,TypeScript 自動知道多了一個合法代號,不會再要求你去改型別宣告那一行。

### 3.2 `doors.ts` 的三個正規表示式改成「用資料組出來」

```typescript
const DOOR_TYPE_ALTERNATION = DOOR_TYPE_CODES.join("|");   // 例如 "SD|BS|LM|SL|FD|GD"

const DOOR_LABEL_REGEX = new RegExp(`(${DOOR_TYPE_ALTERNATION})(\\d+)-(IL|IR|OL|OR)`, "g");
const TYPE_FIELD = new RegExp(`^(${DOOR_TYPE_ALTERNATION})$`, "i");
const LABEL_FIELD = new RegExp(`^(${DOOR_TYPE_ALTERNATION})(\\d+)(?:-(IL|IR|OL|OR))?$`, "i");
```

這三個正規表示式現在**在程式啟動時自動從 `DOOR_TYPE_CODES` 組出來**,新增門型後,畫布掃描(`scanDoors`)、Excel 匯出時的辨識、Excel 匯入時的解析,全部自動跟著更新,不需要再去改任何一個正規表示式。

### 3.3 `store/index.ts`:預設值不再寫死,且擋掉失效代號

```typescript
function validDoorType(type: DoorTypeCode): DoorTypeCode {
  return DOOR_TYPE_CODES.includes(type) ? type : DOOR_TYPE_CODES[0];
}
// 初始化狀態:
doorType: validDoorType(readPersistent<DoorTypeCode>("doorType", DOOR_TYPE_CODES[0])),
```

- 沒有設定過的使用者:預設值自動取「設定檔裡的第一個門型」,不再寫死 `"SD"`——如果你把 `SD` 從設定檔移除,系統不會壞掉。
- 曾經選過某個門型、但那個門型後來被你從設定檔刪掉的使用者(`localStorage` 裡殘留一個已經不存在的代號):現在會安全地退回第一個門型,而不是讓 `DrawDoor` 工具去存取一個不存在的設定值而整個崩潰。

---

## 4. 新增一種門型的完整流程(現在真的只需要一步)

以你計畫書裡舉的例子——新增「雙開彈簧門(DD)」——實測步驟:

**打開 `client/door_registry.ts`,在 `DOOR_REGISTRY` 裡加一筆:**

```typescript
DD: {
  name: "雙開彈簧門",
  englishName: "Double Swing Door",
  row1_formula: "'▼' + '─' * (W-4) + '▼'",
},
```

**存檔,重新編譯(`bazel build client:bundle` 或開發模式自動重新整理)。就這樣。**

我實際做了這個測試(加入 `DD`、重新編譯、在瀏覽器裡打開驗證、截圖存證、再改回原狀),確認:

- ✅ 工具列門面板自動多出 `[DD 雙開彈簧門]` 按鈕(見附圖),按鈕自動換行、不撐壞版面。
- ✅ 點選後在畫布蓋章,產生 `DD01-IL`,特徵列用你定義的公式 `▼──────▼` 正確渲染。
- ✅ TypeScript 編譯全程無錯誤——只改了 `door_registry.ts` 一個檔案。
- ✅ 84 項單元測試全數通過(既有測試用 `Object.values(DOOR_REGISTRY)` 泛用遍歷,自動涵蓋新門型,不用另外加測試)。

唯一**還需要**手動確認的是門型公式本身要符合格式規則(見 `DOOR_TEMPLATE_FORMAT.md`)——這是公式語法的限制,不是選單/型別系統的限制,兩者是不同層次的問題。

---

## 5. 這次沒有做的事(誠實列出,避免你以為已經涵蓋)

- **沒有做表單/GUI 編輯器**讓你在瀏覽器裡直接新增門型(填名稱、畫公式、存檔)——目前仍然是「改 TypeScript 檔案 + 重新編譯」的流程,不是「在畫面上按新增按鈕」的流程。這需要額外的檔案讀寫機制(瀏覽器端 App 本身不能寫回原始碼檔案),如果你要這個,得另外設計(例如:改成執行期讀取一份 JSON,而不是編譯期的 TypeScript 常數)。
- **沒有做「上傳 JSON 檔案來新增門型」**——目前的定義檔是 TypeScript 原始碼(有型別檢查、有公式語法檢查的好處),不是執行期可以動態載入的 JSON。若要讓非工程師直接貼 JSON 生效(不用重新編譯),需要把 `DOOR_REGISTRY` 從編譯期常數改成執行期載入(例如 fetch 一份 `door-registry.json`),這會犧牲掉 TypeScript 在公式語法上的型別保護,是另一個要不要做的取捨。

---

## 6. 附圖說明

截圖顯示:工具列門面板原本 6 個門型按鈕(SD/BS/LM/SL/FD/GD),測試時加入 `DD` 後自動變成 7 個,新按鈕自動接在後面且處於選中狀態(藍框標示),下方蓋章結果正確顯示 `DD01-IL` 與自訂公式渲染的特徵列。此圖是「加入登記檔一筆資料 → 選單與畫布同步自動更新」這個承諾的直接證據,而非模擬示意圖。
