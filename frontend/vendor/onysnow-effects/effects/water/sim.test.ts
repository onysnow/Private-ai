import { describe, expect, it } from "vitest";
import { BLOOD, WATER } from "./liquids";
import {
  capOf,
  DropSim,
  MAX_PARTS,
  restAngle,
  retention,
  slideSpeed,
  slideThreshold,
  V_MIN,
  weight,
} from "./sim";

// The build plan's tests, docs/research/water-drops.md 7.5 step 1.

const quiet = (o: Partial<ConstructorParameters<typeof DropSim>[0]> = {}) =>
  new DropSim({ width: 200, height: 400, pinning: 0, trails: false, seed: 3, ...o });

describe("drop physics (water-drops 2)", () => {
  it("a spherical cap: V = pi a^3 t (3 + t^2) / 6", () => {
    const { a, h } = capOf(8.7, 50);
    const t = Math.tan((25 * Math.PI) / 180);
    expect((Math.PI * a ** 3 * t * (3 + t * t)) / 6).toBeCloseTo(8.7, 9);
    expect(h).toBeCloseTo(a * t, 12);
  });

  it("water at 60 / 40 starts to slide at about 8.7 uL, contact radius 2.2 mm (the 2.3 table)", () => {
    const v = slideThreshold(WATER);
    expect(v).toBeGreaterThan(8.5);
    expect(v).toBeLessThan(8.9);
    expect(capOf(v, restAngle(WATER)).a).toBeCloseTo(2.2, 1);
  });

  it("the friction law: a 20% excess at w = 4.5 mm runs about 4 cm/s (2.4, computed)", () => {
    // The drop whose contact width is 4.5 mm, then 20% more weight than its hold.
    const a = 2.25;
    const t = Math.tan((restAngle(WATER) * Math.PI) / 360);
    const v = (Math.PI * a ** 3 * t * (3 + t * t)) / 6;
    const u = slideSpeed(
      v,
      WATER,
      retention(a, WATER) > 0 ? weight(v, WATER) / 1.2 / retention(a, WATER) : 1,
    );
    expect(u).toBeGreaterThan(30);
    expect(u).toBeLessThan(50);
  });
});

describe("DropSim (water-drops 7.5 step 1)", () => {
  it("slide threshold: just under it stays put for 10 s; 1.2x over it slides", () => {
    const vc = slideThreshold(WATER);
    const sim = quiet();
    sim.add(50, 50, vc * 0.95);
    sim.add(150, 50, vc * 1.2);
    // Evaporation would shrink the big one under the threshold too: take it off for this.
    for (let k = 0; k < 600; k++) sim.step(1 / 60);
    const ys = [...sim.y.slice(0, sim.count)];
    const xs = [...sim.x.slice(0, sim.count)];
    const still = ys[xs.findIndex((x) => x < 100)]!;
    const ran = ys[xs.findIndex((x) => x > 100)];
    expect(still).toBeCloseTo(50, 6);
    // Ran down (or off the bottom and gone).
    expect(ran === undefined || ran > 100).toBe(true);
  });

  it("terminal speed within 5% of U = (rho g V - F0) / (beta w eta)", () => {
    const sim = quiet({ height: 5000 });
    const v = slideThreshold(WATER) * 2;
    sim.add(100, 10, v);
    for (let k = 0; k < 60; k++) sim.step(1 / 60);
    const u = slideSpeed(sim.vol[0]!, WATER);
    expect(sim.vy[0]!).toBeGreaterThan(u * 0.95);
    expect(sim.vy[0]!).toBeLessThan(u * 1.05);
  });

  it("a merge alone keeps volume and momentum exactly", () => {
    const sim = quiet();
    sim.add(100, 100, 3);
    sim.add(101, 100, 2);
    sim.vy[0] = 10;
    sim.vy[1] = -4;
    sim.vx[1] = 6;
    (sim as unknown as { mergeAll: () => boolean }).mergeAll();
    expect(sim.count).toBe(1);
    expect(sim.vol[0]).toBe(5);
    expect(Math.abs(sim.vy[0]! * 5 - (30 - 8))).toBeLessThan(1e-9);
    expect(Math.abs(sim.vx[0]! * 5 - 12)).toBeLessThan(1e-9);
    expect(sim.x[0]).toBeCloseTo((100 * 3 + 101 * 2) / 5, 12);
  });

  it("trail drops conserve volume (with the water left in the track)", () => {
    const sim = quiet({ trails: true, height: 3000, evaporate: false });
    // Every runner sheds a dotted trail here.
    sim.lineShare = 0;
    sim.dottedShare = 1;
    const v0 = slideThreshold(WATER) * 3;
    sim.add(100, 10, v0);
    for (let k = 0; k < 300; k++) {
      sim.step(1 / 60);
      expect(Math.abs(sim.totalVolume() + sim.filmVolume - v0)).toBeLessThan(1e-9);
    }
    expect(sim.count).toBeGreaterThan(1);
  });

  it("does not depend on the frame rate: 8.3 ms and 33 ms steps slide within 5%", () => {
    const run = (dt: number) => {
      const sim = new DropSim({ width: 200, height: 5000, seed: 9, pinning: 0.35, trails: true });
      sim.add(100, 10, slideThreshold(WATER) * 2.5);
      for (let t = 0; t < 4 - 1e-9; t += dt) sim.step(dt);
      // The drop that started it: the largest.
      let best = 0;
      for (let i = 1; i < sim.count; i++) if (sim.vol[i]! > sim.vol[best]!) best = i;
      return sim.y[best]! - 10;
    };
    const fast = run(1 / 120);
    const slow = run(1 / 30);
    expect(fast).toBeGreaterThan(20);
    expect(Math.abs(fast - slow) / fast).toBeLessThan(0.05);
  });

  it(
    "the grid never misses a pair: no unrelated overlapping drops after any of 1000 steps",
    { timeout: 120000 },
    () => {
      const sim = new DropSim({ width: 300, height: 300, seed: 5, pinning: 0.35, trails: true });
      let rng = 12345;
      const rand = () => (rng = (Math.imul(rng, 1103515245) + 12345) >>> 0) / 4294967296;
      for (let k = 0; k < 1000; k++) {
        for (let s = 0; s < 3; s++) sim.add(rand() * 300, rand() * 300, 0.2 + rand() * rand() * 30);
        sim.step(1 / 60);
        const r = Array.from({ length: sim.count }, (_, i) => sim.radius(i));
        for (let i = 0; i < sim.count; i++) {
          for (let j = i + 1; j < sim.count; j++) {
            const pi = sim.parent[i]!;
            const pj = sim.parent[j]!;
            if (pi === sim.serial[j] || pj === sim.serial[i] || (pi >= 0 && pi === pj)) continue;
            const d = Math.hypot(sim.x[i]! - sim.x[j]!, sim.y[i]! - sim.y[j]!);
            if (d < r[i]! + r[j]! - 1e-9) expect(d).toBeGreaterThanOrEqual(r[i]! + r[j]! - 1e-9);
          }
        }
      }
    },
  );

  it("evaporation removes drops at V_MIN and nothing goes NaN", () => {
    // A small pane: each step dries every film, lane and mist cell, so forty simulated minutes
    // on the full 200 x 400 pane cost seconds of CPU and ran past the time limit when the whole
    // suite shared the machine. The drops and the law are the same; only the empty glass is less.
    const sim = quiet({ width: 120, height: 120 });
    sim.add(100, 100, V_MIN * 1.5);
    sim.add(50, 50, 0.5);
    // Forty minutes: in rain the air is near saturated, so a 0.5 uL drop lasts most of half an hour.
    sim.fastForward(60 * 40);
    for (let i = 0; i < sim.count; i++) {
      expect(Number.isFinite(sim.x[i]!)).toBe(true);
      expect(Number.isFinite(sim.vol[i]!)).toBe(true);
      expect(sim.vol[i]!).toBeGreaterThanOrEqual(V_MIN);
    }
    expect(sim.count).toBe(0);
  }, 30000);

  it("idle: step returns false once nothing moves", () => {
    const sim = quiet();
    sim.add(100, 100, 1);
    sim.add(140, 100, 2);
    expect(sim.step(1 / 60)).toBe(false);
  });

  it("viscosity: blood runs 3-5x slower than water for the same excess weight", () => {
    // Same excess: each at 2x its own threshold, compared through the law's eta.
    const uw = slideSpeed(slideThreshold(WATER) * 2, WATER);
    const ub = slideSpeed(slideThreshold(BLOOD) * 2, BLOOD);
    const vw = slideThreshold(WATER) * 2;
    const vb = slideThreshold(BLOOD) * 2;
    // Per unit excess weight per unit contact width: the ratio is eta_blood / eta_water.
    const per = (u: number, v: number, l: typeof WATER) =>
      u / ((weight(v, l) - retention(capOf(v, restAngle(l)).a, l)) / capOf(v, restAngle(l)).a);
    const ratio = per(uw, vw, WATER) / per(ub, vb, BLOOD);
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(5);
  });

  it("spray: volume sprayed = volume in drops + volume in mist, exactly; mist condenses at 0.5 uL a cell", () => {
    const sim = quiet({ evaporate: false });
    let sprayed = 0;
    for (let k = 0; k < 400; k++) {
      const v = 0.003 + (k % 7) * 0.002;
      sim.deposit(50 + (k % 3) * 0.3, 60 + (k % 5) * 0.3, v);
      sprayed += v;
    }
    expect(Math.abs(sim.totalVolume() + sim.mistVolume() - sprayed)).toBeLessThan(1e-6);
    expect(sim.count).toBeGreaterThan(0);
  });

  it("keeps two resting drops that merge as two lobes, where each was, drawing partway together and then holding (Ony: shapes that aren't circles; a merge drains, not vanishes)", () => {
    const sim = new DropSim({ width: 60, height: 60, seed: 4, pinning: 0, evaporate: false });
    const v = 2;
    const a = sim.radius(sim.add(30, 30, v));
    sim.add(30 + a * 1.9, 30, v);
    sim.step(1 / 120);
    expect(sim.count).toBe(1);
    const parts = sim.parts(0);
    expect(parts.length).toBe(2);
    expect(Math.abs(parts[0]![0] - parts[1]![0])).toBeCloseTo(a * 1.9, 3);
    expect(parts[0]![2] + parts[1]![2]).toBeCloseTo(2 * v, 9);
    const gap = Math.abs(parts[0]![0] - parts[1]![0]);
    sim.step(0.5);
    const later = sim.parts(0);
    const gap2 = Math.abs(later[0]![0] - later[1]![0]);
    // The neck joins them at once; then they draw a third of the way together (coalescence), and the pinned lobes hold.
    expect(gap2).toBeLessThan(gap * 0.8);
    expect(gap2).toBeGreaterThan(gap * 0.5);
    sim.step(1);
    const gap3 = Math.abs(sim.parts(0)[0]![0] - sim.parts(0)[1]![0]);
    expect(gap3).toBeGreaterThan(gap2 * 0.97);
  });

  it("never keeps more than MAX_PARTS lobes, and a runner pulls round", () => {
    const sim = new DropSim({ width: 80, height: 80, seed: 5, pinning: 0, evaporate: false });
    const v = 0.6;
    const a = sim.radius(sim.add(40, 40, v));
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      sim.add(40 + Math.cos(ang) * a * 1.9, 40 + Math.sin(ang) * a * 1.9, v);
    }
    sim.step(1 / 120);
    expect(sim.count).toBe(1);
    expect(sim.parts(0).length).toBeLessThanOrEqual(MAX_PARTS);
    expect(sim.parts(0).length).toBeGreaterThan(2);
    const total = sim.parts(0).reduce((q, p) => q + p[2], 0);
    expect(total).toBeCloseTo(9 * v, 9);
  });

  it("leaves a dotted trail of small beads behind a runner, and the runner does not run straight", () => {
    const sim = new DropSim({ width: 60, height: 200, seed: 9, pinning: 0.35, evaporate: false });
    sim.add(30, 10, 40);
    const xs: number[] = [];
    for (let k = 0; k < 600 && sim.count > 0; k++) {
      sim.step(1 / 60);
      let big = 0;
      for (let i = 1; i < sim.count; i++) if (sim.vol[i]! > sim.vol[big]!) big = i;
      xs.push(sim.x[big]!);
    }
    expect(sim.count).toBeGreaterThan(8);
    for (let i = 0; i < sim.count; i++) {
      if (sim.vol[i]! > 10) continue;
      expect(sim.vol[i]!).toBeLessThan(40 * 0.3 ** 3);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
  });

  it("the drop you steer holds still when not pressed, and turns as an arc", () => {
    const sim = quiet({ evaporate: false, width: 600, height: 600 });
    const j = sim.add(300, 300, 20);
    sim.player = sim.serial[j]!;
    sim.playerSpeed = 0.05;
    // Not pressed: it does not fall.
    for (let k = 0; k < 120; k++) sim.step(1 / 60);
    expect(sim.y[j]).toBeCloseTo(300, 3);
    // Pressed right, then down: its velocity swings round, never to zero between.
    sim.playerPush = [1.9, 0];
    for (let k = 0; k < 90; k++) sim.step(1 / 60);
    const vx0 = sim.vx[j]!;
    expect(vx0).toBeGreaterThan(0);
    sim.playerPush = [0, 1.9];
    let low = Infinity;
    for (let k = 0; k < 90; k++) {
      sim.step(1 / 60);
      low = Math.min(low, Math.hypot(sim.vx[j]!, sim.vy[j]!));
    }
    expect(low).toBeGreaterThan(0.5 * Math.hypot(vx0, 0));
    expect(sim.vy[j]).toBeGreaterThan(0);
  });

  it("a bead shed from a stream starts as a line of its water along the stream and draws round", () => {
    const sim = new DropSim({ width: 60, height: 200, seed: 9, pinning: 0.35, evaporate: false });
    sim.add(30, 10, 40);
    let lobed = 0;
    for (let k = 0; k < 600 && sim.count > 0; k++) {
      sim.step(1 / 60);
      for (let i = 0; i < sim.count; i++) if (sim.parent[i]! >= 0 && sim.partN[i]! > 1) lobed++;
    }
    expect(lobed).toBeGreaterThan(0);
  });
});
