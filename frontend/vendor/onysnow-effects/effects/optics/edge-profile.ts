/**
 * The edge of a pane, defined once.
 *
 * WHY THIS FILE EXISTS
 *
 * The same physical edge used to be described four times, with four different
 * widths: 26px for the CSS bend (bevel-filters.ts), 40px for the light on the
 * glass (glass-light-shader.ts), 90px for the shadow's edge (the "Shadow edge"
 * knob) and 150px for the liquid glass's bend (the "Bevel depth" knob). So the
 * highlight, the bend and the shadow of one edge landed in four different
 * places, and every change had to be made up to four times.
 *
 * Now there is one edge width, and it is a CAUSE: the physical width of the
 * bevel on a pane. It is set per pane (`data-edge-width`), falling back to the
 * "Edge width" knob. Every effect that needs the edge reads that one number
 * and works out its own result from it -- nothing downstream has a width of
 * its own.
 *
 * Every function here has a GLSL twin in edge-profile.glsl.ts. The twins are
 * checked against each other in a real WebGL context (e2e/optics.spec.ts), so
 * the CPU and the GPU can never quietly disagree about what an edge is.
 *
 * No React, no tuning, no DOM beyond reading one attribute: this is meant to
 * move into the component library as it is.
 */

/**
 * The bevel's width in CSS pixels when a pane does not say otherwise.
 *
 * 40 is the width the light on the glass was already drawn with, and it is the
 * liquid glass library's own default for the same quantity (its zRadius), so
 * the two renderers start from the same physical edge.
 */
export const DEFAULT_EDGE_WIDTH = 40;

/** The attribute a pane carries its own edge width in, in CSS pixels. */
export const EDGE_WIDTH_ATTR = "data-edge-width";

/** A pane's edge width: its own attribute if it has a usable one, else `fallback`. */
export function readEdgeWidth(el: Element, fallback: number): number {
  const raw = el.getAttribute(EDGE_WIDTH_ATTR);
  if (raw === null || raw === "") return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * The pane's signed distance with the bevel's inner contours rounded through
 * the corners (?try=corners, item 2a; twin of paneField in the glass light
 * shader). A rounded box's contours keep its corner radius only until they
 * are that deep; past it they meet in a mitre, and the bevel's normal flips
 * across the diagonal -- a line running in from every corner. Here the depth
 * to the two nearest sides is joined by a smooth minimum as wide as their
 * mean depth (capped at `soft`), so the rim is untouched and every contour
 * inside curves round the corner.
 */
export function roundedRectSDFSmooth(
  px: number,
  py: number,
  halfW: number,
  halfH: number,
  radius: number,
  soft: number,
): number {
  const d0 = roundedRectSDF(px, py, halfW, halfH, radius);
  if (soft <= 0 || d0 >= 0) return d0;
  // Depth to the two nearest sides, joined by a smooth minimum as wide as
  // their mean depth (a smooth quantity, so the join itself has no crease),
  // capped at `soft`.
  const ex = halfW - Math.abs(px);
  const ey = halfH - Math.abs(py);
  const k = Math.min(0.5 * (ex + ey), soft);
  if (k < 1e-3) return d0;
  const h = Math.max(k - Math.abs(ex - ey), 0) / k;
  const m = Math.min(ex, ey) - h * h * k * 0.25;
  // Within the pane's own corner radius of the rim, its rounded corner.
  return Math.max(d0, -m);
}

/** Signed distance to a rounded rectangle centred on the origin. Negative inside. */
export function roundedRectSDF(
  px: number,
  py: number,
  halfW: number,
  halfH: number,
  radius: number,
): number {
  const r = Math.min(radius, Math.min(halfW, halfH));
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

/**
 * Where a point sits across the edge: 0 at the rim, 1 where the bevel meets
 * the flat face and beyond.
 *
 * `depth` is how far inside the pane the point is (the SDF, negated). Every
 * effect that asks "am I on the edge, and how far across it" asks this.
 */
export function edgeBand(depth: number, edgeWidth: number): number {
  return Math.min(1, Math.max(0, depth / Math.max(edgeWidth, 1)));
}

/**
 * The bevel's cross-section, as a height in [0, 1] across its width.
 *
 * `x` is 0 at the outer edge and 1 where the bevel meets the flat face. The
 * circle is what a rounded-over edge is; the squircle is flatter and more
 * industrial, kept as a choice. Profiles from jeantimex/glass-effect-webgpu (ISC).
 */
export type SurfaceProfile = "circle" | "squircle";

export function surfaceHeight(x: number, profile: SurfaceProfile = "circle"): number {
  const t = Math.min(1, Math.max(0, x));
  if (profile === "squircle") return Math.pow(1 - Math.pow(1 - t, 4), 0.25);
  return Math.sqrt(1 - Math.pow(1 - t, 2));
}

/** The slope of `surfaceHeight`, by central difference. */
export function surfaceSlope(x: number, profile: SurfaceProfile = "circle"): number {
  const dx = 0.001;
  const a = Math.max(x - dx, 0);
  const b = Math.min(x + dx, 1);
  return (surfaceHeight(b, profile) - surfaceHeight(a, profile)) / Math.max(b - a, 1e-6);
}

/**
 * How far the backdrop moves under a point on the bevel, in pixels.
 *
 * Snell's law: refract the viewing ray at the surface, follow it through the
 * glass it still has to cross, and see where it comes out. The answer falls
 * out of how wide the edge is, how thick the glass is and what it is made of.
 * Method from jeantimex/glass-effect-webgpu (ISC).
 */
export function refractionOffset(
  x: number,
  edgeWidth: number,
  thickness: number,
  ior: number,
  profile: SurfaceProfile = "circle",
): number {
  const eta = 1 / ior;
  const height = surfaceHeight(x, profile);
  const slope = surfaceSlope(x, profile);

  // Surface normal, pointing back out of the glass.
  const magnitude = Math.hypot(slope, 1);
  const nx = -slope / magnitude;
  const ny = -1 / magnitude;

  const dotNI = ny;
  const k = 1 - eta * eta * (1 - dotNI * dotNI);
  // Total internal reflection: nothing gets through along this ray.
  if (k < 0) return 0;

  const kSqrt = Math.sqrt(k);
  const rx = -(eta * dotNI + kSqrt) * nx;
  const ry = eta - (eta * dotNI + kSqrt) * ny;
  if (Math.abs(ry) < 1e-3) return 0;

  // The ray still has the bevel's own height plus the slab to cross.
  const remaining = height * edgeWidth + thickness;
  return rx * (remaining / ry);
}

/**
 * Reflectivity climbing toward grazing angles: Schlick's fifth-power term.
 *
 * `facing` is 1 looking straight on and 0 at grazing. This is the shape of the
 * rise only; how reflective the glass is straight on (from its index) is the
 * material's business and arrives in a later step.
 */
export function fresnelRise(facing: number): number {
  const f = Math.min(1, Math.max(0, facing));
  return Math.pow(1 - f, 5);
}

/**
 * The glass pass's tonemap: Reinhard, signed, then display gamma.
 *
 * Everything above 1.0 compresses toward white, which is what blows the arris
 * out rather than a stroke being drawn there.
 */
export function toneMapGlass(c: number): number {
  const r = c / (1 + Math.abs(c));
  return Math.sign(r) * Math.pow(Math.abs(r), 1 / 2.2);
}

/** How far past what the picture holds a light must be before its core is all white. */
export const BURN_FROM = 1;
export const BURN_TO = 4;
/** The most a core burns: a trace of its colour always survives. */
export const BURN_MAX = 0.85;

/**
 * The glass tonemap with a film's shoulder (preview "burn").
 *
 * toneMapGlass squeezes each channel on its own, so a coloured light keeps
 * its full saturation however bright it gets: a cyan tube reflected in the
 * glass came out as a solid pure-cyan patch. Film and sensors don't do that.
 * Once the brightest channel is past what the picture can hold, the others
 * are carried up after it and the core burns toward white, with the colour
 * left at its edges where the light is dimmer. Only light burns: a channel the
 * pane is darkening (negative) is left alone.
 */
export function toneMapGlassBurn(rgb: readonly [number, number, number]): [number, number, number] {
  const peak = Math.max(rgb[0], rgb[1], rgb[2], 0);
  const r = rgb.map((c) => c / (1 + Math.abs(c)));
  const top = Math.max(r[0]!, r[1]!, r[2]!);
  const t = Math.min(1, Math.max(0, (peak - BURN_FROM) / (BURN_TO - BURN_FROM)));
  const burn = t * t * (3 - 2 * t) * BURN_MAX;
  return r.map((v, i) => {
    const out = rgb[i]! >= 0 ? v + (top - v) * burn : v;
    return Math.sign(out) * Math.pow(Math.abs(out), 1 / 2.2);
  }) as [number, number, number];
}

/** The film response the light under the glass uses: bright light rolls off instead of clipping. */
export function toneMapFilm(c: number): number {
  return 1 - Math.exp(-c * 1.15);
}
