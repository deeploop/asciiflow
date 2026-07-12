/**
 * Tracks composite-door items placed in the current session so that
 * resizing one (dragging its box border, the plain ASCIIFlow line-drag
 * behavior in draw/select.ts) can regenerate its dimension chains, label,
 * and lock at the new size — instead of leaving them stranded at their old
 * position while only the border stretches.
 *
 * This is a deliberate, narrow exception to "ASCIIFlow has no object
 * model" (the design this whole door module otherwise leans on): the
 * canvas still has no idea what a composite door *is* — this registry is
 * purely an in-memory session aid, keyed to a stable anchor point that a
 * border-only resize never touches (see anchorFor()). It is best-effort:
 * any edit that removes or overlaps that anchor cell (move via a different
 * path, undo, manual editing, page reload) silently drops the instance
 * from tracking, and the box just behaves like a plain ASCIIFlow box again
 * — never a crash, never stale data driving a wrong redraw.
 */

import { Box } from "#asciiflow/client/common";
import {
  CompositeDoorSpec,
  compositeDoorBoxOrigin,
  generateCompositeDoor,
} from "#asciiflow/client/composite_door";
import { findBox } from "#asciiflow/client/draw/entity";
import { Layer } from "#asciiflow/client/layer";
import { store } from "#asciiflow/client/store";
import { textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";

export interface CompositeDoorInstance {
  spec: CompositeDoorSpec;
  /** Absolute position of the generated block's own (0, 0) on the canvas. */
  origin: Vector;
}

let instances: CompositeDoorInstance[] = [];

/**
 * The box's own interior top-left cell, in absolute canvas coordinates —
 * always inside the box both before and after a single-edge border resize
 * (that drag only moves the grabbed border line itself; it never touches
 * interior content), so it's a stable anchor to re-find the instance by.
 */
export function anchorFor(instance: CompositeDoorInstance): Vector {
  const boxOrigin = compositeDoorBoxOrigin(instance.spec);
  return instance.origin.add(new Vector(boxOrigin.left + 1, boxOrigin.top + 1));
}

export function registerCompositeDoorInstance(spec: CompositeDoorSpec, origin: Vector) {
  instances.push({ spec, origin });
}

/** The tracked instance whose anchor cell falls inside the given box, if any. */
export function findInstanceInBox(box: Box): CompositeDoorInstance | null {
  return instances.find((inst) => box.contains(anchorFor(inst))) ?? null;
}

export function replaceInstance(previous: CompositeDoorInstance, next: CompositeDoorInstance) {
  const i = instances.indexOf(previous);
  if (i >= 0) {
    instances[i] = next;
  }
}

/** Test/debug hook — clears all tracked instances. */
export function clearCompositeDoorInstances() {
  instances = [];
}

/**
 * Called after a border-drag resize completes on a tracked instance's box.
 * Finds the box's new bounds from its still-valid anchor cell, regenerates
 * the whole item (box + lock + chains + label) at that size from the
 * ORIGINAL spec's content — only boxWidth/boxHeight change; the dimension
 * chain values, lock side, and description are exactly what they were
 * before the resize, just recentred and repositioned for the new box size,
 * the same recomputation generateCompositeDoor() already does for any
 * spec (verified in composite_door.spec.ts's "scales cleanly to a much
 * larger box" case).
 *
 * Does nothing (leaves the plain resize as ASCIIFlow's built-in behavior
 * already left it) if the anchor no longer resolves to an intact box, or
 * the resize shrank the box below 1x1 interior — resizing a box the
 * generator can't render is not this function's problem to solve.
 */
export function regenerateAfterResize(instance: CompositeDoorInstance) {
  const committed = store.currentCanvas.committed;
  const anchor = anchorFor(instance);
  const newBox = findBox(committed, anchor);
  if (!newBox) {
    return;
  }
  const newBoxWidth = newBox.right() - newBox.left() - 1;
  const newBoxHeight = newBox.bottom() - newBox.top() - 1;
  if (newBoxWidth < 1 || newBoxHeight < 1) {
    return;
  }

  const newSpec: CompositeDoorSpec = {
    ...instance.spec,
    boxWidth: newBoxWidth,
    boxHeight: newBoxHeight,
  };
  const newBoxOrigin = compositeDoorBoxOrigin(newSpec);
  const newOrigin = newBox.topLeft().subtract(new Vector(newBoxOrigin.left, newBoxOrigin.top));

  // Erase the old block's full footprint, then draw the freshly-generated
  // one — combined into a single scratch layer so the whole regeneration
  // is one undo step, not two.
  const combined = new Layer();
  for (const [key] of textToLayer(generateCompositeDoor(instance.spec), instance.origin).entries()) {
    combined.set(key, "");
  }
  combined.setFrom(textToLayer(generateCompositeDoor(newSpec), newOrigin));

  store.currentCanvas.setScratchLayer(combined);
  store.currentCanvas.commitScratch();

  replaceInstance(instance, { spec: newSpec, origin: newOrigin });
}
