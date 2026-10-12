import { describe, expect, it } from "vitest";
import { LAYER_CLASS, layerProps, layerZ, PANE_LAYERS, SIDE_LAYER_Z } from "./compositor";

/** Optics plan step 4: one list decides every pane layer's order. */
describe("the pane's layers", () => {
  it("are in optical order, bottom to top", () => {
    const at = (n: (typeof PANE_LAYERS)[number]) => PANE_LAYERS.indexOf(n);
    // The liquid render under the light, the light under the glass under the light on it.
    expect(at("pane:liquid")).toBeLessThan(at("pane:under"));
    expect(at("pane:under")).toBeLessThan(at("pane:surface"));
    expect(at("pane:bokeh")).toBe(0);
  });

  it("each get their own z-index, all below the content, the top one at -1", () => {
    const zs = PANE_LAYERS.map(layerZ);
    expect(new Set(zs).size).toBe(zs.length);
    expect(Math.max(...zs)).toBe(-1);
    expect([...zs].sort((a, b) => a - b)).toEqual(zs);
    // The side faces sit outside the pane, above it.
    expect(SIDE_LAYER_Z).toBeGreaterThan(0);
  });

  it("carry the classes the stylesheet already styles", () => {
    expect(LAYER_CLASS["pane:surface"]).toBe("glass__surface");
    expect(LAYER_CLASS["pane:under"]).toBe("glass__under");
    expect(layerProps("pane:glare")).toMatchObject({
      "data-layer": "pane:glare",
      className: "glass__glare",
      style: { zIndex: layerZ("pane:glare") },
    });
  });
});
