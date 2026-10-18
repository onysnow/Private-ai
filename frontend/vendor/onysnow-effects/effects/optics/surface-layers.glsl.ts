import { HEX_TILE_GLSL } from "./hex-tile.glsl";

/**
 * The glass's surface layers -- smudge and scratch photographs -- as every
 * pass sees them.
 *
 * The light ON the glass (GlassLight) and the light THROUGH it (FloorLight)
 * both read the pane's marks from here, at the same pane-local point, with
 * the same hex-tiling and the same per-pane offset. So a smudge that catches
 * the lamp on the face is the same smudge that dims and softens the light
 * under it, in the same place. Includes the hex-tiling chunk.
 *
 * GLSL ES 1.0. Keep backticks out of the comments inside the literal.
 */
/**
 * Where the marks (smudges, scratches, dust) stop, as a fraction of the
 * bevel's width in from the rim: none on the outer part of the edge, fading
 * in across the rest of it, full on the flat face (Ony, 2026-10-01: "I can
 * see scratches and smudges on the edges/sides I don't want that"). A fade,
 * not a cut, so there is no line where they end (his earlier note: "you can
 * see where the texture/scratch/smudge layer in the glass cuts off").
 */
export const MARKS_FADE_FROM = 0.35;

export const SURFACE_LAYERS_GLSL = /* glsl */ `
${HEX_TILE_GLSL}

/*
 * The surface layers, photographed: where the smudge film is and how thick,
 * and where the scratches are. Each is a greyscale map, the mark's amount in
 * its brightness, swappable from the admin portal.
 */
uniform sampler2D uSmudge;
uniform sampler2D uScratch;
uniform float uHasSurface;
/* How many CSS pixels one repeat of each map covers: one texel per pixel. */
uniform float uSmudgeTile;
uniform float uScratchTile;

/*
 * R: scratches. G: smudge. B: wear -- the same smudge photograph at four
 * times the scale, a slow variation in how handled each part of the pane is.
 * local: pane-local CSS pixels. seed: the pane's own offset.
 */
vec3 surfaceAt(vec2 local, float seed) {
  vec2 shift = vec2(seed * 0.37, seed * 0.61);
  float scratch = hexTile(uScratch, local / uScratchTile + shift).r;
  float smudge = hexTile(uSmudge, local / uSmudgeTile + shift).r;
  /*
   * Handled glass is never perfectly clean, so wear has a floor: a third,
   * rising where the smudge film is -- the same spread the old packed map's
   * wear channel had, which the grime's strength was tuned against.
   */
  float film = hexTile(uSmudge, local / (uSmudgeTile * 4.0) + shift.yx).r;
  float wear = 0.33 + 0.67 * smoothstep(0.0, 0.5, film);
  return vec3(scratch, smudge, wear);
}

/*
 * How much of each mark covers a point, 0 to 1: x scratches, y smudge. One
 * function, so the light on the glass and the light through it agree.
 *
 * proportional 0: the approved look -- a clarity threshold (clarity = the
 *   "Grime floor" setting): below it a mark is gone, above it nearly full.
 * proportional 1 (previewing, ?try=marks): each pixel covers exactly as much
 *   as its value in the layer says -- a faint mark blocks a little, a dense
 *   one a lot, which is how much of the light it actually stops or bends.
 */
vec2 marksCover(vec3 surf, float clarity, float proportional) {
  vec2 graded = vec2(
    smoothstep(clarity, clarity + 0.42, surf.r),
    smoothstep(clarity * 0.85, clarity * 0.85 + 0.5, surf.g)
  );
  return mix(graded, surf.rg, proportional);
}
`;
