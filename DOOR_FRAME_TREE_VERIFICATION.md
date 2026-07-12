# 複雜樹狀多子框架自訂門範本——實作驗證回報

> 延續 `DOOR_FRAME_TREE_DESIGN.md` 的設計說明,這份文件回報**實際實作完成後**的驗證結果:單元測試、真實瀏覽器互動測試,以及過程中發現並修正的兩個真實錯誤。

---

## 1. 完成的檔案

| 檔案 | 內容 |
|---|---|
| `client/frame_tree.ts` | 遞迴框架樹產生器 `generateFrameTree()`、溢出/碰撞檢查 `checkFrameTreeOverflow()`、範本檔案解析器 `parseFrameTreeFile()` |
| `client/frame_tree.spec.ts` | 19 個單元測試,涵蓋產生、鎖位置、溢出檢查、範本解析四大區塊 |

設計文件裡描述的 API(`FrameTreeNode`、`FrameBox`、`FrameChild`、`FrameLock`)與實際程式碼一致,沒有落差。

---

## 2. 測試結果

### 2.1 單元測試:19/19 通過

```
frame_tree
  generateFrameTree
    ✔ renders the parent frame and both nested child frames
    ✔ positions children at the exact offset from their parent's origin
    ✔ supports a childless leaf frame (degenerates to a single box, like composite_door)
    ✔ supports a pure group node with no frame of its own, just positioned children
    ✔ recurses more than one level deep
  lock placement — same verified rule as composite_door.ts, per frame
    ✔ both leaves' locks sit inside their own frame and don't break box detection
    ✔ a lock overwriting a child frame's border still breaks findBox for that frame
  checkFrameTreeOverflow
    ✔ does not flag a child nesting inside its parent's rectangle
    ✔ flags a child frame whose border sits flush against its ancestor's border
    ✔ does not flag a child inset at least 1 cell from every ancestor border it's near
    ✔ flags two unrelated frames whose rectangles genuinely overlap
    ✔ flags a label wider than its own frame, in a nested child
    ✔ flags a lock/label collision within a single nested frame
  parseFrameTreeFile
    ✔ round-trips the double-door example through JSON
    ✔ rejects malformed JSON with a clear error, not a crash
    ✔ rejects a frame with a non-numeric width/height, reporting the exact path
    ✔ rejects a child missing offset.x/y
    ✔ rejects an unrecognized lock side deep in a nested child
    ✔ does not partially accept a tree — any error means no tree at all

19 passing
```

### 2.2 全專案回歸測試:139/139 通過

把 `frame_tree.spec.ts` 併入既有的 13 個 spec 檔案(`composite_door`、`doors`、`draw/box`、`draw/entity`、`draw/grid`、`draw/line`、`draw/select`、`elevation_drawing`、`layer`、`snap`、`store/drawing_stringifier`、`store/store`)一起執行,**139 個測試全數通過,沒有任何回歸**。

### 2.3 TypeScript 型別檢查:乾淨

`npx tsc --noEmit` 除了一個與本次改動完全無關的既有錯誤(`vscode/extension.ts` 找不到 `vscode` 模組型別,屬於 Electron 擴充功能檔案,不在這次改動範圍內)以外,沒有任何錯誤。

### 2.4 真實瀏覽器驗證

用 esbuild 打包出完整的 `client/app.tsx`,啟動本地伺服器,以 headless Chromium(Playwright)實際操作:

1. 用 `generateFrameTree()` 產生一份「雙開門組件」(外框 + 兩片門葉,每片門葉各自有鎖與 ID 標籤),模擬真實貼上操作(dispatch 原生 `paste` 事件)貼到畫布上。
2. 確認貼上後的畫布內容(`getCommittedText()`)跟產生器輸出完全一致。
3. 切換到選取工具(Alt+2),點擊左門葉內部(避開標籤與鎖的位置),確認 `getSelectionBox()` 回傳的選取框**精確等於左門葉自己的矩形**(`{left:1001, top:303, right:1016, bottom:310}`),不包含外框、也不包含右門葉。
4. 拖曳左門葉向下移動 10 格,確認:
   - **只有左門葉(含它的邊框、標籤、鎖)移動了**,外框與右門葉完全沒有變動。
   - 外框的邊框在左門葉搬走之後**保持完整**,沒有留下缺口。

這個結果驗證了設計文件裡宣稱、但當時還沒有寫程式碼的兩件事:「點擊只搬動被點到的那一個框」、「整棵樹要搬動還是得用虛線框全選」。

---

## 3. 開發過程中發現並修正的問題(誠實回報,不是憑空通過)

### 3.1 巢狀時,父框架自己的標籤會被子框架蓋掉(程式碼真的有 bug,已修正)

第一次跑單元測試時,`generateFrameTree` 系列有 3 個測試失敗。追下去發現一個**實際的邏輯錯誤**:父框架自己的 `label` 沿用了 `composite_door.ts` 的「垂直置中」邏輯,但父框架的高度是被底下的子框架撐大的——子框架幾乎填滿父框架的下半部,置中的標籤列剛好落在子框架畫的範圍裡,被子框架的內容直接覆蓋、消失不見。

**修正**:`labelInteriorStart()` 現在多接一個 `hasChildren` 參數——**有子框架的節點,自己的標籤改成貼齊頂端那一列**,不再置中;沒有子框架的葉節點(單一箱框)行為完全不變,跟 `composite_door.ts` 一致。`checkFrameTreeOverflow` 的溢出檢查也同步用一樣的邏輯,確保「渲染出來的畫面」跟「驗證邏輯認定的位置」永遠一致。

### 3.2 子框架邊框跟父框架邊框「貼齊」時,拖曳子框架會扯破父框架的邊框(瀏覽器測試才發現的真實問題,不是單元測試能測出來的)

單元測試全部通過、TypeScript 也乾淨之後,我用真實瀏覽器測試「拖曳左門葉」這個動作,結果**外框的左邊框整條不見了**——因為原本設計文件裡雙開門範例把左門葉的偏移設成 `x:0`,跟外框自己左邊框的欄位剛好是同一格。ASCIIFlow 的畫布**沒有分層概念,每一格只能存一個字元**——父框架的邊框跟子框架的邊框畫在同一格時,後畫的(子框架)會直接蓋掉先畫的(父框架),兩者在畫布上其實是「同一個字」。點擊搬移時,`findBox`/`cellsInBox` 依照子框架自己的矩形範圍認定那格屬於子框架,子框架被搬走,那格自然跟著移動——外框在那個位置就出現一個洞。

這不是隨機出現的邊角案例,而是「子框架緊貼父框架邊框」這種常見排版(例如雙開門的外框直接框住兩片門)必然會踩到的問題,而且**從範本規格本身或渲染出來的文字完全看不出來**,只有真的去拖曳才會發現——這正是為什麼這次驗證堅持要做真實瀏覽器互動測試,而不是只看單元測試綠燈。

**修正做法**:
1. **設計面**:把雙開門範例改成「內縮 1 格」的排版(外框寬度從 32 加大到 34,兩片門葉的偏移從 `x:0`/`x:16` 改成 `x:1`/`x:19`),外框跟門葉之間留一條可見的縫——這其實也更符合真實門框(門樘)的樣子,外框跟門葉之間本來就該有一點間隙,不是完全貼死。
2. **程式碼面**:在 `checkFrameTreeOverflow` 新增一項檢查——當子框架的邊框跟祖先框架自己的邊框**共用了同一格**,就回報警告(訊息裡明確指出是哪一格、拖曳會扯破哪個框架的邊框),提醒你把子框架至少內縮 1 格。這項檢查不會誤判「子框架落在父框架的內部矩形範圍內」(那是巢狀結構本來就該有的正常重疊,不受影響),只針對「邊框跟邊框剛好是同一格」這個特定情況。

修正後重新用瀏覽器驗證,外框邊框在門葉搬走之後保持完整,沒有缺口。

---

## 4. 目前的實作狀態與限制

- **已完成**:`generateFrameTree()`、`checkFrameTreeOverflow()`(含新的邊框貼齊檢查)、`parseFrameTreeFile()`,19 個單元測試 + 全專案 139 個回歸測試全數通過,並經過真實瀏覽器貼上、選取、拖曳的實機驗證。
- **尚未做的部分**:目前只有產生器/驗證器/檔案解析器,**還沒有工具列 UI**——沒有像 `door+`(複合門)那樣可以直接點擊蓋章的按鈕,也沒有「載入範本檔案」的介面。要用的話,目前得先呼叫 `generateFrameTree()` 產生文字,再手動複製貼上到畫布。如果你想要工具列上有蓋章工具或載入按鈕,請直接告訴我,我可以在這個模組的基礎上繼續做——規模跟當初從 `composite_door.ts` 做出 `door+` 蓋章工具差不多。
- **設計限制(非 bug,是這個工具的既有模型)**:ASCIIFlow 沒有真正的物件階層,「樹」只存在於範本規格裡;子框架越多層,越需要注意內縮,避免邊框貼齊祖先框架——`checkFrameTreeOverflow` 現在會主動抓出這個問題,但終究是「檢查後提醒」,不是「自動避免」。

---

## 5. 檔案清單(本次新增)

- `client/frame_tree.ts`
- `client/frame_tree.spec.ts`
- `DOOR_FRAME_TREE_VERIFICATION.md`(本文件)
