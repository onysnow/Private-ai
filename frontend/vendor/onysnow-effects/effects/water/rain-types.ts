/**
 * Kinds of rain on a window (task 77; Ony, 2026-10-01: "there seems to be
 * many types of rain from what I can see in the photos I sent you").
 *
 * What tells them apart in the reference photographs (water-drops.md 9.5):
 * how often a drop lands, how big the drops are when they land, how many
 * fine droplets fill the glass between them, and whether the wind pushes
 * the runners sideways. Every number here is an estimate matched to those
 * photographs, not a measurement:
 *
 * - Drizzle: falling drops under 0.5 mm across (the meteorological
 *   definition of drizzle), so the glass fills with a dense mist of tiny
 *   droplets and few drops big enough to run.
 * - Light and steady rain: scattered beads, a few runners.
 * - Downpour: big drops landing often; the glass is soon covered and
 *   streaming.
 * - Wind-driven: rain blown against the glass; runners slant with the wind.
 * - After the rain: nothing new lands; what is left beads, runs a little
 *   and dries.
 */

export type RainType = {
  label: string;
  /** Drops landing per second per square centimetre of glass. */
  rate: number;
  /** Median landing volume, uL (log-normal). */
  median: number;
  /** Fine droplets settling for each drop that lands. */
  droplets: number;
  /** The least wind this rain comes with, mph (the Wind group's speed is raised to it). */
  wind: number;
  /** How hard it rained before you arrived, drops per second per cm^2 (what is already on the glass). */
  before: number;
};

/*
 * Droplets per drop raised 2026-10-08 (157,000 drops traced in 117
 * photographs: tiny specks are a third or more of everything on the glass,
 * filling the gaps between the bigger drops; ours read too even, "clusters
 * of boils").
 */
/*
 * Rates calibrated 2026-10-09 against Ony's six rain clips
 * (rain_on_glass_data: 46-135 detectable drops per 100,000 px^2 at a drop
 * size matching ours, median 100): at the old rates the pane held 270 at
 * half strength and about 350 at full -- "too uniform", "clusters of boils".
 * With the lanes carrying rain that lands in them (sim LANE_SLIP), full
 * strength of steady rain holds about 130 drops per 100,000 px^2 and starts
 * about a stream a second on a 270 x 70 mm pane (headless probe 2026-10-09:
 * 1.07/s; clip E 1.5/s at this size, F 1.2/s).
 */
const RAIN_CALIBRATION = 0.3;
const calibrated = (t: RainType): RainType => ({
  ...t,
  rate: t.rate * RAIN_CALIBRATION,
  before: t.before * RAIN_CALIBRATION,
});
export const RAIN_TYPES: readonly RainType[] = [
  { label: "Drizzle", rate: 0.04, median: 0.12, droplets: 60, wind: 0, before: 0.04 },
  /*
   * Landing volumes raised 2026-10-09: a raindrop is 1-3 mm across (0.5-14
   * uL), so a drop on the glass reaches its running weight (about 9 uL)
   * after a few hits, not twenty -- streams at the rate of Ony's clips
   * (clip E: a stream a second per 300,000 px^2; F, the calm one, one per
   * 400,000) with the glass no more crowded than theirs.
   */
  { label: "Light rain", rate: 0.04, median: 0.6, droplets: 30, wind: 0, before: 0.04 },
  { label: "Steady rain", rate: 0.1, median: 1.2, droplets: 40, wind: 0, before: 0.1 },
  { label: "Downpour", rate: 0.3, median: 2.5, droplets: 35, wind: 0, before: 0.3 },
  { label: "Wind-driven rain", rate: 0.14, median: 1.2, droplets: 35, wind: 30, before: 0.14 },
  { label: "After the rain", rate: 0, median: 1.2, droplets: 0, wind: 0, before: 0.12 },
].map(calibrated);

/** The rain type a knob value names (rounded, clamped). */
export function rainType(value: number): RainType {
  const i = Math.min(RAIN_TYPES.length - 1, Math.max(0, Math.round(value)));
  return RAIN_TYPES[i]!;
}
