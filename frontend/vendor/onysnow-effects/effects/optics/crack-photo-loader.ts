/**
 * Reading a crack photograph in the browser (effects/optics/crack-photo is
 * the pure part): its pixels at a working size for finding the cracks, and a
 * layer at up to 1536 px -- the photograph with each pixel's crack strength
 * as its alpha -- for drawing them. Once per photograph, however many panes
 * are struck with it.
 */

import {
  crackMap,
  crackRegions,
  crackStrength,
  type CrackMap,
  type Grey,
  type Regions,
} from "./crack-photo";

export type LoadedCrackPhoto = {
  map: CrackMap;
  regions: Regions;
  /** The visible cracks: the photograph, transparent where it is not crack. */
  layer: HTMLCanvasElement;
  /** Layer px per working px. */
  layerScale: number;
};

const WORK = 640;
const LAYER = 1536;
const cache = new Map<string, Promise<LoadedCrackPhoto | null>>();

function greyOf(img: HTMLImageElement, long: number): { grey: Grey; rgba: ImageData } | null {
  const k = Math.min(1, long / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h);
  const v = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);
  let cut = false;
  for (let i = 0; i < v.length; i++) {
    const r = rgba.data[i * 4]! / 255;
    const g = rgba.data[i * 4 + 1]! / 255;
    const b = rgba.data[i * 4 + 2]! / 255;
    const a = rgba.data[i * 4 + 3]! / 255;
    // A cut-out photograph is read over black: no glass, no light.
    v[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
    alpha[i] = a;
    if (a < 0.98) cut = true;
  }
  return { grey: cut ? { w, h, v, alpha } : { w, h, v }, rgba };
}

/** Load and read a crack photograph; null if it cannot be read. */
export function loadCrackPhoto(url: string): Promise<LoadedCrackPhoto | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const job = new Promise<LoadedCrackPhoto | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const work = greyOf(img, WORK);
        const full = greyOf(img, LAYER);
        if (!work || !full) return resolve(null);
        const map = crackMap(work.grey);
        const regions = crackRegions(map);
        const alpha = crackStrength(full.grey, map);
        const layer = document.createElement("canvas");
        layer.width = full.grey.w;
        layer.height = full.grey.h;
        const data = full.rgba;
        for (let i = 0; i < alpha.length; i++) data.data[i * 4 + 3] = Math.round(alpha[i]! * 255);
        layer.getContext("2d")?.putImageData(data, 0, 0);
        resolve({ map, regions, layer, layerScale: full.grey.w / work.grey.w });
      } catch {
        resolve(null);
      }
    };
    img.src = url;
  });
  cache.set(url, job);
  return job;
}
