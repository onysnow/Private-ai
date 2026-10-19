/**
 * The crack-face view pass (broken glass B2; docs/broken-glass-system.md
 * 3.5): what a pixel of a broken pane shows where the eye's ray, inside the
 * glass, meets a crack face.
 *
 * A crack is an air gap with two glass faces standing through the pane's
 * thickness, leaning a little off square. The eye's ray refracts into the
 * glass and runs down to the back face; beside a crack it meets the face
 * first. Past the critical angle (41 degrees from the face's normal) the
 * face is a perfect mirror: the ray turns and lands on the photograph
 * somewhere else, so the picture FOLDS at the crack (any face within 7.7
 * degrees of square mirrors every ray that enters the front). Short of the
 * critical angle most of the ray crosses the gap and goes on, and a share
 * is mirrored: the picture SHIFTS by that share. A ray mirrored too steeply
 * to leave the back face is trapped in the pane: it shows the light piped
 * along the glass, the pane's own GLOW. The band each face makes beside its
 * line is t |tan(lean) - tan(view) cos(phi)| wide: nothing straight on,
 * wider from the side, so the cracks change as the eye moves.
 *
 * Reads the crack field and the segment table (effects/optics/crack-field).
 * Draws only where a face was hit: the pane's own refraction shows the
 * straight view everywhere else.
 */

import { PART_DEPTH, SEG_TEXELS, TABLE_WIDTH } from "./crack-field";
import { ENVIRONMENT_GLSL } from "./environment.glsl";

export const CRACK_VIEW_VERTEX = /* glsl */ `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

export const MAX_CRACK_LIGHTS = 4;

export const CRACK_VIEW_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uField;     // nearest two segments per device pixel (RG, BA: 16-bit indices)
uniform vec2 uFieldSize;      // texels
uniform sampler2D uTable;     // the segment table
uniform float uTableRows;
uniform vec4 uPane;           // x, y, w, h, viewport CSS px
uniform float uScale;         // device px per CSS px
uniform float uThickness;     // the glass, CSS px
uniform float uGap;           // the photograph's distance behind the back face, CSS px
uniform float uIor;
uniform vec2 uViewCentre;     // viewport CSS px
uniform float uCameraDistance;
uniform sampler2D uPhoto;
uniform float uHasPhoto;
uniform vec4 uImage;          // where the photograph is drawn, viewport px
uniform vec3 uImageFit;       // aspect, object-position
uniform vec2 uPhotoTexels;
uniform float uFrostLod;      // how blurred the pane shows the photograph: a mip level
uniform float uSaturate;
uniform vec4 uFill;
uniform float uArrived;       // microseconds since the strike, slowed: cracks not yet there are skipped
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_CRACK_LIGHTS}];     // viewport px, height
uniform vec3 uLightColour[${MAX_CRACK_LIGHTS}];  // colour times charge and strength
uniform sampler2D uRoomTex;   // the room, log-encoded (effects/optics/environment)
uniform float uHasRoom;
uniform float uRoomExposure;
uniform vec3 uRoomMean;       // the room's mean radiance, linear, at this exposure
${ENVIRONMENT_GLSL}
const float TABLE_W = ${TABLE_WIDTH.toFixed(1)};
const float SEG_TEXELS = ${SEG_TEXELS.toFixed(1)};
const float NONE = 65535.0;
/* A crack on one face only reaches this share of the thickness in. */
const float PART_DEPTH = ${PART_DEPTH.toFixed(2)};
/* How bright the light piped along the pane glows out of a crack face straight under a lamp (estimate, matched to the glass light layer). */
const float TRAPPED_GLOW = 0.8;
const float PIPED_REACH = 780.0;
/* Wallner lines and hackle: the face is rippled, so its light varies across it and along it. */
const float RIPPLE_DEPTH = 0.3;
/*
 * A trapped channel's light: the room's light that got into the pane (through the front face,
 * scattered by the faces' own roughness) and runs along it. Smooth faces pipe a little, mist
 * and hackle scatter it white (the bright silver cracks of a lit room).
 */
const float PIPED_SMOOTH = 0.35;
const float PIPED_ROUGH = 1.1;
/* A trapped channel is not quite opaque: micro-roughness on the faces lets a share of the straight view through. */
const float TRAPPED_LEAK = 0.18;
/* The glass's tint along a long path: a little green. */
const vec3 GLASS_TINT = vec3(0.86, 1.0, 0.95);

#ifdef HAS_TEXTURE_LOD
vec3 photoLod(vec2 uv, float lod) { return texture2DLodEXT(uPhoto, uv, lod).rgb; }
#else
vec3 photoLod(vec2 uv, float lod) { return texture2D(uPhoto, uv).rgb; }
#endif

float d16(vec2 rg) { return rg.x * 65280.0 + rg.y * 255.0; }

vec4 segTexel(float i, float k) {
  float t = i * SEG_TEXELS + k;
  vec2 uv = vec2((mod(t, TABLE_W) + 0.5) / TABLE_W, (floor(t / TABLE_W) + 0.5) / uTableRows);
  return texture2D(uTable, uv);
}

vec2 coverUv(vec2 pt) {
  vec2 rel = (pt - uImage.xy) / max(uImage.zw, vec2(1.0));
  float boxAspect = uImage.z / max(uImage.w, 1.0);
  vec2 scale = boxAspect > uImageFit.x ? vec2(1.0, boxAspect / uImageFit.x) : vec2(uImageFit.x / boxAspect, 1.0);
  return (rel - uImageFit.yz) / scale + uImageFit.yz;
}

// The photograph as the pane shows it: saturated and veiled by the glass's fill, as frosted as the pane is.
vec3 photoAt(vec2 page) {
  if (uHasPhoto < 0.5) return uFill.rgb;
  vec3 c = photoLod(clamp(coverUv(page), 0.0, 1.0), uFrostLod);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturate), 0.0, 1.0);
  return mix(c, uFill.rgb, uFill.a);
}

// The room in a direction out of the front face (x right, y down, z toward the viewer).
vec3 roomIn(vec3 dir) {
  if (uHasRoom < 0.5) return uRoomMean;
  return decodeRadiance(texture2D(uRoomTex, roomUvDir(dir)).rgb) * uRoomExposure;
}

// The light piped along the pane, as it glows out of a face here.
vec3 trappedGlow(vec2 page, float rough) {
  vec3 g = uRoomMean * GLASS_TINT * mix(PIPED_SMOOTH, PIPED_ROUGH, rough);
  for (int i = 0; i < ${MAX_CRACK_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec2 dl = page - uLightPos[i].xy;
    float hz = max(uLightPos[i].z, 1.0);
    float q = hz * hz / (dot(dl, dl) + hz * hz);
    g += uLightColour[i] * TRAPPED_GLOW * q * sqrt(q) * exp(-length(dl) / PIPED_REACH);
  }
  return g;
}

void main() {
  vec2 local = vec2(gl_FragCoord.x, uPane.w * uScale - gl_FragCoord.y) / uScale;
  vec2 page = uPane.xy + local;
  vec4 f = texture2D(uField, local * uScale / uFieldSize);
  float i0 = d16(f.rg);
  float i1 = d16(f.ba);
  if (i0 >= NONE - 0.5) discard;

  // The eye's ray into the glass.
  vec3 toP = vec3(page - uViewCentre, -uCameraDistance);
  float horiz = length(toP.xy);
  float sinA = horiz / length(toP);
  vec2 hdir = horiz > 1e-4 ? toP.xy / horiz : vec2(0.0, 1.0);
  float sinG = sinA / uIor;
  float cosG = sqrt(max(1.0 - sinG * sinG, 1e-6));
  float tanG = sinG / cosG;
  vec3 r = vec3(sinG * hdir, cosG);

  float bestZ = 1e9;
  vec3 colour = vec3(0.0);
  float alpha = 0.0;
  for (int k = 0; k < 2; k++) {
    float i = k == 0 ? i0 : i1;
    if (i >= NONE - 0.5) continue;
    vec4 t0 = segTexel(i, 0.0);
    vec4 t1 = segTexel(i, 1.0);
    vec4 t2 = segTexel(i, 2.0);
    vec4 t3 = segTexel(i, 3.0);
    if (d16(t3.rg) > uArrived) continue;
    vec2 a = vec2(d16(t0.rg), d16(t0.ba)) / 16.0;
    vec2 b = vec2(d16(t1.rg), d16(t1.ba)) / 16.0;
    float lean = (d16(t2.rg) - 32768.0) / 8192.0;
    float rough = t2.b;
    vec2 ab = b - a;
    float len = length(ab);
    if (len < 0.05) continue;
    vec2 u = ab / len;
    vec2 n = vec2(-u.y, u.x);
    float along = dot(local - a, u);
    if (along < -1.0 || along > len + 1.0) continue;
    float d = dot(local - a, n);
    float c = dot(hdir, n);
    float denom = tan(lean) - tanG * c;
    if (abs(denom) < 1e-4) continue;
    float z = d / denom;
    // How deep this crack goes: through, or from the struck (near) face or the back face part way.
    float faceCode = t3.b * 255.0;
    float z0 = faceCode > 1.5 ? uThickness * (1.0 - PART_DEPTH) : 0.0;
    float z1 = faceCode > 0.5 && faceCode < 1.5 ? uThickness * PART_DEPTH : uThickness;
    if (z <= z0 || z >= z1 || z >= bestZ) continue;
    // The face's normal (z down into the glass) and what the ray does at it.
    vec3 nf = normalize(vec3(n, -tan(lean)));
    float cosI = abs(dot(r, nf));
    float sinI = sqrt(max(1.0 - cosI * cosI, 0.0));
    float share;
    if (sinI * uIor >= 1.0) share = 1.0;
    else {
      float sinT = sinI * uIor;
      float cosT = sqrt(1.0 - sinT * sinT);
      float rs = (uIor * cosI - cosT) / (uIor * cosI + cosT);
      float rp = (cosI - uIor * cosT) / (cosI + uIor * cosT);
      share = clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
    }
    // Mist and hackle scatter the mirror: a rough face shows a milky, softened fold.
    vec3 rr = r - 2.0 * dot(r, nf) * nf;
    vec3 seen;
    bool trapped = true;
    vec2 kOut = uIor * rr.xy;
    float kk = dot(kOut, kOut);
    if (kk < 1.0) {
      if (rr.z > 0.03) {
        // On down to the back face and out of it: the photograph, folded.
        vec2 land = local + tanG * z * hdir + (uThickness - z) * rr.xy / rr.z;
        land += uGap * kOut / sqrt(1.0 - kk);
        seen = photoAt(uPane.xy + land);
        trapped = false;
      } else if (rr.z < -0.03) {
        // Back up and out of the front face: the room, where the face sends your sight.
        seen = roomIn(vec3(kOut, sqrt(1.0 - kk)));
        trapped = false;
      }
    }
    vec3 glow = trappedGlow(page, rough);
    // Rolled off, as the glass light layer rolls its lamp off: no flat white.
    glow = glow / (1.0 + glow * 0.6);
    // The face's own ripples: Wallner lines across the band (with depth) and hackle along it, finer when rough.
    float ripple = 1.0 - RIPPLE_DEPTH * (0.5 + 0.5 * sin(z / uThickness * 9.0 + along * (0.35 + 0.9 * rough) + float(k)));
    glow *= ripple;
    if (trapped) seen = glow;
    // Mist and hackle scatter the mirror: a rough face shows the room's light, white.
    else seen = mix(seen, glow, rough * 0.6);
    bestZ = z;
    colour = seen;
    alpha = trapped ? share * (1.0 - TRAPPED_LEAK) : share;
  }
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(colour, alpha);
}
`;
