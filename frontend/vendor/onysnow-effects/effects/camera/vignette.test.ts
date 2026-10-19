import { describe, expect, it } from "vitest";
import { cos4, vignetteGradient } from "./vignette";

describe("natural vignetting", () => {
  it("is 1 on the axis and falls as cos^4 off it", () => {
    expect(cos4(0, 1000)).toBe(1);
    // 45 degrees off: cos^4 = 1/4.
    expect(cos4(1000, 1000)).toBeCloseTo(0.25, 12);
  });

  it("darkens corners more the closer the camera is", () => {
    expect(cos4(800, 600)).toBeLessThan(cos4(800, 1600));
  });

  it("draws nothing at the middle and the law's darkness at the edge", () => {
    const g = vignetteGradient(500, 400, 1000, 1000, 1, 4);
    expect(g.startsWith("radial-gradient(circle at 500.0px 400.0px")).toBe(true);
    expect(g).toContain("rgb(0 0 0 / 0.0000) 0.0px");
    expect(g).toContain("rgb(0 0 0 / 0.7500) 1000.0px");
    // Half strength, half the darkness.
    expect(vignetteGradient(0, 0, 1000, 1000, 0.5, 1)).toContain("rgb(0 0 0 / 0.3750) 1000.0px");
  });
});
