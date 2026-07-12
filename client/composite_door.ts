/**
 * Generator for a "composite door item" — a single door as one stampable
 * unit: box frame, a lock glyph near one edge, a height dimension chain to
 * the left, a width dimension formula/result above, and description text
 * centered inside the box. Built with TextGrid (text_grid.ts), the shared
 * CJK-safe compositor.
 *
 * IMPORTANT — the lock glyph is placed one cell *inside* the border, never
 * on top of it and never outside it. Two things had to be verified against
 * the real select-tool code (draw/entity.ts) before settling on this:
 *
 *  1. ASCIIFlow's "click inside a box to select and move the whole thing"
 *     (findBox -> verifyPerimeter) requires every cell of the box's four
 *     edges to be an unbroken box-drawing character. Overwriting a border
 *     cell with a lock character — a literal reading of "put a character
 *     on the frame edge" — makes findBox return null for that box, with no
 *     error: it silently becomes unselectable-as-a-unit by clicking inside.
 *  2. Placing the lock just *outside* the border avoids that, but then
 *     cellsInBox (which drives what actually moves on a click-drag) only
 *     includes cells strictly inside the box's rectangle — so an
 *     outside-the-border lock would get left behind on every move, same as
 *     the dimension chains.
 *
 * One cell inside the border satisfies both: the border stays an unbroken
 * rectangle (findBox still succeeds), and the lock cell is inside the
 * box's bounds (cellsInBox includes it, so it moves with a simple
 * click-drag). See DOOR_COMPOSITE_ITEM.md for the verification transcript.
 */

import { ILayerView } from "#asciiflow/client/layer";
import { layerToText } from "#asciiflow/client/text_utils";
import { displayWidth, TextGrid } from "#asciiflow/client/text_grid";

export interface CompositeDoorWidthChain {
  /** Rendered as one row, e.g. [600, "+34"] -> "600 +34". */
  parts: Array<string | number>;
  /** The computed total, rendered on the row below, e.g. 634. */
  result: string | number;
}

export interface CompositeDoorHeightChain {
  /** Stacked top-to-bottom, one value per row, e.g. [1200, "-4", "-2", 1192] — the
   * last entry is whatever you've computed as the result; this renders
   * values as given, it does not compute them for you. */
  values: Array<string | number>;
}

export interface CompositeDoorLock {
  side: "left" | "right";
  char?: string;
  /** 0 (top of the box) to 1 (bottom). Default 0.5 (middle). */
  rowRatio?: number;
}

export interface CompositeDoorSpec {
  /** Interior width of the box, in cells (excludes the two border columns). */
  boxWidth: number;
  /** Interior height of the box, in rows (excludes the two border rows). */
  boxHeight: number;
  widthChain?: CompositeDoorWidthChain;
  heightChain?: CompositeDoorHeightChain;
  lock?: CompositeDoorLock;
  /** Lines of text centered inside the box, e.g. ["[ID: Door-01]", "[Type: Flush]"]. */
  description?: string[];
}

const DEFAULT_LOCK_CHAR = "O";
const DEFAULT_LOCK_ROW_RATIO = 0.5;

// Row positions below are computed relative to the box interior (0 = first
// interior row), shared between the generator and the overflow checker so
// the two can never drift out of sync with each other.

function descriptionInteriorStart(spec: CompositeDoorSpec): number {
  const lines = spec.description?.length ?? 0;
  return Math.max(0, Math.floor((spec.boxHeight - lines) / 2));
}

function lockInteriorRow(spec: CompositeDoorSpec): number | null {
  if (!spec.lock) {
    return null;
  }
  const ratio = spec.lock.rowRatio ?? DEFAULT_LOCK_ROW_RATIO;
  return Math.min(
    spec.boxHeight - 1,
    Math.max(0, Math.round(ratio * (spec.boxHeight - 1)))
  );
}

/**
 * Renders a composite door item as pasteable ASCII text. Every element's
 * position is derived from `spec` — box size, chain lengths, and lock side
 * are all data, so the same function scales to any size without manual
 * "resize the box, then drag the parts to match" work.
 */
export function generateCompositeDoor(spec: CompositeDoorSpec): string {
  const heightValues = spec.heightChain?.values ?? [];
  const heightChainWidth =
    heightValues.length > 0
      ? Math.max(1, ...heightValues.map((v) => String(v).length))
      : 0;
  // No gutter reserved for the lock — it renders inside the box (see the
  // module docstring), so it needs no room outside the border.
  const boxLeft = heightChainWidth + (heightChainWidth > 0 ? 1 : 0);
  const boxRight = boxLeft + spec.boxWidth + 1;

  const ROW_WIDTH_FORMULA = 0;
  const ROW_WIDTH_RESULT = 1;
  const boxTop = spec.widthChain ? 2 : 0;
  const boxBottom = boxTop + spec.boxHeight + 1;

  const grid = new TextGrid();

  if (spec.widthChain) {
    grid.writeCentered(
      ROW_WIDTH_FORMULA,
      boxLeft,
      boxRight + 1,
      spec.widthChain.parts.map(String).join(" ")
    );
    grid.writeCentered(
      ROW_WIDTH_RESULT,
      boxLeft,
      boxRight + 1,
      String(spec.widthChain.result)
    );
  }

  // Box frame, built as plain rows (simpler and less error-prone than
  // hLine/vLine + corner overwrites for a single unadorned rectangle).
  grid.write(boxTop, boxLeft, "┌" + "─".repeat(spec.boxWidth) + "┐");
  for (let r = 1; r <= spec.boxHeight; r++) {
    grid.write(boxTop + r, boxLeft, "│" + " ".repeat(spec.boxWidth) + "│");
  }
  grid.write(boxBottom, boxLeft, "└" + "─".repeat(spec.boxWidth) + "┘");

  heightValues.forEach((value, i) => {
    const row = boxTop + 1 + i;
    if (row < boxBottom) {
      const text = String(value);
      grid.write(row, heightChainWidth - text.length, text);
    }
  });

  const description = spec.description ?? [];
  const descStartRow = boxTop + 1 + descriptionInteriorStart(spec);
  description.forEach((line, i) => {
    const row = descStartRow + i;
    if (row > boxTop && row < boxBottom) {
      grid.writeCentered(row, boxLeft + 1, boxRight, line);
    }
  });

  const lockRow = lockInteriorRow(spec);
  if (spec.lock && lockRow !== null) {
    // One cell inside the border — see the module docstring for why this
    // isn't on the border (breaks findBox) or outside it (doesn't move
    // with the box).
    const lockCol = spec.lock.side === "left" ? boxLeft + 1 : boxRight - 1;
    grid.setChar(boxTop + 1 + lockRow, lockCol, spec.lock.char ?? DEFAULT_LOCK_CHAR);
  }

  return grid.toString();
}

export interface CompositeDoorOverflowWarning {
  reason: string;
}

/**
 * Reports content that won't fit the box as configured: description lines
 * wider than the box, more description lines than box rows, a height chain
 * longer than the box is tall, or a width chain wider than the box. None of
 * these throw — generateCompositeDoor renders them anyway (bleeding into
 * neighbouring cells, e.g. onto the border or past it) — so check this
 * first if the output looks wrong rather than debugging the rendered text.
 */
export function checkCompositeDoorOverflow(spec: CompositeDoorSpec): string[] {
  const warnings: string[] = [];

  for (const [i, line] of (spec.description ?? []).entries()) {
    if (displayWidth(line) > spec.boxWidth) {
      warnings.push(
        `description[${i}] "${line}" is ${displayWidth(line)} cells wide, wider than boxWidth (${spec.boxWidth})`
      );
    }
  }
  if ((spec.description?.length ?? 0) > spec.boxHeight) {
    warnings.push(
      `${spec.description.length} description line(s) don't fit in boxHeight (${spec.boxHeight})`
    );
  }
  if ((spec.heightChain?.values.length ?? 0) > spec.boxHeight) {
    warnings.push(
      `heightChain has ${spec.heightChain.values.length} row(s), taller than boxHeight (${spec.boxHeight}) — it will spill past the bottom border`
    );
  }
  if (spec.widthChain) {
    const formulaWidth = displayWidth(spec.widthChain.parts.map(String).join(" "));
    const boxTotalWidth = spec.boxWidth + 2;
    if (formulaWidth > boxTotalWidth) {
      warnings.push(
        `widthChain formula is ${formulaWidth} cells wide, wider than the box (${boxTotalWidth})`
      );
    }
  }

  const lockRow = lockInteriorRow(spec);
  if (lockRow !== null && spec.description?.length) {
    const descStart = descriptionInteriorStart(spec);
    const descEnd = descStart + spec.description.length;
    if (lockRow >= descStart && lockRow < descEnd) {
      warnings.push(
        `lock sits on interior row ${lockRow}, inside the description's row range [${descStart}, ${descEnd}) — set lock.rowRatio or reflow the description to avoid the lock character overwriting description text`
      );
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Auto-numbering for the interactive stamp tool
// ---------------------------------------------------------------------------

/** e.g. 1 -> "Door-01". Embed this in a description line to make it auto-numbered. */
export function compositeDoorIdLabel(num: number): string {
  return `Door-${String(num).padStart(2, "0")}`;
}

const COMPOSITE_DOOR_ID_REGEX = /Door-(\d+)/g;

/**
 * Next free sequence number, scanned from any "Door-NN" text already on the
 * canvas — same convention as doors.ts's nextDoorNumber, but composite door
 * items don't have a fixed label format (the description is free text), so
 * this just looks for the ID pattern anywhere rather than parsing a
 * structured label.
 */
export function nextCompositeDoorNumber(layer: ILayerView): number {
  const text = layerToText(layer);
  let max = 0;
  for (const match of text.matchAll(COMPOSITE_DOOR_ID_REGEX)) {
    max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}
