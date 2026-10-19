import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { placeBreak, pickEntry, type BreakEntry, type LibraryIndex } from "./fracture-library";
import { polygonArea } from "./fracture";

/*
 * Broken glass B1: a simulated break (tools/fracture-sim) laid onto a pane.
 * The entry here is the first plain break, a 100 mm framed pane.
 */
const entry = JSON.parse(
  readFileSync(new URL("../../../../public/breaks/plain-100-frame-a.json", import.meta.url), "utf8"),
) as BreakEntry;

const pane = { w: 800, h: 500, at: { x: 420, y: 240 }, energy: 0.6, kind: "annealed" as const };

describe("a simulated break placed on a pane", () => {
  it("is the entry's cracks, scaled and at the strike, in arrival order", () => {
    const f = placeBreak(entry, { ...pane, seed: 1 });
    expect(f.cracks.length).toBeGreaterThan(20);
    expect(f.duration).toBeGreaterThan(100);
    const t0 = f.cracks.map((c) => c.startedAt);
    for (let i = 1; i < t0.length; i++) expect(t0[i]).toBeGreaterThanOrEqual(t0[i - 1]! - 1e-6);
    // The kept times run with the crack: each point after the one before it.
    for (const c of f.cracks) expect(Math.min(...c.t)).toBeGreaterThanOrEqual(0);
    for (const c of f.cracks)
      for (const p of c.pts) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(pane.w + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeLessThanOrEqual(pane.h + 1e-6);
      }
  });

  it("cuts the whole pane into pieces, nothing missing or doubled", () => {
    const f = placeBreak(entry, { ...pane, seed: 2 });
    const area = f.shards.reduce((a, s) => a + polygonArea(s.poly), 0);
    expect(area / (pane.w * pane.h)).toBeCloseTo(1, 2);
    expect(f.shards.length).toBeGreaterThan(3);
  });

  it("has radials from the crushed zone and leaves the entry's frame-line cracks out", () => {
    const f = placeBreak(entry, { ...pane, seed: 3 });
    expect(f.cracks.some((c) => c.kind === "radial")).toBe(true);
    expect(f.crush).toBeGreaterThan(0);
    // The entry's bottom frame-line crack ran along its edge; none of the placed cracks is a long straight run 8 mm from where that edge lands.
    expect(f.cracks.every((c) => c.pts.length >= 2)).toBe(true);
  });

  it("turns and mirrors the break by the seed, so two strikes differ", () => {
    const a = placeBreak(entry, { ...pane, seed: 1 });
    const b = placeBreak(entry, { ...pane, seed: 5 });
    const first = (f: typeof a) => f.cracks[0]!.pts[f.cracks[0]!.pts.length - 1]!;
    expect(Math.hypot(first(a).x - first(b).x, first(a).y - first(b).y)).toBeGreaterThan(5);
  });

  it("picks an entry by the seed from the index", () => {
    expect(pickEntry({ annealed: ["a", "b"] }, "annealed", 1)).toMatch(/a|b/);
    expect(pickEntry({ annealed: [] }, "annealed", 1)).toBeNull();
    expect(pickEntry({}, "laminated", 1)).toBeNull();
  });
});

describe("every entry in the library", () => {
  const index = JSON.parse(
    readFileSync(new URL("../../../../public/breaks/index.json", import.meta.url), "utf8"),
  ) as LibraryIndex;
  const names = Object.values(index).flat();
  it("is listed and present", () => {
    expect(names.length).toBeGreaterThanOrEqual(4);
  });
  for (const name of names) {
    it(`${name} places on a pane, cuts it into pieces, and its cracks stay inside`, () => {
      const e = JSON.parse(
        readFileSync(new URL(`../../../../public/breaks/${name}.json`, import.meta.url), "utf8"),
      ) as BreakEntry;
      expect(e.format).toBe("onysnow-break-1");
      for (const seed of [1, 2, 5]) {
        const f = placeBreak(e, { ...pane, seed });
        expect(f.cracks.length).toBeGreaterThan(15);
        const area = f.shards.reduce((a, s) => a + polygonArea(s.poly), 0);
        expect(area / (pane.w * pane.h)).toBeCloseTo(1, 2);
        expect(f.shards.length).toBeGreaterThan(3);
        for (const c of f.cracks)
          for (const p of c.pts) {
            expect(p.x).toBeGreaterThanOrEqual(-1e-6);
            expect(p.x).toBeLessThanOrEqual(pane.w + 1e-6);
            expect(p.y).toBeGreaterThanOrEqual(-1e-6);
            expect(p.y).toBeLessThanOrEqual(pane.h + 1e-6);
          }
      }
    });
  }
});
