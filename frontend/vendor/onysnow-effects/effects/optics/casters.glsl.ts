/** The GLSL twin of effects/optics/casters.ts castPoint and lampDiscAt; see that file. */
export const CASTERS_GLSL = /* glsl */ `
// effects/optics/casters.ts: how much of the lamp the casters hide from a
// point P of the photograph. layer picks the mask (0-2 the first, 3-5 the
// second) and its channel; h is that layer's height.
float casterCover2(sampler2D mask, sampler2D mask2, vec2 viewportCss, vec2 P, vec2 L, float H, float R, float h, float extra, int layer) {
  if (h <= 0.0 || h >= H - 1.0) return 0.0;
  vec2 c = P + (L - P) * (h / H);
  vec2 toL = L - P;
  float lat = length(toL);
  vec2 rad = lat > 0.5 ? toL / lat : vec2(1.0, 0.0);
  vec2 tng = vec2(-rad.y, rad.x);
  float cosT = H / sqrt(lat * lat + H * H);
  float across = R * h / H;
  float a = sqrt(across * across + extra * extra);
  float b = sqrt((across / max(cosT, 0.2)) * (across / max(cosT, 0.2)) + extra * extra);
  /*
   * The lamp's disc on the caster's plane, sampled with 12 Vogel-disc taps
   * (equal area each, so equally weighted), the whole pattern turned per
   * pixel by interleaved gradient noise (docs/research/shadows.md 5.4 and
   * 6 Change 4: drei softShadows, MIT; Jimenez 2014). The 13 fixed taps on
   * two rings stood 10-52 px apart against 2-8 px strokes: banding and
   * ghost copies of the letters. Turned per pixel, what is left is fine
   * grain instead.
   */
  float spin = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float sum = 0.0;
  for (int k = 0; k < 12; k++) {
    float fk = float(k);
    float r = sqrt((fk + 0.5) / 12.0);
    float ang = fk * 2.3999632 + spin;
    vec2 o = rad * (cos(ang) * r * b) + tng * (sin(ang) * r * a);
    vec2 uv = (c + o) / viewportCss;
    vec4 m = layer < 3 ? texture2D(mask, uv) : texture2D(mask2, uv);
    int ch = layer < 3 ? layer : layer - 3;
    sum += ch == 0 ? m.r : (ch == 1 ? m.g : m.b);
  }
  return sum / 12.0;
}
`;
