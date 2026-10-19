import { PANE_THICKNESS } from "@fx/effects/optics/edge-side";
import { MATERIAL_ATTR, materialById, type Material } from "./presets";

/**
 * A pane's own causes, as its element carries them (optics plan step 2).
 *
 * <Pane> writes them onto the element; the pass that measures panes
 * (effects/scene/scene) reads them back here, once per measure, and every optical
 * pass takes them from that one reading. A pane that says nothing gets
 * today's glass: the frosted-float material, 18 px thick, the page's gap, and
 * the full surface layers -- so writing a pane with no props changes nothing.
 *
 * Edge width is read by effects/optics/edge-profile (readEdgeWidth), which
 * came first; it is the same pattern.
 */

export const THICKNESS_ATTR = "data-thickness";
export const GAP_ATTR = "data-gap";
export const SMUDGE_ATTR = "data-smudge";
export const SCRATCH_ATTR = "data-scratch";

export type PaneCauses = {
  /** What the glass is, with the site's settings folded in. */
  material: Material;
  /** The slab's thickness, CSS px. */
  thickness: number;
  /** How far behind the glass the photographs are, CSS px. */
  gap: number;
  /** How much of the smudge and scratch layers this pane wears, 0 to 1. */
  smudge: number;
  scratch: number;
};

/** What the page's settings say, for a pane that does not say otherwise. */
export type PaneDefaults = {
  /** The "Frost" setting: it edits the site's glass. */
  frost: number;
  /** The "Glass height" setting: the page's gap. */
  gap: number;
  /** The "Glass thickness" setting, for panes that do not name their own. */
  thickness?: number;
};

type Attributes = { getAttribute(name: string): string | null };

function number(el: Attributes, name: string, fallback: number, min: number, max: number): number {
  const raw = el.getAttribute(name);
  if (raw === null || raw === "") return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function readPaneCauses(el: Attributes, defaults: PaneDefaults): PaneCauses {
  const preset = materialById(el.getAttribute(MATERIAL_ATTR));
  return {
    /*
     * The site's Frost setting is the satin etch's depth: it edits a frosted
     * glass. A polished one (optical crown or flint, frost 0) has no etch for
     * it to deepen, and stays polished.
     */
    material: { ...preset, frost: preset.frost > 0 ? defaults.frost : 0 },
    thickness: number(el, THICKNESS_ATTR, defaults.thickness ?? PANE_THICKNESS, 1, 200),
    gap: number(el, GAP_ATTR, defaults.gap, 0, 2000),
    smudge: number(el, SMUDGE_ATTR, 1, 0, 1),
    scratch: number(el, SCRATCH_ATTR, 1, 0, 1),
  };
}
