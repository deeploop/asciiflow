# ASCIIFlow 核心繪圖 JSON 格式 與 門模組規格 JSON——完整說明

> 這份報告回答一個常被搞混的問題:「ASCIIFlow 畫布本身存檔的 JSON」跟「複合門/框架樹/施工圖這些產生器吃的規格 JSON」,是不是同一件事?答案是:**完全不是同一件事,是兩個獨立的 JSON 世界**,只在「產生純文字、貼上畫布」這一個瞬間交會,交會過後規格資訊就消失了。這份文件把兩邊都講清楚,並說明它們如何串接。

---

## 目錄

1. [核心繪圖 JSON——畫布真正存檔的格式](#1-核心繪圖-json畫布真正存檔的格式)
2. [核心格式用在哪三個地方](#2-核心格式用在哪三個地方)
3. [門模組的五種規格 JSON](#3-門模組的五種規格-json)
4. [兩個世界如何串接,以及為什麼會「斷開」](#4-兩個世界如何串接以及為什麼會斷開)
5. [常見疑問](#5-常見疑問)

---

## 1. 核心繪圖 JSON——畫布真正存檔的格式

### 1.1 資料模型:稀疏字元格

ASCIIFlow 的畫布**不是一個二維陣列**,而是一個**稀疏映射表**(`client/layer.ts` 的 `Layer` 類別):

```typescript
Map<"x:y", 字元>
```

- Key 是座標字串,格式是 `"x:y"`(冒號分隔,例如 `"10:5"`)——由 `Vector.toString()` / `Vector.fromString()` 負責轉換(`client/vector.ts`)
- Value 是**單一字元**(一個 Unicode 字元,可能是 `┌`、`A`、中文字等)
- **空白格子完全不存在於這個 Map 裡**——沒有畫東西的地方,連一筆資料都沒有,不是存了一個空字串或 null

這代表:一張畫了 3 個字元的圖,底層資料就只有 3 筆記錄,不管這 3 個字元散落在多遠的座標,都不會浪費空間。

### 1.2 序列化格式(`Layer.serialize` / `Layer.deserialize`)

把上面這個稀疏 Map 轉成字串存檔時,ASCIIFlow **沒有**直接把 Map 逐格轉成 JSON(那樣會很肥,例如 `{"5:3":"┌","6:3":"─","7:3":"─",...}`),而是採用更精簡的做法——原始碼裡的註解直接寫著:

> "Most efficient format seems to be to just store the drawing as plain text with an offset."
> (最有效率的做法似乎就是把整張圖存成純文字,再加一個座標偏移。)

實際格式:

```json
{
  "version": 2,
  "x": 10,
  "y": 5,
  "text": "┌────┐\n│    │\n└────┘"
}
```

| 欄位 | 意義 |
|---|---|
| `version` | 格式版本號,目前是 `2`。沒有這個欄位的舊存檔會被視為「更早期的格式」,自動透過 `LegacyRenderLayer` 做相容性轉換再讀入 |
| `x`、`y` | 這張圖左上角在 ASCIIFlow「無限畫布」座標系裡的實際位置(所有已畫格子裡 x、y 的最小值) |
| `text` | **整張圖攤平成一段純文字**——跟你在畫布上全選複製貼到記事本裡,得到的內容一模一樣 |

### 1.3 反序列化怎麼還原

`Layer.deserialize(jsonString)` 做的事情,其實就是把 `text` 欄位丟進 `textToLayer(text, offset)`(`client/text_utils.ts`),逐字元掃描這段純文字,重新填回稀疏 Map:

```typescript
// text_utils.ts 的核心邏輯(簡化)
for (每一行 line, 行號 j) {
  for (每個字元 char, 欄號 i) {
    if (char 不是空白、不是控制字元) {
      layer.set(new Vector(i, j).add(offset), char);
    }
  }
}
```

換句話說,**空白字元(以及 ASCII 控制字元)在還原時會被直接跳過,不會佔用 Map 裡的任何一筆資料**——這跟畫布本身「空白格子不存在」的資料模型是一致的。

---

## 2. 核心格式用在哪三個地方

同一套 `Layer.serialize`/`deserialize`,被重複用在三種完全不同的場景:

### 2.1 瀏覽器 localStorage 存檔

你畫的每一張圖(`committed` 層)、以及整個 undo/redo 堆疊,都是用這個格式存在瀏覽器的 localStorage 裡(`client/store/canvas.ts`)。undo/redo 堆疊是「這個格式的陣列」,用 `ArrayStringifier` 包一層:

```typescript
new ArrayStringifier(Layer)  // 序列化出來是 JSON 陣列,每個元素都是上面那個 {version,x,y,text} 物件的字串
```

### 2.2 分享連結(`/share/:encoded`)

`DrawingStringifier`(`client/store/drawing_stringifier.ts`)把整張圖打包成分享連結的流程是:

```
{name: "我的圖", layer: Layer.serialize(layer結果)}
      │  JSON.stringify
      ▼
一段 JSON 字串
      │  UTF-8 編碼成 bytes
      ▼
一串 bytes
      │  用 pako(zlib)壓縮
      ▼
壓縮後的 bytes（ASCII 圖裡有大量重複的空白跟框線字元，壓縮率通常很高）
      │  Base64 編碼
      ▼
一串安全塞進網址的文字（就是你在 /share/xxxxx 網址裡看到的那串亂碼）
```

這就是為什麼分享連結看起來像亂碼,而不是可讀的 JSON——你看到的其實是「JSON → 壓縮 → Base64」三層轉換之後的結果,不是原始格式本身。

### 2.3 undo/redo 差異比對

`Layer.apply(otherLayer)` 逐格比對兩張圖的字元差異,算出「套用這個變更需要改哪些格子」以及「復原這個變更需要改回哪些格子」——這部分不直接是 JSON,但操作的是同一個稀疏 Map 結構,值得放在一起理解。

---

## 3. 門模組的五種規格 JSON

以下這幾種 JSON,**全部都不是畫布格式**——它們是「你描述你想要什麼,產生器讀了之後幫你算出純文字」的**輸入參數**,產生出來的純文字才會被貼到畫布上、變成第 1 節講的核心格式。

### 3.1 簡單門型登記檔——`DoorConfig`(`client/door_registry.ts`)

```json
{
  "SD": {
    "name": "懸吊門",
    "englishName": "Suspension Door",
    "row1_formula": "'●' + '─' * (W-2) + '●'"
  },
  "BS": {
    "name": "緩衝懸吊門",
    "englishName": "Buffer Suspension Door",
    "row1_formula": "'●├' + '─' * (W-4) + '┤●'"
  }
}
```

- 用途:定義 `door` 蓋章工具選單裡的門型代號(SD/BS/LM/SL/FD/GD…)
- `row1_formula` 是一套**專用的小型公式語言**(不是 JavaScript,不會被 `eval()`),只支援 `'字串' + '字串'*expr` 這種語法,`W` 代表符號寬度
- 載入方式:`[load door types]` 按鈕,支援 JSON 或純文字兩種格式(`=== DOOR: 代號 ===` 區塊格式)

### 3.2 複合門——`CompositeDoorSpec`(`client/composite_door.ts`)

```json
{
  "boxWidth": 14,
  "boxHeight": 6,
  "widthChain": { "parts": [1114, "+18", "+7"], "result": 1139 },
  "heightChain": { "values": [2439, "-45", "-10", 2384] },
  "lock": { "side": "left", "rowRatio": 0.85 },
  "description": ["[ID: Door-01]"]
}
```

- 用途:`door+` 蓋章工具背後的產生器輸入——框的寬高(格數,不是毫米)、鎖的位置(左/右 + 垂直比例)、寬度/高度尺寸鏈、框內標籤文字
- `widthChain.parts`:公式的各項(顯示成一行,例如 `"1114 +18 +7"`),`result` 是算好的總和
- `heightChain.values`:由上到下逐行顯示的數值(不含公式符號,單純疊在一起顯示)

### 3.3 複合門範本——`CompositeDoorTemplate`(`client/composite_door_registry.ts`)

```json
[
  {
    "name": "FR-fire-door",
    "boxWidth": 18,
    "boxHeight": 12,
    "lockSide": "left",
    "heightFormula": "2439\n-45\n-10",
    "widthFormula": "1114\n+18\n+7\n+24"
  }
]
```

- 用途:`[load templates]` 按鈕載入的範本檔案——一份 JSON 陣列,每筆是一個可以直接套用的門型預設值
- `heightFormula`/`widthFormula` 是**多行純文字公式**(第一行是基準值,之後每行是 `+N`/`-N` 的增減量),套用範本之後系統會自動算出總和,填進上面 3.2 的 `heightChain`/`widthChain`

### 3.4 巢狀框架樹——`FrameTreeNode`(`client/frame_tree.ts`)

```json
{
  "id": "double-door-assembly",
  "frame": { "width": 34, "height": 9, "label": ["Double Door Assembly"] },
  "children": [
    {
      "offset": { "x": 1, "y": 2 },
      "node": { "frame": { "width": 14, "height": 6, "lock": { "side": "right" }, "label": ["[ID: Door-01L]"] } }
    },
    {
      "offset": { "x": 19, "y": 2 },
      "node": { "frame": { "width": 14, "height": 6, "lock": { "side": "left" }, "label": ["[ID: Door-01R]"] } }
    }
  ]
}
```

- 用途:多層巢狀框架(例如雙開門總成:一個外框裡包兩個獨立門葉),`children` 可以**遞迴**,理論上支援任意深度
- **這棵「樹」只存在於這份 JSON 規格裡**——`generateFrameTree()` 把它攤平算成一段純文字之後,樹狀的父子關係就不存在了,畫布上只看得到字元
- 已驗證過的限制:子框架的邊框不能跟父框架的邊框「貼在同一格」,否則兩者會共用同一個字元,之後拖曳子框架會扯破父框架的邊框(詳見 `DOOR_FRAME_TREE_VERIFICATION.md`)

### 3.5 多面板施工圖——`ElevationSpec`(`client/elevation_drawing.ts`)

```json
{
  "headerInfo": ["二三", "信義路四段30巷16號12F", "密:6789E", "車：B3F-50"],
  "locationLabels": ["廚", "客"],
  "modelLine": "J01(吊)(黑)+5T茶玻+分隔把",
  "widthFormula": "1114+18+7+24",
  "panelCount": 4,
  "panelWidth": 10,
  "cornerLabel": "J02",
  "dimensionGroups": [{ "label": "581", "fromPanel": 0, "toPanel": 1 }],
  "heightChainLeft": { "values": [2439, "-45", "-10", 2384] },
  "reveals": [{ "panel": 0, "label": "看100" }],
  "handle": { "panel": 0, "label": "大側暗把手", "positionLabel": "中心至下1000" },
  "bottomLabel": "防晃輪",
  "bottomLabelRight": "不破",
  "accessories": { "row": 4, "col": 56, "title": "附", "lines": ["緩軌1671*2"] },
  "wallDetail": { "row": 19, "col": 56, "dimension": 595 }
}
```

- 用途:完整的門片施工圖(表頭案場資訊、多面板寬度尺寸、高度公式鏈、收邊標註、把手位置、五金清單、牆體交接詳圖)
- 欄位最多、最完整的一種規格,對應真實的施工圖紙格式(見 `DOOR_SHOP_DRAWING_ANALYSIS.md`)

---

## 4. 兩個世界如何串接,以及為什麼會「斷開」

```
規格 JSON（3.1 ~ 3.5 任何一種）
      │  你填好參數（手動填、載入範本檔、或請 AI 依照 prompt 產生）
      ▼
產生器函式
（generateCompositeDoor / generateFrameTree / generateElevationDrawing…）
      │  純函式：讀規格、算出每個元素該在哪一格、輸出一段文字
      ▼
一段純文字（跟 layerToText() 輸出的格式完全一樣）
      │  貼上（Ctrl+V）
      ▼
第 1 節講的核心繪圖 JSON 格式（Map<"x:y", 字元>）
      規格資訊到這裡完全消失，畫布只認得字元本身
```

**這個「斷開」是刻意的設計,不是缺陷**——ASCIIFlow 從頭到尾就是一個「畫布只認字元,不認物件」的工具,這也是為什麼:

- 縮放複合門的外框,鎖跟標籤**不會自動重新置中**(貼上去的當下規格就消失了,畫布不知道「這是一個複合門」)
- 移動一棵框架樹,只會搬動你點到的那一個框(貼上去之後,樹狀的父子關係也不存在了)

上一輪加的「拖曳邊框自動重繪複合門尺寸」功能,做法是**在瀏覽器記憶體裡另外偷偷記一份規格**(`composite_door_instances.ts`,追蹤「這個框的內部左上角錨點座標」對應「原始規格是什麼」)——這是一個**補丁**,建立在核心格式之外,不是核心格式本身有支援「記住物件」這件事;只要你做任何讓追蹤失效的操作(重新整理頁面、複製到別處),這個補丁就會安靜失效,畫布退回成單純的字元集合。

---

## 5. 常見疑問

**Q:如果我想「儲存」一份複合門的規格,之後還能重新編輯,該怎麼做?**
A:核心繪圖 JSON 做不到這件事——它只記字元,不記規格。你可以另外把 `CompositeDoorSpec` 這種規格 JSON 存成一個 `.json` 檔案(就像 `composite_door_templates.example.json`),下次要用的時候透過 `[load templates]` 重新載入,自己管理這份規格檔案,跟畫布本身的存檔是分開的兩件事。

**Q:分享連結裡的資料,包含規格 JSON 嗎?**
A:不包含。分享連結只打包核心繪圖 JSON(第 2.2 節),也就是「畫布上實際看到的字元」,不會保留你當初是用哪一種規格 JSON、填了什麼參數才產生出這些字元的。

**Q:兩種 JSON 可以互相轉換嗎?**
A:規格 JSON → 純文字 → 核心格式是單向的(產生器只會往這個方向走)。反過來「從畫布上已經畫好的字元,反推出原本的規格 JSON」目前沒有對應功能——這也是為什麼「拖曳縮放自動重繪」需要另外用記憶體追蹤,而不是直接從畫布內容反解析。
