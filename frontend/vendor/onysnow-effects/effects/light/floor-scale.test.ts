import { describe, expect, it } from "vitest";
import { floorScale } from "./floor-scale";

describe("the lamp's brightness at the photographs (inverse square)", () => {
  it("is unchanged at the defaults", () => {
    expect(floorScale(8, 300)).toBeCloseTo(1, 10);
  });
  it("falls to a quarter at twice the height", () => {
    expect(floorScale(8, 600)).toBeCloseTo(0.25, 10);
  });
  it("doubles with twice the power", () => {
    expect(floorScale(16, 300)).toBeCloseTo(2, 10);
  });
  it("is capped when the lamp comes right down", () => {
    expect(floorScale(8, 10)).toBe(8);
  });
});
