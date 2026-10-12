import { ROOM_BOTTOM, ROOM_LMAX, ROOM_TOP } from "./environment";

/**
 * The GLSL twins of environment.ts. See that file for the physics.
 *
 * GLSL ES 1.0 with OES_standard_derivatives not required: the level of the
 * room image is chosen explicitly (texture2D with a bias from level 0, which
 * the room is magnified at, so the computed level is 0 and the bias IS the
 * level). Keep backticks out of the comments inside the literal.
 */
export const ENVIRONMENT_GLSL = /* glsl */ `
#define ROOM_LMAX ${ROOM_LMAX.toFixed(1)}
#define ROOM_TOP ${ROOM_TOP.toFixed(4)}
#define ROOM_BOTTOM ${ROOM_BOTTOM.toFixed(4)}

/* Decode the room's log-encoded radiance. */
vec3 decodeRadiance(vec3 v) {
  return exp2(v * log2(1.0 + ROOM_LMAX)) - 1.0;
}

/* Where a reflected direction lands in the room image; mirrored. (x right, y down, z toward the viewer) */
vec2 roomUvDir(vec3 r) {
  float yaw = atan(r.x, r.z);
  float pitch = atan(-r.y, length(r.xz));
  float u = 0.5 - yaw / 6.28318530718;
  float row = 0.5 - pitch / 3.14159265359;
  return vec2(u, (row - ROOM_TOP) / (ROOM_BOTTOM - ROOM_TOP));
}

/* Where a point on a flat pane reflects into the room image; mirrored. */
vec2 roomUv(vec2 p, float distance) {
  return roomUvDir(vec3(p, distance));
}

/* The mip level a reflection of roughness alpha samples, in a room width texels round. */
float roomLod(float alpha, float width) {
  return log2(max(alpha * width / 6.28318530718, 1.0));
}
`;
