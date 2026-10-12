/**
 * Real breaks, simulated offline, placed on a pane (broken glass B1;
 * docs/broken-glass-system.md 3.4).
 *
 * The patterns come from physics: a pane struck in Peridynamics.jl
 * (tools/fracture-sim), its crack lines thinned, their arrival times kept,
 * and written as a library entry (analyze.py library) in millimetres. Here
 * an entry is laid onto a pane at the point struck: scaled to the site's
 * pixels per millimetre, turned a quarter turn or mirrored so the same break
 * never shows twice the same way, its cracks walked into the crack network
 * in arrival order so each one stops where it meets an earlier one (the T
 * junctions real cracks make), and cut off by the pane's own edges. The
 * pieces come from the network's faces as they do for the generator, and
 * get their tilts the same way (shardsFrom), so everything downstream (the
 * shard map, the side faces, the crack light) takes the result unchanged.
 *
 * Pure: the same entry, impact and seed give the same break.
 */

import { CrackNet } from "./crack-net";
import {
  type Crack,
  type CrackKind,
  type Fracture,
  type Impact,
  type Pt,
  shardsFrom,
} from "./fracture";

/** A stored break, as tools/fracture-sim/analyze.py writes it. */
export type BreakEntry = {
  format: "onysnow-break-1";
  source: string;
  /** The simulated pane, mm. */
  pane_mm: [number, number];
  thickness_mm: number;
  /** Where it was struck, mm from the pane's centre (y up). */
  impact_mm: [number, number];
  support?: string;
  /** How far in from the simulated pane's edge the glass could not break (the frame and its gasket), mm. */
  edge_mm?: number;
  /** The crushed zone's radius round the impact, mm. */
  crush_mm: number | null;
  cracks: {
    /** The crack's path, mm from the centre (y up). */
    pts: [number, number][];
    /** When each point cracked, microseconds. */
    t: number[];
    /** Which face it shows on: both (through the pane), the struck face, or the back. */
    face: "both" | "struck" | "back";
  }[];
};

/** The site's scale: pixels per millimetre of glass (docs/broken-glass-system.md 3.4). */
export const PX_PER_MM = 4;
/** A crack end with no other crack within this of it ended in the open, mm. */
const FREE_END_MM = 2;

/** A library crack's points in pane px, with its arrival time, after placement. */
export type PlacedCrack = Crack & {
  /** When each point cracked, microseconds after the strike. */
  t: number[];
  /** When the crack started, microseconds: the order the cracks were laid in. */
  startedAt: number;
  face: "both" | "struck" | "back";
};

export type LibraryFracture = Omit<Fracture, "cracks"> & {
  cracks: PlacedCrack[];
  /** When the last crack arrived, microseconds. */
  duration: number;
};

/** A repeatable number in [0, 1). */
function hash(seed: number, n: number): number {
  const x = Math.sin(seed * 91.345 + n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Lay an entry onto a pane struck at `im.at`. The entry's frame-line cracks
 * (along its own gasket) are left out: the pane here has its own edges, and
 * the network's border is what stops the radials.
 */
export function placeBreak(entry: BreakEntry, im: Impact): LibraryFracture {
  const seed = im.seed ?? 1;
  const E = Math.max(0, Math.min(1, im.energy));
  const at = {
    x: Math.max(4, Math.min(im.w - 4, im.at.x)),
    y: Math.max(4, Math.min(im.h - 4, im.at.y)),
  };
  // A quarter turn (0-3) and a mirror, by the seed.
  const turn = Math.floor(hash(seed, 1) * 4);
  const mirror = hash(seed, 2) < 0.5;
  const [ix, iy] = entry.impact_mm;
  const [lw, lh] = entry.pane_mm;
  const place = (p: [number, number]): Pt => {
    let x = p[0] - ix;
    let y = -(p[1] - iy); // y up in the entry, down on the screen
    if (mirror) x = -x;
    for (let k = 0; k < turn; k++) {
      const nx = -y;
      y = x;
      x = nx;
    }
    return { x: at.x + x * PX_PER_MM, y: at.y + y * PX_PER_MM };
  };
  // The frame-line crack runs along the clamp, just inside the gasket: within the entry's own edge band.
  const edgeMm = (entry.edge_mm ?? 12) + 2;
  const alongEdge = (pts: [number, number][]) => {
    // A crack that runs along the entry's own frame line: every point near one edge, the same edge.
    const near = (p: [number, number]) => [
      p[0] < -lw / 2 + edgeMm,
      p[0] > lw / 2 - edgeMm,
      p[1] < -lh / 2 + edgeMm,
      p[1] > lh / 2 - edgeMm,
    ];
    for (let side = 0; side < 4; side++) {
      if (pts.every((p) => near(p)[side])) return true;
    }
    return false;
  };

  const net = new CrackNet(im.w, im.h);
  const cracks: PlacedCrack[] = [];
  const crush = (entry.crush_mm ?? 0) * PX_PER_MM;
  // In arrival order: a later crack stops against an earlier one.
  const ordered = entry.cracks
    .map((c, i) => ({ c, i, t0: Math.min(...c.t.filter((v) => v > 0), 1e9) }))
    .sort((a, b) => a.t0 - b.t0 || a.i - b.i);
  const inPane = (p: Pt) => p.x >= 0 && p.x <= im.w && p.y >= 0 && p.y <= im.h;
  let duration = 0;
  const stopMm = (entry.edge_mm ?? 12) + 2.5;
  const nearEdge = (p: [number, number]) =>
    Math.abs(p[0]) > lw / 2 - stopMm || Math.abs(p[1]) > lh / 2 - stopMm;
  // A crack end in the open: on no other crack (a T-junction) and not at the frame.
  const allPts = entry.cracks.map((c) => c.pts);
  const endsFree = (p: [number, number], own: number) =>
    !allPts.some(
      (pts, i) => i !== own && pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < FREE_END_MM),
    );
  for (const { c: raw, i: rawIndex, t0: startedAt } of ordered) {
    if (raw.pts.length < 2 || alongEdge(raw.pts)) continue;
    /*
     * The line runs the way the crack ran: from where it started (earliest
     * arrival) outward. The thinned lines come in either direction.
     */
    const firstT = raw.t.find((v) => v > 0) ?? 0;
    const lastT = [...raw.t].reverse().find((v) => v > 0) ?? 0;
    let forward = firstT <= lastT;
    // A line with one end at the simulated frame runs toward it.
    if (nearEdge(raw.pts[0]!) && !nearEdge(raw.pts[raw.pts.length - 1]!)) forward = false;
    if (!nearEdge(raw.pts[0]!) && nearEdge(raw.pts[raw.pts.length - 1]!)) forward = true;
    const c = forward ? raw : { ...raw, pts: [...raw.pts].reverse(), t: [...raw.t].reverse() };
    const pts = c.pts.map(place);
    const times = [...c.t];
    const kind = kindOf(pts, c.pts, at, crush, [ix, iy]);
    /*
     * A crack the simulated frame stopped would have run on in a bigger
     * pane, and a radial still running in the open when the simulation
     * ended (the simulated cracks run slower than real ones, which cross a
     * pane in tens of microseconds) would have reached the frame: either is
     * carried straight on, in its last direction, to this pane's own edge
     * (the network's border catches it), with the arrival time running on
     * at the same speed. A branch that ends in the open stopped on its own,
     * as real branches do, and stays where it stopped.
     */
    const last = c.pts[c.pts.length - 1]!;
    const fromImpactMm = Math.hypot(last[0] - ix, last[1] - iy);
    const runsOn =
      nearEdge(last) || (kind === "radial" && fromImpactMm > 8 && endsFree(last, rawIndex));
    if (runsOn && pts.length >= 2) {
      const b = pts[pts.length - 1]!;
      const a = pts[Math.max(0, pts.length - 5)]!; // the last few millimetres set the direction
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const reach = im.w + im.h;
      pts.push({ x: b.x + ((b.x - a.x) / d) * reach, y: b.y + ((b.y - a.y) / d) * reach });
      const tb = times[times.length - 1]!;
      const ta = times[times.length - 2]!;
      times.push(tb + Math.max(tb - ta, 0.5) * (reach / d));
    }
    let from = -1;
    const path: Pt[] = [];
    const arrived: number[] = [];
    const segs: number[] = [];
    for (let k = 0; k < pts.length; k++) {
      const q = pts[k]!;
      if (from < 0) {
        if (!inPane(q)) continue;
        from = nearNode(net, q, 1.5) ?? net.node(q);
        path.push(net.nodes[from]!);
        arrived.push(times[k]!);
        continue;
      }
      const target = inPane(q) ? q : clipToPane(net.nodes[from]!, q, im.w, im.h);
      const h = net.hit(from, target);
      if (h) {
        const n = net.meet(h);
        if (n !== from) segs.push(net.seg(from, n));
        path.push(net.nodes[n]!);
        arrived.push(times[k]!);
        break; // the crack ends where it meets the other
      }
      const n = net.node(target);
      segs.push(net.seg(from, n));
      path.push(target);
      arrived.push(times[k]!);
      from = n;
      if (!inPane(q)) break;
    }
    if (path.length >= 2) {
      cracks.push({ kind, pts: path, segs, t: arrived, startedAt, face: c.face });
      duration = Math.max(duration, ...arrived.filter((v) => v > 0));
    }
  }
  const faces = net.faces();
  const shards = shardsFrom({ ...im, at, energy: E }, at, faces, crush, seed);
  return { kind: im.kind, impact: at, shards, cracks, crush, duration };
}

/** The node already at a point, if one lies within `tol` px. */
function nearNode(net: CrackNet, p: Pt, tol: number): number | null {
  let best = -1;
  let bestD = tol;
  for (let i = 0; i < net.nodes.length; i++) {
    const n = net.nodes[i]!;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? null : best;
}

/** Where the run from `a` (inside) toward `b` (outside) leaves the pane. */
function clipToPane(a: Pt, b: Pt, w: number, h: number): Pt {
  let t = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (b.x < 0) t = Math.min(t, (0 - a.x) / dx);
  if (b.x > w) t = Math.min(t, (w - a.x) / dx);
  if (b.y < 0) t = Math.min(t, (0 - a.y) / dy);
  if (b.y > h) t = Math.min(t, (h - a.y) / dy);
  t = Math.max(0, t);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/**
 * What kind of crack a line is, from its geometry: radial from the crushed
 * zone outward, ring if it runs round the impact, branch otherwise.
 */
function kindOf(
  pts: Pt[],
  mm: [number, number][],
  at: Pt,
  crush: number,
  impact: [number, number],
): CrackKind {
  const first = mm[0]!;
  const r0 = Math.hypot(first[0] - impact[0], first[1] - impact[1]) * PX_PER_MM;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const rad = { x: mid.x - at.x, y: mid.y - at.y };
  const rl = Math.hypot(rad.x, rad.y) || 1;
  const along = Math.abs((dir.x * rad.x + dir.y * rad.y) / (len * rl));
  if (r0 <= crush * 1.6 + 6 && along > 0.5) return "radial";
  if (along < 0.45 && len > 12) return "ring";
  return "branch";
}

/**
 * The library: entries fetched once each from public/breaks/, by glass kind.
 * The index names the entries per kind; a strike picks one by its seed.
 */
export type LibraryIndex = Record<string, string[]>;

const entries = new Map<string, Promise<BreakEntry | null>>();

export function loadEntry(name: string, base = "/breaks/"): Promise<BreakEntry | null> {
  let p = entries.get(name);
  if (!p) {
    p = fetch(`${base}${name}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<BreakEntry>) : null))
      .catch(() => null);
    entries.set(name, p);
  }
  return p;
}

/** Which entry a strike uses: one of the kind's, by the seed. */
export function pickEntry(index: LibraryIndex, kind: string, seed: number): string | null {
  const names = index[kind];
  if (!names || names.length === 0) return null;
  return names[Math.floor(hash(seed, 3) * names.length) % names.length] ?? null;
}
