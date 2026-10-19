import { describe, expect, it } from "vitest";
import { edgeAt, sideTrace } from "./crack-side";
import { faceNormal } from "./crack-face";
import { sideWidth } from "./edge-side";

const T = 18;
const eye = { x: 500, y: 300, z: 1600 };

describe("a crack down the side face (item 10 step 4)", () => {
  it("finds the edge a crack ends on", () => {
    expect(edgeAt({ x: 0.4, y: 50 }, 400, 200)).toBe("left");
    expect(edgeAt({ x: 399.5, y: 50 }, 400, 200)).toBe("right");
    expect(edgeAt({ x: 50, y: 0 }, 400, 200)).toBe("top");
    expect(edgeAt({ x: 50, y: 200 }, 400, 200)).toBe("bottom");
    expect(edgeAt({ x: 50, y: 50 }, 400, 200)).toBeNull();
  });

  it("a square crack crosses the side straight from front to back, as wide as the side shows", () => {
    // Running left into the left edge: across it is up and down.
    const tr = sideTrace({ x: 0, y: 300 }, "left", faceNormal({ x: 0, y: 1 }, 0), T, eye)!;
    expect(tr).not.toBeNull();
    expect(tr.shift).toBeCloseTo(0, 9);
    expect(tr.back.x - tr.front.x).toBeCloseTo(sideWidth(500, T, false, eye.z), 6);
    expect(tr.back.y).toBeCloseTo(300, 6);
  });

  it("a leaning crack slants along the edge by the thickness times the tangent of its lean", () => {
    for (const lean of [0.1, 0.5, 1.0]) {
      const tr = sideTrace({ x: 0, y: 300 }, "left", faceNormal({ x: 0, y: 1 }, lean), T, eye)!;
      expect(tr.shift).toBeCloseTo(T * Math.tan(lean), 6);
    }
  });

  it("shows only on the edge's own side of the eye", () => {
    const face = faceNormal({ x: 0, y: 1 }, 0.3);
    expect(sideTrace({ x: 0, y: 300 }, "left", face, T, { ...eye, x: -20 })).toBeNull();
    expect(sideTrace({ x: 900, y: 300 }, "right", face, T, eye)).not.toBeNull();
    expect(sideTrace({ x: 400, y: 0 }, "top", faceNormal({ x: 1, y: 0 }, 0.3), T, eye)).not.toBeNull();
    expect(sideTrace({ x: 400, y: 0 }, "top", faceNormal({ x: 1, y: 0 }, 0.3), T, { ...eye, y: -5 })).toBeNull();
  });

  it("a face running along the side never makes a line a mile long", () => {
    // Across the crack is the edge's own outward direction: the face is nearly the side itself.
    const tr = sideTrace({ x: 0, y: 300 }, "left", faceNormal({ x: -0.999, y: 0.045 }, 0.4), T, eye);
    if (tr) expect(tr.shift).toBeLessThanOrEqual(3 * T + 1e-9);
  });
});
