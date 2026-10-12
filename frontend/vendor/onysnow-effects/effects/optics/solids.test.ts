import { describe, expect, it } from "vitest";
import { SOLID_SHAPES, solidDistance, traceSolid, type V3 } from "./solids";
import { indexAt } from "./dispersion";

/*
 * Item 25g: the glass solids obey the textbook cases -- a ball lens's
 * focal length, a prism's minimum deviation, a cube's parallel exit -- and
 * a prism fans blue further than red.
 */

const deg = (a: number) => (a * Math.PI) / 180;
const angle = (a: V3, b: V3) =>
  Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (a.x * b.x + a.y * b.y + a.z * b.z) /
          (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)),
      ),
    ),
  );

describe("the shapes", () => {
  it("are solid round their centre and empty well outside", () => {
    for (const shape of SOLID_SHAPES) {
      expect(solidDistance(shape, { x: 0, y: 0, z: 0 }, 100)).toBeLessThan(0);
      expect(solidDistance(shape, { x: 300, y: 300, z: 300 }, 100)).toBeGreaterThan(0);
    }
  });
});

describe("a sphere (a ball lens)", () => {
  it("brings a near-axis ray to focus at f = nR / 2(n - 1) from its centre", () => {
    const n = 1.5;
    const R = 100;
    const h = 2; // paraxial
    const out = traceSolid("sphere", R, { x: 0, y: h, z: -400 }, { x: 0, y: 0, z: 1 }, n).exit!;
    // Where the leaving ray crosses the axis.
    const t = -out.at.y / out.dir.y;
    const z = out.at.z + out.dir.z * t;
    expect(z).toBeCloseTo((n * R) / (2 * (n - 1)), 0);
  });
});

describe("a prism", () => {
  it("deviates light least by 2 asin(n sin(A/2)) - A", () => {
    const n = 1.5;
    // Rays in the prism's cross-section, into its left face, over a sweep of angles.
    let least = Infinity;
    // (At 60 degrees the ray runs along the left face itself; stop short of that.)
    for (let a = -20; a <= 55; a += 0.25) {
      const dir = { x: Math.cos(deg(a)), y: Math.sin(deg(a)), z: 0 };
      // Aim at the middle of the left face (apex (0, 100), base corner (-86.6, -50)) from well away.
      const target = { x: -43.3, y: 25, z: 0 };
      const o = { x: target.x - dir.x * 400, y: target.y - dir.y * 400, z: 0 };
      const r = traceSolid("prism", 100, o, dir, n, 0, 1);
      // Only light that crosses the prism: in by the left face, out by the right (not a corner).
      if (!r.exit) continue;
      const { x, y } = r.exit.at;
      const onRightFace =
        Math.abs((Math.sqrt(3) / 2) * x + 0.5 * y - 50) < 0.5 && y > -48 && y < 98;
      if (!onRightFace) continue;
      least = Math.min(least, angle(dir, r.exit.dir));
    }
    const expected = 2 * Math.asin(n * Math.sin(deg(30))) - deg(60);
    expect(least).toBeCloseTo(expected, 2);
  });

  it("bends blue further than red (dispersion from the Abbe number)", () => {
    const dir = { x: Math.cos(deg(15)), y: Math.sin(deg(15)), z: 0 };
    const o = { x: -43.3 - dir.x * 400, y: 25 - dir.y * 400, z: 0 };
    const bend = (nm: number) =>
      angle(dir, traceSolid("prism", 100, o, dir, indexAt(nm, 1.518, 60), 0, 1).exit!.dir);
    expect(bend(450)).toBeGreaterThan(bend(650));
  });
});

describe("a cube", () => {
  it("lets a ray out parallel to how it went in, with two surfaces' losses", () => {
    const dir = { x: Math.sin(deg(25)), y: 0, z: Math.cos(deg(25)) };
    const r = traceSolid("cube", 100, { x: -dir.x * 400, y: 0, z: -dir.z * 400 }, dir, 1.5);
    expect(angle(dir, r.exit!.dir)).toBeCloseTo(0, 4);
    expect(r.energy).toBeLessThan(1);
    expect(r.energy).toBeGreaterThan(0.85);
  });
});
