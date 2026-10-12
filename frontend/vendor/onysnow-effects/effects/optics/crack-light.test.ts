import { describe, expect, it } from "vitest";
import { crackGlow, type CrackLightSource } from "./crack-light";

/*
 * Item 10, step 3: every light in the scene lights the cracks, not the lamp alone.
 */
const eye = { x: 0, y: 0, z: 1500 };
// A face leaning a little, across a crack running up the page at x = 200.
const face = { x: Math.cos(0.2), y: 0, z: Math.sin(0.2) };
const mid = { x: 200, y: 0 };
const lamp = (x: number, over: Partial<CrackLightSource> = {}): CrackLightSource => ({
  at: { x, y: 0, z: 120 },
  colour: [1, 0.94, 0.84],
  strength: 1,
  radiance: 8,
  charge: 1,
  ...over,
});

/** The lamp's flash as it sweeps past the crack: the strongest seen. */
const sweep = (over: Partial<CrackLightSource> = {}) => {
  let best = 0;
  for (let x = -600; x <= 1000; x += 5)
    best = Math.max(best, crackGlow([lamp(x, over)], mid, face, eye, 0).flash);
  return best;
};

describe("the light at a crack", () => {
  it("flashes where a light, the face and the eye line up, and is dark otherwise", () => {
    expect(sweep()).toBeGreaterThan(0.3);
    const flashes = [-600, -300, 0, 400, 1000].map(
      (x) => crackGlow([lamp(x)], mid, face, eye, 0).flash,
    );
    expect(Math.min(...flashes)).toBeLessThan(0.01);
  });

  it("glows with piped light near a light, less further off", () => {
    const near = crackGlow([lamp(220)], mid, face, eye, 0).rgb[0];
    const far = crackGlow([lamp(1400)], mid, face, eye, 0).rgb[0];
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("takes each light in its own colour and strength, and adds them", () => {
    const red = crackGlow([lamp(220, { colour: [1, 0.2, 0.09] })], mid, face, eye, 0).rgb;
    expect(red[0]).toBeGreaterThan(red[1] * 3);
    const one = crackGlow([lamp(220)], mid, face, eye, 0).rgb[0];
    const two = crackGlow([lamp(220), lamp(220)], mid, face, eye, 0).rgb[0];
    expect(two).toBeCloseTo(2 * one, 10);
    const strong = crackGlow([lamp(220, { strength: 3, radiance: 24 })], mid, face, eye, 0).rgb[0];
    expect(strong).toBeCloseTo(3 * one, 10);
  });

  it("gets nothing from a light that is out, or a beam pointed away", () => {
    expect(crackGlow([lamp(220, { charge: 0 })], mid, face, eye, 0).rgb).toEqual([0, 0, 0]);
    // A torch over the crack pointing straight up, away from the page.
    const away = crackGlow([lamp(220, { aim: [0, 0, 1] })], mid, face, eye, 0).rgb[0];
    expect(away).toBeLessThan(1e-9);
    // Pointed at it, it lights it.
    const at = crackGlow([lamp(200, { aim: [0, 0, -1] })], mid, face, eye, 0).rgb[0];
    expect(at).toBeGreaterThan(0.05);
  });
});
