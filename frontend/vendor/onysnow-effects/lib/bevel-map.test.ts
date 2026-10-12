import { describe, expect, it } from "vitest";
import {
  bevelField,
  interiorIsNeutral,
  refractionOffset,
  roundedRectSDF,
  surfaceHeight,
} from "./bevel-map";

describe("roundedRectSDF", () => {
  it("is zero on the edge, negative inside, positive outside", () => {
    expect(roundedRectSDF(0, 0, 50, 50, 0)).toBeCloseTo(-50, 5);
    expect(roundedRectSDF(50, 0, 50, 50, 0)).toBeCloseTo(0, 5);
    expect(roundedRectSDF(60, 0, 50, 50, 0)).toBeCloseTo(10, 5);
  });

  it("rounds the corner by the radius", () => {
    // The corner of a square is sqrt(2)*50 from centre; with a radius the
    // surface is pulled in, so the same point is further outside.
    const square = roundedRectSDF(50, 50, 50, 50, 0);
    const rounded = roundedRectSDF(50, 50, 50, 50, 12);
    expect(rounded).toBeGreaterThan(square);
  });
});

describe("surfaceHeight", () => {
  it("is a circular arc across the bevel", () => {
    expect(surfaceHeight(0)).toBe(0);
    expect(surfaceHeight(1)).toBe(1);
    // Halfway across, a circle stands at sqrt(3)/2 where a ramp would be at a
    // half. That difference IS the bend.
    expect(surfaceHeight(0.5)).toBeCloseTo(Math.sqrt(3) / 2, 5);
  });

  it("rises faster than linearly at the rim", () => {
    const atRim = surfaceHeight(0.05) - surfaceHeight(0);
    const atInnerEdge = surfaceHeight(1) - surfaceHeight(0.95);
    expect(atRim).toBeGreaterThan(atInnerEdge * 3);
  });

  it("offers the flatter squircle as an alternative", () => {
    expect(surfaceHeight(0.5, "squircle")).toBeGreaterThan(surfaceHeight(0.5, "circle"));
  });
});

describe("refractionOffset", () => {
  const at = (x: number) => refractionOffset(x, 26, 18, 1.5);

  it("is zero where the glass is flat", () => {
    // At the inner end of the bevel the surface is parallel to the face, so
    // the ray passes straight through and nothing moves.
    expect(Math.abs(at(1))).toBeLessThan(0.5);
  });

  it("grows toward the rim, where the surface is steepest", () => {
    expect(Math.abs(at(0.1))).toBeGreaterThan(Math.abs(at(0.5)));
    expect(Math.abs(at(0.5))).toBeGreaterThan(Math.abs(at(0.9)));
  });

  it("bends further through thicker glass and through a denser medium", () => {
    expect(Math.abs(refractionOffset(0.3, 26, 40, 1.5))).toBeGreaterThan(
      Math.abs(refractionOffset(0.3, 26, 4, 1.5)),
    );
    expect(Math.abs(refractionOffset(0.3, 26, 18, 1.9))).toBeGreaterThan(
      Math.abs(refractionOffset(0.3, 26, 18, 1.5)),
    );
  });

  it("does not bend at all when there is nothing to refract into", () => {
    // An index of 1 is air: no interface, no deflection.
    expect(Math.abs(refractionOffset(0.3, 26, 18, 1))).toBeLessThan(1e-6);
  });
});

describe("bevelField", () => {
  const GLASS = { bezelWidth: 14, thickness: 10, ior: 1.5 } as const;
  const field = bevelField(120, 80, 6, GLASS);

  it("leaves the body of the pane exactly neutral", () => {
    // 128 means "do not move this pixel". Any drift here shifts the whole
    // backdrop behind the glass, which is what smeared the photographs before.
    expect(interiorIsNeutral(field, GLASS.bezelWidth)).toBe(true);
  });

  it("displaces at the rim and not in the middle", () => {
    const at = (x: number, y: number) => {
      const o = (y * field.width + x) * 4;
      return [field.data[o]!, field.data[o + 1]!];
    };
    const [topR, topG] = at(60, 1) as [number, number];
    const [, bottomG] = at(60, 78) as [number, number];
    const [leftR] = at(1, 40) as [number, number];

    expect(Math.abs(topG - 128)).toBeGreaterThan(8);
    expect(Math.abs(bottomG - 128)).toBeGreaterThan(8);
    // The old map was green only, so a vertical arris did not bend at all.
    expect(Math.abs(leftR - 128)).toBeGreaterThan(8);
    // A horizontal edge has no sideways component of its own.
    expect(topR).toBe(128);
  });

  it("samples inward at every edge, which is what compresses the bevel", () => {
    /*
     * The gradient of the height field points uphill, which is toward the
     * middle of the pane -- so the displacement at the rim samples the
     * backdrop from further inside. That is the right direction: a bevel
     * gathers a wide inner region into a narrow band, which is why the strip
     * along the edge of real glass looks squeezed rather than magnified.
     *
     * `feDisplacementMap` moves a pixel by (channel - 128), so "samples from
     * below" is green above 128.
     */
    const g = (x: number, y: number) => field.data[(y * field.width + x) * 4 + 1]!;
    expect(g(60, 1)).toBeGreaterThan(128); // top edge samples downward
    expect(g(60, 78)).toBeLessThan(128); // bottom edge samples upward

    const r = (x: number, y: number) => field.data[(y * field.width + x) * 4]!;
    expect(r(1, 40)).toBeGreaterThan(128); // left edge samples rightward
    expect(r(118, 40)).toBeLessThan(128); // right edge samples leftward
  });

  it("stays within the encodable range at any geometry", () => {
    for (const [w, h, rad, bezel] of [
      [64, 64, 0, 10],
      [400, 60, 4, 30],
      [40, 400, 20, 18],
      [30, 30, 15, 15],
    ] as const) {
      const f = bevelField(w, h, rad, { bezelWidth: bezel, thickness: 12, ior: 1.5 });
      for (let i = 0; i < f.data.length; i += 4) {
        expect(f.data[i]).toBeGreaterThanOrEqual(1);
        expect(f.data[i]).toBeLessThanOrEqual(255);
      }
    }
  });

  it("does not blow up when the bevel is deeper than the pane", () => {
    const huge = { bezelWidth: 200, thickness: 80, ior: 1.5 };
    expect(() => bevelField(20, 20, 4, huge)).not.toThrow();
    expect(interiorIsNeutral(bevelField(20, 20, 4, huge), 200)).toBe(true);
  });
});
