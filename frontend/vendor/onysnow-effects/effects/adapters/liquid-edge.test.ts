import { afterEach, describe, expect, it, vi } from "vitest";
import { resetPreviews } from "@fx/effects/engine/preview";
import { EDGE_PROFILE_GLSL } from "@fx/effects/optics/edge-profile.glsl";
import { refractionOffset } from "@fx/effects/optics/edge-profile";
import { FS_GLASS } from "@fx/lib/liquidglass/shaders";
import { liquidConfigFor } from "./liquid-config";

/**
 * ?try=liquidedge (item 2j): the liquid glass's edge drawn the way the CSS
 * glass's is. Why the CSS edges looked nicer: the library bends by its height
 * field's slope times a knob -- hundreds of pixels at the rim, the streaks
 * along its bands -- has no fill of its own, and draws lines round the rim.
 */

const pane = (attrs: Record<string, string> = {}) =>
  ({
    classList: { contains: () => false },
    getAttribute: (name: string) => attrs[name] ?? null,
  }) as unknown as HTMLElement;

afterEach(() => {
  resetPreviews();
  vi.unstubAllGlobals();
});

describe("the liquid glass's edge (?try=liquidedge)", () => {
  it("bends with the same function the CSS bend is built from", () => {
    expect(FS_GLASS.split(EDGE_PROFILE_GLSL).length - 1).toBe(1);
    for (const c of ["r", "g", "b"]) {
      expect(FS_GLASS).toContain(`refractionOffset(x, zR, u_thick, u_iorRGB.${c})`);
    }
  });

  it("moves the rim by tens of pixels, not hundreds", () => {
    // What the library's own bend gives one pixel in from the rim of a 40 px
    // edge at the site's Refraction (3.2): 2 * slope * (1 - 1/1.5) * 3.2 * 30.
    const slope = 39 / Math.sqrt(1 * 79);
    const library = 2 * slope * (1 - 1 / 1.5) * 3.2 * 30;
    const physical = refractionOffset(1 / 40, 40, 18, 1.518);
    expect(library).toBeGreaterThan(250);
    expect(physical).toBeGreaterThan(10);
    expect(physical).toBeLessThan(40);
  });

  it("is off unless previewed, and the library's own drawing is untouched", () => {
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    const config = liquidConfigFor(pane());
    expect(config["physicalEdge"]).toBeUndefined();
    expect(FS_GLASS).toMatch(/float drawn = 1\.0 - step\(0\.5, u_physEdge\)/);
  });

  it("passes the pane's own thickness, dispersion and fill", () => {
    resetPreviews(["liquidedge"]);
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    const config = liquidConfigFor(pane({ "data-thickness": "24" }));
    expect(config["physicalEdge"]).toBe(1);
    expect(config["thickness"]).toBe(24);
    // Normal dispersion: blue bends furthest.
    expect(config["iorB"]!).toBeGreaterThan(config["iorG"]!);
    expect(config["iorG"]!).toBeGreaterThan(config["iorR"]!);
    expect(config["iorG"]!).toBeCloseTo(1.518, 2);
    // No fill to read: the CSS glass's own, as a fallback.
    expect(config["veilA"]).toBeCloseTo(0.3, 5);
    // And the library's own lights -- the streaks along a band -- are off.
    for (const key of ["specular", "edgeHighlight", "fresnel", "shadowOpacity"]) {
      if (key in config) expect(config[key], key).toBe(0);
    }
  });
});
