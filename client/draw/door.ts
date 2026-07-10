import {
  KEY_DOWN,
  KEY_LEFT,
  KEY_RIGHT,
  KEY_UP,
} from "#asciiflow/client/constants";
import {
  DoorDirectionCode,
  DOOR_TYPES,
  doorTemplate,
  nextDoorNumber,
} from "#asciiflow/client/doors";
import { AbstractDrawFunction } from "#asciiflow/client/draw/function";
import { store } from "#asciiflow/client/store";
import { textToLayer } from "#asciiflow/client/text_utils";
import { Vector } from "#asciiflow/client/vector";

/**
 * Stamp tool for door symbols: click (or drag to position) to place the
 * currently selected door type/direction, numbered automatically.
 */
export class DrawDoor extends AbstractDrawFunction {
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
    const num = nextDoorNumber(store.currentCanvas.committed, store.doorType);
    const template = doorTemplate(store.doorType, store.doorDirection, num);
    const lines = template.split("\n");
    // Center the stamp on the cursor.
    const origin = new Vector(
      position.x - Math.floor(lines[1].length / 2),
      position.y - Math.floor(lines.length / 2)
    );
    store.currentCanvas.setScratchLayer(textToLayer(template, origin));
  }

  handleKey(value: string) {
    // 1-6 selects the door type.
    const typeIndex = parseInt(value, 10) - 1;
    if (typeIndex >= 0 && typeIndex < DOOR_TYPES.length) {
      store.setDoorType(DOOR_TYPES[typeIndex].code);
    }
    // Arrows adjust the opening direction: ←/→ left/right, ↑/↓ outward/inward.
    const direction = store.doorDirection;
    if (value === KEY_LEFT) {
      store.setDoorDirection((direction[0] + "L") as DoorDirectionCode);
    } else if (value === KEY_RIGHT) {
      store.setDoorDirection((direction[0] + "R") as DoorDirectionCode);
    } else if (value === KEY_UP) {
      store.setDoorDirection(("O" + direction[1]) as DoorDirectionCode);
    } else if (value === KEY_DOWN) {
      store.setDoorDirection(("I" + direction[1]) as DoorDirectionCode);
    }
  }

  getCursor() {
    return "copy";
  }

  cleanup() {
    store.currentCanvas.clearScratch();
  }
}
