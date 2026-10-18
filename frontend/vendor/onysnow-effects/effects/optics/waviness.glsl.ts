/**
 * The GLSL twin of waviness.ts: one wavy surface, read for its slope by the
 * glass (the view through it) and for its curvature by the floor light (the
 * caustic). Checked against the TypeScript by waviness.test.ts.
 */
import { WAVE_COUNT, WAVE_LONGEST } from "./waviness";

export const WAVINESS_GLSL = /* glsl */ `
float waveScale(float waviness, float gap) {
  return 3.5 * waviness * clamp(gap / 70.0, 0.3, 2.5);
}

/* The surface's slope (xy) and curvature (xx, yy, xy) at a pane-local point. */
void waveSurface(vec2 x, float seed, out vec2 slope, out vec3 hessian) {
  x += vec2(seed * 613.0, seed * 389.0);
  slope = vec2(0.0);
  hessian = vec3(0.0);
  for (int k = 0; k < ${WAVE_COUNT}; k++) {
    float fk = float(k);
    float ang = seed * 1.7 + fk * 2.39996;
    vec2 d = vec2(cos(ang), sin(ang));
    float w = 6.2831853 / (${WAVE_LONGEST.toFixed(1)} / (1.0 + fk * 0.33));
    float ph = dot(d, x) * w + fk * 1.618 + seed * 4.0;
    slope += cos(ph) / (6.0 * w) * d;
    float curve = -sin(ph) / 6.0;
    hessian += curve * vec3(d.x * d.x, d.y * d.y, d.x * d.y);
  }
}
`;
