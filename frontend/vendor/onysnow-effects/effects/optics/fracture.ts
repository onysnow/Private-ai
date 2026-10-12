/**
 * How a pane breaks (item 10, claude/tools-research.md §2 "Broken glass";
 * revised from real cracks, docs/broken-glass-cracks.md): the crack pattern
 * an impact leaves, as the cracks themselves and the shards they cut the
 * pane into.
 *
 *   ANNEALED glass (ordinary float, the panes here): a crushed spot at the
 *     impact; radial cracks from it, as many as the blow was hard, forking
 *     as they run and turning to meet the frame square; concentric cracks
 *     as short chords from one radial to the next, staggered, near the
 *     impact. A crack that meets another stops there.
 *   LAMINATED glass is held together by its interlayer, so the pieces stay
 *     put and the cracks make a dense spider web: many radials, many rings of
 *     chords.
 *
 * Each shard is a polygon of the pane, with the small tilt and slip it
 * takes on as it breaks free (it is no longer quite in the pane's plane, so
 * what is seen through it steps at every crack), and how far it is from the
 * impact. At a hard hit the smallest pieces by the impact fall out.
 *
 * Tempered glass (which dices into small even cubes) is not modelled: Ony
 * wants plain and laminated glass only (2026-10-02).
 *
 * Pure and deterministic: the same impact gives the same break.
 */

import { CrackNet } from "./crack-net";
import { pieceLift, pieceTilt } from "./shard-tilt";

export type GlassKind = "annealed" | "laminated";

export type Pt = { x: number; y: number };

export type Shard = {
  /** Its outline, pane px, corners in order. */
  poly: Pt[];
  /** The slope it has taken on, radians about x and y: a few tenths of a degree. */
  tiltX: number;
  tiltY: number;
  /** How far it has slipped in the pane's plane, px. */
  slip: Pt;
  /** How far it stands proud of the pane (+, toward the viewer) or sinks, px (effects/optics/shard-tilt pieceLift). */
  lift: number;
  /** Its centre's distance from the impact, over the pane's diagonal. */
  reach: number;
  /** The crushed spot at the impact: pulverised, white. */
  crushed?: boolean;
  /** Knocked out: a hole, the photograph seen through it unfrosted. */
  missing?: boolean;
};

/**
 * One crack as it ran: radial (from the crushed spot), branch (forked off
 * another), ring (a concentric chord) or crush (the crushed spot's rim).
 */
export type CrackKind = "radial" | "branch" | "ring" | "crush";

export type Crack = {
  kind: CrackKind;
  /** Its path, pane px, in the order it ran. */
  pts: Pt[];
  /** The network's segments between them (internal). */
  segs: number[];
};

export type Fracture = {
  kind: GlassKind;
  impact: Pt;
  shards: Shard[];
  /** Every crack, once each. */
  cracks: Crack[];
  /** The crushed spot's radius, px. */
  crush: number;
};

export type Impact = {
  /** The pane's size, px. */
  w: number;
  h: number;
  /** Where it was struck, pane px. */
  at: Pt;
  /** How hard, 0 (a crack) to 1 (a hammer). */
  energy: number;
  kind: GlassKind;
  seed?: number;
  /** The pane's surface displacement setting, 0 flush to 1 (default DISPLACEMENT). */
  displacement?: number;
  /** The pane's thickness, px (default THICKNESS_PX): what the displacement is a share of. */
  thickness?: number;
};

/** The default surface displacement and thickness, for a strike that names neither. */
export const DISPLACEMENT = 0.35;
export const THICKNESS_PX = 18;

type Break = { faces: Pt[][]; cracks: Crack[]; crush: number };

/** The crushed spot's radius for a blow of this energy, px: a few millimetres. */
export function crushRadius(energy: number): number {
  return 5 + 13 * energy;
}

/** A repeatable pseudo-random number in [0, 1). */
function rand(seed: number, n: number): number {
  const x = Math.sin(seed * 91.345 + n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Clip a polygon to the half-plane where dot(p - a, nrm) <= 0 (Sutherland-Hodgman). */
function clipHalf(poly: Pt[], a: Pt, nrm: Pt): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => (p.x - a.x) * nrm.x + (p.y - a.y) * nrm.y;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/** Clip a polygon to the pane's rectangle. */
function clipRect(poly: Pt[], w: number, h: number): Pt[] {
  let p = clipHalf(poly, { x: 0, y: 0 }, { x: -1, y: 0 });
  p = clipHalf(p, { x: w, y: 0 }, { x: 1, y: 0 });
  p = clipHalf(p, { x: 0, y: 0 }, { x: 0, y: -1 });
  p = clipHalf(p, { x: 0, y: h }, { x: 0, y: 1 });
  return p;
}

/** A polygon's area (positive either way round). */
export function polygonArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function centroid(poly: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/** A repeatable stream of pseudo-random numbers in [0, 1) (mulberry32). */
function stream(seed: number): () => number {
  let a = (Math.floor(seed * 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far a crack grows in one step, px. */
const STEP = 5;

type Walker = {
  crack: Crack;
  node: number;
  ang: number;
  turn: number;
  left: number;
  /** How far it has run since it last forked, px. */
  since: number;
};

/** Where a crack's polyline first crosses radius `r` round `c`: its segment, the fraction along it and the point. */
function crossing(crack: Crack, c: Pt, r: number): { i: number; u: number; p: Pt } | null {
  const { pts } = crack;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const d0 = Math.hypot(a.x - c.x, a.y - c.y);
    const d1 = Math.hypot(b.x - c.x, b.y - c.y);
    if ((d0 - r) * (d1 - r) > 0 || d0 === d1) continue;
    // |a + (b - a) u - c| = r
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const fx = a.x - c.x;
    const fy = a.y - c.y;
    const A = ex * ex + ey * ey;
    const B = 2 * (fx * ex + fy * ey);
    const C = fx * fx + fy * fy - r * r;
    const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C));
    let u = (-B + disc) / (2 * A);
    if (u < 0 || u > 1) u = (-B - disc) / (2 * A);
    if (u < 0 || u > 1) continue;
    return { i, u, p: { x: a.x + ex * u, y: a.y + ey * u } };
  }
  return null;
}

/**
 * The impact break of annealed and laminated glass (docs/broken-glass-cracks.md):
 *
 *   a crushed spot at the impact, its size growing with the energy;
 *   radial cracks from its rim, as many as the energy (Bradt 2011: the count
 *     is proportional to it), grown together step by step, nearly straight
 *     with small kinks, forking past the mirror zone at 30-60 degrees (the
 *     biaxial case; Quinn 2019) more often the harder the hit, turning to
 *     meet the frame square, and stopping where they meet another crack;
 *   concentric cracks as chords, each from one radial to its neighbour and
 *     no further (SWGMAT: straight segments that terminate at a radial), at
 *     radii spaced wider further out and jittered chord by chord, so the
 *     "rings" are staggered, bowed a little outward.
 *
 * The pieces are the faces of the crack graph (effects/optics/crack-net).
 */
function webBreak(im: Impact, seed: number): Break {
  const { w, h, at, energy: E, kind } = im;
  const lam = kind === "laminated";
  const rnd = stream(seed * 7.31 + (lam ? 0.5 : 0));
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const net = new CrackNet(w, h);
  const cracks: Crack[] = [];
  const far = Math.max(
    Math.hypot(at.x, at.y),
    Math.hypot(w - at.x, at.y),
    Math.hypot(at.x, h - at.y),
    Math.hypot(w - at.x, h - at.y),
  );

  // ---- The crushed spot: an irregular disc, its rim a closed crack. ----
  const crush = crushRadius(E);
  const radials = lam ? 22 + Math.round(26 * E) : 8 + Math.round(30 * E);
  const turn0 = rnd() * Math.PI * 2;
  const starts: number[] = [];
  for (let i = 0; i < radials; i++) {
    starts.push(turn0 + ((i + (rnd() - 0.5) * 0.8) / radials) * Math.PI * 2);
  }
  starts.sort((a, b) => a - b);
  const rimAngles: { a: number; start: boolean }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const a = starts[i]!;
    const b = i + 1 < starts.length ? starts[i + 1]! : starts[0]! + Math.PI * 2;
    rimAngles.push({ a, start: true });
    const extra = Math.floor((b - a) / 0.45);
    for (let k = 1; k <= extra; k++)
      rimAngles.push({ a: a + ((b - a) * k) / (extra + 1), start: false });
  }
  const rim = rimAngles.map(({ a }) => {
    const r = crush * (0.78 + 0.44 * rnd());
    return net.node({ x: at.x + r * Math.cos(a), y: at.y + r * Math.sin(a) });
  });
  const rimCrack: Crack = { kind: "crush", pts: [], segs: [] };
  for (let k = 0; k < rim.length; k++) {
    rimCrack.segs.push(net.seg(rim[k]!, rim[(k + 1) % rim.length]!));
    rimCrack.pts.push(net.nodes[rim[k]!]!);
  }
  rimCrack.pts.push(net.nodes[rim[0]!]!);
  cracks.push(rimCrack);

  // ---- The radials, grown together. ----
  const mirror = crush * 2.5 + 25 * (1 - E);
  const forkEvery = lam ? 110 : 340 - 170 * E;
  const maxCracks = lam ? 240 : Math.round(60 + 150 * E);
  let walkers: Walker[] = [];
  rimAngles.forEach((ra, k) => {
    if (!ra.start) return;
    const crack: Crack = { kind: "radial", pts: [net.nodes[rim[k]!]!], segs: [] };
    cracks.push(crack);
    // The first cracks out run until they meet something: to the frame, or another crack.
    walkers.push({ crack, node: rim[k]!, ang: ra.a, turn: 0, left: Infinity, since: 0 });
  });
  for (let round = 0; walkers.length && round < 4000; round++) {
    const next: Walker[] = [];
    for (const wk of walkers) {
      const p = net.nodes[wk.node]!;
      // Near the frame a crack turns to meet it square (the free edge takes no load across it).
      const edges = [
        { d: p.x, a: Math.PI },
        { d: w - p.x, a: 0 },
        { d: p.y, a: -Math.PI / 2 },
        { d: h - p.y, a: Math.PI / 2 },
      ];
      const edge = edges.reduce((m, e) => (e.d < m.d ? e : m));
      if (edge.d < 40) {
        let diff = edge.a - wk.ang;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) < Math.PI / 2) wk.ang += diff * (1 - edge.d / 40) * 0.25;
      }
      wk.turn = 0.6 * wk.turn + gauss() * (lam ? 0.012 : 0.016);
      wk.ang += wk.turn;
      // A small kink at each step: the crack front's own roughness, a fraction of a pixel.
      const kink = gauss() * 0.35;
      const q = {
        x: p.x + STEP * Math.cos(wk.ang) - kink * Math.sin(wk.ang),
        y: p.y + STEP * Math.sin(wk.ang) + kink * Math.cos(wk.ang),
      };
      const hit = net.hit(wk.node, q);
      if (hit) {
        const end = net.meet(hit);
        wk.crack.segs.push(net.seg(wk.node, end));
        wk.crack.pts.push(net.nodes[end]!);
        continue;
      }
      const n = net.node(q);
      wk.crack.segs.push(net.seg(wk.node, n));
      wk.crack.pts.push(q);
      wk.node = n;
      wk.left -= STEP;
      wk.since += STEP;
      if (wk.left <= 0) continue;
      const r = Math.hypot(q.x - at.x, q.y - at.y);
      if (r > mirror && wk.since > 40 && cracks.length < maxCracks && rnd() < STEP / forkEvery) {
        // A fork: 30 to 60 degrees between the two, not always even about the old line.
        const alpha = ((30 + 30 * rnd()) * Math.PI) / 180;
        const bias = (rnd() - 0.5) * 0.4;
        const child: Crack = { kind: "branch", pts: [q], segs: [] };
        cracks.push(child);
        const left = Number.isFinite(wk.left) ? wk.left : far * (0.3 + 0.9 * E);
        next.push({
          crack: child,
          node: n,
          ang: wk.ang - alpha * (0.5 + bias),
          turn: 0,
          left: left * (0.45 + 0.55 * rnd()),
          since: 0,
        });
        wk.since = 0;
        wk.ang += alpha * (0.5 - bias);
      }
      next.push(wk);
    }
    walkers = next;
  }

  // ---- The concentric cracks: chords between neighbouring radials. ----
  const spread = cracks.filter((c) => c.kind === "radial" || c.kind === "branch");
  const ringCount = lam ? 6 + Math.round(5 * E) : 3 + Math.round(6 * E);
  const ringsTo = lam ? far * 0.85 : far * (0.2 + 0.4 * E);
  let rho = crush * 2 + 12 + 10 * rnd();
  for (let k = 0; k < ringCount && rho < ringsTo; k++) {
    const chance = lam ? 0.94 : Math.max(0.35, 0.9 - 0.07 * k);
    const cuts = spread
      .map((c) => ({ c, x: crossing(c, at, rho) }))
      .filter((o): o is { c: Crack; x: NonNullable<ReturnType<typeof crossing>> } => !!o.x)
      .map((o) => ({ ...o, a: Math.atan2(o.x.p.y - at.y, o.x.p.x - at.x) }))
      .sort((p, q) => p.a - q.a);
    for (let i = 0; i < cuts.length && cuts.length > 2; i++) {
      const A0 = cuts[i]!;
      const B0 = cuts[(i + 1) % cuts.length]!;
      let gap = B0.a - A0.a;
      if (gap < 0) gap += Math.PI * 2;
      if (gap > 1.2 || rnd() > chance) continue;
      const rA = rho * (1 + Math.max(-0.25, Math.min(0.25, 0.12 * gauss())));
      const rB = rho * (1 + Math.max(-0.25, Math.min(0.25, 0.12 * gauss())));
      const A = crossing(A0.c, at, rA);
      const B = crossing(B0.c, at, rB);
      if (!A || !B) continue;
      const chord = Math.hypot(B.p.x - A.p.x, B.p.y - A.p.y);
      if (chord < 6) continue;
      const segA = A0.c.segs[A.i];
      if (segA === undefined) continue;
      const start = net.meet({ seg: segA, t: 0, u: A.u, p: A.p });
      // Bowed outward, between a straight chord and the circle's own arc.
      const mid = { x: (A.p.x + B.p.x) / 2, y: (A.p.y + B.p.y) / 2 };
      const md = Math.hypot(mid.x - at.x, mid.y - at.y) || 1;
      const out = { x: (mid.x - at.x) / md, y: (mid.y - at.y) / md };
      const sag = ((rA + rB) / 2) * (1 - Math.cos(gap / 2)) * (0.25 + 0.75 * rnd());
      const along = { x: (B.p.x - A.p.x) / chord, y: (B.p.y - A.p.y) / chord };
      const steps = Math.max(2, Math.ceil(chord / STEP));
      const crack: Crack = { kind: "ring", pts: [net.nodes[start]!], segs: [] };
      let cur = start;
      const skip = new Set([segA]);
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        const bow = sag * 4 * f * (1 - f);
        const kink = s < steps ? gauss() * 0.4 : 0;
        const over = s === steps ? 2.5 : 0;
        const q = {
          x: A.p.x + (B.p.x - A.p.x) * f + out.x * bow - along.y * kink + along.x * over,
          y: A.p.y + (B.p.y - A.p.y) * f + out.y * bow + along.x * kink + along.y * over,
        };
        const hit = net.hit(cur, q, s === 1 ? skip : undefined);
        if (hit) {
          const end = net.meet(hit);
          crack.segs.push(net.seg(cur, end));
          crack.pts.push(net.nodes[end]!);
          break;
        }
        const n = net.node(q);
        crack.segs.push(net.seg(cur, n));
        crack.pts.push(q);
        cur = n;
      }
      cracks.push(crack);
    }
    rho *= lam ? 1.28 + 0.1 * rnd() : 1.4 + 0.2 * rnd();
  }

  return { faces: net.faces(), cracks, crush };
}

/** Whether `p` lies inside the polygon (even-odd). */
export function inside(poly: readonly Pt[], p: Pt): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

/** Break a pane. */
export function fracture(im: Impact): Fracture {
  const seed = im.seed ?? 1;
  const E = Math.max(0, Math.min(1, im.energy));
  let br: Break;
  let at = im.at;
  // The crushed spot stays inside the pane.
  const c = crushRadius(E) * 1.3 + 2;
  at = {
    x: Math.max(c, Math.min(im.w - c, im.at.x)),
    y: Math.max(c, Math.min(im.h - c, im.at.y)),
  };
  const one = (k: number) => webBreak({ ...im, at, energy: E }, seed + k * 101);
  br = one(0);
  // Should no crack have reached the frame (a web hanging free of it),
  // the pieces would not tile the pane; break it again, another way.
  const whole = (b: Break) =>
    Math.abs(b.faces.reduce((a, f) => a + polygonArea(f), 0) - im.w * im.h) < 1e-3 * im.w * im.h;
  for (let k = 1; k < 6 && !whole(br); k++) br = one(k);
  return {
    kind: im.kind,
    impact: at,
    shards: shardsFrom(im, at, br.faces, br.crush, seed),
    cracks: br.cracks,
    crush: br.crush,
  };
}

/**
 * The pieces a break's faces make, each with its tilt, slip and whether it
 * is crushed or knocked out (shared by the generator and the simulated
 * library, effects/optics/fracture-library).
 */
export function shardsFrom(
  im: Impact,
  at: Pt,
  faces: readonly Pt[][],
  crush: number,
  seed: number,
): Shard[] {
  const E = Math.max(0, Math.min(1, im.energy));
  const br = { crush };
  const diag = Math.hypot(im.w, im.h);
  // Laminated pieces are held by the interlayer: they barely move.
  const loose = im.kind === "laminated" ? 0.25 : 1;
  const rnd = stream(seed * 3.7 + 11);
  return faces.map((poly, k) => {
    const c = centroid(poly);
    const reach = Math.hypot(c.x - at.x, c.y - at.y) / diag;
    // Near the impact the pieces are knocked about most.
    const knock = loose * (0.3 + 0.7 * Math.exp(-reach * 4)) * (0.4 + 0.6 * E);
    // Left in the dent the blow pushed in, and knocked (effects/optics/shard-tilt).
    const away = Math.hypot(c.x - at.x, c.y - at.y) || 1;
    const tilt = pieceTilt(
      im.kind,
      E,
      (c.x - at.x) / away,
      (c.y - at.y) / away,
      reach,
      rand(seed, 500 + k),
      rand(seed, 600 + k),
    );
    const shard: Shard = {
      poly,
      tiltX: tilt.tiltX,
      tiltY: tilt.tiltY,
      slip: {
        x: (rand(seed, 700 + k) - 0.5) * 1.6 * knock,
        y: (rand(seed, 800 + k) - 0.5) * 1.6 * knock,
      },
      lift: pieceLift(
        im.kind,
        E,
        reach,
        im.displacement ?? DISPLACEMENT,
        im.thickness ?? THICKNESS_PX,
        rand(seed, 900 + k),
      ),
      reach,
    };
    if (inside(poly, at)) shard.crushed = true;
    /*
     * A hard blow knocks the smallest pieces by the impact out of an
     * annealed pane (laminated holds them): the crushed spot at the hardest,
     * and small shards close to it.
     */
    if (im.kind === "annealed" && E > 0.7) {
      const near = Math.hypot(c.x - at.x, c.y - at.y) < br.crush * 3.5;
      const small = polygonArea(poly) < (br.crush * 4) ** 2;
      if (shard.crushed ? E > 0.85 : near && small && rnd() < (E - 0.7) * 1.0) shard.missing = true;
    }
    return shard;
  });
}
