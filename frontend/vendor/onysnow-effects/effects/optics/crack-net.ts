/**
 * A crack network in a pane: cracks grown as polylines that stop where they
 * meet another crack or the frame, so nothing ever crosses, and the pieces
 * they cut the pane into found as the faces of that planar graph
 * (effects/optics/fracture, docs/broken-glass-cracks.md).
 *
 * Every point is a node; every straight run between two nodes is a segment.
 * A crack that runs into a segment ends on a new node there, which splits
 * that segment -- a T-junction, as real cracks meet (SWGMAT: a later crack
 * terminates at an earlier one).
 */

export type Pt = { x: number; y: number };

type Split = { u: number; n: number };
type Seg = { a: number; b: number; splits: Split[] };

export type Hit = { seg: number; t: number; u: number; p: Pt };

const EPS = 1e-9;

export class CrackNet {
  readonly nodes: Pt[] = [];
  readonly segs: Seg[] = [];
  /** Border corner nodes, clockwise on screen from the top left. */
  readonly corners: number[];
  private readonly grid = new Map<number, number[]>();
  private readonly cell = 24;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.corners = [
      this.node({ x: 0, y: 0 }),
      this.node({ x: w, y: 0 }),
      this.node({ x: w, y: h }),
      this.node({ x: 0, y: h }),
    ];
    for (let i = 0; i < 4; i++) this.seg(this.corners[i]!, this.corners[(i + 1) % 4]!);
  }

  node(p: Pt): number {
    this.nodes.push({ x: p.x, y: p.y });
    return this.nodes.length - 1;
  }

  private cellsOf(a: Pt, b: Pt, pad = 0): number[] {
    const c = this.cell;
    const i0 = Math.floor((Math.min(a.x, b.x) - pad) / c);
    const i1 = Math.floor((Math.max(a.x, b.x) + pad) / c);
    const j0 = Math.floor((Math.min(a.y, b.y) - pad) / c);
    const j1 = Math.floor((Math.max(a.y, b.y) + pad) / c);
    const out: number[] = [];
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) out.push((i + 1000) * 4096 + (j + 1000));
    return out;
  }

  /** Join two nodes with a straight segment. Returns its index. */
  seg(a: number, b: number): number {
    this.segs.push({ a, b, splits: [] });
    const s = this.segs.length - 1;
    for (const k of this.cellsOf(this.nodes[a]!, this.nodes[b]!)) {
      const list = this.grid.get(k);
      if (list) list.push(s);
      else this.grid.set(k, [s]);
    }
    return s;
  }

  /**
   * The first segment the straight run from node `from` to `q` meets, not
   * counting segments that end at `from` or are listed in `skip`.
   */
  hit(from: number, q: Pt, skip?: ReadonlySet<number>): Hit | null {
    const p = this.nodes[from]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    let best: Hit | null = null;
    const seen = new Set<number>();
    for (const k of this.cellsOf(p, q, 1)) {
      for (const s of this.grid.get(k) ?? []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const sg = this.segs[s]!;
        if (sg.a === from || sg.b === from || skip?.has(s)) continue;
        if (sg.splits.some((sp) => sp.n === from)) continue;
        const a = this.nodes[sg.a]!;
        const b = this.nodes[sg.b]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < EPS) continue;
        const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
        const u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den;
        if (t <= 1e-7 || t > 1 || u < -1e-9 || u > 1 + 1e-9) continue;
        if (!best || t < best.t) {
          best = {
            seg: s,
            t,
            u: Math.min(1, Math.max(0, u)),
            p: { x: p.x + dx * t, y: p.y + dy * t },
          };
        }
      }
    }
    return best;
  }

  /** The node where a crack meets segment `s` at `u`: an end of it, or a new node splitting it. */
  meet(h: Hit): number {
    const sg = this.segs[h.seg]!;
    const a = this.nodes[sg.a]!;
    const b = this.nodes[sg.b]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (h.u * len < 0.05) return sg.a;
    if ((1 - h.u) * len < 0.05) return sg.b;
    for (const sp of sg.splits) if (Math.abs(sp.u - h.u) * len < 0.05) return sp.n;
    const n = this.node(h.p);
    sg.splits.push({ u: h.u, n });
    return n;
  }

  /**
   * The pieces: the bounded faces of the graph, as polygons. Dangling crack
   * ends (a crack that stopped in open glass) do not cut anything off, so
   * they are pruned first.
   */
  faces(): Pt[][] {
    // Undirected adjacency from the segments cut at their splits.
    const adj = new Map<number, Set<number>>();
    const link = (u: number, v: number) => {
      if (u === v) return;
      (adj.get(u) ?? adj.set(u, new Set()).get(u)!).add(v);
      (adj.get(v) ?? adj.set(v, new Set()).get(v)!).add(u);
    };
    for (const sg of this.segs) {
      const chain = [sg.a, ...[...sg.splits].sort((p, q) => p.u - q.u).map((s) => s.n), sg.b];
      for (let i = 0; i + 1 < chain.length; i++) link(chain[i]!, chain[i + 1]!);
    }
    // Prune dangling ends.
    const stack = [...adj.keys()].filter((n) => adj.get(n)!.size < 2);
    while (stack.length) {
      const n = stack.pop()!;
      const nb = adj.get(n);
      if (!nb) continue;
      for (const m of nb) {
        const mb = adj.get(m)!;
        mb.delete(n);
        if (mb.size < 2) stack.push(m);
      }
      adj.delete(n);
    }
    // Neighbours in angular order round each node.
    const order = new Map<number, number[]>();
    for (const [n, nb] of adj) {
      const p = this.nodes[n]!;
      order.set(
        n,
        [...nb].sort((u, v) => {
          const pu = this.nodes[u]!;
          const pv = this.nodes[v]!;
          return Math.atan2(pu.y - p.y, pu.x - p.x) - Math.atan2(pv.y - p.y, pv.x - p.x);
        }),
      );
    }
    const used = new Set<string>();
    const faces: { poly: Pt[]; area: number }[] = [];
    for (const [u0, nb] of order) {
      for (const v0 of nb) {
        if (used.has(`${u0},${v0}`)) continue;
        const poly: Pt[] = [];
        let u = u0;
        let v = v0;
        for (let guard = 0; guard < 100000; guard++) {
          used.add(`${u},${v}`);
          poly.push(this.nodes[u]!);
          const around = order.get(v)!;
          const i = around.indexOf(u);
          const w = around[(i - 1 + around.length) % around.length]!;
          u = v;
          v = w;
          if (u === u0 && v === v0) break;
        }
        faces.push({ poly, area: signedArea(poly) });
      }
    }
    /*
     * Every piece winds one way and the outside of the pane the other. The
     * outside is the largest face (the whole border); with no cracks the one
     * piece is as large, and whichever is taken as the outside, the other is it.
     */
    const outerSign = Math.sign(
      faces.reduce((a, f) => (Math.abs(f.area) > Math.abs(a) ? f.area : a), 0),
    );
    return faces
      .filter((f) => Math.sign(f.area) === -outerSign && Math.abs(f.area) > 1e-6)
      .map((f) => f.poly);
  }
}

/** Shoelace area, signed by the winding. */
export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
