import { useEffect } from "react";
import { previewing } from "@fx/effects/engine/preview";
import { addEmitter, emitterChanged, makeEmitter, type Emitter } from "@fx/effects/light/lights";
import { blackbodyRgb } from "@fx/effects/light/blackbody";
import {
  CHEMISTRY,
  dragK,
  ejectionFor,
  FlashLimiter,
  SHELLS,
  stepStar,
  type Chemistry,
} from "@fx/effects/fireworks/physics";

/*
 * The page as a night sky (fireworks.md 7, "Scaling to the page", estimate):
 * a 10-go burst spans about 45% of the window's width; time is real, so the
 * timing reads true even though the distances are scaled.
 */
const SHELL = 10 as const;
const BURN = 2; // a peony's stars burn about 2 s (fireworks.md 2.4)
const STARS = 110;
/* The burnt charcoal a star sheds: ~1900 K (fireworks.md 7 table, estimate). */
const SPARK_RGB = blackbodyRgb(1900);
/* How long the rise takes, s (estimate: a real shell's 3-6 s fuse, shortened for the page). */
const RISE = 1.4;

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  age: number;
  life: number;
  rgb: readonly number[];
};
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number };
type Shell = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  age: number;
  chem: Chemistry;
  chem2: Chemistry | null;
};
type Burst = { emitter: Emitter; remove: () => void; age: number; stars: Star[] };

/**
 * Fireworks over the page (task 81, ?try=fireworks): click to send up a
 * shell, which rises on its tail and bursts where you clicked; a show goes
 * up on its own every couple of seconds. Each star flies out at the speed a
 * 10-go shell gives it and slows by quadratic drag (effects/fireworks/physics,
 * tested against the closed form and the JPA burst widths), burns about
 * 2 s in its chemistry's colour (strontium red, barium green, copper blue,
 * sodium yellow, calcium orange, magnesium white), sheds charcoal sparks
 * and burns out; each burst lights the page in its colour, rising in half
 * a second and dying over one and a half (the measured envelope), no more
 * than three flashes a second (WCAG 2.3.1).
 */
export function Fireworks() {
  useEffect(() => {
    if (!previewing("fireworks")) return;
    const canvas = document.createElement("canvas");
    canvas.className = "fireworks-layer";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => canvas.remove();

    const K = dragK();
    const v0 = ejectionFor(SHELL, BURN, K);
    const W = () => document.documentElement.clientWidth || window.innerWidth;
    const H = () => document.documentElement.clientHeight || window.innerHeight;
    // Metres per CSS px: a 10-go burst over 45% of the width.
    const mpp = () => SHELLS[SHELL].width / (0.45 * W());

    const shells: Shell[] = [];
    const bursts: Burst[] = [];
    const sparks: Spark[] = [];
    const flash = new FlashLimiter();
    const chems = Object.keys(CHEMISTRY) as Chemistry[];
    let serial = 0;

    const launch = (tx: number, ty: number) => {
      const chem = chems[Math.floor(Math.random() * chems.length)]!;
      const chem2 = Math.random() < 0.3 ? chems[Math.floor(Math.random() * chems.length)]! : null;
      shells.push({ x: tx + (Math.random() - 0.5) * 40, y: H() + 10, tx, ty, age: 0, chem, chem2 });
    };

    const burst = (s: Shell) => {
      const m = mpp();
      const stars: Star[] = [];
      for (let k = 0; k < STARS; k++) {
        // A direction on the sphere, seen from the front: the burst's natural centre-dense look.
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const ring = Math.sqrt(1 - u * u);
        const speed = v0 * (0.9 + 0.2 * Math.random());
        const vx = (speed * ring * Math.cos(a)) / 1; // m/s
        const vy = speed * ring * Math.sin(a);
        const chem = s.chem2 && k % 2 ? s.chem2 : s.chem;
        stars.push({
          x: s.tx * m,
          y: (H() - s.ty) * m,
          vx,
          vy,
          px: s.tx,
          py: s.ty,
          age: 0,
          life: BURN * (0.85 + 0.3 * Math.random()),
          rgb: CHEMISTRY[chem],
        });
      }
      const rgb = CHEMISTRY[s.chem];
      // Far off and wide: it lights the whole page a little, in its colour (share of the lamp: estimate, set by eye).
      const emitter = makeEmitter(`burst-${serial++}`, rgb, 900, () => 400, 1);
      // A burst is far off: the floor takes its distance as it is (inverse square), so it lights the page faintly.
      emitter.physicalFloor = true;
      emitter.x = s.tx;
      emitter.y = s.ty;
      const lights = flash.allow(performance.now());
      bursts.push({ emitter, remove: lights ? addEmitter(emitter) : () => {}, age: 0, stars });
      // At most three burst lights at once (fireworks.md 7: light slots); the oldest stops lighting.
      const lit = bursts.filter((b) => b.emitter.charge >= 0);
      if (lit.length > 3) lit[0]!.remove();
    };

    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || e.target.closest("[data-tool-tray], a, button, input"))
        return;
      launch(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", onDown);

    let frame = 0;
    let last = performance.now();
    let nextAuto = last + 600;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const w = W();
      const h = H();
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (now > nextAuto) {
        launch(w * (0.15 + 0.7 * Math.random()), h * (0.15 + 0.3 * Math.random()));
        nextAuto = now + 1600 + Math.random() * 1600;
      }
      const m = mpp();
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // Rising shells: a dim tail of sparks.
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]!;
        s.age += dt;
        const f = Math.min(1, s.age / RISE);
        const ease = 1 - (1 - f) * (1 - f);
        const x = s.x + (s.tx - s.x) * ease;
        const y = h + 10 + (s.ty - h - 10) * ease;
        if (Math.random() < 0.8)
          sparks.push({
            x: x * m,
            y: (h - y) * m,
            vx: (Math.random() - 0.5) * 2,
            vy: -4,
            age: 0,
            life: 0.5,
          });
        ctx.fillStyle = "rgba(255, 200, 140, 0.9)";
        ctx.fillRect(x - 1, y - 1, 2, 2);
        if (f >= 1) {
          burst(s);
          shells.splice(i, 1);
        }
      }

      // Stars.
      for (let b = bursts.length - 1; b >= 0; b--) {
        const B = bursts[b]!;
        B.age += dt;
        // The burst's light: rises in 0.5 s, dies over 1.5 s (the measured envelope).
        const env = B.age < 0.5 ? B.age / 0.5 : Math.max(0, 1 - (B.age - 0.5) / 1.5);
        B.emitter.charge = env;
        B.emitter.level = env;
        for (const s of B.stars) {
          s.age += dt;
          if (s.age > s.life) continue;
          stepStar(s, dt, K);
          const sx = s.x / m;
          const sy = h - s.y / m;
          // Charcoal sparks shed as it burns.
          if (Math.random() < dt * 25)
            sparks.push({
              x: s.x,
              y: s.y,
              vx: s.vx * 0.2,
              vy: s.vy * 0.2,
              age: 0,
              life: 0.4 + Math.random() * 0.5,
            });
          // Bright, flickering toward burn-out; drawn over the shutter's open time as a short streak.
          const left = 1 - s.age / s.life;
          const flicker = left < 0.2 ? 0.5 + 0.5 * Math.random() : 1;
          const a = Math.min(1, 0.4 + left) * flicker;
          ctx.strokeStyle = `rgba(${Math.round(255 * s.rgb[0]!)}, ${Math.round(255 * s.rgb[1]!)}, ${Math.round(255 * s.rgb[2]!)}, ${a})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(s.px, s.py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          // The core clips to white, as a camera records it.
          ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.8})`;
          ctx.fillRect(sx - 1, sy - 1, 2, 2);
          s.px = sx;
          s.py = sy;
        }
        if (B.age > 4) {
          B.remove();
          bursts.splice(b, 1);
        }
      }
      // Sparks: tiny, orange, slowed hard by the air, falling.
      ctx.fillStyle = `rgb(${Math.round(255 * SPARK_RGB[0])}, ${Math.round(255 * Math.min(1, SPARK_RGB[1] * 1.6))}, ${Math.round(255 * SPARK_RGB[2])})`;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.age += dt;
        if (p.age > p.life) {
          sparks.splice(i, 1);
          continue;
        }
        p.vx *= Math.exp(-6 * dt);
        p.vy = p.vy * Math.exp(-6 * dt) - 9.81 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = 1 - p.age / p.life;
        ctx.fillRect(p.x / m - 0.75, h - p.y / m - 0.75, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (bursts.length) emitterChanged();
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", onDown);
      for (const b of bursts) b.remove();
      canvas.remove();
    };
  }, []);
  return null;
}
