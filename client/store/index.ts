import {
  clearCustomCompositeDoorTemplates as clearCustomCompositeDoorTemplatesModule,
  CompositeDoorTemplate,
  getCustomCompositeDoorTemplates,
  setCustomCompositeDoorTemplates as setCustomCompositeDoorTemplatesModule,
} from "#asciiflow/client/composite_door_registry";
import {
  clearCustomDoorRegistry as clearCustomDoorRegistryModule,
  DoorConfig,
  DoorDirectionCode,
  DoorTypeCode,
  getActiveDoorTypeCodes,
  getCustomDoorRegistry,
  setCustomDoorRegistry as setCustomDoorRegistryModule,
} from "#asciiflow/client/doors";
import { DrawBox } from "#asciiflow/client/draw/box";
import { DrawCompositeDoor } from "#asciiflow/client/draw/composite_door";
import { DrawDoor } from "#asciiflow/client/draw/door";
import { DrawFreeform } from "#asciiflow/client/draw/freeform";
import { IDrawFunction } from "#asciiflow/client/draw/function";
import { DrawLine } from "#asciiflow/client/draw/line";
import { DrawNull } from "#asciiflow/client/draw/null";
import { DrawSelect } from "#asciiflow/client/draw/select";
import { DrawText } from "#asciiflow/client/draw/text";
import { IExportConfig } from "#asciiflow/client/export";
import { CanvasStore } from "#asciiflow/client/store/canvas";
import {
  ArrayStringifier,
  IStringifier,
  JSONStringifier,
} from "#asciiflow/common/stringifiers";
import { create } from "zustand";

export enum ToolMode {
  BOX = 1,
  SELECT = 2,
  FREEFORM = 3,
  ARROWS = 6,
  LINES = 4,
  TEXT = 7,
  DOOR = 8,
  COMPOSITE_DOOR = 9,
}

export interface ICompositeDoorSettings {
  boxWidth: number;
  boxHeight: number;
  lockSide: "left" | "right";
  showDimensions: boolean;
  /** Multi-line dimension formula text — see dimension_formula.ts. */
  heightFormula: string;
  /** Multi-line dimension formula text — see dimension_formula.ts. */
  widthFormula: string;
}

const DEFAULT_COMPOSITE_DOOR: ICompositeDoorSettings = {
  boxWidth: 14,
  boxHeight: 6,
  lockSide: "left",
  showDimensions: true,
  heightFormula: "2400",
  widthFormula: "900",
};

export interface IModifierKeys {
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export interface IDrawing {
  id: string;
  name: string;
}

export class DrawingId {
  public static local(id: string) {
    return new DrawingId("local", id, null);
  }

  public static share(spec: string) {
    return new DrawingId("share", null, spec);
  }

  constructor(
    public readonly type: "local" | "share",
    public readonly localId: string,
    public readonly shareSpec: string
  ) {}

  public get persistentKey() {
    const parts = [this.type, this.type === "local" ? this.localId : this.shareSpec];
    return parts.map((part) => encodeURIComponent(part)).join("/");
  }

  public get href() {
    if (!!this.shareSpec) {
      return `/share/${encodeURIComponent(this.shareSpec)}`;
    } else {
      if (this.localId === null) {
        return `/`;
      }
      return `/local/${encodeURIComponent(this.localId)}`;
    }
  }

  public toString() {
    return DrawingId.STRINGIFIER.serialize(this);
  }

  public static fromString(value: string) {
    return DrawingId.STRINGIFIER.deserialize(value);
  }

  public static readonly STRINGIFIER: IStringifier<DrawingId> = {
    deserialize(value: string) {
      const object = new JSONStringifier<any>().deserialize(value);
      return new DrawingId(object.type, object.localId, object.shareSpec);
    },
    serialize(value: DrawingId) {
      return new JSONStringifier().serialize(value);
    },
  };
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function readPersistent<T>(
  key: string,
  defaultValue: T,
  stringifier: IStringifier<T> = new JSONStringifier() as any
): T {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === undefined) {
    return defaultValue;
  }
  try {
    return stringifier.deserialize(raw);
  } catch {
    return defaultValue;
  }
}

function validDoorType(type: DoorTypeCode): DoorTypeCode {
  const codes = getActiveDoorTypeCodes();
  return codes.includes(type) ? type : codes[0];
}

function writePersistent<T>(
  key: string,
  value: T,
  stringifier: IStringifier<T> = new JSONStringifier() as any
): void {
  localStorage.setItem(key, stringifier.serialize(value));
}

// Hydrate any door types loaded from a definition file in a previous
// session, before initialState() below computes the default doorType — so
// a previously-loaded custom type is still selectable (and can still be the
// default) after a reload, without waiting for the toolbar to mount.
setCustomDoorRegistryModule(
  readPersistent<Record<string, DoorConfig>>("customDoorRegistry", {})
);
setCustomCompositeDoorTemplatesModule(
  readPersistent<Record<string, CompositeDoorTemplate>>("customCompositeDoorTemplates", {})
);

// Default endpoint for the "run intent" dialog (client/intent_run.tsx).
// See AppState.intentMcpUrl's comment: committed here at the user's
// explicit, repeated request after being warned this repo deploys
// publicly and the key would be permanently visible in git history.
const DEFAULT_INTENT_MCP_URL =
  "https://gas-mcp-proxy.tomtang12.workers.dev/?accessKey=qwe12326&channel=mcp";

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export interface AppState {
  // Routing
  route: DrawingId;

  // Tool state
  selectedToolMode: ToolMode;
  freeformCharacter: string;
  doorType: DoorTypeCode;
  doorDirection: DoorDirectionCode;
  // Bumped whenever the custom door registry changes, so React re-renders
  // the door menu — the registry itself lives in module state (doors.ts),
  // not here, since the pure functions in doors.ts read it directly and
  // shouldn't depend on the Zustand store. This counter exists purely to
  // give components something to subscribe to.
  doorRegistryVersion: number;
  compositeDoor: ICompositeDoorSettings;
  // Same purpose as doorRegistryVersion, for the composite-door template
  // registry (composite_door_registry.ts).
  compositeDoorTemplateRegistryVersion: number;
  altPressed: boolean;
  currentCursor: string;
  modifierKeys: IModifierKeys;

  // Persistent UI state (synced to localStorage)
  unicode: boolean;
  controlsOpen: boolean;
  fileControlsOpen: boolean;
  editControlsOpen: boolean;
  helpControlsOpen: boolean;
  exportConfig: IExportConfig;
  localDrawingIds: DrawingId[];
  darkMode: boolean;
  showGrid: boolean;
  // The "run intent" dialog's MCP endpoint (includes an access key in its
  // query string). This repo auto-deploys to a public GitHub Pages URL on
  // every push, so this default is visible to any visitor of the deployed
  // site and permanently recorded in this repo's git history — set at the
  // user's explicit, repeated request after being warned of exactly that.
  // Still overridable per-browser via the dialog's endpoint field, which
  // persists to localStorage the same as every other setting on this list.
  intentMcpUrl: string;

  // Bumped whenever a CanvasStore mutates, so React can re-render.
  canvasVersion: number;
}

function initialState(): AppState {
  return {
    route: DrawingId.local(null),
    selectedToolMode: ToolMode.BOX,
    freeformCharacter: "x",
    // Fall back to the registry's first type if nothing is stored, or if a
    // stored value refers to a type that's since been removed from the
    // registry (stale localStorage) — never trust a persisted code blindly.
    doorType: validDoorType(
      readPersistent<DoorTypeCode>("doorType", getActiveDoorTypeCodes()[0])
    ),
    doorDirection: readPersistent<DoorDirectionCode>("doorDirection", "IL"),
    doorRegistryVersion: 0,
    // Merged over the defaults (rather than falling back to them wholesale)
    // so a pre-existing localStorage blob from before heightFormula/
    // widthFormula existed (the old shape had heightValue/widthValue
    // instead) still comes out with valid formula fields — the old keys
    // just become harmless leftovers, and the new ones fall back to
    // DEFAULT_COMPOSITE_DOOR since they were never present to override it.
    compositeDoor: {
      ...DEFAULT_COMPOSITE_DOOR,
      ...readPersistent<Partial<ICompositeDoorSettings>>("compositeDoor", {}),
    },
    compositeDoorTemplateRegistryVersion: 0,
    altPressed: false,
    currentCursor: "default",
    modifierKeys: {},
    unicode: readPersistent("unicode", true),
    controlsOpen: readPersistent("controlsOpen", true),
    fileControlsOpen: readPersistent("fileControlsOpen", true),
    editControlsOpen: readPersistent("editControlsOpen", true),
    helpControlsOpen: readPersistent("editControlsOpen", true),
    exportConfig: readPersistent("exportConfig", {} as IExportConfig),
    localDrawingIds: readPersistent(
      "localDrawingIds",
      [],
      new ArrayStringifier(DrawingId.STRINGIFIER)
    ),
    darkMode: readPersistent(
      "darkMode",
      typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    ),
    showGrid: readPersistent("showGrid", true),
    intentMcpUrl: readPersistent("intentMcpUrl", DEFAULT_INTENT_MCP_URL),
    canvasVersion: 0,
  };
}

export const useAppStore = create<AppState>(() => initialState());

// Apply the dark class on initial load so CSS custom properties are correct
// before the first React render.
if (typeof document !== "undefined") {
  document.documentElement.classList.toggle("dark", useAppStore.getState().darkMode);
}

// ---------------------------------------------------------------------------
// Tool instances (singletons, stateless enough to live outside the store)
// ---------------------------------------------------------------------------

const boxTool = new DrawBox();
const lineTool = new DrawLine(false);
const arrowTool = new DrawLine(true);
const selectTool = new DrawSelect();
const freeformTool = new DrawFreeform();
const textTool = new DrawText();
const doorTool = new DrawDoor();
const compositeDoorTool = new DrawCompositeDoor();
const nullTool = new DrawNull();

// ---------------------------------------------------------------------------
// Canvas map (per-drawing CanvasStore instances)
// ---------------------------------------------------------------------------

const canvases = new Map<string, CanvasStore>();

function notifyCanvas() {
  useAppStore.setState((s) => ({ canvasVersion: s.canvasVersion + 1 }));
}

function getCanvas(drawingId: DrawingId): CanvasStore {
  const key = drawingId.toString();
  let canvas = canvases.get(key);
  if (!canvas) {
    canvas = new CanvasStore(drawingId, notifyCanvas);
    canvases.set(key, canvas);
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Helper: persist a value to localStorage whenever it's set in the store
// ---------------------------------------------------------------------------

function setPersistent<K extends keyof AppState>(
  key: K,
  value: AppState[K],
  storageKey: string = key,
  stringifier?: any
) {
  useAppStore.setState({ [key]: value } as any);
  writePersistent(storageKey, value, stringifier);
}

// ---------------------------------------------------------------------------
// Imperative store facade (used by controllers, draw tools, and non-React code)
// ---------------------------------------------------------------------------

export const store = {
  // Tool instances
  boxTool,
  lineTool,
  arrowTool,
  selectTool,
  freeformTool,
  textTool,
  doorTool,
  compositeDoorTool,
  nullTool,

  // Route
  get route() {
    return useAppStore.getState().route;
  },
  setRoute(value: DrawingId) {
    useAppStore.setState({ route: value });
  },

  // Freeform character
  get freeformCharacter() {
    return useAppStore.getState().freeformCharacter;
  },
  setFreeformCharacter(value: string) {
    useAppStore.setState({ freeformCharacter: value });
  },

  // Door stamp settings (persistent)
  get doorType() {
    return useAppStore.getState().doorType;
  },
  setDoorType(value: DoorTypeCode) {
    setPersistent("doorType", value);
  },
  get doorDirection() {
    return useAppStore.getState().doorDirection;
  },
  setDoorDirection(value: DoorDirectionCode) {
    setPersistent("doorDirection", value);
  },

  // Custom door registry (runtime-loaded, persisted). The registry data
  // itself lives in doors.ts module state; this just keeps it in sync with
  // localStorage and bumps doorRegistryVersion so subscribers re-render.
  // Callers must have already validated every entry (see
  // validateDoorConfig/parseDoorRegistryFile in doors.ts) — this does not
  // re-validate.
  get customDoorRegistry() {
    return getCustomDoorRegistry();
  },
  get doorRegistryVersion() {
    return useAppStore.getState().doorRegistryVersion;
  },
  loadCustomDoorTypes(registry: Record<string, DoorConfig>) {
    const merged = { ...getCustomDoorRegistry(), ...registry };
    setCustomDoorRegistryModule(merged);
    writePersistent("customDoorRegistry", merged);
    useAppStore.setState((s) => ({
      doorRegistryVersion: s.doorRegistryVersion + 1,
      doorType: validDoorType(s.doorType),
    }));
  },
  resetCustomDoorTypes() {
    clearCustomDoorRegistryModule();
    writePersistent("customDoorRegistry", {});
    useAppStore.setState((s) => ({
      doorRegistryVersion: s.doorRegistryVersion + 1,
      doorType: validDoorType(s.doorType),
    }));
  },

  // Composite door stamp settings (persistent)
  get compositeDoor() {
    return useAppStore.getState().compositeDoor;
  },
  setCompositeDoor(patch: Partial<ICompositeDoorSettings>) {
    setPersistent("compositeDoor", { ...useAppStore.getState().compositeDoor, ...patch });
  },
  setCompositeDoorLockSide(side: "left" | "right") {
    store.setCompositeDoor({ lockSide: side });
  },

  // Custom composite-door template registry (runtime-loaded, persisted).
  // Same pattern as customDoorRegistry above: the registry data lives in
  // composite_door_registry.ts module state, this keeps it in sync with
  // localStorage and bumps compositeDoorTemplateRegistryVersion so the
  // template menu re-renders. Callers must have already validated every
  // entry (see parseCompositeDoorTemplateFile) — this does not re-validate.
  get customCompositeDoorTemplates() {
    return getCustomCompositeDoorTemplates();
  },
  get compositeDoorTemplateRegistryVersion() {
    return useAppStore.getState().compositeDoorTemplateRegistryVersion;
  },
  loadCustomCompositeDoorTemplates(registry: Record<string, CompositeDoorTemplate>) {
    const merged = { ...getCustomCompositeDoorTemplates(), ...registry };
    setCustomCompositeDoorTemplatesModule(merged);
    writePersistent("customCompositeDoorTemplates", merged);
    useAppStore.setState((s) => ({
      compositeDoorTemplateRegistryVersion: s.compositeDoorTemplateRegistryVersion + 1,
    }));
  },
  resetCustomCompositeDoorTemplates() {
    clearCustomCompositeDoorTemplatesModule();
    writePersistent("customCompositeDoorTemplates", {});
    useAppStore.setState((s) => ({
      compositeDoorTemplateRegistryVersion: s.compositeDoorTemplateRegistryVersion + 1,
    }));
  },
  /** Prefills the composite-door panel from a named template — still freely editable afterward. */
  applyCompositeDoorTemplate(template: CompositeDoorTemplate) {
    store.setCompositeDoor({
      boxWidth: template.boxWidth,
      boxHeight: template.boxHeight,
      lockSide: template.lockSide,
      showDimensions: Boolean(template.heightFormula || template.widthFormula),
      heightFormula: template.heightFormula ?? DEFAULT_COMPOSITE_DOOR.heightFormula,
      widthFormula: template.widthFormula ?? DEFAULT_COMPOSITE_DOOR.widthFormula,
    });
  },

  // Selected tool mode
  get selectedToolMode() {
    return useAppStore.getState().selectedToolMode;
  },

  toolMode(): ToolMode | undefined {
    if (useAppStore.getState().route.shareSpec) {
      return undefined;
    }
    return useAppStore.getState().selectedToolMode;
  },

  setToolMode(toolMode: ToolMode) {
    const state = useAppStore.getState();
    if (state.selectedToolMode !== toolMode) {
      store.currentTool.cleanup();
      useAppStore.setState({ selectedToolMode: toolMode });
    }
  },

  // Current tool (derived)
  get currentTool(): IDrawFunction {
    const mode = store.toolMode();
    return mode === ToolMode.BOX
      ? boxTool
      : mode === ToolMode.LINES
      ? lineTool
      : mode === ToolMode.ARROWS
      ? arrowTool
      : mode === ToolMode.FREEFORM
      ? freeformTool
      : mode === ToolMode.TEXT
      ? textTool
      : mode === ToolMode.DOOR
      ? doorTool
      : mode === ToolMode.COMPOSITE_DOOR
      ? compositeDoorTool
      : mode === ToolMode.SELECT
      ? selectTool
      : nullTool;
  },

  // Alt pressed
  get altPressed() {
    return useAppStore.getState().altPressed;
  },
  setAltPressed(value: boolean) {
    useAppStore.setState({ altPressed: value });
  },

  // Cursor
  get currentCursor() {
    return useAppStore.getState().currentCursor;
  },
  setCurrentCursor(value: string) {
    useAppStore.setState({ currentCursor: value });
  },

  // Modifier keys
  get modifierKeys() {
    return useAppStore.getState().modifierKeys;
  },
  setModifierKeys(value: IModifierKeys) {
    useAppStore.setState({ modifierKeys: value });
  },

  // Dark mode (persistent)
  get darkMode() {
    return useAppStore.getState().darkMode;
  },
  setDarkMode(value: boolean) {
    // Toggle the class synchronously so CSS custom properties are available
    // before React re-renders (getColors() reads them during render).
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", value);
    }
    setPersistent("darkMode", value);
  },

  // Show grid (persistent)
  get showGrid() {
    return useAppStore.getState().showGrid;
  },
  setShowGrid(value: boolean) {
    setPersistent("showGrid", value);
  },

  // "Run intent" dialog's MCP endpoint (persistent, browser-local only — see AppState's comment).
  get intentMcpUrl() {
    return useAppStore.getState().intentMcpUrl;
  },
  setIntentMcpUrl(value: string) {
    setPersistent("intentMcpUrl", value);
  },

  // Unicode (persistent)
  get unicode() {
    return useAppStore.getState().unicode;
  },
  setUnicode(value: boolean) {
    setPersistent("unicode", value);
  },

  // Controls open (persistent)
  get controlsOpen() {
    return useAppStore.getState().controlsOpen;
  },
  setControlsOpen(value: boolean) {
    setPersistent("controlsOpen", value);
  },

  // File controls open (persistent)
  get fileControlsOpen() {
    return useAppStore.getState().fileControlsOpen;
  },
  setFileControlsOpen(value: boolean) {
    setPersistent("fileControlsOpen", value);
  },

  // Edit controls open (persistent)
  get editControlsOpen() {
    return useAppStore.getState().editControlsOpen;
  },
  setEditControlsOpen(value: boolean) {
    setPersistent("editControlsOpen", value);
  },

  // Help controls open (persistent)
  get helpControlsOpen() {
    return useAppStore.getState().helpControlsOpen;
  },
  setHelpControlsOpen(value: boolean) {
    setPersistent("helpControlsOpen", value);
  },

  // Export config (persistent)
  get exportConfig() {
    return useAppStore.getState().exportConfig;
  },
  setExportConfig(value: IExportConfig) {
    setPersistent("exportConfig", value);
  },

  // Local drawing IDs (persistent with custom stringifier)
  get localDrawingIds() {
    return useAppStore.getState().localDrawingIds;
  },
  setLocalDrawingIds(value: DrawingId[]) {
    setPersistent(
      "localDrawingIds",
      value,
      "localDrawingIds",
      new ArrayStringifier(DrawingId.STRINGIFIER)
    );
  },

  // Canvas access
  canvas(drawingId: DrawingId) {
    return getCanvas(drawingId);
  },

  get currentCanvas() {
    return getCanvas(useAppStore.getState().route);
  },

  // Derived: drawings list
  get drawings(): DrawingId[] {
    const state = useAppStore.getState();
    if (state.route.shareSpec) {
      return [state.route, ...state.localDrawingIds];
    }
    const localDrawingIds = state.localDrawingIds;
    if (
      !localDrawingIds.some(
        (drawingId) => !drawingId.localId && !drawingId.shareSpec
      )
    ) {
      return [DrawingId.local(null), ...localDrawingIds];
    }
    return localDrawingIds;
  },

  // Actions
  deleteDrawing(drawingId: DrawingId) {
    const filtered = useAppStore
      .getState()
      .localDrawingIds.filter(
        (subDrawingId) => subDrawingId.toString() !== drawingId.toString()
      );
    store.setLocalDrawingIds(filtered);
    // Also delete other local storage.
    Object.keys(localStorage)
      .filter((key) => key.startsWith(storagePrefix(drawingId)))
      .forEach((key) => localStorage.removeItem(key));
    canvases.delete(drawingId.toString());
    // Force re-render so the UI updates even if the route doesn't change
    // (e.g. deleting the default drawing navigates back to the same route).
    notifyCanvas();
  },

  renameDrawing(originalLocalId: string, newLocalId: string) {
    const originalId = DrawingId.local(originalLocalId);
    const newId = DrawingId.local(newLocalId);
    Object.keys(localStorage)
      .filter((key) => key.startsWith(storagePrefix(originalId)))
      .forEach((key) => {
        localStorage.setItem(
          key.replace(storagePrefix(originalId), storagePrefix(newId)),
          localStorage.getItem(key)
        );
        localStorage.removeItem(key);
      });
    const updated = [
      ...useAppStore
        .getState()
        .localDrawingIds.filter(
          (drawingId) => drawingId.toString() !== originalId.toString()
        ),
      newId,
    ];
    store.setLocalDrawingIds(updated);
    canvases.delete(originalId.toString());
    window.location.hash = newId.href;
  },

  saveDrawing(shareDrawingId: DrawingId, name: string) {
    const sharedDrawing = getCanvas(shareDrawingId);
    const localDrawing = getCanvas(DrawingId.local(name));
    localDrawing.committed = sharedDrawing.committed;
    store.setLocalDrawingIds([
      ...useAppStore.getState().localDrawingIds,
      DrawingId.local(name),
    ]);
  },
};

export function storagePrefix(drawingId: DrawingId) {
  return `drawing/${encodeURIComponent(drawingId.persistentKey)}/`;
}

export function storageKey(drawingId: DrawingId, key: string) {
  return storagePrefix(drawingId) + key;
}
