import { useEffect, useRef } from "react";
import { graze } from "@fx/effects/light/graze";

/**
 * The grazing laser in the hand (effects/light/graze): a beam skimming the
 * glass's face, through the drops standing on it.
 *
 * Unplanted, it shines in from the left edge of the window at the pointer's
 * height, straight across. Press and hold to plant its head where you
 * pressed; drag while holding to aim it; let go and it stays as aimed until
 * you press again.
 */
export function GrazingLaser() {
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let planted = false;
    let pressing = false;
    graze.on = true;
    const place = () => {
      const el = head.current;
      if (!el) return;
      el.style.transform = `translate(${graze.x - 26}px, ${graze.y - 5}px) rotate(${Math.atan2(graze.dy, graze.dx)}rad)`;
    };
    const move = (e: PointerEvent) => {
      if (pressing) {
        const dx = e.clientX - graze.x;
        const dy = e.clientY - graze.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
          graze.dx = dx / d;
          graze.dy = dy / d;
        }
      } else if (!planted) {
        graze.x = 0;
        graze.y = e.clientY;
        graze.dx = 1;
        graze.dy = 0;
      }
      place();
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-tool-tray]")) return;
      pressing = true;
      planted = true;
      graze.x = e.clientX;
      graze.y = e.clientY;
      place();
    };
    const up = () => {
      pressing = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      graze.on = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  // The laser's head: a pointer's dark barrel, its aperture glowing where the beam leaves it.
  return (
    <div
      ref={head}
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 28,
        height: 10,
        borderRadius: 3,
        background: "linear-gradient(#4a4a4a, #151515)",
        boxShadow: "0 1px 3px rgba(0,0,0,.7)",
        pointerEvents: "none",
        zIndex: 60,
        transformOrigin: "26px 5px",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -2,
          top: 2,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "radial-gradient(#fff 0 25%, #ff3b30 45%, rgba(255,40,30,0) 75%)",
          boxShadow: "0 0 3px 1px rgba(255,60,50,.8)",
        }}
      />
    </div>
  );
}
