import { describe, expect, it } from "vitest";
import {
  BOKEH_RINGS,
  BOKEH_TAPS,
  discRadiusForBlur,
  hiddenLightMap,
  hiddenWeight,
  isolation,
  markLightNear,
  PHOTO_VIGNETTE,
  vignetteTransmission,
} from "./bokeh";
import { BOKEH_GLSL } from "./bokeh.glsl";

describe("bokeh: the light the photograph clipped, spread by the frost", () => {
  it("only blown pixels hold hidden light; ordinary ones hold none", () => {
    expect(hiddenWeight(0.5, 0.5, 0.5)).toBe(0);
    expect(hiddenWeight(0.7, 0.6, 0.6)).toBe(0);
    expect(hiddenWeight(1, 1, 1)).toBe(1);
    expect(hiddenWeight(0.95, 0.95, 0.95)).toBeGreaterThan(hiddenWeight(0.85, 0.85, 0.85));
  });

  it("a light clipped in one channel still counts, and keeps its colour", () => {
    expect(hiddenWeight(1, 0.1, 0.05)).toBe(1);
    const [r, g, b] = hiddenLightMap(new Uint8ClampedArray([255, 26, 13, 255]));
    expect(r).toBe(255);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(20);
  });

  it("an evenly lit photograph makes no discs at all", () => {
    const grey = new Uint8ClampedArray(4 * 16).fill(150);
    const map = hiddenLightMap(grey);
    for (let i = 0; i < map.length; i += 4) expect(map[i]! + map[i + 1]! + map[i + 2]!).toBe(0);
  });

  it("a blown patch in the dark is a light; one in a bright place is only white", () => {
    expect(isolation(0.05)).toBeGreaterThan(0.9);
    expect(isolation(0.95)).toBeLessThan(0.01);
    const bulb = new Uint8ClampedArray([255, 240, 200, 255]);
    const [inDark] = hiddenLightMap(bulb, new Uint8ClampedArray([20, 20, 20, 255]));
    const [inSky] = hiddenLightMap(bulb, new Uint8ClampedArray([240, 240, 240, 255]));
    expect(inDark).toBeGreaterThan(200);
    expect(inSky).toBeLessThan(5);
  });

  it("the photographs' vignette dims a light near their edge, a corner most", () => {
    expect(vignetteTransmission(1000, 1000)).toBeCloseTo(1, 3);
    const edge = vignetteTransmission(0, 1000);
    const corner = vignetteTransmission(0, 0);
    expect(edge).toBeLessThan(0.75);
    expect(corner).toBeLessThan(edge);
    expect(corner).toBeGreaterThanOrEqual(1 - PHOTO_VIGNETTE.alpha - 1e-12);
  });

  it("marks where there is light near, so the shader can skip the rest", () => {
    const size = 64;
    const map = new Uint8ClampedArray(size * size * 4);
    const at = (x: number, y: number) => (y * size + x) * 4;
    map[at(8, 8)] = 200;
    markLightNear(map, size, 16, 8);
    expect(map[at(8, 8) + 3]).toBe(255);
    expect(map[at(20, 20) + 3]).toBe(255); // within reach
    expect(map[at(60, 60) + 3]).toBe(0); // nowhere near
  });

  it("the disc spreads as far as the blur the pane shows", () => {
    // A uniform disc of radius R has per-axis variance R^2 / 4.
    const R = discRadiusForBlur(30);
    expect(Math.sqrt((R * R) / 4)).toBeCloseTo(30, 12);
  });

  it("the aperture is a hexagon of equal cells, centred", () => {
    expect(BOKEH_TAPS).toHaveLength(1 + 3 * BOKEH_RINGS * (BOKEH_RINGS + 1));
    const cx = BOKEH_TAPS.reduce((a, [x]) => a + x, 0);
    const cy = BOKEH_TAPS.reduce((a, [, y]) => a + y, 0);
    expect(cx).toBeCloseTo(0, 12);
    expect(cy).toBeCloseTo(0, 12);
    for (const [x, y] of BOKEH_TAPS) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-12);
    // Six taps at the full radius: the corners.
    expect(BOKEH_TAPS.filter(([x, y]) => Math.abs(Math.hypot(x, y) - 1) < 1e-9)).toHaveLength(6);
  });

  it("the shader gathers exactly those taps", () => {
    const taps = BOKEH_GLSL.match(/bokehTap\(map, at \+ vec2\(/g) ?? [];
    expect(taps).toHaveLength(BOKEH_TAPS.length);
    expect(BOKEH_GLSL).toContain(`return sum / ${BOKEH_TAPS.length.toFixed(6)};`);
  });
});
