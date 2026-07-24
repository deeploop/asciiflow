// Must be first import: shims localStorage and window for Node.js.
import "#asciiflow/testing/test_setup";

import { clearCompositeDoorInstances } from "#asciiflow/client/composite_door_instances";
import { Layer } from "#asciiflow/client/layer";
import {
  DrawingId,
  store,
  ToolMode,
  useAppStore,
} from "#asciiflow/client/store/index";
import { layerToText, textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";
import { assert } from "chai";

const selectTool = store.selectTool;
const doorTool = store.compositeDoorTool;

function reset() {
  (selectTool as any).selectedCells = [];
  (selectTool as any).selectBox = undefined;
  (selectTool as any).dragStart = null;
  (selectTool as any).lineTip = null;
  (selectTool as any).moveTool = null;
  (selectTool as any).resizingInstance = null;
  (selectTool as any).selecting = false;
  (selectTool as any).activeBox = null;
  (selectTool as any).attachments = [];
  (doorTool as any).lastSpec = undefined;
  (doorTool as any).lastOrigin = undefined;
  clearCompositeDoorInstances();
  store.currentCanvas.committed = new Layer();
  localStorage.clear();
  useAppStore.setState(
    {
      route: DrawingId.local(null),
      selectedToolMode: ToolMode.SELECT,
      freeformCharacter: "x",
      altPressed: false,
      currentCursor: "default",
      modifierKeys: {},
      unicode: true,
      controlsOpen: true,
      fileControlsOpen: true,
      editControlsOpen: true,
      helpControlsOpen: true,
      exportConfig: {},
      localDrawingIds: [],
      darkMode: false,
      canvasVersion: 0,
      // boxWidth 14 (not 10) — "[ID: Door-01]" is 13 characters, and a box
      // too narrow for its own label overflows onto the border itself
      // (checkCompositeDoorOverflow in composite_door.ts flags exactly
      // this), which breaks the border's continuity and makes ASCIIFlow's
      // own border-drag resize unable to trace that edge at all — nothing
      // to do with the regeneration hook under test here.
      compositeDoor: {
        boxWidth: 14,
        boxHeight: 6,
        lockSide: "left",
        showDimensions: true,
        heightFormula: "2400",
        widthFormula: "900",
      },
    },
    true
  );
}

function text() {
  return layerToText(store.currentCanvas.committed);
}

/**
 * Absolute canvas position of the (first) cell holding `value` — scans the
 * real Layer, not the printed text (layerToText() normalizes columns to
 * the layer's own bounding box, so text-column indices are NOT the same as
 * real Vector coordinates once content starts left/above of the origin,
 * which the height-chain gutter here always does).
 */
function findCell(value: string): Vector {
  const committed = store.currentCanvas.committed;
  const hit = committed.keys().find((k) => committed.get(k) === value);
  assert.isDefined(hit, `expected to find a "${value}" cell on the canvas`);
  return hit;
}

/** Places a composite door at `position` using the current store.compositeDoor settings. */
function stamp(position: Vector) {
  doorTool.start(position);
  doorTool.end();
}

/** Drags a box border from `from` to `to` via the real select-tool interaction. */
function dragBorder(from: Vector, to: Vector) {
  selectTool.start(from, {});
  selectTool.move(to);
  selectTool.end();
}

describe("composite door resize (draw/select.ts <-> composite_door_instances.ts)", () => {
  beforeEach(reset);

  it("regenerates the box, label, and lock at the new size when its right border is dragged wider", () => {
    stamp(new Vector(20, 20));
    const corner = findCell("┐"); // box's top-right corner
    // Drag the right border (one row below the corner, on the "│" edge)
    // outward by 6 columns.
    const rightBorder = new Vector(corner.x, corner.y + 1);
    assert.equal(store.currentCanvas.committed.get(rightBorder), "│");
    dragBorder(rightBorder, rightBorder.add(new Vector(6, 0)));

    const after = text();
    // The box is now 6 columns wider — its top border row should contain a
    // run of (original width + 6) "─" characters.
    assert.include(after, "┌" + "─".repeat(14 + 6) + "┐");
    // The ID label is still present (regeneration preserved the original
    // description content, it didn't just get dropped).
    assert.include(after, "[ID: Door-01]");
    // The lock is still present.
    assert.include(after, "O");
    // The dimension chain values are unchanged (same real-world numbers —
    // resizing the box in grid cells doesn't change what they measure).
    assert.include(after, "2400");
    assert.include(after, "900");
  });

  it("re-centers the label within the new (wider) box interior, not left stranded at its old column", () => {
    stamp(new Vector(20, 20));
    const corner = findCell("┐");
    const rightBorder = new Vector(corner.x, corner.y + 1);

    // Widen substantially — enough that "just leaving it at the old column"
    // would visibly fail to be centered in the new width.
    dragBorder(rightBorder, rightBorder.add(new Vector(20, 0)));

    const afterLines = text().split("\n");
    const labelRow = afterLines.find((l) => l.includes("[ID: Door-01]"));
    const frameRow = afterLines.find((l) => l.includes("┌"));
    const labelStart = labelRow.indexOf("[ID: Door-01]");
    const boxLeft = frameRow.indexOf("┌");
    const boxRight = frameRow.indexOf("┐");
    const boxInteriorWidth = boxRight - boxLeft - 1;
    const labelWidth = "[ID: Door-01]".length;
    const expectedStart = boxLeft + 1 + Math.floor((boxInteriorWidth - labelWidth) / 2);
    assert.equal(labelStart, expectedStart);
  });

  it("does nothing extra to a plain hand-drawn box (not a tracked instance) beyond the normal resize", () => {
    store.currentCanvas.committed = textToLayer(["┌───┐", "│   │", "└───┘"].join("\n"));
    dragBorder(new Vector(4, 1), new Vector(8, 1)); // drag the right border out
    // Plain ASCIIFlow resize behavior — no crash, no phantom composite-door
    // content (no "[ID:" anywhere) introduced by the hook.
    assert.notInclude(text(), "[ID:");
    assert.include(text(), "┌───────┐");
  });

  it("keeps tracking the instance across a second resize (registry entry updates, doesn't go stale after one use)", () => {
    stamp(new Vector(20, 20));
    let corner = findCell("┐");
    dragBorder(new Vector(corner.x, corner.y + 1), new Vector(corner.x + 4, corner.y + 1));

    // Resize again, from the box's new (post-first-resize) right border.
    corner = findCell("┐");
    dragBorder(new Vector(corner.x, corner.y + 1), new Vector(corner.x + 3, corner.y + 1));

    const after = text();
    assert.include(after, "┌" + "─".repeat(14 + 4 + 3) + "┐");
    assert.include(after, "[ID: Door-01]");
  });

  it("leaves the box alone (no crash) if the drag would shrink it below a renderable size", () => {
    stamp(new Vector(20, 20));
    const corner = findCell("┐");
    const leftCorner = findCell("┌");
    // Drag the right border almost all the way to the left border.
    assert.doesNotThrow(() => {
      dragBorder(new Vector(corner.x, corner.y + 1), new Vector(leftCorner.x + 1, corner.y + 1));
    });
  });
});
