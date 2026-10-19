/**
 * Backlit glass in the glass shader: the GLSL twin of effects/optics/backlit
 * (the same extraction, reach and profile; tested there).
 *
 * edge: 0 both sides, 1 the left, 2 the right, 3 below, 4 above, 5 behind.
 * Returns the light this point lets out, linear, to add before the tone map.
 */
export const BACKLIT_GLSL = /* glsl */ `
float backlitExtraction(float frost) {
  return 0.12 + 0.88 * clamp(frost, 0.0, 1.0);
}

float backlitReach(float fill, float extent, float frost) {
  return max(1.0, fill * extent / (0.35 + clamp(frost, 0.0, 1.0)));
}

float backlitRun(float x, float extent, float fill, float frost) {
  return exp(-max(x, 0.0) / backlitReach(fill, extent, frost));
}

float backlitProfile(vec2 p, vec2 halfSize, float edge, float fill, float frost) {
  float k = backlitExtraction(frost);
  float w = halfSize.x * 2.0;
  float h = halfSize.y * 2.0;
  if (edge < 0.5) {
    return k * 0.5 * (backlitRun(p.x + halfSize.x, w, fill, frost) + backlitRun(halfSize.x - p.x, w, fill, frost));
  }
  if (edge < 1.5) return k * backlitRun(p.x + halfSize.x, w, fill, frost);
  if (edge < 2.5) return k * backlitRun(halfSize.x - p.x, w, fill, frost);
  if (edge < 3.5) return k * backlitRun(halfSize.y - p.y, h, fill, frost);
  if (edge < 4.5) return k * backlitRun(p.y + halfSize.y, h, fill, frost);
  float r = length(p / max(halfSize, vec2(1.0)));
  return k * (1.0 - 0.3 * min(r * r, 1.0));
}

/*
 * The face's glow, the rims letting out the trapped light (bright in a few
 * pixels, the arris), and a little of it spilling past them onto what is
 * beyond. depth: px inside the rim (negative outside); d: px outside.
 */
vec3 backlitAt(vec2 p, vec2 halfSize, float depth, float edge, float fill, float frost, vec3 colour, float gain) {
  if (gain <= 0.0) return vec3(0.0);
  // Measured where the point would be on the pane: the spill outside reads its nearest edge.
  vec2 q = clamp(p, -halfSize, halfSize);
  float profile = backlitProfile(q, halfSize, edge, fill, frost);
  float face = depth >= 0.0 ? profile : 0.0;
  // The rims: the guided light, not only what the frost let out, so clear glass glows here too.
  float guided = profile / backlitExtraction(frost);
  float rim = depth >= 0.0 ? exp(-depth / 3.0) * 0.55 * guided : 0.0;
  float spill = depth < 0.0 ? exp(depth / 22.0) * 0.22 * guided : 0.0;
  return colour * gain * (face + rim + spill);
}
`;
