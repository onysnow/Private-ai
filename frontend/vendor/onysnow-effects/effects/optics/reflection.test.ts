import { describe, expect, it } from "vitest";
import {
  fresnelSchlick,
  frostRoughness,
  ggx,
  lampReflection,
  LAMP_POWER_PER_GAIN,
  LAMP_REFLECTION_ENABLED,
  reflectanceNormal,
} from "./reflection";
import { REFLECTION_GLSL } from "./reflection.glsl";
import { FLOAT_GLASS } from "@fx/effects/materials/presets";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";
import { tuning } from "@fx/lib/tuning";

/**
 * The lamp's reflection on the face is worked out from the material, never
 * set. It used to be two settings that sat at zero, so the pane reflected
 * nothing at all. The GLSL is checked against these in real WebGL by
 * e2e/optics.spec.ts.
 */

const peak = (frost: number) => lampReflection(0, 0, 230, 756_000, FLOAT_GLASS.ior, frost);

describe("reflectance comes from the material", () => {
  it("float glass reflects 4.2% straight on", () => {
    expect(reflectanceNormal(FLOAT_GLASS.ior)).toBeCloseTo(0.042, 3);
  });

  it("rises to total reflection at grazing", () => {
    expect(fresnelSchlick(1, 1.518)).toBeCloseTo(reflectanceNormal(1.518), 12);
    expect(fresnelSchlick(0, 1.518)).toBe(1);
  });

  it("water reflects less than glass, as its lower index says", () => {
    expect(reflectanceNormal(1.333)).toBeLessThan(reflectanceNormal(1.518));
  });
});

describe("frost spreads the reflection, it does not remove it", () => {
  it("is never zero on frosted glass", () => {
    expect(peak(0.6)).toBeGreaterThan(0.05);
  });

  it("clear glass gives a smaller, brighter image of the lamp", () => {
    expect(peak(0)).toBeGreaterThan(peak(0.6) * 10);
    // ...and it is small: 80px away, the clear image has all but gone while
    // the frosted sheen still has over half its peak.
    expect(lampReflection(80, 0, 230, 756_000, 1.518, 0) / peak(0)).toBeLessThan(0.01);
    expect(lampReflection(80, 0, 230, 756_000, 1.518, 0.6) / peak(0.6)).toBeGreaterThan(0.5);
  });

  it("the GGX lobe integrates to one, so spreading keeps the light", () => {
    // Integral of D(h) * cos(theta_h) over the hemisphere is 1 for any alpha.
    for (const alpha of [frostRoughness(0.2), frostRoughness(0.6), frostRoughness(1)]) {
      let sum = 0;
      const steps = 20_000;
      for (let i = 0; i < steps; i++) {
        const theta = ((i + 0.5) / steps) * (Math.PI / 2);
        const c = Math.cos(theta);
        sum += ggx(c, alpha) * c * Math.sin(theta) * 2 * Math.PI * (Math.PI / 2 / steps);
      }
      expect(sum).toBeCloseTo(1, 2);
    }
  });
});

describe("the lamp's geometry", () => {
  it("is brightest directly under the lamp and symmetric around it", () => {
    const at = (dx: number, dy: number) => lampReflection(dx, dy, 230, 756_000, 1.518, 0.6);
    expect(at(0, 0)).toBeGreaterThan(at(50, 0));
    expect(at(50, 0)).toBeCloseTo(at(0, -50), 12);
  });

  it("a higher lamp gives a dimmer, wider sheen", () => {
    const low = (dx: number) => lampReflection(dx, 0, 150, 756_000, 1.518, 0.6);
    const high = (dx: number) => lampReflection(dx, 0, 450, 756_000, 1.518, 0.6);
    expect(high(0)).toBeLessThan(low(0));
    expect(high(200) / high(0)).toBeGreaterThan(low(200) / low(0));
  });
});

describe("no glare settings", () => {
  it("the settings that were results are gone", () => {
    for (const key of ["faceLight", "sheen", "sheenFalloff"]) expect(tuning[key]).toBeUndefined();
  });

  it("the shader draws the reflection from the shared chunk and its causes", () => {
    expect(GLASS_LIGHT_FRAGMENT_SHADER.split(REFLECTION_GLSL).length - 1).toBe(1);
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toMatch(
      /lampReflection\(frag - lightXY, lightHeight, lightPower \* uFaceLamp, uIor, uFrost\)/,
    );
    for (const gone of ["uFaceLight", "uSheen", "uSheenReach"]) {
      expect(GLASS_LIGHT_FRAGMENT_SHADER).not.toContain(gone);
    }
  });

  it("the lamp calibration gives a visible, unclipped sheen on today's glass", () => {
    // Default lamp (Core gain 8) at the default height above the glass.
    const s = lampReflection(0, 0, 230, LAMP_POWER_PER_GAIN * 8, FLOAT_GLASS.ior, 0.6);
    expect(s).toBeGreaterThan(0.2);
    expect(s).toBeLessThan(0.6);
  });

  it("is switched off on the site, by request, with the code kept", () => {
    expect(LAMP_REFLECTION_ENABLED).toBe(false);
  });
});
