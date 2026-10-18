/**
 * A light's colour from its colour temperature (light engine catalogue,
 * item 32: "Colour from temperature -- Planck blackbody -> RGB").
 *
 * An incandescent lamp, a candle, the sun: each glows with the spectrum of
 * a body at its temperature -- Planck's law,
 *
 *   B(lambda, T) = 2hc^2 / lambda^5 / (exp(hc / (lambda k T)) - 1)
 *
 * seen through the eye's colour matching (CIE 1931, the same fit the thin
 * film uses) and turned into the screen's red, green and blue (linear sRGB,
 * white at D65). A photographer's Kelvin: 2700 K a warm household bulb, 3200
 * K tungsten, 5500 K daylight, 6500 K the screen's white.
 *
 * Normalised so its brightest channel is 1: temperature sets the colour, not
 * the strength (that is the light's gain).
 */

import { cie1931, xyzToRgb } from "@fx/effects/optics/thin-film";

const H = 6.62607015e-34;
const C = 2.99792458e8;
const K = 1.380649e-23;

/** Planck's spectral radiance at a wavelength (nm) and temperature (K), unscaled. */
export function planck(lambdaNm: number, kelvin: number): number {
  const l = lambdaNm * 1e-9;
  return 1 / (Math.pow(l, 5) * (Math.exp((H * C) / (l * K * kelvin)) - 1));
}

const cache = new Map<number, [number, number, number]>();

/** A blackbody's colour at `kelvin`, linear sRGB with its brightest channel 1. */
export function blackbodyRgb(kelvin: number): [number, number, number] {
  const t = Math.round(Math.min(40000, Math.max(1000, kelvin)));
  const hit = cache.get(t);
  if (hit) return hit;
  const xyz: [number, number, number] = [0, 0, 0];
  for (let lambda = 380; lambda <= 780; lambda += 5) {
    const b = planck(lambda, t);
    const cmf = cie1931(lambda);
    xyz[0] += b * cmf[0];
    xyz[1] += b * cmf[1];
    xyz[2] += b * cmf[2];
  }
  const rgb = xyzToRgb(xyz).map((v) => Math.max(0, v)) as [number, number, number];
  const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-12);
  const out: [number, number, number] = [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak];
  cache.set(t, out);
  return out;
}
