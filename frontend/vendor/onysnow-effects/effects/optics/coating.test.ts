import { describe, expect, it } from "vitest";
import { MGF2_QUARTER_WAVE, coatedReflectance, coatingRgb } from "./coating";
import { MUSEUM_GLASS, materialById } from "@fx/effects/materials/presets";

/*
 * Catalogue item 32c: a quarter wave of magnesium fluoride on float glass.
 */
const N = 1.518;

describe("an anti-reflection coating", () => {
  it("takes a face from 4.2% to about 1.3% at the wavelength it is cut for", () => {
    expect(coatedReflectance(550, N, MGF2_QUARTER_WAVE)).toBeCloseTo(0.0127, 3);
    // The single-layer minimum: ((ng - nc^2) / (ng + nc^2))^2.
    const nc2 = 1.38 * 1.38;
    expect(coatedReflectance(550, N, MGF2_QUARTER_WAVE)).toBeCloseTo(
      ((N - nc2) / (N + nc2)) ** 2,
      10,
    );
  });

  it("is least at 550 nm and rises either side: its purple sheen", () => {
    const at = (l: number) => coatedReflectance(l, N, MGF2_QUARTER_WAVE);
    expect(at(450)).toBeGreaterThan(at(550));
    expect(at(650)).toBeGreaterThan(at(550));
    const [r, g, b] = coatingRgb(N, MGF2_QUARTER_WAVE);
    expect(g).toBeLessThan(r);
    expect(g).toBeLessThan(b);
    for (const c of [r, g, b]) {
      expect(c).toBeGreaterThan(0.2);
      expect(c).toBeLessThan(0.5);
    }
  });

  it("is a zero-thickness film's bare reflectance when it has no thickness", () => {
    expect(coatedReflectance(550, N, { index: 1.38, thicknessNm: 0 })).toBeCloseTo(
      ((N - 1) / (N + 1)) ** 2,
      10,
    );
  });

  it("is on museum glass, which also keeps UV off the print", () => {
    expect(materialById("museum")).toBe(MUSEUM_GLASS);
    expect(MUSEUM_GLASS.coating).toBe(MGF2_QUARTER_WAVE);
    expect(MUSEUM_GLASS.frost).toBe(0);
    expect(MUSEUM_GLASS.uvTransmit).toBeLessThan(0.05);
  });
});
