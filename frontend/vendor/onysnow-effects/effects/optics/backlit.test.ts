import { describe, expect, it } from "vitest";
import { backlitProfile, extraction, reach } from "./backlit";
import { BACKLIT_GLSL } from "./backlit.glsl";

const half = { x: 600, y: 150 };

describe("backlit glass: an edge-lit light guide", () => {
  it("is brightest at the edge the light enters by and falls away across the pane", () => {
    const a = backlitProfile({ x: -600, y: 0 }, half, "left", 0.7, 0.5);
    const b = backlitProfile({ x: 0, y: 0 }, half, "left", 0.7, 0.5);
    const c = backlitProfile({ x: 600, y: 0 }, half, "left", 0.7, 0.5);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(0);
  });

  it("lit from both sides is symmetric, and fuller in the middle than one side alone", () => {
    const l = backlitProfile({ x: -300, y: 0 }, half, "both", 0.7, 0.5);
    const r = backlitProfile({ x: 300, y: 0 }, half, "both", 0.7, 0.5);
    expect(l).toBeCloseTo(r, 10);
    const mid = backlitProfile({ x: 0, y: 0 }, half, "both", 0.7, 0.5);
    const edge = backlitProfile({ x: -600, y: 0 }, half, "both", 0.7, 0.5);
    // The dip in the middle is gentle, not a hole.
    expect(mid / edge).toBeGreaterThan(0.25);
  });

  it("more fill reaches further: the far side brightens toward the near", () => {
    const short = backlitProfile({ x: 600, y: 0 }, half, "left", 0.2, 0.5);
    const long = backlitProfile({ x: 600, y: 0 }, half, "left", 2.5, 0.5);
    expect(long).toBeGreaterThan(short * 10);
  });

  it("frost lets the light out: frosted glows, clear barely; more frost, shorter reach", () => {
    expect(extraction(1)).toBeGreaterThan(extraction(0) * 5);
    expect(reach(0.7, 1200, 1)).toBeLessThan(reach(0.7, 1200, 0));
  });

  it("a lightbox behind is even but a little dimmer toward the rims", () => {
    const c = backlitProfile({ x: 0, y: 0 }, half, "behind", 1, 0.5);
    const e = backlitProfile({ x: 590, y: 140 }, half, "behind", 1, 0.5);
    expect(e).toBeLessThan(c);
    expect(e / c).toBeGreaterThan(0.6);
  });

  it("the shader carries the same model", () => {
    expect(BACKLIT_GLSL).toContain("0.12 + 0.88 * clamp(frost");
    expect(BACKLIT_GLSL).toContain("fill * extent / (0.35 + clamp(frost");
  });
});
