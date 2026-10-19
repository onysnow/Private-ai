/**
 * The water's passes (task 77; docs/research/water-drops.md 6.2, 7.2, 9).
 *
 * 1. Height maps, at the device's pixels. Every drop (and, into a map of
 *    its own that persists, every small droplet) is drawn as a quad over
 *    its contact line, its height a spherical cap -- but on a contact line
 *    that is never quite a circle: pinned by the glass's defects (harmonics
 *    2-4, a random phase per drop) and pulled into a pear by gravity on the
 *    upright glass, wider and deeper at the bottom (water-drops 9.1).
 *    Heights add where drops overlap, so two drops necking together are one
 *    lens. R: height / full scale; G, B: blood and slime coverage; A: coverage.
 *
 * 2. Wiping: a drop swallows the droplets under it, and a running drop
 *    sweeps its whole path clean (the clean tracks of water-drops 7.4
 *    photo 3); and the film it leaves wets its track.
 *
 * 3. The water layer, per device pixel of the pane: where there is water,
 *    the eye's ray is traced through it -- refracted into the water at the
 *    face's slope, carried through the flat water-glass and glass-air faces
 *    by the tangential n sin(theta), across the glass's thickness and on
 *    to the scene (effects/water/lens, its JS twin). The scene is the
 *    photograph, a gap behind the glass: the same distance the glass's
 *    refraction, the floor light and the shadows use (pane causes; rain
 *    W1, docs/rain-system.md 3.1 -- it was a world 900 px away, which no
 *    other part of the engine agreed with). Each drop images it upside
 *    down, shrunk a few times for a bead, magnified for a big flat drop.
 *    Wet etched glass is clear (water-drops 9.1: water fills the
 *    roughness), so what it lands on is the photograph itself, sharp,
 *    looked up at the drop's own footprint, through the same glass (its
 *    saturate and its fill, minus the blur). The photograph's bright spots
 *    (its lights) are carried through each lens at their own brightness,
 *    so every drop sparkles with them. Fresnel reflects the room at each
 *    point's slant and every light puts its own highlight on every drop.
 */

import { ENVIRONMENT_GLSL } from "@fx/effects/optics/environment.glsl";
import { CAMERA_MATCH_GLSL } from "@fx/effects/light/camera-match";
import { BACKLIT_GLSL } from "@fx/effects/optics/backlit.glsl";

/** The drops map's full scale in RGBA8, mm (an 8-bit step is 11.8 um); a half-float map holds mm as they are. */
export const HEIGHT_MAX = 3;
/** The droplet map's full scale, mm: droplets are under 0.3 mm tall, and 2 um a step keeps their slopes smooth. */
export const DROPLET_HEIGHT_MAX = 0.5;

export const MAP_VERTEX = /* glsl */ `
attribute vec2 aPos;      // map px
attribute vec2 aLocal;    // the drop's own frame: x across, y down the glass, 1 = contact radius
attribute vec4 aDrop;     // contact radius mm, cap height mm, seed, liquid id
attribute vec3 aShape;    // irregularity, pear taper, sag
attribute vec2 aExtra;    // x: how much of the drawn drop is really there (a sparkle smaller than it is drawn); y: unused
attribute vec4 aOutA;     // a merged drop's outline: harmonics 1 and 2 (cos, sin), against its mean radius
attribute vec4 aOutB;     // harmonics 3 and 4
uniform vec2 uMapSize;    // map px
varying vec2 vLocal;
varying vec4 vDrop;
varying vec3 vShape;
varying float vCoverScale;
varying vec4 vOutA;
varying vec4 vOutB;
void main() {
  vLocal = aLocal;
  vOutA = aOutA;
  vOutB = aOutB;
  vDrop = aDrop;
  vShape = aShape;
  vCoverScale = aExtra.x;
  vec2 clip = aPos / uMapSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y, 0.0, 1.0);
}
`;

/** The contact line and the cap, shared by the map and the wipe. */
const SHAPE_GLSL = /* glsl */ `
varying vec4 vOutA;
varying vec4 vOutB;
/*
 * A merged drop's outline (DropSim parts): the union of its lobes' contact
 * circles as a radius round the drop, kept to its first four harmonics. The
 * truncation is surface tension's own smoothing -- the necks between lobes
 * fill, the cusps round -- so the drop is one liquid surface over a peanut,
 * a clover or a lumpy blob, not circles laid over each other.
 */
float outline(float ang) {
  return 1.0
    + vOutA.x * cos(ang) + vOutA.y * sin(ang)
    + vOutA.z * cos(2.0 * ang) + vOutA.w * sin(2.0 * ang)
    + vOutB.x * cos(3.0 * ang) + vOutB.y * sin(3.0 * ang)
    + vOutB.z * cos(4.0 * ang) + vOutB.w * sin(4.0 * ang);
}
/*
 * What the reference photographs show, drop by drop (Ony's six, zoomed):
 * a pinned contact line is not a smooth blob. Big drops have straight runs
 * and hard corners where the line caught on a defect (a wedge, a "D" with a
 * flat top, a lopsided pentagon); many have a point drawn out upward, where
 * the top of the line stayed pinned as the drop sagged (one tail, sometimes
 * two, a little off vertical); some are dented in on one side (beans,
 * kidneys). Droplets stay round. So the line is: the harmonic wobble, then a
 * polygon of 3-6 pinned corners, then sharp tails up and soft dents, all by
 * how big the drop is (its irregularity) and its own seed.
 * gTail: how much of the radius here is tail, so the cap thins along it.
 */
float gTail = 1.0;
/* The radius for the cap's height: the line itself at the edge, rounding to the smooth line inward (surface tension keeps the water's surface smooth even where its edge has corners). */
float gRhoH = 0.0;
float dAng(float a, float b) { return mod(a - b + 3.14159265, 6.2831853) - 3.14159265; }
// How far out this point is, 1 on the contact line.
float contactRho(vec2 p, vec3 shape, float seed) {
  /*
   * Each drop its own amount of mess (Ony, 2026-10-10: "not enough of the very
   * misshapen ones ... too much similarity"): the irregularity a drop's size
   * gives it, times a factor of its own -- most a little smoother or rougher,
   * one in three far rougher, its line caught on more specks.
   */
  float hm = fract(seed * 0.9162278 + 0.29);
  shape.x *= 0.55 + 0.9 * hm + 1.5 * smoothstep(0.6, 0.95, hm) * smoothstep(0.04, 0.08, shape.x);
  /*
   * And not all round in plan: drops that merged sideways or were caught
   * across lie as ovals and slanted blobs, drawn out along an axis of their
   * own (no more than the line's roughness allows: a droplet stays round).
   */
  float hs = fract(seed * 0.3266407 + 0.61);
  // Never lying flat across: a wide flat lozenge read as the flat-bottomed drop again.
  float sAng = 0.55 + fract(seed * 0.1547005 + 0.07) * 2.04;
  float sAmt = min(shape.x * 4.0, 1.0) * 0.4 * hs * hs;
  vec2 sAx = vec2(cos(sAng), sin(sAng));
  float sAl = dot(p, sAx);
  p = p + sAx * sAl * (1.0 / (1.0 + sAmt) - 1.0);
  /*
   * The pear: narrower toward the top (y < 0), as gravity holds the advancing
   * edge below -- and only the top narrows. Widening the bottom half as well
   * gave the big drops a broad, flat-bottomed belly, the same helmet on
   * every one (Ony, 2026-10-10: "really wide drops that are pretty dang flat
   * on the bottom"); the bottom of a hanging drop is a full round arc.
   */
  float wf = max(1.0 + shape.y * min(p.y, 0.0) * (0.6 + 0.8 * fract(seed * 0.5115) ), 0.35);
  vec2 q = vec2(p.x / wf, p.y);
  float ang = atan(q.y, q.x);
  float s1 = fract(seed * 0.6180339) * 6.2831853;
  float s2 = fract(seed * 0.7548777) * 6.2831853;
  float s3 = fract(seed * 0.5698403) * 6.2831853;
  float rc = (1.0 + shape.x * (0.55 * cos(2.0 * ang + s1) + 0.3 * cos(3.0 * ang + s2) + 0.15 * cos(4.0 * ang + s3)))
    * max(outline(atan(p.y, p.x)), 0.2);
  // How far this drop is from round: nothing for a droplet, all of it for a big pinned drop.
  float ch = smoothstep(0.075, 0.135, shape.x);
  float rc0 = rc;
  if (ch > 0.0) {
    float h4 = fract(seed * 0.3819660 + 0.11);
    float h5 = fract(seed * 0.8164966 + 0.37);
    float h6 = fract(seed * 0.4142136 + 0.53);
    float h7 = fract(seed * 0.7320508 + 0.71);
    float h8 = fract(seed * 0.2360680 + 0.19);
    float h9 = fract(seed * 0.6457513 + 0.83);
    /*
     * Pinned corners: 3 to 6 of them round the line, each caught at its own
     * distance, the edges straight between them: lopsided, never a regular
     * polygon (the second photograph's wedges and flat-topped drops).
     */
    float n = 3.0 + floor(h4 * 4.0);
    float seg = 6.2831853 / n;
    float a0 = ang - h5 * 6.2831853;
    float k = floor(mod(a0, 6.2831853) / seg);
    float t = mod(a0, seg) / seg;
    float rA = 0.8 + 0.4 * fract(sin((k + seed) * 12.9898) * 43758.5453);
    float rB = 0.8 + 0.4 * fract(sin((mod(k + 1.0, n) + seed) * 12.9898) * 43758.5453);
    // The straight edge from corner A to corner B, in polar form.
    float th = t * seg;
    vec2 A = vec2(rA, 0.0);
    vec2 B = rB * vec2(cos(seg), sin(seg));
    vec2 e = B - A;
    vec2 dirv = vec2(cos(th), sin(th));
    float poly = (A.x * e.y - A.y * e.x) / max(dirv.x * e.y - dirv.y * e.x, 1e-3);
    /*
     * From 117 photographs (docs/rain-reference-catalogue.md): the line's
     * irregularity sits on its UPPER edge -- flat or dented tops, corners,
     * horns, tips -- while the lower edge stays a smooth full arc (32 photos
     * against 12 the other way). up: 1 across the top half, 0 at the bottom.
     */
    float up = smoothstep(0.35, -0.55, sin(ang));
    float angular = ch * (0.55 + 0.45 * h6) * step(0.3, h7);
    rc *= mix(1.0, poly, 0.75 * angular * mix(0.12, 1.0, up));
    // Dents in the top edge (kidneys, beans, bitten tops): on most big drops, a second on some.
    float d1 = -1.5707963 + (h6 - 0.5) * 2.2;
    rc *= 1.0 - ch * step(h9, 0.6) * 0.3 * exp(-pow(dAng(ang, d1) / 0.42, 2.0));
    rc *= 1.0 - ch * step(h7, 0.3) * 0.22 * exp(-pow(dAng(ang, d1 + (h5 > 0.5 ? 1.0 : -1.0)) / 0.35, 2.0));
    /*
     * Tips where the top of the line stayed pinned as the drop sagged: a
     * teardrop's tip up (43 photos against 16 for tip-down), sometimes two
     * horns (a tulip), sharp at the tip. A tip down only on the odd drop
     * about to slide.
     */
    float body = rc;
    // Tips sharp on some, blunt nubs on others, and not on most: one sharp kiss-shaped tip on every big drop read as a stamp.
    float w = 0.1 + 0.4 * h5 * h5;
    float len = ch * (0.2 + 0.6 * h9 * h9);
    float p1 = -1.5707963 + (h8 - 0.5) * 1.5;
    rc += len * step(0.62, h8) * exp(-abs(dAng(ang, p1)) / w);
    float p2 = p1 + (h4 > 0.5 ? 1.0 : -1.0) * (0.7 + 0.5 * h7);
    rc += 0.75 * len * step(h6, 0.3) * exp(-abs(dAng(ang, p2)) / (0.8 * w));
    rc += 0.5 * len * step(h9, 0.1) * exp(-abs(dAng(ang, 1.5707963 + (h7 - 0.5) * 0.6)) / (0.8 * w));
    gTail = body / rc;
  }
  float rho = length(q) / rc;
  gRhoH = length(q) / mix(rc0, rc, pow(min(rho, 1.0), 4.0));
  return rho;
}
`;

export const MAP_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vLocal;
varying vec4 vDrop;
varying vec3 vShape;
varying float vCoverScale;
uniform float uHeightScale;  // 1 / full scale, mm
uniform float uPxPerMm;      // map px per mm
uniform float uSlopeOut;     // 1: the drops map (liquid in g, the surface's slope in b); 0: the droplets map
${SHAPE_GLSL}
void main() {
  float a = vDrop.x;
  float h0 = vDrop.y;
  float rho = contactRho(vLocal, vShape, vDrop.z);
  // The contact line, antialiased over one map pixel.
  float cover = clamp(0.5 + (1.0 - rho) * a * uPxPerMm, 0.0, 1.0);
  if (cover <= 0.0) discard;
  /*
   * The surface over the line is smooth even where the line has corners
   * (Ony, 2026-10-10, the drop page close up: big drops looked crumpled,
   * folded, creased from the middle to every corner and tip). The cap's
   * height reads the line's radius at its own angle, and a corner or a
   * tip's point there is a kink in that radius -- a fold running in from
   * it, invisible a few pixels across, glaring at 24 px a mm. A drop drawn
   * big reads the radius blurred round the angle (a tent over +-0.2 rad),
   * so the water bends smoothly into each corner instead of folding.
   */
  if (a * uPxPerMm > 14.0) {
    float hr = 3.0 * gRhoH;
    float ht = 3.0 * gTail;
    float wsum = 3.0;
    for (int k = 1; k <= 2; k++) {
      float d = 0.1 * float(k);
      float wk = 3.0 - float(k);
      float c = cos(d);
      float sn = sin(d);
      contactRho(vec2(c * vLocal.x - sn * vLocal.y, sn * vLocal.x + c * vLocal.y), vShape, vDrop.z);
      hr += wk * gRhoH;
      ht += wk * gTail;
      contactRho(vec2(c * vLocal.x + sn * vLocal.y, -sn * vLocal.x + c * vLocal.y), vShape, vDrop.z);
      hr += wk * gRhoH;
      ht += wk * gTail;
      wsum += 2.0 * wk;
    }
    gRhoH = hr / wsum;
    gTail = ht / wsum;
  }
  // A droplet smaller than it is drawn covers only its share of the pixels it is drawn on.
  cover *= vCoverScale;
  // A spherical cap over the (irregular) contact line: R = (a^2 + h0^2) / 2 h0.
  float R = (a * a + h0 * h0) / max(2.0 * h0, 1e-5);
  float r = min(gRhoH, 1.0) * a;
  float h = sqrt(max(R * R - r * r, 0.0)) - (R - h0);
  // Deeper toward the bottom (gravity), the volume kept: 1 + sag y.
  h = max(h, 0.0) * (1.0 + vShape.z * clamp(vLocal.y, -1.0, 1.0));
  // Along a tail the water is a thread, thinner than the drop it hangs from.
  h *= gTail;
  float blood = abs(vDrop.w - 1.0) < 0.5 ? cover : 0.0;
  float slime = abs(vDrop.w - 2.0) < 0.5 ? cover : 0.0;
  if (uSlopeOut > 0.5) {
    /*
     * The surface's slope, exact (water-drops 9.5c): tan of its tilt,
     * r / sqrt(R^2 - r^2), reaching the contact angle at the edge. The
     * compose step's finite difference over the map's pixels cannot: across
     * a drop of a millimetre (8 map px at 2x) it averages the steep last
     * tenth of the radius with the flat glass outside and tops out near 38
     * deg (31 at 1x), short of the 41-50 deg where water-to-air reflection
     * climbs to total -- so no drop had the bright ring a lit one has. The
     * liquid moves to g (0 water, 0.5 blood, 1 slime) to make room.
     */
    float tanT = r / max(sqrt(max(R * R - r * r, 0.0)), 1e-4) * (1.0 + vShape.z * clamp(vLocal.y, -1.0, 1.0)) * gTail;
    gl_FragColor = vec4(h * uHeightScale, 0.5 * clamp(vDrop.w, 0.0, 2.0) * cover, min(tanT, 3.9) * 0.25 * cover, cover);
    return;
  }
  gl_FragColor = vec4(h * uHeightScale, blood, slime, cover);
}
`;

/**
 * The wipe: drawn with blend (ZERO, ONE_MINUS_SRC_ALPHA) into the droplet
 * map it clears what it covers; with (ONE, ONE) into the wet map it wets.
 * A capsule: the drop's footprint swept from where it was to where it is.
 */
export const WIPE_VERTEX = /* glsl */ `
attribute vec2 aPos;    // map px
attribute vec2 aLocal;  // along the sweep (x, 0 to len), across (y, -1 to 1 = the radius)
attribute float aLen;   // the sweep's length in radii
attribute float aR;     // the sweep's radius, map px
uniform vec2 uMapSize;
varying vec2 vLocal;
varying float vLen;
varying float vR;
void main() {
  vLocal = aLocal;
  vLen = aLen;
  vR = aR;
  vec2 clip = aPos / uMapSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y, 0.0, 1.0);
}
`;

export const WIPE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vLocal;
varying float vLen;
varying float vR;
uniform float uSoft;    // the edge's softness, in radii
uniform vec4 uColour;
uniform float uMapPxPerMm; // map px per mm, to write a stream's half-width in mm
void main() {
  float x = clamp(vLocal.x, 0.0, vLen);
  float d = length(vec2(vLocal.x - x, vLocal.y));
  /*
   * A rivulet's cross-section is a circular cap (surface tension, Bond number
   * well under one across its width): highest on its centre line, falling to
   * the contact line at its edge, approximated by 1 - d^2. uSoft only rounds
   * the last stretch so the map's filtering doesn't step there.
   */
  float a = (1.0 - d * d) * (1.0 - smoothstep(1.0 - 0.25 * uSoft, 1.0, d) * 0.3);
  if (a <= 0.0) discard;
  /*
   * B carries how close this point is to the stream's centre line (1 on it,
   * 0 at the contact line) for a clear line's rivulet (uColour.b 1): under MAX
   * blending the nearest centre line wins, so the compose pass knows where
   * across the stream every point is, whatever its width.
   */
  /*
   * A carries a standing stream's half-width, mm (capped at 1): its height
   * follows its width (Wilson & Duffy: h = tan(beta) w / 4 for a rivulet on a
   * vertical plate), so the beads are tall and the necks thin
   * (docs/research-streams.md 5.3). Flat across the capsule; MAX keeps the
   * widest where streams cross.
   */
  // Half-width / 2 (up to 2 mm): capped at 1 mm, every wider stretch drew at one width -- parallel edges, a rod.
  float widthMm = uColour.b > 0.0 ? clamp(vR / uMapPxPerMm * 0.5, 0.0, 1.0) : uColour.a * a;
  gl_FragColor = vec4(uColour.rg * a, uColour.b * (1.0 - d), widthMm);
}
`;

/** A full-map quad that takes a constant off (blend REVERSE_SUBTRACT): drying, evaporating. */
export const FADE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec4 uColour;
void main() { gl_FragColor = uColour; }
`;

export const COMPOSE_VERTEX = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/*
 * The lens map (rain W2, docs/rain-system.md 3.2; effects/water/lens-map):
 * the pattern each drop's lens throws onto the print behind the glass, for
 * the lamp, as a factor on the lamp's light there: E = r + 8 g, 1 where no
 * drop lies. One sprite per drop, centred where the lamp's ray through the
 * drop lands, as wide as the pattern (LENS_RHO_MAX contact radii), reading
 * the traced profile in the lookup table (tools/water/drop_lens_lut.py: rows
 * are the gap over the drop's focal length, tiles the lamp's penumbra).
 */
export const LENS_RHO_MAX = 4;
export const LENS_LUT_ROWS = 48;
export const LENS_LUT_TILES = 4;
export const LENS_LUT_RATIO_MIN = 0.25;
export const LENS_LUT_RATIO_MAX = 16;
export const LENS_LUT_PENUMBRAS = [0, 0.5, 1, 2] as const;

export const LENS_VERTEX = /* glsl */ `
attribute vec2 aPos;      // viewport CSS px
attribute vec2 aLocal;    // the sprite's own frame, in contact radii on the print
attribute vec2 aLens;     // x: the lookup row, 0..1 (gap over focal length); y: the penumbra tile, 0..3
uniform vec2 uViewport;   // CSS px
varying vec2 vLocal;
varying vec2 vLens;
void main() {
  vLocal = aLocal;
  vLens = aLens;
  gl_Position = vec4(aPos.x / uViewport.x * 2.0 - 1.0, 1.0 - aPos.y / uViewport.y * 2.0, 0.0, 1.0);
}
`;

export const LENS_FRAGMENT = /* glsl */ `
precision mediump float;
varying vec2 vLocal;
varying vec2 vLens;
uniform sampler2D uLut;
uniform float uLoss;      // 1: this pass writes what the drop takes away (subtracted); 0: what it adds (added)
const float RHO_MAX = ${LENS_RHO_MAX.toFixed(1)};
const float ROWS = ${LENS_LUT_ROWS.toFixed(1)};
const float TILES = ${LENS_LUT_TILES.toFixed(1)};
/*
 * Drops' patterns ADD where they overlap (Ony, 2026-10-10: "the shadows cast
 * seem to have invisible circles around them cutting other shadows off"):
 * each drop moves light about, so where two patterns overlap the print gets
 * both changes -- 1 + the sum of (E - 1). Drawn "over", a sprite replaced
 * everything in its square with its own pattern (1 at its edge), erasing
 * its neighbours' shadows and focus spots in a circle round it. Now the
 * light a drop takes away is subtracted from the map's r and the light it
 * gathers added to its g (E = r + 8 g), in two passes.
 */
void main() {
  float rho = length(vLocal);
  float v = (vLens.y * ROWS + vLens.x * (ROWS - 1.0) + 0.5) / (ROWS * TILES);
  vec4 l = texture2D(uLut, vec2(min(rho / RHO_MAX, 1.0), v));
  float E = l.r + 8.0 * l.g;
  // Past the pattern's reach it changes nothing: faded out over its last half radius.
  float fade = 1.0 - smoothstep(RHO_MAX - 0.5, RHO_MAX, rho);
  /*
   * The lookup's far rows carry a faint even brightening (a few per cent)
   * right out to its edge, where the fade cut it off as a pale ring -- a
   * circle round every drop. That spill-over glow tapers to nothing from
   * half the reach out instead.
   */
  float halo = 1.0 - smoothstep(0.5 * RHO_MAX, RHO_MAX, rho);
  if (uLoss > 0.5) gl_FragColor = vec4(max(1.0 - E, 0.0) * fade, 0.0, 0.0, 0.0);
  else gl_FragColor = vec4(0.0, max(E - 1.0, 0.0) / 8.0 * mix(halo, fade, smoothstep(0.08, 0.3, E - 1.0)), 0.0, 0.0);
}
`;

/*
 * The rivulets' focus lines (rain W2): the film a runner leaves stands as a
 * low ridge of water, a cylinder lens across its width. Light through it
 * is gathered toward a line a little past the ridge and taken from the
 * ridge's flanks: a bright line with dark edges that wanders with the
 * trail. Drawn into the lens map over each pane before the drops' sprites:
 * each point of the print gathers from the glass point whose ray from the
 * lamp lands on it, and the light there is spread or gathered by the
 * ridge's curvature, E = 1 / |det(I + D (n - 1) H)|, H the height's second
 * differences (a thin lens; D the print's distance). Pure water, no colour.
 */
export const RIVULET_LENS_VERTEX = /* glsl */ `
attribute vec2 aPos;      // the pane's corners, viewport CSS px
attribute vec2 aUv;
uniform vec2 uViewport;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos.x / uViewport.x * 2.0 - 1.0, 1.0 - aPos.y / uViewport.y * 2.0, 0.0, 1.0);
}
`;

export const RIVULET_LENS_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uWet;       // the pane's wet map, R wetness
uniform vec2 uWetTexel;       // one texel, uv
uniform float uRivulet;       // sin of the angle a stream's edge meets the glass at (its cross-section is a circular arc)
uniform float uMmPerTexel;    // mm per wet-map texel
uniform float uBend;          // D (n - 1), mm: the print's distance times the water's bending
uniform float uStep;          // the stencil the curvature is taken over, texels: the lamp's penumbra, at least 1.5
/*
 * A drying thread of water breaks up (Rayleigh-Plateau: a thread pinches
 * into beads about 4.5 widths apart, Ony 2026-10-03: tails that "separate
 * randomly"): fresh, the wet track is a continuous line; as it thins, it
 * parts into a string of beads, then only the beads are left. A fixed
 * pattern of pinch points along the glass (cells THREAD_MM across), the
 * thinner the film the more of them opened.
 */
float threadHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float threadNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(threadHash(i), threadHash(i + vec2(1.0, 0.0)), f.x),
             mix(threadHash(i + vec2(0.0, 1.0)), threadHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float threadH(float wet, vec2 uv, vec2 texel) {
  // Pinch points about 1.2 mm apart along the run, at this map's own scale.
  vec2 cell = uv / (texel * 6.0);
  float n = threadNoise(vec2(cell.x * 0.35, cell.y));
  // Only a thinning, drying thread pinches into beads; a standing rivulet is whole.
  float held = max(smoothstep(0.25 - 0.9 * (wet - 0.25), 0.55 - 0.9 * (wet - 0.25), n), smoothstep(0.25, 0.4, wet));
  /*
   * The wet map holds the rivulet's own cross-section (a rounded cap, see
   * WIPE_FRAGMENT), so the height follows it linearly: round across, never a
   * flat-topped bar. A dried trace (below 0.15) stands no water.
   */
  // Only a gentle unevenness along it: the width comes from the stream itself (thin at its top, wider down).
  // No noise in the body of a stream (Ony, 2026-10-11: "the grain inside streams"): its swells are the sim's (streamWidth), not a texture.
  float swell = 1.0;
  /*
   * Smooth: no per-texel noise on the edge (Ony, 2026-10-04: the streams
   * read as grainy sand -- fine noise at the map's own texel scale, then
   * magnified by the lens, turned the whole stream to grit). A rounded cap,
   * body (2 - body): steep near its edge, flat on top, smooth everywhere.
   */
  float body = max(wet * swell - 0.15, 0.0) / 0.85;
  /*
   * As a stream drains it does not fade: it pinches into sections (Ony,
   * 2026-10-10), each stretch going where the thread's own unevenness
   * necks it first, a few millimetres apart -- what is left of each pulls
   * into the beads the sim laid there (DropSim.shedTrail), which show as
   * the water round them goes (below DropSim.TAKES_AT, 0.3).
   */
  float neck = threadNoise(vec2(cell.x * 0.25 + 41.0, cell.y * 0.45));
  float lasts = smoothstep(0.2 + 0.18 * neck, 0.28 + 0.18 * neck, wet);
  return body * (2.0 - body) * mix(0.15, 1.0, held) * lasts;
}
float ridge(vec2 uv) {
  vec4 w = texture2D(uWet, uv);
  float d = 1.0 - w.b;
  float s = uRivulet;  // sin of the stream's edge angle
  float arc = sqrt(max(1.0 / (s * s) - d * d, 0.0)) - sqrt(1.0 - s * s) / s;
  float level = clamp(threadH(w.g, uv, uWetTexel) / max(1.0 - d * d, 0.05), 0.0, 1.0);
  return max(w.a * 2.0, 0.15) * max(arc, 0.0) * level;
}
// The ridge seen through the lamp's penumbra: a small blur, so the wet map's half-resolution stairs never reach the print.
float soft(vec2 uv, vec2 tx, vec2 ty) {
  return (4.0 * ridge(uv) + ridge(uv + tx * 0.5) + ridge(uv - tx * 0.5) + ridge(uv + ty * 0.5) + ridge(uv - ty * 0.5)) / 8.0;
}
void main() {
  // The quad is the pane as the lamp projects it onto the print, so the interpolated uv IS the glass point whose ray lands here.
  vec2 q = vUv;
  /*
   * The curvature over the lamp's penumbra, not one texel (Ony, 2026-10-10:
   * stream shadows as jagged black broken lines): a lamp has size, so the
   * print sees the ridge's bending averaged over the patch of glass its
   * penumbra spans -- one-texel differences of a half-resolution map were
   * a staircase, and a thin stream's huge single-texel curvature went black.
   */
  vec2 tx = vec2(uWetTexel.x * uStep, 0.0);
  vec2 ty = vec2(0.0, uWetTexel.y * uStep);
  float h0 = soft(q, tx, ty);
  float wet = max(max(texture2D(uWet, q).g, texture2D(uWet, q + tx).g), texture2D(uWet, q - tx).g);
  if (wet < 0.08) discard;
  float d2 = uMmPerTexel * uMmPerTexel * uStep * uStep;
  float hxx = (soft(q + tx, tx, ty) - 2.0 * h0 + soft(q - tx, tx, ty)) / d2;
  float hyy = (soft(q + ty, tx, ty) - 2.0 * h0 + soft(q - ty, tx, ty)) / d2;
  float hxy = (soft(q + tx + ty, tx, ty) - soft(q + tx - ty, tx, ty) - soft(q - tx + ty, tx, ty) + soft(q - tx - ty, tx, ty)) / (4.0 * d2);
  float a = 1.0 + uBend * hxx;
  float b = uBend * hxy;
  float c = 1.0 + uBend * hyy;
  float det = abs(a * c - b * b);
  // Past the focus the light crosses and spreads again: the same thin-lens factor, never a singular line (a lamp has size).
  // A water ridge bends light aside, it does not block it: its shadow is a dimming, never black.
  float E = clamp(1.0 / max(det, 0.3), 0.45, 3.0);
  float alpha = smoothstep(0.08, 0.3, wet);
  gl_FragColor = vec4(min(E, 1.0), clamp((E - 1.0) / 8.0, 0.0, 1.0), 0.0, alpha);
}
`;

export const MAX_WATER_LIGHTS = 4;
/** The photograph's own lights (PhotoLights) a drop can carry through its lens. */
export const MAX_WATER_EMITTERS = 4;

export const COMPOSE_FRAGMENT = /* glsl */ `
precision highp float;
${ENVIRONMENT_GLSL}
${CAMERA_MATCH_GLSL}
${BACKLIT_GLSL}
uniform float uBacklitGain;   // the backlight shone into the panes' edges (effects/optics/backlit), 0 off
uniform float uBacklitEdge;
uniform float uBacklitFill;
uniform vec3 uBacklitColour;
uniform float uFrost;         // the pane's frost, 0-1
uniform vec3 uGrazeA;         // the grazing laser (in the drops' plane): its start, page px, and on (z > 0.5)
uniform vec3 uGrazeB;         // its direction (xy, unit) and width, px (z)
uniform vec3 uGrazeColour;    // its colour times its power
uniform vec2 uGrazeBlock[24]; // the drops along it: how far along each one's far rim is, px, and how much of the beam is left past it
uniform sampler2D uDrops;     // the drops map
uniform vec2 uDropsUv;        // how much of the drops texture this pane uses
uniform vec2 uDropsTexel;     // one texel, in uv
uniform float uDropsFull;     // its full scale, mm (1 for a half-float map, which holds mm)
uniform sampler2D uDroplets;  // the droplet map (this pane's own)
uniform vec2 uDropletsTexel;
uniform sampler2D uWet;       // the wet map: R wetness 0-1
uniform sampler2D uPhoto;     // the photograph behind the pane (mipmapped)
uniform float uHasPhoto;
uniform vec4 uImage;          // where the photograph is drawn, page px
uniform vec3 uImageFit;       // its aspect and object-position
uniform vec4 uPane;           // the pane's x, y, w, h, page px
uniform float uScale;         // device px per CSS px
uniform float uPxPerMm;       // CSS px per mm
uniform float uThickness;     // the glass, CSS px
uniform float uSkyAbove;      // the light above the scene the drops look up at (Lab: Light above the window)
uniform float uScene;         // how far behind the glass the scene the drops image is, CSS px
uniform float uRivEdgeSin;    // sin of the angle a stream's edge meets the glass at (Lab: Beading, times RIVULET_EDGE_SHARE)
uniform float uDebug;         // dev rigs only: 1 = show the water's height, slope and sky share as colour
uniform float uTime;          // seconds, for the waves running down a flowing stream
uniform float uStreamFlow;    // how fast those waves run, mm/s
uniform vec2 uWetTexel;       // one wet-map texel, in uv
uniform sampler2D uFog;       // the condensation map: R how far it has built up
uniform float uFogAmount;     // its full density, 0-1
uniform float uFogSide;       // 0: on the rain's face (wiped by it); 1: on the other face (veiling it)
uniform float uSamples;       // samples a pixel where there is water: 1, or 4 (rotated grid)
uniform float uClear;         // 1: the water clears the etch (rain on the etched face); 0: on the polished face, reflections only
uniform float uIor;
uniform float uGlassIor;
uniform float uSaturate;      // the pane's own saturate()
uniform vec4 uFill;           // the pane's fill colour and its alpha
uniform vec3 uRoom;
uniform sampler2D uRoomTex;
uniform float uHasRoom;
uniform float uRoomExposure;
uniform vec2 uViewCentre;     // page px
uniform float uCameraDistance; // CSS px
uniform vec3 uSigmaBlood;
uniform vec3 uSigmaSlime;
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_WATER_LIGHTS}];
uniform vec3 uLightColour[${MAX_WATER_LIGHTS}];
uniform float uLightRadius[${MAX_WATER_LIGHTS}];
uniform float uLightFloor[${MAX_WATER_LIGHTS}];  // each lamp's light on the photograph straight under it, as the floor light draws it
uniform vec3 uLightTint[${MAX_WATER_LIGHTS}];    // each lamp's colour, unweighted
uniform float uRoomFill;      // the floor light's room fill: how dark the room goes while a lamp burns
uniform float uBurning;       // the strongest lamp's charge
uniform sampler2D uFloorMap;  // the floor light's own output this frame (effects/light/floor-map): colour over alpha
uniform sampler2D uType;      // the copy printed on the glass's near face (effects/engine/type-layer), pane-local, premultiplied
uniform float uHasType;
uniform float uFrostLod;      // how blurred the frosted far face shows the photograph: a mip level
uniform float uHasFloorMap;
uniform vec2 uFloorSize;      // the viewport it covers, CSS px
uniform float uNear;          // 1: the rain is on the near face of clear glass (you see each drop's outer surface)
uniform float uFrosted;       // 1: the pane is frosted (its etch glows where a lamp lights it)
uniform vec2 uPhotoTexels;    // the photograph's texture, texels
uniform int uEmitCount;
uniform vec3 uEmitPos[${MAX_WATER_EMITTERS}];    // the photograph's lights: page x, y and radius, px
uniform vec3 uEmitColour[${MAX_WATER_EMITTERS}]; // their radiance above the white the print clipped them to
const float DROPLET_FULL = ${DROPLET_HEIGHT_MAX.toFixed(2)};
/*
 * A lamp's core against the white of what it lights, for a lamp 16 px
 * across (estimate: a bulb or LED core is hundreds to thousands of times
 * brighter than a lit wall; 400 makes a 2% water reflection of it clip, as
 * it does in every photograph of a lamp over wet glass).
 */
const float LAMP_CORE = 400.0;
/* How bright the dry frost glows straight under a lamp, against the lamp's colour (estimate, matched to the light layer's glow). */
const float FROST_GLOW = 1.5;
/*
 * A sight line trapped in the glass meets the frost from inside, at grazing,
 * where the etch scatters most: in the reference the ring this makes at 70-90%
 * of a drop's radius is 1.5-2.2 times the frost beside it (2, calibrated).
 */
const float TRAPPED_GAIN = 2.0;
/* How far the etch spreads the light it passes on, rad inside the glass (estimate: an acid-etched face's haze lobe). */
const float ETCH_LOBE = 0.18;
/* What the etch still sends sideways, against straight ahead (estimate): seen through a drop's rim, the frost is this dim -- the drop's dark edge. */
const float ETCH_DIFFUSE = 0.3;
/* The camera's bloom round a glint: how wide against the glint, and what share of its light (estimate). */
const float BLOOM_WIDTH = 4.0;
const float BLOOM_SHARE = 0.04;

/*
 * The photograph at an explicit mip level (rain W1, the sharp lookup). A
 * texture2D here takes its level from the screen-space derivatives, which a
 * lens's view through a drop makes meaningless (and inside this shader's
 * branches they are undefined): the level came out several steps too coarse
 * and every drop held one muddy average of half the picture. With the
 * extension (WaterDrops asks for it) the level is the drop's own footprint;
 * without it, the base texture2D.
 */
#ifdef HAS_TEXTURE_LOD
vec3 photoLod(vec2 uv, float lod) { return texture2DLodEXT(uPhoto, uv, lod).rgb; }
#else
vec3 photoLod(vec2 uv, float lod) { return texture2D(uPhoto, uv).rgb; }
#endif

vec2 coverUv(vec2 pt, vec4 image, vec3 fit) {
  vec2 rel = (pt - image.xy) / max(image.zw, vec2(1.0));
  float aspect = fit.x;
  float boxAspect = image.z / max(image.w, 1.0);
  vec2 scale = boxAspect > aspect ? vec2(1.0, boxAspect / aspect) : vec2(aspect / boxAspect, 1.0);
  return (rel - fit.yz) / scale + fit.yz;
}

/*
 * The copy printed on the glass's near face, at a page point (Ony,
 * 2026-10-02: the letters "directly on the glass", the drops "on top of the
 * letters magnifying the part that it's on"). Premultiplied, as the canvas
 * came up; nothing outside the pane.
 */
vec4 typeAt(vec2 page) {
  if (uHasType < 0.5) return vec4(0.0);
  vec2 uv = (page - uPane.xy) / uPane.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uType, uv);
}

// A colour with the type laid over it (premultiplied type).
vec3 overType(vec3 c, vec4 ty) { return c * (1.0 - ty.a) + ty.rgb; }

/*
 * The copy printed on the near face, when the rain (and its condensation)
 * is on the far face: in front of all of it, seen flat. The water layer lies
 * above the page's own copy, so whatever it draws -- a drop, a wet track,
 * the fog -- must carry the letters on top, or they vanish under it (Ony,
 * 2026-10-03: the words "completely disappear and can only be seen if a
 * raindrop is on it"). Rain on the near face sits on the letters instead.
 */
vec4 copyInFront(vec4 c, vec2 page) {
  if (uHasType < 0.5 || uNear > 0.5 || uClear < 0.5) return c;
  vec4 ty = typeAt(page);
  float a = c.a + ty.a * (1.0 - c.a);
  return vec4(overType(c.rgb * c.a, ty) / max(a, 1e-4), a);
}

// The photograph as the frosted far face shows it: blurred to the frost, saturated, veiled by the fill.
vec3 frostedAt(vec2 page) {
  if (uHasPhoto < 0.5) return uRoom;
  vec3 c = photoLod(clamp(coverUv(page, uImage, uImageFit), 0.0, 1.0), uFrostLod);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturate), 0.0, 1.0);
  return mix(c, uFill.rgb, uFill.a);
}

/*
 * The frosted far face as the pane around a drop shows it: the photograph at
 * the frost's blur, lit as the floor light lit it this frame (its own output,
 * as a clear spot reads it), saturated and veiled by the fill. Without the
 * floor's light every drop on the near face was a darker patch of the pane.
 */
vec3 frostedLit(vec2 page) {
  if (uHasPhoto < 0.5) return uRoom;
  vec3 c = photoLod(clamp(coverUv(page, uImage, uImageFit), 0.0, 1.0), uFrostLod);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturate), 0.0, 1.0);
  if (uHasFloorMap > 0.5) {
    vec4 f = texture2D(uFloorMap, clamp(vec2(page.x / uFloorSize.x, 1.0 - page.y / uFloorSize.y), 0.0, 1.0));
    c = c * (1.0 - f.a) + f.rgb * f.a;
  }
  return mix(c, uFill.rgb, uFill.a);
}

// The photograph as the pane shows it through clear glass: saturated and veiled by the glass's own fill, as its frost is.
vec3 photoAt(vec2 page) {
  if (uHasPhoto < 0.5) return uRoom;
  vec3 c = texture2D(uPhoto, clamp(coverUv(page, uImage, uImageFit), 0.0, 1.0)).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturate), 0.0, 1.0);
  return mix(c, uFill.rgb, uFill.a);
}

/*
 * The photograph as a clear wet spot shows it (Ony, 2026-10-01: "Why do the
 * drops look like ink?"; 2026-10-02: "Why are the drops so dark?").
 *
 * What is behind a drop is the print, lit by the lamps: the floor light
 * draws that under the glass round the drop (lib/floor-light-shader), and
 * through the drop it must be the SAME lit print, bent by the lens. So this
 * is the floor light's own model of the lamp on the print, in its own
 * units: each lamp's irradiance falls off as cos^3 from straight under it
 * (uLightFloor carries its power and height against the defaults, its
 * charge and the "Light through glass" gain, exactly as FloorLight sends
 * them), the sum rolls off through the same film curve, and the lamps'
 * light is laid over the print as the floor does it -- toward the lamp's
 * colour, with the room fill dimming the print while a lamp burns. The
 * water used to lift the print by a third of a guessed pool instead, so
 * under a lamp every drop was a dark hole in the lit picture. (Rain W2
 * replaces this with the floor pass's own output, read back, so shadows
 * and caustics show through the drops too.)
 */
vec3 seenThroughWater(vec2 page, float lod, float footprint) {
  if (uHasPhoto < 0.5) return uRoom;
  vec3 c = photoLod(clamp(coverUv(page, uImage, uImageFit), 0.0, 1.0), lod);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturate), 0.0, 1.0);
  if (uHasFloorMap > 0.5) {
    /*
     * The floor light's own output where this lens lands (rain W2): the
     * print as the floor lit it this frame, with the glass's shadows, the
     * caustics and the other drops' shadows, composited as the floor layer
     * is over the page: photo (1 - a) + colour a.
     */
    vec4 f = texture2D(uFloorMap, clamp(vec2(page.x / uFloorSize.x, 1.0 - page.y / uFloorSize.y), 0.0, 1.0));
    c = c * (1.0 - f.a) + f.rgb * f.a;
  } else {
    // No floor this frame (the lamp off, or a frame before it drew): the floor's lamp model, the same maths.
    float e = 0.0;
    vec3 coloured = vec3(0.0);
    for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec2 dl = page - uLightPos[i].xy;
      float hz = max(uLightPos[i].z, 1.0);
      float q = hz * hz / (dot(dl, dl) + hz * hz);
      float one = uLightFloor[i] * q * sqrt(q);
      e += one;
      coloured += uLightTint[i] * one;
    }
    float E = 1.0 - exp(-e * 1.15);
    vec3 warm = e > 1e-5 ? coloured / e : vec3(1.0);
    float roomFill = mix(1.0, clamp(uRoomFill, 0.0, 1.0), uBurning);
    float m = min(1.0, roomFill + (1.0 - roomFill) * E);
    c = c * m * (1.0 - E) + warm * E;
  }
  /*
   * The photograph's lights (rain W1): a print records a lamp or a neon
   * clipped to white, but it was far brighter than white, and a drop's lens
   * keeps its brightness while it shrinks it -- so in every drop that looks
   * at one it is still a light, a sparkle. Each is drawn at its radiance,
   * spread over at least this pixel's footprint on the photograph so its
   * light is kept when it is smaller than the pixel (its area over the
   * spread's), and clipped by the camera like any glint.
   */
  for (int i = 0; i < ${MAX_WATER_EMITTERS}; i++) {
    if (i >= uEmitCount) break;
    vec2 de = page - uEmitPos[i].xy;
    float re = max(uEmitPos[i].z, 0.5);
    float w = max(re, footprint);
    c += uEmitColour[i] * (re * re) / (w * w) * exp(-dot(de, de) / (w * w));
  }
  /*
   * The glass's own tint, as the pane shows everywhere (rain W1: the water
   * itself adds no colour; it only takes away the frost). This was a third
   * of the tint, as if the fill were the frost's haze, which made every wet
   * spot a differently coloured hole in the same glass.
   */
  return mix(c, uFill.rgb, uFill.a);
}

float dropsH(vec2 uv) { return texture2D(uDrops, uv).r * uDropsFull; }
float dropletsH(vec2 uv) { return texture2D(uDroplets, uv).r * DROPLET_FULL; }
float waterH(vec2 local) {
  vec2 uvP = clamp(local / uPane.zw, 0.0, 1.0);
  return dropsH(uvP * uDropsUv) + dropletsH(uvP);
}

// A rivulet: the film a runner leaves, standing as a low ridge of water as tall as it is fresh.
/*
 * A drying thread of water breaks up (Rayleigh-Plateau: a thread pinches
 * into beads about 4.5 widths apart, Ony 2026-10-03: tails that "separate
 * randomly"): fresh, the wet track is a continuous line; as it thins, it
 * parts into a string of beads, then only the beads are left. A fixed
 * pattern of pinch points along the glass (cells THREAD_MM across), the
 * thinner the film the more of them opened.
 */
float threadHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float threadNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(threadHash(i), threadHash(i + vec2(1.0, 0.0)), f.x),
             mix(threadHash(i + vec2(0.0, 1.0)), threadHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float threadH(float wet, vec2 uv, vec2 texel) {
  // Pinch points about 1.2 mm apart along the run, at this map's own scale.
  vec2 cell = uv / (texel * 6.0);
  float n = threadNoise(vec2(cell.x * 0.35, cell.y));
  // Only a thinning, drying thread pinches into beads; a standing rivulet is whole.
  float held = max(smoothstep(0.25 - 0.9 * (wet - 0.25), 0.55 - 0.9 * (wet - 0.25), n), smoothstep(0.25, 0.4, wet));
  /*
   * The wet map holds the rivulet's own cross-section (a rounded cap, see
   * WIPE_FRAGMENT), so the height follows it linearly: round across, never a
   * flat-topped bar. A dried trace (below 0.15) stands no water.
   */
  // Only a gentle unevenness along it: the width comes from the stream itself (thin at its top, wider down).
  // No noise in the body of a stream (Ony, 2026-10-11: "the grain inside streams"): its swells are the sim's (streamWidth), not a texture.
  float swell = 1.0;
  /*
   * Smooth: no per-texel noise on the edge (Ony, 2026-10-04: the streams
   * read as grainy sand -- fine noise at the map's own texel scale, then
   * magnified by the lens, turned the whole stream to grit). A rounded cap,
   * body (2 - body): steep near its edge, flat on top, smooth everywhere.
   */
  float body = max(wet * swell - 0.15, 0.0) / 0.85;
  /*
   * As a stream drains it does not fade: it pinches into sections (Ony,
   * 2026-10-10), each stretch going where the thread's own unevenness
   * necks it first, a few millimetres apart -- what is left of each pulls
   * into the beads the sim laid there (DropSim.shedTrail), which show as
   * the water round them goes (below DropSim.TAKES_AT, 0.3).
   */
  float neck = threadNoise(vec2(cell.x * 0.25 + 41.0, cell.y * 0.45));
  float lasts = smoothstep(0.2 + 0.18 * neck, 0.28 + 0.18 * neck, wet);
  return body * (2.0 - body) * mix(0.15, 1.0, held) * lasts;
}
/*
 * The wet map's two channels: R the film a runner leaves (it clears the
 * etch, dries in about 20 s); G the water standing in a clear line's
 * rivulet, a thread a few tenths of a millimetre high that lasts minutes in
 * the rain and, as it thins, pinches into a line of beads (threadH).
 */
/*
 * A standing stream's height: a parabola across (threadH, from the map's
 * rounded cross-section), as tall as its width makes it -- uRivulet per mm
 * of half-width (the map's A), tan(beta) / 2 for a contact angle beta
 * (Wilson & Duffy). A bead twice as wide as its neck stands twice as tall:
 * the surface rises and falls along the stream, and tilts up and down at
 * each bead's ends, so a stream on a dark window catches the light above as
 * the drops do (Ony's clip E: streams as bright as the drops; the catalogue:
 * a stream's middle 0.8-1.2x the glass, never a flat dark band).
 */
/*
 * Along a stream the water is never a straight rod (docs/research-streams.md
 * 1-2: clip E's streams vary 3.5x in width along their length; the
 * catalogue's are lumpy, beaded, never two parallel lines). A flowing stream
 * carries waves down it -- bulges a few millimetres long that run with the
 * flow -- and a stream that has stopped flowing stands in frozen beads
 * (Rayleigh-Plateau). The surface rises and falls by STREAM_WAVE of its
 * height over about 3 mm, so it tilts up and down along the stream and
 * catches the light above as the drops do: the shimmer of real water.
 */
/*
 * 0.5 (was 0.9, with beads sharpened over a third of their length): with
 * the stream now the running head's own wake, draining in seconds, the
 * strong beading read as a string of pearls down every stream -- clip E's
 * streams are a continuous rippled ribbon, lumpy, never a chain of beads.
 */
const float STREAM_WAVE = 0.5;
float streamWave(vec2 uv, vec4 w) {
  vec2 mm = uv * uPane.zw / uPxPerMm;
  // Fresh standing water flows; an old track's beads stand still. The
  // level, not the map's G itself: G falls off across the stream (its
  // cross-section), and a phase that varied across it striped the water.
  float d = 1.0 - w.b;
  float level = clamp(w.g / max(1.0 - d * d, 0.05), 0.0, 1.0);
  float flowing = smoothstep(0.35, 0.8, level);
  /*
   * Flowing, the waves are short (2 mm) and tall; drained to a standing
   * line, what is left is the Rayleigh-Plateau beading of a thin rivulet,
   * spaced about four widths apart and gentler (Ony, 2026-10-09: the
   * standing lines read as strings of equal pearls).
   */
  float along = (mm.y - uTime * uStreamFlow * flowing) / mix(4.0, 2.0, flowing);
  // Two scales, so the beads are not a string of equal pearls: and a slower swell at 2.5 times the length.
  float n = 0.65 * threadNoise(vec2(mm.x * 0.3 + 31.0, along)) + 0.35 * threadNoise(vec2(mm.x * 0.2 + 57.0, along * 0.4 + 3.0));
  /*
   * Beads, not a gentle swell: a bulge's ends are as steep as a drop's rim
   * (it is one, held in the stream), so the flanks are sharpened -- the
   * height goes from neck to crest over about a third of a bead's length.
   */
  // Lumps with rounded flanks: the height goes from neck to crest over about half a lump's length.
  float bead = smoothstep(0.25, 0.75, n);
  return 1.0 + mix(0.45, STREAM_WAVE, flowing) * (2.0 * bead - 1.0);
}
float rivuletH(vec2 uv) {
  vec4 w = texture2D(uWet, uv);
  /*
   * A circular arc across (surface tension: a stream a millimetre wide has
   * a Bond number far below one), meeting the glass at the edge angle whose
   * sine is uRivEdgeSin: in half-widths, height = sqrt(1/sin^2 - d^2) -
   * cos/sin, d the distance from the centre line (the map's B). Tall at its
   * crest (tan(theta/2) half-widths: 0.58 at 60 degrees), steep at its edge,
   * where the sight reflects the room as a drop's rim does -- the bright
   * line along a stream on a night window (Ony's clip E).
   */
  float d = 1.0 - w.b;
  float s = uRivEdgeSin;
  float arc = sqrt(max(1.0 / (s * s) - d * d, 0.0)) - sqrt(1.0 - s * s) / s;
  float level = clamp(threadH(w.g, uv, uWetTexel) / max(1.0 - d * d, 0.05), 0.0, 1.0);
  /*
   * A stream that has drained (G gone, RIVULET_DRY) leaves its track as a
   * thin wet line while the film lasts (R, FILM_DRY): a low ridge in the
   * same channel, about a fifth of the standing height (a third read as a
   * dark crack once the streams themselves drained in seconds), fading
   * with the film -- the lines on a window between showers (clip E: a
   * trail still shows 3 s after; the catalogue: faint lines everywhere).
   */
  float residual = 0.06 * smoothstep(0.15, 0.6, w.r) * (1.0 - d * d);
  return max(w.a * 2.0, 0.15) * max(arc, 0.0) * max(level, residual) * streamWave(uv, w);
}

// Cheap value noise, for the fog's uneven density and its grain.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

/*
 * Condensation's colour (water-drops 9.5): droplets far smaller than a
 * pixel, so dense they scatter most of the light through them sideways.
 * What shows through is the scene smeared out (the photograph's coarsest
 * mip levels), its contrast and colour washed toward the milky grey of the
 * scattered light, with the faint grain of the droplets.
 */
vec3 fogColour(vec2 page) {
  vec3 blur;
  if (uHasPhoto > 0.5) {
    vec2 uv = clamp(coverUv(page, uImage, uImageFit), 0.0, 1.0);
    blur = 0.6 * texture2D(uPhoto, uv, 6.0).rgb + 0.4 * texture2D(uPhoto, uv, 8.0).rgb;
  } else blur = uRoom;
  float l = dot(blur, vec3(0.2126, 0.7152, 0.0722));
  vec3 milk = vec3(l * 0.7 + 0.16);
  /*
   * And the lamps in front of it: the fog scatters their light toward the
   * viewer over a wide halo round each (the glow a steamed window has round
   * every light; its width an estimate).
   */
  for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec2 dl = (page - uLightPos[i].xy) / 260.0;
    milk += uLightColour[i] * 0.12 / (1.0 + dot(dl, dl));
  }
  vec3 c = mix(blur, milk, 0.65);
  return c * (0.94 + 0.12 * hash12(floor(gl_FragCoord.xy)));
}

// Everything at one point of the pane (pane CSS px from the top left): its colour and how much it covers.
/*
 * Backlit water (Ony, 2026-10-03: "make sure that the water can refract
 * light from behind it as well. Like the back lit stuff"). Light shone into
 * a pane's edge is held in the slab by total reflection: anything steeper
 * than 41 degrees from a face stays in. Where water touches the face the
 * limit becomes the glass-to-water one, 61 degrees, so the light between
 * the two leaves the glass into the water -- about a third of what runs
 * there (BACKLIT_ESCAPE: the share of a guided fan between 41 and 61 degrees
 * against 41 to 90). Inside the drop it runs on nearly along the glass, so
 * it leaves through the drop's far rim, the side facing away from the edge
 * it came in by: every drop and every wet track on an edge-lit pane lights
 * up in a crescent, as water and fingerprints do on an edge-lit sign. With
 * the light behind the whole pane (a lightbox) the drop is a clear window
 * onto it instead, brighter than the frost round it.
 */
const float BACKLIT_ESCAPE = 0.36;
vec3 backlitWater(vec2 local, vec2 grad, float cover) {
  if (uBacklitGain <= 0.0 || cover <= 0.0) return vec3(0.0);
  vec2 halfSize = uPane.zw * 0.5;
  vec2 p = local - halfSize;
  float profile = backlitProfile(p, halfSize, uBacklitEdge, uBacklitFill, uFrost);
  float guided = profile / backlitExtraction(uFrost);
  float slope = length(grad);
  vec2 outward = slope > 1e-4 ? -grad / slope : vec2(0.0);
  float rim = smoothstep(0.15, 1.0, slope);
  float shine;
  if (uBacklitEdge > 4.5) {
    // A lightbox behind: seen straight through the clear water, the light not spread by the frost.
    shine = profile * (1.0 + 0.8 * uFrost) * (1.0 - 0.5 * rim);
  } else {
    // Which way the light runs in the glass here: away from the edge it came in by.
    vec2 d1 = uBacklitEdge < 0.5 || uBacklitEdge < 1.5 ? vec2(1.0, 0.0) : uBacklitEdge < 2.5 ? vec2(-1.0, 0.0) : uBacklitEdge < 3.5 ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
    float w1 = 1.0;
    float w2 = 0.0;
    if (uBacklitEdge < 0.5) {
      float w = halfSize.x * 2.0;
      float fromLeft = backlitRun(p.x + halfSize.x, w, uBacklitFill, uFrost);
      float fromRight = backlitRun(halfSize.x - p.x, w, uBacklitFill, uFrost);
      w1 = fromLeft / max(fromLeft + fromRight, 1e-4);
      w2 = 1.0 - w1;
    }
    float far1 = pow(max(dot(outward, d1), 0.0), 1.5);
    float far2 = pow(max(dot(outward, -d1), 0.0), 1.5);
    float crescent = (w1 * far1 + w2 * far2) * rim;
    // What escaped into the water runs on in it and leaves all over the dome (its body), most through the far rim.
    shine = guided * BACKLIT_ESCAPE * (0.6 + 3.5 * crescent);
  }
  return uBacklitColour * uBacklitGain * shine * cover;
}

/*
 * The grazing laser (Ony, 2026-10-03: a laser "that can shoot into the same
 * plane the water drops exist on so it hits the raindrops"): a beam skimming
 * the glass's face, through the drops standing on it. Clean glass scatters
 * almost none of it, so the beam itself is invisible; each drop it passes
 * through bends it and lets it out: the side facing the laser catches it in
 * a bright rim, and the drop focuses what got in to a bright point near its
 * far rim (a ball lens's focus just behind it). Every drop it has crossed
 * takes its share out of the beam, so drops further along are dimmer
 * (uGrazeBlock: the drops along the beam and what is left past each,
 * counted on the CPU from the simulation).
 */
/*
 * The beam where it has got to: its Gaussian profile across, what the drops
 * it has crossed have left of it, and its spread. A drop in the beam is a
 * lens a couple of millimetres across with a focal length about its own
 * size, so past the first drop the light leaves in a fan (estimate: a 0.15
 * spread, about 9 degrees each side), dimmer as it widens; the drops past it
 * catch that fan, not a pencil beam.
 */
float grazeBeam(vec2 page, out float along) {
  along = -1.0;
  if (uGrazeA.z < 0.5) return 0.0;
  vec2 dir = uGrazeB.xy;
  vec2 rel = page - uGrazeA.xy;
  along = dot(rel, dir);
  if (along < 0.0) return 0.0;
  float across = dot(rel, vec2(-dir.y, dir.x));
  float w = max(uGrazeB.z, 1.0);
  float first = uGrazeBlock[0].x;
  float w2 = w + 0.15 * max(along - first, 0.0);
  float inBeam = exp(-2.0 * across * across / (w2 * w2)) * w / w2;
  float left = 1.0;
  for (int k = 0; k < 24; k++) {
    if (uGrazeBlock[k].x > along - 0.5) break;
    left = uGrazeBlock[k].y;
  }
  return inBeam * left;
}

// Whether there is water at a page point (either map).
float grazeWet(vec2 page) {
  vec2 uv = (page - uPane.xy) / uPane.zw;
  return max(texture2D(uDrops, uv * uDropsUv).a, texture2D(uDroplets, uv).a);
}

/*
 * Where the beam crosses water (Ony, 2026-10-03: a laser "into the same
 * plane the water drops exist on so it hits the raindrops"; 2026-10-04: it
 * "looks like a flashlight"). A laser lights no area: a drop it crosses
 * shows four things and is otherwise clear and dark inside.
 *  - Entry: a pinpoint where the pencil beam meets the drop's rim facing
 *    the laser (Fresnel reflection off the steep rim, the rest refracted in).
 *  - Focus: the drop is a lens about its own size, so the light inside
 *    converges to a point at the far rim on the beam's line -- the
 *    brightest spot -- and leaves there.
 *  - Ring: light reflected round inside the rim (total internal reflection
 *    past 49 degrees) runs along the contact line: a thin glowing ring
 *    round the drop that was hit, fading away from the entry.
 *  - Downstream drops catch the diverging fan only on the rim that faces
 *    the laser.
 * Whether this pixel's drop is the one the beam crosses: water all the way
 * from here to the beam's line (six samples).
 */
vec3 grazeWater(vec2 page, vec2 grad, float cover) {
  if (uGrazeA.z < 0.5 || cover <= 0.0) return vec3(0.0);
  vec2 dir = uGrazeB.xy;
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 rel = page - uGrazeA.xy;
  float alongHere = dot(rel, dir);
  if (alongHere < 0.0) return vec3(0.0);
  float across = dot(rel, nrm);
  float first = uGrazeBlock[0].x;
  float w = max(uGrazeB.z, 1.0);
  float reach = w + 0.15 * max(alongHere - first, 0.0) + 40.0;
  if (abs(across) > reach) return vec3(0.0);
  float along;
  float here = grazeBeam(page, along);
  vec2 foot = page - nrm * across;
  float joined = 1.0;
  for (int k = 1; k <= 6; k++) joined *= step(0.25, grazeWet(mix(page, foot, float(k) / 6.0)));
  float lineAlong;
  float hit = grazeBeam(foot, lineAlong) * joined;
  if (hit < 0.002 && here < 0.002) return vec3(0.0);
  float slope = length(grad);
  vec2 outward = slope > 1e-4 ? -grad / slope : vec2(0.0);
  float rim = smoothstep(0.35, 1.2, slope);
  float facing = max(dot(outward, -dir), 0.0);
  float away = max(dot(outward, dir), 0.0);
  // On the beam's own line (narrow): the entry glint and the focus.
  float onLine = exp(-2.0 * across * across / (w * w));
  float entry = pow(facing, 6.0) * rim * here * 5.0;
  float focus = pow(away, 6.0) * rim * hit * onLine * 20.0;
  // The ring along the contact line, brighter on the side the light came in.
  float ring = rim * rim * hit * (0.35 + 0.65 * facing) * 0.9;
  // A trace of the light scattered inside, so the lens is not black where it carries the beam.
  float inside = hit * onLine * 0.08;
  float I = entry + focus + ring + inside;
  // Bright enough and the camera clips it toward white: a hot core, red round it.
  return uGrazeColour * I + vec3(1.0) * max(I * 1.6 - 1.2, 0.0);
}

/*
 * The beam on the glass between the drops: a hair-thin line where dust and
 * the surface's micro-roughness catch it (faint), bright where condensation
 * scatters it. The pencil beam only: the fan past the first drop is too
 * spread to show on bare glass.
 */
vec3 grazeGlass(vec2 page, vec2 uvP) {
  if (uGrazeA.z < 0.5) return vec3(0.0);
  vec2 dir = uGrazeB.xy;
  vec2 rel = page - uGrazeA.xy;
  float along = dot(rel, dir);
  if (along < 0.0) return vec3(0.0);
  float across = dot(rel, vec2(-dir.y, dir.x));
  float w = max(uGrazeB.z, 1.0);
  float core = exp(-2.0 * across * across / (0.12 * w * w));
  float halo = exp(-2.0 * across * across / (w * w));
  if (halo < 0.003) return vec3(0.0);
  float left = 1.0;
  for (int k = 0; k < 24; k++) {
    if (uGrazeBlock[k].x > along - 0.5) break;
    left = uGrazeBlock[k].y;
  }
  float fog = uFogAmount * texture2D(uFog, uvP).r;
  float I = (0.03 * halo + 0.18 * core) * (1.0 + 10.0 * fog) * left;
  return uGrazeColour * I + vec3(1.0) * core * left * 0.12;
}

// (The stream's edge slope now follows uRivEdgeSin: its cross-section is a circular arc, see rivuletH.)
vec4 shadeWater(vec2 local) {
  vec2 uvP = local / uPane.zw;
  vec2 uvD = uvP * uDropsUv;
  vec4 d = texture2D(uDrops, uvD);
  vec4 s = texture2D(uDroplets, uvP);
  float wet = texture2D(uWet, uvP).r;
  float coverD = clamp(d.a, 0.0, 1.0);
  // A droplet that has evaporated to nothing leaves its coverage behind: the height decides.
  float coverS = clamp(s.a, 0.0, 1.0) * smoothstep(0.0, 2.0 / 255.0, s.r);
  // A fresh rivulet is water standing on the glass, a lens of its own: it bends the scene as it wanders.
  vec4 wetHere = texture2D(uWet, uvP);
  float coverW = smoothstep(0.0, 0.08, max(threadH(wetHere.g, uvP, uWetTexel), 0.06 * smoothstep(0.15, 0.6, wetHere.r) * wetHere.b));
  float cover = max(max(coverD, coverS), coverW);
  // A film clears the etch as far as it is thick: fully only where it is fresh, fading as it dries.
  float film = smoothstep(0.1, 1.0, wet) * 0.85 * uClear;

  /*
   * The condensation here: its full density, uneven over the glass (thinner
   * in patches a few centimetres across, estimate), as far as it has built
   * up. On the rain's face, none under the water (the wipe clears the map
   * too; this keeps a drop's own footprint clean before the next frame).
   */
  vec2 pageHere = uPane.xy + local;
  float patchy = 0.75 + 0.25 * vnoise(pageHere / 90.0) + 0.1 * vnoise(pageHere / 23.0);
  float fogA = uFogAmount * clamp(texture2D(uFog, uvP).r * patchy, 0.0, 1.0) * 0.92;
  if (uFogSide < 0.5) fogA *= 1.0 - max(coverD, coverW);

  if (cover <= 0.0 && film <= 0.0) {
    if (fogA <= 0.0) return vec4(0.0);
    return copyInFront(vec4(fogColour(pageHere), fogA), pageHere);
  }

  // The water's height and slope here, mm and mm per mm: both maps, by central differences over one texel.
  float mmPerTexel = 1.0 / (uScale * uPxPerMm);
  // The drops' water and the stream's, apart: where they meet they are one surface (below).
  float hDS = d.r * uDropsFull + s.r * DROPLET_FULL;
  float hW0 = rivuletH(uvP);
  float h = hDS + hW0;
  vec2 tx = vec2(uDropsTexel.x, 0.0);
  vec2 ty = vec2(0.0, uDropsTexel.y);
  vec2 sx = vec2(uDropletsTexel.x, 0.0);
  vec2 sy = vec2(0.0, uDropletsTexel.y);
  vec2 gradD = vec2(dropsH(uvD + tx) - dropsH(uvD - tx), dropsH(uvD + ty) - dropsH(uvD - ty)) / (2.0 * mmPerTexel);
  /*
   * The drops' slope: its direction from the map, its steepness exact from
   * the map's b (see the map: the finite difference flattens the rim). The
   * ratio to the cover keeps the rim's steepness right to the contact line
   * as the map is filtered.
   */
  float gD = length(gradD);
  if (gD > 1e-5 && d.a > 0.02) gradD *= min(4.0 * d.b / d.a, 3.0) / gD;
  vec2 gradDS = gradD + vec2(
    dropletsH(uvP + sx) - dropletsH(uvP - sx),
    dropletsH(uvP + sy) - dropletsH(uvP - sy)
  ) / (2.0 * mmPerTexel);
  vec2 grad = vec2(0.0);
  /*
   * The rivulet's slope, over two of its map's texels: the map is built
   * from many overlapping capsules, MAX-blended, and differences over one
   * texel caught every crease between them -- the stream glittered like
   * sand. Water's surface tension smooths its own surface at that scale.
   */
  vec2 wx = vec2(uWetTexel.x * 2.0, 0.0);
  vec2 wy = vec2(0.0, uWetTexel.y * 2.0);
  /*
   * A rivulet is a circular cap across its width: water on glass meets it
   * at its contact angle (Lab "Beading" times RIVULET_EDGE_SHARE), so its
   * surface slope runs from 0 on the centre line to tan(theta) at its edges,
   * whatever its width -- clear in the middle, the background seen through
   * it barely shifted, bending hard along its two edges, where it reflects
   * the room as a drop's rim does (docs/research-streams.md: a real stream
   * is two edge lines, the scene squeezed sideways between them).
   * Direction: away from the nearest centre line (the wet map's B).
   */
  float bHere = texture2D(uWet, uvP).b;
  // A stream's curvature across, 1/mm (a circular arc: sin(theta) over its half-width), for the lens's footprint below.
  float rivCurv = 0.0;
  if (bHere > 0.0) {
    vec2 gB = vec2(texture2D(uWet, uvP + wx).b - texture2D(uWet, uvP - wx).b,
                   texture2D(uWet, uvP + wy).b - texture2D(uWet, uvP - wy).b);
    float gl = length(gB);
    float riv = smoothstep(0.0, 0.08, max(threadH(wetHere.g, uvP, uWetTexel), 0.06 * smoothstep(0.15, 0.6, wetHere.r) * wetHere.b));
    // On a circular arc the surface angle phi at distance d from the centre has sin(phi) = d sin(theta).
    float sn = min((1.0 - bHere) * uRivEdgeSin, 0.995);
    float slope = sn / sqrt(1.0 - sn * sn);
    // A neck between beads stands lower and flatter than a bead: its edge is gentler, so the edge line breaks up along the stream.
    float waveHere = streamWave(uvP, texture2D(uWet, uvP));
    if (gl > 1e-5) grad += -gB / gl * slope * riv * clamp(waveHere, 0.35, 1.3);  // (the stream's own slope: grad is the stream's here)
    rivCurv = uRivEdgeSin / max(texture2D(uWet, uvP).a * 2.0, 0.15) * riv;
    // Along it, the waves and beads: the height's own differences over the wet map's texel.
    float mmW = 2.0 * uWetTexel.x * uPane.z / uPxPerMm;
    float hW = rivuletH(uvP);
    if (hW > 0.0) {
      vec4 wW = texture2D(uWet, uvP);
      vec2 dw = vec2(streamWave(uvP + wx, wW) - streamWave(uvP - wx, wW), streamWave(uvP + wy, wW) - streamWave(uvP - wy, wW));
      grad += dw * hW / streamWave(uvP, wW) / (2.0 * mmW);
    }
  }
  /*
   * One body of water (Ony, 2026-10-10: "the stream and the drop seem to stay
   * separate when a drop turns into a stream. I can see the outlines of
   * them"): where a drop and a stream overlap -- a head on its own tail, a
   * bulb, a drop the stream is taking in -- the water's surface is the upper
   * of the two, joined smoothly, not the two added: so the drop's rim does
   * not stand as a ring inside the stream, and the head runs into its tail.
   * A smooth max over UNION_MM; away from either, each is itself.
   */
  {
    const float UNION_MM = 0.05;
    float tU = hW0 <= 0.0 ? 1.0 : (hDS <= 0.0 ? 0.0 : clamp(0.5 + (hDS - hW0) / (2.0 * UNION_MM), 0.0, 1.0));
    h = mix(hW0, hDS, tU) + UNION_MM * tU * (1.0 - tU);
    grad = mix(grad, gradDS, tU);
  }
  vec2 page = uPane.xy + local;
  /*
   * How much of the photograph one device pixel here takes in (rain W1, the
   * sharp lookup). A thin lens maps the page onto the photograph a distance
   * D behind by d(seen)/d(page) = 1 + D (n - 1) h'', h'' the surface's
   * curvature: the drops map's second differences, along x and along y.
   * For a bead it is about -4 (upside down, shrunk four times); at the rim
   * it climbs, as the picture crowds in there. The level is that footprint
   * in the photograph's texels, halved where four samples share the pixel.
   */
  float hHere = d.r * uDropsFull;
  float sHere = s.r * DROPLET_FULL;
  float hxx = (dropsH(uvD + tx) - 2.0 * hHere + dropsH(uvD - tx)
             + dropletsH(uvP + sx) - 2.0 * sHere + dropletsH(uvP - sx)) / (mmPerTexel * mmPerTexel);
  float hyy = (dropsH(uvD + ty) - 2.0 * hHere + dropsH(uvD - ty)
             + dropletsH(uvP + sy) - 2.0 * sHere + dropletsH(uvP - sy)) / (mmPerTexel * mmPerTexel);
  float sceneMm = uScene / uPxPerMm;
  /*
   * A stream is a cylinder lens: across it the scene is squeezed many times
   * over (its curvature is far tighter than a drop's), so a sharp feature
   * of the photograph behind it became a hard stripe along the stream.
   * Its curvature joins the footprint, as the drops' does.
   */
  float hxxAll = hxx - rivCurv;
  float spread = max(max(abs(1.0 + sceneMm * (uIor - 1.0) * hxxAll), abs(1.0 + sceneMm * (uIor - 1.0) * hyy)), 1.0);
  float boxAspect = uImage.z / max(uImage.w, 1.0);
  vec2 fitScale = boxAspect > uImageFit.x ? vec2(1.0, boxAspect / uImageFit.x) : vec2(uImageFit.x / boxAspect, 1.0);
  vec2 texPerPx = uPhotoTexels / max(uImage.zw * fitScale, vec2(1.0));
  float samplesShare = uSamples > 1.5 ? 0.5 : 1.0;
  float pagePerPixel = samplesShare / uScale;               // page px one sample covers, through flat glass
  float lodFlat = log2(max(max(texPerPx.x, texPerPx.y) * pagePerPixel, 1.0));
  float lodLens = log2(max(max(texPerPx.x, texPerPx.y) * pagePerPixel * spread, 1.0));
  vec3 eye = vec3(uViewCentre, uCameraDistance);
  vec3 V = normalize(vec3(page, h * uPxPerMm) - eye); // from the eye, into the glass (z down)
  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);

  // Blood and slime take light out on the way through (Beer-Lambert). The drops map holds the liquid as 0 / 0.5 / 1 in g.
  float dLiq = d.g / max(d.a, 1e-3);
  float dBlood = clamp(1.0 - abs(dLiq - 0.5) * 2.0, 0.0, 1.0);
  float dSlime = clamp(2.0 * dLiq - 1.0, 0.0, 1.0);
  float bloodFrac = clamp((dBlood * d.a + s.g) / max(d.a + s.a, 1e-3), 0.0, 1.0);
  float slimeFrac = clamp((dSlime * d.a + s.b) / max(d.a + s.a, 1e-3), 0.0, 1.0);
  vec3 T = exp(-(uSigmaBlood * bloodFrac + uSigmaSlime * slimeFrac) * h);

  // The scene's own mean colour (the photograph's smallest level), to balance the room panorama to it.
  vec3 sceneMean = uHasPhoto > 0.5 ? texture2D(uPhoto, vec2(0.5), 12.0).rgb : uRoom;

  vec3 col;
  float alpha;
  float dbgAbove = 0.0;
  float dbgFin = 0.0;
  if (uClear > 0.5 && uHasPhoto > 0.5) {
    /*
     * ---- A drop that is a lens onto the photograph ----
     *
     * On clear glass, whichever face it is on; on frosted glass, on the
     * etched face, where the water fills the etch and the spot goes clear.
     * The lamps show in what each drop reflects: a lamp's core is hundreds
     * of times brighter than what it lights, so even a few per cent of it
     * clips to white, as it does in a photograph.
     */
    vec2 tanFlat = V.xy / max(-V.z, 0.05);
    /*
     * What the glass's own frosted face looks like here, lit by the lamps:
     * the dry etch round the drop scatters each lamp's light, brightest
     * under it (the glow the light layer draws). A sight line trapped in the
     * glass -- reflected by the drop too steeply to leave the front face --
     * runs on inside the pane and lands on that frost a little way off, so
     * it shows THIS: near a lamp the drop's rim lights up with the glow
     * round it, as a drop on a lit frosted window does; far from any lamp
     * it stays dark. Lambert on the face from each lamp's height,
     * (h^2 / (d^2 + h^2))^1.5, 1 straight under it (FROST_GLOW scales it to
     * the light layer's glow, estimate). Clear glass has no etch to glow:
     * a sight line trapped in it shows the dark inside of the slab.
     */
    vec3 frostLit = vec3(0.0);
    for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec2 dl = page - uLightPos[i].xy;
      float hz = max(uLightPos[i].z, 1.0);
      float q = hz * hz / (dot(dl, dl) + hz * hz);
      frostLit += uLightColour[i] * FROST_GLOW * q * sqrt(q);
    }
    vec3 trapped = frostLit * TRAPPED_GAIN * uFrosted;

    vec2 tanOut = vec2(0.0);
    bool lost = false;      // the sight through the drop never reaches the photograph
    float Fin;              // the share the drop's surface reflects back toward you
    vec3 backDir = vec3(0.0, 0.0, 1.0);
    bool backTrapped = false;
    float Fexit = 0.0;      // what the front face keeps of that reflection on its way out
    // Where the sight, inside a drop on the near face, lands on the glass under it: where the printed copy is.
    vec2 baseLand = page;
    if (uNear > 0.5) {
      /*
       * ---- A drop on the near face of clear glass, seen from outside ----
       *
       * Your sight meets the drop's air-water surface first: refracted into
       * the water at its slope, then carried through the flat water-glass
       * and glass-air faces by its tangential n sin(theta) to the photograph,
       * a gap and the slab's apparent depth behind. What the surface
       * reflects is the room and the lamps, by air-to-water Fresnel: no
       * total reflection from this side, so no dark ring; at the very rim,
       * where the bent sight is too steep to leave the glass's back face,
       * it is trapped in the slab.
       */
      vec3 N = normalize(vec3(-grad, 1.0));
      float cosV = max(-dot(V, N), 0.0);
      vec3 tW = refract(V, N, 1.0 / uIor);
      float cosW = max(-dot(tW, N), 0.0);
      float rs = (cosV - uIor * cosW) / max(cosV + uIor * cosW, 1e-4);
      float rp = (uIor * cosV - cosW) / max(uIor * cosV + cosW, 1e-4);
      Fin = clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
      vec2 kT = uIor * tW.xy;
      float kk = dot(kT, kT);
      if (kk >= 1.0) lost = true;
      else tanOut = kT / sqrt(1.0 - kk);
      backDir = reflect(V, N);
      baseLand = page + (h * uPxPerMm) * tW.xy / max(-tW.z, 0.05);
    } else {
      /*
       * ---- A drop on the far face, seen through the glass ----
       *
       * The rain is on the face away from you: you look at each drop from
       * inside it. Your sight crosses the glass and the flat glass-water
       * contact unturned (only n sin(theta) carries over), and meets the
       * drop's curved water-air surface from the water. There:
       *
       *   most of it leaves toward the photograph -- refracted by the curve,
       *     so the drop is a lens and holds the picture upside down;
       *   some of it is reflected back toward you, by water-to-air Fresnel --
       *     and past the critical angle (48.8 deg, n 1.333), toward the drop's
       *     rim where the surface steepens, ALL of it: the rim is a mirror,
       *     showing the room behind you. That is the dark ring of a drop at
       *     night, and where a lamp lines up in it, the bright arc on the
       *     drop's far side -- the second highlight;
       *   what is reflected back must still leave the glass's front face:
       *     past ITS critical angle it is trapped and runs along the pane.
       */
      vec3 Nw = normalize(vec3(grad, 1.0));                 // the water-air surface's normal, facing back into the water
      vec2 kW = V.xy / uIor;                                // sight inside the water: its tangential part carried through
      vec3 tW = vec3(kW, -sqrt(max(1.0 - dot(kW, kW), 0.0)));
      float cosI = max(-dot(tW, Nw), 0.0);
      vec3 out3 = refract(tW, Nw, uIor);
      bool tir = dot(out3, out3) < 1e-6;
      /*
       * Water to air from inside, the exact Fresnel equations (s and p
       * averaged): Schlick is far off on the dense side, where the reflectance
       * climbs from a few per cent to all of it over the last few degrees
       * before the critical angle -- the band that makes a drop's ring.
       */
      float cosT = tir ? 0.0 : max(-dot(out3, Nw), 0.0);
      float rs = (uIor * cosI - cosT) / max(uIor * cosI + cosT, 1e-4);
      float rp = (cosI - uIor * cosT) / max(cosI + uIor * cosT, 1e-4);
      Fin = tir ? 1.0 : clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
      if (tir) lost = true;
      else tanOut = out3.xy / max(-out3.z, 0.05);
      vec3 R = reflect(tW, Nw);
      vec2 kOut = uIor * R.xy;
      float k2 = dot(kOut, kOut);
      if (k2 >= 1.0) backTrapped = true;
      else {
        /*
         * Leaving the front face, glass to air: Fresnel rises to all of it as
         * the sight nears the angle where it is trapped, so the room fades
         * into what the slab holds instead of stopping in a hard ring.
         */
        float cosExit = sqrt(1.0 - k2);
        float fgl = pow((uGlassIor - 1.0) / (uGlassIor + 1.0), 2.0);
        Fexit = fgl + (1.0 - fgl) * pow(1.0 - cosExit, 5.0);
        backDir = vec3(kOut, cosExit);                    // into the room, toward you
      }
    }

    // Through: the photograph a gap behind, less what the flat glass would do anyway.
    // Near the rim the bent sight runs off sideways; past a slope of 2 it shows only a blur of the scene, not a speckle of far-off pixels.
    float tl = length(tanOut);
    if (tl > 2.0) tanOut *= 2.0 / tl;
    vec2 seenPage = page + uScene * (tanOut - tanFlat);
    float footprint = pagePerPixel * spread;
    vec3 through = lost ? trapped : seenThroughWater(seenPage, lodLens, footprint);
    /*
     * Past the top of the photograph: the sky or ceiling above the scene.
     * The drop turns the world over, so its lower half looks steeply up;
     * a sight tilted up past the top of the frame (a camera sees about +-20
     * degrees: tan 0.02-0.3 from mid-frame) sees the light above, not the dark picture --
     * the bright crescent low in each drop on a night window (Ony's clips
     * C and E: interior 2.8x the glass round it, brightest 5-6x). Tilted
     * sideways it fades: the light is above, not beside.
     */
    if (!lost) {
      vec2 tilt = tanOut - tanFlat;
      float up = -tilt.y;
      float above = smoothstep(0.02, 0.3, up) * (1.0 - 0.6 * smoothstep(0.2, 0.8, abs(tilt.x)));
      through = mix(through, vec3(uSkyAbove), above);
      dbgAbove = above;
    }
    dbgFin = Fin;
    // On the near face the copy lies under the drop, bent and enlarged by it; on the far face it is in front, flat.
    if (uNear > 0.5) {
      /*
       * The letters under a drop, lit through it (Ony, 2026-10-03: "the rain
       * drops are not on the letters"). The room's light reaches the print
       * through the drop too, and the drop bends it inward: the print under
       * its middle gets more than the glass round it and the print under
       * its rim less -- the bright, enlarged middle and the dark ring a drop
       * makes on anything printed under it. The light that enters over an
       * area of the drop lands on an area det(J) times it, J the map from
       * the drop's surface to the glass (the same map the sight follows,
       * base = page + k h grad h, k = 1 - 1/n for near-normal light), so
       * the print is lit 1 / det(J) times as brightly.
       */
      float kk2 = 1.0 - 1.0 / uIor;
      float jxx = 1.0 + kk2 * (grad.x * grad.x + h * hxx);
      float jyy = 1.0 + kk2 * (grad.y * grad.y + h * hyy);
      float jxy = kk2 * grad.x * grad.y;
      float lit = clamp(1.0 / max(abs(jxx * jyy - jxy * jxy), 1e-3), 0.25, 2.2);
      vec4 ty = typeAt(baseLand);
      ty.rgb *= lit;
      through = overType(through, ty);
    }

    // Back toward you: the room and each lamp, along the reflected sight.
    vec3 back = trapped;
    if (!backTrapped) {
      vec3 room = uHasRoom > 0.5
        ? decodeRadiance(texture2D(uRoomTex, roomUvDir(backDir)).rgb) * uRoomExposure
        : uRoom;
      // The panorama balanced to the scene: its own colours mostly out, the scene's mean hue in.
      float lr = dot(room, vec3(0.2126, 0.7152, 0.0722));
      float lm = dot(sceneMean, vec3(0.2126, 0.7152, 0.0722));
      /*
       * What a drop's rim reflects is the room on the viewer's side of the
       * glass, not the scene behind it: grey, its brightness only (Ony,
       * 2026-10-08 stills: a purple-pink fringe round every drop -- the
       * photograph's mean hue, pulled into every reflection).
       */
      room = vec3(lr);
      back = room;
      vec3 P = vec3(page, 0.0);
      for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
        if (i >= uLightCount) break;
        vec3 toL = uLightPos[i] - P;
        float dist = length(toL);
        vec3 L = toL / dist;
        float size = atan(max(uLightRadius[i], 1.0) / dist);
        float off = acos(clamp(dot(backDir, L), -1.0, 1.0));
        /*
         * A lamp's image in a drop is smaller than a pixel; drawn across
         * the 0.1 rad a pixel of a millimetre drop turns through, at the
         * share of it the real image fills, times the lamp core's radiance
         * (LAMP_CORE, scaled by its size so a bigger, softer lamp is not
         * brighter in total).
         */
        float wide = max(size, 0.1);
        float disc = 1.0 - smoothstep(wide * 0.4, wide * 1.6, off);
        float core = LAMP_CORE * pow(16.0 / max(uLightRadius[i], 1.0), 2.0);
        back += uLightColour[i] * disc * core * (size * size) / (wide * wide);
        /*
         * The camera's bloom round it: a clipped highlight spreads into the
         * pixels round it in any photograph (the lens's veiling glare), so
         * a glint reads as a bright star a few pixels across, not a lone
         * pixel. A wide, faint lobe on the same direction (BLOOM_*, estimate).
         */
        float bl = off / (wide * BLOOM_WIDTH);
        back += uLightColour[i] * core * BLOOM_SHARE * (size * size) / (wide * wide) * exp(-bl * bl);
      }
      back = mix(back, trapped, Fexit);
    }
    vec3 water = through * T * (1.0 - Fin) + back * Fin;
    water += backlitWater(local, grad, 1.0) + grazeWater(page, grad, 1.0);
    /*
     * The glass's own front face, flat, in front of the drop: it reflects the
     * room at glass's few per cent (Fresnel, n 1.52). The light layer draws
     * this everywhere else; over a drop this layer lies on top of it, so it
     * draws it here. (Not the lamps' mirror image: the light layer leaves
     * that off -- reflection.ts LAMP_REFLECTION_ENABLED -- and so does this.)
     */
    vec3 frontDir = reflect(V, vec3(0.0, 0.0, 1.0));
    float cosF = max(-V.z, 0.0);
    float fg = pow((uGlassIor - 1.0) / (uGlassIor + 1.0), 2.0);
    float Ff = fg + (1.0 - fg) * pow(1.0 - cosF, 5.0);
    vec3 front = uHasRoom > 0.5
      ? decodeRadiance(texture2D(uRoomTex, roomUvDir(frontDir)).rgb) * uRoomExposure
      : uRoom;
    // On the near face the drop's own surface is the front face: there is no flat glass in front of it.
    if (uNear < 0.5) water = water * (1.0 - Ff) + front * Ff;
    vec3 wetGlass = seenThroughWater(page, lodFlat, pagePerPixel);
    if (uNear > 0.5) wetGlass = overType(wetGlass, typeAt(page));
    col = mix(wetGlass, water, cover);
    alpha = max(cover, film);
  } else {
    /*
     * ---- A drop on the near (polished) face ----
     *
     * Over the frost the pane already shows: only what its outer surface
     * reflects, the room and each lamp's glint, by air-to-water Fresnel.
     */
    vec3 N = normalize(vec3(-grad, 1.0));
    float cosV = max(-dot(V, N), 0.0);
    float F = f0 + (1.0 - f0) * pow(1.0 - cosV, 5.0);
    vec3 roomDir = reflect(V, N);
    vec3 room = uHasRoom > 0.5
      ? decodeRadiance(texture2D(uRoomTex, roomUvDir(roomDir)).rgb) * uRoomExposure
      : uRoom;
    vec3 P = vec3(page, h * uPxPerMm);
    vec3 spec = vec3(0.0);
    for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 toL = uLightPos[i] - P;
      float dist = length(toL);
      vec3 L = toL / dist;
      float size = atan(max(uLightRadius[i], 1.0) / dist);
      float off = acos(clamp(dot(roomDir, L), -1.0, 1.0));
      float wide = max(size, 0.1);
      float disc = 1.0 - smoothstep(wide * 0.4, wide * 1.6, off);
      float core = LAMP_CORE * pow(16.0 / max(uLightRadius[i], 1.0), 2.0);
      spec += uLightColour[i] * disc * core * (size * size) / (wide * wide);
    }
    vec3 add = (room + spec) * F;
    /*
     * The drop is a lens over the glass it sits on (Ony, 2026-10-03: the
     * words "flat on the glass", the rain on them, distorting and magnifying
     * them): the sight refracted into the water and carried down the drop's
     * height lands on the near face -- the copy printed there, bent and
     * enlarged -- and goes on through the slab to the frosted far face, lit
     * as the pane around it is (the lamps' glow on the etch). The etch sends
     * its light on mostly straight ahead, so the sight bent sideways near
     * the rim sees it dimmer: a drop is darker toward its edge.
     */
    vec3 tW = refract(V, N, 1.0 / uIor);
    vec2 base = page + (h * uPxPerMm) * tW.xy / max(-tW.z, 0.05);
    vec2 kT = uIor * tW.xy;
    float kk = dot(kT, kT);
    vec2 far = base + uThickness * kT / sqrt(max(uGlassIor * uGlassIor - kk, 0.1));
    vec3 frostLitHere = vec3(0.0);
    for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec2 dl = far - uLightPos[i].xy;
      float hz = max(uLightPos[i].z, 1.0);
      float q = hz * hz / (dot(dl, dl) + hz * hz);
      frostLitHere += uLightColour[i] * FROST_GLOW * q * sqrt(q) * 0.35;
    }
    // The sight's tilt inside the glass against the straight-through view's: the etch's forward lobe.
    vec2 kFlat = V.xy / max(length(V), 1e-4);
    float tilt = length(kT - kFlat) / uGlassIor;
    float lobe = exp(-(tilt * tilt) / (ETCH_LOBE * ETCH_LOBE));
    vec3 seen = overType((frostedLit(far) + frostLitHere) * mix(ETCH_DIFFUSE, 1.0, lobe), typeAt(base));
    col = seen * (1.0 - F) + add + backlitWater(local, grad, 1.0) + grazeWater(page, grad, 1.0);
    alpha = cover;
  }
  /*
   * A highlight brighter than the screen goes to white, as a sensor's
   * clipped highlight does: clipping each channel on its own turned a
   * bright pinkish window in the room into a violet dot on every drop.
   */
  if (uDebug > 0.5) {
    // R: height (1 = 0.5 mm), G: slope (1 = 2), B: the sky-above share; A: cover. Stream texels only when uDebug is 2.
    float dbgB = uDebug > 2.5 ? dbgFin * 4.0 : uDebug > 1.5 ? streamWave(uvP, texture2D(uWet, uvP)) * 0.5 : dbgAbove;
    return vec4(clamp(h / 0.5, 0.0, 1.0), clamp(length(grad) / 2.0, 0.0, 1.0), dbgB, cover);
  }
  float pk = max(col.r, max(col.g, col.b));
  if (pk > 1.0) col = mix(col / pk, vec3(1.0), clamp((pk - 1.0) / pk, 0.0, 1.0));
  // The photographs' shoulder and grain on the lens (effects/light/camera-match): a glint is their cream, not a screen's white.
  if (uClear > 0.5 && uHasPhoto > 0.5) col = cameraHighlights(col * max(pk, 1.0), gl_FragCoord.xy / uScale);
  /*
   * With the condensation: on the other face it lies between the viewer and
   * the water, so the water is seen through it; on the rain's face what is
   * left of it lies round the water.
   */
  if (fogA > 0.0) {
    vec3 fc = fogColour(pageHere);
    if (uFogSide > 0.5) {
      float a = fogA + alpha * (1.0 - fogA);
      col = (fc * fogA + col * alpha * (1.0 - fogA)) / max(a, 1e-4);
      alpha = a;
    } else {
      float a = alpha + fogA * (1.0 - alpha);
      col = (col * alpha + fc * fogA * (1.0 - alpha)) / max(a, 1e-4);
      alpha = a;
    }
  }
  return copyInFront(vec4(col, alpha), pageHere);
}

vec4 shadeAt(vec2 local) {
  vec4 c = shadeWater(local);
  if (uGrazeA.z < 0.5) return c;
  // On bare glass only: where there is water the beam is in the water, bent (grazeWater), not a line across it.
  vec3 line = grazeGlass(uPane.xy + local, local / uPane.zw) * (1.0 - clamp(c.a * 1.5, 0.0, 1.0));
  float la = clamp(max(line.r, max(line.g, line.b)), 0.0, 1.0);
  if (la <= 0.0) return c;
  float a = max(c.a, la);
  return vec4((c.rgb * c.a + line) / max(a, 1e-4), a);
}

/*
 * Each pixel, sampled four times inside itself where there is water
 * (rotated-grid supersampling; uSamples 4 on machines that can afford it):
 * a drop turns the view through it fast -- the scene's image in it, its
 * glints, the rim where the reflection turns total -- and one sample a
 * pixel left stair-steps and single bright pixels (Ony, 2026-10-01: "Make
 * sure pixels aren't visible in the drops"). The four are averaged as
 * light (premultiplied by their cover).
 */
void main() {
  // This pixel, pane CSS px from the top left; the maps were drawn with y = 0 at v = 0.
  vec2 local = vec2(gl_FragCoord.x, uPane.w * uScale - gl_FragCoord.y) / uScale;
  vec4 c = shadeAt(local);
  if (uSamples < 1.5 || c.a <= 0.0) {
    gl_FragColor = c;
    return;
  }
  float p = 1.0 / uScale;
  vec4 acc = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    vec2 o = k == 0 ? vec2(0.125, 0.375) : k == 1 ? vec2(-0.375, 0.125) : k == 2 ? vec2(-0.125, -0.375) : vec2(0.375, -0.125);
    vec4 q = shadeAt(local + o * p);
    acc += vec4(q.rgb * q.a, q.a);
  }
  gl_FragColor = acc.a > 1e-4 ? vec4(acc.rgb / acc.a, acc.a * 0.25) : vec4(0.0);
}
`;
