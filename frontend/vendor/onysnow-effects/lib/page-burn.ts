/**
 * A photograph of the page, for the flash to burn onto the retina.
 *
 * WHAT THIS REPLACES
 *
 * The afterimage used to be a clone of whichever <img> was under the pointer,
 * pinned to that image's rect. That is not what a flash does. A flash lights
 * the ROOM: the picture, the frame around it, the header above it, the type
 * beside it. Burning only the subject made the effect read as a hover state on
 * one photograph rather than as a camera going off in front of the whole page.
 *
 * WHY IT IS CAPTURED BEFORE THE SHUTTER FIRES
 *
 * Rasterising the document takes tens to hundreds of milliseconds, and an
 * afterimage that arrives after the flash is not an afterimage. The gesture
 * gives us the warning we need: winding the shutter is a sustained movement
 * over a couple of seconds, so the capture starts when the charge crosses
 * halfway and is sitting ready by the time the thing fires. A camera spends
 * that time doing the same thing -- metering, focusing, charging.
 *
 * WHY TWO PASSES
 *
 * `position: fixed` does not survive cloning. html-to-image renders into an
 * SVG foreignObject, and the transform that windows the document to the
 * viewport makes the clone root a containing block -- so a fixed header inside
 * it resolves against the DOCUMENT rather than the viewport and lands at the
 * top of the page, i.e. off-screen at any scroll position but zero. The header
 * would simply be missing from the burn. So the scrolling content and the
 * fixed furniture are captured separately and composited at their real
 * viewport rects.
 *
 * WHAT IS DELIBERATELY NOT IN IT
 *
 * The effect layer itself -- the flash, the frame lines, the previous
 * afterimages, the veil, the cursor and its light. Burning those in would
 * photograph the last burn, and every shutter release would compound the one
 * before it.
 *
 * The WebGL light canvases come out empty rather than black: their contexts
 * are created without `preserveDrawingBuffer`, so reading them back after
 * compositing yields nothing. That is the right trade. Turning it on would
 * cost every frame of the live page to improve a 20-second ghost, and those
 * canvases carry added glow rather than anything you would call the UI.
 */
import { toCanvas } from "html-to-image";

/** The effect layer. Photographing it would photograph the last flash. */
const OVERLAY =
  ".shutter-flash, .shutter-frame, .afterimage, .afterimage-veil, " +
  ".custom-cursor, .cursor-light, .flare-overlay";

export type PageBurn = {
  /*
   * Encoded here rather than handed over as a canvas, because THREE ghosts
   * are dressed from one capture and `cloneNode` does not copy a canvas's
   * bitmap -- the second and third hosts would get a blank one. A src string
   * clones correctly, is decoded once by the browser and shared.
   *
   * A data URL rather than a blob URL, deliberately: a blob has to be revoked
   * by somebody, the capture is discarded in the same tick it is used, and
   * revoking before the three <img>s have loaded blanks all of them. Nothing
   * to own and nothing to leak is worth the extra bytes for something that
   * lives twenty seconds.
   *
   * JPEG, because the burn is opaque by construction and is about to be
   * inverted, blurred and faded -- alpha buys nothing and PNG would be some
   * megabytes of base64.
   */
  src: string;
  /** Viewport CSS pixels it covers. */
  width: number;
  height: number;
};

/** Slack around the viewport, for shadows and glows that spill in from just outside. */
const MARGIN = 120;

let ready: PageBurn | null = null;
let stamp = "";
let inFlight = false;

/** Scroll position and size, so a stale capture is recognisable as stale. */
function currentStamp() {
  return `${Math.round(window.scrollX)}:${Math.round(window.scrollY)}:${viewW()}:${viewH()}`;
}

function viewW() {
  return document.documentElement.clientWidth || window.innerWidth;
}

function viewH() {
  return document.documentElement.clientHeight || window.innerHeight;
}

function isFixed(el: Element) {
  return getComputedStyle(el).position === "fixed";
}

/**
 * Every fixed thing that is actually on screen and is not part of the effect.
 *
 * Only top-level fixed elements: a fixed child of a fixed parent is already
 * inside its ancestor's capture, and drawing it again would double it.
 */
function fixedFurniture(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    if (!isFixed(el)) continue;
    if (el.closest(OVERLAY)) continue;
    if (out.some((seen) => seen.contains(el))) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom <= 0 || r.top >= viewH() || r.right <= 0 || r.left >= viewW()) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
      continue;
    }
    out.push(el);
  }
  return out;
}

/**
 * Rasterise the viewport. Resolves to null rather than throwing: a missing
 * afterimage is a small loss, and the caller falls back.
 *
 * `skipFonts` on purpose. Inlining @font-face means fetching and base64-ing
 * every face before anything can be drawn, which is most of the cost of a
 * capture, to fix glyph widths by a fraction of a pixel in an image that is
 * about to be inverted, blurred and faded out over twenty seconds.
 */
async function rasterise(): Promise<PageBurn | null> {
  const w = viewW();
  const h = viewH();
  if (w < 1 || h < 1) return null;

  const fixed = fixedFurniture();
  const skip = new Set<Element>(fixed);

  try {
    const flow = await toCanvas(document.body, {
      width: w,
      height: h,
      backgroundColor: getComputedStyle(document.documentElement).backgroundColor,
      skipFonts: true,
      // The clone is shifted so the viewport's slice of the document lands in
      // the SVG's box. transformOrigin matters: the default is the centre,
      // which would scroll the page to somewhere neither of us asked for.
      style: {
        transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
        transformOrigin: "top left",
      },
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        if (skip.has(node)) return false;
        if (node.matches(OVERLAY)) return false;
        /*
         * Nothing that is off screen. The burn is of the viewport, but
         * html-to-image clones and inlines the WHOLE body -- every photograph
         * five screens down fetched and base64'd into the SVG. Measured on the
         * home page: nearly six seconds, so any shot fired sooner than that
         * got the photo-only fallback instead of the page. An element entirely
         * outside the viewport cannot contribute a pixel, so it is dropped;
         * its ancestors still span the viewport and are kept.
         */
        const r = node.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return true;
        return r.bottom > -MARGIN && r.top < h + MARGIN && r.right > -MARGIN && r.left < w + MARGIN;
      },
    });

    const out = document.createElement("canvas");
    out.width = flow.width;
    out.height = flow.height;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    const scale = flow.width / w;
    ctx.drawImage(flow, 0, 0);

    /*
     * The fixed furniture, each at the place it actually occupies on screen.
     *
     * And underneath each piece, its backdrop-filter, applied by hand.
     *
     * The DOM rasteriser renders into an SVG foreignObject, which does not
     * implement backdrop-filter at all -- so the glass bar came back as its
     * translucent fill laid over perfectly sharp body copy, and the nav items
     * sat at almost exactly the luminance of the paragraph showing through
     * them. Measured on the capture: legible on the live page, near-invisible
     * in the burn. The blur is not decoration on a bar like this; it is the
     * thing that makes what is ON the bar readable.
     *
     * Canvas 2D takes the same filter syntax CSS does, so the declared value
     * is reused verbatim rather than guessed at -- `blur(28px) saturate(1.5)`
     * means the same thing to both. Sampled from `flow`, never from `out`, so
     * one bar's blur cannot pick up another bar that has already been drawn.
     */
    for (const el of fixed) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const backdrop =
        style.backdropFilter ||
        (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter ||
        "none";

      if (backdrop !== "none" && backdrop !== "") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.left * scale, r.top * scale, r.width * scale, r.height * scale);
        ctx.clip();
        ctx.filter = backdrop;
        ctx.drawImage(flow, 0, 0);
        ctx.restore();
        ctx.filter = "none";
      }

      try {
        const piece = await toCanvas(el, {
          skipFonts: true,
          filter: (node) => !(node instanceof Element) || !node.matches(OVERLAY),
        });
        ctx.drawImage(piece, r.left * scale, r.top * scale, r.width * scale, r.height * scale);
      } catch {
        // One missing bar is better than no afterimage.
      }
    }

    return { src: out.toDataURL("image/jpeg", 0.72), width: w, height: h };
  } catch (err) {
    // Not silent. A capture that fails quietly leaves the afterimage falling
    // back to the subject clone forever with nothing to say why, which is how
    // this went unnoticed once already.
    console.warn("page-burn: could not photograph the page", err);
    return null;
  }
}

/**
 * Take the picture, unless one is already taken and still true.
 *
 * Deduped on an in-flight flag as well as the stamp: the charge crosses the
 * threshold on one frame and stays over it for the rest of the wind, so
 * without this every frame of a two-second gesture would start a capture.
 */
export function prepareBurn() {
  const want = currentStamp();
  if (inFlight) return;
  if (ready && stamp === want) return;
  inFlight = true;
  void rasterise().then((burn) => {
    inFlight = false;
    if (!burn) return;
    ready = burn;
    stamp = want;
  });
}

/** The picture, if one was taken and the page has not moved since. */
export function takeBurn(): PageBurn | null {
  if (!ready) return null;
  if (stamp !== currentStamp()) return null;
  return ready;
}

/** The page changed under us; whatever was captured is a lie now. */
export function discardBurn() {
  ready = null;
  stamp = "";
}
