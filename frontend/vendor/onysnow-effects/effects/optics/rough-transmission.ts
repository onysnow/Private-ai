/**
 * Light through a rough (frosted) face: the microfacet BTDF (light engine
 * step H, item 30b).
 *
 * The floor light treated the frost with two rules of thumb: every ray is
 * turned by about (n - 1) times the roughness, and a frosted face loses
 * "18% of the light times the frost". Both are now worked out from the
 * surface itself, the way Walter, Marschner, Li and Torrance model rough
 * glass ("Microfacet Models for Refraction through Rough Surfaces", EGSR
 * 2007): the face is a field of tiny flat facets tilted by the GGX
 * distribution of the frost's roughness; each refracts or reflects by the
 * exact Fresnel equations; facets hide one another (Smith's G1).
 *
 * Integrated over the facets (a fixed grid, so the numbers are the same on
 * every load), that gives, for light arriving at a given angle:
 *
 *   T       how much gets through the face -- against a smooth face's
 *           1 - F, the frost costs a few per cent, not 18%;
 *   spread  how widely the light that gets through is scattered about the
 *           smooth refraction (the rms of the sine of its deviation), which
 *           at the site's frost matches the old rule and grows at a slant.
 *
 * The floor light reads a pane's row of both at four angles
 * (ROUGH_COSINES) and interpolates (?try=roughglass).
 */

import { fresnelExact, frostRoughness } from "./reflection";

/** Smith's masking for GGX. */
function smithG1(cos: number, alpha: number): number {
  const c2 = cos * cos;
  const tan2 = (1 - c2) / Math.max(c2, 1e-9);
  return 2 / (1 + Math.sqrt(1 + alpha * alpha * tan2));
}

/**
 * Light arriving from air at a rough face of glass of index `ior` at an angle
 * whose cosine is `cosI`, roughness `alpha` (GGX): the share reflected, the
 * share transmitted, and the transmitted light's spread about the smooth
 * refraction. `grid` facets a side.
 */
export function roughInterface(
  cosI: number,
  ior: number,
  alpha: number,
  grid = 64,
): { reflected: number; transmitted: number; spread: number } {
  const ci = Math.min(1, Math.max(0.02, cosI));
  const si = Math.sqrt(1 - ci * ci);
  const wi = [si, 0, ci] as const;
  const eta = 1 / ior;
  const smoothSinT = si / ior;
  const g1i = smithG1(ci, alpha);
  let reflected = 0;
  let transmitted = 0;
  let spread2 = 0;
  for (let a = 0; a < grid; a++) {
    for (let b = 0; b < grid; b++) {
      // A facet normal from GGX, weighted by its projected area (D(h) h.n).
      const u1 = (a + 0.5) / grid;
      const u2 = (b + 0.5) / grid;
      const tan2 = (alpha * alpha * u1) / (1 - u1);
      const ct = 1 / Math.sqrt(1 + tan2);
      const st = Math.sqrt(1 - ct * ct);
      const phi = 2 * Math.PI * u2;
      const h = [st * Math.cos(phi), st * Math.sin(phi), ct] as const;
      const ih = wi[0] * h[0] + wi[1] * h[1] + wi[2] * h[2];
      if (ih <= 0) continue;
      const f = fresnelExact(ih, ior);
      const weight = (ih / (ci * ct)) * g1i;
      // Reflected off the facet.
      const rz = 2 * ih * h[2] - wi[2];
      if (rz > 0) reflected += f * smithG1(rz, alpha) * weight;
      // Refracted through it.
      const k = 1 - eta * eta * (1 - ih * ih);
      if (k <= 0) continue;
      const c2 = eta * ih - Math.sqrt(k);
      const tx = -eta * wi[0] + c2 * h[0];
      const ty = -eta * wi[1] + c2 * h[1];
      const tz = -eta * wi[2] + c2 * h[2];
      if (tz >= 0) continue;
      const w = (1 - f) * smithG1(-tz, alpha) * weight;
      transmitted += w;
      // Deviation from the smooth refraction, in the plane of the face.
      const dx = tx - smoothSinT;
      spread2 += w * (dx * dx + ty * ty);
    }
  }
  const n = grid * grid;
  return {
    reflected: reflected / n,
    transmitted: transmitted / n,
    spread: Math.sqrt(spread2 / Math.max(transmitted, 1e-12)),
  };
}

/** The angles a pane's row is worked out at: cosines, straight on to steep. */
export const ROUGH_COSINES = [1, 0.7, 0.4, 0.15] as const;

export type RoughRow = {
  /** Transmission through the rough face against a smooth one's (1 - F), at each of ROUGH_COSINES. */
  ratio: [number, number, number, number];
  /** The transmitted light's spread, at each of ROUGH_COSINES. */
  spread: [number, number, number, number];
};

const rows = new Map<string, RoughRow>();

/** A pane's row, for its glass's index and frost (worked out once per pair). */
export function roughRow(ior: number, frost: number): RoughRow {
  const key = `${ior.toFixed(4)}:${frost.toFixed(3)}`;
  const hit = rows.get(key);
  if (hit) return hit;
  const alpha = frostRoughness(frost);
  const ratio = [0, 0, 0, 0] as [number, number, number, number];
  const spread = [0, 0, 0, 0] as [number, number, number, number];
  ROUGH_COSINES.forEach((c, i) => {
    const r = roughInterface(c, ior, alpha, 40);
    ratio[i] = Math.min(1, r.transmitted / Math.max(1 - fresnelExact(c, ior), 1e-6));
    spread[i] = r.spread;
  });
  const row = { ratio, spread };
  rows.set(key, row);
  return row;
}

/** A row read at an angle's cosine, piecewise linear (the GLSL twin is roughAt in the floor light). */
export function roughAt(values: readonly number[], cosTheta: number): number {
  const c = Math.min(1, Math.max(ROUGH_COSINES[3], cosTheta));
  for (let i = 0; i < 3; i++) {
    const hi = ROUGH_COSINES[i]!;
    const lo = ROUGH_COSINES[i + 1]!;
    if (c >= lo) return values[i + 1]! + ((values[i]! - values[i + 1]!) * (c - lo)) / (hi - lo);
  }
  return values[3]!;
}
