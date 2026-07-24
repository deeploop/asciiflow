/**
 * Generator for arbitrary trees of nested "frames" (boxes) — the general
 * form of composite_door.ts's single box+lock+label, extended to any number
 * of child frames at any offset, recursively.
 *
 * ASCIIFlow has no real object hierarchy: this module's "tree" only exists
 * in the FrameTreeNode spec you build or load. generateFrameTree() walks it
 * and flattens every frame into one TextGrid — the canvas only ever sees
 * plain characters, same as every other generator in this project.
 *
 * The two constraints verified for composite_door.ts's single box apply
 * per-frame here, not once for the whole tree:
 *  - A lock must sit one cell *inside* its own frame's border (never on it,
 *    never outside it) — see composite_door.ts's docstring for why.
 *  - "Click inside a box to move the whole thing" (draw/entity.ts's
 *    findBox/cellsInBox) only ever grabs one frame's own rectangle. Moving
 *    an entire tree still requires a rubber-band selection over all of it —
 *    nesting frames doesn't create a single clickable unit.
 */

import { displayWidth, TextGrid } from "#asciiflow/client/text_grid";

export interface FrameLock {
  side: "left" | "right";
  char?: string;
  /** 0 (top of the frame) to 1 (bottom). Default 0.5 (middle). */
  rowRatio?: number;
}

export interface FrameBox {
  /** Interior width, in cells (excludes the two border columns). */
  width: number;
  /** Interior height, in rows (excludes the two border rows). */
  height: number;
  /** Lines of text centered inside the frame. */
  label?: string[];
  lock?: FrameLock;
}

export interface FrameChild {
  offset: { x: number; y: number };
  node: FrameTreeNode;
}

export interface FrameTreeNode {
  /** Used only in warning/error messages, to identify which node a problem is in. */
  id?: string;
  /** Omit for a pure "group" node — no box of its own, just positions its children. */
  frame?: FrameBox;
  children?: FrameChild[];
}

const DEFAULT_LOCK_CHAR = "O";
const DEFAULT_LOCK_ROW_RATIO = 0.5;

function lockInteriorRow(box: FrameBox): number | null {
  if (!box.lock) {
    return null;
  }
  const ratio = box.lock.rowRatio ?? DEFAULT_LOCK_ROW_RATIO;
  return Math.min(box.height - 1, Math.max(0, Math.round(ratio * (box.height - 1))));
}

/**
 * A leaf frame centers its label vertically, like composite_door.ts's single
 * box. A frame with children instead anchors its own label to the top row —
 * children typically fill the interior below a header, and centering would
 * make the label collide with whatever the children render there (verified:
 * a 9-row outer frame with 6-row children starting at y=2 centers the parent
 * label on row 5, which children painted over entirely).
 */
function labelInteriorStart(box: FrameBox, hasChildren: boolean): number {
  const lines = box.label?.length ?? 0;
  if (hasChildren) {
    return 0;
  }
  return Math.max(0, Math.floor((box.height - lines) / 2));
}

function renderFrameBox(grid: TextGrid, box: FrameBox, left: number, top: number, hasChildren: boolean) {
  const right = left + box.width + 1;
  const bottom = top + box.height + 1;

  grid.write(top, left, "┌" + "─".repeat(box.width) + "┐");
  for (let r = 1; r <= box.height; r++) {
    grid.write(top + r, left, "│" + " ".repeat(box.width) + "│");
  }
  grid.write(bottom, left, "└" + "─".repeat(box.width) + "┘");

  const label = box.label ?? [];
  const labelStartRow = top + 1 + labelInteriorStart(box, hasChildren);
  label.forEach((line, i) => {
    const row = labelStartRow + i;
    if (row > top && row < bottom) {
      grid.writeCentered(row, left + 1, right, line);
    }
  });

  const lockRow = lockInteriorRow(box);
  if (box.lock && lockRow !== null) {
    // One cell inside the border — see the module docstring.
    const lockCol = box.lock.side === "left" ? left + 1 : right - 1;
    grid.setChar(top + 1 + lockRow, lockCol, box.lock.char ?? DEFAULT_LOCK_CHAR);
  }
}

function renderNode(grid: TextGrid, node: FrameTreeNode, originX: number, originY: number) {
  if (node.frame) {
    renderFrameBox(grid, node.frame, originX, originY, (node.children?.length ?? 0) > 0);
  }
  for (const child of node.children ?? []) {
    renderNode(grid, child.node, originX + child.offset.x, originY + child.offset.y);
  }
}

/** Renders a frame tree as pasteable ASCII text — one flattened block. */
export function generateFrameTree(root: FrameTreeNode): string {
  const grid = new TextGrid();
  renderNode(grid, root, 0, 0);
  return grid.toString();
}

// ---------------------------------------------------------------------------
// Overflow / collision validation
// ---------------------------------------------------------------------------

function nodePath(id: string | undefined, index: number): string {
  return id ?? `#${index}`;
}

function checkFrameContent(box: FrameBox, path: string, hasChildren: boolean, warnings: string[]) {
  const label = box.label ?? [];
  label.forEach((line, i) => {
    if (displayWidth(line) > box.width) {
      warnings.push(
        `${path}: label[${i}] "${line}" is ${displayWidth(line)} cells wide, wider than width (${box.width})`
      );
    }
  });
  if (label.length > box.height) {
    warnings.push(`${path}: ${label.length} label line(s) don't fit in height (${box.height})`);
  }
  const lockRow = lockInteriorRow(box);
  if (lockRow !== null && label.length > 0) {
    const start = labelInteriorStart(box, hasChildren);
    const end = start + label.length;
    if (lockRow >= start && lockRow < end) {
      warnings.push(
        `${path}: lock sits on interior row ${lockRow}, inside the label's row range [${start}, ${end})`
      );
    }
  }
}

/** All (x,y) cells a frame's border+interior occupies, relative to the tree root. */
function frameCells(box: FrameBox, left: number, top: number): string[] {
  const cells: string[] = [];
  for (let y = 0; y <= box.height + 1; y++) {
    for (let x = 0; x <= box.width + 1; x++) {
      cells.push(`${left + x},${top + y}`);
    }
  }
  return cells;
}

/** Just the perimeter cells of a frame — border characters only, no interior. */
function frameBorderCells(box: FrameBox, left: number, top: number): string[] {
  const cells: string[] = [];
  const right = box.width + 1;
  const bottom = box.height + 1;
  for (let x = 0; x <= right; x++) {
    cells.push(`${left + x},${top}`);
    cells.push(`${left + x},${top + bottom}`);
  }
  for (let y = 1; y < bottom; y++) {
    cells.push(`${left},${top + y}`);
    cells.push(`${left + right},${top + y}`);
  }
  return cells;
}

/** True if `ancestorPath` is `descendantPath` or one of its ancestors. */
function isAncestorOrSelf(ancestorPath: string, descendantPath: string): boolean {
  return descendantPath === ancestorPath || descendantPath.startsWith(`${ancestorPath} > `);
}

/**
 * Reports per-frame content overflow (label too wide/tall, lock/label
 * collision — same checks as composite_door.ts's checkCompositeDoorOverflow,
 * minus dimension chains) plus two kinds of geometry problems across frames:
 *
 * 1. Overlaps between frames that *shouldn't* overlap: a child nesting
 *    inside its own parent's rectangle is normal (the entire point of a
 *    tree) and is not flagged. Two frames that are siblings, cousins, or
 *    otherwise unrelated in the tree sharing cells almost always means a
 *    child's `offset` is wrong.
 *
 * 2. A child frame's border sitting flush against its own ancestor's border
 *    (verified in a real browser: when a child is placed at offset x:0
 *    against a parent whose own left border is at the same column, the
 *    two borders render as the exact same grid cell — generateFrameTree()
 *    can only draw one character there. findBox()/cellsInBox() then
 *    attribute that cell to the child's rectangle, so click-dragging the
 *    child tears it out of the parent's border too, leaving a gap. This is
 *    silent in the spec and in the rendered text — it only shows up once
 *    you try to move the child — so it's checked for here instead. Fix by
 *    insetting the child at least 1 cell from any ancestor border it would
 *    otherwise touch.
 */
export function checkFrameTreeOverflow(root: FrameTreeNode): string[] {
  const warnings: string[] = [];
  const occupied = new Map<string, string[]>();
  const borders = new Map<string, string[]>();

  function walk(node: FrameTreeNode, path: string, x: number, y: number) {
    if (node.frame) {
      checkFrameContent(node.frame, path, (node.children?.length ?? 0) > 0, warnings);
      occupied.set(path, frameCells(node.frame, x, y));
      borders.set(path, frameBorderCells(node.frame, x, y));
    }
    (node.children ?? []).forEach((child, i) => {
      walk(child.node, `${path} > ${nodePath(child.node.id, i)}`, x + child.offset.x, y + child.offset.y);
    });
  }
  walk(root, nodePath(root.id, 0), 0, 0);

  const entries = [...occupied.entries()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [pathA, cellsA] = entries[i];
      const [pathB, cellsB] = entries[j];
      if (!isAncestorOrSelf(pathA, pathB) && !isAncestorOrSelf(pathB, pathA)) {
        const setB = new Set(cellsB);
        if (cellsA.some((c) => setB.has(c))) {
          warnings.push(`frames "${pathA}" and "${pathB}" overlap`);
        }
        continue;
      }
      // One is an ancestor of the other: interior overlap is expected, but
      // their borders coinciding is not — check that separately, in both
      // directions, since either could be the ancestor.
      const [ancestorPath, descendantPath] = isAncestorOrSelf(pathA, pathB) ? [pathA, pathB] : [pathB, pathA];
      if (ancestorPath === descendantPath) {
        continue;
      }
      const ancestorBorder = new Set(borders.get(ancestorPath));
      const descendantBorder = borders.get(descendantPath) ?? [];
      const touching = descendantBorder.filter((c) => ancestorBorder.has(c));
      if (touching.length > 0) {
        warnings.push(
          `"${descendantPath}"'s border touches its ancestor "${ancestorPath}"'s border at (${touching[0]}) — ` +
            `dragging "${descendantPath}" will tear that cell out of "${ancestorPath}"'s border; ` +
            `inset it by at least 1 cell`
        );
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Template file loading (JSON only — a tree doesn't fit the flat
// "=== DOOR: CODE ===" text-block format the simple door registry uses)
// ---------------------------------------------------------------------------

export interface FrameTreeParseResult {
  tree: FrameTreeNode | null;
  errors: string[];
}

function parseFrameLock(raw: unknown, path: string): { lock: FrameLock | null; errors: string[] } {
  if (raw === undefined) {
    return { lock: null, errors: [] };
  }
  if (typeof raw !== "object" || raw === null) {
    return { lock: null, errors: [`${path}.lock must be an object`] };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.side !== "left" && obj.side !== "right") {
    return { lock: null, errors: [`${path}.lock.side must be "left" or "right"`] };
  }
  return {
    lock: {
      side: obj.side,
      char: typeof obj.char === "string" ? obj.char : undefined,
      rowRatio: typeof obj.rowRatio === "number" ? obj.rowRatio : undefined,
    },
    errors: [],
  };
}

function parseFrameBox(raw: unknown, path: string): { box: FrameBox | null; errors: string[] } {
  if (raw === undefined) {
    return { box: null, errors: [] };
  }
  if (typeof raw !== "object" || raw === null) {
    return { box: null, errors: [`${path}.frame must be an object`] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.width !== "number" || obj.width < 1) {
    errors.push(`${path}.frame.width must be a positive number`);
  }
  if (typeof obj.height !== "number" || obj.height < 1) {
    errors.push(`${path}.frame.height must be a positive number`);
  }

  let label: string[] | undefined;
  if (obj.label !== undefined) {
    if (!Array.isArray(obj.label) || !obj.label.every((l) => typeof l === "string")) {
      errors.push(`${path}.frame.label must be an array of strings`);
    } else {
      label = obj.label as string[];
    }
  }

  const { lock, errors: lockErrors } = parseFrameLock(obj.lock, path);
  errors.push(...lockErrors);

  if (errors.length > 0) {
    return { box: null, errors };
  }
  return {
    box: { width: obj.width as number, height: obj.height as number, label, lock: lock ?? undefined },
    errors: [],
  };
}

function parseFrameNode(raw: unknown, path: string): { node: FrameTreeNode | null; errors: string[] } {
  if (typeof raw !== "object" || raw === null) {
    return { node: null, errors: [`${path} must be an object`] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  const id = typeof obj.id === "string" ? obj.id : undefined;

  const { box, errors: frameErrors } = parseFrameBox(obj.frame, path);
  errors.push(...frameErrors);

  const children: FrameChild[] = [];
  if (obj.children !== undefined) {
    if (!Array.isArray(obj.children)) {
      errors.push(`${path}.children must be an array`);
    } else {
      obj.children.forEach((rawChild, i) => {
        const childPath = `${path}.children[${i}]`;
        if (typeof rawChild !== "object" || rawChild === null) {
          errors.push(`${childPath} must be an object`);
          return;
        }
        const childObj = rawChild as Record<string, unknown>;
        const offset = childObj.offset as Record<string, unknown> | undefined;
        if (
          typeof offset !== "object" ||
          offset === null ||
          typeof offset.x !== "number" ||
          typeof offset.y !== "number"
        ) {
          errors.push(`${childPath}.offset must be {x: number, y: number}`);
          return;
        }
        const { node: childNode, errors: childErrors } = parseFrameNode(
          childObj.node,
          `${childPath}.node`
        );
        errors.push(...childErrors);
        if (childNode) {
          children.push({
            offset: { x: offset.x as number, y: offset.y as number },
            node: childNode,
          });
        }
      });
    }
  }

  if (errors.length > 0) {
    return { node: null, errors };
  }
  return {
    node: { id, frame: box ?? undefined, children: children.length > 0 ? children : undefined },
    errors: [],
  };
}

/**
 * Parses a frame-tree template file. JSON only. Unlike the simple door
 * registry's parser (where one bad entry is skipped and the rest still
 * load), a tree is one interdependent structure — a malformed node makes
 * the whole tree unusable, so this returns either a fully valid tree or no
 * tree at all, with every problem found listed in `errors`.
 */
export function parseFrameTreeFile(text: string): FrameTreeParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { tree: null, errors: [`JSON parse error: ${(e as Error).message}`] };
  }
  const { node, errors } = parseFrameNode(raw, "root");
  return { tree: errors.length === 0 ? node : null, errors };
}
