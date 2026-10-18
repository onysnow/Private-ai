import { useCallback, useRef } from "react";
import { registerLitSurface } from "@fx/effects/scene/scene";

/**
 * The light that gets THROUGH the pane, landing on what is behind it.
 *
 * This sits between the photograph and the glass, which is where it belongs:
 * everything above it is on or in the pane, everything below it is what the
 * pane is standing over. It replaces a pair of canvases that drew shadows here
 * and were never visible, because they were gated on the shutter being charged
 * and cleared themselves the rest of the time — two permanent rAF loops
 * producing nothing.
 *
 * What makes it a pane of glass rather than a spotlight is that the light does
 * not arrive clean. It is:
 *
 *   SCATTERED by the grime. The same surface map the pane's own smears are
 *   drawn from modulates this, so the pool is mottled and it is mottled in
 *   register with the marks you can see on the face — light through a dirty
 *   window is bright where the glass is clear and hazy where it is not. This
 *   is the "where the shadow is and isn't".
 *
 *   BENT at the bevel. Near the pane's edges the light crosses the rounded-over
 *   part, which throws it sideways and piles it up just outside — the bright
 *   line a glass of water casts inside its own shadow. Hence the rim being
 *   brighter than the middle rather than dimmer.
 *
 * It is a layer of the SECTION rather than of the pane, so it can spill past
 * the pane's edges the way transmitted light actually does.
 */
export function TransmittedLight() {
  const release = useRef<(() => void) | null>(null);
  const attach = useCallback((el: HTMLElement | null) => {
    release.current?.();
    release.current = el ? registerLitSurface(el) : null;
  }, []);

  return <span ref={attach} aria-hidden="true" className="transmitted" />;
}
