import { describe, expect, it } from "vitest";
import { faceLean, faceNormal, faceRoom, KIND_LEAN } from "./crack-face";

const white = () => [1, 1, 1] as [number, number, number];
const eye = { x: 0, y: 0, z: 1600 };

describe("a crack's face (item 10 step 3)", () => {
  it("leans by kind: radial nearly square, the cone's walls well over", () => {
    expect(KIND_LEAN.radial).toBeLessThan(0.15);
    expect(KIND_LEAN.crush).toBeGreaterThan(Math.PI / 4);
    for (let s = 0; s < 400; s += 7) {
      expect(Math.abs(faceLean("radial", 3, s, 0))).toBeLessThan(0.25);
      expect(Math.abs(faceLean("crush", 3, s, 1))).toBeGreaterThan(0.6);
    }
  });

  it("a near-square face shows the room only by the back face's few per cent: clear, not white", () => {
    const n = faceNormal({ x: 1, y: 0 }, 0.05);
    const { mirror } = faceRoom({ x: 10, y: 0 }, n, eye, white);
    expect(mirror).toBeLessThan(0.1);
  });

  it("seen square on, no face is both past the critical angle and able to send you back out the front", () => {
    for (let lean = 0; lean < 1.55; lean += 0.01) {
      const { mirror } = faceRoom({ x: 1, y: 0 }, faceNormal({ x: 1, y: 0 }, lean), eye, white);
      expect(mirror).toBeLessThan(0.35);
    }
  });

  it("from any view, a face that mirrors totally cannot send your sight back out the front", () => {
    // Inside the glass your sight is within 41 deg of straight in; out again, within 41 deg of straight out:
    // a mirror turning it that far meets it at under 41 deg -- short of total reflection.
    for (const at of [0, 600, 2000, 6000])
      for (let lean = -1.55; lean < 1.55; lean += 0.01) {
        const { mirror } = faceRoom({ x: at, y: 0 }, faceNormal({ x: -1, y: 0 }, lean), eye, white);
        expect(mirror).toBeLessThan(0.35);
      }
  });

  it("shows the room in the direction the mirror sends you: a bright window one way, a dark wall the other", () => {
    const room = (d: { y: number }) =>
      (d.y < 0 ? [5, 5, 5] : [0.02, 0.02, 0.02]) as [number, number, number];
    const up = faceRoom({ x: 0, y: 0 }, faceNormal({ x: 0, y: -1 }, 1.25), eye, room);
    const down = faceRoom({ x: 0, y: 0 }, faceNormal({ x: 0, y: 1 }, 1.25), eye, room);
    expect(Math.abs(up.rgb[0] - down.rgb[0])).toBeGreaterThan(0.1);
  });
});
