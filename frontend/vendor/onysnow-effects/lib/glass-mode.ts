import { useEffect, useState } from "react";

/**
 * Which glass is running, and a way to change it without a reload.
 *
 * Two complete systems live in this repo and that is deliberate:
 *
 *   css     backdrop-filter, an SVG displacement map per pane geometry, and
 *           the WebGL light pass. What ships.
 *   raster  ybouane/liquidglass, vendored: the page rasterised into a texture
 *           and sampled by a refraction shader, which is the only way to bend
 *           what is behind a pane rather than merely blur it.
 *
 * Comparing them is the entire point, so switching has to be instant and has
 * to survive navigation. A build flag would mean rebuilding to switch, and
 * nobody compares two things they have to rebuild between.
 */

const KEY = "onysnow:glass-mode";

export type GlassMode = "css" | "raster";

/**
 * Everything that wants to know when the mode changes.
 *
 * A plain Set rather than context: the switch lives in the header and the
 * thing it controls is mounted at the root, so a provider wrapping both would
 * re-render the whole tree to flip one boolean.
 */
const listeners = new Set<(mode: GlassMode) => void>();

let current: GlassMode | null = null;

function read(): GlassMode {
  if (typeof window === "undefined") return "css";

  // The query string wins, and writes through, so a shared link pins the mode.
  const asked = new URLSearchParams(window.location.search).get("glass");
  if (asked === "raster" || asked === "css") {
    store(asked);
    return asked;
  }

  try {
    return window.localStorage.getItem(KEY) === "raster" ? "raster" : "css";
  } catch {
    return "css";
  }
}

function store(mode: GlassMode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Private mode, blocked storage. The mode still applies to this page; it
    // just will not survive a navigation.
  }
}

export function getGlassMode(): GlassMode {
  if (current === null) current = read();
  return current;
}

export function setGlassMode(mode: GlassMode) {
  if (getGlassMode() === mode) return;
  current = mode;
  store(mode);

  /*
   * The URL follows, without a navigation.
   *
   * replaceState rather than a router navigate: changing the mode is not a
   * page change, and routing to the same route would remount the tree --
   * throwing away every pane the rasteriser has spent seconds capturing, at
   * the exact moment you are trying to compare the two.
   */
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("glass", mode);
    window.history.replaceState(null, "", url);
  } catch {
    // Non-browser, or a URL the history API will not take. Nothing depends on
    // this; it is for sharing and for reload, not for correctness.
  }

  for (const fn of listeners) fn(mode);
}

/**
 * Subscribe to mode changes from outside React.
 *
 * The tuning store needs this: knobs that are live in both systems keep a
 * separate value per mode, and the swap has to happen the instant the mode
 * does -- not one render later, and not only on the pages that happen to
 * mount a component.
 */
export function onGlassMode(fn: (mode: GlassMode) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleGlassMode(): GlassMode {
  const next: GlassMode = getGlassMode() === "raster" ? "css" : "raster";
  setGlassMode(next);
  return next;
}

/**
 * The current mode, live.
 *
 * Always "css" on the first render, including on the server. The mode lives in
 * the query string and in localStorage, neither of which the server can see,
 * so deciding during render would mean the markup React produced and the
 * markup it hydrated disagreed -- and a hydration mismatch on the root is how
 * this site spent a whole session with a console error nobody could place. It
 * settles in an effect one frame later, which for a comparison toggle is free.
 */
export function useGlassMode(): GlassMode {
  const [mode, setMode] = useState<GlassMode>("css");
  useEffect(() => {
    setMode(getGlassMode());
    const fn = (next: GlassMode) => setMode(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return mode;
}

/** Kept so existing callers do not have to change. */
export function useRasterGlass(): boolean {
  return useGlassMode() === "raster";
}
