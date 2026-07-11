import { Box } from "#asciiflow/client/common";
import {
  DOOR_REGISTRY,
  DOOR_TYPE_CODES,
  DoorConfig,
  DoorTypeCode,
} from "#asciiflow/client/door_registry";
import { ILayerView } from "#asciiflow/client/layer";
import { layerToText } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";
import * as XLSX from "xlsx";

/**
 * Door module: quick-stamp door symbols with standard codes, and a plain-data
 * door schedule that round-trips through native Excel (.xlsx) files.
 *
 * The canvas itself is the source of truth: doors are identified by their
 * label (e.g. "SD01-IL") wherever it appears, so there is no separate object
 * model to keep in sync. Door types themselves live in door_registry.ts —
 * this file re-exports them so existing imports keep working.
 */

export { DOOR_REGISTRY, DOOR_TYPE_CODES };
export type { DoorConfig, DoorTypeCode };

export type DoorDirectionCode = "IL" | "IR" | "OL" | "OR";

// Legacy list shape, still used by the toolbar and keyboard shortcuts.
export interface IDoorType {
  code: DoorTypeCode;
  nameZh: string;
  nameEn: string;
}

export const DOOR_TYPES: IDoorType[] = DOOR_TYPE_CODES.map((code) => ({
  code,
  nameZh: DOOR_REGISTRY[code].name,
  nameEn: DOOR_REGISTRY[code].englishName,
}));

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

// ---------------------------------------------------------------------------
// Formula parser for registry rows
// ---------------------------------------------------------------------------

// One segment of a formula: a quoted pattern with an optional `* multiplier`.
// The multiplier runs up to the next joining `+` — a `+` that introduces the
// next quoted literal — so arithmetic like (W/2+1) stays inside the segment.
const FORMULA_SEGMENT = /'([^']*)'(?:\s*\*\s*((?:[^+']|\+(?!\s*'))+))?/g;

/**
 * Safely evaluates an integer arithmetic expression over `W` (the symbol
 * width): numbers, + - * /, and parentheses. No eval() — a tiny recursive
 * descent parser over a validated token stream.
 */
function evalWidthExpression(expression: string, width: number): number {
  const tokens = expression.match(/\d+|[Ww]|[+\-*/()]/g) ?? [];
  // Reject anything the tokenizer didn't consume (e.g. letters, `..`).
  if (tokens.join("") !== expression.replace(/\s+/g, "")) {
    throw new Error(`invalid width expression: ${expression}`);
  }
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];

  function parseFactor(): number {
    const token = next();
    if (token === "(") {
      const value = parseSum();
      if (next() !== ")") {
        throw new Error(`unbalanced parentheses: ${expression}`);
      }
      return value;
    }
    if (token === "-") {
      return -parseFactor();
    }
    if (token === "W" || token === "w") {
      return width;
    }
    if (token !== undefined && /^\d+$/.test(token)) {
      return parseInt(token, 10);
    }
    throw new Error(`invalid width expression: ${expression}`);
  }

  function parseProduct(): number {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      value = next() === "*" ? value * parseFactor() : value / parseFactor();
    }
    return value;
  }

  function parseSum(): number {
    let value = parseProduct();
    while (peek() === "+" || peek() === "-") {
      value = next() === "+" ? value + parseProduct() : value - parseProduct();
    }
    return value;
  }

  const result = parseSum();
  if (index !== tokens.length || !Number.isFinite(result)) {
    throw new Error(`invalid width expression: ${expression}`);
  }
  return result;
}

/** Tiles a pattern to exactly `length` characters (e.g. "/\" → "/\/\/"). */
function tile(pattern: string, length: number): string {
  if (length <= 0 || pattern.length === 0) {
    return "";
  }
  return pattern.repeat(Math.ceil(length / pattern.length)).slice(0, length);
}

/**
 * Renders one registry formula for a symbol of width `W`.
 *
 * Grammar: segments joined by `+`, where each segment is `'pattern'` (used
 * as-is) or `'pattern' * expr` (pattern tiled to `expr` characters, with
 * `expr` an arithmetic expression over `W`).
 *
 * e.g. renderDoorLine("'●' + '─' * (W-2) + '●'", 6) → "●────●"
 */
export function renderDoorLine(formula: string, W: number): string {
  let result = "";
  let matched = "";
  for (const match of formula.matchAll(FORMULA_SEGMENT)) {
    matched += match[0];
    const pattern = match[1];
    result +=
      match[2] === undefined
        ? pattern
        : tile(pattern, Math.floor(evalWidthExpression(match[2], W)));
  }
  // Everything outside the matched segments must be joining '+' only,
  // otherwise the formula contains syntax we silently ignored.
  const rest = formula.replace(FORMULA_SEGMENT, "").replace(/[\s+]/g, "");
  if (matched === "" || rest !== "") {
    throw new Error(`invalid door formula: ${formula}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

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
    renderDoorLine(DOOR_REGISTRY[type].row1_formula, width),
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

// Built from DOOR_TYPE_CODES rather than hardcoded, so a new door_registry.ts
// entry is picked up here without touching this file.
const DOOR_TYPE_ALTERNATION = DOOR_TYPE_CODES.join("|");
const DOOR_LABEL_REGEX = new RegExp(
  `(${DOOR_TYPE_ALTERNATION})(\\d+)-(IL|IR|OL|OR)`,
  "g"
);

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
// Excel (.xlsx) export / import via SheetJS
// ---------------------------------------------------------------------------

/** One row of the exported door schedule, keyed by the sheet headers. */
interface IDoorScheduleRow {
  編號: string;
  代號: string;
  中文名稱: string;
  英文名稱: string;
  開向代號: string;
  開向: string;
  X: number;
  Y: number;
}

function doorsToScheduleRows(doors: IDoorInstance[]): IDoorScheduleRow[] {
  return doors.map((door) => ({
    編號: `${door.type}${String(door.num).padStart(2, "0")}`,
    代號: door.type,
    中文名稱: DOOR_REGISTRY[door.type].name,
    英文名稱: DOOR_REGISTRY[door.type].englishName,
    開向代號: door.direction,
    開向: doorDirection(door.direction).nameZh,
    X: door.position.x,
    Y: door.position.y,
  }));
}

function doorsToWorkbook(doors: IDoorInstance[]): XLSX.WorkBook {
  const sheet = XLSX.utils.json_to_sheet(doorsToScheduleRows(doors));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Doors");
  return workbook;
}

/** Serializes the door schedule to .xlsx bytes (used by export and tests). */
export function doorsToXlsxData(doors: IDoorInstance[]): ArrayBuffer {
  return XLSX.write(doorsToWorkbook(doors), {
    type: "array",
    bookType: "xlsx",
  });
}

/**
 * Downloads the door schedule as a native Excel file (works fully client-side;
 * XLSX.writeFile creates the blob and triggers the browser download).
 */
export function exportDoorsToXlsx(
  doors: IDoorInstance[],
  filename = "doors-schedule.xlsx"
): void {
  XLSX.writeFile(doorsToWorkbook(doors), filename);
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

const TYPE_FIELD = new RegExp(`^(${DOOR_TYPE_ALTERNATION})$`, "i");
const DIRECTION_FIELD = /^(IL|IR|OL|OR)$/i;
const LABEL_FIELD = new RegExp(
  `^(${DOOR_TYPE_ALTERNATION})(\\d+)(?:-(IL|IR|OL|OR))?$`,
  "i"
);
const NUMBER_FIELD = /^-?\d+$/;

/**
 * Maps one sheet row (any column names/order) to a door. Each row just needs
 * a type (or label like "SD01"), a direction, and two numbers (X then Y as
 * they appear in the sheet). Returns null for rows that don't validate —
 * header-ish rows, unknown codes, missing coordinates.
 */
function mapScheduleRow(fields: unknown[]): IDoorImportRow | null {
  let type: DoorTypeCode = null;
  let direction: DoorDirectionCode = null;
  let num: number = undefined;
  const numbers: number[] = [];

  for (const raw of fields) {
    if (typeof raw === "number") {
      if (Number.isFinite(raw)) {
        numbers.push(Math.round(raw));
      }
      continue;
    }
    if (typeof raw !== "string") {
      continue;
    }
    const field = raw.trim();
    if (type === null && TYPE_FIELD.test(field)) {
      type = field.toUpperCase() as DoorTypeCode;
    } else if (DIRECTION_FIELD.test(field)) {
      direction = direction ?? (field.toUpperCase() as DoorDirectionCode);
    } else if (LABEL_FIELD.test(field)) {
      const match = field.match(LABEL_FIELD);
      type = type ?? (match[1].toUpperCase() as DoorTypeCode);
      num = num ?? parseInt(match[2], 10);
      if (match[3]) {
        direction = direction ?? (match[3].toUpperCase() as DoorDirectionCode);
      }
    } else if (NUMBER_FIELD.test(field)) {
      numbers.push(parseInt(field, 10));
    }
  }

  if (type === null || direction === null || numbers.length < 2) {
    return null;
  }
  return { type, direction, num, position: new Vector(numbers[0], numbers[1]) };
}

/**
 * Parses a door schedule workbook (first sheet). Exposed separately from the
 * File wrapper so it's testable without a DOM.
 */
export function parseDoorsWorkbook(data: ArrayBuffer | Uint8Array): IDoorImportResult {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // header: 1 keeps rows as positional arrays, so column names and order
  // don't matter and headerless sheets work too.
  const rows = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
    : [];
  const doors: IDoorImportRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const door = mapScheduleRow(row);
    if (door) {
      doors.push(door);
    } else {
      skipped++;
    }
  }
  return { doors, skipped };
}

/**
 * Reads a user-selected .xlsx/.xls/.csv file and parses it into door rows.
 * SheetJS sniffs the format from the bytes, so Excel files and CSV exports
 * both work through the same path.
 */
export function importDoorsFromXlsx(file: File): Promise<IDoorImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        resolve(parseDoorsWorkbook(reader.result as ArrayBuffer));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
