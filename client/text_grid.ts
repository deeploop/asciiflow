/**
 * Full-width (CJK) aware text grid — a shared compositor for building
 * multi-line ASCII text blocks (door schedules, elevation drawings,
 * composite door items, ...) that stay visually aligned once pasted into
 * ASCIIFlow.
 *
 * ASCIIFlow's grid gives every character a fixed single-width cell (see
 * upstream issue #85 — full-width/CJK glyphs aren't natively supported),
 * but a CJK glyph in the app's monospace font renders roughly twice as
 * wide as a Latin character. TextGrid works around this by reserving two
 * grid cells for every full-width character it writes.
 */

const FULLWIDTH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0xa4cf], // CJK radicals, Kangxi, CJK Unified Ideographs, Bopomofo, Hiragana, Katakana
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xff00, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6],
];

export function charWidth(ch: string): 1 | 2 {
  const code = ch.codePointAt(0) ?? 0;
  return FULLWIDTH_RANGES.some(([lo, hi]) => code >= lo && code <= hi) ? 2 : 1;
}

export function displayWidth(text: string): number {
  return [...text].reduce((sum, ch) => sum + charWidth(ch), 0);
}

export class TextGrid {
  private rows: string[][] = [];

  private ensure(row: number, col: number) {
    while (this.rows.length <= row) {
      this.rows.push([]);
    }
    const line = this.rows[row];
    while (line.length <= col) {
      line.push(" ");
    }
  }

  setChar(row: number, col: number, ch: string) {
    this.ensure(row, col);
    this.rows[row][col] = ch;
    if (charWidth(ch) === 2) {
      // Reserve the next cell as blank so the glyph has room to render at
      // its actual (double) width without colliding with what follows.
      this.ensure(row, col + 1);
      this.rows[row][col + 1] = " ";
    }
  }

  /** Writes text left-to-right starting at (row, col); returns the next free column. */
  write(row: number, col: number, text: string): number {
    let c = col;
    for (const ch of text) {
      this.setChar(row, c, ch);
      c += charWidth(ch);
    }
    return c;
  }

  /** Centers text within [colStart, colEnd); returns the column it started at. */
  writeCentered(row: number, colStart: number, colEnd: number, text: string): number {
    const start =
      colStart + Math.max(0, Math.floor((colEnd - colStart - displayWidth(text)) / 2));
    this.write(row, start, text);
    return start;
  }

  hLine(row: number, colStart: number, colEnd: number, ch = "─") {
    for (let c = colStart; c < colEnd; c++) {
      this.setChar(row, c, ch);
    }
  }

  vLine(col: number, rowStart: number, rowEnd: number, ch = "│") {
    for (let r = rowStart; r <= rowEnd; r++) {
      this.setChar(r, col, ch);
    }
  }

  toString(): string {
    return this.rows.map((line) => line.join("").replace(/\s+$/, "")).join("\n");
  }
}
