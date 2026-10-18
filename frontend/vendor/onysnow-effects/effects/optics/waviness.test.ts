import { describe, expect, it } from "vitest";
import { waveHessian, waveScale, waveSlope } from "./waviness";
import { WAVINESS_GLSL } from "./waviness.glsl";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";
import { bevelField, interiorIsNeutral } from "@fx/lib/bevel-map";

describe("waviness: one surface for the view and the light", () => {
  it("its curvature is the derivative of its slope", () => {
    const e = 0.01;
    for (const [x, y, seed] of [
      [10, 20, 0.3],
      [140, -60, 0.8],
      [333, 71, 0.05],
    ] as const) {
      const [hxx, hyy, hxy] = waveHessian(x, y, seed);
      const dx = (waveSlope(x + e, y, seed)[0] - waveSlope(x - e, y, seed)[0]) / (2 * e);
      const dy = (waveSlope(x, y + e, seed)[1] - waveSlope(x, y - e, seed)[1]) / (2 * e);
      const dxy = (waveSlope(x, y + e, seed)[0] - waveSlope(x, y - e, seed)[0]) / (2 * e);
      expect(hxx).toBeCloseTo(dx, 5);
      expect(hyy).toBeCloseTo(dy, 5);
      expect(hxy).toBeCloseTo(dxy, 5);
    }
  });

  it("is off for flat glass and carries further across a bigger gap", () => {
    expect(waveScale(0, 70)).toBe(0);
    expect(waveScale(1, 140)).toBeGreaterThan(waveScale(1, 70));
  });

  it("is the one surface both the caustic and the view read", () => {
    // The light through the glass: the floor shader's caustic.
    expect(FLOOR_FRAGMENT_SHADER.split(WAVINESS_GLSL).length - 1).toBe(1);
    expect(FLOOR_FRAGMENT_SHADER).toContain("waveSurface(");
    // The view through it: the pane's displacement map, across the whole face.
    const shift = waveScale(1, 70);
    const field = bevelField(200, 120, 0, {
      bezelWidth: 10,
      thickness: 18,
      ior: 1.5,
      wave: { shift, seed: 2, cssPerMap: 1 },
    });
    const [x, y] = [100, 60]; // the middle: far from the bevel
    const o = (y * 200 + x) * 4;
    const [sx, sy] = waveSlope(x + 0.5, y + 0.5, 2);
    const decode = (v: number) => ((v - 128) / 127) * field.maxOffset;
    expect(decode(field.data[o]!)).toBeCloseTo(sx * shift, 0);
    expect(decode(field.data[o + 1]!)).toBeCloseTo(sy * shift, 0);
  });

  it("leaves flat glass's face exactly where it is", () => {
    const field = bevelField(200, 120, 0, { bezelWidth: 10, thickness: 18, ior: 1.5 });
    expect(interiorIsNeutral(field, 10)).toBe(true);
  });
});
