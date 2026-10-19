/**
 * How a glass's index changes with the colour of the light (dispersion), from
 * the two numbers a material carries: its index at the helium d line and its
 * Abbe number (effects/materials/presets).
 *
 * Cauchy's two-term law, n(lambda) = A + B / lambda^2, fitted so that
 *
 *   n(587.6 nm) = n_d                                  (the d line)
 *   (n_d - 1) / (n(486.1 nm) - n(656.3 nm)) = V_d      (the Abbe number)
 *
 * which is exactly what an Abbe number is defined to measure. Good to a few
 * parts in ten thousand across the visible for a crown glass like soda-lime,
 * which is far finer than a pixel can show. Used by the laser's beam (one
 * wavelength) and, later, by the prism (all of them).
 */

const LAMBDA_D = 587.6;
const LAMBDA_F = 486.1;
const LAMBDA_C = 656.3;

/** The glass's index at a wavelength in nanometres. */
export function indexAt(lambdaNm: number, nd: number, abbe: number): number {
  const spread = (nd - 1) / abbe; // n_F - n_C
  const b = spread / (1 / (LAMBDA_F * LAMBDA_F) - 1 / (LAMBDA_C * LAMBDA_C));
  const a = nd - b / (LAMBDA_D * LAMBDA_D);
  return a + b / (lambdaNm * lambdaNm);
}

/**
 * The colour a single wavelength looks, as display RGB 0..1 (a spectral
 * line has no exact sRGB colour; this is the usual piecewise approximation,
 * after Dan Bruton's, dimmed toward the ends where the eye sees little).
 */
export function wavelengthRgb(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else if (nm <= 780) {
    r = 1;
  }
  const edge =
    nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  return [r * edge, g * edge, b * edge];
}
