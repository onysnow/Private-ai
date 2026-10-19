import { describe, expect, it } from "vitest";
import { magnification, shadowOf } from "./shape-casters";

describe("a shadow's size and place (shadows.md 3.1)", () => {
  it("magnifies by H / (H - h): 1 on the photograph, 2 halfway to the lamp", () => {
    expect(magnification(0, 300)).toBe(1);
    expect(magnification(150, 300)).toBeCloseTo(2, 6);
  });

  it("throws the shadow away from the lamp, (C - L) h / (H - h) further (shadows.md 6 test 1)", () => {
    const [sx, sy] = shadowOf(400, 300, 100, 300, 300, 300);
    expect(sx - 400).toBeCloseTo(((400 - 300) * 100) / 200, 6);
    expect(sy).toBeCloseTo(300, 6);
  });
});
