/**
 * The liquid glass adapter (light-system design, step C).
 *
 * The vendored liquid glass library keeps its settings in each pane's
 * `data-config` and watches the attribute, so writing it is enough. What it
 * is given comes from the same places everything else reads: the pane's own
 * causes (its material's frost, its edge width) and the lights. The library's
 * remaining numbers are model constants (the RESULTS in lib/tuning.ts).
 *
 * The library also lights its own gloss and rim, from a fixed light of its
 * own that is not in the list. The only light in the list it could stand for
 * is the room's, so its gloss and rim are scaled by the room's light: with
 * the room dark they are out, and the lamp's own light on the glass is the
 * GlassLight pass above it.
 *
 * Only ever writes when the value would actually change: the library's
 * observer fires on any attribute write, and an identical one is pure work.
 */

import { previewing } from "@fx/effects/engine/preview";
import { roomLight } from "@fx/effects/light/lights";
import { readPaneCauses } from "@fx/effects/materials/pane-causes";
import { indexAt } from "@fx/effects/optics/dispersion";
import { readEdgeWidth } from "@fx/effects/optics/edge-profile";
import { setGlassConfigWriter, t, tuning } from "@fx/lib/tuning";

/** A band as wide as the page (its bevel runs top and bottom only). */
function isBand(pane: HTMLElement): boolean {
  if (typeof window === "undefined") return false;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  return !pane.classList.contains("glass--bar") && pane.getBoundingClientRect().width >= vw - 1;
}

/** What the library is told for one pane. */
export function liquidConfigFor(pane: HTMLElement): Record<string, number> {
  const isBar = pane.classList.contains("glass--bar");
  const config: Record<string, number> = {};
  for (const knob of Object.values(tuning)) {
    if (!knob.glassKey) continue;
    if (knob.glassScope === "band" && isBar) continue;
    if (knob.glassScope === "bar" && !isBar) continue;
    config[knob.glassKey] = knob.value;
  }
  // The pane's own matter: its material's frost, and its edge.
  const causes = readPaneCauses(pane, {
    frost: t("glassBlur"),
    gap: t("floorGap"),
    thickness: t("glassThickness"),
  });
  if ("blurAmount" in config) config["blurAmount"] = causes.material.frost;
  config["zRadius"] = readEdgeWidth(pane, tuning["edgeWidth"]!.value);
  // Its own light stands in for the room's.
  const roomOn = Math.min(roomLight.gain, 1);
  for (const key of ["specular", "edgeHighlight"]) {
    if (key in config) config[key] = config[key]! * roomOn;
  }
  /*
   * ?try=liquidlights (item 17): the light list lights the liquid glass, and
   * nothing else does. The library's fixed rig -- four lights at made-up
   * directions for the gloss, a rim glow, a Fresnel blend toward white and a
   * drop shadow from a light "directly above" -- is light and shadow from
   * sources that are not in the scene. The lights that ARE in it already
   * reach these panes through GlassLight, drawn over the library's canvas in
   * both glass modes: the lamp (and the flash) on the face and the edges, and
   * the room, reflected through Fresnel at the glass's IOR. The pane's
   * shadow is the one shadow model's (the light through the glass). So the
   * rig is switched off and the library does only what glass does to what is
   * behind it: bend, blur and tint.
   */
  /*
   * ?try=liquidedge needs this too: on a band as wide as the page the rig's
   * lights depend only on the height across the bevel, so each one is a
   * bright line the whole width of the screen -- the streaks along the liquid
   * bands, which the CSS glass does not have (2j).
   */
  if (previewing("liquidlights") || previewing("liquidedge")) {
    for (const key of ["specular", "edgeHighlight", "fresnel", "shadowOpacity"]) {
      if (key in config) config[key] = 0;
    }
  } else if (isBand(pane)) {
    /*
     * A band the page's width, by default too (Ony, 2026-10-01: "what the
     * heck are those long white lines? theres 2 on the bottom above the edge
     * and then one on the top below the top edge"). They are the rig's gloss
     * and rim, which on a band hang on the height across the bevel alone, so
     * each is a line the whole width of the screen; the CSS glass has none.
     */
    for (const key of ["specular", "edgeHighlight"]) {
      if (key in config) config[key] = 0;
    }
  }
  /*
   * ?try=liquidedge (2j): the edge the CSS glass draws. The library bends by
   * the slope of its own height field times a knob, which at the rim is a
   * shift of a few hundred pixels -- the streaked, chromed look of its
   * bands. Here the bend is Snell through the pane's own edge and thickness,
   * the very numbers the CSS bend is built from (lib/bevel-map), each colour
   * at its own index (the material's dispersion, not a fringe knob); the fill
   * is the pane's own; and the lines the library draws round the rim, which
   * no light in the scene puts there, are gone.
   */
  if (previewing("liquidedge")) {
    const { ior, abbe } = causes.material;
    config["physicalEdge"] = 1;
    config["thickness"] = causes.thickness;
    config["iorR"] = indexAt(LAMBDA_R, ior, abbe);
    config["iorG"] = indexAt(LAMBDA_G, ior, abbe);
    config["iorB"] = indexAt(LAMBDA_B, ior, abbe);
    const [r, g, b, a] = paneFill(pane);
    config["veilR"] = r;
    config["veilG"] = g;
    config["veilB"] = b;
    config["veilA"] = a;
  }
  return config;
}

/** The wavelengths the three channels stand for, nm: roughly where sRGB's primaries peak. */
const LAMBDA_R = 610;
const LAMBDA_G = 550;
const LAMBDA_B = 465;

/** The CSS glass's own fill, as display RGBA 0..1 (styles.css --pane-fill). */
const FALLBACK_FILL: [number, number, number, number] = [0.07, 0.055, 0.045, 0.3];
const fills = new Map<string, [number, number, number, number]>();
function paneFill(pane: HTMLElement): [number, number, number, number] {
  const css = getComputedStyle(pane).getPropertyValue("--pane-fill").trim();
  if (!css) return FALLBACK_FILL;
  const hit = fills.get(css);
  if (hit) return hit;
  let rgba = FALLBACK_FILL;
  try {
    // The canvas resolves any CSS colour (oklch included) to sRGB for us.
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      const a = d[3]! / 255;
      if (a > 0) rgba = [d[0]! / 255, d[1]! / 255, d[2]! / 255, a];
    }
  } catch {
    /* keep the fallback */
  }
  fills.set(css, rgba);
  return rgba;
}

/** Write every pane's config. */
export function applyGlassConfig() {
  if (typeof document === "undefined") return;
  for (const pane of Array.from(document.querySelectorAll<HTMLElement>(".glass"))) {
    const next = JSON.stringify(liquidConfigFor(pane));
    if (pane.dataset["config"] !== next) pane.dataset["config"] = next;
  }
}

// Every applied change to the knobs reaches the panes through this adapter.
setGlassConfigWriter(applyGlassConfig);
