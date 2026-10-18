import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARRIS_RADIUS,
  arrisGlint,
  arrisLine,
  echoProfile,
  farArrisGradientCss,
  farArrisLoss,
  mirrorReach,
  PANE_THICKNESS,
  SIDE_ABSORB,
  FAR_ARRIS_LOSS,
  sideCosine,
  sideGradientCss,
  sideWidth,
  paneFaces,
  sidePath,
  sideTransmittance,
} from "./edge-side";
import { EDGE_SIDE_GLSL } from "./edge-side.glsl";
import { fresnelSchlick } from "./reflection";
import { GLASS_THICKNESS } from "@fx/lib/bevel-filters";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";
import { tuning } from "@fx/lib/tuning";

/**
 * Optics plan step 8: the edge rebuilt from the reference photographs. See
 * edge-side.ts for what the photos show and what each function models.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const css = read("../../effects.css");

describe("the side face's window", () => {
  it("is green: soda-lime lets green through most, red least", () => {
    const [r, g, b] = sideTransmittance(4);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(r);
  });

  it("matches the reference photographs' colour and depth", () => {
    // Measured: optical depth blue/green 1.2-1.35, red/green 2-4.5, green
    // 0.5 (paler middle) to 1.3 (most saturated) across a side.
    const [r, g, b] = SIDE_ABSORB;
    expect(b / g).toBeGreaterThanOrEqual(1.2);
    expect(b / g).toBeLessThanOrEqual(1.35);
    expect(r / g).toBeGreaterThanOrEqual(2);
    expect(r / g).toBeLessThanOrEqual(4.5);
    expect(g * sidePath(16)).toBeGreaterThan(0.4);
    expect(g * sidePath(16)).toBeLessThan(0.6);
    expect(g * sidePath(0)).toBeGreaterThan(1.1);
    expect(g * sidePath(0)).toBeLessThan(1.4);
    expect(FAR_ARRIS_LOSS).toBeCloseTo(0.55);
  });

  it("is most saturated at the near arris, where the light was guided furthest", () => {
    expect(sidePath(0)).toBeGreaterThan(sidePath(3));
    expect(sidePath(3)).toBeGreaterThan(sidePath(12));
    const near = sideTransmittance(2.5);
    const mid = sideTransmittance(10);
    expect(near[0] / near[1]).toBeLessThan(mid[0] / mid[1]);
  });

  it("starts after the eased corner, which reflects rather than looks through", () => {
    expect(sideTransmittance(0)).toEqual([1, 1, 1]);
    expect(sideTransmittance(3)[0]).toBeLessThan(0.6);
  });

  it("has a soft darker line at the far arris, not a bright one", () => {
    expect(farArrisLoss(0)).toBeGreaterThan(0.3);
    expect(farArrisLoss(ARRIS_RADIUS)).toBeLessThan(farArrisLoss(0));
    expect(farArrisLoss(3 * ARRIS_RADIUS)).toBeLessThan(0.01);
  });

  it("is built into the CSS from the same numbers", () => {
    const top = sideGradientCss("to bottom");
    const [r, g, b] = sideTransmittance(0).map((t) => Math.round(255 * Math.pow(t, 1 / 2.2)));
    expect(top).toContain(`rgb(${r} ${g} ${b}) 0px`);
    expect(top.startsWith("linear-gradient(to bottom,")).toBe(true);
    // Darkest in the middle of the far-arris layer, where the corner is.
    const stops = [...farArrisGradientCss("to top").matchAll(/rgb\((\d+) /g)].map((m) => +m[1]!);
    expect(Math.min(...stops)).toBe(stops[4]);
  });

  it("is a multiply layer beside the pane, not a painted stripe inside it", () => {
    expect(css).toMatch(/\.glass-side \{[^}]*mix-blend-mode: multiply/);
    expect(css).not.toContain(".glass > .glass__side");
    // The old painted teal stripes and hard echo line are gone.
    expect(css).not.toContain("oklch(0.95 0.06 168 / 0.72)");
    expect(css).not.toContain("--echo: 5px");
  });
});

describe("the side's height", () => {
  it("has one definition: no second copy in the stylesheet to drift", () => {
    expect(css).not.toContain("--side-top");
    expect(css).not.toContain("--pane-top");
    // Bars are thinner glass than bands.
    expect(sideWidth(300, PANE_THICKNESS, true, 1728)).toBeLessThan(
      sideWidth(300, PANE_THICKNESS, false, 1728),
    );
  });

  it("shows only from its own side of the edge, a few pixels wide: seen from the front", () => {
    const D = 1728; // 1.2 x a 1440 px view
    expect(sideWidth(-10, PANE_THICKNESS, false, D)).toBe(0);
    expect(sideWidth(0, PANE_THICKNESS, false, D)).toBe(0);
    // Perspective: offset x T / (D + T).
    expect(sideWidth(450, 18, false, D)).toBeCloseTo((450 * 18) / (D + 18), 12);
    // Half a view past the eye, an 18 px slab shows under 5 px of side.
    expect(sideWidth(450, 18, false, D)).toBeLessThan(5);
    // Twice as far past the eye, twice as wide; twice as thick, about twice.
    expect(sideWidth(400, 18, false, D)).toBeCloseTo(2 * sideWidth(200, 18, false, D), 12);
  });

  it("never shows the top and bottom (or left and right) of a flat pane at once", () => {
    // Ony, 2026-09-29: "you should never be able to see the top and bottom at the same time".
    const bar = false;
    for (const eyeY of [-200, 0, 150, 300, 450, 700, 1200]) {
      for (const eyeX of [0, 400, 720, 1100]) {
        const f = paneFaces(
          { left: 300, top: 250, right: 700, bottom: 500 },
          { x: eyeX, y: eyeY },
          1728,
          bar,
          PANE_THICKNESS,
          false,
        );
        expect(f.top > 0 && f.bottom > 0).toBe(false);
        expect(f.left > 0 && f.right > 0).toBe(false);
      }
    }
  });

  it("a pane that straddles the eye shows no side; a small one near it, hardly any", () => {
    const eye = { x: 720, y: 450 };
    const straddling = paneFaces(
      { left: 600, top: 400, right: 840, bottom: 500 },
      eye,
      450,
      false,
      PANE_THICKNESS,
      false,
    );
    expect(straddling).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    const near = paneFaces(
      { left: 760, top: 480, right: 860, bottom: 560 },
      eye,
      450,
      false,
      PANE_THICKNESS,
      false,
    );
    expect(near.top).toBeLessThanOrEqual(1);
    expect(near.left).toBeLessThanOrEqual(2);
    // A full-width band has no left or right edge in view.
    const band = paneFaces(
      { left: 0, top: 600, right: 1440, bottom: 900 },
      eye,
      450,
      false,
      PANE_THICKNESS,
      true,
    );
    expect(band.left + band.right).toBe(0);
    expect(band.top).toBeGreaterThan(0);
  });

  it("the thinner it shows, the more grazing the look and the more it mirrors", () => {
    const thin = fresnelSchlick(sideCosine(3, PANE_THICKNESS), 1.518);
    const open = fresnelSchlick(sideCosine(16, PANE_THICKNESS), 1.518);
    expect(thin).toBeGreaterThan(open);
    expect(thin).toBeLessThan(1);
  });

  it("is the same thickness the CSS bend is built from", () => {
    expect(GLASS_THICKNESS).toBe(PANE_THICKNESS);
  });
});

describe("the side as a mirror", () => {
  it("reflects the photograph beyond the edge, flipped: the near arris shows the furthest", () => {
    const near = mirrorReach(0, 10, 70, PANE_THICKNESS);
    const far = mirrorReach(10, 10, 70, PANE_THICKNESS);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeCloseTo(10 * (1 + 70 / PANE_THICKNESS));
  });

  it("with no gap, reflects only what is right at the edge", () => {
    expect(mirrorReach(0, 10, 0, PANE_THICKNESS)).toBe(10);
  });
});

describe("the arris", () => {
  // A top edge along y = 0, outward normal pointing up the page.
  const g: [number, number] = [0, -1];
  const eye: [number, number, number] = [640, 400, 1536];
  const power = 756_000;
  const glint = (x: number, lamp: [number, number, number], size = 46) =>
    arrisGlint([x, 0], g[0], g[1], lamp, size, eye, 0.02, power, 1.518);

  it("glints beside the lamp and nowhere else along the edge: short segments", () => {
    const lamp: [number, number, number] = [300, -80, 230];
    const xs = Array.from({ length: 121 }, (_, i) => i * 10);
    const values = xs.map((x) => glint(x, lamp));
    const peakAt = xs[values.indexOf(Math.max(...values))]!;
    expect(Math.abs(peakAt - 300)).toBeLessThan(80);
    expect(glint(1100, lamp)).toBeLessThan(0.02 * Math.max(...values));
  });

  it("a bigger lamp throws a longer glint", () => {
    const lamp: [number, number, number] = [300, -80, 230];
    const halfLength = (size: number) => {
      const peak = glint(300, lamp, size);
      let x = 300;
      while (glint(x, lamp, size) > peak / 2 && x < 1300) x += 2;
      return x - 300;
    };
    expect(halfLength(90)).toBeGreaterThan(halfLength(20));
  });

  it("is lit only by a lamp on its side of the edge", () => {
    expect(glint(300, [300, -80, 230])).toBeGreaterThan(0);
    // Far below the top edge, the lamp's mirror direction falls outside the corner's arc.
    expect(glint(300, [300, 900, 5])).toBe(0);
  });

  it("integrates the lobe across the arc: wider roughness, lower and broader", () => {
    expect(arrisLine(0, 0.02)).toBeGreaterThan(arrisLine(0, 0.2));
    expect(arrisLine(0.1, 0.2)).toBeGreaterThan(arrisLine(0.1, 0.02));
  });

  it("the echo sits one more side's height in, soft", () => {
    expect(echoProfile(20, 10)).toBe(1);
    expect(echoProfile(20 + 3 * ARRIS_RADIUS, 10)).toBeLessThan(0.001);
  });
});

describe("the edge is causes, not results", () => {
  it("has no edge-glow or side-reach setting", () => {
    expect(tuning["arris"]).toBeUndefined();
    expect(tuning["sideReach"]).toBeUndefined();
  });

  it("the glass shader draws the edge from the shared chunk", () => {
    const src = GLASS_LIGHT_FRAGMENT_SHADER;
    expect(src.split(EDGE_SIDE_GLSL).length - 1).toBe(1);
    expect(src).not.toContain("uArris");
    expect(src).not.toContain("uSideReach");
    expect(src).toContain("arrisGlint(onEdge, grad, lamp, uLightRadius[i], eye");
  });

  it("draws no hairline round the pane", () => {
    expect(css).not.toContain("oklch(0.97 0.03 170 / 0.5) 0%");
    expect(css).not.toMatch(/inset 0 1px 0 oklch\(1 0 0 \/ 0\.1\)/);
  });
});
