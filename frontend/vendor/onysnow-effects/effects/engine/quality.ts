/**
 * Quality tiers (item 34): a lighter site for devices that cannot keep up.
 *
 *   full     everything, the light passes drawn at up to 1.5 device pixels
 *            per CSS pixel;
 *   lite     the same effects, cheaper: the passes at 1 device pixel per CSS
 *            pixel (a quarter fewer pixels on a 1.5x screen, over half on a
 *            2x one) and the backdrop-blurred bokeh layer off -- the two
 *            things that cost the most per frame;
 *   minimal  phones and reduced motion: what the site already does there
 *            (styles.css and each pass check the pointer and motion
 *            preferences): CSS glass, no light passes.
 *
 * Where a device starts: phones and reduced motion are minimal; a device
 * that says it has 4 GB of memory or less, or 4 cores or fewer, is lite;
 * and a software renderer (no GPU: SwiftShader, llvmpipe) is lite. It can
 * only go down after that: if the frames of a lit page keep coming slower
 * than SLOW_FRAME_MS, a full page steps down to lite.
 *
 * `?quality=full|lite|minimal` forces a tier (for testing). Until Ony
 * approves the tiers they act only with ?try=quality (or that override).
 */

import { previewing } from "./preview";
import { experimentsAllowed } from "@fx/lib/admin-gate";

export type Quality = "full" | "lite" | "minimal";

/** A frame slower than this, lit and running continuously, counts against the device. */
export const SLOW_FRAME_MS = 45;
/** How many slow frames in a row step a full page down. */
export const SLOW_RUN = 90;

const TIERS: readonly Quality[] = ["full", "lite", "minimal"];
let tier: Quality | null = null;
let forced = false;
let slowRun = 0;
const watchers = new Set<(q: Quality) => void>();

function forcedTier(): Quality | null {
  if (typeof window === "undefined" || !experimentsAllowed()) return null;
  try {
    const q = new URLSearchParams(window.location.search).get("quality");
    return q && (TIERS as readonly string[]).includes(q) ? (q as Quality) : null;
  } catch {
    return null;
  }
}

/** Where a device starts, from what it says about itself. */
export function startingTier(device: {
  coarse: boolean;
  reducedMotion: boolean;
  memoryGb?: number | undefined;
  cores?: number | undefined;
}): Quality {
  if (device.coarse || device.reducedMotion) return "minimal";
  if (device.memoryGb !== undefined && device.memoryGb <= 4) return "lite";
  if (device.cores !== undefined && device.cores <= 4) return "lite";
  return "full";
}

function mark(q: Quality) {
  if (typeof document !== "undefined") document.documentElement.dataset["quality"] = q;
}

/** The tier this page runs at. */
export function quality(): Quality {
  if (tier) return tier;
  if (typeof window === "undefined") return "full";
  const f = forcedTier();
  if (f) {
    forced = true;
    tier = f;
  } else if (!previewing("quality")) {
    tier = "full";
  } else {
    const nav = navigator as Navigator & { deviceMemory?: number };
    tier = startingTier({
      coarse: window.matchMedia?.("(pointer: coarse), (hover: none)").matches ?? false,
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      memoryGb: nav.deviceMemory,
      cores: nav.hardwareConcurrency,
    });
  }
  mark(tier);
  return tier;
}

/** Step down to `to` if the page is above it (never up; not when forced, nor unless tried). */
export function stepDown(to: Quality) {
  const now = quality();
  if (forced || !previewing("quality")) return;
  if (TIERS.indexOf(to) <= TIERS.indexOf(now)) return;
  tier = to;
  mark(to);
  for (const fn of watchers) fn(to);
}

/** Watch the tier (returns the unwatch). */
export function onQualityChange(fn: (q: Quality) => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

/** Whether a WebGL renderer's name is a software one: no GPU behind it. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/** Look at the renderer once the shared context exists; a software one means lite. */
export function noteRenderer(gl: WebGLRenderingContext) {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    if (isSoftwareRenderer(name)) stepDown("lite");
  } catch {
    /* no name to go by */
  }
}

/**
 * One frame of a lit page running continuously, `ms` after the last. A long
 * run of slow ones steps a full page down to lite.
 */
export function noteFrame(ms: number) {
  if (ms > SLOW_FRAME_MS) slowRun += 1;
  else slowRun = 0;
  if (slowRun >= SLOW_RUN && quality() === "full") stepDown("lite");
}

/** The most device pixels per CSS pixel a light pass is drawn at. */
export function passScaleCap(): number {
  return quality() === "full" ? 1.5 : 1;
}

/**
 * The same for the light ON the glass, which carries the smudge and scratch
 * photographs: fine detail, so on a 2x display it is drawn at 2x (Ony,
 * 2026-10-01: "increase the resolution of the smudge/scratch layers" -- at
 * 1.5x the browser stretched the layer and every mark went soft and streaky).
 */
export function surfaceScaleCap(): number {
  return quality() === "full" ? 2 : 1;
}

/** For tests: forget the tier. */
export function resetQuality() {
  tier = null;
  forced = false;
  slowRun = 0;
}
