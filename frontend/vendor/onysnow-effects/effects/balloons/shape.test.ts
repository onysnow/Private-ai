import { describe, expect, it } from "vitest";
import {
  BUOYANCY_Y,
  BODY_LENGTH,
  CROWN_Y,
  NECK_Y,
  TIE_Y,
  halfWidthAt,
  inside,
  outline,
  profileAt,
} from "./shape";

/*
 * The profile measured from the reference photograph of an 11-inch round
 * latex balloon (balloons.md 7.1): half-width (1 = widest) at u, crown to
 * neck. The fit must hold to 1.5% of the half-width over the body.
 */
const MEASURED: [number, number][] = [
  [0.05, 0.478],
  [0.1, 0.649],
  [0.15, 0.772],
  [0.2, 0.855],
  [0.25, 0.918],
  [0.3, 0.96],
  [0.35, 0.987],
  [0.4, 0.998],
  [0.45, 0.998],
  [0.5, 0.982],
  [0.55, 0.953],
  [0.6, 0.91],
  [0.65, 0.855],
  [0.7, 0.786],
  [0.75, 0.703],
  [0.8, 0.6],
  [0.85, 0.491],
  [0.9, 0.371],
];

describe("the balloon's shape (task 74)", () => {
  it("follows the measured profile to 1.5% of its half-width", () => {
    for (const [u, w] of MEASURED) expect(Math.abs(profileAt(u) - w)).toBeLessThan(0.015);
  });

  it("is widest (exactly 1) at y = 0, the physics body's centre, and nowhere wider", () => {
    expect(halfWidthAt(0)).toBeCloseTo(1, 3);
    for (let y = CROWN_Y; y <= NECK_Y; y += 0.01)
      expect(halfWidthAt(y)).toBeLessThanOrEqual(1.0005);
  });

  it("is 1.30 times as tall as it is wide, with the knot below the neck", () => {
    expect(BODY_LENGTH / 2).toBeCloseTo(1.2995, 3);
    expect(TIE_Y).toBeGreaterThan(NECK_Y);
  });

  it("has one bulge: the outline only widens to the widest point, then only narrows (no shoulders)", () => {
    let last = 0;
    for (let y = CROWN_Y + 0.001; y < 0; y += 0.005) {
      const w = halfWidthAt(y);
      expect(w).toBeGreaterThanOrEqual(last - 1e-9);
      last = w;
    }
    last = halfWidthAt(0.01);
    for (let y = 0.01; y < NECK_Y - 0.3; y += 0.005) {
      const w = halfWidthAt(y);
      expect(w).toBeLessThanOrEqual(last + 1e-9);
      last = w;
    }
  });

  it("knows what is inside: the body and the knot, not the corners round them", () => {
    expect(inside(0, 0)).toBe(true);
    expect(inside(0.9, 0)).toBe(true);
    expect(inside(0, (NECK_Y + TIE_Y) / 2)).toBe(true);
    expect(inside(0.8, NECK_Y - 0.1)).toBe(false);
    expect(inside(0.9, CROWN_Y + 0.05)).toBe(false);
  });

  it("gives a closed outline round the body", () => {
    const pts = outline(32);
    expect(pts[0]![1]).toBeCloseTo(CROWN_Y, 5);
    const xs = pts.map((p) => p[0]);
    expect(Math.max(...xs)).toBeCloseTo(1, 2);
    expect(Math.min(...xs)).toBeCloseTo(-1, 2);
  });

  it("puts its buoyancy at the middle of its volume, a little below the widest point", () => {
    let v = 0;
    let m = 0;
    for (let y = CROWN_Y; y < NECK_Y; y += 0.0005) {
      const r = halfWidthAt(y);
      v += r * r;
      m += y * r * r;
    }
    expect(m / v).toBeCloseTo(BUOYANCY_Y, 2);
  });
});
