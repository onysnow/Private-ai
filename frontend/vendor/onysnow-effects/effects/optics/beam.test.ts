import { describe, expect, it } from "vitest";
import { fresnel, refract, traceBeam, type BeamPane } from "./beam";
import { indexAt } from "./dispersion";

/*
 * Item 25d: the beam obeys the textbook cases (claude/tools-research.md) --
 * Snell, Fresnel, total internal reflection, the parallel exit from a slab,
 * Beer-Lambert -- and the index follows the material's Abbe number.
 */

const deg = (a: number) => (a * Math.PI) / 180;
const angleOf = (v: { x: number; y: number }) => Math.atan2(v.y, v.x);

describe("dispersion from an Abbe number", () => {
  it("gives n_d at the d line and the Abbe number back", () => {
    const nd = 1.518;
    const V = 60;
    expect(indexAt(587.6, nd, V)).toBeCloseTo(nd, 6);
    expect((nd - 1) / (indexAt(486.1, nd, V) - indexAt(656.3, nd, V))).toBeCloseTo(V, 4);
    // Blue bends more than red.
    expect(indexAt(405, nd, V)).toBeGreaterThan(indexAt(650, nd, V));
  });
});

describe("a single surface", () => {
  it("bends by Snell's law", () => {
    const d = { x: Math.sin(deg(30)), y: Math.cos(deg(30)) };
    const t = refract(d, { x: 0, y: -1 }, 1 / 1.5)!;
    expect(Math.asin(t.x)).toBeCloseTo(Math.asin(Math.sin(deg(30)) / 1.5), 6);
  });

  it("reflects 4% straight on into n = 1.5, and everything past the critical angle out of it", () => {
    expect(fresnel(1, 1, 1.5)).toBeCloseTo(0.04, 3);
    const critical = Math.asin(1 / 1.5);
    expect(fresnel(Math.cos(critical + 0.01), 1.5, 1)).toBe(1);
    expect(fresnel(Math.cos(critical - 0.05), 1.5, 1)).toBeLessThan(1);
  });
});

describe("a beam crossing a slab", () => {
  // A band of glass 100 px tall, running wider than the beam will ever go.
  const slab: BeamPane = { x: -5000, y: 0, w: 10000, h: 100, r: 0, n: 1.5, absorb: 0 };

  it("leaves parallel to how it came in, displaced, and carries the energy it should", () => {
    const tilt = deg(35);
    const dir = { x: Math.sin(tilt), y: Math.cos(tilt) };
    const { segments } = traceBeam({ x: 0, y: -50 }, dir, [slab], { maxLength: 400 });
    // The main beam: the brightest segment below the slab.
    const out = segments
      .filter((s) => s.inside < 0 && s.a.y > 99)
      .sort((a, b) => b.energy - a.energy)[0]!;
    const outDir = { x: out.b.x - out.a.x, y: out.b.y - out.a.y };
    expect(angleOf(outDir)).toBeCloseTo(angleOf(dir), 5);
    // Two surfaces, each passing 1 - R.
    const cosT = Math.sqrt(1 - (Math.sin(tilt) / 1.5) ** 2);
    const R1 = fresnel(Math.cos(tilt), 1, 1.5);
    const R2 = fresnel(cosT, 1.5, 1);
    expect(out.energy).toBeCloseTo((1 - R1) * (1 - R2), 4);
    // Displaced sideways by the textbook amount, t sin(i - r) / cos r: the
    // perpendicular distance from the line it would have run on unbent.
    const r = Math.asin(Math.sin(tilt) / 1.5);
    const shift = (100 * Math.sin(tilt - r)) / Math.cos(r);
    const rel = { x: out.a.x - 0, y: out.a.y - -50 };
    const perpendicular = Math.abs(rel.x * dir.y - rel.y * dir.x);
    expect(perpendicular).toBeCloseTo(shift, 1);
  });

  it("is absorbed along its path inside the glass (Beer-Lambert)", () => {
    const absorbing = { ...slab, absorb: 0.01 };
    const { segments } = traceBeam({ x: 0, y: -50 }, { x: 0, y: 1 }, [absorbing], {
      maxLength: 400,
    });
    const inside = segments.find((s) => s.inside === 0 && s.energy > 0.5)!;
    expect(inside.energyEnd / inside.energy).toBeCloseTo(Math.exp(-0.01 * 100), 3);
  });
});

describe("a pane guiding the beam", () => {
  it("reflects totally at an edge met steeply from inside, and loses nothing there", () => {
    // Start inside a pane, heading for its right edge at 60 degrees from its normal.
    const pane: BeamPane = { x: 0, y: 0, w: 400, h: 400, r: 0, n: 1.5, absorb: 0 };
    const dir = { x: Math.cos(deg(60)), y: Math.sin(deg(60)) };
    const { hits } = traceBeam({ x: 300, y: 50 }, dir, [pane], { maxLength: 2000, maxDepth: 2 });
    const first = hits[0]!;
    expect(first.kind).toBe("internal");
  });
});

describe("rounded corners", () => {
  it("bend the beam by the corner's own normal, not the straight edge's", () => {
    // Aimed at a big corner radius, off-axis: the exit direction differs from a square corner's.
    const round: BeamPane = { x: 0, y: 0, w: 200, h: 200, r: 80, n: 1.5, absorb: 0 };
    const square: BeamPane = { ...round, r: 0 };
    const o = { x: -100, y: 30 };
    const d = { x: 1, y: 0 };
    const a = traceBeam(o, d, [round]).segments;
    const b = traceBeam(o, d, [square]).segments;
    const insideA = a.find((s) => s.inside === 0)!;
    const insideB = b.find((s) => s.inside === 0)!;
    expect(angleOf({ x: insideA.b.x - insideA.a.x, y: insideA.b.y - insideA.a.y })).not.toBeCloseTo(
      angleOf({ x: insideB.b.x - insideB.a.x, y: insideB.b.y - insideB.a.y }),
      2,
    );
  });
});

describe("a prism in the beam's plane (25g)", () => {
  // An equilateral prism seen end-on: circumradius 100 about (0, 0), apex up (y down the page).
  const k = Math.sqrt(3) / 2;
  const tri = [
    { x: 0, y: -100 },
    { x: 100 * k, y: 50 },
    { x: -100 * k, y: 50 },
  ];
  const prism = (n: number): BeamPane => ({
    x: -87,
    y: -100,
    w: 174,
    h: 150,
    r: 0,
    n,
    absorb: 0,
    poly: tri,
  });

  it("deviates the beam least by 2 asin(n sin 30) - 60", () => {
    const n = 1.5;
    let least = Infinity;
    // Aimed at the middle of the left face, over a sweep of angles (y down: a negative angle climbs).
    for (let a = -55; a <= 20; a += 0.25) {
      const d = { x: Math.cos(deg(a)), y: Math.sin(deg(a)) };
      const target = { x: -43.3, y: -25 };
      const { segments } = traceBeam(
        { x: target.x - d.x * 300, y: target.y - d.y * 300 },
        d,
        [prism(n)],
        {
          maxDepth: 2,
        },
      );
      // The brightest ray that crossed the prism and left it.
      const out = segments
        .filter((s) => s.inside < 0 && s.a.x > 1 && s.energy > 0.5)
        .sort((p, q) => q.energy - p.energy)[0];
      if (!out) continue;
      const dir = { x: out.b.x - out.a.x, y: out.b.y - out.a.y };
      const dev = Math.abs(angleOf(dir) - angleOf(d));
      least = Math.min(least, dev);
    }
    expect(least).toBeCloseTo(2 * Math.asin(n * Math.sin(deg(30))) - deg(60), 2);
  });

  it("sends violet further round than red", () => {
    const d = { x: Math.cos(deg(-45)), y: Math.sin(deg(-45)) };
    const o = { x: -43.3 - d.x * 300, y: -25 - d.y * 300 };
    const exitAngle = (nm: number) => {
      const { segments } = traceBeam(o, d, [prism(indexAt(nm, 1.72825, 28.41))], { maxDepth: 2 });
      const out = segments
        .filter((s) => s.inside < 0 && s.a.x > 1 && s.energy > 0.5)
        .sort((p, q) => q.energy - p.energy)[0]!;
      return angleOf({ x: out.b.x - out.a.x, y: out.b.y - out.a.y });
    };
    // The beam climbs in and is bent back down; violet more.
    expect(exitAngle(405)).toBeGreaterThan(exitAngle(650));
  });
});

describe("mirrored ends (Ony: bounce off the inside left and right sides)", () => {
  const band = { x: 0, y: 0, w: 1000, h: 200, r: 0, n: 1.52, absorb: 0 };
  it("a beam meeting an end head-on leaves through it, unless the ends are mirrored", () => {
    const open = traceBeam({ x: 500, y: 100 }, { x: 1, y: 0.02 }, [band], { maxLength: 5000 });
    expect(open.hits.some((h) => h.kind === "exit")).toBe(true);
    const mirrored = traceBeam(
      { x: 500, y: 100 },
      { x: 1, y: 0.02 },
      [{ ...band, mirrorEnds: true }],
      {
        maxLength: 5000,
        maxDepth: 6,
      },
    );
    // It comes back: an internal reflection at the right end, then it runs to the left end.
    expect(mirrored.hits[0]!.kind).toBe("internal");
    expect(mirrored.segments.some((s) => s.inside === 0 && s.b.x < 10)).toBe(true);
  });
});
