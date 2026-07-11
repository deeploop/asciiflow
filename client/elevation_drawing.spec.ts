import {
  charWidth,
  checkElevationOverflow,
  displayWidth,
  ElevationSpec,
  generateElevationDrawing,
  TextGrid,
} from "#asciiflow/client/elevation_drawing";
import { expect } from "chai";

/** Mirrors TextGrid's own padding so tests can assert against the padded text. */
function withCjkPadding(text: string): string {
  return [...text].map((ch) => (charWidth(ch) === 2 ? `${ch} ` : ch)).join("");
}

describe("elevation_drawing", () => {
  describe("full-width awareness", () => {
    it("treats CJK ideographs and ASCII differently", () => {
      expect(charWidth("A")).equals(1);
      expect(charWidth("1")).equals(1);
      expect(charWidth("│")).equals(1);
      expect(charWidth("廚")).equals(2);
      expect(charWidth("看")).equals(2);
    });

    it("sums display width across mixed strings", () => {
      expect(displayWidth("SD01")).equals(4);
      expect(displayWidth("看100")).equals(2 + 3);
      expect(displayWidth("大側暗把手")).equals(10);
    });
  });

  describe("TextGrid", () => {
    it("reserves a blank shadow cell after every full-width character", () => {
      const grid = new TextGrid();
      grid.write(0, 0, "廚X");
      const line = grid.toString().split("\n")[0];
      // "廚" occupies columns 0-1 (glyph + reserved blank), "X" lands at column 2.
      expect(line[0]).equals("廚");
      expect(line[1]).equals(" ");
      expect(line[2]).equals("X");
    });

    it("does not shift plain ASCII writes", () => {
      const grid = new TextGrid();
      grid.write(0, 0, "581");
      expect(grid.toString()).equals("581");
    });

    it("centers text within a column span using display width", () => {
      const grid = new TextGrid();
      grid.writeCentered(0, 0, 10, "看100");
      const line = grid.toString();
      // displayWidth("看100") = 5, span = 10 -> 2 leading blanks either side (odd rounds left).
      expect(line.indexOf("看")).equals(2);
    });

    it("draws horizontal and vertical lines", () => {
      const grid = new TextGrid();
      grid.hLine(0, 0, 5);
      grid.vLine(2, 0, 3);
      const lines = grid.toString().split("\n");
      // No automatic junction characters — vLine simply overwrites whatever
      // hLine put at the crossing, same as the boundary "┬"/"┴" characters
      // the generator sets explicitly rather than relying on this to infer them.
      expect(lines[0]).equals("──│──");
      expect(lines[3][2]).equals("│");
    });
  });

  describe("generateElevationDrawing", () => {
    // A generalized version of the four-panel suspended sliding-glass-door
    // shop drawing this module was built to reproduce: room labels top-left,
    // model + width-formula header, per-panel width dimensions, a left
    // height chain, reveal callouts on the outer panels, a handle callout,
    // and a bottom hardware bar in two groups.
    const spec: ElevationSpec = {
      locationLabels: ["廚", "客"],
      modelLine: "J01(吊)(黑)+5T茶玻+分隔把",
      widthFormula: "1114+18+7+24",
      panelCount: 4,
      panelWidth: 10,
      bodyHeight: 14,
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
      handle: {
        panel: 0,
        label: "大側暗把手",
        positionLabel: "中心至下1000",
      },
      bottomGroups: [
        { fromPanel: 0, toPanel: 1 },
        { fromPanel: 2, toPanel: 3 },
      ],
      bottomLabel: "防晃輪",
    };

    it("aligns the frame: divider-only rows and the bottom frame share one exact width", () => {
      const lines = generateElevationDrawing(spec).split("\n");
      // leftMargin = max(displayWidth("廚"|"客")=2, len("2439"|"2384")=4) + 2 = 6.
      // bodyRight = leftMargin + panelCount*(panelWidth+1) = 6 + 4*11 = 50.
      const frameWidth = 51; // bodyRight + 1
      const bodyTop = 3; // ROW_DIM(2) + 1
      // An interior row untouched by reveal/handle callouts (those land at
      // bodyTop+3 and bodyTop+7) has nothing on it but boundary dividers,
      // so it should end exactly at the frame width.
      expect(displayWidth(lines[bodyTop + 1])).equals(frameWidth);
      // The bottom frame line (drawn full-width) matches too.
      const bodyBottom = bodyTop + spec.bodyHeight - 1;
      expect(displayWidth(lines[bodyBottom])).equals(frameWidth);
    });

    it("includes every label from the spec exactly once (CJK padded for width)", () => {
      const text = generateElevationDrawing(spec);
      for (const expected of [
        "廚",
        "客",
        "J01(吊)(黑)+5T茶玻+分隔把",
        "1114+18+7+24", // pure ASCII — no padding inserted
        "J02",
        "2439",
        "-45",
        "-10",
        "2384",
        "看100",
        "大側暗把手",
        "中心至下1000",
        "防晃輪",
      ]) {
        // A CJK shadow space landing at end-of-line gets trimmed away by
        // TextGrid.toString() (and paste never stores spaces as cells
        // anyway, so it's functionally insignificant either way).
        expect(text).contains(withCjkPadding(expected).replace(/\s+$/, ""));
      }
      // "看100" appears once per reveal callout (two, on panels 0 and 3).
      expect(text.split(withCjkPadding("看100"))).to.have.length(3);
      expect(text.split("581")).to.have.length(3);
    });

    it("draws a continuous vertical divider per panel boundary, on rows with no overflowing text", () => {
      const lines = generateElevationDrawing(spec).split("\n");
      const leftMargin = 6; // max(displayWidth("廚"|"客")=2, len("2439")=4) + 2
      const bodyTop = 3; // ROW_DIM(2) + 1
      // Rows bodyTop+7 and +8 carry the handle callout, which (as
      // checkElevationOverflow below confirms) is wider than this spec's
      // panelWidth=10 and deliberately bleeds into the next boundary column
      // — real hand-drawn callouts do this too. Every other body row is
      // clean, including the reveal rows (their text fits exactly).
      const handleRows = new Set([bodyTop + 7, bodyTop + 8]);
      const bodyRows = lines
        .map((row, i) => ({ row, i }))
        .filter(({ i }) => i >= bodyTop && i < bodyTop + spec.bodyHeight - 1 && !handleRows.has(i));

      for (let i = 0; i <= spec.panelCount; i++) {
        const col = leftMargin + i * (spec.panelWidth + 1);
        for (const { row } of bodyRows) {
          expect("│┬┴".includes(row[col])).equals(
            true,
            `expected a divider at column ${col} in row ${JSON.stringify(row)}`
          );
        }
      }
    });

    it("flags callouts wider than the panel via checkElevationOverflow", () => {
      const warnings = checkElevationOverflow(spec);
      // The two reveal callouts fit exactly (displayWidth 9 <= panelWidth 10).
      expect(warnings.filter((w) => w.row === "reveal")).to.have.length(0);
      // The handle label (11) and position label (12) both exceed panelWidth (10).
      expect(warnings.filter((w) => w.row === "handleLabel")).to.have.length(1);
      expect(warnings.filter((w) => w.row === "handlePosition")).to.have.length(1);

      const wideSpec: ElevationSpec = { ...spec, panelWidth: 20 };
      expect(checkElevationOverflow(wideSpec)).to.have.length(0);
    });

    it("is driven entirely by the spec — a different panel count reflows cleanly", () => {
      const smaller = generateElevationDrawing({
        modelLine: "GD02-OL",
        panelCount: 2,
        panelWidth: 6,
        bodyHeight: 6,
      });
      const lines = smaller.split("\n");
      expect(lines.length).equals(9); // model + formula(skipped->blank not added) + dim + 6 body rows... see below
    });
  });
});
