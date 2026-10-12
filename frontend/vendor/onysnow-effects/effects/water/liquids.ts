/**
 * The liquids the drop simulation knows (task 77, 76).
 *
 * Every number is from docs/research/liquids-spray.md 5.2 (the per-liquid
 * table), itself from water-drops.md 2 and 4; what that table marks as an
 * estimate is marked here too.
 */

export type Liquid = {
  readonly id: number;
  readonly name: string;
  /** Density, kg/m^3. */
  readonly rho: number;
  /** Dynamic viscosity, Pa*s. */
  readonly eta: number;
  /** Surface tension, N/m. */
  readonly gamma: number;
  /** Advancing and receding contact angles on window glass, degrees. */
  readonly thetaA: number;
  readonly thetaR: number;
  /** Refractive index. */
  readonly n: number;
  /** Absorption, per mm, red green blue (Beer-Lambert through the drop's height). */
  readonly sigma: readonly [number, number, number];
  /** Whether a running drop leaves trail drops behind it (slime leaves a tether instead). */
  readonly trails: boolean;
  /** Evaporation, mm^3 per second per mm of contact radius (diffusion-limited: dV/dt goes as the radius). */
  readonly evaporation: number;
};

const ETA_WATER = 1.0e-3;

export const WATER: Liquid = {
  id: 0,
  name: "water",
  rho: 1000,
  eta: ETA_WATER,
  gamma: 0.072,
  // A real window that beads rain: 60 / 40 (water-drops 2.1-2.3, Quere).
  thetaA: 60,
  thetaR: 40,
  n: 1.333,
  sigma: [0, 0, 0],
  trails: true,
  /*
   * (estimate) In rain the air at the glass is close to saturated, so a drop
   * barely evaporates: a 1 uL drop lasts half an hour (it was a few minutes,
   * which drained the glass as fast as the rain wet it: the drops never grew
   * heavy enough to run, so no streams and no cleared lanes formed).
   */
  evaporation: 0.0006,
};

/** Bumped whenever a liquid's angles change, so cached cap sizes are recomputed. */
export let liquidsVersion = 0;

/**
 * How strongly the glass beads rain (Ony, 2026-10-03: the drops on the
 * words must magnify them clearly): water's resting contact angle on this
 * glass, degrees, with the 20-degree hysteresis of a real window kept. Clean
 * glass sits near 30-50, a weathered window 60-90, a rain-repellent coating
 * over 100. A taller bead is a stronger lens: at 50 a drop magnifies what is
 * under it by about 10%, at 90 by about a third.
 */
export function setWaterBeading(restDeg: number): void {
  const r = Math.max(20, Math.min(130, restDeg));
  const w = WATER as { thetaA: number; thetaR: number };
  if (Math.abs(w.thetaA - (r + 10)) < 1e-6 && Math.abs(w.thetaR - (r - 10)) < 1e-6) return;
  w.thetaA = r + 10;
  w.thetaR = r - 10;
  liquidsVersion++;
}

export const BLOOD: Liquid = {
  id: 1,
  name: "blood",
  rho: 1055,
  eta: 4.8 * ETA_WATER,
  gamma: 0.058,
  // (estimate) pins hard.
  thetaA: 45,
  thetaR: 15,
  n: 1.36,
  // Beer-Lambert from the haemoglobin spectrum (OMLC, Prahl; water-drops 4).
  sigma: [0.5, 29, 34],
  trails: true,
  evaporation: 0.002,
};

export const SLIME: Liquid = {
  id: 2,
  name: "slime",
  rho: 1000,
  eta: 3000 * ETA_WATER,
  gamma: 0.06,
  // (estimate) high hysteresis.
  thetaA: 60,
  thetaR: 20,
  n: 1.34,
  // A green dye, the toy's classic (estimate: passes green, takes most red and blue in a millimetre).
  sigma: [0.9, 0.12, 0.8],
  trails: false,
  // Very slow (hours).
  evaporation: 0.00005,
};

export const LIQUIDS: readonly Liquid[] = [WATER, BLOOD, SLIME];

/**
 * The friction law's dimensionless beta (Li et al., Nat. Commun. 2023: 20-200,
 * tested from 1e-3 to 1 Pa*s); 100 for every liquid (liquids-spray 5.2).
 * A stream just past its threshold creeps at a few centimetres a second; a
 * big one is fast, but it drains into its own track as it goes (DropSim
 * FILM_LINE_MM), so it slows and stalls as a real one does.
 */
export const FRICTION_BETA = 100;
/** Furmidge's prefactor; 1 reproduces the measured 7-19 uL threshold (water-drops 2.3, computed). */
export const FURMIDGE_K = 1;
export const GRAVITY = 9.81;
