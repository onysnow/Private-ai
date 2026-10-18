/**
 * The room the glass reflects: an HDR environment, and how a flat pane shows it.
 *
 * WHY THIS FILE EXISTS
 *
 * The room reflection was a CSS layer: a graded JPEG of a room, screen-blended
 * over each pane at a set opacity ("Reflection, at rest" / "lit"), zoomed and
 * parallaxed by settings of its own, and switched off entirely under liquid
 * glass. Measured on the page it changed the image by 1-2%, so it could not be
 * seen -- and it could not be made visible and stay physical, because the
 * graded JPEGs had every lamp clipped to white: glass reflects ~4%, and 4% of
 * white is nothing.
 *
 * Now the reflection is worked out from causes in the glass shader, in both
 * glass modes:
 *
 *   what      the room, in real (scene-linear) brightness, lamps included --
 *             log-encoded so that survives an 8-bit JPEG (see ROOM_LMAX)
 *   how much  the glass's reflectance: 4.2% face-on for float glass, rising
 *             toward grazing (the material's index, via Fresnel)
 *   how sharp the front face's roughness. The frosted-float preset is frosted
 *             on the BACK face and polished on the front, as satin glass is,
 *             so its reflection is sharp while what is seen through it is not
 *   where     the reflected ray. The camera looks at the page from
 *             CAMERA_DISTANCE; a point on the pane reflects the direction
 *             (x, y, D) back into the room behind the viewer, so a pane shows
 *             a different part of the room as it scrolls past, and a pane
 *             above eye level shows more ceiling. Mirrored, as mirrors are.
 *
 * Every function here has a GLSL twin in environment.glsl.ts.
 */

/** The brightest radiance the room encoding keeps. 4% of 64 is 2.7x white. */
export const ROOM_LMAX = 64;

/** Log-encode scene-linear radiance into [0, 1]. */
export function encodeRadiance(l: number): number {
  return Math.log2(1 + Math.min(Math.max(l, 0), ROOM_LMAX)) / Math.log2(1 + ROOM_LMAX);
}

/**
 * Preview "dimroom": where the room's brightest lights are compressed, in
 * multiples of its middle grey. A lit aquarium tank or a studio softbox is
 * encoded up to ROOM_LMAX, and even the 4% the front of the glass reflects
 * of that clips to a solid white slab. radiance / (1 + radiance / knee)
 * leaves the room's ordinary light alone and rolls its lamps and windows
 * off toward the knee.
 */
export const ROOM_KNEE = 2;

/** The same compression on one value; knee 0 leaves it untouched. */
export function kneeRadiance(v: number, knee: number): number {
  return knee > 0 ? v / (1 + v / knee) : v;
}

/** Decode it again. */
export function decodeRadiance(v: number): number {
  return Math.pow(2, v * Math.log2(1 + ROOM_LMAX)) - 1;
}

/**
 * How far the viewer's eye is from the screen, in multiples of the viewport
 * width. A camera cause, set once: about arm's length from a laptop screen.
 */
export const CAMERA_DISTANCE = 1.2;

/**
 * The part of the room's height the image holds: rows 0.215-0.755 of the
 * equirectangular original, i.e. from 51.3 degrees above eye level to 45.9
 * below (the horizon is row 0.5).
 */
export const ROOM_TOP = 0.215;
export const ROOM_BOTTOM = 0.755;

/**
 * Where in the room image a point on a flat pane reflects, seen straight on.
 *
 * `x`, `y`: the point, relative to the centre of the viewport, CSS pixels,
 * y down. `distance`: the camera's distance, same units. Returns (u, v) into
 * the room image, u wrapping round the full 360 degrees with 0.5 straight
 * behind the viewer.
 */
export function roomUv(x: number, y: number, distance: number): [number, number] {
  return roomUvDir(x, y, distance);
}

/**
 * Where a reflected DIRECTION lands in the room image: x right, y down, z
 * toward the viewer (back into the room behind them). A flat face reflects
 * the ray to point (x, y) as (x, y, distance), which is roomUv; the eased
 * corner of a pane turns its normal away from the face, so it reflects
 * directions the face never does -- the ceiling, for a top edge.
 */
export function roomUvDir(rx: number, ry: number, rz: number): [number, number] {
  const yaw = Math.atan2(rx, rz);
  const pitch = Math.atan2(-ry, Math.hypot(rx, rz));
  // Mirrored: a point to the viewer's right reflects what is behind them on
  // their right, which is on the LEFT of a room photographed facing it.
  const u = 0.5 - yaw / (2 * Math.PI);
  const row = 0.5 - pitch / Math.PI;
  const v = (row - ROOM_TOP) / (ROOM_BOTTOM - ROOM_TOP);
  return [u, v];
}

/**
 * Mip levels of the room, box-filtered in LINEAR light and then re-encoded.
 *
 * The browser's own mipmaps would average the log-encoded values, which
 * averages the wrong quantity: a lamp blurred over many texels would come out
 * far dimmer than the same light spread out really is. Filtering after
 * decoding keeps its energy, which is what makes a rough reflection a soft
 * glow rather than nothing.
 *
 * `rgb` is width x height x 3 encoded bytes. Returns every level down to 1x1.
 */
export function roomMipChain(
  rgb: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): { width: number; height: number; data: Uint8Array }[] {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = decodeRadiance(i / 255);
  let w = width;
  let h = height;
  let lin = new Float32Array(w * h * 3);
  for (let i = 0; i < lin.length; i++) lin[i] = lut[rgb[i]!]!;
  const levels = [{ width: w, height: h, data: Uint8Array.from(rgb) }];
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const next = new Float32Array(nw * nh * 3);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let n = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const sx = Math.min(w - 1, x * 2 + dx);
              const sy = Math.min(h - 1, y * 2 + dy);
              sum += lin[(sy * w + sx) * 3 + c]!;
              n += 1;
            }
          }
          next[(y * nw + x) * 3 + c] = sum / n;
        }
      }
    }
    const data = new Uint8Array(nw * nh * 3);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(encodeRadiance(next[i]!) * 255);
    levels.push({ width: nw, height: nh, data });
    lin = next;
    w = nw;
    h = nh;
  }
  return levels;
}

/**
 * Which mip level a reflection of this roughness samples: the blur the
 * surface puts on the reflected direction (about alpha radians), in texels
 * of a room image `width` texels round.
 */
export function roomLod(alpha: number, width: number): number {
  const texels = (alpha * width) / (2 * Math.PI);
  return Math.log2(Math.max(texels, 1));
}
