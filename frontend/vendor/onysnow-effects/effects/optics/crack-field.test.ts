import { describe, expect, it } from "vitest";
import {
  bakeField,
  bakeTable,
  NO_SEGMENT,
  REACH,
  SEG_TEXELS,
  segmentsOf,
  TABLE_WIDTH,
  type Segment,
} from "./crack-field";
import { fracture } from "./fracture";

const read16 = (d: Uint8Array, at: number) => (d[at]! << 8) | d[at + 1]!;

describe("the crack field (broken glass B2)", () => {
  const segs: Segment[] = [
    {
      x0: 10,
      y0: 10,
      x1: 90,
      y1: 10,
      lean: 0.1,
      rough: 0.2,
      kind: "radial",
      arrival: 120,
      face: "both",
    },
    {
      x0: 50,
      y0: 10,
      x1: 50,
      y1: 60,
      lean: -0.3,
      rough: 1,
      kind: "ring",
      arrival: 400,
      face: "back",
    },
  ];

  it("packs each segment's ends, lean, roughness, kind and arrival to be read back", () => {
    const { data, rows } = bakeTable(segs);
    expect(rows).toBe(1);
    expect(data.length).toBe(TABLE_WIDTH * 4);
    const t = SEG_TEXELS * 4; // the second segment
    expect(read16(data, t) / 16).toBe(50);
    expect(read16(data, t + 6) / 16).toBe(60);
    expect((read16(data, t + 8) - 32768) / 8192).toBeCloseTo(-0.3, 3);
    expect(data[t + 10]).toBe(255);
    expect(data[t + 14]).toBe(2); // on the back face only
    expect(data[t + 11]).toBe(2);
    expect(read16(data, t + 12)).toBe(400);
  });

  it("names the nearest and second-nearest segment at each pixel, none beyond REACH", () => {
    const f = bakeField(segs, 100, 100, 1);
    const at = (x: number, y: number) => (y * f.width + x) * 4;
    // On the first segment, far from the second.
    expect(read16(f.data, at(20, 12))).toBe(0);
    expect(read16(f.data, at(20, 12) + 2)).toBe(NO_SEGMENT);
    // Near both: the vertical one closer.
    expect(read16(f.data, at(48, 40))).toBe(1);
    expect(read16(f.data, at(48, 40) + 2)).toBe(NO_SEGMENT);
    expect(read16(f.data, at(52, 14))).toBe(1);
    expect(read16(f.data, at(52, 14) + 2)).toBe(0);
    // Beyond reach of both.
    expect(read16(f.data, at(90, 90))).toBe(NO_SEGMENT);
    expect(REACH).toBeGreaterThan(20);
  });

  it("scales with the device pixel ratio", () => {
    const f = bakeField(segs, 100, 100, 2);
    expect(f.width).toBe(200);
    expect(read16(f.data, (24 * 200 + 40) * 4)).toBe(0);
  });

  it("turns a generated break into segments with leans and roughness near the strike", () => {
    const fr = fracture({
      w: 400,
      h: 300,
      at: { x: 200, y: 150 },
      energy: 0.6,
      kind: "annealed",
      seed: 3,
    });
    const s = segmentsOf(fr, 60);
    expect(s.length).toBeGreaterThan(20);
    expect(s.every((q) => Math.abs(q.lean) < 1.6)).toBe(true);
    const near = s.filter((q) => Math.hypot((q.x0 + q.x1) / 2 - 200, (q.y0 + q.y1) / 2 - 150) < 20);
    const far = s.filter((q) => Math.hypot((q.x0 + q.x1) / 2 - 200, (q.y0 + q.y1) / 2 - 150) > 150);
    if (near.length && far.length) {
      expect(Math.max(...near.map((q) => q.rough))).toBeGreaterThan(
        Math.max(...far.map((q) => q.rough)),
      );
    }
  });
});
