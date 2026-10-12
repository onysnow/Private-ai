import { blackbodyRgb } from "@fx/effects/light/blackbody";
import { t } from "@fx/lib/tuning";

/** The "Backlight" knob's 1, in the glass shader's light units (set by eye against the lamp). */
export const BACKLIT_GAIN = 0.6;

/** A hue at full saturation and value, as linear-ish RGB (0..1). */
export function hueRgb(degrees: number): [number, number, number] {
  const h = (((degrees % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] =
    h < 1
      ? [1, x, 0]
      : h < 2
        ? [x, 1, 0]
        : h < 3
          ? [0, 1, x]
          : h < 4
            ? [0, x, 1]
            : h < 5
              ? [x, 0, 1]
              : [1, 0, x];
  return [r, g, b];
}

/** The backlight's colour: its white from its temperature, toward its hue by its saturation. */
export function backlitColour(
  kelvin = t("backlightKelvin"),
  hue = t("backlightHue"),
  saturation = t("backlightSaturation"),
): [number, number, number] {
  const white = blackbodyRgb(kelvin);
  const tint = hueRgb(hue);
  const s = Math.min(Math.max(saturation, 0), 1);
  return [0, 1, 2].map((i) => white[i]! * (1 - s) + tint[i]! * s) as [number, number, number];
}
