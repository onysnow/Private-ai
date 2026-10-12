import { FROSTED_ROUGHNESS, POLISHED_ROUGHNESS } from "./reflection";

/**
 * The GLSL twins of reflection.ts. See that file for the physics.
 *
 * GLSL ES 1.0. Keep backticks out of the comments inside the literal: one of
 * them ends the string early.
 */
export const REFLECTION_GLSL = /* glsl */ `
#define POLISHED_ROUGHNESS ${POLISHED_ROUGHNESS.toFixed(4)}
#define FROSTED_ROUGHNESS ${FROSTED_ROUGHNESS.toFixed(4)}

/* Reflectance straight on, from the index of refraction. */
float reflectanceNormal(float ior) {
  float r = (ior - 1.0) / (ior + 1.0);
  return r * r;
}

/* Schlick: reflectance at an angle whose cosine is cosTheta. */
float fresnelSchlick(float cosTheta, float ior) {
  float f0 = reflectanceNormal(ior);
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
}

/* The exact Fresnel reflectances, per polarisation (reflection.ts fresnelS, fresnelP). */
float fresnelS(float cosI, float ior) {
  float ci = clamp(cosI, 0.0, 1.0);
  float sinT2 = (1.0 - ci * ci) / (ior * ior);
  if (sinT2 >= 1.0) return 1.0;
  float ct = sqrt(1.0 - sinT2);
  float r = (ci - ior * ct) / (ci + ior * ct);
  return r * r;
}
float fresnelP(float cosI, float ior) {
  float ci = clamp(cosI, 0.0, 1.0);
  float sinT2 = (1.0 - ci * ci) / (ior * ior);
  if (sinT2 >= 1.0) return 1.0;
  float ct = sqrt(1.0 - sinT2);
  float r = (ct - ior * ci) / (ct + ior * ci);
  return r * r;
}
/* Through a camera's polarising filter, exposure made up (reflection.ts polarisedReflectance). */
float polarisedReflectance(float cosI, float ior, float filterToS, float strength) {
  float rs = fresnelS(cosI, ior);
  float rp = fresnelP(cosI, ior);
  float c = cos(filterToS);
  float filtered = rs * c * c + rp * (1.0 - c * c);
  float mean = 0.5 * (rs + rp);
  return mean + (filtered - mean) * clamp(strength, 0.0, 1.0);
}

/* GGX roughness from frost: polished glass to acid-etched. */
float frostRoughness(float frost) {
  return POLISHED_ROUGHNESS + (FROSTED_ROUGHNESS - POLISHED_ROUGHNESS) * clamp(frost, 0.0, 1.0);
}

/* GGX (Trowbridge-Reitz) normal distribution. */
float ggx(float nDotH, float alpha) {
  float a2 = alpha * alpha;
  float c = clamp(nDotH, 0.0, 1.0);
  float d = c * c * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265359 * d * d);
}

/* The lamp, reflected straight back to the camera by the flat face. */
float lampReflection(vec2 delta, float height, float power, float ior, float frost) {
  float h = max(height, 1.0);
  float d2 = dot(delta, delta) + h * h;
  float d = sqrt(d2);
  vec3 halfVec = normalize(vec3(-delta / d, h / d + 1.0));
  float nDotH = halfVec.z;
  float f = fresnelSchlick(nDotH, ior);
  float dist = ggx(nDotH, frostRoughness(frost));
  return f * dist * 0.25 * power / d2;
}
`;
