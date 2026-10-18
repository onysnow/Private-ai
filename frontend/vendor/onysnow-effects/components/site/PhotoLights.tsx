import { useEffect } from "react";
import { previewing } from "@fx/effects/engine/preview";
import { addEmitter, emitterChanged, makeUnderLight } from "@fx/effects/light/lights";
import { coverPoint, findHighlights, type Highlight } from "@fx/effects/light/photo-emitters";
import { glassGeometry } from "@fx/effects/scene/scene";

/** How many of the photographs' spots are lights at once: the light list is short (MAX_LIGHTS). */
const MAX_PHOTO_LIGHTS = 2;
/** The size a photograph is read at to find its spots, px across. */
const READ = 96;
/** Fainter spots are left out: they light nothing you could see. */
const MIN_STRENGTH = 0.05;
/** A full-strength spot against the lamp. */
const SHARE = 0.6;

const found = new Map<string, Promise<Highlight[]>>();

/** A photograph's bright spots, read once per photograph. */
function highlightsOf(src: string): Promise<Highlight[]> {
  const hit = found.get(src);
  if (hit) return hit;
  const job = new Promise<Highlight[]>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve([]);
    img.onload = () => {
      try {
        const w = READ;
        const h = Math.max(
          1,
          Math.round((READ * img.naturalHeight) / Math.max(img.naturalWidth, 1)),
        );
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve([]);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(findHighlights(ctx.getImageData(0, 0, w, h).data, w, h, 4));
      } catch {
        // A photograph from elsewhere that will not be read: no lights from it.
        resolve([]);
      }
    };
    img.src = src;
  });
  found.set(src, job);
  return job;
}

/**
 * The photographs' own lights (item 31, ?try=photolights;
 * effects/light/photo-emitters): the brightest spots of the photographs
 * behind the panes on screen, as lights under the glass that follow the
 * photographs as they slide.
 */
export function PhotoLights() {
  useEffect(() => {
    if (!previewing("photolights")) return;
    const slots = Array.from({ length: MAX_PHOTO_LIGHTS }, (_, k) =>
      makeUnderLight(`photo-${k}`, SHARE),
    );
    const removers = slots.map((l) => addEmitter(l));
    const ready = new Map<string, Highlight[]>();
    let frame = 0;
    let disposed = false;

    const place = () => {
      frame = 0;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      type Candidate = { x: number; y: number; h: Highlight; px: number };
      const candidates: Candidate[] = [];
      for (const pane of glassGeometry()) {
        if (!pane.src || pane.y + pane.h < 0 || pane.y > vh) continue;
        const spots = ready.get(pane.src);
        if (!spots) {
          void highlightsOf(pane.src).then((h) => {
            if (disposed) return;
            ready.set(pane.src, h);
            schedule();
          });
          continue;
        }
        for (const h of spots) {
          // A spot barely past the knee lights nothing you could see.
          if (h.strength < MIN_STRENGTH) continue;
          const at = coverPoint(
            h.u,
            h.v,
            { x: pane.ix, y: pane.iy, w: pane.iw, h: pane.ih },
            pane.ia,
            pane.ifocus,
          );
          // Only where the photograph shows (its section clips it), and under or near this pane.
          const b = pane.ibox;
          if (at.x < b.x || at.x > b.x + b.w || at.y < b.y || at.y > b.y + b.h) continue;
          const near = 120;
          if (at.x < pane.x - near || at.x > pane.x + pane.w + near) continue;
          if (at.y < pane.y - near || at.y > pane.y + pane.h + near) continue;
          if (candidates.some((c) => Math.hypot(c.x - at.x, c.y - at.y) < 40)) continue;
          candidates.push({ x: at.x, y: at.y, h, px: h.radius * pane.iw });
        }
      }
      candidates.sort((a, b) => b.h.strength - a.h.strength);
      let changed = false;
      slots.forEach((slot, k) => {
        const c = candidates[k];
        /*
         * How hard it burns is how bright the spot was: the passes gate what
         * a light does on its charge (the rims, the grime), so a faint spot
         * must be a faint charge, not a full one at a low gain.
         */
        const charge = c ? c.h.strength : 0;
        const x = c ? c.x : -9999;
        const y = c ? c.y : -9999;
        if (
          Math.abs(slot.x - x) > 0.5 ||
          Math.abs(slot.y - y) > 0.5 ||
          Math.abs(slot.charge - charge) > 0.005
        ) {
          changed = true;
        }
        slot.x = x;
        slot.y = y;
        slot.charge = charge;
        if (c) slot.set(c.h.colour, Math.max(4, c.px));
      });
      if (changed) emitterChanged();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    // Development only: what the photographs' lights are doing, for screenshots and tests.
    if ((process.env.NODE_ENV !== "production")) {
      (window as unknown as { __photoLights?: () => unknown }).__photoLights = () => ({
        lights: slots.map((l) => ({
          x: l.x,
          y: l.y,
          charge: l.charge,
          gain: l.gain,
          colour: l.colour,
        })),
        found: Object.fromEntries(ready),
      });
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    const settle = window.setInterval(schedule, 1000);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearInterval(settle);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      for (const remove of removers) remove();
    };
  }, []);
  return null;
}
