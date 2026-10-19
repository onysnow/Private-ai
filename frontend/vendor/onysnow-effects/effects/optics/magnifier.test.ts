import { describe, expect, it } from "vitest";
import {
  FOCAL_RADII,
  MAGNIFICATION,
  MAP_SCALE,
  holdHeight,
  lensPatch,
  magnifierMap,
  seenRadius,
} from "./magnifier";

describe("the magnifying glass", () => {
  it("enlarges the middle by its magnification", () => {
    const r = 0.01;
    expect(r / seenRadius(r)).toBeCloseTo(MAGNIFICATION, 2);
  });

  it("swims outward toward the rim (an uncorrected lens), never past it", () => {
    // Local enlargement falls toward the rim: the seen point runs faster.
    const slope = (r: number) => (seenRadius(r + 1e-3) - seenRadius(r)) / 1e-3;
    expect(slope(0.9)).toBeGreaterThan(slope(0.1));
    // Everything seen is under the lens: a backdrop-filter sees nothing else.
    for (let r = 0; r <= 1; r += 0.05) expect(seenRadius(r)).toBeLessThanOrEqual(r + 1e-9);
  });

  it("encodes every offset within the map's 8 bits, and none outside the lens", () => {
    const n = 64;
    const map = magnifierMap(n);
    let extreme = 0;
    for (let i = 0; i < map.length; i += 4) {
      extreme = Math.max(extreme, Math.abs(map[i]! - 128), Math.abs(map[i + 1]! - 128));
    }
    expect(extreme).toBeLessThan(127);
    expect(extreme).toBeGreaterThan(60);
    // A corner texel is outside the circle: no offset.
    expect(map[0]).toBe(128);
    expect(map[1]).toBe(128);
    expect(MAP_SCALE).toBeGreaterThan(0);
  });
});

describe("the lens in someone else's light (25e)", () => {
  it("is held where it enlarges by its magnification: M = f / (f - d)", () => {
    const f = FOCAL_RADII * 96;
    const d = holdHeight(96);
    expect(f / (f - d)).toBeCloseTo(MAGNIFICATION, 10);
  });

  it("with no power, the patch is just the rim's shadow, no brighter", () => {
    const p = lensPatch(Infinity, 150, 1400);
    expect(p.spread).toBeCloseTo(p.shadow, 10);
    expect(p.gain).toBeCloseTo(1, 10);
  });

  it("gathers a distant light into a smaller, brighter patch, conserving it", () => {
    const f = 288;
    const d = 157;
    const p = lensPatch(f, d, 1e9);
    // A far source focuses at f: the beam is D (1 - d/f) across at the page.
    expect(p.spread).toBeCloseTo(1 - d / f, 6);
    // The light through the lens is all there: patch area x gain = shadow area.
    expect(p.spread ** 2 * p.gain).toBeCloseTo(p.shadow ** 2, 6);
    expect(p.gain).toBeGreaterThan(3);
  });

  it("at the focus the patch is a point (held at f below a far light)", () => {
    expect(lensPatch(288, 288, 1e12).spread).toBeLessThan(0.03);
  });
});
