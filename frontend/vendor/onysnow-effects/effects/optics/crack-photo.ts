/**
 * A photograph of broken glass, as the break (item 10; Ony, 2026-09-30:
 * "I want to literally use photos of cracks as a layer").
 *
 * The photograph is what the cracks look like; this module reads from it
 * where they are, so the rest of the break follows the photographed cracks
 * exactly: the shards are the pieces the photographed cracks cut, the view
 * steps at those cracks, the lamp flashes along them.
 *
 *   1. Cracks are thin lines against a smooth background: each pixel's
 *      difference from its neighbourhood's mean picks them out, bright
 *      cracks on dark glass or dark ones on a bright sky alike (the stronger
 *      tail says which).
 *   2. The strike is where the cracks are densest.
 *   3. The pieces are the connected regions between crack pixels (a flood
 *      fill). The region round the photograph's border is the glass that did
 *      not break; the tiny pieces crowded round the strike are the crushed
 *      spot. Crack pixels are shared out to the pieces either side, so the
 *      pieces tile the break.
 *   4. Each piece's outline is traced (marching squares) and simplified, holes
 *      and all, and carried onto the pane: the photograph's strike on the
 *      struck point, turned and scaled by how hard the blow was.
 *
 * Pure: pixels in, geometry out. The browser side (components/site/
 * BrokenGlass) reads the photograph's pixels and draws.
 */

import {
  DISPLACEMENT,
  THICKNESS_PX,
  type Crack,
  type GlassKind,
  type Pt,
  type Shard,
} from "./fracture";
import { pieceLift, pieceTilt } from "./shard-tilt";

/** A greyscale image, 0 to 1, row by row. */
export type Grey = {
  w: number;
  h: number;
  v: Float32Array;
  /**
   * Where there is glass, 0 to 1, for a photograph cut out on a transparent
   * background (a single broken piece): outside it there is no glass, and
   * the piece's own outline is its edge, not a crack.
   */
  alpha?: Float32Array;
};

/**
 * Where the glass is, well inside its outline (the photographed edge is not a
 * crack). Clear glass cut out is nearly transparent, so anything above a
 * trace of opacity is glass; its silhouette is closed over pinholes, then
 * shrunk away from the edge.
 */
function glassInside(img: Grey, r: number): Float32Array | null {
  if (!img.alpha) return null;
  const { w, h } = img;
  const any = { w, h, v: Float32Array.from(img.alpha, (a) => (a > 0.03 ? 1 : 0)) };
  const closed = extreme(extreme(any, r, true), r, false).v;
  // Its silhouette: everything the empty background cannot reach from the border.
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!outside[i] && closed[i]! < 0.5) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  const silhouette = { w, h, v: Float32Array.from(outside, (o) => (o ? 0 : 1)) };
  return extreme(silhouette, r * 2, false).v;
}

/** Box blur of radius r, separable, with edge clamping. */
export function boxBlur(src: Grey, r: number): Grey {
  const { w, h, v } = src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += v[y * w + Math.min(w - 1, Math.max(0, k))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      const add = Math.min(w - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      acc += v[y * w + add]! - v[y * w + sub]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      const add = Math.min(h - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      acc += tmp[add * w + x]! - tmp[sub * w + x]!;
    }
  }
  return { w, h, v: out };
}

/** Separable running min (or max) over a square of radius r. */
function extreme(src: Grey, r: number, max: boolean): Grey {
  const { w, h, v } = src;
  const pick = max ? Math.max : Math.min;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = v[y * w + x]!;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = pick(m, v[y * w + k]!);
      tmp[y * w + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = tmp[y * w + x]!;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++)
        m = pick(m, tmp[k * w + x]!);
      out[y * w + x] = m;
    }
  }
  return { w, h, v: out };
}

/**
 * The top-hat: what stands out of the glass thinner than a square of radius
 * r -- a crack, however many others crowd round it, where a local mean would
 * be dragged up by its neighbours. Bright cracks: the image less its opening;
 * dark ones: its closing less the image.
 */
export function topHat(img: Grey, r: number, bright: boolean): Float32Array {
  const out = new Float32Array(img.v.length);
  if (bright) {
    const open = extreme(extreme(img, r, false), r, true);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, img.v[i]! - open.v[i]!);
  } else {
    const close = extreme(extreme(img, r, true), r, false);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, close.v[i]! - img.v[i]!);
  }
  return out;
}

/** Otsu's threshold: the level that best splits the values into two groups. */
function otsu(values: Float32Array): number {
  let top = 0;
  for (const x of values) top = Math.max(top, x);
  if (top <= 0) return 1;
  const bins = new Float64Array(256);
  for (const x of values) bins[Math.min(255, Math.floor((x / top) * 255))]! += 1;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * bins[i]!;
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let at = 0;
  for (let i = 0; i < 256; i++) {
    wB += bins[i]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * bins[i]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      at = i;
    }
  }
  return ((at + 0.5) / 255) * top;
}

export type CrackMap = {
  w: number;
  h: number;
  /** 1 where a crack is. */
  mask: Uint8Array;
  /** How strongly each pixel reads as crack, 0 to 1: the layer's alpha. */
  strength: Float32Array;
  /** Cracks lighter than the glass round them (lit from the side, on dark). */
  bright: boolean;
  /** Where the cracks are densest: the strike, px. */
  strike: Pt;
  /** How far out from the strike the cracks reach (95% of them), px. */
  extent: number;
  /** The contrast a crack stands out by, and the neighbourhood it is measured over (px here). */
  threshold: number;
  radius: number;
};

/**
 * Find the cracks in a photograph. `scale` is the photograph's px per
 * working px, so the neighbourhood is the same physical size at any
 * resolution the caller chose.
 */
export function crackMap(img: Grey, opts: { neighbourhood?: number } = {}): CrackMap {
  const { w, h, v } = img;
  const r = opts.neighbourhood ?? Math.max(2, Math.round(Math.min(w, h) / 160));
  // Which way the cracks go: whichever top-hat has the heavier tail.
  const white = topHat(img, r, true);
  const black = topHat(img, r, false);
  const tail = (t: Float32Array) => {
    const sorted = Float32Array.from(t).sort();
    return sorted[Math.floor(sorted.length * 0.995)]!;
  };
  const bright = tail(white) >= tail(black);
  const hat = bright ? white : black;
  // Cracks against the glass's own texture: Otsu's split of the top-hat, but never below a faint line.
  const threshold = Math.max(0.03, otsu(hat));
  const mask = new Uint8Array(w * h);
  const strength = new Float32Array(w * h);
  for (let i = 0; i < hat.length; i++) {
    strength[i] = Math.min(1, Math.max(0, (hat[i]! - threshold * 0.6) / (threshold * 0.8)));
    if (hat[i]! > threshold) mask[i] = 1;
  }
  const glass = glassInside(img, r * 2);
  if (glass) for (let i = 0; i < mask.length; i++) if (glass[i]! < 0.5) mask[i] = 0;
  // Dust and grit on the glass are specks, not cracks: a crack runs on.
  despeckle(mask, w, h, Math.max(4, Math.round((w * h) / 15000)));
  // The strike: the densest cracks, over a neighbourhood a twentieth across.
  const density = boxBlur(
    { w, h, v: Float32Array.from(mask) },
    Math.max(2, Math.round(Math.min(w, h) / 40)),
  );
  let best = 0;
  let bi = 0;
  for (let i = 0; i < density.v.length; i++) {
    if (density.v[i]! > best) {
      best = density.v[i]!;
      bi = i;
    }
  }
  const strike = { x: bi % w, y: Math.floor(bi / w) };
  /*
   * Settle onto the heart of the star: the point the radial cracks run out
   * from. Each crack pixel has a direction (the structure tensor of the
   * mask); the strike is the point closest, in the least-squares sense, to
   * the lines through them -- weighted to the cracks that point at it, so
   * the concentric ones, running across, do not pull it off (iteratively
   * reweighted). A crushed spot photographed solid white is hollow in the
   * mask; the radials still meet in its middle.
   */
  const m0 = boxBlur({ w, h, v: Float32Array.from(mask) }, 1);
  const jxx = new Float32Array(w * h);
  const jxy = new Float32Array(w * h);
  const jyy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = (m0.v[i + 1]! - m0.v[i - 1]!) / 2;
      const gy = (m0.v[i + w]! - m0.v[i - w]!) / 2;
      jxx[i] = gx * gx;
      jxy[i] = gx * gy;
      jyy[i] = gy * gy;
    }
  }
  const txx = boxBlur({ w, h, v: jxx }, 2).v;
  const txy = boxBlur({ w, h, v: jxy }, 2).v;
  const tyy = boxBlur({ w, h, v: jyy }, 2).v;
  const lines: { x: number; y: number; nx: number; ny: number; c: number }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const a2 = txx[i]! - tyy[i]!;
    const b2 = 2 * txy[i]!;
    const mag = Math.hypot(a2, b2);
    const tr = txx[i]! + tyy[i]!;
    if (tr < 1e-6) continue;
    // The gradient's main direction is across the crack: the line's normal.
    const th = 0.5 * Math.atan2(b2, a2);
    lines.push({ x: i % w, y: Math.floor(i / w), nx: Math.cos(th), ny: Math.sin(th), c: mag / tr });
  }
  const reachScale = Math.max(w, h) / 3;
  for (let it = 0; it < 12 && lines.length > 8; it++) {
    let a11 = 0;
    let a12 = 0;
    let a22 = 0;
    let b1 = 0;
    let b2 = 0;
    for (const ln of lines) {
      const dx = ln.x - strike.x;
      const dy = ln.y - strike.y;
      const d = Math.hypot(dx, dy) || 1;
      // Pointing at the strike: the crack's direction (the normal turned) along dx, dy.
      const radial = Math.abs(-ln.ny * dx + ln.nx * dy) / d;
      const wgt = ln.c * radial ** 4 * Math.exp(-d / reachScale);
      a11 += wgt * ln.nx * ln.nx;
      a12 += wgt * ln.nx * ln.ny;
      a22 += wgt * ln.ny * ln.ny;
      const dot = ln.nx * ln.x + ln.ny * ln.y;
      b1 += wgt * ln.nx * dot;
      b2 += wgt * ln.ny * dot;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-9) break;
    const nx = (a22 * b1 - a12 * b2) / det;
    const ny = (a11 * b2 - a12 * b1) / det;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;
    const moved = Math.hypot(nx - strike.x, ny - strike.y);
    strike.x = Math.min(w - 1, Math.max(0, nx));
    strike.y = Math.min(h - 1, Math.max(0, ny));
    if (moved < 0.05) break;
  }
  const dists: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) dists.push(Math.hypot((i % w) - strike.x, Math.floor(i / w) - strike.y));
  }
  dists.sort((a, b) => a - b);
  const extent = dists.length ? dists[Math.floor(dists.length * 0.95)]! : 0;
  return { w, h, mask, strength, bright, strike, extent, threshold, radius: r };
}

/**
 * How strongly each pixel of the photograph at another size reads as crack,
 * 0 to 1, with what crackMap found at its working size: the visible layer's
 * alpha, drawn at the photograph's own detail.
 */
export function crackStrength(
  img: Grey,
  map: Pick<CrackMap, "bright" | "threshold" | "radius" | "w" | "strike" | "extent">,
): Float32Array {
  const k = img.w / map.w;
  const r = Math.max(1, Math.round(map.radius * k));
  const hat = topHat(img, r, map.bright);
  const glass = glassInside(img, r * 2);
  /*
   * The crushed spot is no thin line: pulverised glass photographed as a
   * solid white patch, too wide for the top-hat to see. Against a wide
   * neighbourhood's mean it stands out, and near the strike it is kept too.
   */
  const wide = boxBlur(img, Math.max(4, r * 10));
  const sx = map.strike.x * k;
  const sy = map.strike.y * k;
  const heart = Math.max(4, map.extent * k * 0.1);
  const sign = map.bright ? 1 : -1;
  const out = new Float32Array(img.v.length);
  for (let i = 0; i < out.length; i++) {
    let a = Math.min(1, Math.max(0, (hat[i]! - map.threshold * 0.6) / (map.threshold * 0.8)));
    const x = i % img.w;
    const y = (i - x) / img.w;
    const near = Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * heart * heart));
    if (near > 0.01) {
      const dw = (img.v[i]! - wide.v[i]!) * sign;
      a = Math.max(a, near * Math.min(1, Math.max(0, dw / (2 * map.threshold))));
    }
    // Faded out toward the photograph's own edge, so it has none on the pane.
    const edge =
      Math.min(x, y, img.w - 1 - x, img.h - 1 - (y | 0)) /
      Math.max(4, 0.04 * Math.min(img.w, img.h));
    out[i] = a * Math.min(1, Math.max(0, edge)) * (glass ? glass[i]! : 1);
  }
  return out;
}

/** Clear crack specks smaller than `min` pixels (dust, noise), in place. */
function despeckle(mask: Uint8Array, w: number, h: number, min: number) {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const blob: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    blob.length = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      blob.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (blob.length < min) for (const i of blob) mask[i] = 0;
  }
}

export type Regions = {
  /** Which piece each pixel belongs to (every pixel, cracks included). */
  labels: Int32Array;
  count: number;
  /** The unbroken glass round the break: pieces touching the photograph's border. */
  outside: Set<number>;
  /** The crushed spot: the tiny pieces round the strike, merged into one. */
  crushed: number | null;
};

/** Cut a crack map into pieces. */
export function crackRegions(map: CrackMap): Regions {
  const { w, h, strike } = map;
  /*
   * A photographed crack fades in and out along its length, so the mask has
   * gaps a pixel or two long that no real crack has. Thickened by a little
   * for cutting pieces (only), the cracks close them.
   */
  const g = Math.max(1, Math.round(Math.min(w, h) / 320));
  const thick = extreme({ w, h, v: Float32Array.from(map.mask) }, g, true);
  const mask = Uint8Array.from(thick.v, (x) => (x > 0.5 ? 1 : 0));
  const labels = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  let count = 0;
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] || labels[s]! >= 0) continue;
    let size = 0;
    stack.push(s);
    labels[s] = count;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      const near = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const j of near) {
        if (j >= 0 && !mask[j] && labels[j]! < 0) {
          labels[j] = count;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
    count++;
  }
  // The crushed spot: pieces too small to be shards, near the strike, become one.
  const tiny = Math.max(6, (w * h) / 20000);
  const near = map.extent * 0.12 + 4;
  let crushed: number | null = null;
  const remap = new Int32Array(count).map((_, k) => k);
  const centre = new Float64Array(count * 2);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]!;
    if (l < 0) continue;
    centre[l * 2] = centre[l * 2]! + (i % w);
    centre[l * 2 + 1] = centre[l * 2 + 1]! + Math.floor(i / w);
  }
  for (let k = 0; k < count; k++) {
    const cx = centre[k * 2]! / sizes[k]!;
    const cy = centre[k * 2 + 1]! / sizes[k]!;
    if (sizes[k]! < tiny * 4 && Math.hypot(cx - strike.x, cy - strike.y) < near) {
      if (crushed === null) crushed = k;
      remap[k] = crushed;
    }
  }
  for (let i = 0; i < labels.length; i++) if (labels[i]! >= 0) labels[i] = remap[labels[i]!]!;
  // Crack pixels (and specks too small to be anything) go to the piece beside them.
  for (let pass = 0; pass < 64; pass++) {
    let left = 0;
    const next = Int32Array.from(labels);
    for (let i = 0; i < labels.length; i++) {
      if (labels[i]! >= 0) continue;
      const x = i % w;
      const y = (i - x) / w;
      const around = [
        x > 0 ? i - 1 : -1,
        y > 0 ? i - w : -1,
        x < w - 1 ? i + 1 : -1,
        y < h - 1 ? i + w : -1,
      ];
      let got = -1;
      for (const j of around) if (j >= 0 && labels[j]! >= 0) got = labels[j]!;
      if (got >= 0) next[i] = got;
      else left++;
    }
    labels.set(next);
    if (!left) break;
  }
  // Tiny pieces elsewhere are specks in the glass, not shards: join a neighbour.
  const areas = new Int32Array(count);
  for (const l of labels) if (l >= 0) areas[l] = areas[l]! + 1;
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]!;
    if (l < 0 || areas[l]! >= tiny || l === crushed) continue;
    const x = i % w;
    const j = x > 0 ? i - 1 : i + 1;
    if (labels[j]! >= 0 && labels[j] !== l) labels[i] = labels[j]!;
  }
  /*
   * The unbroken glass round the break: the largest piece touching the
   * photograph's border (the rest of the pane). Other pieces at the border are
   * shards the cracks ran out to the frame to cut.
   */
  const border = new Set<number>();
  for (let x = 0; x < w; x++) {
    border.add(labels[x]!);
    border.add(labels[(h - 1) * w + x]!);
  }
  for (let y = 0; y < h; y++) {
    border.add(labels[y * w]!);
    border.add(labels[y * w + w - 1]!);
  }
  const size = new Map<number, number>();
  for (const l of labels) size.set(l, (size.get(l) ?? 0) + 1);
  let biggest = -1;
  for (const l of border)
    if (l !== crushed && (size.get(l) ?? 0) > (size.get(biggest) ?? 0)) biggest = l;
  const outside = new Set<number>();
  // It counts as unbroken glass only if it is most of the photograph's rim.
  if (biggest >= 0 && (size.get(biggest) ?? 0) > 0.2 * w * h) outside.add(biggest);
  return { labels, count, outside, crushed };
}

/**
 * Every piece's outline in one pass: each piece's closed boundary loops (its
 * outer edge and any holes), along pixel edges, simplified to within `tol` px.
 */
export function regionLoops(
  labels: Int32Array,
  w: number,
  h: number,
  tol = 0.8,
): Map<number, Pt[][]> {
  const lab = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h ? labels[y * w + x]! : -2;
  // Directed boundary edges between pixel corners, the piece on the right (screen y down).
  const edges = new Map<number, Map<number, number[]>>();
  const key = (x: number, y: number) => y * (w + 1) + x;
  const add = (l: number, x0: number, y0: number, x1: number, y1: number) => {
    let m = edges.get(l);
    if (!m) edges.set(l, (m = new Map()));
    const k = key(x0, y0);
    const list = m.get(k);
    if (list) list.push(key(x1, y1));
    else m.set(k, [key(x1, y1)]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x]!;
      if (l < 0) continue;
      if (lab(x, y - 1) !== l) add(l, x, y, x + 1, y);
      if (lab(x + 1, y) !== l) add(l, x + 1, y, x + 1, y + 1);
      if (lab(x, y + 1) !== l) add(l, x + 1, y + 1, x, y + 1);
      if (lab(x - 1, y) !== l) add(l, x, y + 1, x, y);
    }
  }
  const at = (k: number): Pt => ({ x: k % (w + 1), y: Math.floor(k / (w + 1)) });
  const out = new Map<number, Pt[][]>();
  for (const [l, next] of edges) {
    const loops: Pt[][] = [];
    for (const [start, list] of next) {
      while (list.length) {
        const loop: Pt[] = [at(start)];
        let prev = start;
        let cur = list.pop()!;
        for (let guard = 0; guard < 4 * (w + 1) * (h + 1) && cur !== start; guard++) {
          loop.push(at(cur));
          const outs = next.get(cur);
          if (!outs || !outs.length) break;
          // At a pinch (two ways on), keep to the tightest turn so loops do not cross.
          let pick = 0;
          if (outs.length > 1) {
            const p = at(prev);
            const c = at(cur);
            const dir = Math.atan2(c.y - p.y, c.x - p.x);
            let bestTurn = Infinity;
            outs.forEach((o, idx) => {
              const q = at(o);
              let turn = Math.atan2(q.y - c.y, q.x - c.x) - dir;
              turn = Math.atan2(Math.sin(turn), Math.cos(turn));
              if (turn < bestTurn) {
                bestTurn = turn;
                pick = idx;
              }
            });
          }
          prev = cur;
          cur = outs.splice(pick, 1)[0]!;
        }
        if (loop.length >= 3) loops.push(simplifyLoop(loop, tol));
      }
    }
    out.set(
      l,
      loops.filter((lp) => lp.length >= 3),
    );
  }
  return out;
}

/** Ramer-Douglas-Peucker on a closed loop. */
function simplifyLoop(loop: Pt[], tol: number): Pt[] {
  if (loop.length < 8) return loop;
  const rdp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let far = 0;
    let fi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
      if (d > far) {
        far = d;
        fi = i;
      }
    }
    if (far <= tol) return [a, b];
    return [...rdp(pts.slice(0, fi + 1)).slice(0, -1), ...rdp(pts.slice(fi))];
  };
  const half = Math.floor(loop.length / 2);
  const one = rdp(loop.slice(0, half + 1));
  const two = rdp([...loop.slice(half), loop[0]!]);
  return [...one.slice(0, -1), ...two.slice(0, -1)];
}

/** Signed area of a loop (holes wind the other way). */
function loopArea(loop: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i]!;
    const q = loop[(i + 1) % loop.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Where the photograph lands on the pane: its strike on the struck point, turned and scaled. */
export type Placement = { at: Pt; scale: number; turn: number };

/** A photographed break, as shards and cracks on the pane. */
export type PhotoBreak = {
  shards: (Shard & { holes: Pt[][] })[];
  cracks: Crack[];
  placement: Placement;
};

/** From the photograph's pixels to the pane's. */
export function place(p: Pt, strike: Pt, pl: Placement): Pt {
  const dx = (p.x - strike.x) * pl.scale;
  const dy = (p.y - strike.y) * pl.scale;
  const c = Math.cos(pl.turn);
  const s = Math.sin(pl.turn);
  return { x: pl.at.x + c * dx - s * dy, y: pl.at.y + s * dx + c * dy };
}

/**
 * How the photograph lands for a blow: the break reaches further the harder
 * it was struck, from about a third of the pane's smaller side for a tap to
 * past its far corner for a full swing.
 */
export function placementFor(
  map: CrackMap,
  pane: { w: number; h: number; at: Pt },
  energy: number,
  turn: number,
): Placement {
  const far = Math.max(
    Math.hypot(pane.at.x, pane.at.y),
    Math.hypot(pane.w - pane.at.x, pane.at.y),
    Math.hypot(pane.at.x, pane.h - pane.at.y),
    Math.hypot(pane.w - pane.at.x, pane.h - pane.at.y),
  );
  const small = Math.min(pane.w, pane.h) * 0.35;
  const reach = small + (far - small) * Math.max(0, Math.min(1, energy));
  return { at: pane.at, scale: reach / Math.max(map.extent, 1), turn };
}

/** A photographed break, carried onto the pane. */
export function photoBreak(
  map: CrackMap,
  regions: Regions,
  pl: Placement,
  seed = 1,
  energy = 0.7,
  /** What glass it is and how hard it was struck, for how its pieces tilt (shard-tilt). */
  tilt: { kind: GlassKind; energy: number; displacement?: number; thickness?: number } = {
    kind: "annealed",
    energy,
  },
): PhotoBreak {
  const { w, h, strike } = map;
  const shards: PhotoBreak["shards"] = [];
  const cracks: Crack[] = [];
  const rand = (n: number) => {
    const x = Math.sin(seed * 91.345 + n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const reachDiag = Math.max(map.extent, 1);
  const present = new Set<number>();
  for (const l of regions.labels) if (l >= 0) present.add(l);
  const all = regionLoops(regions.labels, w, h);
  for (const label of [...present].sort((a, b) => a - b)) {
    if (regions.outside.has(label)) continue;
    const loops = all.get(label) ?? [];
    if (!loops.length) continue;
    // The outer loop is the largest; the rest are holes.
    loops.sort((a, b) => Math.abs(loopArea(b)) - Math.abs(loopArea(a)));
    const onPane = loops.map((l) => l.map((p) => place(p, strike, pl)));
    const outer = onPane[0]!;
    let cx = 0;
    let cy = 0;
    for (const p of loops[0]!) {
      cx += p.x;
      cy += p.y;
    }
    cx /= loops[0]!.length;
    cy /= loops[0]!.length;
    const reach = Math.hypot(cx - strike.x, cy - strike.y) / reachDiag;
    /*
     * A piece the photograph's own edge cuts through runs on past it, into
     * glass we cannot see: it is held where it is (no step), so the edge of
     * the photograph never shows as a line of its own.
     */
    const atEdge = loops[0]!.some(
      (p) => p.x <= 0.5 || p.y <= 0.5 || p.x >= w - 0.5 || p.y >= h - 0.5,
    );
    const knock = atEdge ? 0 : 0.3 + 0.7 * Math.exp(-reach * 4);
    const k = label;
    // Left in the dent the blow pushed in, and knocked (shard-tilt); a piece
    // the photograph's edge cuts through is held where it is.
    // The way out from the strike, on the pane (the photograph is turned onto it).
    const away = Math.hypot(cx - strike.x, cy - strike.y) || 1;
    const ox = (cx - strike.x) / away;
    const oy = (cy - strike.y) / away;
    const ct = Math.cos(pl.turn);
    const st = Math.sin(pl.turn);
    const t = atEdge
      ? { tiltX: 0, tiltY: 0 }
      : pieceTilt(
          tilt.kind,
          tilt.energy,
          ct * ox - st * oy,
          st * ox + ct * oy,
          reach * 0.5,
          rand(500 + k),
          rand(600 + k),
        );
    shards.push({
      poly: outer,
      holes: onPane.slice(1),
      tiltX: t.tiltX,
      tiltY: t.tiltY,
      lift: atEdge
        ? 0
        : pieceLift(
            tilt.kind,
            tilt.energy,
            reach * 0.5,
            tilt.displacement ?? DISPLACEMENT,
            tilt.thickness ?? THICKNESS_PX,
            rand(900 + k),
          ),
      slip: { x: (rand(700 + k) - 0.5) * 1.6 * knock, y: (rand(800 + k) - 0.5) * 1.6 * knock },
      reach: reach * 0.5,
      crushed: label === regions.crushed,
      /*
       * A hard blow knocks the crushed spot out, and some of the small pieces
       * round it (as the generated annealed break does).
       */
      missing:
        energy > 0.7 &&
        (label === regions.crushed
          ? energy > 0.85
          : reach < 0.15 &&
            Math.abs(loopArea(loops[0]!)) < (map.extent * 0.06) ** 2 &&
            rand(900 + k) < (energy - 0.7) * 1.0),
    });
    // Its outline is where the cracks run (each crack is two pieces' edge; drawn at half each).
    for (const loop of onPane) cracks.push({ kind: "radial", pts: [...loop, loop[0]!], segs: [] });
  }
  return { shards, cracks, placement: pl };
}
