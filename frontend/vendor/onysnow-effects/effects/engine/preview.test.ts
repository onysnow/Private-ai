import { afterEach, describe, expect, it } from "vitest";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";
import { previewing, resetPreviews } from "./preview";

afterEach(() => resetPreviews());

describe("changes not yet approved are off unless asked for", () => {
  it("is off by default", () => {
    resetPreviews([]);
    expect(previewing("marks")).toBe(false);
  });

  it("turns on only what is named", () => {
    resetPreviews(["marks"]);
    expect(previewing("marks")).toBe(true);
  });

  it("the glass and the floor read the marks through one function", () => {
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toContain(
      "marksCover(surf, uGrimeFloor, uMarksProportional)",
    );
    expect(FLOOR_FRAGMENT_SHADER).toContain("marksCover(marks, uGrimeFloor, uMarksProportional)");
  });

  it("every shadow shape on the glass is the one model's", () => {
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toMatch(/float cover = shadowRect\(local,/);
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toMatch(/return shadowRect\(local, uAboveRect/);
    expect(FLOOR_FRAGMENT_SHADER).toContain("return penumbraOf(");
  });
});
