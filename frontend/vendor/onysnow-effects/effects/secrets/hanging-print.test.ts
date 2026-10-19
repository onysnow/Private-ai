import { describe, expect, it } from "vitest";
import {
  G,
  advance,
  atRest,
  developed,
  energy,
  normalPeriods,
  pointOf,
  printBody,
  type PrintBody,
  type Swing,
} from "./hanging-print";

const still: Swing = { a: 0, b: 0, va: 0, vb: 0 };
const portrait = printBody(0.8);
const frictionless: PrintBody = { ...portrait, pegFriction: 0, clipFriction: 0 };

/** The time between successive upward zero crossings of the sheet's angle. */
function measuredPeriod(p: PrintBody, s0: Swing, seconds: number): number {
  let s = s0;
  const dt = 1 / 480;
  const ups: number[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const next = advance(p, s, dt);
    if (s.b < 0 && next.b >= 0) ups.push(t + dt * (-s.b / (next.b - s.b)));
    s = next;
  }
  return (ups[ups.length - 1]! - ups[0]!) / (ups.length - 1);
}

describe("a print hanging on a cord (item 40)", () => {
  it("is a 10 x 8 inch sheet whichever way round", () => {
    expect(portrait.height).toBeCloseTo(0.254, 6);
    expect(portrait.width).toBeCloseTo(0.2032, 4);
    const land = printBody(1.25);
    expect(land.width).toBeCloseTo(0.254, 6);
  });

  it("hangs still when nothing moves it", () => {
    const s = advance(portrait, still, 2);
    expect(Math.abs(s.a) + Math.abs(s.b)).toBe(0);
    expect(atRest(s)).toBe(true);
  });

  it("keeps its energy with no friction (the integrator adds and loses nothing)", () => {
    let s: Swing = { a: 0.5, b: -0.3, va: 0, vb: 1 };
    const e0 = energy(frictionless, s);
    for (let i = 0; i < 600; i++) s = advance(frictionless, s, 1 / 60);
    expect(Math.abs(energy(frictionless, s) - e0)).toBeLessThan(1e-6 * Math.abs(e0) + 1e-7);
  });

  it("swings at the slow normal mode's period, about once a second", () => {
    const [slow, fast] = normalPeriods(frictionless);
    expect(slow).toBeGreaterThan(0.8);
    expect(slow).toBeLessThan(1.4);
    expect(fast).toBeLessThan(slow / 2);
    // Start in the slow mode: cord and sheet in step, small.
    const eps = 0.01;
    // Mode shape from (K - w M) v = 0, first row: (g l - w l^2) va + (-w l d) vb = 0.
    const w = ((2 * Math.PI) / slow) ** 2;
    const l = frictionless.cord;
    const d = frictionless.height / 2;
    const ratio = (G * l - w * l * l) / (w * l * d);
    const T = measuredPeriod(frictionless, { a: eps, b: eps * ratio, va: 0, vb: 0 }, 12);
    expect(T).toBeCloseTo(slow, 2);
  });

  it("is a simple pendulum when the sheet is a point", () => {
    const point: PrintBody = { ...frictionless, width: 0, height: 0.2 };
    // A point mass at d = 0.1 below the clip: k = 0 needs width 0 and height 0,
    // so check the formula's limit through a zero-gyration body instead.
    const [slow] = normalPeriods({ ...point, width: 0, height: 1e-9 });
    expect(slow).toBeCloseTo(2 * Math.PI * Math.sqrt(point.cord / G), 3);
  });

  it("dies away over some seconds, as a print on a line does", () => {
    let s: Swing = { a: 0.2, b: 0.2, va: 0, vb: 0 };
    let peak0 = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      s = advance(portrait, s, 1 / 60);
      peak0 = Math.max(peak0, Math.abs(s.b));
    }
    for (let t = 0; t < 8; t += 1 / 60) s = advance(portrait, s, 1 / 60);
    let peak1 = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      s = advance(portrait, s, 1 / 60);
      peak1 = Math.max(peak1, Math.abs(s.b));
    }
    // Ten seconds on, a third to a twentieth of the swing is left.
    expect(peak1 / peak0).toBeLessThan(0.35);
    expect(peak1 / peak0).toBeGreaterThan(0.05);
  });

  it("follows a hand that holds it, and swings when let go", () => {
    const grip = { x: 0, y: portrait.height, to: [0.15, 0.25] as [number, number] };
    let s = still;
    for (let i = 0; i < 180; i++) s = advance(portrait, s, 1 / 60, grip);
    const [x, y] = pointOf(portrait, s, grip.x, grip.y);
    expect(Math.hypot(x - 0.15, y - 0.25)).toBeLessThan(0.02);
    s = advance(portrait, s, 0.3);
    expect(Math.abs(s.va) + Math.abs(s.vb)).toBeGreaterThan(0.5);
  });

  it("comes up in the developer after a moment, then slows", () => {
    expect(developed(0.5)).toBe(0);
    expect(developed(3)).toBeGreaterThan(0.4);
    expect(developed(3) - developed(2)).toBeGreaterThan(developed(8) - developed(7));
    expect(developed(20)).toBeGreaterThan(0.99);
  });
});
