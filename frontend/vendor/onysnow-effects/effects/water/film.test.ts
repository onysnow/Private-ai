import { describe, expect, it } from "vitest";
import { FilmSim } from "./film";

/*
 * The water as a fluid (film.ts): nothing here is a rule about drops or
 * streams -- these check that the physics gives what a window shows.
 */
describe("FilmSim (thin-film water)", () => {
  const centroidY = (sim: FilmSim) => {
    let w = 0;
    let ys = 0;
    for (let k = 0; k < sim.h.length; k++) {
      const hh = sim.h[k]! - sim.b;
      if (hh <= 0) continue;
      w += hh;
      ys += hh * Math.floor(k / sim.nx) * sim.dx;
    }
    return ys / w;
  };
  const speed = (vol: number) => {
    const sim = new FilmSim({ width: 12, height: 80, cell: 0.3, seed: 3 });
    sim.addDrop(6, 5, vol);
    sim.step(0.2);
    const y0 = centroidY(sim);
    sim.step(0.3);
    return (centroidY(sim) - y0) / 0.3;
  };

  it("small drops hold on the glass, heavy ones run at window speeds", { timeout: 120000 }, () => {
    expect(Math.abs(speed(3))).toBeLessThan(0.5);
    const big = speed(25);
    expect(big).toBeGreaterThan(20);
    expect(big).toBeLessThan(120);
  });

  it("conserves water until it runs off the bottom", { timeout: 60000 }, () => {
    const sim = new FilmSim({ width: 20, height: 20, cell: 0.3, seed: 1 });
    sim.addDrop(6, 6, 4);
    sim.addDrop(14, 10, 3);
    const v0 = sim.volume();
    sim.step(0.2);
    expect(Math.abs(sim.volume() - v0) / v0).toBeLessThan(0.01);
  });

  it("two drops that touch become one", { timeout: 60000 }, () => {
    const sim = new FilmSim({ width: 20, height: 20, cell: 0.3, seed: 1 });
    sim.addDrop(8, 10, 3);
    sim.addDrop(10.4, 10, 3);
    sim.step(0.3);
    // One connected body of water: label the wet cells.
    const wet = (k: number) => sim.h[k]! > sim.b * 1.5;
    const seen = new Uint8Array(sim.h.length);
    let bodies = 0;
    for (let k = 0; k < sim.h.length; k++) {
      if (!wet(k) || seen[k]) continue;
      bodies++;
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        const i = c % sim.nx;
        for (const n of [c - 1, c + 1, c - sim.nx, c + sim.nx]) {
          if (n < 0 || n >= sim.h.length || seen[n] || !wet(n)) continue;
          if ((n === c - 1 && i === 0) || (n === c + 1 && i === sim.nx - 1)) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    expect(bodies).toBe(1);
  });
});
