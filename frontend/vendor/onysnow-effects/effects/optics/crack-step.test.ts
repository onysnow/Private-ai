import { describe, expect, it } from "vitest";
import { riserLit, riserSeen, stepAt, stepShadow } from "./crack-step";
import { pieceLift } from "./shard-tilt";

/*
 * Surface displacement (Ony, 2026-10-02): pieces proud or sunk by a few px,
 * and the step each makes at its cracks.
 */
describe("piece lift", () => {
  it("is nothing at displacement 0 and within 15% of the thickness at 1", () => {
    for (let k = 0; k < 50; k++) {
      expect(Math.abs(pieceLift("annealed", 1, 0.1, 0, 18, k / 50))).toBe(0);
      expect(Math.abs(pieceLift("annealed", 1, 0, 1, 18, k / 50))).toBeLessThanOrEqual(
        18 * 0.3 + 1e-9,
      );
    }
  });

  it("goes both ways, most near the strike, and a laminated pane's pieces barely move", () => {
    expect(pieceLift("annealed", 0.8, 0.05, 0.5, 18, 0.95)).toBeGreaterThan(0);
    expect(pieceLift("annealed", 0.8, 0.05, 0.5, 18, 0.05)).toBeLessThan(0);
    const near = Math.abs(pieceLift("annealed", 0.8, 0.05, 0.5, 18, 0.95));
    const far = Math.abs(pieceLift("annealed", 0.8, 0.6, 0.5, 18, 0.95));
    expect(far).toBeLessThan(near * 0.6);
    const lam = Math.abs(pieceLift("laminated", 0.8, 0.05, 0.5, 18, 0.95));
    expect(lam).toBeLessThan(near * 0.2);
  });
});

describe("the step at a crack", () => {
  const n = { x: 1, y: 0 }; // across the crack, to the right
  const mid = { x: 100, y: 100 };

  it("is null when the pieces sit level", () => {
    expect(stepAt(1.0, 1.1)).toBeNull();
    expect(stepAt(0, 2)).toEqual({ rise: 2, low: -1 });
  });

  it("shows its riser only from the low side, on the high side of the line, as wide as the rise times the slant", () => {
    const step = stepAt(0, 2)!; // the right side is higher; the low side is the left
    // The eye off to the left (on the low side): sees the riser, a strip on the right (high) side.
    const fromLeft = riserSeen(step, mid, n, { x: -900, y: 100, z: 1000 });
    expect(fromLeft.side).toBe(1);
    expect(fromLeft.width).toBeCloseTo(2 * 1.0, 6);
    // From the right (the high side): hidden behind the higher piece.
    expect(riserSeen(step, mid, n, { x: 1100, y: 100, z: 1000 }).width).toBe(0);
  });

  it("throws a shadow onto the lower piece from a light over the high side, and lights the riser from the low side", () => {
    const step = stepAt(0, 2)!; // the right side is higher
    const lightRight = { x: 200, y: 100, z: 50 }; // over the high side: shadows the low (left) piece
    expect(stepShadow(step, mid, n, lightRight)).toBeCloseTo((2 * 100) / 50, 6);
    expect(riserLit(step, mid, n, lightRight)).toBe(0);
    const lightLeft = { x: 0, y: 100, z: 50 }; // over the low side: no shadow, the riser lit
    expect(stepShadow(step, mid, n, lightLeft)).toBe(0);
    expect(riserLit(step, mid, n, lightLeft)).toBeGreaterThan(0.5);
  });
});
