/**
 * The room's light, turned down by something held (the torch: a flame only
 * reads as a light in the dark, flame.md 6.2). The floor takes the lower of
 * this and the lab's "Room fill" (FloorLight). 1 leaves the room as it is.
 */
let override = 1;

export function roomFillOverride(): number {
  return override;
}

export function setRoomFillOverride(v: number) {
  override = Math.max(0, Math.min(1, v));
}
