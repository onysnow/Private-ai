/**
 * A print hanging to dry in the red room (item 40, ?try=redroom).
 *
 * The photograph you took comes up in the developer and is hung on the line:
 * a cord from a peg on the line to a clip at the top of the print. It swings
 * as a real one does -- a double pendulum: a light cord, then a rigid sheet
 * turning about the clip (Goldstein, Classical Mechanics, 1.4; the compound
 * pendulum's inertia is the sheet's about the clip). Grab it and it follows
 * the hand on a spring; let go and it swings.
 *
 * Per unit mass, with the cord at angle a (length l) and the sheet at angle b
 * (its centre a distance d below the clip, radius of gyration k about its
 * centre), angles from straight down:
 *
 *   l^2 a'' + l d cos(a-b) b'' = -l d b'^2 sin(a-b) - g l sin a + Qa
 *   l d cos(a-b) a'' + (d^2+k^2) b'' =  l d a'^2 sin(a-b) - g d sin b + Qb
 *
 * The sheet swings in its own plane, so the air barely slows it (it moves
 * edgewise); what does is friction at the peg and the clip. They are set so
 * a swing dies away over about ten seconds, as a print on a line does.
 *
 * Scale: the print is a 10 x 8 inch sheet, so a pixel on the page stands for
 * that sheet's width over the width it is drawn at. A 25 cm print on an
 * 8 cm cord swings about once a second.
 */

export const G = 9.81;

export type PrintBody = {
  /** Cord length, m. */
  cord: number;
  /** The sheet's width and height, m. */
  width: number;
  height: number;
  /** Friction at the peg and at the clip, per unit mass, m^2/s. */
  pegFriction: number;
  clipFriction: number;
};

export type Swing = { a: number; b: number; va: number; vb: number };

/** The long side of a 10 x 8 inch print, m. */
export const PRINT_LONG_SIDE = 0.254;
/** A cord a little shorter than a hand. */
export const CORD = 0.08;
export const PEG_FRICTION = 0.028;
export const CLIP_FRICTION = 0.014;

export function printBody(aspect: number): PrintBody {
  // aspect = width / height; the long side is the 10 inches.
  const width = aspect >= 1 ? PRINT_LONG_SIDE : PRINT_LONG_SIDE * aspect;
  const height = aspect >= 1 ? PRINT_LONG_SIDE / aspect : PRINT_LONG_SIDE;
  return { cord: CORD, width, height, pegFriction: PEG_FRICTION, clipFriction: CLIP_FRICTION };
}

/** The clip to the sheet's centre, m. */
const reach = (p: PrintBody) => p.height / 2;
/** The sheet's radius of gyration about its centre, squared (a plate turning in its plane). */
const gyration2 = (p: PrintBody) => (p.width * p.width + p.height * p.height) / 12;

/** A point fixed on the sheet, (x across, y down from the clip, m), where it is now, from the peg. */
export function pointOf(p: PrintBody, s: Swing, x: number, y: number): [number, number] {
  const sa = Math.sin(s.a);
  const ca = Math.cos(s.a);
  const sb = Math.sin(s.b);
  const cb = Math.cos(s.b);
  return [p.cord * sa + x * cb + y * sb, p.cord * ca - x * sb + y * cb];
}

/** A hand holding the sheet at (x, y) on it, pulling toward `to`, m from the peg. */
export type Grip = { x: number; y: number; to: [number, number] };

/** How stiffly the hand holds it, 1/s^2, and how it damps it, 1/s. */
const GRIP_K = 2500;
const GRIP_C = 90;

function accel(p: PrintBody, s: Swing, grip: Grip | null): [number, number] {
  const l = p.cord;
  const d = reach(p);
  const k2 = gyration2(p);
  const diff = s.a - s.b;
  const c = Math.cos(diff);
  const sn = Math.sin(diff);
  let qa = -p.pegFriction * s.va + p.clipFriction * (s.vb - s.va);
  let qb = -p.clipFriction * (s.vb - s.va);
  if (grip) {
    const sa = Math.sin(s.a);
    const ca = Math.cos(s.a);
    const sb = Math.sin(s.b);
    const cb = Math.cos(s.b);
    // dP/da and dP/db for the gripped point.
    const pax = l * ca;
    const pay = -l * sa;
    const pbx = -grip.x * sb + grip.y * cb;
    const pby = -grip.x * cb - grip.y * sb;
    const [px, py] = pointOf(p, s, grip.x, grip.y);
    const vx = s.va * pax + s.vb * pbx;
    const vy = s.va * pay + s.vb * pby;
    const fx = GRIP_K * (grip.to[0] - px) - GRIP_C * vx;
    const fy = GRIP_K * (grip.to[1] - py) - GRIP_C * vy;
    qa += fx * pax + fy * pay;
    qb += fx * pbx + fy * pby;
  }
  const m11 = l * l;
  const m12 = l * d * c;
  const m22 = d * d + k2;
  const r1 = -l * d * s.vb * s.vb * sn - G * l * Math.sin(s.a) + qa;
  const r2 = l * d * s.va * s.va * sn - G * d * Math.sin(s.b) + qb;
  const det = m11 * m22 - m12 * m12;
  return [(r1 * m22 - r2 * m12) / det, (m11 * r2 - m12 * r1) / det];
}

/** The fixed substep, s. */
export const STEP = 1 / 480;

/** Advance the swing by `dt` seconds (RK4 in fixed substeps). */
export function advance(p: PrintBody, s: Swing, dt: number, grip: Grip | null = null): Swing {
  let cur = s;
  let left = Math.min(dt, 0.1);
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    left -= h;
    const k1 = accel(p, cur, grip);
    const s2 = {
      a: cur.a + (h / 2) * cur.va,
      b: cur.b + (h / 2) * cur.vb,
      va: cur.va + (h / 2) * k1[0],
      vb: cur.vb + (h / 2) * k1[1],
    };
    const k2 = accel(p, s2, grip);
    const s3 = {
      a: cur.a + (h / 2) * s2.va,
      b: cur.b + (h / 2) * s2.vb,
      va: cur.va + (h / 2) * k2[0],
      vb: cur.vb + (h / 2) * k2[1],
    };
    const k3 = accel(p, s3, grip);
    const s4 = {
      a: cur.a + h * s3.va,
      b: cur.b + h * s3.vb,
      va: cur.va + h * k3[0],
      vb: cur.vb + h * k3[1],
    };
    const k4 = accel(p, s4, grip);
    cur = {
      a: cur.a + (h / 6) * (cur.va + 2 * s2.va + 2 * s3.va + s4.va),
      b: cur.b + (h / 6) * (cur.vb + 2 * s2.vb + 2 * s3.vb + s4.vb),
      va: cur.va + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      vb: cur.vb + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    };
  }
  return cur;
}

/** Kinetic plus potential energy per unit mass, J/kg (the peg's height is zero). */
export function energy(p: PrintBody, s: Swing): number {
  const l = p.cord;
  const d = reach(p);
  const ke =
    0.5 *
    (l * l * s.va * s.va +
      (d * d + gyration2(p)) * s.vb * s.vb +
      2 * l * d * s.va * s.vb * Math.cos(s.a - s.b));
  const pe = -G * (l * Math.cos(s.a) + d * Math.cos(s.b));
  return ke + pe;
}

/** The two small-swing periods, s, slow then fast: det(K - w^2 M) = 0. */
export function normalPeriods(p: PrintBody): [number, number] {
  const l = p.cord;
  const d = reach(p);
  const m11 = l * l;
  const m12 = l * d;
  const m22 = d * d + gyration2(p);
  const k1 = G * l;
  const k2 = G * d;
  // (k1 - w m11)(k2 - w m22) - w^2 m12^2 = 0, w = omega^2.
  const A = m11 * m22 - m12 * m12;
  const B = -(k1 * m22 + k2 * m11);
  const C = k1 * k2;
  if (Math.abs(A) < 1e-15) {
    const w = -C / B;
    const T = (2 * Math.PI) / Math.sqrt(w);
    return [T, 0];
  }
  const disc = Math.sqrt(B * B - 4 * A * C);
  const w1 = (-B - disc) / (2 * A);
  const w2 = (-B + disc) / (2 * A);
  return [(2 * Math.PI) / Math.sqrt(w1), (2 * Math.PI) / Math.sqrt(w2)];
}

/** Whether it has all but stopped (and nothing holds it). */
export function atRest(s: Swing): boolean {
  return (
    Math.abs(s.a) < 4e-4 && Math.abs(s.b) < 4e-4 && Math.abs(s.va) < 2e-3 && Math.abs(s.vb) < 2e-3
  );
}

/**
 * How far the print has come up in the developer, 0 (white paper) to 1, `t`
 * seconds after it went in. Nothing shows for the first moments (the
 * induction period), then the image comes up quickly and slows as the
 * developer runs out of silver halide to reduce (first-order: 1 - e^(-t/tau);
 * a fibre print in a standard developer is done in about 90 s -- shortened
 * here tenfold, as the site keeps time).
 */
export const INDUCTION_S = 1.2;
export const DEVELOP_TAU_S = 2.2;
export function developed(t: number): number {
  return t <= INDUCTION_S ? 0 : 1 - Math.exp(-(t - INDUCTION_S) / DEVELOP_TAU_S);
}
