import { previewing } from "@fx/effects/engine/preview";
import { bevelField } from "./bevel-map";
import { FLOAT_GLASS } from "@fx/effects/materials/presets";
import { PANE_THICKNESS } from "@fx/effects/optics/edge-side";

/**
 * One displacement map per pane geometry, shared by every pane that matches.
 *
 * The map used to be a single baked PNG stretched over every pane, so a bar
 * 64px tall and a band 400px tall were bent by the same profile. Computing it
 * means the bevel is the same physical depth everywhere regardless of how tall
 * the pane is -- which is the point of a bevel -- but it also means the map
 * depends on the pane's size and corner radius, and therefore so does the
 * filter that references it.
 *
 * Geometry is rounded into buckets before it becomes a key. Panes on this site
 * are full-width bands that all resize together, so without bucketing every
 * pixel of a window drag would mint a new map; with it, the whole page usually
 * shares two.
 */

/** The map is smooth, so it can be computed small and stretched back up. */
const MAX_EDGE = 320;

/** How thick the slab is behind that edge, in CSS pixels: the pane's one thickness. */
export const GLASS_THICKNESS = PANE_THICKNESS;

/** Soda-lime float glass: the same index the reflection on the face uses. */
export const GLASS_IOR = FLOAT_GLASS.ior;

export type PaneGeometry = {
  width: number;
  height: number;
  radius: number;
  /**
   * How wide this pane's rounded-over edge is, in CSS pixels.
   *
   * There is no width of its own here any more (it was a fixed 26). The pane
   * says how wide its edge is and this map bends by exactly that, so the bend
   * lands where the light and the shadow of the same edge do.
   */
  edgeWidth: number;
  straight?: boolean;
  /** The pane's thickness, CSS px (its data-thickness); GLASS_THICKNESS if unsaid. */
  thickness?: number;
  /**
   * Rolled or hammered glass: how far its ripples shift the view, CSS px per
   * unit of slope (effects/optics/waviness waveScale), and which surface the
   * pane wears. 0 or unsaid: flat float glass, bent at the bevel only.
   */
  waveShift?: number;
  waveSeed?: number;
};

export type BevelEntry = {
  id: string;
  href: string;
  /**
   * What `feDisplacementMap`'s `scale` must be for this map to displace by the
   * number of pixels Snell actually gives. The map stores each offset as a
   * fraction of the largest one, so this is that largest one in CSS pixels.
   */
  scale: number;
};

const cache = new Map<string, BevelEntry>();
const listeners = new Set<() => void>();
let snapshot: BevelEntry[] = [];

/** Round to a bucket so a resize drag doesn't mint a map per pixel. */
function bucket(n: number): number {
  return Math.max(1, Math.round(n / 16) * 16);
}

function keyFor(g: PaneGeometry): string {
  const t = Math.round(g.thickness ?? GLASS_THICKNESS);
  const wave =
    g.waveShift && g.waveShift > 0 ? `w${Math.round(g.waveShift * 4)}n${g.waveSeed ?? 0}` : "";
  return `${bucket(g.width)}x${bucket(g.height)}r${Math.round(g.radius)}e${Math.round(g.edgeWidth)}${g.straight ? "s" : ""}${t === GLASS_THICKNESS ? "" : `t${t}`}${wave}`;
}

function encode(
  width: number,
  height: number,
  radius: number,
  edgeWidth: number,
  straight = false,
  thickness = GLASS_THICKNESS,
  waveShift = 0,
  waveSeed = 0,
): { href: string; scale: number } | null {
  if (typeof document === "undefined") return null;

  // Uniform downscale: the bevel has to stay in proportion when the map is
  // stretched back over the pane, so both axes take the same factor.
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));

  const field = bevelField(w, h, radius * scale, {
    bezelWidth: edgeWidth * scale,
    thickness: thickness * scale,
    ior: GLASS_IOR,
    straight,
    wave: waveShift > 0 ? { shift: waveShift, seed: waveSeed, cssPerMap: 1 / scale } : undefined,
    cornerSoft: previewing("corners") ? edgeWidth * scale : 0,
  });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // `ImageData` wants a view over a plain ArrayBuffer; the field allocates its
  // own, so hand over a fresh view rather than the typed array itself.
  const image = ctx.createImageData(w, h);
  image.data.set(field.data);
  ctx.putImageData(image, 0, 0);
  // The field is computed in map pixels; the map is stretched back up, so the
  // displacement it asks for has to come back up with it.
  return { href: canvas.toDataURL("image/png"), scale: field.maxOffset / scale };
}

/**
 * Ask for the filter matching this geometry, creating it if it is new.
 *
 * Returns the filter's id, or null before the map can be built (during SSR, or
 * if a canvas is unavailable) so the caller can leave the CSS fallback alone.
 */
export function requestBevelFilter(g: PaneGeometry): string | null {
  if (g.width < 8 || g.height < 8) return null;

  const key = keyFor(g);
  const existing = cache.get(key);
  if (existing) return existing.id;

  const encoded = encode(
    bucket(g.width),
    bucket(g.height),
    g.radius,
    Math.round(g.edgeWidth),
    g.straight ?? false,
    Math.round(g.thickness ?? GLASS_THICKNESS),
    Math.round((g.waveShift ?? 0) * 4) / 4,
    g.waveSeed ?? 0,
  );
  if (!encoded) return null;

  const entry: BevelEntry = { id: `glass-bevel-${key}`, ...encoded };
  cache.set(key, entry);
  snapshot = [...cache.values()];
  for (const notify of listeners) notify();
  return entry.id;
}

export function subscribeBevelFilters(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function bevelFilterSnapshot(): BevelEntry[] {
  return snapshot;
}
