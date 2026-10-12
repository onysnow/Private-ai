/**
 * Wind across a window (Ony, 2026-10-10: "how realistic is the wind? Does it
 * start/stop sometimes change direction? can it be so strong it blows the
 * rain anywhere from a little sideways to completely?").
 *
 * Wind is never a steady push. Near the ground it comes as a mean speed with
 * slow swells and lulls (tens of seconds), gusts on top of it (a rise of a
 * second or two, a hold, a slower fall; gust factors of 1.3-2 over the mean
 * are usual), and turbulence in between; its direction wanders with it, and
 * veers in the gusts. A gust is a moving thing: it sweeps across a pane
 * rather than striking all of it at once.
 *
 * Everything here is in the glass's own plane: the wind's component along
 * the window, m/s, x to the right and y down the pane (an updraft is y < 0).
 * Deterministic from a seed and the clock, so a clip renders the same twice.
 */
import { hash01 } from "./sim";

export const MPH = 0.44704;

export type WindParams = {
  /** Mean speed along the glass, mph. */
  mph: number;
  /** Where it blows toward, degrees: 0 to the right, 90 down the pane, 180 to the left, 270 up. */
  direction: number;
  /** 0 steady to 1 very gusty: gust size and how often, lulls and turbulence. */
  gusts: number;
  /** How far the direction wanders, degrees either way. */
  swing: number;
};

export const CALM: WindParams = { mph: 0, direction: 0, gusts: 0, swing: 0 };

/** A gust front's speed across the pane, mm/s (it sweeps the glass in a fraction of a second). */
const FRONT_MM_S = 1500;
/** A slot in which at most one gust happens, s. */
const GUST_SLOT = 7;

/** 1-D value noise in [-1, 1], smooth (smoothstepped), from a seed and a channel. */
function noise1(seed: number, ch: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  const a = hash01(seed * 977 + ch, i) * 2 - 1;
  const b = hash01(seed * 977 + ch, i + 1) * 2 - 1;
  return a + (b - a) * s;
}

/** A gust's shape over its life: up over `rise`, held, down over `fall` (smooth ends), 0-1. */
function gustShape(t: number, rise: number, hold: number, fall: number): number {
  if (t <= 0 || t >= rise + hold + fall) return 0;
  if (t < rise) {
    const u = t / rise;
    return u * u * (3 - 2 * u);
  }
  if (t < rise + hold) return 1;
  const u = 1 - (t - rise - hold) / fall;
  return u * u * (3 - 2 * u);
}

export class Wind {
  params: WindParams = { ...CALM };
  constructor(readonly seed = 1) {}

  /**
   * How strong the wind is at time t relative to its mean (1 = the mean): the
   * swells and lulls, the gusts and the turbulence. Also how far a gust has
   * veered it, radians.
   */
  private factor(t: number): [number, number] {
    const g = Math.max(0, Math.min(1, this.params.gusts));
    // Slow swells and lulls (tens of seconds), and turbulence (a second or so).
    let f = 1 + 0.35 * g * noise1(this.seed, 1, t / 18) + 0.12 * g * noise1(this.seed, 2, t * 1.3);
    // A lull now and then: the wind all but drops for a few seconds.
    const lslot = Math.floor(t / 23);
    if (hash01(this.seed * 31 + 3, lslot) < 0.25 + 0.35 * g) {
      const at = lslot * 23 + hash01(this.seed * 31 + 4, lslot) * 14;
      f *= 1 - g * 0.85 * gustShape(t - at, 1.5, 1 + 3 * hash01(this.seed * 31 + 5, lslot), 2);
    }
    // Gusts: in each slot one, as often as it is gusty, of its own size, rise, hold and fall; the one before may still be falling.
    let veer = 0;
    const slot = Math.floor(t / GUST_SLOT);
    for (let s = slot - 1; s <= slot; s++) {
      if (hash01(this.seed * 53 + 1, s) > 0.25 + 0.7 * g) continue;
      const at = s * GUST_SLOT + hash01(this.seed * 53 + 2, s) * GUST_SLOT;
      const rise = 0.6 + 1.6 * hash01(this.seed * 53 + 3, s);
      const hold = 0.3 + 2.5 * hash01(this.seed * 53 + 4, s);
      const fall = 1.5 + 3.5 * hash01(this.seed * 53 + 5, s);
      const size = g * (0.35 + 0.9 * hash01(this.seed * 53 + 6, s));
      const shape = gustShape(t - at, rise, hold, fall);
      f += size * shape;
      veer += shape * (hash01(this.seed * 53 + 7, s) * 2 - 1);
    }
    return [Math.max(0, f), veer];
  }

  /** The wind along the glass at a pane point (mm) at time t (s): [x, y], m/s. */
  at(t: number, x = 0, y = 0): [number, number] {
    const p = this.params;
    if (!(p.mph > 0)) return [0, 0];
    const d0 = (p.direction * Math.PI) / 180;
    // A gust sweeps across from where the wind comes from: later the further downwind.
    const lag = (x * Math.cos(d0) + y * Math.sin(d0)) / FRONT_MM_S;
    const tt = t - lag;
    const [f, veer] = this.factor(tt);
    const swing = (p.swing * Math.PI) / 180;
    const d =
      d0 +
      swing * (0.75 * noise1(this.seed, 3, tt / 25) + 0.25 * noise1(this.seed, 4, tt / 6)) +
      0.5 * swing * veer;
    const u = p.mph * MPH * f;
    return [u * Math.cos(d), u * Math.sin(d)];
  }

  /** The wind's speed at the pane's middle, mph (for the rate of rain, drying, the falling rain). */
  mphAt(t: number, x = 0, y = 0): number {
    const [wx, wy] = this.at(t, x, y);
    return Math.hypot(wx, wy) / MPH;
  }
}
