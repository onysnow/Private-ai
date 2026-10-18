/**
 * A net of threads: particles joined by distance constraints, solved by
 * XPBD (Macklin, Mueller and Chentanez 2016), after Ten Minute Physics'
 * cloth (14-cloth.html, MIT, Matthias Mueller) -- the fallback
 * docs/research/spider-webs.md 6.1 names, taken because Rapier 0.21's
 * soft-body pins did not hold in the spike (6.4; see that doc's status).
 *
 * What the web needs on top of the cloth (spider-webs 4, 6.1):
 *   - tension-only threads: a slack thread pushes nothing apart;
 *   - per-thread compliance: radials ~100x stiffer than the capture spiral
 *     (nature ~3000x, Gosline 1999; 100 so the spiral still looks taut);
 *   - tearing by strain, per thread type (radial/frame 0.27, spiral 2.7,
 *     Gosline 1999);
 *   - air: each substep the particle's velocity relaxes toward the air's
 *     (k_air 0.6-0.9 attached, Zhou & Miles 2017 -> estimate).
 *
 * Units are CSS px and seconds; pure TypeScript, testable on its own.
 */

export type Thread = 0 | 1 | 2 | 3; // frame, radial, hub, spiral
export const FRAME: Thread = 0;
export const RADIAL: Thread = 1;
export const HUB: Thread = 2;
export const SPIRAL: Thread = 3;

export class Net {
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** 1 / mass; 0 for a pinned particle. */
  readonly w: Float64Array;
  private readonly pinned: Uint8Array;
  /** Edges: a, b, rest length, compliance, tear strain, type, alive. */
  readonly ea: Int32Array;
  readonly eb: Int32Array;
  readonly rest: Float64Array;
  readonly compliance: Float64Array;
  readonly tear: Float64Array;
  readonly type: Uint8Array;
  readonly alive: Uint8Array;
  readonly m: number;
  /** Bumped when a thread breaks. */
  torn = 0;

  constructor(
    positions: readonly number[],
    edges: readonly {
      a: number;
      b: number;
      rest: number;
      compliance: number;
      tear: number;
      type: Thread;
    }[],
    pins: readonly number[],
  ) {
    this.n = positions.length / 2;
    const n = this.n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.w = new Float64Array(n).fill(1);
    this.pinned = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = positions[i * 2]!;
      this.y[i] = positions[i * 2 + 1]!;
    }
    for (const p of pins) {
      this.w[p] = 0;
      this.pinned[p] = 1;
    }
    this.m = edges.length;
    this.ea = new Int32Array(this.m);
    this.eb = new Int32Array(this.m);
    this.rest = new Float64Array(this.m);
    this.compliance = new Float64Array(this.m);
    this.tear = new Float64Array(this.m);
    this.type = new Uint8Array(this.m);
    this.alive = new Uint8Array(this.m).fill(1);
    edges.forEach((e, k) => {
      this.ea[k] = e.a;
      this.eb[k] = e.b;
      this.rest[k] = e.rest;
      this.compliance[k] = e.compliance;
      this.tear[k] = e.tear;
      this.type[k] = e.type;
    });
  }

  isPinned(i: number) {
    return this.pinned[i] === 1;
  }

  /** Hold a particle where the hand is (w = 0 while held); release gives it back its mass. */
  hold(i: number, x: number, y: number) {
    this.w[i] = 0;
    this.x[i] = x;
    this.y[i] = y;
  }
  release(i: number) {
    if (!this.pinned[i]) this.w[i] = 1;
  }

  /** Move a pin (its host moved). */
  movePin(i: number, x: number, y: number) {
    this.x[i] = x;
    this.y[i] = y;
  }

  /**
   * Advance dt seconds in `substeps` substeps: gravity, the air (velocity
   * relaxing toward `air(x, y)` by kAir per substep), the threads.
   */
  step(
    dt: number,
    substeps: number,
    gravity: number,
    kAir: number,
    air: (x: number, y: number) => readonly [number, number],
  ) {
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      for (let i = 0; i < this.n; i++) {
        if (this.w[i] === 0) continue;
        const [ax, ay] = air(this.x[i]!, this.y[i]!);
        this.vy[i] = this.vy[i]! + gravity * h;
        this.vx[i] = ax + (this.vx[i]! - ax) * kAir;
        this.vy[i] = ay + (this.vy[i]! - ay) * kAir;
        this.px[i] = this.x[i]!;
        this.py[i] = this.y[i]!;
        this.x[i] = this.x[i]! + this.vx[i]! * h;
        this.y[i] = this.y[i]! + this.vy[i]! * h;
      }
      const hh = h * h;
      for (let k = 0; k < this.m; k++) {
        if (!this.alive[k]) continue;
        const a = this.ea[k]!;
        const b = this.eb[k]!;
        const wa = this.w[a]!;
        const wb = this.w[b]!;
        const wsum = wa + wb;
        if (wsum === 0) continue;
        const dx = this.x[a]! - this.x[b]!;
        const dy = this.y[a]! - this.y[b]!;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        const C = len - this.rest[k]!;
        // A thread only pulls (tension only).
        if (C <= 0) continue;
        const lambda = -C / (wsum + this.compliance[k]! / hh);
        const nx = dx / len;
        const ny = dy / len;
        this.x[a] = this.x[a]! + wa * lambda * nx;
        this.y[a] = this.y[a]! + wa * lambda * ny;
        this.x[b] = this.x[b]! - wb * lambda * nx;
        this.y[b] = this.y[b]! - wb * lambda * ny;
      }
      for (let i = 0; i < this.n; i++) {
        if (this.w[i] === 0) {
          this.vx[i] = 0;
          this.vy[i] = 0;
          continue;
        }
        this.vx[i] = (this.x[i]! - this.px[i]!) / h;
        this.vy[i] = (this.y[i]! - this.py[i]!) / h;
      }
    }
    // Threads stretched past their tear strain break.
    for (let k = 0; k < this.m; k++) {
      if (!this.alive[k]) continue;
      if (this.strain(k) > this.tear[k]!) {
        this.alive[k] = 0;
        this.torn++;
      }
    }
  }

  /** A thread's strain now: (length - rest) / rest. */
  strain(k: number): number {
    const a = this.ea[k]!;
    const b = this.eb[k]!;
    const len = Math.hypot(this.x[a]! - this.x[b]!, this.y[a]! - this.y[b]!);
    return (len - this.rest[k]!) / this.rest[k]!;
  }

  /** Cut every thread the segment (x0, y0)-(x1, y1) crosses (a flick); returns how many. */
  cut(x0: number, y0: number, x1: number, y1: number): number {
    let cuts = 0;
    for (let k = 0; k < this.m; k++) {
      if (!this.alive[k]) continue;
      const a = this.ea[k]!;
      const b = this.eb[k]!;
      if (segmentsCross(x0, y0, x1, y1, this.x[a]!, this.y[a]!, this.x[b]!, this.y[b]!)) {
        this.alive[k] = 0;
        cuts++;
      }
    }
    this.torn += cuts;
    return cuts;
  }

  /** The particle nearest (x, y) within `radius`, or -1. */
  nearest(x: number, y: number, radius: number): number {
    let best = -1;
    let bestD = radius * radius;
    for (let i = 0; i < this.n; i++) {
      const d = (this.x[i]! - x) ** 2 + (this.y[i]! - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
