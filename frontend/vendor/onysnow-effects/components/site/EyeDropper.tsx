import { useEffect, useRef } from "react";
import { dripAt } from "@fx/effects/water/drip";
import { t } from "@fx/lib/tuning";

/*
 * The eye dropper (Ony, 2026-10-09): a glass pipette with a rubber bulb,
 * held with its tip at the pointer. Press to let one drop fall onto the
 * glass; hold and the drops keep coming (Water > "Dropper drips"), each a
 * little bigger or smaller than the last, as a squeezed bulb gives them.
 * Chosen in the lab (Cursor > "What the cursor holds") or from the tray
 * with the rain on.
 */

/** The pipette, drawn in CSS px: its tip is at (TIP_X, TIP_Y) of the box. */
const W = 30;
const H = 78;
const TIP_X = 15;
const TIP_Y = 76;

export function EyeDropper() {
  const glyph = useRef<HTMLDivElement>(null);
  const bead = useRef<SVGEllipseElement>(null);
  useEffect(() => {
    let timer = 0;
    let at: { x: number; y: number } | null = null;
    let last = { x: -1000, y: -1000 };
    let seed = 1;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const place = (x: number, y: number) => {
      last = { x, y };
      const el = glyph.current;
      if (el) el.style.transform = `translate(${x - TIP_X}px, ${y - TIP_Y}px)`;
    };
    const fall = () => {
      if (!at) return;
      // A drop's size varies a little from one to the next (a bulb never squeezes twice the same).
      const volume = t("dropperDrop") * (0.8 + 0.4 * random());
      dripAt(at.x, at.y, volume);
      const b = bead.current;
      if (b) {
        b.style.opacity = "1";
        window.setTimeout(() => {
          if (b) b.style.opacity = "0";
        }, 90);
      }
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (
        !(e.target instanceof Element) ||
        e.target.closest("[data-tool-tray], a, button, input, select, textarea")
      )
        return;
      at = { x: e.clientX, y: e.clientY };
      place(e.clientX, e.clientY);
      fall();
      window.clearInterval(timer);
      timer = window.setInterval(fall, 1000 / Math.max(0.5, t("dropperRate")));
    };
    const move = (e: PointerEvent) => {
      place(e.clientX, e.clientY);
      if (at) at = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      at = null;
      window.clearInterval(timer);
    };
    place(last.x, last.y);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
  }, []);
  return (
    <div
      ref={glyph}
      className="eye-dropper"
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: W,
        height: H,
        pointerEvents: "none",
        zIndex: 60,
        transform: "translate(-1000px, -1000px)",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))",
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {/* The rubber bulb. */}
        <path
          d="M9 3.5c0-1.7 2.7-3 6-3s6 1.3 6 3v9.5c0 1.6-1.2 2.6-2.6 3.1L18 17h-6l-.4-.9C10.2 15.6 9 14.6 9 13z"
          fill="#3a3a3f"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="0.8"
        />
        <path
          d="M11.5 4.5c0-1 1.6-1.8 3.5-1.8"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.8"
          fill="none"
        />
        {/* The glass tube, water in it. */}
        <path
          d="M11.2 17h7.6v38l-2.2 13.5c-.2 1-.9 1.6-1.6 1.6s-1.4-.6-1.6-1.6L11.2 55z"
          fill="rgba(210,230,245,0.35)"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="0.9"
        />
        <path d="M12.4 24h5.2v30.6l-1.8 11.2h-1.6L12.4 54.6z" fill="rgba(170,205,235,0.55)" />
        <path d="M12.9 19v34" stroke="rgba(255,255,255,0.55)" strokeWidth="0.7" />
        {/* The drop forming at the tip while it drips. */}
        <ellipse
          ref={bead}
          cx={TIP_X}
          cy={TIP_Y - 2.5}
          rx="2.6"
          ry="3.2"
          fill="rgba(200,225,250,0.85)"
          stroke="rgba(255,255,255,0.8)"
          strokeWidth="0.6"
          style={{ opacity: 0, transition: "opacity 80ms linear" }}
        />
      </svg>
    </div>
  );
}
