import { BURN_FROM, BURN_MAX, BURN_TO, DEFAULT_EDGE_WIDTH } from "./edge-profile";

/**
 * The GLSL twins of edge-profile.ts, as one chunk every shader splices in.
 *
 * A shader that needs the edge includes this instead of writing its own
 * rounded box, band, Fresnel rise or tonemap. Each function here matches its
 * TypeScript twin by name and by maths; e2e/optics.spec.ts runs both in a real
 * WebGL context and fails if they drift apart.
 *
 * The edge width itself is NOT a constant in here. It arrives per pane as a
 * uniform, because it is a property of the pane. DEFAULT_EDGE_WIDTH is exposed
 * only so a shader has a sane value before the first pane is measured.
 *
 * GLSL ES 1.0, to match every shader on the site. Keep backticks out of the
 * comments inside the literal: one of them ends the string early.
 */
export const EDGE_PROFILE_GLSL = /* glsl */ `
#define DEFAULT_EDGE_WIDTH ${DEFAULT_EDGE_WIDTH.toFixed(1)}

/* Signed distance to a rounded rectangle. Negative inside, zero on the edge. */
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  float r = min(radius, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

/* 0 at the rim, 1 where the bevel meets the flat face and beyond. */
float edgeBand(float depth, float edgeWidth) {
  return clamp(depth / max(edgeWidth, 1.0), 0.0, 1.0);
}

/* The bevel cross-section, circle profile: height 0 at the rim to 1 at the face. */
float surfaceHeight(float x) {
  float t = clamp(x, 0.0, 1.0);
  return sqrt(1.0 - (1.0 - t) * (1.0 - t));
}

/*
 * How far the backdrop moves under a point on the bevel, in pixels, inward
 * (edge-profile.ts refractionOffset): Snell at the bevel's surface, then the
 * rest of the glass crossed. Circle profile; the slope by the same central
 * difference as the twin, so the two agree to the last digit.
 */
float refractionOffset(float x, float edgeWidth, float thickness, float ior) {
  float eta = 1.0 / ior;
  float height = surfaceHeight(x);
  float a = max(x - 0.001, 0.0);
  float b = min(x + 0.001, 1.0);
  float slope = (surfaceHeight(b) - surfaceHeight(a)) / max(b - a, 1e-6);
  float magnitude = sqrt(slope * slope + 1.0);
  float nx = -slope / magnitude;
  float ny = -1.0 / magnitude;
  float k = 1.0 - eta * eta * (1.0 - ny * ny);
  if (k < 0.0) return 0.0;
  float kSqrt = sqrt(k);
  float rx = -(eta * ny + kSqrt) * nx;
  float ry = eta - (eta * ny + kSqrt) * ny;
  if (abs(ry) < 1e-3) return 0.0;
  return rx * ((height * edgeWidth + thickness) / ry);
}

/* Schlick's fifth-power rise toward grazing. facing: 1 straight on, 0 grazing. */
float fresnelRise(float facing) {
  return pow(1.0 - clamp(facing, 0.0, 1.0), 5.0);
}

/* Signed Reinhard, then display gamma. */
vec3 toneMapGlass(vec3 c) {
  c = c / (1.0 + abs(c));
  return sign(c) * pow(abs(c), vec3(1.0 / 2.2));
}

/*
 * The same with a film's shoulder (preview "burn"; edge-profile.ts
 * toneMapGlassBurn): past what the picture holds, the other channels are
 * carried up after the brightest, so a bright coloured light burns toward
 * white at its core instead of staying fully saturated. Darkening is untouched.
 */
vec3 toneMapGlassBurn(vec3 c) {
  float peak = max(max(max(c.r, c.g), c.b), 0.0);
  vec3 r = c / (1.0 + abs(c));
  float top = max(max(r.r, r.g), r.b);
  float burn = smoothstep(${BURN_FROM.toFixed(1)}, ${BURN_TO.toFixed(1)}, peak) * ${BURN_MAX.toFixed(3)};
  r = mix(r, r + (vec3(top) - r) * burn, step(0.0, c));
  return sign(r) * pow(abs(r), vec3(1.0 / 2.2));
}

/* Film response: bright light rolls off instead of clipping flat. */
vec3 toneMapFilm(vec3 c) {
  return vec3(1.0) - exp(-c * 1.15);
}
`;
