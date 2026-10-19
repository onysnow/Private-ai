import { passScaleCap } from "@fx/effects/engine/quality";
import { roughRow } from "@fx/effects/optics/rough-transmission";
import { unscattered } from "@fx/effects/optics/scatter";
import { slab } from "@fx/effects/optics/stack";
import { previewing } from "@fx/effects/engine/preview";
import { casterList, MAX_CASTER_LAYERS, paintCasters } from "@fx/effects/optics/casters";
import { roomFillOverride } from "@fx/effects/light/room-fill";
import { useEffect, useRef, useState } from "react";

import { glassGeometry, viewState } from "@fx/effects/scene/scene";
import { lampPower, onCharge, onFlash, pointLights, strongestCharge } from "@fx/effects/light/lights";
import { lightLocations, MAX_LIGHTS, uploadLights } from "@fx/effects/light/light-uniforms";
import { paneCanvas } from "@fx/effects/engine/compositor";
import {
  FLOOR_FRAGMENT_SHADER,
  FLOOR_VERTEX_SHADER,
  MAX_FLOOR_PANES,
} from "@fx/lib/floor-light-shader";
import { sleepingLoop } from "@fx/lib/gl-loop";
import {
  beginPass,
  endPass,
  blitAll,
  buildProgram,
  clear2d,
  fullScreenTriangle,
  onSharedGlLoss,
  sharedGl,
} from "@fx/effects/engine/gl";
import { t } from "@fx/lib/tuning";
import { floorScale } from "@fx/effects/light/floor-scale";
import { loadSurfaceLayer } from "@fx/effects/optics/surface-layers";
import { lensMap } from "@fx/effects/water/lens-map";
import { publishFloorMap } from "@fx/effects/light/floor-map";
import { assetUrl, SITE_ASSETS } from "@fx/lib/site-assets";

/**
 * Light through the glass, and the glass's shadow, on the photographs.
 *
 * See floor-light-shader.ts for the optics. This is the plumbing: one
 * viewport-sized canvas, drawn only while the shutter is charged, parked the
 * rest of the time exactly like the cursor light and the pane light.
 *
 * WHERE IT SITS
 *
 * Inside <main>, first, at z-index 1: above the photographs (z auto) and,
 * being first in the document among the z-index-1 layers, below the panes.
 * In CSS mode that means each pane's backdrop-filter frosts and bends this
 * light along with the photograph under it. Under liquid glass it is a canvas
 * child of the scene root, so the library draws it into the scene live; it is
 * marked dynamic only while lit, so the panes re-render with it while the
 * light is on and not a frame longer.
 */

const MAX_SCALE = 1.5;

export function FloorLight() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;

    // The shared context (effects/engine/gl); this canvas is a 2D copy of it.
    const shared = sharedGl();
    if (!shared) return;
    const { gl } = shared;
    const buffer = shared.canvas;
    const program = buildProgram(gl, FLOOR_VERTEX_SHADER, FLOOR_FRAGMENT_SHADER, "floor light");
    if (!program) return;
    gl.useProgram(program);
    const quad = fullScreenTriangle(gl, program);
    /*
     * The shadows of what stands on the glass are worked out here (item 52):
     * the stylesheet's own drop-shadows stand down while this runs, and come
     * back wherever it does not (phones, reduced motion, no WebGL).
     */
    document.documentElement.setAttribute("data-cast-shadows", "");

    const U = (name: string) => gl.getUniformLocation(program, name);
    const uViewport = U("uViewport");
    const uScale = U("uScale");
    const lightLoc = lightLocations(gl, program);
    const uGap = U("uGap");
    const uIor = U("uIor");
    const uFrost = U("uFrost");
    const uRoughGlass = U("uRoughGlass");
    const uUnscattered = U("uUnscattered");
    const unscatteredAll = new Float32Array(MAX_FLOOR_PANES * 3).fill(1);
    const uRoughRatio = U("uRoughRatio");
    const uRoughSpread = U("uRoughSpread");
    const roughRatios = new Float32Array(MAX_FLOOR_PANES * 4);
    const roughSpreads = new Float32Array(MAX_FLOOR_PANES * 4);
    const uEdge = U("uEdge");
    const uLightGain = U("uLightGain");
    const uCorners = U("uCorners");
    const uShadowGain = U("uShadowGain");
    const uCaustics = U("uCaustics");
    const uGrimeFloor = U("uGrimeFloor");
    const uViewShift = U("uViewShift");
    /*
     * The pane's smudge and scratch layers, the same files the light on the
     * glass reads, so the marks that catch the lamp are the marks that dim
     * and streak the light under them. Fetched on the first charge.
     */
    const uHasSurface = U("uHasSurface");
    const uSmudgeTile = U("uSmudgeTile");
    const uScratchTile = U("uScratchTile");
    gl.uniform1i(U("uSmudge"), 0);
    gl.uniform1i(U("uScratch"), 1);
    gl.uniform1f(uHasSurface, 0);
    gl.uniform1f(uSmudgeTile, 1024);
    gl.uniform1f(uScratchTile, 2048);
    const layers = new Map<number, WebGLTexture>();
    let layersRequested = false;
    const requestLayers = () => {
      if (layersRequested) return;
      layersRequested = true;
      const done =
        (unit: number, tile: WebGLUniformLocation | null) => (tex: WebGLTexture, side: number) => {
          layers.set(unit, tex);
          gl.useProgram(program);
          gl.uniform1f(tile, side);
          if (layers.size === 2) gl.uniform1f(uHasSurface, 1);
        };
      loadSurfaceLayer(gl, 0, assetUrl(SITE_ASSETS.glassSmudge), done(0, uSmudgeTile));
      loadSurfaceLayer(gl, 1, assetUrl(SITE_ASSETS.glassScratch), done(1, uScratchTile));
    };
    const uView = U("uView");
    const uPrism = U("uPrism");
    const uCount = U("uCount");
    const uRect = U("uRect");
    const uSeed = U("uSeed");

    let scale = 1;

    const rects = new Float32Array(MAX_FLOOR_PANES * 4);
    const seeds = new Float32Array(MAX_FLOOR_PANES);
    const edges = new Float32Array(MAX_FLOOR_PANES);
    // Each pane's own causes (effects/materials/pane-causes): gap, index, frost.
    const gaps = new Float32Array(MAX_FLOOR_PANES);
    const iors = new Float32Array(MAX_FLOOR_PANES);
    const frosts = new Float32Array(MAX_FLOOR_PANES);
    // What a stack lets through relative to its bottom layer (1 for a pane on its own).
    const throughs = new Float32Array(MAX_FLOOR_PANES * 3);
    /*
     * The casters (item 52): everything standing in the
     * lamp's light, painted in its own shape, for the floor to work out the
     * shadows on the photographs from (effects/optics/casters).
     */
    gl.uniform1i(U("uCasters"), 3);
    gl.uniform1i(U("uCasters2"), 4);
    const uHasCasters = U("uHasCasters");
    const uFloorScale = U("uFloorScale");
    const floorScales = new Float32Array(MAX_LIGHTS);
    const uCasterStrength = U("uCasterStrength");
    const uRoomFill = U("uRoomFill");
    const uLens = U("uLens");
    const uHasLens = U("uHasLens");
    const uLensSize = U("uLensSize");
    const uLensLight = U("uLensLight");
    gl.uniform1i(uLens, 6);
    // The caster layers: two RGB masks, a layer to a channel, each with its height, face and colour (effects/optics/casters).
    const uCasterCount = U("uCasterCount");
    const uCasterLayer = U("uCasterLayer");
    const uCasterTint = U("uCasterTint");
    const layerGeom = new Float32Array(MAX_CASTER_LAYERS * 2);
    const layerTint = new Float32Array(MAX_CASTER_LAYERS * 3);
    const casterCanvases = [document.createElement("canvas"), document.createElement("canvas")];
    const casterTex = gl.createTexture();
    const casterTex2 = gl.createTexture();
    const marks = new Float32Array(MAX_FLOOR_PANES * 2);
    const uMarks = U("uMarks");
    const uMarksProportional = U("uMarksProportional");
    const uThrough = U("uThrough");
    let wasLit = false;

    /*
     * What is under a pane is drawn INTO the pane as well.
     *
     * The page-wide canvas sits beneath the glass, which is physically where
     * this light is -- and then the frost smears it to nothing and liquid
     * glass paints over it. So the part that falls under each pane is copied
     * into a layer inside that pane, above the glass's own render and below
     * its text: the light is still computed on the floor, seen through the
     * glass with the bevel's bend applied (uView), and it stays crisp enough
     * to read as the bottom of a pool rather than a glow.
     */
    const under = new Map<HTMLElement, HTMLCanvasElement>();
    const underFor = (el: HTMLElement, w: number, h: number) => {
      let layer = under.get(el);
      if (!layer || !layer.isConnected) {
        // Its slot in the pane's stack is the compositor's (effects/engine/compositor).
        layer = paneCanvas(el, "pane:under");
        under.set(el, layer);
      }
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      return layer;
    };
    /*
     * What stands above this canvas but lies on the floor all the same (the
     * footer's photo strip, [data-floor-receiver]): the floor light is drawn
     * onto it too, in a layer over it, so the lamp's light and the glass's
     * shadows reach it as they reach the photographs (2m).
     */
    const received = new Map<HTMLElement, HTMLCanvasElement>();
    const receiverFor = (el: HTMLElement, w: number, h: number) => {
      let layer = received.get(el);
      if (!layer || !layer.isConnected) {
        layer = document.createElement("canvas");
        layer.className = "floor-received";
        layer.setAttribute("aria-hidden", "true");
        el.appendChild(layer);
        received.set(el, layer);
      }
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      return layer;
    };
    const clearUnder = () => {
      for (const layer of under.values()) {
        layer.getContext("2d")?.clearRect(0, 0, layer.width, layer.height);
      }
      for (const layer of received.values()) {
        layer.getContext("2d")?.clearRect(0, 0, layer.width, layer.height);
      }
    };
    type Drawn = {
      el: HTMLElement;
      x: number;
      y: number;
      w: number;
      h: number;
      /** Where the layer above it in a stack lies over it: that part is the upper layer's to show. */
      over: { x: number; y: number; w: number; h: number } | null;
    };
    const drawnPanes: Drawn[] = [];

    /*
     * Dynamic only while there is something to show. The liquid glass
     * re-renders a pane every frame while a dynamic contributor overlaps it,
     * which is exactly right while the light moves and pure waste otherwise.
     */
    const setLive = (on: boolean) => {
      canvas.dataset["dynamic"] = on ? "" : "idle";
    };
    setLive(false);

    /*
     * The whole lit floor, copied from the buffer into a texture before the
     * buffer is cut up for the layers (effects/light/floor-map): the water
     * reads it so the print seen through a drop is the print as lit here.
     */
    let floorTex: WebGLTexture | null = null;
    let floorTexW = 0;
    let floorTexH = 0;
    let floorFrame = 0;
    const step = (now: number) => {
      // Any light burning: the lamp while charged, the flash for its pulse.
      const charge = strongestCharge();
      if (charge <= 0.002) {
        if (wasLit) {
          clear2d(canvas);
          clearUnder();
          wasLit = false;
          setLive(false);
          publishFloorMap(null);
        }
        return false;
      }
      if (!wasLit) {
        wasLit = true;
        setLive(true);
      }

      const vh = document.documentElement.clientHeight || window.innerHeight;
      let n = 0;
      drawnPanes.length = 0;
      const throwing = glassGeometry(now).filter(
        (pane) => !(pane.y + pane.h < -200 || pane.y > vh + 200) && !(pane.w < 120 || pane.h < 40),
      );
      /*
       * Highest first: seen from above, the eye meets an upper layer's bevel
       * before the one under it (the floor's bend takes them in this order).
       * Panes on their own all stand at their gap, and keep their order.
       */
      const heightOf = (pane: (typeof throwing)[number]) =>
        Number.isFinite(pane.stack.zBottom) ? pane.stack.zBottom : pane.causes.gap;
      /*
       * More panes in view than the pass has slots for (Lab samples has a
       * dozen): the ones nearest the lights take them -- a pane far from
       * every light throws nothing anyone can see. Then highest first.
       */
      if (throwing.length > MAX_FLOOR_PANES) {
        const lights = pointLights().filter((l) => l.charge > 0.002);
        const farness = (pane: (typeof throwing)[number]) => {
          let best = Infinity;
          for (const l of lights) {
            const dx = Math.max(pane.x - l.x, 0, l.x - (pane.x + pane.w));
            const dy = Math.max(pane.y - l.y, 0, l.y - (pane.y + pane.h));
            best = Math.min(best, Math.hypot(dx, dy));
          }
          return best;
        };
        const kept = new Set(
          [...throwing].sort((a, b) => farness(a) - farness(b)).slice(0, MAX_FLOOR_PANES),
        );
        for (let i = throwing.length - 1; i >= 0; i--) {
          if (!kept.has(throwing[i]!)) throwing.splice(i, 1);
        }
      }
      throwing.sort((a, b) => heightOf(b) - heightOf(a));
      for (const pane of throwing) {
        if (n >= MAX_FLOOR_PANES) break;
        /*
         * Every layer of a stack filters the light on its own, at its own
         * height (Ony, 2026-10-01: light through one pane and then another is
         * changed by both, "in a different way since the two glass pane are
         * not stacked on top of each other evenly and so only part of the
         * light that exits the first pane will enter the second pane and the
         * rest will hit the floor"). The floor follows each ray up to the
         * lamp and every pane it crosses -- at that pane's height, so at its
         * own point -- does to it what that pane does: its frost, its edges,
         * its marks, its own transmission (uThrough). Under the overlap the
         * light has crossed both; under an overhang, one. Each layer still
         * shows the floor under it in its own layer, and the layer below
         * leaves the part it covers to the one above (2a, 8ed097c).
         */
        const over = pane.stack.aboveRect;
        const overlap = over
          ? {
              x: Math.max(pane.x, over.x),
              y: Math.max(pane.y, over.y),
              w: Math.min(pane.x + pane.w, over.x + over.w) - Math.max(pane.x, over.x),
              h: Math.min(pane.y + pane.h, over.y + over.h) - Math.max(pane.y, over.y),
            }
          : null;
        rects.set([pane.x, pane.y, pane.w, pane.h], n * 4);
        seeds[n] = pane.s;
        edges[n] = pane.e;
        gaps[n] = heightOf(pane);
        iors[n] = pane.causes.material.ior;
        frosts[n] = pane.causes.material.frost;
        const sigma = pane.causes.material.scatter;
        unscatteredAll.set(sigma ? unscattered(sigma, pane.causes.thickness) : [1, 1, 1], n * 3);
        if (previewing("roughglass")) {
          const row = roughRow(pane.causes.material.ior, pane.causes.material.frost);
          roughRatios.set(row.ratio, n * 4);
          roughSpreads.set(row.spread, n * 4);
        }
        // Its own transmission straight on (Fresnel at both faces and absorption: effects/optics/stack).
        throughs.set(slab(pane.causes.material, pane.causes.thickness).T, n * 3);
        marks[n * 2] = pane.causes.scratch;
        marks[n * 2 + 1] = pane.causes.smudge;
        drawnPanes.push({ el: pane.el, x: pane.x, y: pane.y, w: pane.w, h: pane.h, over: overlap });
        n += 1;
      }

      scale = Math.min(window.devicePixelRatio || 1, Math.min(MAX_SCALE, passScaleCap()));
      const bw = Math.round((document.documentElement.clientWidth || window.innerWidth) * scale);
      const bh = Math.round(vh * scale);
      if (!beginPass(bw, bh, "floor")) return false;
      quad.bind();
      gl.uniform2f(uViewport, bw, bh);
      gl.uniform1f(uScale, scale);
      // Every point light, at its height above the photographs.
      // What lies on the photographs does not light them through the glass.
      const floorLights = pointLights().filter((l) => !l.below);
      /*
       * The lamp's brightness and its distance (docs/research/shadows.md 5.2
       * items 4-5, 6 Change 2; Ony: "distance from the source of light and
       * brightness of that light"). The floor normalised its pool to 1 under
       * the lamp at any height and never read the lamp's power, so neither
       * changed anything. Irradiance at the floor goes as P / H^2 (inverse
       * square), taken against the defaults (P at Core gain 8, H 300) so the
       * default look is unchanged. Only the cursor lamp: the other lights'
       * strengths were set by eye without it.
       */
      floorScales.fill(1);
      floorLights.forEach((l, i) => {
        if (i >= floorScales.length || (l.id !== "cursor" && !l.physicalFloor)) return;
        floorScales[i] = floorScale(l.gain, l.height);
      });
      gl.uniform1fv(uFloorScale, floorScales);
      uploadLights(
        gl,
        lightLoc,
        floorLights.map((l) => ({
          x: l.x,
          y: l.y,
          height: l.height,
          colour: l.colour,
          power: lampPower(l),
          radius: l.radius,
          charge: l.charge,
          uv: l.uv,
          span: l.span,
          aim: l.aim,
        })),
      );
      gl.uniform1f(uLightGain, t("floorLight"));
      gl.uniform1f(uCorners, previewing("corners") ? 1 : 0);
      gl.uniform1f(uShadowGain, t("floorShadow"));
      gl.uniform1f(uCaustics, t("floorCaustics"));
      gl.uniform1f(uView, t("floorView"));
      gl.uniform1f(uPrism, t("floorPrism"));
      // Causes only: how sharp and bright each point is follows from these.
      gl.uniform1f(uGrimeFloor, t("grimeFloor"));
      gl.uniform2f(uViewShift, viewState.shiftX, viewState.shiftY);
      requestLayers();
      for (const [unit, tex] of layers) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      }
      gl.uniform1i(uCount, n);
      gl.uniform4fv(uRect, rects);
      gl.uniform1fv(uSeed, seeds);
      gl.uniform1fv(uEdge, edges);
      gl.uniform1fv(uGap, gaps);
      gl.uniform1fv(uIor, iors);
      gl.uniform1fv(uFrost, frosts);
      gl.uniform1f(uRoughGlass, previewing("roughglass") ? 1 : 0);
      gl.uniform3fv(uUnscattered, unscatteredAll);
      gl.uniform4fv(uRoughRatio, roughRatios);
      gl.uniform4fv(uRoughSpread, roughSpreads);
      gl.uniform3fv(uThrough, throughs);
      gl.uniform1f(uHasCasters, casterTex && casterTex2 ? 1 : 0);
      if (casterTex && casterTex2) {
        const layers = paintCasters(casterCanvases, casterList());
        [casterTex, casterTex2].forEach((tex, n) => {
          gl.activeTexture(gl.TEXTURE3 + n);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, casterCanvases[n]!);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        });
        layerGeom.fill(0);
        layerTint.fill(0);
        layers.forEach((l, k) => {
          layerGeom[k * 2] = l.height;
          layerGeom[k * 2 + 1] = l.face;
          layerTint.set(l.tint, k * 3);
        });
        gl.uniform1i(uCasterCount, layers.length);
        gl.uniform2fv(uCasterLayer, layerGeom);
        gl.uniform3fv(uCasterTint, layerTint);
        gl.uniform1f(uCasterStrength, t("castShadowStrength"));
      }
      gl.uniform1f(uRoomFill, Math.min(t("roomFill"), roomFillOverride()));
      /*
       * The drops' lens map (rain W2), for the light it was drawn for. The
       * map is in the viewport the water saw; a scroll between the two
       * passes is at most a frame old.
       */
      const lensNow = lensMap();
      const lensIndex = lensNow ? floorLights.findIndex((l) => l.id === lensNow.lightId) : -1;
      if (lensNow && lensIndex >= 0 && lensIndex < MAX_LIGHTS) {
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, lensNow.texture);
        gl.uniform1f(uHasLens, 1);
        gl.uniform2f(uLensSize, lensNow.width, lensNow.height);
        gl.uniform1i(uLensLight, lensIndex);
      } else {
        gl.uniform1f(uHasLens, 0);
      }
      gl.uniform2fv(uMarks, marks);
      gl.uniform1f(uMarksProportional, previewing("marks") ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // The lit floor, whole, for the water (a copy on the GPU; nothing read back to the CPU).
      if (!floorTex) floorTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, floorTex);
      if (floorTexW !== bw || floorTexH !== bh) {
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, bw, bh, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        floorTexW = bw;
        floorTexH = bh;
      } else {
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, bw, bh);
      }
      floorFrame++;
      publishFloorMap({
        texture: floorTex,
        width: bw / scale,
        height: bh / scale,
        frame: floorFrame,
      });

      // Same task as the draw, so the buffer is still there to copy from.
      for (const pane of drawnPanes) {
        const w = Math.max(1, Math.round(pane.w * scale));
        const h = Math.max(1, Math.round(pane.h * scale));
        const layer = underFor(pane.el, w, h);
        const ctx = layer.getContext("2d");
        if (!ctx) continue;
        ctx.clearRect(0, 0, w, h);
        // Clamp the source to the buffer: a pane half off-screen must not
        // ask drawImage for pixels that do not exist.
        const sx = pane.x * scale;
        const sy = pane.y * scale;
        const cx = Math.max(0, Math.floor(sx));
        const cy = Math.max(0, Math.floor(sy));
        const cw = Math.min(buffer.width, Math.ceil(sx + w)) - cx;
        const ch = Math.min(buffer.height, Math.ceil(sy + h)) - cy;
        if (cw <= 0 || ch <= 0) continue;
        ctx.drawImage(buffer, cx, cy, cw, ch, cx - sx, cy - sy, cw, ch);
        // The part a layer above covers is that layer's to show.
        if (pane.over && pane.over.w > 0 && pane.over.h > 0) {
          ctx.clearRect(
            (pane.over.x - pane.x) * scale,
            (pane.over.y - pane.y) * scale,
            pane.over.w * scale,
            pane.over.h * scale,
          );
        }
      }

      // The floor that lies above this canvas: the same light, drawn onto it.
      for (const el of document.querySelectorAll<HTMLElement>("[data-floor-receiver]")) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh || r.width < 1 || r.height < 1) continue;
        const w = Math.max(1, Math.round(r.width * scale));
        const h = Math.max(1, Math.round(r.height * scale));
        const layer = receiverFor(el, w, h);
        const ctx = layer.getContext("2d");
        if (!ctx) continue;
        ctx.clearRect(0, 0, w, h);
        const sx = r.left * scale;
        const sy = r.top * scale;
        const cx = Math.max(0, Math.floor(sx));
        const cy = Math.max(0, Math.floor(sy));
        const cw = Math.min(buffer.width, Math.ceil(sx + w)) - cx;
        const ch = Math.min(buffer.height, Math.ceil(sy + h)) - cy;
        if (cw > 0 && ch > 0) ctx.drawImage(buffer, cx, cy, cw, ch, cx - sx, cy - sy, cw, ch);
      }

      /*
       * And then taken OUT of the page-wide canvas under each pane.
       *
       * Left in, the light under a pane was counted twice: once in the pane's
       * own layer above, and again through the glass -- the CSS frost blurs
       * this canvas into the pane, and liquid glass captures it into its
       * render. Inside the pane came out about twice as bright as the same
       * light just outside it, so the glow stopped dead at the rim and read
       * as clipped. Now each point of the floor is drawn exactly once: under
       * the glass by the pane's layer, everywhere else by this canvas.
       */
      if (drawnPanes.length) {
        gl.enable(gl.SCISSOR_TEST);
        for (const pane of drawnPanes) {
          const x0 = Math.max(0, Math.floor(pane.x * scale));
          const x1 = Math.min(buffer.width, Math.ceil((pane.x + pane.w) * scale));
          const y1 = Math.min(buffer.height, Math.ceil((pane.y + pane.h) * scale));
          const y0 = Math.max(0, Math.floor(pane.y * scale));
          if (x1 <= x0 || y1 <= y0) continue;
          gl.scissor(x0, buffer.height - y1, x1 - x0, y1 - y0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.disable(gl.SCISSOR_TEST);
      }
      // What is left is the floor outside the glass, onto the page.
      blitAll(buffer, canvas);
      endPass();
      return true;
    };

    const loop = sleepingLoop(step, "floor-light");
    const wake = () => loop.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    const stopCharge = onCharge(wake);
    const stopFlash = onFlash(wake);
    loop.wake();

    const stopLoss = onSharedGlLoss(
      () => loop.stop(),
      () => setGeneration((g) => g + 1),
    );

    return () => {
      document.documentElement.removeAttribute("data-cast-shadows");
      loop.stop();
      stopCharge();
      stopFlash();
      for (const layer of under.values()) layer.remove();
      for (const layer of received.values()) layer.remove();
      for (const tex of layers.values()) gl.deleteTexture(tex);
      publishFloorMap(null);
      if (floorTex) gl.deleteTexture(floorTex);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      stopLoss();
      gl.deleteProgram(program);
      quad.delete();
    };
  }, [generation]);

  return <canvas ref={ref} aria-hidden="true" className="floor-light" data-glass-ignore="" />;
}
