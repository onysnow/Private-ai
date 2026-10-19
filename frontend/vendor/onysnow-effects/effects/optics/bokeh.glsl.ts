/**
 * The bokeh gather, the shader side of effects/optics/bokeh.
 *
 * Written out from BOKEH_TAPS, so the shader's aperture and the tested one
 * are the same numbers by construction. `bokehAt` averages a photograph's
 * hidden-light map over the hexagon of radius `radius` (CSS px) round a page
 * point, each tap clipped to the photograph's box and dimmed by its vignette
 * (PHOTO_VIGNETTE); the map is
 * mipmapped and read at the level of the taps' spacing, so each tap already
 * stands for its whole cell and a small lamp becomes a solid disc rather than
 * nineteen dots.
 *
 *
 * Needs coverUv (the glass shader's object-fit: cover mapping) before it.
 */
import { BOKEH_RINGS, BOKEH_TAPS, PHOTO_VIGNETTE } from "./bokeh";

const f = (n: number) => n.toFixed(6);

export const BOKEH_GLSL = /* glsl */ `
float vignetteRamp(float d) {
  return smoothstep(${f(PHOTO_VIGNETTE.spread - 2.5 * PHOTO_VIGNETTE.sigma)}, ${f(PHOTO_VIGNETTE.spread + 2.5 * PHOTO_VIGNETTE.sigma)}, d);
}

// How much of a cell (cell px wide) round pt lies inside rect: a tap stands
// for its whole cell, so an edge crossing the aperture fades across the cell
// instead of stepping one row of taps at a time.
float cellInside(vec2 pt, vec4 rect, float cell) {
  vec2 d = min(pt - rect.xy, rect.xy + rect.zw - pt);
  vec2 k = clamp(d / cell + 0.5, 0.0, 1.0);
  return k.x * k.y;
}

/*
 * How much of a photograph's light leaves point pt: only inside its box (the
 * section clips it; another photograph shows past it) and its own element
 * (which slides with the viewpoint), and through the vignette there.
 */
float photoShows(vec2 pt, vec4 image, vec4 box, float cell) {
  vec2 d = min(pt - box.xy, box.xy + box.zw - pt);
  float vignette = 1.0 - ${f(PHOTO_VIGNETTE.alpha)} * (1.0 - vignetteRamp(d.x) * vignetteRamp(d.y));
  return cellInside(pt, box, cell) * cellInside(pt, image, cell) * vignette;
}

// Unconditional: a texture read under a branch that differs between
// neighbouring pixels gets no reliable level of detail.
vec3 bokehTap(sampler2D map, vec2 pt, vec4 image, vec3 fit, vec4 box, float cell, float bias) {
  vec2 uv = clamp(coverUv(pt, image, fit), 0.0, 1.0);
  return texture2D(map, uv, bias).rgb * photoShows(pt, image, box, cell);
}

/*
 * The hidden light of one photograph (drawn at image, framed by fit -- its
 * aspect and object-position, see coverUv; showing in
 * box) averaged over the hexagon of radius px round the page point at.
 */
vec3 bokehAt(sampler2D map, vec2 at, vec4 image, vec3 fit, vec4 box, float radius, float devicePx) {
  // The whole hexagon off the photograph's box: none of its light reaches here.
  vec2 far = max(box.xy - at, at - box.xy - box.zw);
  if (max(far.x, far.y) > radius) return vec3(0.0);
  // No light anywhere near (the map's alpha, bokeh.ts markLightNear): skip the gather.
  if (texture2D(map, coverUv(at, image, fit)).a <= 0.0) return vec3(0.0);
  float cell = radius / ${f(BOKEH_RINGS)};
  float bias = log2(max(cell * devicePx, 1.0));
  vec3 sum = vec3(0.0);
${BOKEH_TAPS.map(
  ([x, y]) =>
    `  sum += bokehTap(map, at + vec2(${f(x)}, ${f(y)}) * radius, image, fit, box, cell, bias);`,
).join("\n")}
  return sum / ${f(BOKEH_TAPS.length)};
}
`;
