/**
 * "AF App" testArgs/result convention (client/intent_run.tsx): instead of
 * hand-typing JSON, the user edits plain multi-line text in the dialog;
 * this module packs it into the {"raw": "line1\nline2\n..."} shape the
 * AF_-prefixed intents expect as input, and unpacks a result — which may
 * come back as {"raw": "..."}, {"raw": [...]}, a bare array, or a bare
 * string — back into the same plain multi-line text for display. Neither
 * box in the dialog ever requires the user to read or write JSON syntax.
 */

/** Wraps plain multi-line text as {"raw": text} — the AF App standard input shape. */
export function packRaw(text: string): { raw: string } {
  return { raw: text };
}

/**
 * Converts any of the shapes an AF_-prefixed intent's testArgs/result might
 * already be in — {"raw": "string"}, {"raw": [...]}, a bare array, a bare
 * string, or arbitrary JSON — into plain multi-line text for display. Never
 * throws: anything it doesn't recognize falls back to pretty-printed JSON.
 */
export function unpackRaw(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(String).join("\n");
  }
  if (typeof value === "object" && "raw" in (value as Record<string, unknown>)) {
    return unpackRaw((value as Record<string, unknown>).raw);
  }
  return JSON.stringify(value, null, 2);
}

/**
 * Parses a testArgs/lastResult JSON *string* (the shape they're stored in
 * on the sheet) into plain multi-line text via unpackRaw() — tolerating a
 * malformed/non-JSON string by displaying it as-is rather than throwing.
 */
export function unpackRawJsonString(jsonText: string | undefined): string {
  if (!jsonText) {
    return "";
  }
  try {
    return unpackRaw(JSON.parse(jsonText));
  } catch {
    return jsonText;
  }
}
