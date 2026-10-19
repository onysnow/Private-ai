/**
 * An orb web (Araneus diadematus, the garden cross spider), generated from
 * the measurements in docs/research/spider-webs.md 3.1 and the generator of
 * 3.3:
 *   - the hub 0.44 of the frame's height from the top (ap Rhisiart &
 *     Vollrath 1994: radial lengths 83.8 up, 107.7 down);
 *   - radials shared out N : W : E : S as 6.8 : 7.7 : 7.9 : 10.7, denser
 *     below the hub, each angle jittered by up to 20% of the local spacing;
 *   - about five hub rings out to 8% of the radial length, a free zone to
 *     15% (estimates);
 *   - the capture spiral wound from the edge inward over the rest, its
 *     chords straight (the threads are under tension), a few dropped;
 *   - radials pre-strained 0.4% (rest = 0.996 x length; computed from
 *     Mortimer 2016 and Gosline 1999).
 * Nodes are the spiral x radial crossings, the hub, and the anchors on the
 * frame (pinned).
 */

import { FRAME, HUB, RADIAL, SPIRAL, type Thread } from "./net";

export type OrbOptions = {
  /** The frame the web spans, host px. */
  x: number;
  y: number;
  w: number;
  h: number;
  radials?: number;
  turns?: number;
  seed?: number;
  /** Share of spiral chords missing (nature 0-5%). */
  missing?: number;
};

export type Web = {
  positions: number[];
  edges: { a: number; b: number; rest: number; compliance: number; tear: number; type: Thread }[];
  pins: number[];
  /** Each pin's place on the frame, as a fraction of the frame's width and height. */
  pinAt: Map<number, [number, number]>;
  hub: number;
};

/** Compliance (XPBD, 1/stiffness) per thread type: radials 100x stiffer than the spiral (spider-webs 6.2). */
export const COMPLIANCE: Record<Thread, number> = { 0: 1e-8, 1: 1e-7, 2: 1e-7, 3: 1e-5 };
/** Strain at which each thread type breaks (Gosline 1999): radial and frame 0.27, capture spiral 2.7. */
export const TEAR: Record<Thread, number> = { 0: 0.27, 1: 0.27, 2: 0.27, 3: 2.7 };
const PRE_STRAIN = 0.996;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Where a ray from (hx, hy) at angle a leaves the box, as a distance. */
function toFrame(hx: number, hy: number, a: number, o: OrbOptions): number {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (o.x + o.w - hx) / dx);
  if (dx < -1e-9) t = Math.min(t, (o.x - hx) / dx);
  if (dy > 1e-9) t = Math.min(t, (o.y + o.h - hy) / dy);
  if (dy < -1e-9) t = Math.min(t, (o.y - hy) / dy);
  return t;
}

export function orbWeb(o: OrbOptions): Web {
  const random = rng(o.seed ?? 7);
  const N = o.radials ?? 24;
  const turns = o.turns ?? 18;
  const missing = o.missing ?? 0.03;
  const hx = o.x + o.w * (0.5 + (random() - 0.5) * 0.1);
  const hy = o.y + o.h * (0.44 + (random() - 0.5) * 0.1);

  /*
   * Radial angles: quadrants N (up, -y), E, S, W in screen terms, shared
   * 6.8 : 7.9 : 10.7 : 7.7 (measured, clockwise from up), so more radials
   * below the hub.
   */
  const share = [6.8, 7.9, 10.7, 7.7];
  const total = share.reduce((s, v) => s + v, 0);
  const counts = share.map((v) => Math.round((v / total) * N));
  while (counts.reduce((s, v) => s + v, 0) > N) counts[2]!--;
  while (counts.reduce((s, v) => s + v, 0) < N) counts[2]!++;
  const angles: number[] = [];
  counts.forEach((c, q) => {
    const start = -Math.PI * 0.75 + q * (Math.PI / 2); // up-left boundary of the N quadrant, clockwise
    for (let k = 0; k < c; k++) angles.push(start + ((k + 0.5) / c) * (Math.PI / 2));
  });
  const spacing = (Math.PI * 2) / N;
  for (let k = 0; k < angles.length; k++) angles[k] = angles[k]! + (random() - 0.5) * 0.4 * spacing;
  angles.sort((a, b) => a - b);

  const positions: number[] = [];
  const add = (x: number, y: number) => {
    positions.push(x, y);
    return positions.length / 2 - 1;
  };
  const edges: Web["edges"] = [];
  const thread = (a: number, b: number, type: Thread, pre = 1) => {
    const len = Math.hypot(
      positions[a * 2]! - positions[b * 2]!,
      positions[a * 2 + 1]! - positions[b * 2 + 1]!,
    );
    edges.push({ a, b, rest: len * pre, compliance: COMPLIANCE[type], tear: TEAR[type], type });
  };

  const hub = add(hx, hy);
  const pins: number[] = [];
  const pinAt = new Map<number, [number, number]>();
  // Fractions along each radial: hub rings, then (past a free zone) the capture spiral.
  const hubRings = [0.03, 0.055, 0.08];
  const spiralFrom = 0.15;
  const spiralTo = 0.96;
  // The nodes along each radial, hub to frame.
  const along: number[][] = [];
  const lengths = angles.map((a) => toFrame(hx, hy, a, o));
  angles.forEach((a, r) => {
    const L = lengths[r]!;
    const nodes: number[] = [];
    for (const f of hubRings) nodes.push(add(hx + Math.cos(a) * L * f, hy + Math.sin(a) * L * f));
    // The spiral winds: each crossing on the next radial is a little further in.
    for (let k = 0; k < turns; k++) {
      const f = spiralTo - ((k + r / N) / turns) * (spiralTo - spiralFrom);
      nodes.push(add(hx + Math.cos(a) * L * f, hy + Math.sin(a) * L * f));
    }
    const anchor = add(hx + Math.cos(a) * L, hy + Math.sin(a) * L);
    pins.push(anchor);
    pinAt.set(anchor, [
      (positions[anchor * 2]! - o.x) / o.w,
      (positions[anchor * 2 + 1]! - o.y) / o.h,
    ]);
    along.push(nodes);
    // The radial: hub, hub rings, then the spiral crossings from the inside out, then the frame.
    const order = [
      hub,
      ...nodes.slice(0, hubRings.length),
      ...nodes.slice(hubRings.length).reverse(),
      anchor,
    ];
    for (let k = 0; k + 1 < order.length; k++) {
      thread(order[k]!, order[k + 1]!, k + 2 === order.length ? FRAME : RADIAL, PRE_STRAIN);
    }
  });
  // Hub rings.
  for (let ring = 0; ring < hubRings.length; ring++) {
    for (let r = 0; r < N; r++) thread(along[r]![ring]!, along[(r + 1) % N]![ring]!, HUB);
  }
  // The capture spiral: crossing k on radial r to crossing k on radial r+1 (or k+1 past the last radial).
  for (let k = 0; k < turns; k++) {
    for (let r = 0; r < N; r++) {
      const next =
        r + 1 < N ? along[r + 1]![hubRings.length + k] : along[0]![hubRings.length + k + 1];
      if (next === undefined) continue;
      if (random() < missing) continue;
      thread(along[r]![hubRings.length + k]!, next, SPIRAL);
    }
  }
  return { positions, edges, pins, pinAt, hub };
}
