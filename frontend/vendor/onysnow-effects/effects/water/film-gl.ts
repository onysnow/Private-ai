/**
 * The thin-film water (film.ts) on the GPU: the same equations, a pass per
 * stage, ping-ponged float textures. A pane's water is a height texture H
 * (nx x ny cells, R = depth mm) and a velocity texture V ((nx+1) x (ny+1):
 * R = u on the cell's left face, G = v on its top face). Each substep:
 *
 *   1. velocity: carry momentum with the water (semi-Lagrangian), then the
 *      forces on every face -- pressure difference (Laplace + disjoining,
 *      computed inline from H), gravity, wind's shear, drag, and the
 *      contact line's grip (static friction, stronger receding);
 *   2. mass: donor-cell fluxes through the four faces, new drops landing
 *      (spherical caps), evaporation, the open bottom edge.
 *
 * Then a map pass writes the drops map the optics read (water.glsl
 * shadeWater): height, the surface's slope, coverage.
 */
import { buildProgram } from "@fx/effects/engine/gl";
import { G, GAMMA, NU, RHO } from "./film";

const VERT = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const COMMON = /* glsl */ `
precision highp float;
uniform sampler2D uH;
uniform sampler2D uV;
uniform sampler2D uGrip;
uniform vec2 uN;        // nx, ny
uniform float uDx;      // mm
uniform float uB;       // precursor, mm
float hAt(float i, float j) {
  vec2 c = clamp(vec2(i, j), vec2(0.0), uN - 1.0);
  return texture2D(uH, (c + 0.5) / uN).r;
}
vec2 vAt(float i, float j) {
  vec2 c = clamp(vec2(i, j), vec2(0.0), uN);
  return texture2D(uV, (c + 0.5) / (uN + 1.0)).rg;
}
float gripAt(float i, float j) {
  vec2 c = clamp(vec2(i, j), vec2(0.0), uN - 1.0);
  return texture2D(uGrip, (c + 0.5) / uN).r * 2.0;
}
`;

const VEL_FRAG = /* glsl */ `
${COMMON}
uniform float uDt;
uniform float uKappa;   // disjoining pressure scale
uniform float uGamma;
uniform float uRho;
uniform float uNu;
uniform vec2 uGrav;     // mm/s^2 along the pane
uniform vec2 uWind;     // shear, mg/(mm s^2)
uniform float uLineDrag;
uniform float uPin;
uniform float uRecede;
uniform float uNuH;     // viscous stress across the surface, mm^2/s (smooths ripples at the grid's scale)
float pressure(float i, float j) {
  float h = hAt(i, j);
  float lap = (hAt(i + 1.0, j) + hAt(i - 1.0, j) + hAt(i, j + 1.0) + hAt(i, j - 1.0) - 4.0 * h) / (uDx * uDx);
  float r = uB / max(h, uB * 0.2);
  return -uGamma * lap - uKappa * gripAt(i, j) * (r * r * r - r * r);
}
bool dryAt(float i, float j) { return hAt(i, j) <= uB * 1.5; }
bool edgeAt(float i, float j) {
  if (dryAt(i, j)) return false;
  return dryAt(i + 1.0, j) || dryAt(i - 1.0, j) || dryAt(i, j + 1.0) || (j > 0.0 && dryAt(i, j - 1.0));
}
// u at a point in cell units (u(i, j) sits at (i, j + 0.5)), bilinear.
float sampleU(vec2 p) {
  vec2 f = vec2(clamp(p.x, 0.0, uN.x - 0.001), clamp(p.y - 0.5, 0.0, uN.y - 1.001));
  vec2 i0 = floor(f);
  vec2 s = f - i0;
  return mix(mix(vAt(i0.x, i0.y).r, vAt(i0.x + 1.0, i0.y).r, s.x), mix(vAt(i0.x, i0.y + 1.0).r, vAt(i0.x + 1.0, i0.y + 1.0).r, s.x), s.y);
}
// v at a point (v(i, j) sits at (i + 0.5, j)).
float sampleV(vec2 p) {
  vec2 f = vec2(clamp(p.x - 0.5, 0.0, uN.x - 1.001), clamp(p.y, 0.0, uN.y - 0.001));
  vec2 i0 = floor(f);
  vec2 s = f - i0;
  return mix(mix(vAt(i0.x, i0.y).g, vAt(i0.x + 1.0, i0.y).g, s.x), mix(vAt(i0.x, i0.y + 1.0).g, vAt(i0.x + 1.0, i0.y + 1.0).g, s.x), s.y);
}
// The face's new velocity: forces, drag, and the contact line's grip.
float faceVel(float vel, float a, float iL, float jL, float iR, float jR) {
  float hL = hAt(iL, jL);
  float hR = hAt(iR, jR);
  float hf = 0.5 * (hL + hR);
  float drag = 3.0 * uNu / (hf * hf) + uLineDrag * abs(hR - hL) / uDx / hf;
  float n = (vel + a * uDt) / (1.0 + drag * uDt);
  float dry = uB * 1.5;
  float g = 0.0;
  if (min(hL, hR) <= dry) g = uPin;
  else if (n > 0.0 ? edgeAt(iL, jL) : edgeAt(iR, jR)) g = uPin * uRecede;
  if (g > 0.0) {
    float hold = g * 0.5 * (gripAt(iL, jL) + gripAt(iR, jR)) * uDt;
    float sp = abs(n);
    n = sp <= hold ? 0.0 : n * ((sp - hold) / sp);
  }
  return n;
}
void main() {
  vec2 ij = floor(gl_FragCoord.xy);
  float i = ij.x;
  float j = ij.y;
  float c = uDt / uDx;
  float dry = uB * 1.5;
  float un = 0.0;
  float vn = 0.0;
  // u on the face between cells (i-1, j) and (i, j).
  if (j < uN.y && i > 0.0 && i < uN.x) {
    float hL = hAt(i - 1.0, j);
    float hR = hAt(i, j);
    if (max(hL, hR) > dry) {
      vec2 p = vec2(i, j + 0.5);
      float u0 = vAt(i, j).r;
      float adv = sampleU(p - vec2(u0, sampleV(p)) * c);
      float hf = 0.5 * (hL + hR);
      float a = -(pressure(i, j) - pressure(i - 1.0, j)) / (uDx * uRho) + uGrav.x + uWind.x / (uRho * hf);
      a += uNuH * (vAt(i + 1.0, j).r + vAt(i - 1.0, j).r + vAt(i, j + 1.0).r + vAt(i, j - 1.0).r - 4.0 * u0) / (uDx * uDx);
      un = faceVel(adv, a, i - 1.0, j, i, j);
    }
  }
  // v on the face between cells (i, j-1) and (i, j); the bottom edge open.
  if (i < uN.x && j > 0.0) {
    float hT = hAt(i, j - 1.0);
    if (j >= uN.y) {
      float v0 = vAt(i, j).g;
      vn = hT > dry ? max(0.0, (v0 + uGrav.y * uDt) / (1.0 + 3.0 * uNu / (hT * hT) * uDt)) : 0.0;
    } else {
      float hB = hAt(i, j);
      if (max(hT, hB) > dry) {
        vec2 p = vec2(i + 0.5, j);
        float v0 = vAt(i, j).g;
        float adv = sampleV(p - vec2(sampleU(p), v0) * c);
        float hf = 0.5 * (hT + hB);
        float a = -(pressure(i, j) - pressure(i, j - 1.0)) / (uDx * uRho) + uGrav.y + uWind.y / (uRho * hf);
        a += uNuH * (vAt(i + 1.0, j).g + vAt(i - 1.0, j).g + vAt(i, j + 1.0).g + vAt(i, j - 1.0).g - 4.0 * v0) / (uDx * uDx);
        vn = faceVel(adv, a, i, j - 1.0, i, j);
      }
    }
  }
  gl_FragColor = vec4(un, vn, 0.0, 1.0);
}
`;

const MAX_LAND = 16;

const MASS_FRAG = /* glsl */ `
${COMMON}
uniform float uDt;
uniform float uEvap;
uniform vec4 uLand[${MAX_LAND}]; // x, y mm, contact radius a, sphere radius R
uniform float uLandCos[${MAX_LAND}]; // R cos(theta): the cap's base below the sphere's centre
uniform int uLandN;
float donor(float vel, float hFrom, float hTo) {
  return vel > 0.0 ? vel * max(0.0, hFrom - uB) : vel * max(0.0, hTo - uB);
}
void main() {
  vec2 ij = floor(gl_FragCoord.xy);
  float i = ij.x;
  float j = ij.y;
  float h = hAt(i, j);
  float qL = donor(vAt(i, j).r, hAt(i - 1.0, j), h);
  float qR = donor(vAt(i + 1.0, j).r, h, hAt(i + 1.0, j));
  float qT = donor(vAt(i, j).g, hAt(i, j - 1.0), h);
  float vb = vAt(i, j + 1.0).g;
  float qB = j >= uN.y - 1.0 ? max(0.0, vb) * max(0.0, h - uB) : donor(vb, h, hAt(i, j + 1.0));
  float hn = h + (qL - qR + qT - qB) * uDt / uDx;
  if (hn > uB * 1.5) hn -= uEvap * uDt;
  // Rain landing: a spherical cap at the glass's contact angle.
  vec2 mm = (ij + 0.5) * uDx;
  for (int k = 0; k < ${MAX_LAND}; k++) {
    if (k >= uLandN) break;
    vec4 d = uLand[k];
    float r2 = dot(mm - d.xy, mm - d.xy);
    if (r2 < d.z * d.z) hn += sqrt(d.w * d.w - r2) - uLandCos[k];
  }
  gl_FragColor = vec4(max(uB, hn), 0.0, 0.0, 1.0);
}
`;

const MAP_FRAG = /* glsl */ `
${COMMON}
uniform vec2 uMapSize;   // map px
uniform float uPxPerMm;  // map px per mm
uniform float uHeightScale;
/*
 * The surface rebuilt from the cells as a cubic B-spline: smooth through
 * its slope and curvature, so the lens a drop makes has no creases at the
 * cell edges (bilinear did: faceted drops with noisy insides). The slope
 * comes from the same spline's derivative.
 */
vec4 bw(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4((1.0 - t) * (1.0 - t) * (1.0 - t), 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
}
vec4 bd(float t) {
  float t2 = t * t;
  return vec4(-(1.0 - t) * (1.0 - t), 3.0 * t2 * 3.0 / 3.0 - 4.0 * t, -3.0 * t2 + 2.0 * t + 1.0, t2) * 0.5;
}
// Height, d/dx, d/dy (per cell) at a point in cell units.
vec3 spline(vec2 f) {
  vec2 i0 = floor(f);
  vec2 t = f - i0;
  vec4 wx = bw(t.x);
  vec4 wy = bw(t.y);
  vec4 dx = bd(t.x);
  vec4 dy = bd(t.y);
  float h = 0.0;
  float gx = 0.0;
  float gy = 0.0;
  for (int b = 0; b < 4; b++) {
    float jj = i0.y + float(b) - 1.0;
    vec4 row = vec4(hAt(i0.x - 1.0, jj), hAt(i0.x, jj), hAt(i0.x + 1.0, jj), hAt(i0.x + 2.0, jj));
    float ry = b == 0 ? wy.x : b == 1 ? wy.y : b == 2 ? wy.z : wy.w;
    float rdy = b == 0 ? dy.x : b == 1 ? dy.y : b == 2 ? dy.z : dy.w;
    h += dot(row, wx) * ry;
    gx += dot(row, dx) * ry;
    gy += dot(row, wx) * rdy;
  }
  return vec3(h, gx, gy);
}
void main() {
  // The map's rows run with the pane's mm from its top, as the fluid's cells do.
  vec2 mm = gl_FragCoord.xy / uPxPerMm;
  vec3 s = spline(mm / uDx - 0.5);
  float h = s.x;
  float dry = uB * 1.5;
  float cover = smoothstep(dry, dry + 0.04, h);
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float tanT = length(s.yz) / uDx;
  gl_FragColor = vec4(max(h - uB, 0.0) * uHeightScale * cover, 0.0, min(tanT, 3.9) * 0.25 * cover, cover);
}
`;

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer };

/** The float type the GPU can render the fluid into: full float, or half; null if neither. */
export function filmTextureType(gl: WebGLRenderingContext): number | null {
  const probe = (type: number) => {
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return ok;
  };
  if (gl.getExtension("OES_texture_float")) {
    gl.getExtension("WEBGL_color_buffer_float");
    if (probe(gl.FLOAT)) return gl.FLOAT;
  }
  const half = gl.getExtension("OES_texture_half_float");
  if (half) {
    gl.getExtension("EXT_color_buffer_half_float");
    if (probe(half.HALF_FLOAT_OES)) return half.HALF_FLOAT_OES;
  }
  return null;
}

export type FilmParams = {
  theta: number;
  b: number;
  lineDrag: number;
  pin: number;
  recede: number;
  gripVary: number;
  evaporation: number;
  nuH: number;
  gravity: [number, number];
  wind: [number, number];
};

export const FILM_DEFAULTS: FilmParams = {
  theta: 60,
  b: 0.05,
  lineDrag: 300,
  pin: 120000,
  recede: 1.5,
  gripVary: 0.5,
  evaporation: 0,
  nuH: 8,
  gravity: [0, G],
  wind: [0, 0],
};

/** One pane's water as a fluid on the GPU. */
export class FilmGpu {
  readonly nx: number;
  readonly ny: number;
  readonly dx: number;
  params: FilmParams = { ...FILM_DEFAULTS };
  time = 0;
  private h: [Target, Target];
  private v: [Target, Target];
  private grip: WebGLTexture;
  private cur = 0;
  private pending: number[] = [];
  private readonly gl: WebGLRenderingContext;
  private readonly tri: WebGLBuffer;
  private readonly velP: WebGLProgram;
  private readonly massP: WebGLProgram;
  private readonly mapP: WebGLProgram;
  private readonly loc = new Map<string, WebGLUniformLocation | null>();

  /** null where the GPU cannot render floats (the rule-based water stays). */
  static create(
    gl: WebGLRenderingContext,
    widthMm: number,
    heightMm: number,
    cell = 0.4,
    seed = 1,
  ): FilmGpu | null {
    const type = filmTextureType(gl);
    if (type === null) return null;
    const velP = buildProgram(gl, VERT, VEL_FRAG, "film velocity");
    const massP = buildProgram(gl, VERT, MASS_FRAG, "film mass");
    const mapP = buildProgram(gl, VERT, MAP_FRAG, "film map");
    if (!velP || !massP || !mapP) return null;
    return new FilmGpu(gl, type, widthMm, heightMm, cell, seed, velP, massP, mapP);
  }

  private constructor(
    gl: WebGLRenderingContext,
    type: number,
    widthMm: number,
    heightMm: number,
    cell: number,
    seed: number,
    velP: WebGLProgram,
    massP: WebGLProgram,
    mapP: WebGLProgram,
  ) {
    this.gl = gl;
    this.dx = cell;
    this.nx = Math.ceil(widthMm / cell);
    this.ny = Math.ceil(heightMm / cell);
    this.velP = velP;
    this.massP = massP;
    this.mapP = mapP;
    const make = (w: number, h: number, data: Float32Array | null): Target => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // Float data uploads only for full float; half float starts from a clear and a fill pass.
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        type,
        type === gl.FLOAT ? data : null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo };
    };
    this.h = [make(this.nx, this.ny, null), make(this.nx, this.ny, null)];
    this.v = [make(this.nx + 1, this.ny + 1, null), make(this.nx + 1, this.ny + 1, null)];
    // Start: the precursor film everywhere, still.
    for (const t of this.h) this.fill(t, this.params.b);
    for (const t of this.v) this.fill(t, 0);
    // The dirt on the glass: the grip, an 8-bit texture (grip / 2).
    this.grip = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.grip);
    const g = new Uint8Array(this.nx * this.ny * 4);
    const grip = gripField(this.nx, this.ny, cell, seed, this.params.gripVary);
    for (let k = 0; k < grip.length; k++)
      g[k * 4] = Math.round(Math.min(255, (grip[k]! / 2) * 255));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, g);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tri = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  private fill(t: Target, value: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.clearColor(value, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** A drop of `volume` uL lands at (x, y) mm (taken in at the next substep). */
  addDrop(x: number, y: number, volume: number) {
    this.pending.push(x, y, volume);
  }

  /** The largest stable substep, s (capillary waves at this cell size). */
  maxDt(): number {
    return 0.2 * Math.sqrt((RHO * this.dx ** 3) / (2 * Math.PI * GAMMA));
  }

  private u(p: WebGLProgram, name: string) {
    const key = `${p === this.velP ? "v" : p === this.massP ? "m" : "p"}:${name}`;
    if (!this.loc.has(key)) this.loc.set(key, this.gl.getUniformLocation(p, name));
    return this.loc.get(key) ?? null;
  }

  private bindCommon(p: WebGLProgram) {
    const gl = this.gl;
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.h[this.cur]!.tex);
    gl.uniform1i(this.u(p, "uH"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.v[this.cur]!.tex);
    gl.uniform1i(this.u(p, "uV"), 1);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.grip);
    gl.uniform1i(this.u(p, "uGrip"), 3);
    gl.uniform2f(this.u(p, "uN"), this.nx, this.ny);
    gl.uniform1f(this.u(p, "uDx"), this.dx);
    gl.uniform1f(this.u(p, "uB"), this.params.b);
    const pos = gl.getAttribLocation(p, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    return pos;
  }

  /** Advance dt seconds, at most `maxSteps` substeps (slower than real time on a slow GPU, never unstable). */
  step(dt: number, maxSteps = 400) {
    const gl = this.gl;
    const sub = this.maxDt();
    const n = Math.min(maxSteps, Math.max(1, Math.ceil(dt / sub)));
    const s = Math.min(sub, dt / n);
    const pr = this.params;
    const th = (pr.theta * Math.PI) / 180;
    const kappa = (GAMMA * (1 - Math.cos(th))) / (pr.b * 0.5);
    gl.disable(gl.BLEND);
    for (let k = 0; k < n; k++) {
      const next = 1 - this.cur;
      // 1. velocity
      let pos = this.bindCommon(this.velP);
      const vp = this.velP;
      gl.uniform1f(this.u(vp, "uDt"), s);
      gl.uniform1f(this.u(vp, "uKappa"), kappa);
      gl.uniform1f(this.u(vp, "uGamma"), GAMMA);
      gl.uniform1f(this.u(vp, "uRho"), RHO);
      gl.uniform1f(this.u(vp, "uNu"), NU);
      gl.uniform2f(this.u(vp, "uGrav"), pr.gravity[0], pr.gravity[1]);
      gl.uniform2f(this.u(vp, "uWind"), pr.wind[0], pr.wind[1]);
      gl.uniform1f(this.u(vp, "uLineDrag"), pr.lineDrag);
      gl.uniform1f(this.u(vp, "uPin"), pr.pin);
      gl.uniform1f(this.u(vp, "uRecede"), pr.recede);
      gl.uniform1f(this.u(vp, "uNuH"), Math.min(pr.nuH, (0.2 * this.dx * this.dx) / s));
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.v[next]!.fbo);
      gl.viewport(0, 0, this.nx + 1, this.ny + 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(pos);
      // The new velocity is what the mass pass moves the water by.
      const vOld = this.v[this.cur]!;
      this.v[this.cur] = this.v[next]!;
      this.v[next] = vOld;
      // 2. mass
      pos = this.bindCommon(this.massP);
      const mp = this.massP;
      gl.uniform1f(this.u(mp, "uDt"), s);
      gl.uniform1f(this.u(mp, "uEvap"), pr.evaporation);
      const land = this.takeLandings(th);
      gl.uniform1i(this.u(mp, "uLandN"), land.n);
      if (land.n) {
        gl.uniform4fv(this.u(mp, "uLand"), land.caps);
        gl.uniform1fv(this.u(mp, "uLandCos"), land.base);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.h[next]!.fbo);
      gl.viewport(0, 0, this.nx, this.ny);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(pos);
      const hOld = this.h[this.cur]!;
      this.h[this.cur] = this.h[next]!;
      this.h[next] = hOld;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.time += s * n;
  }

  private takeLandings(th: number) {
    const caps = new Float32Array(MAX_LAND * 4);
    const base = new Float32Array(MAX_LAND);
    let n = 0;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    while (this.pending.length && n < MAX_LAND) {
      const [x, y, vol] = this.pending.splice(0, 3) as [number, number, number];
      // Contact radius of a cap holding vol at theta: V = pi a^3 (2 - 3c + c^3) / (3 s^3).
      const a = Math.cbrt((3 * vol * sn * sn * sn) / (Math.PI * (2 - 3 * c + c * c * c)));
      const R = a / sn;
      caps.set([x, y, a, R], n * 4);
      base[n] = R * c;
      n++;
    }
    return { caps, base, n };
  }

  /**
   * Write the drops map the optics read (water.glsl): R height (times
   * heightScale), B the surface's slope (tan / 4), A coverage. Into the
   * framebuffer bound by the caller, w x h px at pxPerMm.
   */
  drawMap(w: number, h: number, pxPerMm: number, heightScale: number) {
    const gl = this.gl;
    const p = this.mapP;
    const pos = this.bindCommon(p);
    gl.uniform2f(this.u(p, "uMapSize"), w, h);
    gl.uniform1f(this.u(p, "uPxPerMm"), pxPerMm);
    gl.uniform1f(this.u(p, "uHeightScale"), heightScale);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(pos);
  }

  /** Read the height field back (dev and tests), mm, row 0 at the pane's top. */
  readHeights(): Float32Array {
    const gl = this.gl;
    const out = new Float32Array(this.nx * this.ny * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.h[this.cur]!.fbo);
    gl.readPixels(0, 0, this.nx, this.ny, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const h = new Float32Array(this.nx * this.ny);
    for (let k = 0; k < h.length; k++) h[k] = out[k * 4]!;
    return h;
  }

  dispose() {
    const gl = this.gl;
    for (const t of [...this.h, ...this.v]) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    gl.deleteTexture(this.grip);
    gl.deleteBuffer(this.tri);
  }
}

/** The glass's dirt as a grip field (film.ts FilmSim.seedGrip, shared). */
export function gripField(
  nx: number,
  ny: number,
  dx: number,
  seed: number,
  vary: number,
): Float32Array {
  const hash = (a: number, b: number) => {
    let h =
      Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15 + seed * 7919, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x: number, y: number, scale: number, ch: number) => {
    const gx = x / scale;
    const gy = y / scale;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(i * 31 + ch, j);
    const b = hash(i * 31 + 31 + ch, j);
    const c = hash(i * 31 + ch, j + 1);
    const d = hash(i * 31 + 31 + ch, j + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
  const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const n = 0.6 * noise(i * dx, j * dx, 4, 1) + 0.4 * noise(i * dx, j * dx, 1.2, 2);
      out[j * nx + i] = 1 + vary * (2 * n - 1);
    }
  return out;
}
