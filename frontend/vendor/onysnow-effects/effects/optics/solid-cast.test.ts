import { describe, expect, it } from "vitest";
import { castOf } from "./solid-cast";

/*
 * Item 25g, step 3: what a glass solid throws on the page is counted light,
 * so it must add up -- and a sphere must behave like the lens it is.
 */

const UPRIGHT = [1, 0, 0, 0, 0, 1, 0, -1, 0]; // object y toward the viewer
const cellAt = (c: ReturnType<typeof castOf>, x: number, y: number) => {
  const i = Math.floor(((x - c.x) / c.w) * c.cells);
  const j = Math.floor(((y - c.y) / c.h) * c.cells);
  return c.ratio[j * c.cells + i]!;
};

describe("what a glass solid casts", () => {
  const base = {
    size: 60,
    centre: { x: 500, y: 400, z: 84 },
    toWorld: UPRIGHT,
    n: 1.5168,
    absorb: 0,
    cells: 48,
    perCell: 2,
  };

  it("is nothing at all far from the solid: every cell gets its one ray's worth", () => {
    const c = castOf({ ...base, shape: "cube", light: { x: 500, y: 400, z: 2000 } });
    // A corner of the region, well outside the shadow.
    expect(cellAt(c, c.x + 2, c.y + 2)).toBeCloseTo(1, 1);
  });

  it("conserves light: what lands is what left, less what glass reflects and traps", () => {
    const c = castOf({ ...base, shape: "sphere", light: { x: 500, y: 400, z: 2000 } });
    const total = c.ratio.reduce((a, b) => a + b, 0);
    const cells = c.cells * c.cells;
    expect(total).toBeLessThanOrEqual(cells * 1.001);
    expect(total).toBeGreaterThan(cells * 0.85);
  });

  it("a sphere is a lens: it gathers light into a bright knot under it, ringed by shadow", () => {
    const c = castOf({ ...base, shape: "sphere", light: { x: 500, y: 400, z: 4000 } });
    // Nearly overhead, so the knot lands nearly under the centre.
    const knot = cellAt(c, 500, 400);
    expect(knot).toBeGreaterThan(3);
    // Out at the rim of its footprint the light has been bent inward: shadow.
    expect(cellAt(c, 500 + 55, 400)).toBeLessThan(0.6);
  });

  it("falls away from the light", () => {
    const c = castOf({ ...base, shape: "cube", light: { x: 100, y: 400, z: 600 } });
    // The region is centred on the solid projected from the light: past it, away from the light.
    expect(c.x + c.w / 2).toBeGreaterThan(500);
  });
});
