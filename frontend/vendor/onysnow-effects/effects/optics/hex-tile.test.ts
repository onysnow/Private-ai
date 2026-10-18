import { describe, expect, it } from "vitest";
import { cellOffset, hexBlend, hexWeights } from "./hex-tile";
import { HEX_TILE_GLSL } from "./hex-tile.glsl";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";
import { SITE_ASSETS } from "@fx/lib/site-assets";

/**
 * The surface layers are hex-tiled so they neither repeat visibly nor show a
 * border. These check the two properties that make that true; the GLSL is
 * compared with this in real WebGL by e2e/optics.spec.ts.
 */

const at = (x: number, y: number) => hexBlend(hexWeights(x, y).w);

describe("hex-tiling", () => {
  it("always blends to exactly one sample's worth: no dimming or brightening at borders", () => {
    for (let i = 0; i < 2000; i++) {
      const x = Math.sin(i * 12.9898) * 7;
      const y = Math.cos(i * 78.233) * 7;
      const w = hexWeights(x, y).w;
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 9);
      const b = at(x, y);
      expect(b[0] + b[1] + b[2]).toBeCloseTo(1, 9);
      for (const v of b) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("has no hard edge: each cell's weight changes smoothly across the plane", () => {
    // Walk a line in tiny steps; the weight each CELL gets never jumps.
    const weightOf = (x: number, y: number, cell: string) => {
      const h = hexWeights(x, y);
      const b = hexBlend(h.w);
      const k = h.cells.findIndex(([cx, cy]) => `${cx},${cy}` === cell);
      return k < 0 ? 0 : (b[k] ?? 0);
    };
    let prev = hexWeights(0, 0.13);
    for (let i = 1; i < 4000; i++) {
      const x = i * 0.0007;
      const y = 0.13 + i * 0.0003;
      for (const [cx, cy] of prev.cells) {
        const key = `${cx},${cy}`;
        const before = weightOf((i - 1) * 0.0007, 0.13 + (i - 1) * 0.0003, key);
        const after = weightOf(x, y, key);
        expect(Math.abs(after - before)).toBeLessThan(0.05);
      }
      prev = hexWeights(x, y);
    }
  });

  it("gives neighbouring cells different patches of the photograph", () => {
    const seen = new Set<string>();
    for (let cx = -6; cx < 6; cx++) {
      for (let cy = -6; cy < 6; cy++) {
        const [ox, oy] = cellOffset(cx, cy);
        expect(ox).toBeGreaterThanOrEqual(0);
        expect(ox).toBeLessThan(1);
        expect(oy).toBeGreaterThanOrEqual(0);
        expect(oy).toBeLessThan(1);
        seen.add(`${ox.toFixed(3)},${oy.toFixed(3)}`);
      }
    }
    expect(seen.size).toBeGreaterThan(140);
  });
});

describe("the surface layers", () => {
  it("are two photographs, each swappable from the portal", () => {
    expect(SITE_ASSETS.glassSmudge.fallback).toBe("/glass-smudge.jpg");
    expect(SITE_ASSETS.glassScratch.fallback).toBe("/glass-scratch.jpg");
    expect(SITE_ASSETS.glassSmudge.key).toBe("glass_smudge_url");
    expect(SITE_ASSETS.glassScratch.key).toBe("glass_scratch_url");
  });

  it("are hex-tiled in the glass shader, not repeated on a grid", () => {
    expect(GLASS_LIGHT_FRAGMENT_SHADER.split(HEX_TILE_GLSL).length - 1).toBe(1);
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toContain("hexTile(uScratch,");
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toContain("hexTile(uSmudge,");
    expect(GLASS_LIGHT_FRAGMENT_SHADER).not.toContain("uSurface");
  });

  it("the chunk has no backtick to end its literal early", () => {
    expect(HEX_TILE_GLSL).not.toContain("`");
  });
});
