/**
 * Specular bounce: the lights the glass mirrors (light catalogue 3.4,
 * "image-source lights"; the last open row of item 32).
 *
 * A pane's polished front face is a weak mirror. Everything in front of it
 * -- a balloon in the room, a spider's web -- is lit not only by a lamp but
 * also by that lamp's reflection in the glass: as if a second, fainter lamp
 * stood behind the glass, at the lamp's mirror image in the face's plane
 * (the image-source method; Allen & Berkley 1979 for sound, the same
 * geometry for light). It shines only through the pane: a point is lit by
 * the image only where the line from the image to it crosses the face
 * inside the pane, which is where the real light would have bounced.
 *
 * How bright: the face's reflectance. Uncoated glass, n = 1.52, reflects
 * ((n - 1) / (n + 1))^2 = 4.3% straight on (Fresnel), rising toward grazing
 * (Schlick's approximation, here evaluated at the reflection point under
 * the receiver). The frosted back face scatters and mirrors nothing
 * coherent, so only the front counts.
 */
import type { Light } from "./lights";

/** Glass's index against air, and its reflectance straight on. */
export const GLASS_N = 1.52;
export const R0 = ((GLASS_N - 1) / (GLASS_N + 1)) ** 2;

/** Fresnel reflectance at incidence cos(theta), Schlick's approximation. */
export function reflectance(cosI: number): number {
  const c = Math.min(1, Math.max(0, cosI));
  return R0 + (1 - R0) * (1 - c) ** 5;
}

/** A mirror: a pane's front face, page px, at `z` above the photographs. */
export type Mirror = { x: number; y: number; w: number; h: number; z: number };

/** A light's image in a mirror: where it stands (below the face) and the mirror it shines through. */
export type ImageLight = { source: Light; x: number; y: number; z: number; via: Mirror };

/** The lights' images in each pane's face; lights below the glass, or below a face, have none. */
export function imageLights(lights: readonly Light[], mirrors: readonly Mirror[]): ImageLight[] {
  const out: ImageLight[] = [];
  for (const l of lights) {
    if (l.below || l.charge <= 0) continue;
    for (const m of mirrors) {
      if (l.height <= m.z) continue;
      out.push({ source: l, x: l.x, y: l.y, z: 2 * m.z - l.height, via: m });
    }
  }
  return out;
}

/**
 * How much of the image's light reaches a point (x, y, z) in front of the
 * glass: the face's reflectance where the ray from the image to the point
 * crosses it, or 0 if it crosses outside the pane (or the point is not in
 * front of the face).
 */
export function imageReach(im: ImageLight, x: number, y: number, z: number): number {
  const { via } = im;
  if (z <= via.z) return 0;
  const s = (via.z - im.z) / (z - im.z);
  const hx = im.x + (x - im.x) * s;
  const hy = im.y + (y - im.y) * s;
  if (hx < via.x || hx > via.x + via.w || hy < via.y || hy > via.y + via.h) return 0;
  const dx = x - im.x;
  const dy = y - im.y;
  const dz = z - im.z;
  const cosI = dz / Math.hypot(dx, dy, dz);
  return reflectance(cosI);
}
