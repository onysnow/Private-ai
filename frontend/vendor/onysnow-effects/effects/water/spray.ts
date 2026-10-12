/**
 * The spray bottle (task 76; docs/research/liquids-spray.md 5.3).
 *
 * One squeeze of a trigger sprayer is about 1 mL over 120 ms (P&G patent
 * US8322630B2; Giles 2005), as a hollow cone, 60 degrees full angle for
 * water and narrower as the liquid is more viscous (60 x (eta_w / eta)^0.1,
 * estimate). Most of the finest mist never reaches the glass; held close
 * (10 cm, estimate) about 30% lands (estimate, from 5.3's "spraying close
 * gives drops; spraying from far gives a fine haze"). It lands as parcels,
 * 300 a squeeze (5.3: 200-400, estimate), each standing for many droplets
 * too small to draw, which gather in the drop sim's mist until a cell holds
 * enough to bead (sim.deposit). 5.3 suggests 200-400 parcels for sim drops;
 * here a parcel is mist, so it has to be smaller than a cell's beading
 * volume (0.5 uL): 2000 of 0.15 uL, so a cell beads after a few squeezes,
 * as a sprayed window does. Liquids too thick to atomise (Ohnesorge
 * number past 0.2 at a 0.5 mm orifice: slime, honey) come out as a stream
 * that breaks into a few gobs instead.
 */

import { LIQUIDS, WATER } from "./liquids";

export const SQUEEZE_UL = 1000;
export const SQUEEZE_MS = 120;
export const SPRAY_DISTANCE_MM = 100;
export const LANDED_FRACTION = 0.3;
export const PARCELS = 2000;
/** Squeezes a second while the trigger is held (estimate: a fast pump). */
export const SQUEEZE_RATE = 3;
/** Past this Ohnesorge number a liquid streams instead of spraying (liquids-spray 5.3). */
export const OH_STREAM = 0.2;
const ORIFICE_M = 0.5e-3;

/** A liquid's Ohnesorge number at the nozzle: eta / sqrt(rho gamma L). */
export function ohnesorge(liquidId: number): number {
  const l = LIQUIDS[liquidId] ?? WATER;
  return l.eta / Math.sqrt(l.rho * l.gamma * ORIFICE_M);
}

/** The cone's full angle, degrees. */
export function coneAngle(liquidId: number): number {
  const l = LIQUIDS[liquidId] ?? WATER;
  return 60 * Math.pow(WATER.eta / l.eta, 0.1);
}

export type Parcel = { dx: number; dy: number; volume: number; gob: boolean };

/** Where one squeeze lands, mm from where it is aimed, and how much each parcel holds (uL). */
export function squeeze(liquidId: number, random: () => number): Parcel[] {
  const landed = SQUEEZE_UL * LANDED_FRACTION;
  const R = SPRAY_DISTANCE_MM * Math.tan(((coneAngle(liquidId) / 2) * Math.PI) / 180);
  const out: Parcel[] = [];
  if (ohnesorge(liquidId) > OH_STREAM) {
    /*
     * A stream breaking into gobs, landing close together. Through the same
     * nozzle at the same squeeze, flow goes as 1 / viscosity (Poiseuille), so
     * a thick liquid gives far less a squeeze; floored at 2% of a squeeze
     * (estimate: you squeeze harder) so slime still comes out as gobs.
     */
    const gobs = 5;
    const l = LIQUIDS[liquidId] ?? WATER;
    const streamed = SQUEEZE_UL * Math.max(WATER.eta / l.eta, 0.02);
    for (let k = 0; k < gobs; k++) {
      const r = R * 0.25 * Math.sqrt(random());
      const a = random() * Math.PI * 2;
      out.push({ dx: r * Math.cos(a), dy: r * Math.sin(a), volume: streamed / gobs, gob: true });
    }
    return out;
  }
  for (let k = 0; k < PARCELS; k++) {
    // A hollow cone: most of it in the outer ring (0.6-1 of the radius, evenly by area).
    const r = R * Math.sqrt(0.36 + 0.64 * random());
    const a = random() * Math.PI * 2;
    out.push({ dx: r * Math.cos(a), dy: r * Math.sin(a), volume: landed / PARCELS, gob: false });
  }
  return out;
}

type Target = (x: number, y: number, liquidId: number) => void;
let target: Target | null = null;

/** The water layer takes the spray (returns the release). */
export function onSpray(fn: Target): () => void {
  target = fn;
  return () => {
    if (target === fn) target = null;
  };
}

/** Squeeze the trigger, aimed at page point (x, y). */
export function sprayAt(x: number, y: number, liquidId: number) {
  target?.(x, y, liquidId);
}
