/**
 * The room the glass reflects (effects/optics/environment), as one texture
 * on the shared context for every pass that samples it (the water, the
 * crack faces; the glass passes keep their own mip chains).
 *
 * Level 0 only, 1024 x 256, log-encoded as the file is: a pass decodes
 * what it reads (environment.glsl decodeRadiance). The room's mean
 * radiance, linear, is kept beside it for the passes that need the room's
 * overall light rather than a direction of it (light scattered by a rough
 * crack face, light piped along a pane).
 */

import { decodeRadiance } from "@fx/effects/optics/environment";

export type RoomTexture = {
  /** The texture, or null until it has loaded (then `wake` is called) or when the page has no room. */
  texture: WebGLTexture | null;
  /** The room's mean radiance, linear RGB, at exposure 1. */
  mean: [number, number, number];
};

type Cache = { room: RoomTexture; wakes: Set<() => void> };
const caches = new WeakMap<WebGLRenderingContext, Cache>();

export const ROOM_TEX_WIDTH = 1024;
export const ROOM_TEX_HEIGHT = 256;

/** The page's room, loading on first use. `dispose` forgets this pass's wake; the texture stays for the others. */
export function roomTexture(
  gl: WebGLRenderingContext,
  wake: () => void,
  unit = gl.TEXTURE3,
): RoomTexture & { dispose(): void } {
  let cache = caches.get(gl);
  if (!cache) {
    const room: RoomTexture = { texture: null, mean: [0.05, 0.045, 0.04] };
    cache = { room, wakes: new Set() };
    caches.set(gl, cache);
    const src =
      typeof document === "undefined"
        ? null
        : document.documentElement.getAttribute("data-room-hdr");
    if (src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (gl.isContextLost()) return;
        const c = document.createElement("canvas");
        c.width = ROOM_TEX_WIDTH;
        c.height = ROOM_TEX_HEIGHT;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        // The mean in linear light, from a coarse copy: enough for an average.
        const small = document.createElement("canvas");
        small.width = 64;
        small.height = 16;
        const sc = small.getContext("2d", { willReadFrequently: true });
        if (sc) {
          sc.drawImage(c, 0, 0, small.width, small.height);
          const d = sc.getImageData(0, 0, small.width, small.height).data;
          const sum = [0, 0, 0];
          for (let i = 0; i < d.length; i += 4) {
            for (let k = 0; k < 3; k++) sum[k]! += decodeRadiance(d[i + k]! / 255);
          }
          const n = d.length / 4;
          room.mean = [sum[0]! / n, sum[1]! / n, sum[2]! / n];
        }
        const tex = gl.createTexture();
        gl.activeTexture(unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        room.texture = tex;
        for (const w of cache!.wakes) w();
      };
      img.src = src;
    }
  }
  const c = cache;
  c.wakes.add(wake);
  return {
    get texture() {
      return c.room.texture;
    },
    get mean() {
      return c.room.mean;
    },
    dispose() {
      c.wakes.delete(wake);
    },
  };
}
