/**
 * The scene: every pane of glass and every surface resting on it, measured
 * once a frame (optics plan step 3; replaces lib/edge-glow.ts).
 *
 * WHAT IT DOES, IN ORDER, EACH FRAME
 *
 *   1. commit    the lights' pending positions (effects/light/lights.ts)
 *   2. read      every rect, offset and backdrop box the frame needs -- all of
 *                them, before anything is written
 *   3. compute   the viewpoint and what each surface's shadow blocks, from the
 *                readings and the lights; no DOM at all
 *   4. write     the CSS custom properties and the side-face layers
 *
 * and passes (GlassLight, FloorLight) read the frozen snapshot of step 2
 * through glassGeometry().
 *
 * WHY THE ORDER IS THE WHOLE POINT
 *
 * Writing a style and then reading layout makes the browser resolve every
 * style on the page before it can answer. The page has 19 backdrop-filters and
 * dozens of blend modes, so each of those costs a lot. The old pass read and
 * wrote interleaved -- side-face offsets were read in the middle of each pane's
 * writes, and a lit surface's corner radius in the middle of its own -- and a
 * pointer move cost about ten style recalculations a frame. Reading
 * everything first costs one; the writes afterwards dirty style once, for the
 * next frame to resolve in its own time. e2e/scene.spec.ts holds it there.
 *
 * No React here; components register elements and the engine does the rest.
 */
import { irradianceFalloff } from "@fx/effects/optics/transmission";
import {
  SURFACE_MATERIALS,
  type SurfaceMaterial,
  type SurfaceMaterialId,
} from "@fx/effects/materials/surfaces";
import { onTuningApplied, t } from "@fx/lib/tuning";
import { GLOW_LAYER_Z, LIGHT_BLEED, SIDE_LAYER_Z } from "@fx/effects/engine/compositor";
import { castShadow as castByModel, isotropicBlur } from "@fx/effects/optics/shadow";
import { previewing } from "@fx/effects/engine/preview";
import { readEdgeWidth } from "@fx/effects/optics/edge-profile";
import { behindGlassShift, eyeOffset, oversizeFor } from "@fx/effects/optics/viewpoint";
import { camera } from "@fx/effects/camera/camera";
import { paneFaces, type PaneFaces } from "@fx/effects/optics/edge-side";
import { readPaneCauses, type PaneCauses } from "@fx/effects/materials/pane-causes";
import {
  placeStack,
  readInterface,
  SINGLE,
  STACK_ATTR,
  type StackPlacement,
} from "@fx/effects/scene/graph";
import { commitLights, cursorLamp, movePointer, onLightChange } from "@fx/effects/light/lights";
import { addTask, ORDER } from "@fx/effects/engine/scheduler";
import {
  type SurfaceLight,
  writeLightView,
  writePaneLight,
  writeSurfaceLight,
} from "@fx/effects/adapters/css-vars";

/* ======================================================================
 * What the passes read
 * ====================================================================== */

/**
 * Where the viewer's eye is (relative to the viewport's middle) and how far
 * that moves what is behind the glass. See effects/optics/viewpoint.ts.
 */
export const viewState = { eyeX: 0, eyeY: 0, shiftX: 0, shiftY: 0 };

export const MAX_OCCLUDERS = 6;

export const MAX_PLASTIC = 4;

/**
 * A sheet of plastic resting on a pane (the orange buttons), for the glass
 * light pass to light (item 18b, ?try=shaderplastic). Pane-local pixels: its
 * face, and where the light it lets through lands -- its cast by the one
 * shadow model, from its own standoff, exactly as its CSS glow was placed.
 */
export type Plastic = {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  radius: number;
  /** The cast: where the light through it lands, relative to the face. */
  landX: number;
  landY: number;
  /** How much bigger than the face the landing is (the model's growth). */
  landScale: number;
  /** How soft the landing is, CSS px. */
  blur: number;
};

/** Something standing on a pane, as the shape of the shadow it throws on it. */
export type Occluder = {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  radius: number;
  blur: number;
  alpha: number;
  /**
   * The direction from the lamp to the shadow and the cosine of the light's
   * slant there: the penumbra stretches along that direction by 1 / cos
   * (effects/optics/shadow). 0, 0 and 1 give an even penumbra of `blur`.
   */
  dirX: number;
  dirY: number;
  cosTheta: number;
};

/** A pane of glass, as measured this frame. */
export type GlassRect = {
  /** The element, so a pass can reach the pane's own surface layer. */
  el: HTMLElement;
  /** Top-left corner and size, in CSS pixels, viewport-relative. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, in CSS pixels. */
  r: number;
  /** How wide this pane's rounded-over edge is, CSS px: its data-edge-width or the knob. */
  e: number;
  /**
   * The photograph behind this pane (the one above, for a band on a seam),
   * and where it is drawn: refraction samples it from somewhere else, so it
   * is bound as a texture.
   */
  src: string;
  /**
   * The same photograph at the size the page shows it: the water's drops
   * image it sharp, and the smallest variant (src) is too soft for that.
   */
  srcFull: string;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  /** Intrinsic aspect, for the object-fit: cover mapping. */
  ia: number;
  /** Its object-position, 0..1 each way: the focal point it is framed on. */
  ifocus: Focus;
  /** The box the photograph shows in: its section, which clips it. */
  ibox: Box;
  /** The photograph BELOW the pane, which its bottom side face reflects. */
  below: {
    src: string;
    x: number;
    y: number;
    w: number;
    h: number;
    a: number;
    focus: Focus;
    box: Box;
  } | null;
  /** What this pane is, as <Pane> declared it (effects/materials/pane-causes). */
  causes: PaneCauses;
  /**
   * What is standing on this pane, as shadow shapes in pane-local pixels,
   * already displaced by each one's cast vector: where the shadows LAND.
   */
  occ: readonly Occluder[];
  /** Which surface this pane wears, 0-3, kept for the element's life. */
  s: number;
  /**
   * Where this pane stands in its stack and what light reaches it
   * (effects/scene/graph). A pane on its own is a stack of one, and every
   * factor in here is then exactly 1.
   */
  stack: StackPlacement;
  /** How wide each of its side faces shows, CSS px (edge-side paneFaces). */
  faces: PaneFaces;
  /** The plastic resting on it (at most MAX_PLASTIC). */
  plastic: readonly Plastic[];
};

/* ======================================================================
 * Registries
 * ====================================================================== */

const panes = new Set<HTMLElement>();

/**
 * Surfaces that want to know where the light is standing on them: the
 * photographs and copy resting ON the glass, and the plastic buttons.
 */
const litSurfaces = new Set<HTMLElement>();
const nonOccluding = new WeakSet<HTMLElement>();
/** How far each surface stands off the glass, as a share of "Content depth" (1 if unset). */
const standoffs = new WeakMap<HTMLElement, number>();
/** What each surface is made of, optically (ink if unset). */
const surfaceMaterials = new WeakMap<HTMLElement, SurfaceMaterial>();

/** Each pane's side faces, siblings of it (see .glass-side). */
type SideLayers = {
  top: HTMLElement;
  bottom: HTMLElement;
  /** Its left and right sides, where the pane has visible left and right edges. */
  left: HTMLElement | null;
  right: HTMLElement | null;
  /** The lit edge's layer, above the sides (optional; see .glass-glow). */
  glow: HTMLElement | null;
  /** Whether the pane is position: fixed; asked once, in a frame's read phase. */
  fixed: boolean | null;
  last: string;
};
const sideLayers = new WeakMap<HTMLElement, SideLayers>();

/** How far outside a panel the cursor can be and still count as near it. */
const REACH = 320;

/* ======================================================================
 * Things read once and kept
 * ====================================================================== */

/*
 * Corner radii do not change as the page scrolls, and getComputedStyle is the
 * expensive half of reading them. Cleared on resize (a breakpoint can change
 * them) and when a pane registers.
 */
const radii = new WeakMap<HTMLElement, number>();

function cornerRadius(el: HTMLElement) {
  const known = radii.get(el);
  if (known !== undefined) return known;
  const raw = getComputedStyle(el).borderTopLeftRadius;
  const value = Number.parseFloat(raw);
  const px = Number.isFinite(value) && !raw.includes("%") ? value : 0;
  radii.set(el, px);
  return px;
}

const seeds = new WeakMap<HTMLElement, number>();
let nextSeed = 0;

/** Which surface (0-3) a pane wears: its grime and its ripples, kept for the element's life. */
export function surfaceSeed(el: HTMLElement) {
  let seed = seeds.get(el);
  if (seed === undefined) {
    seed = nextSeed % 4;
    nextSeed += 1;
    seeds.set(el, seed);
  }
  return seed;
}

/**
 * The smallest rendition of a photograph, for use as a refraction texture.
 *
 * The texture is a second fetch (a texture needs CORS, the page's <img> is
 * requested without), and it is only ever sampled inside a bevel a few dozen
 * pixels deep or squeezed into a side face, so the smallest stored variant
 * carries more detail than the effect can show.
 */
function smallestVariant(img: HTMLImageElement): string {
  const set = img.getAttribute("srcset");
  if (!set) return img.currentSrc || img.src;
  let best = "";
  let bestWidth = Infinity;
  for (const entry of set.split(",")) {
    const [url, descriptor] = entry.trim().split(/\s+/);
    const width = Number.parseInt(descriptor ?? "", 10);
    if (url && Number.isFinite(width) && width < bestWidth) {
      bestWidth = width;
      best = url;
    }
  }
  return best || img.currentSrc || img.src;
}

/**
 * The photograph a pane is sitting on: the nearest photographic scene's.
 *
 * A seam band has no photograph of its own -- the ones above and below carry
 * on under it (see PhotoSection). The face and the top side take the one
 * above, falling back to the one below; the bottom side takes the one below,
 * which is what it faces.
 */
function backdropOf(el: HTMLElement, side: "above" | "below"): HTMLImageElement | null {
  let scene = el.closest("[data-photo]");
  if (!scene) return null;
  if (scene.hasAttribute("data-seam")) {
    const up = scene.previousElementSibling;
    const down = scene.nextElementSibling;
    const [first, second] = side === "above" ? [up, down] : [down, up];
    scene = first?.hasAttribute("data-photo")
      ? first
      : second?.hasAttribute("data-photo")
        ? second
        : null;
    if (!scene) return null;
  }
  const images = scene.querySelectorAll<HTMLImageElement>("img[src]");
  for (let i = images.length - 1; i >= 0; i -= 1) {
    const img = images[i];
    /*
     * Skip the blurred placeholder, which is an inline data URI, and any
     * photograph standing ON the pane (a card on the Lab samples pane): it
     * is in front of the glass, not behind it. Taking the last image in the
     * scene picked the card, so the pane refracted -- and its rain drops
     * imaged -- a photograph that was not behind it.
     */
    if (img && !img.src.startsWith("data:") && img.naturalWidth > 0 && !el.contains(img))
      return img;
  }
  return null;
}

/* ======================================================================
 * Per-pane causes
 * ====================================================================== */

/** How wide a pane's edge is: its own data-edge-width, else the "Edge width" knob. */
export function paneEdgeWidth(el: HTMLElement): number {
  return readEdgeWidth(el, t("edgeWidth"));
}

/** A pane's causes, with the page's settings for whatever it does not say. */
export function paneCauses(el: HTMLElement): PaneCauses {
  return readPaneCauses(el, {
    frost: t("glassBlur"),
    gap: t("floorGap"),
    thickness: t("glassThickness"),
  });
}

/**
 * Where the eye is, in viewport CSS px: the middle of the view, moved toward
 * the pointer by the camera's follow (effects/optics/viewpoint) -- the same
 * eye the photographs' parallax and the reflections use.
 */
function eyeAt(viewportWidth: number, viewportHeight: number) {
  const e = eyeOffset(cursorLamp.x, cursorLamp.y, viewportWidth, viewportHeight, camera.follow);
  return { x: viewportWidth / 2 + e.x, y: viewportHeight / 2 + e.y };
}

/**
 * Which of a pane's side faces show, and how wide, whole CSS px
 * (effects/optics/edge-side paneFaces): only from their own side of the
 * edge, so never the top and bottom at once, and wider the further the edge
 * is past the eye.
 */
function facesAt(
  el: HTMLElement,
  r: DOMRect,
  thickness: number,
  viewportWidth: number,
  viewportHeight: number,
): PaneFaces {
  return paneFaces(
    r,
    eyeAt(viewportWidth, viewportHeight),
    camera.distance(viewportWidth),
    el.classList.contains("glass--bar"),
    thickness,
    r.width >= viewportWidth - 1,
  );
}

/** How wide each of a pane's side faces shows right now, whole CSS pixels. */
export function paneSideHeights(
  el: HTMLElement,
  r: DOMRect = el.getBoundingClientRect(),
): PaneFaces {
  const root = document.documentElement;
  return facesAt(
    el,
    r,
    paneCauses(el).thickness,
    root.clientWidth || window.innerWidth,
    root.clientHeight || window.innerHeight,
  );
}

/* ======================================================================
 * 2. Read
 * ====================================================================== */

/** A photograph, where it is drawn, and the box it shows in (its section, which clips it). */
/** A rectangle on the page, CSS px. */
type Box = { x: number; y: number; w: number; h: number };

type ImageReading = { img: HTMLImageElement; rect: DOMRect; box: DOMRect };

type PaneReading = {
  el: HTMLElement;
  rect: DOMRect;
  radius: number;
  causes: PaneCauses;
  /** Offset-parent box, for placing the side faces; null for none / fixed panes. */
  offset: { x: number; y: number; w: number; h: number } | null;
  above: ImageReading | null;
  below: ImageReading | null;
};

type SurfaceReading = {
  el: HTMLElement;
  rect: DOMRect;
  radius: number;
  /** The pane it stands on, if it blocks light; null if it does not. */
  pane: HTMLElement | null;
  /** How far it stands off the glass, as a share of "Content depth". */
  standoff: number;
  /** What it is made of, optically (effects/materials/surfaces). */
  material: SurfaceMaterial;
};

type SceneReading = {
  panes: PaneReading[];
  surfaces: SurfaceReading[];
  viewportWidth: number;
  /** The viewport's client height (the view's frame). */
  viewportHeight: number;
  /** window.innerHeight: what a pane's tilt is measured against. */
  innerHeight: number;
};

function readImage(img: HTMLImageElement | null): ImageReading | null {
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  return { img, rect, box: img.closest("[data-photo]")?.getBoundingClientRect() ?? rect };
}

function readPane(el: HTMLElement, withOffsets = true): PaneReading {
  const layers = withOffsets ? sideLayers.get(el) : undefined;
  if (layers && layers.fixed === null) {
    const cs = getComputedStyle(el);
    layers.fixed = cs.position === "fixed";
    /*
     * A pane with a z-index of its own (the fixed header, z-40) lifts its
     * sides and its lit edge with it: they are siblings, and at their plain
     * slots (2, 3) they sat UNDER the header, so its lit edge and bloom were
     * seen through its own glass -- a backlight, not a lit edge (Ony,
     * 2026-09-29: "the bloom is still not showing up on top of the header
     * and instead is backlighting").
     */
    const z = Number.parseInt(cs.zIndex, 10);
    if (Number.isFinite(z) && z > 0) {
      layers.top.style.zIndex = String(z + SIDE_LAYER_Z);
      layers.bottom.style.zIndex = String(z + SIDE_LAYER_Z);
      if (layers.left) layers.left.style.zIndex = String(z + SIDE_LAYER_Z);
      if (layers.right) layers.right.style.zIndex = String(z + SIDE_LAYER_Z);
      if (layers.glow) layers.glow.style.zIndex = String(z + GLOW_LAYER_Z);
    }
  }
  return {
    el,
    rect: el.getBoundingClientRect(),
    radius: cornerRadius(el),
    causes: paneCauses(el),
    offset:
      layers && !layers.fixed
        ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
        : null,
    above: readImage(backdropOf(el, "above")),
    below: readImage(backdropOf(el, "below")),
  };
}

/**
 * How far a surface stands off what it rests on, as a share of "Content
 * depth". Type is printed on the glass itself when "Type on the glass" is
 * set (Ony, 2026-10-02: "directly on the glass ... just the one [shadow]
 * under the glass"): then its standoff is 0, and the only shadow it throws
 * is the lamp's through the glass onto the photograph.
 */
function standoffOf(el: HTMLElement): number {
  const material = surfaceMaterials.get(el) ?? SURFACE_MATERIALS.ink;
  if (material.id === "ink" && standoffs.has(el) && t("typeOnGlass") > 0.5) return 0;
  return standoffs.get(el) ?? 1;
}

function readSurface(el: HTMLElement): SurfaceReading {
  return {
    el,
    rect: el.getBoundingClientRect(),
    radius: cornerRadius(el),
    pane: nonOccluding.has(el) ? null : el.closest<HTMLElement>(".glass"),
    standoff: standoffOf(el),
    material: surfaceMaterials.get(el) ?? SURFACE_MATERIALS.ink,
  };
}

/**
 * Every layout read the frame needs, and nothing else. The surfaces are only
 * needed by the frame's own writes, so a snapshot taken for a pass skips them.
 */
function readScene(withSurfaces = true): SceneReading {
  const root = document.documentElement;
  return {
    panes: [...panes].map((el) => readPane(el, withSurfaces)),
    surfaces: withSurfaces ? [...litSurfaces].map(readSurface) : [],
    viewportWidth: root.clientWidth || window.innerWidth,
    viewportHeight: root.clientHeight || window.innerHeight,
    innerHeight: window.innerHeight,
  };
}

/* ======================================================================
 * The snapshot the passes read
 * ====================================================================== */

let snapshot: GlassRect[] = [];
let snapshotAt = -1;
let snapshotVersion = -1;
/*
 * How long a snapshot may stand in for a fresh reading. Panes only move on
 * scroll, resize and registration (all of which invalidate it) and the
 * backdrops only when the eye moves (which runs a scene frame and replaces
 * it), so this is a safety net for layout shifts nothing announces -- an
 * image loading above a pane, a font arriving.
 */
const SNAPSHOT_MAX_AGE = 120;
/** What is standing on each pane, from the last frame's light. */
let occlusion = new Map<HTMLElement, Occluder[]>();
const EMPTY_OCCLUDERS: readonly Occluder[] = [];
let plastics = new Map<HTMLElement, Plastic[]>();
const EMPTY_PLASTIC: readonly Plastic[] = [];

/**
 * Bumped whenever the geometry is invalidated -- scroll, resize, a pane
 * registering or leaving. The light pass uses it to know whether its resting
 * frame is still valid.
 */
let version = 0;

export function geometryStamp(): number {
  return version;
}

function invalidate() {
  snapshotAt = -1;
  version += 1;
}

/** A photograph's framing point, 0..1 each way from its top-left. */
export type Focus = { x: number; y: number };
const CENTRED: Focus = { x: 0.5, y: 0.5 };

/**
 * Where a photograph is framed: its inline object-position, which is where a
 * chosen focal point is put (components/site/Img `focus`). Read off the
 * element's own style, not the computed one, so it costs nothing per frame;
 * a picture framed only by a stylesheet class reads as centred, and those are
 * phone-only, where the glass is not drawn.
 */
export function focusOf(img: HTMLImageElement): Focus {
  const parts = img.style.objectPosition.trim().split(/\s+/);
  const at = (v: string | undefined) => {
    if (!v?.endsWith("%")) return 0.5;
    const n = Number.parseFloat(v) / 100;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
  };
  return parts[0] ? { x: at(parts[0]), y: at(parts[1] ?? parts[0]) } : CENTRED;
}

function imageFields(reading: ImageReading | null) {
  if (!reading) return null;
  const { img, rect, box } = reading;
  return {
    src: smallestVariant(img),
    full: img.currentSrc || img.src,
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h: rect.height,
    a: img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1,
    focus: focusOf(img),
    box: { x: box.left, y: box.top, w: box.width, h: box.height },
  };
}

/**
 * Each stacked pane's placement, and its causes as the stack makes them: a
 * layer's gap is the height of its bottom face above the photographs, and a
 * bonded run is one pane as thick as all of it (drawn by its top layer).
 */
function stacksOf(
  reading: SceneReading,
): Map<HTMLElement, { stack: StackPlacement; causes: PaneCauses }> {
  const out = new Map<HTMLElement, { stack: StackPlacement; causes: PaneCauses }>();
  const byStack = new Map<Element, PaneReading[]>();
  for (const p of reading.panes) {
    const host = p.el.parentElement?.closest(`[${STACK_ATTR}]`);
    if (!host) continue;
    const list = byStack.get(host) ?? [];
    list.push(p);
    byStack.set(host, list);
  }
  for (const [host, panes] of byStack) {
    // Document order is bottom first.
    panes.sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const link = readInterface(host);
    const placed = placeStack(
      panes.map((p) => p.causes),
      link,
    );
    panes.forEach((p, i) => {
      const up = panes[i + 1];
      const down = i > 0 ? panes[i - 1] : undefined;
      const stack = {
        ...placed[i]!,
        aboveRect: up
          ? { x: up.rect.left, y: up.rect.top, w: up.rect.width, h: up.rect.height, r: up.radius }
          : null,
        belowRect: down
          ? {
              x: down.rect.left,
              y: down.rect.top,
              w: down.rect.width,
              h: down.rect.height,
              r: down.radius,
            }
          : null,
        belowMaterial: down ? down.causes.material : null,
      };
      let thickness = p.causes.thickness;
      if (link.kind === "bonded" && i === panes.length - 1) {
        thickness = panes.reduce((sum, q) => sum + q.causes.thickness, 0);
      }
      const zBottom = link.kind === "bonded" ? placed[0]!.zBottom : stack.zBottom;
      out.set(p.el, { stack, causes: { ...p.causes, gap: zBottom, thickness } });
    });
  }
  return out;
}

function freeze(reading: SceneReading): GlassRect[] {
  const out: GlassRect[] = [];
  const stacked = stacksOf(reading);
  for (const p of reading.panes) {
    const r = p.rect;
    if (r.width <= 0 || r.height <= 0) continue;
    const above = imageFields(p.above);
    out.push({
      el: p.el,
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      r: p.radius,
      e: paneEdgeWidth(p.el),
      faces: facesAt(p.el, r, p.causes.thickness, reading.viewportWidth, reading.viewportHeight),
      s: surfaceSeed(p.el),
      src: above?.src ?? "",
      srcFull: above?.full ?? "",
      ix: above?.x ?? 0,
      iy: above?.y ?? 0,
      iw: above?.w ?? 1,
      ih: above?.h ?? 1,
      ia: above?.a ?? 1,
      ifocus: above?.focus ?? CENTRED,
      ibox: above?.box ?? { x: 0, y: 0, w: 0, h: 0 },
      below: imageFields(p.below),
      causes: stacked.get(p.el)?.causes ?? p.causes,
      stack: stacked.get(p.el)?.stack ?? { ...SINGLE, zBottom: p.causes.gap },
      occ: occlusion.get(p.el) ?? EMPTY_OCCLUDERS,
      plastic: plastics.get(p.el) ?? EMPTY_PLASTIC,
    });
  }
  // Development only: what each stacked layer was given, for the e2e specs.
  if ((process.env.NODE_ENV !== "production") && typeof window !== "undefined") {
    (window as unknown as { __stacks?: unknown }).__stacks = out
      .filter((g) => g.stack.count > 1)
      .map((g) => ({
        interface: g.el.parentElement?.closest(`[${STACK_ATTR}]`)?.getAttribute("data-interface"),
        index: g.stack.index,
        count: g.stack.count,
        zBottom: g.stack.zBottom,
        lightIn: g.stack.lightIn,
        throughScale: g.stack.throughScale,
        hasAbove: g.stack.aboveRect !== null,
      }));
  }
  return out;
}

/**
 * Where the glass is, right now: the frame's frozen snapshot.
 *
 * The scene's frame replaces it; scrolling, resizing and registration
 * invalidate it. Asked for when it is invalid or old (a pass drawing on its
 * own schedule), it takes a fresh reading -- panes only, reads only.
 */
export function glassGeometry(now = performance.now()): readonly GlassRect[] {
  const age = now - snapshotAt;
  if (snapshotAt >= 0 && snapshotVersion === version && age >= 0 && age < SNAPSHOT_MAX_AGE) {
    return snapshot;
  }
  snapshot = freeze(readScene(false));
  snapshotAt = now;
  snapshotVersion = version;
  return snapshot;
}

/* ======================================================================
 * 3. Compute
 * ====================================================================== */

/** Eased nearness of the lamp to a rect, 0 to 1, over `reach` pixels. */
function nearness(r: DOMRect, x: number, y: number, reach: number) {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  const near = Math.max(0, 1 - Math.hypot(dx, dy) / reach);
  return near * near;
}

/**
 * How the lamp falls on a surface resting on the glass, and the shadow it
 * throws, by the one shadow model (effects/optics/shadow): moved and grown
 * by H / (H - g), softened by R g / (H - g) across the light and more along it. Only while the lamp is lit -- the same
 * smoothstep of the charge the glass shader uses, so the shadow never leads
 * or lags the light that casts it.
 */
function lightOnSurface(r: DOMRect, standoff = 1): SurfaceLight {
  const x = cursorLamp.x;
  const y = cursorLamp.y;
  const near = nearness(r, x, y, 420);
  const centreX = r.left + r.width / 2;
  const centreY = r.top + r.height / 2;
  /*
   * Where its shadow lands, how much bigger than the thing it is, and how
   * soft: the one shadow model every shadow reads (effects/optics/shadow) --
   * grown by how near the lamp is, softened along the direction to it,
   * from this surface's own standoff. Approved by Ony 2026-09-29 ("all
   * shadows should behave the same and come from the same function").
   */
  const m = castByModel({
    lampX: x,
    lampY: y,
    height: cursorLamp.height,
    radius: cursorLamp.radius,
    gap: t("shadowGap") * standoff,
    x: centreX,
    y: centreY,
  });
  const cast = { x: m.x - centreX, y: m.y - centreY, blur: isotropicBlur(m), model: m };
  const c = cursorLamp.charge;
  const lit = c * c * (3 - 2 * c);
  const alpha = near * lit * t("shadowStrength");
  // Which way the light comes from, as a CSS gradient angle pointing AWAY
  // from it, so a gradient's 0% sits on the side facing the lamp.
  const angle = (Math.atan2(centreX - x, -(centreY - y)) * 180) / Math.PI;
  // The UV's reach is the physical falloff, from the nearest point of the surface.
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  const uvReach = irradianceFalloff(Math.hypot(dx, dy), cursorLamp.height);
  return { near, uvReach, cast, alpha, lit, angle };
}

/**
 * What is standing on each pane, as the shapes of the shadows it throws: in
 * the pane's own pixels, displaced by the cast vector, with the same penumbra
 * the visible shadow has. Rebuilt every frame -- it follows the light.
 */
function occludersFor(
  reading: SceneReading,
  lightOn: readonly SurfaceLight[],
): Map<HTMLElement, Occluder[]> {
  const paneRects = new Map(reading.panes.map((p) => [p.el, p.rect] as const));
  const out = new Map<HTMLElement, Occluder[]>();
  reading.surfaces.forEach((s, i) => {
    const light = lightOn[i];
    if (!s.pane || !light || light.alpha <= 0.01) return;
    const paneRect = paneRects.get(s.pane);
    if (!paneRect) return;
    const list = out.get(s.pane) ?? [];
    if (list.length >= MAX_OCCLUDERS) return;
    const r = s.rect;
    const model = light.cast.model;
    const scale = model?.scale ?? 1;
    list.push({
      cx: r.left - paneRect.left + r.width / 2 + light.cast.x,
      cy: r.top - paneRect.top + r.height / 2 + light.cast.y,
      hw: (r.width / 2) * scale,
      hh: (r.height / 2) * scale,
      radius: s.radius * scale,
      // Never zero, or the hole has a hard edge no real shadow has.
      blur: Math.max(model ? model.across : light.cast.blur, 1),
      alpha: light.alpha,
      dirX: model?.dirX ?? 0,
      dirY: model?.dirY ?? 0,
      cosTheta: model?.cosTheta ?? 1,
    });
    out.set(s.pane, list);
  });
  return out;
}

/** The plastic on each pane, and where the light through each lands. */
function plasticFor(
  reading: SceneReading,
  lightOn: readonly SurfaceLight[],
): Map<HTMLElement, Plastic[]> {
  const paneRects = new Map(reading.panes.map((p) => [p.el, p.rect] as const));
  const out = new Map<HTMLElement, Plastic[]>();
  reading.surfaces.forEach((s, i) => {
    if (!s.el.classList.contains("plastic")) return;
    const pane = s.el.closest<HTMLElement>(".glass");
    const paneRect = pane ? paneRects.get(pane) : undefined;
    if (!pane || !paneRect) return;
    const list = out.get(pane) ?? [];
    if (list.length >= MAX_PLASTIC) return;
    const r = s.rect;
    const light = lightOn[i];
    list.push({
      cx: r.left - paneRect.left + r.width / 2,
      cy: r.top - paneRect.top + r.height / 2,
      hw: r.width / 2,
      hh: r.height / 2,
      radius: s.radius,
      landX: light?.cast.x ?? 0,
      landY: light?.cast.y ?? 0,
      landScale: light?.cast.model?.scale ?? 1,
      blur: light?.cast.blur ?? 0,
    });
    out.set(pane, list);
  });
  return out;
}

/* ======================================================================
 * 4. Write
 * ====================================================================== */

let viewIdle = 0;

function writeView(reading: SceneReading) {
  const root = document.documentElement.style;
  const vw = reading.viewportWidth;
  const vh = reading.viewportHeight;
  const x = cursorLamp.x;
  const y = cursorLamp.y;
  // Where the lamp is, for the CSS layers (effects/adapters/css-vars).
  writeLightView(root, cursorLamp, vw, vh);
  /*
   * The viewpoint. The eye follows the pointer by the camera's follow
   * fraction, and the photographs -- a gap behind the glass -- slide on it by
   * gap / (distance + gap) of that, so what is behind the glass moves under
   * the bevel and you can watch it bend.
   */
  const eye = eyeOffset(x, y, vw, vh, camera.follow);
  const shift = behindGlassShift(eye, t("floorGap"), camera.distance(vw));
  viewState.eyeX = eye.x;
  viewState.eyeY = eye.y;
  // Set from the first frame, so the photographs never visibly re-scale when
  // the eye first moves.
  const scale = oversizeFor(vw, vh, camera.follow, t("floorGap"), camera.distance(vw)).toFixed(4);
  if (root.getPropertyValue("--view-scale") !== scale) root.setProperty("--view-scale", scale);
  if (shift.x === viewState.shiftX && shift.y === viewState.shiftY) return;
  viewState.shiftX = shift.x;
  viewState.shiftY = shift.y;
  root.setProperty("--view-x", `${shift.x.toFixed(2)}px`);
  root.setProperty("--view-y", `${shift.y.toFixed(2)}px`);
  /*
   * The liquid glass redraws a pane only when something behind it is known
   * to be moving. Mark the shifted photographs as moving while they move, and
   * idle a moment after, so the glass follows them live and stops spending
   * frames the moment they settle.
   */
  for (const el of document.querySelectorAll<HTMLElement>("[data-view-shift]")) {
    el.dataset["dynamic"] = "";
  }
  window.clearTimeout(viewIdle);
  viewIdle = window.setTimeout(() => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-view-shift]")) {
      el.dataset["dynamic"] = "idle";
    }
  }, 300);
}

/**
 * Lay a pane's side faces on its top and bottom edges: against its offset
 * parent -- which is theirs too -- so they scroll with it for free, or the
 * viewport for a fixed pane. Written only when something changed.
 */
function writeSides(p: PaneReading, viewportHeight: number, viewportWidth: number) {
  const layers = sideLayers.get(p.el);
  if (!layers) return;
  if (layers.fixed === null) return;
  const r = p.rect;
  const box = layers.fixed ? { x: r.left, y: r.top, w: r.width, h: r.height } : p.offset;
  if (!box) return;
  const faces = facesAt(p.el, r, p.causes.thickness, viewportWidth, viewportHeight);
  const sides = { top: faces.top, bottom: faces.bottom };
  const across = { left: faces.left, right: faces.right };
  const { x, y, w, h } = box;
  const key = `${x},${y},${w},${h},${sides.top},${sides.bottom},${across.left},${across.right},${p.radius}`;
  if (key === layers.last) return;
  layers.last = key;
  const position = layers.fixed ? "fixed" : "absolute";
  const set = (layer: HTMLElement, top: number, height: number, round: string) => {
    layer.style.position = position;
    layer.style.transform = `translate(${x}px, ${top}px)`;
    layer.style.width = `${w}px`;
    layer.style.height = `${height}px`;
    layer.style.borderRadius = round;
  };
  set(layers.top, y, sides.top, `${p.radius}px ${p.radius}px 0 0`);
  set(layers.bottom, y + h - sides.bottom, sides.bottom, `0 0 ${p.radius}px ${p.radius}px`);
  /*
   * The left and right faces run between the top and bottom ones, so the
   * corners are absorbed once, not twice. The corners themselves -- where a
   * rounded pane's side turns from one face to the next -- are the top and
   * bottom faces' rounding.
   */
  const between = Math.max(0, h - sides.top - sides.bottom);
  const setSide = (layer: HTMLElement | null, left: number, width: number) => {
    if (!layer) return;
    layer.style.position = position;
    layer.style.transform = `translate(${left}px, ${y + sides.top}px)`;
    layer.style.width = `${width}px`;
    layer.style.height = `${width > 0 ? between : 0}px`;
  };
  setSide(layers.left, x, across.left);
  setSide(layers.right, x + w - across.right, across.right);
  // The lit edge's layer covers the pane and its bleed, exactly as the surface layer does.
  if (layers.glow) {
    const g = layers.glow;
    g.style.position = position;
    g.style.transform = `translate(${x - LIGHT_BLEED}px, ${y - LIGHT_BLEED}px)`;
    g.style.width = `${w + LIGHT_BLEED * 2}px`;
    g.style.height = `${h + LIGHT_BLEED * 2}px`;
  }
}

/** The lit edge's layer of a pane, if it has one (drawn by the glass light pass). */
export function paneGlowLayer(el: HTMLElement): HTMLCanvasElement | null {
  const g = sideLayers.get(el)?.glow;
  return g instanceof HTMLCanvasElement ? g : null;
}

function writePane(p: PaneReading, viewportHeight: number, viewportWidth: number) {
  const el = p.el;
  const r = p.rect;
  // How near the lamp is, eased, and where it stands: the CSS adapter's to write.
  writePaneLight(el, r, cursorLamp, nearness(r, cursorLamp.x, cursorLamp.y, REACH));
  writeSides(p, viewportHeight, viewportWidth);
  // The corner radius, for layers the utility classes cannot tell it to.
  el.style.setProperty("--pane-radius", `${p.radius}px`);
  // Where this pane sits in the viewport, for anything positioned in viewport space.
  el.style.setProperty("--pane-x", `${Math.round(r.left)}px`);
  el.style.setProperty("--pane-y", `${Math.round(r.top)}px`);
}

function writeSurface(s: SurfaceReading, light: SurfaceLight) {
  const el = s.el;
  const r = s.rect;
  if (r.width === 0 || r.height === 0) return;
  writeSurfaceLight(el, r, cursorLamp, light, s.material);
  // For the room reflection, offset for the surface's height above the glass.
  el.style.setProperty("--surface-x", `${Math.round(r.left)}px`);
  el.style.setProperty("--surface-y", `${Math.round(r.top)}px`);
}

/* ======================================================================
 * The frame
 * ====================================================================== */

let bound = false;

/*
 * The scene is one task in the page's one loop (effects/engine/scheduler),
 * run after the input and the charge and before the passes, and only on
 * frames where something moved: the lamp, the page, or a registration.
 */
let task: ReturnType<typeof addTask> | null = null;

function schedule() {
  task ??= addTask("scene", ORDER.scene, (now) => {
    run(now);
    return false;
  });
  task.wake();
}

/** Registrations arrive in bursts; they all land in the same next frame. */
const reschedule = schedule;

/**
 * Lit surfaces moved on their own (a carousel drifting its cards): measure
 * them again next frame, so their gloss and their shadows follow.
 */
export function surfacesMoved() {
  invalidate();
  schedule();
}

function run(now = performance.now()) {
  // 1. commit
  commitLights();
  // 2. read
  const reading = readScene();
  // 3. compute
  const lightOn = reading.surfaces.map((s) => lightOnSurface(s.rect, s.standoff));
  occlusion = occludersFor(reading, lightOn);
  plastics = plasticFor(reading, lightOn);
  snapshot = freeze(reading);
  snapshotAt = typeof now === "number" ? now : performance.now();
  snapshotVersion = version;
  // 4. write
  writeView(reading);
  for (const p of reading.panes) writePane(p, reading.viewportHeight, reading.viewportWidth);
  reading.surfaces.forEach((s, i) => {
    const light = lightOn[i];
    if (light) writeSurface(s, light);
  });
  /*
   * One number per pane still, for the CSS layers that cannot test a shape
   * per pixel; the shader gets the real occluders.
   */
  for (const p of reading.panes) {
    let strongest = 0;
    for (const o of occlusion.get(p.el) ?? []) strongest = Math.max(strongest, o.alpha);
    p.el.style.setProperty("--occluded", strongest.toFixed(3));
  }
}

function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener(
    "pointermove",
    (event: PointerEvent) => movePointer(event.clientX, event.clientY),
    { passive: true },
  );
  document.addEventListener("pointerleave", () => movePointer(-9999, -9999));
  onLightChange(schedule);
  // Scrolling moves panes under a stationary lamp.
  window.addEventListener(
    "scroll",
    () => {
      invalidate();
      schedule();
    },
    { passive: true },
  );
  window.addEventListener("resize", () => {
    for (const el of panes) radii.delete(el);
    invalidate();
    schedule();
  });
  // A setting changed in the lab (the glass's thickness, the viewing
  // distance...): lay the faces and the rest out again.
  onTuningApplied(() => {
    invalidate();
    schedule();
  });
}

/* ======================================================================
 * Registration
 * ====================================================================== */

/**
 * Add a pane of glass to the scene. Measured by the next frame, which is
 * re-armed after the last arrival: panes mount in bursts (the header with the
 * layout, the bands with the route), and a frame already pending would
 * otherwise miss the late ones.
 *
 * Not measured on the spot. Mounting is a burst of fifty-odd registrations,
 * and measuring each as it arrived was a read after the last one's writes --
 * a style recalculation per element. The next frame measures them all in one
 * read, a frame later.
 */
export function registerScenePane(el: HTMLElement) {
  panes.add(el);
  radii.delete(el);
  invalidate();
  bind();
  reschedule();
  return () => {
    panes.delete(el);
    invalidate();
  };
}

export type LitSurfaceOptions = {
  /**
   * Whether this surface blocks the light as a solid rectangle: true for a
   * photograph, false for type (whose glyph-shaped shadow is text-shadow) and
   * for translucent plastic.
   */
  occludes?: boolean;
  /**
   * How far it stands off the glass, as a share of "Content depth": 1 for a
   * mounted print, less for a line of type or a thin sheet of plastic. A
   * cause, like the gap: where its shadow lands, how much bigger than it the
   * shadow is and how soft all follow from it (effects/optics/shadow).
   */
  standoff?: number;
  /** What it is made of, optically: what it does under UV (effects/materials/surfaces). */
  material?: SurfaceMaterialId;
};

/** Every lit surface and how far it stands off what it rests on (the shadow casters, effects/optics/casters). */
export function litSurfaceList(): {
  el: HTMLElement;
  standoff: number;
  material: SurfaceMaterial;
}[] {
  return [...litSurfaces].map((el) => ({
    el,
    standoff: standoffOf(el),
    material: surfaceMaterials.get(el) ?? SURFACE_MATERIALS.ink,
  }));
}

/** Add a surface resting on the glass; it is told where the light falls on it. */
export function registerLitSurface(el: HTMLElement, options: LitSurfaceOptions = {}) {
  if (options.occludes === false) nonOccluding.add(el);
  else nonOccluding.delete(el);
  if (options.standoff !== undefined) standoffs.set(el, options.standoff);
  else standoffs.delete(el);
  if (options.material) surfaceMaterials.set(el, SURFACE_MATERIALS[options.material]);
  else surfaceMaterials.delete(el);
  /*
   * A print is never quite flat: a slight bend (a degree or two, past what
   * the eye reads as a curve) turns the lamp's round reflection into a short
   * bar lying along the bend (Ony, 2026-10-11). Each print has its own: the
   * way it bends and how much, set once.
   */
  if (!el.style.getPropertyValue("--bend-a")) {
    el.style.setProperty("--bend-a", `${(Math.random() * 70 - 35).toFixed(1)}deg`);
    el.style.setProperty("--bend-k", (2 + Math.random() * 1.4).toFixed(2));
  }
  litSurfaces.add(el);
  bind();
  reschedule();
  return () => {
    litSurfaces.delete(el);
  };
}

/** Give a pane its side faces (siblings of it; see .glass-side). */
export function registerPaneSides(
  el: HTMLElement,
  top: HTMLElement,
  bottom: HTMLElement,
  glow: HTMLElement | null = null,
  left: HTMLElement | null = null,
  right: HTMLElement | null = null,
) {
  sideLayers.set(el, { top, bottom, left, right, glow, fixed: null, last: "" });
  // Laid on the pane by the next frame, with everything else.
  reschedule();
  return () => {
    sideLayers.delete(el);
  };
}

/**
 * The panes reacting to the shutter flash: a glare across each face and the
 * rim flaring. The attribute is removed and re-added around a forced reflow,
 * because re-applying an animation an element already has does nothing.
 */
export function flashPanes() {
  for (const el of panes) {
    el.removeAttribute("data-flash");
    // Reading layout here is the point: it flushes the removal.
    void el.offsetWidth;
    el.setAttribute("data-flash", "");
    window.setTimeout(() => el.removeAttribute("data-flash"), 1100);
  }
}
