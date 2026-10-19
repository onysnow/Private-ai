/**
 * The latex balloon (task 74; docs/research/balloons.md 2, 6 "The balloon
 * shader"). One quad per balloon, viewport CSS px.
 *
 * - Shape: a surface of revolution about the balloon's axis, its profile
 *   measured from a photograph of a real 11-inch latex balloon
 *   (effects/balloons/shape, tested): a round crown, widest 41.5% of the
 *   way down, an almost straight cone to the neck, and the knot below. The
 *   normal is the surface's own, (x, -rho rho', z), turned with the
 *   balloon, so the light lies on it as it would on the real thing.
 * - Thickness: stretching thins the wall, so the colour is lightest over
 *   the body, a little denser at the pole spot (1.6x, Garcia-Herrera) and
 *   far denser toward the neck (about 10x, estimate). Through the wall,
 *   light goes as exp(-sigma t): sigma is the dye, from the balloon's
 *   colour at full inflation.
 * - Light, per light: Blinn-Phong for the specular (F0 0.042, latex n
 *   1.519; roughness about 0.1, estimate), wrapped diffuse for opaque
 *   "fashion" latex (w 0.3, estimate), none for crystal latex; the scene it
 *   is in (the page's own photographs, effects/light/scene-env), by Fresnel
 *   -- which also makes the bright rim (2.4: the rim is Fresnel plus the
 *   slant path, no separate term), coloured by what is behind it.
 * - Crystal (transparent) latex lets the page through, tinted twice (in
 *   and out of the balloon), and darker at the rim where the path through
 *   the wall is slanted: alpha 1 - T^(2/cos).
 * - Under a black light, neon latex fluoresces in its own colour, more
 *   where the wall is thicker (the neck), standard latex barely (5).
 */

import { ENVIRONMENT_GLSL } from "@fx/effects/optics/environment.glsl";
import { SHAPE_GLSL } from "@fx/effects/balloons/shape";
import { SCENE_ENV_GLSL } from "@fx/effects/light/scene-env";
import { CAMERA_MATCH_GLSL } from "@fx/effects/light/camera-match";

export const MAX_BALLOON_LIGHTS = 4;

export const BALLOON_VERTEX = /* glsl */ `
attribute vec2 aPos;       // viewport px
attribute vec2 aLocal;     // balloon frame, in radii: x across, y toward the knot
attribute vec3 aColour;    // the latex at full inflation
attribute vec3 aInfo;      // radius px, finish (0 fashion, 1 crystal, 2 neon), height above the page px
attribute vec2 aRot;       // the balloon's turn: cos, sin
uniform vec2 uViewport;
varying vec2 vLocal;
varying vec3 vColour;
varying vec3 vInfo;
varying vec2 vPos;
varying vec2 vRot;
void main() {
  vLocal = aLocal;
  vRot = aRot;
  vColour = aColour;
  vInfo = aInfo;
  vPos = aPos;
  vec2 clip = aPos / uViewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

export const BALLOON_FRAGMENT = /* glsl */ `
precision highp float;
${ENVIRONMENT_GLSL}
${SCENE_ENV_GLSL}
${CAMERA_MATCH_GLSL}
varying vec2 vLocal;
varying vec3 vColour;
varying vec3 vInfo;
varying vec2 vPos;
varying vec2 vRot;
uniform float uPixel;      // device px per CSS px
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_BALLOON_LIGHTS}];
uniform vec3 uLightColour[${MAX_BALLOON_LIGHTS}];
uniform float uLightUv[${MAX_BALLOON_LIGHTS}];
uniform vec4 uLightVia[${MAX_BALLOON_LIGHTS}];   // a mirrored light: the pane it shines through, page px
uniform float uLightViaZ[${MAX_BALLOON_LIGHTS}]; // and its face's height (-1: a direct light)
uniform float uR0;                               // glass's reflectance straight on
uniform sampler2D uRoomTex;
uniform float uHasRoom;
uniform float uRoomExposure;
uniform vec2 uViewCentre;
uniform float uCameraDistance;
uniform float uAmbient;

const float F0 = 0.042;
${SHAPE_GLSL}

/*
 * The room panorama in a direction. Near straight up or down every column
 * of an equirectangular image meets at a point, and a blurred one pinches
 * there into a star of seams across the balloon's crown: averaged round
 * the pole instead.
 */
vec3 roomAt(vec3 d) {
  vec3 c = decodeRadiance(texture2D(uRoomTex, roomUvDir(d)).rgb);
  float pole = smoothstep(0.75, 0.97, abs(d.y));
  if (pole > 0.0) {
    float h = length(d.xz);
    vec3 ring = vec3(0.0);
    for (int k = 0; k < 6; k++) {
      float a = float(k) * 1.0471976;
      ring += decodeRadiance(texture2D(uRoomTex, roomUvDir(vec3(h * cos(a), d.y, h * sin(a)))).rgb);
    }
    c = mix(c, ring / 6.0, pole);
  }
  return c * uRoomExposure;
}

void main() {
  float R = vInfo.x;
  float finish = vInfo.y;
  vec2 p = vLocal;
  // One device pixel, in radii: the width of the antialiased edge.
  float px = 1.0 / max(R * uPixel, 1.0);

  // The knot: a small bulb below the neck (measured: 0.19 radii long, 0.08 each side).
  vec2 kq = (p - vec2(0.0, BAL_NECK + BAL_KNOT_LENGTH * 0.5)) / vec2(BAL_KNOT_HALF, BAL_KNOT_LENGTH * 0.5);
  float knot = clamp((1.0 - length(kq)) * BAL_KNOT_HALF / px * 0.5 + 0.5, 0.0, 1.0);

  // The body: a surface of revolution, x^2 + z^2 = rho(y)^2.
  float u = (p.y - BAL_CROWN) / BAL_LENGTH;
  float rho = balProfile(u);
  if (u > 0.9) rho = max(rho, BAL_NECK_HALF);
  float drho = balSlope(u) / BAL_LENGTH;            // d(rho)/dy
  // How far inside the outline, measured square to it.
  float inward = (rho - abs(p.x)) / sqrt(1.0 + drho * drho);
  float body = u > 0.0 && u < 1.0 ? clamp(inward / px + 0.5, 0.0, 1.0) : 0.0;
  float cover = max(body, knot);
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }

  float z = sqrt(max(rho * rho - p.x * p.x, 0.0));
  vec3 Nl = normalize(vec3(p.x, -rho * drho, max(z, 0.02)));
  // Turned with the balloon into the page's frame.
  vec3 N = vec3(Nl.x * vRot.x - Nl.y * vRot.y, Nl.x * vRot.y + Nl.y * vRot.x, Nl.z);
  // Where along the skin: 0 at the crown (the pole), 1 at the neck.
  u = clamp(u, 0.0, 1.0);
  float thick = 1.0 + 0.6 * (1.0 - smoothstep(0.0, 0.08, u)) + 9.0 * smoothstep(0.75, 1.0, u);
  thick = mix(thick, 12.0, knot);
  // The dye: exp(-sigma) = the colour at full inflation.
  vec3 sigma = -log(clamp(vColour, 0.02, 1.0));
  vec3 T = exp(-sigma * thick);

  vec3 P = vec3(vPos, vInfo.z + z * R);
  vec3 V = vec3(0.0, 0.0, 1.0);
  float cosV = max(N.z, 0.0);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosV, 5.0);

  vec3 colour = vec3(0.0);
  vec3 spec = vec3(0.0);
  vec3 glow = vec3(0.0);
  for (int i = 0; i < ${MAX_BALLOON_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i] - P;
    float dist = length(toL);
    vec3 L = toL / max(dist, 1.0);
    /*
     * A light's image in the glass (effects/light/image-sources): it reaches
     * this point only through its pane -- where the ray to it crosses the
     * face inside the pane -- and only at the face's reflectance there.
     */
    float mirror = 1.0;
    if (uLightViaZ[i] > -0.5) {
      float s = (uLightViaZ[i] - uLightPos[i].z) / (P.z - uLightPos[i].z);
      vec2 hit = uLightPos[i].xy + (P.xy - uLightPos[i].xy) * s;
      vec4 via = uLightVia[i];
      float inPane = step(via.x, hit.x) * step(hit.x, via.x + via.z) * step(via.y, hit.y) * step(hit.y, via.y + via.w);
      float cosI = clamp(-L.z, 0.0, 1.0);
      mirror = inPane * (uR0 + (1.0 - uR0) * pow(1.0 - cosI, 5.0));
      if (mirror <= 0.0) continue;
    }
    // Falls off with distance against the lamp's height (the floor's own normalisation).
    float fall = clamp(300.0 * 300.0 / max(dist * dist, 1.0), 0.0, 4.0);
    float nl = dot(N, L);
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float fl = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    spec += uLightColour[i] * pow(nh, 180.0) * fl * 30.0 * fall * mirror;
    // Wrapped diffuse for opaque latex.
    float wrap = max((nl + 0.3) / 1.3, 0.0);
    colour += uLightColour[i] * wrap * fall * (1.0 - uLightUv[i]) * mirror;
    // Neon dye under UV: more where the wall is thicker.
    glow += uLightColour[i] * uLightUv[i] * fall * clamp(thick / 3.0, 0.5, 2.0) * mirror;
  }

  // The room the latex reflects.
  vec3 viewRay = normalize(vec3(vPos - uViewCentre, -uCameraDistance));
  vec3 Nw = normalize(vec3(N.xy, N.z));
  vec3 roomDir = reflect(viewRay, Nw);
  /*
   * Latex is satin, not a mirror (roughness about 0.25 rad, estimate from
   * the reference photographs: its reflections are soft-edged): the room
   * texture it samples is blurred over that cone when it loads (Balloons),
   * and at a grazing slant a rough face reflects less than a polished one
   * (the Fresnel term with roughness, F0 + (max(1 - a, F0) - F0)(1 - cos)^5,
   * Lagarde). A mirror-sharp, full-strength rim was the saturated outline
   * round every balloon.
   */
  /*
   * What it reflects is the scene it is in (effects/light/scene-env): the
   * photographs behind it at its rim, where the reflected ray turns back
   * into the page; the room, lit by the scene's own light, where it faces
   * the viewer. Not a stock studio panorama: that one's violet window ringed
   * every balloon (Ony, 2026-10-01: "that purple glow on the edges").
   */
  const float ROUGH = 0.45;
  float behind;
  vec3 page = scenePage(vec3(vPos, P.z), roomDir, ROUGH * 0.6, behind);
  vec3 roomSide = uHasRoom > 0.5 ? roomBalanced(roomAt(roomDir)) : uSceneAverage * 0.7;
  vec3 room = mix(roomSide, page, behind);
  // The room's light on the latex takes the scene's colour too: half its tint, its brightness kept.
  float avgL = dot(uSceneAverage, vec3(0.2126, 0.7152, 0.0722));
  vec3 ambient = uAmbient * mix(vec3(1.0), clamp(uSceneAverage / max(avgL, 0.04), 0.0, 2.0), 0.5);
  /*
   * The room's light is not even: it comes mostly from above and from the
   * viewer's side, so the skin facing up and out is lit more than the
   * underside and the turned-away edge (a hemisphere light: the shading that
   * gives a balloon its roundness in a photograph; weights estimates).
   */
  ambient *= (0.9 + 0.25 * clamp(-N.y, -1.0, 1.0)) * (0.65 + 0.35 * N.z);
  F = F0 + (max(1.0 - ROUGH, F0) - F0) * pow(1.0 - cosV, 5.0);

  vec3 out3;
  float alpha;
  if (finish > 0.5 && finish < 1.5) {
    // Crystal: the page through it, tinted in and out; slanted at the rim.
    vec3 through = pow(T, vec3(2.0 / max(cosV, 0.15)));
    alpha = clamp(1.0 - (through.r + through.g + through.b) / 3.0, 0.0, 0.92);
    vec3 tint = vColour * (ambient + colour * 0.3);
    out3 = tint * (1.0 - F) + room * F + spec;
    alpha = max(alpha, clamp(F * 2.0 + length(spec), 0.0, 1.0));
  } else {
    // Fashion (and neon) latex: opaque, its colour lit, lighter where stretched thin.
    vec3 albedo = mix(vColour, vColour * T * 2.0, 0.35);
    out3 = albedo * (ambient + colour) * (1.0 - F) + room * F + spec;
    alpha = 1.0;
  }
  if (finish > 1.5) out3 += vColour * glow * 1.5;
  // The knot: the same latex, gathered thick, so darker and deeper in colour, with its own glint.
  vec3 knotColour = vColour * 0.6 * (ambient + colour) + room * 0.08 + spec * 0.5;
  out3 = mix(out3, knotColour, knot);
  alpha = mix(alpha, 1.0, knot);
  // Brighter than the screen goes to white, as a sensor clips, not to a saturated hue.
  float pk = max(out3.r, max(out3.g, out3.b));
  if (pk > 1.0) out3 = mix(out3 / pk, vec3(1.0), clamp((pk - 1.0) / pk, 0.0, 1.0));
  // As the photographs' camera recorded it (effects/light/camera-match): their black, their shoulder, their grain.
  out3 = cameraMatch(out3 * max(pk, 1.0), gl_FragCoord.xy / uPixel);
  gl_FragColor = vec4(out3, alpha * cover);
}
`;
