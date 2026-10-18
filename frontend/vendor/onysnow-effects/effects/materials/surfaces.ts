/**
 * What the things resting on or marking the glass are made of, optically
 * (item 25a). The glass itself is in presets.ts; these are the surfaces:
 * type, the orange plastic, photographic prints, and the two kinds of grime.
 *
 * Only what the light needs is here. Today that is FLUORESCENCE: how much of
 * the ultraviolet a surface absorbs comes back as visible light, and in what
 * colour. Everything glows by this one rule (emitted = UV arriving x yield x
 * colour), so nothing on the page is special-cased for the black light.
 *
 * The numbers are relative, 0 (does not fluoresce) to 1 (fluoresces as
 * brightly as a day-glo pigment, the strongest thing on the page), set from
 * what the sources in claude/tools-research.md say glows and how much:
 *
 *   optical brighteners (in white paper, photo-paper bases, lint and dust)
 *     glow a strong blue-white;
 *   day-glo pigments glow intensely in their own colour;
 *   untreated finger grease and skin oil fluoresce "so weakly it is rarely
 *     useful" (HORIBA) -- forensics dusts prints with fluorescent powder;
 *   ordinary glass, scratches and printing ink barely fluoresce at all.
 */

import { t } from "@fx/lib/tuning";

export type Fluorescence = {
  /** Visible light given back per unit of UV absorbed, relative (0 to 1). */
  yield: number;
  /** The colour it glows, linear RGB, brightest channel 1. */
  colour: readonly [number, number, number];
};

export type SurfaceMaterial = {
  id: SurfaceMaterialId;
  fluorescence: Fluorescence;
};

export type SurfaceMaterialId =
  "ink" | "dayglo-orange" | "print-paper" | "grime-oil" | "grime-dust";

/** The blue-white of optical brighteners (stilbenes emit around 430-450 nm). */
export const BRIGHTENER_BLUE = [0.6, 0.74, 1.0] as const;

export const SURFACE_MATERIALS: Readonly<Record<SurfaceMaterialId, SurfaceMaterial>> = {
  /** Type: printing ink and the page's copy. Ink absorbs, it does not glow. */
  ink: { id: "ink", fluorescence: { yield: 0, colour: [1, 1, 1] } },
  /** The orange buttons: a fluorescent (day-glo) pigment, the brightest thing under UV. */
  "dayglo-orange": {
    id: "dayglo-orange",
    fluorescence: {
      get yield() {
        return t("uvDayglo");
      },
      colour: [1.0, 0.42, 0.1],
    },
  },
  /**
   * A photographic print's paper: its brighteners glow where the image is
   * thin (the highlights and borders), blue-white. Scaled by how white the
   * print is at the point by whoever draws it.
   */
  "print-paper": { id: "print-paper", fluorescence: { yield: 0.45, colour: BRIGHTENER_BLUE } },
  /** Finger grease and skin oil: barely there under UV. */
  "grime-oil": {
    id: "grime-oil",
    fluorescence: {
      get yield() {
        return t("uvGrease");
      },
      colour: [0.7, 0.8, 1.0],
    },
  },
  /** Dust and lint on the glass: fibres carrying laundry brighteners. */
  "grime-dust": {
    id: "grime-dust",
    fluorescence: {
      get yield() {
        return t("uvDust");
      },
      colour: BRIGHTENER_BLUE,
    },
  },
};

/** The attribute a surface names its material on. */
export const SURFACE_MATERIAL_ATTR = "data-surface-material";

/** A surface material by name; unknown or none is ink (does not glow). */
export function surfaceMaterial(id: string | null | undefined): SurfaceMaterial {
  return (id && SURFACE_MATERIALS[id as SurfaceMaterialId]) || SURFACE_MATERIALS.ink;
}
