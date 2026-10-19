import { describe, expect, it } from "vitest";
import { rainVolume } from "./rain";
import { DropSim, LANE_SEEN, streamShiftMm, streamWidth, TRAIL_TAPER } from "./sim";

/*
 * A stream is a lane the sim owns (docs/research-streams.md 5.1): no drop
 * sits in it. Ony, 2026-10-09: "the streams are going right on top of the
 * other rain drops and don't absorb them organically". Right after load 123
 * of 1,013 drops sat inside drawn tracks before the lane grid.
 */
describe("stream lanes", () => {
  const rain = (sim: DropSim, seconds: number, random: () => number) => {
    const areaCm2 = (sim.width * sim.height) / 100;
    for (let s = 0; s < seconds * 30; s++) {
      const expected = (0.3 * areaCm2) / 30;
      let n = Math.floor(expected);
      if (random() < expected - n) n++;
      for (let q = 0; q < n; q++) {
        sim.addVolume(
          random() * sim.width,
          random() * sim.height,
          rainVolume(random(), random(), 1.2),
          0,
        );
      }
      sim.fastForward(1 / 30);
    }
  };
  const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  it("no resting drop touches another runner's lane", { timeout: 60000 }, () => {
    const sim = new DropSim({ width: 200, height: 120, seed: 11, maxDrops: 3000 });
    sim.lineShare = 0.5;
    sim.dottedShare = 0.3;
    rain(sim, 90, lcg(3));
    let lanes = 0;
    for (const v of sim.rivulet) if (v > LANE_SEEN) lanes++;
    expect(lanes).toBeGreaterThan(50);
    let resting = 0;
    let inLane = 0;
    for (let i = 0; i < sim.count; i++) {
      // Resting, and never ran: a runner in a lane is the stream's own pulse, a stalled head sits at the foot of its own line.
      if (sim.radius(i) < 0.3 || Math.hypot(sim.vx[i]!, sim.vy[i]!) > 0 || sim.ran[i]! > 0.5)
        continue;
      resting++;
      if (sim.touchesLane(sim.x[i]!, sim.y[i]!, sim.radius(i), sim.serial[i]!, sim.parent[i]!))
        inLane++;
    }
    expect(resting).toBeGreaterThan(100);
    // The drain runs four times a second: at most the splash droplets of the last quarter second, caught between checks.
    // (and the specks a splash throws, which land round a drop, some in a lane, since 2026-10-10)
    expect(inLane).toBeLessThanOrEqual(16);
  });

  it("a line runner's lane is the stream as the renderer draws it", () => {
    const sim = new DropSim({ width: 120, height: 200, seed: 5, maxDrops: 100 });
    sim.lineShare = 1;
    sim.dottedShare = 0;
    const i = sim.add(60, 10, 30, 0);
    const id = sim.serial[i]!;
    const path: [number, number, number][] = [];
    for (let t = 0; t < 2; t += 1 / 60) {
      sim.fastForward(1 / 60);
      const j = [...Array(sim.count).keys()].find((q) => sim.serial[q] === id);
      if (j === undefined) break;
      path.push([sim.x[j]!, sim.y[j]!, sim.ran[j]!]);
    }
    expect(path.length).toBeGreaterThan(15);
    // Every drawn point of the track (centre shifted as drawn, at its drawn half-width) lies on a lane cell.
    let on = 0;
    let off = 0;
    for (const [x, y, run] of path) {
      if (run < 5) continue;
      const a = 1.9; // about the drop's contact radius, mm
      const grown = Math.min(1, run / (TRAIL_TAPER * a));
      const taper = Math.max(0.05, grown * grown * (3 - 2 * grown));
      const rw = a * streamWidth(id, run, y - a * 0.5) * taper;
      const cx = x + streamShiftMm(id, y - a * 0.5, rw);
      for (const f of [-0.8, 0, 0.8]) {
        if (sim.rivuletAt(cx + f * rw, y - a * 0.5) > LANE_SEEN) on++;
        else off++;
      }
    }
    expect(on / (on + off)).toBeGreaterThan(0.95);
  });

  it("rain landing in a lane runs down it instead of sitting on top", () => {
    const sim = new DropSim({ width: 60, height: 100, seed: 2, maxDrops: 100 });
    sim.lineShare = 1;
    sim.dottedShare = 0;
    const i = sim.add(30, 5, 30, 0);
    sim.fastForward(2);
    expect(sim.ran[0]! > 0 || sim.count >= 1).toBe(true);
    void i;
    // The lane down the middle: a landing on it goes to the film, not a new drop.
    let laneX = -1;
    let laneY = -1;
    for (let j = 0; j < sim.laneRows && laneX < 0; j++)
      for (let k = 0; k < sim.laneCols; k++)
        if (sim.rivulet[j * sim.laneCols + k]! > LANE_SEEN) {
          laneX = k + 0.5;
          laneY = j + 0.5;
          break;
        }
    expect(laneX).toBeGreaterThan(0);
    // A raindrop landing in the lane is a drop that runs down it at once: a second later it has moved on, or joined the stream.
    const j = sim.addVolume(laneX, laneY, 1.2, 0);
    expect(j).toBeGreaterThanOrEqual(0);
    const id = sim.serial[j]!;
    sim.fastForward(1);
    const k = [...Array(sim.count).keys()].find((q) => sim.serial[q] === id);
    if (k !== undefined) expect(sim.y[k]! - laneY).toBeGreaterThan(2);
  });
});
