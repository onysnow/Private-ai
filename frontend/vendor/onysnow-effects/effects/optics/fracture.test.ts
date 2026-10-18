import { describe, expect, it } from "vitest";
import {
  crushRadius,
  fracture,
  polygonArea,
  type Crack,
  type GlassKind,
  type Pt,
} from "./fracture";

/*
 * Item 10: a pane breaks the way its glass does (claude/tools-research.md
 * §2): annealed into long radial shards with rings near the impact,
 * laminated into a held spider web -- and
 * whatever the pattern, the shards are the whole pane, no more, no less.
 */

const pane = { w: 800, h: 500, at: { x: 300, y: 220 } };
const breakOf = (kind: GlassKind, energy = 0.6) => fracture({ ...pane, energy, kind });
const areaOf = (kind: GlassKind) =>
  breakOf(kind).shards.reduce((a, s) => a + polygonArea(s.poly), 0);

describe("a pane breaking", () => {
  it("cuts the whole pane into shards, nothing missing or doubled", () => {
    for (const kind of ["annealed", "laminated"] as const) {
      expect(areaOf(kind) / (pane.w * pane.h)).toBeCloseTo(1, 2);
    }
  });

  it("annealed: more energy, more radial cracks, so more shards", () => {
    expect(breakOf("annealed", 1).shards.length).toBeGreaterThan(
      breakOf("annealed", 0).shards.length,
    );
  });

  it("laminated is a spider web of many pieces, held nearly in place", () => {
    const lam = breakOf("laminated");
    const ann = breakOf("annealed");
    expect(lam.shards.length).toBeGreaterThan(ann.shards.length);
    const move = (f: typeof lam) =>
      Math.max(...f.shards.map((s) => Math.hypot(s.slip.x, s.slip.y)));
    expect(move(lam)).toBeLessThan(move(ann));
  });

  it("knocks the pieces by the impact about most", () => {
    const f = breakOf("annealed", 1);
    const near = f.shards.filter((s) => s.reach < 0.1);
    const far = f.shards.filter((s) => s.reach > 0.5);
    const tilt = (ss: typeof near) =>
      ss.reduce((a, s) => a + Math.hypot(s.tiltX, s.tiltY), 0) / Math.max(ss.length, 1);
    expect(tilt(near)).toBeGreaterThan(tilt(far));
  });

  it("breaks the same way every time for the same impact", () => {
    expect(JSON.stringify(breakOf("annealed"))).toBe(JSON.stringify(breakOf("annealed")));
  });
});

/*
 * Against real cracks (docs/broken-glass-cracks.md): SWGMAT, Glass Fractures;
 * Bradt 2011; Quinn 2019.
 */
describe("cracks as real glass cracks", () => {
  const segs = (c: Crack) => c.pts.slice(1).map((b, i) => [c.pts[i]!, b] as const);
  const distToCrack = (p: Pt, c: Crack) =>
    Math.min(
      ...segs(c).map(([a, b]) => {
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
        return Math.hypot(a.x + ex * t - p.x, a.y + ey * t - p.y);
      }),
    );

  it("never cross: two cracks meet only where one ends on the other", () => {
    const f = breakOf("annealed", 0.8);
    const all = f.cracks.flatMap(segs);
    const cross = (p: Pt, q: Pt, r: Pt, s: Pt) => {
      const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
      if (Math.abs(d) < 1e-12) return false;
      const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
      const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
      return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
    };
    let crossings = 0;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (cross(all[i]![0], all[i]![1], all[j]![0], all[j]![1])) crossings++;
      }
    }
    expect(crossings).toBe(0);
  });

  it("concentric cracks are short chords that end on radial cracks, not rings", () => {
    const f = breakOf("annealed", 0.8);
    const rings = f.cracks.filter((c) => c.kind === "ring");
    const radial = f.cracks.filter((c) => c.kind === "radial" || c.kind === "branch");
    expect(rings.length).toBeGreaterThan(10);
    let ended = 0;
    for (const r of rings) {
      const a = r.pts[0]!;
      const b = r.pts[r.pts.length - 1]!;
      const onRadial = (p: Pt) => radial.some((c) => distToCrack(p, c) < 1e-3);
      if (onRadial(a) && onRadial(b)) ended++;
      // Spanning one gap between radials: a small angle round the impact.
      const span = Math.abs(
        Math.atan2(
          (a.x - f.impact.x) * (b.y - f.impact.y) - (a.y - f.impact.y) * (b.x - f.impact.x),
          (a.x - f.impact.x) * (b.x - f.impact.x) + (a.y - f.impact.y) * (b.y - f.impact.y),
        ),
      );
      expect(span).toBeLessThan(1.25);
    }
    // Nearly all end on a radial at both ends (the rest on the crushed spot or a chord).
    expect(ended / rings.length).toBeGreaterThan(0.8);
  });

  it("more energy, more radial cracks, and more forks", () => {
    const count = (e: number, k: string) =>
      breakOf("annealed", e).cracks.filter((c) => c.kind === k).length;
    expect(count(1, "radial")).toBeGreaterThan(count(0.2, "radial") * 2);
    expect(count(1, "branch")).toBeGreaterThan(count(0.2, "branch"));
  });

  it("forks at 30 to 60 degrees", () => {
    const f = breakOf("annealed", 1);
    const dir = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
    const angles: number[] = [];
    for (const br of f.cracks.filter((c) => c.kind === "branch")) {
      if (br.pts.length < 3) continue;
      const p0 = br.pts[0]!;
      const parent = f.cracks.find(
        (c) => c !== br && c.kind !== "ring" && c.pts.some((q) => q.x === p0.x && q.y === p0.y),
      );
      if (!parent) continue;
      const i = parent.pts.findIndex((q) => q.x === p0.x && q.y === p0.y);
      if (i < 1 || i + 1 >= parent.pts.length) continue;
      const a = dir(p0, br.pts[1]!);
      const b = dir(p0, parent.pts[i + 1]!);
      angles.push(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * (180 / Math.PI));
    }
    expect(angles.length).toBeGreaterThan(10);
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    expect(mean).toBeGreaterThan(28);
    expect(mean).toBeLessThan(62);
  });

  it("the radials meet the frame nearly square", () => {
    const f = breakOf("annealed", 0.6);
    const offs: number[] = [];
    for (const c of f.cracks.filter((k) => k.kind === "radial" || k.kind === "branch")) {
      const b = c.pts[c.pts.length - 1]!;
      const a = c.pts[Math.max(0, c.pts.length - 4)]!;
      const onX = b.x < 1e-6 || b.x > pane.w - 1e-6;
      const onY = b.y < 1e-6 || b.y > pane.h - 1e-6;
      if (!onX && !onY) continue;
      const d = Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * (180 / Math.PI);
      offs.push(onX ? d : 90 - d);
    }
    expect(offs.length).toBeGreaterThan(5);
    expect(offs.reduce((a, b) => a + b, 0) / offs.length).toBeLessThan(30);
  });

  it("is crushed at the impact, and a full swing knocks pieces out; laminated holds them", () => {
    const hard = breakOf("annealed", 1);
    expect(hard.crush).toBe(crushRadius(1));
    expect(hard.shards.some((s) => s.crushed)).toBe(true);
    expect(hard.shards.some((s) => s.missing)).toBe(true);
    expect(breakOf("annealed", 0.4).shards.some((s) => s.missing)).toBe(false);
    expect(breakOf("laminated", 1).shards.some((s) => s.missing)).toBe(false);
  });

  it("tiles the pane however it is struck, even by the frame", () => {
    for (const at of [
      { x: 3, y: 3 },
      { x: 797, y: 250 },
      { x: 400, y: 499 },
    ]) {
      for (const energy of [0, 0.5, 1]) {
        const f = fracture({ ...pane, at, energy, kind: "annealed", seed: 7 });
        const area = f.shards.reduce((a, s) => a + polygonArea(s.poly), 0);
        expect(area / (pane.w * pane.h)).toBeCloseTo(1, 3);
      }
    }
  });
});
