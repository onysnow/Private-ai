import { describe, expect, it } from "vitest";
import { castShadow, isotropicBlur, penumbraOf } from "./shadow";
import { penumbraAcross } from "./transmission";

const base = { lampX: 0, lampY: 0, height: 300, radius: 46, gap: 22 };

describe("one shadow model", () => {
  it("straight under the lamp: in place, grown by H / (H - g), evenly soft", () => {
    const s = castShadow({ ...base, x: 0, y: 0 });
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
    expect(s.scale).toBeCloseTo(300 / 278, 12);
    expect(s.across).toBeCloseTo((46 * 22) / 278, 12);
    expect(s.along).toBeCloseTo(s.across, 12);
  });

  it("off to the side: pushed away by (C - L) g / (H - g), and softer along the light", () => {
    const s = castShadow({ ...base, x: 400, y: 0 });
    expect(s.x).toBeCloseTo(400 * (300 / 278), 9);
    expect(s.dirX).toBeCloseTo(1, 12);
    expect(s.along).toBeGreaterThan(s.across * 1.5);
    // The penumbra across the light does not change with the angle.
    expect(s.across).toBeCloseTo(castShadow({ ...base, x: 0, y: 0 }).across, 12);
  });

  it("a nearer lamp throws a bigger, softer shadow; a higher one a smaller, sharper one", () => {
    const near = castShadow({ ...base, height: 120, x: 0, y: 0 });
    const far = castShadow({ ...base, height: 1200, x: 0, y: 0 });
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(near.across).toBeGreaterThan(far.across);
  });

  it("a point lamp casts a hard shadow; a thing on the surface casts one exactly its size", () => {
    expect(castShadow({ ...base, radius: 0, x: 50, y: 50 }).across).toBe(0);
    const flat = castShadow({ ...base, gap: 0, x: 50, y: 50 });
    expect(flat.scale).toBe(1);
    expect(flat.x).toBe(50);
    expect(flat.across).toBe(0);
  });

  it("never divides by the lamp reaching the thing", () => {
    const s = castShadow({ ...base, height: 10, gap: 22, x: 5, y: 5 });
    expect(Number.isFinite(s.scale)).toBe(true);
    expect(Number.isFinite(s.across)).toBe(true);
  });

  it("an edge's penumbra blends from across to along by which way it faces", () => {
    expect(penumbraOf(10, 0.5, 0)).toBeCloseTo(10, 12);
    expect(penumbraOf(10, 0.5, 1)).toBeCloseTo(20, 12);
    expect(isotropicBlur({ across: 10, along: 20 } as never)).toBe(15);
  });

  it("the floor's shadow is the same model", () => {
    // penumbraAcross(radius, gap, height, cos, cosPhi) == penumbraOf(R g / (H - g), ...)
    expect(penumbraAcross(46, 70, 300, 0.7, 0.8)).toBeCloseTo(
      penumbraOf((46 * 70) / 230, 0.7, 0.8),
      12,
    );
  });
});
