import { useEffect, useRef } from "react";
import { camera } from "@fx/effects/camera/camera";
import { vignetteGradient } from "@fx/effects/camera/vignette";
import { previewing } from "@fx/effects/engine/preview";
import { onTuningApplied } from "@fx/lib/tuning";
import { viewState } from "@fx/effects/scene/scene";

/**
 * The lens's natural vignetting over the whole picture (?try=vignette;
 * effects/camera/vignette): darker toward the corners by cos^4 of their
 * angle off the camera's axis, which runs from the eye to the screen.
 */
export function Vignette() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!previewing("vignette")) return;
    let frame = 0;
    let last = "";
    const draw = () => {
      frame = 0;
      const node = el.current;
      if (!node) return;
      const w = document.documentElement.clientWidth || window.innerWidth;
      const h = document.documentElement.clientHeight || window.innerHeight;
      const cx = w / 2 + viewState.eyeX;
      const cy = h / 2 + viewState.eyeY;
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const next =
        camera.vignetting > 0
          ? vignetteGradient(cx, cy, reach, camera.distance(w), camera.vignetting)
          : "none";
      if (next !== last) {
        node.style.backgroundImage = next;
        last = next;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const stop = onTuningApplied(schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("pointermove", schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      stop();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointermove", schedule);
    };
  }, []);
  return <div ref={el} className="lens-vignette" aria-hidden="true" />;
}
