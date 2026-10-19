/**
 * Light that bounces off a lit photograph back up into the glass above it
 * (light engine step F, claude/light-physics-reference.md Part 2, "bounce
 * patch"; ?try=bounce).
 *
 * A lamp above the page lights a pool on the photograph. The print is a
 * matte surface: it sends back a share of that light -- its reflectance, the
 * photograph's own colour there -- in every direction, up into the
 * underside of the pane that hangs a gap above it. The pane's back face is
 * frosted (satin-etched), so light arriving from below is scattered, and
 * some of it comes out of the front toward you: the glass over a lit
 * photograph glows faintly in the photograph's colour, as a lampshade over a
 * coloured table does.
 *
 * The pool is a disc under the light, as wide as the light is high (where
 * its irradiance, cos^3, has fallen to about a fifth). Seen from a point of
 * the glass a gap above it, a Lambertian disc of radius R lights it by the
 * disc's form factor, R^2 / (R^2 + h^2 + d^2) -- exact on the axis, and a
 * close bound off it. What the frosted face then sends toward the viewer is
 * about half what it scatters.
 *
 * The shader twin is in glass-light-shader.ts ("light bouncing off the
 * photograph"). Energy: the bounce never carries more than its parent times
 * the print's reflectance -- the form factor and the frost are both at most
 * one.
 */

/** The pool a light makes on the photograph: its radius, px, from the light's height above the photo. */
export function poolRadius(heightAbovePhoto: number): number {
  return Math.max(heightAbovePhoto, 1) * 0.6;
}

/** A Lambertian disc's form factor to a point h above it and d off its axis. */
export function discFormFactor(radius: number, h: number, d: number): number {
  const r2 = radius * radius;
  return r2 / (r2 + h * h + d * d);
}

/**
 * The share of a light's pool brightness that the glass above shows as
 * glow, per unit reflectance of the print: the form factor, times the half
 * of what the frosted face scatters that leaves toward the viewer.
 */
export function bounceShare(
  heightAbovePhoto: number,
  gap: number,
  d: number,
  frost: number,
): number {
  return discFormFactor(poolRadius(heightAbovePhoto), gap, d) * frost * 0.5;
}

/** What a pane passes on the way down to the print: two faces' Fresnel loss, near normal. */
export const PANE_DOWN = 0.92;

/**
 * The pool's mean irradiance over its disc, as a share of its centre's: cos^3
 * (effects/optics/transmission) averaged over a disc of radius 0.6 h,
 * 2 (1 - 1 / sqrt(1 + 0.36)) / 0.36.
 */
export const POOL_MEAN = (2 * (1 - 1 / Math.sqrt(1 + 0.36))) / 0.36;

/**
 * The glow the glass shows over a print of reflectance `albedo`, in the units
 * the print is shown lit in (the floor pass, FloorLight: 1 is a white print at
 * full white). The pool's irradiance there is the floor's gain through the pane,
 * averaged over the disc; a matte print's glow in those units is its albedo
 * times that (display units are pi times radiance, so Lambert's 1/pi and the
 * disc's pi cancel), and bounceShare turns it into glass glow.
 */
export function bounceGlow(
  floorGain: number,
  gap: number,
  d: number,
  heightAbovePhoto: number,
  frost: number,
  albedo: number,
): number {
  const pool = PANE_DOWN * floorGain * POOL_MEAN;
  return albedo * pool * bounceShare(heightAbovePhoto, gap, d, frost);
}
