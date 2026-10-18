import { penumbraOf } from "./shadow";
/**
 * Light passing THROUGH a pane and landing on what is behind it.
 *
 * WHY THIS FILE EXISTS
 *
 * The light and shadow the glass throws were drawn with one sharpness and one
 * brightness curve everywhere: a Gaussian pool with a "Light reach" setting,
 * and a single penumbra for every edge on the page. Real cast light does not
 * do that. The further the lamp is off to the side, the more obliquely its
 * light arrives, and every part of what the glass throws changes with it:
 *
 *   dimmer     irradiance falls as cos(theta) / distance^2 -- the lamp is
 *              further away AND its light is spread over more floor.
 *   less gets  glass reflects more at a slant, so less gets through: the
 *   through    transmittance (1 - F)^2 over the two faces falls off.
 *   softer     the penumbra is the lamp's size seen past the edge. A sphere
 *              seen at a slant spreads its shadow edge by 1 / cos(theta)
 *              along the direction to the lamp, so an edge facing the lamp
 *              blurs more than one running toward it.
 *   blurrier   frost scatters every ray by a small angle; the longer the slant
 *              path from glass to floor, the wider that spreads.
 *   further,   the bevel tips light by a fixed angle, and that angle carries
 *   wider      further along a slanted path (gap / cos^2 theta), so the bright
 *              band lands further from the edge and spreads wider -- the same
 *              light over more floor, so dimmer again.
 *
 * All of it is a smooth function of where the lamp is, so there is always a
 * gradient: sharp and bright under the lamp, softer and fainter away from it.
 * None of it is a setting. The causes are the lamp's position, height and
 * size, the glass's gap, index and frost.
 *
 * Each function has a GLSL twin in transmission.glsl.ts, checked in real
 * WebGL by e2e/optics.spec.ts.
 */

import { fresnelSchlick, frostRoughness } from "./reflection";

/** Cosine of the angle the lamp's light arrives at, `r` off to the side and `height` up. */
export function cosIncidence(r: number, height: number): number {
  const h = Math.max(height, 1);
  return h / Math.sqrt(r * r + h * h);
}

/**
 * Irradiance from a point lamp, relative to directly beneath it:
 * cos(theta) / d^2, normalised by 1 / h^2. Equals cos(theta)^3.
 */
export function irradianceFalloff(r: number, height: number): number {
  const c = cosIncidence(r, height);
  return c * c * c;
}

/** Fraction of light through both faces of the glass at this incidence. */
export function transmittance(cosTheta: number, ior: number): number {
  const t = 1 - fresnelSchlick(cosTheta, ior);
  return t * t;
}

/**
 * Width of a shadow edge's penumbra on the floor, in CSS pixels.
 *
 * `lightSize` is the lamp's radius. Straight under it the penumbra is
 * size * gap / (height - gap), by similar triangles. At a slant the lamp's
 * silhouette, projected onto the floor, stretches by 1 / cos(theta) along the
 * direction to the lamp; `cosPhi` is how much the edge's normal points along
 * that direction (1: the edge faces the lamp, 0: it runs toward it).
 */
export function penumbraAcross(
  lightSize: number,
  gap: number,
  height: number,
  cosTheta: number,
  cosPhi: number,
): number {
  return penumbraOf((lightSize * gap) / Math.max(height - gap, 1), cosTheta, cosPhi);
}

/**
 * How far frost scatters the light by the time it reaches the floor, in CSS
 * pixels.
 *
 * A rough face refracts each ray through a microfacet tilted by about the
 * roughness, which turns it by about (n - 1) times that. Carried over the
 * slant path from glass to floor, that angle becomes a distance that grows
 * as gap / cos^2 theta.
 */
export function frostSpread(frost: number, ior: number, gap: number, cosTheta: number): number {
  const c = Math.max(cosTheta, 0.05);
  return ((ior - 1) * frostRoughness(frost) * gap) / (c * c);
}

/**
 * How much further, and wider, the bevel's band lands at a slant than
 * straight under the lamp: the same turn carried over gap / cos^2 theta.
 * Capped where the band has spread too thin to see.
 */
export const MAX_SLANT_SPREAD = 6;

export function slantSpread(cosTheta: number): number {
  const c = Math.max(cosTheta, 0.05);
  return Math.min(1 / (c * c), MAX_SLANT_SPREAD);
}
