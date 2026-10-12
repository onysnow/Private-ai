import { surfaceScaleCap } from "@fx/effects/engine/quality";
import { coatingRgb } from "@fx/effects/optics/coating";
import { onShardMapChange, shardMapOf, shardMapStamp } from "@fx/effects/optics/shard-map";
import { scatterDepth } from "@fx/effects/optics/scatter";
import { useEffect, useState } from "react";
import { LIGHT_VERTEX_SHADER } from "@fx/lib/cursor-light-shader";
import { sleepingLoop } from "@fx/lib/gl-loop";
import {
  beginPass,
  endPass,
  buildProgram,
  fullScreenTriangle,
  onSharedGlLoss,
  sharedGl,
} from "@fx/effects/engine/gl";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@fx/lib/glass-light-shader";
import {
  glassGeometry,
  geometryStamp,
  MAX_OCCLUDERS,
  MAX_PLASTIC,
  paneGlowLayer,
  viewState,
} from "@fx/effects/scene/scene";
import {
  cursorLamp,
  flareLight,
  flashLight,
  lampPower,
  onCharge,
  onFlash,
  pointLights,
  roomLight,
  strongestCharge,
} from "@fx/effects/light/lights";
import { LIGHT_BLEED } from "@fx/effects/engine/compositor";
import { castShadow as castByModel } from "@fx/effects/optics/shadow";
import { previewing } from "@fx/effects/engine/preview";
import { SURFACE_MATERIALS } from "@fx/effects/materials/surfaces";
import { lightLocations, type PackedLight, uploadLights } from "@fx/effects/light/light-uniforms";
import { paneCanvas } from "@fx/effects/engine/compositor";
import { onTuningApplied, t } from "@fx/lib/tuning";
import { FROSTED_FLOAT, frontRoughness } from "@fx/effects/materials/presets";
import { faceRoughnessNm, filmLut } from "@fx/effects/optics/thin-film";
import { ROOM_KNEE, roomMipChain } from "@fx/effects/optics/environment";
import { camera } from "@fx/effects/camera/camera";
import { loadSurfaceLayer } from "@fx/effects/optics/surface-layers";
import { LAMP_REFLECTION_ENABLED, frostRoughness } from "@fx/effects/optics/reflection";
import { assetUrl, SITE_ASSETS } from "@fx/lib/site-assets";
import { holdLoader } from "@fx/lib/app-ready";
import { backlitColour, BACKLIT_GAIN } from "@fx/effects/optics/backlit-colour";
import { discRadiusForBlur, hiddenLightMap, markLightNear } from "@fx/effects/optics/bokeh";

/**
 * The glass itself: what it does to the photograph behind it, and what it does
 * with the cursor light falling on it.
 *
 * One draw per pane, scissored to that pane's box, rather than one pass over
 * the whole viewport. Three reasons, in order of importance:
 *
 *   1. Refraction needs the backdrop as a texture, and each pane sits on a
 *      different photograph. A shader cannot pick a sampler by loop index, so
 *      the panes have to be separate draws whatever else is true.
 *   2. The vast majority of the viewport has no glass on it. Shading those
 *      fragments to have them contribute nothing is most of the cost of a
 *      full-screen pass.
 *   3. The shader stops needing a fixed-size loop and a pile of uniform
 *      arrays, and becomes a shader about one pane.
 *
 * Composited with `plus-lighter`, so what it draws ADDS to the page — which is
 * the only way an edge that is both catching the light and carrying its
 * reflection can sum past white.
 */

/*
 * At the display's own density up to 2x: the smudge and scratch marks are
 * fine detail, and drawn at 1.5x and stretched by the browser to a 2x screen
 * they went soft and streaky (Ony, 2026-10-01).
 */
const MAX_SCALE = 2;

/*
 * The LAYOUT viewport, not `window.innerWidth`.
 *
 * These canvases are CSS-sized `position: fixed; inset: 0`, which resolves
 * against the initial containing block and EXCLUDES the classic scrollbar.
 * `window.innerWidth` includes it. Sizing the drawing buffer from the wrong
 * one stretches a buffer ~17px too wide into a box that narrow, squeezing
 * everything the shader draws by about 1.3%: no error at the left edge,
 * seventeen pixels of it by the right. That is why every pane had a bright
 * line inboard of its right edge while the top and bottom sat correctly --
 * there is no horizontal scrollbar to introduce the same error vertically.
 */
const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth;
const viewportHeight = () => document.documentElement.clientHeight || window.innerHeight;

/** How far outside a pane the bloom still has something to contribute. */
const BLEED = LIGHT_BLEED;

/** No coating: every reflection whole. */
const NO_COAT = [1, 1, 1] as const;
/** Clear glass: nothing scattered in the volume. */
const NO_SCATTER = [0, 0, 0] as const;

export function GlassLight({
  chargeRef,
  positionRef,
}: {
  chargeRef: { current: number };
  positionRef: { current: { x: number; y: number } };
}) {
  /* Bumped when a lost GL context returns; see CursorLight for why this is
     the whole recovery path. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The gesture that drives all of this needs a fine pointer, so on a touch
    // device the charge can never leave zero. Nothing to do but not start.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    /*
     * The shared context (effects/engine/gl). Its buffer is offscreen, as
     * this pass's own canvas already was: each pane's region is copied out
     * of it into that pane's surface layer.
     */
    const shared = sharedGl();
    if (!shared) return;
    const { gl } = shared;
    const canvas = shared.canvas;
    const program = buildProgram(gl, LIGHT_VERTEX_SHADER, GLASS_LIGHT_FRAGMENT_SHADER, "glass");
    if (!program) return;
    gl.useProgram(program);
    const quad = fullScreenTriangle(gl, program);

    const U = (name: string) => gl.getUniformLocation(program, name);
    const uViewport = U("uViewport");
    const uScale = U("uScale");
    const lightLoc = lightLocations(gl, program);
    const uLightIn = U("uLightIn");
    const uReflectScale = U("uReflectScale");
    const uRect = U("uRect");
    const uRadius = U("uRadius");
    const uEdgeWidth = U("uEdgeWidth");
    const uStraight = U("uStraight");
    const uFaces = U("uFaces");
    const uBar = U("uBar");
    const uThickness = U("uThickness");
    const uSeed = U("uSeed");
    const uImage = U("uImage");
    const uImageFit = U("uImageFit");
    const uBurn = U("uBurn");
    const uRoomKnee = U("uRoomKnee");
    const uHasBackdrop = U("uHasBackdrop");
    const uHasBokeh = U("uHasBokeh");
    const uHasBokehBelow = U("uHasBokehBelow");
    const uImageBox = U("uImageBox");
    const uImageBelowBox = U("uImageBelowBox");
    const uBokehRadius = U("uBokehRadius");
    const uBokehGain = U("uBokehGain");
    const uHasSurface = U("uHasSurface");
    const uGrimeRake = U("uGrimeRake");
    const uGrimeSpecks = U("uGrimeSpecks");
    const uGrimeFloor = U("uGrimeFloor");
    const uGap = U("uGap");
    const uHasBelow = U("uHasBelow");
    const uImageBelow = U("uImageBelow");
    const uImageBelowFit = U("uImageBelowFit");
    const uRestEdge = U("uRestEdge");
    const uGlowOnly = U("uGlowOnly");
    const uEdgeBloom = U("uEdgeBloom");
    const uAboveRect = U("uAboveRect");
    const uAboveSoft = U("uAboveSoft");
    const uOccRect = U("uOccRect");
    const uOccSoft = U("uOccSoft");
    const uOccDir = U("uOccDir");
    const uMarksProportional = U("uMarksProportional");
    const uOccCount = U("uOccCount");
    const uPlasticRect = U("uPlasticRect");
    const uPlasticLand = U("uPlasticLand");
    const uPlasticRadius = U("uPlasticRadius");
    const uPlasticCount = U("uPlasticCount");
    const uOilGlow = U("uOilGlow");
    const uPipedGain = U("uPipedGain");
    const uUranium = U("uUranium");
    const uBacklitGain = U("uBacklitGain");
    const uBacklitEdge = U("uBacklitEdge");
    const uBacklitFill = U("uBacklitFill");
    const uBacklitColour = U("uBacklitColour");
    const uPipedReach = U("uPipedReach");
    const uDustGlow = U("uDustGlow");
    // Item 18b: the plastic lit here, not by CSS (html[data-try~="shaderplastic"] in styles.css).
    const shaderPlastic = previewing("shaderplastic");

    /*
     * Scratch buffers for the occluders, allocated once.
     *
     * These are uploaded per pane per frame. Building two arrays each time
     * would allocate a hundred-odd small Float32Arrays a second and hand the
     * collector work to do in the middle of an animation, which is exactly
     * where a pause is most visible.
     */
    const occRect = new Float32Array(MAX_OCCLUDERS * 4);
    const occSoft = new Float32Array(MAX_OCCLUDERS * 4);
    const occDir = new Float32Array(MAX_OCCLUDERS * 4);
    const plasticRect = new Float32Array(MAX_PLASTIC * 4);
    const plasticLand = new Float32Array(MAX_PLASTIC * 4);
    const plasticRadius = new Float32Array(MAX_PLASTIC);
    const uIor = U("uIor");
    const uFrost = U("uFrost");
    const uBounce = U("uBounce");
    const uFloorGain = U("uFloorGain");
    const uCornerSoft = U("uCornerSoft");
    const uContact = U("uContact");
    const uFilmRect = U("uFilmRect");
    const uFilmSigma = U("uFilmSigma");
    gl.uniform1i(U("uFilmLut"), 7);
    /*
     * A broken pane's pieces (item 10 step 3b): a unit of their own where the
     * device has more than eight; otherwise they share the air film's, which
     * a broken pane resting dry on another would lose.
     */
    const shardUnit = (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number) > 8 ? 8 : 7;
    gl.uniform1i(U("uShardMap"), shardUnit);
    const uHasShards = U("uHasShards");
    const shardTextures = new Map<HTMLCanvasElement, { tex: WebGLTexture; version: number }>();
    // The air film's reflectance by gap, a 256 x 1 table (effects/optics/thin-film).
    const filmTable = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, filmTable);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      filmLut(FROSTED_FLOAT.ior),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const uFaceLamp = U("uFaceLamp");

    // The site's amber and teal in linear light — the shader works in linear
    // and only returns to display space at the very end.
    const toLinear = (c: number) => Math.pow(c, 2.2);
    gl.uniform3f(U("uWarm"), toLinear(1.0), toLinear(0.68), toLinear(0.3));
    gl.uniform3f(U("uCool"), toLinear(0.35), toLinear(0.78), toLinear(0.82));
    gl.uniform1i(U("uSmudge"), 0);
    gl.uniform1i(U("uScratch"), 2);
    const uSmudgeTile = U("uSmudgeTile");
    gl.uniform1i(U("uRoom"), 3);
    const uHasRoom = U("uHasRoom");
    const uRoomWidth = U("uRoomWidth");
    const uCameraDistance = U("uCameraDistance");
    const uExactFresnel = U("uExactFresnel");
    const uCoat = U("uCoat");
    const uScatter = U("uScatter");
    const uPolariser = U("uPolariser");
    const uPolariserAngle = U("uPolariserAngle");
    const uFrontRoughness = U("uFrontRoughness");
    const uRoomExposure = U("uRoomExposure");
    const uEye = U("uEye");
    gl.uniform1f(uHasRoom, 0);
    const uScratchTile = U("uScratchTile");
    gl.uniform1f(uSmudgeTile, 1024);
    gl.uniform1f(uScratchTile, 2048);
    gl.uniform1i(U("uBackdrop"), 1);
    gl.uniform1i(U("uBackdropBelow"), 4);
    gl.uniform1i(U("uBokeh"), 5);
    gl.uniform1i(U("uBokehBelow"), 6);
    gl.uniform1f(uHasSurface, 0);

    let scale = 1;

    /*
     * The photographed surface map, fetched lazily: the shader falls back to
     * no surface detail until it arrives, and it never loads at all for
     * somebody who never winds the shutter.
     */
    let surfaceRequested = false;
    let layersLoaded = 0;
    /** Smudge on texture unit 0, scratch on unit 2. */
    const layers = new Map<number, WebGLTexture>();
    /*
     * One surface layer: a seamless greyscale photograph, repeated (the shader
     * hex-tiles it, so the repeat is never visible). WebGL1 can only repeat a
     * power-of-two texture, so an uploaded image of any other size is drawn
     * onto the nearest power-of-two canvas first -- an admin upload must never
     * be able to turn the layer black.
     */
    const loadLayer = (unit: number, src: string, tile: WebGLUniformLocation | null) =>
      loadSurfaceLayer(gl, unit, src, (tex, side) => {
        layers.set(unit, tex);
        gl.useProgram(program);
        gl.uniform1f(tile, side);
        layersLoaded += 1;
        if (layersLoaded === 2) {
          gl.uniform1f(uHasSurface, 1);
          releaseSurface();
        }
      });
    /*
     * The photographed surface layers, fetched lazily: the shader falls back
     * to no surface detail until both arrive, and they never load at all for
     * somebody who never winds the shutter.
     */
    /*
     * The room the face reflects, in real brightness (see
     * effects/optics/environment.ts). Its mip levels are filtered here in
     * LINEAR light and uploaded one by one: the browser's own would average
     * the log-encoded values, and a lamp blurred over a rough face would come
     * out far dimmer than its light really is.
     */
    /*
     * The loader waits for these (lib/app-ready; Ony: "the loading page needs
     * to load the entire application"): the room uploaded, the smudge and
     * scratch maps uploaded, and one frame drawn -- which is when the
     * driver really compiles the shader. Each was a hitch on the first
     * charge of the shutter, after the loader had gone.
     */
    const releaseRoom = holdLoader("glass light: room");
    const releaseSurface = holdLoader("glass light: surface maps");
    const releaseFrame = holdLoader("glass light: first frame");
    let room: WebGLTexture | null = null;
    let roomRequested = false;
    let roomFor: string | null = null;
    const requestRoom = () => {
      // Another room chosen in the lab ("Room reflected"): load it in place of this one.
      const want = document.documentElement.getAttribute("data-room-hdr");
      if (roomRequested && want === roomFor) return;
      roomRequested = true;
      roomFor = want;
      const src = want;
      if (!src) {
        releaseRoom();
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => releaseRoom();
      img.onload = () => {
        const w = 2048;
        const h = 512;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const rgb = new Uint8Array(w * h * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
          rgb[j] = rgba[i]!;
          rgb[j + 1] = rgba[i + 1]!;
          rgb[j + 2] = rgba[i + 2]!;
        }
        if (roomFor !== src) return; // a newer choice is on its way
        const tex = gl.createTexture();
        if (!tex) return;
        if (room) gl.deleteTexture(room);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        roomMipChain(rgb, w, h).forEach((level, i) => {
          gl.texImage2D(
            gl.TEXTURE_2D,
            i,
            gl.RGB,
            level.width,
            level.height,
            0,
            gl.RGB,
            gl.UNSIGNED_BYTE,
            level.data,
          );
        });
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        // Round the full 360 degrees across; clamped top and bottom.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        room = tex;
        gl.useProgram(program);
        gl.uniform1f(uRoomWidth, w);
        gl.uniform1f(uHasRoom, 1);
        restingDrawn = false;
        releaseRoom();
        wake();
      };
      img.src = src;
    };

    const requestSurface = () => {
      if (surfaceRequested) return;
      surfaceRequested = true;
      loadLayer(0, assetUrl(SITE_ASSETS.glassSmudge), uSmudgeTile);
      loadLayer(2, assetUrl(SITE_ASSETS.glassScratch), uScratchTile);
    };
    // Now, behind the loader, rather than on the first charge of the shutter.
    requestSurface();

    /*
     * Backdrop textures, one per photograph, cached by URL.
     *
     * `crossOrigin` matters: a texture built from an image the page cannot
     * read taints the context and every later read throws. If the storage host
     * declines CORS the entry stays null and that pane simply does not
     * refract, rather than taking the whole canvas down with it.
     */
    const backdrops = new Map<string, WebGLTexture | null>();
    /*
     * And the light each photograph clipped (effects/optics/bokeh), which the
     * frost spreads into the discs. Square and a power of two so it can be
     * mipmapped: the shader reads it at the level of its taps' spacing. The
     * stretch does not matter, it is read by the same uv as the photograph.
     */
    let disposed = false;
    const HIDDEN_SIZE = 512;
    // How far a disc can reach, in map texels: an eighth of the photograph,
    // which covers the widest disc on a photograph drawn up to ~2400 px wide.
    const HIDDEN_REACH = HIDDEN_SIZE / 8;
    const NEIGHBOURHOODS = 24;
    const hidden = new Map<string, WebGLTexture | null>();
    const hiddenLightTexture = (img: HTMLImageElement): WebGLTexture | null => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = HIDDEN_SIZE;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, HIDDEN_SIZE, HIDDEN_SIZE);
        const data = ctx.getImageData(0, 0, HIDDEN_SIZE, HIDDEN_SIZE).data;
        // Each pixel's neighbourhood: the photograph shrunk to a few dozen
        // cells and smoothly stretched back.
        const small = document.createElement("canvas");
        small.width = small.height = NEIGHBOURHOODS;
        small.getContext("2d")?.drawImage(img, 0, 0, NEIGHBOURHOODS, NEIGHBOURHOODS);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(small, 0, 0, HIDDEN_SIZE, HIDDEN_SIZE);
        const around = ctx.getImageData(0, 0, HIDDEN_SIZE, HIDDEN_SIZE).data;
        const map = markLightNear(hiddenLightMap(data, around), HIDDEN_SIZE, HIDDEN_REACH);
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          HIDDEN_SIZE,
          HIDDEN_SIZE,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(map.buffer),
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        return tex;
      } catch {
        // A photograph the page may not read (no CORS): no discs, nothing else lost.
        return null;
      }
    };
    /*
     * How wide the discs are: as wide as the blur the pane shows (a disc of
     * radius 2 sigma spreads like a Gaussian of sigma). Read once per pane;
     * liquid glass takes the pane's backdrop-filter off, so it falls back to
     * the stylesheet's value.
     */
    /*
     * The hidden light is a few tens of milliseconds of pixel work per
     * photograph: done one photograph per idle moment, not on top of the
     * load, and the pass woken ONCE when the queue is empty -- a redraw of
     * every pane per photograph was a second of work each on a slow machine.
     */
    const hiddenQueue: [string, HTMLImageElement][] = [];
    let hiddenScheduled = false;
    const whenIdle = (fn: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(fn, { timeout: 3000 })
        : setTimeout(fn, 200);
    const buildNextHidden = () => {
      hiddenScheduled = false;
      if (disposed) return;
      const next = hiddenQueue.shift();
      if (next) hidden.set(next[0], hiddenLightTexture(next[1]));
      if (hiddenQueue.length > 0) {
        hiddenScheduled = true;
        whenIdle(buildNextHidden);
      } else {
        restingDrawn = false;
        wake();
      }
    };
    const queueHidden = (src: string, img: HTMLImageElement) => {
      hiddenQueue.push([src, img]);
      if (!hiddenScheduled) {
        hiddenScheduled = true;
        whenIdle(buildNextHidden);
      }
    };
    const PANE_BLUR_FALLBACK = 30;
    const blurOf = new WeakMap<HTMLElement, number>();
    const paneBlur = (el: HTMLElement) => {
      let b = blurOf.get(el);
      if (b === undefined) {
        const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(el).backdropFilter || "");
        b = m ? Number(m[1]) : PANE_BLUR_FALLBACK;
        blurOf.set(el, b);
      }
      return b;
    };
    const requestBackdrop = (src: string) => {
      if (backdrops.has(src)) return backdrops.get(src) ?? null;
      backdrops.set(src, null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        // Non-power-of-two photographs: clamped and unmipped, as WebGL1 requires.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        backdrops.set(src, tex);
        queueHidden(src, img);
      };
      img.src = src;
      return null;
    };

    /*
     * ---- The pane's own surface layer ----
     *
     * The grime is a mark ON the glass. The photographs and the copy REST on
     * that glass. So the marks have to be behind them, and the shared canvas
     * cannot do it: it is fixed to the viewport at z-index 9997, above every
     * piece of content on the page, and a mask to a pane's footprint does not
     * help because a footprint contains whatever is standing in it. Reported
     * five times; deferred five times; this is the fix.
     *
     * Each pane gets its own canvas at z-index -1 -- above the bevel and the
     * reflection at -2 and below, under everything in normal flow. The shared
     * WebGL canvas becomes an offscreen buffer that nothing displays, and each
     * pane's scissored region is blitted out of it into that pane's layer.
     *
     * The layer is BLEED larger than the pane on every side, because the rim
     * bloom genuinely escapes the glass and would otherwise be cut off square
     * at the edge. `.glass` is position:relative with no overflow rule, so it
     * spills correctly.
     */
    const surfaces = new WeakMap<HTMLElement, HTMLCanvasElement>();

    const surfaceFor = (el: HTMLElement, cssW: number, cssH: number) => {
      let layer = surfaces.get(el);
      if (!layer || !layer.isConnected) {
        // Its slot in the pane's stack is the compositor's (effects/engine/compositor).
        layer = paneCanvas(el, "pane:surface");
        surfaces.set(el, layer);
      }
      const w = Math.max(1, Math.round(cssW * scale));
      const h = Math.max(1, Math.round(cssH * scale));
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      return layer;
    };

    /** Every pane layer this pass touched, so the rest can be cleared. */
    const drawn = new Set<HTMLCanvasElement>();
    const allLayers = new Set<HTMLCanvasElement>();

    /*
     * The bloom over what stands above the glass's layers (item 51).
     *
     * A pane's lit edge and its bloom are drawn into the pane's own layers,
     * BLEED past its rim. Anything later on the page that sits in a higher
     * stacking context -- the footer's photo strip and its heading, z-10 so
     * its shadow lands on the footer -- painted over that bleed, so the last
     * pane's glow stopped dead at its bottom edge while every other pane's
     * spilled over the photograph below. The bloom is the camera's, not the
     * glass's: it lies over everything in frame. So the part of each glow
     * layer that falls on a [data-floor-receiver] is drawn again onto that
     * element, in a layer of its own, adding light the same way.
     */
    const bloomReceived = new Map<HTMLElement, HTMLCanvasElement>();
    const bloomLayerFor = (el: HTMLElement, w: number, h: number) => {
      let layer = bloomReceived.get(el);
      if (!layer || !layer.isConnected) {
        layer = document.createElement("canvas");
        layer.className = "glass-bloom-received";
        layer.setAttribute("aria-hidden", "true");
        el.appendChild(layer);
        bloomReceived.set(el, layer);
      }
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      return layer;
    };

    let wasLit = false;

    /* Returns whether there is still something to draw; false parks the loop. */
    /*
     * Glass does not stop being glass in the dark.
     *
     * This used to bail out entirely whenever the charge was zero -- clear the
     * buffer, hide the canvas, park the loop. Which threw away the two things
     * the shader deliberately keeps OUTSIDE the charge gate: the refracted
     * backdrop and the side band you can genuinely see through. The shader's
     * own comment says a pane bends what is behind it whether or not anybody
     * is shining anything at it, and then this hid all of it anyway. That is
     * why the panes went flat the moment the shutter was idle.
     *
     * Now the resting state is DRAWN, once, and then the loop parks. The
     * refraction and the side band only change when a pane moves or its
     * backdrop loads -- never with the cursor -- so one frame is enough until
     * something invalidates the geometry, and scroll and resize already do
     * that. Idle costs one frame, not sixty a second.
     */
    let restingDrawn = false;
    let restingStamp = -1;
    let restingEyeX = Number.NaN;
    let restingEyeY = Number.NaN;
    let restingShards = -1;

    const step = (now: number) => {
      const charge = chargeRef.current;
      // The flash lights the glass for its pulse whatever the lamp's charge.
      const lit = Math.max(charge, strongestCharge()) > 0.002;

      if (!lit) {
        // Already settled and nothing has moved: park without redrawing.
        /*
         * Already settled and nothing has moved -- including the viewpoint,
         * which moves the photographs under the glass and the room in it.
         */
        const eyeStill = viewState.eyeX === restingEyeX && viewState.eyeY === restingEyeY;
        if (
          !wasLit &&
          restingDrawn &&
          eyeStill &&
          geometryStamp() === restingStamp &&
          shardMapStamp() === restingShards
        )
          return false;
        restingShards = shardMapStamp();
        restingEyeX = viewState.eyeX;
        restingEyeY = viewState.eyeY;
        wasLit = false;
        restingDrawn = true;
        restingStamp = geometryStamp();
      } else {
        restingDrawn = false;
        if (!wasLit) {
          requestSurface();
          wasLit = true;
        }
      }

      const panes = glassGeometry(now);
      const { x, y } = positionRef.current;

      scale = Math.min(window.devicePixelRatio || 1, Math.min(MAX_SCALE, surfaceScaleCap()));
      const bw = Math.round(viewportWidth() * scale);
      const bh = Math.round(viewportHeight() * scale);
      if (!beginPass(bw, bh, "glass")) return false;
      quad.bind();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(uViewport, bw, bh);
      gl.uniform1f(uScale, scale);
      gl.enable(gl.SCISSOR_TEST);
      /*
       * The lights, packed once a frame; each pane then sets their height
       * above ITS glass. The lamp is drawn where the cursor's light is (the
       * eased follower) at the shutter's charge, as it always was.
       */
      const packed: PackedLight[] = pointLights().map((l) => ({
        x: l === cursorLamp ? x : l.x,
        y: l === cursorLamp ? y : l.y,
        height: l.height,
        colour: l.colour,
        power: lampPower(l),
        radius: l.radius,
        charge: l === cursorLamp ? charge : l.charge,
        uv: l.uv,
        span: l.span,
        aim: l.aim,
      }));
      const heights = packed.map((l) => l.height);
      const belows = pointLights().map((l) => l.below === true);
      gl.uniform1f(uGrimeFloor, t("grimeFloor"));
      gl.uniform1f(uRestEdge, t("restEdge"));
      gl.uniform1f(uEdgeBloom, camera.lens.edgeBloom);
      gl.uniform1f(uBokehGain, camera.bokeh);
      gl.uniform1f(uMarksProportional, previewing("marks") ? 1 : 0);
      // What the grime gives back under UV: its materials' fluorescence.
      const glow = (id: "grime-oil" | "grime-dust") => {
        const f = SURFACE_MATERIALS[id].fluorescence;
        return [f.colour[0] * f.yield, f.colour[1] * f.yield, f.colour[2] * f.yield] as const;
      };
      gl.uniform3fv(uOilGlow, glow("grime-oil"));
      gl.uniform1f(uPipedGain, t("pipedLight"));
      // Backlit glass: the light shone in at the panes' edges (effects/optics/backlit).
      gl.uniform1f(uUranium, t("uvUranium"));
      gl.uniform1f(uBacklitGain, t("backlight") * BACKLIT_GAIN);
      gl.uniform1f(uBacklitEdge, t("backlightEdge"));
      gl.uniform1f(uBacklitFill, t("backlightSize"));
      gl.uniform3fv(uBacklitColour, backlitColour());
      gl.uniform1f(uPipedReach, Math.max(t("pipedReach"), 1));
      gl.uniform3fv(uDustGlow, glow("grime-dust"));
      gl.uniform1f(uBurn, previewing("burn") ? 1 : 0);
      gl.uniform1f(uRoomKnee, previewing("dimroom") ? ROOM_KNEE : 0);
      /*
       * The lamp's power reaches the arris glints whatever the switch says;
       * the switch turns off only the face's own image of the lamp, which is
       * off by request (it reads as a flashlight; see LAMP_REFLECTION_ENABLED).
       */
      gl.uniform1f(uFaceLamp, LAMP_REFLECTION_ENABLED || t("lampMirror") >= 1 ? 1 : 0);
      requestRoom();
      gl.uniform1f(
        uCameraDistance,
        camera.distance(document.documentElement.clientWidth || window.innerWidth),
      );
      gl.uniform1f(uRoomExposure, roomLight.gain);
      gl.uniform1f(uExactFresnel, previewing("polariser") ? 1 : 0);
      gl.uniform1f(uPolariser, camera.polariser);
      gl.uniform1f(uPolariserAngle, camera.polariserAngle);
      gl.uniform2f(uEye, viewState.eyeX, viewState.eyeY);
      if (room) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, room);
      }
      for (const [unit, tex] of layers) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      }

      // The elements the bloom has to be laid over this frame (see bloomLayerFor).
      const receivers: { ctx: CanvasRenderingContext2D; r: DOMRect }[] = [];
      for (const layer of bloomReceived.values()) {
        layer.getContext("2d")?.clearRect(0, 0, layer.width, layer.height);
      }
      if (lit) {
        for (const el of document.querySelectorAll<HTMLElement>("[data-floor-receiver]")) {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > viewportHeight() || r.width < 1 || r.height < 1) continue;
          const layer = bloomLayerFor(
            el,
            Math.max(1, Math.round(r.width * scale)),
            Math.max(1, Math.round(r.height * scale)),
          );
          const ctx = layer.getContext("2d");
          if (ctx) receivers.push({ ctx, r });
        }
      }

      for (const pane of panes) {
        // Offscreen panes cost nothing but a rectangle test.
        if (pane.y + pane.h < -BLEED || pane.y > viewportHeight() + BLEED) continue;
        // A layer bonded to the one above is not a surface of its own: the top of the run draws it.
        if (pane.stack.above?.kind === "bonded") continue;

        const texture = pane.src ? requestBackdrop(pane.src) : null;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uHasBackdrop, texture ? 1 : 0);
        const clipped = pane.src ? (hidden.get(pane.src) ?? null) : null;
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, clipped);
        gl.uniform1f(uHasBokeh, clipped ? 1 : 0);
        gl.uniform4f(uImageBox, pane.ibox.x, pane.ibox.y, pane.ibox.w, pane.ibox.h);
        const clippedBelow = pane.below ? (hidden.get(pane.below.src) ?? null) : null;
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, clippedBelow);
        gl.uniform1f(uHasBokehBelow, clippedBelow ? 1 : 0);
        if (pane.below) {
          const b = pane.below.box;
          gl.uniform4f(uImageBelowBox, b.x, b.y, b.w, b.h);
        }
        gl.uniform1f(uBokehRadius, discRadiusForBlur(paneBlur(pane.el)));
        // The photograph the bottom side face looks down at.
        const below = pane.below ? requestBackdrop(pane.below.src) : null;
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, below);
        gl.uniform1f(uHasBelow, below ? 1 : 0);
        if (pane.below) {
          gl.uniform4f(uImageBelow, pane.below.x, pane.below.y, pane.below.w, pane.below.h);
          gl.uniform3f(uImageBelowFit, pane.below.a, pane.below.focus.x, pane.below.focus.y);
        }

        gl.uniform4f(uRect, pane.x, pane.y, pane.w, pane.h);
        gl.uniform1f(uRadius, pane.r);
        gl.uniform1f(uEdgeWidth, pane.e);
        gl.uniform1f(uStraight, pane.w >= viewportWidth() - 1 ? 1 : 0);
        gl.uniform4f(uFaces, pane.faces.top, pane.faces.bottom, pane.faces.left, pane.faces.right);
        gl.uniform1f(uBar, pane.el.classList.contains("glass--bar") ? 1 : 0);
        /*
         * What this pane is, as <Pane> declared it (effects/materials/
         * pane-causes): its material, thickness, gap and surface layers. The
         * lamp stands a fixed height above the photographs, so its height
         * above THIS glass is that less this pane's gap.
         */
        const { material, thickness, gap, smudge, scratch } = pane.causes;
        gl.uniform1f(uIor, material.ior);
        const coat = material.coating ? coatingRgb(material.ior, material.coating) : NO_COAT;
        gl.uniform3f(uCoat, coat[0], coat[1], coat[2]);
        const depth = material.scatter ? scatterDepth(material.scatter, thickness) : NO_SCATTER;
        gl.uniform3f(uScatter, depth[0], depth[1], depth[2]);
        gl.uniform1f(uFrost, material.frost);
        gl.uniform1f(uBounce, previewing("bounce") ? 1 : 0);
        gl.uniform1f(uFloorGain, t("floorLight"));
        gl.uniform1f(uCornerSoft, previewing("corners") ? pane.e : 0);
        /*
         * Resting dry on the pane below (?try=contact): the air film between
         * this pane's back face and its front, where the two overlap.
         */
        const under = pane.stack.belowRect;
        const onContact =
          previewing("contact") && pane.stack.below?.kind === "contact" && under !== null;
        gl.uniform1f(uContact, onContact ? 1 : 0);
        const shards = previewing("shardlight") ? shardMapOf(pane.el) : undefined;
        gl.uniform1f(uHasShards, shards ? 1 : 0);
        if (shards) {
          let entry = shardTextures.get(shards.canvas);
          if (!entry) {
            const tex = gl.createTexture()!;
            entry = { tex, version: -1 };
            shardTextures.set(shards.canvas, entry);
          }
          gl.activeTexture(gl.TEXTURE0 + shardUnit);
          gl.bindTexture(gl.TEXTURE_2D, entry.tex);
          if (entry.version !== shards.version) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shards.canvas);
            // One texel per CSS px, read as it is: a piece's slope is not blended with its neighbour's.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            entry.version = shards.version;
          }
        }
        if (onContact && under) {
          const x0 = Math.max(pane.x, under.x);
          const y0 = Math.max(pane.y, under.y);
          const x1 = Math.min(pane.x + pane.w, under.x + under.w);
          const y1 = Math.min(pane.y + pane.h, under.y + under.h);
          // They touch in the middle of their overlap, and the gap opens from there.
          gl.uniform4f(uFilmRect, x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
          const lower = pane.stack.belowMaterial ?? material;
          gl.uniform1f(
            uFilmSigma,
            Math.hypot(faceRoughnessNm(material, "back"), faceRoughnessNm(lower, "front")),
          );
          gl.activeTexture(gl.TEXTURE7);
          gl.bindTexture(gl.TEXTURE_2D, filmTable);
        }
        // ?try=satin: the front face etched like the back, so the room it
        // reflects spreads into a soft glow instead of a mirror image.
        gl.uniform1f(
          uFrontRoughness,
          previewing("satin")
            ? frostRoughness(material.frost)
            : frontRoughness(material, material.frost),
        );
        gl.uniform1f(uThickness, thickness);
        gl.uniform1f(uGap, gap);
        // Each light's height above THIS glass: its height less the pane's gap.
        // A light under the glass (a photograph's own) is the gap below it instead.
        for (let k = 0; k < packed.length; k++) {
          packed[k]!.height = belows[k] ? Math.max(gap, 1) : Math.max(heights[k]! - gap, 1);
        }
        uploadLights(gl, lightLoc, packed);
        // Its place in a stack: what reaches it from above, and the stack's reflection.
        gl.uniform3fv(uLightIn, pane.stack.lightIn);
        gl.uniform3fv(uReflectScale, pane.stack.reflectScale);
        /*
         * And where that light lands: the layer above, thrown across the gap
         * between them by the lamp the way anything resting on glass throws
         * its shadow (effects/optics/shadow). Outside it the lamp reaches this pane
         * directly. The first light places it; with more lights each would
         * throw its own (a later step, when there are more).
         */
        const over = pane.stack.aboveRect;
        const lamp = packed[0];
        if (over && lamp) {
          const link = pane.stack.above;
          const sep = link?.kind === "air" ? link.gap : 0;
          const lampHeight = Math.max(heights[0]! - gap - thickness, 1);
          const cx = over.x + over.w / 2;
          const cy = over.y + over.h / 2;
          // The one shadow model: placed, grown and softened by it.
          const m = castByModel({
            lampX: lamp.x,
            lampY: lamp.y,
            height: lampHeight,
            radius: lamp.radius,
            gap: sep,
            x: cx,
            y: cy,
          });
          const cast = { x: m.x - cx, y: m.y - cy, blur: m.across };
          const grow = m.scale;
          gl.uniform4f(
            uAboveRect,
            cx - pane.x + cast.x,
            cy - pane.y + cast.y,
            (over.w / 2) * grow,
            (over.h / 2) * grow,
          );
          gl.uniform3f(uAboveSoft, Math.min(over.r, over.w / 2, over.h / 2) * grow, cast.blur, 1);
        } else {
          gl.uniform3f(uAboveSoft, 0, 0, 0);
        }
        gl.uniform1f(uGrimeRake, t("grimeRake") * smudge);
        gl.uniform1f(uGrimeSpecks, t("grimeSpecks") * scratch);
        gl.uniform1f(uSeed, pane.s);
        gl.uniform4f(uImage, pane.ix, pane.iy, pane.iw, pane.ih);
        gl.uniform3f(uImageFit, pane.ia, pane.ifocus.x, pane.ifocus.y);

        /*
         * What is standing on this pane, as shapes the shader can test.
         *
         * Pane-local pixels, already displaced by each occluder's cast vector,
         * so the hole in the rake lands where the shadow does rather than
         * under the object. The tail of the buffer is not cleared -- the count
         * bounds the loop, so stale values past it are never read.
         */
        const occ = pane.occ;
        const count = Math.min(occ.length, MAX_OCCLUDERS);
        for (let i = 0; i < count; i++) {
          const o = occ[i];
          if (!o) continue;
          const k = i * 4;
          occRect[k] = o.cx;
          occRect[k + 1] = o.cy;
          occRect[k + 2] = o.hw;
          occRect[k + 3] = o.hh;
          occSoft[k] = Math.min(o.radius, Math.min(o.hw, o.hh));
          occSoft[k + 1] = o.blur;
          occSoft[k + 2] = o.alpha;
          occSoft[k + 3] = 0;
          occDir[k] = o.dirX;
          occDir[k + 1] = o.dirY;
          occDir[k + 2] = o.cosTheta;
          occDir[k + 3] = 0;
        }
        gl.uniform1f(uOccCount, count);
        // The plastic on it (item 18b), in the same pane-local pixels.
        const plastic = shaderPlastic ? pane.plastic : [];
        const plasticCount = Math.min(plastic.length, MAX_PLASTIC);
        for (let i = 0; i < plasticCount; i++) {
          const q = plastic[i];
          if (!q) continue;
          const k = i * 4;
          plasticRect[k] = q.cx;
          plasticRect[k + 1] = q.cy;
          plasticRect[k + 2] = q.hw;
          plasticRect[k + 3] = q.hh;
          plasticLand[k] = q.landX;
          plasticLand[k + 1] = q.landY;
          plasticLand[k + 2] = q.landScale;
          plasticLand[k + 3] = q.blur;
          plasticRadius[i] = q.radius;
        }
        gl.uniform1f(uPlasticCount, plasticCount);
        if (plasticCount > 0) {
          gl.uniform4fv(uPlasticRect, plasticRect);
          gl.uniform4fv(uPlasticLand, plasticLand);
          gl.uniform1fv(uPlasticRadius, plasticRadius);
        }
        if (count > 0) {
          gl.uniform4fv(uOccRect, occRect);
          gl.uniform4fv(uOccSoft, occSoft);
          gl.uniform4fv(uOccDir, occDir);
        }

        // Scissor in device pixels, y counted from the bottom.
        const sx = Math.floor((pane.x - BLEED) * scale);
        const sw = Math.ceil((pane.w + BLEED * 2) * scale);
        const sy = Math.floor((viewportHeight() - (pane.y + pane.h) - BLEED) * scale);
        const sh = Math.ceil((pane.h + BLEED * 2) * scale);
        gl.scissor(sx, sy, sw, sh);
        /*
         * Cleared first, inside the scissor. The buffer is shared by every
         * pane in turn, and the region was only cleared after a pane's glow
         * pass -- which runs only while the light is lit. Unlit, the next
         * pane's draw blended over the last pane's pixels where their bled
         * regions overlap, and copied them into its own layer: a stacked
         * pane showed its neighbour's light a second time, cut off in a
         * hard straight line where its own region ended (todo 2a follow-up,
         * the Contact stack's line and its half-lit edge).
         */
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uGlowOnly, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        /*
         * Out of the shared buffer and into the pane.
         *
         * drawImage reads top-down while the scissor counts from the bottom,
         * so the source y is computed separately rather than reused -- getting
         * that wrong mirrors every pane vertically, which looks like a shader
         * bug and is not one.
         */
        const layer = surfaceFor(pane.el, pane.w + BLEED * 2, pane.h + BLEED * 2);
        const ctx = layer.getContext("2d");
        if (ctx) {
          /*
           * THE SOURCE RECTANGLE IS CLAMPED TO THE CANVAS.
           *
           * The layer is BLEED bigger than the pane on every side, so for any
           * pane touching an edge of the viewport -- which is every full-width
           * band on this site, where pane.x is 0 -- the rectangle this wants
           * to read starts at -90 * scale and runs 180 * scale wider than the
           * buffer. Those pixels do not exist. Asked for them, the browser
           * smears the outermost row and column to fill the gap, which paints
           * a torn streak of repeated pixels down the side of the pane.
           *
           * It is not new. It was invisible because the section wrapper had
           * `overflow: hidden` and cropped the bleed away; moving that clip in
           * so the bloom could escape stopped hiding it too.
           *
           * So: read only the part that exists, and put it at the matching
           * offset in the layer rather than stretching it to fill. Source and
           * destination stay 1:1 -- the layer is already the bleed size at the
           * same scale -- so nothing is resampled and the missing margin is
           * simply left transparent, which is what it should be. A pane
           * entirely off-buffer yields no draw at all.
           */
          const srcX = (pane.x - BLEED) * scale;
          const srcY = (pane.y - BLEED) * scale;
          const cx = Math.max(0, Math.floor(srcX));
          const cy = Math.max(0, Math.floor(srcY));
          const cw = Math.min(canvas.width, Math.ceil(srcX + sw)) - cx;
          const ch = Math.min(canvas.height, Math.ceil(srcY + sh)) - cy;

          ctx.clearRect(0, 0, layer.width, layer.height);
          if (cw > 0 && ch > 0) {
            ctx.drawImage(canvas, cx, cy, cw, ch, cx - srcX, cy - srcY, cw, ch);

            /*
             * Glare: the glow of the edge carried PAST the edge.
             *
             * The highlight lives in the bevel, inside the glass, and most of
             * the shader's terms stop at the rim because the glass does. The
             * glow that makes a lit edge read as bright does not: it is the
             * lens spreading the hottest light a little in every direction,
             * and it has no idea where the pane ends. Without it the warm
             * glow above a lit bottom edge stopped dead on the line and read
             * as clipped.
             *
             * So a blurred copy of this same light is added over itself --
             * the standard bloom pass -- which spreads the bright part of the
             * rim out over the photograph beyond as much as into the glass.
             */
            const spill = camera.lens.glare;
            if (spill > 0) {
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = Math.min(spill, 1);
              ctx.filter = `blur(${Math.round(camera.lens.glareSize * scale)}px)`;
              ctx.drawImage(canvas, cx, cy, cw, ch, cx - srcX, cy - srcY, cw, ch);
              ctx.restore();
            }
          }
          drawn.add(layer);
          allLayers.add(layer);

          /*
           * The lit edge and its bloom, again, alone, for the layer above the
           * side faces (.glass-glow; see the end of the glass shader). Same
           * region of the buffer, cleared first -- the scissor limits the
           * clear to it -- then copied out the same way, with the same glare.
           */
          const glowLayer = paneGlowLayer(pane.el);
          if (glowLayer && lit) {
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uGlowOnly, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            if (glowLayer.width !== layer.width) glowLayer.width = layer.width;
            if (glowLayer.height !== layer.height) glowLayer.height = layer.height;
            const g = glowLayer.getContext("2d");
            if (g) {
              g.clearRect(0, 0, glowLayer.width, glowLayer.height);
              if (cw > 0 && ch > 0) {
                g.drawImage(canvas, cx, cy, cw, ch, cx - srcX, cy - srcY, cw, ch);
                const spill = camera.lens.glare;
                if (spill > 0) {
                  g.save();
                  g.globalCompositeOperation = "lighter";
                  g.globalAlpha = Math.min(spill, 1);
                  g.filter = `blur(${Math.round(camera.lens.glareSize * scale)}px)`;
                  g.drawImage(canvas, cx, cy, cw, ch, cx - srcX, cy - srcY, cw, ch);
                  g.restore();
                }
              }
              drawn.add(glowLayer);
              allLayers.add(glowLayer);
              // And over whatever stands above it, where the bleed reaches.
              const gx = pane.x - BLEED;
              const gy = pane.y - BLEED;
              const gw = glowLayer.width / scale;
              const gh = glowLayer.height / scale;
              for (const { ctx: rc, r } of receivers) {
                if (r.left > gx + gw || r.right < gx || r.top > gy + gh || r.bottom < gy) continue;
                rc.save();
                rc.globalCompositeOperation = "lighter";
                rc.drawImage(glowLayer, (gx - r.left) * scale, (gy - r.top) * scale);
                rc.restore();
              }
            }
            // Leave the region as the next pane's draw expects to find it.
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
        }
      }
      gl.disable(gl.SCISSOR_TEST);

      // A pane that scrolled out of range this frame keeps its last image
      // otherwise, frozen, while the light moves on without it.
      for (const layer of allLayers) {
        if (drawn.has(layer)) continue;
        layer.getContext("2d")?.clearRect(0, 0, layer.width, layer.height);
      }
      drawn.clear();
      endPass();
      releaseFrame();
      return true;
    };

    const loop = sleepingLoop(step, "glass-light");
    const wake = () => loop.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    /*
     * And on the charge itself. The loop parks at zero charge and used to be
     * woken only by pointer movement -- so winding the shutter by HOLDING
     * still, which is the whole point of the hold trigger, grew the ring and
     * lit nothing. Caught frame by frame: 25, 50, 75, 100% charge with the
     * pointer still, and not one photon on the glass until it moved.
     */
    const stopCharge = onCharge(wake);
    const stopFlash = onFlash(wake);
    const stopShards = onShardMapChange(wake);
    // A changed setting (the room's brightness, the frost) changes the resting
    // frame too, so it has to be redrawn, not just the lit one.
    const stopTuning = onTuningApplied(() => {
      restingDrawn = false;
      wake();
    });
    loop.wake();

    const stopLoss = onSharedGlLoss(
      () => loop.stop(),
      () => setGeneration((g) => g + 1),
    );

    return () => {
      disposed = true;
      // Never leave the loader waiting on a pass that is gone.
      releaseRoom();
      releaseSurface();
      releaseFrame();
      loop.stop();
      window.removeEventListener("pointermove", wake);
      stopCharge();
      stopFlash();
      stopShards();
      stopTuning();
      stopLoss();
      gl.deleteProgram(program);
      quad.delete();
      for (const tex of layers.values()) gl.deleteTexture(tex);
      for (const { tex } of shardTextures.values()) gl.deleteTexture(tex);
      if (room) gl.deleteTexture(room);
      for (const tex of backdrops.values()) if (tex) gl.deleteTexture(tex);
      for (const tex of hidden.values()) if (tex) gl.deleteTexture(tex);
    };
  }, [chargeRef, positionRef, generation]);

  // Nothing of its own to show: it draws into each pane's surface layer.
  return null;
}
