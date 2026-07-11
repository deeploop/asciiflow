# 立面圖(正視圖/Shop Drawing)自動生成器規格書

> 對應程式:`client/elevation_drawing.ts`
> 對應測試:`client/elevation_drawing.spec.ts`
> 用途:把「廠務加工圖 / 立面規格圖」(如吊趟門、玻璃拉門的正視圖,含房間位置、型號、寬度公式、高度標註、五金位置、下滑輪等)自動轉成 ASCIIFlow 可直接貼上的 ASCII 文字。

---

## 1. 問題背景:為什麼不能直接把中文字貼進格線

你提供的第二張參考圖是典型的門窗加工廠立面規格圖,版面規則可歸納為四個區塊:

| 位置 | 內容 |
|------|------|
| 左上 | 門的位置(房間別),如「廚」「客」 |
| 頂部 | 產品型號規格文字(如「J01(吊)(黑)+5T茶玻+分隔把」)+ 寬度計算公式(如「1114+18+7+24」) |
| 左側 | 高度計算鏈(如 2439 → -45 → -10 → 2384) |
| 主體 | 多片門扇(直向分隔線)+ 每片寬度標註(581、581…)+ 頂部五金圖示 + 看樘(看100)+ 把手位置標註 + 底部防晃輪 |

我第一次手動排版時直接把中文字元一個字元對一個格子放進去,貼到 ASCIIFlow 裡截圖檢查,結果是**中文字元互相重疊、蓋住旁邊的直線與數字**。原因是 ASCIIFlow 目前的格線引擎(如專案 issue #85 所記錄)還不支援「全形字元」:每個格子固定是 1 個字元寬,但瀏覽器實際渲染中文字時寬度大約是英文字元的 2 倍,於是「廚」這種字會蓋到右邊那一格。

**這是這個生成器存在的核心原因**:在生成 ASCII 文字的階段,就先幫每一個中文字元「預留兩格」,讓貼上 ASCIIFlow 之後,视觉宽度和格線位置能對得上——不需要等專案本身修好 issue #85。

---

## 2. 核心技術:寬度感知文字網格(`TextGrid`)

```typescript
export function charWidth(ch: string): 1 | 2   // 中文/全形 = 2,其餘 = 1
export function displayWidth(text: string): number // 整串文字的視覺寬度
export class TextGrid {
  setChar(row, col, ch)       // 寫入一個字元;若是全形字,自動在 col+1 補一個空白「影子格」
  write(row, col, text)       // 逐字元寫入一串文字,回傳下一個可用欄位
  writeCentered(row, colStart, colEnd, text) // 依「視覺寬度」置中(不是依字元數置中)
  hLine(row, colStart, colEnd, ch='─')
  vLine(col, rowStart, rowEnd, ch='│')
  toString()                  // 輸出成多行文字(可直接貼上 ASCIIFlow)
}
```

判斷「是不是全形字」用的是 Unicode 範圍表(涵蓋 CJK 漢字、注音、日文假名、韓文字母、全形符號等),不是查字典,所以任何常見中文/日文/韓文字元都能正確判斷。

**注意這個技巧的代價**:兩個相鄰中文字之間會多出一格看起來像「空隙」的間距(如螢幕截圖中「茶 玻」中間有一格空白)。這不是排版失誤,而是刻意的——因為每個中文字實際渲染寬度就是 2 格,這個空隙正好對應到它多佔用的那一格視覺空間,拿掉的話文字就會重疊回去。

---

## 3. 資料結構(`ElevationSpec`)

生成器完全由一份「規格資料」驅動,不是針對這一張圖硬寫死的:

```typescript
interface ElevationSpec {
  locationLabels?: string[];      // 左上角房間標籤,由上到下,如 ["廚","客"]
  modelLine: string;              // 頂部型號規格文字
  widthFormula?: string;          // 頂部寬度計算公式
  panelCount: number;             // 門扇數量
  panelWidth?: number;            // 每扇門的格子寬度(預設 10,需要容納最寬的標註文字)
  bodyHeight?: number;            // 門body的格子高度(預設 14)
  cornerLabel?: string;           // 標註列最右側的門編號,如 "J02"
  dimensionGroups?: {label, fromPanel, toPanel}[];  // 寬度標註(如 "581"),可跨多扇門
  heightChainLeft?: { values: (string|number)[] };  // 左側高度計算鏈,由上到下逐行
  reveals?: { panel, label, rowOffset? }[];          // 看樘標註(如 "看100"),指定在哪一扇門
  handle?: { panel, label, positionLabel, rowOffset? }; // 把手標註(五金名稱 + 位置說明)
  bottomGroups?: {fromPanel, toPanel}[];             // 底部防晃輪等橫向五金,依門扇分組
  bottomLabel?: string;           // 底部五金名稱標籤
}
```

**面板數量、寬度標註分組、看樘位置、把手位置全部是資料**,換一張圖只要換規格物件,完全不用碰生成邏輯——這正是延續門模組 `DOOR_REGISTRY` 那套「configuration as code」精神。

---

## 4. 版面演算法(座標怎麼算出來的)

```
leftMargin = max(房間標籤視覺寬度, 高度數字字元數) + 2
panelBoundaryCol(i) = leftMargin + i × (panelWidth + 1)   // 第 i 條直向分隔線的欄位
bodyLeft  = panelBoundaryCol(0)
bodyRight = panelBoundaryCol(panelCount)

列(row)由上到下:
  第0列:型號規格文字(置中於 body 寬度)
  第1列:寬度公式(置中)
  第2列:標註/頂部框線(同時畫「─」線、每個分隔位置放「┬」、寫入寬度分組標籤與 J02)
  第3列起(body):
    第一列:每扇門置中放五金圖示「▬▬」
    左側逐列印出高度鏈數字
    reveal 列:在指定門扇置中放「◄─看100─►」
    handle 列:在指定門扇寫入把手名稱 + 位置說明
  最後一列(body 底):畫「─」線、每個分隔位置放「┴」,並在指定分組位置改畫「▬」(防晃輪)
  再下一列:底部五金標籤
```

垂直分隔線「│」用 `vLine()` 一次性畫滿整個 body 高度,**文字標註是之後蓋在分隔線之間的欄位上**,只要標註文字的視覺寬度不超過 `panelWidth`,就不會碰到分隔線。

---

## 5. 溢出檢查(`checkElevationOverflow`)——這是實測抓到的真實案例

第一次用你的實際資料(把手標註「大側暗把手」)搭配 `panelWidth = 10` 測試時,發現把手標籤視覺寬度是 11 格(「▌」1 格 + 5 個中文字 × 2 格),比面板寬度 10 還寬,**會悄悄蓋掉右邊那條分隔線**,而且完全不會報錯——因為 `TextGrid` 設計上就是「你寫在哪裡就畫在哪裡」,不會自動檢查邊界。

所以我加了一個獨立的檢查函式:

```typescript
checkElevationOverflow(spec: ElevationSpec): ElevationOverflowWarning[]
```

在真的產生圖之前(或之後)呼叫它,會列出所有「看樘」與「把手」標註中,視覺寬度超過 `panelWidth` 的項目,附上「需要多寬」與「實際有多寬」。解法是把 `panelWidth` 調大到能放下最長的標註文字(本例把手標籤 11 格 + 位置說明「中心至下1000」12 格,實測用 `panelWidth = 16` 完全沒有溢出警告)。

---

## 6. 對照你的實際案例(已截圖驗證)

用下面這份規格,對應你圖片裡的「J01(吊)(黑)+5T茶玻+分隔把」四扇門吊趟門立面圖:

```typescript
{
  locationLabels: ["廚", "客"],
  modelLine: "J01(吊)(黑)+5T茶玻+分隔把",
  widthFormula: "1114+18+7+24",
  panelCount: 4,
  panelWidth: 16,
  bodyHeight: 16,
  cornerLabel: "J02",
  dimensionGroups: [
    { label: "581", fromPanel: 0, toPanel: 1 },
    { label: "581", fromPanel: 2, toPanel: 3 },
  ],
  heightChainLeft: { values: [2439, -45, -10, 2384] },
  reveals: [
    { panel: 0, label: "看100" },
    { panel: 3, label: "看100" },
  ],
  handle: { panel: 0, label: "大側暗把手", positionLabel: "中心至下1000" },
  bottomGroups: [
    { fromPanel: 0, toPanel: 1 },
    { fromPanel: 2, toPanel: 3 },
  ],
  bottomLabel: "防晃輪",
}
```

`checkElevationOverflow()` 對這份規格回傳空陣列(無溢出),產生的文字實際貼進正在執行的 ASCIIFlow 並截圖,所有直線、標籤、數字**完全對齊、零重疊**——已附截圖給你核對。

---

## 7. 目前如何使用(尚未接入 UI)

目前這是一個**純函式模組**,還沒有工具列按鈕或表單,使用方式是:

1. 依你的加工圖填一份 `ElevationSpec` 物件。
2. 呼叫 `checkElevationOverflow(spec)`,確認沒有溢出警告(有的話調大對應 `panelWidth`)。
3. 呼叫 `generateElevationDrawing(spec)`,得到多行文字。
4. 複製這段文字,在 ASCIIFlow 畫布上點選要放置的位置,貼上(Ctrl+V / Cmd+V)。

換句話說:**生成邏輯已經完成且驗證過,缺的是「怎麼把資料餵進去」這一段**——見下一節。

---

## 8. 尚待你決定的下一步

這次沒有動 `client/BUILD`(自動 glob 掃到新檔案)、沒有動工具列、沒有動任何既有功能——純粹新增一個獨立模組。要不要把它接成使用者真的能操作的功能,取決於資料怎麼進來:

- **表單輸入**:工具列加一個「立面圖」面板,像門模組一樣讓你手動填型號、面板數、每片寬度等欄位,即時預覽並一鍵蓋章到畫布。
- **Excel 驅動**:比照門模組已有的 `.xlsx` 匯入,定義一個「立面圖規格表」的 Excel 格式(一列代表一張圖或一個面板),批次產生多張圖。
- **維持現狀**:你(或其他工程師)直接寫 `ElevationSpec` 物件呼叫這兩個函式,產生文字後手動貼上——不需要再開發任何 UI。

三者都可以做,只是規模差很多(表單 UI 或 Excel 匯入都是比這次更大的功能),想先確認你要哪個方向,或先用「維持現狀」這個最小可行版本用一陣子看好不好用,再決定要不要投入 UI。
