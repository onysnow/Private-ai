/**
 * The lights, as a shader sees them (light-system design, step B).
 *
 * Every pass that draws light declares the same arrays and loops over them,
 * so a light added to the list (effects/light/lights.ts) reaches every pass
 * with no new code. Today the list the passes draw holds one light, the
 * cursor's lamp, and the loops run once -- which is why nothing on the page
 * changed when they arrived.
 *
 * WebGL1 has no uniform buffers, so the lights are plain arrays. MAX_LIGHTS
 * is kept small: each light costs 4 vec4-equivalents of uniform space and
 * one trip round each loop per lit pixel.
 */

import { BEAM_HOT, BEAM_SPILL, BEAM_SPILL_SHARE } from "./beam";

export const MAX_LIGHTS = 4;

/** The declarations every light-drawing shader includes. */
export const LIGHTS_GLSL = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform int   uLightCount;                 // how many of the arrays are in use
uniform vec3  uLightPos[MAX_LIGHTS];       // x, y (viewport CSS px), height above the receiver
uniform vec3  uLightColour[MAX_LIGHTS];    // linear RGB
uniform float uLightPower[MAX_LIGHTS];     // radiant power (glass) or gain (lens)
uniform float uLightRadius[MAX_LIGHTS];    // the source's radius, CSS px
uniform float uLightCharge[MAX_LIGHTS];    // how hard it is burning, 0 to 1
uniform float uLightUv[MAX_LIGHTS];        // how much of its output is ultraviolet, 0 to 1
uniform vec2  uLightSpan[MAX_LIGHTS];      // half a line light's length, as a vector (0 for a point)
uniform vec4  uLightAim[MAX_LIGHTS];       // a beam's direction (z up) and w 1; w 0 shines all round

/*
 * How much of a beam reaches along d from its light (effects/light/beam.ts
 * beamFactor, the twin): a super-Gaussian hotspot half as bright at
 * BEAM_HOT off its axis, and a dim spill cut off at the reflector's lip.
 * A light with no aim (w 0) gives 1 everywhere. Called with uLightAim[i]
 * inside a loop over the lights.
 */
float beamFactor(vec4 aim, vec3 d) {
  if (aim.w < 0.5) return 1.0;
  float len = length(d);
  if (len < 1e-6) return 1.0;
  float theta = acos(clamp(dot(aim.xyz, d) / len, -1.0, 1.0));
  float hot = exp(-0.69314718 * pow(theta / ${BEAM_HOT.toFixed(6)}, 4.0));
  float spill = ${BEAM_SPILL_SHARE.toFixed(4)} * (1.0 - smoothstep(${(BEAM_SPILL * 0.9).toFixed(6)}, ${BEAM_SPILL.toFixed(6)}, theta));
  return hot + spill;
}

/*
 * Where a light reaches p from: its position c for a point light; for a line
 * light (a neon tube) the nearest point on its segment, c +- h, which is
 * where most of the light arriving at p comes from. A zero h is the point.
 * Called as nearestOnLight(p, uLightPos[i].xy, uLightSpan[i]) inside a loop
 * over the lights: GLSL ES 1.0 only lets a loop index address a uniform array.
 */
vec2 nearestOnLight(vec2 p, vec2 c, vec2 h) {
  float len2 = dot(h, h);
  if (len2 < 1e-6) return c;
  float t = clamp(dot(p - c, h) / len2, -1.0, 1.0);
  return c + h * t;
}
`;

/** One light, packed for a pass: already resolved to that pass's receiver. */
export type PackedLight = {
  x: number;
  y: number;
  /** Height above whatever this pass lights (the glass, or the photographs). */
  height: number;
  colour: readonly [number, number, number];
  power: number;
  radius: number;
  charge: number;
  /** How much of its output is ultraviolet (Light.uv); 0 if left out. */
  uv?: number;
  /** Half a line light's length, as a vector (Light.span); a point if left out. */
  span?: readonly [number, number] | undefined;
  /** A beam's direction (Light.aim); all round if left out. */
  aim?: readonly [number, number, number] | undefined;
};

export type LightLocations = {
  count: WebGLUniformLocation | null;
  pos: WebGLUniformLocation | null;
  colour: WebGLUniformLocation | null;
  power: WebGLUniformLocation | null;
  radius: WebGLUniformLocation | null;
  charge: WebGLUniformLocation | null;
  uv: WebGLUniformLocation | null;
  span: WebGLUniformLocation | null;
  aim: WebGLUniformLocation | null;
};

export function lightLocations(gl: WebGLRenderingContext, program: WebGLProgram): LightLocations {
  const U = (name: string) => gl.getUniformLocation(program, name);
  return {
    count: U("uLightCount"),
    pos: U("uLightPos"),
    colour: U("uLightColour"),
    power: U("uLightPower"),
    radius: U("uLightRadius"),
    charge: U("uLightCharge"),
    uv: U("uLightUv"),
    span: U("uLightSpan"),
    aim: U("uLightAim"),
  };
}

/* Scratch arrays, allocated once: uploaded per pane per frame. */
const pos = new Float32Array(MAX_LIGHTS * 3);
const colour = new Float32Array(MAX_LIGHTS * 3);
const power = new Float32Array(MAX_LIGHTS);
const radius = new Float32Array(MAX_LIGHTS);
const charge = new Float32Array(MAX_LIGHTS);
const uv = new Float32Array(MAX_LIGHTS);
const span = new Float32Array(MAX_LIGHTS * 2);
const aim = new Float32Array(MAX_LIGHTS * 4);

/** Upload up to MAX_LIGHTS lights; the program must be in use. */
export function uploadLights(
  gl: WebGLRenderingContext,
  loc: LightLocations,
  lights: readonly PackedLight[],
) {
  const n = Math.min(lights.length, MAX_LIGHTS);
  for (let i = 0; i < n; i++) {
    const l = lights[i]!;
    pos[i * 3] = l.x;
    pos[i * 3 + 1] = l.y;
    pos[i * 3 + 2] = l.height;
    colour[i * 3] = l.colour[0];
    colour[i * 3 + 1] = l.colour[1];
    colour[i * 3 + 2] = l.colour[2];
    power[i] = l.power;
    radius[i] = l.radius;
    charge[i] = l.charge;
    uv[i] = l.uv ?? 0;
    span[i * 2] = l.span?.[0] ?? 0;
    span[i * 2 + 1] = l.span?.[1] ?? 0;
    aim[i * 4] = l.aim?.[0] ?? 0;
    aim[i * 4 + 1] = l.aim?.[1] ?? 0;
    aim[i * 4 + 2] = l.aim?.[2] ?? 0;
    aim[i * 4 + 3] = l.aim ? 1 : 0;
  }
  for (let i = n; i < MAX_LIGHTS; i++) {
    uv[i] = 0;
    span[i * 2] = 0;
    span[i * 2 + 1] = 0;
    aim[i * 4 + 3] = 0;
  }
  gl.uniform1i(loc.count, n);
  gl.uniform3fv(loc.pos, pos);
  gl.uniform3fv(loc.colour, colour);
  gl.uniform1fv(loc.power, power);
  gl.uniform1fv(loc.radius, radius);
  gl.uniform1fv(loc.charge, charge);
  gl.uniform1fv(loc.uv, uv);
  gl.uniform2fv(loc.span, span);
  gl.uniform4fv(loc.aim, aim);
}

/** The TS twin of nearestOnLight in LIGHTS_GLSL. */
export function nearestOnLight(
  p: readonly [number, number],
  centre: readonly [number, number],
  span: readonly [number, number] = [0, 0],
): [number, number] {
  const len2 = span[0] * span[0] + span[1] * span[1];
  if (len2 < 1e-6) return [centre[0], centre[1]];
  const t = Math.max(
    -1,
    Math.min(1, ((p[0] - centre[0]) * span[0] + (p[1] - centre[1]) * span[1]) / len2),
  );
  return [centre[0] + span[0] * t, centre[1] + span[1] * t];
}
