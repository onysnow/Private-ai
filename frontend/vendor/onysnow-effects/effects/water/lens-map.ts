/**
 * The light the drops throw onto the print (rain W2, docs/rain-system.md 3.2).
 *
 * The water pass draws, for every drop and the lamp, the pattern that drop's
 * lens makes on the print a gap behind the glass: the near-black shadow of a
 * bead's footprint, the bright core of a flat drop near its focus (the
 * lookup table tools/water/drop_lens_lut.py traces). It draws them into one
 * viewport-sized map, E against the plain pane (R + 8 G, 1 where no drop
 * lies), and the floor light multiplies the lamp's light by it. This is the
 * handshake between the two passes: the water publishes the map here, the
 * floor reads it. Nothing else holds a reference.
 */

export type LensMap = {
  /** The map, RGBA8: E = r + 8 g. */
  texture: WebGLTexture;
  /** The viewport in CSS px the map covers (page scroll at the time it was drawn). */
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  /** Which light the map was drawn for (the floor applies it to that light only). */
  lightId: string;
  /** Set when the water last drew it, for the floor to know it is fresh. */
  frame: number;
};

let current: LensMap | null = null;

export function publishLensMap(map: LensMap | null): void {
  current = map;
}

export function lensMap(): LensMap | null {
  return current;
}
