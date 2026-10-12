/**
 * The photographs as textures on the shared context, loaded once each and
 * shared by every pass that samples them (the water, the crack faces;
 * docs/rain-system.md 12, docs/broken-glass-system.md 12: one loader).
 *
 * A pass that shows a photograph shrunk (a drop's lens, a crack's fold)
 * needs mipmaps, and WebGL1 mipmaps only a power-of-two texture: each one is
 * resampled to the nearest power of two, up to 4096. The size is kept beside
 * the texture, for a pass that needs texels per pixel.
 *
 * The full-size rendition may not be served for a texture (no CORS header);
 * a pass passes the small one as the fallback and gets that instead.
 *
 * One cache per context: two passes asking for the same photograph get the
 * same texture, and each is woken when it lands.
 */

export type PhotoTextures = {
  /** The texture for `src`, or null until it has loaded (then `wake` is called). */
  get(src: string, fallback?: string): WebGLTexture | null;
  /** The texture's size, texels. */
  size(tex: WebGLTexture): [number, number] | undefined;
  /** This pass is done with the cache; the textures go when the last pass has. */
  dispose(): void;
};

const MAX_SIDE = 4096;

type Cache = {
  photos: Map<string, WebGLTexture | null>;
  sizes: WeakMap<WebGLTexture, [number, number]>;
  wakes: Set<() => void>;
};

const caches = new WeakMap<WebGLRenderingContext, Cache>();

export function photoTextures(
  gl: WebGLRenderingContext,
  wake: () => void,
  unit = gl.TEXTURE1,
): PhotoTextures {
  let cache = caches.get(gl);
  if (!cache) {
    cache = { photos: new Map(), sizes: new WeakMap(), wakes: new Set() };
    caches.set(gl, cache);
  }
  const { photos, sizes, wakes } = cache;
  wakes.add(wake);
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const pow2 = (n: number) => 2 ** Math.round(Math.log2(Math.max(n, 1)));
  const wakeAll = () => {
    for (const w of wakes) w();
  };
  const get = (src: string, fallback?: string): WebGLTexture | null => {
    if (photos.has(src)) return photos.get(src) ?? null;
    photos.set(src, null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (gl.isContextLost()) return;
      const c = document.createElement("canvas");
      c.width = Math.min(pow2(img.naturalWidth), maxTex, MAX_SIDE);
      c.height = Math.min(pow2(img.naturalHeight), maxTex, MAX_SIDE);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const tex = gl.createTexture();
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (tex) sizes.set(tex, [c.width, c.height]);
      photos.set(src, tex);
      wakeAll();
    };
    img.onerror = () => {
      if (!fallback || fallback === src) return;
      const poll = () => {
        const tex = get(fallback);
        if (tex) {
          photos.set(src, tex);
          wakeAll();
        } else window.setTimeout(poll, 250);
      };
      poll();
    };
    img.src = src;
    return null;
  };
  return {
    get,
    size: (tex) => sizes.get(tex),
    dispose() {
      wakes.delete(wake);
      if (wakes.size > 0) return;
      for (const tex of photos.values()) if (tex) gl.deleteTexture(tex);
      photos.clear();
      caches.delete(gl);
    },
  };
}
