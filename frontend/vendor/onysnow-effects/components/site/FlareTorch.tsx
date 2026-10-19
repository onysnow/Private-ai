import { useEffect, useRef } from "react";
import { flareBrightness, flareLight, lightFlare, sputterAt } from "@fx/effects/light/lights";

/** The drawing's size round the flame, CSS px. */
const SIZE = 420;
/** The flare's paper tube, seen from above as it slants down to the hand: length and width, px. */
const TUBE_LENGTH = 104;
const TUBE_WIDTH = 17;
/** Which way the tube runs from the burning end, toward the hand (down and right). */
const TUBE_ANGLE = Math.PI * 0.3;
/** Which way the smoke drifts: the room's air, gently up and to the left. */
const DRIFT = { x: -9, y: -16 };

type Puff = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
};
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number };

/**
 * The road flare you hold (items 22, 25e): lit for as long as this is
 * mounted. What it does to the scene is the light list's (flareLight); what
 * is drawn here is the flare itself, from what a burning fusee looks like
 * (effects/light/flame):
 *
 *   the paper tube, running back to the hand, lit hot at its burning end;
 *   the flame, seen from above as it rises toward you -- a clipped
 *     pinkish-white core in ragged scarlet tongues that throb with the
 *     puffing and gutter when it sputters;
 *   the smoke, dense and pale, billowing off and drifting, lit red from
 *     within near the flame and grey as it thins away;
 *   sparks, when a lump of slag breaks off: white-hot, cooling to orange and
 *     red as they fly and fall.
 *
 * Two canvases: the tube and the smoke's body cover what is under them; the
 * light -- the flame, the sparks and the smoke's glow -- is screened onto it.
 */
export function FlareTorch() {
  const body = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const putOut = lightFlare();
    const b = body.current?.getContext("2d");
    const g = glow.current?.getContext("2d");
    if (!b || !g || !body.current || !glow.current) return putOut;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [body.current, glow.current]) {
      c.width = SIZE * dpr;
      c.height = SIZE * dpr;
    }
    b.setTransform(dpr, 0, 0, dpr, (SIZE / 2) * dpr, (SIZE / 2) * dpr);
    g.setTransform(dpr, 0, 0, dpr, (SIZE / 2) * dpr, (SIZE / 2) * dpr);

    const puffs: Puff[] = [];
    const sparks: Spark[] = [];
    const start = performance.now();
    let last = start;
    let lastX = flareLight.x;
    let lastY = flareLight.y;
    let smokeDue = 0;
    let wasSputter = 0;
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      if (dt < 1 / 40) return; // the flame's own rate, not the display's
      last = now;
      const s = (now - start) / 1000;
      const layers = [body.current, glow.current];
      const bright = flareBrightness();
      if (bright <= 0) {
        for (const el of layers) if (el) el.style.opacity = "0";
        return;
      }
      const x = flareLight.x;
      const y = flareLight.y;
      for (const el of layers) {
        if (!el) continue;
        el.style.opacity = "1";
        el.style.transform = `translate3d(${x - SIZE / 2}px, ${y - SIZE / 2}px, 0)`;
      }
      // Smoke already in the air stays where it is when the hand moves.
      const moveX = x - lastX;
      const moveY = y - lastY;
      lastX = x;
      lastY = y;

      // ---- The smoke: a few puffs a second, billowing and drifting. ----
      smokeDue += dt * 22;
      while (smokeDue >= 1) {
        smokeDue -= 1;
        const a = Math.random() * Math.PI * 2;
        const v = 6 + Math.random() * 14;
        puffs.push({
          x: Math.cos(a) * 4,
          y: Math.sin(a) * 4,
          vx: Math.cos(a) * v + DRIFT.x,
          vy: Math.sin(a) * v + DRIFT.y,
          age: 0,
          life: 2.2 + Math.random() * 1.6,
          size: 9 + Math.random() * 6,
        });
      }
      // ---- Sparks: a spray when slag breaks off. ----
      const sputter = sputterAt(s);
      if (sputter > 0.5 && wasSputter <= 0.5) {
        const n = 8 + Math.floor(Math.random() * 12);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 60 + Math.random() * 200;
          sparks.push({
            x: 0,
            y: 0,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            age: 0,
            life: 0.25 + Math.random() * 0.55,
          });
        }
      }
      wasSputter = sputter;

      b.clearRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
      g.clearRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);

      // Smoke's body: pale, thin, covering a little of what is under it.
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]!;
        p.age += dt;
        if (p.age >= p.life) {
          puffs.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt - moveX;
        p.y += p.vy * dt - moveY;
        // Billowing: slows as it mixes, swirls a little.
        p.vx *= 1 - dt * 0.6;
        p.vy *= 1 - dt * 0.6;
        p.vx += Math.sin(s * 1.3 + i) * 6 * dt;
        p.vy += Math.cos(s * 1.1 + i * 0.7) * 6 * dt;
        const k = p.age / p.life;
        const r = p.size + 55 * Math.sqrt(k);
        const alpha = 0.42 * (1 - k) * Math.min(1, p.age * 6);
        if (Math.abs(p.x) > SIZE / 2 - r || Math.abs(p.y) > SIZE / 2 - r) continue;
        const shade = b.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        shade.addColorStop(0, `rgb(206 196 196 / ${alpha.toFixed(3)})`);
        shade.addColorStop(1, "rgb(206 196 196 / 0)");
        b.fillStyle = shade;
        b.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        // And its glow: lit scarlet from within, by the inverse square of the distance to the flame.
        const d = Math.hypot(p.x, p.y);
        const lit = (bright * alpha * 3.2) / (1 + (d / 40) ** 2);
        if (lit > 0.004) {
          const hot = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          hot.addColorStop(0, `rgb(255 70 50 / ${Math.min(1, lit).toFixed(3)})`);
          hot.addColorStop(1, "rgb(255 70 50 / 0)");
          g.fillStyle = hot;
          g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        }
      }

      // The tube, back to the hand: red paper, lit hot at the burning end.
      b.save();
      b.rotate(TUBE_ANGLE);
      const tube = b.createLinearGradient(0, 0, TUBE_LENGTH, 0);
      tube.addColorStop(0, "rgb(70 12 8)");
      tube.addColorStop(0.08, `rgb(${Math.round(150 + 90 * bright)} 40 26)`);
      tube.addColorStop(0.3, "rgb(150 24 18)");
      tube.addColorStop(1, "rgb(118 16 12)");
      b.fillStyle = tube;
      b.beginPath();
      b.roundRect(4, -TUBE_WIDTH / 2, TUBE_LENGTH, TUBE_WIDTH, 3);
      b.fill();
      // Round, so shaded across: lit along its middle, dark at its sides.
      const round = b.createLinearGradient(0, -TUBE_WIDTH / 2, 0, TUBE_WIDTH / 2);
      round.addColorStop(0, "rgb(0 0 0 / 0.45)");
      round.addColorStop(0.45, "rgb(255 255 255 / 0.1)");
      round.addColorStop(1, "rgb(0 0 0 / 0.55)");
      b.fillStyle = round;
      b.fill();
      b.restore();

      // ---- The flame: tongues round a clipped core, throbbing. ----
      const throb = bright;
      for (let i = 0; i < 9; i++) {
        const a = i * 0.698 + Math.sin(s * 2.3 + i * 1.7) * 0.5;
        const reach = (12 + 15 * Math.abs(Math.sin(s * 9.5 * Math.PI * 0.2 + i * 2.1))) * throb;
        const tx = Math.cos(a) * reach + DRIFT.x * 0.35;
        const ty = Math.sin(a) * reach + DRIFT.y * 0.35;
        const r = (24 + 9 * Math.sin(s * 11 + i)) * (0.7 + 0.3 * throb);
        const tongue = g.createRadialGradient(tx, ty, 0, tx, ty, r);
        tongue.addColorStop(0, `rgb(255 120 100 / ${Math.min(1, 0.85 * throb).toFixed(3)})`);
        tongue.addColorStop(0.5, `rgb(255 40 30 / ${(0.5 * throb).toFixed(3)})`);
        tongue.addColorStop(1, "rgb(200 10 10 / 0)");
        g.fillStyle = tongue;
        g.fillRect(tx - r, ty - r, r * 2, r * 2);
      }
      // The core: so bright the camera clips it to a pinkish white.
      const coreR = 20 + 6 * throb;
      const core = g.createRadialGradient(0, 0, 0, 0, 0, coreR);
      core.addColorStop(0, `rgb(255 248 246 / ${Math.min(1, 0.4 + 0.6 * throb).toFixed(3)})`);
      core.addColorStop(0.45, `rgb(255 175 170 / ${(0.85 * throb).toFixed(3)})`);
      core.addColorStop(1, "rgb(255 60 50 / 0)");
      g.fillStyle = core;
      g.fillRect(-coreR, -coreR, coreR * 2, coreR * 2);
      // The broad bloom the camera spreads round it.
      const bloomR = 90 + 40 * throb;
      const bloom = g.createRadialGradient(0, 0, 0, 0, 0, bloomR);
      bloom.addColorStop(0, `rgb(255 70 50 / ${(0.5 * throb).toFixed(3)})`);
      bloom.addColorStop(1, "rgb(255 30 20 / 0)");
      g.fillStyle = bloom;
      g.fillRect(-bloomR, -bloomR, bloomR * 2, bloomR * 2);

      // Sparks: short streaks, white-hot cooling to orange then red, falling away.
      g.lineCap = "round";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.age += dt;
        if (p.age >= p.life) {
          sparks.splice(i, 1);
          continue;
        }
        const k = p.age / p.life;
        const ox = p.x;
        const oy = p.y;
        p.x += p.vx * dt - moveX;
        p.y += p.vy * dt - moveY;
        p.vx *= 1 - dt * 1.5;
        p.vy *= 1 - dt * 1.5;
        const green = Math.round(240 - 190 * k);
        const blue = Math.round(200 * (1 - k) ** 3);
        g.strokeStyle = `rgb(255 ${green} ${blue} / ${(1 - k).toFixed(3)})`;
        g.lineWidth = 1.6 * (1 - k * 0.6);
        g.beginPath();
        g.moveTo(ox, oy);
        g.lineTo(p.x, p.y);
        g.stroke();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      putOut();
    };
  }, []);

  // Two layers side by side at the top level, so the light's blend reaches the page.
  const style = { width: SIZE, height: SIZE, opacity: 0 };
  return (
    <>
      <canvas ref={body} aria-hidden="true" className="flare-torch" style={style} />
      <canvas
        ref={glow}
        aria-hidden="true"
        className="flare-torch flare-torch--light"
        style={style}
      />
    </>
  );
}
