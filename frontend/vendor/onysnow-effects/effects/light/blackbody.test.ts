import { afterEach, describe, expect, it } from "vitest";
import { resetPreviews } from "@fx/effects/engine/preview";
import { tuning } from "@fx/lib/tuning";
import { blackbodyRgb, planck } from "./blackbody";
import { LAMP_COLOUR, cursorLamp } from "./lights";

/*
 * Catalogue item 32: a light's colour from its temperature.
 */
describe("a blackbody's colour", () => {
  it("peaks where Wien's law says: 2898 um K / T", () => {
    let best = 0;
    let at = 0;
    for (let l = 200; l <= 3000; l += 1) {
      const b = planck(l, 5800);
      if (b > best) {
        best = b;
        at = l;
      }
    }
    expect(at).toBeCloseTo(2.8978e6 / 5800, -1);
  });

  it("is near the screen's white at 6500 K, and warmer below, bluer above", () => {
    const white = blackbodyRgb(6500);
    expect(Math.min(...white)).toBeGreaterThan(0.9);
    const bulb = blackbodyRgb(2700);
    expect(bulb[0]).toBe(1);
    expect(bulb[2]).toBeLessThan(0.2);
    const sky = blackbodyRgb(10000);
    expect(sky[2]).toBe(1);
    expect(sky[0]).toBeLessThan(0.8);
  });

  it("gets steadily bluer as it gets hotter", () => {
    let last = -1;
    for (let t = 1500; t <= 10000; t += 500) {
      const [r, , b] = blackbodyRgb(t);
      expect(b / r).toBeGreaterThan(last);
      last = b / r;
    }
  });
});

describe("the lamp's temperature (?try=kelvin)", () => {
  afterEach(() => {
    resetPreviews();
    tuning["lampKelvin"]!.value = 5900;
  });

  it("leaves the lamp its colour unless tried", () => {
    expect(cursorLamp.colour).toEqual(LAMP_COLOUR);
  });

  it("gives the lamp a blackbody's colour when tried", () => {
    resetPreviews(["kelvin"]);
    tuning["lampKelvin"]!.value = 3200;
    expect(cursorLamp.colour).toEqual(blackbodyRgb(3200));
  });
});
