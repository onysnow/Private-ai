import { describe, expect, it } from "vitest";
import { flameFlickerAt, puffingHz, TORCH } from "./flame";

// flame.md 6.4: the spectrum of the torch's flicker.
describe("the torch's flicker (flame.md 6.4)", () => {
  const rate = 120;
  const seconds = 60;
  const n = rate * seconds;
  const xs = Array.from({ length: n }, (_, i) => flameFlickerAt(i / rate, TORCH));
  const mean = xs.reduce((s, v) => s + v, 0) / n;

  it("stays inside its clamp", () => {
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.55);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1.1);
    expect(mean).toBeGreaterThan(0.55);
    expect(mean).toBeLessThan(1.1);
  });

  // A plain DFT at chosen frequencies is enough here.
  const power = (f: number) => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * f * i) / rate;
      re += (xs[i]! - mean) * Math.cos(a);
      im += (xs[i]! - mean) * Math.sin(a);
    }
    return re * re + im * im;
  };

  it("puffs at 1.5/sqrt(D): the strongest line between 4 and 12 Hz is within 10% of 6.7 Hz", () => {
    const target = puffingHz(TORCH.diameter);
    expect(target).toBeCloseTo(6.7, 1);
    let best = 0;
    let bestF = 0;
    for (let f = 4; f <= 12; f += 0.05) {
      const p = power(f);
      if (p > best) {
        best = p;
        bestF = f;
      }
    }
    expect(Math.abs(bestF - target) / target).toBeLessThan(0.1);
  });

  it("has under 1% of its power above 20 Hz", () => {
    let low = 0;
    let high = 0;
    for (let f = 0.1; f < 60; f += 0.1) {
      const p = power(f);
      if (f > 20) high += p;
      else low += p;
    }
    expect(high / (low + high)).toBeLessThan(0.01);
  });
});
