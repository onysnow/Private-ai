/**
 * The grazing laser (Ony, 2026-10-03: "could there be another laser that
 * instead of shooting into the side of the glass can shoot into the same
 * plane the water drops exist on so it hits the raindrops?").
 *
 * A beam skimming along the glass's face, at the height of the drops
 * standing on it. Clean glass scatters little of it, so on bare glass it is
 * a faint line, bright where condensation scatters it; every drop it crosses
 * glows, brightest at its far rim where the beam focuses, and takes its share
 * out of the beam, which leaves it as a widening fan (the water shader's
 * grazeBeam, grazeWater, grazeGlass).
 *
 * Where the beam is, for the passes that draw it: in page CSS px, a start
 * point and a unit direction, its width, its colour times its power. Pure
 * state; GrazingLaser (components/site) aims it.
 */

import { wavelengthRgb } from "@fx/effects/optics/dispersion";
import { t } from "@fx/lib/tuning";

export type Graze = {
  on: boolean;
  /** Where the beam starts, viewport px. */
  x: number;
  y: number;
  /** Its direction, unit. */
  dx: number;
  dy: number;
  /** Its width (the 1/e^2 radius), px. */
  width: number;
};

// About 1 mm, a pointer laser's beam (5 px to the mm on the glass).
export const graze: Graze = { on: false, x: 0, y: 0, dx: 1, dy: 0, width: 4 };

/** The wavelengths of "Laser colour", in its options' order (as the edge laser's; null is white). */
const KNOB_NM: readonly (number | null)[] = [650, 635, 589, 532, 450, 405, null];

/** The beam's colour times its brightness where it meets water (linear). */
export function grazeColour(): [number, number, number] {
  const nm = KNOB_NM[Math.round(t("laserColour"))] ?? 650;
  const rgb = nm === null ? ([1, 1, 1] as const) : wavelengthRgb(nm);
  const power = 5;
  return [rgb[0] * power, rgb[1] * power, rgb[2] * power];
}
