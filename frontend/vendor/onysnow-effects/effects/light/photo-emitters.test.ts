import { describe, expect, it } from "vitest";
import { EMITTER_KNEE, coverPoint, findHighlights } from "./photo-emitters";

/*
 * Item 31: the photographs' bright spots are lights under the glass.
 */
function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  return d;
}

describe("a photograph's lights", () => {
  it("finds a bright spot where it is, in its colour", () => {
    // A dark street with a red neon blob at (70, 20).
    const d = image(100, 60, (x, y) =>
      Math.hypot(x - 70, y - 20) < 4 ? [255, 60, 40] : [20, 22, 30],
    );
    const [spot] = findHighlights(d, 100, 60);
    expect(spot).toBeDefined();
    expect(spot!.u).toBeCloseTo(0.705, 1);
    expect(spot!.v).toBeCloseTo(20.5 / 60, 1);
    expect(spot!.colour[0]).toBe(1);
    expect(spot!.colour[1]).toBeLessThan(0.2);
  });

  it("finds none in a photograph with nothing past the knee", () => {
    const grey = Math.round(EMITTER_KNEE * 255) - 10;
    expect(
      findHighlights(
        image(64, 64, () => [grey, grey, grey]),
        64,
        64,
      ),
    ).toEqual([]);
  });

  it("ranks a big bright spot over a small one, and keeps them apart", () => {
    const d = image(200, 100, (x, y) =>
      Math.hypot(x - 40, y - 50) < 9
        ? [250, 250, 250]
        : Math.hypot(x - 150, y - 50) < 2
          ? [250, 250, 250]
          : [10, 10, 10],
    );
    const spots = findHighlights(d, 200, 100);
    expect(spots).toHaveLength(2);
    expect(spots[0]!.u).toBeLessThan(0.3);
    expect(spots[0]!.strength).toBeGreaterThan(spots[1]!.strength);
    expect(spots[0]!.radius).toBeGreaterThan(spots[1]!.radius);
  });

  it("counts a spot once, however many of its pixels are bright", () => {
    const d = image(80, 80, (x, y) =>
      Math.abs(x - 40) < 12 && Math.abs(y - 40) < 2 ? [240, 250, 255] : [0, 0, 0],
    );
    expect(findHighlights(d, 80, 80)).toHaveLength(1);
  });
});

describe("where a point of a photograph lands on the screen", () => {
  it("is the inverse of the glass shader's cover mapping", () => {
    const box = { x: 10, y: 20, w: 400, h: 200 };
    // A 3:2 photograph covering a 2:1 box: cropped top and bottom about its focus.
    const mid = coverPoint(0.5, 0.5, box, 1.5, { x: 0.5, y: 0.5 });
    expect(mid.x).toBeCloseTo(210, 9);
    expect(mid.y).toBeCloseTo(120, 9);
    const top = coverPoint(0.5, 0, box, 1.5, { x: 0.5, y: 0.5 });
    expect(top.y).toBeLessThan(box.y); // cropped off the top
    const left = coverPoint(0, 0.5, box, 1.5, { x: 0.5, y: 0.5 });
    expect(left.x).toBeCloseTo(box.x, 9); // full width shows
  });
});
