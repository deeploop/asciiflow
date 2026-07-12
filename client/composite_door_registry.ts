/**
 * Named composite-door presets ("templates") — the "custom menu" version of
 * the composite-door stamp tool's settings panel: instead of typing box
 * size / lock side / height & width formulas by hand every time, pick a
 * named preset from the menu and its fields prefill the panel (still
 * editable afterward — picking a template is a starting point, not a lock).
 *
 * Same two-tier model as door_registry.ts: a handful of built-ins defined
 * here at compile time, plus a runtime-loaded custom registry (a .json file
 * loaded from the panel, no rebuild) that merges on top of them — see
 * parseCompositeDoorTemplateFile() and setCustomCompositeDoorTemplates().
 */

export interface CompositeDoorTemplate {
  /** Display name and registry key. */
  name: string;
  boxWidth: number;
  boxHeight: number;
  lockSide: "left" | "right";
  /** Multi-line formula text — see dimension_formula.ts. Omit for no height chain. */
  heightFormula?: string;
  /** Multi-line formula text — see dimension_formula.ts. Omit for no width chain. */
  widthFormula?: string;
}

export const BUILTIN_COMPOSITE_DOOR_TEMPLATES: Record<string, CompositeDoorTemplate> = {
  "standard-900": {
    name: "standard-900",
    boxWidth: 14,
    boxHeight: 10,
    lockSide: "left",
    heightFormula: "2400",
    widthFormula: "900",
  },
  "tall-1000": {
    name: "tall-1000",
    boxWidth: 16,
    boxHeight: 14,
    lockSide: "left",
    heightFormula: "2439\n-45\n-10",
    widthFormula: "1000\n+18\n+7",
  },
  "double-1200": {
    name: "double-1200",
    boxWidth: 20,
    boxHeight: 10,
    lockSide: "right",
    heightFormula: "2400\n-10",
    widthFormula: "1200\n+20",
  },
};

// ---------------------------------------------------------------------------
// Runtime-loaded custom templates (module-level state, not React state —
// mirrors door_registry.ts's customRegistry; see store/index.ts for how
// this is made to trigger a re-render and stay in sync with localStorage).
// ---------------------------------------------------------------------------

let customTemplates: Readonly<Record<string, CompositeDoorTemplate>> = {};

/** Built-ins merged with whatever custom templates are currently loaded (custom entries win on name collision). */
export function getActiveCompositeDoorTemplates(): CompositeDoorTemplate[] {
  return Object.values({ ...BUILTIN_COMPOSITE_DOOR_TEMPLATES, ...customTemplates });
}

export function getCustomCompositeDoorTemplates(): Readonly<Record<string, CompositeDoorTemplate>> {
  return customTemplates;
}

/**
 * Replaces the active custom template registry. Callers are responsible for
 * having validated every entry first (see parseCompositeDoorTemplateFile) —
 * this does not re-validate.
 */
export function setCustomCompositeDoorTemplates(registry: Record<string, CompositeDoorTemplate>) {
  customTemplates = { ...registry };
}

export function clearCustomCompositeDoorTemplates() {
  customTemplates = {};
}

// ---------------------------------------------------------------------------
// Validation + JSON template file loading
// ---------------------------------------------------------------------------

export interface CompositeDoorTemplateParseResult {
  registry: Record<string, CompositeDoorTemplate>;
  errors: string[];
}

function validateCompositeDoorTemplate(
  raw: unknown,
  path: string
): { template: CompositeDoorTemplate | null; errors: string[] } {
  if (typeof raw !== "object" || raw === null) {
    return { template: null, errors: [`${path} must be an object`] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    errors.push(`${path}.name must be a non-empty string`);
  }
  if (typeof obj.boxWidth !== "number" || obj.boxWidth < 1) {
    errors.push(`${path}.boxWidth must be a positive number`);
  }
  if (typeof obj.boxHeight !== "number" || obj.boxHeight < 1) {
    errors.push(`${path}.boxHeight must be a positive number`);
  }
  if (obj.lockSide !== undefined && obj.lockSide !== "left" && obj.lockSide !== "right") {
    errors.push(`${path}.lockSide must be "left" or "right"`);
  }
  if (obj.heightFormula !== undefined && typeof obj.heightFormula !== "string") {
    errors.push(`${path}.heightFormula must be a string`);
  }
  if (obj.widthFormula !== undefined && typeof obj.widthFormula !== "string") {
    errors.push(`${path}.widthFormula must be a string`);
  }

  if (errors.length > 0) {
    return { template: null, errors };
  }
  return {
    template: {
      name: (obj.name as string).trim(),
      boxWidth: obj.boxWidth as number,
      boxHeight: obj.boxHeight as number,
      lockSide: (obj.lockSide as "left" | "right" | undefined) ?? "left",
      heightFormula: obj.heightFormula as string | undefined,
      widthFormula: obj.widthFormula as string | undefined,
    },
    errors: [],
  };
}

/**
 * Parses a template file: a JSON array of template objects. Each entry is
 * validated independently — one bad entry is reported and skipped, the same
 * partial-success contract as door_registry.ts's parseDoorRegistryJson (a
 * flat list of named presets, unlike frame_tree.ts's single interdependent
 * tree, so there's no reason to reject the whole file over one bad entry).
 */
export function parseCompositeDoorTemplateFile(text: string): CompositeDoorTemplateParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { registry: {}, errors: [`JSON parse error: ${(e as Error).message}`] };
  }
  if (!Array.isArray(parsed)) {
    return { registry: {}, errors: ["root must be a JSON array of template objects"] };
  }

  const registry: Record<string, CompositeDoorTemplate> = {};
  const errors: string[] = [];
  parsed.forEach((raw, i) => {
    const { template, errors: templateErrors } = validateCompositeDoorTemplate(raw, `[${i}]`);
    if (template) {
      registry[template.name] = template;
    } else {
      errors.push(...templateErrors);
    }
  });
  return { registry, errors };
}
