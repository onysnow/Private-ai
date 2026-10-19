/**
 * What the loader waits for besides files: the effects getting ready.
 *
 * Ony, 2026-10-01: "the loading page needs to load the entire application".
 * The warm-up (lib/warm-up) fetches every page's code and data and every
 * photograph; it cannot know when the glass light has its room uploaded and
 * its first frame drawn, or when the light under the glass has its textures.
 * Those were done on the first charge of the shutter, after the loader had
 * gone -- a visible hitch the first time the lamp came on.
 *
 * So an effect that has setting-up to do takes a hold while it does it and
 * lets go when it is done. The loader waits until there are no holds left.
 *
 * A hold can never keep anyone out: each one lets go by itself after
 * `maxMs`, and the loader races the whole wait against its own deadline.
 */

const holds = new Set<Promise<void>>();

/** Take a hold on the loader; call the returned function when ready (more than once is fine). */
export function holdLoader(name: string, maxMs = 15000): () => void {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timer = setTimeout(() => {
    if ((process.env.NODE_ENV !== "production")) console.info(`[loader] ${name} timed out; letting go`);
    release();
  }, maxMs);
  holds.add(held);
  void held.then(() => {
    clearTimeout(timer);
    holds.delete(held);
  });
  return () => release();
}

const frame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "undefined") resolve();
    else requestAnimationFrame(() => resolve());
  });

/**
 * Resolves once nothing holds the loader. Waits a couple of frames first and
 * again after each round, because an effect mounts -- and takes its hold --
 * a frame or two after the loader starts waiting.
 */
export async function whenAppReady(): Promise<void> {
  for (;;) {
    await frame();
    await frame();
    if (holds.size === 0) return;
    await Promise.all([...holds]);
  }
}

/** For tests: how many holds are outstanding. */
export function heldCount(): number {
  return holds.size;
}
