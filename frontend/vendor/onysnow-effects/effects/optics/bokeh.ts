/**
 * Bokeh: the bright points behind a frosted pane, spread into discs that stay
 * bright.
 *
 * A blur is not bokeh. The frost spreads every point of the photograph over a
 * disc, and it LOSES none of the light doing it, so a street lamp behind
 * frosted glass becomes a bright disc. The page's blur cannot show that
 * because the photograph is 8-bit: a lamp that was a thousand times brighter
 * than the wall beside it is stored as 255, like the wall's highlights, and
 * blurring 255 over a disc averages it into grey. The light the file clipped
 * is exactly the light the disc is made of.
 *
 * So the clipped light is put back. Where a pixel is at or near the top of
 * its range, more light was there than the file holds (HIDDEN_FROM..1 rises
 * to all of it); that hidden light is kept in its own small map, and the
 * glass shader spreads it over the camera's aperture shape -- a hexagon, the
 * same six blades that shape the flare -- and adds it on top of the frosted
 * view. Whatever is not near clipping contributes nothing, so an evenly lit
 * photograph correctly gets no discs at all; and a blown patch counts in
 * proportion to how dark its surroundings are (see `isolation`), because it
 * is the small lights in a dark scene that the file clipped hardest.
 *
 * How wide the disc is follows the frost: the same spread the pane's own blur
 * shows (a uniform disc and a Gaussian of sigma s have the same spread when
 * the disc's radius is 2s). How bright is the "Bokeh" knob: how much light
 * the clipped pixels are taken to have held.
 */

/** Where a channel starts to be taken as clipped, 0..1 of its range. */
export const HIDDEN_FROM = 0.78;

/** A uniform disc of radius 2 sigma spreads as far as a Gaussian of sigma. */
export const discRadiusForBlur = (sigma: number) => 2 * Math.max(sigma, 0);

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of a pixel's light the file clipped, 0 to 1, from its brightest
 * channel (a red tail light is clipped in red alone and still counts). Squared
 * so that it is the truly blown pixels that carry it, not bright paint.
 */
export function hiddenWeight(r: number, g: number, b: number): number {
  const w = smoothstep(HIDDEN_FROM, 1, Math.max(r, g, b));
  return w * w;
}

/**
 * How sure it is that a blown pixel is a LIGHT: by how dark its surroundings
 * are. The camera exposed for the scene round it, so a small clipped patch in
 * a dark neighbourhood -- a bulb on a string at night, a lit window -- was
 * brighter than the file could hold by far. A clipped patch in a bright
 * neighbourhood -- an overcast sky, a white wall -- was most likely only
 * just white, and holds little more than it shows. `around` is the
 * neighbourhood's mean brightness, 0..1.
 */
export function isolation(around: number): number {
  const a = 1 - Math.min(1, Math.max(0, around));
  return a * a;
}

/**
 * The hidden-light map of an RGBA image (0..255): each pixel's colour times
 * its hidden weight times how isolated it is, opaque. `around` is the same
 * image blurred to its neighbourhoods (same size, RGBA).
 */
export function hiddenLightMap(
  rgba: Uint8ClampedArray,
  around: Uint8ClampedArray = new Uint8ClampedArray(rgba.length),
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]! / 255;
    const g = rgba[i + 1]! / 255;
    const b = rgba[i + 2]! / 255;
    const near = (0.2126 * around[i]! + 0.7152 * around[i + 1]! + 0.0722 * around[i + 2]!) / 255;
    const w = hiddenWeight(r, g, b) * isolation(near);
    out[i] = Math.round(r * w * 255);
    out[i + 1] = Math.round(g * w * 255);
    out[i + 2] = Math.round(b * w * 255);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * The photographs' vignette, as matter in the light's path: every photograph
 * on the site is darkened toward the edges of its box by `.image-vignette`
 * (styles.css: an inset shadow, 9rem blur, 1rem spread, 70%). A light in the
 * photograph under that shadow is dimmed by it like everything else there, so
 * its disc is too. The numbers are the stylesheet's; change both together.
 */
export const PHOTO_VIGNETTE = {
  /** The shadow's opacity. */
  alpha: 0.7,
  /** How far it is spread in from the edge, CSS px (1rem). */
  spread: 16,
  /** A CSS blur radius is two standard deviations: 9rem = 144 px. */
  sigma: 72,
} as const;

/** How much of the inner rectangle's edge has faded in, `d` px in from an edge: 0..1. */
export function vignetteRamp(d: number): number {
  const { spread, sigma } = PHOTO_VIGNETTE;
  return smoothstep(spread - 2.5 * sigma, spread + 2.5 * sigma, d);
}

/**
 * How much light gets through the vignette at a point `dx`, `dy` px in from
 * the nearest vertical and horizontal edges of the photograph's box. The
 * inset shadow is the complement of the blurred inner rectangle, which is
 * separable, so a corner is darker than either edge.
 */
export function vignetteTransmission(dx: number, dy: number): number {
  return 1 - PHOTO_VIGNETTE.alpha * (1 - vignetteRamp(dx) * vignetteRamp(dy));
}

/**
 * Where there is any light near, in the map's alpha: 255 within `reach`
 * texels (Chebyshev, rounded out to whole blocks) of any hidden light, 0
 * elsewhere. Most of a photograph holds none, and the shader reads this one
 * value first and skips the whole gather where it is 0 -- the aperture is a
 * few dozen reads a pixel, and without this every pixel of every pane paid
 * for them. `size` is the square map's side; in place.
 */
export function markLightNear(map: Uint8ClampedArray, size: number, reach: number, block = 16) {
  const cells = Math.ceil(size / block);
  const lit = new Uint8Array(cells * cells);
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / block) * cells;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (map[i]! + map[i + 1]! + map[i + 2]! > 0) lit[row + Math.floor(x / block)] = 1;
    }
  }
  const grow = Math.ceil(reach / block);
  const near = new Uint8Array(cells * cells);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (!lit[cy * cells + cx]) continue;
      for (let y = Math.max(0, cy - grow); y <= Math.min(cells - 1, cy + grow); y++) {
        for (let x = Math.max(0, cx - grow); x <= Math.min(cells - 1, cx + grow); x++) {
          near[y * cells + x] = 1;
        }
      }
    }
  }
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / block) * cells;
    for (let x = 0; x < size; x++) {
      map[(y * size + x) * 4 + 3] = near[row + Math.floor(x / block)] ? 255 : 0;
    }
  }
  return map;
}

/** How many rings of taps fill the aperture: 3 rings is 37 taps. */
export const BOKEH_RINGS = 2;

/**
 * The taps the shader gathers: a hexagonal lattice filling a hexagon of
 * circumradius 1, BOKEH_RINGS rings of it round the middle -- 1 + 3n(n + 1)
 * equal cells, so equal weights make a flat disc. More rings, a crisper rim:
 * the map is read at the level of the lattice's spacing, which is how soft
 * the rim is (a third of the radius for three rings).
 */
export const BOKEH_TAPS: readonly (readonly [number, number])[] = (() => {
  const n = BOKEH_RINGS;
  const taps: [number, number][] = [];
  // Axial coordinates (q, r) with |q|, |r|, |q + r| <= n; the lattice axes at 30 and 90 degrees.
  const e1: [number, number] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  const e2: [number, number] = [0, 1];
  for (let q = -n; q <= n; q++) {
    for (let r = -n; r <= n; r++) {
      if (Math.abs(q + r) > n) continue;
      taps.push([(q * e1[0] + r * e2[0]) / n, (q * e1[1] + r * e2[1]) / n]);
    }
  }
  return taps;
})();
