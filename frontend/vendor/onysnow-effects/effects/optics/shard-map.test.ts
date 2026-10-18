import { describe, expect, it } from "vitest";
import {
  SHARD_MAP_GLSL,
  TILT_PER_STEP,
  decodeSlope,
  encodeSlope,
  reflectRay,
  shardNormal,
  slabShift,
} from "./shard-map";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";

const deg = Math.PI / 180;

describe("a broken pane's pieces, in the glass shader (item 10 step 3b)", () => {
  it("keeps a piece's slope to a byte step, over the tilts a break gives", () => {
    for (const t of [-0.4 * deg, -0.1 * deg, 0, 0.05 * deg, 0.4 * deg]) {
      const slope = Math.tan(t);
      expect(Math.abs(decodeSlope(encodeSlope(slope)) - slope)).toBeLessThanOrEqual(
        TILT_PER_STEP / 2,
      );
    }
    expect(encodeSlope(0)).toBe(128);
    // The widest tilt a break gives (0.4 degrees) is well inside the range.
    expect(Math.abs(encodeSlope(Math.tan(0.4 * deg)) - 128)).toBeLessThan(60);
  });

  it("turns the reflection by twice the piece's tilt", () => {
    const v: [number, number, number] = [0, 0, -1]; // straight in
    const flat = reflectRay(v, shardNormal(0, 0));
    expect(flat[0]).toBeCloseTo(0, 12);
    expect(flat[2]).toBeCloseTo(1, 12);
    const t = 0.4 * deg;
    const r = reflectRay(v, shardNormal(0, t));
    expect(Math.atan2(r[0], r[2])).toBeCloseTo(2 * t, 9);
    // At arm's length that is tens of pixels across the room's reflection.
    expect(Math.tan(2 * t) * 1536).toBeGreaterThan(15);
  });

  it("barely moves the view through: a tilted piece is still a parallel slab", () => {
    const shift = slabShift(18, 0.4 * deg, 1.52);
    expect(shift).toBeLessThan(0.1);
    // Small tilts: t theta (1 - 1/n).
    expect(shift).toBeCloseTo(18 * 0.4 * deg * (1 - 1 / 1.52), 3);
  });

  it("is read in the glass shader, and only the room's reflection turns with it", () => {
    const src = GLASS_LIGHT_FRAGMENT_SHADER;
    expect(src.split(SHARD_MAP_GLSL).length - 1).toBe(1);
    expect(src).toContain("roomDir = reflect(viewRay, pieceN);");
    expect(src).toContain("texture2D(uRoom, roomUvDir(roomDir), roomBias)");
    // Unbroken, the ray is the one it always was.
    expect(src).toContain("vec3 roomDir = vec3(fromCentre, uCameraDistance);");
  });

  it("has no backtick to end its literal early", () => {
    expect(SHARD_MAP_GLSL).not.toContain("`");
  });
});
