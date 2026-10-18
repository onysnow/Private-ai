import { describe, expect, it } from "vitest";
import { MOVEMENT_WINDS } from "./shutter-charge";

describe("what winds the shutter", () => {
  it("is press-and-hold only for now: moving the pointer does not charge the flash", () => {
    expect(MOVEMENT_WINDS).toBe(false);
  });
});
