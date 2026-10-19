/**
 * The page's copy drawn as a texture, for the passes that look through it
 * (the rain: Ony, 2026-10-02, "the raindrops would be on top of the letters
 * magnifying the part that it's on").
 *
 * With "Type on the glass" the letters are printed on the glass's own face,
 * so a drop sitting on them shows them bent and enlarged, as a drop on a
 * printed page does. The DOM draws the letters where no water is; where the
 * water draws, it draws them itself from this texture, at the point its
 * sight lands on the glass. The words come from the same layout the shadow
 * casters use (effects/optics/casters wordsOf): each word in its own font,
 * spacing and colour, where the page put it.
 */

import { wordsOf } from "@fx/effects/optics/casters";
import { litSurfaceList } from "@fx/effects/scene/scene";

/*
 * The buttons and icons printed on the glass too (Ony, 2026-10-03: "make sure
 * that the words/texts/buttons are flat on the glass ... the rain goes on
 * them but doesn't hide them and does distort and magnify them"): each
 * button's fill and border as the page styles them, its own words, and every
 * icon, drawn into the same layer as the copy. Cards built round a photograph
 * (a link holding an image) are not print and are left out.
 */
const CHROME = "button, a, [role=button]";
const MEDIA = "img, picture, video, canvas";

/** Bumped whenever an icon finishes loading, so the passes that key on the layer draw it again. */
export let typeLayerVersion = 0;
const icons = new Map<string, HTMLImageElement | null>();

function iconFor(svg: SVGSVGElement, colour: string): HTMLImageElement | null {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  clone.setAttribute("width", String(r.width));
  clone.setAttribute("height", String(r.height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.style.color = colour;
  const src = new XMLSerializer().serializeToString(clone).replaceAll("currentColor", colour);
  const key = `${src}`;
  const have = icons.get(key);
  if (have !== undefined) return have && have.complete ? have : null;
  const img = new Image();
  icons.set(key, img);
  img.onload = () => {
    typeLayerVersion++;
  };
  img.onerror = () => icons.set(key, null);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  return null;
}

function roundedRect(ctx: CanvasRenderingContext2D, r: DOMRect, radius: number) {
  const rr = Math.min(radius, r.width / 2, r.height / 2);
  ctx.beginPath();
  ctx.roundRect(r.left, r.top, r.width, r.height, rr);
}

/** Draw the pane's buttons and icons (not its words) into ctx, in page CSS px. */
function paintChrome(
  ctx: CanvasRenderingContext2D,
  paneEl: HTMLElement,
  pane: { x: number; y: number; w: number; h: number },
  inked: Set<Element>,
): boolean {
  let drawn = false;
  const inside = (r: DOMRect) =>
    r.width > 0 &&
    r.height > 0 &&
    r.right >= pane.x &&
    r.left <= pane.x + pane.w &&
    r.bottom >= pane.y &&
    r.top <= pane.y + pane.h;
  for (const el of paneEl.querySelectorAll<HTMLElement>(CHROME)) {
    if (el.querySelector(MEDIA)) continue;
    const r = el.getBoundingClientRect();
    if (!inside(r) || r.width * r.height > 0.25 * pane.w * pane.h) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const bg = cs.backgroundColor;
    if (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== "transparent") {
      roundedRect(ctx, r, radius);
      ctx.fillStyle = bg;
      ctx.fill();
      drawn = true;
    }
    const bw = parseFloat(cs.borderTopWidth) || 0;
    if (bw > 0 && cs.borderTopStyle !== "none" && !/rgba\(.*,\s*0\)$/.test(cs.borderTopColor)) {
      const inset = new DOMRect(r.left + bw / 2, r.top + bw / 2, r.width - bw, r.height - bw);
      roundedRect(ctx, inset, Math.max(0, radius - bw / 2));
      ctx.lineWidth = bw;
      ctx.strokeStyle = cs.borderTopColor;
      ctx.stroke();
      drawn = true;
    }
    // Its words, when they are not already among the copy.
    let hasInk = false;
    for (const e of inked) if (el.contains(e) || e.contains(el)) hasInk = true;
    if (!hasInk && (el.textContent ?? "").trim() && !el.querySelector("[class*=sr-only]")) {
      const { at, words } = wordsOf(el, ctx);
      ctx.textBaseline = "alphabetic";
      for (const word of words) {
        ctx.font = word.font;
        ctx.fillStyle = word.colour;
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = word.spacing;
        ctx.fillText(word.text, at.left + word.x, at.top + word.y + word.ascent);
        drawn = true;
      }
    }
  }
  // Every icon on the pane that is not part of a photograph card.
  for (const svg of paneEl.querySelectorAll<SVGSVGElement>("svg")) {
    if (svg.closest(MEDIA) || svg.closest(CHROME)?.querySelector(MEDIA)) continue;
    const r = svg.getBoundingClientRect();
    if (!inside(r) || r.width > 64 || r.height > 64) continue;
    const cs = getComputedStyle(svg);
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
    const img = iconFor(svg, cs.color);
    if (img) {
      ctx.drawImage(img, r.left, r.top, r.width, r.height);
      drawn = true;
    }
  }
  return drawn;
}

/**
 * Draw the type over a pane into `canvas`: pane-local, `scale` device px per
 * CSS px. Returns whether anything was drawn.
 */
export function paintTypeLayer(
  canvas: HTMLCanvasElement,
  paneEl: HTMLElement,
  scale: number,
): boolean {
  // Measured now, with the words: the two must agree to the pixel, whatever has scrolled since the pane was last read.
  const r = paneEl.getBoundingClientRect();
  const pane = { x: r.left, y: r.top, w: r.width, h: r.height };
  const w = Math.max(1, Math.round(pane.w * scale));
  const h = Math.max(1, Math.round(pane.h * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, -pane.x * scale, -pane.y * scale);
  const inked = new Set<Element>();
  for (const s of litSurfaceList())
    if (s.material.id === "ink" && paneEl.contains(s.el)) inked.add(s.el);
  let drawn = paintChrome(ctx, paneEl, pane, inked);
  for (const s of litSurfaceList()) {
    if (s.material.id !== "ink") continue;
    const r = s.el.getBoundingClientRect();
    if (
      r.right < pane.x ||
      r.left > pane.x + pane.w ||
      r.bottom < pane.y ||
      r.top > pane.y + pane.h
    )
      continue;
    const { at, words } = wordsOf(s.el, ctx);
    ctx.textBaseline = "alphabetic";
    for (const word of words) {
      ctx.font = word.font;
      ctx.fillStyle = word.colour;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = word.spacing;
      ctx.fillText(word.text, at.left + word.x, at.top + word.y + word.ascent);
      drawn = true;
    }
  }
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  return drawn;
}
