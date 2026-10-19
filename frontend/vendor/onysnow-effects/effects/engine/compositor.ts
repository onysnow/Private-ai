/**
 * The compositor: every layer a pane has, and their order (optics plan step 4).
 *
 * A pane is a stack. Under what rests on it (the copy, the photographs, the
 * buttons) sit the layers the effects draw into, and their order is optics,
 * not styling: the light under the glass has to be under the light on it; the
 * liquid render has to be under both, or it buries them -- which it did once,
 * when the order lived in scattered z-index rules and a library's inline
 * style won (styles.css, "That is why liquid mode had 'hardly any' edge
 * bloom"). And the layers were inserted by three different pieces of code,
 * each putting its canvas first in the pane, so the DOM order depended on
 * which effect happened to start first.
 *
 * Now the order is this one list, bottom to top, and this module writes each
 * layer's z-index from its place in it and inserts it where it belongs. No
 * effect inserts its own layer; it asks for its slot.
 *
 * The pane's side faces are not in the list: they sit OUTSIDE the pane, above
 * it, because only a sibling can multiply what is behind it (.glass-side).
 * Their z-index is SIDE_LAYER_Z, also written from here.
 */

export const PANE_LAYERS = [
  /** Bright points behind the glass, thrown out of focus into discs. */
  "pane:bokeh",
  /**
   * The rain falling outside, behind the glass (effects/water/rainfall):
   * faint out-of-focus streaks, slanting with the wind, under everything
   * the glass itself does.
   */
  "pane:rainfall",
  /** The bevel's refraction (CSS glass). */
  "pane:refraction",
  /** The liquid glass library's render, when liquid glass is on. */
  "pane:liquid",
  /**
   * A broken pane's view through its pieces (BrokenGlass, item 10, with
   * ?try=shardlight): the glass itself, so under every light on it.
   */
  "pane:broken",
  /** The glare the shutter flash sweeps across the face. */
  "pane:glare",
  /** The light arriving UNDER the glass, on the photographs (FloorLight). */
  "pane:under",
  /** The light on the glass and the grime it rakes (GlassLight). */
  "pane:surface",
  /**
   * Water drops (WaterDrops, task 77, ?try=drops): each drop a lens showing
   * the scene sharp through the frost, with its own reflections. OVER the
   * light on the glass: where the etched face is wet it is clear, so it
   * no longer scatters a lamp's light into the milky glow the dry frost
   * shows -- a wet spot stays dark and clear in a lit pane (it washed the
   * drops out when it lay under that glow). The front face's own
   * reflection over a drop the water layer draws itself.
   */
  "pane:water",
] as const;

export type PaneLayer = (typeof PANE_LAYERS)[number];

/** What stands on the glass is the pane's own content, above every layer. */
export const PANE_CONTENT = "pane:content";

/** The side faces, siblings above the pane (see .glass-side). */
export const SIDE_LAYER_Z = 2;

/**
 * The lit edge and its bloom, a sibling above the side faces (see
 * .glass-glow): the light a lit arris throws is in front of the side, not
 * absorbed by it.
 */
export const GLOW_LAYER_Z = SIDE_LAYER_Z + 1;

/** How far outside a pane its light layers reach: the bloom escapes the glass. */
export const LIGHT_BLEED = 90;

/** The attribute that names a layer's slot. */
export const LAYER_ATTR = "data-layer";

/** The class each layer carries, for the stylesheet's own rules. */
export const LAYER_CLASS: Readonly<Record<PaneLayer, string>> = {
  "pane:bokeh": "glass__bokeh",
  "pane:rainfall": "glass__rainfall",
  "pane:refraction": "glass__refract",
  "pane:liquid": "glass__liquid",
  "pane:broken": "glass__broken",
  "pane:water": "glass__water",
  "pane:glare": "glass__glare",
  "pane:under": "glass__under",
  "pane:surface": "glass__surface",
};

/** A layer's z-index: the topmost is -1, and each one down is one lower. */
export function layerZ(layer: PaneLayer): number {
  return PANE_LAYERS.indexOf(layer) - PANE_LAYERS.length;
}

/** Props for a layer React renders itself (the bokeh, the refraction, the glare). */
export function layerProps(layer: PaneLayer) {
  return {
    [LAYER_ATTR]: layer,
    className: LAYER_CLASS[layer],
    style: { zIndex: layerZ(layer) },
    "aria-hidden": true as const,
  };
}

function slotOf(el: Element): number {
  const name = el.getAttribute(LAYER_ATTR);
  const i = name ? PANE_LAYERS.indexOf(name as PaneLayer) : -1;
  // Anything that is not a layer is content, and goes above them all.
  return i < 0 ? PANE_LAYERS.length : i;
}

/** Put a layer element in its place among the pane's children. */
function place(pane: HTMLElement, el: HTMLElement, layer: PaneLayer) {
  const mine = PANE_LAYERS.indexOf(layer);
  let before: Element | null = null;
  for (const child of pane.children) {
    if (child !== el && slotOf(child) > mine) {
      before = child;
      break;
    }
  }
  if (el.parentElement !== pane || el.nextElementSibling !== before) {
    pane.insertBefore(el, before);
  }
}

/**
 * The element in a pane's `layer` slot: the one already there, or a new one
 * (a canvas unless `create` says otherwise), put in its place with its
 * z-index written.
 */
export function paneLayer<T extends HTMLElement = HTMLCanvasElement>(
  pane: HTMLElement,
  layer: PaneLayer,
  create: () => T = () => document.createElement("canvas") as unknown as T,
): T {
  const existing = pane.querySelector<T>(`:scope > [${LAYER_ATTR}="${layer}"]`);
  if (existing) return existing;
  const el = create();
  el.setAttribute(LAYER_ATTR, layer);
  el.setAttribute("aria-hidden", "true");
  el.classList.add(LAYER_CLASS[layer]);
  el.style.zIndex = String(layerZ(layer));
  place(pane, el, layer);
  return el;
}

/** A canvas layer: the pane's `layer` slot, made a canvas if it is new. */
export function paneCanvas(pane: HTMLElement, layer: PaneLayer): HTMLCanvasElement {
  return paneLayer<HTMLCanvasElement>(pane, layer, () => document.createElement("canvas"));
}

/**
 * Take an element something else made -- the liquid glass library inserts
 * its own canvas and writes its own z-index inline -- into a slot. Its
 * z-index is written with priority, so the library's cannot win.
 */
export function adoptLayer(pane: HTMLElement, layer: PaneLayer, el: HTMLElement) {
  el.setAttribute(LAYER_ATTR, layer);
  el.classList.add(LAYER_CLASS[layer]);
  el.style.setProperty("z-index", String(layerZ(layer)), "important");
  place(pane, el, layer);
}

/** The pane's layers, bottom to top, as the browser will paint them. */
export function paneLayerOrder(pane: HTMLElement): string[] {
  return [...pane.children]
    .filter((c) => c.hasAttribute(LAYER_ATTR))
    .map((c) => ({
      name: c.getAttribute(LAYER_ATTR)!,
      z: Number.parseInt(getComputedStyle(c).zIndex, 10),
    }))
    .sort((a, b) => a.z - b.z)
    .map((c) => c.name);
}
