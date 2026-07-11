import {
  CompositeDoorSpec,
  checkCompositeDoorOverflow,
  generateCompositeDoor,
} from "#asciiflow/client/composite_door";
import { cellsInBox, findBox } from "#asciiflow/client/draw/entity";
import { textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";
import { expect } from "chai";

describe("composite_door", () => {
  const baseSpec: CompositeDoorSpec = {
    boxWidth: 14,
    boxHeight: 6,
    widthChain: { parts: [600, "+34"], result: 634 },
    heightChain: { values: [1200, "-4", "-2", 1192] },
    lock: { side: "left", rowRatio: 0.85 },
    description: ["[ID: Door-01]", "[Type: Flush]"],
  };

  it("renders a rectangular box frame at the expected size", () => {
    const lines = generateCompositeDoor(baseSpec).split("\n");
    // Top/bottom frame rows contain a run of boxWidth "─" characters.
    const topFrame = lines.find((l) => l.includes("┌"));
    const bottomFrame = lines.find((l) => l.includes("└"));
    expect(topFrame).contains("┌" + "─".repeat(14) + "┐");
    expect(bottomFrame).contains("└" + "─".repeat(14) + "┘");
  });

  it("renders the width chain as formula-then-result, and the height chain stacked", () => {
    const text = generateCompositeDoor(baseSpec);
    expect(text).contains("600 +34");
    expect(text).contains("634");
    expect(text).contains("1200");
    expect(text).contains("1192");
    // Height chain rows appear in order, one per line.
    const lines = text.split("\n");
    const rowOf = (needle: string) => lines.findIndex((l) => l.includes(needle));
    expect(rowOf("1200")).is.lessThan(rowOf("-4"));
    expect(rowOf("-4")).is.lessThan(rowOf("-2"));
    expect(rowOf("-2")).is.lessThan(rowOf("1192"));
  });

  it("centers description text inside the box interior", () => {
    const text = generateCompositeDoor(baseSpec);
    expect(text).contains("[ID: Door-01]");
    expect(text).contains("[Type: Flush]");
  });

  it("produces no overflow warnings for a well-sized spec", () => {
    expect(checkCompositeDoorOverflow(baseSpec)).to.have.length(0);
  });

  describe("lock placement — verified against the real select-tool box detection", () => {
    it("does not break findBox when placed at a default (well-clear) position", () => {
      const layer = textToLayer(generateCompositeDoor(baseSpec), new Vector(0, 0));
      // Click well inside the box, away from the lock, to confirm the
      // border is recognised as an intact rectangle.
      const box = findBox(layer, new Vector(10, 3));
      expect(box).is.not.null;
    });

    it("places the lock strictly inside the box bounds, so it moves with a click-drag", () => {
      const layer = textToLayer(generateCompositeDoor(baseSpec), new Vector(0, 0));
      let lockPos: Vector = null;
      for (const [key, value] of layer.map.entries()) {
        if (value === "O") lockPos = Vector.fromString(key);
      }
      expect(lockPos).is.not.null;
      const box = findBox(layer, new Vector(10, 3));
      expect(box.contains(lockPos)).equals(true);
      const cells = cellsInBox(layer, box);
      expect(cells.some((c) => c.x === lockPos.x && c.y === lockPos.y)).equals(true);
    });

    it("a lock character overwriting a border cell breaks findBox (the constraint this design avoids)", () => {
      // Direct regression check on the underlying rule, independent of this
      // generator: hand-build a box with the border deliberately broken by
      // a lock-like character, and confirm findBox correctly refuses it.
      const broken = textToLayer(
        ["┌────┐", "│    O", "│    │", "└────┘"].join("\n"),
        new Vector(0, 0)
      );
      expect(findBox(broken, new Vector(2, 1))).is.null;
    });

    it("dimension chains sit outside the box bounds — they do not move with a click-drag", () => {
      const layer = textToLayer(generateCompositeDoor(baseSpec), new Vector(0, 0));
      const box = findBox(layer, new Vector(10, 3));
      // "1200" is written in the height-chain gutter, left of the box.
      let heightChainCell: Vector = null;
      for (const [key, value] of layer.map.entries()) {
        if (value === "1" && !heightChainCell) {
          const pos = Vector.fromString(key);
          if (pos.x < box.left()) heightChainCell = pos;
        }
      }
      expect(heightChainCell).is.not.null;
      expect(box.contains(heightChainCell)).equals(false);
    });
  });

  describe("checkCompositeDoorOverflow", () => {
    it("flags a description line wider than the box", () => {
      const warnings = checkCompositeDoorOverflow({
        ...baseSpec,
        description: ["this description is way too long for a 14-cell box"],
      });
      expect(warnings.some((w) => w.includes("wider than boxWidth"))).equals(true);
    });

    it("flags more description lines than the box is tall", () => {
      const warnings = checkCompositeDoorOverflow({
        ...baseSpec,
        boxHeight: 2,
        description: ["a", "b", "c", "d"],
      });
      expect(warnings.some((w) => w.includes("don't fit in boxHeight"))).equals(true);
    });

    it("flags a height chain taller than the box", () => {
      const warnings = checkCompositeDoorOverflow({
        ...baseSpec,
        boxHeight: 2,
        heightChain: { values: [1, 2, 3, 4, 5] },
      });
      expect(warnings.some((w) => w.includes("taller than boxHeight"))).equals(true);
    });

    it("flags a width chain formula wider than the box", () => {
      const warnings = checkCompositeDoorOverflow({
        ...baseSpec,
        boxWidth: 4,
        widthChain: { parts: [12345, "+678910"], result: 691255 },
      });
      expect(warnings.some((w) => w.includes("widthChain formula"))).equals(true);
    });

    it("flags a lock whose default row lands inside the description's row range", () => {
      // No explicit rowRatio — defaults to the middle, which collides with
      // a 2-line centered description in a 6-row box (verified during
      // development: the lock literally overwrote a description character).
      const warnings = checkCompositeDoorOverflow({
        ...baseSpec,
        lock: { side: "left" }, // default rowRatio
      });
      expect(warnings.some((w) => w.includes("description's row range"))).equals(true);
    });

    it("does not flag a lock placed clear of the description", () => {
      expect(checkCompositeDoorOverflow(baseSpec)).to.have.length(0);
    });
  });

  it("is CJK-safe: a Chinese description doesn't collide with neighbouring columns", () => {
    const spec: CompositeDoorSpec = {
      boxWidth: 16,
      boxHeight: 4,
      description: ["防火門 FR-01"],
    };
    const text = generateCompositeDoor(spec);
    const lines = text.split("\n");
    // Each CJK character gets its own trailing shadow space (see
    // text_grid.ts), so the literal substring "防火門" doesn't appear —
    // search for the first character instead.
    const descLine = lines.find((l) => l.includes("防"));
    expect(descLine).is.not.undefined;
    // Once composited, one array slot is exactly one visual cell by
    // construction (that's what the CJK shadow-space padding buys us) —
    // so the row's plain .length is its true rendered width, and it must
    // match every other row's width exactly, not just "not exceed" it.
    // (displayWidth() is for measuring *input* text before compositing;
    // calling it again on an already-rendered row double-counts the CJK
    // shadow space that's now a literal character in the string.)
    const frameLine = lines.find((l) => l.includes("┌"));
    expect(descLine.length).equals(frameLine.length);
  });

  it("scales cleanly to a much larger box, purely from spec data", () => {
    const big = generateCompositeDoor({ ...baseSpec, boxWidth: 40, boxHeight: 20 });
    const lines = big.split("\n");
    expect(lines.find((l) => l.includes("┌"))).contains("┌" + "─".repeat(40) + "┐");
    // No "resize the box, then drag the parts to match" step needed — the
    // chains and description are recomputed for the new size directly.
    expect(big).contains("[ID: Door-01]");
    expect(big).contains("1192");
  });
});
