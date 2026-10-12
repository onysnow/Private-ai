import { useEffect } from "react";
import { sprayAt, SQUEEZE_RATE } from "@fx/effects/water/spray";
import { t } from "@fx/lib/tuning";

/**
 * The spray bottle (task 76, in the tray with ?try=drops): press and hold to
 * spray at the pointer, a squeeze at a time (effects/water/spray), the
 * liquid chosen in the lab (Water > "Spray bottle holds").
 */
export function SprayBottle() {
  useEffect(() => {
    let timer = 0;
    let at: { x: number; y: number } | null = null;
    const fire = () => {
      if (!at) return;
      sprayAt(at.x, at.y, Math.round(t("sprayLiquid")));
    };
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || e.target.closest("[data-tool-tray]")) return;
      at = { x: e.clientX, y: e.clientY };
      fire();
      window.clearInterval(timer);
      timer = window.setInterval(fire, 1000 / SQUEEZE_RATE);
    };
    const move = (e: PointerEvent) => {
      if (at) at = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      at = null;
      window.clearInterval(timer);
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  return null;
}
