import { useEffect, useRef } from "react";
import { pointer, setFire } from "@fx/effects/light/lights";
import { flameFlickerAt, TORCH } from "@fx/effects/light/flame";
import { setRoomFillOverride } from "@fx/effects/light/room-fill";

/** The drawing round the flame, CSS px; the flame is drawn at half that resolution and scaled up. */
const W = 240;
const H = 360;
const SCALE = 2;
/** Where the burning head is in the drawing. */
const HEAD = { x: W / 2, y: H * 0.72 };
/** The flame's length at its steady level, px (estimate: a hand torch's flame at R6's 3.6 px/mm). */
const FLAME_PX = 120;
const PX_PER_M = 3600;
/**
 * The room while the torch burns: a torch is about 0.22x a 60 W bulb
 * (flame.md 6.2, computed from PLOS 14 cd vs 64 cd), so it only reads as a
 * light in the dark (estimate: the room at 0.12).
 */
const ROOM_WHILE_LIT = 0.12;

/** Value noise, smoothly interpolated, for the flame's turbulence. */
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

type Ember = { x: number; y: number; vx: number; vy: number; age: number; life: number };

/**
 * A burning torch in the hand (task 82, ?try=fire or the tray). Its light
 * is the light list's (fireLight): the glass, the photographs and every
 * caster's shadow answer it, flickering as a torch's flame does
 * (flame.md 6.2: puffing at 6.7 Hz for a 5 cm head, slower wander, the odd
 * gutter). Drawn here, procedurally (flame.md 6.1): a teardrop of flame
 * whose length follows its brightness (L ~ B^0.4), torn by scrolling noise,
 * hottest and clipped to white at its core, deep orange at its edges; it
 * trails the hand by the Froude tilt, tan(theta) = min(3, v / sqrt(g L)),
 * and fanning it (moving fast) makes it burn brighter, up to +40% (PLOS:
 * 5 to 28 lux), rising in 0.3 s and dying over 2 s. Embers drop off it.
 * While it burns, the room goes dark around it.
 */
export function FireTorch() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = W;
    canvas.height = H;
    const small = document.createElement("canvas");
    small.width = W / SCALE;
    small.height = H / SCALE;
    const sctx = small.getContext("2d");
    if (!sctx) return;
    const img = sctx.createImageData(small.width, small.height);
    const embers: Ember[] = [];
    const start = performance.now();
    let last = start;
    let lastPointer = { x: pointer.x, y: pointer.y };
    let fan = 0;
    let tilt = 0;
    let frame = 0;
    setRoomFillOverride(ROOM_WHILE_LIT);

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = (now - start) / 1000;
      const held = pointer.x > -9999;
      // The hand's speed, for the tilt and the fanning.
      let vx = 0;
      if (held && lastPointer.x > -9999 && dt > 0) {
        vx = (pointer.x - lastPointer.x) / dt;
        const speed = Math.hypot(vx, (pointer.y - lastPointer.y) / dt);
        // Fanning: up to +40%, 0.3 s to rise, 2 s to die away (flame.md 6.2).
        const target = Math.min(1, speed / 1500) * 0.4;
        fan += (target - fan) * (1 - Math.exp(-dt / (target > fan ? 0.3 : 2)));
      }
      lastPointer = { x: pointer.x, y: pointer.y };
      const level = flameFlickerAt(s, TORCH) * (1 + fan);
      const length = FLAME_PX * Math.pow(level, 0.4);
      // The Froude tilt, the flame trailing the hand's sideways speed.
      const vMs = vx / PX_PER_M;
      const lM = length / PX_PER_M;
      const want = Math.atan(Math.max(-3, Math.min(3, -vMs / Math.sqrt(9.81 * lM))));
      tilt += (want - tilt) * (1 - Math.exp(-dt / 0.12));

      // The light: 0.35 of the flame's length above the head, wandering with the puff.
      const jitterY = 0.07 * length * Math.sin(s * 6.7 * Math.PI * 2);
      const jitterX = 0.03 * length * Math.sin(s * 3.1 * Math.PI * 2 + 1);
      const ax = Math.sin(tilt) * 0.35 * length;
      const ay = -Math.cos(tilt) * 0.35 * length;
      setFire(pointer.x + ax + jitterX, pointer.y + ay + jitterY, level, held ? 1 : 0);
      canvas.style.transform = `translate(${pointer.x - HEAD.x}px, ${pointer.y - HEAD.y}px)`;
      canvas.style.opacity = held ? "1" : "0";

      // The flame, per pixel at half resolution.
      const d = img.data;
      const sw = small.width;
      const sh = small.height;
      const hx = HEAD.x / SCALE;
      const hy = HEAD.y / SCALE;
      const Ls = length / SCALE;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const k = (y * sw + x) * 4;
          // Into the flame's frame: v up its axis (0 at the head, 1 at the tip), u across.
          const dx = x - hx;
          const dy = hy - y;
          let u = dx * ct - dy * st;
          let v = (dx * st + dy * ct) / Ls;
          if (v < -0.08 || v > 1.3) {
            d[k + 3] = 0;
            continue;
          }
          // Turbulence: noise scrolling up the flame, stronger toward the tip.
          const n1 = noise(u * 0.18, v * 4 - s * 3.2) - 0.5;
          const n2 = noise(u * 0.4 + 7, v * 9 - s * 6.5) - 0.5;
          u += (n1 * 0.5 + n2 * 0.25) * Ls * 0.35 * Math.max(v, 0);
          v += (n1 * 0.12 + n2 * 0.06) * Math.max(v, 0);
          const half =
            Ls *
            0.22 *
            Math.pow(Math.max(1 - v, 0), 0.7) *
            Math.sqrt(Math.min(1, Math.max(v, 0) * 5 + 0.15));
          const r = half > 0.01 ? Math.abs(u) / half : 9;
          const body = Math.max(0, 1 - r * r);
          const heat = body * Math.pow(Math.max(1 - v, 0), 0.6) * Math.min(1.2, level);
          if (heat <= 0.003) {
            d[k + 3] = 0;
            continue;
          }
          // Exposure of the flame's own colour: the core clips to white-yellow, the edges stay orange-red.
          const e = heat * 4.5;
          const cr = 1 - Math.exp(-e * 1.0);
          const cg = 1 - Math.exp(-e * 0.42);
          const cb = 1 - Math.exp(-e * 0.09);
          // Light, not paint: alpha is its brightest channel, so a dim edge adds a little light instead of darkening.
          const peak = Math.max(cr, 1e-4);
          d[k] = 255 * (cr / peak);
          d[k + 1] = 255 * (cg / peak);
          d[k + 2] = 255 * (cb / peak);
          d[k + 3] = 255 * Math.min(1, peak);
        }
      }
      sctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // The stick, back to the hand.
      ctx.save();
      ctx.translate(HEAD.x, HEAD.y);
      ctx.rotate(0.35);
      const grad = ctx.createLinearGradient(0, 0, 0, 90);
      grad.addColorStop(0, "#2a1408");
      grad.addColorStop(0.15, "#5a3418");
      grad.addColorStop(1, "#3b2312");
      ctx.fillStyle = grad;
      ctx.fillRect(-6, 4, 12, 90);
      // The burning head: charred, glowing.
      ctx.fillStyle = `rgba(255, ${Math.round(90 + 60 * level)}, 20, ${0.55 + 0.3 * level})`;
      ctx.beginPath();
      ctx.ellipse(0, 6, 10, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(small, 0, 0, W, H);
      // Embers: a few, dropping under gravity and fading.
      if (Math.random() < dt * 2.5) {
        embers.push({
          x: HEAD.x + (Math.random() - 0.5) * 12,
          y: HEAD.y,
          vx: (Math.random() - 0.5) * 40,
          vy: -20 - Math.random() * 40,
          age: 0,
          life: 0.8 + Math.random() * 0.8,
        });
      }
      for (const em of embers) {
        em.age += dt;
        em.vy += 400 * dt;
        em.x += em.vx * dt;
        em.y += em.vy * dt;
        const f = Math.max(0, 1 - em.age / em.life);
        ctx.fillStyle = `rgba(255, ${Math.round(120 + 100 * f)}, 40, ${f})`;
        ctx.fillRect(em.x - 1, em.y - 1, 2, 2);
      }
      for (let i = embers.length - 1; i >= 0; i--)
        if (embers[i]!.age > embers[i]!.life) embers.splice(i, 1);
      ctx.globalCompositeOperation = "source-over";
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      setFire(-9999, -9999, 1, 0);
      setRoomFillOverride(1);
    };
  }, []);

  return <canvas ref={ref} className="fire-torch" aria-hidden="true" />;
}
