import { useEffect, useRef } from "react";
import { aimAt, type Aim } from "@fx/effects/light/beam";
import { pointer, setTorch, torchLight } from "@fx/effects/light/lights";

/** The torch's body, seen from above: length and width, CSS px. */
const BODY_LENGTH = 92;
const BODY_WIDTH = 20;
/** Straight down: the way it points while it simply follows the hand. */
const DOWN: Aim = [0, 0, -1];

/**
 * The flashlight you hold (item 25i): a beam, not a glow (effects/light/beam).
 *
 * Moving, it is in the hand over the pointer, pointing straight down: a hard
 * round hotspot on the page with a dim spill round it. Press and hold, and
 * it is set down where you pressed: it stays there and turns to point
 * wherever the pointer goes, throwing its beam across the page that way --
 * long and thin as it reaches further, and dimmer, as a beam across a table
 * is. Let go and it is back in the hand.
 *
 * What it lights is the light list's (torchLight): the glass, the light
 * through it onto the photographs, and anything that answers light (glow
 * paint charges from its LED's blue). What is drawn here is the torch
 * itself, seen from above: a dark aluminium body with its head toward where
 * it points, and the lit rim of its lens.
 */
export function Flashlight() {
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let planted: { x: number; y: number } | null = null;
    let frame = 0;

    const update = () => {
      frame = 0;
      const el = body.current;
      if (pointer.x <= -9999) {
        setTorch(-9999, -9999, DOWN, 0);
        if (el) el.style.opacity = "0";
        return;
      }
      const x = planted ? planted.x : pointer.x;
      const y = planted ? planted.y : pointer.y;
      const aim = planted ? aimAt(x, y, torchLight.height, pointer.x, pointer.y) : DOWN;
      setTorch(x, y, aim, 1);
      if (!el) return;
      // Seen from above: the body runs back from the head, foreshortened by its tilt.
      const across = Math.hypot(aim[0], aim[1]);
      const angle = Math.atan2(aim[1], aim[0]);
      const length = Math.max(BODY_WIDTH, BODY_LENGTH * across);
      el.style.opacity = "1";
      el.style.width = `${length}px`;
      // The head at the torch's point; pointing down, the tail cap centred over it.
      const pointingDown = across < 0.2;
      const back = pointingDown ? length / 2 : length;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}rad) translate(${-back}px, ${-BODY_WIDTH / 2}px)`;
      el.toggleAttribute("data-planted", planted !== null);
      el.toggleAttribute("data-down", pointingDown);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest("[data-tool-tray]")) return;
      planted = { x: e.clientX, y: e.clientY };
      schedule();
    };
    const up = () => {
      planted = null;
      schedule();
    };
    window.addEventListener("pointermove", schedule, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", schedule);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setTorch(-9999, -9999, DOWN, 0);
    };
  }, []);

  return (
    <div ref={body} className="flashlight" aria-hidden="true" style={{ height: BODY_WIDTH }}>
      <div className="flashlight__tail" />
      <div className="flashlight__grip" />
      <div className="flashlight__head" />
      <div className="flashlight__lens" />
    </div>
  );
}
