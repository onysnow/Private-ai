import { describe, expect, it } from "vitest";
import { CrackNet, signedArea } from "./crack-net";

const area = (polys: { x: number; y: number }[][]) =>
  polys.reduce((a, p) => a + Math.abs(signedArea(p)), 0);

describe("the crack network", () => {
  it("an unbroken pane is one piece", () => {
    const net = new CrackNet(200, 100);
    const faces = net.faces();
    expect(faces).toHaveLength(1);
    expect(area(faces)).toBeCloseTo(200 * 100, 6);
  });

  it("a crack right across cuts it in two; one stopping in the glass cuts nothing", () => {
    const net = new CrackNet(200, 100);
    // From the top edge down: start on it, stop where it meets the bottom.
    const top = net.meet({ seg: 0, t: 0, u: 0.4, p: { x: 80, y: 0 } });
    const hit = net.hit(top, { x: 80, y: 150 })!;
    expect(hit.p.y).toBeCloseTo(100, 6);
    net.seg(top, net.meet(hit));
    // A dangling crack from the right edge, ending in open glass.
    const side = net.meet({ seg: 1, t: 0, u: 0.5, p: { x: 200, y: 50 } });
    const tip = net.node({ x: 150, y: 50 });
    net.seg(side, tip);
    const faces = net.faces();
    expect(faces).toHaveLength(2);
    expect(area(faces)).toBeCloseTo(200 * 100, 6);
  });

  it("a crack stops at the first crack in its way", () => {
    const net = new CrackNet(200, 100);
    const a = net.node({ x: 100, y: 10 });
    const b = net.node({ x: 100, y: 90 });
    net.seg(a, b);
    const from = net.node({ x: 20, y: 50 });
    const hit = net.hit(from, { x: 180, y: 50 })!;
    expect(hit.p.x).toBeCloseTo(100, 6);
  });
});
