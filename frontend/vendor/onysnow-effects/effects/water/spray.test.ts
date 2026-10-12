import { describe, expect, it } from "vitest";
import { BLOOD, SLIME, WATER } from "./liquids";
import { coneAngle, LANDED_FRACTION, ohnesorge, squeeze, SQUEEZE_UL } from "./spray";

describe("the spray bottle (liquids-spray 5.3)", () => {
  it("water and blood spray; slime streams (Ohnesorge past 0.2)", () => {
    expect(ohnesorge(WATER.id)).toBeLessThan(0.01);
    expect(ohnesorge(BLOOD.id)).toBeLessThan(0.2);
    expect(ohnesorge(SLIME.id)).toBeGreaterThan(0.2);
  });

  it("the cone narrows with viscosity: water 60, blood about 51 degrees", () => {
    expect(coneAngle(WATER.id)).toBeCloseTo(60, 6);
    expect(coneAngle(BLOOD.id)).toBeGreaterThan(50);
    expect(coneAngle(BLOOD.id)).toBeLessThan(53);
  });

  it("a squeeze lands its share of a millilitre, in a hollow cone", () => {
    let seed = 7;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const parcels = squeeze(WATER.id, random);
    const total = parcels.reduce((s, p) => s + p.volume, 0);
    expect(total).toBeCloseTo(SQUEEZE_UL * LANDED_FRACTION, 6);
    const R = Math.max(...parcels.map((p) => Math.hypot(p.dx, p.dy)));
    const inner = parcels.filter((p) => Math.hypot(p.dx, p.dy) < 0.55 * R).length;
    expect(inner).toBe(0);
  });
});
