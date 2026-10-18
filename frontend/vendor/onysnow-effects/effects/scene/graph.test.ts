import { describe, expect, it } from "vitest";
import { FROSTED_FLOAT } from "@fx/effects/materials/presets";
import type { PaneCauses } from "@fx/effects/materials/pane-causes";
import { slab, solveStack } from "@fx/effects/optics/stack";
import { placeStack, readInterface, SINGLE } from "./graph";

const pane = (gap = 70, thickness = 18): PaneCauses => ({
  material: FROSTED_FLOAT,
  thickness,
  gap,
  smudge: 1,
  scratch: 1,
});

const attrs = (a: Record<string, string>) => ({ getAttribute: (k: string) => a[k] ?? null });

describe("stacks: where each layer stands and what light reaches it", () => {
  it("a pane on its own is a stack of one and changes nothing", () => {
    const [only] = placeStack([pane(40)], { kind: "air", gap: 10 });
    expect(only!.zBottom).toBe(40);
    expect(only!.lightIn).toEqual([1, 1, 1]);
    expect(only!.throughScale).toEqual([1, 1, 1]);
    expect(only!.reflectScale).toEqual([1, 1, 1]);
    expect(only!.above).toBeNull();
    expect(only!.below).toBeNull();
    expect(SINGLE.lightIn).toEqual([1, 1, 1]);
  });

  it("layers stand on each other: gap, then thickness plus the air between", () => {
    const placed = placeStack([pane(70, 18), pane(70, 12), pane(70, 6)], { kind: "air", gap: 10 });
    expect(placed.map((p) => p.zBottom)).toEqual([70, 98, 120]);
    const touching = placeStack([pane(70), pane(70)], { kind: "contact" });
    expect(touching.map((p) => p.zBottom)).toEqual([70, 88]);
  });

  it("the bottom layer gets what came through the top one", () => {
    const [bottom, top] = placeStack([pane(), pane()], { kind: "air", gap: 10 });
    const one = slab(FROSTED_FLOAT, 18);
    expect(top!.lightIn).toEqual([1, 1, 1]);
    bottom!.lightIn.forEach((v, c) => expect(v).toBeCloseTo(one.T[c]!, 12));
  });

  it("through the whole stack: its shadow is the stack's, carried by the bottom layer", () => {
    const [bottom, top] = placeStack([pane(), pane()], { kind: "air", gap: 10 });
    const one = slab(FROSTED_FLOAT, 18);
    const whole = solveStack(
      [
        { material: FROSTED_FLOAT, thickness: 18 },
        { material: FROSTED_FLOAT, thickness: 18 },
      ],
      [{ kind: "air", gap: 10 }],
    );
    bottom!.throughScale.forEach((v, c) => expect(v * one.T[c]!).toBeCloseTo(whole.T[c]!, 12));
    expect(top!.throughScale).toEqual([1, 1, 1]);
    // Two air-gapped panes reflect more than one: the extra image from below.
    top!.reflectScale.forEach((v) => expect(v).toBeGreaterThan(1));
    expect(bottom!.reflectScale).toEqual([1, 1, 1]);
  });

  it("bonded panes pass more than air-gapped ones: the inner surfaces are gone", () => {
    const [airBottom] = placeStack([pane(), pane()], { kind: "air", gap: 10 });
    const [bondBottom] = placeStack([pane(), pane()], { kind: "bonded" });
    expect(bondBottom!.throughScale[1]).toBeGreaterThan(airBottom!.throughScale[1]);
  });

  it("reads the interface a stack element declares", () => {
    expect(readInterface(attrs({ "data-interface": "bonded" }))).toEqual({ kind: "bonded" });
    expect(readInterface(attrs({ "data-interface": "contact" }))).toEqual({ kind: "contact" });
    expect(readInterface(attrs({ "data-interface": "air", "data-interface-gap": "12" }))).toEqual({
      kind: "air",
      gap: 12,
    });
    expect(readInterface(attrs({}))).toEqual({ kind: "air", gap: 0 });
    expect(readInterface(attrs({ "data-interface-gap": "-4" }))).toEqual({ kind: "air", gap: 0 });
  });
});
