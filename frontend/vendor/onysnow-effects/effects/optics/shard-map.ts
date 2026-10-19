/**
 * A broken pane's pieces, for the glass shader (item 10 step 3b,
 * ?try=broken,shardlight; claude/broken-glass-cracks.md).
 *
 * Each piece of a broken pane has taken on a slope of its own -- a few
 * tenths of a degree -- and the glass shader draws the room each piece
 * reflects, per pixel, with that piece's normal. A mirror turned by t turns
 * the reflected ray by 2t, so a piece tilted 0.4 degrees shows the room
 * 0.8 degrees further round: across the room image that is tens of pixels,
 * and the reflection breaks up piece by piece along the cracks, as it does
 * in a real broken window.
 *
 * What does NOT step at a crack is the view through: a tilted piece is still
 * a slab with parallel faces, and a ray through a parallel slab leaves as it
 * came, shifted sideways by only
 *
 *   d = t sin(theta) (1 - cos(theta) / sqrt(n^2 - sin^2(theta)))  ~  t theta (1 - 1/n)
 *
 * (Hecht, Optics, 4.3): for a pane 18 px thick tilted 0.4 degrees, 0.04 px.
 * So the pieces' tilt shows in what they reflect, not in what they show of
 * the photograph behind.
 *
 * The map: one texel per CSS px of the pane. R and G are the piece's slope
 * across and down (tan of its tilt about y and about x), 128 flat, a full
 * byte step TILT_PER_STEP; A is 1 where there is glass and 0 in a hole.
 */

import type { Pt } from "./fracture";

/** The slope one byte step of the map stands for: +-127 steps cover +-1.3 degrees. */
export const TILT_PER_STEP = 1.8e-4;

/** A slope as a map byte (128 flat). */
export function encodeSlope(slope: number): number {
  return Math.max(1, Math.min(255, Math.round(128 + slope / TILT_PER_STEP)));
}

/** A map byte as a slope. */
export function decodeSlope(byte: number): number {
  return (byte - 128) * TILT_PER_STEP;
}

/**
 * A piece's outward face normal from its tilts (radians about x and about y),
 * x right, y down, z toward the viewer. Twin of shardNormal in the shader.
 */
export function shardNormal(tiltX: number, tiltY: number): [number, number, number] {
  const sx = Math.tan(tiltY);
  const sy = Math.tan(tiltX);
  const l = Math.hypot(sx, sy, 1);
  return [sx / l, sy / l, 1 / l];
}

/** A ray `v` mirrored in a face of normal `n` (both unit): v - 2 (v.n) n. */
export function reflectRay(
  v: readonly [number, number, number],
  n: readonly [number, number, number],
): [number, number, number] {
  const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  return [v[0] - 2 * d * n[0], v[1] - 2 * d * n[1], v[2] - 2 * d * n[2]];
}

/** How far sideways a ray is shifted crossing a slab of thickness t at theta to its normal. */
export function slabShift(t: number, theta: number, n: number): number {
  const s = Math.sin(theta);
  return t * s * (1 - Math.cos(theta) / Math.sqrt(n * n - s * s));
}

export type MapPiece = {
  poly: readonly Pt[];
  holes?: readonly (readonly Pt[])[];
  tiltX: number;
  tiltY: number;
  missing?: boolean;
};

/** Paint a break's pieces into a 2D context, pane px, as the map's colours. */
export function paintShardMap(
  ctx: CanvasRenderingContext2D,
  pieces: readonly MapPiece[],
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  // Unbroken glass: flat.
  ctx.fillStyle = "rgb(128 128 0)";
  ctx.fillRect(0, 0, w, h);
  for (const p of pieces) {
    ctx.beginPath();
    for (const loop of [p.poly, ...(p.holes ?? [])]) {
      loop.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
    }
    if (p.missing) {
      // No glass: nothing to reflect.
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.fill("evenodd");
      ctx.restore();
    } else {
      ctx.fillStyle = `rgb(${encodeSlope(Math.tan(p.tiltY))} ${encodeSlope(Math.tan(p.tiltX))} 0)`;
      ctx.fill("evenodd");
    }
  }
}

// ---------------------------------------------------------------------------
// Which panes are broken: the break publishes its map on its pane, and the
// glass pass reads it there.
// ---------------------------------------------------------------------------

export type ShardMap = { canvas: HTMLCanvasElement; version: number };

const maps = new WeakMap<Element, ShardMap>();
let stamp = 0;
const watchers = new Set<() => void>();

function changed() {
  stamp += 1;
  for (const fn of watchers) fn();
}

/** Publish (or update) the map of the break on `pane`. */
export function setShardMap(pane: Element, canvas: HTMLCanvasElement) {
  const was = maps.get(pane);
  maps.set(pane, { canvas, version: (was?.version ?? 0) + 1 });
  changed();
}

/** The pane is whole again (or its break is gone). */
export function clearShardMap(pane: Element) {
  if (maps.delete(pane)) changed();
}

export function shardMapOf(pane: Element): ShardMap | undefined {
  return maps.get(pane);
}

/** Bumped whenever a map is published or cleared. */
export function shardMapStamp(): number {
  return stamp;
}

export function onShardMapChange(fn: () => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

export const SHARD_MAP_GLSL = /* glsl */ `
// effects/optics/shard-map.ts: a broken pane's pieces. R, G: slope across and
// down (128 flat, ${TILT_PER_STEP.toExponential(2)} per step); A: glass (0 in a hole).
vec3 shardNormal(vec4 texel) {
  vec2 slope = (texel.rg * 255.0 - 128.0) * ${TILT_PER_STEP.toExponential(4)};
  return normalize(vec3(slope, 1.0));
}
`;
