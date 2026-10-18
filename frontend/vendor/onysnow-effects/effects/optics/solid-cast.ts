/**
 * What a glass solid throws on the page under it (item 25g, step 3): its
 * shadow and its caustic, from one light.
 *
 * Glass does not stop light, it moves it. Where the solid bends light away
 * (its edges, the faces that send it off by total internal reflection)
 * the page gets less than it would -- the shadow, darkest under the rims.
 * Where it gathers light (a sphere is a lens, a prism's faces fold it) the
 * page gets more -- the caustic, the bright knot a glass paperweight throws
 * on a desk. Both are the same count: how much light lands on each patch of
 * page, over how much would have landed there with no solid.
 *
 * So it is counted. Rays leave the light for an even grid of points on the
 * page round where the solid's shadow falls; each is traced through the
 * solid by effects/optics/solids (refraction, Fresnel, total internal
 * reflection, absorption) and, where it comes out heading down, dropped on
 * the page where it lands, carrying what energy it has left. A ray that
 * misses lands where it was aimed. With no solid every cell gets one ray's
 * worth, so the tally per cell IS the ratio: below 1 shadow, above 1
 * caustic. This is photon splatting, the standard way caustics are made
 * (Jensen's photon mapping, in its simplest form).
 *
 * World: page px, z toward the viewer, the page at z = 0.
 */

import { traceSolid, type SolidShape, type V3 } from "./solids";

export type CastInput = {
  shape: SolidShape;
  size: number;
  /** The solid's centre, world. */
  centre: V3;
  /** Its axes in the world, as columns: object x, y, z (a 3x3, column-major). */
  toWorld: readonly number[];
  /** The light: where it is, world. */
  light: V3;
  n: number;
  /** Absorption per px. */
  absorb: number;
  /** Cells across the region. */
  cells?: number;
  /** Rays per cell, jittered. */
  perCell?: number;
};

export type Cast = {
  /** The region of page it covers: top-left and size, px. */
  x: number;
  y: number;
  w: number;
  h: number;
  cells: number;
  /** Light landed per cell over light that would have landed with no solid. */
  ratio: Float32Array;
};

/** A repeatable jitter in [0, 1). */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function castOf({
  shape,
  size,
  centre,
  toWorld: m,
  light,
  n,
  absorb,
  cells = 64,
  perCell = 1,
}: CastInput): Cast {
  // Where the solid's shadow falls: its centre projected from the light onto the page, grown.
  const lift = Math.max(light.z - centre.z, 1);
  const grow = light.z / lift;
  const px = light.x + (centre.x - light.x) * grow;
  const py = light.y + (centre.y - light.y) * grow;
  const half = size * 2.6 * grow;
  const x0 = px - half;
  const y0 = py - half;
  const cell = (half * 2) / cells;
  const ratio = new Float32Array(cells * cells);
  const unit = 1 / perCell;

  // World <-> object: M's columns are the object axes; its transpose takes world to object.
  const toObject = (v: V3): V3 => ({
    x: m[0]! * v.x + m[1]! * v.y + m[2]! * v.z,
    y: m[3]! * v.x + m[4]! * v.y + m[5]! * v.z,
    z: m[6]! * v.x + m[7]! * v.y + m[8]! * v.z,
  });
  const toWorldV = (v: V3): V3 => ({
    x: m[0]! * v.x + m[3]! * v.y + m[6]! * v.z,
    y: m[1]! * v.x + m[4]! * v.y + m[7]! * v.z,
    z: m[2]! * v.x + m[5]! * v.y + m[8]! * v.z,
  });
  const o = toObject({ x: light.x - centre.x, y: light.y - centre.y, z: light.z - centre.z });

  const drop = (x: number, y: number, energy: number) => {
    const i = Math.floor((x - x0) / cell);
    const j = Math.floor((y - y0) / cell);
    if (i < 0 || j < 0 || i >= cells || j >= cells) return;
    ratio[j * cells + i]! += energy * unit;
  };

  let k = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      for (let s = 0; s < perCell; s++, k++) {
        const tx = x0 + (i + hash(k)) * cell;
        const ty = y0 + (j + hash(k + 0.5)) * cell;
        const dw = { x: tx - light.x, y: ty - light.y, z: -light.z };
        const ray = traceSolid(shape, size, o, toObject(dw), n, absorb);
        if (ray.bounces === 0) {
          // Missed it: lands where it was aimed.
          drop(tx, ty, 1);
          continue;
        }
        if (!ray.exit) continue; // trapped
        const at = toWorldV(ray.exit.at);
        const dir = toWorldV(ray.exit.dir);
        const wx = at.x + centre.x;
        const wy = at.y + centre.y;
        const wz = at.z + centre.z;
        if (dir.z >= -1e-6) continue; // off up into the room
        const t = -wz / dir.z;
        drop(wx + dir.x * t, wy + dir.y * t, ray.energy);
      }
    }
  }
  return { x: x0, y: y0, w: half * 2, h: half * 2, cells, ratio };
}

/**
 * Smooth a count: a handful of rays per cell is noisy, and real caustics
 * from a lamp of some size are soft anyway -- the lamp's disc blurs them
 * by its size over its height, times the solid's height. A box filter,
 * `passes` times (three passes is close to a Gaussian); it moves light
 * about but neither makes nor loses any inside the region.
 */
export function smoothCast(cast: Cast, passes = 2): Cast {
  const n = cast.cells;
  let src = cast.ratio;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const y = j + dj;
          if (y < 0 || y >= n) continue;
          for (let di = -1; di <= 1; di++) {
            const x = i + di;
            if (x < 0 || x >= n) continue;
            sum += src[y * n + x]!;
            count += 1;
          }
        }
        dst[j * n + i] = sum / count;
      }
    }
    src = dst;
  }
  return { ...cast, ratio: src };
}
