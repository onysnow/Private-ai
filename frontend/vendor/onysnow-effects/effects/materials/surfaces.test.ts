import { describe, expect, it } from "vitest";
import { SURFACE_MATERIALS, surfaceMaterial } from "./surfaces";
import { fluorescenceOn } from "@fx/effects/adapters/css-vars";
import { FROSTED_FLOAT } from "./presets";

/*
 * Item 25a: what glows under UV follows the research (claude/tools-research.md),
 * and only under UV.
 */
describe("fluorescence", () => {
  const y = (id: keyof typeof SURFACE_MATERIALS) => SURFACE_MATERIALS[id].fluorescence.yield;

  it("ranks the page's surfaces as the sources do", () => {
    // Day-glo pigment is the brightest thing on the page.
    for (const id of Object.keys(SURFACE_MATERIALS) as (keyof typeof SURFACE_MATERIALS)[]) {
      expect(y("dayglo-orange")).toBeGreaterThanOrEqual(y(id));
    }
    // Brightened dust and paper glow; finger grease barely does; ink not at all.
    expect(y("grime-dust")).toBeGreaterThan(10 * y("grime-oil"));
    expect(y("print-paper")).toBeGreaterThan(10 * y("grime-oil"));
    expect(y("grime-oil")).toBeLessThan(0.1);
    expect(y("ink")).toBe(0);
  });

  it("glows only where UV arrives", () => {
    const light = { uvReach: 1, lit: 1 };
    const dayglo = SURFACE_MATERIALS["dayglo-orange"];
    expect(fluorescenceOn(light, { uv: 0 }, dayglo)).toBe(0);
    expect(fluorescenceOn(light, { uv: 1 }, dayglo)).toBeCloseTo(1);
    expect(fluorescenceOn({ uvReach: 0, lit: 1 }, { uv: 1 }, dayglo)).toBe(0);
  });

  it("treats an unknown material as ink, and lets most UV-A through the glass", () => {
    expect(surfaceMaterial("nonsense").id).toBe("ink");
    expect(FROSTED_FLOAT.uvTransmit).toBeGreaterThan(0.6);
    expect(FROSTED_FLOAT.uvTransmit).toBeLessThan(0.8);
  });
});
