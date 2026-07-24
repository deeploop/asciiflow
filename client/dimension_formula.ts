/**
 * Parses a multi-line dimension formula into typed terms plus a computed
 * total — the shape composite_door.ts's CompositeDoorHeightChain /
 * CompositeDoorWidthChain already render (e.g. a height chain
 * [2439, "-45", "-10", 2384], a width formula [1114, "+18", "+7", "+24"]
 * -> 1163) — but composite_door.ts renders values *as given*, it doesn't
 * compute them (see its own doc comments). This is the piece that does the
 * arithmetic, so a UI text box only needs the base value and the deltas;
 * the running total is derived, not typed by hand.
 *
 * Input is one term per line: the first non-blank line is the base number,
 * every line after it must be a signed delta ("+18", "-45"). Blank lines
 * are ignored.
 */

export interface DimensionFormulaResult {
  /** Terms exactly as parsed — first is the base number, rest are delta strings. */
  terms: Array<string | number>;
  /** Running total: base plus the sum of every delta. */
  total: number;
  errors: string[];
}

const DELTA_LINE = /^[+-]\d+(\.\d+)?$/;

export function parseDimensionFormula(text: string): DimensionFormulaResult {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { terms: [], total: 0, errors: ["formula is empty"] };
  }

  const errors: string[] = [];
  const base = Number(lines[0]);
  if (!Number.isFinite(base)) {
    errors.push(`first line "${lines[0]}" must be a plain number (the base value)`);
  }
  const terms: Array<string | number> = [Number.isFinite(base) ? base : lines[0]];
  let total = Number.isFinite(base) ? base : 0;

  for (const line of lines.slice(1)) {
    if (DELTA_LINE.test(line)) {
      total += Number(line);
      terms.push(line);
    } else {
      errors.push(`"${line}" is not a valid delta — every line after the first must be +N or -N`);
      terms.push(line);
    }
  }

  return { terms, total, errors };
}
