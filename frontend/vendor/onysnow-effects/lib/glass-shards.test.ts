import { describe, expect, it } from "vitest";
import { GLASS_SHARDS, outlineFromAlpha, shardsFor } from "./glass-shards";

/*
 * Ony's photographed pieces: a break uses many of them, all different
 * ("use as many different glass references as you can"), and a knocked-out
 * piece is the outline of one.
 */
describe("the photographed pieces of glass", () => {
  it("are all 55 of Ony's set", () => {
    expect(GLASS_SHARDS).toHaveLength(55);
    expect(new Set(GLASS_SHARDS).size).toBe(55);
  });

  it("a break wears different ones, and different breaks start on different ones", () => {
    const one = shardsFor(3, 12);
    expect(new Set(one).size).toBe(12);
    expect(shardsFor(4, 12)[0]).not.toBe(one[0]);
    // Walked far enough, every photograph is used.
    expect(new Set(shardsFor(1, 55)).size).toBe(55);
  });

  it("takes a cut-out piece's outline from its transparency, faint clear glass and all", () => {
    // A 40 x 20 piece: opaque rim, nearly transparent body, on empty ground.
    const w = 60;
    const h = 40;
    const alpha = new Float32Array(w * h);
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 50; x++) {
        const rim = x === 10 || x === 49 || y === 10 || y === 29;
        alpha[y * w + x] = rim ? 0.9 : 0.08;
      }
    }
    const out = outlineFromAlpha(alpha, w, h);
    const xs = out.map((p) => p.x);
    const ys = out.map((p) => p.y);
    // Normalised: the longer side is 1, centred on the piece.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.5, 5);
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 5);
  });
});
