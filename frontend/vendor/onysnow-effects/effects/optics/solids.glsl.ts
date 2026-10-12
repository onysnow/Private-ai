/**
 * The glass solids' distance functions and ray trace, in GLSL (item 25g) --
 * the shader twin of solids.ts, the same functions term for term, so what
 * the tests hold the TS to is what the pass draws.
 *
 * GLSL ES 1.0: loops have constant bounds; the shape is a uniform int
 * compared in branches the whole draw takes the same way.
 */

export const SOLIDS_GLSL = /* glsl */ `
// 0 prism, 1 sphere, 2 cube, 3 cone, 4 pyramid, 5 rod -- as SOLID_SHAPES.
uniform int uShape;

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTriPrism(vec3 p, float r, float h) {
  float inr = r * 0.5;
  float k = 0.8660254;
  float bottom = -p.y - inr;
  float right = k * p.x + 0.5 * p.y - inr;
  float left = -k * p.x + 0.5 * p.y - inr;
  float tri = max(bottom, max(right, left));
  return max(tri, abs(p.z) - h);
}

float sdRod(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdCone(vec3 p, float r, float h) {
  float q = length(p.xz);
  float slant = length(vec2(r, 2.0 * h));
  float side = ((q - r) * 2.0 * h + (p.y + h) * r) / slant;
  return max(side, -p.y - h);
}

float sdPyramid(vec3 p, float r, float h) {
  float s = length(vec2(r, 2.0 * h));
  float fx = ((abs(p.x) - r) * 2.0 * h + (p.y + h) * r) / s;
  float fz = ((abs(p.z) - r) * 2.0 * h + (p.y + h) * r) / s;
  return max(max(fx, fz), -p.y - h);
}

float solidDistance(vec3 p, float size) {
  if (uShape == 1) return sdSphere(p, size);
  if (uShape == 2) return sdBox(p, vec3(size));
  if (uShape == 3) return sdCone(p, size * 0.8, size);
  if (uShape == 4) return sdPyramid(p, size * 0.8, size);
  if (uShape == 5) return sdRod(p, size * 0.32, size);
  return sdTriPrism(p, size, size);
}

vec3 solidNormal(vec3 p, float size) {
  float e = size * 1e-3;
  return normalize(vec3(
    solidDistance(p + vec3(e, 0.0, 0.0), size) - solidDistance(p - vec3(e, 0.0, 0.0), size),
    solidDistance(p + vec3(0.0, e, 0.0), size) - solidDistance(p - vec3(0.0, e, 0.0), size),
    solidDistance(p + vec3(0.0, 0.0, e), size) - solidDistance(p - vec3(0.0, 0.0, e), size)
  ));
}

/* Where a ray first crosses the surface; -1.0 for none. side: 1 from outside, -1 from inside. */
float solidCrossing(vec3 o, vec3 d, float size, float side, float maxT) {
  float t = side > 0.0 ? 0.0 : size * 2e-3;
  float floorD = size * 2e-4;
  for (int i = 0; i < 96; i++) {
    float s = side * solidDistance(o + d * t, size);
    if (s < floorD) return t;
    t += max(s, floorD * 4.0);
    if (t > maxT) return -1.0;
  }
  return -1.0;
}

/* Exact unpolarised Fresnel reflectance (effects/optics/beam fresnel). */
float fresnelExact(float cosI, float n1, float n2) {
  float sinT2 = (n1 / n2) * (n1 / n2) * max(0.0, 1.0 - cosI * cosI);
  if (sinT2 >= 1.0) return 1.0;
  float cosT = sqrt(1.0 - sinT2);
  float rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  float rp = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
  return 0.5 * (rs * rs + rp * rp);
}

/*
 * The light that crosses the solid along one wavelength's path, from the
 * point it entered (p, already refracted into d): up to four inner surfaces,
 * out by the first it can leave through, totally reflected off the rest.
 * Returns the leaving direction in xyz and the share that got through
 * (Fresnel out, Beer along the path) in w; w = 0 if it never got out.
 */
vec4 throughSolid(vec3 p, vec3 d, float n, float absorb, float size) {
  float kept = 1.0;
  for (int b = 0; b < 4; b++) {
    float t = solidCrossing(p, d, size, -1.0, size * 6.0);
    if (t < 0.0) return vec4(d, 0.0);
    kept *= exp(-absorb * t);
    p += d * t;
    vec3 inward = -solidNormal(p, size);
    float cosI = clamp(abs(dot(d, inward)), 0.0, 1.0);
    float R = fresnelExact(cosI, n, 1.0);
    if (R < 1.0) {
      vec3 leaving = refract(d, inward, n);
      if (dot(leaving, leaving) > 0.0) return vec4(normalize(leaving), kept * (1.0 - R));
    }
    d = reflect(d, inward);
  }
  return vec4(d, 0.0);
}
`;
