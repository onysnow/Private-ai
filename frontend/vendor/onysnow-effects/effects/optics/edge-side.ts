import { FROSTED_FLOAT } from "@fx/effects/materials/presets";

/**
 * A pane's edge, rebuilt from the reference photographs (optics plan step 8).
 *
 * WHAT THE PHOTOGRAPHS SHOW
 *
 * Ony's four close-ups of clear float glass agree on this, and nothing in them
 * is a drawn line: every feature is a reflection, a refraction or a
 * highlight, and every transition is softened over 1-3 px.
 *
 *   arris        the corner between face and side is eased, so it catches
 *                light as a soft band 1-2 px wide -- brightest where the lamp
 *                is, not along the whole edge
 *   side face    a clear window, tinted by the length of glass the light
 *                crossed: saturated teal by the near arris, paler through the
 *                middle, a thin darker line at the far arris
 *   side mirror  it also reflects whatever faces it, so its light and dark
 *                blocks change along its length
 *   glints       short bright segments where the lamp reflects, following it
 *   echo         just inside the edge, a paler displaced copy of it: the side
 *                seen again, by internal reflection, through the face
 *
 * WHAT WAS THERE BEFORE
 *
 * Fixed teal stripes painted in CSS, identical along the whole width of
 * every pane; a 1 px hairline round the pane; a hard echo line 5 px inside;
 * a white glare band the width of the page whenever the lamp was near. Each
 * was a picture of an effect. This file is the causes those effects come
 * from, and every function in it has a GLSL twin in edge-side.glsl.ts.
 *
 * COORDINATES
 *
 * CSS pixels, x right, y down the page, z toward the viewer. The front face
 * of the glass is z = 0, the back face z = -thickness. The lamp and the eye
 * are in front of it (z > 0).
 */

/**
 * The glass's physical thickness, CSS pixels. A cause (the plan's
 * <Pane thickness>, step 2); here as the one value every pane has today. The
 * CSS bend (lib/bevel-filters GLASS_THICKNESS) is built from this same value.
 */
export const PANE_THICKNESS = 18;

/**
 * The eased corner's radius, CSS pixels. Sets how wide the arris highlight
 * is and how soft every edge transition is -- the photos' 1-3 px.
 */
export const ARRIS_RADIUS = 1.5;

/**
 * Beer-Lambert absorption of the glass, per unit of path, red / green /
 * blue: the site's material's (effects/materials/presets). Iron takes red
 * most, blue next, green least: invisible through a few millimetres of face,
 * the whole colour of a long path through the side.
 *
 * Measured from Ony's five reference photographs of clear float glass (sides
 * seen against a white ground, so each pixel over the ground's white is the
 * side's transmittance): optical depth blue / green 1.2-1.35 in every photo,
 * red / green 2-4.5 (red clips to 0 in the darkest sides), green 0.5 through
 * the paler middle of a side to 1.3 at its most saturated. With the path
 * lengths below this gives exactly that range.
 */
export const SIDE_ABSORB: readonly [number, number, number] = FROSTED_FLOAT.absorb;

/**
 * How wide a side face shows on screen, CSS px: perspective, nothing else.
 *
 * A side face runs straight back from the front of the pane, so you see it
 * only from ITS side of the edge: the top face only when the top edge is
 * below your eye, the bottom face only when the bottom edge is above it.
 * Never two opposite faces -- for a flat slab that is impossible (Ony,
 * 2026-09-29) -- at most two neighbours (the bottom and the left, seen from
 * down and to the left). A pane that straddles your eye shows none.
 *
 * You look at the page from the front, from `distance` away, so a face
 * `thickness` deep is seen nearly edge-on: its front arris is `offset` past
 * your eye and its back arris is foreshortened toward it by
 * distance / (distance + thickness), leaving
 *
 *   width = offset * thickness / (distance + thickness)
 *
 * a few pixels at most -- "the side, but top down" (Ony). Small panes near
 * the middle of the view show almost no side at all.
 *
 * `offset` is how far the edge is past the eye on the face's side (negative
 * or zero: the face is turned away). The thin fixed bars (.glass--bar, the
 * header) are thinner glass.
 */
export const BAR_THINNER = 9 / 16;
export function sideWidth(
  offset: number,
  thickness: number,
  bar: boolean,
  distance: number,
): number {
  if (offset <= 0) return 0;
  const t = Math.max(thickness, 0) * (bar ? BAR_THINNER : 1);
  return (offset * t) / (Math.max(distance, 1) + t);
}

/** The four faces of a pane, CSS px, for an eye at (eyeX, eyeY) in the viewport. */
export type PaneFaces = { top: number; bottom: number; left: number; right: number };

/**
 * Which faces of a pane show, and how wide, whole CSS px, for an eye at
 * `eye` (viewport px) `distance` from the page. A band as wide as the view
 * has no left or right edge in sight.
 */
export function paneFaces(
  rect: { left: number; top: number; right: number; bottom: number },
  eye: { x: number; y: number },
  distance: number,
  bar: boolean,
  thickness: number,
  fullWidth: boolean,
): PaneFaces {
  const w = (offset: number) => Math.round(sideWidth(offset, thickness, bar, distance));
  return {
    top: w(rect.top - eye.y),
    bottom: w(eye.y - rect.bottom),
    left: fullWidth ? 0 : w(rect.left - eye.x),
    right: fullWidth ? 0 : w(eye.x - rect.right),
  };
}

/*
 * ---- The window through the side ----
 *
 * The light you see through the side has crossed a long path of glass. Near
 * the front arris it is light that was trapped by total internal reflection
 * and guided along the pane before escaping -- the longest path, the most
 * saturated teal. A few pixels in it is light crossing more directly -- the
 * shortest path, paler aqua.
 */
export const SIDE_PATH_MIN = 0.55;
export const SIDE_PATH_GUIDED = 0.9;
/** How far the guided light reaches in from the front arris, CSS pixels. */
export const SIDE_GUIDED_DEPTH = 3;

/** Path length through the side at `depth` px in from the front arris. */
export function sidePath(depth: number): number {
  return SIDE_PATH_MIN + SIDE_PATH_GUIDED * Math.exp(-Math.max(depth, 0) / SIDE_GUIDED_DEPTH);
}

/**
 * How much of the side is window rather than corner at `depth` px in. The
 * first pixel or two is the eased arris, which turns through a quarter circle
 * and shows what it reflects, not a view through the side.
 */
export function arrisEase(depth: number): number {
  const u = Math.max(depth, 0) / ARRIS_RADIUS;
  return 1 - Math.exp(-u * u);
}

/** The fraction of each channel the side lets through at that depth. */
export function sideTransmittance(depth: number): [number, number, number] {
  const l = sidePath(depth);
  const k = arrisEase(depth);
  return [
    1 - (1 - Math.exp(-SIDE_ABSORB[0] * l)) * k,
    1 - (1 - Math.exp(-SIDE_ABSORB[1] * l)) * k,
    1 - (1 - Math.exp(-SIDE_ABSORB[2] * l)) * k,
  ];
}

/**
 * The far arris: the eased corner between the side and the back face turns
 * the light passing it away from you, so it is a thin DARKER line, not a
 * bright one. The fraction lost at `fromFar` px from it.
 */
// Measured across the far arris in the photos: about 0.55 of the light lost.
export const FAR_ARRIS_LOSS = 0.55;
export function farArrisLoss(fromFar: number): number {
  const u = fromFar / ARRIS_RADIUS;
  return FAR_ARRIS_LOSS * Math.exp(-u * u);
}

/*
 * ---- The side as a mirror ----
 *
 * The side face is perpendicular to the glass, and you see it at a grazing
 * angle, so it reflects strongly (Fresnel near grazing). What it reflects is
 * whatever faces it: for the top side, the photograph above the edge. Follow
 * a ray from the eye to a point on the side at depth z, reflect it off the
 * side, and carry it on to the photograph `gap` behind the glass. By similar
 * triangles it lands above the edge by
 *
 *     side * (1 + gap / thickness) - depth
 *
 * where `side` is the side's height on screen and `depth` how far in from the
 * front arris the point is on screen. Mirrored: the near arris shows what is
 * furthest away.
 */
/**
 * How square-on you see the side, as the cosine between your line of sight
 * and the side's normal -- from the same geometry that sets how tall it
 * shows. A side of depth `thickness` seen `side` px tall is seen at
 * tan(elevation) = side / thickness; the thinner it shows, the more grazing
 * the look, and the more it mirrors (Fresnel).
 */
export function sideCosine(side: number, thickness: number): number {
  const r = Math.max(side, 0) / Math.max(thickness, 1);
  return r / Math.sqrt(1 + r * r);
}

/*
 * ---- What the side relays ----
 *
 * The photographs' strongest feature: along its length a side face is a run
 * of light and dark BLOCKS. Looking into the side you look along the slab,
 * and light reaches you from far inside it, bounced between the two faces by
 * total internal reflection -- so you see what lies under the pane, squeezed
 * into the side and flipped, tinted by the long path. Same geometry as the
 * mirror, turned inward: it reaches into the pane by mirrorReach().
 *
 * How much of the side's light comes this way, relative to the straight view
 * through it. Set against the photos, where the blocks swing from dark teal
 * to near white along one side.
 */
export const RELAY_GAIN = 0.6;

export function mirrorReach(depth: number, side: number, gap: number, thickness: number): number {
  return side * (1 + Math.max(gap, 0) / Math.max(thickness, 1)) - depth;
}

/*
 * ---- The arris ----
 *
 * The eased corner is a quarter-cylinder: its normal sweeps from the face's
 * (0, 0, 1) to the side's outward normal (g, 0). So it holds every normal in
 * that arc, and wherever the lamp's half-vector lies in the arc the arris
 * mirrors the lamp -- a highlight on a curved surface, which is why the
 * corner is the brightest thing on a pane.
 *
 * Integrating the GGX lobe across the arc leaves a line lobe in the one
 * direction the arc cannot follow, along the edge:
 *
 *     D_line(phi) = a^2 / (2 (a^2 + phi^2)^(3/2))
 *
 * where phi is how far the half-vector leans along the edge. That lean is
 * what makes a glint SHORT: it is only near zero where the lamp and the eye
 * balance, which is beside the lamp. Averaged over the arc (pi / 2) to give
 * the radiance of the arris across its width.
 *
 * The lamp is not a point. Its size adds to the surface's roughness as the
 * angle it subtends, so a bigger lamp throws a longer, softer glint.
 */
export function arrisLine(phi: number, alpha: number): number {
  const a2 = alpha * alpha;
  return a2 / (2 * Math.pow(a2 + phi * phi, 1.5)) / (Math.PI / 2);
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * The lamp mirrored by the arris at point `p` on it, whose outward edge
 * normal on the page is (gx, gy). Radiance before tonemapping, in the units
 * of lampReflection (reflection.ts), which the face's reflection uses.
 */
export function arrisGlint(
  p: [number, number],
  gx: number,
  gy: number,
  lamp: V3,
  lampRadius: number,
  eye: V3,
  alpha: number,
  power: number,
  ior: number,
): number {
  const P: V3 = [p[0], p[1], 0];
  const toLamp = sub(lamp, P);
  const d2 = toLamp[0] ** 2 + toLamp[1] ** 2 + toLamp[2] ** 2;
  const l = norm(toLamp);
  const v = norm(sub(eye, P));
  const h = norm([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
  // The best normal in the arc, and how far h leans out of it along the edge.
  const across = h[0] * gx + h[1] * gy;
  const along = -h[0] * gy + h[1] * gx;
  const theta = Math.atan2(across, h[2]);
  const inArc = theta >= 0 && theta <= Math.PI / 2 ? 1 : 0;
  const phi = Math.asin(Math.min(1, Math.abs(along)));
  const alphaEff = Math.hypot(alpha, lampRadius / Math.sqrt(d2));
  const vDotH = v[0] * h[0] + v[1] * h[1] + v[2] * h[2];
  const f0 = ((ior - 1) / (ior + 1)) ** 2;
  const f = f0 + (1 - f0) * Math.pow(1 - Math.min(1, Math.max(0, vDotH)), 5);
  return (inArc * f * arrisLine(phi, alphaEff) * 0.25 * power) / d2;
}

/** The arris's width profile across the outline: 1 on it, soft over ARRIS_RADIUS. */
export function arrisProfile(distance: number): number {
  const u = distance / ARRIS_RADIUS;
  return Math.exp(-u * u);
}

/*
 * ---- The echo ----
 *
 * Looking through the face just inside the edge you see the side face again,
 * from inside the glass: it totally internally reflects, so it is a mirror,
 * and it shows a copy of the edge displaced inward by the side's own height
 * again. The light in it has crossed the side twice, so it is paler and more
 * tinted than the side itself, and it is soft for the same reason the arris
 * is.
 */
export const ECHO_GAIN = 0.5;
export function echoProfile(depth: number, side: number): number {
  const u = (depth - 2 * side) / ARRIS_RADIUS;
  return Math.exp(-u * u);
}

/*
 * ---- CSS ----
 *
 * The window through the side is a multiply layer over what is behind the
 * pane (.glass-side, a sibling after it): absorption can only subtract, and the WebGL passes
 * composite plus-lighter, which can only add. These build its gradients from
 * the functions above, so the CSS and the shader cannot disagree about what
 * colour the side is.
 *
 * Transmittance is linear; CSS multiplies encoded values. The sRGB curve is a
 * power law, and a power of a product is the product of the powers, so the
 * encoded transmittance multiplies correctly.
 */
const encode = (t: number) => Math.round(255 * Math.pow(Math.min(Math.max(t, 0), 1), 1 / 2.2));
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${encode(r)} ${encode(g)} ${encode(b)})`;

/** The depths, CSS px from the front arris, the side's gradient is sampled at. */
export const SIDE_GRADIENT_STOPS = [0, 0.75, 1.5, 2.25, 3, 4.5, 6, 9, 12, 16];

/** Background for a side face; `direction` runs from its front arris inward. */
export function sideGradientCss(direction: string): string {
  const stops = SIDE_GRADIENT_STOPS.map((d) => `${rgb(sideTransmittance(d))} ${d}px`);
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}

/** How tall the far-arris layer is: it straddles the corner by this much each way. */
export const FAR_ARRIS_SPAN = 3 * ARRIS_RADIUS;

/** The far arris line, centred in a layer 2 * FAR_ARRIS_SPAN tall. */
export function farArrisGradientCss(direction: string): string {
  const stops = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((u) => {
    const fromFar = Math.abs(u - 0.5) * 2 * FAR_ARRIS_SPAN;
    const k = 1 - farArrisLoss(fromFar);
    return `${rgb([k, k, k])} ${(u * 100).toFixed(1)}%`;
  });
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}
