import { describe, expect, it } from "vitest";
import { DropSim } from "./sim";
import { MPH, Wind } from "./wind";

const sim = (
  mph: number,
  direction: number,
  o: Partial<ConstructorParameters<typeof DropSim>[0]> = {},
) => {
  const s = new DropSim({
    width: 300,
    height: 400,
    pinning: 0,
    trails: false,
    seed: 3,
    evaporate: false,
    ...o,
  });
  s.windModel = new Wind(5);
  s.windModel.params = { mph, direction, gusts: 0, swing: 0 };
  return s;
};

describe("wind (effects/water/wind)", () => {
  it("is the same wind for the same seed and clock, and gusts round its mean", () => {
    const a = new Wind(9);
    const b = new Wind(9);
    a.params = b.params = { mph: 20, direction: 0, gusts: 1, swing: 30 };
    let lo = Infinity;
    let hi = 0;
    let sum = 0;
    const n = 3000;
    for (let k = 0; k < n; k++) {
      const t = k * 0.1;
      expect(a.at(t, 50, 50)).toEqual(b.at(t, 50, 50));
      const m = a.mphAt(t);
      lo = Math.min(lo, m);
      hi = Math.max(hi, m);
      sum += m;
    }
    // Gusts up to well over the mean, lulls well under it, the mean about the mean (gusts add).
    expect(hi).toBeGreaterThan(30);
    expect(lo).toBeLessThan(12);
    expect(sum / n).toBeGreaterThan(17);
    expect(sum / n).toBeLessThan(32);
  });

  it("a steady wind is steady; a calm is none", () => {
    const w = new Wind(2);
    w.params = { mph: 10, direction: 90, gusts: 0, swing: 0 };
    const [x, y] = w.at(12.3);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(10 * MPH, 6);
    w.params = { mph: 0, direction: 0, gusts: 1, swing: 40 };
    expect(w.at(5)).toEqual([0, 0]);
  });

  it("a strong wind across the glass drives a running drop well off the fall line", () => {
    const s = sim(55, 0);
    const i = s.add(100, 100, 20);
    const x0 = s.x[i]!;
    const y0 = s.y[i]!;
    for (let k = 0; k < 120; k++) s.step(1 / 120);
    const dx = s.x[i]! - x0;
    const dy = s.y[i]! - y0;
    expect(dx).toBeGreaterThan(0.8 * dy);
    expect(dx).toBeGreaterThan(1);
  });

  it("in a wind up the glass small drops climb while big ones still slide down (Phys. Rev. Fluids 2022)", () => {
    // At 62 mph up the pane: 10 uL is pushed up harder than it weighs and climbs; 150 uL (a stream's worth) still falls.
    const s = sim(62, 270);
    const small = s.add(80, 200, 10);
    const big = s.add(220, 200, 150);
    const ys = s.y[small]!;
    const yb = s.y[big]!;
    for (let k = 0; k < 60; k++) s.step(1 / 120);
    // Indices may shift on removal; find them by position side.
    let climbed = false;
    let fell = false;
    for (let i = 0; i < s.count; i++) {
      if (s.x[i]! < 150 && s.y[i]! < ys - 0.3) climbed = true;
      if (s.x[i]! > 150 && s.y[i]! > yb + 0.3) fell = true;
    }
    expect(climbed).toBe(true);
    expect(fell).toBe(true);
  });

  it("a still drop too light to slide is held in a breeze but pushed off in a gale", () => {
    const calm = sim(8, 0);
    const i = calm.add(150, 200, 5);
    const x0 = calm.x[i]!;
    for (let k = 0; k < 60; k++) calm.step(1 / 120);
    expect(Math.abs(calm.x[i]! - x0)).toBeLessThan(0.01);
    const gale = sim(60, 0);
    const j = gale.add(150, 200, 5);
    for (let k = 0; k < 60; k++) gale.step(1 / 120);
    expect(gale.x[j]! - x0).toBeGreaterThan(0.5);
  });

  it("the rain reaching the glass goes with the wind", () => {
    const calm = sim(0, 0);
    const gale = sim(50, 0);
    const breeze = sim(8, 0);
    expect(calm.rainRate(1)).toBeLessThan(0.5);
    expect(breeze.rainRate(1)).toBeCloseTo(1, 5);
    expect(gale.rainRate(1)).toBeGreaterThan(2.5);
    expect(calm.rainRate(0)).toBe(1);
  });

  it("the frame shelters its lee: less rain lands just behind the edge the wind comes from", () => {
    const s = sim(30, 0);
    expect(s.landWeight(3, 200)).toBeLessThan(0.6 * s.landWeight(60, 200));
  });
});
