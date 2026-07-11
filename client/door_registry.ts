/**
 * Door type "quick-define" file — the single place to add a new door type.
 *
 * Add one entry to DOOR_REGISTRY below and the toolbar menu, canvas
 * stamping, keyboard shortcuts, and Excel import/export all pick it up
 * automatically. No other file needs to change, and the TypeScript type
 * DoorTypeCode is derived from these keys — nothing to keep in sync by hand.
 *
 * See DOOR_TEMPLATE_FORMAT.md for the row1_formula grammar (a small, safe
 * expression language — not eval'd TypeScript) and DOOR_TEMPLATE_AI_PROMPT.md
 * for a ready-to-use prompt that writes new entries for you.
 */

export interface DoorConfig {
  /** Chinese name, e.g. 懸吊門. */
  name: string;
  englishName: string;
  /**
   * Decoration row rendered above the label box, as a formula evaluated by
   * `renderDoorLine`. `W` is the symbol width; `'x' * (expr)` tiles the quoted
   * pattern to that length, and `+` concatenates segments.
   */
  row1_formula: string;
}

export const DOOR_REGISTRY = {
  SD: {
    name: "懸吊門",
    englishName: "Suspension Door",
    // Top rail with hangers.
    row1_formula: "'●' + '─' * (W-2) + '●'",
  },
  BS: {
    name: "緩衝懸吊門",
    englishName: "Buffer Suspension Door",
    // Rail with buffers at both ends.
    row1_formula: "'●├' + '─' * (W-4) + '┤●'",
  },
  LM: {
    name: "拉門",
    englishName: "Sliding Door",
    // Single-leaf sliding track.
    row1_formula: "'◄' + '═' * (W-1)",
  },
  SL: {
    name: "推拉門",
    englishName: "Sliding Door",
    // Double sliding track.
    row1_formula: "'◄' + '═' * (W-2) + '►'",
  },
  FD: {
    name: "折門",
    englishName: "Folding Door",
    // Folding leaves.
    row1_formula: "'/\\' * W",
  },
  GD: {
    name: "幽靈門",
    englishName: "Ghost Door",
    // Ghost (concealed) door.
    row1_formula: "'░' * W",
  },
} satisfies Record<string, DoorConfig>;

/** Derived from the registry's own keys — adding an entry above extends this automatically. */
export type DoorTypeCode = keyof typeof DOOR_REGISTRY;

export const DOOR_TYPE_CODES = Object.keys(DOOR_REGISTRY) as DoorTypeCode[];
