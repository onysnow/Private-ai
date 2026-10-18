/**
 * Volume scattering in glass (catalogue item 32d): opal glass.
 *
 * Opalescent glass is seeded with particles far smaller than a wavelength,
 * so it scatters as the sky does -- Rayleigh, sigma proportional to
 * lambda^-4 -- blue about twice as much as red. Seen lit, the glass glows a
 * faint blue; the light that comes straight through has lost its blue and
 * lands warm: the colour of opal, and of a sunset through haze.
 *
 * `sigma550` is the material's scattering per CSS px of path at 550 nm.
 */

/** The wavelengths the screen's three colours stand for, nm. */
const LAMBDA = [610, 550, 465] as const;

/** Scattering per px at each screen colour: Rayleigh's lambda^-4 from its 550 nm value. */
export function rayleighRgb(sigma550: number): [number, number, number] {
  return LAMBDA.map((l) => sigma550 * Math.pow(550 / l, 4)) as [number, number, number];
}

/** sigma * path through a slab `thickness` px, per colour: what the shaders read. */
export function scatterDepth(sigma550: number, thickness: number): [number, number, number] {
  return rayleighRgb(sigma550).map((s) => s * thickness) as [number, number, number];
}

/** The share of light that crosses the slab unscattered, per colour. */
export function unscattered(sigma550: number, thickness: number): [number, number, number] {
  return scatterDepth(sigma550, thickness).map((d) => Math.exp(-d)) as [number, number, number];
}
