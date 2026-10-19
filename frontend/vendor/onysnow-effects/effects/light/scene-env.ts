/**
 * The scene as an environment: what is actually behind and round a thing
 * floating in front of the page, for it to reflect and be lit by (Ony,
 * 2026-10-01, of the balloons: "What is that purple glow on the edges ...
 * It doesn't look realistic", and earlier: "it looks cgi, and that is
 * usually caused by how it reacts to light in its environment").
 *
 * A glossy object's rim reflects what lies behind it, at grazing incidence,
 * where Fresnel reflectance is highest -- so in a photograph a balloon's
 * edge takes the colours of the scene round it (the image-based lighting
 * principle: Debevec 1998, "Rendering synthetic objects into real scenes").
 * The stock studio panorama the balloons reflected had nothing to do with
 * the page: its violet window light ringed every balloon.
 *
 * So the environment here is the page itself: the photographs in view,
 * drawn where they are (object-fit and object-position honoured), the glass
 * panes' own fill over them, into a small power-of-two texture of the
 * viewport, mipmapped so a satin surface can sample it as blurred as its
 * roughness. Its mean colour is the scene's light, for the side of a thing
 * that faces the room (behind the viewer: not in the photograph, lit by the
 * same light).
 *
 * Only images that can be read back (CORS) are used, each loaded once as
 * an anonymous-CORS copy; one that cannot be is left out, not tainting.
 */
import { glassGeometry } from "@fx/effects/scene/scene";

/** The texture's size: the viewport squeezed into 512 x 256 (blurred heavily, its aspect does not matter). */
const ENV_W = 512;
const ENV_H = 256;
/** How often it is redrawn while the page moves, ms. */
const REFRESH_MS = 200;

export type SceneEnv = {
  /** Redraw it if the page has moved (cheap when it has not). Returns the texture, or null before any image has loaded. */
  update(): WebGLTexture | null;
  /** The scene's mean colour, display values 0-1. */
  readonly average: [number, number, number];
  dispose(): void;
};

type Fit = { sx: number; sy: number; sw: number; sh: number };

/** The part of the image an object-fit: cover (or fill / contain, approximately) box shows. */
function fitOf(img: HTMLImageElement, nw: number, nh: number, bw: number, bh: number): Fit {
  const cs = getComputedStyle(img);
  const fit = cs.objectFit;
  if (fit === "fill" || !nw || !nh || !bw || !bh) return { sx: 0, sy: 0, sw: nw, sh: nh };
  const [px, py] = (cs.objectPosition || "50% 50%")
    .split(" ")
    .map((v) => (v.endsWith("%") ? Number.parseFloat(v) / 100 : 0.5));
  const scale =
    fit === "contain" || fit === "scale-down"
      ? Math.min(bw / nw, bh / nh)
      : Math.max(bw / nw, bh / nh);
  const sw = Math.min(nw, bw / scale);
  const sh = Math.min(nh, bh / scale);
  return { sx: (nw - sw) * (px ?? 0.5), sy: (nh - sh) * (py ?? 0.5), sw, sh };
}

export function sceneEnvironment(gl: WebGLRenderingContext, onLoad: () => void): SceneEnv {
  const canvas = document.createElement("canvas");
  canvas.width = ENV_W;
  canvas.height = ENV_H;
  const ctx = canvas.getContext("2d");
  const one = document.createElement("canvas");
  one.width = one.height = 1;
  const oneCtx = one.getContext("2d", { willReadFrequently: true });
  const copies = new Map<string, HTMLImageElement | null>();
  let tex: WebGLTexture | null = null;
  let last = 0;
  let lastKey = "";
  let dirty = true;
  const average: [number, number, number] = [0.25, 0.22, 0.2];

  const copyOf = (src: string): HTMLImageElement | null => {
    if (copies.has(src)) return copies.get(src) ?? null;
    copies.set(src, null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      copies.set(src, img);
      dirty = true;
      onLoad();
    };
    img.src = src;
    return null;
  };

  const draw = (W: number, H: number) => {
    if (!ctx) return false;
    const sx = ENV_W / W;
    const sy = ENV_H / H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#111";
    ctx.fillRect(0, 0, ENV_W, ENV_H);
    let drew = false;
    for (const el of document.querySelectorAll("img")) {
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 60 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W)
        continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const src = el.currentSrc || el.src;
      if (!src) continue;
      const copy = copyOf(src);
      if (!copy) continue;
      const f = fitOf(el, copy.naturalWidth, copy.naturalHeight, r.width, r.height);
      ctx.globalAlpha = Number(getComputedStyle(el).opacity) || 1;
      ctx.drawImage(
        copy,
        f.sx,
        f.sy,
        f.sw,
        f.sh,
        r.left * sx,
        r.top * sy,
        r.width * sx,
        r.height * sy,
      );
      drew = true;
    }
    ctx.globalAlpha = 1;
    // The glass in front of the photographs: its fill veils them as the frost does.
    for (const g of glassGeometry()) {
      const bg = getComputedStyle(g.el).backgroundColor;
      if (!bg || bg === "transparent") continue;
      ctx.fillStyle = bg;
      ctx.fillRect(g.x * sx, g.y * sy, g.w * sx, g.h * sy);
    }
    return drew;
  };

  return {
    average,
    update() {
      const now = performance.now();
      const W = document.documentElement.clientWidth || window.innerWidth;
      const H = document.documentElement.clientHeight || window.innerHeight;
      const key = `${Math.round(window.scrollY)},${W},${H}`;
      if (!dirty && key === lastKey) return tex;
      if (now - last < REFRESH_MS && tex) return tex;
      last = now;
      lastKey = key;
      dirty = false;
      if (!draw(W, H) && !tex) return null;
      if (!tex) tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, canvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (oneCtx) {
        oneCtx.imageSmoothingQuality = "high";
        oneCtx.drawImage(canvas, 0, 0, 1, 1);
        const d = oneCtx.getImageData(0, 0, 1, 1).data;
        average[0] = d[0]! / 255;
        average[1] = d[1]! / 255;
        average[2] = d[2]! / 255;
      }
      return tex;
    },
    dispose() {
      if (tex) gl.deleteTexture(tex);
      tex = null;
    },
  };
}

/**
 * The shader side: the scene a reflected ray sees. `P` is the point (page
 * px, z its height above the page), `R` the reflected direction (page
 * frame: y down, z toward the viewer). A ray that heads back into the page
 * lands on it and sees the photograph there, blurred by the surface's
 * roughness over the distance; one heading into the room sees the room,
 * lit by the scene's own light (its mean colour, brighter toward the
 * ceiling).
 */
export const SCENE_ENV_GLSL = /* glsl */ `
uniform sampler2D uScene;
uniform float uHasScene;
uniform vec2 uSceneView;     // the viewport, CSS px
uniform vec3 uSceneAverage;
// The photograph a reflected ray lands on behind the thing, and how much of the view is it (0: the ray heads into the room).
vec3 scenePage(vec3 P, vec3 R, float rough, out float w) {
  float into = clamp(-R.z, 0.0, 1.0);
  w = uHasScene > 0.5 ? smoothstep(0.05, 0.45, into) : 0.0;
  float t = P.z / max(into, 0.08);
  vec2 hit = P.xy + R.xy * t;
  float spread = max(rough * t, 1.0) * 512.0 / max(uSceneView.x, 1.0);
  float lod = clamp(log2(spread) + 1.0, 2.0, 8.0);
  return texture2D(uScene, clamp(hit / uSceneView, 0.0, 1.0), lod).rgb;
}
/*
 * A room panorama (behind the viewer, which no photograph shows) balanced
 * to the scene's light: its own colours mostly taken out, the scene's
 * mean hue put in, its brightness and its shapes (the windows, the lamps)
 * kept -- what makes a glossy thing read as glossy.
 */
vec3 roomBalanced(vec3 room) {
  float lr = dot(room, vec3(0.2126, 0.7152, 0.0722));
  float la = dot(uSceneAverage, vec3(0.2126, 0.7152, 0.0722));
  vec3 hue = clamp(uSceneAverage / max(la, 0.04), 0.0, 2.0);
  return mix(vec3(lr), room, 0.25) * mix(vec3(1.0), hue, 0.5);
}
vec3 sceneSeen(vec3 P, vec3 R, float rough) {
  vec3 roomSide = uSceneAverage * (0.55 + 0.35 * clamp(-R.y, 0.0, 1.0));
  float w;
  vec3 page = scenePage(P, R, rough, w);
  return mix(roomSide, page, w);
}
`;
