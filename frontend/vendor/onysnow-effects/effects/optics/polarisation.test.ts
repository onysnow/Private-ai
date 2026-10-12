import { describe, expect, it } from "vitest";
import {
  brewsterAngle,
  fresnelExact,
  fresnelP,
  fresnelS,
  fresnelSchlick,
  polarisedReflectance,
  reflectanceNormal,
} from "./reflection";
import { REFLECTION_GLSL } from "./reflection.glsl";

/*
 * Light engine step H: the Fresnel equations exactly, s and p apart, and a
 * camera's polarising filter working with them.
 */
const N = 1.518;
const cosOf = (deg: number) => Math.cos((deg * Math.PI) / 180);

describe("the Fresnel equations, per polarisation", () => {
  it("agree with each other and with the normal-incidence value straight on", () => {
    expect(fresnelS(1, N)).toBeCloseTo(reflectanceNormal(N), 12);
    expect(fresnelP(1, N)).toBeCloseTo(reflectanceNormal(N), 12);
    expect(reflectanceNormal(N)).toBeCloseTo(0.0423, 4);
  });

  it("send no p light back at Brewster's angle, 56.6 degrees for float glass", () => {
    const b = brewsterAngle(N);
    expect((b * 180) / Math.PI).toBeCloseTo(56.62, 1);
    expect(fresnelP(Math.cos(b), N)).toBeLessThan(1e-12);
    expect(fresnelS(Math.cos(b), N)).toBeGreaterThan(0.14);
  });

  it("reflect everything at grazing, and s always at least as much as p", () => {
    expect(fresnelExact(0, N)).toBeCloseTo(1, 12);
    for (let deg = 0; deg < 90; deg += 5) {
      expect(fresnelS(cosOf(deg), N)).toBeGreaterThanOrEqual(fresnelP(cosOf(deg), N) - 1e-15);
    }
  });

  it("reflect totally inside the glass past the critical angle, 41.2 degrees", () => {
    const inside = 1 / N;
    expect(fresnelExact(cosOf(42), inside)).toBe(1);
    expect(fresnelExact(cosOf(40), inside)).toBeLessThan(1);
  });

  it("differ from Schlick's curve by little, which is why it served until now", () => {
    let worst = 0;
    for (let deg = 0; deg <= 89; deg += 1) {
      worst = Math.max(
        worst,
        Math.abs(fresnelExact(cosOf(deg), N) - fresnelSchlick(cosOf(deg), N)),
      );
    }
    expect(worst).toBeLessThan(0.05);
  });
});

describe("a polarising filter on the camera", () => {
  it("changes nothing when there is no filter, and passes unpolarised light whole", () => {
    for (const deg of [0, 20, 56]) {
      expect(polarisedReflectance(cosOf(deg), N, 1.1, 0)).toBeCloseTo(
        fresnelExact(cosOf(deg), N),
        12,
      );
    }
    // Straight on, s and p are the same: nothing to cut, whatever the turn.
    expect(polarisedReflectance(1, N, 0.3, 1)).toBeCloseTo(reflectanceNormal(N), 12);
  });

  it("keeps the s reflection with its axis along s, and cuts to p a quarter turn round", () => {
    const c = cosOf(35);
    expect(polarisedReflectance(c, N, 0, 1)).toBeCloseTo(fresnelS(c, N), 12);
    expect(polarisedReflectance(c, N, Math.PI / 2, 1)).toBeCloseTo(fresnelP(c, N), 12);
    // At Brewster's angle, crossed, the reflection is gone.
    expect(polarisedReflectance(Math.cos(brewsterAngle(N)), N, Math.PI / 2, 1)).toBeLessThan(1e-12);
  });

  it("has GLSL twins", () => {
    for (const fn of ["fresnelS", "fresnelP", "polarisedReflectance"]) {
      expect(REFLECTION_GLSL).toMatch(new RegExp(`float ${fn}\\(`));
    }
  });
});
