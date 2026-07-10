import { Box } from "#asciiflow/client/common";
import { ILayerView } from "#asciiflow/client/layer";
import { layerToText } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";

/**
 * Door module: quick-stamp door symbols with standard codes, and a plain-data
 * door schedule that round-trips through Excel-compatible CSV.
 *
 * The canvas itself is the source of truth: doors are identified by their
 * label (e.g. "SD01-IL") wherever it appears, so there is no separate object
 * model to keep in sync.
 */

export type DoorTypeCode = "SD" | "BS" | "LM" | "SL" | "FD" | "GD";
export type DoorDirectionCode = "IL" | "IR" | "OL" | "OR";

export interface IDoorType {
  code: DoorTypeCode;
  nameZh: string;
  nameEn: string;
}

export const DOOR_TYPES: IDoorType[] = [
  { code: "SD", nameZh: "懸吊門", nameEn: "Suspension Door" },
  { code: "BS", nameZh: "緩衝懸吊門", nameEn: "Buffer Suspension Door" },
  { code: "LM", nameZh: "拉門", nameEn: "Sliding Door" },
  { code: "SL", nameZh: "推拉門", nameEn: "Sliding Door" },
  { code: "FD", nameZh: "折門", nameEn: "Folding Door" },
  { code: "GD", nameZh: "幽靈門", nameEn: "Ghost Door" },
];

export interface IDoorDirection {
  code: DoorDirectionCode;
  nameZh: string;
  nameEn: string;
  /** In/out + left/right marker rendered inside the symbol (top = outside). */
  glyph: string;
}

export const DOOR_DIRECTIONS: IDoorDirection[] = [
  { code: "IL", nameZh: "內開左開", nameEn: "Inward Left", glyph: "▼◄" },
  { code: "IR", nameZh: "內開右開", nameEn: "Inward Right", glyph: "▼►" },
  { code: "OL", nameZh: "外開左開", nameEn: "Outward Left", glyph: "▲◄" },
  { code: "OR", nameZh: "外開右開", nameEn: "Outward Right", glyph: "▲►" },
];

export function doorType(code: DoorTypeCode): IDoorType {
  return DOOR_TYPES.find((type) => type.code === code);
}

export function doorDirection(code: DoorDirectionCode): IDoorDirection {
  return DOOR_DIRECTIONS.find((direction) => direction.code === code);
}

/** e.g. ("SD", 1, "IL") → "SD01-IL" */
export function doorLabel(
  type: DoorTypeCode,
  num: number,
  direction: DoorDirectionCode
): string {
  return `${type}${String(num).padStart(2, "0")}-${direction}`;
}

/** Type-specific decoration row rendered above the label box. */
function glyphRow(type: DoorTypeCode, width: number): string {
  switch (type) {
    case "SD": // top rail with hangers
      return "●" + "─".repeat(width - 2) + "●";
    case "BS": // rail with buffers at both ends
      return "●├" + "─".repeat(width - 4) + "┤●";
    case "LM": // single-leaf sliding track
      return "◄" + "═".repeat(width - 1);
    case "SL": // double sliding track
      return "◄" + "═".repeat(width - 2) + "►";
    case "FD": // folding leaves
      return "/\\".repeat(Math.ceil(width / 2)).slice(0, width);
    case "GD": // ghost (concealed) door
      return "░".repeat(width);
  }
}

/**
 * Offset of the label's first character relative to the template's top-left
 * corner. Used so import/export coordinates refer to the label position.
 */
export const DOOR_LABEL_OFFSET = new Vector(2, 2);

/**
 * Renders a stampable door symbol, e.g. for ("SD", "IL", 1):
 *
 *   ●────────────●
 *   ┌────────────┐
 *   │ SD01-IL ▼◄ │
 *   └────────────┘
 */
export function doorTemplate(
  type: DoorTypeCode,
  direction: DoorDirectionCode,
  num: number
): string {
  const interior = ` ${doorLabel(type, num, direction)} ${
    doorDirection(direction).glyph
  } `;
  const width = interior.length + 2;
  return [
    glyphRow(type, width),
    "┌" + "─".repeat(interior.length) + "┐",
    "│" + interior + "│",
    "└" + "─".repeat(interior.length) + "┘",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Scanning the canvas for door labels
// ---------------------------------------------------------------------------

export interface IDoorInstance {
  type: DoorTypeCode;
  num: number;
  direction: DoorDirectionCode;
  /** Cell of the label's first character. */
  position: Vector;
}

const DOOR_LABEL_REGEX = /(SD|BS|LM|SL|FD|GD)(\d+)-(IL|IR|OL|OR)/g;

/** Finds all door labels on a layer, with their absolute cell positions. */
export function scanDoors(layer: ILayerView): IDoorInstance[] {
  const keys = layer.keys();
  if (keys.length === 0) {
    return [];
  }
  const start = new Vector(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const end = new Vector(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);
  keys.forEach((position) => {
    start.x = Math.min(start.x, position.x);
    start.y = Math.min(start.y, position.y);
    end.x = Math.max(end.x, position.x);
    end.y = Math.max(end.y, position.y);
  });
  const text = layerToText(layer, new Box(start, end));
  const doors: IDoorInstance[] = [];
  text.split("\n").forEach((line, row) => {
    for (const match of line.matchAll(DOOR_LABEL_REGEX)) {
      doors.push({
        type: match[1] as DoorTypeCode,
        num: parseInt(match[2], 10),
        direction: match[3] as DoorDirectionCode,
        position: new Vector(start.x + match.index, start.y + row),
      });
    }
  });
  return doors;
}

/** Next free sequence number for a door type (per-type counter). */
export function nextDoorNumber(
  layer: ILayerView,
  type: DoorTypeCode
): number {
  return (
    scanDoors(layer)
      .filter((door) => door.type === type)
      .reduce((max, door) => Math.max(max, door.num), 0) + 1
  );
}

// ---------------------------------------------------------------------------
// Excel (CSV) export / import
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  "編號",
  "代號",
  "中文名稱",
  "英文名稱",
  "開向代號",
  "開向",
  "X",
  "Y",
];

/**
 * Door schedule as CSV. Prefixed with a UTF-8 BOM and using CRLF line endings
 * so double-clicking the file opens correctly in Excel (Chinese included).
 */
export function doorsToCsv(doors: IDoorInstance[]): string {
  const rows = doors.map((door) => {
    const type = doorType(door.type);
    const direction = doorDirection(door.direction);
    return [
      doorLabel(door.type, door.num, door.direction).split("-")[0],
      door.type,
      type.nameZh,
      type.nameEn,
      door.direction,
      direction.nameZh,
      String(door.position.x),
      String(door.position.y),
    ].join(",");
  });
  return "\uFEFF" + [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

export interface IDoorImportRow {
  type: DoorTypeCode;
  direction: DoorDirectionCode;
  /** Label cell position (matches exported X/Y). */
  position: Vector;
  /** Explicit sequence number, if the row provided one. */
  num?: number;
}

export interface IDoorImportResult {
  doors: IDoorImportRow[];
  skipped: number;
}

const TYPE_FIELD = /^(SD|BS|LM|SL|FD|GD)$/i;
const DIRECTION_FIELD = /^(IL|IR|OL|OR)$/i;
const LABEL_FIELD = /^(SD|BS|LM|SL|FD|GD)(\d+)(?:-(IL|IR|OL|OR))?$/i;
const NUMBER_FIELD = /^-?\d+$/;

/**
 * Parses a door schedule CSV. Column order doesn't matter and no header is
 * required: each row just needs a type (or label like "SD01"), a direction,
 * and two numbers (X then Y). This accepts both the exported format and a
 * minimal hand-written "代號,開向,X,Y" sheet saved from Excel.
 */
export function parseDoorsCsv(content: string): IDoorImportResult {
  const text = content.replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n?|\n/).filter((line) => line.trim() !== "");
  // Excel in some locales saves CSV with semicolons.
  const delimiter =
    lines.length > 0 &&
    lines[0].split(";").length > lines[0].split(",").length
      ? ";"
      : ",";

  const doors: IDoorImportRow[] = [];
  let skipped = 0;
  for (const line of lines) {
    const fields = line
      .split(delimiter)
      .map((field) => field.trim().replace(/^"(.*)"$/, "$1"));

    let type: DoorTypeCode = null;
    let direction: DoorDirectionCode = null;
    let num: number = undefined;
    const numbers: number[] = [];

    for (const field of fields) {
      if (type === null && TYPE_FIELD.test(field)) {
        type = field.toUpperCase() as DoorTypeCode;
      } else if (DIRECTION_FIELD.test(field)) {
        direction = direction ?? (field.toUpperCase() as DoorDirectionCode);
      } else if (LABEL_FIELD.test(field)) {
        const match = field.match(LABEL_FIELD);
        type = type ?? (match[1].toUpperCase() as DoorTypeCode);
        num = num ?? parseInt(match[2], 10);
        if (match[3]) {
          direction =
            direction ?? (match[3].toUpperCase() as DoorDirectionCode);
        }
      } else if (NUMBER_FIELD.test(field)) {
        numbers.push(parseInt(field, 10));
      }
    }

    if (type !== null && direction !== null && numbers.length >= 2) {
      doors.push({
        type,
        direction,
        num,
        position: new Vector(numbers[0], numbers[1]),
      });
    } else {
      // Header rows and malformed lines land here.
      skipped++;
    }
  }
  return { doors, skipped };
}
