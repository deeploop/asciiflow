import { ASCII, UNICODE } from "#asciiflow/client/constants";
import {
  compositeDoorIdLabel,
  nextCompositeDoorNumber,
} from "#asciiflow/client/composite_door";
import {
  DOOR_DIRECTIONS,
  DOOR_LABEL_OFFSET,
  DoorTypeCode,
  doorTemplate,
  exportDoorsToXlsx,
  getDoorTypes,
  importDoorsFromXlsx,
  nextDoorNumber,
  parseDoorRegistryFile,
  scanDoors,
} from "#asciiflow/client/doors";
import { ExportPanel } from "#asciiflow/client/export";
import { Layer } from "#asciiflow/client/layer";
import { DrawingId, store, ToolMode, useAppStore } from "#asciiflow/client/store";
import { DrawingStringifier } from "#asciiflow/client/store/drawing_stringifier";
import { textToLayer } from "#asciiflow/client/text_utils";
import {
  Button,
  ControlledDialog,
  Kbd,
  TextField,
  Toast,
} from "#asciiflow/client/ui/components";
import styles from "#asciiflow/client/toolbar.module.css";
import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useHistory } from "react-router";

// ---------------------------------------------------------------------------
// Which panel owns the second row (singleton — only one at a time)
// ---------------------------------------------------------------------------

type PanelId = "file" | "export" | "help" | "view" | null;

// Module-level panel state so it survives React Router remounts.
let _currentPanel: PanelId = null;
const _panelListeners = new Set<(p: PanelId) => void>();
function usePanel(): [PanelId, (id: PanelId) => void] {
  const [panel, _setPanel] = useState<PanelId>(_currentPanel);
  useEffect(() => {
    const listener = (p: PanelId) => _setPanel(p);
    _panelListeners.add(listener);
    return () => { _panelListeners.delete(listener); };
  }, []);
  const setPanel = (id: PanelId) => {
    _currentPanel = id;
    _panelListeners.forEach((l) => l(id));
  };
  return [panel, setPanel];
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Array<{
  mode: ToolMode;
  label: string;
  testId: string;
  shortcut: string;
  color: string;
}> = [
  { mode: ToolMode.BOX, label: "box", testId: "tool-boxes", shortcut: "1", color: "var(--color-cyan)" },
  { mode: ToolMode.SELECT, label: "select", testId: "tool-select---move", shortcut: "2", color: "var(--color-success)" },
  { mode: ToolMode.FREEFORM, label: "draw", testId: "tool-freeform", shortcut: "3", color: "var(--color-orange)" },
  { mode: ToolMode.ARROWS, label: "arrow", testId: "tool-arrow", shortcut: "4", color: "var(--color-purple)" },
  { mode: ToolMode.LINES, label: "line", testId: "tool-line", shortcut: "5", color: "var(--color-accent)" },
  { mode: ToolMode.TEXT, label: "text", testId: "tool-text", shortcut: "6", color: "var(--color-warning)" },
  { mode: ToolMode.DOOR, label: "door", testId: "tool-door", shortcut: "7", color: "var(--color-danger)" },
  { mode: ToolMode.COMPOSITE_DOOR, label: "door+", testId: "tool-composite-door", shortcut: "8", color: "var(--color-brand)" },
];

// Helper: stop all keyboard event propagation so controller doesn't intercept
function stopKeys(e: React.KeyboardEvent) {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

// ---------------------------------------------------------------------------
// Top-level Toolbar
// ---------------------------------------------------------------------------

export function Toolbar() {
  const darkMode = useAppStore((s) => s.darkMode);
  const route = useAppStore((s) => s.route);
  const selectedToolMode = useAppStore((s) => s.selectedToolMode);
  const altPressed = useAppStore((s) => s.altPressed);
  const canvasVersion = useAppStore((s) => s.canvasVersion);
  const isShared = Boolean(route.shareSpec);
  const [panel, setPanel] = usePanel();

  function togglePanel(id: PanelId) {
    setPanel(panel === id ? null : id);
  }

  // Measure the topBar border-box width so the second row can match it.
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarWidth, setTopBarWidth] = useState<number>(0);
  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTopBarWidth(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The freeform tool shows its picker in the second row when no panel is open
  const showFreeformPicker =
    !isShared && selectedToolMode === ToolMode.FREEFORM && panel === null;

  // The door tool shows its type/direction picker the same way.
  const showDoorPicker =
    !isShared && selectedToolMode === ToolMode.DOOR && panel === null;

  const showCompositeDoorPicker =
    !isShared && selectedToolMode === ToolMode.COMPOSITE_DOOR && panel === null;

  const showSecondRow =
    panel !== null || showFreeformPicker || showDoorPicker || showCompositeDoorPicker;

  return (
    <div className={styles.topBarWrapper}>
    <div className={styles.topBar} ref={topBarRef}>
      {/* ── Primary row ── */}
      <div className={styles.topRow}>
        {/* Branding — colorful "af" */}
        <a
          href="https://github.com/lewish/asciiflow"
          className={styles.brand}
          target="_blank"
          rel="noopener"
        >
          <span style={{ color: "var(--color-cyan)" }}>a</span>
          <span style={{ color: "var(--color-purple)" }}>f</span>
        </a>

        <Sep />

        {/* Panel toggles */}
        <PanelBtn id="file" current={panel} onClick={togglePanel}>
          files
        </PanelBtn>

        <Sep />

        {/* Tools (or shared banner) */}
        {isShared ? (
          <SharedBanner drawingId={route} />
        ) : (
          <>
            {TOOLS.map((tool) => {
              const active = selectedToolMode === tool.mode;
              return (
                <button
                  key={tool.mode}
                  className={[
                    styles.toolTab,
                    active ? styles.toolTabActive : "",
                  ].filter(Boolean).join(" ")}
                  style={active ? { color: tool.color } : undefined}
                  onClick={() => {
                    store.setToolMode(tool.mode);
                    setPanel(null);
                  }}
                  data-testid={tool.testId}
                >
                  {tool.label}
                  {altPressed && <> <Kbd>{tool.shortcut}</Kbd></>}
                </button>
              );
            })}
          </>
        )}

        <Sep />

        <PanelBtn id="export" current={panel} onClick={togglePanel}>
          export
        </PanelBtn>

        <Sep />

        {/* Actions */}
        {!isShared && (
          <>
            <ActionBtn
              color="var(--color-success)"
              onClick={() => store.currentCanvas.undo()}
              title="Undo"
            >
              undo
            </ActionBtn>
            <ActionBtn
              color="var(--color-danger)"
              onClick={() => store.currentCanvas.redo()}
              title="Redo"
            >
              redo
            </ActionBtn>
            <Sep />
          </>
        )}

        <PanelBtn id="view" current={panel} onClick={togglePanel}>
          view
        </PanelBtn>

        <Sep />

        {/* Help — far right */}
        <PanelBtn id="help" current={panel} onClick={togglePanel}>
          help
        </PanelBtn>
      </div>
    </div>

      {/* ── Secondary row (contextual) ── */}
      {showSecondRow && (
        <div
          className={styles.secondRow}
          style={topBarWidth ? { width: topBarWidth } : undefined}
        >
          {panel === "file" && <FilePanel />}
          {panel === "help" && <HelpContent />}
          {panel === "export" && <ExportPanel drawingId={route} />}
          {panel === "view" && <ViewPanel />}
          {showFreeformPicker && <DrawPanel />}
          {showDoorPicker && <DoorPanel />}
          {showCompositeDoorPicker && <CompositeDoorPanel />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel toggle button (highlights when its panel is active)
// ---------------------------------------------------------------------------

function PanelBtn({
  id,
  current,
  onClick,
  children,
}: {
  id: PanelId;
  current: PanelId;
  onClick: (id: PanelId) => void;
  children: React.ReactNode;
}) {
  const active = current === id;
  return (
    <button
      className={[styles.menuBarBtn, active ? styles.menuBarBtnActive : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(id)}
      data-testid={`${id}-button`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bracket-wrapped action button: [colored text]
// ---------------------------------------------------------------------------

function ActionBtn({
  color,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { color: string }) {
  return (
    <button className={styles.actionBtn} style={{ color }} {...rest}>
      [{children}]
    </button>
  );
}

// ---------------------------------------------------------------------------
// Separator — box-drawing vertical line │
// ---------------------------------------------------------------------------

function Sep() {
  return <span className={styles.sep}>{"\u2502"}</span>;
}

// ---------------------------------------------------------------------------
// View panel — zoom, recenter, dark/light toggle with labels
// ---------------------------------------------------------------------------

function ViewPanel() {
  const darkMode = useAppStore((s) => s.darkMode);
  const showGrid = useAppStore((s) => s.showGrid);
  const canvasVersion = useAppStore((s) => s.canvasVersion);
  const zoom = store.currentCanvas.zoom;
  const zoomPct = Math.round(zoom * 100);

  return (
    <div className={styles.viewPanel}>
      <span className={styles.viewLabel}>
        zoom: <span className={styles.viewValue}>{zoomPct}%</span>
      </span>
      <ActionBtn
        color="var(--color-cyan)"
        onClick={() => store.currentCanvas.resetZoom()}
      >
        reset
      </ActionBtn>
      <ActionBtn
        color="var(--color-orange)"
        onClick={() => store.currentCanvas.recenter()}
      >
        recenter
      </ActionBtn>
      <span className={styles.sep}>{"\u2502"}</span>
      <span className={styles.viewLabel}>
        grid: <span className={styles.viewValue}>{showGrid ? "on" : "off"}</span>
      </span>
      <ActionBtn
        color="var(--color-success)"
        onClick={() => store.setShowGrid(!showGrid)}
      >
        {showGrid ? "hide" : "show"}
      </ActionBtn>
      <span className={styles.sep}>{"\u2502"}</span>
      <span className={styles.viewLabel}>
        {darkMode ? "dark" : "light"} mode
      </span>
      <ActionBtn
        color="var(--color-warning)"
        onClick={() => store.setDarkMode(!darkMode)}
      >
        {darkMode ? "go light" : "go dark"}
      </ActionBtn>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draw panel — hint + expandable character picker
// ---------------------------------------------------------------------------

const BLOCK_ELEMENTS = [
  "\u2588", // █ FULL BLOCK
  "\u2584", // ▄ LOWER HALF
  "\u2580", // ▀ UPPER HALF
  "\u258C", // ▌ LEFT HALF
  "\u2590", // ▐ RIGHT HALF
  "\u2591", // ░ LIGHT SHADE
  "\u2592", // ▒ MEDIUM SHADE
  "\u2593", // ▓ DARK SHADE
];

const shortcutKeys = [
  ...Object.values(UNICODE),
  ...new Set(Object.values(ASCII)),
  ...BLOCK_ELEMENTS,
  ...Array.from(Array(127 - 33).keys())
    .map((i) => i + 33)
    .map((i) => String.fromCharCode(i)),
];

function DrawPanel() {
  const [expanded, setExpanded] = useState(false);
  const freeformCharacter = useAppStore((s) => s.freeformCharacter);

  return (
    <div className={styles.drawPanel}>
      <div>
        <span className={styles.drawHint}>
          drawing with <strong style={{ color: "var(--color-orange)" }}>{freeformCharacter}</strong> {"\u2502"} press any key to change
        </span>
        {" "}
        <button
          className={styles.drawExpandBtn}
          onClick={() => setExpanded(!expanded)}
        >
          [{expanded ? "hide" : "show"} characters]
        </button>
      </div>
      {expanded && (
        <div className={styles.charPicker}>
          {shortcutKeys.map((key, i) => (
            <button
              key={i}
              className={[
                styles.charBtn,
                key === freeformCharacter ? styles.charBtnActive : "",
              ].filter(Boolean).join(" ")}
              onClick={() => {
                store.setToolMode(ToolMode.FREEFORM);
                store.setFreeformCharacter(key);
              }}
            >
              {key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Door panel — type / direction pickers + Excel (CSV) import/export
// ---------------------------------------------------------------------------

function DoorPanel() {
  const doorType = useAppStore((s) => s.doorType);
  const doorDirection = useAppStore((s) => s.doorDirection);
  // Re-render whenever a custom door definition file is loaded/cleared —
  // getDoorTypes() below reads live module state, not React state, so this
  // counter is what actually makes the menu update.
  useAppStore((s) => s.doorRegistryVersion);
  const doorTypes = getDoorTypes();
  const hasCustomDoorTypes = Object.keys(store.customDoorRegistry).length > 0;
  const [toastMessage, setToastMessage] = useState<string>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const registryFileInputRef = useRef<HTMLInputElement>(null);

  async function handleLoadRegistry(file: File) {
    const text = await file.text();
    const { registry, errors } = parseDoorRegistryFile(text);
    const loadedCodes = Object.keys(registry);
    if (loadedCodes.length > 0) {
      store.loadCustomDoorTypes(registry);
    }
    if (loadedCodes.length === 0) {
      setToastMessage(
        errors.length > 0
          ? `no door types loaded — ${errors[0]}`
          : "no door types found in file"
      );
    } else {
      setToastMessage(
        `loaded ${loadedCodes.length} door type(s): ${loadedCodes.join(", ")}` +
          (errors.length > 0 ? ` (${errors.length} rejected, see console)` : "")
      );
      if (errors.length > 0) {
        // tslint:disable-next-line: no-console
        console.warn("door registry entries rejected:", errors);
      }
    }
  }

  function handleExport() {
    const doors = scanDoors(store.currentCanvas.committed);
    if (doors.length === 0) {
      setToastMessage("no doors on the canvas to export");
      return;
    }
    exportDoorsToXlsx(doors);
    setToastMessage(`exported ${doors.length} door(s) to excel`);
  }

  async function handleImport(file: File) {
    let doors, skipped;
    try {
      ({ doors, skipped } = await importDoorsFromXlsx(file));
    } catch (e) {
      setToastMessage("could not read file as an excel workbook");
      return;
    }
    if (doors.length === 0) {
      setToastMessage("no valid door rows found in file");
      return;
    }
    // Stamp every door into one layer so the whole import is a single undo.
    const layer = new Layer();
    const counters = new Map<DoorTypeCode, number>();
    for (const row of doors) {
      let num = row.num;
      if (num === undefined) {
        num =
          counters.get(row.type) ??
          nextDoorNumber(store.currentCanvas.committed, row.type);
        counters.set(row.type, num + 1);
      }
      layer.setFrom(
        textToLayer(
          doorTemplate(row.type, row.direction, num),
          row.position.subtract(DOOR_LABEL_OFFSET)
        )
      );
    }
    store.currentCanvas.setScratchLayer(layer);
    store.currentCanvas.commitScratch();
    setToastMessage(
      `imported ${doors.length} door(s)` +
        (skipped > 0 ? `, skipped ${skipped} row(s)` : "")
    );
  }

  return (
    <div className={styles.drawPanel}>
      <div className={styles.doorRow}>
        <span className={styles.viewLabel}>type:</span>
        {doorTypes.map((type) => (
          <button
            key={type.code}
            className={[
              styles.doorBtn,
              type.code === doorType ? styles.doorBtnActive : "",
            ].filter(Boolean).join(" ")}
            title={`${type.nameZh} ${type.nameEn}`}
            onClick={() => store.setDoorType(type.code)}
          >
            {type.code} {type.nameZh}
          </button>
        ))}
        <span className={styles.sep}>{"│"}</span>
        <ActionBtn
          color="var(--color-warning)"
          title="Load new door types from a .json or .txt definition file (載入門型定義檔)"
          onClick={() => registryFileInputRef.current?.click()}
        >
          load door types
        </ActionBtn>
        {hasCustomDoorTypes && (
          <ActionBtn
            color="var(--color-danger)"
            title="Remove all custom-loaded door types, keep only the built-ins (清除自訂門型)"
            onClick={() => {
              store.resetCustomDoorTypes();
              setToastMessage("custom door types cleared");
            }}
          >
            reset custom types
          </ActionBtn>
        )}
        <input
          ref={registryFileInputRef}
          type="file"
          accept=".json,.txt"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleLoadRegistry(file);
            }
            e.target.value = "";
          }}
        />
      </div>
      <div className={styles.doorRow}>
        <span className={styles.viewLabel}>swing:</span>
        {DOOR_DIRECTIONS.map((direction) => (
          <button
            key={direction.code}
            className={[
              styles.doorBtn,
              direction.code === doorDirection ? styles.doorBtnActive : "",
            ].filter(Boolean).join(" ")}
            title={`${direction.nameZh} ${direction.nameEn}`}
            onClick={() => store.setDoorDirection(direction.code)}
          >
            {direction.code} {direction.nameZh}
          </button>
        ))}
        <span className={styles.sep}>{"│"}</span>
        <ActionBtn
          color="var(--color-success)"
          title="Export door schedule as Excel .xlsx (匯出門表)"
          onClick={handleExport}
        >
          export excel
        </ActionBtn>
        <ActionBtn
          color="var(--color-accent)"
          title="Import door schedule from Excel .xlsx or CSV (匯入門表)"
          onClick={() => fileInputRef.current?.click()}
        >
          import excel
        </ActionBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleImport(file);
            }
            e.target.value = "";
          }}
        />
      </div>
      <div className={styles.drawHint}>
        click the canvas to place a <strong>{doorType}-{doorDirection}</strong> door
        {" │ "}keys <Kbd>1</Kbd>–<Kbd>9</Kbd> change type (by position), arrow keys change swing
      </div>
      <Toast
        open={toastMessage !== null}
        message={toastMessage ?? ""}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composite door panel — box/lock/dimension settings for the "door+" stamp
// tool, which places a whole box+lock+chains+description unit per click.
// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  onChange,
  min = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className={styles.compositeDoorField}>
      <span className={styles.viewLabel}>{label}</span>
      <input
        type="number"
        className={styles.compositeDoorInput}
        value={value}
        min={min}
        onKeyDown={stopKeys}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed) && parsed >= min) {
            onChange(parsed);
          }
        }}
      />
    </label>
  );
}

function CompositeDoorPanel() {
  const settings = useAppStore((s) => s.compositeDoor);
  const canvasVersion = useAppStore((s) => s.canvasVersion);
  const nextNum = nextCompositeDoorNumber(store.currentCanvas.committed);

  return (
    <div className={styles.drawPanel}>
      <div className={styles.doorRow}>
        <NumberField
          label="box w:"
          value={settings.boxWidth}
          onChange={(boxWidth) => store.setCompositeDoor({ boxWidth })}
        />
        <NumberField
          label="box h:"
          value={settings.boxHeight}
          onChange={(boxHeight) => store.setCompositeDoor({ boxHeight })}
        />
        <span className={styles.sep}>{"│"}</span>
        <span className={styles.viewLabel}>lock:</span>
        {(["left", "right"] as const).map((side) => (
          <button
            key={side}
            className={[
              styles.doorBtn,
              settings.lockSide === side ? styles.doorBtnActive : "",
            ].filter(Boolean).join(" ")}
            onClick={() => store.setCompositeDoorLockSide(side)}
          >
            {side}
          </button>
        ))}
      </div>
      <div className={styles.doorRow}>
        <button
          className={[
            styles.doorBtn,
            settings.showDimensions ? styles.doorBtnActive : "",
          ].filter(Boolean).join(" ")}
          onClick={() => store.setCompositeDoor({ showDimensions: !settings.showDimensions })}
        >
          dimensions: {settings.showDimensions ? "on" : "off"}
        </button>
        {settings.showDimensions && (
          <>
            <NumberField
              label="height:"
              value={settings.heightValue}
              onChange={(heightValue) => store.setCompositeDoor({ heightValue })}
            />
            <NumberField
              label="width:"
              value={settings.widthValue}
              onChange={(widthValue) => store.setCompositeDoor({ widthValue })}
            />
          </>
        )}
      </div>
      <div className={styles.drawHint}>
        click the canvas to place door <strong>{compositeDoorIdLabel(nextNum)}</strong>
        {" │ "}arrow keys ← / → change which edge the lock is on
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help content (table layout with colored shortcuts and links)
// ---------------------------------------------------------------------------

function HelpContent() {
  const route = useAppStore((s) => s.route);
  const isShared = Boolean(route.shareSpec);
  const cmd = ctrlOrCmd();

  const divider = "\u2500".repeat(40);

  return (
    <div className={styles.helpContent}>
      <div className={styles.helpExplainer}>
        asciiflow is a free tool for drawing technical diagrams as text, to embed in source code, docs, and anywhere plain text is used.
      </div>
      <div className={styles.helpDivider} />
      <div className={styles.helpSection}>tools</div>
      <div className={styles.helpGrid}>
        <span style={{ color: "var(--color-cyan)" }}>box</span>
        <span>drag corner to corner</span>
        <span style={{ color: "var(--color-success)" }}>select</span>
        <span>drag to resize/move. <Kbd>{cmd}+c</Kbd>/<Kbd>{cmd}+v</Kbd> copy/paste, <Kbd>delete</Kbd> erase, <Kbd>shift</Kbd> force select</span>
        <span style={{ color: "var(--color-orange)" }}>draw</span>
        <span>freeform. press any key to change character</span>
        <span style={{ color: "var(--color-purple)" }}>arrow / line</span>
        <span>drag start to end. <Kbd>shift</Kbd> changes orientation</span>
        <span style={{ color: "var(--color-warning)" }}>text</span>
        <span>click and type. <Kbd>enter</Kbd> commit, <Kbd>shift+enter</Kbd> newline</span>
        <span style={{ color: "var(--color-danger)" }}>door</span>
        <span>click to stamp a door symbol. export/import the door schedule as excel (.xlsx), or load more door types from a .json/.txt definition file</span>
        <span style={{ color: "var(--color-brand)" }}>door+</span>
        <span>click to stamp a composite door item: box + lock + dimension chains + auto-numbered ID, as one movable unit</span>
      </div>
      <div className={styles.helpDivider} />
      <div className={styles.helpSection}>navigation</div>
      <div className={styles.helpGrid}>
        <span><Kbd>scroll</Kbd></span>
        <span>pan</span>
        <span><Kbd>shift+scroll</Kbd></span>
        <span>pan horizontally</span>
        <span><Kbd>middle-click</Kbd></span>
        <span>free pan</span>
        <span><Kbd>{cmd}+scroll</Kbd></span>
        <span>zoom</span>
        {!isShared && (
          <>
            <span><Kbd>{cmd}+z</Kbd></span>
            <span>undo</span>
            <span><Kbd>{cmd}+shift+z</Kbd></span>
            <span>redo</span>
          </>
        )}
        <span><Kbd>alt</Kbd></span>
        <span>show tool shortcuts</span>
      </div>
      <div className={styles.helpDivider} />
      <div className={styles.helpSection}>links</div>
      <div>
        <a className={styles.helpLink} href="https://github.com/lewish/asciiflow" target="_blank" rel="noopener">github</a>
        {" \u2502 "}
        <a className={styles.helpLink} href="https://github.com/lewish/asciiflow/issues/new" target="_blank" rel="noopener">file a bug</a>
        {" \u2502 "}
        <a className={styles.helpLink} href="https://asciiflow.com" target="_blank" rel="noopener">stable</a>
        {" │ "}
        <a className={styles.helpLink} href="/legacy/">legacy version</a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File panel (flat rows in second row — no dialogs)
// ---------------------------------------------------------------------------

function FilePanel() {
  const history = useHistory();
  const route = useAppStore((s) => s.route);
  const localDrawingIds = useAppStore((s) => s.localDrawingIds);
  const canvasVersion = useAppStore((s) => s.canvasVersion);

  return (
    <div className={styles.fileList}>
      {store.drawings.map((drawingId) => (
        <FileRow
          key={drawingId.toString()}
          drawingId={drawingId}
          active={route.toString() === drawingId.toString()}
        />
      ))}
      <NewDrawingRow />
    </div>
  );
}

function FileRow({
  drawingId,
  active,
}: {
  drawingId: DrawingId;
  active: boolean;
}) {
  const history = useHistory();
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  const name = drawingId.localId
    ? drawingId.localId
    : drawingId.shareSpec
    ? new DrawingStringifier().deserialize(drawingId.shareSpec).name
    : "default";
  const isShared = Boolean(drawingId.shareSpec);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  function handleRenameSubmit() {
    if (!renameRef.current) return;
    const newName = renameRef.current.value.trim();
    if (newName && newName !== name && isValidDrawingName(newName)) {
      store.renameDrawing(drawingId.localId, newName);
      history.push(DrawingId.local(newName).href);
    }
    setRenaming(false);
  }

  function handleDelete() {
    store.deleteDrawing(drawingId);
    history.push(
      store.drawings.length > 0
        ? store.drawings[0].href
        : DrawingId.local(null).href
    );
    setConfirmingDelete(false);
  }

  return (
    <div
      className={[styles.fileRow, active ? styles.fileRowActive : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {renaming ? (
        <input
          ref={renameRef}
          className={styles.fileRowRenameInput}
          defaultValue={name}
          onKeyDown={(e) => {
            stopKeys(e);
            if (e.key === "Enter") handleRenameSubmit();
            if (e.key === "Escape") setRenaming(false);
          }}
          onKeyPress={stopKeys}
          onBlur={() => setRenaming(false)}
        />
      ) : (
        <button
          className={styles.fileRowName}
          style={active ? { fontWeight: "bold" } : undefined}
          onClick={(e) => {
            history.push(drawingId.href);
            e.preventDefault();
          }}
        >
          {active ? `> ${name}` : `  ${name}`}
        </button>
      )}
      {!renaming && !confirmingDelete && (
        <div className={styles.fileRowActions}>
          {isShared ? (
            <ForkDrawingButton drawingId={drawingId} />
          ) : (
            <>
              <button className={styles.fileRowAction} onClick={() => setRenaming(true)}>rename</button>
              <ShareButton drawingId={drawingId} />
              {active && (
                <button
                  className={styles.fileRowAction}
                  style={{ color: "var(--color-warning)" }}
                  onClick={() => store.currentCanvas.clear()}
                >
                  clear
                </button>
              )}
              <button
                className={styles.fileRowAction}
                style={{ color: "var(--color-danger)" }}
                onClick={() => setConfirmingDelete(true)}
              >
                delete
              </button>
            </>
          )}
        </div>
      )}
      {confirmingDelete && (
        <span className={styles.fileRowConfirm}>
          delete?{" "}
          <button
            className={styles.fileRowAction}
            style={{ color: "var(--color-danger)" }}
            onClick={handleDelete}
          >
            yes
          </button>
          {" "}
          <button
            className={styles.fileRowAction}
            onClick={() => setConfirmingDelete(false)}
          >
            no
          </button>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File action buttons (inline in file rows)
// ---------------------------------------------------------------------------

function NewDrawingRow() {
  const history = useHistory();
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function getDefaultName() {
    let defaultName = "untitled";
    for (let i = 2; true; i++) {
      if (!isValidDrawingName(defaultName)) {
        defaultName = `untitled ${i}`;
      } else {
        break;
      }
    }
    return defaultName;
  }

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [creating]);

  function handleCreate() {
    if (!inputRef.current) return;
    const name = inputRef.current.value.trim();
    if (name && isValidDrawingName(name)) {
      store.setLocalDrawingIds([
        ...store.localDrawingIds,
        DrawingId.local(name),
      ]);
      history.push(DrawingId.local(name).href);
    }
    setCreating(false);
  }

  return (
    <div className={styles.fileRow}>
      {creating ? (
        <input
          ref={inputRef}
          className={styles.fileRowRenameInput}
          defaultValue={getDefaultName()}
          onKeyDown={(e) => {
            stopKeys(e);
            if (e.key === "Enter") handleCreate();
            if (e.key === "Escape") setCreating(false);
          }}
          onKeyPress={stopKeys}
          onBlur={() => setCreating(false)}
        />
      ) : (
        <button
          className={styles.fileRowName}
          style={{ color: "var(--color-accent)" }}
          onClick={() => setCreating(true)}
        >
          [new drawing]
        </button>
      )}
    </div>
  );
}

function ForkDrawingButton({ drawingId }: { drawingId: DrawingId }) {
  const history = useHistory();
  const drawing = new DrawingStringifier().deserialize(drawingId.shareSpec);
  const defaultName = drawing.name;
  const [name, setName] = useState(defaultName);
  const valid = isValidDrawingName(name);

  return (
    <ControlledDialog
      button={
        <button className={styles.fileRowAction}>fork</button>
      }
      title="fork drawing"
      confirmButton={
        <Button
          variant="primary"
          onClick={() => {
            store.saveDrawing(drawingId, name);
            history.push(DrawingId.local(name).href);
          }}
        >
          fork
        </Button>
      }
    >
      <p>save this shared drawing locally so it can be edited.</p>
      <TextField
        label="name"
        error={!valid}
        helperText={!valid ? "name already exists." : undefined}
        defaultValue={defaultName}
        autoFocus
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setName(e.target.value)}
      />
    </ControlledDialog>
  );
}

function ShareButton({ drawingId }: { drawingId: DrawingId }) {
  const [toastOpen, setToastOpen] = useState(false);
  return (
    <>
      <button
        className={styles.fileRowAction}
        onClick={() => {
          navigator.clipboard.writeText(
            `${window.location.protocol}//${window.location.host}${window.location.pathname}#${DrawingId.share(store.canvas(drawingId).shareSpec).href})`
          );
          setToastOpen(true);
        }}
      >
        share
      </button>
      <Toast
        open={toastOpen}
        message="copied link to clipboard"
        onClose={() => setToastOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared drawing banner
// ---------------------------------------------------------------------------

function SharedBanner({ drawingId }: { drawingId: DrawingId }) {
  return (
    <div className={styles.sharedBanner}>
      <span>shared drawing (read-only)</span>
      <ForkButton drawingId={drawingId} />
    </div>
  );
}

function ForkButton({ drawingId }: { drawingId: DrawingId }) {
  const history = useHistory();
  const drawing = new DrawingStringifier().deserialize(drawingId.shareSpec);
  const defaultName = drawing.name;
  const [name, setName] = useState(defaultName);
  const valid = isValidDrawingName(name);

  return (
    <ControlledDialog
      button={<Button variant="primary">fork & edit</Button>}
      title="fork drawing"
      confirmButton={
        <Button
          variant="primary"
          onClick={() => {
            store.saveDrawing(drawingId, name);
            history.push(DrawingId.local(name).href);
          }}
        >
          fork
        </Button>
      }
    >
      <p>save this shared drawing locally so it can be edited.</p>
      <TextField
        label="name"
        error={!valid}
        helperText={!valid ? "name already exists." : undefined}
        defaultValue={defaultName}
        autoFocus
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setName(e.target.value)}
      />
    </ControlledDialog>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ctrlOrCmd() {
  if (navigator.platform.toLowerCase().startsWith("mac")) {
    return "cmd";
  }
  return "ctrl";
}

function isValidDrawingName(name: string) {
  return !store.localDrawingIds.some(
    (drawingId) =>
      DrawingId.local(name).toString() === drawingId.toString()
  );
}
