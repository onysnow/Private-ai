import { describe, expect, it } from "vitest";
import { balloonPhysics, drag, terminalSpeed } from "./air";

// balloons.md 3.1 and 6 "Tests" 1-2.
const step = (p: ReturnType<typeof balloonPhysics>, seconds: number) => {
  let v = 0;
  const m = p.mass + p.addedMass;
  const dt = 1 / 240;
  const trace: number[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const [, fy] = drag(0, v, 0, 0, p.area);
    v += ((p.netLift + fy) / m) * dt;
    trace.push(v);
  }
  return trace;
};

describe("balloon air model (balloons.md 3)", () => {
  it("an 11-inch helium balloon has about 9 g of free lift", () => {
    const p = balloonPhysics(0.279, "helium");
    expect(p.netLift / 9.81).toBeGreaterThan(0.0085);
    expect(p.netLift / 9.81).toBeLessThan(0.0095);
  });

  it("released at rest it reaches 95% of v_t = sqrt(2F/(rho Cd A)) within about 0.9 s", () => {
    const p = balloonPhysics(0.279, "helium");
    const vt = terminalSpeed(p.netLift, p.area);
    expect(vt).toBeGreaterThan(2.0);
    expect(vt).toBeLessThan(2.4);
    const trace = step(p, 3);
    const at = trace.findIndex((v) => v >= 0.95 * vt) / 240;
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(1.0);
    expect(trace[trace.length - 1]!).toBeCloseTo(vt, 1);
  });

  it("an air-filled one falls at about 1.3 m/s, not at g", () => {
    const p = balloonPhysics(0.279, "air");
    expect(p.netLift).toBeLessThan(0);
    const vt = terminalSpeed(p.netLift, p.area);
    expect(vt).toBeGreaterThan(1.0);
    expect(vt).toBeLessThan(1.6);
  });
});
