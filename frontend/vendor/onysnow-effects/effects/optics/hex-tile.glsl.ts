import { HEX_CONTRAST } from "./hex-tile";

/**
 * The GLSL twin of hex-tile.ts: sample a seamless texture with no visible
 * repeat. See that file for the method and its source.
 *
 * GLSL ES 1.0. Keep backticks out of the comments inside the literal.
 */
export const HEX_TILE_GLSL = /* glsl */ `
#define HEX_CONTRAST ${HEX_CONTRAST.toFixed(1)}

/* Barycentric weights of the three hexagons around st, and their cells. */
void hexWeights(vec2 st, out vec3 w, out vec2 c1, out vec2 c2, out vec2 c3) {
  st *= 2.0 * sqrt(3.0);
  vec2 k = vec2(st.x, -0.57735027 * st.x + 1.15470054 * st.y);
  vec2 b = floor(k);
  vec2 f = k - b;
  float fz = 1.0 - f.x - f.y;
  float s = fz < 0.0 ? 1.0 : 0.0;
  float s2 = 2.0 * s - 1.0;
  w = vec3(-fz * s2, s - f.y * s2, s - f.x * s2);
  c1 = b + vec2(s, s);
  c2 = b + vec2(s, 1.0 - s);
  c3 = b + vec2(1.0 - s, s);
}

/* The weights after the contrast power, normalised. */
vec3 hexBlend(vec3 w) {
  vec3 p = pow(max(w, vec3(0.0)), vec3(HEX_CONTRAST));
  return p / max(p.x + p.y + p.z, 1e-6);
}

/* A cell's offset into the texture. Chooses where a cell reads from; adds nothing to the image. */
vec2 cellOffset(vec2 c) {
  vec3 p = fract(vec3(c.x * 0.1031, c.y * 0.103, c.x * 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract(vec2((p.x + p.y) * p.z, (p.x + p.z) * p.y));
}

/* A seamless texture, hex-tiled: no repeat to spot, no border to see. */
vec3 hexTile(sampler2D tex, vec2 uv) {
  vec3 w; vec2 c1; vec2 c2; vec2 c3;
  hexWeights(uv, w, c1, c2, c3);
  vec3 b = hexBlend(w);
  return texture2D(tex, uv + cellOffset(c1)).rgb * b.x
       + texture2D(tex, uv + cellOffset(c2)).rgb * b.y
       + texture2D(tex, uv + cellOffset(c3)).rgb * b.z;
}
`;
