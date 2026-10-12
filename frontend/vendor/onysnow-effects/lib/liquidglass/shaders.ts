// LOCAL: @ts-nocheck, and the reason, because a silent one would be worse.
//
// This file is vendored verbatim from ybouane/liquidglass (MIT) and compiles
// clean under ITS tsconfig. This project sets noUncheckedIndexedAccess,
// noPropertyAccessFromIndexSignature and exactOptionalPropertyTypes, which
// upstream does not, and that disagreement alone produces 79 errors across
// this directory -- every one of them mechanical (`u.u_tex` wanting
// `u['u_tex']`, a `| undefined` from an index read) and none of them a bug.
//
// Fixing all 79 now would bury the upstream source under our own churn and
// destroy the thing NOTICE.md exists to protect: the ability to diff this
// directory against upstream and see only what WE changed.
//
// So it is suppressed per file, and the suppression comes OFF the moment we
// take real ownership of a file and start editing it -- at which point our
// own code in it gets checked properly, which is the whole point.
// @ts-nocheck

// LOCAL: the edge functions every shader on the site shares (?try=liquidedge).
import { EDGE_PROFILE_GLSL } from "@fx/effects/optics/edge-profile.glsl";

/**
 * GLSL shader sources for the liquid glass effect.
 *
 * All shaders target WebGL 1 (GLSL ES 1.0) for maximum compatibility.
 * The rendering pipeline has three stages:
 *   1. Blit — copy / UV-transform a texture (used for background upload & downsample)
 *   2. Blur — 9-tap Gaussian blur in a single direction (run H then V, multiple passes)
 *   3. Glass — the core liquid-glass composite (refraction, specular, shadow, etc.)
 */

// ──────────────────────────────────────────────
// Full-screen quad vertex shader (used by blit & blur)
// ──────────────────────────────────────────────
export const VS_QUAD = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
	v_uv = a_pos * 0.5 + 0.5;
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ──────────────────────────────────────────────
// Blit with UV scale + offset (background cover-mode transform)
// ──────────────────────────────────────────────
export const FS_BLIT = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_scale;
uniform vec2 u_offset;
varying vec2 v_uv;
void main() {
	gl_FragColor = texture2D(u_tex, v_uv * u_scale + u_offset);
}`;

// ──────────────────────────────────────────────
// 9-tap Gaussian blur (single direction)
// ──────────────────────────────────────────────
export const FS_BLUR = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
varying vec2 v_uv;
void main() {
	vec4 s  = texture2D(u_tex, v_uv) * 0.227027;
	s += texture2D(u_tex, v_uv + u_dir * 1.0) * 0.194594;
	s += texture2D(u_tex, v_uv - u_dir * 1.0) * 0.194594;
	s += texture2D(u_tex, v_uv + u_dir * 2.0) * 0.121622;
	s += texture2D(u_tex, v_uv - u_dir * 2.0) * 0.121622;
	s += texture2D(u_tex, v_uv + u_dir * 3.0) * 0.054054;
	s += texture2D(u_tex, v_uv - u_dir * 3.0) * 0.054054;
	s += texture2D(u_tex, v_uv + u_dir * 4.0) * 0.016216;
	s += texture2D(u_tex, v_uv - u_dir * 4.0) * 0.016216;
	gl_FragColor = s;
}`;

// ──────────────────────────────────────────────
// Glass panel vertex shader
// Positions the panel quad in NDC and computes per-fragment
// local-pixel coordinates and background-texture UVs.
// ──────────────────────────────────────────────
export const VS_GLASS = `
attribute vec2 a_pos;
uniform vec2 u_center;   // panel centre in root-pixel coords (top-left origin)
uniform vec2 u_size;     // panel size in px
uniform vec2 u_res;      // root element size in px
uniform float u_pad;     // shadow padding in px
varying vec2 v_localPx;
varying vec2 v_screenUV;

void main() {
	vec2 total = u_size + vec2(u_pad * 2.0);
	v_localPx = a_pos * total;                       // px from panel centre
	vec2 px = u_center + a_pos * total;              // screen px (DOM)
	v_screenUV = vec2(px.x / u_res.x, 1.0 - px.y / u_res.y);
	vec2 ndc = (px / u_res) * 2.0 - 1.0;
	ndc.y = -ndc.y;
	gl_Position = vec4(ndc, 0.0, 1.0);
}`;

// ──────────────────────────────────────────────
// Glass panel fragment shader — the core liquid-glass effect
//
// Implements:
//   • Rounded-rect SDF with pill-bevel height field
//   • Dual-surface (biconvex) refraction
//   • Chromatic aberration (dispersion)
//   • Edge-weighted sampling of the pre-blurred background
//   • Fresnel, specular (multi-light Blinn-Phong), edge highlight
//   • Cool glass tint, saturation, brightness
//   • Drop shadow with offset
//   • Anti-aliased panel mask
// ──────────────────────────────────────────────
export const FS_GLASS = `
precision highp float;

uniform sampler2D u_bgTex;
uniform sampler2D u_blurTex;
uniform vec2 u_size;           // panel px
uniform float u_radius;        // corner radius px
uniform vec2 u_res;

uniform float u_refract;
uniform float u_chroma;
uniform float u_edgeBlur; // LOCAL
uniform float u_blurOn;   // LOCAL: 0 when the frost is off
uniform float u_straight; // LOCAL: 1 for a band as wide as the page
uniform float u_edgeHL;
uniform float u_spec;
uniform float u_fresnel;
uniform float u_distort;
uniform float u_alpha;
uniform float u_sat;
uniform float u_tint;
uniform float u_zRadius;
uniform float u_brightness;
uniform float u_shadowAlpha;
uniform float u_shadowSpread;
uniform float u_shadowOffY;
// LOCAL: the specular rig, which upstream hardcodes.
uniform float u_specTight;   // scales every exponent; 1.0 is upstream
uniform vec2  u_lightDir;    // shifts the two TIGHT lights; (0,0) is upstream
uniform float u_bevelMode;
// LOCAL: ?try=liquidedge -- the edge the CSS glass draws (see main()).
uniform float u_physEdge;
uniform float u_thick;   // device px
uniform vec3  u_iorRGB;
uniform vec4  u_veil;

varying vec2 v_localPx;
varying vec2 v_screenUV;

// Rounded-rect signed distance
float rrSDF(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + vec2(r);
	return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

// Bevel height field.
// Both modes use the same half-circle profile (smooth peak at centre,
// steep at edges).  The difference is in the refraction model:
//   mode 0 = biconvex pill — light refracts at both surfaces (entry + exit).
//   mode 1 = dome (plano-convex) — flat bottom, so only exit refraction.
// d = distance inside from edge (-sdf), zR = z-radius of the bevel.
float bevelHeight(float d, float zR) {
	if (d <= 0.0) return 0.0;
	if (d >= zR) return zR;
	return sqrt(d * (2.0 * zR - d));
}

// LOCAL: see the square-pane note in main().
float bevelDist(vec2 p, vec2 b, float k) {
	float a = b.x - abs(p.x);
	float c = b.y - abs(p.y);
	float h = clamp(0.5 + 0.5 * (c - a) / max(k, 1e-3), 0.0, 1.0);
	return mix(c, a, h) - k * h * (1.0 - h);
}

${EDGE_PROFILE_GLSL}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
	vec2 half_ = u_size * 0.5;
	float r = min(u_radius, min(half_.x, half_.y));
	float sdf = rrSDF(v_localPx, half_, r);
	// LOCAL: a band as wide as the scene has no sides at all -- not in its
	// mask, its inner stroke or its glow either, or they draw a thin edge
	// down the screen's own edge where the band's top face runs on past it
	// (Ony 2026-09-30, 2d). Measured top and bottom only, like its bevel.
	if (u_straight > 0.5) sdf = abs(v_localPx.y) - half_.y;

	// ── Shadow (outside panel, offset by shadowOffY) ──
	if (sdf > 0.0) {
		float sdfShadow = rrSDF(v_localPx - vec2(0.0, u_shadowOffY), half_, r);
		float d = max(sdfShadow - 1.0, 0.0);
		float spread = max(u_shadowSpread, 1.0);
		float falloff = 1.0 / (spread * spread);
		float outerShadow = exp(-d * d * falloff) * 0.65;
		float contactShadow = exp(-d * 0.08 / max(spread * 0.04, 0.01)) * 0.35;
		float shadow = (outerShadow + contactShadow) * u_shadowAlpha;
		gl_FragColor = vec4(0.0, 0.0, 0.0, shadow);
		return;
	}

	// ── Anti-aliased mask ──
	float mask = 1.0 - smoothstep(-1.5, 0.5, sdf);

	// LOCAL: a pane as wide as the scene is a band with no sides -- measured
	// top-and-bottom only, so its bevel, blur and fringe run straight across.
	bool straight = u_straight > 0.5;
	float maxD = straight ? half_.y : min(half_.x, half_.y);
	float inside = straight ? half_.y - abs(v_localPx.y) : -sdf;
	float edge = smoothstep(maxD * 0.35, 0.0, inside);

	// ── Surface normal (top surface) via bevel height field ──
	float zR = u_zRadius;
	float e = 2.0;
	// LOCAL: square panes get a smooth-min inside distance for the bevel.
	// With r = 0 the plain distance is min(dx, dy), which creases along each
	// corner's diagonal; the normal flips across that crease and draws a hard
	// mitre -- a picture frame in every corner. Smooth-min rounds the height
	// field's contours near the corner only, so the pane stays square and the
	// two edges' bends flow into each other.
	float k = zR * 0.15;
	float dC = r < 1.0 ? bevelDist(v_localPx, half_, k) : inside;
	float dR = r < 1.0 ? bevelDist(v_localPx + vec2(e, 0.0), half_, k) : -rrSDF(v_localPx + vec2(e, 0.0), half_, r);
	float dL = r < 1.0 ? bevelDist(v_localPx - vec2(e, 0.0), half_, k) : -rrSDF(v_localPx - vec2(e, 0.0), half_, r);
	float dU = r < 1.0 ? bevelDist(v_localPx + vec2(0.0, e), half_, k) : -rrSDF(v_localPx + vec2(0.0, e), half_, r);
	float dD = r < 1.0 ? bevelDist(v_localPx - vec2(0.0, e), half_, k) : -rrSDF(v_localPx - vec2(0.0, e), half_, r);
	if (straight) {
		dC = inside;
		dR = inside;
		dL = inside;
		dU = half_.y - abs(v_localPx.y + e);
		dD = half_.y - abs(v_localPx.y - e);
	}
	float hC = bevelHeight(dC, zR);
	float hR = bevelHeight(dR, zR);
	float hL = bevelHeight(dL, zR);
	float hU = bevelHeight(dU, zR);
	float hD = bevelHeight(dD, zR);
	vec2 hGrad = vec2(hR - hL, hU - hD) / (2.0 * e);
	vec3 N = normalize(vec3(-hGrad, 1.0));

	float depth = smoothstep(0.0, zR, inside);

	// ── Refraction ──
	vec2 pxToUV = vec2(1.0, -1.0) / u_res;
	float ior = 1.5;
	float refrPow = 1.0 - 1.0 / ior;
	float thickness = hC * 2.0;
	float thickNorm = thickness / max(zR * 2.0, 1.0);
	vec2 refrPx;
	if (u_bevelMode < 0.5) {
		// Biconvex: physically-based dual-surface refraction
		vec2 exitRefr = hGrad * refrPow;
		vec2 entryRefr = hGrad * refrPow;
		vec2 throughRefr = entryRefr * thickNorm * 0.5;
		refrPx = (exitRefr + entryRefr + throughRefr) * u_refract * 30.0;
		vec2 centerDir = -v_localPx / max(half_, vec2(1.0));
		refrPx += centerDir * u_refract * 4.0 * depth;
	} else {
		// Dome (plano-convex): uniform magnification by contracting UV toward center.
		// Each pixel samples from closer to center → content appears larger.
		refrPx = -v_localPx * u_refract * depth * 0.35;
	}
	vec2 refr = refrPx * pxToUV;

	// ── Micro-distortion noise ──
	vec2 ns = v_localPx * 0.08;
	vec2 absPxToUV = vec2(1.0) / u_res;
	vec2 micro = (vec2(hash(ns), hash(ns + vec2(37.0))) - 0.5) * u_distort * 4.0 * absPxToUV;

	// ── Chromatic aberration ──
	float caS = u_chroma * 18.0 * (edge * 0.7 + 0.3) * 2.0;
	vec2 caD = N.xy * caS * pxToUV;
	vec2 base = v_screenUV + refr + micro;

	vec2 baseR = base + caD;
	vec2 baseG = base;
	vec2 baseB = base - caD;
	// LOCAL (?try=liquidedge): the bend is Snell through the pane's own edge
	// and thickness -- the same function, from the same shared chunk, the CSS
	// bend's map is built from (lib/bevel-map) -- straight in from the nearest
	// edge, each colour at its own index. Upstream's bend is its height
	// field's slope times a knob, which at the rim is hundreds of pixels: the
	// streaks along its bands. No fringe knob either: the split between the
	// colours is the glass's dispersion.
	if (u_physEdge > 0.5) {
		vec2 inward = vec2(dR - dL, dU - dD);
		float len = length(inward);
		inward = len > 1e-4 ? inward / len : vec2(0.0);
		float x = inside / max(zR, 1.0);
		vec2 dirUV = inward * pxToUV;
		baseR = v_screenUV + dirUV * refractionOffset(x, zR, u_thick, u_iorRGB.r);
		baseG = v_screenUV + dirUV * refractionOffset(x, zR, u_thick, u_iorRGB.g);
		baseB = v_screenUV + dirUV * refractionOffset(x, zR, u_thick, u_iorRGB.b);
		base = baseG;
	}

	vec3 sharp = vec3(
		texture2D(u_bgTex,  baseR).r,
		texture2D(u_bgTex,  baseG).g,
		texture2D(u_bgTex,  baseB).b
	);
	vec3 blur = vec3(
		texture2D(u_blurTex, baseR).r,
		texture2D(u_blurTex, baseG).g,
		texture2D(u_blurTex, baseB).b
	);
	// ── Edge-weighted blur mix ──
	// LOCAL: the rim goes MORE out of focus, not less. Upstream pulled the
	// rim toward the sharp sample so the bend read crisply; a thick lens
	// edge does the opposite -- it is where the image is most out of focus.
	// A ring of taps over the already-blurred texture, widening toward the
	// edge, defocuses the bevel beyond the face's frost. No noise: eight
	// fixed directions.
	vec3 col = blur;
	float ringPx = u_edgeBlur * edge * 36.0;
	if (ringPx > 0.5) {
		vec2 ringUV = vec2(ringPx) / u_res;
		vec3 acc = blur;
		acc += texture2D(u_blurTex, base + vec2( 1.0,  0.0) * ringUV).rgb;
		acc += texture2D(u_blurTex, base + vec2(-1.0,  0.0) * ringUV).rgb;
		acc += texture2D(u_blurTex, base + vec2( 0.0,  1.0) * ringUV).rgb;
		acc += texture2D(u_blurTex, base + vec2( 0.0, -1.0) * ringUV).rgb;
		acc += texture2D(u_blurTex, base + vec2( 0.707,  0.707) * ringUV).rgb;
		acc += texture2D(u_blurTex, base + vec2(-0.707,  0.707) * ringUV).rgb;
		acc += texture2D(u_blurTex, base + vec2( 0.707, -0.707) * ringUV).rgb;
		acc += texture2D(u_blurTex, base + vec2(-0.707, -0.707) * ringUV).rgb;
		col = acc / 9.0;
	}
	// The sharp sample only matters with no frost at all.
	col = mix(sharp, col, step(0.001, u_blurOn));

	// LOCAL (?try=liquidedge): the pane's own smoky fill, the one the CSS
	// glass lays over its frost (styles.css --pane-fill).
	col = mix(col, u_veil.rgb, u_veil.a);

	// ── Brightness ──
	col *= 1.0 + u_brightness;

	// ── Saturation ──
	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(vec3(lum), col, 1.0 + u_sat);

	// ── Cool glass tint ──
	col = mix(col, col * vec3(0.92, 0.95, 1.05), u_tint);
	col *= 1.0 + 0.06 * depth;

	// ── Fresnel ──
	float fres = pow(1.0 - abs(N.z), 4.0) * u_fresnel;

	// ── Specular highlights (multi-light Blinn-Phong) ──
	// LOCAL: u_lightDir shifts the two TIGHT lights (L1, L4) only; L2 and L3
	// are broad fill and moving them just muddies the face. u_specTight scales
	// every exponent. At u_lightDir = (0,0) and u_specTight = 1 this is
	// byte-for-byte upstream's rig.
	float tight = max(u_specTight, 0.05);
	vec3 V = vec3(0.0, 0.0, 1.0);
	vec3 L1 = normalize(vec3(0.4 + u_lightDir.x, 0.7 + u_lightDir.y, 1.0));
	vec3 H1 = normalize(L1 + V);
	float sp1 = pow(max(dot(N, H1), 0.0), 90.0 * tight);
	vec3 L2 = normalize(vec3(-0.3, -0.5, 1.0));
	vec3 H2 = normalize(L2 + V);
	float sp2 = pow(max(dot(N, H2), 0.0), 50.0 * tight) * 0.3;
	vec3 L3 = normalize(vec3(0.1, 0.3, 1.0));
	float spB = pow(max(dot(N, L3), 0.0), 6.0 * tight) * 0.1;
	vec3 L4 = normalize(vec3(0.0 + u_lightDir.x, 0.9 + u_lightDir.y, 0.4));
	vec3 H4 = normalize(L4 + V);
	float sp4 = pow(max(dot(N, H4), 0.0), 120.0 * tight) * 0.6;
	float totalSpec = (sp1 + sp2 + spB + sp4) * u_spec;

	// ── Inner border / stroke highlight ──
	float borderWidth = 1.5;
	float innerStroke = smoothstep(-borderWidth - 1.0, -borderWidth, sdf)
	                  * (1.0 - smoothstep(-1.0, 0.0, sdf));
	float topBias = 0.5 + 0.5 * (-v_localPx.y / half_.y);
	innerStroke *= (0.4 + 0.6 * topBias);

	// ── Edge highlight & inner glow ──
	float rim = edge * u_edgeHL * 0.22;
	float innerGlow = smoothstep(5.0, 0.0, -sdf) * u_edgeHL * 0.15;

	// ── Environment-like reflection (fake) ──
	float envRefl = (N.y * 0.5 + 0.5) * fres * 0.08;

	// ── Composite ──
	vec3 fin = col;
	fin += vec3(totalSpec);
	// LOCAL (?try=liquidedge): no drawn lines round the rim. The CSS glass
	// has none either -- the arris is what the light pass lights.
	float drawn = 1.0 - step(0.5, u_physEdge);
	fin += vec3(rim + innerGlow) * drawn;
	fin += vec3(innerStroke * u_edgeHL * 0.55) * drawn;
	fin += vec3(envRefl);
	fin = mix(fin, vec3(1.0), fres * 0.2);

	gl_FragColor = vec4(fin, mask * u_alpha);
}`;
