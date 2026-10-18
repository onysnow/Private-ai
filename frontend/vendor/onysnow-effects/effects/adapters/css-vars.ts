/**
 * The CSS adapter (light-system design, step C).
 *
 * Stylesheets cannot read the light list, so what the CSS layers need of it
 * -- where the lamp stands relative to a pane or a surface, the shadow it
 * throws, how big its bright core is -- is written here as custom
 * properties, and ONLY here: a static test (adapters.test.ts) fails if any
 * other file writes a light variable. The scene decides WHEN (its write
 * phase, once a frame, after every read); this decides WHAT, from the lights.
 *
 * Nothing about the numbers changed when this moved out of the scene: the
 * same values, the same formatting, the same order.
 */

import type { Light } from "@fx/effects/light/lights";
import { t } from "@fx/lib/tuning";
import type { SurfaceMaterial } from "@fx/effects/materials/surfaces";

/** How the lamp falls on one surface resting on the glass (worked out by the scene). */
export type SurfaceLight = {
  near: number;
  /**
   * How much of the lamp's UV reaches it, relative to straight under the
   * lamp: the physical falloff (effects/optics/transmission irradianceFalloff), which
   * reaches much further than `near`, the lamp's stylised reach.
   */
  uvReach: number;
  cast: { x: number; y: number; blur: number; model?: import("@fx/effects/optics/shadow").Shadow };
  alpha: number;
  lit: number;
  angle: number;
};

type Box = { left: number; top: number; width: number; height: number };

/** How far the eye is from the screen, in screen widths (Lab "Viewing distance"). */
const VIEW_DISTANCE = () => t("viewDistance");

/** Where the viewer's lamp is, as a fraction of the viewport from its centre. */
export function writeLightView(
  root: CSSStyleDeclaration,
  lamp: Light,
  viewportWidth: number,
  viewportHeight: number,
) {
  root.setProperty("--reflect-x", (lamp.x / viewportWidth - 0.5).toFixed(3));
  root.setProperty("--reflect-y", (lamp.y / viewportHeight - 0.5).toFixed(3));
}

/** A pane: how near the lamp is (eased), and where it stands in the pane's own coordinates. */
export function writePaneLight(el: HTMLElement, r: Box, lamp: Light, glowOn: number) {
  el.style.setProperty("--glow-on", glowOn.toFixed(3));
  el.style.setProperty("--lit-x", `${Math.round(lamp.x - r.left)}px`);
  el.style.setProperty("--lit-y", `${Math.round(lamp.y - r.top)}px`);
}

/** A surface resting on the glass: the light on it and the shadow it throws. */
export function writeSurfaceLight(
  el: HTMLElement,
  r: Box,
  lamp: Light,
  light: SurfaceLight,
  material?: SurfaceMaterial,
) {
  el.style.setProperty("--lit-x", `${Math.round(lamp.x - r.left)}px`);
  el.style.setProperty("--lit-y", `${Math.round(lamp.y - r.top)}px`);
  /*
   * Where the print mirrors the lamp to the eye (Ony, 2026-10-11: "Photos
   * have high gloss and intense specular highlights ... I want to be able
   * to see that"): not under the lamp, where the cursor's own ring sat on
   * it, but where a ray from the lamp bounces off the print into the eye --
   * between the lamp's foot and the viewer's, a fraction H / (D + H) of the
   * way toward the middle of the screen. So the highlight slides across a
   * print at its own pace as the lamp moves, as a real reflection does.
   */
  if (typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const D = Math.max(200, VIEW_DISTANCE() * vw);
    const H = Math.max(1, lamp.height);
    const k = H / (D + H);
    const gx = lamp.x + (vw / 2 - lamp.x) * k;
    const gy = lamp.y + (vh / 2 - lamp.y) * k;
    // In the element's own box: a parallaxed photograph is scaled, and its gradient is laid out unscaled.
    const sx = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    const sy = el.offsetHeight > 0 ? r.height / el.offsetHeight : 1;
    el.style.setProperty("--gloss-x", `${Math.round((gx - r.left) / (sx || 1))}px`);
    el.style.setProperty("--gloss-y", `${Math.round((gy - r.top) / (sy || 1))}px`);
    // The highlight is the lamp's own image: as big as the lamp.
    el.style.setProperty("--gloss-r", `${Math.round(Math.max(8, lamp.radius))}px`);
  }
  el.style.setProperty("--lit-near", light.near.toFixed(3));
  el.style.setProperty("--cast-x", `${light.cast.x.toFixed(1)}px`);
  el.style.setProperty("--cast-y", `${light.cast.y.toFixed(1)}px`);
  el.style.setProperty("--cast-blur", `${light.cast.blur.toFixed(1)}px`);
  /*
   * With the shadow model (previewing), how much bigger than the thing its
   * shadow is: a box-shadow spread, the mean of the two growths.
   */
  const model = light.cast.model;
  if (model) {
    const spread = ((model.scale - 1) * (r.width + r.height)) / 4;
    el.style.setProperty("--cast-spread", `${spread.toFixed(1)}px`);
    el.style.setProperty("--cast-scale", model.scale.toFixed(4));
  }
  el.style.setProperty("--cast-alpha", light.alpha.toFixed(3));
  /*
   * A card ([data-cast] round a photograph) throws the photograph's shadow
   * from its own ::before, in the pane's lowest layer, so every card's shadow
   * lies under every card (2h, Ony 2026-09-30: "the shadow shouldn't be going
   * on top of the other photos") -- a box-shadow on the photograph painted
   * with it, over the card before it in the row.
   */
  const card = el.parentElement;
  if (card?.hasAttribute("data-cast")) {
    for (const name of ["--cast-x", "--cast-y", "--cast-blur", "--cast-spread", "--cast-alpha"]) {
      const v = el.style.getPropertyValue(name);
      if (v) card.style.setProperty(name, v);
    }
  }
  el.style.setProperty("--lit-on", light.lit.toFixed(3));
  // The lamp's bright core, whose mirror image a glossy surface shows: the
  // emitter's radius less its glow, about two fifths of its size.
  el.style.setProperty("--lamp-core", `${(lamp.radius * 0.35).toFixed(1)}px`);
  el.style.setProperty("--lit-angle", `${light.angle.toFixed(1)}deg`);
  el.style.setProperty("--lit-over", litOver(r, lamp).toFixed(3));
  /*
   * What it gives back under UV (items 20, 25a): the UV reaching it times its
   * material's fluorescence, as a colour the stylesheet adds -- its glow, and
   * a wash over its face. Transparent unless a light carries UV and the
   * material fluoresces, so nothing changes otherwise.
   */
  const f = material ? fluorescenceOn(light, lamp, material) : 0;
  if (f > 0.001 || el.style.getPropertyValue("--fluor-glow")) {
    el.style.setProperty("--fluor-glow", fluorColour(material, Math.min(1, f)));
    el.style.setProperty("--fluor-face", fluorColour(material, Math.min(1, f) * 0.55));
  }
}

/** How strongly a surface fluoresces: the UV reaching it (uvReach x lit x uv) times its yield. */
export function fluorescenceOn(
  light: Pick<SurfaceLight, "uvReach" | "lit">,
  lamp: Pick<Light, "uv">,
  material: SurfaceMaterial,
): number {
  return light.uvReach * light.lit * lamp.uv * material.fluorescence.yield;
}

function fluorColour(material: SurfaceMaterial | undefined, alpha: number): string {
  if (!material || alpha <= 0.001) return "transparent";
  const [r, g, b] = material.fluorescence.colour;
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${alpha.toFixed(3)})`;
}

/**
 * How squarely the lamp is over a surface, 0 to 1: 1 with the lamp's centre
 * on it, falling to 0 as the lamp moves off it by half the lamp's radius. A
 * glossy sheet (the plastic) shows the lamp only when the lamp is over it --
 * its face is a mirror seen straight on, and a mirror shows what is in front
 * of it, not what is beside it.
 */
export function litOver(r: Box, lamp: Pick<Light, "x" | "y" | "radius">): number {
  const dx = Math.max(r.left - lamp.x, 0, lamp.x - (r.left + r.width));
  const dy = Math.max(r.top - lamp.y, 0, lamp.y - (r.top + r.height));
  const reach = Math.max(lamp.radius * 0.5, 8);
  const t = Math.min(1, Math.hypot(dx, dy) / reach);
  return 1 - t * t * (3 - 2 * t);
}
