import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrokenGlass } from "@fx/components/site/BrokenGlass";

/** How long a press has to be to strike as hard as a strike can, ms: a full swing. */
const FULL_SWING = 900;

type Strike = { id: number; pane: HTMLElement; at: { x: number; y: number }; energy: number };

/**
 * The glazier's hammer (item 10, the "Hammer" in the tray with ?try=broken):
 * press on a pane and let go to strike it there. The longer the press, the
 * harder the swing -- a tap cracks it, a full swing shatters it. The pane
 * breaks as the panes' glass breaks (annealed float: radial shards, rings
 * near the impact; components/site/BrokenGlass). Striking it again breaks
 * it anew. A reload mends everything.
 */
export function Hammer() {
  const [strikes, setStrikes] = useState<Strike[]>([]);

  useEffect(() => {
    let pressed: { pane: HTMLElement; x: number; y: number; t: number } | null = null;
    let next = 1;
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || e.target.closest("[data-tool-tray]")) return;
      const pane = e.target.closest<HTMLElement>(".glass");
      pressed = pane ? { pane, x: e.clientX, y: e.clientY, t: performance.now() } : null;
    };
    const up = () => {
      if (!pressed) return;
      const { pane, x, y, t } = pressed;
      pressed = null;
      const r = pane.getBoundingClientRect();
      const energy = Math.min(1, 0.15 + (performance.now() - t) / FULL_SWING);
      const strike: Strike = {
        id: next++,
        pane,
        at: { x: (x - r.left) / r.width, y: (y - r.top) / r.height },
        energy,
      };
      // A pane struck again breaks anew.
      setStrikes((all) => [...all.filter((s) => s.pane !== pane), strike]);
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <>
      {strikes.map((s) =>
        createPortal(
          <BrokenGlass key={s.id} kind="annealed" energy={s.energy} at={s.at} seed={s.id} />,
          s.pane,
        ),
      )}
    </>
  );
}
