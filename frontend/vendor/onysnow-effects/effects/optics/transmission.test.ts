import { describe, expect, it } from "vitest";
import {
  cosIncidence,
  frostSpread,
  irradianceFalloff,
  penumbraAcross,
  slantSpread,
  transmittance,
} from "./transmission";
import { TRANSMISSION_GLSL } from "./transmission.glsl";
import { REFLECTION_GLSL } from "./reflection.glsl";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";
import { tuning } from "@fx/lib/tuning";

/**
 * The light and shadow the glass throws grade with where the lamp is: bright
 * and sharp beneath it, fainter and softer the further off to the side it
 * is, and the bevel's band thrown further and wider. None of it is a setting.
 * The GLSL twins are checked in real WebGL by e2e/optics.spec.ts.
 */

const H = 300; // lamp above the photograph
const G = 70; // glass above the photograph
const S = 46; // lamp radius

describe("brightness falls off with the lamp's angle and distance", () => {
  it("is cos^3: full beneath the lamp, an eighth at 60 degrees", () => {
    expect(irradianceFalloff(0, H)).toBe(1);
    expect(irradianceFalloff(H * Math.sqrt(3), H)).toBeCloseTo(0.125, 10);
  });

  it("is a smooth gradient, never a step", () => {
    let prev = 1;
    for (let r = 10; r <= 1200; r += 10) {
      const v = irradianceFalloff(r, H);
      expect(v).toBeLessThan(prev);
      expect(prev - v).toBeLessThan(0.05);
      prev = v;
    }
  });

  it("less gets through the glass at a slant", () => {
    expect(transmittance(1, 1.518)).toBeCloseTo((1 - 0.0424) ** 2, 3);
    expect(transmittance(cosIncidence(600, H), 1.518)).toBeLessThan(transmittance(1, 1.518));
  });
});

describe("edges soften the further the lamp is off to the side", () => {
  it("beneath the lamp the penumbra is size * gap / (height - gap)", () => {
    expect(penumbraAcross(S, G, H, 1, 1)).toBeCloseTo((S * G) / (H - G), 10);
  });

  it("an edge facing the lamp blurs by 1 / cos(theta); one running toward it does not", () => {
    const c = cosIncidence(400, H);
    const base = penumbraAcross(S, G, H, 1, 1);
    expect(penumbraAcross(S, G, H, c, 1)).toBeCloseTo(base / c, 10);
    expect(penumbraAcross(S, G, H, c, 0)).toBeCloseTo(base, 10);
  });

  it("frost scatter grows with the slant path, and is nothing on clear glass", () => {
    expect(frostSpread(0.6, 1.518, G, 0.5)).toBeCloseTo(frostSpread(0.6, 1.518, G, 1) * 4, 10);
    expect(frostSpread(0, 1.518, G, 1)).toBeLessThan(1);
  });

  it("the band is thrown further and wider at a slant, capped where it is too thin to see", () => {
    expect(slantSpread(1)).toBe(1);
    expect(slantSpread(0.5)).toBe(4);
    expect(slantSpread(0.01)).toBe(6);
  });
});

describe("the floor light uses the causes, not settings", () => {
  it("the Light reach setting is gone", () => {
    expect(tuning["floorReach"]).toBeUndefined();
  });

  it("the shader includes the transmission chunk after the reflection one", () => {
    const src = FLOOR_FRAGMENT_SHADER;
    expect(src.split(TRANSMISSION_GLSL).length - 1).toBe(1);
    expect(src.indexOf(REFLECTION_GLSL)).toBeGreaterThan(-1);
    expect(src.indexOf(REFLECTION_GLSL)).toBeLessThan(src.indexOf(TRANSMISSION_GLSL));
  });

  it("works the softness and brightness out per point", () => {
    const src = FLOOR_FRAGMENT_SHADER;
    expect(src).not.toMatch(/\buReach\b|\buPenumbra\b/);
    expect(src).not.toMatch(/exp\(-dist2/);
    expect(src).toContain("irradianceFalloff(rLamp, height)");
    expect(src).toContain("penumbraAcross(radius, gap, height, cosT, cosPhi)");
    expect(src).toContain("frostSpread(frost, ior, gap, cosT)");
    // Each pane's own: step 7 reads the gap, index and frost per pane.
    expect(src).toMatch(/uniform float uGap\[/);
    expect(src).toMatch(/float gap = uGap\[i\]/);
  });
});
