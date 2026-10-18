import { describe, expect, it } from "vitest";
import { SURFACE_LAYERS_GLSL } from "./surface-layers.glsl";
import { SCRATCH_SHADOW, SMUDGE_EXTINCTION, SMUDGE_SCATTER } from "./surface-layers";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";

/**
 * Optics step 9: the smudge and scratch layers feed the light through the
 * glass. Both passes read the same marks from one chunk, so the smudge that
 * catches the lamp on the face is the smudge that dims the light under it.
 */
describe("the surface layers are shared", () => {
  it("both passes include the one chunk, once", () => {
    for (const src of [FLOOR_FRAGMENT_SHADER, GLASS_LIGHT_FRAGMENT_SHADER]) {
      expect(src.split(SURFACE_LAYERS_GLSL).length - 1).toBe(1);
      expect(src.match(/\bvec3\s+surfaceAt\s*\(/g)).toHaveLength(1);
    }
  });

  it("the light under the glass reads the marks where its ray crossed the pane", () => {
    expect(FLOOR_FRAGMENT_SHADER).toContain("surfaceAt(Q - r.xy, uSeed[i])");
  });
});

describe("what the marks do to light passing through", () => {
  it("a smudge dims the beam and gives some back as a glow: dimmer and softer, never brighter", () => {
    expect(SMUDGE_EXTINCTION).toBeGreaterThan(SMUDGE_SCATTER);
    const underFullSmudge = 1 - SMUDGE_EXTINCTION + SMUDGE_SCATTER;
    expect(underFullSmudge).toBeGreaterThan(0.4);
    expect(underFullSmudge).toBeLessThan(1);
  });

  it("a scratch or speck only takes light away: a shadow, never a bright copy of itself (2b)", () => {
    expect(SCRATCH_SHADOW).toBeGreaterThan(0);
    expect(SCRATCH_SHADOW).toBeLessThan(1);
    expect(FLOOR_FRAGMENT_SHADER).not.toContain("SCRATCH_FOCUS");
    // Nothing is added back under a scratch: the only light added is the smudge's glow.
    const added = FLOOR_FRAGMENT_SHADER.match(/through \+= vec3\(pool \* passes \*[^;]*;/g) ?? [];
    expect(added.join(" ")).not.toContain("groove");
  });

  it("has no backtick to end its literal early", () => {
    expect(SURFACE_LAYERS_GLSL).not.toContain("`");
  });
});
