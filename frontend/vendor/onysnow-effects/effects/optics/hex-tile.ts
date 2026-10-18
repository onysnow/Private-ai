/**
 * Tiling a photographed surface layer with no visible repeat and no seams.
 *
 * WHY
 *
 * A smudge or scratch photograph is a few hundred pixels of glass; a pane is
 * the width of the page. Repeated as a plain grid the same marks recur at a
 * fixed spacing, and the eye finds that at once -- identical tick marks lined
 * up along a lit edge is how the old atlas gave itself away.
 *
 * HOW: hex-tiling (Mikkelsen, "Practical Real-Time Hex-Tiling", JCGT 2022,
 * after Heitz & Neyret 2018)
 *
 * The plane is covered in hexagons. Each hexagon takes the texture at its own
 * random offset, so neighbours never show the same patch. Every point blends
 * the three hexagons around it with barycentric weights, which are 1 at a
 * hexagon's centre and fall to 0 at its border -- so there is no edge to see.
 * A plain blend would average the three samples into a flat grey wherever
 * they overlap, so the weights are raised to a power first (Mikkelsen's
 * contrast-preserving blend): each point is carried almost entirely by one
 * sample, and only a narrow band near each border is a mix.
 *
 * Offset only, no rotation: these photographs have a grain (wiping strokes
 * and hairline scratches run one way), and rotating each hexagon would give
 * every cell a different grain direction -- which draws the hexagons.
 *
 * The source must itself tile without a seam, because an offset sample wraps
 * across the texture's own edge; build_maps.py makes sure of that.
 *
 * The GLSL twin is hex-tile.glsl.ts; e2e/optics.spec.ts compares them.
 */

/** Barycentric weights of the three hexagons around a point, and their cells. */
export type HexWeights = {
  w: [number, number, number];
  cells: [[number, number], [number, number], [number, number]];
};

/** How strongly the blend favours the nearest hexagon (Mikkelsen's contrast). */
export const HEX_CONTRAST = 7;

export function hexWeights(x: number, y: number): HexWeights {
  // Scale so one hexagon is about one texture repeat across.
  const sx = x * 2 * Math.sqrt(3);
  const sy = y * 2 * Math.sqrt(3);
  // Skew onto a triangle grid.
  const kx = sx;
  const ky = -0.57735027 * sx + 1.15470054 * sy;
  const bx = Math.floor(kx);
  const by = Math.floor(ky);
  const fx = kx - bx;
  const fy = ky - by;
  const fz = 1 - fx - fy;
  const s = fz < 0 ? 1 : 0;
  const s2 = 2 * s - 1;
  return {
    w: [-fz * s2, s - fy * s2, s - fx * s2],
    cells: [
      [bx + s, by + s],
      [bx + s, by + 1 - s],
      [bx + 1 - s, by + s],
    ],
  };
}

/** The three weights after the contrast power, normalised to sum to 1. */
export function hexBlend(w: [number, number, number]): [number, number, number] {
  const p = w.map((v) => Math.pow(Math.max(v, 0), HEX_CONTRAST)) as [number, number, number];
  const sum = p[0] + p[1] + p[2] || 1;
  return [p[0] / sum, p[1] / sum, p[2] / sum];
}

/**
 * A hexagon's offset into the texture: a fixed, well-spread pseudo-random
 * point in [0, 1)^2 per cell (Hoskins' hash without sine). It chooses WHERE
 * in the photograph a cell reads from; it adds nothing to the image itself.
 */
export function cellOffset(cx: number, cy: number): [number, number] {
  const fract = (v: number) => v - Math.floor(v);
  let p0 = fract(cx * 0.1031);
  let p1 = fract(cy * 0.103);
  let p2 = fract(cx * 0.0973);
  const d = p0 * (p1 + 33.33) + p1 * (p2 + 33.33) + p2 * (p0 + 33.33);
  p0 += d;
  p1 += d;
  p2 += d;
  return [fract((p0 + p1) * p2), fract((p0 + p2) * p1)];
}
