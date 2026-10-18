/**
 * How a pane colours what it shows, read from its own style: its
 * backdrop-filter's saturate() and its fill. A pass that draws the
 * photograph through the glass by another path (a drop's lens, a crack
 * face's fold) applies the same two, so what it draws matches the glass
 * around it (rain W1; broken glass B2).
 *
 * Read once per element and kept: computed style is slow to ask for.
 */

export type PaneLook = {
  saturate: number;
  /** Unpremultiplied RGBA, 0-1. */
  fill: [number, number, number, number];
  /** Its backdrop blur, CSS px: how far the frost spreads what is behind (0 for clear glass). */
  blur: number;
};

const looks = new WeakMap<HTMLElement, PaneLook>();
let probeCtx: CanvasRenderingContext2D | null | undefined;

export function paneLook(el: HTMLElement): PaneLook {
  let l = looks.get(el);
  if (l) return l;
  const cs = getComputedStyle(el);
  const m = /saturate\(([\d.]+)(%?)\)/.exec(cs.backdropFilter || "");
  const saturate = m ? Number(m[1]) / (m[2] ? 100 : 1) : 1;
  const b = /blur\(([\d.]+)px\)/.exec(cs.backdropFilter || "");
  const blur = b ? Number(b[1]) : 0;
  let fill: [number, number, number, number] = [0, 0, 0, 0];
  if (probeCtx === undefined) {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    probeCtx = probe.getContext("2d", { willReadFrequently: true });
  }
  if (probeCtx) {
    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = cs.backgroundColor || "transparent";
    probeCtx.fillRect(0, 0, 1, 1);
    const d = probeCtx.getImageData(0, 0, 1, 1).data;
    // Unpremultiplied, as getImageData returns it.
    fill = [d[0]! / 255, d[1]! / 255, d[2]! / 255, d[3]! / 255];
  }
  l = { saturate, fill, blur };
  looks.set(el, l);
  return l;
}

/** Forget a pane's look (its style changed). */
export function forgetPaneLook(el: HTMLElement): void {
  looks.delete(el);
}
