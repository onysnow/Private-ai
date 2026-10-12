/**
 * The lamp, reflected by the face of the glass.
 *
 * WHY THIS FILE EXISTS
 *
 * The reflection used to be two settings, "Light on the glass" and "Surface
 * sheen", and both sat at 0 -- so the pane reflected nothing of the lamp at
 * all. Under the rule (you set causes, physics sets effects) neither should
 * have been a setting. How much a pane reflects is a fact about its material,
 * and how spread out that reflection is is a fact about its surface:
 *
 *   how much   ((n - 1) / (n + 1))^2 straight on -- 4.2% for float glass --
 *              rising toward grazing by Schlick's approximation.
 *   how spread the microfacet distribution (GGX) of the surface. Polished
 *              glass is nearly a mirror: a small, sharp, bright image of the
 *              lamp. Frost roughens the surface and spreads the SAME light
 *              into a wide, dim sheen. Frost never removes the reflection.
 *   how bright the lamp's irradiance at that point: its power over the
 *              square of its distance.
 *
 * The camera looks straight at the page, so the view direction is the
 * surface normal and the half-vector comes from the lamp's direction alone.
 *
 * Every function has a GLSL twin in reflection.glsl.ts, checked against this
 * one in real WebGL by e2e/optics.spec.ts.
 */

/** Reflectance straight on, from the index of refraction. */
export function reflectanceNormal(ior: number): number {
  const r = (ior - 1) / (ior + 1);
  return r * r;
}

/** Schlick's Fresnel: reflectance at an angle whose cosine is `cosTheta`. */
export function fresnelSchlick(cosTheta: number, ior: number): number {
  const f0 = reflectanceNormal(ior);
  const c = Math.min(1, Math.max(0, cosTheta));
  return f0 + (1 - f0) * Math.pow(1 - c, 5);
}

/*
 * ---- The exact Fresnel equations, per polarisation (light engine step H) ----
 *
 * Schlick's curve is the unpolarised average, approximated. Light reflected
 * off glass is not unpolarised: the s component (its electric field square
 * to the plane of incidence) reflects more than the p component, which
 * vanishes at Brewster's angle, atan(n) = 56.6 degrees for float glass. That
 * is what a polarising filter on a camera works with: turned one way it
 * passes the s light and the reflection is bright, turned a quarter round it
 * passes only the p and the reflection fades (Hecht, Optics, 4.6;
 * "Fresnel equations", Wikipedia).
 *
 *   Rs = ((n1 cos i - n2 cos t) / (n1 cos i + n2 cos t))^2
 *   Rp = ((n1 cos t - n2 cos i) / (n1 cos t + n2 cos i))^2
 *
 * from the side the light arrives on (n1) into the other (n2), with Snell
 * for cos t. `ior` is n2 / n1; below 1 (leaving glass) past the critical
 * angle both are 1: total internal reflection.
 */

/** s-polarised reflectance at an angle whose cosine is `cosI`, for relative index `ior`. */
export function fresnelS(cosI: number, ior: number): number {
  const ci = Math.min(1, Math.max(0, cosI));
  const sinT2 = (1 - ci * ci) / (ior * ior);
  if (sinT2 >= 1) return 1;
  const ct = Math.sqrt(1 - sinT2);
  const r = (ci - ior * ct) / (ci + ior * ct);
  return r * r;
}

/** p-polarised reflectance: zero at Brewster's angle. */
export function fresnelP(cosI: number, ior: number): number {
  const ci = Math.min(1, Math.max(0, cosI));
  const sinT2 = (1 - ci * ci) / (ior * ior);
  if (sinT2 >= 1) return 1;
  const ct = Math.sqrt(1 - sinT2);
  const r = (ct - ior * ci) / (ct + ior * ci);
  return r * r;
}

/** Unpolarised reflectance, exactly: the mean of the two. */
export function fresnelExact(cosI: number, ior: number): number {
  return 0.5 * (fresnelS(cosI, ior) + fresnelP(cosI, ior));
}

/** Brewster's angle, radians: where p-polarised light is not reflected at all. */
export const brewsterAngle = (ior: number) => Math.atan(ior);

/**
 * What a camera's polarising filter lets through of light reflected by a
 * face, exposure made up for the filter's own half (so light that is not
 * polarised comes through unchanged): Rs cos^2 + Rp sin^2 of the angle
 * between the filter's axis and the s direction, blended from no filter
 * (`strength` 0: the plain mean) to a perfect one (1).
 */
export function polarisedReflectance(
  cosI: number,
  ior: number,
  filterToS: number,
  strength: number,
): number {
  const rs = fresnelS(cosI, ior);
  const rp = fresnelP(cosI, ior);
  const c2 = Math.cos(filterToS) ** 2;
  const filtered = rs * c2 + rp * (1 - c2);
  return 0.5 * (rs + rp) + (filtered - 0.5 * (rs + rp)) * Math.min(1, Math.max(0, strength));
}

/**
 * Surface roughness (GGX alpha) from frost, 0 clear to 1 fully frosted.
 *
 * The two ends are the model's fixed constants, set once and not controls:
 * polished float glass is optically smooth (alpha about 0.02), and acid-etched
 * or sandblasted glass scatters like a matte surface (alpha about 0.6).
 */
export const POLISHED_ROUGHNESS = 0.02;
export const FROSTED_ROUGHNESS = 0.6;

export function frostRoughness(frost: number): number {
  const f = Math.min(1, Math.max(0, frost));
  return POLISHED_ROUGHNESS + (FROSTED_ROUGHNESS - POLISHED_ROUGHNESS) * f;
}

/** GGX (Trowbridge-Reitz) normal distribution. Integrates to 1 over the hemisphere, projected. */
export function ggx(nDotH: number, alpha: number): number {
  const a2 = alpha * alpha;
  const c = Math.min(1, Math.max(0, nDotH));
  const d = c * c * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}

/**
 * How much of a point lamp the flat face sends straight back to the camera.
 *
 * `dx`, `dy`: the point on the glass relative to the spot directly under the
 * lamp, in CSS pixels. `height`: how far the lamp is above the glass. `power`:
 * the lamp's radiant intensity, in the same arbitrary units the rest of the
 * light uses.
 *
 * Cook-Torrance with the view along the normal: F * D / 4, lit by the
 * irradiance power / distance^2. The geometry term is 1 here -- a flat face
 * seen straight on does not shadow itself.
 */
export function lampReflection(
  dx: number,
  dy: number,
  height: number,
  power: number,
  ior: number,
  frost: number,
): number {
  const h = Math.max(height, 1);
  const d2 = dx * dx + dy * dy + h * h;
  const d = Math.sqrt(d2);
  // Half-vector between the lamp direction and the view (0, 0, 1).
  const lz = h / d;
  const hx = -dx / d;
  const hy = -dy / d;
  const hz = lz + 1;
  const hLen = Math.hypot(hx, hy, hz);
  const nDotH = hz / hLen;
  // With the view along the normal, V.H is N.H.
  const f = fresnelSchlick(nDotH, ior);
  const dist = ggx(nDotH, frostRoughness(frost));
  return (f * dist * 0.25 * power) / d2;
}

/**
 * The lamp's radiant intensity per unit of its brightness ("Core gain").
 *
 * The one calibration constant in the reflection, and not a control: it
 * converts the lamp's brightness setting into the units the light on the
 * glass is drawn in. Set once so that, on today's frosted float glass with
 * the lamp at its default height, the sheen directly under the lamp comes out
 * at about a third of white before the tonemap -- a visible glare that does
 * not blow out -- and then locked. Clear glass under the same lamp then gives
 * the small blown-out image of the lamp that real clear glass gives.
 */
export const LAMP_POWER_PER_GAIN = 94_500;

/**
 * The lamp's reflection on the face is switched OFF, by request.
 *
 * It reads as a flashlight on the glass: a bright disc that follows the lamp.
 * The code stays and is tested; this is the one switch. Off means the glass
 * passes no lamp power to the reflection, so nothing of it is drawn.
 */
export const LAMP_REFLECTION_ENABLED = false;
