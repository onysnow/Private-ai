import { describe, expect, it } from "vitest";
import { crackMap, crackRegions, photoBreak, placementFor, place, type Grey } from "./crack-photo";
import { fracture, polygonArea } from "./fracture";

/*
 * A photograph of a break, read back into the break (Ony: "use photos of
 * cracks as a layer"). Tested on a stand-in "photograph": a known break
 * drawn as thin lit lines on uneven, grainy glass -- so what the reader
 * finds can be checked against where the cracks really are.
 */

const W = 480;
const H = 360;
const TRUE_AT = { x: 200, y: 170 };

function grain(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Draw a known break: cracks `lift` brighter (or darker) than smooth, uneven glass with grain. */
function standIn(lift = 0.35, energy = 0.7): { img: Grey; truth: Uint8Array } {
  const f = fracture({ w: W, h: H, at: TRUE_AT, energy, kind: "annealed", seed: 4 });
  const v = new Float32Array(W * H);
  const truth = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Light falling off across the glass, and grain.
      v[y * W + x] = 0.25 + 0.2 * (x / W) + 0.1 * (y / H) + (grain(y * W + x) - 0.5) * 0.03;
    }
  }
  // The crushed spot: pulverised, mostly lit, speckled.
  for (let y = -f.crush; y <= f.crush; y++) {
    for (let x = -f.crush; x <= f.crush; x++) {
      if (Math.hypot(x, y) > f.crush) continue;
      const k = (TRUE_AT.y + y) * W + TRUE_AT.x + x;
      if (grain(k * 7) < 0.6) {
        v[k] = v[k]! + lift;
        truth[k] = 1;
      }
    }
  }
  for (const c of f.cracks) {
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i]!;
      const b = c.pts[i + 1]!;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2) + 1;
      for (let s = 0; s <= n; s++) {
        const px = Math.round(a.x + ((b.x - a.x) * s) / n);
        const py = Math.round(a.y + ((b.y - a.y) * s) / n);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const k = py * W + px;
        if (!truth[k]) v[k] = v[k]! + lift;
        truth[k] = 1;
      }
    }
  }
  return { img: { w: W, h: H, v }, truth };
}

describe("reading the cracks out of a photograph", () => {
  it("finds the cracks, not the grain or the uneven light", () => {
    const { img, truth } = standIn();
    const map = crackMap(img);
    let hit = 0;
    let real = 0;
    let wrong = 0;
    for (let i = 0; i < truth.length; i++) {
      if (truth[i]) real++;
      if (truth[i] && map.mask[i]) hit++;
      if (!truth[i] && map.mask[i]) wrong++;
    }
    expect(hit / real).toBeGreaterThan(0.85);
    expect(wrong / (W * H - real)).toBeLessThan(0.01);
    expect(map.bright).toBe(true);
  });

  it("reads dark cracks on bright glass the same way round", () => {
    const { img, truth } = standIn(-0.35);
    const map = crackMap(img);
    expect(map.bright).toBe(false);
    let hit = 0;
    let real = 0;
    for (let i = 0; i < truth.length; i++) {
      if (truth[i]) real++;
      if (truth[i] && map.mask[i]) hit++;
    }
    expect(hit / real).toBeGreaterThan(0.85);
  });

  it("finds the strike where the cracks are densest", () => {
    const map = crackMap(standIn().img);
    expect(Math.hypot(map.strike.x - TRUE_AT.x, map.strike.y - TRUE_AT.y)).toBeLessThan(6);
  });

  it("cuts it into the pieces the cracks make, with the unbroken glass left out", () => {
    const map = crackMap(standIn(0.35, 0.3).img);
    const regions = crackRegions(map);
    // Every pixel belongs to a piece.
    expect(regions.labels.every((l) => l >= 0)).toBe(true);
    const br = photoBreak(map, regions, { at: map.strike, scale: 1, turn: 0 });
    expect(br.shards.length).toBeGreaterThan(8);
    // The pieces (holes subtracted) plus the unbroken glass are the photograph.
    const pieces = br.shards.reduce(
      (a, s) => a + polygonArea(s.poly) - s.holes.reduce((b, hole) => b + polygonArea(hole), 0),
      0,
    );
    let outside = 0;
    for (const l of regions.labels) if (regions.outside.has(l)) outside++;
    expect((pieces + outside) / (W * H)).toBeCloseTo(1, 1);
  });
});

describe("laying the photographed break on a pane", () => {
  it("puts the photograph's strike on the struck point, turned", () => {
    const pl = { at: { x: 500, y: 200 }, scale: 2, turn: Math.PI / 2 };
    const strike = { x: 10, y: 10 };
    expect(place(strike, strike, pl)).toEqual({ x: 500, y: 200 });
    const p = place({ x: 20, y: 10 }, strike, pl);
    expect(p.x).toBeCloseTo(500, 9);
    expect(p.y).toBeCloseTo(220, 9);
  });

  it("reaches further the harder the blow", () => {
    const map = crackMap(standIn().img);
    const pane = { w: 1200, h: 400, at: { x: 600, y: 200 } };
    const tap = placementFor(map, pane, 0, 0);
    const swing = placementFor(map, pane, 1, 0);
    expect(swing.scale).toBeGreaterThan(tap.scale * 2);
    // A full swing carries the break past the pane's far corner.
    expect(map.extent * swing.scale).toBeCloseTo(Math.hypot(600, 200), 0);
  });
});
