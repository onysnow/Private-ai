import { useEffect } from "react";
import { previewing } from "@fx/effects/engine/preview";
import { addTask, ORDER } from "@fx/effects/engine/scheduler";
import { pointLights, pointer } from "@fx/effects/light/lights";
import { camera } from "@fx/effects/camera/camera";
import { Net, SPIRAL } from "@fx/effects/webs/net";
import { orbWeb } from "@fx/effects/webs/orb";

/** The room's draught across the web, px/s: 0.05-0.15 m/s indoors at 600 px/m (balloons.md 3.2, spider-webs 6.2). */
const BREEZE = 45;
/** How far the pointer's wake reaches, px (spider-webs 6.2: 80-160, estimate). */
const WAKE_RADIUS = 120;
/** Grab radius, px (spider-webs 6.2; Tearable Cloth uses 20). */
const GRAB = 16;
/** A flick faster than this cuts the threads it crosses, px/s (estimate). */
const FLICK = 2500;
/** The silk's own visibility, and its glint's spread (spider-webs 6.2: 0.08 rad, estimate). */
const BASE_ALPHA = 0.07;
const GLINT_ROUGHNESS = 0.08;
/** How far the web hangs in front of the photograph, px (estimate: the frame it spans is in front). */
const WEB_DEPTH = 30;

/**
 * A garden spider's orb web in the corner of the hero (task 75, ?try=webs),
 * generated from measured webs (effects/webs/orb), its threads solved by
 * XPBD (effects/webs/net) -- radials stiff, the capture spiral 100x softer,
 * every thread pulling only, breaking at its own strain. The room's air and
 * the pointer's wake sway it; grab a thread to pull it, pull too far and it
 * tears; flick across it to cut through. Silk is nearly invisible: what
 * shows is each light's glint, where a thread is turned so the light it
 * reflects (a cone round the fibre, Kajiya-Kay) reaches the eye -- an arc
 * of bright segments round the hub that moves with the lamp (spider-webs 2.1).
 */
export function SpiderWebs() {
  useEffect(() => {
    if (!previewing("webs")) return;
    const host =
      document.querySelector<HTMLElement>("main h1")?.closest<HTMLElement>("section") ??
      document.querySelector<HTMLElement>("main > *");
    if (!host) return;
    /*
     * A fixed layer over the page, drawn where the host is each frame: put
     * inside the host, the canvas went in before React had hydrated it and
     * the section was thrown away and rebuilt.
     */
    const canvas = document.createElement("canvas");
    canvas.className = "spider-web-layer";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    const W = host.clientWidth;
    const frame = { x: Math.max(0, W - 460), y: 72, w: 440, h: 400 };
    const web = orbWeb({ ...frame, radials: 24, turns: 18, seed: 11 });
    const net = new Net(web.positions, web.edges, web.pins);

    let inView = true;
    const seen = new IntersectionObserver(([e]) => {
      inView = Boolean(e?.isIntersecting);
      if (inView) task.wake();
    });
    seen.observe(host);

    // The pointer, in host px, and its speed.
    let last = { x: -9999, y: -9999, t: performance.now() };
    let wake = { x: 0, y: 0 };
    let held = -1;
    const local = (x: number, y: number) => {
      const r = host.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e.clientX, e.clientY);
      const i = net.nearest(p.x, p.y, GRAB);
      if (i >= 0 && !net.isPinned(i)) held = i;
    };
    const onUp = () => {
      if (held >= 0) net.release(held);
      held = -1;
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    let time = 0;
    const task = addTask("spider-webs", ORDER.scene, (now, dtMs) => {
      if (!inView) return false;
      const dt = Math.min(dtMs / 1000, 1 / 30);
      time += dt;
      const p = pointer.x > -9999 ? local(pointer.x, pointer.y) : null;
      if (p && last.x > -9999) {
        const pdt = Math.max((now - last.t) / 1000, 1e-3);
        const vx = Math.max(-3000, Math.min(3000, (p.x - last.x) / pdt));
        const vy = Math.max(-3000, Math.min(3000, (p.y - last.y) / pdt));
        wake = { x: wake.x * 0.7 + vx * 0.3, y: wake.y * 0.7 + vy * 0.3 };
        // A flick cuts what it crosses.
        if (Math.hypot(vx, vy) > FLICK && held < 0) net.cut(last.x, last.y, p.x, p.y);
      } else {
        wake = { x: 0, y: 0 };
      }
      last = p ? { x: p.x, y: p.y, t: now } : { x: -9999, y: -9999, t: now };
      if (held >= 0 && p) net.hold(held, p.x, p.y);
      const bx = BREEZE * (Math.sin(time * 0.7) * 0.7 + Math.sin(time * 1.9 + 1) * 0.3);
      const by = BREEZE * 0.3 * Math.sin(time * 0.5 + 2);
      const air = (x: number, y: number): readonly [number, number] => {
        if (!p) return [bx, by];
        const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
        const f = Math.exp(-d2 / (2 * WAKE_RADIUS * WAKE_RADIUS));
        return [bx + wake.x * 0.5 * f, by + wake.y * 0.5 * f];
      };
      // Silk weighs next to nothing against the air: a tenth of g at 600 px/m (estimate); k_air 0.8.
      net.step(dt, 8, 600, 0.8, air);
      draw();
      return true;
    });

    const draw = () => {
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      const r = host.getBoundingClientRect();
      // The web lives in the host's px: draw it where the host is now.
      ctx.setTransform(1, 0, 0, 1, r.left, r.top);
      const D = camera.distance(vw);
      const lights = pointLights().filter((l) => !l.below && l.charge > 0.002);

      // The silk itself, barely there.
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgba(235, 235, 230, ${BASE_ALPHA})`;
      ctx.beginPath();
      for (let k = 0; k < net.m; k++) {
        if (!net.alive[k]) continue;
        const a = net.ea[k]!;
        const b = net.eb[k]!;
        ctx.moveTo(net.x[a]!, net.y[a]!);
        ctx.lineTo(net.x[b]!, net.y[b]!);
      }
      ctx.stroke();

      if (lights.length === 0) return;
      // Each light's glint: the cone condition T.L = -T.V, per 6 px piece of thread.
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let k = 0; k < net.m; k++) {
        if (!net.alive[k]) continue;
        const a = net.ea[k]!;
        const b = net.eb[k]!;
        const ax = net.x[a]!;
        const ay = net.y[a]!;
        const bx = net.x[b]!;
        const by = net.y[b]!;
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 0.5) continue;
        const tx = (bx - ax) / len;
        const ty = (by - ay) / len;
        const pieces = Math.max(1, Math.ceil(len / 6));
        // The capture spiral is glue-beaded and glints softer and brighter (spider-webs 2.2).
        const gain = net.type[k] === SPIRAL ? 1.2 : 0.9;
        for (let q = 0; q < pieces; q++) {
          const f0 = q / pieces;
          const f1 = (q + 1) / pieces;
          const mx = ax + (bx - ax) * (f0 + f1) * 0.5;
          const my = ay + (by - ay) * (f0 + f1) * 0.5;
          // In page px, for the lights and the eye.
          const px = mx + r.left;
          const py = my + r.top;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          for (const l of lights) {
            const lx = l.x - px;
            const ly = l.y - py;
            const lz = Math.max(l.height, WEB_DEPTH + 40) - WEB_DEPTH;
            const ll = Math.hypot(lx, ly, lz);
            const ex = vw / 2 - px;
            const ey = vh / 2 - py;
            const ez = D - WEB_DEPTH;
            const el = Math.hypot(ex, ey, ez);
            const dev = (tx * lx + ty * ly) / ll + (tx * ex + ty * ey) / el;
            const g = Math.exp(-(dev * dev) / (2 * GLINT_ROUGHNESS * GLINT_ROUGHNESS));
            if (g < 0.02) continue;
            const s = g * gain * l.charge * Math.min(l.gain / 8, 2);
            cr += l.colour[0] * s;
            cg += l.colour[1] * s;
            cb += l.colour[2] * s;
          }
          const peak = Math.max(cr, cg, cb);
          if (peak < 0.02) continue;
          ctx.strokeStyle = `rgba(${Math.round(255 * Math.min(1, cr / peak))}, ${Math.round(255 * Math.min(1, cg / peak))}, ${Math.round(255 * Math.min(1, cb / peak))}, ${Math.min(1, peak)})`;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(ax + (bx - ax) * f0, ay + (by - ay) * f0);
          ctx.lineTo(ax + (bx - ax) * f1, ay + (by - ay) * f1);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    };

    // For the verification rigs (dev only).
    if ((process.env.NODE_ENV !== "production")) (window as unknown as { __web?: unknown }).__web = { net, host };
    task.wake();
    return () => {
      task.stop();
      seen.disconnect();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      canvas.remove();
    };
  }, []);
  return null;
}
