/**
 * The shutter, as an event rather than a prop.
 *
 * The cursor fires it and the flash overlay listens, and they have no other
 * relationship -- the cursor should not hold a ref into a fixed overlay three
 * levels up the tree, and the overlay should not know what triggered it.
 *
 * In its own module because the component file also exports ShutterFlash.
 * Mixing a component with a plain function stops React Fast Refresh working
 * on that file: it cannot tell whether a changed export is a component whose
 * state to preserve or a helper to replace, so it reloads the whole module.
 */

export const SHUTTER_EVENT = "onysnow:shutter";

export function fireShutter(at?: { x: number; y: number }) {
  window.dispatchEvent(new CustomEvent(SHUTTER_EVENT, { detail: at }));
}
