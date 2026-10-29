'use client';
// Light on The Wire's grid (Ony, 29 Oct: "a subtle wave of glow that pulses throughout but just on the grid lines";
// "the glow doesn't look like real light. And I built that light engine effects for a reason"; "a light blue").
// The grid is lit by lamps behind the map, with the OnySnow light engine's model (ADR-0009): each lamp's colour is the
// engine's blackbody colour at a cool temperature (effects/light/blackbody), and the lines it reaches are lit by
// inverse-square falloff and Lambert's cosine law (E = I cos θ / d², light catalogue §3.1), so a lamp makes a pool that
// fades the way real light does. A slow pulse leaves each lamp as a widening ring. The glow round a lit line is the
// line seen through the lens: a Gaussian spread of the line itself, which for a thin line is exp(−d²/2σ²) of its distance.
// Exposure is the engine's camera rule, 1 − e^(−E), and its linear colour is shown in sRGB. Only lines are lit: the
// spaces between them stay dark.
// Like the AI run's bloom (ADR-0013) it is one canvas and one draw a frame. It draws only with Effects Full and normal
// motion, never under reduced motion, and only where WebGL works; otherwise the grid is still.
import {useEffect, useRef} from 'react';
import type {ReactElement, RefObject} from 'react';

import {blackbodyRgb} from '@fx/effects/light/blackbody';

/** The lamps' colour temperature: past daylight (6500 K) a blackbody turns pale blue. */
export const GRID_LAMP_KELVIN = 16000;

const VERT = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const FRAG = `precision mediump float;
uniform vec2 u_res; uniform float u_dpr; uniform float u_gs; uniform vec2 u_off; uniform vec3 u_col; uniform float u_t;
uniform vec4 u_lamp[2];
float lineDist(vec2 p) { vec2 q = mod(p - u_off, u_gs); vec2 d = min(q, u_gs - q); return min(d.x, d.y); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
  float d = lineDist(p);
  float core = clamp(1.0 - d, 0.0, 1.0);
  float glow = exp(-d * d / (2.0 * 2.6 * 2.6));
  float E = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 L = u_lamp[i];
    vec3 v = vec3(L.xy - p, L.z);
    float r2 = dot(v, v);
    float lambert = L.z / sqrt(r2);
    float irr = L.z * L.z * lambert / r2;            // E = I cos(theta) / d^2, 1 straight under the lamp
    float r = length(L.xy - p);
    float ring = mod(u_t * 150.0 + float(i) * 420.0, 900.0);
    float pulse = exp(-(r - ring) * (r - ring) / (2.0 * 60.0 * 60.0)) * (1.0 - ring / 900.0);
    E += L.w * irr * (1.0 + 0.6 * pulse);
  }
  float lit = 1.0 - exp(-E * (core + glow * 0.35));
  vec3 c = pow(u_col, vec3(1.0 / 2.2));                // the engine's colour is linear; the screen is sRGB
  gl_FragColor = vec4(c * lit, lit);
}`;

export function GridLight({grid}: {grid: RefObject<HTMLElement | null>}): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = canvas.current;
    const gl = cv?.getContext('webgl', {premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false});
    if (!cv || !gl || gl.isContextLost()) return undefined;
    const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const loc = {res: u('u_res'), dpr: u('u_dpr'), gs: u('u_gs'), off: u('u_off'), col: u('u_col'), t: u('u_t'), lamp: u('u_lamp')};
    const [r, g, b] = blackbodyRgb(GRID_LAMP_KELVIN);
    gl.uniform3f(loc.col, r, g, b);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const box = cv.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      // The grid's own place, as the engine moves it (the grid sits far behind the map).
      const st = grid.current?.style;
      const px = (name: string, fallback: number) => parseFloat(st?.getPropertyValue(name) ?? '') || fallback;
      const t = (performance.now() - t0) / 1000, W = box.width, H = box.height;
      // Two lamps drift slowly behind the grid, each breathing; one bright, one a dim fill.
      const lamps = [
        W * (0.5 + 0.42 * Math.sin(t * 0.05)), H * (0.48 + 0.34 * Math.sin(t * 0.083 + 1.2)), 210, 0.42 + 0.14 * Math.sin(t * 0.7),
        W * (0.5 + 0.4 * Math.sin(t * 0.037 + 2.6)), H * (0.5 + 0.3 * Math.cos(t * 0.061)), 260, 0.2 + 0.07 * Math.sin(t * 0.53 + 1),
      ];
      gl.uniform2f(loc.res, w, h); gl.uniform1f(loc.dpr, dpr);
      gl.uniform1f(loc.gs, px('--gs', 48)); gl.uniform2f(loc.off, px('--gx', 0), px('--gy', 0));
      gl.uniform1f(loc.t, t); gl.uniform4fv(loc.lamp, new Float32Array(lamps));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [grid]);
  return <canvas ref={canvas} className="tw-grid-light" aria-hidden="true"/>;
}
