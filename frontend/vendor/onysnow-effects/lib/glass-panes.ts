/**
 * Panes announce themselves once React has finished with them.
 *
 * WHY THIS EXISTS RATHER THAN A querySelectorAll
 *
 * `RasterGlass` used to find panes with `document.querySelectorAll('.glass')`
 * and start liquidglass on them. That races hydration, and about one load in
 * three it won:
 *
 *   Hydration failed because the server rendered HTML didn't match the client
 *     - <span class="glass__bokeh">      (what the server sent)
 *     + <canvas width="1320" ...>        (what liquidglass had just inserted)
 *
 * The panes live inside lazily-hydrated route content while `RasterGlass` is
 * mounted at the root, so its effect runs first, injects a canvas as the
 * pane's first child, and React then finds a child it did not render. It
 * discards the whole tree and regenerates it -- destroying the canvas that
 * caused it. Self-defeating: when the race was won, the liquid glass vanished,
 * which is exactly the "liquid mode looks like CSS mode on some loads"
 * complaint.
 *
 * Timing tricks do not fix a race, they move it -- a frame's delay was tried
 * and lost anyway, because lazy route content is still hydrating long after
 * first paint. So the ordering is made structural instead: a pane registers
 * from its OWN `useEffect`, and React does not run a subtree's effects until
 * it has committed that subtree. A registered pane is, by construction, a
 * hydrated pane. Nothing has to be timed.
 */

const panes = new Set<HTMLElement>();
const listeners = new Set<(el: HTMLElement) => void>();

/** Called by Glass, from an effect. Returns the unregister. */
export function registerPane(el: HTMLElement) {
  panes.add(el);
  for (const fn of listeners) fn(el);
  return () => {
    panes.delete(el);
  };
}

/**
 * Hear about every pane, including the ones already registered.
 *
 * Replays on subscribe because mount order is not guaranteed: a consumer at
 * the root may subscribe after some panes have registered, or before all of
 * them have, and either way it must end up seeing all of them exactly once.
 */
export function onPane(fn: (el: HTMLElement) => void) {
  for (const el of panes) fn(el);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
