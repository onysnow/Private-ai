import { describe, expect, it } from "vitest";
import { castPoint, lampDiscAt } from "./casters";
import { CASTERS_GLSL } from "./casters.glsl";
import { FLOOR_FRAGMENT_SHADER } from "@fx/lib/floor-light-shader";

describe("shadows thrown onto the photographs, through the glass (item 52)", () => {
  const L = { x: 0, y: 0 };
  const H = 400;

  it("projects a caster from the lamp: further off the higher it stands", () => {
    const P = { x: 300, y: 0 };
    // The ray from P to the lamp crosses the caster's plane nearer the lamp the higher it is.
    expect(castPoint(P, L, H, 10).x).toBeCloseTo(300 - 300 * (10 / 400), 9);
    expect(castPoint(P, L, H, 90).x).toBeLessThan(castPoint(P, L, H, 10).x);
  });

  it("softens with the caster's height and stretches toward the lamp at a slant", () => {
    const below = lampDiscAt({ x: 0, y: 0 }, L, H, 30, 80);
    expect(below.across).toBeCloseTo(30 * (80 / 400), 9);
    expect(below.along).toBeCloseTo(below.across, 9);
    const far = lampDiscAt({ x: 800, y: 0 }, L, H, 30, 80);
    expect(far.along).toBeGreaterThan(far.across * 2);
    expect(lampDiscAt({ x: 0, y: 0 }, L, H, 30, 10).across).toBeLessThan(below.across);
  });

  it("is in the floor light's shader, and only there", () => {
    expect(FLOOR_FRAGMENT_SHADER.split(CASTERS_GLSL).length - 1).toBe(1);
    expect(FLOOR_FRAGMENT_SHADER).toContain("light *= mix(vec3(1.0), pass, below);");
    expect(CASTERS_GLSL).not.toContain("`");
  });
});

describe("isClear", () => {
  it("knows a colour that paints nothing", async () => {
    const { isClear } = await import("./casters");
    expect(isClear("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isClear("transparent")).toBe(true);
    expect(isClear("oklch(0.72 0.14 68 / 0)")).toBe(true);
    expect(isClear("rgba(10, 10, 10, 0.5)")).toBe(false);
    expect(isClear("rgb(224, 148, 40)")).toBe(false);
    expect(isClear("oklch(0.72 0.14 68)")).toBe(false);
    expect(isClear("oklch(0.72 0.14 68 / 40%)")).toBe(false);
  });
});

describe("caster layers: each at its own height, face and colour", () => {
  const caster = (height: number, face: number, tint: [number, number, number] = [0, 0, 0]) =>
    ({
      el: {} as HTMLElement,
      material: {} as never,
      onGlass: face > 0,
      height,
      face,
      tint,
    }) as const;

  it("groups casters at one height, on one face, of one colour into one layer", async () => {
    const { groupCasters } = await import("./casters");
    const g = groupCasters([
      caster(10, 0),
      caster(11, 0),
      caster(110, 88),
      caster(110, 88, [0.9, 0.4, 0.1]),
    ]);
    expect(g.layers).toHaveLength(3);
    expect(g.index).toEqual([0, 0, 1, 2]);
  });

  it("never makes more than the floor pass reads; the rest join the nearest height", async () => {
    const { groupCasters, MAX_CASTER_LAYERS } = await import("./casters");
    const many = Array.from({ length: 10 }, (_, i) => caster(10 + i * 20, 0));
    const g = groupCasters(many);
    expect(g.layers).toHaveLength(MAX_CASTER_LAYERS);
    expect(g.index[9]).toBe(MAX_CASTER_LAYERS - 1);
  });
});
