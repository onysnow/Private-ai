import { useEffect, useRef, useState } from "react";
import {
  PRINT_LONG_SIDE,
  advance,
  atRest,
  developed,
  pointOf,
  printBody,
  type Grip,
  type PrintBody,
  type Swing,
} from "@fx/effects/secrets/hanging-print";

/** The print's long side on the page, px. */
const LONG_PX = 360;
/** Where the line runs, px from the top, and where the peg is along it (share of the width). */
const LINE_Y = 96;
const PEG_AT = 0.74;

/**
 * The photograph you took, hanging on the line to dry in the red room
 * (item 40; effects/secrets/hanging-print has the physics). It comes up in
 * the developer as you watch; grab it and swing it.
 */
export function HangingPrint({ src }: { src: string }) {
  const [aspect, setAspect] = useState<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const cord = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const safe = useRef<HTMLDivElement>(null);
  const safeImage = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setAspect(probe.naturalWidth / probe.naturalHeight || 0.8);
    probe.onerror = () => setAspect(0.8);
    probe.src = src;
  }, [src]);

  useEffect(() => {
    if (aspect === null) return;
    const body: PrintBody = printBody(aspect);
    const mPerPx = PRINT_LONG_SIDE / LONG_PX;
    const wPx = body.width / mPerPx;
    const hPx = body.height / mPerPx;
    const cordPx = body.cord / mPerPx;
    const node = sheet.current;
    const line = cord.current;
    const img = image.current;
    const shade = safe.current;
    const shadeImg = safeImage.current;
    if (!node || !line || !img || !shade || !shadeImg) return;
    node.style.width = `${wPx}px`;
    node.style.height = `${hPx}px`;
    line.style.height = `${cordPx}px`;

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Just hung: it was let go a little to one side.
    let s: Swing = still ? { a: 0, b: 0, va: 0, vb: 0 } : { a: 0.35, b: 0.18, va: 0, vb: 0 };
    let grip: Grip | null = null;
    const born = performance.now();
    let last = born;
    let frame = 0;
    let hand: [number, number] = [-1e4, -1e4];
    const peg = () => [window.innerWidth * PEG_AT, LINE_Y] as const;

    const draw = () => {
      const [px, py] = peg();
      const [cx, cy] = pointOf(body, s, 0, 0);
      line.style.transform = `translate(${px}px, ${py}px) rotate(${-s.a}rad)`;
      const left = px + cx / mPerPx - wPx / 2;
      const top = py + cy / mPerPx;
      node.style.transform = `translate(${left}px, ${top}px) rotate(${-s.b}rad)`;
      const dev = String(developed((performance.now() - born) / 1000));
      img.style.opacity = dev;
      shadeImg.style.opacity = dev;
      // The loupe in the sheet's own frame: about the clip (top centre), turned back by b.
      const dx = hand[0] - (left + wPx / 2);
      const dy = hand[1] - top;
      const cb = Math.cos(s.b);
      const sb = Math.sin(s.b);
      shade.style.setProperty("--lx", `${dx * cb - dy * sb + wPx / 2}px`);
      shade.style.setProperty("--ly", `${dx * sb + dy * cb}px`);
    };
    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      s = advance(body, s, dt, grip);
      draw();
      const developing = developed((now - born) / 1000) < 0.999;
      if (grip || developing || !atRest(s)) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    /** A page point to metres from the peg. */
    const toBody = (x: number, y: number): [number, number] => {
      const [px, py] = peg();
      return [(x - px) * mPerPx, (y - py) * mPerPx];
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      // Where on the sheet it was taken hold of, in the sheet's own frame.
      const [mx, my] = toBody(e.clientX, e.clientY);
      const [cx, cy] = pointOf(body, s, 0, 0);
      const dx = mx - cx;
      const dy = my - cy;
      const cb = Math.cos(s.b);
      const sb = Math.sin(s.b);
      grip = { x: dx * cb - dy * sb, y: dx * sb + dy * cb, to: [mx, my] };
      node.dataset["held"] = "";
      wake();
    };
    const move = (e: PointerEvent) => {
      if (!grip) return;
      grip.to = toBody(e.clientX, e.clientY);
    };
    // The loupe follows the pointer everywhere, so the print redraws under it.
    const look = (e: PointerEvent) => {
      hand = [e.clientX, e.clientY];
      if (!frame) draw();
    };
    const up = () => {
      grip = null;
      delete node.dataset["held"];
      wake();
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    window.addEventListener("resize", wake);
    window.addEventListener("pointermove", look, { passive: true });
    draw();
    wake();
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      window.removeEventListener("resize", wake);
      window.removeEventListener("pointermove", look);
    };
  }, [aspect]);

  return (
    <div className="red-room__line" aria-hidden="true">
      <div ref={cord} className="red-room__cord" />
      <div
        ref={sheet}
        className="red-room__print"
        style={{ visibility: aspect ? "visible" : "hidden" }}
      >
        {/* Under the loupe: the print as it really is, white paper and colour. */}
        <img ref={image} className="red-room__true" src={src} alt="" draggable={false} />
        {/* Everywhere else: the same print under the safelight. */}
        <div ref={safe} className="red-room__safe">
          <img ref={safeImage} src={src} alt="" draggable={false} />
        </div>
        <span className="red-room__clip" />
      </div>
    </div>
  );
}
