/**
 * Solid glass objects (item 25g): a prism, a sphere, a cube, a cone, a
 * pyramid and a rod, as signed distance functions, and a ray traced through
 * them by the physics every glass surface here obeys (claude/tools-research.md
 * §2 "Glass solids", §3.4):
 *
 *   the surface is found by sphere-tracing the shape's distance function and
 *     refined by bisection, so the edges and apexes are exact;
 *   at each surface: Snell for the refracted ray, the exact unpolarised
 *     Fresnel split (effects/optics/beam), total internal reflection past the
 *     critical angle;
 *   the index at the ray's own wavelength, from the material's n_d and Abbe
 *     number (effects/optics/dispersion), which is what makes a prism fan
 *     white light into a spectrum;
 *   Beer-Lambert absorption along every path inside.
 *
 * Object space: the solid is centred on the origin, sized by `size` (its
 * half-extent, px), y up. This is the TS twin of solids.glsl.ts: the shader
 * raymarches the same functions per pixel; this one is what the tests hold
 * to the textbook cases (a ball lens's focal length, a prism's minimum
 * deviation, a slab's parallel exit).
 *
 * Pure and deterministic.
 */

import { fresnel } from "./beam";

export type V3 = { x: number; y: number; z: number };

export type SolidShape = "prism" | "sphere" | "cube" | "cone" | "pyramid" | "rod";

export const SOLID_SHAPES: readonly SolidShape[] = [
  "prism",
  "sphere",
  "cube",
  "cone",
  "pyramid",
  "rod",
];

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: V3, s: number): V3 => v(a.x * s, a.y * s, a.z * s);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V3) => Math.sqrt(dot(a, a));
const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));

/*
 * The distance functions (after Inigo Quilez's catalogue of exact SDFs,
 * iquilezles.org/articles/distfunctions). Each is exact or a bound, which is
 * all sphere tracing needs.
 */

function sdSphere(p: V3, r: number) {
  return len(p) - r;
}

function sdBox(p: V3, b: V3) {
  const qx = Math.abs(p.x) - b.x;
  const qy = Math.abs(p.y) - b.y;
  const qz = Math.abs(p.z) - b.z;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0);
}

/** A triangular prism: an equilateral triangle of circumradius `r` in x-y, `h` deep in z. */
function sdTriPrism(p: V3, r: number, h: number) {
  // Equilateral triangle, apex up, as the intersection of three half-planes.
  const inr = r / 2; // the inradius of an equilateral triangle is half its circumradius
  const k = Math.sqrt(3) / 2;
  // Apex up: the flat side is at the bottom, the other two lean in to the apex.
  const bottom = -p.y - inr;
  const right = k * p.x + 0.5 * p.y - inr;
  const left = -k * p.x + 0.5 * p.y - inr;
  const tri = Math.max(bottom, right, left);
  const depth = Math.abs(p.z) - h;
  return Math.max(tri, depth);
}

/** A capped cylinder along y: radius `r`, half-length `h`. */
function sdRod(p: V3, r: number, h: number) {
  const dx = Math.hypot(p.x, p.z) - r;
  const dy = Math.abs(p.y) - h;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

/** A cone standing on its base: base radius `r` at y = -h, apex at y = +h. */
function sdCone(p: V3, r: number, h: number) {
  // Distance to the slanted side in the (radial, y) half-plane, capped by the base.
  const q = Math.hypot(p.x, p.z);
  const slant = Math.hypot(r, 2 * h);
  // The side's outward normal in (q, y): (2h, r) / slant, through the point (r, -h).
  const side = ((q - r) * 2 * h + (p.y + h) * r) / slant;
  const base = -p.y - h;
  return Math.max(side, base);
}

/** A square pyramid standing on its base: half-width `r` at y = -h, apex at y = +h. */
function sdPyramid(p: V3, r: number, h: number) {
  const s = Math.hypot(r, 2 * h);
  const fx = ((Math.abs(p.x) - r) * 2 * h + (p.y + h) * r) / s;
  const fz = ((Math.abs(p.z) - r) * 2 * h + (p.y + h) * r) / s;
  const base = -p.y - h;
  return Math.max(fx, fz, base);
}

/**
 * The signed distance to a solid of the given shape and half-size (negative
 * inside). The polyhedra are the intersection of their faces' half-spaces --
 * a bound, not the exact distance off the edges, which sphere tracing takes
 * in its stride.
 */
export function solidDistance(shape: SolidShape, p: V3, size: number): number {
  switch (shape) {
    case "sphere":
      return sdSphere(p, size);
    case "cube":
      return sdBox(p, v(size, size, size));
    case "prism":
      return sdTriPrism(p, size, size);
    case "rod":
      return sdRod(p, size * 0.32, size);
    case "cone":
      return sdCone(p, size * 0.8, size);
    case "pyramid":
      return sdPyramid(p, size * 0.8, size);
  }
}

/** The outward normal at a point on the surface, by central differences. */
export function solidNormal(shape: SolidShape, p: V3, size: number): V3 {
  const e = size * 1e-4;
  return norm(
    v(
      solidDistance(shape, v(p.x + e, p.y, p.z), size) -
        solidDistance(shape, v(p.x - e, p.y, p.z), size),
      solidDistance(shape, v(p.x, p.y + e, p.z), size) -
        solidDistance(shape, v(p.x, p.y - e, p.z), size),
      solidDistance(shape, v(p.x, p.y, p.z + e), size) -
        solidDistance(shape, v(p.x, p.y, p.z - e), size),
    ),
  );
}

/** Where a ray first crosses the surface, entering (from outside) or leaving (from inside). */
export function solidCrossing(
  shape: SolidShape,
  size: number,
  o: V3,
  d: V3,
  fromInside: boolean,
  maxT = size * 8,
): number {
  const sign = fromInside ? -1 : 1;
  const floor = size * 1e-5;
  let t = fromInside ? size * 1e-3 : 0;
  let last = t;
  for (let i = 0; i < 400 && t < maxT; i++) {
    const s = sign * solidDistance(shape, add(o, scale(d, t)), size);
    if (s < floor) {
      // Refine between the last step and this one.
      let lo = last;
      let hi = t;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (sign * solidDistance(shape, add(o, scale(d, mid)), size) > 0) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    last = t;
    t += Math.max(s, floor * 4);
  }
  return Infinity;
}

function refract3(d: V3, n: V3, eta: number): V3 | null {
  const cosI = -dot(d, n);
  const sinT2 = eta * eta * (1 - cosI * cosI);
  if (sinT2 > 1) return null;
  const cosT = Math.sqrt(1 - sinT2);
  return add(scale(d, eta), scale(n, eta * cosI - cosT));
}

function reflect3(d: V3, n: V3): V3 {
  return add(d, scale(n, -2 * dot(d, n)));
}

export type SolidRay = {
  /** Where the ray leaves the solid and which way it goes, or null if it misses it. */
  exit: { at: V3; dir: V3 } | null;
  /** The share of the light that leaves along that path (Fresnel losses, Beer). */
  energy: number;
  /** Surfaces met (entering counts one). */
  bounces: number;
  /** Total path length inside, px. */
  inside: number;
};

/**
 * Follow the transmitted light through a solid: in by refraction, then at
 * each inner surface out if it can (the transmitted share), else totally
 * reflected, up to `maxBounces`. The weak Fresnel reflections off each
 * surface are dropped here (the shader adds them as reflections); the energy
 * says how much of the light made it through along this path.
 */
export function traceSolid(
  shape: SolidShape,
  size: number,
  origin: V3,
  direction: V3,
  n: number,
  absorb = 0,
  maxBounces = 6,
): SolidRay {
  let d = norm(direction);
  /*
   * From far off (a lamp), skip to the sphere every shape fits inside (a
   * cube's corner is the farthest, sqrt(3) of its half-size out), so the
   * surface search starts close.
   */
  const bound = size * 1.9;
  if (len(origin) > bound) {
    const b = dot(origin, d);
    const disc = b * b - (dot(origin, origin) - bound * bound);
    if (disc < 0 || -b + Math.sqrt(disc) < 0)
      return { exit: null, energy: 1, bounces: 0, inside: 0 };
    origin = add(origin, scale(d, Math.max(0, -b - Math.sqrt(disc))));
  }
  const tIn = solidCrossing(shape, size, origin, d, false);
  if (!Number.isFinite(tIn)) return { exit: null, energy: 1, bounces: 0, inside: 0 };
  let p = add(origin, scale(d, tIn));
  let nrm = solidNormal(shape, p, size);
  let cos = Math.min(1, Math.abs(dot(d, nrm)));
  let energy = 1 - fresnel(cos, 1, n);
  d = norm(refract3(d, nrm, 1 / n) ?? d);
  let inside = 0;
  for (let b = 1; b <= maxBounces; b++) {
    const t = solidCrossing(shape, size, p, d, true);
    if (!Number.isFinite(t)) break;
    inside += t;
    energy *= Math.exp(-absorb * t);
    p = add(p, scale(d, t));
    nrm = solidNormal(shape, p, size); // outward
    const inward = scale(nrm, -1);
    cos = Math.min(1, Math.abs(dot(d, nrm)));
    const R = fresnel(cos, n, 1);
    if (R < 1) {
      const out = refract3(d, inward, n);
      if (out) {
        return {
          exit: { at: p, dir: norm(out) },
          energy: energy * (1 - R),
          bounces: b + 1,
          inside,
        };
      }
    }
    // Totally reflected: stays inside.
    d = norm(reflect3(d, inward));
  }
  return { exit: null, energy: 0, bounces: maxBounces, inside };
}
