/**
 * Stacks of panes: what a pile of glass lets through, reflects and absorbs
 * (light-engine architecture, step E; the physics is in
 * claude/light-physics-reference.md, Part 1).
 *
 * Everything here is incoherent -- intensities add, not waves -- which is
 * right for every gap a page can express in pixels. The one place light
 * behaves as a wave, a touching dry interface, is handled by the thin-film
 * term in effects/optics/thin-film.ts on top of this.
 *
 * Per colour channel, so the green of a long path through float glass
 * comes out of the same sums as the brightness.
 */

import type { Material } from "@fx/effects/materials/presets";

export type RGB = readonly [number, number, number];

/** What sits between two panes of a stack (a cause, like the gap). */
export type Interface =
  /** Separate panes with air between; gap in CSS px (0 allowed). */
  | { kind: "air"; gap: number }
  /** Resting on each other, dry: a sub-micron air film, touching in places. */
  | { kind: "contact" }
  /** Laminated, glued or oiled: the inner surfaces vanish. `index` defaults to the glass's. */
  | { kind: "bonded"; index?: number };

// ---------------------------------------------------------------------------
// One surface
// ---------------------------------------------------------------------------

/**
 * Fresnel reflectance of one surface, s and p polarisations separately
 * (the full equations, not Schlick's approximation).
 *
 * `cosI` is the cosine of the angle of incidence in the medium of index n1.
 * Beyond the critical angle the reflection is total.
 */
export function fresnelSP(cosI: number, n1: number, n2: number): { s: number; p: number } {
  const c = Math.min(1, Math.max(0, cosI));
  const sinT = (n1 / n2) * Math.sqrt(Math.max(0, 1 - c * c));
  if (sinT >= 1) return { s: 1, p: 1 };
  const cosT = Math.sqrt(1 - sinT * sinT);
  const rs = (n1 * c - n2 * cosT) / (n1 * c + n2 * cosT);
  const rp = (n1 * cosT - n2 * c) / (n1 * cosT + n2 * c);
  return { s: rs * rs, p: rp * rp };
}

/** Unpolarised Fresnel reflectance: the mean of s and p. */
export function fresnel(cosI: number, n1: number, n2: number): number {
  const { s, p } = fresnelSP(cosI, n1, n2);
  return (s + p) / 2;
}

/** The cosine of the refracted angle (Snell), for an incoming cosine in n1. */
export function refractedCos(cosI: number, n1: number, n2: number): number {
  const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));
  const sinT = Math.min(1, (n1 / n2) * sinI);
  return Math.sqrt(1 - sinT * sinT);
}

// ---------------------------------------------------------------------------
// One slab (a pane, or a bonded stack treated as one)
// ---------------------------------------------------------------------------

/** What one layer (or a combined stack) does, per colour: through, back from the front, back from the rear, absorbed. */
export type Layer = { T: RGB; Rf: RGB; Rb: RGB; A: RGB };

/**
 * The length of path the material's absorption coefficients are per.
 *
 * They were calibrated on the side faces (effects/optics/edge-side.ts),
 * where a path of 1 is the light's run through the side, edge-on -- the
 * pane's depth seen end to end, about a hundred thicknesses of float glass.
 * Straight through the face the path is one thickness, so it is a hundredth
 * of that: 18 px of float glass takes 2.7% of the red and 0.9% of the green,
 * which is the faint green of a real clear pane seen face-on.
 */
export const ABSORB_UNIT = 100 * 18;

/**
 * One slab of glass in air: both surfaces, every internal bounce summed.
 *
 *   T = (1-r)^2 tau / (1 - r^2 tau^2)
 *   R = r + (1-r)^2 r tau^2 / (1 - r^2 tau^2)
 *
 * with r the surface reflectance at this angle and tau = exp(-alpha * path)
 * the internal transmittance over the slanted path t / cos(theta_t).
 * Symmetric, so Rf = Rb.
 */
export function slab(
  material: Pick<Material, "ior" | "absorb">,
  thickness: number,
  cosI = 1,
  outside = 1,
): Layer {
  const r = fresnel(cosI, outside, material.ior);
  const cosT = refractedCos(cosI, outside, material.ior);
  const path = thickness / Math.max(cosT, 1e-6) / ABSORB_UNIT;
  const T: number[] = [];
  const R: number[] = [];
  const A: number[] = [];
  for (let c = 0; c < 3; c++) {
    const tau = Math.exp(-material.absorb[c]! * path);
    const denom = 1 - r * r * tau * tau;
    const t = ((1 - r) * (1 - r) * tau) / denom;
    const rr = r + ((1 - r) * (1 - r) * r * tau * tau) / denom;
    T.push(t);
    R.push(rr);
    A.push(Math.max(0, 1 - t - rr));
  }
  const rgb = (v: number[]) => [v[0]!, v[1]!, v[2]!] as const;
  return { T: rgb(T), Rf: rgb(R), Rb: rgb(R), A: rgb(A) };
}

// ---------------------------------------------------------------------------
// Stacking
// ---------------------------------------------------------------------------

/**
 * Two layers, one above the other with air between: the adding equations.
 *
 *   T12  = T1 T2 / (1 - R1b R2f)
 *   R12f = R1f + T1^2 R2f / (1 - R1b R2f)
 *   R12b = R2b + T2^2 R1b / (1 - R1b R2f)
 *
 * The 1 / (1 - R R) is the light bouncing between them, summed to infinity.
 * Absorption is what is left: 1 - T - R from each side.
 */
export function addLayers(top: Layer, bottom: Layer): Layer {
  const T: number[] = [];
  const Rf: number[] = [];
  const Rb: number[] = [];
  const A: number[] = [];
  for (let c = 0; c < 3; c++) {
    const bounce = 1 / (1 - top.Rb[c]! * bottom.Rf[c]!);
    const t = top.T[c]! * bottom.T[c]! * bounce;
    const rf = top.Rf[c]! + top.T[c]! * top.T[c]! * bottom.Rf[c]! * bounce;
    const rb = bottom.Rb[c]! + bottom.T[c]! * bottom.T[c]! * top.Rb[c]! * bounce;
    T.push(t);
    Rf.push(rf);
    Rb.push(rb);
    A.push(Math.max(0, 1 - t - rf));
  }
  const rgb = (v: number[]) => [v[0]!, v[1]!, v[2]!] as const;
  return { T: rgb(T), Rf: rgb(Rf), Rb: rgb(Rb), A: rgb(A) };
}

export type StackLayer = { material: Pick<Material, "ior" | "absorb">; thickness: number };

/**
 * Bonded layers become one slab: their thicknesses add and their absorption
 * is the path-weighted mean. With the bond's index equal to the glass's
 * there is no surface between them at all ("light passes from one to the
 * other with neither reflection nor refraction"). A bond of a different
 * index keeps a faint surface; that is added as its own thin layer.
 */
export function mergeBonded(layers: readonly StackLayer[]): StackLayer {
  const thickness = layers.reduce((s, l) => s + l.thickness, 0);
  const absorb = [0, 1, 2].map(
    (c) => layers.reduce((s, l) => s + l.material.absorb[c]! * l.thickness, 0) / thickness,
  );
  return {
    thickness,
    material: {
      ior: layers[0]!.material.ior,
      absorb: [absorb[0]!, absorb[1]!, absorb[2]!],
    },
  };
}

/**
 * A whole stack, top first: `interfaces[i]` sits between layers i and i+1.
 *
 * Bonded runs are merged first, so they cost -- and look -- like one pane.
 * Air and contact both combine by the adding equations: a dry contact is
 * still two surfaces as far as intensity goes (its wave effects are the
 * thin-film term's).
 */
export function solveStack(
  layers: readonly StackLayer[],
  interfaces: readonly Interface[],
  cosI = 1,
): Layer {
  // Merge bonded runs.
  const groups: StackLayer[][] = [[layers[0]!]];
  for (let i = 1; i < layers.length; i++) {
    const link = interfaces[i - 1];
    if (link?.kind === "bonded") groups[groups.length - 1]!.push(layers[i]!);
    else groups.push([layers[i]!]);
  }
  const slabs = groups.map((g) => {
    const one = g.length === 1 ? g[0]! : mergeBonded(g);
    return slab(one.material, one.thickness, cosI);
  });
  return slabs.slice(1).reduce(addLayers, slabs[0]!);
}

/** The mean of a colour, for places that want one number. */
export const mean = (v: RGB) => (v[0] + v[1] + v[2]) / 3;
