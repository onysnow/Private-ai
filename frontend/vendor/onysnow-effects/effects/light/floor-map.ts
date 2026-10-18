/**
 * The floor light's own output, for the passes that look through it (rain
 * W2, docs/rain-system.md 3.2: "read back so drops glow").
 *
 * Each frame the lamp burns, FloorLight draws the lamps' light on the
 * photographs, with the glass's shadows, caustics and the drops' lenses,
 * into the shared buffer and copies it into this texture before the buffer
 * is cut up for the layers. The water pass samples it where each drop's
 * lens lands, so what shows through a drop is the print exactly as the
 * floor light lit it, and not a second model of the lamp. The texture holds
 * the floor's colour over its alpha (light / a, a), as the floor writes it:
 * the lit print is photo * (1 - a) + colour * a.
 */

export type FloorMap = {
  texture: WebGLTexture;
  /** The viewport the map covers, CSS px. */
  width: number;
  height: number;
  /** Set when the floor last drew it. */
  frame: number;
};

let current: FloorMap | null = null;

export function publishFloorMap(map: FloorMap | null): void {
  current = map;
}

export function floorMap(): FloorMap | null {
  return current;
}
