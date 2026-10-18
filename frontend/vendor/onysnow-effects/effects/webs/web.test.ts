import { describe, expect, it } from "vitest";
import { Net, RADIAL, SPIRAL } from "./net";
import { orbWeb } from "./orb";

const still = () => [0, 0] as const;

describe("spider web threads (spider-webs 4, 6)", () => {
  it("a slack thread pushes nothing apart (tension only)", () => {
    const net = new Net(
      [0, 0, 5, 0],
      [{ a: 0, b: 1, rest: 10, compliance: 0, tear: 1, type: RADIAL }],
      [0],
    );
    net.step(1 / 60, 10, 0, 1, still);
    expect(net.x[1]).toBeCloseTo(5, 9);
  });

  it("a stretched thread pulls back to its rest length", () => {
    const net = new Net(
      [0, 0, 12, 0],
      [{ a: 0, b: 1, rest: 10, compliance: 0, tear: 1, type: RADIAL }],
      [0],
    );
    net.step(1 / 60, 10, 0, 0, still);
    expect(net.x[1]).toBeCloseTo(10, 3);
  });

  it("pins hold", () => {
    const net = new Net(
      [0, 0, 0, 10],
      [{ a: 0, b: 1, rest: 10, compliance: 0, tear: 1, type: RADIAL }],
      [0],
    );
    for (let k = 0; k < 60; k++) net.step(1 / 60, 8, 1000, 0.9, still);
    expect(net.x[0]).toBe(0);
    expect(net.y[0]).toBe(0);
  });

  it("a radial breaks past 27% strain, a spiral thread not until 270%", () => {
    const net = new Net(
      [0, 0, 12, 0, 0, 5, 13, 5],
      [
        { a: 0, b: 1, rest: 10, compliance: 1e9, tear: 0.27, type: RADIAL },
        { a: 2, b: 3, rest: 10, compliance: 1e9, tear: 2.7, type: SPIRAL },
      ],
      [0, 1, 2, 3],
    );
    net.step(1 / 60, 1, 0, 1, still);
    expect(net.alive[0]).toBe(1);
    net.movePin(1, 13.5, 0);
    net.step(1 / 60, 1, 0, 1, still);
    expect(net.alive[0]).toBe(0);
    expect(net.alive[1]).toBe(1);
  });

  it("a flick cuts the threads it crosses", () => {
    const net = new Net(
      [0, 0, 10, 0],
      [{ a: 0, b: 1, rest: 10, compliance: 0, tear: 1, type: RADIAL }],
      [0, 1],
    );
    expect(net.cut(5, -5, 5, 5)).toBe(1);
    expect(net.alive[0]).toBe(0);
  });
});

describe("orb web generator (spider-webs 3.1, 3.3)", () => {
  const web = orbWeb({ x: 0, y: 0, w: 400, h: 400, radials: 24, turns: 18, seed: 3, missing: 0 });

  it("hub at 0.44 of the height from the top (+-5%)", () => {
    const y = web.positions[web.hub * 2 + 1]!;
    expect(y / 400).toBeGreaterThan(0.39);
    expect(y / 400).toBeLessThan(0.49);
  });

  it("about 430 nodes for 24 radials x 18 turns, every anchor pinned on the frame", () => {
    const n = web.positions.length / 2;
    expect(n).toBeGreaterThan(400);
    expect(n).toBeLessThan(560);
    expect(web.pins.length).toBe(24);
    for (const p of web.pins) {
      const x = web.positions[p * 2]!;
      const y = web.positions[p * 2 + 1]!;
      const onEdge = Math.min(Math.abs(x), Math.abs(x - 400), Math.abs(y), Math.abs(y - 400));
      expect(onEdge).toBeLessThan(1e-6);
    }
  });

  it("more radials below the hub than above (6.8 : 10.7)", () => {
    const hy = web.positions[web.hub * 2 + 1]!;
    let up = 0;
    let down = 0;
    for (const p of web.pins) {
      const dy = web.positions[p * 2 + 1]! - hy;
      const dx = web.positions[p * 2]! - web.positions[web.hub * 2]!;
      if (dy < -Math.abs(dx)) up++;
      if (dy > Math.abs(dx)) down++;
    }
    expect(down).toBeGreaterThan(up);
  });

  it("settles without tearing", () => {
    const net = new Net(web.positions, web.edges, web.pins);
    for (let k = 0; k < 120; k++) net.step(1 / 60, 8, 300, 0.8, still);
    expect(net.torn).toBe(0);
  });
});
