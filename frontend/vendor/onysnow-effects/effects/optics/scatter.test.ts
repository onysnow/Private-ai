import { describe, expect, it } from "vitest";
import { rayleighRgb, scatterDepth, unscattered } from "./scatter";
import { OPAL_GLASS, materialById } from "@fx/effects/materials/presets";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";

/*
 * Catalogue item 32d: opal glass scatters in its volume, blue most.
 */
describe("volume scattering", () => {
  it("follows Rayleigh: blue about twice red, as lambda^-4", () => {
    const [r, g, b] = rayleighRgb(0.06);
    expect(g).toBeCloseTo(0.06, 12);
    expect(b / r).toBeCloseTo(Math.pow(610 / 465, 4), 10);
    expect(b / r).toBeGreaterThan(2.5);
  });

  it("lets through warm light: least blue gets through unscattered", () => {
    const [r, g, b] = unscattered(OPAL_GLASS.scatter!, 18);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(g).toBeCloseTo(Math.exp(-0.06 * 18), 10);
  });

  it("is nothing for a slab of no thickness", () => {
    expect(scatterDepth(0.06, 0)).toEqual([0, 0, 0]);
  });

  it("is a material, read by both light passes", () => {
    expect(materialById("opal")).toBe(OPAL_GLASS);
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toMatch(/uniform vec3\s+uScatter;/);
    expect(FLOOR_FRAGMENT_SHADER).toMatch(/uniform vec3 uUnscattered\[/);
  });
});
