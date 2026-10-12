/**
 * Water on the glass as a fluid, not as rules (Ony, 2026-10-10: "the point
 * was to re-create the physics ... water to just naturally react the way it
 * should in different scenarios and can react to things like gravity or wind
 * or even other water sources").
 *
 * The water is a height field h(x, y) over the pane with a depth-averaged
 * velocity (u, v): the shallow-water equations with the forces that matter
 * for water a few millimetres across on a window --
 *
 *   dh/dt = -div(h U)                                    (mass)
 *   dU/dt = -grad(p)/rho + g_pane + wind/(rho h) - drag  (momentum)
 *   p     = -gamma lap(h) - Pi(h)                        (Laplace pressure, wetting)
 *   Pi(h) = kappa [(b/h)^3 - (b/h)^2]                    (disjoining pressure: the
 *            contact angle, Schwartz & Eley 1998, with a precursor film b)
 *   drag  = 3 nu U / h^2 + contact-line friction         (viscous shear, the edge)
 *
 * and contact-angle hysteresis as a yield at the contact line: where the
 * film is thin (the drop's edge) the water does not move until the force on
 * it beats the glass's grip there, which varies with the dirt on the glass.
 * A drop holds, grows with the rain, lets go, runs, gathers what it meets,
 * leaves a wet trail that necks into beads (Rayleigh-Plateau), all from
 * these. Units: mm, s, mg (water: rho 1 mg/mm^3, gamma 72000 mg/s^2).
 *
 * This is the CPU reference: small panes, tests and the rigs. The GPU port
 * runs the same steps as shader passes.
 */

export type FilmOptions = {
  /** The pane, mm. */
  width: number;
  height: number;
  /** Grid cell, mm. */
  cell?: number;
  seed?: number;
};

/** Water. */
export const RHO = 1; // mg/mm^3
export const GAMMA = 72000; // mg/s^2 (72 mN/m)
export const NU = 1; // mm^2/s
export const G = 9810; // mm/s^2

export class FilmSim {
  readonly width: number;
  readonly height: number;
  readonly dx: number;
  readonly nx: number;
  readonly ny: number;
  /** Water depth, mm. */
  readonly h: Float32Array;
  /** Depth-averaged velocity on the cell faces, mm/s (u on the vertical faces, v on the horizontal ones). */
  readonly u: Float32Array;
  readonly v: Float32Array;
  /**
   * The film a receding contact line leaves behind, 0-1 per cell: microns
   * thick (Landau-Levich), below what the grid holds, so kept as its own
   * field. Water advancing onto it meets no dry glass -- the grip there is
   * cut by filmSlip -- so later water follows earlier paths: streams.
   * Dries at filmDry a second.
   */
  readonly film: Float32Array;
  filmSlip = 0.9;
  filmDry = 1 / 20;
  /** The glass's wettability per cell, times the mean (the dirt): the disjoining pressure's strength there. */
  readonly grip: Float32Array;
  private readonly p: Float32Array;
  private readonly un: Float32Array;
  private readonly edge: Uint8Array;
  private readonly vn: Float32Array;
  private readonly hn: Float32Array;

  /** Precursor film, mm: the thinnest the water goes (numerically the dry glass). */
  b = 0.05;
  /** Equilibrium contact angle, degrees (Lab: Beading). */
  theta = 60;
  /** Gravity along the pane, mm/s^2 (a vertical window: all of it, downward = +y). */
  gx = 0;
  gy = G;
  /** Wind's shear on the water's surface, mg/(mm s^2) (Pa = 1 mg/(mm s^2)), x and y. */
  windX = 0;
  windY = 0;
  /** The contact line's dissipation, mm/s: drag where the surface is steep against its depth (sets a running drop's speed). */
  lineDrag = 300;
  /** The glass's grip on a contact line, as a static friction deceleration, mm/s^2 (times the dirt, grip). */
  pin = 120000;
  /** Viscous stress across the surface, mm^2/s: smooths ripples at the grid's own scale. */
  nuH = 8;
  /** The receding contact line's grip, times the advancing one's (water on glass: receding angle well under advancing). */
  recede = 1.5;
  /** The receding contact line's dynamic drag, 1/s: the faster the rear is pulled, the more it lags (trails, beads). */
  recedeDrag = 200;
  /** How much the glass's wettability (1 - cos theta) varies with the dirt, either way, share. */
  gripVary = 0.5;
  /** Evaporation, mm/s off every wet cell. */
  evaporation = 0;
  time = 0;

  constructor(o: FilmOptions) {
    this.width = o.width;
    this.height = o.height;
    this.dx = o.cell ?? 0.3;
    this.nx = Math.ceil(o.width / this.dx);
    this.ny = Math.ceil(o.height / this.dx);
    const n = this.nx * this.ny;
    this.h = new Float32Array(n).fill(this.b);
    // A staggered grid: u on the vertical faces ((nx + 1) x ny), v on the horizontal ones (nx x (ny + 1)).
    this.u = new Float32Array((this.nx + 1) * this.ny);
    this.v = new Float32Array(this.nx * (this.ny + 1));
    this.un = new Float32Array((this.nx + 1) * this.ny);
    this.vn = new Float32Array(this.nx * (this.ny + 1));
    this.grip = new Float32Array(n);
    this.film = new Float32Array(n);
    this.p = new Float32Array(n);
    this.hn = new Float32Array(n);
    this.edge = new Uint8Array(n);
    this.seedGrip(o.seed ?? 1);
  }

  /** The dirt on the glass: smooth value noise at two scales, so the grip varies over millimetres. */
  seedGrip(seed: number) {
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
    for (let j = 0; j < this.ny; j++)
      for (let i = 0; i < this.nx; i++) {
        const x = i * this.dx;
        const y = j * this.dx;
        const n = 0.6 * noise(x, y, 4, 1) + 0.4 * noise(x, y, 1.2, 2);
        this.grip[j * this.nx + i] = 1 + this.gripVary * (2 * n - 1);
      }
  }

  /** Add a volume of water (uL = mm^3) as a spherical cap at (x, y), at the glass's contact angle. */
  addDrop(x: number, y: number, volume: number, vx = 0, vy = 0) {
    const th = (this.theta * Math.PI) / 180;
    // Cap of contact radius a and angle th: V = pi a^3 (2 - 3 cos + cos^3) / (3 sin^3).
    const c = Math.cos(th);
    const s = Math.sin(th);
    const a = Math.cbrt((3 * volume * s * s * s) / (Math.PI * (2 - 3 * c + c * c * c)));
    const R = a / s;
    const i0 = Math.max(0, Math.floor((x - a) / this.dx));
    const i1 = Math.min(this.nx - 1, Math.ceil((x + a) / this.dx));
    const j0 = Math.max(0, Math.floor((y - a) / this.dx));
    const j1 = Math.min(this.ny - 1, Math.ceil((y + a) / this.dx));
    // Shape, then scale to the exact volume on this grid.
    let sum = 0;
    const add: [number, number][] = [];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const rx = (i + 0.5) * this.dx - x;
        const ry = (j + 0.5) * this.dx - y;
        const r2 = rx * rx + ry * ry;
        if (r2 >= a * a) continue;
        const hh = Math.sqrt(R * R - r2) - R * c;
        add.push([j * this.nx + i, hh]);
        sum += hh;
      }
    if (sum <= 0) {
      // Smaller than a cell: all of it in one.
      const k =
        Math.min(this.ny - 1, Math.max(0, Math.floor(y / this.dx))) * this.nx +
        Math.min(this.nx - 1, Math.max(0, Math.floor(x / this.dx)));
      add.push([k, 1]);
      sum = 1;
    }
    const scale = volume / (sum * this.dx * this.dx);
    for (const [k, hh] of add) {
      const h0 = this.h[k]!;
      const dh = hh * scale;
      const h1 = h0 + dh;
      this.h[k] = h1;
      // Momentum of what lands (an impact's skid), mixed into the faces of the cell it lands in.
      if (vx !== 0 || vy !== 0) {
        const i = k % this.nx;
        const j = (k - i) / this.nx;
        const w = dh / h1;
        for (const f of [j * (this.nx + 1) + i, j * (this.nx + 1) + i + 1])
          this.u[f] = this.u[f]! * (1 - w) + vx * w;
        for (const f of [j * this.nx + i, (j + 1) * this.nx + i])
          this.v[f] = this.v[f]! * (1 - w) + vy * w;
      }
    }
  }

  /** The largest stable step, s (capillary waves, and the flow's own speed). */
  maxDt(): number {
    const dx = this.dx;
    let vmax = 1;
    for (const a of [this.u, this.v])
      for (let k = 0; k < a.length; k++) {
        const s = Math.abs(a[k]!);
        if (s > vmax) vmax = s;
      }
    const capillary = 0.2 * Math.sqrt((RHO * dx * dx * dx) / (2 * Math.PI * GAMMA));
    return Math.min(capillary, (0.4 * dx) / vmax);
  }

  /** Advance by dt seconds (sub-stepped to stability). */
  step(dt: number) {
    let left = dt;
    let guard = 0;
    while (left > 1e-9 && guard++ < 10000) {
      const s = Math.min(left, this.maxDt());
      this.substep(s);
      left -= s;
    }
    this.time += dt;
  }

  private substep(dt: number) {
    const { nx, ny, dx, h, u, v, p, grip } = this;
    const b = this.b;
    const dry = b * 1.5;
    const th = (this.theta * Math.PI) / 180;
    // Disjoining pressure scale for n=3, m=2 (M = 1/2): kappa = gamma (1 - cos theta) / (b M).
    const kappa = (GAMMA * (1 - Math.cos(th))) / (b * 0.5);
    const W = nx + 1; // u faces per row
    const cellH = (i: number, j: number) =>
      h[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))]!;
    // 1. Pressure at the cells: Laplace (curvature) and disjoining (the wetting).
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const hc = h[k]!;
        const lap =
          (cellH(i + 1, j) + cellH(i - 1, j) + cellH(i, j + 1) + cellH(i, j - 1) - 4 * hc) /
          (dx * dx);
        const r = b / Math.max(hc, b * 0.2);
        p[k] = -GAMMA * lap - kappa * grip[k]! * (r * r * r - r * r);
      }
    /*
     * 2. Momentum on the faces (a staggered grid: each face's velocity is
     * driven by the pressure difference across it -- no checkerboard).
     * Gravity, wind's shear, drag (viscous shear 3 nu / h^2 and the moving
     * contact line's dissipation), and the glass's grip: a face where the
     * water meets dry glass is a contact line, held by static friction
     * until the push on it beats the grip there (hysteresis).
     */
    /*
     * Which cells are at the water's edge (a dry neighbour): water leaving
     * one recedes from the glass there, and the receding contact line grips
     * harder than the advancing one (its angle is lower: hysteresis). So
     * the rear of a running drop holds while the body pulls away from it --
     * the neck, and the trail of water it leaves.
     */
    const edge = this.edge;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        edge[k] =
          h[k]! > dry &&
          (cellH(i + 1, j) <= dry ||
            cellH(i - 1, j) <= dry ||
            cellH(i, j + 1) <= dry ||
            (j > 0 && cellH(i, j - 1) <= dry))
            ? 1
            : 0;
      }
    const face = (vel: number, a: number, kL: number, kR: number, slope: number) => {
      const hL = h[kL]!;
      const hR = h[kR]!;
      const hf = 0.5 * (hL + hR);
      const drag = (3 * NU) / (hf * hf) + (this.lineDrag * slope) / hf;
      let n = (vel + a * dt) / (1 + drag * dt);
      // Advancing onto dry glass, or receding from it (the cell the water leaves is at the edge).
      const donor = n > 0 ? kL : kR;
      // Onto a wet film, almost no grip: the film's water is already there to meet.
      const into = n > 0 ? kR : kL;
      const grip =
        Math.min(hL, hR) <= dry
          ? this.pin * (1 - this.filmSlip * this.film[into]!)
          : edge[donor]
            ? this.pin * this.recede
            : 0;
      /*
       * A receding contact line drags harder the faster it is pulled (its
       * dynamic angle falls with speed, Cox-Voinov): at a running drop's
       * rear the edge lags the body, the tail stretches into a thread, and
       * the thread pinches into beads or stays as a rivulet.
       */
      if (Math.min(hL, hR) > dry && edge[donor]) n /= 1 + this.recedeDrag * dt;
      if (grip > 0) {
        const hold = grip * 0.5 * (this.grip[kL]! + this.grip[kR]!) * dt;
        const sp = Math.abs(n);
        n = sp <= hold ? 0 : n * ((sp - hold) / sp);
      }
      return n;
    };
    const uOld = this.un;
    uOld.set(u);
    const vOld = this.vn;
    vOld.set(v);
    const uAt = (i: number, j: number) =>
      uOld[Math.min(ny - 1, Math.max(0, j)) * W + Math.min(nx, Math.max(0, i))]!;
    const vAt = (i: number, j: number) =>
      vOld[Math.min(ny, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))]!;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i <= nx; i++) {
        const f = j * W + i;
        if (i === 0 || i === nx) {
          u[f] = 0;
          continue;
        }
        const kL = j * nx + i - 1;
        const kR = kL + 1;
        const hL = h[kL]!;
        const hR = h[kR]!;
        if (Math.max(hL, hR) <= dry) {
          u[f] = 0;
          continue;
        }
        const hf = 0.5 * (hL + hR);
        let a = -(p[kR]! - p[kL]!) / (dx * RHO) + this.gx + this.windX / (RHO * hf);
        a +=
          (this.nuH * (uAt(i + 1, j) + uAt(i - 1, j) + uAt(i, j + 1) + uAt(i, j - 1) - 4 * u[f]!)) /
          (dx * dx);
        u[f] = face(u[f]!, a, kL, kR, Math.abs(hR - hL) / dx);
      }
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i < nx; i++) {
        const f = j * nx + i;
        if (j === 0) {
          v[f] = 0;
          continue;
        }
        const kT = (j - 1) * nx + i;
        const hT = h[kT]!;
        if (j === ny) {
          // The open bottom edge: what reaches it runs on off the pane under gravity.
          v[f] =
            hT > dry ? Math.max(0, (v[f]! + this.gy * dt) / (1 + ((3 * NU) / (hT * hT)) * dt)) : 0;
          continue;
        }
        const kB = kT + nx;
        const hB = h[kB]!;
        if (Math.max(hT, hB) <= dry) {
          v[f] = 0;
          continue;
        }
        const hf = 0.5 * (hT + hB);
        let a = -(p[kB]! - p[kT]!) / (dx * RHO) + this.gy + this.windY / (RHO * hf);
        a +=
          (this.nuH * (vAt(i + 1, j) + vAt(i - 1, j) + vAt(i, j + 1) + vAt(i, j - 1) - 4 * v[f]!)) /
          (dx * dx);
        v[f] = face(v[f]!, a, kT, kB, Math.abs(hB - hT) / dx);
      }
    // 3. Momentum moves with the water: semi-Lagrangian back-trace of each face's velocity.
    const sampleU = (x: number, y: number) => {
      const fx = Math.max(0, Math.min(nx - 0.0001, x));
      const fy = Math.max(0, Math.min(ny - 1.0001, y - 0.5));
      const i0 = Math.floor(fx);
      const j0 = Math.floor(fy);
      const sx = fx - i0;
      const sy = fy - j0;
      return (
        (u[j0 * W + i0]! * (1 - sx) + u[j0 * W + i0 + 1]! * sx) * (1 - sy) +
        (u[(j0 + 1) * W + i0]! * (1 - sx) + u[(j0 + 1) * W + i0 + 1]! * sx) * sy
      );
    };
    const sampleV = (x: number, y: number) => {
      const fx = Math.max(0, Math.min(nx - 1.0001, x - 0.5));
      const fy = Math.max(0, Math.min(ny - 0.0001, y));
      const i0 = Math.floor(fx);
      const j0 = Math.floor(fy);
      const sx = fx - i0;
      const sy = fy - j0;
      return (
        (v[j0 * nx + i0]! * (1 - sx) + v[j0 * nx + i0 + 1]! * sx) * (1 - sy) +
        (v[(j0 + 1) * nx + i0]! * (1 - sx) + v[(j0 + 1) * nx + i0 + 1]! * sx) * sy
      );
    };
    const un = this.un;
    const vn = this.vn;
    const c = dt / dx;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i <= nx; i++) {
        const f = j * W + i;
        if (u[f] === 0) {
          un[f] = 0;
          continue;
        }
        const x = i;
        const y = j + 0.5;
        un[f] = sampleU(x - u[f]! * c, y - sampleV(x, y) * c);
      }
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i < nx; i++) {
        const f = j * nx + i;
        if (v[f] === 0) {
          vn[f] = 0;
          continue;
        }
        const x = i + 0.5;
        const y = j;
        vn[f] = sampleV(x - sampleU(x, y) * c, y - v[f]! * c);
      }
    u.set(un);
    v.set(vn);
    /*
     * 4. Mass through the faces, donor cell: water leaves a cell only at the
     * face's own velocity and from the cell it comes from. A held contact
     * line (velocity 0) keeps its water while the body pulls away -- the
     * neck, and the trail a running drop leaves behind it.
     */
    const hn = this.hn;
    hn.set(h);
    for (let j = 0; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const uf = u[j * W + i]!;
        if (uf === 0) continue;
        const kL = j * nx + i - 1;
        const kR = kL + 1;
        const q = uf > 0 ? uf * Math.max(0, h[kL]! - b) : uf * Math.max(0, h[kR]! - b);
        const m = (q * dt) / dx;
        hn[kL] = hn[kL]! - m;
        hn[kR] = hn[kR]! + m;
      }
    for (let j = 1; j <= ny; j++)
      for (let i = 0; i < nx; i++) {
        const vf = v[j * nx + i]!;
        if (vf === 0) continue;
        const kT = (j - 1) * nx + i;
        if (j === ny) {
          hn[kT] = hn[kT]! - (vf * Math.max(0, h[kT]! - b) * dt) / dx;
          continue;
        }
        const kB = kT + nx;
        const q = vf > 0 ? vf * Math.max(0, h[kT]! - b) : vf * Math.max(0, h[kB]! - b);
        const m = (q * dt) / dx;
        hn[kT] = hn[kT]! - m;
        hn[kB] = hn[kB]! + m;
      }
    const ev = this.evaporation * dt;
    const fd = Math.exp(-this.filmDry * dt);
    const film = this.film;
    for (let k = 0; k < h.length; k++) {
      const was = h[k]!;
      const now = Math.max(b, hn[k]! - (hn[k]! > dry ? ev : 0));
      h[k] = now;
      // Under water the glass is wet; where the water has just left, the film it leaves.
      film[k] = now > dry ? 1 : was > dry ? 1 : film[k]! * fd;
    }
  }

  /** Total water on the pane, uL (above the precursor). */
  volume(): number {
    let s = 0;
    for (let k = 0; k < this.h.length; k++) s += Math.max(0, this.h[k]! - this.b);
    return s * this.dx * this.dx;
  }
}
