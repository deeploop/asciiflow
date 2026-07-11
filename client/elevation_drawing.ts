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

export interface ElevationSpec {
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
  bottomLabel?: string;
}

const DEFAULT_PANEL_WIDTH = 10;
const DEFAULT_BODY_HEIGHT = 14;
const DEFAULT_REVEAL_ROW_OFFSET = 3;
const DEFAULT_HANDLE_ROW_OFFSET = 7;

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

  const ROW_MODEL = 0;
  const ROW_FORMULA = 1;
  const ROW_DIM = 2; // also the top frame line
  const bodyTop = ROW_DIM + 1;
  const bodyBottom = bodyTop + bodyHeight - 1; // also the bottom frame line
  const ROW_BOTTOM_LABEL = bodyBottom + 1;

  locationLabels.forEach((label, i) => grid.write(i, 0, label));
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

  return grid.toString();
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
