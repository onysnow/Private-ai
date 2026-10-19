/**
 * The photographs' own lights (light engine step I, item 31; ?try=photolights).
 *
 * A photograph of a bar at night has neon in it, a window has the sky. Those
 * spots were light sources when the picture was taken, and a print that
 * records them clipped to white is showing a light far brighter than white.
 * Under the glass they are still lights: they shine up into the pane above
 * them, catch its rims and its cracks and glow in its frost -- the way a
 * lit sign under a glass table lights the glass.
 *
 * So the brightest spots of the photograph behind the panes join the light
 * list as emitters under the glass (Light.below): each where its spot is on
 * the screen, in its colour, as strong as it is bright and large. The design
 * picks the few brightest rather than treating the whole image as a light
 * (claude/light-engine-architecture.md: glints come from bright points; the
 * rest of the photograph already shows through the glass by refraction).
 *
 * This file is the pure part: finding the spots in a photograph's pixels.
 */

/** A bright spot of a photograph, in its own 0..1 coordinates. */
export type Highlight = {
  u: number;
  v: number;
  /** Its colour, linear RGB normalised to its brightest channel. */
  colour: [number, number, number];
  /** How much light it gave: how far past the knee it is, times its size, 0 to 1. */
  strength: number;
  /** Its size, as a fraction of the photograph's width. */
  radius: number;
};

/** Brightness (sRGB luma, 0..1) past which a pixel was a light rather than something lit. */
export const EMITTER_KNEE = 0.82;

const toLinear = (c: number) => Math.pow(c, 2.2);

/**
 * The `count` brightest spots in an RGBA image (0..255), at most one within
 * `spacing` (a fraction of the width) of another. A pixel belongs to a spot
 * while it is past EMITTER_KNEE; each spot is grown from its brightest pixel
 * over its bright neighbours, so a sign's whole tube counts, not one pixel.
 */
export function findHighlights(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  count = 4,
  spacing = 0.12,
): Highlight[] {
  const n = w * h;
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4]! / 255;
    const g = rgba[i * 4 + 1]! / 255;
    const b = rgba[i * 4 + 2]! / 255;
    // The brightest channel counts: a saturated red neon is a light too.
    luma[i] = Math.max(0.2126 * r + 0.7152 * g + 0.0722 * b, Math.max(r, g, b) * 0.95);
  }
  const taken = new Uint8Array(n);
  const order = Array.from({ length: n }, (_, i) => i)
    .filter((i) => luma[i]! > EMITTER_KNEE)
    .sort((a, b) => luma[b]! - luma[a]!);
  const found: Highlight[] = [];
  const minD = spacing * w;
  for (const seed of order) {
    if (found.length >= count * 3) break;
    if (taken[seed]) continue;
    const sx = seed % w;
    const sy = Math.floor(seed / w);
    if (found.some((f) => Math.hypot(f.u * w - sx, f.v * h - sy) < minD)) {
      taken[seed] = 1;
      continue;
    }
    // Grow the spot over its bright neighbours.
    const stack = [seed];
    taken[seed] = 1;
    let area = 0;
    let excess = 0;
    let cx = 0;
    let cy = 0;
    const rgb: [number, number, number] = [0, 0, 0];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = Math.floor(i / w);
      const weight = luma[i]! - EMITTER_KNEE;
      area += 1;
      excess += weight;
      cx += x * weight;
      cy += y * weight;
      rgb[0] += toLinear(rgba[i * 4]! / 255) * weight;
      rgb[1] += toLinear(rgba[i * 4 + 1]! / 255) * weight;
      rgb[2] += toLinear(rgba[i * 4 + 2]! / 255) * weight;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (taken[j] || luma[j]! <= EMITTER_KNEE) continue;
        taken[j] = 1;
        stack.push(j);
      }
    }
    const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-9);
    found.push({
      u: (cx / Math.max(excess, 1e-9) + 0.5) / w,
      v: (cy / Math.max(excess, 1e-9) + 0.5) / h,
      colour: [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak],
      /*
       * How bright it is past the knee on average, times how much of a full
       * spot it fills: a spot a twentieth of the width across, fully
       * clipped, is a full-strength light.
       */
      strength:
        Math.min(1, excess / area / (1 - EMITTER_KNEE)) *
        Math.min(1, area / (Math.PI * (w / 40) ** 2)),
      radius: Math.sqrt(area / Math.PI) / w,
    });
  }
  return found.sort((a, b) => b.strength - a.strength).slice(0, count);
}

/**
 * Where a point of a photograph (u, v) lands on the screen, drawn in the box
 * (x, y, w, h) with object-fit: cover, intrinsic aspect `aspect` (width /
 * height) and object-position `focus` -- the inverse of the glass shader's
 * coverUv.
 */
export function coverPoint(
  u: number,
  v: number,
  box: { x: number; y: number; w: number; h: number },
  aspect: number,
  focus: { x: number; y: number },
): { x: number; y: number } {
  const boxAspect = box.w / Math.max(box.h, 1);
  const scale =
    boxAspect > aspect ? { x: 1, y: boxAspect / aspect } : { x: aspect / boxAspect, y: 1 };
  const rx = (u - focus.x) * scale.x + focus.x;
  const ry = (v - focus.y) * scale.y + focus.y;
  return { x: box.x + rx * box.w, y: box.y + ry * box.h };
}
