/**
 * The shape of an inflated round latex party balloon (task 74; Ony,
 * 2026-10-01: the balloons were "weirdly shaped" with "half bulges on the
 * side"). Not a stretched circle: a surface of revolution about the
 * balloon's axis, its profile measured from a photograph of a real 11-inch
 * round latex balloon side on (docs/research/balloons.md 7.1) and fitted:
 *
 *   rho(u) = A sqrt(u) (1 - u)^P (1 + B u + C u^2),   u = 0 at the crown, 1 at the neck
 *
 * rms error 0.6% of the half-width over the body (max 5%, at the neck's
 * last few pixels). The body is 1.30 times as tall as it is wide, widest
 * 41.5% of the way down from the crown; below the widest point it tapers
 * in an almost straight cone to the neck, and the knot hangs below that.
 *
 * Lengths here are in RADII: the balloon's half-width at its widest is 1.
 * y runs from the crown toward the knot; y = 0 is the widest point (the
 * physics body's centre).
 */

const A = 2.2014;
const P = 0.8848;
const B = 0.2846;
const C = 0.0803;
/** The fit's own peak (at u = 0.4155), so the widest half-width is exactly 1. */
const PEAK = 0.99893;
const U_WIDEST = 0.4155;

/** Crown to neck, in radii: 1.2995 times the width. */
export const BODY_LENGTH = 2.599;
/** Where the crown is, in radii from the widest point (negative: up toward the crown). */
export const CROWN_Y = -U_WIDEST * BODY_LENGTH;
/** Where the neck is. */
export const NECK_Y = CROWN_Y + BODY_LENGTH;
/** The knot below the neck: 0.097 of the width long, 0.04 of it wide each side (measured). */
export const KNOT_LENGTH = 0.193;
export const KNOT_HALF_WIDTH = 0.08;
/** Where the ribbon is tied: the bottom of the knot. */
export const TIE_Y = NECK_Y + KNOT_LENGTH;
/** The neck's own half-width, where the fit runs to nothing (measured: 0.027 of the half-width). */
export const NECK_HALF_WIDTH = 0.027;

/** The middle of the volume (where buoyancy acts), radii below the widest point: computed from the profile (shape.test). */
export const BUOYANCY_Y = 0.079;

/** The profile at u (0 crown, 1 neck): half-width in radii. */
export function profileAt(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return (A * Math.sqrt(u) * (1 - u) ** P * (1 + B * u + C * u * u)) / PEAK;
}

/** The body's half-width at height y (radii from the widest point, toward the knot): 0 above the crown and below the neck. */
export function halfWidthAt(y: number): number {
  const u = (y - CROWN_Y) / BODY_LENGTH;
  if (u <= 0 || u >= 1) return 0;
  return Math.max(profileAt(u), u > 0.9 ? NECK_HALF_WIDTH : 0);
}

/** Whether a point (radii, balloon frame) is on the balloon: its body or its knot. */
export function inside(x: number, y: number): boolean {
  if (Math.abs(x) < halfWidthAt(y)) return true;
  const ky = (y - (NECK_Y + KNOT_LENGTH / 2)) / (KNOT_LENGTH / 2);
  return ky * ky + (x / KNOT_HALF_WIDTH) ** 2 < 1;
}

/** The outline, as points round it in radii (crown first, clockwise on screen), for the shadow's path. */
export function outline(n = 64): [number, number][] {
  const right: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    // Denser near the crown, where the outline turns fastest.
    const u = (k / n) ** 1.6;
    right.push([halfWidthAt(CROWN_Y + u * BODY_LENGTH), CROWN_Y + u * BODY_LENGTH]);
  }
  right.push([KNOT_HALF_WIDTH, NECK_Y + KNOT_LENGTH * 0.5], [0, TIE_Y]);
  const left = right
    .slice(0, -1)
    .reverse()
    .map(([x, y]) => [-x, y] as [number, number]);
  return [...right, ...left];
}

/** The outline as an SVG path in the casters' 100 x 100 box: the widest point at (50, 50), 40 units a radius. */
export function outlinePath(): string {
  const pts = outline();
  return (
    pts
      .map(
        ([x, y], k) =>
          `${k === 0 ? "M" : "L"}${(50 + 40 * x).toFixed(2)} ${(50 + 40 * y).toFixed(2)}`,
      )
      .join(" ") + " Z"
  );
}

/** The shader's twin constants. */
export const SHAPE_GLSL = /* glsl */ `
const float BAL_A = ${A.toFixed(4)};
const float BAL_P = ${P.toFixed(4)};
const float BAL_B = ${B.toFixed(4)};
const float BAL_C = ${C.toFixed(4)};
const float BAL_PEAK = ${PEAK.toFixed(5)};
const float BAL_LENGTH = ${BODY_LENGTH.toFixed(4)};
const float BAL_CROWN = ${CROWN_Y.toFixed(4)};
const float BAL_NECK = ${NECK_Y.toFixed(4)};
const float BAL_KNOT_LENGTH = ${KNOT_LENGTH.toFixed(4)};
const float BAL_KNOT_HALF = ${KNOT_HALF_WIDTH.toFixed(4)};
const float BAL_NECK_HALF = ${NECK_HALF_WIDTH.toFixed(4)};
// The profile's half-width at u (0 crown, 1 neck), and its slope d(rho)/du.
float balProfile(float u) {
  if (u <= 0.0 || u >= 1.0) return 0.0;
  return BAL_A * sqrt(u) * pow(1.0 - u, BAL_P) * (1.0 + BAL_B * u + BAL_C * u * u) / BAL_PEAK;
}
float balSlope(float u) {
  u = clamp(u, 1e-4, 1.0 - 1e-4);
  float s = sqrt(u);
  float q = pow(1.0 - u, BAL_P);
  float poly = 1.0 + BAL_B * u + BAL_C * u * u;
  float d = 0.5 / s * q * poly - s * BAL_P * pow(1.0 - u, BAL_P - 1.0) * poly + s * q * (BAL_B + 2.0 * BAL_C * u);
  return BAL_A * d / BAL_PEAK;
}
`;
