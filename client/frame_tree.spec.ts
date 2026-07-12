import {
  FrameTreeNode,
  checkFrameTreeOverflow,
  generateFrameTree,
  parseFrameTreeFile,
} from "#asciiflow/client/frame_tree";
import { cellsInBox, findBox } from "#asciiflow/client/draw/entity";
import { textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";
import { expect } from "chai";

describe("frame_tree", () => {
  // Children are inset 1 cell from the assembly frame's own border on every
  // side that would otherwise touch it (left leaf at x:1, not x:0; right
  // leaf's right border at column 34, one short of the parent's at 35).
  // Verified in a real browser: a child offset flush against its parent's
  // border (x:0 against a parent whose own left border is also column 0)
  // renders as literally the same grid cell, and click-dragging the child
  // then tears that cell out of the parent's border. See the "ancestor
  // border touch" describe block below and frame_tree.ts's
  // checkFrameTreeOverflow docstring.
  const doubleDoor: FrameTreeNode = {
    id: "double-door-assembly",
    frame: { width: 34, height: 9, label: ["Double Door Assembly"] },
    children: [
      {
        offset: { x: 1, y: 2 },
        node: {
          id: "left-leaf",
          frame: { width: 14, height: 6, lock: { side: "right" }, label: ["[ID: Door-01L]"] },
        },
      },
      {
        offset: { x: 19, y: 2 },
        node: {
          id: "right-leaf",
          frame: { width: 14, height: 6, lock: { side: "left" }, label: ["[ID: Door-01R]"] },
        },
      },
    ],
  };

  describe("generateFrameTree", () => {
    it("renders the parent frame and both nested child frames", () => {
      const text = generateFrameTree(doubleDoor);
      expect(text).contains("Double Door Assembly");
      expect(text).contains("[ID: Door-01L]");
      expect(text).contains("[ID: Door-01R]");
      // 3 boxes total: outer assembly + 2 leaves.
      expect((text.match(/┌/g) || []).length).equals(3);
    });

    it("positions children at the exact offset from their parent's origin", () => {
      const text = generateFrameTree(doubleDoor);
      const layer = textToLayer(text, new Vector(0, 0));
      // Left leaf's top-left corner should be at (1,2), right leaf's at (19,2).
      expect(layer.get(new Vector(1, 2))).equals("┌");
      expect(layer.get(new Vector(19, 2))).equals("┌");
    });

    it("supports a childless leaf frame (degenerates to a single box, like composite_door)", () => {
      const text = generateFrameTree({ frame: { width: 6, height: 2, label: ["hi"] } });
      expect(text.split("\n")).to.have.length(4);
      expect(text).contains("hi");
    });

    it("supports a pure group node with no frame of its own, just positioned children", () => {
      const text = generateFrameTree({
        children: [
          { offset: { x: 0, y: 0 }, node: { frame: { width: 4, height: 2 } } },
          { offset: { x: 10, y: 0 }, node: { frame: { width: 4, height: 2 } } },
        ],
      });
      expect((text.match(/┌/g) || []).length).equals(2);
      // No wrapping outer box was drawn.
      expect(text.split("\n")[0].trim().startsWith("┌")).equals(true);
    });

    it("recurses more than one level deep", () => {
      const tree: FrameTreeNode = {
        frame: { width: 20, height: 10 },
        children: [
          {
            offset: { x: 2, y: 2 },
            node: {
              frame: { width: 14, height: 6 },
              children: [{ offset: { x: 2, y: 2 }, node: { frame: { width: 8, height: 2, label: ["deep"] } } }],
            },
          },
        ],
      };
      const text = generateFrameTree(tree);
      expect((text.match(/┌/g) || []).length).equals(3);
      expect(text).contains("deep");
    });
  });

  describe("lock placement — same verified rule as composite_door.ts, per frame", () => {
    it("both leaves' locks sit inside their own frame and don't break box detection", () => {
      const layer = textToLayer(generateFrameTree(doubleDoor), new Vector(0, 0));
      // Click inside the left leaf, away from its lock/label.
      const leftBox = findBox(layer, new Vector(3, 5));
      expect(leftBox).is.not.null;
      // Click inside the right leaf too.
      const rightBox = findBox(layer, new Vector(20, 5));
      expect(rightBox).is.not.null;
      expect(leftBox.left()).to.not.equal(rightBox.left());
    });

    it("a lock overwriting a child frame's border still breaks findBox for that frame", () => {
      const text = generateFrameTree({
        frame: { width: 20, height: 8 },
        children: [{ offset: { x: 2, y: 2 }, node: { frame: { width: 6, height: 3 } } }],
      });
      // Hand-corrupt the child's border the way a naive "lock on the edge"
      // design would (regression check independent of this module's own
      // lock placement, which never does this).
      const lines = text.split("\n");
      const corrupted = lines
        .map((line, i) => (i === 3 ? line.slice(0, 9) + "O" + line.slice(10) : line))
        .join("\n");
      const layer = textToLayer(corrupted, new Vector(0, 0));
      expect(findBox(layer, new Vector(5, 4))).is.null;
    });
  });

  describe("checkFrameTreeOverflow", () => {
    it("does not flag a child nesting inside its parent's rectangle", () => {
      expect(checkFrameTreeOverflow(doubleDoor)).to.have.length(0);
    });

    it("flags a child frame whose border sits flush against its ancestor's border", () => {
      // Reproduces the exact geometry that broke in a real browser: a child
      // offset x:0 against a parent whose own left border is also column 0
      // — the two borders render as the same grid cell, so dragging the
      // child tears a hole in the parent's border.
      const bad: FrameTreeNode = {
        id: "root",
        frame: { width: 20, height: 8 },
        children: [{ offset: { x: 0, y: 2 }, node: { id: "child", frame: { width: 6, height: 3 } } }],
      };
      const warnings = checkFrameTreeOverflow(bad);
      expect(warnings.some((w) => w.includes("child") && w.includes("border touches"))).equals(true);
    });

    it("does not flag a child inset at least 1 cell from every ancestor border it's near", () => {
      const good: FrameTreeNode = {
        id: "root",
        frame: { width: 20, height: 8 },
        children: [{ offset: { x: 1, y: 2 }, node: { id: "child", frame: { width: 6, height: 3 } } }],
      };
      expect(checkFrameTreeOverflow(good)).to.have.length(0);
    });

    it("flags two unrelated frames whose rectangles genuinely overlap", () => {
      const bad: FrameTreeNode = {
        id: "root",
        children: [
          { offset: { x: 0, y: 0 }, node: { id: "a", frame: { width: 10, height: 4 } } },
          { offset: { x: 5, y: 1 }, node: { id: "b", frame: { width: 10, height: 4 } } },
        ],
      };
      const warnings = checkFrameTreeOverflow(bad);
      expect(warnings.some((w) => w.includes("overlap"))).equals(true);
    });

    it("flags a label wider than its own frame, in a nested child", () => {
      const bad: FrameTreeNode = {
        frame: { width: 20, height: 6 },
        children: [
          {
            offset: { x: 1, y: 1 },
            node: { id: "child", frame: { width: 4, height: 3, label: ["way too long for this"] } },
          },
        ],
      };
      const warnings = checkFrameTreeOverflow(bad);
      expect(warnings.some((w) => w.includes("child") && w.includes("wider than width"))).equals(true);
    });

    it("flags a lock/label collision within a single nested frame", () => {
      const bad: FrameTreeNode = {
        frame: { width: 20, height: 8 },
        children: [
          {
            offset: { x: 1, y: 1 },
            node: {
              id: "child",
              // Same shape as composite_door.spec.ts's proven collision case:
              // a 2-line label centered in a 6-row box, default (0.5)
              // rowRatio lands the lock on interior row 3, inside the
              // label's [2, 4) row range.
              frame: { width: 10, height: 6, label: ["hi", "there"], lock: { side: "left" } },
            },
          },
        ],
      };
      const warnings = checkFrameTreeOverflow(bad);
      expect(warnings.some((w) => w.includes("child") && w.includes("label's row range"))).equals(true);
    });
  });

  describe("parseFrameTreeFile", () => {
    it("round-trips the double-door example through JSON", () => {
      const { tree, errors } = parseFrameTreeFile(JSON.stringify(doubleDoor));
      expect(errors).to.have.length(0);
      const text = generateFrameTree(tree);
      expect(text).contains("[ID: Door-01L]");
      expect(text).contains("[ID: Door-01R]");
    });

    it("rejects malformed JSON with a clear error, not a crash", () => {
      const { tree, errors } = parseFrameTreeFile("{ not json");
      expect(tree).is.null;
      expect(errors[0]).contains("JSON parse error");
    });

    it("rejects a frame with a non-numeric width/height, reporting the exact path", () => {
      const { tree, errors } = parseFrameTreeFile(
        JSON.stringify({ frame: { width: "wide", height: 4 } })
      );
      expect(tree).is.null;
      expect(errors.some((e) => e.includes("frame.width"))).equals(true);
    });

    it("rejects a child missing offset.x/y", () => {
      const { tree, errors } = parseFrameTreeFile(
        JSON.stringify({
          frame: { width: 10, height: 4 },
          children: [{ node: { frame: { width: 2, height: 2 } } }],
        })
      );
      expect(tree).is.null;
      expect(errors.some((e) => e.includes("offset"))).equals(true);
    });

    it("rejects an unrecognized lock side deep in a nested child", () => {
      const { tree, errors } = parseFrameTreeFile(
        JSON.stringify({
          frame: { width: 20, height: 6 },
          children: [
            {
              offset: { x: 1, y: 1 },
              node: { frame: { width: 10, height: 4, lock: { side: "top" } } },
            },
          ],
        })
      );
      expect(tree).is.null;
      expect(errors.some((e) => e.includes("lock.side"))).equals(true);
    });

    it("does not partially accept a tree — any error means no tree at all", () => {
      // One malformed child among otherwise-valid siblings still fails the
      // whole parse, unlike the flat door registry's per-entry tolerance —
      // a tree is one interdependent structure.
      const { tree, errors } = parseFrameTreeFile(
        JSON.stringify({
          frame: { width: 30, height: 10 },
          children: [
            { offset: { x: 0, y: 0 }, node: { frame: { width: 5, height: 3 } } },
            { offset: { x: 10, y: 0 }, node: { frame: { width: -5, height: 3 } } },
          ],
        })
      );
      expect(tree).is.null;
      expect(errors.length).to.be.greaterThan(0);
    });
  });
});
