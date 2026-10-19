import { POLISHED_ROUGHNESS, frostRoughness } from "@fx/effects/optics/reflection";
import { MGF2_QUARTER_WAVE, type Coating } from "@fx/effects/optics/coating";

/**
 * What the glass is made of, as data (optics plan step 2).
 *
 * A pane names its material (`<Pane material="frosted-float">`, carried on
 * the element as `data-material`), and every pass reads that one description,
 * so the light on the glass, through it and under it always agree. These are
 * CAUSES: change the material and every result changes with it.
 *
 * Only the preset the site uses is here. The clear-float, acrylic and water
 * presets and the admin picker arrive with step 10, when something can use
 * them; their values in the design doc still have entries to confirm.
 */
export type Material = {
  /** The name a pane uses to pick it. */
  id: MaterialId;
  /** Index of refraction. */
  ior: number;
  /** Abbe number: how little the index changes with colour. */
  abbe: number;
  /**
   * How frosted the frosted face is, 0 (polished) to 1 (acid-etched). The
   * "Frost" setting edits it on the site's glass.
   */
  frost: number;
  /**
   * Which face carries the frost. Satin (acid-etched) glass is frosted on one
   * side; with the frost on the BACK, what you see through it is diffused
   * while the front face stays polished and reflects the room sharply.
   */
  frostedFace: "front" | "back";
  /**
   * Beer-Lambert absorption per unit of path, red / green / blue: the colour
   * of a long path through it (its side faces). Measured for soda-lime float
   * glass from Ony's reference photographs; see effects/optics/edge-side.ts.
   */
  absorb: readonly [number, number, number];
  /**
   * The share of near ultraviolet (UV-A, a black light's 365 nm) that gets
   * through the pane. Soda-lime glass blocks nearly everything below 300 nm
   * and passes about 70-75% of UV-A (claude/tools-research.md), so what is
   * under a pane still fluoresces under a black light, somewhat less.
   */
  uvTransmit: number;
  /** An anti-reflection coating on its faces, if it has one (effects/optics/coating). */
  coating?: Coating;
  /** Volume scattering per px of path at 550 nm, if it scatters (opal glass; effects/optics/scatter). */
  scatter?: number;
};

export type MaterialId = "frosted-float" | "optical-crown" | "dense-flint" | "museum" | "opal";

/**
 * Soda-lime float glass, satin-etched on the back: today's panes.
 *
 * n = 1.518 and Abbe number about 60 (dispersion 0.00867), from the glass
 * properties table cited in the design doc. Reflectance straight on,
 * ((n - 1) / (n + 1))^2, is 4.2%. Frost 0.6 is the value the panes have
 * always had.
 */
export const FROSTED_FLOAT: Material = {
  id: "frosted-float",
  ior: 1.518,
  abbe: 60,
  frost: 0.6,
  frostedFace: "back",
  absorb: [2.7, 0.9, 1.2],
  uvTransmit: 0.72,
};

/**
 * Optical crown glass, polished all over: what a glass paperweight, a
 * lens or a demonstration prism is made of (item 25g). The numbers are
 * Schott N-BK7's catalogue values, n_d = 1.5168 and V_d = 64.17. Clear:
 * made from iron-free sand, it takes almost nothing out along a path.
 */
export const OPTICAL_CROWN: Material = {
  id: "optical-crown",
  ior: 1.5168,
  abbe: 64.17,
  frost: 0,
  frostedFace: "back",
  absorb: [0.06, 0.04, 0.05],
  uvTransmit: 0.9,
};

/**
 * Dense flint glass: heavy with lead or titanium, so it bends light more
 * and spreads the colours about twice as far as crown -- the glass a
 * prism is cut from to throw a vivid spectrum. Schott SF10's catalogue
 * values, n_d = 1.72825 and V_d = 28.41; faintly yellow, so it takes a
 * little blue.
 */
export const DENSE_FLINT: Material = {
  id: "dense-flint",
  ior: 1.72825,
  abbe: 28.41,
  frost: 0,
  frostedFace: "back",
  absorb: [0.05, 0.06, 0.2],
  uvTransmit: 0.4,
};

/**
 * Museum glass (catalogue item 32c): the clear, anti-reflective glass a
 * photograph is framed behind in a gallery. Low-iron float glass, polished,
 * each face coated with a quarter wave of magnesium fluoride (the
 * reflection falls from 4.2% to about 1.3% a face, leaving a faint purple
 * sheen), and a UV-filtering layer that takes about 99% of UV-A, to keep
 * the print from fading.
 */
export const MUSEUM_GLASS: Material = {
  id: "museum",
  ior: 1.518,
  abbe: 60,
  frost: 0,
  frostedFace: "back",
  absorb: [0.3, 0.12, 0.18],
  uvTransmit: 0.01,
  coating: MGF2_QUARTER_WAVE,
};

/**
 * Opal glass (catalogue item 32d): glass seeded with particles far smaller
 * than a wavelength, which scatter blue most (Rayleigh). Polished; lit, it
 * glows a faint blue and what comes through lands warm. About 1.1 of its
 * green light is scattered across 18 px (a third gets straight through).
 */
export const OPAL_GLASS: Material = {
  id: "opal",
  ior: 1.52,
  abbe: 58,
  frost: 0,
  frostedFace: "back",
  absorb: [0.4, 0.3, 0.3],
  uvTransmit: 0.5,
  scatter: 0.06,
};

export const MATERIALS: Readonly<Record<MaterialId, Material>> = {
  "frosted-float": FROSTED_FLOAT,
  "optical-crown": OPTICAL_CROWN,
  "dense-flint": DENSE_FLINT,
  museum: MUSEUM_GLASS,
  opal: OPAL_GLASS,
};

export const DEFAULT_MATERIAL: MaterialId = "frosted-float";

/** The attribute a pane carries its material on. */
export const MATERIAL_ATTR = "data-material";

/** A material by name; an unknown name is the default rather than an error. */
export function materialById(id: string | null | undefined): Material {
  return (id && MATERIALS[id as MaterialId]) || MATERIALS[DEFAULT_MATERIAL];
}

/** The old name, kept so existing imports read the same glass. */
export const FLOAT_GLASS = FROSTED_FLOAT;

/** GGX roughness of the face the viewer looks at, from where the frost is. */
export function frontRoughness(material: Pick<Material, "frostedFace">, frost: number): number {
  return material.frostedFace === "front" ? frostRoughness(frost) : POLISHED_ROUGHNESS;
}
