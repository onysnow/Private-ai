import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATERIAL,
  FLOAT_GLASS,
  FROSTED_FLOAT,
  MATERIAL_ATTR,
  materialById,
} from "./presets";
import { readPaneCauses } from "./pane-causes";
import { reflectanceNormal } from "@fx/effects/optics/reflection";
import { PANE_THICKNESS, SIDE_ABSORB, sideWidth } from "@fx/effects/optics/edge-side";
import { Pane } from "@fx/effects/react/Pane";

/**
 * Optics plan step 2: one <Pane> describes a piece of glass, and the
 * frosted-float preset carries today's values -- so nothing changes.
 */

const el = (attrs: Record<string, string>) => ({
  getAttribute: (name: string) => attrs[name] ?? null,
});
const defaults = { frost: 0.6, gap: 70 };

describe("the frosted-float preset is today's glass", () => {
  it("soda-lime float: n 1.518, Abbe about 60, 4.2% straight on", () => {
    expect(FROSTED_FLOAT.ior).toBe(1.518);
    expect(FROSTED_FLOAT.abbe).toBe(60);
    expect(reflectanceNormal(FROSTED_FLOAT.ior)).toBeCloseTo(0.042, 3);
  });

  it("frosted on the back at 0.6, the value the panes have always had", () => {
    expect(FROSTED_FLOAT.frostedFace).toBe("back");
    expect(FROSTED_FLOAT.frost).toBe(0.6);
  });

  it("carries the measured side colour, the one the edge model uses", () => {
    expect(SIDE_ABSORB).toBe(FROSTED_FLOAT.absorb);
  });

  it("is the default, and what the old name reads", () => {
    expect(DEFAULT_MATERIAL).toBe("frosted-float");
    expect(FLOAT_GLASS).toBe(FROSTED_FLOAT);
    expect(materialById("no-such-glass")).toBe(FROSTED_FLOAT);
    expect(materialById(null)).toBe(FROSTED_FLOAT);
  });
});

describe("a pane's causes, read from its element", () => {
  it("a pane that says nothing is today's glass", () => {
    const c = readPaneCauses(el({}), defaults);
    expect(c.material.id).toBe("frosted-float");
    expect(c.material.frost).toBe(0.6);
    expect(c.thickness).toBe(PANE_THICKNESS);
    expect(c.gap).toBe(70);
    expect([c.smudge, c.scratch]).toEqual([1, 1]);
  });

  it("the Frost setting edits the site's glass", () => {
    expect(readPaneCauses(el({}), { frost: 0.2, gap: 70 }).material.frost).toBe(0.2);
  });

  it("reads what the pane declares, within physical limits", () => {
    const c = readPaneCauses(
      el({ "data-thickness": "10", "data-gap": "40", "data-smudge": "0.3", "data-scratch": "5" }),
      defaults,
    );
    expect(c.thickness).toBe(10);
    expect(c.gap).toBe(40);
    expect(c.smudge).toBe(0.3);
    expect(c.scratch).toBe(1);
    expect(readPaneCauses(el({ "data-thickness": "junk" }), defaults).thickness).toBe(
      PANE_THICKNESS,
    );
  });

  it("a thicker slab shows a proportionally taller side", () => {
    // A thicker slab shows a wider side from the same place (a little under
    // twice: the back arris is further away too).
    const one = sideWidth(300, PANE_THICKNESS, false, 1728);
    const two = sideWidth(300, 2 * PANE_THICKNESS, false, 1728);
    expect(two).toBeGreaterThan(1.95 * one);
    expect(two).toBeLessThan(2 * one);
  });
});

describe("<Pane>", () => {
  it("with no props writes only its material: nothing else changes", () => {
    const html = renderToStaticMarkup(<Pane>copy</Pane>);
    // The pane's own opening tag (its side faces follow it, with styles of their own).
    const tag = html.slice(0, html.indexOf(">") + 1);
    expect(tag).toContain(`${MATERIAL_ATTR}="frosted-float"`);
    expect(tag).not.toContain("data-thickness");
    expect(tag).not.toContain("data-gap");
    expect(tag).not.toContain("data-edge-width");
    expect(tag).not.toContain("style=");
    expect(tag).toContain('class="glass"');
  });

  it("writes each cause it is given onto the element the passes measure", () => {
    const html = renderToStaticMarkup(
      <Pane
        thickness={10}
        gap={40}
        edge={{ width: 24, corner: 12 }}
        layers={{ smudge: 0.5, scratch: 0 }}
        variant="bar"
      >
        copy
      </Pane>,
    );
    for (const attr of [
      'data-thickness="10"',
      'data-gap="40"',
      'data-edge-width="24"',
      'data-smudge="0.5"',
      'data-scratch="0"',
      "border-radius:12px",
      "glass--bar",
    ]) {
      expect(html).toContain(attr);
    }
  });

  it("renders its two side faces after it, as the edge model needs", () => {
    const html = renderToStaticMarkup(<Pane>copy</Pane>);
    expect(html.indexOf("glass-side--top")).toBeGreaterThan(html.indexOf("copy"));
    expect(html).toContain("glass-side--bottom");
  });
});
