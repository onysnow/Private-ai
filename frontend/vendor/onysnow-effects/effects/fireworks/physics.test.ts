import { describe, expect, it } from "vitest";
import {
  CHEMISTRY,
  dragK,
  ejectionFor,
  FlashLimiter,
  radiusAt,
  SHELLS,
  stepStar,
  terminalSpeed,
} from "./physics";

describe("fireworks physics (fireworks.md 7 tests)", () => {
  it("the closed-form radius ln(1 + K v0 t)/K matches the ODE within 2% (gravity off)", () => {
    const K = dragK();
    const v0 = 150;
    let x = 0;
    let v = v0;
    const dt = 1e-4;
    for (let t = 0; t < 2; t += dt) {
      v += -K * v * v * dt;
      x += v * dt;
    }
    expect(Math.abs(x - radiusAt(2, v0, K)) / x).toBeLessThan(0.02);
  });

  it("burnt-out stars fall at sqrt(g/K), 18-28 m/s", () => {
    const vt = terminalSpeed();
    expect(vt).toBeGreaterThan(18);
    expect(vt).toBeLessThan(28);
    const s = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let k = 0; k < 2000; k++) stepStar(s, 0.005);
    expect(Math.abs(-s.vy - vt) / vt).toBeLessThan(0.02);
  });

  it("each shell's burst half-width at burn-out is its JPA width within 15%", () => {
    for (const size of [3, 5, 7, 10, 20] as const) {
      const v0 = ejectionFor(size);
      const r = radiusAt(2, v0);
      expect(Math.abs(2 * r - SHELLS[size].width) / SHELLS[size].width).toBeLessThan(0.15);
    }
  });

  it("the colours keep their hue order: sodium r>g>b, barium green, copper blue", () => {
    const [nr, ng, nb] = CHEMISTRY.sodium;
    expect(nr > ng && ng > nb).toBe(true);
    expect(CHEMISTRY.barium[1]).toBe(Math.max(...CHEMISTRY.barium));
    expect(CHEMISTRY.copper[2]).toBe(Math.max(...CHEMISTRY.copper));
  });

  it("the page light never flashes more than 3 times a second", () => {
    const f = new FlashLimiter();
    let lit = 0;
    for (let t = 0; t < 1000; t += 50) if (f.allow(t)) lit++;
    expect(lit).toBe(3);
  });
});
