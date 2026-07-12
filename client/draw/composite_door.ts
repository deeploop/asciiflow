import { KEY_LEFT, KEY_RIGHT } from "#asciiflow/client/constants";
import {
  CompositeDoorSpec,
  compositeDoorIdLabel,
  generateCompositeDoor,
  nextCompositeDoorNumber,
} from "#asciiflow/client/composite_door";
import { AbstractDrawFunction } from "#asciiflow/client/draw/function";
import { store } from "#asciiflow/client/store";
import { textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";

/**
 * Stamp tool for composite door items: click to place a box + lock +
 * (optional) dimension chain + auto-numbered ID label, using the current
 * settings from the composite-door panel. Same interaction pattern as
 * DrawDoor, one level up in what gets stamped per click.
 */
export class DrawCompositeDoor extends AbstractDrawFunction {
  start(position: Vector) {
    this.preview(position);
  }

  move(position: Vector) {
    this.preview(position);
  }

  end() {
    store.currentCanvas.commitScratch();
  }

  private preview(position: Vector) {
    const num = nextCompositeDoorNumber(store.currentCanvas.committed);
    const settings = store.compositeDoor;
    const spec: CompositeDoorSpec = {
      boxWidth: settings.boxWidth,
      boxHeight: settings.boxHeight,
      lock: { side: settings.lockSide },
      description: [`[ID: ${compositeDoorIdLabel(num)}]`],
      ...(settings.showDimensions
        ? {
            heightChain: { values: [settings.heightValue] },
            widthChain: { parts: [settings.widthValue], result: settings.widthValue },
          }
        : {}),
    };
    const template = generateCompositeDoor(spec);
    const lines = template.split("\n");
    const width = Math.max(...lines.map((l) => l.length));
    // Center the stamp on the cursor.
    const origin = new Vector(
      position.x - Math.floor(width / 2),
      position.y - Math.floor(lines.length / 2)
    );
    store.currentCanvas.setScratchLayer(textToLayer(template, origin));
  }

  handleKey(value: string) {
    // Left/right arrows toggle which edge the lock sits on.
    if (value === KEY_LEFT) {
      store.setCompositeDoorLockSide("left");
    } else if (value === KEY_RIGHT) {
      store.setCompositeDoorLockSide("right");
    }
  }

  getCursor() {
    return "copy";
  }

  cleanup() {
    store.currentCanvas.clearScratch();
  }
}
