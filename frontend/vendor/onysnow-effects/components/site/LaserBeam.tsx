import { experimentsAllowed } from "@fx/lib/admin-gate";
import { onTuningApplied, t } from "@fx/lib/tuning";
import { useEffect, useRef } from "react";
import { glassGeometry } from "@fx/effects/scene/scene";
import {
  traceBeam,
  type BeamHit,
  type BeamPane,
  type BeamSegment,
  type Vec,
} from "@fx/effects/optics/beam";
import { indexAt, wavelengthRgb } from "@fx/effects/optics/dispersion";
import { beamSolids } from "@fx/effects/scene/beam-solids";
import {
  LASER_COLOURS,
  LASER_WAVELENGTH,
  addEmitter,
  emitterChanged,
  makeEmitter,
  onLightChange,
  pointer,
  type LaserColour,
} from "@fx/effects/light/lights";

/**
 * How many CSS px one unit of the material's absorption path is. The
 * absorption was measured looking along a pane's side (effects/optics/
 * edge-side), a path of about one unit through a pane of a band's size, so
 * a unit is taken as 1000 px. It is what makes a red beam fade inside a long
 * pane and a green one carry: float glass's iron takes red most.
 */
const PATH_UNIT = 1000;

/**
 * How strongly a spot the beam strikes lights what is round it, as a share
 * of the lamp. A laser pointer's whole output is a few milliwatts -- a
 * thousandth of a lamp's -- so though its spot is dazzling to look at, the
 * light it throws on its surroundings is small: only the glass right by it
 * catches it, on its rims.
 */
const SPOT_SHARE = 0.05;
/**
 * Where the spot's light stands, px above the glass: the struck edge is the
 * pane's own thickness tall, and its scattered light leaves the whole of it.
 */
const SPOT_HEIGHT = 18;

/** How visible the beam is along its path: faint haze in the air; glass scatters, frost far more. */
const AIR_SCATTER = 0.35;
const GLASS_SCATTER = 0.7;
const FROST_SCATTER = 1.4;

/** The laser's colour from the address (?laser=green), if it asks for one. */
function laserColourFromUrl(): LaserColour | null {
  if (typeof window === "undefined" || !experimentsAllowed()) return null;
  const asked = new URLSearchParams(window.location.search).get("laser");
  return asked && asked in LASER_COLOURS ? (asked as LaserColour) : null;
}

/** The wavelengths of "Laser colour", in its options' order; null is white (every colour). */
const KNOB_NM: readonly (number | null)[] = [650, 635, 589, 532, 450, 405, null];

/** One wavelength the beam carries, its colour and its share of the beam. */
type Line = { nm: number; rgb: [number, number, number]; share: number };

/** The lines the beam carries, from the address or the "Laser colour" knob. */
function laserLines(): Line[] {
  const asked = laserColourFromUrl();
  const nm = asked
    ? asked === "white"
      ? null
      : LASER_WAVELENGTH[asked]
    : (KNOB_NM[Math.round(t("laserColour"))] ?? 650);
  /*
   * A laser is one wavelength. A white (supercontinuum) laser is all of
   * them: traced as seven across the spectrum, each bent by the glass's
   * index at its own wavelength, so where they part -- in a prism -- the
   * spectrum shows.
   */
  if (nm === null) {
    return [410, 450, 490, 530, 570, 610, 650].map((w) => ({
      nm: w,
      rgb: wavelengthRgb(w),
      share: 2.2 / 7,
    }));
  }
  const rgb =
    asked && asked !== "white"
      ? ([...LASER_COLOURS[asked]] as [number, number, number])
      : wavelengthRgb(nm);
  // Full strength in its own colour: a laser is as saturated as light gets.
  const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-3);
  return [{ nm, rgb: [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak], share: 1 }];
}

/** The beam's brightness against the 5 mW pointer it was tuned on: the eye's response, roughly a square root. */
const powerFactor = () => Math.sqrt(Math.max(t("laserPower"), 0.1) / 5);

/** A hash in 0..1, stable for a given input. */
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A laser pointer's beam crossing the page (item 24, redone as 25d,
 * ?try=laser&laser=red|green|violet).
 *
 * The beam runs in the plane of the glass, so it meets the panes at their
 * edges -- their side faces -- and everything after that is the beam tracer's
 * physics (effects/optics/beam): it bends going in by Snell at the index for
 * its own wavelength, sends a weaker reflection off every surface, is guided
 * along a pane by total internal reflection when it meets an edge steeply
 * from inside, is absorbed along its path at the glass's measured absorption
 * for its colour, and leaves displaced. Where it strikes a surface the spot
 * glows, and the two brightest spots are lights in the scene, so the glass
 * there catches them on its rims.
 *
 * Held in the hand: the laser is where the pointer is, keeping its aim. Press
 * and drag to aim it -- it stays where you pressed and points toward the
 * pointer while you drag.
 */
export function LaserBeam() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const view = canvas.current;
    const ctx = view?.getContext("2d");
    if (!view || !ctx) return;
    let lines = laserLines();
    let rgb = lines.length === 1 ? lines[0]!.rgb : ([1, 1, 1] as [number, number, number]);
    const cssOf = (c: readonly number[], a: number) =>
      `rgb(${Math.round(c[0]! * 255)} ${Math.round(c[1]! * 255)} ${Math.round(c[2]! * 255)} / ${Math.max(0, a).toFixed(3)})`;
    const css = (a: number) => cssOf(rgb, a);

    let aimFrom: Vec | null = null;
    let direction: Vec = { x: 1, y: 0.18 };
    // The spots' colour, kept as one array so a change of laser recolours them in place.
    const spotColour: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
    const spots = [0, 1].map((i) =>
      makeEmitter(`laser-spot-${i}`, spotColour, SPOT_HEIGHT, () => 2, SPOT_SHARE),
    );
    const removers = spots.map((s) => addEmitter(s));

    /*
     * Traced once per change (aim, scroll, the panes, a setting), drawn every
     * frame while there is dust to flicker in it: the trace is the costly
     * part, the drawing is not.
     */
    type Traced = { line: Line; segments: BeamSegment[]; frosts: number[] };
    let traced: Traced[] = [];
    let hits: BeamHit[] = [];
    let origin: Vec | null = null;
    let stale = true;

    const trace = () => {
      stale = false;
      traced = [];
      hits = [];
      origin = pointer.x > -9999 ? (aimFrom ?? { x: pointer.x, y: pointer.y }) : null;
      if (!origin) return;
      const geometry = glassGeometry();
      const solids = beamSolids();
      const frosts = [
        ...geometry.map((g) => g.causes.material.frost),
        ...solids.map((s) => s.material.frost),
      ];
      const mirrorEnds = t("laserMirrorEnds") >= 0.5;
      for (const line of lines) {
        // What absorbs this wavelength: the glass's measured absorption, weighted by its colour.
        const weight = line.rgb[0] + line.rgb[1] + line.rgb[2] || 1;
        const absorbOf = (a: readonly [number, number, number]) =>
          (a[0] * line.rgb[0] + a[1] * line.rgb[1] + a[2] * line.rgb[2]) / weight / PATH_UNIT;
        const panes: BeamPane[] = [
          ...geometry.map((g) => ({
            x: g.x,
            y: g.y,
            w: g.w,
            h: g.h,
            r: g.r,
            n: indexAt(line.nm, g.causes.material.ior, g.causes.material.abbe),
            absorb: absorbOf(g.causes.material.absorb),
            mirrorEnds,
          })),
          ...solids.map((s) => {
            const poly = s.outline();
            const xs = poly.map((p) => p.x);
            const ys = poly.map((p) => p.y);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            return {
              x,
              y,
              w: Math.max(...xs) - x,
              h: Math.max(...ys) - y,
              r: 0,
              n: indexAt(line.nm, s.material.ior, s.material.abbe),
              absorb: absorbOf(s.material.absorb),
              poly,
            };
          }),
        ];
        // Further, and through more bounces: a beam to play with (Ony: "make the beam reach further").
        const out = traceBeam(origin, direction, panes, {
          maxLength: t("laserReach"),
          maxDepth: 48,
          minEnergy: 0.006,
        });
        for (const hit of out.hits) hits.push({ ...hit, energy: hit.energy * line.share });
        traced.push({ line, segments: out.segments, frosts });
      }
    };

    let frame = 0;
    /*
     * Our own spots moving is a change of light, which wakes this again: it
     * must not count as a reason to retrace, or the dust's every frame would
     * re-trace the beam and re-light the whole scene (2 fps).
     */
    let announcing = false;
    const announce = () => {
      announcing = true;
      emitterChanged();
      announcing = false;
    };
    const draw = (now: number) => {
      frame = 0;
      const retraced = stale;
      if (stale) trace();
      const dpr = window.devicePixelRatio || 1;
      const w = document.documentElement.clientWidth;
      const h = document.documentElement.clientHeight;
      if (view.width !== Math.round(w * dpr) || view.height !== Math.round(h * dpr)) {
        view.width = Math.round(w * dpr);
        view.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!origin) {
        if (retraced) {
          for (const s of spots) s.charge = 0;
          announce();
        }
        return;
      }
      const power = powerFactor();
      const width = t("laserWidth");
      const dust = t("laserDust");
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const { line, segments, frosts } of traced) {
        segments.forEach((s, si) => {
          const vis =
            (s.inside >= 0
              ? GLASS_SCATTER + FROST_SCATTER * (frosts[s.inside] ?? 0)
              : AIR_SCATTER) * power;
          const grad = ctx.createLinearGradient(s.a.x, s.a.y, s.b.x, s.b.y);
          grad.addColorStop(0, cssOf(line.rgb, Math.min(1, s.energy * vis * line.share)));
          grad.addColorStop(1, cssOf(line.rgb, Math.min(1, s.energyEnd * vis * line.share)));
          // The glow the scattered light makes round the beam...
          ctx.strokeStyle = grad;
          ctx.globalAlpha = 0.28;
          ctx.lineWidth = width * (s.inside >= 0 ? 7.5 : 4);
          ctx.beginPath();
          ctx.moveTo(s.a.x, s.a.y);
          ctx.lineTo(s.b.x, s.b.y);
          ctx.stroke();
          // ...and the beam itself, a thread.
          ctx.globalAlpha = 1;
          ctx.lineWidth = width;
          ctx.stroke();

          /*
           * Dust: specks drifting across the beam in the air, each lit only
           * while it is inside the beam -- the flicker along a real laser
           * (Ony, 2026-10-01). None inside the glass. Each speck has its own
           * place along the beam and drifts across it at its own speed, so
           * it flares and is gone; a few are bigger and flare brighter.
           */
          if (dust <= 0 || s.inside >= 0) return;
          const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
          if (len < 4) return;
          const ux = (s.b.x - s.a.x) / len;
          const uy = (s.b.y - s.a.y) / len;
          const count = Math.min(400, Math.floor((len / 26) * dust));
          const half = Math.max(width * 1.5, 1.5);
          for (let k = 0; k < count; k++) {
            const seed = si * 1013 + k * 7.31 + line.nm;
            const along = hash(seed) * len;
            const speed = 0.004 + 0.012 * hash(seed + 1);
            // Its distance across the beam now: it sweeps through, then away for a while.
            const sweep = ((hash(seed + 2) + (now * speed) / 1000) % 1) * 2 - 1;
            const across = sweep * 14;
            const inBeam = Math.exp(-((across / half) ** 2));
            if (inBeam < 0.04) continue;
            const big = hash(seed + 3) > 0.9;
            const t0 = along / len;
            const energy = s.energy + (s.energyEnd - s.energy) * t0;
            const a = Math.min(1, energy * power * inBeam * (big ? 1 : 0.55) * line.share);
            const x = s.a.x + ux * along - uy * across * 0.15;
            const y = s.a.y + uy * along + ux * across * 0.15;
            const r = big ? 1.6 : 0.9;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
            g.addColorStop(0, `rgb(255 255 255 / ${a.toFixed(3)})`);
            g.addColorStop(0.4, cssOf(line.rgb, a * 0.8));
            g.addColorStop(1, cssOf(line.rgb, 0));
            ctx.fillStyle = g;
            ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);
          }
        });
      }
      // Where it strikes a surface, the surface lights up.
      for (const hit of hits) {
        const e = Math.min(1, hit.energy * power);
        const r = (4 + 16 * e) * Math.max(1, width / 1.2) ** 0.5;
        const g = ctx.createRadialGradient(hit.at.x, hit.at.y, 0, hit.at.x, hit.at.y, r);
        g.addColorStop(0, `rgb(255 255 255 / ${Math.min(1, e * 0.9).toFixed(3)})`);
        g.addColorStop(0.25, css(e));
        g.addColorStop(1, css(0));
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
        ctx.fillRect(hit.at.x - r, hit.at.y - r, r * 2, r * 2);
      }
      // The laser's aperture.
      const ap = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 7);
      ap.addColorStop(0, "rgb(255 255 255 / 0.95)");
      ap.addColorStop(0.35, css(0.9));
      ap.addColorStop(1, css(0));
      ctx.fillStyle = ap;
      ctx.fillRect(origin.x - 7, origin.y - 7, 14, 14);
      ctx.globalCompositeOperation = "source-over";

      // The two brightest spots light the scene, as bright as the laser's output makes them.
      if (retraced) {
        const brightest = [...hits].sort((a, b) => b.energy - a.energy).slice(0, spots.length);
        spots.forEach((s, i) => {
          const hit = brightest[i];
          s.charge = hit ? 1 : 0;
          if (hit) {
            s.x = hit.at.x;
            s.y = hit.at.y;
            s.level = hit.energy * power * power;
          }
        });
        announce();
      }
      // Dust keeps moving: draw again next frame while there is any.
      if (dust > 0) frame = requestAnimationFrame(draw);
    };
    const redraw = () => {
      stale = true;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const stopTuning = onTuningApplied(() => {
      lines = laserLines();
      rgb = lines.length === 1 ? lines[0]!.rgb : [1, 1, 1];
      spotColour.splice(0, 3, rgb[0], rgb[1], rgb[2]);
      redraw();
    });

    const down = (e: PointerEvent) => {
      // Picking another tool from the tray is not aiming this one.
      if (e.target instanceof Element && e.target.closest("[data-tool-tray]")) return;
      aimFrom = { x: e.clientX, y: e.clientY };
      redraw();
    };
    const move = (e: PointerEvent) => {
      if (aimFrom) {
        const dx = e.clientX - aimFrom.x;
        const dy = e.clientY - aimFrom.y;
        if (Math.hypot(dx, dy) > 8) direction = { x: dx, y: dy };
      }
      redraw();
    };
    const up = () => {
      aimFrom = null;
      redraw();
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("resize", redraw);
    const stop = onLightChange(() => {
      if (!announcing) redraw();
    });
    redraw();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("scroll", redraw);
      window.removeEventListener("resize", redraw);
      stop();
      stopTuning();
      for (const remove of removers) remove();
    };
  }, []);

  return <canvas ref={canvas} aria-hidden="true" className="laser-beam" />;
}
