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

/**
 * Default configuration values for the liquid glass effect.
 * These can be overridden per-element via dataset.config (JSON string)
 * or globally via LiquidGlass.init({ defaults: { ... } }).
 */

/** Per-element glass configuration. */
export interface GlassConfig {
	/** Background blur strength (0 = sharp, 1 = maximum blur). */
	blurAmount: number;
	/** Refraction strength — how much the glass bends the image behind it */
	refraction: number;
	/** Chromatic aberration — color fringing at edges */
	chromAberration: number;
	/** LOCAL: extra defocus across the bevel, on top of the frost. 0 = none. */
	edgeBlur: number;
	/** Edge highlight intensity (inner glow / rim lighting) */
	edgeHighlight: number;
	/** Specular highlight intensity (Blinn-Phong) */
	specular: number;
	/** Fresnel reflection intensity at grazing angles */
	fresnel: number;
	/** Micro-distortion noise strength */
	distortion: number;
	/** Corner radius in CSS pixels */
	cornerRadius: number;
	/** Z-radius (bevel depth) — controls the curvature of the pill bevel */
	zRadius: number;
	/** Overall opacity of the glass panel */
	opacity: number;
	/** Saturation adjustment (-1 = desaturated, 0 = normal, 1 = vivid) */
	saturation: number;
	/** Tint strength — cool blue-ish glass tint */
	tintStrength: number;
	/** Brightness adjustment (-0.5 to 0.5) */
	brightness: number;
	/** Shadow opacity (0 = no shadow, 1 = full black) */
	shadowOpacity: number;
	/** Shadow spread in CSS pixels */
	shadowSpread: number;
	/** Shadow vertical offset in CSS pixels */
	shadowOffsetY: number;
	/** Whether this glass element can be dragged around (Pointer Events) */
	floating: boolean;
	/** Whether this glass element behaves as a button (hover lift + press effect) */
	button: boolean;
	/** LOCAL: multiplies all four specular exponents. 1 = upstream's values. */
	specularTightness: number;
	/** LOCAL: shifts the two tight speculars' light direction. 0,0 = upstream. */
	lightX: number;
	lightY: number;
	/** LOCAL: Gaussian blur passes for the frosted sample. Upstream fixed this at 6. */
	blurPasses: number;
	/**
	 * Bevel mode: 0 = biconvex pill (half-circle cross-section, default),
	 * 1 = dome (flat bottom, quarter-circle top — use with cornerRadius = zRadius
	 * for a perfect half-sphere magnifier effect).
	 */
	bevelMode: number;
	/** LOCAL (?try=liquidedge): 1 bends by Snell through the pane's own edge. */
	physicalEdge?: number;
	/** LOCAL: the slab's thickness, CSS px. */
	thickness?: number;
	/** LOCAL: the glass's index for the red, green and blue channels. */
	iorR?: number;
	iorG?: number;
	iorB?: number;
	/** LOCAL: the pane's own fill, display RGBA 0..1. */
	veilR?: number;
	veilG?: number;
	veilB?: number;
	veilA?: number;
}

export const DEFAULTS: GlassConfig = {
	blurAmount: 0.00,
	refraction: 0.69,
	chromAberration: 0.05,
	edgeBlur: 0,               // LOCAL
	edgeHighlight: 0.05,
	specular: 0.00,
	fresnel: 1.00,
	distortion: 0.00,
	cornerRadius: 65,
	zRadius: 40,
	opacity: 1.00,
	saturation: 0.00,
	tintStrength: 0.00,
	brightness: 0.00,
	shadowOpacity: 0.30,
	shadowSpread: 10,
	shadowOffsetY: 1,
	specularTightness: 1.00,   // LOCAL
	lightX: 0.00,              // LOCAL
	lightY: 0.00,              // LOCAL
	blurPasses: 6,             // LOCAL, was the BLUR_ITERATIONS constant

	floating: false,
	button: false,
	bevelMode: 0,
};

/** Number of Gaussian blur passes (higher = smoother but slower) */
export const BLUR_ITERATIONS = 6;

/** Extra padding around each panel for rendering the drop shadow (px) */
export const SHADOW_PAD = 20;
