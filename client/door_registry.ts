/**
 * Door type "quick-define" file — the single place to add a *built-in* door
 * type at compile time. Add one entry to DOOR_REGISTRY below and the toolbar
 * menu, canvas stamping, keyboard shortcuts, and Excel import/export all
 * pick it up automatically. No other file needs to change.
 *
 * For adding door types at *runtime* (no rebuild — load a .json/.txt file
 * from the door panel), see setCustomDoorRegistry() below and the parser
 * functions in doors.ts (parseDoorRegistryFile/Json/Text). Runtime-loaded
 * types merge on top of these built-ins via getActiveDoorRegistry().
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

/** The compile-time built-in codes — always valid, known at compile time. */
export type BuiltInDoorTypeCode = keyof typeof DOOR_REGISTRY;

/**
 * A door type code once runtime-loaded custom types exist. This is
 * deliberately widened to `string` rather than staying a literal union:
 * custom codes are only known once a definition file has been loaded, so
 * TypeScript cannot enumerate them at compile time. This is the real
 * trade-off of dynamic loading — code that specifically wants "one of the
 * built-ins" should use BuiltInDoorTypeCode instead.
 */
export type DoorTypeCode = string;

export const DOOR_TYPE_CODES = Object.keys(DOOR_REGISTRY) as BuiltInDoorTypeCode[];

// ---------------------------------------------------------------------------
// Runtime-loaded custom door types (module-level state, not React state —
// see doors.ts for the parsers that build a validated registry to pass here,
// and store/index.ts for how this is made to trigger a re-render).
// ---------------------------------------------------------------------------

let customRegistry: Readonly<Record<string, DoorConfig>> = {};

/** Built-ins merged with whatever custom registry is currently loaded (custom entries win on code collision). */
export function getActiveDoorRegistry(): Record<string, DoorConfig> {
  return { ...DOOR_REGISTRY, ...customRegistry };
}

export function getActiveDoorTypeCodes(): DoorTypeCode[] {
  return Object.keys(getActiveDoorRegistry());
}

export function getCustomDoorRegistry(): Readonly<Record<string, DoorConfig>> {
  return customRegistry;
}

/**
 * Replaces the active custom registry. Callers are responsible for having
 * validated every entry first (see validateDoorConfig in doors.ts) — this
 * function does not re-validate, since the codes here also feed directly
 * into RegExp construction elsewhere and an unvalidated code could break
 * that (or worse, be a regex-injection vector).
 */
export function setCustomDoorRegistry(registry: Record<string, DoorConfig>) {
  customRegistry = { ...registry };
}

export function clearCustomDoorRegistry() {
  customRegistry = {};
}
