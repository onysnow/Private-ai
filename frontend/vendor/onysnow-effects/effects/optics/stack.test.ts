import { describe, expect, it } from "vitest";
import { FROSTED_FLOAT } from "@fx/effects/materials/presets";
import { addLayers, fresnel, fresnelSP, mean, slab, solveStack, type StackLayer } from "./stack";

/*
 * The stack of panes (light-physics-reference.md, Part 1), checked against
 * the numbers worked out there.
 */
const CLEAR = { ior: 1.518, absorb: [0, 0, 0] as const };
const clear = (thickness = 18): StackLayer => ({ material: CLEAR, thickness });

describe("one surface", () => {
  it("reflects 4.2% straight on", () => {
    expect(fresnel(1, 1, 1.518)).toBeCloseTo(0.04232, 5);
  });
  it("reflects no p-polarised light at Brewster's angle (56.6°)", () => {
    const brewster = Math.atan(1.518);
    expect(fresnelSP(Math.cos(brewster), 1, 1.518).p).toBeLessThan(1e-12);
  });
  it("reflects everything past the critical angle (41.2°) from inside", () => {
    const past = Math.cos((42 * Math.PI) / 180);
    expect(fresnel(past, 1.518, 1)).toBe(1);
    const before = Math.cos((40 * Math.PI) / 180);
    expect(fresnel(before, 1.518, 1)).toBeLessThan(1);
  });
});

describe("one pane", () => {
  it("clear: 91.9% through, 8.1% back (both surfaces, every bounce)", () => {
    const p = slab(CLEAR, 18);
    expect(mean(p.T)).toBeCloseTo(0.9188, 3);
    expect(mean(p.Rf)).toBeCloseTo(0.0812, 3);
  });
  it("float glass: faintly green through the face, and nothing is created or lost", () => {
    const p = slab(FROSTED_FLOAT, 18);
    expect(p.T[1]).toBeGreaterThan(p.T[0]); // green passes more than red
    for (let c = 0; c < 3; c++) expect(p.T[c]! + p.Rf[c]! + p.A[c]!).toBeCloseTo(1, 12);
  });
});

describe("a stack", () => {
  it("two panes BONDED behave as one pane of twice the thickness", () => {
    const bonded = solveStack([clear(), clear()], [{ kind: "bonded" }]);
    const one = slab(CLEAR, 36);
    for (let c = 0; c < 3; c++) {
      expect(bonded.T[c]).toBeCloseTo(one.T[c]!, 12);
      expect(bonded.Rf[c]).toBeCloseTo(one.Rf[c]!, 12);
    }
    const floatBonded = solveStack(
      [
        { material: FROSTED_FLOAT, thickness: 18 },
        { material: FROSTED_FLOAT, thickness: 18 },
      ],
      [{ kind: "bonded" }],
    );
    const floatOne = slab(FROSTED_FLOAT, 36);
    for (let c = 0; c < 3; c++) expect(floatBonded.T[c]).toBeCloseTo(floatOne.T[c]!, 12);
  });

  it("two clear panes with AIR between: 85.0% through, 15.0% back", () => {
    const air = solveStack([clear(), clear()], [{ kind: "air", gap: 12 }]);
    expect(mean(air.T)).toBeCloseTo(0.8498, 3);
    expect(mean(air.Rf)).toBeCloseTo(0.1502, 3);
  });

  it("N clear panes follow T = (1-r)/(1+(2N-1)r)", () => {
    const r = fresnel(1, 1, 1.518);
    for (const n of [1, 2, 3, 5]) {
      const layers = Array.from({ length: n }, () => clear());
      const links = Array.from({ length: n - 1 }, () => ({ kind: "air" as const, gap: 5 }));
      expect(mean(solveStack(layers, links).T)).toBeCloseTo((1 - r) / (1 + (2 * n - 1) * r), 10);
    }
  });

  it("conserves energy: T + R + A = 1 for any stack and angle", () => {
    for (const cos of [1, 0.8, 0.5, 0.2]) {
      const s = solveStack(
        [
          { material: FROSTED_FLOAT, thickness: 18 },
          { material: FROSTED_FLOAT, thickness: 10 },
          { material: FROSTED_FLOAT, thickness: 6 },
        ],
        [{ kind: "air", gap: 8 }, { kind: "contact" }],
        cos,
      );
      for (let c = 0; c < 3; c++) {
        expect(s.T[c]! + s.Rf[c]! + s.A[c]!).toBeCloseTo(1, 10);
        expect(s.T[c]).toBeGreaterThan(0);
      }
    }
  });

  it("adding is the same whichever way round the light goes through", () => {
    const a = slab(FROSTED_FLOAT, 18);
    const b = slab(CLEAR, 6);
    const ab = addLayers(a, b);
    const ba = addLayers(b, a);
    for (let c = 0; c < 3; c++) expect(ab.T[c]).toBeCloseTo(ba.T[c]!, 12);
  });
});
