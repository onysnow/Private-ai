import { useEffect, useRef } from "react";
import {
  beginPass,
  blitAll,
  buildProgram,
  endPass,
  fullScreenTriangle,
  onSharedGlLoss,
} from "@fx/effects/engine/gl";
import { SOLIDS_GLSL } from "@fx/effects/optics/solids.glsl";
import { ENVIRONMENT_GLSL } from "@fx/effects/optics/environment.glsl";
import { SOLID_SHAPES, type SolidShape } from "@fx/effects/optics/solids";
import { castOf, smoothCast } from "@fx/effects/optics/solid-cast";
import { indexAt } from "@fx/effects/optics/dispersion";
import { materialById, type MaterialId } from "@fx/effects/materials/presets";
import { cursorLamp, onLightChange, roomLight } from "@fx/effects/light/lights";
import { viewState } from "@fx/effects/scene/scene";
import { camera } from "@fx/effects/camera/camera";
import { registerBeamSolid } from "@fx/effects/scene/beam-solids";

/**
 * How much of the page's light the lamp is, where it shines: the share of
 * the page a shadow takes back, and how much of the gathered light shows
 * over the page's own brightness. The count itself (the ratio) is physics;
 * these say how the lamp's part of the page compares to the whole.
 */
const SHADE_SHARE = 0.6;
const CAUSTIC_SHARE = 0.16;

/** The three wavelengths the solid is traced at, nm: a red, a green and a blue primary. */
const WAVELENGTHS = [610, 550, 465] as const;
/** CSS px of path per unit of a material's absorption (as the laser's beam, effects/optics/beam). */
const PATH_UNIT = 1000;

const VERTEX = /* glsl */ `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec2 uBoxOrigin;   // the canvas's top-left, viewport CSS px
uniform vec2 uBoxSize;     // its size, CSS px
uniform float uScale;      // device px per CSS px
uniform vec3 uEye;         // the viewer's eye: viewport CSS px, and its height above the page
uniform vec3 uCentre;      // the solid's centre, same space
uniform mat3 uToWorld;     // object axes in the world
uniform mat3 uToObject;    // and back
uniform float uSize;
uniform vec3 uIndex;       // the glass's index at the red, green and blue wavelengths
uniform vec3 uAbsorb;      // absorption per CSS px, per channel
uniform sampler2D uPhoto;
uniform float uHasPhoto;
uniform vec4 uPhotoRect;   // the photograph's box, viewport CSS px
uniform vec4 uPhotoCover;  // object-fit: cover as uv = offset + (page uv) * scale
uniform vec4 uLamp;        // lamp x, y, height, charge
uniform vec3 uLampColour;
uniform float uRoom;       // the room's brightness
uniform sampler2D uRoomTex; // the room the panes mirror (effects/optics/environment)
uniform float uHasRoom;
${SOLIDS_GLSL}
${ENVIRONMENT_GLSL}

/* What lies on the page at a point: the photograph, as the page shows it. */
vec3 pageAt(vec2 p) {
  vec2 uv = (p - uPhotoRect.xy) / uPhotoRect.zw;
  uv = uPhotoCover.xy + uv * uPhotoCover.zw;
  vec3 photo = texture2D(uPhoto, clamp(uv, 0.001, 0.999)).rgb;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return mix(vec3(0.02), photo, uHasPhoto * inside);
}

/*
 * The room, seen in a direction (world: x right, y down, z toward the
 * viewer): the same room, at the same real brightness, that every pane
 * mirrors; a plain overhead glow until it has loaded.
 */
vec3 roomAt(vec3 dir) {
  if (uHasRoom > 0.5) {
    return uRoom * decodeRadiance(texture2D(uRoomTex, roomUvDir(normalize(dir))).rgb);
  }
  float up = clamp(dir.z, 0.0, 1.0);
  return uRoom * (vec3(0.05) + vec3(0.55, 0.52, 0.48) * pow(up, 3.0));
}

/* One channel of the light that came through the solid along a wavelength's path. */
float channel(vec3 p, vec3 d, vec3 n0, float n, float absorb, int c) {
  vec3 dIn = refract(d, n0, 1.0 / n);
  vec3 q = p;
  vec3 dd = dIn;
  float kept = 1.0;
  float got = 0.0;
  for (int b = 0; b < 4; b++) {
    float t = solidCrossing(q, dd, uSize, -1.0, uSize * 6.0);
    if (t < 0.0) break;
    kept *= exp(-absorb * t);
    q += dd * t;
    vec3 inward = -solidNormal(q, uSize);
    float cosI = clamp(abs(dot(dd, inward)), 0.0, 1.0);
    float R = fresnelExact(cosI, n, 1.0);
    vec3 leaving = refract(dd, inward, n);
    if (R < 1.0 && dot(leaving, leaving) > 0.0) {
      // Out, and on to the page below or the room above.
      vec3 pw = uCentre + uToWorld * q;
      vec3 dw = uToWorld * normalize(leaving);
      vec3 seen = dw.z < -1e-3 ? pageAt((pw + dw * (-pw.z / dw.z)).xy) : roomAt(dw);
      got = kept * (1.0 - R) * (c == 0 ? seen.r : c == 1 ? seen.g : seen.b);
      break;
    }
    dd = reflect(dd, inward);
  }
  return got;
}

void main() {
  vec2 page = vec2(
    uBoxOrigin.x + gl_FragCoord.x / uScale,
    uBoxOrigin.y + uBoxSize.y - gl_FragCoord.y / uScale
  );
  // From the eye to this point of the page, in the solid's own space.
  vec3 dw = normalize(vec3(page, 0.0) - uEye);
  vec3 o = uToObject * (uEye - uCentre);
  vec3 d = uToObject * dw;
  // Skip to its bounding sphere, then find the surface.
  float bound = uSize * 1.8;
  float b = dot(o, d);
  float disc = b * b - (dot(o, o) - bound * bound);
  if (disc < 0.0) discard;
  float t0 = max(0.0, -b - sqrt(disc));
  vec3 start = o + d * t0;
  float t = solidCrossing(start, d, uSize, 1.0, bound * 2.2);
  if (t < 0.0) discard;
  vec3 p = start + d * t;
  vec3 n0 = solidNormal(p, uSize);
  float cosI = clamp(-dot(d, n0), 0.0, 1.0);

  // What came through, a wavelength per channel: the spectrum comes apart by itself.
  vec3 through = vec3(
    channel(p, d, n0, uIndex.r, uAbsorb.r, 0),
    channel(p, d, n0, uIndex.g, uAbsorb.g, 1),
    channel(p, d, n0, uIndex.b, uAbsorb.b, 2)
  );
  through *= 1.0 - fresnelExact(cosI, 1.0, uIndex.g);

  // What the surface mirrors: the room, and the lamp as a hard highlight.
  vec3 rw = uToWorld * reflect(d, n0);
  float R0 = fresnelExact(cosI, 1.0, uIndex.g);
  vec3 hit = uCentre + uToWorld * p;
  vec3 toLamp = normalize(vec3(uLamp.xy, uLamp.z) - hit);
  float glint = pow(max(dot(rw, toLamp), 0.0), 600.0) * uLamp.w * 6.0;
  vec3 mirrored = R0 * roomAt(rw) + R0 * glint * uLampColour;

  vec3 colour = through + mirrored;
  colour = colour / (1.0 + colour * 0.35) * 1.35;
  gl_FragColor = vec4(colour, 1.0);
}
`;

/**
 * The photograph under a point of the page, if any: the sharpest image there
 * (a photograph is laid over its own tiny blurred placeholder).
 */
function photoUnder(el: HTMLElement, x: number, y: number): HTMLImageElement | null {
  for (let node: HTMLElement | null = el.parentElement; node; node = node.parentElement) {
    let best: HTMLImageElement | null = null;
    for (const img of node.querySelectorAll("img")) {
      if (img.closest("[data-glass-solid]")) continue;
      const r = img.getBoundingClientRect();
      const over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (over && img.naturalWidth > (best?.naturalWidth ?? 0)) best = img;
    }
    if (best) return best;
  }
  return null;
}

type Props = {
  shape: SolidShape;
  material?: MaterialId;
  /** Half its size, CSS px. */
  size?: number;
  /** How far it leans toward you, degrees (0: seen straight down its axis). */
  tilt?: number;
  /** Turns per minute about its own axis; 0 holds it still. */
  spin?: number;
  /**
   * Stand it end-on in the page's plane -- its axis toward you, still -- so
   * what travels across the page (the laser's beam) meets its cross-section:
   * a prism's triangle, a cube's square, a sphere's circle.
   */
  endOn?: boolean;
  className?: string;
};

/**
 * A solid piece of glass -- a prism, a sphere, a cube, a cone, a pyramid or
 * a rod -- held over the page (item 25g, ?try=solids on Lab samples).
 *
 * Drawn by ray tracing its shape (effects/optics/solids) per pixel from the
 * viewer's eye: where it strikes the glass, the light is split into three
 * wavelengths, each bent by the index the material has at its own
 * wavelength, followed through the solid -- out where it can leave, totally
 * reflected where it cannot -- absorbed along its path, and looked up where
 * it lands on the photograph below, or in the room above. So a sphere turns
 * the photograph over, a prism fans its edges into colour, a cube shows it
 * displaced and doubled by internal reflections. The surface mirrors the
 * room by Fresnel and the lamp as a hard highlight.
 */
export function GlassSolid({
  shape,
  material = "optical-crown",
  size = 70,
  tilt = 35,
  spin = 2,
  endOn = false,
  className,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const shadeLayer = useRef<HTMLCanvasElement>(null);
  const causticLayer = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const canvas = view.current;
    if (!el || !canvas) return;
    const m = materialById(material);
    /*
     * End-on, it stands in the beam's way (effects/scene/beam-solids): its
     * cross-section, measured where it is on the page when asked.
     */
    const removeFromBeam =
      endOn && (shape === "prism" || shape === "cube" || shape === "sphere")
        ? registerBeamSolid({
            material: m,
            outline: () => {
              const r = el.getBoundingClientRect();
              const cx = r.left + r.width / 2;
              const cy = r.top + r.height / 2;
              if (shape === "prism") {
                const k = Math.sqrt(3) / 2;
                return [
                  { x: cx, y: cy - size },
                  { x: cx + size * k, y: cy + size / 2 },
                  { x: cx - size * k, y: cy + size / 2 },
                ];
              }
              if (shape === "cube") {
                return [
                  { x: cx - size, y: cy - size },
                  { x: cx + size, y: cy - size },
                  { x: cx + size, y: cy + size },
                  { x: cx - size, y: cy + size },
                ];
              }
              return Array.from({ length: 36 }, (_, i) => ({
                x: cx + size * Math.cos((i / 36) * Math.PI * 2),
                y: cy + size * Math.sin((i / 36) * Math.PI * 2),
              }));
            },
          })
        : () => {};
    const index = WAVELENGTHS.map((nm) => indexAt(nm, m.ior, m.abbe));
    const absorb = m.absorb.map((a) => a / PATH_UNIT);
    let program: WebGLProgram | null = null;
    let quad: ReturnType<typeof fullScreenTriangle> | null = null;
    let texture: WebGLTexture | null = null;
    let textureOf: string | null = null;
    let loading: string | null = null;
    let room: WebGLTexture | null = null;
    let roomAsked = false;
    /** The room's image, level 0 only: a solid's surfaces are polished. */
    const askRoom = () => {
      if (roomAsked) return;
      roomAsked = true;
      const src = document.documentElement.getAttribute("data-room-hdr");
      if (!src) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const shared = beginPass(1, 1, "solid-room");
        if (!shared) return;
        const g = shared.gl;
        const w = 1024;
        const h = 256;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")?.drawImage(img, 0, 0, w, h);
        room = g.createTexture();
        g.bindTexture(g.TEXTURE_2D, room);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, c);
        // Round the full 360 degrees across; clamped top and bottom.
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        endPass();
        wake();
      };
      img.src = src;
    };
    let U: (name: string) => WebGLUniformLocation | null = () => null;

    const setup = () => {
      const pass = beginPass(1, 1, "solid-setup");
      if (!pass) return false;
      const { gl } = pass;
      program = buildProgram(gl, VERTEX, FRAGMENT, "glass solid");
      endPass();
      if (!program) return false;
      quad = fullScreenTriangle(gl, program);
      const locations = new Map<string, WebGLUniformLocation | null>();
      const prog = program;
      U = (name) => {
        if (!locations.has(name)) locations.set(name, gl.getUniformLocation(prog, name));
        return locations.get(name) ?? null;
      };
      texture = null;
      textureOf = null;
      return true;
    };

    /*
     * What it throws on the page (effects/optics/solid-cast): counted from
     * the lamp, a few times a second at most -- the count is the costly
     * part, and a shadow that trails a spinning solid by a tenth of a
     * second reads as the same shadow.
     */
    let castAt = -Infinity;
    let castKey = "";
    const CAST_CELLS = 56;
    const castFrom = (
      toWorld: readonly number[],
      cx: number,
      cy: number,
      rect: DOMRect,
      now: number,
    ) => {
      const shadeEl = shadeLayer.current;
      const causticEl = causticLayer.current;
      if (!shadeEl || !causticEl) return;
      const lit = cursorLamp.charge;
      if (lit < 0.02) {
        shadeEl.style.opacity = "0";
        causticEl.style.opacity = "0";
        return;
      }
      const key = `${Math.round(cursorLamp.x)},${Math.round(cursorLamp.y)},${Math.round(cx)},${Math.round(cy)}`;
      if (now - castAt < (spin ? 140 : 60) && key === castKey) return;
      if (now - castAt < 60) return;
      castAt = now;
      castKey = key;
      const cast = smoothCast(
        castOf({
          shape,
          size,
          centre: { x: cx, y: cy, z: size * 1.4 },
          toWorld,
          light: { x: cursorLamp.x, y: cursorLamp.y, z: cursorLamp.height },
          n: index[1]!,
          absorb: absorb[1]!,
          cells: CAST_CELLS,
          perCell: 2,
        }),
        3,
      );
      const place = (el: HTMLCanvasElement) => {
        el.width = cast.cells;
        el.height = cast.cells;
        el.style.left = `${cast.x - rect.left}px`;
        el.style.top = `${cast.y - rect.top}px`;
        el.style.width = `${cast.w}px`;
        el.style.height = `${cast.h}px`;
        // Drawn up smooth, not in blocks: the lamp's disc softens it by about a cell.
        el.style.filter = `blur(${((cast.w / cast.cells) * 0.8).toFixed(1)}px)`;
      };
      place(shadeEl);
      place(causticEl);
      const shade = shadeEl.getContext("2d");
      const caustic = causticEl.getContext("2d");
      if (!shade || !caustic) return;
      const dark = shade.createImageData(cast.cells, cast.cells);
      const bright = caustic.createImageData(cast.cells, cast.cells);
      const lc = cursorLamp.colour;
      for (let k = 0; k < cast.ratio.length; k++) {
        const r = cast.ratio[k]!;
        const o = k * 4;
        // Less light than the page would have had: that much of the lamp's share of it, dark.
        dark.data[o + 3] = Math.round(255 * Math.min(1, Math.max(0, 1 - r)) * SHADE_SHARE);
        // More: the extra, in the lamp's colour.
        const extra = Math.min(1, Math.max(0, r - 1) * CAUSTIC_SHARE);
        bright.data[o] = Math.round(255 * lc[0]);
        bright.data[o + 1] = Math.round(255 * lc[1]);
        bright.data[o + 2] = Math.round(255 * lc[2]);
        bright.data[o + 3] = Math.round(255 * extra);
      }
      shade.putImageData(dark, 0, 0);
      caustic.putImageData(bright, 0, 0);
      shadeEl.style.opacity = lit.toFixed(3);
      causticEl.style.opacity = lit.toFixed(3);
    };

    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      frame = 0;
      if (!program && !setup()) return;
      const rect = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      if (rect.bottom < 0 || rect.top > vh) {
        if (spin) frame = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pass = beginPass(rect.width * dpr, rect.height * dpr, "solid");
      if (!pass || !program || !quad) return;
      const { gl } = pass;
      quad.bind();

      // The photograph under it, as a texture (once per photograph).
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const img = photoUnder(el, cx, cy);
      gl.activeTexture(gl.TEXTURE0);
      const src = img?.currentSrc || img?.src || null;
      if (src && src !== textureOf && src !== loading) {
        /*
         * Its own CORS copy of the file, as the glass pass does: a texture
         * made from an image the page may not read would taint the shared
         * context and break every pass that uses it.
         */
        loading = src;
        const copy = new Image();
        copy.crossOrigin = "anonymous";
        copy.onload = () => {
          const shared = beginPass(1, 1, "solid-texture");
          if (!shared) return;
          const g = shared.gl;
          texture = texture ?? g.createTexture();
          g.bindTexture(g.TEXTURE_2D, texture);
          g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, copy);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
          endPass();
          textureOf = src;
          loading = null;
          wake();
        };
        copy.onerror = () => {
          loading = null;
        };
        copy.src = src;
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(U("uPhoto"), 0);
      askRoom();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, room);
      gl.uniform1i(U("uRoomTex"), 1);
      gl.uniform1f(U("uHasRoom"), room ? 1 : 0);
      gl.uniform1f(U("uHasPhoto"), img && texture && textureOf === src ? 1 : 0);
      if (img) {
        const r = img.getBoundingClientRect();
        gl.uniform4f(U("uPhotoRect"), r.left, r.top, r.width, r.height);
        // object-fit: cover, centred.
        const ia = img.naturalWidth / Math.max(img.naturalHeight, 1);
        const ea = r.width / Math.max(r.height, 1);
        if (ia > ea) gl.uniform4f(U("uPhotoCover"), (1 - ea / ia) / 2, 0, ea / ia, 1);
        else gl.uniform4f(U("uPhotoCover"), 0, (1 - ia / ea) / 2, 1, ia / ea);
      }

      gl.uniform2f(U("uBoxOrigin"), rect.left, rect.top);
      gl.uniform2f(U("uBoxSize"), rect.width, rect.height);
      gl.uniform1f(U("uScale"), dpr);
      gl.uniform3f(
        U("uEye"),
        vw / 2 + viewState.eyeX,
        vh / 2 + viewState.eyeY,
        camera.distance(vw),
      );
      // Held a little above the page: its lowest point clears it.
      gl.uniform3f(U("uCentre"), cx, cy, size * 1.4);

      // Its axes: up leaning toward the top of the screen by `tilt`, turning about itself.
      if (endOn) {
        // Standing end-on in the page's plane: its axis toward you, its "up" up the screen.
        const toWorld = [1, 0, 0, 0, -1, 0, 0, 0, -1];
        gl.uniformMatrix3fv(U("uToWorld"), false, toWorld);
        gl.uniformMatrix3fv(U("uToObject"), false, toWorld);
      }
      const a = (tilt * Math.PI) / 180;
      const yaw = ((now - start) / 60000) * spin * Math.PI * 2 + 0.6;
      const up: [number, number, number] = [0, -Math.sin(a), Math.cos(a)];
      const x0: [number, number, number] = [1, 0, 0];
      const z0: [number, number, number] = [
        x0[1] * up[2] - x0[2] * up[1],
        x0[2] * up[0] - x0[0] * up[2],
        x0[0] * up[1] - x0[1] * up[0],
      ];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const X = x0.map((v, i) => c * v + s * z0[i]!);
      const Z = x0.map((v, i) => -s * v + c * z0[i]!);
      // Columns: object x, y, z in the world.
      const toWorld = [...X, ...up, ...Z];
      const toObject = [X[0]!, up[0], Z[0]!, X[1]!, up[1], Z[1]!, X[2]!, up[2], Z[2]!];
      if (!endOn) {
        gl.uniformMatrix3fv(U("uToWorld"), false, toWorld);
        gl.uniformMatrix3fv(U("uToObject"), false, toObject);
      }
      castFrom(endOn ? [1, 0, 0, 0, -1, 0, 0, 0, -1] : toWorld, cx, cy, rect, now);

      gl.uniform1i(U("uShape"), SOLID_SHAPES.indexOf(shape));
      gl.uniform1f(U("uSize"), size);
      gl.uniform3f(U("uIndex"), index[0]!, index[1]!, index[2]!);
      gl.uniform3f(U("uAbsorb"), absorb[0]!, absorb[1]!, absorb[2]!);
      gl.uniform4f(U("uLamp"), cursorLamp.x, cursorLamp.y, cursorLamp.height, cursorLamp.charge);
      const lc = cursorLamp.colour;
      gl.uniform3f(U("uLampColour"), lc[0], lc[1], lc[2]);
      gl.uniform1f(U("uRoom"), roomLight.gain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      blitAll(pass.canvas, canvas);
      endPass();
      if (spin) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const stopLights = onLightChange(wake);
    const stopLoss = onSharedGlLoss(() => {
      program = null;
      quad = null;
    }, wake);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      stopLights();
      stopLoss();
      removeFromBeam();
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, [shape, material, size, tilt, spin, endOn]);

  return (
    <div
      ref={box}
      data-glass-solid={shape}
      className={className}
      style={{ position: "relative", width: size * 3.4, height: size * 3.4 }}
    >
      {/* What it throws on the page from the lamp: shadow, then the caustic added over it. */}
      <canvas
        ref={shadeLayer}
        aria-hidden="true"
        style={{ position: "absolute", pointerEvents: "none", opacity: 0 }}
      />
      <canvas
        ref={causticLayer}
        aria-hidden="true"
        style={{
          position: "absolute",
          pointerEvents: "none",
          opacity: 0,
          mixBlendMode: "plus-lighter",
        }}
      />
      <canvas
        ref={view}
        aria-label={`A glass ${shape}`}
        role="img"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
