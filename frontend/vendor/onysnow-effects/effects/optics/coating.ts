/**
 * Anti-reflection coatings (catalogue item 32c; the "museum glass" of a
 * photographer's frames).
 *
 * A film a quarter of a wavelength thick, of an index between air and the
 * glass, sends back two reflections -- off its top and off the glass under
 * it -- half a wave apart, and they cancel. Magnesium fluoride (n = 1.38) a
 * quarter-wave thick at 550 nm takes float glass from 4.2% to about 1.3%
 * straight on; it can only cancel exactly at one wavelength, so what little
 * is left is red and blue -- the purple sheen of coated optics (Hecht,
 * Optics, 9.7.1; Macleod, Thin-Film Optical Filters).
 *
 * One layer on a substrate, at normal incidence:
 *
 *   r1 = (1 - nc) / (1 + nc),  r2 = (nc - ng) / (nc + ng),  delta = 2 pi nc d / lambda
 *   R = (r1^2 + r2^2 + 2 r1 r2 cos 2delta) / (1 + r1^2 r2^2 + 2 r1 r2 cos 2delta)
 */

import { cie1931, xyzToRgb } from "./thin-film";

export type Coating = {
  /** The film's index (magnesium fluoride: 1.38). */
  index: number;
  /** Its thickness, nm (a quarter wave at 550 nm for MgF2: 99.6 nm). */
  thicknessNm: number;
};

/** Magnesium fluoride a quarter-wave thick at 550 nm: the usual single-layer coating. */
export const MGF2_QUARTER_WAVE: Coating = { index: 1.38, thicknessNm: 550 / (4 * 1.38) };

/** A coated face's reflectance at one wavelength, straight on. */
export function coatedReflectance(lambdaNm: number, glassIndex: number, coating: Coating): number {
  const nc = coating.index;
  const r1 = (1 - nc) / (1 + nc);
  const r2 = (nc - glassIndex) / (nc + glassIndex);
  const c = Math.cos((4 * Math.PI * nc * coating.thicknessNm) / lambdaNm);
  return (r1 * r1 + r2 * r2 + 2 * r1 * r2 * c) / (1 + r1 * r1 * r2 * r2 + 2 * r1 * r2 * c);
}

/** A bare face's reflectance straight on. */
const bare = (n: number) => ((n - 1) / (n + 1)) ** 2;

const rgbCache = new Map<string, [number, number, number]>();

/**
 * What a coating leaves of a face's reflection, per screen colour: the
 * coated face's reflectance against the bare face's, each weighed by the
 * eye's colour matching over the spectrum of white light, in linear sRGB.
 * (1, 1, 1) is no coating.
 */
export function coatingRgb(glassIndex: number, coating: Coating): [number, number, number] {
  const key = `${glassIndex}:${coating.index}:${coating.thicknessNm}`;
  const hit = rgbCache.get(key);
  if (hit) return hit;
  const out = coatingRgbOf(glassIndex, coating);
  rgbCache.set(key, out);
  return out;
}

function coatingRgbOf(glassIndex: number, coating: Coating): [number, number, number] {
  const coated: [number, number, number] = [0, 0, 0];
  const white: [number, number, number] = [0, 0, 0];
  for (let lambda = 380; lambda <= 780; lambda += 5) {
    const cmf = cie1931(lambda);
    const r = coatedReflectance(lambda, glassIndex, coating);
    for (let i = 0; i < 3; i++) {
      coated[i]! += r * cmf[i]!;
      white[i]! += cmf[i]!;
    }
  }
  const c = xyzToRgb(coated);
  const w = xyzToRgb(white);
  const b = bare(glassIndex);
  return [Math.max(0, c[0] / w[0] / b), Math.max(0, c[1] / w[1] / b), Math.max(0, c[2] / w[2] / b)];
}
