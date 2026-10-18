import { afterEach, describe, expect, it } from "vitest";
import { heldTool, holdTool, lampMode, resetTool } from "./held";
import {
  BLACKLIGHT_VISIBLE,
  LAMP_COLOUR,
  cursorLamp,
  onLightChange,
  reportCharge,
} from "@fx/effects/light/lights";

/*
 * Item 25e: one thing in the hand at a time. The lamp is a tool like the
 * others: put down, it gives no light however the shutter is wound.
 */
describe("what is held", () => {
  afterEach(() => {
    resetTool("lamp");
    reportCharge(0);
  });

  it("starts with the lamp", () => {
    resetTool("lamp");
    expect(heldTool()).toBe("lamp");
    expect(lampMode()).toBe("white");
  });

  it("puts the lamp down for the flare and the laser", () => {
    resetTool("lamp");
    reportCharge(0.8);
    expect(cursorLamp.charge).toBeCloseTo(0.8);
    for (const tool of ["flare", "laser"] as const) {
      holdTool(tool);
      expect(cursorLamp.charge).toBe(0);
    }
    // Picked up again, it is as wound as the shutter is.
    holdTool("lamp");
    expect(cursorLamp.charge).toBeCloseTo(0.8);
  });

  it("makes the lamp a black light: the dull leak visible, the rest UV", () => {
    resetTool("lamp");
    expect(cursorLamp.colour).toEqual(LAMP_COLOUR);
    expect(cursorLamp.uv).toBe(0);
    holdTool("blacklight");
    expect(cursorLamp.colour).toEqual(BLACKLIGHT_VISIBLE);
    expect(cursorLamp.uv).toBe(1);
  });

  it("keeps the lamp lit round the magnifier (an illuminated one)", () => {
    resetTool("lamp");
    reportCharge(0.5);
    holdTool("magnifier");
    expect(cursorLamp.charge).toBeCloseTo(0.5);
    expect(cursorLamp.uv).toBe(0);
  });

  it("relights the scene when the hand changes", () => {
    resetTool("lamp");
    let told = 0;
    const stop = onLightChange(() => (told += 1));
    holdTool("flare");
    stop();
    expect(told).toBeGreaterThan(0);
  });
});
