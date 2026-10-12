/**
 * Two panes resting on each other, dry (light engine step G, item 29;
 * claude/light-physics-reference.md "contact"; docs/contact-interface.md).
 *
 * Between them is a film of air a fraction of a micron thick where they come
 * close, and nothing where they touch. Such a film is thinner than light's
 * coherence length, so its two faces' reflections interfere as waves -- the
 * stack solver's incoherent sums (effects/optics/stack) are only its average.
 * What that gives, by gap thickness d:
 *
 *   Airy's formula for a film between two like media (Hecht, Optics, 9.7;
 *   the symmetric Fabry-Perot):
 *     R(d, lambda) = F sin^2(delta/2) / (1 + F sin^2(delta/2)),
 *     delta = 4 pi d cos(theta_air) / lambda,  F = 4 R0 / (1 - R0)^2.
 *   At d = 0 it is 0: where the glass touches, the two faces are gone and
 *   the pane is one piece (the black spot at the heart of Newton's rings).
 *   Its peak, at a quarter wave, is 4 R0 / (1 + R0)^2, 15.5% for float glass;
 *   its mean over a cycle is the incoherent 2 R0 / (1 + R0), 8.1%.
 *
 *   Seen in white light every wavelength rings at its own spacing, so the
 *   film shows Newton's colour sequence -- black, grey-white, straw, orange,
 *   purple, blue, then paler greens and pinks -- washing out to the plain
 *   incoherent grey past about a micron and a half.
 *
 *   The faces must be smooth. A rough face varies the gap on a scale below a
 *   pixel, so the phase is scattered and the interference term falls by
 *   exp(-(4 pi sigma cos / lambda)^2 / 2) (the specular roughness factor of
 *   Bennett and Porteus, JOSA 51, 123, 1961, for the two-beam term). A
 *   satin-etched face (sigma about a micron) shows no colours at all.
 *
 *   Where the gap is under a wavelength, light that the lower pane carries
 *   by total internal reflection is not all reflected: the evanescent wave
 *   crosses the gap (frustrated TIR; Zhu et al., Am. J. Phys. 54, 601, 1986),
 *   T ~ exp(-2 kappa d), kappa = (2 pi / lambda) sqrt(n^2 sin^2 theta - 1).
 *   So light piped along the lower pane leaks out at the contact patches.
 *
 * Colour: the film's reflectance is integrated over the visible spectrum
 * with the CIE 1931 colour-matching functions (the analytic fit of Wyman,
 * Sloan and Shirley, JCGT 2(2), 2013) under an equal-energy white, into
 * linear sRGB, and white-balanced so the incoherent mean is neutral.
 */

import type { Material } from "@fx/effects/materials/presets";

/**
 * A face's rms roughness, nm. Float glass as it comes off the tin bath is
 * smooth to about a nanometre; acid-etched satin glass is rough on the
 * order of a micron (its frost scales it: frost 1 is a full etch).
 */
export function faceRoughnessNm(
  material: Pick<Material, "frost" | "frostedFace">,
  face: "front" | "back",
): number {
  return material.frostedFace === face ? Math.max(1, material.frost * 1000) : 1;
}

/** Float glass's reflectance at one face, straight on: ((n - 1) / (n + 1))^2. */
export const faceR0 = (n: number) => ((n - 1) / (n + 1)) ** 2;

/** Airy reflectance of an air film of thickness `d` nm between two glasses of index n. */
export function filmReflectance(d: number, lambda: number, n: number, cosAir = 1): number {
  const R0 = faceR0(n);
  const F = (4 * R0) / (1 - R0) ** 2;
  const s = Math.sin((2 * Math.PI * Math.max(d, 0) * cosAir) / lambda);
  const s2 = s * s;
  return (F * s2) / (1 + F * s2);
}

/** The film's reflectance averaged over phase: the incoherent sum of its two faces. */
export function incoherentFilm(n: number): number {
  const R0 = faceR0(n);
  return (2 * R0) / (1 + R0);
}

/** How much of the interference survives faces of rms roughness `sigma` nm (0 to 1). */
export function coherence(sigma: number, lambda: number, cosAir = 1): number {
  const k = (4 * Math.PI * sigma * cosAir) / lambda;
  return Math.exp(-(k * k) / 2);
}

/** Frustrated TIR: the share of light at `sinGlass` in glass that crosses a gap of `d` nm. */
export function ftirTransmission(d: number, lambda: number, n: number, sinGlass: number): number {
  const q = n * n * sinGlass * sinGlass - 1;
  if (q <= 0) return 1; // not totally reflected in the first place
  const kappa = ((2 * Math.PI) / lambda) * Math.sqrt(q);
  return Math.exp(-2 * kappa * Math.max(d, 0));
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

const g = (x: number, mu: number, s1: number, s2: number) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};

/** CIE 1931 2-degree colour-matching functions, Wyman-Sloan-Shirley multi-lobe fit. */
export function cie1931(lambda: number): [number, number, number] {
  const x =
    1.056 * g(lambda, 599.8, 37.9, 31.0) +
    0.362 * g(lambda, 442.0, 16.0, 26.7) -
    0.065 * g(lambda, 501.1, 20.4, 26.2);
  const y = 0.821 * g(lambda, 568.8, 46.9, 40.5) + 0.286 * g(lambda, 530.9, 16.3, 31.1);
  const z = 1.217 * g(lambda, 437.0, 11.8, 36.0) + 0.681 * g(lambda, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** XYZ to linear sRGB (D65). */
export function xyzToRgb([x, y, z]: readonly number[]): [number, number, number] {
  return [
    3.2406 * x! - 1.5372 * y! - 0.4986 * z!,
    -0.9689 * x! + 1.8758 * y! + 0.0415 * z!,
    0.0557 * x! - 0.204 * y! + 1.057 * z!,
  ];
}

const SPECTRUM = Array.from({ length: 61 }, (_, i) => 400 + i * 5);

/**
 * The film's reflectance in colour, linear sRGB, for a gap of `d` nm: the
 * spectrum's reflectance weighed by the eye, white-balanced so that a film
 * too thick to interfere reads as the incoherent grey on every channel.
 */
export function filmRgb(d: number, n: number, sigma = 0, cosAir = 1): [number, number, number] {
  const xyz = [0, 0, 0];
  const white = [0, 0, 0];
  const mean = incoherentFilm(n);
  for (const lambda of SPECTRUM) {
    const cmf = cie1931(lambda);
    const R =
      mean + (filmReflectance(d, lambda, n, cosAir) - mean) * coherence(sigma, lambda, cosAir);
    for (let c = 0; c < 3; c++) {
      xyz[c]! += R * cmf[c]!;
      white[c]! += cmf[c]!;
    }
  }
  const rgb = xyzToRgb(xyz);
  const w = xyzToRgb(white);
  return [rgb[0] / w[0], rgb[1] / w[1], rgb[2] / w[2]];
}

/** The largest value filmRgb reaches on any channel, for packing it into bytes. */
export const FILM_LUT_SCALE = 0.2;
/** The thickest gap the table covers, nm: past it the film is the incoherent grey. */
export const FILM_LUT_MAX = 2000;

/**
 * filmRgb tabulated over gap thickness, 0 to FILM_LUT_MAX nm, as RGBA bytes
 * (value / FILM_LUT_SCALE), for the shader. Straight on, smooth faces: the
 * shader applies the faces' roughness itself, by mixing toward the mean.
 */
export function filmLut(n: number, size = 256): Uint8Array {
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const rgb = filmRgb((i / (size - 1)) * FILM_LUT_MAX, n);
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.round(Math.min(1, Math.max(0, rgb[c]! / FILM_LUT_SCALE)) * 255);
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Where the panes touch
// ---------------------------------------------------------------------------

/** One CSS px, nm (96 px to the inch). */
export const NM_PER_PX = 25.4e6 / 96;

/**
 * How the two faces curve apart from where they touch: the radii of the
 * panes' combined bow across and down the page, nm. Float glass is flat to
 * a few tens of microns over a hand's width -- a bow radius of a couple of
 * hundred metres -- which is all it takes: the gap is a paraboloid,
 * d = x^2 / 2Rx + y^2 / 2Ry, and the rings are Newton's, the m-th dark one at
 * r = sqrt(m lambda R) (Newton's rings, Hecht 9.4). Slightly different bows
 * each way make them ellipses, as they are between two real sheets.
 */
export const BOW_X = 150e9;
export const BOW_Y = 260e9;
/**
 * How far the panes press into each other under the upper one's weight, nm:
 * the touching spot flattens into a small black disc, sqrt(2 R delta) across.
 */
export const PRESS = 30;

/**
 * The gap between two resting panes at `(x, y)` px from where they touch, nm.
 * Twin of CONTACT_GAP_GLSL.
 */
export function contactGap(x: number, y: number): number {
  const X = x * NM_PER_PX;
  const Y = y * NM_PER_PX;
  return Math.max(0, (X * X) / (2 * BOW_X) + (Y * Y) / (2 * BOW_Y) - PRESS);
}

/** The m-th dark ring's radius along x, px, at `lambda` nm: sqrt(m lambda R), less the press. */
export function darkRingRadius(m: number, lambda: number): number {
  return Math.sqrt(2 * BOW_X * ((m * lambda) / 2 + PRESS)) / NM_PER_PX;
}

export const CONTACT_GAP_GLSL = /* glsl */ `
// effects/optics/thin-film.ts contactGap: the gap between two resting panes, nm,
// at q px from where they touch.
float contactGap(vec2 q) {
  vec2 p = q * ${NM_PER_PX.toFixed(3)} * 1e-3;  // microns, to keep the squares in range
  return max(0.0, 1e6 * (p.x * p.x / ${(2 * BOW_X).toExponential(4)} + p.y * p.y / ${(2 * BOW_Y).toExponential(4)}) - ${PRESS.toFixed(1)});
}
`;
