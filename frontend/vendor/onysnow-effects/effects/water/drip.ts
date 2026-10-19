/**
 * The eye dropper (Ony, 2026-10-09: "I want to make an eye dropper tool ...
 * holding it just continues to drop more drops"): a pipette held over the
 * glass. A click lets one drop fall where the pointer is; holding keeps
 * them coming (DRIP_RATE a second) until the button is let go. Each drop
 * is a raindrop's size and more (Water > "Dropper drop"), so a few in one
 * place gather the weight to run.
 *
 * This module is the bus between the hand (components/site/EyeDropper) and
 * the water layer (components/site/WaterDrops), as effects/water/spray is
 * for the spray bottle.
 */

type Target = (x: number, y: number, volume: number) => void;
let target: Target | null = null;

/** The water layer takes the drops (returns the release). */
export function onDrip(fn: Target): () => void {
  target = fn;
  return () => {
    if (target === fn) target = null;
  };
}

/** A drop of `volume` uL falls onto the page at (x, y), client px. */
export function dripAt(x: number, y: number, volume: number) {
  target?.(x, y, volume);
}
