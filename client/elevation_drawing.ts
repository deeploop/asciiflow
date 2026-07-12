/**
 * Auto-generator for multi-panel elevation ("shop drawing") diagrams — the
 * front-view style used for fabrication drawings: room labels top-left,
 * model spec + width formula on top, a height dimension chain on the left,
 * N vertical door/glass panels with dividers, hardware icons, reveal and
 * handle callouts, and a bottom hardware bar.
 *
 * Composed with TextGrid (text_grid.ts) — the shared CJK-safe compositor —
 * so labels stay visually aligned once pasted into the app.
 */

import { displayWidth, TextGrid } from "#asciiflow/client/text_grid";

export { charWidth, displayWidth, TextGrid } from "#asciiflow/client/text_grid";

// ---------------------------------------------------------------------------
// Elevation drawing spec
// ---------------------------------------------------------------------------

export interface ElevationDimensionGroup {
  label: string;
  fromPanel: number;
  toPanel: number;
}

export interface ElevationReveal {
  panel: number;
  label: string;
  rowOffset?: number;
}

export interface ElevationHandle {
  panel: number;
  label: string;
  positionLabel: string;
  rowOffset?: number;
}

export interface ElevationHeightChain {
  values: Array<string | number>;
}

export interface ElevationBottomGroup {
  fromPanel: number;
  toPanel: number;
}

/**
 * A block of freestanding text placed at an absolute (row, col) on the
 * shared grid — used for auxiliary blocks (accessory lists, wall-junction
 * details) whose position relative to the door body varies by drawing and
 * isn't implied by panel/dimension data the way everything else here is.
 */
export interface ElevationAccessories {
  row: number;
  col: number;
  /** First line of the block, e.g. "附". */
  title?: string;
  /** Lines listed below the title, e.g. ["緩軌1671*2", "台制緩*2"]. */
  lines: string[];
}

/**
 * Small hatched wall-junction detail (the corner cutaway symbol showing a
 * wall in cross-section, with a pair of hardware blocks and a dimension) —
 * a compact plan/section callout, not the full door elevation.
 */
export interface WallHatchDetail {
  row: number;
  col: number;
  /** Dimension label under the hatch wedge, e.g. 595. */
  dimension: string | number;
  /** Width, in cells, of the wedge at its widest (top) row. Default 12. */
  width?: number;
  /** Height, in rows, of the hatch wedge. Default 4. */
  height?: number;
}

export interface ElevationSpec {
  /**
   * A single info row above everything else — project code, address, lock
   * code, parking/elevator note, contact, install date, etc. Rendered as one
   * row with fields spaced apart; omit for the plain elevation (no shift in
   * the rows below — every other row is numbered relative to this one, so
   * adding it doesn't require updating any other spec field).
   */
  headerInfo?: string[];
  /** Top-left stacked room/location labels, e.g. ["廚", "客"]. */
  locationLabels?: string[];
  /** Top spec line, e.g. "J01(吊)(黑)+5T茶玻+分隔把". */
  modelLine: string;
  /** Width breakdown formula, e.g. "1114+18+7+24". */
  widthFormula?: string;
  panelCount: number;
  /** Interior width of each panel, in grid cells. */
  panelWidth?: number;
  /** Number of rows in the door body (between the top frame and bottom frame). */
  bodyHeight?: number;
  /** Label after the last divider on the dimension row, e.g. "J02". */
  cornerLabel?: string;
  dimensionGroups?: ElevationDimensionGroup[];
  heightChainLeft?: ElevationHeightChain;
  reveals?: ElevationReveal[];
  handle?: ElevationHandle;
  bottomGroups?: ElevationBottomGroup[];
  /** Bottom-left label below the frame, e.g. "防晃輪". */
  bottomLabel?: string;
  /** Bottom-right label below the frame, e.g. "不破". */
  bottomLabelRight?: string;
  /** "附" accessory list, e.g. 緩軌1671*2 / 台制緩*2. */
  accessories?: ElevationAccessories;
  /** Wall-junction hatch + dimension corner detail. */
  wallDetail?: WallHatchDetail;
}

const DEFAULT_PANEL_WIDTH = 10;
const DEFAULT_BODY_HEIGHT = 14;
const DEFAULT_REVEAL_ROW_OFFSET = 3;
const DEFAULT_HANDLE_ROW_OFFSET = 7;
const DEFAULT_WALL_DETAIL_WIDTH = 12;
const DEFAULT_WALL_DETAIL_HEIGHT = 4;

/**
 * Generates an elevation shop-drawing as pasteable ASCII text. Coordinates
 * are all derived from `spec` — panel count, dimension groupings, reveal and
 * handle callouts, and the bottom hardware groups are data, not hardcoded,
 * so the same function produces any similarly-shaped drawing.
 */
export function generateElevationDrawing(spec: ElevationSpec): string {
  const panelWidth = spec.panelWidth ?? DEFAULT_PANEL_WIDTH;
  const bodyHeight = spec.bodyHeight ?? DEFAULT_BODY_HEIGHT;
  const locationLabels = spec.locationLabels ?? [];
  const dimensionGroups = spec.dimensionGroups ?? [];
  const reveals = spec.reveals ?? [];
  const bottomGroups = spec.bottomGroups ?? [];
  const heightValues = spec.heightChainLeft?.values ?? [];

  const leftMargin =
    Math.max(
      1,
      ...locationLabels.map(displayWidth),
      ...heightValues.map((v) => String(v).length)
    ) + 2;

  const grid = new TextGrid();
  const panelBoundaryCol = (i: number) => leftMargin + i * (panelWidth + 1);
  const bodyLeft = panelBoundaryCol(0);
  const bodyRight = panelBoundaryCol(spec.panelCount);

  // headerInfo, if present, is one extra row above everything else — every
  // other row is numbered relative to it, so adding it doesn't require
  // updating any other spec field (and omitting it reproduces the original
  // row numbering exactly, unchanged).
  const headerRows = spec.headerInfo ? 1 : 0;
  const ROW_HEADER = 0;
  const ROW_MODEL = headerRows + 0;
  const ROW_FORMULA = headerRows + 1;
  const ROW_DIM = headerRows + 2; // also the top frame line
  const bodyTop = ROW_DIM + 1;
  const bodyBottom = bodyTop + bodyHeight - 1; // also the bottom frame line
  const ROW_BOTTOM_LABEL = bodyBottom + 1;

  if (spec.headerInfo) {
    grid.write(ROW_HEADER, 0, spec.headerInfo.join("    "));
  }
  locationLabels.forEach((label, i) => grid.write(headerRows + i, 0, label));
  grid.writeCentered(ROW_MODEL, bodyLeft, bodyRight, spec.modelLine);
  if (spec.widthFormula) {
    grid.writeCentered(ROW_FORMULA, bodyLeft, bodyRight, spec.widthFormula);
  }

  grid.hLine(ROW_DIM, bodyLeft, bodyRight + 1);
  for (let i = 0; i <= spec.panelCount; i++) {
    grid.setChar(ROW_DIM, panelBoundaryCol(i), "┬");
  }
  for (const group of dimensionGroups) {
    const start = panelBoundaryCol(group.fromPanel);
    const end = panelBoundaryCol(group.toPanel + 1);
    grid.writeCentered(ROW_DIM, start + 1, end, group.label);
  }
  if (spec.cornerLabel) {
    grid.write(ROW_DIM, bodyRight + 1, spec.cornerLabel);
  }

  for (let i = 0; i <= spec.panelCount; i++) {
    grid.vLine(panelBoundaryCol(i), bodyTop, bodyBottom - 1);
  }

  for (let p = 0; p < spec.panelCount; p++) {
    grid.writeCentered(bodyTop, panelBoundaryCol(p) + 1, panelBoundaryCol(p + 1), "▬▬");
  }

  heightValues.forEach((value, i) => {
    if (bodyTop + i <= bodyBottom) {
      grid.write(bodyTop + i, 0, String(value));
    }
  });

  for (const reveal of reveals) {
    const interiorStart = panelBoundaryCol(reveal.panel) + 1;
    const interiorEnd = panelBoundaryCol(reveal.panel + 1);
    const row = bodyTop + (reveal.rowOffset ?? DEFAULT_REVEAL_ROW_OFFSET);
    grid.writeCentered(row, interiorStart, interiorEnd, `◄─${reveal.label}─►`);
  }

  if (spec.handle) {
    const interiorStart = panelBoundaryCol(spec.handle.panel) + 1;
    const row = bodyTop + (spec.handle.rowOffset ?? DEFAULT_HANDLE_ROW_OFFSET);
    grid.write(row, interiorStart, `▌${spec.handle.label}`);
    grid.write(row + 1, interiorStart, spec.handle.positionLabel);
  }

  grid.hLine(bodyBottom, bodyLeft, bodyRight + 1);
  for (let i = 0; i <= spec.panelCount; i++) {
    grid.setChar(bodyBottom, panelBoundaryCol(i), "┴");
  }
  for (const group of bottomGroups) {
    const start = panelBoundaryCol(group.fromPanel) + 1;
    const end = panelBoundaryCol(group.toPanel + 1);
    grid.hLine(bodyBottom, start, end, "▬");
  }
  if (spec.bottomLabel) {
    grid.write(ROW_BOTTOM_LABEL, bodyLeft, spec.bottomLabel);
  }
  if (spec.bottomLabelRight) {
    grid.write(ROW_BOTTOM_LABEL, bodyRight - displayWidth(spec.bottomLabelRight) + 1, spec.bottomLabelRight);
  }

  if (spec.accessories) {
    const { row, col, title, lines } = spec.accessories;
    let r = row;
    if (title) {
      grid.write(r, col, title);
      r += 1;
    }
    for (const line of lines) {
      grid.write(r, col, line);
      r += 1;
    }
  }

  if (spec.wallDetail) {
    renderWallHatchDetail(grid, spec.wallDetail);
  }

  return grid.toString();
}

/**
 * Renders the small hatched wall-junction detail: a pair of offset hardware
 * blocks along the top edge, a hatch wedge (drawn with "╲"/"╱") narrowing
 * toward a point, and a dimension label underneath. This is a compact
 * schematic callout, not a to-scale plan drawing — its shape is fixed, only
 * its size and dimension label come from the spec.
 */
function renderWallHatchDetail(grid: TextGrid, detail: WallHatchDetail) {
  const { row: top, col: left, dimension } = detail;
  const width = detail.width ?? DEFAULT_WALL_DETAIL_WIDTH;
  const height = detail.height ?? DEFAULT_WALL_DETAIL_HEIGHT;
  const mid = Math.floor(width / 2);

  grid.writeCentered(top, left, left + mid, "▬▬");
  grid.writeCentered(top + 1, left + mid, left + width, "▬▬");

  for (let r = 0; r < height; r++) {
    const leftCol = left + r;
    const rightCol = left + width - 1 - r;
    if (leftCol > rightCol) {
      break;
    }
    grid.setChar(top + 2 + r, leftCol, "╲");
    if (rightCol !== leftCol) {
      grid.setChar(top + 2 + r, rightCol, "╱");
    }
  }

  grid.writeCentered(top + 2 + height, left, left + width, String(dimension));
}

// ---------------------------------------------------------------------------
// Overflow validation
// ---------------------------------------------------------------------------

export interface ElevationOverflowWarning {
  row: "reveal" | "handleLabel" | "handlePosition";
  panel: number;
  label: string;
  requiredWidth: number;
  availableWidth: number;
}

/**
 * Reports reveal/handle callouts wider than the panel they're placed in.
 * The generator doesn't wrap or clip overflowing text — it bleeds into the
 * neighbouring divider column, silently, the same way an oversized formula
 * segment would — so callers should check this before rendering (or after,
 * to decide whether to widen `panelWidth` or shorten the label).
 */
export function checkElevationOverflow(spec: ElevationSpec): ElevationOverflowWarning[] {
  const interiorWidth = spec.panelWidth ?? DEFAULT_PANEL_WIDTH;
  const warnings: ElevationOverflowWarning[] = [];

  for (const reveal of spec.reveals ?? []) {
    const required = displayWidth(`◄─${reveal.label}─►`);
    if (required > interiorWidth) {
      warnings.push({
        row: "reveal",
        panel: reveal.panel,
        label: reveal.label,
        requiredWidth: required,
        availableWidth: interiorWidth,
      });
    }
  }

  if (spec.handle) {
    const labelRequired = displayWidth(`▌${spec.handle.label}`);
    if (labelRequired > interiorWidth) {
      warnings.push({
        row: "handleLabel",
        panel: spec.handle.panel,
        label: spec.handle.label,
        requiredWidth: labelRequired,
        availableWidth: interiorWidth,
      });
    }
    const positionRequired = displayWidth(spec.handle.positionLabel);
    if (positionRequired > interiorWidth) {
      warnings.push({
        row: "handlePosition",
        panel: spec.handle.panel,
        label: spec.handle.positionLabel,
        requiredWidth: positionRequired,
        availableWidth: interiorWidth,
      });
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Template file loading (JSON) — same all-or-nothing contract as
// frame_tree.ts's parseFrameTreeFile: a shop drawing is one interdependent
// layout (panel count drives every column position), so a malformed field
// makes the whole spec unusable rather than silently rendering with a gap.
// ---------------------------------------------------------------------------

export interface ElevationSpecParseResult {
  spec: ElevationSpec | null;
  errors: string[];
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Parses a shop-drawing template file. JSON only. Validates the fields that
 * drive layout math (panelCount, modelLine) strictly; optional decorative
 * fields (headerInfo, accessories, wallDetail, ...) are checked for the
 * right shape but not exhaustively — this mirrors how loosely the rest of
 * the app treats display strings, while still catching the "pasted the
 * wrong JSON" and "typo'd a field name into the wrong nesting level" class
 * of mistakes that are otherwise silent until you look at the render.
 */
export function parseElevationSpecFile(text: string): ElevationSpecParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { spec: null, errors: [`JSON parse error: ${(e as Error).message}`] };
  }
  if (typeof raw !== "object" || raw === null) {
    return { spec: null, errors: ["root must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.modelLine !== "string") {
    errors.push("modelLine must be a string");
  }
  if (typeof obj.panelCount !== "number" || obj.panelCount < 1) {
    errors.push("panelCount must be a positive number");
  }
  if (obj.headerInfo !== undefined && !isStringArray(obj.headerInfo)) {
    errors.push("headerInfo must be an array of strings");
  }
  if (obj.locationLabels !== undefined && !isStringArray(obj.locationLabels)) {
    errors.push("locationLabels must be an array of strings");
  }
  if (obj.dimensionGroups !== undefined) {
    if (!Array.isArray(obj.dimensionGroups)) {
      errors.push("dimensionGroups must be an array");
    } else {
      obj.dimensionGroups.forEach((g, i) => {
        const group = g as Record<string, unknown>;
        if (typeof group?.label !== "string" || typeof group?.fromPanel !== "number" || typeof group?.toPanel !== "number") {
          errors.push(`dimensionGroups[${i}] must be {label: string, fromPanel: number, toPanel: number}`);
        }
      });
    }
  }
  if (obj.heightChainLeft !== undefined) {
    const values = (obj.heightChainLeft as Record<string, unknown>)?.values;
    if (!Array.isArray(values) || !values.every((v) => typeof v === "string" || typeof v === "number")) {
      errors.push("heightChainLeft.values must be an array of strings/numbers");
    }
  }
  if (obj.accessories !== undefined) {
    const acc = obj.accessories as Record<string, unknown>;
    if (typeof acc?.row !== "number" || typeof acc?.col !== "number" || !isStringArray(acc?.lines)) {
      errors.push("accessories must be {row: number, col: number, title?: string, lines: string[]}");
    }
  }
  if (obj.wallDetail !== undefined) {
    const wd = obj.wallDetail as Record<string, unknown>;
    if (typeof wd?.row !== "number" || typeof wd?.col !== "number" || (typeof wd?.dimension !== "number" && typeof wd?.dimension !== "string")) {
      errors.push("wallDetail must be {row: number, col: number, dimension: number|string}");
    }
  }

  if (errors.length > 0) {
    return { spec: null, errors };
  }
  return { spec: obj as unknown as ElevationSpec, errors: [] };
}
