import {
  ARRIS_RADIUS,
  BAR_THINNER,
  ECHO_GAIN,
  FAR_ARRIS_LOSS,
  PANE_THICKNESS,
  RELAY_GAIN,
  SIDE_ABSORB,
  SIDE_GUIDED_DEPTH,
  SIDE_PATH_GUIDED,
  SIDE_PATH_MIN,
} from "./edge-side";

const f = (n: number) => n.toFixed(6);

/**
 * The GLSL twins of edge-side.ts. See that file for the physics.
 *
 * Needs the REFLECTION chunk (fresnelSchlick) included before it. GLSL ES
 * 1.0; keep backticks out of the comments inside the literal.
 */
export const EDGE_SIDE_GLSL = /* glsl */ `
#define PANE_THICKNESS ${f(PANE_THICKNESS)}
#define ARRIS_RADIUS ${f(ARRIS_RADIUS)}
#define SIDE_ABSORB vec3(${SIDE_ABSORB.map(f).join(", ")})
#define BAR_THINNER ${f(BAR_THINNER)}
#define SIDE_PATH_MIN ${f(SIDE_PATH_MIN)}
#define SIDE_PATH_GUIDED ${f(SIDE_PATH_GUIDED)}
#define SIDE_GUIDED_DEPTH ${f(SIDE_GUIDED_DEPTH)}
#define FAR_ARRIS_LOSS ${f(FAR_ARRIS_LOSS)}
#define ECHO_GAIN ${f(ECHO_GAIN)}
#define RELAY_GAIN ${f(RELAY_GAIN)}

/* How wide a side face shows, CSS px, its edge offset px past the eye (edge-side.ts sideWidth). */
float sideWidth(float offset, float thickness, float bar, float distance) {
  float t = max(thickness, 0.0) * (bar > 0.5 ? BAR_THINNER : 1.0);
  return max(offset, 0.0) * t / (max(distance, 1.0) + t);
}

/* The inverse: how far past the eye an edge is whose face shows width px. */
float sideOffset(float width, float thickness, float bar, float distance) {
  float t = max(max(thickness, 0.0) * (bar > 0.5 ? BAR_THINNER : 1.0), 0.01);
  return width * (max(distance, 1.0) + t) / t;
}

/* Path length through the side at depth px in from the front arris. */
float sidePath(float depth) {
  return SIDE_PATH_MIN + SIDE_PATH_GUIDED * exp(-max(depth, 0.0) / SIDE_GUIDED_DEPTH);
}

/* How much of the side is window rather than the eased corner. */
float arrisEase(float depth) {
  float u = max(depth, 0.0) / ARRIS_RADIUS;
  return 1.0 - exp(-u * u);
}

vec3 sideTransmittance(float depth) {
  return 1.0 - (1.0 - exp(-SIDE_ABSORB * sidePath(depth))) * arrisEase(depth);
}

float farArrisLoss(float fromFar) {
  float u = fromFar / ARRIS_RADIUS;
  return FAR_ARRIS_LOSS * exp(-u * u);
}

/* How square-on the side is seen: cosine to its normal, from how tall it shows. */
float sideCosine(float side, float thickness) {
  float r = max(side, 0.0) / max(thickness, 1.0);
  return r / sqrt(1.0 + r * r);
}

/* How far above the edge the side mirrors the photograph, CSS pixels. */
float mirrorReach(float depth, float side, float gap, float thickness) {
  return side * (1.0 + max(gap, 0.0) / max(thickness, 1.0)) - depth;
}

/* GGX integrated across the arris's arc, averaged over it. */
float arrisLine(float phi, float alpha) {
  float a2 = alpha * alpha;
  return a2 / (2.0 * pow(a2 + phi * phi, 1.5)) / 1.57079632679;
}

/* The lamp mirrored by the arris at p, outward edge normal g. */
float arrisGlint(vec2 p, vec2 g, vec3 lamp, float lampRadius, vec3 eye,
                 float alpha, float power, float ior) {
  vec3 P = vec3(p, 0.0);
  vec3 toLamp = lamp - P;
  float d2 = dot(toLamp, toLamp);
  vec3 l = normalize(toLamp);
  vec3 v = normalize(eye - P);
  vec3 h = normalize(l + v);
  float across = dot(h.xy, g);
  float along = dot(h.xy, vec2(-g.y, g.x));
  float theta = atan(across, h.z);
  float inArc = step(0.0, theta) * step(theta, 1.57079632679);
  float phi = asin(min(1.0, abs(along)));
  float alphaEff = length(vec2(alpha, lampRadius / sqrt(d2)));
  float fr = fresnelSchlick(dot(v, h), ior);
  return inArc * fr * arrisLine(phi, alphaEff) * 0.25 * power / d2;
}

float arrisProfile(float distance) {
  float u = distance / ARRIS_RADIUS;
  return exp(-u * u);
}

float echoProfile(float depth, float side) {
  float u = (depth - 2.0 * side) / ARRIS_RADIUS;
  return exp(-u * u);
}
`;
