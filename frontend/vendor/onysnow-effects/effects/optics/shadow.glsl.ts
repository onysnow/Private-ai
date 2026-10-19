/**
 * The GLSL twin of shadow.ts: the one shadow model, for the shaders. See that
 * file for the geometry. GLSL ES 1.0; keep backticks out of the comments.
 */
export const SHADOW_GLSL = /* glsl */ `
/* An edge's penumbra: across the direction to the lamp, stretched along it by 1 / cos. */
float penumbraOf(float across, float cosTheta, float cosPhi) {
  float c = max(cosTheta, 0.05);
  float p2 = cosPhi * cosPhi;
  return across * sqrt(p2 / (c * c) + (1.0 - p2));
}

/* Rounded-rectangle distance: negative inside, in pixels. */
float roundedRectDistance(vec2 p, vec2 centre, vec2 halfSize, float corner) {
  vec2 q = abs(p - centre) - halfSize + corner;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - corner;
}

/*
 * How much of a rounded-rectangle shadow covers p, 0 to 1: the shape already
 * placed and grown by the model, its edge fading over the penumbra that edge
 * gets, by which way it faces the lamp. dir (0, 0) and cosTheta 1 give an
 * even penumbra of across.
 */
float shadowRect(vec2 p, vec2 centre, vec2 halfSize, float corner, float across, vec2 dir, float cosTheta) {
  float d = roundedRectDistance(p, centre, halfSize, corner);
  float edge = across;
  if (dot(dir, dir) > 0.0) {
    // The edge's outward normal, from the distance field's slope.
    vec2 n = vec2(
      roundedRectDistance(p + vec2(0.5, 0.0), centre, halfSize, corner) -
        roundedRectDistance(p - vec2(0.5, 0.0), centre, halfSize, corner),
      roundedRectDistance(p + vec2(0.0, 0.5), centre, halfSize, corner) -
        roundedRectDistance(p - vec2(0.0, 0.5), centre, halfSize, corner)
    );
    float len = length(n);
    float cosPhi = len > 0.0 ? dot(n / len, dir) : 0.0;
    edge = penumbraOf(across, cosTheta, cosPhi);
  }
  edge = max(edge, 0.5);
  return 1.0 - smoothstep(-edge, edge, d);
}
`;
