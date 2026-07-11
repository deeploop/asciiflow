import {
  clearCustomDoorRegistry,
  DOOR_DIRECTIONS,
  DOOR_LABEL_OFFSET,
  DOOR_REGISTRY,
  DOOR_TYPES,
  doorLabel,
  doorTemplate,
  doorsToXlsxData,
  getActiveDoorRegistry,
  getActiveDoorTypeCodes,
  getCustomDoorRegistry,
  getDoorTypes,
  nextDoorNumber,
  parseDoorRegistryFile,
  parseDoorRegistryJson,
  parseDoorRegistryText,
  parseDoorsWorkbook,
  renderDoorLine,
  scanDoors,
  setCustomDoorRegistry,
  validateDoorConfig,
} from "#asciiflow/client/doors";
import { Layer } from "#asciiflow/client/layer";
import { textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";
import { expect } from "chai";
import * as XLSX from "xlsx";

describe("doors", () => {
  it("generates labels with zero-padded numbers", () => {
    expect(doorLabel("SD", 1, "IL")).equals("SD01-IL");
    expect(doorLabel("GD", 12, "OR")).equals("GD12-OR");
    expect(doorLabel("BS", 123, "OL")).equals("BS123-OL");
  });

  describe("renderDoorLine (formula parser)", () => {
    it("concatenates literals and tiled patterns", () => {
      expect(renderDoorLine("'●' + '─' * (W-2) + '●'", 6)).equals("●────●");
      expect(renderDoorLine("'●├' + '─' * (W-4) + '┤●'", 8)).equals(
        "●├────┤●"
      );
      expect(renderDoorLine("'◄' + '═' * (W-1)", 5)).equals("◄════");
    });

    it("tiles multi-character patterns and truncates to length", () => {
      expect(renderDoorLine("'/\\' * W", 5)).equals("/\\/\\/");
      expect(renderDoorLine("'░' * W", 3)).equals("░░░");
    });

    it("evaluates arithmetic with precedence and parentheses", () => {
      expect(renderDoorLine("'x' * (W*2-1)", 3)).equals("xxxxx");
      expect(renderDoorLine("'x' * (W/2+1)", 8)).equals("xxxxx");
      expect(renderDoorLine("'x' * ((W-2)*2)", 4)).equals("xxxx");
    });

    it("clamps non-positive repeat counts to empty", () => {
      expect(renderDoorLine("'a' + 'x' * (W-9) + 'b'", 4)).equals("ab");
    });

    it("rejects unsafe or malformed formulas instead of evaluating them", () => {
      expect(() => renderDoorLine("'x' * alert(1)", 5)).throws();
      expect(() => renderDoorLine("'x' * (W-)", 5)).throws();
      expect(() => renderDoorLine("'x' * ((W-2)", 5)).throws();
      expect(() => renderDoorLine("no quotes here", 5)).throws();
      expect(() => renderDoorLine("'x' * W; 'y'", 5)).throws();
    });

    it("every registry formula renders at exactly width W", () => {
      for (const config of Object.values(DOOR_REGISTRY)) {
        for (const width of [10, 13, 20]) {
          expect(renderDoorLine(config.row1_formula, width).length).equals(
            width
          );
        }
      }
    });
  });

  it("generates rectangular templates for every type and direction", () => {
    for (const type of DOOR_TYPES) {
      for (const direction of DOOR_DIRECTIONS) {
        const lines = doorTemplate(type.code, direction.code, 7).split("\n");
        expect(lines).to.have.length(4);
        // All rows equal width.
        for (const line of lines) {
          expect(line.length).equals(lines[0].length);
        }
        // Label appears at the documented offset.
        const label = doorLabel(type.code, 7, direction.code);
        expect(lines[DOOR_LABEL_OFFSET.y].indexOf(label)).equals(
          DOOR_LABEL_OFFSET.x
        );
      }
    }
  });

  it("scans stamped doors with absolute positions", () => {
    const layer = new Layer();
    layer.setFrom(textToLayer(doorTemplate("SD", "IL", 1), new Vector(10, 5)));
    layer.setFrom(textToLayer(doorTemplate("FD", "OR", 2), new Vector(40, 8)));
    const doors = scanDoors(layer);
    expect(doors).to.have.length(2);
    const sd = doors.find((door) => door.type === "SD");
    expect(sd.num).equals(1);
    expect(sd.direction).equals("IL");
    expect(sd.position.x).equals(10 + DOOR_LABEL_OFFSET.x);
    expect(sd.position.y).equals(5 + DOOR_LABEL_OFFSET.y);
    const fd = doors.find((door) => door.type === "FD");
    expect(fd.num).equals(2);
    expect(fd.direction).equals("OR");
  });

  it("numbers doors per type", () => {
    const layer = new Layer();
    expect(nextDoorNumber(layer, "SD")).equals(1);
    layer.setFrom(textToLayer(doorTemplate("SD", "IL", 1), new Vector(0, 0)));
    layer.setFrom(textToLayer(doorTemplate("SD", "IR", 5), new Vector(0, 10)));
    expect(nextDoorNumber(layer, "SD")).equals(6);
    expect(nextDoorNumber(layer, "GD")).equals(1);
  });

  describe("xlsx export / import", () => {
    it("round-trips the door schedule through a real .xlsx workbook", () => {
      const layer = new Layer();
      layer.setFrom(textToLayer(doorTemplate("SD", "IL", 1), new Vector(3, 4)));
      layer.setFrom(
        textToLayer(doorTemplate("LM", "OR", 2), new Vector(30, 4))
      );
      const data = doorsToXlsxData(scanDoors(layer));

      // The workbook carries the full schedule, Chinese names included.
      const workbook = XLSX.read(data, { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]]
      );
      expect(rows).to.have.length(2);
      expect(rows[0]["編號"]).equals("SD01");
      expect(rows[0]["中文名稱"]).equals("懸吊門");
      expect(rows[0]["開向"]).equals("內開左開");

      const { doors, skipped } = parseDoorsWorkbook(data);
      // Only the header row is skipped.
      expect(skipped).equals(1);
      expect(doors).to.have.length(2);
      expect(doors[0].type).equals("SD");
      expect(doors[0].direction).equals("IL");
      expect(doors[0].num).equals(1);
      expect(doors[0].position.x).equals(3 + DOOR_LABEL_OFFSET.x);
      expect(doors[0].position.y).equals(4 + DOOR_LABEL_OFFSET.y);
      expect(doors[1].type).equals("LM");
      expect(doors[1].direction).equals("OR");
    });

    it("imports a minimal headerless sheet with mixed column order", () => {
      const sheet = XLSX.utils.aoa_to_sheet([
        ["SD", "IL", 10, 5],
        ["OR", "FD", 30, 12],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
      const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

      const { doors, skipped } = parseDoorsWorkbook(data);
      expect(skipped).equals(0);
      expect(doors).to.have.length(2);
      expect(doors[0].type).equals("SD");
      expect(doors[0].num).equals(undefined);
      expect(doors[0].position.x).equals(10);
      expect(doors[1].type).equals("FD");
      expect(doors[1].direction).equals("OR");
    });

    it("derives type, number and direction from a full label cell", () => {
      const sheet = XLSX.utils.aoa_to_sheet([["GD07-IR", 3, 9]]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
      const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

      const { doors } = parseDoorsWorkbook(data);
      expect(doors).to.have.length(1);
      expect(doors[0].type).equals("GD");
      expect(doors[0].num).equals(7);
      expect(doors[0].direction).equals("IR");
    });

    it("skips rows with unknown codes or missing coordinates", () => {
      const sheet = XLSX.utils.aoa_to_sheet([
        ["代號", "開向", "X", "Y"],
        ["ZZ", "IL", 1, 2], // unknown type
        ["SD", "XX", 1, 2], // unknown direction
        ["SD", "IL", 1], // missing Y
        ["SD", "IL", 4, 5], // valid
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
      const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

      const { doors, skipped } = parseDoorsWorkbook(data);
      expect(doors).to.have.length(1);
      expect(doors[0].position.x).equals(4);
      expect(doors[0].position.y).equals(5);
      expect(skipped).equals(4);
    });

    it("imports csv bytes through the same parser (SheetJS sniffs format)", () => {
      const csv = new TextEncoder().encode("SD,IL,10,5\nFD,OR,30,12\n");
      const { doors, skipped } = parseDoorsWorkbook(csv);
      expect(skipped).equals(0);
      expect(doors).to.have.length(2);
      expect(doors[1].type).equals("FD");
    });
  });

  describe("custom (runtime-loaded) door registry", () => {
    // customRegistry is module-level state shared across the whole test
    // process, not per-test — every test here must leave it clean, or later
    // tests (and other spec files bundled alongside this one) would see
    // whatever the previous test loaded.
    afterEach(() => clearCustomDoorRegistry());

    const validConfig = { name: "雙開彈簧門", englishName: "Double Swing Door", row1_formula: "'▼' + '─' * (W-2) + '▼'" };

    describe("validateDoorConfig", () => {
      it("accepts a well-formed config", () => {
        expect(validateDoorConfig("DD", validConfig)).equals(null);
      });

      it("rejects malformed codes — including ones that would corrupt the scanning regex", () => {
        expect(validateDoorConfig("dd", validConfig)).is.a("string"); // lowercase
        expect(validateDoorConfig("DOOR1", validConfig)).is.a("string"); // too long / has a digit
        expect(validateDoorConfig("D-D", validConfig)).is.a("string"); // hyphen
        // Regex-metacharacter codes are exactly what VALID_DOOR_CODE exists to block.
        expect(validateDoorConfig(".*", validConfig)).is.a("string");
        expect(validateDoorConfig("(SD)", validConfig)).is.a("string");
      });

      it("rejects missing required fields", () => {
        expect(validateDoorConfig("DD", { ...validConfig, name: "" })).is.a("string");
        expect(validateDoorConfig("DD", { ...validConfig, englishName: "  " })).is.a("string");
        expect(validateDoorConfig("DD", { ...validConfig, row1_formula: "" })).is.a("string");
      });

      it("rejects a formula that fails to parse", () => {
        const error = validateDoorConfig("DD", { ...validConfig, row1_formula: "not a formula" });
        expect(error).contains("解析失敗");
      });

      it("rejects a formula whose output width doesn't match W", () => {
        // Missing one end-cap character relative to the width it claims.
        const error = validateDoorConfig("DD", {
          ...validConfig,
          row1_formula: "'▼' + '─' * (W-2)", // only accounts for W-2+1, one short
        });
        expect(error).contains("必須恰好是");
      });
    });

    describe("parseDoorRegistryJson", () => {
      it("parses a valid multi-entry object", () => {
        const { registry, errors } = parseDoorRegistryJson(
          JSON.stringify({ DD: validConfig, RD: { name: "捲門", englishName: "Roller Shutter", row1_formula: "'▤' * W" } })
        );
        expect(errors).to.have.length(0);
        expect(Object.keys(registry).sort()).to.deep.equal(["DD", "RD"]);
      });

      it("uppercases codes and reports malformed JSON distinctly from invalid entries", () => {
        const { registry, errors } = parseDoorRegistryJson(JSON.stringify({ dd: validConfig }));
        expect(registry).to.have.property("DD");
        expect(errors).to.have.length(0);

        const broken = parseDoorRegistryJson("{ not valid json");
        expect(broken.errors[0]).contains("JSON 格式錯誤");

        const notAnObject = parseDoorRegistryJson("[1,2,3]");
        expect(notAnObject.errors[0]).contains("最外層必須是一個物件");
      });

      it("loads valid entries and reports invalid ones independently (partial success)", () => {
        const { registry, errors } = parseDoorRegistryJson(
          JSON.stringify({
            DD: validConfig,
            BAD: { name: "", englishName: "x", row1_formula: "'x' * W" }, // missing name
          })
        );
        expect(registry).to.have.property("DD");
        expect(registry).to.not.have.property("BAD");
        expect(errors).to.have.length(1);
      });
    });

    describe("parseDoorRegistryText", () => {
      it("parses the block format, one door per block", () => {
        const text = [
          "=== DOOR: DD ===",
          "name: 雙開彈簧門",
          "englishName: Double Swing Door",
          "row1_formula: '▼' + '─' * (W-2) + '▼'",
          "",
          "=== DOOR: RD ===",
          "name: 捲門",
          "englishName: Roller Shutter Door",
          "row1_formula: '▤' * W",
        ].join("\n");
        const { registry, errors } = parseDoorRegistryText(text);
        expect(errors).to.have.length(0);
        expect(registry.DD.name).equals("雙開彈簧門");
        expect(registry.RD.englishName).equals("Roller Shutter Door");
      });

      it("flags unknown fields and unparsable lines without losing other blocks", () => {
        const text = [
          "=== DOOR: DD ===",
          "name: 雙開彈簧門",
          "englishName: Double Swing Door",
          "row1_formula: '▼' + '─' * (W-2) + '▼'",
          "not a field line at all",
          "colour: black", // unknown field
          "=== DOOR: RD ===",
          "name: 捲門",
          "englishName: Roller Shutter Door",
          "row1_formula: '▤' * W",
        ].join("\n");
        const { registry, errors } = parseDoorRegistryText(text);
        expect(registry).to.have.property("DD");
        expect(registry).to.have.property("RD");
        expect(errors.some((e) => e.includes("看不懂"))).equals(true);
        expect(errors.some((e) => e.includes("未知欄位"))).equals(true);
      });

      it("ignores stray text before the first block header", () => {
        const { registry } = parseDoorRegistryText(
          "some preamble\n=== DOOR: DD ===\nname: x\nenglishName: y\nrow1_formula: 'x' * W"
        );
        expect(registry).to.have.property("DD");
      });
    });

    describe("parseDoorRegistryFile (format auto-detection)", () => {
      it("routes JSON-looking text to the JSON parser", () => {
        const { registry } = parseDoorRegistryFile(JSON.stringify({ DD: validConfig }));
        expect(registry).to.have.property("DD");
      });

      it("routes everything else to the text-block parser", () => {
        const { registry } = parseDoorRegistryFile(
          "=== DOOR: DD ===\nname: x\nenglishName: y\nrow1_formula: 'x' * W"
        );
        expect(registry).to.have.property("DD");
      });
    });

    describe("merging into the active registry", () => {
      it("merges custom types on top of built-ins", () => {
        setCustomDoorRegistry({ DD: validConfig });
        expect(getActiveDoorTypeCodes()).to.include.members(["SD", "BS", "LM", "SL", "FD", "GD", "DD"]);
        expect(getDoorTypes().map((t) => t.code)).to.include("DD");
      });

      it("lets a custom entry override a built-in code (custom wins)", () => {
        setCustomDoorRegistry({ SD: { ...validConfig, name: "自訂懸吊門" } });
        expect(getActiveDoorRegistry().SD.name).equals("自訂懸吊門");
        // The built-in registry itself is untouched.
        expect(DOOR_REGISTRY.SD.name).equals("懸吊門");
      });

      it("clearCustomDoorRegistry restores built-ins-only", () => {
        setCustomDoorRegistry({ DD: validConfig });
        clearCustomDoorRegistry();
        expect(getActiveDoorTypeCodes()).to.deep.equal(Object.keys(DOOR_REGISTRY));
        expect(getCustomDoorRegistry()).to.deep.equal({});
      });

      it("a custom door type stamps and scans correctly end-to-end", () => {
        setCustomDoorRegistry({ DD: validConfig });
        const template = doorTemplate("DD", "IL", 1);
        const layer = textToLayer(template, new Vector(0, 0));
        const doors = scanDoors(layer);
        expect(doors).to.have.length(1);
        expect(doors[0].type).equals("DD");
      });
    });
  });
});
