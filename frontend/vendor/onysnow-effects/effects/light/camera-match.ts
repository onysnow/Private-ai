/**
 * Camera match: what the drawn effects need to sit in the photographs as
 * if the same camera had taken them (Ony, 2026-10-01: "it looks cgi"). A
 * render straight out of a shader has a true black, a hard clip to pure
 * white and perfectly clean gradients; the site's photographs have none of
 * those. Measured from the site's own photographs as the page shows them
 * (the hero and the six service cards, screenshots at 1.5x; the rig's
 * numbers, 2026-10-01):
 *
 * - Black floor: the darkest 0.5% of pixels sit at luminance 0.024-0.029,
 *   never 0 -- a lifted black, as a cinematic grade leaves it.
 * - Highlights: the brightest 0.5% start at 0.67-0.70, and the brightest
 *   pixels reach about 0.85-0.88, warm: R : G : B about 1.11 : 1.01 : 0.88
 *   relative to their mean. A shoulder, not a clip.
 * - Grain: in flat areas the fine noise (high-pass, 1.5 px) is about 0.002
 *   in the shadows and 0.003-0.004 in the mid-tones -- these photographs
 *   are clean, so the grain added is that little: enough to break a smooth
 *   gradient's banding the way the photographs' own noise does, no more.
 *
 * The same curve in JS (for the tests) and GLSL (for the passes).
 */

/** The black floor, the shoulder's knee and its ceiling, and the grain, as measured. */
export const BLACK_FLOOR = 0.026;
export const KNEE = 0.68;
export const CEILING = 0.9;
export const HIGHLIGHT_TINT: readonly [number, number, number] = [1.1, 1.0, 0.88];
export const GRAIN = 0.0035;

/** The tone curve on a luminance-like value: lifted black, linear through the mid-tones, a soft shoulder to CEILING. */
export function toneCurve(x: number): number {
  const v = BLACK_FLOOR + Math.max(x, 0) * (1 - BLACK_FLOOR);
  if (v <= KNEE) return v;
  const room = CEILING - KNEE;
  return KNEE + room * (1 - Math.exp(-(v - KNEE) / room));
}

export const CAMERA_MATCH_GLSL = /* glsl */ `
const float CM_FLOOR = ${BLACK_FLOOR.toFixed(4)};
const float CM_KNEE = ${KNEE.toFixed(3)};
const float CM_CEIL = ${CEILING.toFixed(3)};
const vec3 CM_TINT = vec3(${HIGHLIGHT_TINT.map((v) => v.toFixed(3)).join(", ")});
float cmCurve(float x) {
  float v = CM_FLOOR + max(x, 0.0) * (1.0 - CM_FLOOR);
  if (v <= CM_KNEE) return v;
  float room = CM_CEIL - CM_KNEE;
  return CM_KNEE + room * (1.0 - exp(-(v - CM_KNEE) / room));
}
float cmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
/*
 * A drawn colour (display values; may run past 1 where a highlight clips)
 * as the photographs' camera and grade would have recorded it: the curve
 * on its brightest channel, the hue kept, warmed toward the photographs'
 * highlight colour as it nears the ceiling, with their grain. grainAt: the
 * pixel, CSS px (the grain is about a CSS pixel, as in the photographs).
 */
vec3 cameraMatch(vec3 c, vec2 grainAt) {
  float pk = max(c.r, max(c.g, c.b));
  if (pk > 1e-5) {
    float t = cmCurve(pk);
    c = c * (t / pk);
    float warm = smoothstep(CM_KNEE, CM_CEIL, t);
    c = mix(c, c * CM_TINT, warm * 0.6);
  } else c = vec3(CM_FLOOR);
  float g = cmHash(floor(grainAt)) + cmHash(floor(grainAt) + 17.3) - 1.0;
  return c + ${GRAIN.toFixed(4)} * 1.7 * g;
}
/*
 * Only the highlights' shoulder and warmth, and the grain: for a layer that
 * shows the photograph itself (the water's lenses), whose blacks are the
 * photograph's own already.
 */
vec3 cameraHighlights(vec3 c, vec2 grainAt) {
  float pk = max(c.r, max(c.g, c.b));
  if (pk > CM_KNEE) {
    float room = CM_CEIL - CM_KNEE;
    float t = CM_KNEE + room * (1.0 - exp(-(pk - CM_KNEE) / room));
    c = c * (t / pk);
    c = mix(c, c * CM_TINT, smoothstep(CM_KNEE, CM_CEIL, t) * 0.6);
  }
  float g = cmHash(floor(grainAt)) + cmHash(floor(grainAt) + 17.3) - 1.0;
  return c + ${GRAIN.toFixed(4)} * 1.7 * g;
}
`;
