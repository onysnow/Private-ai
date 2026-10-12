/**
 * Stacks: panes resting on panes (light-engine architecture, step E).
 *
 * A stack is an element marked `data-stack` (written by <Stack>) whose
 * panes are its layers, in document order from the BOTTOM up: the first
 * rests on the photographs, each later one above it -- and, being later, it
 * also paints above it. What sits between two layers is the stack's
 * interface, a cause like the gap:
 *
 *   data-interface="air" data-interface-gap="12"   separate panes, 12 px apart
 *   data-interface="contact"                        resting on each other, dry
 *   data-interface="bonded"                         laminated: one pane
 *
 * From the layers and their causes this works out, for each layer, where it
 * stands (the height of its bottom face above the photographs) and what the
 * light reaching it has been through (the layers above it), using the stack
 * solver (effects/optics/stack). A pane that is not in a stack is a stack of
 * one, and everything below comes out as exactly 1 or exactly what it was,
 * so no single pane changes.
 */

import type { PaneCauses } from "@fx/effects/materials/pane-causes";
import {
  mean,
  slab,
  solveStack,
  type Interface,
  type RGB,
  type StackLayer,
} from "@fx/effects/optics/stack";

export const STACK_ATTR = "data-stack";
export const INTERFACE_ATTR = "data-interface";
export const INTERFACE_GAP_ATTR = "data-interface-gap";

export type StackPlacement = {
  /** Which layer, 0 = the bottom, and how many there are. */
  index: number;
  count: number;
  /** Height of this layer's bottom face above the photographs, CSS px. */
  zBottom: number;
  /** What sits between this layer and the one above it (null for the top). */
  above: Interface | null;
  /** And between this layer and the one below it (null for the bottom). */
  below: Interface | null;
  /** The share of the light arriving from above that reaches this layer, per colour. */
  lightIn: RGB;
  /**
   * Through the whole stack, relative to through this layer alone: what the
   * light reaching the photographs under a stack is, compared with under one
   * pane. Exactly 1 for a stack of one.
   */
  throughScale: RGB;
  /**
   * The whole stack's reflection, relative to this (top) layer's alone: the
   * extra images from the surfaces below. Exactly 1 for a stack of one, and
   * for every layer but the top.
   */
  reflectScale: RGB;
  /**
   * The layer above, where it stands on the page (CSS px) and its corner
   * radius, so the light through it can be thrown onto this one. Null for
   * the top layer and for a pane on its own. Filled in by the scene, which
   * measures the rects; placeStack leaves it null.
   */
  aboveRect: { x: number; y: number; w: number; h: number; r: number } | null;
  /**
   * The layer below, where it stands and what it is made of, for what
   * happens between the two faces that meet (a dry contact's air film,
   * effects/optics/thin-film). Null for the bottom layer and a pane on its own.
   */
  belowRect: { x: number; y: number; w: number; h: number; r: number } | null;
  belowMaterial: PaneCauses["material"] | null;
};

const ONE: RGB = [1, 1, 1];

/** A pane on its own. */
export const SINGLE: StackPlacement = {
  index: 0,
  count: 1,
  zBottom: Number.NaN, // filled from the pane's own gap
  above: null,
  below: null,
  lightIn: ONE,
  throughScale: ONE,
  reflectScale: ONE,
  aboveRect: null,
  belowRect: null,
  belowMaterial: null,
};

/** The interface a stack element declares (air with no gap if it says nothing). */
export function readInterface(el: { getAttribute(name: string): string | null }): Interface {
  const kind = el.getAttribute(INTERFACE_ATTR);
  if (kind === "bonded") return { kind: "bonded" };
  if (kind === "contact") return { kind: "contact" };
  const gap = Number.parseFloat(el.getAttribute(INTERFACE_GAP_ATTR) ?? "");
  return { kind: "air", gap: Number.isFinite(gap) ? Math.max(0, gap) : 0 };
}

const gapOf = (i: Interface) => (i.kind === "air" ? i.gap : 0);
const ratio = (a: RGB, b: RGB): RGB => [a[0] / b[0], a[1] / b[1], a[2] / b[2]];

/**
 * Where every layer of one stack stands and what light reaches it.
 * `layers` bottom first, each with its causes.
 */
export function placeStack(layers: readonly PaneCauses[], link: Interface): StackPlacement[] {
  const n = layers.length;
  const asLayer = (c: PaneCauses): StackLayer => ({ material: c.material, thickness: c.thickness });
  // Heights, from the bottom layer's own gap up.
  const z: number[] = [];
  let height = layers[0]!.gap;
  for (let i = 0; i < n; i++) {
    z.push(height);
    height += layers[i]!.thickness + gapOf(link);
  }
  // The solver wants the stack top first.
  const topFirst = [...layers].reverse().map(asLayer);
  const links = Array.from({ length: Math.max(0, n - 1) }, () => link);
  const whole = solveStack(topFirst, links);
  const top = slab(layers[n - 1]!.material, layers[n - 1]!.thickness);
  const bottom = slab(layers[0]!.material, layers[0]!.thickness);

  return layers.map((_, i) => {
    // Everything above layer i, top first.
    const aboveCount = n - 1 - i;
    const lightIn: RGB =
      aboveCount === 0
        ? ONE
        : solveStack(topFirst.slice(0, aboveCount), links.slice(0, aboveCount - 1)).T;
    return {
      index: i,
      count: n,
      zBottom: z[i]!,
      above: i < n - 1 ? link : null,
      below: i > 0 ? link : null,
      lightIn,
      // Only the bottom layer's shadow is drawn on the photographs; it carries the stack.
      throughScale: i === 0 && n > 1 ? ratio(whole.T, bottom.T) : ONE,
      reflectScale: i === n - 1 && n > 1 ? ratio(whole.Rf, top.Rf) : ONE,
      aboveRect: null,
      belowRect: null,
      belowMaterial: null,
    };
  });
}

/** One number for a colour ratio, for places that want brightness only. */
export const brightness = mean;
