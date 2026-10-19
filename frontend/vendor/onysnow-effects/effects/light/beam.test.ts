import { describe, expect, it } from "vitest";
import { BEAM_HOT, BEAM_SPILL, BEAM_SPILL_SHARE, aimAt, beamFactor } from "./beam";
import { LIGHTS_GLSL } from "./light-uniforms";
import { pointLights, setTorch, torchLight } from "./lights";

/*
 * Item 25i: a flashlight is a beam -- a hotspot and a spill -- not a glow.
 */
const down = [0, 0, -1] as const;
/** The beam at `theta` off its axis, for a torch pointing straight down. */
const at = (theta: number) => beamFactor(down, Math.tan(theta) * 100, 0, -100);

describe("a flashlight's beam", () => {
  it("is brightest on its axis, and half as bright at the hotspot's edge", () => {
    expect(at(0)).toBeCloseTo(1 + BEAM_SPILL_SHARE, 6);
    expect(at(BEAM_HOT)).toBeCloseTo(0.5 + BEAM_SPILL_SHARE, 6);
  });

  it("has a dim spill out to the reflector's lip, and nothing past it", () => {
    const spill = at((BEAM_HOT + BEAM_SPILL) / 2 + 0.1);
    expect(spill).toBeGreaterThan(BEAM_SPILL_SHARE * 0.9);
    expect(spill).toBeLessThan(BEAM_SPILL_SHARE * 1.2);
    expect(at(BEAM_SPILL + 0.01)).toBeLessThan(1e-12);
    // Behind the torch, nothing at all.
    expect(beamFactor(down, 0, 0, 100)).toBeLessThan(1e-12);
  });

  it("falls off monotonically from the axis", () => {
    let last = Infinity;
    for (let th = 0; th < BEAM_SPILL + 0.1; th += 0.01) {
      const v = at(th);
      expect(v).toBeLessThanOrEqual(last + 1e-12);
      last = v;
    }
  });

  it("leaves a light with no aim shining all round", () => {
    expect(beamFactor(undefined, 30, -40, -100)).toBe(1);
    expect(beamFactor(null, 0, 0, 100)).toBe(1);
  });

  it("aims a planted torch at a point on the page", () => {
    const aim = aimAt(100, 100, 120, 400, 100);
    expect(Math.hypot(...aim)).toBeCloseTo(1, 12);
    // The point it aims at is dead on its axis.
    expect(beamFactor(aim, 300, 0, -120)).toBeCloseTo(1 + BEAM_SPILL_SHARE, 6);
    // Straight down when the pointer is on the torch.
    expect(aimAt(5, 5, 120, 5, 5)).toEqual([0, 0, -1]);
  });

  it("has a GLSL twin every light-drawing pass shares", () => {
    expect(LIGHTS_GLSL).toMatch(/uniform vec4\s+uLightAim\[MAX_LIGHTS\]/);
    expect(LIGHTS_GLSL).toMatch(/float beamFactor\(vec4 aim, vec3 d\)/);
    expect(LIGHTS_GLSL).toContain(BEAM_HOT.toFixed(6));
    expect(LIGHTS_GLSL).toContain(BEAM_SPILL.toFixed(6));
  });

  it("puts the torch in the light list only while it burns", () => {
    setTorch(10, 20, down, 0);
    expect(pointLights()).not.toContain(torchLight);
    setTorch(10, 20, down, 1);
    expect(pointLights()).toContain(torchLight);
    expect(torchLight.aim).toEqual(down);
    setTorch(-9999, -9999, down, 0);
  });
});
