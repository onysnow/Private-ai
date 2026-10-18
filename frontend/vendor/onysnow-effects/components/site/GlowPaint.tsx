import { beamFactor } from "@fx/effects/light/beam";
import { useEffect, useRef } from "react";
import {
  FLASH_DECAY,
  addEmitter,
  cursorLamp,
  flashLight,
  emitterChanged,
  makeEmitter,
  onFlash,
  onLightChange,
  pointLights,
  type Light,
} from "@fx/effects/light/lights";
import { nearestOnLight } from "@fx/effects/light/light-uniforms";
import { irradianceFalloff } from "@fx/effects/optics/transmission";
import {
  CHARGE_RATE,
  PHOSPHOR_GLOW,
  decay,
  excitationShare,
  excite,
  glowOf,
  type PhosphorCell,
} from "@fx/effects/materials/phosphor";

/** Cells per CSS pixel: the glow is soft, a coarse field drawn smooth is enough. */
const CELL = 4;
/** The brush a drag paints light in with, CSS px. */
const BRUSH = 14;
/**
 * How bright the paint's own glow is as a light on what is round it, as a
 * share of the lamp, fully charged over the whole board: a phosphor glows
 * faintly -- a fraction of a candela per square metre after the first
 * minutes -- so the glass by it catches only a green breath of it.
 */
const GLOW_SHARE = 0.12;

/**
 * A board painted with glow-in-the-dark paint (items 25, 25f). Draw on it
 * and the line glows. Every light in the scene charges it by how much of its
 * light is short enough to (effects/materials/phosphor excitationShare) and
 * how much reaches each point (the physical falloff): the black light
 * fastest, the flash a little, the warm lamp barely, the flare and a red or
 * green laser not at all. Then it fades the way the paint does: a hard drop
 * in the first seconds, then a mid glow that sinks slowly to nothing. And
 * its glow is a light in the scene, so the glass near it catches it.
 *
 * The field is a coarse grid of cells, each with its two stores of light,
 * drawn up smooth and added to what is behind. The loop sleeps when the
 * board is dark and nothing is lighting it.
 */
export function GlowPaint({ className }: { className?: string }) {
  const board = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = board.current;
    const view = canvas.current;
    if (!host || !view) return;
    const ctx = view.getContext("2d");
    if (!ctx) return;
    let cols = 1;
    let rows = 1;
    let cells: PhosphorCell[] = [];
    let image = ctx.createImageData(1, 1);
    const size = () => {
      const r = host.getBoundingClientRect();
      cols = Math.max(1, Math.ceil(r.width / CELL));
      rows = Math.max(1, Math.ceil(r.height / CELL));
      cells = Array.from({ length: cols * rows }, () => ({ fast: 0, slow: 0 }));
      view.width = cols;
      view.height = rows;
      image = ctx.createImageData(cols, rows);
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(host);

    /** Light a disc of the board, in CSS px from its corner. */
    const stamp = (x: number, y: number, radius: number, amount: number) => {
      const cx = x / CELL;
      const cy = y / CELL;
      const r = radius / CELL;
      for (let j = Math.max(0, Math.floor(cy - r)); j < Math.min(rows, Math.ceil(cy + r)); j++) {
        for (let i = Math.max(0, Math.floor(cx - r)); i < Math.min(cols, Math.ceil(cx + r)); i++) {
          const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / r;
          if (d < 1) excite(cells[j * cols + i]!, amount * (1 - d * d));
        }
      }
    };

    /** Charge every cell from one light, by the falloff to it. */
    const chargeFrom = (light: Light, strength: number, rect: DOMRect) => {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const px = rect.left + (i + 0.5) * CELL;
          const py = rect.top + (j + 0.5) * CELL;
          const [lx, ly] = nearestOnLight([px, py], [light.x, light.y], light.span);
          const reach =
            irradianceFalloff(Math.hypot(px - lx, py - ly), light.height) *
            beamFactor(light.aim, px - lx, py - ly, -light.height);
          if (reach > 0.002) excite(cells[j * cols + i]!, strength * reach);
        }
      }
    };

    /*
     * The paint's glow, as a light in the scene. The board is an area of
     * light, and the light list's nearest match is a line along its length
     * as wide as the board is tall: a line light (so it reaches along the
     * whole board) with the board's half-height as both its size and its
     * standoff, so what it lights is lit broadly and softly, never as the
     * hot line a thin tube would make.
     */
    let half = 0;
    let halfTall = 20;
    const glowLight = makeEmitter(
      "glow-paint",
      PHOSPHOR_GLOW,
      () => halfTall,
      () => halfTall,
      GLOW_SHARE,
      () => [half, 0],
    );
    const removeGlow = addEmitter(glowLight);

    let frame = 0;
    let last = performance.now();
    let drawing = false;
    let charging = false;
    let prev: { x: number; y: number } | null = null;
    const draw = (now: number) => {
      frame = 0;
      // Real time, so the paint fades at its own rate however slow the frames
      // are (capped at a second: a tab put away does not fade in one step).
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      const rect = host.getBoundingClientRect();
      // Every light charges what it reaches, by how much of it is short enough to.
      charging = false;
      const lamps = pointLights().filter((l) => l.id !== glowLight.id && l.charge > 0 && !l.below);
      const reference = Math.max(cursorLamp.gain, 1e-6);
      for (const light of lamps) {
        const share = excitationShare(light);
        if (share < 0.001) continue;
        /*
         * How long it has shone this frame. The flash is a pulse far shorter
         * than a slow frame, so it gets what it actually gave since the last
         * frame (and not before it fired) -- its charge falls as
         * exp(-t / FLASH_DECAY) -- not its brightness now times the frame.
         */
        const age = -FLASH_DECAY * Math.log(Math.max(light.charge, 1e-6));
        const shone =
          light === flashLight ? FLASH_DECAY * (Math.exp(Math.min(dt, age) / FLASH_DECAY) - 1) : dt;
        const strength = (CHARGE_RATE * shone * share * light.charge * light.gain) / reference;
        if (strength < 1e-5) continue;
        charging = true;
        chargeFrom(light, strength, rect);
      }
      let lit = 0;
      let total = 0;
      const data = image.data;
      for (let k = 0; k < cells.length; k++) {
        const cell = cells[k]!;
        decay(cell, dt);
        const g = glowOf(cell);
        lit = Math.max(lit, g);
        total += g;
        const o = k * 4;
        data[o] = PHOSPHOR_GLOW[0] * 255;
        data[o + 1] = PHOSPHOR_GLOW[1] * 255;
        data[o + 2] = PHOSPHOR_GLOW[2] * 255;
        data[o + 3] = g * 255;
      }
      ctx.putImageData(image, 0, 0);
      // Its light on the scene: as bright as the board glows, on the whole.
      const mean = total / Math.max(cells.length, 1);
      half = rect.width / 2;
      halfTall = Math.max(10, rect.height / 2);
      glowLight.x = rect.left + rect.width / 2;
      glowLight.y = rect.top + rect.height / 2;
      const level = Math.min(1, mean * 3);
      const on = mean > 0.003 ? 1 : 0;
      // Relight the scene only when the glow has changed enough to see.
      if (on !== glowLight.charge || Math.abs(level - glowLight.level) > 0.01) {
        glowLight.level = level;
        glowLight.charge = on;
        emitterChanged();
      }
      // Asleep once it is dark and nothing is lighting it.
      if (lit > 0.004 || drawing || charging) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    };

    const at = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      prev = at(e);
      stamp(prev.x, prev.y, BRUSH, 1);
      wake();
    };
    const move = (e: PointerEvent) => {
      if (!drawing || !prev) return;
      const p = at(e);
      // A continuous line, however fast the pointer moves.
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / (BRUSH / 3)));
      for (let s = 1; s <= steps; s++) {
        stamp(
          prev.x + ((p.x - prev.x) * s) / steps,
          prev.y + ((p.y - prev.y) * s) / steps,
          BRUSH,
          0.5,
        );
      }
      prev = p;
      wake();
    };
    const up = () => {
      drawing = false;
      prev = null;
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // Any light moving, burning up or firing may be charging it.
    const stopLights = onLightChange(wake);
    const stopFlash = onFlash(wake);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      stopLights();
      stopFlash();
      removeGlow();
    };
  }, []);

  return (
    <div
      ref={board}
      className={className ? `glow-paint ${className}` : "glow-paint"}
      data-glow-paint
    >
      <canvas ref={canvas} aria-hidden="true" className="glow-paint__light" />
      <span className="glow-paint__hint">
        Draw here. Or charge it with a light: the black light best.
      </span>
    </div>
  );
}
