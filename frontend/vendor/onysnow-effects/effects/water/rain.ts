/**
 * Rain landing on a window (task 77): how big each drop is when it lands.
 *
 * Log-normal by volume, many small and a few large, as the reference
 * photographs show (water-drops.md 7.4 photos 3, 5: hundreds of tiny drops
 * for every large one). Median 0.45 uL (a contact diameter of about 1.6 mm
 * at 60/40) and a log spread of 1.15 are estimates (widened 2026-10-04: the sizes read too even), set so most drops stick
 * (water runs at 8.7 uL) until merging makes runners. Each rain type
 * (rain-types) has its own median. Capped at 12 uL: anything bigger runs at
 * once (Ony, 2026-10-01: "if the drop gets too big it's gonna drip").
 */
export const RAIN_MEDIAN_UL = 0.45;
export const RAIN_LOG_SPREAD = 1.15;

/** A landing drop's volume, uL, from two uniform numbers in [0, 1) (Box-Muller), round a median. */
export function rainVolume(u1: number, u2: number, median = RAIN_MEDIAN_UL): number {
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);
  return Math.min(12, median * Math.exp(RAIN_LOG_SPREAD * z));
}
