import { describe, expect, it } from "vitest";
import { dent, knockSize, pieceTilt } from "./shard-tilt";
import { reflectRay, shardNormal } from "./shard-map";
import { fracture } from "./fracture";

const deg = Math.PI / 180;

describe("how far each piece of a broken pane is tilted", () => {
  it("leaves the pieces in the dent the blow pushed in: degrees, harder blows more", () => {
    expect(dent("laminated", 0.2).slope).toBeLessThan(dent("laminated", 0.9).slope);
    expect(dent("annealed", 0.7).slope / deg).toBeGreaterThan(2);
    expect(dent("annealed", 0.7).slope / deg).toBeLessThan(5);
  });

  it("leans each piece in the dent back toward the strike", () => {
    // A piece to the right of the strike, no knock (r = 0.5).
    const t = pieceTilt("laminated", 0.8, 1, 0, 0.05, 0.5, 0.5);
    const n = shardNormal(t.tiltX, t.tiltY);
    expect(n[0]).toBeLessThan(0); // toward the strike, on its left
    expect(Math.abs(n[1])).toBeLessThan(1e-9);
    // Out past the dent, flat.
    const far = pieceTilt("laminated", 0.8, 1, 0, 0.95, 0.5, 0.5);
    expect(Math.abs(far.tiltY)).toBeLessThan(1e-9);
  });

  it("knocks loose pieces most near the strike, laminated least", () => {
    expect(knockSize("annealed", 0.8, 0.02)).toBeGreaterThan(knockSize("annealed", 0.8, 0.6));
    expect(knockSize("laminated", 0.8, 0.02)).toBeLessThan(knockSize("annealed", 0.8, 0.02));
  });

  it("turns neighbouring pieces' reflections by degrees: different parts of the room", () => {
    const br = fracture({
      w: 600,
      h: 400,
      at: { x: 240, y: 180 },
      energy: 0.8,
      kind: "annealed",
      seed: 3,
    });
    const near = br.shards.filter((s) => s.reach < 0.2 && !s.missing);
    const dirs = near.map((s) => {
      const r = reflectRay([0, 0, -1], shardNormal(s.tiltX, s.tiltY));
      return Math.atan2(Math.hypot(r[0], r[1]), r[2]) / deg;
    });
    // The spread of where they look: several degrees, not tenths.
    expect(Math.max(...dirs) - Math.min(...dirs)).toBeGreaterThan(3);
  });
});
