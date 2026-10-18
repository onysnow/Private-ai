/**
 * A beam of light crossing the page in the plane of the glass (item 25d):
 * the laser, and later a prism's spectrum.
 *
 * The panes are slabs lying in the page; a beam travelling at their depth
 * meets them at their EDGES -- the side faces -- not their fronts. So this is
 * a two-dimensional ray trace over the panes' outlines (rounded rectangles),
 * with the physics of every glass surface (claude/tools-research.md):
 *
 *   Snell's law for the refracted ray, with the index at the beam's own
 *   wavelength (effects/optics/dispersion);
 *   the exact Fresnel equations (unpolarised) for how much is reflected,
 *   so every surface also sends off a weaker reflected beam;
 *   total internal reflection past the critical angle -- a pane guides the
 *   beam along itself when it meets an edge steeply from inside;
 *   Beer-Lambert absorption along every path inside the glass, at the
 *   material's measured absorption for the beam's colour.
 *
 * It returns the segments (with the energy left in each and whether each is
 * inside glass) and the points where the beam met a surface. Drawing them,
 * and turning the brightest hits into lights, is the caller's.
 *
 * Pure and deterministic: no DOM, no randomness.
 */

export type Vec = { x: number; y: number };

/** A pane's outline and what it is made of, in page pixels. */
export type BeamPane = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, px. */
  r: number;
  /** Index of refraction at the beam's wavelength. */
  n: number;
  /** Absorption per px of path at the beam's wavelength (Beer-Lambert). */
  absorb: number;
  /**
   * A convex polygon instead of the rounded box, in page px, corners in
   * order: a glass solid seen end-on in the plane (a prism's triangle, 25g).
   * x, y, w, h then only bound it.
   */
  poly?: readonly Vec[];
  /**
   * Its left and right ends silvered: a beam meeting them from inside is
   * reflected whole, as a light guide's mirrored ends do (Ony: "bounce off
   * the inside left and right sides of the glass").
   */
  mirrorEnds?: boolean;
};

export type BeamSegment = {
  a: Vec;
  b: Vec;
  /** Energy at the start of the segment, 0 to 1 of what left the laser. */
  energy: number;
  /** Energy at its end (less, inside glass). */
  energyEnd: number;
  /** Index of the pane it runs inside, or -1 in air. */
  inside: number;
};

export type BeamHit = {
  at: Vec;
  /** The energy arriving at the surface. */
  energy: number;
  pane: number;
  kind: "enter" | "exit" | "internal";
};

export type BeamResult = { segments: BeamSegment[]; hits: BeamHit[] };

export type BeamOptions = {
  /** Stop following a branch below this share of the laser's energy. */
  minEnergy?: number;
  /** Most surface interactions in any one branch. */
  maxDepth?: number;
  /** How far a beam travels in air before it is considered gone, px. */
  maxLength?: number;
};

const EPS = 1e-3;

/** Fresnel reflectance for unpolarised light, from the cosines either side. */
export function fresnel(cosI: number, n1: number, n2: number): number {
  const sinT2 = (n1 / n2) ** 2 * Math.max(0, 1 - cosI * cosI);
  if (sinT2 >= 1) return 1; // total internal reflection
  const cosT = Math.sqrt(1 - sinT2);
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
  return (rs * rs + rp * rp) / 2;
}

/** Refract direction d (unit) at a surface with unit normal nrm facing the incoming side. */
export function refract(d: Vec, nrm: Vec, eta: number): Vec | null {
  const cosI = -(d.x * nrm.x + d.y * nrm.y);
  const sinT2 = eta * eta * (1 - cosI * cosI);
  if (sinT2 > 1) return null;
  const cosT = Math.sqrt(1 - sinT2);
  return {
    x: eta * d.x + (eta * cosI - cosT) * nrm.x,
    y: eta * d.y + (eta * cosI - cosT) * nrm.y,
  };
}

function reflect(d: Vec, nrm: Vec): Vec {
  const k = 2 * (d.x * nrm.x + d.y * nrm.y);
  return { x: d.x - k * nrm.x, y: d.y - k * nrm.y };
}

/**
 * Signed distance to a convex polygon (negative inside): the largest of the
 * distances to its edges' lines -- exact inside and along the faces, a
 * bound off the corners, which is all the tracer needs.
 */
function convexPolygon(p: Vec, poly: readonly Vec[]): number {
  // Which way round the corners go, so every edge's normal points out.
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const turn = area > 0 ? 1 : -1;
  let d = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l = Math.hypot(ex, ey) || 1;
    // Outward normal of the edge.
    const nx = (turn * ey) / l;
    const ny = (-turn * ex) / l;
    d = Math.max(d, (p.x - a.x) * nx + (p.y - a.y) * ny);
  }
  return d;
}

/** Signed distance to a pane's outline (negative inside). */
function roundedBox(p: Vec, pane: BeamPane): number {
  if (pane.poly) return convexPolygon(p, pane.poly);
  const hw = pane.w / 2;
  const hh = pane.h / 2;
  const r = Math.min(pane.r, hw, hh);
  const qx = Math.abs(p.x - (pane.x + hw)) - (hw - r);
  const qy = Math.abs(p.y - (pane.y + hh)) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/** The outward normal of a pane's outline at a point on it. */
function normalAt(p: Vec, pane: BeamPane): Vec {
  const e = 0.25;
  const nx = roundedBox({ x: p.x + e, y: p.y }, pane) - roundedBox({ x: p.x - e, y: p.y }, pane);
  const ny = roundedBox({ x: p.x, y: p.y + e }, pane) - roundedBox({ x: p.x, y: p.y - e }, pane);
  const l = Math.hypot(nx, ny) || 1;
  return { x: nx / l, y: ny / l };
}

/**
 * Where a ray first crosses a pane's outline, going from inside to outside
 * (`fromInside`) or outside to inside. Sphere-traced against the rounded
 * box's distance, then refined, so the corners are exact circles.
 */
function crossing(o: Vec, d: Vec, pane: BeamPane, fromInside: boolean, maxT: number): number {
  const sign = fromInside ? -1 : 1;
  // From inside, the ray starts on the surface it just crossed: step clear of
  // it before a crossing can count (a pane is far wider than this).
  let t = fromInside ? 0.5 : EPS;
  for (let i = 0; i < 512 && t < maxT; i++) {
    const p = { x: o.x + d.x * t, y: o.y + d.y * t };
    const s = sign * roundedBox(p, pane);
    if (s < 0.01) {
      // Refine the root by bisection between the last two steps.
      let lo = Math.max(EPS, t - 2);
      let hi = t;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        const q = { x: o.x + d.x * mid, y: o.y + d.y * mid };
        if (sign * roundedBox(q, pane) > 0) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    t += Math.max(s, 0.05);
  }
  return Infinity;
}

/** Trace a beam from `origin` along `direction` (need not be unit) over the panes. */
export function traceBeam(
  origin: Vec,
  direction: Vec,
  panes: readonly BeamPane[],
  options: BeamOptions = {},
): BeamResult {
  const minEnergy = options.minEnergy ?? 0.02;
  const maxDepth = options.maxDepth ?? 12;
  const maxLength = options.maxLength ?? 4000;
  const segments: BeamSegment[] = [];
  const hits: BeamHit[] = [];
  const len = Math.hypot(direction.x, direction.y) || 1;
  /*
   * `from`: the pane a ray outside the glass has just left or glanced off.
   * The panes are convex, so that ray can never meet it again, and skipping
   * it stops the surface it starts on being mistaken for a crossing.
   */
  const stack: { o: Vec; d: Vec; energy: number; inside: number; depth: number; from: number }[] = [
    {
      o: origin,
      d: { x: direction.x / len, y: direction.y / len },
      energy: 1,
      // Starting inside a pane counts as inside it.
      inside: panes.findIndex((p) => roundedBox(origin, p) < 0),
      depth: 0,
      from: -1,
    },
  ];

  while (stack.length > 0) {
    const ray = stack.pop()!;
    if (ray.energy < minEnergy || ray.depth > maxDepth) continue;

    // The nearest surface ahead.
    let bestT = maxLength;
    let bestPane = -1;
    if (ray.inside >= 0) {
      bestT = crossing(ray.o, ray.d, panes[ray.inside]!, true, maxLength);
      bestPane = Number.isFinite(bestT) ? ray.inside : -1;
      if (bestPane < 0) bestT = maxLength;
    } else {
      panes.forEach((pane, i) => {
        if (i === ray.from) return;
        const t = crossing(ray.o, ray.d, pane, false, bestT);
        if (t < bestT) {
          bestT = t;
          bestPane = i;
        }
      });
    }

    const end = { x: ray.o.x + ray.d.x * bestT, y: ray.o.y + ray.d.y * bestT };
    const through = ray.inside >= 0 ? Math.exp(-panes[ray.inside]!.absorb * bestT) : 1;
    segments.push({
      a: ray.o,
      b: end,
      energy: ray.energy,
      energyEnd: ray.energy * through,
      inside: ray.inside,
    });
    if (bestPane < 0) continue; // off into the room

    const arriving = ray.energy * through;
    const pane = panes[bestPane]!;
    const outward = normalAt(end, pane);
    // The normal facing the ray, and the two indices in the order crossed.
    const leaving = ray.inside >= 0;
    const nrm = leaving ? { x: -outward.x, y: -outward.y } : outward;
    const n1 = leaving ? pane.n : 1;
    const n2 = leaving ? 1 : pane.n;
    const cosI = Math.min(1, Math.abs(ray.d.x * nrm.x + ray.d.y * nrm.y));
    const mirrored = leaving && pane.mirrorEnds === true && Math.abs(outward.x) > 0.9;
    const R = mirrored ? 1 : fresnel(cosI, n1, n2);
    const kind: BeamHit["kind"] = leaving ? (R >= 1 ? "internal" : "exit") : "enter";
    hits.push({ at: end, energy: arriving, pane: bestPane, kind });

    // The reflected branch stays on the side it came from.
    const r = reflect(ray.d, nrm);
    stack.push({
      o: { x: end.x + r.x * EPS * 10, y: end.y + r.y * EPS * 10 },
      d: r,
      energy: arriving * R,
      inside: ray.inside,
      depth: ray.depth + 1,
      from: leaving ? -1 : bestPane,
    });
    // The transmitted branch crosses into the other medium.
    if (R < 1) {
      const t = refract(ray.d, nrm, n1 / n2);
      if (t) {
        stack.push({
          o: { x: end.x + t.x * EPS * 10, y: end.y + t.y * EPS * 10 },
          d: t,
          energy: arriving * (1 - R),
          inside: leaving ? -1 : bestPane,
          depth: ray.depth + 1,
          from: leaving ? bestPane : -1,
        });
      }
    }
  }
  return { segments, hits };
}
