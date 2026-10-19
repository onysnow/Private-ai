/**
 * How bright the lamp makes the photographs, against its defaults
 * (docs/research/shadows.md 3.3, 5.2 items 4-5, 6 Change 2): irradiance at
 * the floor goes as P / H^2, the inverse-square law
 * (https://en.wikipedia.org/wiki/Inverse-square_law). Taken against the
 * defaults (Core gain 8, Light height 300 px) so the default look is
 * unchanged; capped so a lamp brought right down cannot blow the page out.
 */
export const FLOOR_REF_GAIN = 8;
export const FLOOR_REF_HEIGHT = 300;
export const FLOOR_SCALE_MAX = 8;

export function floorScale(gain: number, height: number): number {
  const h = Math.max(height, 1);
  return Math.min(FLOOR_SCALE_MAX, (gain / FLOOR_REF_GAIN) * (FLOOR_REF_HEIGHT / h) ** 2);
}
