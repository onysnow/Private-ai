import { describe, expect, it } from "vitest";
import { ROUGH_COSINES, roughAt, roughInterface, roughRow } from "./rough-transmission";
import { fresnelExact, frostRoughness } from "./reflection";
import { frostSpread } from "./transmission";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";

/*
 * Light engine step H (30b): a frosted face's transmission from its
 * microfacets (Walter et al. 2007), not rules of thumb.
 */
const N = 1.518;

describe("light through a rough face", () => {
  it("is the smooth face's Fresnel when the face is nearly smooth", () => {
    for (const c of [1, 0.7, 0.4]) {
      const r = roughInterface(c, N, 0.02);
      expect(r.transmitted).toBeCloseTo(1 - fresnelExact(c, N), 2);
      expect(r.reflected).toBeCloseTo(fresnelExact(c, N), 2);
    }
  });

  it("never makes light: what is reflected and transmitted is at most what arrived", () => {
    for (const alpha of [0.05, 0.2, 0.4, 0.6, 0.9]) {
      for (const c of [1, 0.6, 0.3, 0.1]) {
        const r = roughInterface(c, N, alpha, 32);
        expect(r.reflected + r.transmitted).toBeLessThanOrEqual(1.0001);
      }
    }
    /*
     * Single scattering: light that bounces between facets more than once is
     * not counted -- a known loss of the model that grows with roughness and
     * slant. At the site's frost it is small.
     */
    const site = frostRoughness(0.6);
    for (const c of [1, 0.6, 0.3]) {
      const r = roughInterface(c, N, site, 32);
      expect(r.reflected + r.transmitted).toBeGreaterThan(0.85);
    }
  });

  it("scatters wider the rougher it is, and wider at a slant", () => {
    const s = [0.05, 0.2, 0.4, 0.6].map((a) => roughInterface(1, N, a, 40).spread);
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThan(s[i - 1]!);
    expect(roughInterface(0.2, N, 0.4, 40).spread).toBeGreaterThan(
      roughInterface(1, N, 0.4, 40).spread,
    );
  });

  it("at the site's frost, spreads light as the old rule did, straight on", () => {
    const frost = 0.6;
    const alpha = frostRoughness(frost);
    const rule = frostSpread(frost, N, 1, 1); // (n - 1) alpha, for a unit gap straight on
    const facets = roughInterface(1, N, alpha, 64).spread;
    expect(Math.abs(facets - rule) / rule).toBeLessThan(0.1);
  });

  it("costs a frosted face a few per cent of the light, not the old rule's 18% times the frost", () => {
    const row = roughRow(N, 0.6);
    expect(row.ratio[0]).toBeGreaterThan(0.95);
    expect(row.ratio[0]).toBeLessThanOrEqual(1);
    expect(1 - 0.18 * 0.6).toBeLessThan(row.ratio[0]);
  });
});

describe("a pane's row", () => {
  it("reads back its own samples and between them linearly", () => {
    const v = [1, 0.8, 0.5, 0.2];
    ROUGH_COSINES.forEach((c, i) => expect(roughAt(v, c)).toBeCloseTo(v[i]!, 12));
    expect(roughAt(v, 0.85)).toBeCloseTo(0.9, 12);
    expect(roughAt(v, 0.05)).toBeCloseTo(0.2, 12);
  });

  it("is what the floor light reads, only while previewed", () => {
    expect(FLOOR_FRAGMENT_SHADER).toMatch(/uniform vec4 uRoughRatio\[/);
    expect(FLOOR_FRAGMENT_SHADER).toMatch(/if \(uRoughGlass > 0\.5\)/);
    expect(FLOOR_FRAGMENT_SHADER).toMatch(/float faceThrough = 1\.0 - 0\.18 \* frost;/);
  });
});
