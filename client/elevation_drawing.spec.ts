import {
  charWidth,
  checkElevationOverflow,
  displayWidth,
  ElevationSpec,
  generateElevationDrawing,
  parseElevationSpecFile,
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

  // A full real-world job sheet: the four-panel drawing above, plus a header
  // info row (project/address/lock/parking/contact/install-date), a
  // right-side bottom label, an accessory list, and a wall-junction hatch
  // detail — reproducing the reference shop drawing this module was
  // originally built from, in full this time.
  describe("generateElevationDrawing — full job-sheet fields", () => {
    // Same base drawing as the "generateElevationDrawing" describe block
    // above (duplicated locally rather than shared across describe blocks,
    // so each block's fixture is self-contained).
    const baseSpec: ElevationSpec = {
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
      handle: { panel: 0, label: "大側暗把手", positionLabel: "中心至下1000" },
      bottomGroups: [
        { fromPanel: 0, toPanel: 1 },
        { fromPanel: 2, toPanel: 3 },
      ],
      bottomLabel: "防晃輪",
    };

    const fullSpec: ElevationSpec = {
      ...baseSpec,
      headerInfo: [
        "二三",
        "信義路四段30巷16號12F",
        "密:6789E",
        "車：B3F-50",
        "高S0905379331",
        "115.03.18安裝(胖)",
      ],
      bottomLabelRight: "不破",
      accessories: { row: 4, col: 56, title: "附", lines: ["緩軌1671*2", "台制緩*2"] },
      wallDetail: { row: 12, col: 56, dimension: 595 },
    };

    it("puts headerInfo on its own top row without shifting the base spec's row numbering", () => {
      // The plain (no-headerInfo) drawing's rows must reappear unchanged,
      // one row lower, once a header is added — headerRows is 0 whenever
      // headerInfo is absent, so nothing else needs to move.
      const plain = generateElevationDrawing(baseSpec);
      const withHeader = generateElevationDrawing({ ...baseSpec, headerInfo: ["X"] });
      const plainLines = plain.split("\n");
      const headerLines = withHeader.split("\n");
      expect(headerLines[0]).equals("X");
      expect(headerLines.slice(1)).deep.equals(plainLines);
    });

    it("renders every headerInfo field, space-joined, on row 0", () => {
      const text = generateElevationDrawing(fullSpec);
      const firstLine = text.split("\n")[0];
      for (const field of fullSpec.headerInfo) {
        expect(firstLine).contains(withCjkPadding(field));
      }
    });

    it("right-aligns bottomLabelRight to the frame's right edge, distinct from the left bottomLabel", () => {
      const text = generateElevationDrawing(fullSpec);
      const lines = text.split("\n");
      const bottomLabelRow = lines.find((l) => l.includes(withCjkPadding("不破")));
      expect(bottomLabelRow).is.not.undefined;
      expect(bottomLabelRow).contains(withCjkPadding("防晃輪"));
      // bodyRight = leftMargin(6) + panelCount(4) * (panelWidth(10) + 1) = 50
      // — same formula the "aligns the frame" test above uses directly,
      // rather than scraping it from a rendered row (the bottom frame row
      // also carries the wall-detail wedge's tail further right here, so
      // its trimmed .length no longer marks the frame's true right edge).
      const bodyRight = 6 + 4 * (10 + 1);
      const notBrokenStart = bottomLabelRow.indexOf(withCjkPadding("不破"));
      const notBrokenEnd = notBrokenStart + withCjkPadding("不破").length - 1;
      expect(notBrokenEnd).equals(bodyRight);
    });

    it("renders the accessories title and lines stacked at the given position", () => {
      const text = generateElevationDrawing(fullSpec);
      const lines = text.split("\n");
      // "附" is the last character on its row, so its trailing CJK shadow
      // space is trimmed by TextGrid.toString() — check unpadded, same
      // reasoning as composite_door.spec.ts's CJK end-of-line case.
      expect(lines[4]).contains("附");
      expect(lines[5]).contains(withCjkPadding("緩軌1671*2"));
      expect(lines[6]).contains(withCjkPadding("台制緩*2"));
    });

    it("renders the wall hatch detail's dimension label and a converging hatch wedge", () => {
      const text = generateElevationDrawing(fullSpec);
      expect(text).contains("595");
      expect(text).contains("╲");
      expect(text).contains("╱");
    });

    it("omits every optional block cleanly when absent (no stray rows/labels)", () => {
      const text = generateElevationDrawing(baseSpec); // no headerInfo/accessories/wallDetail/bottomLabelRight set
      expect(text).to.not.contain("附");
      expect(text).to.not.contain("╲");
      expect(text.split("\n")[0]).to.not.equal(""); // row 0 is still the model line, not a blank header row
    });
  });

  describe("parseElevationSpecFile", () => {
    const validJson = JSON.stringify({
      headerInfo: ["二三", "115.03.18安裝(胖)"],
      locationLabels: ["廚", "客"],
      modelLine: "J01(吊)(黑)+5T茶玻+分隔把",
      widthFormula: "1114+18+7+24",
      panelCount: 4,
      panelWidth: 10,
      bodyHeight: 14,
      cornerLabel: "J02",
      dimensionGroups: [{ label: "581", fromPanel: 0, toPanel: 1 }],
      heightChainLeft: { values: [2439, "-45", "-10", 2384] },
      bottomLabel: "防晃輪",
      bottomLabelRight: "不破",
      accessories: { row: 4, col: 56, title: "附", lines: ["緩軌1671*2", "台制緩*2"] },
      wallDetail: { row: 19, col: 56, dimension: 595 },
    });

    it("loads a valid template and renders it", () => {
      const { spec, errors } = parseElevationSpecFile(validJson);
      expect(errors).to.have.length(0);
      const text = generateElevationDrawing(spec);
      expect(text).contains("1114+18+7+24");
      expect(text).contains("595");
    });

    it("rejects malformed JSON with a clear error, not a crash", () => {
      const { spec, errors } = parseElevationSpecFile("{ not json");
      expect(spec).is.null;
      expect(errors[0]).contains("JSON parse error");
    });

    it("rejects a missing modelLine and a missing panelCount together", () => {
      const { spec, errors } = parseElevationSpecFile(JSON.stringify({}));
      expect(spec).is.null;
      expect(errors.some((e) => e.includes("modelLine"))).equals(true);
      expect(errors.some((e) => e.includes("panelCount"))).equals(true);
    });

    it("rejects a non-numeric panelCount", () => {
      const { spec, errors } = parseElevationSpecFile(
        JSON.stringify({ modelLine: "X", panelCount: "four" })
      );
      expect(spec).is.null;
      expect(errors.some((e) => e.includes("panelCount"))).equals(true);
    });

    it("rejects a malformed dimensionGroups entry", () => {
      const { spec, errors } = parseElevationSpecFile(
        JSON.stringify({
          modelLine: "X",
          panelCount: 2,
          dimensionGroups: [{ label: "581" }], // missing fromPanel/toPanel
        })
      );
      expect(spec).is.null;
      expect(errors.some((e) => e.includes("dimensionGroups"))).equals(true);
    });

    it("rejects a malformed accessories block instead of silently dropping it", () => {
      const { spec, errors } = parseElevationSpecFile(
        JSON.stringify({ modelLine: "X", panelCount: 2, accessories: { row: 1 } })
      );
      expect(spec).is.null;
      expect(errors.some((e) => e.includes("accessories"))).equals(true);
    });

    it("rejects a malformed wallDetail block instead of silently dropping it", () => {
      const { spec, errors } = parseElevationSpecFile(
        JSON.stringify({ modelLine: "X", panelCount: 2, wallDetail: { row: 1, col: 2 } }) // missing dimension
      );
      expect(spec).is.null;
      expect(errors.some((e) => e.includes("wallDetail"))).equals(true);
    });

    it("does not partially accept a spec — any error means no spec at all", () => {
      const { spec, errors } = parseElevationSpecFile(
        JSON.stringify({ modelLine: "X", panelCount: 2, headerInfo: [1, 2, 3] }) // not strings
      );
      expect(spec).is.null;
      expect(errors.length).to.be.greaterThan(0);
    });
  });
});
