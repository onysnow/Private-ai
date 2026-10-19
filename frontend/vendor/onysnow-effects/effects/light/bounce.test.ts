import { describe, expect, it } from "vitest";
import { POOL_MEAN, bounceGlow, bounceShare, discFormFactor, poolRadius } from "./bounce";

describe("light bouncing off the photograph into the glass (step F)", () => {
  it("never carries more than its parent times the print's reflectance", () => {
    for (const h of [50, 300, 1500]) {
      for (const gap of [0, 40, 200]) {
        for (const d of [0, 100, 1000]) {
          expect(bounceShare(h, gap, d, 1)).toBeLessThanOrEqual(0.5);
          expect(discFormFactor(poolRadius(h), gap, d)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("is strongest right over the pool and falls away across the glass", () => {
    expect(bounceShare(300, 70, 0, 0.6)).toBeGreaterThan(bounceShare(300, 70, 200, 0.6));
  });

  it("reaches a pane close over the photograph more than one far above it", () => {
    expect(bounceShare(300, 20, 0, 0.6)).toBeGreaterThan(bounceShare(300, 400, 0, 0.6));
  });

  it("does nothing through clear glass: only a frosted back face scatters it out to you", () => {
    expect(bounceShare(300, 70, 0, 0)).toBe(0);
  });

  it("matches a disc's exact on-axis form factor, R^2 / (R^2 + h^2)", () => {
    expect(discFormFactor(100, 100, 0)).toBeCloseTo(0.5, 10);
  });
});

describe("the glow's brightness", () => {
  it("never carries more than the print's own glow", () => {
    const cases: [number, number, number, number, number][] = [
      [20, 0, 300, 1, 1],
      [40, 50, 120, 0.6, 0.8],
      [10, 300, 600, 0.3, 0.2],
    ];
    for (const [g, d, h, f, a] of cases) {
      expect(bounceGlow(1.4, g, d, h, f, a)).toBeLessThanOrEqual(1.4 * a);
    }
  });

  it("is nothing over a black print, and grows with the print's whiteness", () => {
    expect(bounceGlow(1, 20, 0, 300, 0.6, 0)).toBe(0);
    expect(bounceGlow(1, 20, 0, 300, 0.6, 0.8)).toBeGreaterThan(
      bounceGlow(1, 20, 0, 300, 0.6, 0.2),
    );
  });

  it("averages the cos^3 pool over its disc: about 0.79 of the centre", () => {
    expect(POOL_MEAN).toBeCloseTo(0.792, 3);
  });

  it("is a few per cent of the print's glow over a mid-grey print under a frosted pane", () => {
    // 18% grey, frost 0.6, a 20 px gap, the light 300 px up: ~5% of full white.
    const g = bounceGlow(1, 20, 0, 300, 0.6, 0.18);
    expect(g).toBeGreaterThan(0.03);
    expect(g).toBeLessThan(0.1);
  });
});
