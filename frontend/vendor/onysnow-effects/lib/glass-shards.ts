import { regionLoops } from "@fx/effects/optics/crack-photo";
import type { Pt } from "@fx/effects/optics/fracture";

/**
 * Ony's photographs of broken glass pieces (public/glass-shards, 55 of them,
 * cut out on transparent ground; from his "55 PNG de morceaux de verre en 8K"
 * set, reduced to 768 px WebP). Every piece of a break wears a different one
 * -- its dust, chips, inner cracks and lit edges -- and the pieces a hard
 * blow knocks out fall as them, so no two breaks, and no two pieces, are the
 * same glass (Ony: "use as many different glass references as you can").
 */
export const GLASS_SHARDS: readonly string[] = Array.from(
  { length: 55 },
  (_, i) => `/glass-shards/shard-${String(i + 1).padStart(2, "0")}.webp`,
);

const cache = new Map<string, Promise<HTMLImageElement | null>>();

/** One shard photograph, loaded once. */
export function loadShard(url: string): Promise<HTMLImageElement | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const job = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cache.set(url, job);
  return job;
}

/** The shard photographs a break with this seed uses, `count` of them, all different. */
export function shardsFor(seed: number, count: number): string[] {
  const n = GLASS_SHARDS.length;
  const start = Math.abs(Math.floor(seed * 7919)) % n;
  // A stride coprime with 55 walks every photograph before repeating.
  const stride = 17;
  return Array.from(
    { length: Math.min(count, n) },
    (_, i) => GLASS_SHARDS[(start + i * stride) % n]!,
  );
}

/**
 * A photographed piece's outline, from its transparency: the silhouette of
 * everything with a trace of glass in it (clear glass cut out is nearly
 * transparent), holes filled, as a polygon centred on the piece and scaled
 * so its larger side is 1.
 */
export function outlineFromAlpha(alpha: Float32Array, w: number, h: number): Pt[] {
  const labels = new Int32Array(w * h).fill(0);
  // The background: what the border reaches through empty pixels.
  const stack: number[] = [];
  const seed = (i: number) => {
    if (labels[i] === 0 && alpha[i]! <= 0.03) {
      labels[i] = -1;
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
  const loops = regionLoops(labels, w, h, 0.6).get(0) ?? [];
  if (!loops.length) return [];
  const area = (l: Pt[]) =>
    Math.abs(
      l.reduce((a, p, i) => a + p.x * l[(i + 1) % l.length]!.y - l[(i + 1) % l.length]!.x * p.y, 0),
    );
  const outer = loops.reduce((a, b) => (area(b) > area(a) ? b : a));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of outer) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const side = Math.max(x1 - x0, y1 - y0, 1);
  return outer.map((p) => ({ x: (p.x - (x0 + x1) / 2) / side, y: (p.y - (y0 + y1) / 2) / side }));
}

const outlines = new Map<HTMLImageElement, Pt[]>();

/** A loaded shard photograph's outline (outlineFromAlpha), read once. */
export function shardOutline(img: HTMLImageElement): Pt[] {
  const hit = outlines.get(img);
  if (hit) return hit;
  const k = 128 / Math.max(img.naturalWidth, img.naturalHeight, 1);
  const w = Math.max(2, Math.round(img.naturalWidth * k));
  const h = Math.max(2, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]! / 255;
  const out = outlineFromAlpha(alpha, w, h);
  outlines.set(img, out);
  return out;
}
