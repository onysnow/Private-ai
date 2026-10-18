import { describe, expect, it } from "vitest";
import { BLACK_FLOOR, CEILING, KNEE, toneCurve } from "./camera-match";

describe("camera match (the photographs' tone, measured)", () => {
  it("lifts black to the photographs' floor, never 0", () => {
    expect(toneCurve(0)).toBeCloseTo(BLACK_FLOOR, 6);
    expect(toneCurve(-1)).toBeCloseTo(BLACK_FLOOR, 6);
  });

  it("is linear through the mid-tones", () => {
    const a = toneCurve(0.2);
    const b = toneCurve(0.4);
    expect(b - a).toBeCloseTo(0.2 * (1 - BLACK_FLOOR), 6);
  });

  it("rolls highlights off below the ceiling instead of clipping", () => {
    expect(toneCurve(1)).toBeLessThan(CEILING);
    expect(toneCurve(1)).toBeGreaterThan(KNEE);
    expect(toneCurve(10)).toBeLessThanOrEqual(CEILING);
    // Still rising: a brighter highlight stays brighter.
    expect(toneCurve(2)).toBeGreaterThan(toneCurve(1));
  });

  it("is continuous at the knee", () => {
    const x = (KNEE - BLACK_FLOOR) / (1 - BLACK_FLOOR);
    expect(Math.abs(toneCurve(x + 1e-6) - toneCurve(x - 1e-6))).toBeLessThan(1e-5);
  });
});
