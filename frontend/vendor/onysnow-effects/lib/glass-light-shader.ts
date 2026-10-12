import { EDGE_PROFILE_GLSL } from "@fx/effects/optics/edge-profile.glsl";
import { REFLECTION_GLSL } from "@fx/effects/optics/reflection.glsl";
import { EDGE_SIDE_GLSL } from "@fx/effects/optics/edge-side.glsl";
import { MARKS_FADE_FROM, SURFACE_LAYERS_GLSL } from "@fx/effects/optics/surface-layers.glsl";
import { ENVIRONMENT_GLSL } from "@fx/effects/optics/environment.glsl";
import { SHARD_MAP_GLSL } from "@fx/effects/optics/shard-map";
import { LIGHTS_GLSL } from "@fx/effects/light/light-uniforms";
import { LAMP_COLOUR } from "@fx/effects/light/lights";
import { SHADOW_GLSL } from "@fx/effects/optics/shadow.glsl";
import { BOKEH_GLSL } from "@fx/effects/optics/bokeh.glsl";
import { BACKLIT_GLSL } from "@fx/effects/optics/backlit.glsl";
import { CONTACT_GAP_GLSL, FILM_LUT_MAX, FILM_LUT_SCALE } from "@fx/effects/optics/thin-film";

/**
 * Fragment shader for one pane of glass.
 *
 * Built from the technique the LiquidGlass library uses, rather than from
 * guesswork: a HEIGHT FIELD over the pane, normals taken from its gradient,
 * and the backdrop SAMPLED at an offset along those normals. That last part is
 * the whole difference between refraction and a filter. A CSS filter processes
 * every pixel where it already is; refraction means fetching the backdrop from
 * somewhere else, which is why no amount of blur, brightness or tint ever
 * looked like glass here.
 *
 * The backdrop is the photograph the band is sitting on. LiquidGlass has to
 * rasterise arbitrary DOM to get a texture; this site does not, because the
 * one thing behind every pane that matters is a picture already in the page.
 *
 * Parameters carry LiquidGlass's names and its defaults as the starting point
 * — refraction 0.69, chromatic aberration 0.05, fresnel 1, edge highlight 0.05
 * — so they can be compared against the reference rather than re-invented.
 *
 * What is modelled, in the order light meets it:
 *
 *   height    the bevel. A biconvex profile, deepest at the rim, flat across
 *             the middle, which is what gives an edge its lens.
 *   normal    the gradient of that height field, from the rounded-rect SDF.
 *   refract   the backdrop sampled along the normal, per channel, because
 *             glass disperses and a real edge fringes into colour.
 *   fresnel   reflectivity climbing toward grazing angles, so the rim turns
 *             mirror-like while the centre stays a window.
 *   specular  Blinn-Phong from the cursor light, treated as a real source.
 *   arris     the lit corner, blown out by the tonemap rather than drawn.
 *   sides     the pane's thickness, opening and closing as the page scrolls.
 *   material  photographed grime, shown only where light rakes across it.
 */
export const GLASS_LIGHT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2  uViewport;      // device pixels
uniform float uScale;         // device pixels per CSS pixel
uniform float uRestEdge;
uniform float uEdgeBloom;     // the camera spreading a lit edge into a glow ("Edge bloom")
uniform float uGlowOnly;      // 1: draw only the lit edge and its bloom (the .glass-glow layer)      // how much edge shows with nothing shining

/*
 * ---- What is standing on this pane ----
 *
 * Up to MAX_OCC shadow shapes, in the pane's own pixels, already displaced by
 * each occluder's cast vector -- so these are where the shadows LAND, not
 * where the photographs sit.
 *
 * uOccRect: centre.xy, half-size.zw
 * uOccSoft: corner radius, penumbra, strength, unused
 */
#define MAX_OCC 6
uniform vec4 uOccRect[MAX_OCC];
uniform vec4 uOccSoft[MAX_OCC];
/* uOccDir: direction from the lamp to the shadow (xy) and the light's slant cosine (z). */
uniform vec4 uOccDir[MAX_OCC];
uniform float uOccCount;

/*
 * The plastic resting on this pane (the orange buttons; item 18b,
 * ?try=shaderplastic), in the pane's own pixels. Lit here from the light
 * list instead of by CSS gradients that knew only the cursor's lamp.
 *
 * uPlasticRect: centre.xy, half-size.zw of the face
 * uPlasticLand: where the light through it lands -- cast offset.xy, growth.z, softness.w
 */
#define MAX_PLASTIC 4
uniform vec4 uPlasticRect[MAX_PLASTIC];
uniform vec4 uPlasticLand[MAX_PLASTIC];
uniform float uPlasticRadius[MAX_PLASTIC];
uniform float uPlasticCount;

/* The grime's fluorescence, colour x yield (effects/materials/surfaces): smears (oil), specks (dust). */
uniform vec3 uOilGlow;
uniform float uPipedGain;   // "Light piped through the glass"
uniform float uPipedReach;  // "How far piped light travels", px
uniform vec3 uDustGlow;

uniform vec4  uRect;          // x, y, w, h of this pane, CSS pixels
uniform float uRadius;        // corner radius, CSS pixels
uniform float uEdgeWidth;     // this pane's bevel width, CSS pixels -- the one edge every effect shares
uniform float uStraight;      // 1: a full-width band -- top and bottom edges only
uniform vec4  uFaces;         // how wide each side face shows, CSS px: top, bottom, left, right (effects/optics/edge-side paneFaces)
uniform float uBar;           // 1: a thin fixed bar (.glass--bar), thinner glass
uniform float uThickness;     // this pane's thickness, CSS px (its data-thickness)
uniform float uSeed;
uniform float uGrimeRake;   // tunable
uniform float uGrimeSpecks; // tunable
uniform float uGrimeFloor;  // tunable
uniform float uMarksProportional; // 1 while previewing ?try=marks
uniform float uGap;         // this pane's gap to the photographs behind it, CSS px
/*
 * The lamp's reflection on the face comes from causes only: what the glass is
 * made of (uIor), how frosted its surface is (uFrost), how high the lamp is
 * above it and how bright it is (the lights: uLightPos, uLightPower). There is no
 * glare setting -- see effects/optics/reflection.ts.
 */
uniform float uIor;          // this pane's material
uniform float uFrost;        // this pane's material
uniform float uUranium;      // uranium glass: how hard the glass itself glows green under UV (0: ordinary glass)
uniform float uBacklitGain;  // backlit glass (effects/optics/backlit): 0 off
uniform float uBacklitEdge;  // 0 both sides, 1 left, 2 right, 3 below, 4 above, 5 behind
uniform float uBacklitFill;  // how far in it carries, against the pane's size
uniform vec3  uBacklitColour;
uniform float uBounce;       // 1: light bouncing off the lit photograph lights the glass from below (?try=bounce, effects/light/bounce)
uniform float uContact;      // 1: resting dry on the pane below (?try=contact, effects/optics/thin-film)
uniform vec4 uFilmRect;      // where it overlaps that pane, CSS px
uniform float uFilmSigma;    // rms roughness of the two faces that meet, nm
uniform sampler2D uFilmLut;  // the air film's reflectance by gap (thin-film filmLut)
uniform float uFloorGain;
uniform float uCornerSoft;   // ?try=corners: how far in the bevel's lines round the corners, px (0: the old mitre)    // the floor pass's light gain ("Floor light"): how lit the print is shown
uniform float uFaceLamp;    // 1: the face's own image of the lamp is drawn (LAMP_REFLECTION_ENABLED)
// The lights: position, height above this pane, colour, power, size, charge.
${LIGHTS_GLSL}
/*
 * Where this pane stands in a stack (effects/scene/graph): the share of the
 * light from above that reaches it through the layers over it, and -- for the
 * top layer -- how much more the whole stack reflects than it would alone.
 * Both exactly 1 for a pane on its own.
 */
uniform vec3 uLightIn;
/*
 * Where the layer above throws its light onto this one, in this pane's own
 * pixels: centre.xy, half-size.zw, already moved by the cast vector. And its
 * corner radius, penumbra and whether there is a layer above at all. Outside
 * it the light arrives straight from the lamp; inside, through the layer.
 */
uniform vec4 uAboveRect;
uniform vec3 uAboveSoft;
uniform vec3 uReflectScale;

/*
 * The room the face reflects (see effects/optics/environment.ts): an HDR
 * equirectangular band, log-encoded, with mip levels filtered in linear
 * light. Causes only: the room, the camera's distance, and how rough the
 * front face is.
 */
uniform sampler2D uRoom;
uniform sampler2D uShardMap;    // a broken pane's pieces (effects/optics/shard-map), pane px
uniform float uHasShards;       // 1: this pane is broken and ?try=shardlight
uniform float uHasRoom;
uniform float uRoomWidth;       // texels round the full 360 degrees
uniform float uCameraDistance;  // CSS pixels from the screen
uniform vec3  uScatter;         // opal glass: its volume scattering, sigma * thickness per colour (0 for clear)
uniform vec3  uCoat;            // what an anti-reflection coating leaves of each reflection (1 for none)
uniform float uExactFresnel;    // ?try=polariser: s and p Fresnel, and the camera's filter
uniform float uPolariser;       // how perfect the camera's polarising filter is, 0 none
uniform float uPolariserAngle;  // its axis, radians across the screen
uniform float uFrontRoughness;  // GGX alpha of the face you look at
uniform float uRoomExposure;    // how brightly lit the room is (1: middle grey)
uniform vec2  uEye;             // the viewer's eye, from the viewport middle, CSS px

uniform sampler2D uBackdrop;  // the photograph behind this pane
uniform float uHasBackdrop;
uniform vec4  uImage;         // x, y, w, h of the image element, CSS pixels
uniform float uRoomKnee;      // 0, or ?try=dimroom's knee (environment ROOM_KNEE)
uniform float uBurn;          // 1 while previewing ?try=burn (edge-profile toneMapGlassBurn)
uniform vec3 uImageFit;       // intrinsic width / height, then its object-position (0..1)
// The light the photograph clipped, and the disc the frost spreads it over
// (effects/optics/bokeh).
uniform sampler2D uBokeh;       // the photograph above's hidden light
uniform float uHasBokeh;
uniform vec4  uImageBox;       // the box it shows in (its section)
uniform sampler2D uBokehBelow;  // and the photograph below's, for a band on a seam
uniform float uHasBokehBelow;
uniform vec4  uImageBelowBox;
uniform float uBokehRadius;   // CSS px
uniform float uBokehGain;     // the "Bokeh" knob
/*
 * The photograph BELOW the pane, for a band on a seam between two: its bottom
 * side face looks down at it. The same image as uBackdrop otherwise.
 */
uniform sampler2D uBackdropBelow;
uniform float uHasBelow;
uniform vec4  uImageBelow;
uniform vec3 uImageBelowFit;


uniform vec3  uWarm;
uniform vec3  uCool;

#define TAU 6.28318530718

/* LiquidGlass's defaults, kept by name so they can be compared with it. */
#define REFRACTION 0.69
#define CHROM_ABERRATION 0.05
#define EDGE_HIGHLIGHT 0.05
/*
 * The lamp's scattered light on the edge and its bloom (restored from
 * before step 8; see the lamp loop). EDGE_GLOW 0.0 turns it off whole.
 * The three numbers are the values the "Edge glow" and "Side reach"
 * settings had when they were retired.
 */
#define EDGE_GLOW 1.0
#define EDGE_GLOW_ARRIS 9.75
#define EDGE_GLOW_SIDE_REACH 0.7
#define FRESNEL 1.0
#define MAX_BEND 34.0   // peak displacement at the rim, CSS pixels

/*
 * The side face and the arris -- their absorption, the mirror, the glints and
 * the echo -- are modelled in effects/optics/edge-side.ts (optics plan step 8,
 * from the reference photographs), shared with the CSS side layers.
 */


/*
 * The edge: rounded box, band, Fresnel rise and tonemap, from the shared
 * optics library -- the same edge the CSS bend and the light under the glass
 * are drawn from. Its width is uEdgeWidth, per pane; there is no width here.
 */
${EDGE_PROFILE_GLSL}
${REFLECTION_GLSL}
${EDGE_SIDE_GLSL}
${SURFACE_LAYERS_GLSL}
${ENVIRONMENT_GLSL}
${SHARD_MAP_GLSL}
${SHADOW_GLSL}

/*
 * How much of the light is blocked at this point on the pane.
 *
 * This is the whole of the per-pixel occlusion. It replaces one number per
 * pane, which dimmed the entire rake in proportion to whatever was standing
 * in the light -- so a single photograph in a corner flattened the grime
 * across the whole band, and the dimming had no relationship to the shape of
 * the shadow you could see.
 *
 * Shadows do not add; the darkest one wins. Two overlapping prints do not
 * make a blacker hole than one, they make a hole the shape of both, so this
 * takes a max rather than a sum.
 *
 * The loop bound is a constant because GLSL ES 1.0 requires it, and the count
 * is tested inside rather than used as a break condition -- a uniform in the
 * loop condition fails to compile on some drivers, which is the kind of thing
 * that works everywhere you test it and not on somebody's laptop.
 */
float occlusionAt(vec2 local) {
  float blocked = 0.0;
  for (int i = 0; i < MAX_OCC; i++) {
    if (float(i) >= uOccCount) continue;
    vec4 rect = uOccRect[i];
    vec4 soft = uOccSoft[i];
    vec4 dir = uOccDir[i];
    // The one shadow model's shape (effects/optics/shadow): the penumbra
    // straddles the edge, so the shadow fades across it rather than stopping
    // dead at the boundary, and stretches along the direction to the lamp.
    float cover = shadowRect(local, rect.xy, rect.zw, soft.x, soft.y, dir.xy, dir.z);
    blocked = max(blocked, soft.z * cover);
  }
  return clamp(blocked, 0.0, 1.0);
}

/* How much of the light at this point came through the layer above, 0 to 1: its shadow, by the same model. */
float aboveCover(vec2 local) {
  if (uAboveSoft.z < 0.5) return 0.0;
  return shadowRect(local, uAboveRect.xy, uAboveRect.zw, uAboveSoft.x, uAboveSoft.y, vec2(0.0), 1.0);
}

/*
 * The surface, photographed, laid over the pane with no repeat to spot:
 * surfaceAt() in the shared surface-layers chunk, which the light under the
 * glass reads too (see effects/optics/surface-layers.glsl.ts).
 */

/*
 * Where a page point falls in an object-fit: cover image (x, y, w, h). fit
 * is the photograph's intrinsic aspect, then its object-position as 0..1:
 * the point of the photograph pinned to the same point of the box, which is
 * how a chosen focal point frames it (lib/page-photos). 0.5, 0.5 is centred.
 */
vec2 coverUv(vec2 pt, vec4 image, vec3 fit) {
  vec2 rel = (pt - image.xy) / max(image.zw, vec2(1.0));
  float aspect = fit.x;
  float boxAspect = image.z / max(image.w, 1.0);
  vec2 scale = boxAspect > aspect
    ? vec2(1.0, boxAspect / aspect)
    : vec2(aspect / boxAspect, 1.0);
  return (rel - fit.yz) / scale + fit.yz;
}

${BOKEH_GLSL}
${CONTACT_GAP_GLSL}
${BACKLIT_GLSL}

/*
 * The pane's signed distance, with the bevel's lines rounded through the
 * corners (?try=corners, item 2a). A rounded box's inner contours keep its
 * corner radius only until they are that deep; past it they meet in a mitre,
 * and the bevel's normal flips across the diagonal -- a thin line running in
 * from every corner. Here the depth to the two nearest sides is joined by a
 * smooth minimum as wide as their mean depth (capped at uCornerSoft), so the
 * rim is untouched and every contour inside curves round the corner
 * (edge-profile roundedRectSDFSmooth is the twin).
 */
float paneField(vec2 p, vec2 halfSize, float radius) {
  float d0 = roundedBox(p, halfSize, radius);
  if (uCornerSoft <= 0.0 || d0 >= 0.0) return d0;
  vec2 e = halfSize - abs(p);
  float k = min(0.5 * (e.x + e.y), uCornerSoft);
  if (k < 1e-3) return d0;
  float h = max(k - abs(e.x - e.y), 0.0) / k;
  float m = min(e.x, e.y) - h * h * k * 0.25;
  return max(d0, -m);
}

/*
 * The print at a point of the page (?try=bounce): the photograph below the seam
 * where a band crosses one and the point is past it, else the one behind; nothing
 * off the edge of either.
 */
vec3 printAt(vec2 pt) {
  bool below = uHasBelow > 0.5 && pt.y >= uImageBelow.y;
  vec2 uv = below ? coverUv(pt, uImageBelow, uImageBelowFit) : coverUv(pt, uImage, uImageFit);
  float on = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec3 c = below ? texture2D(uBackdropBelow, uv).rgb : texture2D(uBackdrop, uv).rgb * uHasBackdrop;
  return c * on;
}


/*
 * ---- Plastic (item 18b) ----
 *
 * A thin sheet of glossy, translucent orange plastic resting on the glass.
 * Every term follows a light in the list, and shows only with that light
 * OVER the sheet (Ony, 2026-09-29: "the light would only appear if the
 * cursor is right on top of it"): a glossy face seen straight on mirrors
 * what is in front of it, not what is beside it.
 *
 *   The face mirrors the light's bright core (two fifths of its size) as a
 *   small sharp highlight where the light is over it.
 *   The rounded edge facing the light catches it as a thin line.
 *   The sheet is a filter: the light through it lands behind it, orange and
 *   mild, a little wider than the button, where its cast puts it.
 *
 * The edge's shadow (the light the rounded edge bends away) darkens, which
 * this additive layer cannot do: it stays the CSS box-shadow.
 */
/* The lamp's own colour: what the glass's warm and cool tints are measured against. */
const vec3 LAMP_WHITE = vec3(${LAMP_COLOUR.join(", ")});

/*
 * How bright a fluorescence of yield 1 is against the grime's own raked
 * light: the strongest fluorescent thing on the page (a day-glo pigment)
 * glows several times brighter than the same spot merely lit.
 */
const float FLUOR_GAIN = 3.0;
// Uranium glass's emission: a vivid yellow-green, peaking near 520 nm.
const vec3 URANIUM_GREEN = vec3(0.38, 1.0, 0.1);

const vec3 PLASTIC_ORANGE = vec3(1.0, 0.62, 0.225); // oklch(0.8 0.17 58), the buttons' own

/* How squarely a light is over a sheet: 1 on it, 0 half the light's radius off it (css-vars litOver). */
float plasticOver(vec2 lightLocal, vec4 rect, float lightRadius) {
  vec2 off = max(abs(lightLocal - rect.xy) - rect.zw, 0.0);
  float t = min(1.0, length(off) / max(lightRadius * 0.5, 8.0));
  return 1.0 - t * t * (3.0 - 2.0 * t);
}

/* Whether any sheet is within reach of this point (the glow layer's early-out must not skip them). */
float plasticNear(vec2 local) {
  float near = 0.0;
  for (int k = 0; k < MAX_PLASTIC; k++) {
    if (float(k) >= uPlasticCount) continue;
    vec4 r = uPlasticRect[k];
    vec2 off = max(abs(local - r.xy) - r.zw, 0.0);
    near = max(near, step(length(off), 4.0));
  }
  return near;
}

/* The face's highlight and the lit rim: above the sheet (the .glass-glow layer). */
vec3 plasticFace(vec2 local) {
  vec3 sum = vec3(0.0);
  for (int k = 0; k < MAX_PLASTIC; k++) {
    if (float(k) >= uPlasticCount) continue;
    vec4 r = uPlasticRect[k];
    float rad = min(uPlasticRadius[k], min(r.z, r.w));
    vec2 q = local - r.xy;
    float sd = roundedBox(q, r.zw, rad);
    if (sd > 1.0) continue;
    float onFace = smoothstep(0.5, -0.5, sd);
    float rimBand = onFace * (1.0 - smoothstep(0.0, 1.2, -sd));
    vec2 n = normalize(vec2(
      roundedBox(q + vec2(1.0, 0.0), r.zw, rad) - roundedBox(q - vec2(1.0, 0.0), r.zw, rad),
      roundedBox(q + vec2(0.0, 1.0), r.zw, rad) - roundedBox(q - vec2(0.0, 1.0), r.zw, rad)
    ) + 1e-6);
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) break;
      vec2 L = nearestOnLight(local + uRect.xy, uLightPos[i].xy, uLightSpan[i]) - uRect.xy;
      // A beam (a flashlight) lights only what it points at.
      float c = uLightCharge[i] * beamFactor(uLightAim[i], vec3(local - L, -uLightPos[i].z));
      float lit = c * c * (3.0 - 2.0 * c);
      float over = plasticOver(L, r, uLightRadius[i]);
      // The core's mirror image: sharp, falling off over 1.6 core radii.
      float core = max(uLightRadius[i] * 0.35 * 1.6, 1.0);
      float u = distance(local, L) / core;
      float spec = u < 0.28 ? mix(0.85, 0.55, u / 0.28)
        : u < 0.6 ? mix(0.55, 0.14, (u - 0.28) / 0.32)
        : u < 1.0 ? mix(0.14, 0.0, (u - 0.6) / 0.4)
        : 0.0;
      sum += vec3(spec) * lit * onFace;
      // The rounded edge on the light's side of the sheet, brightest square on to it.
      float facing = dot(n, normalize(L - r.xy + 1e-6));
      sum += vec3(0.55 * smoothstep(0.1, 1.0, facing)) * over * lit * rimBand;
    }
  }
  return sum;
}

/* The light through the sheets, landed behind them: on the pane, under the sheets (the surface layer). */
vec3 plasticThrough(vec2 local) {
  vec3 sum = vec3(0.0);
  for (int k = 0; k < MAX_PLASTIC; k++) {
    if (float(k) >= uPlasticCount) continue;
    vec4 r = uPlasticRect[k];
    vec4 land = uPlasticLand[k];
    float on = 0.0;
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) break;
      vec2 Lr = nearestOnLight(r.xy + uRect.xy, uLightPos[i].xy, uLightSpan[i]);
      float c = uLightCharge[i] * beamFactor(uLightAim[i], vec3(r.xy + uRect.xy - Lr, -uLightPos[i].z));
      on += plasticOver(nearestOnLight(r.xy + uRect.xy, uLightPos[i].xy, uLightSpan[i]) - uRect.xy, r, uLightRadius[i]) * c * c * (3.0 - 2.0 * c);
    }
    if (on <= 0.0) continue;
    // A little wider than the button (7 px), grown and moved by its cast, and soft.
    vec2 halfLand = (r.zw + 7.0) * land.z;
    float rad = (min(uPlasticRadius[k], min(r.z, r.w)) + 7.0) * land.z;
    float sd = roundedBox(local - (r.xy + land.xy), halfLand, min(rad, min(halfLand.x, halfLand.y)));
    float sigma = land.w + 4.0;
    float cover = 1.0 - smoothstep(-2.0 * sigma, 2.0 * sigma, sd);
    // 0.18: the strength the CSS glow it replaces measured at on the page
    // (its 0.28 opacity, less what its blur spread away).
    sum += PLASTIC_ORANGE * 0.18 * cover * min(on, 1.0);
  }
  return sum;
}

/*
 * Add the plastic's light to a finished pixel.
 *
 * What a pixel here puts on the page is not its colour. It is drawn with
 * SRC_ALPHA / ONE_MINUS_SRC_ALPHA into a cleared buffer that is not
 * premultiplied, so the buffer holds (colour * a, a * a), and drawing that
 * canvas onto the page premultiplies it again: the page gets colour * a^3,
 * with a the pixel's brightest channel. (It is what gives the glass light its
 * steep toe; measured -- a flat 0.28 written this way never showed.)
 *
 * The plastic's terms are amounts of light ON THE PAGE, the way its CSS
 * layers were. So they are added to what the pixel already puts there, and
 * the sum is written back in the same form: a = (brightest)^(1/3), colour =
 * sum / a^3. A pixel with no plastic comes out exactly as before.
 */
vec4 withPlastic(vec3 colour, float alpha, vec3 plastic) {
  if (max(max(plastic.r, plastic.g), plastic.b) <= 0.0) return vec4(colour, alpha);
  vec3 shown = max(colour, 0.0) * alpha * alpha * alpha + plastic;
  float peak = min(max(max(shown.r, shown.g), shown.b), 1.0);
  float a = pow(peak, 1.0 / 3.0);
  return vec4(a > 0.0 ? min(shown / (a * a * a), 1.0) : vec3(0.0), a);
}

void main() {
  // gl_FragCoord counts up from the bottom; the page counts down from the top.
  vec2 frag = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;

  vec2 halfSize = uRect.zw * 0.5;
  vec2 p = frag - (uRect.xy + halfSize);
  /*
   * A band across the whole page has no sides: they are off the screen. Its
   * edges are measured as if it ran on forever sideways, so the rim, the
   * bevel and the bend run straight across and nothing turns a corner.
   */
  vec2 edgeHalf = uStraight > 0.5 ? vec2(1e5, halfSize.y) : halfSize;
  float d = paneField(p, edgeHalf, uRadius);
  float inside = smoothstep(0.5, -0.5, d);
  /*
   * The lit edge's own layer (uGlowOnly) is nothing but the edge and its
   * bloom, which is gone by 160 px from the rim (haze, exp(-d / 48)): the
   * rest of the pane is skipped rather than computed and thrown away, so
   * the second draw costs a band round the edge, not a second pane.
   */
  if (uGlowOnly > 0.5 && abs(d) > 160.0 && (uPlasticCount < 0.5 || plasticNear(frag - uRect.xy) < 0.5)) {
    gl_FragColor = vec4(0.0);
    return;
  }

  /*
   * ---- Normal from the height field ----
   *
   * The SDF's gradient is the outward normal of the pane's edge, taken by
   * central difference. Multiplied by the slope of the height field it becomes
   * the direction and strength of the bend: hard in the bevel, nothing at all
   * across the middle, which is exactly how a pane behaves.
   */
  const float EPS = 1.0;
  float dx = paneField(p + vec2(EPS, 0.0), edgeHalf, uRadius)
           - paneField(p - vec2(EPS, 0.0), edgeHalf, uRadius);
  float dy = paneField(p + vec2(0.0, EPS), edgeHalf, uRadius)
           - paneField(p - vec2(0.0, EPS), edgeHalf, uRadius);
  vec2 grad = normalize(vec2(dx, dy) + 1e-6);

  float depth = -d;                       // positive inside
  float band = edgeBand(depth, uEdgeWidth);

  /*
   * A displacement CURVE, not the raw derivative of the height field.
   *
   * Differentiating the squircle is correct and useless: its slope is enormous
   * in the first pixel and essentially zero two pixels in, so the bend existed
   * in a band three pixels wide and there was nothing to see. What matters is
   * not the exact surface normal at a point, it is how much displacement the
   * bevel produces across its whole width — strongest at the rim, falling
   * smoothly to nothing at the inner boundary.
   *
   * pow(1 - band, 1.6), from the screen-space refraction write-up at
   * zenn.dev/orectic, which reaches the same conclusion from the other
   * direction: the falloff is what you want, not the gradient.
   */
  float curve = pow(1.0 - band, 1.6);
  // The bevel bends what is behind it toward the middle of the pane.
  vec2 bend = grad * curve * REFRACTION * MAX_BEND;

  /*
   * ---- The backdrop, sampled ----
   *
   * Mapped through object-fit: cover and its object-position (coverUv, with
   * the scale kept for the bend below), so the photograph is sampled where it
   * is actually drawn rather than where its element happens to be.
   */
  vec2 rel = (frag - uImage.xy) / max(uImage.zw, vec2(1.0));
  float boxAspect = uImage.z / max(uImage.w, 1.0);
  vec2 coverScale = boxAspect > uImageFit.x
    ? vec2(1.0, boxAspect / uImageFit.x)
    : vec2(uImageFit.x / boxAspect, 1.0);
  vec2 uvBase = (rel - uImageFit.yz) / coverScale + uImageFit.yz;
  vec2 uvBend = bend / max(uImage.zw, vec2(1.0)) / coverScale;

  /*
   * Per-channel offsets. Long wavelengths refract least, so red travels a
   * shorter path than blue — the fringe on a real glass edge is not a tint
   * applied afterwards, it is three different samples.
   */
  vec3 refracted = vec3(
    texture2D(uBackdrop, uvBase + uvBend * (1.0 - CHROM_ABERRATION)).r,
    texture2D(uBackdrop, uvBase + uvBend).g,
    texture2D(uBackdrop, uvBase + uvBend * (1.0 + CHROM_ABERRATION)).b
  );
  vec3 straight = texture2D(uBackdrop, uvBase).rgb;

  /*
   * Only the bevel refracts. Across the body of the pane the displaced sample
   * and the straight one are the same anyway, but mixing explicitly keeps the
   * middle honest if the slope ever picks up numerical noise.
   */
  float bevel = 1.0 - band;
  bevel *= bevel;
  vec3 backdrop = mix(straight, refracted, bevel) - straight;

  /*
   * ---- Fresnel ----
   * Glass is barely reflective face-on and mirror-like at a grazing angle. On
   * a flat pane the grazing angles are the rim, so reflectivity climbs there.
   */
  float facing = clamp(depth / max(min(halfSize.x, halfSize.y), 1.0), 0.0, 1.0);
  float fresnel = FRESNEL * fresnelRise(facing);

  /*
   * The lamp's own terms -- how far it reaches this point, the specular, the
   * arris glint, the piped light, the grime it rakes, its image in the face
   * -- are worked out per light in the loop over the lights below (step B of
   * the light-system design), so every light in the list lights the glass.
   */

  // ---- The surface ----
  vec3 surf = surfaceAt(frag - uRect.xy, uSeed) * uHasSurface;
  float handled = 0.35 + 0.95 * surf.b;

  /*
   * Marks, not a film.
   *
   * These were the raw texture values scaled, and the map has signal almost
   * everywhere -- so every pixel of every pane carried a little something and
   * the whole panel read as dusty rather than as glass somebody had touched.
   * A wiped pane is CLEAR across most of its face and dirty in specific
   * places.
   *
   * smoothstep is the clarity control: everything below uGrimeFloor goes to
   * zero and stays there, which is what opens the pane back up, while what is
   * above it survives at close to full strength. Raising the floor removes
   * marks rather than dimming them, which is the difference between cleaning
   * glass and looking at it in worse light.
   */
  vec2 cover = marksCover(surf, uGrimeFloor, uMarksProportional);
  float glint = cover.x * 3.4 * handled;
  float smear = cover.y * 1.25 * handled;

  /*
   * ---- The arris ----
   *
   * The eased corner between the face and the side (effects/optics/
   * edge-side.ts). It holds every normal from the face's to the side's, so it
   * mirrors the lamp wherever the half-vector falls in that arc: a soft band
   * 1-2 px wide, brightest beside the lamp and gone along the rest of the
   * edge -- the short glints of the reference photos. Its width is the
   * corner's radius; its length is the lamp's size.
   *
   * The pixel's nearest point on the outline, and the outward normal there,
   * come from the same SDF as everything else.
   */
  float ad = abs(d);
  float arrisWear = 0.62 + 0.9 * surf.b * uHasSurface + 0.38 * (1.0 - uHasSurface);
  vec2 viewCentre = 0.5 * uViewport / uScale;
  vec3 eye = vec3(viewCentre + uEye, uCameraDistance);
  vec2 onEdge = frag - grad * d;
  float blockedEdge = occlusionAt(onEdge - uRect.xy);


  /*
   * ---- The room, in the arris ----
   *
   * Not gated on the lamp. The corner turns through a quarter circle in a
   * pixel or two, so it reflects a whole swath of the room -- for a top edge,
   * up to the ceiling and its lights -- which is why a pane's rim is bright
   * in any lit room. Four normals across the arc, each with its own Fresnel,
   * each blurred over its eighth of the arc.
   */
  vec3 ray = normalize(vec3(onEdge, 0.0) - eye);
  float texelsPerPx = uRoomWidth / (6.28318530718 * uCameraDistance) / uScale;
  float arcBias = roomLod(0.3927, uRoomWidth) - log2(max(texelsPerPx, 1e-4));
  vec3 arrisRoom = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float th = (float(k) + 0.5) * 0.3926990817;
    vec3 n = vec3(grad * sin(th), cos(th));
    vec3 r = reflect(ray, n);
    /*
     * Only the part of the arc that throws your line of sight back out into
     * the room reflects the room. Toward the side, the reflected ray runs on
     * into the page, onto the photograph -- the side's mirror, below.
     */
    vec3 seen = decodeRadiance(texture2D(uRoom, roomUvDir(r), arcBias).rgb);
    if (uRoomKnee > 0.0) seen = seen / (1.0 + seen / uRoomKnee);
    arrisRoom += step(0.0, r.z) * fresnelSchlick(dot(-ray, n), uIor) * seen;
  }
  arrisRoom *= 0.25 * arrisProfile(ad) * uRoomExposure * uHasRoom;

  /*
   * ---- The side faces ----
   *
   * Which of the two you can see depends on where the pane sits against your
   * eye, so they open against each other as the page scrolls; their heights
   * match the CSS side layers' (effects/scene/scene writeSides). Every boundary is
   * eased over the arris radius: nothing on a real edge is a hard step.
   *
   * The window through the side -- the photograph behind it, absorbed over
   * the long path -- is the CSS multiply layer (.glass-side): absorption
   * subtracts, and this canvas can only add. What this adds is what the side
   * REFLECTS, and the echo.
   */
  // Whole pixels, as the CSS side layers are placed (effects/scene/scene).
  // A closed face (0 px) draws nothing; the widths are kept off zero only so
  // nothing below divides by it.
  float topShows = step(0.5, uFaces.x);
  float botShows = step(0.5, uFaces.y);
  float topT = max(uFaces.x, 0.5);
  float botT = max(uFaces.y, 0.5);
  float withinX = step(uRect.x, frag.x) * step(frag.x, uRect.x + uRect.z) * inside;
  float dTop = frag.y - uRect.y;
  float dBot = (uRect.y + uRect.w) - frag.y;
  float onTop = smoothstep(-ARRIS_RADIUS, ARRIS_RADIUS, dTop)
    * (1.0 - smoothstep(topT - ARRIS_RADIUS, topT + ARRIS_RADIUS, dTop)) * withinX * topShows;
  float onBot = smoothstep(-ARRIS_RADIUS, ARRIS_RADIUS, dBot)
    * (1.0 - smoothstep(botT - ARRIS_RADIUS, botT + ARRIS_RADIUS, dBot)) * withinX * botShows;

  /*
   * The side as a mirror. You see it at a grazing angle, so it reflects
   * strongly -- Fresnel from how grazing the look is, which is how thin the
   * side shows (sideCosine) -- and what it reflects is what
   * faces it: the photograph above the top edge, the one below the bottom
   * edge, reached by following the ray off the side to the photograph the
   * gap behind (mirrorReach). Its light and dark blocks are that photograph,
   * flipped and squeezed, so the pattern changes along the edge and moves as
   * your eye does.
   */
  float xLean = (frag.x - eye.x) / uCameraDistance;
  float topY = uRect.y;
  float botY = uRect.y + uRect.w;
  float fTop = fresnelSchlick(sideCosine(topT, uThickness), uIor);
  float fBot = fresnelSchlick(sideCosine(botT, uThickness), uIor);
  float zTop = uThickness * (1.0 - clamp(dTop / topT, 0.0, 1.0));
  float zBot = uThickness * (1.0 - clamp(dBot / botT, 0.0, 1.0));
  vec2 seenTop = vec2(frag.x + xLean * (uGap + zTop), topY - mirrorReach(dTop, topT, uGap, uThickness));
  vec2 seenBot = vec2(frag.x + xLean * (uGap + zBot), botY + mirrorReach(dBot, botT, uGap, uThickness));
  vec3 mirrorTop = texture2D(uBackdrop, coverUv(seenTop, uImage, uImageFit)).rgb * uHasBackdrop;
  vec3 mirrorBot = texture2D(uBackdropBelow, coverUv(seenBot, uImageBelow, uImageBelowFit)).rgb * uHasBelow;
  vec3 sideLight = mirrorTop * fTop * onTop + mirrorBot * fBot * onBot;


  /*
   * What the side RELAYS: looking along the slab, light from under the pane
   * reaches you by total internal reflection -- the photograph there,
   * squeezed and flipped into the side, the light and dark blocks of the
   * reference photos. Same geometry as the mirror, turned inward. Unlike the
   * reflections it HAS crossed the glass, so it is left for the side layer to
   * absorb (added after the division below).
   */
  vec2 relayTop = vec2(frag.x - xLean * (uGap + zTop), topY + mirrorReach(dTop, topT, uGap, uThickness));
  vec2 relayBot = vec2(frag.x - xLean * (uGap + zBot), botY - mirrorReach(dBot, botT, uGap, uThickness));
  vec3 relayed = RELAY_GAIN * (
    texture2D(uBackdrop, coverUv(relayTop, uImage, uImageFit)).rgb * uHasBackdrop * onTop * (1.0 - fTop)
    + texture2D(uBackdropBelow, coverUv(relayBot, uImageBelow, uImageBelowFit)).rgb * uHasBelow * onBot * (1.0 - fBot)
  );

  /*
   * The echo: through the face just inside the edge, the side seen again by
   * total internal reflection -- a paler copy of the edge displaced inward by
   * the side's height, its light having crossed the side twice.
   */
  vec3 behindBelow = texture2D(uBackdropBelow, coverUv(frag, uImageBelow, uImageBelowFit)).rgb * uHasBelow;
  vec3 echoTint = exp(-SIDE_ABSORB * 2.0 * SIDE_PATH_MIN) * ECHO_GAIN;
  sideLight += echoTint * withinX * (
    straight * uHasBackdrop * echoProfile(dTop, topT) * topShows
      + behindBelow * echoProfile(dBot, botT) * botShows
  );
  /*
   * Only where a pane has them: a band across the page has none, and it is
   * most of the glass on the site, so it skips these twelve texture reads
   * outright (a branch on a uniform, which every driver takes as one).
   */
  if (max(uFaces.z, uFaces.w) >= 0.5) {
    /*
     * The left and right faces (item 18): the same side, standing upright.
     * What each mirrors is what faces it -- the photograph to the left of the
     * left edge, to the right of the right edge -- followed off the side the
     * same way, leaning with the eye up and down the page instead of across.
     * A pane is over one photograph, or over the join of two (a seam band,
     * which runs the full width and so has no left and right faces): the half
     * of the pane a point is in says which.
     */
    float leftShows = step(0.5, uFaces.z);
    float rightShows = step(0.5, uFaces.w);
    float leftT = max(uFaces.z, 0.5);
    float rightT = max(uFaces.w, 0.5);
    float withinY = step(uRect.y, frag.y) * step(frag.y, uRect.y + uRect.w) * inside;
    float dLeft = frag.x - uRect.x;
    float dRight = (uRect.x + uRect.z) - frag.x;
    float onLeft = smoothstep(-ARRIS_RADIUS, ARRIS_RADIUS, dLeft)
      * (1.0 - smoothstep(leftT - ARRIS_RADIUS, leftT + ARRIS_RADIUS, dLeft)) * withinY * leftShows;
    float onRight = smoothstep(-ARRIS_RADIUS, ARRIS_RADIUS, dRight)
      * (1.0 - smoothstep(rightT - ARRIS_RADIUS, rightT + ARRIS_RADIUS, dRight)) * withinY * rightShows;
    float yLean = (frag.y - eye.y) / uCameraDistance;
    float leftX = uRect.x;
    float rightX = uRect.x + uRect.z;
    float fLeft = fresnelSchlick(sideCosine(leftT, uThickness), uIor);
    float fRight = fresnelSchlick(sideCosine(rightT, uThickness), uIor);
    float zLeft = uThickness * (1.0 - clamp(dLeft / leftT, 0.0, 1.0));
    float zRight = uThickness * (1.0 - clamp(dRight / rightT, 0.0, 1.0));
    float lowerHalf = step(uRect.y + 0.5 * uRect.w, frag.y);
    vec2 seenLeft = vec2(leftX - mirrorReach(dLeft, leftT, uGap, uThickness), frag.y + yLean * (uGap + zLeft));
    vec2 seenRight = vec2(rightX + mirrorReach(dRight, rightT, uGap, uThickness), frag.y + yLean * (uGap + zRight));
    vec3 mirrorLeft = mix(
      texture2D(uBackdrop, coverUv(seenLeft, uImage, uImageFit)).rgb * uHasBackdrop,
      texture2D(uBackdropBelow, coverUv(seenLeft, uImageBelow, uImageBelowFit)).rgb * uHasBelow,
      lowerHalf);
    vec3 mirrorRight = mix(
      texture2D(uBackdrop, coverUv(seenRight, uImage, uImageFit)).rgb * uHasBackdrop,
      texture2D(uBackdropBelow, coverUv(seenRight, uImageBelow, uImageBelowFit)).rgb * uHasBelow,
      lowerHalf);
    sideLight += mirrorLeft * fLeft * onLeft + mirrorRight * fRight * onRight;
    // The same relay through the left and right faces, turned inward.
    vec2 relayLeft = vec2(leftX + mirrorReach(dLeft, leftT, uGap, uThickness), frag.y - yLean * (uGap + zLeft));
    vec2 relayRight = vec2(rightX - mirrorReach(dRight, rightT, uGap, uThickness), frag.y - yLean * (uGap + zRight));
    relayed += RELAY_GAIN * (
      mix(
        texture2D(uBackdrop, coverUv(relayLeft, uImage, uImageFit)).rgb * uHasBackdrop,
        texture2D(uBackdropBelow, coverUv(relayLeft, uImageBelow, uImageBelowFit)).rgb * uHasBelow,
        lowerHalf) * onLeft * (1.0 - fLeft)
      + mix(
        texture2D(uBackdrop, coverUv(relayRight, uImage, uImageFit)).rgb * uHasBackdrop,
        texture2D(uBackdropBelow, coverUv(relayRight, uImageBelow, uImageBelowFit)).rgb * uHasBelow,
        lowerHalf) * onRight * (1.0 - fRight)
    );
    sideLight += echoTint * withinY * mix(straight * uHasBackdrop, behindBelow, lowerHalf) * (
      echoProfile(dLeft, leftT) * leftShows + echoProfile(dRight, rightT) * rightShows
    );
  }



  // ---- Light off the grime ----
  /*
   * There used to be a "flashlight" here: a pool of the lamp painted on the
   * face, behind a setting that sat at zero. The lamp on the face is its
   * reflection, and that is now worked out from the material below.
   */

  /*
   * The grime, raked by the light.
   *
   * This is the term that makes a pane look USED, and it had been tuned down
   * far enough to disappear. Dust and finger-smear on glass are invisible
   * until something catches them at a shallow angle -- which is what rake is
   * -- and then they are the most obvious thing on the surface. Weak here does
   * not read as subtle, it reads as clean glass.
   *
   * The smears carry most of it now rather than the specks: a wiped pane is
   * mostly broad films with a few bright points in them, not an even dusting.
   */
  /*
   * Drawn HERE, by this pass, which is where it was and where it looked
   * right.
   *
   * It spent one commit as '.glass__grime', a tiled span inside each pane, on
   * the reasoning that a mark on a surface cannot be in front of the things
   * resting on it. The reasoning still holds. The result did not: a 2048px
   * map tiled at native size and pushed through brightness(1.8) contrast(3.2)
   * lights up 11% of every pixel on the pane and blows 5.9% of them to white,
   * which is not a wiped pane with a few marks on it, it is an even
   * high-frequency field -- generated-looking, because the arithmetic made it
   * generated. The shader's version is sparse because 'rake' is a real
   * falloff around the source rather than a mask over a repeating tile.
   *
   * The layering complaint is real and comes back with this. It is a separate
   * problem from what the marks LOOK like, and trading the look away to fix
   * it was the wrong trade.
   */
  /*
   * Cut by what is standing on the glass.
   *
   * A photograph blocking the source is also stopping that light reaching the
   * marks underneath it, so the rake has a hole in it the shape of the
   * shadow. Not taken all the way to zero: a shadow on a real pane is not a
   * void -- the grime there still catches the ambient room, just not the
   * source.
   */
  float blocked = occlusionAt(frag - uRect.xy);
  float unlit = 1.0 - blocked * 0.88;


  /*
   * Grime also scatters the light passing THROUGH the pane, not only what
   * grazes it. That was a term here scaled by a setting that sat at zero; it
   * comes back driven by the smudge layer in step 9 of the optics plan.
   */




  /*
   * What the glass does to the photograph is not gated on the charge. A pane
   * bends, absorbs and reflects what is around it whether or not anybody is
   * shining anything at it: the side's mirror and echo, and the room in the
   * arris, are there with the shutter idle.
   *
   * They are also untinted. Their colour belongs to the photograph, the room
   * and the absorption; warming it by distance from the cursor would paint
   * the light's colour onto something the light is not responsible for.
   */
  /*
   * The face's refraction is NOT done here, and cannot be.
   *
   * This canvas composites with plus-lighter, which only ever adds. Refraction
   * means MOVING pixels — the original has to be replaced, not brightened —
   * and adding a displaced copy on top of an image that is still there at full
   * strength produces a faint double exposure, which is exactly what it looked
   * like. The bevel's displacement belongs to the SVG filter in the stylesheet,
   * which samples the backdrop from another position and composites behind the
   * content where it can actually replace it.
   *
   * What the side face and the arris REFLECT stays here, because reflection
   * is genuinely additive: it lands on top of what is seen through them. The
   * absorption through the side is the CSS multiply layer.
   */
  /*
   * ---- Every light in the list ----
   *
   * Each light's contribution is worked out on its own and summed: light
   * adds (superposition). With one light the sums are that light's terms
   * exactly, so the page did not change when the loop arrived.
   */
  vec3 lampLight = vec3(0.0);     // (tint * face + mirror) * lit, per light
  vec3 lampGlow = vec3(0.0);      // tint * rim * lit: the lit edge and its bloom, per light
  vec3 lampSpecular = vec3(0.0);  // the Blinn-Phong highlight, per light
  vec3 lampMirror = vec3(0.0);    // the face's image of each light (lampReflection), for the contact film
  vec3 bounceUp = vec3(0.0);      // light bounced off the photograph into the glass from below
  vec3 lampEdge = vec3(0.0);      // the bevel's share of each light, in its colour
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    // A line light (a neon tube) reaches this point from its nearest point.
    vec2 lightXY = nearestOnLight(frag, uLightPos[i].xy, uLightSpan[i]);
    float lightHeight = uLightPos[i].z;
    float lightPower = uLightPower[i];
    // A beam (a flashlight) lights only what it points at (effects/light/beam).
    float charge = uLightCharge[i] * beamFactor(uLightAim[i], vec3(frag - lightXY, -lightHeight));

    // ---- The light, and how far it reaches this point ----
    float dl = distance(frag, lightXY);
    float direct = 1.0 / (1.0 + (dl * dl) / 3600.0);
    float spill = exp(-dl / 280.0);
    float reach = direct + spill * 0.11;

    /*
     * Grime rides the BROAD falloff, not the core.
     *
     * This was direct + spill * 0.035 -- so almost entirely the direct term,
     * which is half strength at 60px and 2% by 400px. The smears therefore existed only
     * in a tight pool directly under the cursor, which is precisely where the
     * blown core whites everything out. Raising their strength could never fix
     * that: the problem was reach, not amount.
     *
     * A smear catches any light crossing it, and at any distance the light
     * reaching it is the wide scatter rather than the hot centre. So the spill
     * term carries most of this now, and the direct term is pulled back so the
     * area around the pointer stops blowing out.
     */
    float rake = direct * 0.55 + spill * 0.6;

    /*
     * ---- Blinn-Phong specular ----
     * The cursor light is a real source, so the pane answers it with a real
     * highlight: half-vector against the surface normal, tightened by the bevel.
     */
    vec2 toLight = normalize(lightXY - frag + 1e-6);
    float ndl = max(dot(grad, toLight), 0.0);
    float specular = pow(ndl, 24.0) * bevel * direct * 3.0;


    vec3 lamp = vec3(lightXY, lightHeight);
    float arrisLamp = arrisGlint(onEdge, grad, lamp, uLightRadius[i], eye, uFrontRoughness, lightPower, uIor)
      * arrisWear * (1.0 - blockedEdge);
    /*
     * The camera's bloom round that highlight: a lens spreads a bright line
     * into a glow, and the glow is what tells you the line is bright rather
     * than merely pale. It follows the highlight -- there is no glow where the
     * arris is not lit. (It used to ride the lamp's distance, which lit the
     * whole width of a pane white whenever the lamp was near.)
     */
    float bloom = (exp(-ad / 15.0) * 0.35 + exp(-ad / 48.0) * 0.05) * uEdgeBloom;
    vec3 rim = vec3(arrisLamp * (arrisProfile(ad) + bloom));

    /*
     * ---- Light piped through the pane ----
     *
     * A pane is a light guide. Light that gets into it is trapped by total
     * internal reflection between the two faces and travels until it reaches an
     * edge, where the angle finally breaks and it escapes -- the principle of an
     * edge-lit acrylic sign, and why the far edge of a pane glows when you put a
     * torch anywhere on it. It escapes AT the arris, so it has the arris's
     * width, and it goes green on the way: the path is the pane's width.
     *
     * Only scattered light is trapped. Light crossing clear glass leaves by the
     * far face at the angle it came in; it takes a rough surface -- the frost,
     * the grime -- to throw some of it past the critical angle. So how much is
     * piped follows the frost, and a clear pane pipes almost nothing. (It was
     * the same for every pane, with a 15 px glow of its own, which lit the
     * whole width of the edge white whenever the lamp was near.)
     */
    float toPane = roundedBox(lightXY - (uRect.xy + halfSize), halfSize, uRadius);
    float couple = exp(-max(toPane, 0.0) / 130.0) * uFrost;
    /*
     * How far it gets: along the whole edge, as it always did (Ony,
     * 2026-09-28: the piped light is part of the look). The frost-escape
     * and 1/distance spreading tried in cae9b1c cut it to a couple of hundred
     * pixels and the light stopped reaching the other edges, so it is back
     * to the run it had. What keeps a far edge dark is the coupling above:
     * the lamp has to be over or near THIS pane to put light into it.
     */
    float piped = couple * exp(-dl / uPipedReach) * uPipedGain;
    vec3 pipedTint = exp(-SIDE_ABSORB * 0.45);
    rim += pipedTint * arrisProfile(ad) * 1.7 * arrisWear * piped;

    /*
     * ---- The edge glowing where the lamp is, and its bloom ----
     *
     * Back from before optics step 8 (fde9b4e), at Ony's request (2026-09-29:
     * "no bloom. no edge lights"). Step 8 kept only the arris's MIRROR image
     * of the lamp, which shows only where the geometry puts it, so at most
     * lamp positions the edge stayed dark. A real edge also SCATTERS the
     * lamp's light: the ground corner and the frost send it out in every
     * direction, brightest where the lamp is nearest and fading with it, and
     * the camera spreads that bright line into a bloom. These are those
     * terms, as they were: a tight line on the arris, its glow (flare) and
     * haze, the side faces' glare and the far arris line, all falling off
     * with the lamp's reach and gated by its charge like everything else.
     */
    float filament = exp(-ad / 2.8);
    float flare = exp(-ad / 15.0);
    float haze = exp(-ad / 48.0);
    float edgeFacing = 0.72 + 0.28 * smoothstep(0.35, 0.85, abs(grad.y));
    rim += vec3(filament * EDGE_GLOW_ARRIS * arrisWear + (flare * 4.6 + haze * 0.34) * uEdgeBloom)
      * reach * edgeFacing * EDGE_GLOW;
    rim += pipedTint * flare * 0.8 * uEdgeBloom * piped * edgeFacing * EDGE_GLOW;
    float grazing = direct * 0.3 + spill * EDGE_GLOW_SIDE_REACH;
    float glareTop = exp(-pow((dTop - topT * 0.5) / (topT * 0.42), 2.0)) * step(0.0, dTop);
    float glareBot = exp(-pow((dBot - botT * 0.5) / (botT * 0.42), 2.0)) * step(0.0, dBot);
    float farTopLine = exp(-pow((dTop - topT) / 1.7, 2.0)) * step(0.0, dTop);
    float farBotLine = exp(-pow((dBot - botT) / 1.7, 2.0)) * step(0.0, dBot);
    // How far round the face is turned toward you: its edge's offset past
    // the eye, over half the view.
    float halfView = max(0.5 * uViewport.y / uScale, 1.0);
    float topOpenness = clamp(sideOffset(uFaces.x, uThickness, uBar, uCameraDistance) / halfView, 0.0, 1.0);
    float botOpenness = clamp(sideOffset(uFaces.y, uThickness, uBar, uCameraDistance) / halfView, 0.0, 1.0);
    float sideGlare = (glareTop * topOpenness + glareBot * botOpenness) * withinX;
    rim += vec3(sideGlare) * 11.0 * grazing * edgeFacing * EDGE_GLOW;
    rim += vec3((farTopLine * topOpenness + farBotLine * botOpenness) * withinX) * 5.0 * direct * EDGE_GLOW;

    /*
     * The front face, short of the side faces you can see past it (a side
     * face shows within its own width of the rim, uFaces). The marks keep
     * off the edge too (Ony, 2026-10-01: "I can see scratches and smudges on
     * the edges/sides I don't want that"): faded out across the bevel, so
     * there is still no line where they stop (his earlier note: "you can see
     * where the texture/scratch/smudge layer in the glass cuts off").
     */
    float frontTop = smoothstep(topT - 0.5, topT + 1.0, dTop);
    float frontBot = smoothstep(botT - 0.5, botT + 1.0, dBot);
    float frontL = smoothstep(max(uFaces.z, 0.5) - 0.5, max(uFaces.z, 0.5) + 1.0, frag.x - uRect.x);
    float frontR = smoothstep(max(uFaces.w, 0.5) - 0.5, max(uFaces.w, 0.5) + 1.0, uRect.x + uRect.z - frag.x);
    float onFace = inside * frontTop * frontBot * mix(frontL * frontR, 1.0, uStraight);
    // The marks: on the flat face, faded out across the bevel, none on the edge or the sides (MARKS_FADE_FROM).
    float marksHere = onFace * smoothstep(${MARKS_FADE_FROM.toFixed(2)} * uEdgeWidth, uEdgeWidth, depth);
    vec3 face = vec3(marksHere * rake * (smear * uGrimeRake + glint * uGrimeSpecks) * unlit);

    /*
     * ---- The lamp, reflected by the face ----
     *
     * Glass reflects about 4% straight on -- ((n - 1) / (n + 1))^2 -- and more
     * toward grazing. It was two settings, both at zero, so the pane reflected
     * nothing. Now it is the material's reflectance, spread by the surface's
     * roughness: polished glass gives a small, sharp, bright image of the lamp;
     * frost spreads the same light into a wide, dim sheen. Neither end is
     * tuned; both follow from uIor, uFrost and where the lamp is.
     *
     * Blocked by whatever is standing on the glass between it and the lamp.
     */
    float reflected = lampReflection(frag - lightXY, lightHeight, lightPower * uFaceLamp, uIor, uFrost);
    vec3 mirror = inside * uLightColour[i] * reflected * (1.0 - blocked);

    /*
     * Everything the light does scales with the charge, and there is genuinely
     * nothing at zero: glass does not glow, a light shining on it does. The
     * refraction is NOT gated — a pane bends what is behind it whether or not
     * anybody is shining anything at it.
     */
    float lit = charge * charge * (3.0 - 2.0 * charge);
    vec3 tint = mix(uWarm, uCool, smoothstep(0.0, 1.0, dl / 460.0));
    /*
     * The warm-to-cool tint is the lamp's; another light shifts it by its own
     * colour against the lamp's white -- a flare's rim burns red, the flash's
     * a little cooler. The lamp against itself is exactly 1, so its look is
     * untouched.
     */
    tint *= uLightColour[i] / LAMP_WHITE;
    // A black light's visible glow is its own violet, not the lamp's whites.
    float uvShare = uLightUv[i];
    tint = mix(tint, uLightColour[i], uvShare);

    /*
     * Fluorescence (items 20, 25a). A UV light shows not what it lights but
     * what glows under it, and that is the materials' business
     * (effects/materials/surfaces): the specks -- dust and lint, fibres
     * carrying laundry brighteners -- glow blue-white; the smears -- finger
     * grease -- barely at all, as untreated prints do not. The UV reaches
     * them by the physical falloff (inverse square, with the slant), not the
     * grime's tight rake: in the dark a black light leaves, a mark lit by a
     * tenth of the UV under the lamp still glows plainly, so its reach looks
     * far longer than the lamp's light did. Not where something standing on
     * the glass shades them. The clean glass does not glow.
     */
    // cos^3 of the slant: the irradiance falloff of effects/optics/transmission.
    float uvCos = lightHeight / sqrt(dl * dl + lightHeight * lightHeight);
    vec3 fluor = marksHere * uvCos * uvCos * uvCos * unlit * uvShare * FLUOR_GAIN
      * (smear * uOilGlow + glint * uDustGlow);

    /*
     * Opal glass (catalogue item 32d, ?try=opal): the glass itself scatters,
     * so the clean glass glows where a light reaches it. Of the light that
     * crosses the slab, 1 - exp(-sigma t) is scattered -- Rayleigh-like,
     * blue most (sigma ~ lambda^-4) -- and about half of it comes back out
     * of the face toward you. Arriving at a slant it falls as cos^3.
     */
    vec3 opal = onFace * uvCos * uvCos * uvCos * unlit * (1.0 - exp(-uScatter)) * 0.5
      * (uLightColour[i] / LAMP_WHITE) * (1.0 - uvShare);
    /*
     * Uranium glass (Ony, 2026-10-01, with a photograph of a uranium glass
     * dish under a black light): the glass itself fluoresces, a vivid green
     * through its whole body. Its uranyl ions absorb UV and re-emit around
     * 520 nm; the light it makes inside is trapped by total internal
     * reflection and leaves mostly at the edges, so the rims blaze
     * brighter than the face, and they light what is round them green
     * (into the glow layer, which spills past the rim). Reached by the UV's
     * own falloff, not shaded by the grime.
     */
    float uvIn = uvCos * uvCos * uvCos * uvShare * uUranium;
    float uranRim = exp(-max(depth, 0.0) / 5.0);
    vec3 uranium = URANIUM_GREEN * uvIn * (inside * 2.2 + 5.0 * uranRim * inside);
    lampGlow += URANIUM_GREEN * uvIn * uranRim * 4.0 * lit;
    lampLight += (tint * face + mirror) * lit + fluor * lit + opal * lit + uranium * lit;
    lampMirror += mirror * lit;
    lampGlow += tint * rim * lit;
    /*
     * A glass surface reflects light as it comes, so a highlight is the
     * colour of the light it mirrors: the lamp's reads white (it is the
     * white here), a red flare's or a laser spot's reads in its own colour.
     */
    vec3 mirrored = mix(uLightColour[i] / LAMP_WHITE, uLightColour[i], uvShare);
    lampSpecular += mirrored * specular * inside * lit * uCoat;
    lampEdge += mirrored * bevel * lit;

    /*
     * ---- Light bouncing off the photograph (?try=bounce; effects/light/bounce) ----
     * The pool this light makes on the print, a disc as wide as the light is
     * high above it, sends back the print's own colour; the frosted back face
     * of this pane, a gap above, scatters what reaches it and half comes out
     * toward you. The print's colour there is its reflectance (the backdrop
     * is sRGB, so it is linearised first).
     */
    if (uBounce > 0.5 && uHasBackdrop + uHasBelow > 0.5) {
      float abovePhoto = lightHeight + uGap;
      float poolR = max(abovePhoto, 1.0) * 0.6;
      vec2 o = vec2(poolR * 0.45, 0.0);
      vec3 print = printAt(lightXY) + printAt(lightXY + o) + printAt(lightXY - o)
        + printAt(lightXY + o.yx) + printAt(lightXY - o.yx);
      vec3 albedo = pow(print / 5.0, vec3(2.2));
      float d2 = dl * dl;
      float form = (poolR * poolR) / (poolR * poolR + uGap * uGap + d2);
      /*
       * The pool's irradiance is the floor pass's (FloorLight): its "Floor light" gain,
       * through this pane on the way down (two faces' Fresnel, about 0.92), cos^3 across
       * the disc -- in the units the print is SHOWN lit in, where 1 is a white print at
       * full white. A matte print's glow in those units is its albedo times that; the
       * frosted underside a gap above catches the disc's form factor of it, and sends
       * about half of what it scatters on toward you (effects/light/bounce, bounceGlow).
       */
      // 0.8: cos^3 averaged over a disc 0.6 of the height across (bounce.ts, POOL_MEAN).
      float pool = 0.92 * uFloorGain * 0.8;
      bounceUp += (uLightColour[i] / LAMP_WHITE) * albedo * pool * form * uFrost * 0.5 * lit * (1.0 - uvShare);
    }
  }

  vec3 colour = sideLight + arrisRoom;
  vec3 lightIn = mix(vec3(1.0), uLightIn, aboveCover(frag - uRect.xy));
  colour += lampLight * lightIn;
  // From below, not through the stack above: it does not pass the light-in filter.
  colour += bounceUp;
  /*
   * The specular is the LIGHT, so it is gated on the light. The bevel's edge
   * highlight is GEOMETRY, so it is not.
   *
   * These two were summed and put behind (0.35 + 0.65 * lit), which let 35%
   * of a Blinn-Phong highlight through at zero charge -- a soft bright blob
   * tracking the pointer across every pane whether or not anything was
   * shining. Reported twice as a glow that should not be there before the
   * charge, and both times I looked at CursorLight, which is innocent: every
   * one of its terms is already multiplied by the charge. It was this line.
   *
   * The edge highlight keeps its floor. It is the bevel catching the ambient
   * room rather than the cursor, it does not move when the pointer moves, and
   * without it the pane has no edge at all when idle.
   */
  colour += lampSpecular * lightIn;
  /*
   * The resting floor is a HINT of an edge, not a third of the pane.
   *
   * At 0.35 this put the bevel's highlight across every pixel the bevel
   * touches whenever the shutter was idle -- measured at 18-37% of the pane
   * covered at mean luma 60-80, added with plus-lighter. That is not an edge
   * catching the room, it is a wash, and it is what made the panes look
   * blown out and dusty with nothing shining on them.
   *
   * The bevel is wide on purpose -- it is where the refraction lives -- so
   * anything applied across its whole width is a broad term whether or not it
   * was meant to be. Squaring it pulls the floor back to the arris, where a
   * resting highlight actually sits, and the level is a knob because how much
   * ambient a pane catches is a property of the room, not a fact.
   */
  /*
   * Both follow a source. At rest the only one is the room -- so with the
   * room's lights off (Room brightness 0) there is no resting edge at all,
   * and the lamp's share is the lamp's light on the bevel.
   */
  float restEdge = bevel * bevel * uRestEdge * uRoomExposure * uHasRoom;
  float lightInMean = (lightIn.r + lightIn.g + lightIn.b) / 3.0;
  colour += vec3(EDGE_HIGHLIGHT) * (restEdge + lampEdge * lightInMean) * inside;

  // The tonemap is what blows the arris out: everything above 1.0 compresses
  // toward white, so colour survives only where the light has fallen off.
  /*
   * ---- The room, reflected by the face ----
   *
   * Not gated on the lamp: the room is lit whether or not the shutter is
   * wound, and glass reflects it either way. How much is Fresnel from the
   * material -- 4.2% straight on, rising toward grazing, and rising again at
   * the rim where the bevel turns the surface away -- and what is the room's
   * own brightness, lamps and all. In a dark room that is a faint image with
   * the lamps standing out of it, which is what a window at night shows.
   *
   * The level of the room image is set by the face's roughness: the blur it
   * puts on the reflected direction, converted to texels. The room is
   * magnified on screen, so the bias is that level minus how magnified it is.
   */
  // The reflected ray runs from the eye: (point - eye), so the room slides
  // across the face as the viewpoint moves.
  vec2 fromCentre = frag - 0.5 * uViewport / uScale - uEye;
  float cosView = uCameraDistance / length(vec3(fromCentre, uCameraDistance));
  /*
   * A broken pane (item 10 step 3b, ?try=shardlight): each piece has its own
   * slope, so it mirrors the room turned by twice its tilt, and its Fresnel
   * is taken against its own normal. Where a piece has fallen out there is no
   * glass to reflect anything (effects/optics/shard-map).
   */
  vec3 roomDir = vec3(fromCentre, uCameraDistance);
  float glassHere = 1.0;
  if (uHasShards > 0.5) {
    vec4 piece = texture2D(uShardMap, clamp((frag - uRect.xy) / uRect.zw, 0.0, 1.0));
    vec3 pieceN = shardNormal(piece);
    vec3 viewRay = normalize(vec3(fromCentre, -uCameraDistance));
    roomDir = reflect(viewRay, pieceN);
    cosView = max(-dot(viewRay, pieceN), 0.0);
    glassHere = piece.a;
  }
  float reflectance = fresnelSchlick(cosView, uIor);
  /*
   * ?try=polariser (step H): exactly, s and p apart. The plane of incidence
   * holds the view ray and the pane's normal, so on the screen it runs
   * radially from the point straight under the eye, and the s direction
   * (square to that plane) runs round it. A filter passes Rs cos^2 + Rp sin^2
   * of its axis against s.
   */
  if (uExactFresnel > 0.5) {
    float sAngle = atan(fromCentre.y, fromCentre.x + 1e-6) + 1.5707963;
    reflectance = polarisedReflectance(cosView, uIor, uPolariserAngle - sAngle, uPolariser);
  }
  reflectance += (1.0 - reflectance) * fresnel;
  float roomBias = roomLod(uFrontRoughness, uRoomWidth) - log2(max(texelsPerPx, 1e-4));
  vec3 room = decodeRadiance(
    texture2D(uRoom, roomUvDir(roomDir), roomBias).rgb
  );
  if (uRoomKnee > 0.0) room = room / (1.0 + room / uRoomKnee);
  colour += inside * glassHere * reflectance * room * uRoomExposure * uHasRoom * uReflectScale * uCoat;

  /*
   * ---- A dry contact: the air film under this pane (?try=contact) ----
   *
   * Resting on the pane below, this pane's back face and that one's front
   * stand a fraction of a micron apart where they do not touch. The stack's
   * sums (uReflectScale) count the two faces' reflections as incoherent; a
   * film that thin reflects as a wave (effects/optics/thin-film): black where
   * the glass touches, Newton's colours as the gap opens, the plain grey past
   * a micron and a half. What is drawn here is the difference, times what
   * the faces reflect -- the room and the lamp -- seen back through this
   * pane's front face. A rough face scatters the phase and it fades to
   * nothing (Bennett & Porteus): satin-etched glass shows no colours.
   */
  if (uContact > 0.5) {
    vec2 fq = frag - uFilmRect.xy;
    if (fq.x >= 0.0 && fq.y >= 0.0 && fq.x <= uFilmRect.z && fq.y <= uFilmRect.w) {
      float gapNm = contactGap(fq - 0.5 * uFilmRect.zw) * cosView;
      float lutAt = clamp(gapNm / ${FILM_LUT_MAX.toFixed(1)}, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0;
      vec3 film = texture2D(uFilmLut, vec2(lutAt, 0.5)).rgb * ${FILM_LUT_SCALE.toFixed(3)};
      float r0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
      float filmMean = 2.0 * r0 / (1.0 + r0);
      float kk = 4.0 * 3.14159265 * uFilmSigma * cosView / 550.0;
      vec3 dev = (film - filmMean) * exp(-0.5 * kk * kk);
      float through = (1.0 - r0) * (1.0 - r0);
      // What the faces reflect: the room, and each light's image and highlight (per unit of the face's own Fresnel).
      vec3 seen = room * uRoomExposure * uHasRoom + (lampSpecular + lampMirror) * lightIn / r0;
      colour += inside * dev * through * seen;
    }
  }

  /*
   * ---- Bokeh ----
   *
   * The light behind the pane that the photograph's file clipped, spread by
   * the frost over the aperture's hexagon (effects/optics/bokeh). It is the
   * photograph's own light, so it does not wait for the lamp, and it is only
   * seen through the face.
   */
  if (uHasBokeh + uHasBokehBelow > 0.5 && uBokehGain > 0.0 && uGlowOnly < 0.5) {
    vec3 discs = vec3(0.0);
    if (uHasBokeh > 0.5) {
      discs += bokehAt(uBokeh, frag, uImage, uImageFit, uImageBox, uBokehRadius, uScale);
    }
    if (uHasBokehBelow > 0.5) {
      discs += bokehAt(uBokehBelow, frag, uImageBelow, uImageBelowFit, uImageBelowBox, uBokehRadius, uScale);
    }
    colour += inside * uBokehGain * discs;
  }

  /*
   * Backlit glass: light shone in through the pane's edge, let out by its
   * frost across the face, by its rims, and spilling past them
   * (effects/optics/backlit). Light, so it adds, before the tone map.
   */
  colour += backlitAt(p, halfSize, depth, uBacklitEdge, uBacklitFill, uFrost, uBacklitColour, uBacklitGain);

  colour = uBurn > 0.5 ? toneMapGlassBurn(colour) : toneMapGlass(colour);

  /*
   * The CSS side layers multiply everything under them by the side's
   * transmittance -- this pass included, since it is drawn inside the pane.
   * What the side and the arris REFLECT has not crossed the glass and must
   * not be absorbed, so it is divided by the same factor here, in the same
   * encoding the layers multiply in, and comes out as computed.
   */
  vec3 absorbed = vec3(1.0);
  if (dTop >= 0.0 && dTop < topT) absorbed *= sideTransmittance(dTop);
  if (dBot >= 0.0 && dBot < botT) absorbed *= sideTransmittance(dBot);
  absorbed *= (1.0 - farArrisLoss(abs(dTop - topT))) * (1.0 - farArrisLoss(abs(dBot - botT)));
  absorbed = mix(vec3(1.0), absorbed, withinX);
  colour /= pow(max(absorbed, vec3(0.05)), vec3(1.0 / 2.2));
  colour += relayed;

  /*
   * NO GRAIN HERE. Deliberately, and permanently.
   *
   * There used to be a per-pixel hash dithered in at this point, weighted by
   * 4*l*(1-l) so it peaked in the midtones. The justification was 8-bit
   * banding on smooth analytic falloffs. The result was a fine even dust over
   * the entire pane that read as a noise overlay rather than as glass, at its
   * very worst across exactly the mid-grey the panes spend most of their time
   * at. Asked for its removal repeatedly; it is gone.
   *
   * If banding ever genuinely shows, the fix is a smaller ORDERED dither tied
   * to the quantisation step, not a random field at 0.09 -- but it has not
   * shown, and the pane has no business carrying texture that is not the
   * smudge and scratch photographs.
   */

  /*
   * NOT clipped to the pane.
   *
   * Multiplying alpha by 'inside' cut every contribution off at the boundary,
   * which killed the one thing that has no business stopping there: the bloom.
   * A lit edge throws light OUT of the glass as well as into it — that spill
   * above the top of a pane is most of what tells you the edge is bright
   * rather than merely pale — and cutting it at the boundary drew a hard line
   * exactly where the glow should be softest.
   *
   * Everything that genuinely belongs inside the pane already carries its own
   * 'inside' factor: the refracted backdrop, the side band, the scattered
   * face, the reflected source, the specular. What is left unbounded is the
   * rim, which is the part that should escape.
   */
  /*
   * THE LIT EDGE IS DRAWN ON ITS OWN LAYER, IN FRONT OF THE SIDE FACES.
   *
   * The side faces are CSS siblings above the pane that MULTIPLY what is
   * under them (their absorption), and this pass's layer is under them --
   * so the edge's own light and its bloom came out darkened across the
   * side, reading as a glow BEHIND the edge (Ony, 2026-09-29). The light a
   * lit arris throws is in front of everything: it comes off the front
   * corner, and the bloom is the camera's. So the pass runs twice per pane:
   * everything else here (uGlowOnly 0), and the edge's light alone
   * (uGlowOnly 1) for a layer above the sides (.glass-glow).
   */
  if (uGlowOnly > 0.5) {
    vec3 glow = uBurn > 0.5 ? toneMapGlassBurn(lampGlow * lightIn) : toneMapGlass(lampGlow * lightIn);
    float glowAlpha = clamp(max(max(glow.r, glow.g), glow.b), 0.0, 1.0);
    gl_FragColor = uPlasticCount < 0.5 ? vec4(glow, glowAlpha) : withPlastic(glow, glowAlpha, plasticFace(frag - uRect.xy));
    return;
  }
  float alpha = clamp(max(max(abs(colour.r), abs(colour.g)), abs(colour.b)), 0.0, 1.0);
  gl_FragColor = uPlasticCount < 0.5 ? vec4(colour, alpha) : withPlastic(colour, alpha, plasticThrough(frag - uRect.xy));
}
`;
