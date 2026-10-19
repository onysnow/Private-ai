import { MAX_SLANT_SPREAD } from "./transmission";

/**
 * The GLSL twins of transmission.ts. See that file for the physics.
 *
 * Needs SHADOW_GLSL and REFLECTION_GLSL spliced in before it: it reuses fresnelSchlick and
 * frostRoughness, so the frost that spreads the reflection on the face is the
 * same frost that blurs the light through it.
 *
 * GLSL ES 1.0. Keep backticks out of the comments inside the literal.
 */
export const TRANSMISSION_GLSL = /* glsl */ `
#define MAX_SLANT_SPREAD ${MAX_SLANT_SPREAD.toFixed(1)}

/* Cosine of the angle the lamp's light arrives at. */
float cosIncidence(float r, float height) {
  float h = max(height, 1.0);
  return h / sqrt(r * r + h * h);
}

/* Irradiance relative to directly beneath the lamp: cos(theta) cubed. */
float irradianceFalloff(float r, float height) {
  float c = cosIncidence(r, height);
  return c * c * c;
}

/* Fraction of light through both faces at this incidence. */
float transmittance(float cosTheta, float ior) {
  float t = 1.0 - fresnelSchlick(cosTheta, ior);
  return t * t;
}

/*
 * Penumbra of a shadow edge on the floor: the one shadow model's
 * (effects/optics/shadow), for a pane gap above the floor.
 */
float penumbraAcross(float lightSize, float gap, float height, float cosTheta, float cosPhi) {
  return penumbraOf(lightSize * gap / max(height - gap, 1.0), cosTheta, cosPhi);
}

/* How far frost has scattered the light by the time it reaches the floor. */
float frostSpread(float frost, float ior, float gap, float cosTheta) {
  float c = max(cosTheta, 0.05);
  return (ior - 1.0) * frostRoughness(frost) * gap / (c * c);
}

/* How much further and wider the bevel's band lands at a slant. */
float slantSpread(float cosTheta) {
  float c = max(cosTheta, 0.05);
  return min(1.0 / (c * c), MAX_SLANT_SPREAD);
}
`;
