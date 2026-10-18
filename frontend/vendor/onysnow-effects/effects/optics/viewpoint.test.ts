import { describe, expect, it } from "vitest";
import { behindGlassShift, eyeOffset, oversizeFor, scrollSlide } from "./viewpoint";
import { tuning } from "@fx/lib/tuning";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";

/**
 * The viewer's eye follows the pointer, and what is behind the glass slides
 * under it by the parallax of the gap -- so you see the edge bend it.
 */
describe("the eye", () => {
  it("sits in the middle when follow is 0 or the pointer is off the page", () => {
    expect(eyeOffset(100, 100, 1280, 800, 0)).toEqual({ x: 0, y: 0 });
    expect(eyeOffset(-9999, -9999, 1280, 800, 1)).toEqual({ x: 0, y: 0 });
  });

  it("follows the pointer by the follow fraction", () => {
    expect(eyeOffset(1280, 800, 1280, 800, 0.5)).toEqual({ x: 320, y: 200 });
  });
});

describe("what is behind the glass", () => {
  it("moves toward the eye's side by gap / (distance + gap) -- similar triangles", () => {
    const s = behindGlassShift({ x: 300, y: -100 }, 70, 1536);
    expect(s.x).toBeCloseTo((300 * 70) / 1606, 10);
    expect(s.y).toBeCloseTo((-100 * 70) / 1606, 10);
  });

  it("does not move at all with no gap: something on the glass stays put", () => {
    expect(behindGlassShift({ x: 300, y: 300 }, 0, 1536)).toEqual({ x: 0, y: 0 });
  });

  it("is oversized by exactly enough that the slide never shows an edge", () => {
    for (const [follow, gap] of [
      [0.6, 70],
      [1, 240],
      [0, 70],
    ] as const) {
      const scale = oversizeFor(1280, 800, follow, gap, 1536);
      const worst = behindGlassShift(eyeOffset(1280, 800, 1280, 800, follow), gap, 1536);
      expect((1280 * (scale - 1)) / 2).toBeGreaterThanOrEqual(Math.abs(worst.x));
      expect((800 * (scale - 1)) / 2).toBeGreaterThanOrEqual(Math.abs(worst.y));
    }
  });

  it("is one cursor-behaviour setting, not a parallax amount", () => {
    expect(tuning["viewFollow"]?.group).toBe("Camera");
  });

  it("the light on the photographs and the room in the glass both follow it", () => {
    // The point of the photograph seen here is back along the view shift, and it is lit there.
    expect(FLOOR_FRAGMENT_SHADER).toContain("vec2 at = look - uViewShift;");
    expect(FLOOR_FRAGMENT_SHADER).toContain("floorAt(at, lit,");
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toMatch(
      /fromCentre = frag - 0\.5 \* uViewport \/ uScale - uEye/,
    );
  });
});

describe("the photograph lagging the glass as the page scrolls (item 33)", () => {
  it("lags by gap / (distance + gap) of the scroll", () => {
    expect(scrollSlide(100, 70, 1600)).toBeCloseTo((100 * 70) / 1670, 12);
  });

  it("lags more the further the glass stands off it, and not at all on it", () => {
    expect(scrollSlide(100, 140, 1600)).toBeGreaterThan(scrollSlide(100, 70, 1600));
    expect(scrollSlide(100, 0, 1600)).toBe(0);
  });

  it("lags less the further away the eye is", () => {
    expect(scrollSlide(100, 70, 3200)).toBeLessThan(scrollSlide(100, 70, 1600));
  });
});
