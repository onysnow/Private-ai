/**
 * One shadow model: every shadow on the site is worked out here.
 *
 * A shadow is the light that did not arrive. So it follows from exactly what
 * the light does: where the lamp is, how big it is, how high it stands, and
 * how far the thing throwing the shadow stands off the surface it lands on.
 * Nothing about a shadow is chosen per shadow -- the pane's shadow on the
 * photographs, a card's on the glass, a line of type's, a scratch's: one
 * geometry, read by every one of them (CSS through effects/adapters/css-vars,
 * the shaders through SHADOW_GLSL, its twin).
 *
 * The geometry, for a lamp of radius R, H above the receiving surface, and a
 * flat thing standing g above that surface (g < H):
 *
 *   PLACE  Each point P of the thing lands at  L + (P - L) * m,  m = H / (H - g).
 *          So the shadow is pushed away from the lamp by  (C - L) * g / (H - g)
 *          and it is BIGGER than the thing, by m: the closer the lamp, the
 *          bigger. (Rays from a point spread; only the sun's are parallel.)
 *
 *   SOFTEN The lamp is a disc, not a point, so each edge fades over a
 *          penumbra. Across the direction to the lamp it is  R g / (H - g)
 *          whatever the angle; along it, the slanted ray lands stretched by
 *          1 / cos(theta), so a shadow thrown far to the side is softer at its
 *          far end and along its length than across. The edge between blends
 *          by the edge's facing: sqrt(p^2 / cos^2 + 1 - p^2), p the cosine
 *          between the edge normal and the direction to the lamp.
 *
 *          A shadow SHARPENS as the lamp rises (H - g grows) and softens as it
 *          comes down to the surface, and a bigger lamp softens every edge.
 *
 * What it is not: strength. How dark a shadow is is how much of the lamp's
 * light the thing stops (opaque print, grease, a coloured gel...) times how
 * much of the lamp's light was reaching there at all; both belong to the
 * thing and the light, and the callers bring them.
 */

export type ShadowInput = {
  /** The lamp on the receiving surface's plane, and its height above it. CSS px. */
  lampX: number;
  lampY: number;
  height: number;
  /** The lamp's radius. A point source casts a hard shadow. */
  radius: number;
  /** How far the thing stands off the receiving surface. */
  gap: number;
  /** The thing's centre, on the same plane. */
  x: number;
  y: number;
};

export type Shadow = {
  /** Where the shadow's centre lands. */
  x: number;
  y: number;
  /** How much bigger than the thing it is (>= 1). */
  scale: number;
  /** Penumbra across the direction to the lamp, and along it. CSS px. */
  across: number;
  along: number;
  /** Unit direction from the lamp to the shadow, on the plane (0, 0 straight under it). */
  dirX: number;
  dirY: number;
  /** The cosine of the angle the light arrives at, at the shadow. */
  cosTheta: number;
};

/** The lamp can never be at or below the thing: keep at least a pixel between. */
const MIN_CLEARANCE = 1;

export function castShadow({ lampX, lampY, height, radius, gap, x, y }: ShadowInput): Shadow {
  const g = Math.max(gap, 0);
  const H = Math.max(height, g + MIN_CLEARANCE);
  const clearance = H - g;
  const scale = H / clearance;
  const sx = lampX + (x - lampX) * scale;
  const sy = lampY + (y - lampY) * scale;
  const lateral = Math.hypot(sx - lampX, sy - lampY);
  const cosTheta = H / Math.hypot(lateral, H);
  const across = (Math.max(radius, 0) * g) / clearance;
  return {
    x: sx,
    y: sy,
    scale,
    across,
    along: across / Math.max(cosTheta, 0.05),
    dirX: lateral > 1e-6 ? (sx - lampX) / lateral : 0,
    dirY: lateral > 1e-6 ? (sy - lampY) / lateral : 0,
    cosTheta,
  };
}

/**
 * The penumbra of one edge, given how much its normal points toward the lamp
 * direction (cosPhi: 1 facing along it, 0 running along it).
 */
export function penumbraOf(across: number, cosTheta: number, cosPhi: number): number {
  const c = Math.max(cosTheta, 0.05);
  const p2 = cosPhi * cosPhi;
  return across * Math.sqrt(p2 / (c * c) + (1 - p2));
}

/** The one penumbra number a CSS blur can carry: the mean of across and along. */
export const isotropicBlur = (s: Shadow) => (s.across + s.along) / 2;
