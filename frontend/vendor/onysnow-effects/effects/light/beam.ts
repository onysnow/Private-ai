/**
 * A light that shines one way: a flashlight's beam (item 25i).
 *
 * Every other light in the scene gives off the same in every direction. A
 * torch does not: its reflector gathers the LED's light into a HOTSPOT a few
 * degrees across, and what the reflector misses leaves as a wide, dim SPILL
 * with a visible edge where the reflector's lip cuts it off. Flashlight people
 * call a hotspot under about 10 degrees across "throwy" and 60-120 degrees of
 * spill "flood" (Candle Power Forums, "Beam Angles"); beam profiles are
 * modelled as super-Gaussians, flat on top with steep sides (the "Map of
 * Flashlights" beam model), which is what a hotspot looks like on a wall.
 *
 * So the beam here is:
 *
 *   I(theta) = I0 * [ exp(-ln2 * (theta / HOT)^4)  +  SPILL_SHARE * cutoff(theta / SPILL) ]
 *
 * half strength at HOT off the axis, a spill of SPILL_SHARE of the centre out
 * to the reflector's edge at SPILL, and nothing past it. A light carries its
 * aim (Light.aim, a unit vector); every pass that lights a point multiplies
 * that light by beamFactor toward the point. A light with no aim shines all
 * round, as before, so nothing that is not a beam changes.
 *
 * The GLSL twin is in LIGHTS_GLSL (effects/light/light-uniforms), from the
 * same constants.
 */

/** Half the hotspot's angle, radians: where it is half as bright as its centre. 8 degrees. */
export const BEAM_HOT = (8 * Math.PI) / 180;
/** Half the spill's angle, radians: the reflector's lip. 32 degrees. */
export const BEAM_SPILL = (32 * Math.PI) / 180;
/** How bright the spill is beside the hotspot's centre. */
export const BEAM_SPILL_SHARE = 0.07;

/** A beam's direction, a unit vector: x, y across the page, z up out of it (so down is negative). */
export type Aim = readonly [number, number, number];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How much of a beam's centre reaches along (dx, dy, dz) from the light: 1
 * on the axis, 0 outside the spill. No aim: 1 everywhere (a light that
 * shines all round).
 */
export function beamFactor(
  aim: Aim | null | undefined,
  dx: number,
  dy: number,
  dz: number,
): number {
  if (!aim) return 1;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return 1;
  const c = (aim[0] * dx + aim[1] * dy + aim[2] * dz) / len;
  const theta = Math.acos(Math.min(1, Math.max(-1, c)));
  const hot = Math.exp(-Math.LN2 * Math.pow(theta / BEAM_HOT, 4));
  const spill = BEAM_SPILL_SHARE * (1 - smoothstep(BEAM_SPILL * 0.9, BEAM_SPILL, theta));
  return hot + spill;
}

/**
 * Where a torch at (x, y), `height` above the page, points to light the page
 * at (tx, ty): the unit vector from it to there. Straight down if the two
 * are the same point.
 */
export function aimAt(x: number, y: number, height: number, tx: number, ty: number): Aim {
  const dx = tx - x;
  const dy = ty - y;
  const dz = -Math.max(height, 1);
  const len = Math.hypot(dx, dy, dz);
  return [dx / len, dy / len, dz / len];
}
