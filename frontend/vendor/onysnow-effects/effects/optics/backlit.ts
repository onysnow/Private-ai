/**
 * Backlit glass: light shone into a pane from off one edge, filling it.
 *
 * Ony, 2026-10-01, with a photograph of a backlit frosted slab: "the light
 * fills the glass and doesnt just sit as a big circle in the middle like a
 * flashlight behind the glass", and for the panes here, "the lights would
 * enter from off screen on the left or right side. or both at the same time
 * to make it even".
 *
 * THE PHYSICS: AN EDGE-LIT LIGHT GUIDE
 *
 * Light entering a sheet of glass through its edge is trapped by total
 * internal reflection and runs along inside it. Where a face is frosted,
 * each bounce scatters a little of it out of the face -- that is what you
 * see glowing -- and what is scattered out is no longer in the guide, so
 * what is left falls away exponentially with distance from the edge:
 *
 *     I(x) = I0 exp(-x / l),      seen brightness = k I(x)
 *
 * with k the share each length of frosted face lets out. The more frost,
 * the bigger k and the shorter l: a heavily frosted pane is bright by the
 * edge and dims quickly; a lightly frosted one glows faintly and evenly a
 * long way in; clear glass keeps nearly all of it inside and barely glows
 * (it shows at the far edge and the rims instead). This is how LED panel
 * lights and edge-lit signs work (a light guide plate with a scattering
 * pattern; e.g. Kim et al., "Light extraction in edge-lit light guide
 * plates", and the standard LGP design notes).
 *
 * Lit from both sides the two runs add: the dip in the middle is what
 * dual-edge panels show, and with a long reach it all but disappears.
 * The rims catch the trapped light and let it out, so they glow too, and a
 * little of it spills out past them.
 *
 * "Behind the whole pane" is a lightbox instead: an even field behind the
 * glass, through the frost, a little dimmer toward the rims.
 */

export const BACKLIT_EDGES = ["both", "left", "right", "below", "above", "behind"] as const;
export type BacklitEdge = (typeof BACKLIT_EDGES)[number];

/** How much of the trapped light each length of face lets out: frost scatters it, clear glass barely. */
export function extraction(frost: number): number {
  return 0.12 + 0.88 * Math.min(Math.max(frost, 0), 1);
}

/** How far the light runs before it has mostly left the glass, px. */
export function reach(fill: number, extent: number, frost: number): number {
  return Math.max(1, (fill * extent) / (0.35 + Math.min(Math.max(frost, 0), 1)));
}

/**
 * The share of the light shone in that this point of the face lets out, at
 * `p` from the pane's centre, the pane `half` its size in each direction.
 */
export function backlitProfile(
  p: { x: number; y: number },
  half: { x: number; y: number },
  edge: BacklitEdge,
  fill: number,
  frost: number,
): number {
  const k = extraction(frost);
  const run = (x: number, extent: number) => Math.exp(-Math.max(x, 0) / reach(fill, extent, frost));
  const w = half.x * 2;
  const h = half.y * 2;
  switch (edge) {
    case "left":
      return k * run(p.x + half.x, w);
    case "right":
      return k * run(half.x - p.x, w);
    case "both":
      return k * 0.5 * (run(p.x + half.x, w) + run(half.x - p.x, w));
    case "below":
      return k * run(half.y - p.y, h);
    case "above":
      return k * run(p.y + half.y, h);
    case "behind": {
      const r = Math.hypot(p.x / Math.max(half.x, 1), p.y / Math.max(half.y, 1));
      return k * (1 - 0.3 * Math.min(r * r, 1));
    }
  }
}
