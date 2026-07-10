import {
  DOOR_DIRECTIONS,
  DOOR_LABEL_OFFSET,
  DOOR_TYPES,
  doorLabel,
  doorTemplate,
  doorsToCsv,
  nextDoorNumber,
  parseDoorsCsv,
  scanDoors,
} from "#asciiflow/client/doors";
import { Layer } from "#asciiflow/client/layer";
import { textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";
import { expect } from "chai";

describe("doors", () => {
  it("generates labels with zero-padded numbers", () => {
    expect(doorLabel("SD", 1, "IL")).equals("SD01-IL");
    expect(doorLabel("GD", 12, "OR")).equals("GD12-OR");
    expect(doorLabel("BS", 123, "OL")).equals("BS123-OL");
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

  it("round-trips the door schedule through csv", () => {
    const layer = new Layer();
    layer.setFrom(textToLayer(doorTemplate("SD", "IL", 1), new Vector(3, 4)));
    layer.setFrom(textToLayer(doorTemplate("LM", "OR", 2), new Vector(30, 4)));
    const exported = doorsToCsv(scanDoors(layer));
    // Excel-friendly: BOM + CRLF + Chinese names.
    expect(exported.startsWith("\uFEFF")).equals(true);
    expect(exported).contains("\r\n");
    expect(exported).contains("懸吊門");
    expect(exported).contains("內開左開");

    const { doors, skipped } = parseDoorsCsv(exported);
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

  it("parses a minimal headerless sheet", () => {
    const { doors, skipped } = parseDoorsCsv("SD,IL,10,5\nFD,OR,30,12\n");
    expect(skipped).equals(0);
    expect(doors).to.have.length(2);
    expect(doors[0].num).equals(undefined);
    expect(doors[0].position.x).equals(10);
    expect(doors[1].type).equals("FD");
  });

  it("parses a minimal sheet with a header row and mixed order", () => {
    const csv = "開向,代號,Y,X\nIL,SD,5,10\n";
    // Column *order* doesn't matter for type/direction, but numbers are
    // always read as X then Y.
    const { doors } = parseDoorsCsv(csv);
    expect(doors).to.have.length(1);
    expect(doors[0].type).equals("SD");
    expect(doors[0].position.x).equals(5);
    expect(doors[0].position.y).equals(10);
  });

  it("parses semicolon-delimited csv (Excel locale variant)", () => {
    const { doors } = parseDoorsCsv("BS01;BS;緩衝懸吊門;OL;12;7\r\n");
    expect(doors).to.have.length(1);
    expect(doors[0].type).equals("BS");
    expect(doors[0].direction).equals("OL");
    expect(doors[0].num).equals(1);
    expect(doors[0].position.x).equals(12);
    expect(doors[0].position.y).equals(7);
  });

  it("derives type, number and direction from a full label field", () => {
    const { doors } = parseDoorsCsv("GD07-IR,3,9\n");
    expect(doors).to.have.length(1);
    expect(doors[0].type).equals("GD");
    expect(doors[0].num).equals(7);
    expect(doors[0].direction).equals("IR");
  });
});
