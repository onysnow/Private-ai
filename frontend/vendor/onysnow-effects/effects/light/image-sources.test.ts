import { describe, expect, it } from "vitest";
import { imageLights, imageReach, R0, reflectance, type Mirror } from "./image-sources";
import type { Light } from "./lights";

const lamp = (x: number, y: number, height: number, extra: Partial<Light> = {}) =>
  ({
    id: "lamp",
    kind: "point",
    x,
    y,
    height,
    radius: 10,
    colour: [1, 1, 1],
    gain: 1,
    charge: 1,
    uv: 0,
    ...extra,
  }) as Light;

const pane: Mirror = { x: 100, y: 100, w: 400, h: 300, z: 90 };

describe("the lights the glass mirrors (light catalogue 3.4)", () => {
  it("uncoated glass reflects 4.3% straight on, and nearly all at grazing", () => {
    expect(R0).toBeCloseTo(0.0426, 3);
    expect(reflectance(1)).toBeCloseTo(R0, 6);
    expect(reflectance(0)).toBeCloseTo(1, 6);
  });

  it("puts the image at the lamp's mirror point in the face's plane", () => {
    const [im] = imageLights([lamp(300, 250, 390)], [pane]);
    expect(im!.z).toBe(2 * 90 - 390);
    expect(im!.x).toBe(300);
  });

  it("makes no image of a light below the glass, or burning nothing", () => {
    expect(imageLights([lamp(300, 250, 60)], [pane])).toHaveLength(0);
    expect(imageLights([lamp(300, 250, 390, { below: true })], [pane])).toHaveLength(0);
    expect(imageLights([lamp(300, 250, 390, { charge: 0 })], [pane])).toHaveLength(0);
  });

  it("lights a point in front of the pane straight above the lamp at the face's reflectance", () => {
    const [im] = imageLights([lamp(300, 250, 390)], [pane]);
    expect(imageReach(im!, 300, 250, 200)).toBeCloseTo(R0, 6);
  });

  it("lights nothing whose ray from the image would cross the face outside the pane", () => {
    const [im] = imageLights([lamp(300, 250, 390)], [pane]);
    // Far to the side, low: the bounce point lies off the pane.
    expect(imageReach(im!, 1200, 250, 100)).toBe(0);
    // Behind the face: the mirror lights nothing behind itself.
    expect(imageReach(im!, 300, 250, 50)).toBe(0);
  });

  it("follows the law of reflection: the bounce point lies where incidence equals reflection", () => {
    const L = lamp(150, 200, 390);
    const [im] = imageLights([L], [pane]);
    const P = { x: 450, y: 200, z: 190 };
    const s = (pane.z - im!.z) / (P.z - im!.z);
    const hx = im!.x + (P.x - im!.x) * s;
    // Equal angles: horizontal run over height above the face, on each side.
    expect((hx - L.x) / (L.height - pane.z)).toBeCloseTo((P.x - hx) / (P.z - pane.z), 6);
  });
});
