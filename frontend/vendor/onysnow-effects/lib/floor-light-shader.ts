import { EDGE_PROFILE_GLSL } from "@fx/effects/optics/edge-profile.glsl";
import { REFLECTION_GLSL } from "@fx/effects/optics/reflection.glsl";
import { TRANSMISSION_GLSL } from "@fx/effects/optics/transmission.glsl";
import { MARKS_FADE_FROM, SURFACE_LAYERS_GLSL } from "@fx/effects/optics/surface-layers.glsl";
import { SHADOW_GLSL } from "@fx/effects/optics/shadow.glsl";
import { WAVINESS_GLSL } from "@fx/effects/optics/waviness.glsl";
import { LIGHTS_GLSL } from "@fx/effects/light/light-uniforms";
import { CASTERS_GLSL } from "@fx/effects/optics/casters.glsl";
import { SCRATCH_SHADOW, SMUDGE_EXTINCTION, SMUDGE_SCATTER } from "@fx/effects/optics/surface-layers";

/**
 * The light that goes THROUGH the glass and lands on the photographs behind.
 *
 * Everything else in the effect layer is light ON the glass: the rim, the
 * gloss, the grime catching it. This is the other half -- what the pane does
 * to the light on its way through, painted onto whatever it is standing over.
 * The bottom of a swimming pool is the picture to hold in mind: the water is
 * clear, and yet the floor is covered in bright rippling lines, because every
 * little curve in the surface bends the light a little and the bends pile up.
 *
 * THE GEOMETRY
 *
 * Each pane stands `uGap[i]` pixels off the photograph; the light is `uHeight`
 * above it. For a point P on the photograph, the ray back to the light
 * crosses the glass at Q = P + (L - P) * gap / height. Whatever the glass is
 * doing at Q decides what reaches P:
 *
 *   Q OUTSIDE the pane -- nothing in the way. Full light.
 *
 *   Q on the BEVEL -- the rounded edge is a lens. Its outer part tips the
 *   light inward, so the floor under the very edge goes DARK, and that light
 *   piles up a little further in as a BRIGHT LINE. That is the edge of the
 *   shadow a glass of water throws: a dark rim with a bright seam inside it.
 *
 *   Q on the FACE -- mostly straight through, less a little for reflection
 *   and absorption, but the sheet is never quite flat, and its slow waviness
 *   focuses and spreads the light into the net of bright lines on the floor of
 *   a pool. It moves across the floor as the light moves, because Q does.
 *
 * The caustic comes from the glass's waviness (see causticAt), the rest from
 * the bevel's shape and the light's position.
 *
 * WHAT IT DRAWS
 *
 * Light and shadow in one pass (worked out premultiplied, written straight
 * for the shared context): white where light is added,
 * black where it is taken away. The canvas sits above the photographs and
 * below the panes, so in CSS mode the pane's own frost and bevel then bend
 * this too, exactly as they bend the photograph under it.
 */

export const FLOOR_VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const MAX_FLOOR_PANES = 8;

export const FLOOR_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 uViewport;
uniform float uScale;

uniform float uLightGain;
uniform float uCorners;  // ?try=corners: the bevel's bend turns the corner smoothly
uniform float uShadowGain;
uniform float uCaustics;
/*
 * The causes of how sharp and how bright the cast light is: the lamp's size
 * (radius, CSS px) and the glass's index. There is no reach and no penumbra
 * setting -- both are worked out per point from where the lamp is (see
 * effects/optics/transmission.ts).
 */
// The lights: position, height above the photographs, colour, size, charge.
${LIGHTS_GLSL}
uniform float uView;
uniform float uPrism;

uniform int uCount;
uniform vec4 uRect[${MAX_FLOOR_PANES}];
uniform float uSeed[${MAX_FLOOR_PANES}];
/*
 * Each pane's edge width, in CSS pixels. The same width the bend and the
 * light on the glass use -- it used to be a knob of its own ("Shadow edge",
 * 90) so the shadow's rim sat somewhere other than the edge that cast it.
 */
uniform float uEdge[${MAX_FLOOR_PANES}];
/*
 * What each pane is (effects/materials/pane-causes; optics plan step 7): how
 * far it stands off the photograph, and its glass's index and frost. A pane
 * declares these; nothing here is a setting.
 */
uniform float uGap[${MAX_FLOOR_PANES}];
uniform float uIor[${MAX_FLOOR_PANES}];
uniform float uFrost[${MAX_FLOOR_PANES}];
// ?try=roughglass (step H, 30b): each pane's frosted face from the microfacet
// BTDF (effects/optics/rough-transmission) -- its transmission against a
// smooth face's, and its spread, at the cosines 1, 0.7, 0.4, 0.15.
uniform float uRoughGlass;
// Opal glass (catalogue item 32d): what crosses each pane unscattered, per colour (1 for clear).
uniform vec3 uUnscattered[${MAX_FLOOR_PANES}];
uniform vec4 uRoughRatio[${MAX_FLOOR_PANES}];
uniform vec4 uRoughSpread[${MAX_FLOOR_PANES}];

/* A pane's row read at an angle's cosine, piecewise linear (rough-transmission.ts roughAt). */
float roughAt(vec4 v, float cosTheta) {
  float c = clamp(cosTheta, 0.15, 1.0);
  if (c >= 0.7) return mix(v.y, v.x, (c - 0.7) / 0.3);
  if (c >= 0.4) return mix(v.z, v.y, (c - 0.4) / 0.3);
  return mix(v.w, v.z, (c - 0.15) / 0.25);
}
/*
 * Each pane's own transmission straight on, per colour: Fresnel at its two
 * faces and its absorption (effects/optics/stack slab). The light gain is
 * already the light through one pane, so a ray pays it again only for every
 * further pane it crosses (a stack's overlap).
 */
uniform vec3 uThrough[${MAX_FLOOR_PANES}];
/* How much of the scratch (x) and smudge (y) layers each pane wears. */
uniform vec2 uMarks[${MAX_FLOOR_PANES}];
uniform float uMarksProportional; // 1 while previewing ?try=marks
/*
 * The casters (effects/optics/casters): what stands in the
 * lamp's light, painted in its own shape, in layers: each its own height,
 * the face it rests on, and the colour it passes (uCasterLayer, uCasterTint).
 */
uniform sampler2D uCasters;   // caster layers 0-2, one to a channel
uniform sampler2D uCasters2;  // caster layers 3-5
#define MAX_CASTER_LAYERS 6
uniform int  uCasterCount;
uniform vec2 uCasterLayer[MAX_CASTER_LAYERS]; // its height above the photograph, and the face it rests on (0: none)
uniform vec3 uCasterTint[MAX_CASTER_LAYERS];  // the light it passes where it fully covers (0: none)
uniform float uHasCasters;
/* How far what rests on a pane stands off its frosted face, which catches its shadow too. */
/* A card's print: how high above the photograph, and above its pane's face (the mask's blue). */
/* How much of the light a caster blocks ("Cast shadow strength"). */
uniform float uCasterStrength;
/*
 * The room's own light on the photographs while a lamp burns ("Room fill",
 * docs/research/shadows.md 6 Change 1): 1 is today's page, lower is a darker
 * room, where the lamp's pool and its shadows are all there is.
 */
uniform float uRoomFill;
/*
 * The drops' lens map (rain W2; effects/water/lens-map): what the water on
 * the glass does to one lamp's light on the print, E = r + 8 g against the
 * plain pane, 1 where no drop lies. Drawn by the water pass over the
 * viewport; applied to that lamp's light alone.
 */
uniform sampler2D uLens;
uniform float uHasLens;
uniform vec2 uLensSize;       // the map's viewport, CSS px
uniform int uLensLight;       // which light it was drawn for
uniform float uFloorScale[MAX_LIGHTS]; // each light's brightness and distance against the defaults (P / H^2)

${EDGE_PROFILE_GLSL}
${WAVINESS_GLSL}
${REFLECTION_GLSL}
${SHADOW_GLSL}
${TRANSMISSION_GLSL}
${SURFACE_LAYERS_GLSL}
${CASTERS_GLSL}
/* How dirty the pane is: the same clarity threshold the marks on the face use. */
uniform float uGrimeFloor;
/* How far the viewpoint moves the photograph behind the glass, CSS px. */
uniform vec2 uViewShift;
#define SMUDGE_EXTINCTION ${SMUDGE_EXTINCTION.toFixed(3)}
#define SMUDGE_SCATTER ${SMUDGE_SCATTER.toFixed(3)}
#define SCRATCH_SHADOW ${SCRATCH_SHADOW.toFixed(3)}

/*
 * The bottom of the pool, worked out rather than drawn.
 *
 * No sheet of glass is flat: rolled and float glass both carry a slow
 * waviness, a fraction of a millimetre over a few centimetres, and it is that
 * waviness -- not the dirt -- that throws a pool-floor pattern. The surface is
 * modelled as a handful of long, shallow ripples at unrelated angles and
 * lengths (the same model a pool's surface is: a sum of waves). Each point of
 * the glass tips the light passing it by the slope there, so after the gap the
 * light that went through a small patch lands on a patch stretched or squeezed
 * by the CURVATURE there. The brightness is the ratio of the two areas --
 * 1 / det(I + s * Hessian) -- which is exactly the optics of a caustic: where
 * neighbouring rays cross, det goes to zero and the floor gets the bright,
 * knotted lines a pool floor is made of; where they spread it goes dim.
 *
 * The light is not a point, so a line can only be as sharp as the light is
 * small: the determinant is floored by the penumbra, and a big soft lamp
 * gives soft cells while a tight one gives wire-thin lines.
 */
float causticAt(vec2 x, float seed, float pen, float gap) {
  // The pane's surface, the same one the glass bends its view by (waviness.ts).
  vec2 slope;
  vec3 hessian;
  waveSurface(x, seed, slope, hessian);
  float hxx = hessian.x;
  float hyy = hessian.y;
  float hxy = hessian.z;
  float s = waveScale(uCaustics, gap);
  float det = (1.0 + s * hxx) * (1.0 + s * hyy) - s * s * hxy * hxy;
  float soft = clamp(pen / 240.0, 0.03, 0.4);
  return clamp(1.0 / max(abs(det), soft), 0.2, 7.0);
}

/*
 * Light and shadow arriving at one point of the photograph, as the eye sees
 * it back through the glass.
 *
 * WHAT KIND OF GLASS
 *
 * These panes are flat sheets, frosted on the face, with a polished clear
 * bevel round the edge. That decides everything the light does:
 *
 *   The FACE is flat, so it focuses nothing. There is no pattern to throw --
 *   a pool-floor net only happens when the surface is wavy (see causticAt,
 *   off unless "Glass waviness" is raised for rolled or hammered glass). What
 *   the frost does instead is scatter: the beam going through comes out as a
 *   wider, dimmer spread of the same light, a little is sent back, and the
 *   photograph behind is seen through that same frost, so the light on it
 *   reads soft.
 *
 *   The BEVEL is clear, polished and angled: a prism. It turns the light
 *   that crosses it inward, so the floor right under it goes dark and that
 *   light lands further in as a band -- sharp-edged, brighter than the light
 *   around it because it is squeezed into less room, and fringed with colour
 *   at its edges because a prism bends blue more than red.
 *
 * All of it moves as the light moves, because where the ray crosses the
 * glass (Q) moves with the light.
 *
 * Returns the light added (per colour) in rgb and the light taken away in a.
 */
vec4 floorAt(vec2 P, float lit, vec2 lightXY, float height, float radius) {
  /*
   * How the lamp's light arrives HERE: from how far off to the side it is and
   * how high. Everything below that changes across the floor -- brightness,
   * how much gets through, how soft each edge is, how far the band is thrown
   * -- follows from these two numbers, so it all grades smoothly away from
   * the lamp rather than being one look everywhere.
   */
  vec2 toP = P - lightXY;
  float rLamp = length(toP);
  float cosT = cosIncidence(rLamp, height);
  float pool = irradianceFalloff(rLamp, height) * lit;
  if (pool < 0.002) return vec4(0.0);
  vec2 radial = rLamp > 0.5 ? toP / rLamp : vec2(0.0, 1.0);
  float slant = slantSpread(cosT);

  vec3 light = vec3(pool);
  // The frost of the pane over this point spreads the light crossing it: a caster on the glass throws a softer shadow.
  float underFrost = 0.0;
  // And how high that pane's frosted face is: a second thing the light lands on.
  float faceHeight = 0.0;
  // Every pane's transmission this ray crossed, and the clearest one's: all but one more are paid for.
  vec3 crossedT = vec3(1.0);
  vec3 clearestT = vec3(0.0);
  /*
   * Light turned by a higher pane's bevel meets the panes below it where the
   * turn sends it, not where the straight line would (Ony, 2026-10-01: only
   * part of the light out of the first pane enters the second). Panes come
   * highest first; each bevel's turn is kept per unit of height, so a pane
   * lower down is met that much further along it.
   */
  vec2 turnedPerGap = vec2(0.0);
  for (int i = 0; i < ${MAX_FLOOR_PANES}; i++) {
    if (i >= uCount) break;
    // This pane's own causes: how high it stands, what glass it is.
    float gap = uGap[i];
    float ior = uIor[i];
    float frost = uFrost[i];
    // Relative to straight on, so the glass passes today's light under the
    // lamp and less at a slant, where more of it is reflected away.
    float passes = transmittance(cosT, ior) / transmittance(1.0, ior);
    float frostBlur = frostSpread(frost, ior, gap, cosT);
    // What of the light the frosted face lets through, against a smooth face.
    float faceThrough = 1.0 - 0.18 * frost;
    if (uRoughGlass > 0.5) {
      // From the facets themselves (Walter et al. 2007): the lobe's spread
      // carried over the slant path, and the rough face's real loss.
      float cs = max(cosT, 0.05);
      frostBlur = roughAt(uRoughSpread[i], cosT) * gap / (cs * cs);
      faceThrough = roughAt(uRoughRatio[i], cosT);
    }
    // A distance on the floor, as a distance on the glass plane.
    float toGlass = max(height - gap, 1.0) / max(height, 1.0);
    // Back along the ray to this pane's plane.
    vec2 Q = P + (lightXY - P) * (gap / max(height, gap + 1.0));
    Q += turnedPerGap * gap;
    vec4 r = uRect[i];
    vec2 hs = r.zw * 0.5;
    vec2 q = Q - (r.xy + hs);
    // A band as wide as the page has no sides to cast: top and bottom only.
    bool straight = r.z >= uViewport.x / uScale - 1.0;
    float d = straight ? hs.y - abs(q.y) : min(hs.x - abs(q.x), hs.y - abs(q.y));
    /*
     * The edge's softness at this point: the lamp's size seen past the edge,
     * stretched when the lamp is off to the side of that edge, plus the
     * frost's scatter over the slant path. Measured on the floor, used on
     * the glass plane where d is.
     */
    vec2 edgeNormal = straight || abs(q.y) - hs.y > abs(q.x) - hs.x
      ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
    float cosPhi = abs(dot(radial, edgeNormal));
    float penFloor = penumbraAcross(radius, gap, height, cosT, cosPhi);
    float softFloor = sqrt(penFloor * penFloor + frostBlur * frostBlur);
    float pen = max(softFloor * toGlass, 1.0);
    if (d <= -pen) continue;
    float inGlass = smoothstep(-pen, pen, d);
    /*
     * Two frosted panes blur more than either alone: each spreads the light
     * by its own scatter over its own gap, and spreads of that kind add in
     * quadrature (the variances add). It was the larger of the two.
     */
    underFrost = sqrt(underFrost * underFrost + frostBlur * frostBlur * inGlass * inGlass);
    faceHeight = max(faceHeight, gap * step(0.5, inGlass));
    d = max(d, 0.0);
    float W = max(uEdge[i], 1.0);
    float x = d / W;
    float soft = pen / W;

    /*
     * The face: flat, frosted. Straight on through, but the frost spreads
     * the beam (see frostBlur above) and sends a little back.
     */
    float onFace = smoothstep(1.0 - soft, 1.0 + soft, x);
    vec3 through = vec3(pool * passes * faceThrough * onFace);
    /*
     * Opal glass scatters blue most (Rayleigh): what comes straight through
     * lands warm. Of what it scatters, the forward half spreads wide and a
     * little of it lands here too.
     */
    through *= uUnscattered[i] + 0.35 * (1.0 - uUnscattered[i]);

    /*
     * The bevel: a clear, polished strip, angled. Every ray through it is
     * turned inward by about the same amount, so the light that crossed the
     * strip lands as a BAND -- the strip's own shape, moved -- not a line.
     * Under the strip itself that leaves a gap with nothing in it: the dark
     * part of the shadow. The facet is very slightly curved, so the band is
     * narrower than the strip it came through, and the same light in less
     * room is brighter by exactly that ratio: 1 / (1 - converge). Where the
     * band lands on top of light already coming straight through the face,
     * the two add, and that overlap is the brightest thing on the floor.
     *
     * The prism bends blue more than red, so the band lands a little
     * further in for blue: white in the middle, colour only at its edges.
     */
    float converge = 0.35;
    // At a slant the same turn is carried further: the band lands further in
    // and spreads wider -- the same light over more floor, so it is dimmer.
    float width = (1.0 - converge) * slant;
    float shift = 0.55 * slant;
    float split = 0.05 * uPrism * slant;
    vec3 from = vec3(shift - split, shift, shift + split);
    vec3 band = smoothstep(from - soft, from + soft, vec3(x))
              * (1.0 - smoothstep(from + width - soft, from + width + soft, vec3(x)));
    through += band * pool * passes * 0.92 / width;
    /*
     * The light this bevel turned came through the glass a little toward the
     * rim of where the straight line crosses it (the band lands shift * W
     * inward); the panes below meet that turned ray, so carry the offset
     * down to them, per unit of height.
     */
    vec2 outward = edgeNormal * (dot(q, edgeNormal) >= 0.0 ? 1.0 : -1.0);
    turnedPerGap += outward * (shift * W) * band.g * inGlass / max(gap, 1.0);

    /*
     * The marks on the glass, where this ray crossed it (Q), so their pattern
     * is thrown across the photograph and slides as the lamp moves -- the
     * same marks, in the same place, that catch the lamp on the face.
     *
     *   under a smudge  the direct light, band and edge included, loses about
     *                   half its strength, and some of it comes back as a
     *                   soft glow: dimmer and softer, the greasy-window halo.
     *   under a scratch a thin line brighter than its surroundings: the
     *                   groove is a tiny cylinder lens gathering the light.
     */
    vec3 marks = surfaceAt(Q - r.xy, uSeed[i]) * uHasSurface;
    vec2 cover = marksCover(marks, uGrimeFloor, uMarksProportional);
    if (uMarksProportional > 0.5) {
      /*
       * Previewing (?try=marks). The marks stand off the photograph by the
       * pane's gap, so their shadows soften by the same penumbra as every
       * other shadow here (pen, on the glass plane): the pattern is averaged
       * over it. And they are worn in the amounts the pane says.
       */
      vec2 o = vec2(pen * 0.5, 0.0);
      vec3 around = surfaceAt(Q - r.xy + o, uSeed[i]) + surfaceAt(Q - r.xy - o, uSeed[i])
                  + surfaceAt(Q - r.xy + o.yx, uSeed[i]) + surfaceAt(Q - r.xy - o.yx, uSeed[i]);
      marks = (marks + around * uHasSurface) / 5.0;
      cover = marksCover(marks, uGrimeFloor, 1.0) * uMarks[i];
    }
    // On the flat face only, faded out across the bevel's inner part, as the glass shader draws them (MARKS_FADE).
    cover *= smoothstep(${MARKS_FADE_FROM.toFixed(2)}, 1.0, x);
    float groove = cover.x;
    float smear = cover.y;
    through *= (1.0 - SMUDGE_EXTINCTION * smear) * (1.0 - SCRATCH_SHADOW * groove);
    through += vec3(pool * passes * SMUDGE_SCATTER * smear);

    // Wavy glass only -- flat glass has no pattern to throw.
    if (uCaustics > 0.0) {
      through *= causticAt(Q - r.xy, uSeed[i], penFloor, gap);
    }

    /*
     * Every pane the ray crosses filters it, in turn -- not only the first.
     *
     * This took the first pane the ray met and stopped. Where two panes
     * overlap (the fixed header over a pane, or over a band scrolling under
     * it) the ray passes through both, and the point where it stopped
     * crossing the upper one switched the floor to the lower pane's answer
     * in a single pixel: a hard line, curved toward the lamp because each
     * pane's crossing point moves with it (Ony's list, item 3). What a pane
     * lets through is a fraction of what reaches it; the fractions multiply,
     * and at each pane's edge its fraction eases back to 1 over the lamp's
     * penumbra (inGlass), so nothing starts or stops on a line.
     */
    light *= mix(vec3(1.0), through / max(pool, 1e-4), inGlass);
    crossedT *= mix(vec3(1.0), uThrough[i], inGlass);
    clearestT = max(clearestT, uThrough[i] * inGlass);
  }
  // Under a stack's overlap: the further panes' own transmission (exactly 1 under one pane).
  light *= crossedT / max(clearestT, crossedT);

  /*
   * What stands in the light: the share of the lamp's disc
   * the casters hide from here, each at its own height -- projected from the
   * lamp, softened by the disc and stretched toward it at a slant, and for a
   * caster on a pane spread by the frost the light crosses on the way down
   * (effects/optics/casters). What it hides is the lamp's own light here, so
   * the shadow is as deep as that light is strong.
   */
  if (uHasCasters > 0.5) {
    vec2 css = uViewport / uScale;
    /*
     * Each layer of casters at its own height, on its own face, passing its
     * own colour (docs/research/shadows.md 6 Change 3). On the photograph:
     * projected from the lamp from the layer's height, spread by the frost
     * of the glass its light crossed, (H - h) / H of it carried to the
     * caster's plane. Under the pane it rests on, its frosted face is lit
     * too, and it throws a closer, sharper shadow there first, from its
     * height over that face.
     */
    for (int k = 0; k < MAX_CASTER_LAYERS; k++) {
      if (k >= uCasterCount) break;
      float h = uCasterLayer[k].x;
      float face = uCasterLayer[k].y;
      vec3 pass = mix(vec3(1.0), uCasterTint[k], uCasterStrength);
      float extra = face > 0.0 ? underFrost * max(height - h, 0.0) / max(height, 1.0) : 0.0;
      float below = casterCover2(uCasters, uCasters2, css, P, lightXY, height, radius, h, extra, k);
      light *= mix(vec3(1.0), pass, below);
      if (face > 0.0 && faceHeight > 0.0 && abs(faceHeight - face) < 3.0) {
        float onFace = casterCover2(uCasters, uCasters2, css, P, lightXY, height - face, radius, h - face, 0.0, k);
        light *= mix(vec3(1.0), pass, onFace);
      }
    }
  }

  vec3 add = light * uLightGain;
  float lost = max(pool - dot(light, vec3(0.3333)), 0.0);
  return vec4(add, lost * uShadowGain);
}

void main() {
  vec2 P = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;

  /*
   * Seen THROUGH a pane, the floor is bent by it on the way back to the eye.
   * Near an edge the bevel pulls in what lies beyond it -- the same lensing
   * the glass does to the photograph -- so the light and shadow under the
   * glass are bowed toward the rim instead of sitting flat.
   */
  vec2 look = P;
  /*
   * The eye looks down through every pane over this point, the top one
   * first (the panes come highest first), and each bevel it looks through
   * bends the view by its own amount: under a stack's overlap, both.
   */
  for (int i = 0; i < ${MAX_FLOOR_PANES}; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec2 hs = r.zw * 0.5;
    vec2 q = P - (r.xy + hs);
    bool straight = r.z >= uViewport.x / uScale - 1.0;
    float dy = hs.y - abs(q.y);
    float dx = straight ? 1e5 : hs.x - abs(q.x);
    float d = min(dx, dy);
    if (d <= 0.0) continue;
    /*
     * ?try=corners (item 2a): round the corner. The nearer side decided the
     * bend's direction outright, so at the diagonal it flipped from sideways
     * to up-and-down in one pixel and the floor seen through the bevel broke
     * along a line running in from each corner. Blended across the diagonal
     * over the bevel's width (and the depth smoothed the same way), it turns.
     */
    vec2 outward = dy < dx ? vec2(0.0, sign(q.y)) : vec2(sign(q.x), 0.0);
    if (uCorners > 0.5 && !straight) {
      float k = max(min(0.5 * (dx + dy), uEdge[i]), 1e-3);
      float hk = max(k - abs(dx - dy), 0.0) / k;
      d = min(dx, dy) - hk * hk * k * 0.25;
      if (d <= 0.0) continue;
      float wy = smoothstep(-k, k, dx - dy);
      outward = normalize(mix(vec2(sign(q.x), 0.0), vec2(0.0, sign(q.y)), wy));
    }
    float x = edgeBand(d, uEdge[i]);
    float bend = (1.0 - x) * (1.0 - x) * uEdge[i] * 0.9 * uView;
    look += outward * bend;
  }

  /*
   * The photograph is a gap behind the glass, so from where the viewer's eye
   * is it appears moved by uViewShift (see effects/optics/viewpoint.ts). The
   * lamp and the glass are where they are; the point of the photograph seen
   * here is back along that shift.
   */
  /*
   * Every light in the list, each worked out on its own and summed: light
   * adds. With one light this is that light's floor exactly.
   */
  vec4 f = vec4(0.0);
  vec3 coloured = vec3(0.0);  // the same sum, each light in its own colour
  float burning = 0.0;        // the strongest light's charge: how far the room has gone over to the lamps
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    float c = uLightCharge[i];
    float lit = c * c * (3.0 - 2.0 * c);
    burning = max(burning, lit);
    vec2 at = look - uViewShift;
    // A line light (a neon tube) reaches this point from its nearest point.
    vec2 from = nearestOnLight(at, uLightPos[i].xy, uLightSpan[i]);
    // A beam (a flashlight) lights only what it points at (effects/light/beam).
    lit *= beamFactor(uLightAim[i], vec3(at - from, -uLightPos[i].z));
    // Its power and its height: inverse square, against the defaults (FloorLight uFloorScale).
    lit *= uFloorScale[i];
    vec4 one = floorAt(at, lit, from, uLightPos[i].z, uLightRadius[i]);
    if (uHasLens > 0.5 && i == uLensLight) {
      // The water's lenses: a bead's near-black shadow, a flat drop's focused core.
      vec4 l = texture2D(uLens, clamp(vec2(at.x / uLensSize.x, 1.0 - at.y / uLensSize.y), 0.0, 1.0));
      one.rgb *= l.r + 8.0 * l.g;
    }
    f += one;
    coloured += one.rgb * uLightColour[i];
  }
  // Film, not a calculator: bright light rolls off instead of clipping flat.
  vec3 add = toneMapFilm(f.rgb);
  /*
   * The shadow goes through the same film curve as the light: deep shade rolls
   * off toward black instead of clipping to it, so the shadow can be strong
   * enough to read far from the lamp without going solid right beside it.
   */
  float shade = 1.0 - exp(-f.a * 1.15);
  float a = clamp(max(add.r, max(add.g, add.b)) + shade, 0.0, 1.0);
  /*
   * The light's colour, inside the sum (item 19). Each light's floor is
   * summed in its own colour, and the colour of the light arriving here is
   * that sum over the uncoloured one: the lamp's warm white where only the
   * lamp reaches, the flash's cool white where only it does, the mix of the
   * two in proportion where both do. It used to be the first light's colour
   * for everything, so the flash lit the floor lamp-coloured.
   *
   * Applied after the film curve, as the colour always was: with one light
   * the ratio IS that light's colour and this is exactly the old floor.
   */
  vec3 warm = coloured / max(f.rgb, vec3(1e-5));
  warm = mix(uLightColour[0], warm, step(1e-5, max(f.r, max(f.g, f.b))));
  /*
   * Worked out premultiplied (the light is at most the coverage, so this is
   * a valid premultiplied colour), written straight: the shared context
   * (effects/engine/gl) is not premultiplied, and the browser multiplies it
   * back in when it copies the buffer out.
   */
  vec3 light = warm * add;
  /*
   * The room fill (docs/research/shadows.md 6 Change 1): the photograph is
   * lit by the room (A) plus the lamps, out = photo x (A + E). The part of
   * that under 1 is a multiply, which this layer can do as darkening:
   * photo x m x (1 - a) + light, with m = min(1, A + E). E here is the
   * lamps' light as it lands, so the pool's bright core gives the
   * photograph back its own exposure (estimate: E = the light's
   * brightest channel after the film curve). Over 1 the lamps add,
   * as they always did. A = 1 is exactly the old floor.
   */
  float E = max(add.r, max(add.g, add.b));
  float roomFill = mix(1.0, clamp(uRoomFill, 0.0, 1.0), burning);
  float m = min(1.0, roomFill + (1.0 - roomFill) * E);
  a = 1.0 - m * (1.0 - a);
  gl_FragColor = vec4(a > 0.0 ? light / a : vec3(0.0), a);
}
`;
