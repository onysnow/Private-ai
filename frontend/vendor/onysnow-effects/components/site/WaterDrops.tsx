import { useEffect } from "react";
import { previewing } from "@fx/effects/engine/preview";
import { addTask, ORDER } from "@fx/effects/engine/scheduler";
import {
  beginPass,
  blitAll,
  buildProgram,
  endPass,
  onSharedGlLoss,
  sharedGl,
} from "@fx/effects/engine/gl";
import { paneCanvas } from "@fx/effects/engine/compositor";
import {
  geometryStamp,
  glassGeometry,
  litSurfaceList,
  type GlassRect,
} from "@fx/effects/scene/scene";
import { pointLights, roomLight, strongestCharge } from "@fx/effects/light/lights";
import { floorScale } from "@fx/effects/light/floor-scale";
import { publishLensMap } from "@fx/effects/water/lens-map";
import { floorMap } from "@fx/effects/light/floor-map";
import { photoTextures } from "@fx/effects/engine/photo-texture";
import { paneLook } from "@fx/effects/engine/pane-look";
import { roomTexture } from "@fx/effects/engine/room-texture";
import { paintTypeLayer, typeLayerVersion } from "@fx/effects/engine/type-layer";
import { fontStamp } from "@fx/effects/optics/casters";
import { roomFillOverride } from "@fx/effects/light/room-fill";
import { quality, surfaceScaleCap } from "@fx/effects/engine/quality";
import { rainType } from "@fx/effects/water/rain-types";
import { camera } from "@fx/effects/camera/camera";
import { t } from "@fx/lib/tuning";
import { graze, grazeColour } from "@fx/effects/light/graze";
import { backlitColour, BACKLIT_GAIN } from "@fx/effects/optics/backlit-colour";
import {
  capOf,
  DropSim,
  FILM_DRY,
  hash01,
  restAngle,
  RIVULET_DRY as SIM_RIVULET_DRY,
  slideThreshold,
  streamShift,
  streamWidth,
  trackTaper,
  patchScale,
  smoothNoise,
  MERGE_SNAP_MM,
  standLevel,
} from "@fx/effects/water/sim";
import { BLOOD, LIQUIDS, SLIME, setWaterBeading, WATER } from "@fx/effects/water/liquids";
import { onDrip } from "@fx/effects/water/drip";
import { FilmGpu } from "@fx/effects/water/film-gl";
import { G as G_MM } from "@fx/effects/water/film";
import { onSpray, squeeze } from "@fx/effects/water/spray";
import { rainVolume } from "@fx/effects/water/rain";
import { MPH, Wind } from "@fx/effects/water/wind";
import { RainFall } from "@fx/effects/water/rainfall";
import { paneSims } from "@fx/effects/water/pane-sims";
import {
  COMPOSE_FRAGMENT,
  LENS_FRAGMENT,
  LENS_LUT_PENUMBRAS,
  LENS_LUT_RATIO_MAX,
  LENS_LUT_RATIO_MIN,
  LENS_RHO_MAX,
  LENS_VERTEX,
  RIVULET_LENS_FRAGMENT,
  RIVULET_LENS_VERTEX,
  MAX_WATER_EMITTERS,
  COMPOSE_VERTEX,
  DROPLET_HEIGHT_MAX,
  FADE_FRAGMENT,
  HEIGHT_MAX,
  MAP_FRAGMENT,
  MAP_VERTEX,
  MAX_WATER_LIGHTS,
  WIPE_FRAGMENT,
  WIPE_VERTEX,
} from "@fx/effects/water/water.glsl";

/**
 * How many CSS px a millimetre of the glass is: the scale the drop physics
 * is measured in. 4: the largest drop that can still cling (4.4 mm, where
 * water starts to run) is about 18 px, most drops 4-10 px -- a rainy window
 * at arm's length, not a macro shot (Ony, 2026-10-01: the drops were "too
 * big", "like we're super zoomed in"; water-drops.md 9.5). 5 since
 * 2026-10-03: the drops a quarter bigger beside the words printed on the
 * glass, so the ones on a letter visibly magnify it (Ony chose "both,
 * moderately": this, with Beading at 70).
 */
export let PX_PER_MM = 5;
/**
 * How many CSS px a millimetre of glass is drawn across: 5 on the site; the
 * drop page zooms in (routes/drop). Set before the rain starts on a page --
 * a pane's water is laid out in millimetres when it is first seen.
 */
export function setWaterScale(pxPerMm: number) {
  PX_PER_MM = pxPerMm;
}
/**
 * The most map pixels per CSS px the water draws at (Infinity: the screen's
 * own, at least 2). The drop page lowers it: at its close zoom a drop is
 * tens of pixels across, sharp at one map pixel per CSS px, and the 2x maps
 * of a pane several windows big were most of its lag (Ony, 2026-10-10).
 */
let MAP_DENSITY = Infinity;
export function setWaterDensity(k: number) {
  MAP_DENSITY = k;
}
/** Below this radius, device px, a drop is drawn at it and faded by its area: a sparkle, not a lens too small to draw. */
const MIN_DRAWN_PX = 1.2;
/** How tall a fresh rivulet stands, mm (estimate: a film a drop leaves is a few tenths of a millimetre at its crest). */
/**
 * The angle a standing stream's edge meets the glass at, as a share of the
 * drops' contact angle (Lab "Beading"): a stream's sides are its receding
 * edge, lower than a drop's advancing one (Le Grand-Piteira et al. 2006:
 * water on their plastic 70 advancing, 35 receding; on glass about 50/45).
 */
const RIVULET_EDGE_SHARE = 0.85;
/** How fast the waves run down a flowing stream, mm/s (clip E: fronts about a quarter of the frame height a second, 40 mm/s on a 160 mm pane). */
const STREAM_FLOW_MM_S = 40;
const rivuletEdgeSin = () =>
  Math.sin((Math.max(20, Math.min(85, t("rainBeading") * RIVULET_EDGE_SHARE)) * Math.PI) / 180);
/** How long steam takes to fog the glass fully, s (estimate: a bathroom mirror fogs in well under a minute). */
const FOG_BUILD = 30;
/** The glass's index (soda-lime, 1.52). */
const GLASS_IOR = 1.52;
/**
 * A photograph's light (PhotoLights) seen through a drop, against the white
 * the print clipped it to, at full strength (estimate: a lit sign or a street
 * lamp in a night photograph is one to two orders of magnitude over that
 * white; 12 keeps a light a quarter of a pixel across clipping to a sparkle).
 */
const EMIT_RADIANCE = 12;
/** Below this, a landing drop is a droplet: drawn into the droplet map, not tracked (uL; about 0.5 mm across at 50 degrees). */
const DROPLET_UL = 0.02;
/** Droplets evaporate this fast, mm of height a second (estimate: a 0.1 mm droplet lasts about two minutes in a rainy room). */
const DROPLET_DRY = 0.0008;

/** Water's surface tension N/m and density kg/m^3, for the Bond number that sets how much gravity pulls a drop into a pear. */
const GAMMA = 0.072;
const RHO = 1000;

type Droplet = { x: number; y: number; a: number; liquid: number; seed: number };

type PaneState = {
  w: number;
  h: number;
  droplets: WebGLTexture | null;
  dropletFbo: WebGLFramebuffer | null;
  wet: WebGLTexture | null;
  wetFbo: WebGLFramebuffer | null;
  /** The condensation (steam fog), half size: R how far it has built up, 0-1. */
  fog: WebGLTexture | null;
  fogFbo: WebGLFramebuffer | null;
  fogClock: number;
  pending: Droplet[];
  /** The tracks the runners left in the rain before you arrived, to wet into the map on the first draw: [intensity, capsules in wet-map px]. */
  oldTracks: [number, number, number, number[]][];
  fresh: boolean;
  /** Each drop's place last frame, map px, and how far it has run, mm. */
  prev: Map<number, [number, number, number, number]>;
  dryClock: number;
  wetClock: number;
  /** Time since the standing water last drained a whole 8-bit step, s. */
  standClock: number;
  /** The drops (serials) inside a stream's standing water this frame: drawn as the stream, not as drops. */
  inStream: Set<number>;
  /** The pane's own weather time, s: the waves down its flowing streams run on it. */
  clock: number;
};

/** The shape of a drop of contact radius a mm: how irregular, how much of a pear, how much it sags (water-drops 9.1). */
/** A running head's shape as it goes: its contact line catching more and less, and its taper drawn out and gathered. */
function runnerShape(
  base: [number, number, number],
  id: number,
  run: number,
): [number, number, number] {
  const n1 = smoothNoise(id, run / 2.2, 6);
  const n2 = smoothNoise(id, run / 3.7, 7);
  return [Math.max(base[0], 0.05 + 0.1 * n1), base[1] * (0.75 + 0.5 * n2), base[2]];
}

function shapeOf(a: number, speed: number): [number, number, number] {
  // The Bond number: gravity against surface tension over the drop's size.
  const bond = Math.min(1.2, (RHO * 9.81 * (a / 1000) ** 2) / GAMMA);
  /*
   * The contact line catches on specks of dirt: a droplet is nearly round, a
   * big clinging drop clearly uneven (Ony, 2026-10-03: "keep adding more
   * misshapen raindrops"; it was 2-6%).
   */
  const irregular = 0.03 + 0.12 * Math.min(1, a / 1.8);
  const run = Math.min(1, speed / 20);
  /*
   * Gravity hangs a big drop: a narrow top and a heavy, flat-bottomed belly
   * (the reference photographs' "D" shapes); a runner draws out to a point
   * at the top, the tail it is pulling (Ony, 2026-10-03: "long tailed drips").
   */
  // The sag only a little (it was 0.18: every big drop's belly the same heavy flat bottom).
  return [irregular, 0.4 * Math.min(1, bond) + 0.45 * run, 0.07 * Math.min(1, bond)];
}

/**
 * Whether the rain is on the face toward you. Clear glass: as "Rain lands on"
 * says. Frosted glass with the copy printed on it (Ony, 2026-10-03: the
 * words "flat on the glass", the rain on them, magnifying them): the etched
 * face is the outer face, the one the copy is printed on and the rain falls
 * on -- each drop fills the etch under it, a clear lens over the letters and
 * onto the scene behind. Without the copy, the etch is on the back.
 */
function rainOnNearFace(frosted: boolean): boolean {
  const face = Math.round(t("rainFace"));
  // The outside, as on a window (Lab: "The outside, as on a window").
  if (face === 2) return false;
  if (!frosted) return face === 1;
  return face === 0 && t("typeOnGlass") > 0.5;
}

/** The Lab's trail mix: of the runners, the share that leave a clear line, and of the rest the share that leave a dotted trail. */
function setTrailShares(sim: DropSim) {
  const line = Math.max(0, Math.min(1, t("trailLines")));
  sim.lineShare = line;
  sim.dottedShare = (1 - line) * Math.max(0, Math.min(1, t("trailDots")));
}

/**
 * The wind on a pane's sim from the Lab's Wind group (effects/water/wind):
 * its speed (never under the rain type's own, so wind-driven rain is
 * windy), direction, gusts and wander, and how much of each of its effects.
 */
function applyWind(sim: DropSim) {
  sim.windModel ??= new Wind(sim.seed * 7 + 3);
  sim.wind = 0;
  sim.windModel.params = {
    mph: Math.max(t("windSpeed"), rainType(t("rainType")).wind),
    direction: t("windDirection"),
    gusts: t("windGusts"),
    swing: t("windSwing"),
  };
  const fx = sim.windFx;
  fx.push = t("windPush");
  fx.lean = t("windLean");
  fx.wobble = t("windWobble");
  fx.strip = t("windStrip");
  fx.shudder = t("windShudder");
  fx.spray = t("windSpray");
  fx.drying = t("windDrying");
  fx.frame = t("windFrame");
}

/** How far back the runners' tracks from before you arrived are kept, s (they dry at FILM_DRY). */
const TRACK_MEMORY = 120;
/** A stream's standing water drains this fast by default, wet-map units a second (DropSim.rivuletDry; the Lab's "Stream drains in"). */
const RIVULET_DRY = SIM_RIVULET_DRY;
/**
 * How much standing water a runner leaves in its wake: the wet map's G,
 * draining at sim.rivuletDry. The wake behind every head is water (the
 * same for every runner; what stays after it drains differs -- the film
 * line, the beads).
 */
const STAND_LINE = 0.85;
const STAND_DOTTED = 0.85;
const STAND_FAINT = 0.85;
/** One landing in this many enters from the top edge as a stream already running (clip E: half the streams start at the top; the catalogue: a fifth). */
const TOP_ENTRY_PER = 0.012;
/** How many drops along the grazing laser are counted for its shadows, and what share of the beam a drop fully in it takes out (estimate: a bead scatters most of what enters it). */
const GRAZE_BLOCKS = 24;
const GRAZE_BLOCK = 0.35;
const grazeBlock = new Float32Array(GRAZE_BLOCKS * 2);

/** How long it has rained before you arrive, s (the drops already on the glass). */
const PRE_RAIN = 150;
/** Floats a vertex in the drops' quads. */
const VERT = 21;
const NO_OUTLINE = new Float32Array(8);
const OUTLINE_SAMPLES = 48;
/** How much of each outline harmonic, 1-4, a merged drop keeps. */
const OUTLINE_DAMP = [1, 0.92, 0.72, 0.5] as const;

/**
 * The outline of a drop made of parts (DropSim): from its centre, the far
 * edge of the union of the parts' contact circles at each angle, as its mean
 * radius r0 and harmonics 1-4 against it (cos, sin), with the union's area.
 */
function outlineOf(
  cx: number,
  cy: number,
  parts: readonly (readonly [number, number, number])[],
  theta: number,
): { r0: number; area: number; coeffs: Float32Array } {
  const circles = parts.map(([x, y, v]) => [x - cx, y - cy, capOf(v, theta).a] as const);
  const r = new Float64Array(OUTLINE_SAMPLES);
  let r0 = 0;
  let area = 0;
  for (let j = 0; j < OUTLINE_SAMPLES; j++) {
    const ang = (j / OUTLINE_SAMPLES) * Math.PI * 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    let far = 0;
    for (const [px, py, pa] of circles) {
      // The ray from the centre leaves this circle at t = b + sqrt(b^2 - c).
      const b = px * ux + py * uy;
      const c = px * px + py * py - pa * pa;
      const disc = b * b - c;
      if (disc < 0) continue;
      far = Math.max(far, b + Math.sqrt(disc));
    }
    r[j] = far;
    r0 += far / OUTLINE_SAMPLES;
    area += (0.5 * far * far * Math.PI * 2) / OUTLINE_SAMPLES;
  }
  const coeffs = new Float32Array(8);
  if (r0 <= 0) return { r0: capOf(1e-3, theta).a, area: 1e-6, coeffs };
  for (let n = 1; n <= 4; n++) {
    let c = 0;
    let s = 0;
    for (let j = 0; j < OUTLINE_SAMPLES; j++) {
      const ang = (j / OUTLINE_SAMPLES) * Math.PI * 2;
      c += r[j]! * Math.cos(n * ang);
      s += r[j]! * Math.sin(n * ang);
    }
    // Surface tension evens the finer wiggles out faster: the necks fill, no bow ties (estimate).
    /*
     * And the smaller the drop, the more it rounds up: its own pressure
     * outweighs the specks pinning its line, so only a big merged drop keeps
     * its lobes (Ony, 2026-10-04: the small merged drops read as "clusters
     * of boils"; the references' small and middling drops are smooth).
     */
    const keep = Math.min(1, Math.max(0.1, (r0 - 0.5) / 1.3));
    const damp = OUTLINE_DAMP[n - 1]! * (n >= 3 ? keep * keep : keep);
    coeffs[(n - 1) * 2] = ((2 * c) / OUTLINE_SAMPLES / r0) * damp;
    coeffs[(n - 1) * 2 + 1] = ((2 * s) / OUTLINE_SAMPLES / r0) * damp;
  }
  return { r0, area, coeffs };
}

/** The height of a cap of `volume` uL over a footprint of `area` mm^2: V = (pi / 6) h (3 A / pi + h^2), solved by Newton. */
function capHeightFor(volume: number, area: number): number {
  const a2 = area / Math.PI;
  let h = (2 * volume) / Math.max(area, 1e-6);
  for (let k = 0; k < 6; k++) {
    const f = (Math.PI / 6) * h * (3 * a2 + h * h) - volume;
    const d = (Math.PI / 6) * (3 * a2 + 3 * h * h);
    h -= f / d;
  }
  return Math.max(h, 0);
}

/** A cap's contact radius for its volume (uL = mm^3) at contact angle theta: V = (pi / 6) h (3 a^2 + h^2), h = a tan(theta / 2). */
function radiusFor(volume: number, thetaDeg: number): number {
  const q = Math.tan(((thetaDeg / 2) * Math.PI) / 180);
  return Math.cbrt(volume / ((Math.PI / 6) * q * (3 + q * q)));
}

/** A droplet's cap height for its contact radius at the resting angle: h = a tan(theta / 2). */
const capH = (a: number) => a * Math.tan(((restAngle(WATER) / 2) * Math.PI) / 180);

/**
 * Water drops on the glass (task 77, ?try=drops), rebuilt for photorealism
 * (water-drops.md 9): rain lands on every pane in view; the big drops bead,
 * merge and run once heavy enough (effects/water/sim, ported from
 * raindrop-fx, MIT); thousands of tiny droplets fill the glass between them
 * and the runners sweep clean tracks through them. Wet etched glass is
 * clear, so every drop is a lens onto the photograph -- traced through the
 * water and the glass to the scene it shows, sharp, small and upside down
 * against the frost -- with every light's highlight on it. Merged drops stay
 * stretched, runners leave wavy rivulets that bend the scene, and steam can
 * fog the glass on either face (Condensation). The rain's kind comes from
 * Rain type (effects/water/rain-types). Drawn at twice the pixels where the
 * machine can afford it.
 */
export function WaterDrops() {
  useEffect(() => {
    // On the drop page the rain is the point of it (routes/drop).
    if (!previewing("drops") && !window.location.pathname.startsWith("/drop")) return;
    const s = sharedGl();
    if (!s) return;
    const { gl, canvas } = s;

    const mapProgram = buildProgram(gl, MAP_VERTEX, MAP_FRAGMENT, "water map");
    const wipeProgram = buildProgram(gl, WIPE_VERTEX, WIPE_FRAGMENT, "water wipe");
    const fadeProgram = buildProgram(gl, COMPOSE_VERTEX, FADE_FRAGMENT, "water fade");
    /*
     * Explicit mip levels for the photograph seen through a drop (rain W1,
     * the sharp lookup; water.glsl photoLod): the extension is on nearly
     * every desktop and phone; without it the shader falls back to texture2D.
     */
    const lodExt = gl.getExtension("EXT_shader_texture_lod");
    const minmax = gl.getExtension("EXT_blend_minmax");
    const composeProgram = buildProgram(
      gl,
      COMPOSE_VERTEX,
      lodExt
        ? `#extension GL_EXT_shader_texture_lod : enable\n#define HAS_TEXTURE_LOD 1\n${COMPOSE_FRAGMENT}`
        : COMPOSE_FRAGMENT,
      "water",
    );
    const lensProgram = buildProgram(gl, LENS_VERTEX, LENS_FRAGMENT, "water lens map");
    const lensLossLoc = lensProgram ? gl.getUniformLocation(lensProgram, "uLoss") : null;
    const rivuletProgram = buildProgram(
      gl,
      RIVULET_LENS_VERTEX,
      RIVULET_LENS_FRAGMENT,
      "water rivulet lens",
    );
    if (
      !mapProgram ||
      !wipeProgram ||
      !fadeProgram ||
      !composeProgram ||
      !lensProgram ||
      !rivuletProgram
    )
      return;
    const A = (p: WebGLProgram, n: string) => gl.getAttribLocation(p, n);
    const riv = {
      pos: A(rivuletProgram, "aPos"),
      uv: A(rivuletProgram, "aUv"),
      viewport: gl.getUniformLocation(rivuletProgram, "uViewport"),
      wet: gl.getUniformLocation(rivuletProgram, "uWet"),
      wetTexel: gl.getUniformLocation(rivuletProgram, "uWetTexel"),
      rivulet: gl.getUniformLocation(rivuletProgram, "uRivulet"),
      mmPerTexel: gl.getUniformLocation(rivuletProgram, "uMmPerTexel"),
      bend: gl.getUniformLocation(rivuletProgram, "uBend"),
      step: gl.getUniformLocation(rivuletProgram, "uStep"),
    };
    const rivuletQuad = gl.createBuffer();
    const lens = {
      pos: A(lensProgram, "aPos"),
      local: A(lensProgram, "aLocal"),
      lens: A(lensProgram, "aLens"),
      viewport: gl.getUniformLocation(lensProgram, "uViewport"),
      lut: gl.getUniformLocation(lensProgram, "uLut"),
    };
    const map = {
      pos: A(mapProgram, "aPos"),
      local: A(mapProgram, "aLocal"),
      drop: A(mapProgram, "aDrop"),
      shape: A(mapProgram, "aShape"),
      extra: A(mapProgram, "aExtra"),
      outA: A(mapProgram, "aOutA"),
      outB: A(mapProgram, "aOutB"),
      size: gl.getUniformLocation(mapProgram, "uMapSize"),
      scale: gl.getUniformLocation(mapProgram, "uHeightScale"),
      pxPerMm: gl.getUniformLocation(mapProgram, "uPxPerMm"),
      slopeOut: gl.getUniformLocation(mapProgram, "uSlopeOut"),
    };
    const wipe = {
      pos: A(wipeProgram, "aPos"),
      local: A(wipeProgram, "aLocal"),
      len: A(wipeProgram, "aLen"),
      r: A(wipeProgram, "aR"),
      size: gl.getUniformLocation(wipeProgram, "uMapSize"),
      pxPerMm: gl.getUniformLocation(wipeProgram, "uMapPxPerMm"),
      soft: gl.getUniformLocation(wipeProgram, "uSoft"),
      colour: gl.getUniformLocation(wipeProgram, "uColour"),
    };
    const fade = {
      pos: A(fadeProgram, "aPos"),
      colour: gl.getUniformLocation(fadeProgram, "uColour"),
    };
    const composePos = A(composeProgram, "aPos");
    const CU = (n: string) => gl.getUniformLocation(composeProgram, n);
    const UNIFORMS = [
      "uDrops",
      "uDropsUv",
      "uDropsTexel",
      "uDropsFull",
      "uDroplets",
      "uDropletsTexel",
      "uWet",
      "uPhoto",
      "uHasPhoto",
      "uImage",
      "uImageFit",
      "uPane",
      "uScale",
      "uPxPerMm",
      "uThickness",
      "uScene",
      "uSkyAbove",
      "uRivEdgeSin",
      "uTime",
      "uStreamFlow",
      "uDebug",
      "uWetTexel",
      "uFog",
      "uFogAmount",
      "uFogSide",
      "uSamples",
      "uClear",
      "uIor",
      "uGlassIor",
      "uSaturate",
      "uFill",
      "uRoom",
      "uRoomTex",
      "uHasRoom",
      "uRoomExposure",
      "uViewCentre",
      "uCameraDistance",
      "uSigmaBlood",
      "uSigmaSlime",
      "uLightCount",
      "uLightPos",
      "uLightColour",
      "uLightRadius",
      "uLightFloor",
      "uLightTint",
      "uRoomFill",
      "uBurning",
      "uFloorMap",
      "uHasFloorMap",
      "uFloorSize",
      "uType",
      "uHasType",
      "uFrostLod",
      "uNear",
      "uFrosted",
      "uBacklitGain",
      "uBacklitEdge",
      "uBacklitFill",
      "uBacklitColour",
      "uFrost",
      "uGrazeA",
      "uGrazeB",
      "uGrazeColour",
      "uGrazeBlock",
      "uPhotoTexels",
      "uEmitCount",
      "uEmitPos",
      "uEmitColour",
    ] as const;
    const u = Object.fromEntries(UNIFORMS.map((n) => [n, CU(n)])) as Record<
      (typeof UNIFORMS)[number],
      WebGLUniformLocation | null
    >;

    /*
     * Height precision (water-drops 9.1): the drops map in half-float where
     * the GPU renders and blends into it, holding mm as they are; RGBA8
     * otherwise, in units of HEIGHT_MAX.
     */
    const half = gl.getExtension("OES_texture_half_float");
    const halfRender = gl.getExtension("EXT_color_buffer_half_float");
    const halfLinear = gl.getExtension("OES_texture_half_float_linear");
    let dropsType: number = gl.UNSIGNED_BYTE;
    let dropsFull = HEIGHT_MAX;

    const quadBuffer = gl.createBuffer();
    const triangle = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const makeTarget = (w: number, h: number, type: number, filter: number) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (ok) {
        gl.clearColor(0, 0, 0, 0);
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);
        return null;
      }
      return { tex, fbo };
    };

    /*
     * The lens map (rain W2; effects/water/lens-map): what the drops do to
     * the lamp's light on the print, drawn each frame the lamp is lit, for
     * the floor light to read. Viewport-sized at CSS px; RGBA8.
     */
    let lensTarget: { tex: WebGLTexture | null; fbo: WebGLFramebuffer | null } | null = null;
    let lensW = 0;
    let lensH = 0;
    let lensLut: WebGLTexture | null = null;
    let lensLutRequested = false;
    const requestLensLut = () => {
      if (lensLutRequested) return;
      lensLutRequested = true;
      const img = new Image();
      img.onload = () => {
        lensLut = gl.createTexture();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, lensLut);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        task.wake();
      };
      img.onerror = () => console.error("lens lut failed");
      img.src = "/water/drop-lens-lut.png";
    };
    const lensBuffer = gl.createBuffer();
    // Development only: the lens map's state, for the rigs.
    if ((process.env.NODE_ENV !== "production")) {
      (window as unknown as { __lensState?: () => unknown }).__lensState = () => ({
        lut: Boolean(lensLut),
        requested: lensLutRequested,
        frame: lensFrame,
        size: [lensW, lensH],
        sims: sims.size,
        lights: pointLights().map((l) => [l.id, l.charge, l.below, l.height]),
      });
      // The map itself as an image: E = r + 8 g shown as grey E / 2 (1 = mid grey).
      (window as unknown as { __lensDump?: () => string | null }).__lensDump = () => {
        if (!lensTarget) return null;
        const px = new Uint8Array(lensW * lensH * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, lensTarget.fbo);
        gl.readPixels(0, 0, lensW, lensH, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const c = document.createElement("canvas");
        c.width = lensW;
        c.height = lensH;
        const ctx = c.getContext("2d")!;
        const out = ctx.createImageData(lensW, lensH);
        for (let y = 0; y < lensH; y++)
          for (let x = 0; x < lensW; x++) {
            const i = ((lensH - 1 - y) * lensW + x) * 4;
            const e = (px[i]! + 8 * px[i + 1]!) / 255;
            const v = Math.min(255, Math.round((e / 2) * 255));
            const o = (y * lensW + x) * 4;
            out.data[o] = out.data[o + 1] = out.data[o + 2] = v;
            out.data[o + 3] = 255;
          }
        ctx.putImageData(out, 0, 0);
        return c.toDataURL();
      };
    }
    let lensData = new Float32Array(6 * 6 * 512);
    let lensFrame = 0;
    const ensureLens = (w: number, h: number) => {
      if (lensTarget && w === lensW && h === lensH) return true;
      if (lensTarget) {
        gl.deleteTexture(lensTarget.tex);
        gl.deleteFramebuffer(lensTarget.fbo);
      }
      lensW = w;
      lensH = h;
      lensTarget = makeTarget(w, h, gl.UNSIGNED_BYTE, gl.LINEAR);
      return Boolean(lensTarget);
    };
    /*
     * One sprite per drop for the lamp: centred where the lamp's ray through
     * the drop lands on the print (a gap G behind the glass, the lamp H above
     * it: offset (drop - lamp) G / H, the footprint magnified (H + G) / H),
     * reading the lookup row for the gap over the drop's focal length
     * R / (n - 1), R = (a^2 + h^2) / 2h, and the penumbra tile for the lamp's
     * size on the print, G r / H, over the contact radius.
     */
    const drawLensMap = (
      vw: number,
      vh: number,
      lamp: { id: string; x: number; y: number; height: number; radius: number },
    ) => {
      if (!lensLut) {
        requestLensLut();
        return;
      }
      if (!ensureLens(vw, vh) || !lensTarget) return;
      // Panes and lights are in viewport CSS px already (scene.glassGeometry, lights).
      const sx = 0;
      const sy = 0;
      const H = Math.max(lamp.height, 20);
      let n = 0;
      let count = 0;
      for (const pane of glassGeometry()) {
        if (pane.y + pane.h < 0 || pane.y > vh || !pane.src) continue;
        const sim = sims.get(pane.el);
        if (!sim) continue;
        const frosted = pane.causes.material.frost > 0;
        const nearFace = rainOnNearFace(frosted);
        // The print's distance behind the drop, CSS px (the slab lies between for drops on the near face).
        const G = pane.causes.gap + (nearFace ? pane.causes.thickness / GLASS_IOR : 0);
        if (G <= 0) continue;
        const mag = (H + G) / H;
        for (let i = 0; i < sim.count; i++) {
          const a = sim.radius(i);
          if (a < 0.08) continue;
          const h0 = sim.capHeight(i);
          const R = (a * a + h0 * h0) / Math.max(2 * h0, 1e-4);
          const f = R / (WATER.n - 1);
          const ratio = G / PX_PER_MM / f;
          const row =
            Math.log(Math.max(ratio, LENS_LUT_RATIO_MIN) / LENS_LUT_RATIO_MIN) /
            Math.log(LENS_LUT_RATIO_MAX / LENS_LUT_RATIO_MIN);
          const dx = pane.x + sim.x[i]! * PX_PER_MM;
          const dy = pane.y + sim.y[i]! * PX_PER_MM;
          const cx = dx + ((dx - lamp.x) * G) / H - sx;
          const cy = dy + ((dy - lamp.y) * G) / H - sy;
          const af = a * PX_PER_MM * mag;
          const pen = (G * Math.max(lamp.radius, 1)) / H / af;
          let tile = 0;
          for (let k = 1; k < LENS_LUT_PENUMBRAS.length; k++) {
            if (
              Math.abs(Math.log((pen + 1e-3) / LENS_LUT_PENUMBRAS[k]!)) <
              Math.abs(Math.log((pen + 1e-3) / LENS_LUT_PENUMBRAS[tile]!))
            )
              tile = k;
          }
          const ext = af * LENS_RHO_MAX;
          if (cx + ext < 0 || cx - ext > vw || cy + ext < 0 || cy - ext > vh) continue;
          if (n + 36 > lensData.length) {
            const grown = new Float32Array(lensData.length * 2);
            grown.set(lensData);
            lensData = grown;
          }
          const corners = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
          for (let c = 0; c < 6; c++) {
            const ux = corners[c * 2]!;
            const uy = corners[c * 2 + 1]!;
            lensData[n++] = cx + ux * ext;
            lensData[n++] = cy + uy * ext;
            lensData[n++] = ux * LENS_RHO_MAX;
            lensData[n++] = uy * LENS_RHO_MAX;
            lensData[n++] = Math.min(Math.max(row, 0), 1);
            lensData[n++] = tile;
          }
          count++;
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, lensTarget.fbo);
      gl.viewport(0, 0, vw, vh);
      gl.clearColor(1, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // The rivulets' focus lines first; the drops' sprites lie over them.
      gl.useProgram(rivuletProgram);
      gl.uniform2f(riv.viewport, vw, vh);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const pane of glassGeometry()) {
        if (pane.y + pane.h < 0 || pane.y > vh || !pane.src) continue;
        const st = states.get(pane.el);
        if (!st?.wet) continue;
        const frosted = pane.causes.material.frost > 0;
        const nearFace = rainOnNearFace(frosted);
        const G = pane.causes.gap + (nearFace ? pane.causes.thickness / GLASS_IOR : 0);
        if (G <= 0) continue;
        const m = 1 + G / H;
        // The pane as the lamp projects it onto the print.
        const px = (q: number) => q * m - (lamp.x * G) / H;
        const py = (q: number) => q * m - (lamp.y * G) / H;
        const x0 = px(pane.x);
        const x1 = px(pane.x + pane.w);
        const y0 = py(pane.y);
        const y1 = py(pane.y + pane.h);
        const quad = new Float32Array([
          x0,
          y0,
          0,
          0,
          x1,
          y0,
          1,
          0,
          x1,
          y1,
          1,
          1,
          x0,
          y0,
          0,
          0,
          x1,
          y1,
          1,
          1,
          x0,
          y1,
          0,
          1,
        ]);
        gl.bindBuffer(gl.ARRAY_BUFFER, rivuletQuad);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(riv.pos);
        gl.vertexAttribPointer(riv.pos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(riv.uv);
        gl.vertexAttribPointer(riv.uv, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, st.wet);
        gl.uniform1i(riv.wet, 5);
        gl.uniform2f(riv.wetTexel, 2 / st.w, 2 / st.h);
        gl.uniform1f(riv.rivulet, rivuletEdgeSin());
        gl.uniform1f(riv.mmPerTexel, 2 / (st.w / pane.w) / PX_PER_MM);
        gl.uniform1f(riv.bend, (G / PX_PER_MM) * (WATER.n - 1));
        // The lamp's penumbra on the print, in wet-map texels (2 pane px per texel at full scale).
        const texelPx = (2 * pane.w) / st.w;
        gl.uniform1f(
          riv.step,
          Math.min(6, Math.max(1.5, (G * Math.max(lamp.radius, 1)) / H / texelPx)),
        );
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(riv.pos);
        gl.disableVertexAttribArray(riv.uv);
      }
      gl.disable(gl.BLEND);
      if (count > 0) {
        gl.useProgram(lensProgram);
        gl.uniform2f(lens.viewport, vw, vh);
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, lensLut);
        gl.uniform1i(lens.lut, 7);
        gl.bindBuffer(gl.ARRAY_BUFFER, lensBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, lensData.subarray(0, n), gl.DYNAMIC_DRAW);
        const stride = 6 * 4;
        gl.enableVertexAttribArray(lens.pos);
        gl.vertexAttribPointer(lens.pos, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(lens.local);
        gl.vertexAttribPointer(lens.local, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(lens.lens);
        gl.vertexAttribPointer(lens.lens, 2, gl.FLOAT, false, stride, 16);
        // The light the drops gather, added; then the light they take away, subtracted (LENS_FRAGMENT).
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform1f(lensLossLoc, 0);
        gl.drawArrays(gl.TRIANGLES, 0, count * 6);
        gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
        gl.uniform1f(lensLossLoc, 1);
        gl.drawArrays(gl.TRIANGLES, 0, count * 6);
        gl.blendEquation(gl.FUNC_ADD);
        gl.disable(gl.BLEND);
        gl.disableVertexAttribArray(lens.pos);
        gl.disableVertexAttribArray(lens.local);
        gl.disableVertexAttribArray(lens.lens);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      lensFrame++;
      publishLensMap({
        texture: lensTarget.tex!,
        scrollX: sx,
        scrollY: sy,
        width: vw,
        height: vh,
        lightId: lamp.id,
        frame: lensFrame,
      });
    };

    // The drops map: one, cleared and redrawn each frame, as large as the largest pane needs.
    let drops: { tex: WebGLTexture | null; fbo: WebGLFramebuffer | null } | null = null;
    let dropsW = 0;
    let dropsH = 0;
    const ensureDrops = (w: number, h: number) => {
      if (drops && w <= dropsW && h <= dropsH) return true;
      dropsW = Math.max(dropsW, w);
      dropsH = Math.max(dropsH, h);
      if (drops) {
        gl.deleteTexture(drops.tex);
        gl.deleteFramebuffer(drops.fbo);
      }
      drops = null;
      if (half && halfRender) {
        drops = makeTarget(
          dropsW,
          dropsH,
          half.HALF_FLOAT_OES,
          halfLinear ? gl.LINEAR : gl.NEAREST,
        );
        if (drops) {
          dropsType = half.HALF_FLOAT_OES;
          dropsFull = 1;
        }
      }
      if (!drops) {
        drops = makeTarget(dropsW, dropsH, gl.UNSIGNED_BYTE, gl.LINEAR);
        dropsType = gl.UNSIGNED_BYTE;
        dropsFull = HEIGHT_MAX;
      }
      return Boolean(drops);
    };

    /*
     * The photographs, as textures (effects/engine/photo-texture): the same
     * loader the crack faces use, mipmapped so a drop's shrunk image does
     * not shimmer.
     */
    const photoTex = photoTextures(gl, () => task.wake(), gl.TEXTURE1);
    const photo = (src: string, fallback?: string) => photoTex.get(src, fallback);

    // The room the glass reflects (effects/engine/room-texture), shared with the crack faces.
    const roomTex = roomTexture(gl, () => task.wake(), gl.TEXTURE3);

    const lookOf = paneLook;

    const sims = new Map<HTMLElement, DropSim>();
    const states = new Map<HTMLElement, PaneState>();
    const layers = new Map<HTMLElement, HTMLCanvasElement>();
    /*
     * The copy printed on each pane, as a texture the drops look through
     * (effects/engine/type-layer; Ony, 2026-10-02): repainted when the page
     * is re-measured, a font lands, or the setting changes.
     */
    const typeCanvas = document.createElement("canvas");
    // Development only: the type layer as last painted, for the rigs.
    if ((process.env.NODE_ENV !== "production")) {
      (window as unknown as { __typeLayer?: () => string }).__typeLayer = () =>
        typeCanvas.toDataURL();
    }
    const types = new Map<HTMLElement, { tex: WebGLTexture | null; key: string; has: boolean }>();
    /** The key the pane's copy texture is painted under: when it changes, the texture is stale. */
    const typeKey = (pane: GlassRect, scale: number) => {
      const on = t("typeOnGlass") > 0.5;
      /*
       * The words and where their blocks sit are part of the key: an animated
       * heading settles letter by letter after the first paint, and while its
       * wide stand-in glyphs wrap to an extra line everything below it sits a
       * line lower (the ghost rows of 2026-10-02).
       */
      let text = 0;
      if (on) {
        for (const su of litSurfaceList()) {
          if (su.material.id !== "ink" || !pane.el.contains(su.el)) continue;
          const tc = su.el.textContent ?? "";
          for (let i = 0; i < tc.length; i++) text = (text * 31 + tc.charCodeAt(i)) | 0;
          const r = su.el.getBoundingClientRect();
          text = (text * 31 + Math.round((r.top - pane.y) * 4) + Math.round(r.height * 4) * 7) | 0;
        }
      }
      return on
        ? `${geometryStamp()}|${fontStamp()}|${Math.round(pane.w)}x${Math.round(pane.h)}|${scale}|${text}|${typeLayerVersion}`
        : "off";
    };
    /*
     * Whether the pane's copy has changed since its texture was painted -- an
     * animated heading settling, an icon loading -- so the water is drawn
     * again even when nothing on the glass moved (Ony's ghost rows: the
     * heading's scrambling stand-in letters stayed in the texture, shown
     * wherever there was water, once the rain stopped redrawing).
     */
    const typeStale = (pane: GlassRect, scale: number) =>
      (types.get(pane.el)?.key ?? "") !== typeKey(pane, scale);
    const typeFor = (pane: GlassRect, scale: number) => {
      const on = t("typeOnGlass") > 0.5;
      const key = typeKey(pane, scale);
      let entry = types.get(pane.el);
      if (entry && entry.key === key) return entry;
      if (!entry) {
        entry = { tex: null, key: "", has: false };
        types.set(pane.el, entry);
      }
      entry.key = key;
      entry.has = on && paintTypeLayer(typeCanvas, pane.el, scale);
      if (entry.has) {
        if (!entry.tex) entry.tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, typeCanvas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
      // Over the copy when the copy is on the glass (the drops sit on the letters); under it otherwise.
      const layer = layers.get(pane.el);
      if (layer) {
        layer.classList.toggle("glass__water--over-type", entry.has);
        maskPhotos(layer, pane.el, entry.has);
      }
      return entry;
    };
    /*
     * Photographs always lie over the rain (Ony, 2026-10-10: "the rain is
     * still on top of images"). Where the water sits over the copy it is
     * above the pane's content, and a z-index on the photographs cannot win
     * from inside the wrappers that hold them (a card lifted for the cast
     * shadows, a reveal's opacity -- each its own stacking context). So the
     * water's layer is cut away where each photograph lies: a mask of the
     * whole layer minus the photographs' boxes.
     */
    const maskPhotos = (layer: HTMLElement, paneEl: HTMLElement, over: boolean) => {
      const boxes: string[] = [];
      if (over) {
        const lr = layer.getBoundingClientRect();
        const rects: DOMRect[] = [];
        for (const img of paneEl.querySelectorAll<HTMLElement>(
          "img, video, picture, .gallery-frame",
        )) {
          if (img.closest(".glass") !== paneEl) continue;
          const r = img.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          rects.push(r);
        }
        /*
         * The cut-outs combine by exclusion, so one inside another (a photo
         * and its frame) would cut the water back IN: only the outermost
         * box of each photograph is kept.
         */
        const inside = (a: DOMRect, b: DOMRect) =>
          a !== b &&
          a.left >= b.left - 1 &&
          a.top >= b.top - 1 &&
          a.right <= b.right + 1 &&
          a.bottom <= b.bottom + 1;
        for (const r of rects) {
          if (
            rects.some(
              (o) => inside(r, o) && !(inside(o, r) && rects.indexOf(o) > rects.indexOf(r)),
            )
          )
            continue;
          boxes.push(
            `linear-gradient(#000 0 0) ${(r.left - lr.left).toFixed(1)}px ${(r.top - lr.top).toFixed(1)}px / ${r.width.toFixed(1)}px ${r.height.toFixed(1)}px no-repeat`,
          );
          if (boxes.length >= 48) break;
        }
      }
      const mask = boxes.length ? ["linear-gradient(#000 0 0)", ...boxes].join(", ") : "";
      if (layer.dataset["photoMask"] === mask) return;
      layer.dataset["photoMask"] = mask;
      layer.style.setProperty("mask", mask);
      layer.style.setProperty("-webkit-mask", mask);
      layer.style.setProperty("mask-composite", mask ? "exclude" : "");
    };
    // The photographs move (they load, reveal, reflow): their cut-outs are re-measured now and then.
    const maskTimer = window.setInterval(() => {
      for (const [el, layer] of layers) {
        if (layer.classList.contains("glass__water--over-type")) maskPhotos(layer, el, true);
      }
    }, 500);
    let seed = 1;
    let rng = 0x2545f491;
    const random = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    const gauss = () =>
      Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
    /*
     * The maps' and the water layer's scale, device px per CSS px: the
     * screen's own, and at least 2 on a machine that can afford it -- drawn
     * at twice the pixels and shown smaller, every drop's rim and every
     * droplet is antialiased by the browser's downscale (Ony, 2026-10-01:
     * the drops were "still way too pixelated").
     */
    const dpr = () =>
      Math.max(Math.min(2, Math.max(1, window.devicePixelRatio || 1)), surfaceScaleCap());

    /*
     * Where rain lands on a pane is not even (Ony, 2026-10-02: "sometimes
     * spaces have a lot less raindrops while other areas are more
     * concentrated. It depends on how heavy the rain is"). Gusts and the
     * eaves and frame shelter some of the glass, so drops arrive in drifts:
     * a slow field over the pane (cells PATCH_MM and a finer third of it)
     * sets how likely a drop is to land at a point. Light rain is patchy,
     * a downpour covers the glass almost evenly.
     */
    const PATCH_MM = 30;
    const patchAt = (sim: DropSim, x: number, y: number) => {
      const octave = (cell: number, salt: number) => {
        const gx = x / cell;
        const gy = y / cell;
        const i = Math.floor(gx);
        const j = Math.floor(gy);
        const fx = gx - i;
        const fy = gy - j;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const v = (p: number, q: number) => hash01(sim.seed * 31337 + salt + p * 8191, q);
        return (
          (v(i, j) * (1 - sx) + v(i + 1, j) * sx) * (1 - sy) +
          (v(i, j + 1) * (1 - sx) + v(i + 1, j + 1) * sx) * sy
        );
      };
      return 0.7 * octave(PATCH_MM, 11) + 0.3 * octave(PATCH_MM / 3, 29);
    };
    /** A point on the pane where rain lands, drawn from the drift field. */
    const spot = (sim: DropSim): [number, number] => {
      const heavy = Math.min(1, (rainType(t("rainType")).rate * t("rainStrength")) / 0.3);
      // Sheltered and exposed parts of a window: sparser and denser regions. Mild: in 117 photographs most panes are near uniform, and large empty-looking areas come from what is behind the glass, not from missing water.
      const contrast = 0.75 - 0.3 * heavy;
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = random() * sim.width;
        y = random() * sim.height;
        // Smoothstepped so the drifts have edges, not a gentle ramp.
        const p = patchAt(sim, x, y);
        const e = p * p * (3 - 2 * p);
        // And where the wind drives the rain at the glass (Sim.landWeight: more toward its windward side, little in the frame's lee).
        if (random() < (1 - contrast * (1 - e)) * (sim.landWeight(x, y) / 1.6)) break;
      }
      return [x, y];
    };

    /** A rain drop landing: a drop the sim tracks if it is big enough, and its splash of droplets. */
    /*
     * The water as a fluid (Lab: Water > "Water physics"; effects/water/
     * film-gl): each pane's water a height field moved by gravity, surface
     * tension, the glass's wetting and grip, drag and wind, on the GPU.
     * Where it runs, the rain lands in it and the drops map is drawn from
     * it; the rule-based drops (DropSim) stay empty.
     */
    const films = new Map<DropSim, FilmGpu | null>();
    /*
     * The rain falling outside each pane (Lab: Wind > "Falling rain";
     * effects/water/rainfall): a 2D canvas behind the glass's own layers, at
     * the CSS pixel size (soft streaks need no more), moved and drawn each
     * frame with the pane's wind.
     */
    const falls = new Map<
      HTMLElement,
      { rf: RainFall; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null }
    >();
    const drawRainfall = (
      pane: ReturnType<typeof glassGeometry>[number],
      sim: DropSim,
      dt: number,
      rate: number,
    ): boolean => {
      const amount = t("fallingRain");
      let f = falls.get(pane.el);
      if (!(amount > 0) || !(rate > 0)) {
        if (f?.ctx) f.ctx.clearRect(0, 0, f.canvas.width, f.canvas.height);
        return false;
      }
      if (!f || !f.canvas.isConnected) {
        const canvas = paneCanvas(pane.el, "pane:rainfall");
        f = { rf: f?.rf ?? new RainFall(sim.seed * 13 + 5), canvas, ctx: canvas.getContext("2d") };
        falls.set(pane.el, f);
      }
      // Soft streaks out of focus: a big pane's (the drop page's) are drawn at half its pixels, shown stretched.
      const rs = pane.w * pane.h > 3e6 ? 0.5 : 1;
      const w = Math.max(1, Math.round(pane.w * rs));
      const h = Math.max(1, Math.round(pane.h * rs));
      if (f.canvas.width !== w || f.canvas.height !== h) {
        f.canvas.width = w;
        f.canvas.height = h;
      }
      if (!f.ctx) return false;
      f.rf.draw(f.ctx, w, h, dt, sim.windAt(sim.width / 2, sim.height / 2), rate, amount);
      return true;
    };
    const fluidOn = () => Math.round(t("rainPhysics")) === 1;
    const filmFor = (sim: DropSim): FilmGpu | null => {
      if (!fluidOn()) return null;
      if (!films.has(sim)) {
        const f = FilmGpu.create(gl, sim.width, sim.height, t("rainPhysicsCell"), seed++);
        films.set(sim, f);
        if (f) {
          // The glass you arrive at: drops resting where the rain left them (the fluid takes it from there).
          const n = Math.round(((sim.width * sim.height) / 100) * 1.2);
          for (let q = 0; q < n; q++)
            f.addDrop(
              random() * sim.width,
              random() * sim.height,
              Math.min(6, rainVolume(random(), random(), 1.6)),
            );
        }
      }
      const f = films.get(sim) ?? null;
      if (f) {
        f.params.theta = Math.max(30, Math.min(85, t("rainBeading") * 0.85));
        f.params.pin = t("rainPhysicsGrip");
        f.params.gravity = [0, G_MM];
        // The wind along the glass, as the fluid takes it (0.55 was the old wind-driven rain, about 30 mph).
        const [wx, wy] = sim.windAt(sim.width / 2, sim.height / 2);
        const k = (0.55 / (30 * MPH)) * t("rainPhysicsWind");
        f.params.wind = [wx * k, wy * k];
      }
      return f;
    };
    const land = (sim: DropSim, st: PaneState, volume: number) => {
      const film = filmFor(sim);
      if (film) {
        const [x, y] = spot(sim);
        film.addDrop(x, y, volume);
        return;
      }
      const [x, y] = spot(sim);
      /*
       * Some of what runs down the pane came from above it (the window
       * goes on past the section): one landing in TOP_ENTRY_PER arrives
       * at the top edge as a stream already running, at its running
       * weight and more.
       */
      if (volume >= DROPLET_UL && random() < TOP_ENTRY_PER) {
        const heavy = slideThreshold(WATER) * (1.1 + 0.9 * random());
        sim.enterFromTop(x, heavy, WATER.id);
        return;
      }
      if (volume >= DROPLET_UL) sim.addVolume(x, y, volume, WATER.id);
      else {
        const a = radiusFor(volume, restAngle(WATER));
        // Into a stream's lane, or a track's fresh film: it joins the water there (docs/research-streams.md 5.1).
        if (sim.touchesLane(x, y, a) || sim.filmAt(x, y) > 0.3) return;
        st.pending.push({
          x: Math.min(sim.width - a, Math.max(a, x)),
          y: Math.min(sim.height - a, Math.max(a, y)),
          a,
          liquid: WATER.id,
          seed: random() * 1000,
        });
      }
    };
    /** Drizzle and splash: tiny droplets anywhere on the pane, radius log-normal round 0.17 mm (water-drops 9.1: 2-4 px across in the 1280 px reference frames). */
    const drizzle = (sim: DropSim, st: PaneState, n: number) => {
      for (let q = 0; q < n; q++) {
        const a = Math.min(0.45, 0.17 * Math.exp(0.45 * gauss()));
        const [sx, sy] = spot(sim);
        // Wholly on the glass: a droplet cannot hang past the pane's edge.
        const x = Math.min(sim.width - a, Math.max(a, sx));
        const y = Math.min(sim.height - a, Math.max(a, sy));
        /*
         * A droplet landing on the wet film a runner left joins the film: the
         * lanes the streams wiped stay clear for a while, the lines in the
         * negative space (Ony, 2026-10-02).
         */
        const film = sim.filmAt(x, y);
        if (film > 0.1 && random() < film) continue;
        // Nor in a stream's lane: a droplet landing on a stream joins it.
        if (sim.touchesLane(x, y, a)) continue;
        st.pending.push({
          x,
          y,
          a,
          liquid: WATER.id,
          seed: random() * 1000,
        });
      }
    };

    const stateFor = (pane: ReturnType<typeof glassGeometry>[number], sim: DropSim) => {
      // As sharp as the screen allows, but no bigger than the GPU can hold (the drop page's pane is several windows big).
      const maxTex = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 4096;
      const k = Math.min(
        dpr(),
        MAP_DENSITY,
        maxTex / Math.max(1, pane.w),
        maxTex / Math.max(1, pane.h),
      );
      const w = Math.max(1, Math.round(pane.w * k));
      const h = Math.max(1, Math.round(pane.h * k));
      let st = states.get(pane.el);
      if (st && (st.w !== w || st.h !== h)) {
        gl.deleteTexture(st.droplets);
        gl.deleteFramebuffer(st.dropletFbo);
        gl.deleteTexture(st.wet);
        gl.deleteFramebuffer(st.wetFbo);
        gl.deleteTexture(st.fog);
        gl.deleteFramebuffer(st.fogFbo);
        st = undefined;
      }
      if (!st) {
        const d = makeTarget(w, h, gl.UNSIGNED_BYTE, gl.LINEAR);
        const wt = makeTarget(
          Math.max(1, Math.round(w / 2)),
          Math.max(1, Math.round(h / 2)),
          gl.UNSIGNED_BYTE,
          gl.LINEAR,
        );
        const fg = makeTarget(
          Math.max(1, Math.round(w / 2)),
          Math.max(1, Math.round(h / 2)),
          gl.UNSIGNED_BYTE,
          gl.LINEAR,
        );
        st = {
          w,
          h,
          droplets: d?.tex ?? null,
          dropletFbo: d?.fbo ?? null,
          wet: wt?.tex ?? null,
          wetFbo: wt?.fbo ?? null,
          fog: fg?.tex ?? null,
          fogFbo: fg?.fbo ?? null,
          fogClock: 0,
          pending: [],
          oldTracks: [],
          fresh: true,
          prev: new Map(),
          dryClock: 0,
          wetClock: 0,
          standClock: 0,
          inStream: new Set<number>(),
          clock: 0,
        };
        states.set(pane.el, st);
        // Steam on the glass when you arrive: already fogged, as the rain has already fallen.
        if (st.fogFbo && t("fogAmount") > 0) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.fogFbo);
          gl.viewport(0, 0, Math.round(w / 2), Math.round(h / 2));
          gl.clearColor(1, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.clearColor(0, 0, 0, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        /*
         * It has been raining a while when you arrive: a minute of drizzle
         * already on the glass, and the sim run on from PRE_RAIN seconds of
         * rain -- long enough for the drops to meet and merge into the lumpy
         * shapes a window has after a few minutes (Ony, 2026-10-02: "a lot
         * of almost perfect ovals"; forty seconds left nearly every drop
         * still a lone round bead). Coarse steps, so it costs what the forty
         * did.
         */
        const type = rainType(t("rainType"));
        const rain = type.before * t("rainStrength");
        const rivuletDry = 1 / Math.max(0.5, t("rainStreamDrain"));
        sim.rivuletDry = rivuletDry;
        const areaCm2 = (sim.width * sim.height) / 100;
        applyWind(sim);
        setTrailShares(sim);
        if (sim.count === 0 && rain > 0 && !filmFor(sim)) {
          /*
           * The runners of the last TRACK_MEMORY seconds leave their tracks,
           * as they do once you are watching: the glass you arrive at already
           * has lines, dotted trails and clear lanes on it, drying.
           */
          const half = (k * PX_PER_MM) / 2; // wet-map px per mm
          const was = new Map<number, [number, number, number]>();
          const buckets = new Map<string, number[]>();
          // Dev only: how many runs the last 30 s of the pre-rain made (the rigs compare it with the live rate).
          const ranAt = (process.env.NODE_ENV !== "production") ? new Map<number, [number, number]>() : null;
          for (let s = 0; s < PRE_RAIN * 30; s++) {
            /*
             * It came down harder before you arrived (a shower, then the rain
             * you see): three times as hard until the last minute, so the
             * glass has had its few minutes' worth of rain -- drops grown heavy
             * enough to run, streams down it and the lanes they cleared --
             * without simulating ten minutes on load (Ony, 2026-10-04: "I
             * don't see any streams or empty stream paths").
             */
            const shower = PRE_RAIN - s / 30 > 60 ? 3 : 1;
            const expected = (shower * rain * sim.rainRate(t("windRainFollows")) * areaCm2) / 30;
            let n = Math.floor(expected);
            if (random() < expected - n) n++;
            for (let q = 0; q < n; q++) land(sim, st, rainVolume(random(), random(), type.median));
            sim.fastForward(1 / 30);
            const age = PRE_RAIN - (s + 1) / 30;
            if (ranAt && age <= 20)
              for (let i = 0; i < sim.count; i++) {
                const e = ranAt.get(sim.serial[i]!);
                if (!e) ranAt.set(sim.serial[i]!, [sim.ran[i]!, sim.ran[i]!]);
                else e[1] = sim.ran[i]!;
                if (Math.hypot(sim.vx[i]!, sim.vy[i]!) >= 0.5) {
                  const dbg = window as unknown as { __preRainMoving?: Record<string, number> };
                  const m = sim.trailMode(i);
                  (dbg.__preRainMoving ??= {})[m] = (dbg.__preRainMoving[m] ?? 0) + 1;
                }
              }
            sim.drained.length = 0;
            if (age > TRACK_MEMORY) {
              sim.paths.clear();
              continue;
            }
            // Along where each runner went this frame (DropSim.paths), as live: never a merge's jump, never a frame's straight stroke.
            const bySerial = new Map<number, number>();
            for (let i = 0; i < sim.count; i++) bySerial.set(sim.serial[i]!, i);
            for (const [id, pts] of sim.paths) {
              const i = bySerial.get(id);
              if (i === undefined) continue;
              const mode = sim.trailMode(i);
              const strength = 0.85;
              const level = Math.round(strength * Math.exp(-FILM_DRY * age) * 20) / 20;
              const standFull =
                mode === "line" ? STAND_LINE : mode === "dotted" ? STAND_DOTTED : STAND_FAINT;
              const a = sim.radius(i);
              const p = was.get(id);
              let px0 = p ? p[0] : pts[3]!;
              let py0 = p ? p[1] : pts[1]!;
              let run0 = p ? p[2] : pts[2]!;
              for (let k = 0; k < pts.length; k += 5) {
                const px1 = pts[k + 3]!;
                const py1 = pts[k + 1]!;
                const run1 = pts[k + 2]!;
                const rwMm = pts[k + 4]!;
                // A break (a merge moved it): the track goes on from the next point, nothing drawn across.
                if (Number.isNaN(px1)) {
                  px0 = NaN;
                  continue;
                }
                const ds = Number.isNaN(px0) ? 0 : Math.hypot(px1 - px0, py1 - py0);
                if (Number.isNaN(px0) || ds < 0.05) {
                  if (Number.isNaN(px0)) {
                    px0 = px1;
                    py0 = py1;
                    run0 = run1;
                  }
                  continue;
                }
                // The standing water it left, draining at RIVULET_DRY, bottom heavy (sim standLevel).
                const stand = standFull * standLevel(run1 - sim.ranStart[i]!);
                const riv = Math.round(Math.max(0, stand - rivuletDry * age) * 20) / 20;
                if (level >= 0.05 || riv >= 0.05) {
                  if (ranAt && age <= 20) {
                    const dbg = window as unknown as { __preRainCaps?: Record<string, number> };
                    (dbg.__preRainCaps ??= {})[mode] = (dbg.__preRainCaps[mode] ?? 0) + 1;
                  }
                  // A line keeps its channel (B, the closeness to its centre) while its film lasts: the residual wet line after it drains.
                  const key = `${level.toFixed(2)},${riv.toFixed(2)},${(Math.round(Math.max(0, 1 - FILM_DRY * age) * 20) / 20).toFixed(2)}`;
                  const list = buckets.get(key) ?? [];
                  // At the centre and width the sim laid its lane with (DropSim.paths).
                  list.push(px0 * half, py0 * half, px1 * half, py1 * half, rwMm * half);
                  buckets.set(key, list);
                }
                px0 = px1;
                py0 = py1;
                run0 = run1;
              }
              if (!Number.isNaN(px0)) was.set(id, [px0, py0, run0]);
              else was.delete(id);
            }
            sim.paths.clear();
          }
          for (const [key, caps] of buckets) {
            const [r, g, b] = key.split(",").map(Number);
            st.oldTracks.push([r!, g!, b!, caps]);
          }
          if (ranAt) {
            let runs = 0;
            for (const [, [a, b]] of ranAt) if (b - a > 8) runs++;
            (window as unknown as { __preRainRuns?: number }).__preRainRuns = runs;
          }
        }
        /*
         * A minute of drizzle, landing after the runners: the lanes they left
         * wet in the last minute or so stay clear of it (drizzle skips the
         * film), so you arrive to clean paths down the glass.
         */
        drizzle(
          sim,
          st,
          Math.round(rain * areaCm2 * 60 * Math.max(type.droplets, 12) * t("dropletScale")),
        );
      }
      return st;
    };

    const simFor = (pane: ReturnType<typeof glassGeometry>[number]) => {
      let sim = sims.get(pane.el);
      // The scale changed under it (the drop page zooms in): the glass is that many mm now, a new sim.
      if (sim && Math.abs(sim.width * PX_PER_MM - pane.w) > Math.max(4, pane.w * 0.02)) {
        sims.delete(pane.el);
        paneSims.delete(pane.el);
        sim = undefined;
      }
      if (!sim) {
        // Up to 3000 drops a pane (1500 at 6 px a mm; the same glass is 2.25 times the area at 4): in steady rain a window holds about a fifth of its area in drops (estimate, from the reference photographs); 400 capped it at 9%.
        sim = new DropSim({
          width: pane.w / PX_PER_MM,
          height: pane.h / PX_PER_MM,
          seed: seed++,
          maxDrops: 3000,
        });
        sims.set(pane.el, sim);
        paneSims.set(pane.el, sim);
      }
      return sim;
    };
    // For the verification rigs (dev only): the sims, to count drops and runners.
    if ((process.env.NODE_ENV !== "production"))
      Object.assign(window as unknown as Record<string, unknown>, {
        __waterSims: sims,
        __glassGeometry: glassGeometry,
        // The wet map's channels, for the rigs: per channel its max and how many texels are above 1/255, and a sample row.
        __waterWetStats: (el: HTMLElement) => {
          const st = states.get(el);
          if (!st) return null;
          const w = Math.round(st.w / 2);
          const h = Math.round(st.h / 2);
          const px = new Uint8Array(w * h * 4);
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.wetFbo);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          const max = [0, 0, 0, 0];
          const n = [0, 0, 0, 0];
          for (let i = 0; i < px.length; i++) {
            const c = i & 3;
            if (px[i]! > max[c]!) max[c] = px[i]!;
            if (px[i]! > 1) n[c]!++;
          }
          return { w, h, max, n };
        },
        // The wet map as a PNG data URL (RGBA as stored, pane order), for the rigs.
        __waterWetMap: (el: HTMLElement) => {
          const st = states.get(el);
          if (!st) return null;
          const w = Math.round(st.w / 2);
          const h = Math.round(st.h / 2);
          const px = new Uint8ClampedArray(w * h * 4);
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.wetFbo);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d")!;
          const img = ctx.createImageData(w, h);
          // The wipes map pane y 0 to clip -1: GL row 0 is the pane's top already.
          img.data.set(px);
          ctx.putImageData(img, 0, 0);
          return c.toDataURL();
        },
        // Start the rain over, as on arriving, with the knobs as they are now.
        __waterReset: () => {
          for (const f of films.values()) f?.dispose();
          films.clear();
          sims.clear();
          paneSims.clear();
          for (const st of states.values()) {
            gl.deleteTexture(st.droplets);
            gl.deleteFramebuffer(st.dropletFbo);
            gl.deleteTexture(st.wet);
            gl.deleteFramebuffer(st.wetFbo);
            gl.deleteTexture(st.fog);
            gl.deleteFramebuffer(st.fogFbo);
          }
          states.clear();
          task.wake();
        },
      });

    let verts = new Float32Array(4096);
    const grow = (n: number) => {
      if (verts.length < n) verts = new Float32Array(Math.max(n, verts.length * 2));
    };
    const lightPos = new Float32Array(MAX_WATER_LIGHTS * 3);
    const lightColour = new Float32Array(MAX_WATER_LIGHTS * 3);
    const lightRadius = new Float32Array(MAX_WATER_LIGHTS);
    const lightFloor = new Float32Array(MAX_WATER_LIGHTS);
    const lightTint = new Float32Array(MAX_WATER_LIGHTS * 3);
    const emitPos = new Float32Array(MAX_WATER_EMITTERS * 3);
    const emitColour = new Float32Array(MAX_WATER_EMITTERS * 3);
    let idleTimer = 0;
    const CORNERS = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ] as const;

    /** Write one drop's quad: centre (map px), radius (map px), stretch, and its attributes. VERT floats a vertex. */
    const pushDrop = (
      k: number,
      cx: number,
      cy: number,
      rPx: number,
      stretch: number,
      a: number,
      h0: number,
      sd: number,
      liquid: number,
      shape: readonly [number, number, number],
      skewX = 0,
      skewY = 0,
      out: ArrayLike<number> = NO_OUTLINE,
      dirX = 0,
      dirY = 1,
    ) => {
      /*
       * Too small to draw as a lens (under MIN_DRAWN_PX): drawn at that size,
       * faded by how much of it there really is -- a sparkle with a glint,
       * as a camera records a droplet smaller than a pixel.
       */
      let coverScale = 1;
      if (rPx < MIN_DRAWN_PX) {
        coverScale = (rPx / MIN_DRAWN_PX) ** 2;
        a *= MIN_DRAWN_PX / rPx;
        rPx = MIN_DRAWN_PX;
      }
      // The pear and the irregularity reach past the circle: x to 1 + taper, y a little; a merged drop's lobes further.
      let reach = 1;
      for (let n = 0; n < 8; n++) reach += Math.abs(out[n]!);
      // The corners and tails a big drop's line takes (SHAPE_GLSL contactRho) reach up to twice as far.
      // Each drop's own roughness factor (up to 3x) and oval stretch (up to 1.4x) are the shader's, from its seed: room for both.
      if (shape[0] > 0.04) reach *= 2;
      const ex = (1.15 + shape[1]) * reach * 1.4;
      const ey = 1.15 * reach * 1.4;
      const sx = 1 / Math.sqrt(stretch);
      /*
       * What a merge left (DropSim skew): stretched along that axis by 1 + s,
       * narrowed across it by 1 / sqrt(1 + s), the cap lowered to keep its
       * volume. An affine map of the drop's own frame, so the shape the map
       * pass draws in that frame comes out stretched.
       */
      const sk = Math.hypot(skewX, skewY);
      const e = 1 + sk;
      const ux = sk > 1e-6 ? skewX / sk : 0;
      const uy = sk > 1e-6 ? skewY / sk : 1;
      const across = 1 / Math.sqrt(e);
      const m00 = across + (e - across) * ux * ux;
      const m01 = (e - across) * ux * uy;
      const m11 = across + (e - across) * uy * uy;
      h0 /= Math.sqrt(e);
      /*
       * Its own "down" turned to where it is driven (the wind and gravity
       * together, or the way it runs): the drop's frame rotated so its pear,
       * sag and tail point that way. Its outline (pane-fixed lobes) is turned
       * back by as much, so the footprint stays where it is.
       */
      let o = out;
      if (dirX !== 0 && out !== NO_OUTLINE) {
        const d = Math.atan2(-dirX, dirY);
        const r = new Float32Array(8);
        for (let n = 1; n <= 4; n++) {
          const c = out[(n - 1) * 2]!;
          const sn = out[(n - 1) * 2 + 1]!;
          const cn = Math.cos(n * d);
          const snn = Math.sin(n * d);
          r[(n - 1) * 2] = c * cn + sn * snn;
          r[(n - 1) * 2 + 1] = sn * cn - c * snn;
        }
        o = r;
      }
      for (const [qx, qy] of CORNERS) {
        const lx = qx * ex * rPx * sx;
        const ly = qy * ey * rPx * stretch;
        const X = m00 * lx + m01 * ly;
        const Y = m01 * lx + m11 * ly;
        verts[k++] = cx + dirY * X + dirX * Y;
        verts[k++] = cy - dirX * X + dirY * Y;
        verts[k++] = qx * ex;
        verts[k++] = qy * ey;
        verts[k++] = a;
        verts[k++] = h0;
        verts[k++] = sd;
        verts[k++] = liquid;
        verts[k++] = shape[0];
        verts[k++] = shape[1];
        verts[k++] = shape[2];
        verts[k++] = coverScale;
        verts[k++] = 0;
        for (let n = 0; n < 8; n++) verts[k++] = o[n]!;
      }
      return k;
    };

    const drawDrops = (
      count: number,
      w: number,
      h: number,
      heightScale: number,
      pxPerMm: number,
      slopeOut = 0,
    ) => {
      gl.useProgram(mapProgram);
      gl.uniform1f(map.slopeOut, slopeOut);
      gl.uniform2f(map.size, w, h);
      gl.uniform1f(map.scale, heightScale);
      gl.uniform1f(map.pxPerMm, pxPerMm);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, count * VERT), gl.DYNAMIC_DRAW);
      const S = VERT * 4;
      gl.enableVertexAttribArray(map.pos);
      gl.vertexAttribPointer(map.pos, 2, gl.FLOAT, false, S, 0);
      gl.enableVertexAttribArray(map.local);
      gl.vertexAttribPointer(map.local, 2, gl.FLOAT, false, S, 8);
      gl.enableVertexAttribArray(map.drop);
      gl.vertexAttribPointer(map.drop, 4, gl.FLOAT, false, S, 16);
      gl.enableVertexAttribArray(map.shape);
      gl.vertexAttribPointer(map.shape, 3, gl.FLOAT, false, S, 32);
      gl.enableVertexAttribArray(map.extra);
      gl.vertexAttribPointer(map.extra, 2, gl.FLOAT, false, S, 44);
      gl.enableVertexAttribArray(map.outA);
      gl.vertexAttribPointer(map.outA, 4, gl.FLOAT, false, S, 52);
      gl.enableVertexAttribArray(map.outB);
      gl.vertexAttribPointer(map.outB, 4, gl.FLOAT, false, S, 68);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      gl.disableVertexAttribArray(map.local);
      gl.disableVertexAttribArray(map.drop);
      gl.disableVertexAttribArray(map.shape);
      gl.disableVertexAttribArray(map.extra);
      gl.disableVertexAttribArray(map.outA);
      gl.disableVertexAttribArray(map.outB);
    };

    /** Capsules from each drop's last place to its place now, into a map (7 floats a vertex... 5 used). */
    const drawWipes = (
      caps: number[],
      w: number,
      h: number,
      colour: readonly [number, number, number, number],
      soft = 0.15,
      mapPxPerMm = 1,
    ) => {
      if (caps.length === 0) return;
      // caps: x0, y0, x1, y1, r (map px), per capsule.
      const n = caps.length / 5;
      grow(n * 6 * 6);
      let k = 0;
      for (let c = 0; c < n; c++) {
        const x0 = caps[c * 5]!;
        const y0 = caps[c * 5 + 1]!;
        const x1 = caps[c * 5 + 2]!;
        const y1 = caps[c * 5 + 3]!;
        const r = Math.max(caps[c * 5 + 4]!, 0.5);
        const len = Math.hypot(x1 - x0, y1 - y0);
        const ux = len > 1e-3 ? (x1 - x0) / len : 0;
        const uy = len > 1e-3 ? (y1 - y0) / len : 1;
        const L = len / r;
        for (const [qx, qy] of CORNERS) {
          // Along: from -1 radius behind the start to +1 past the end.
          const along = qx < 0 ? -1 : L + 1;
          const across = qy * 1;
          verts[k++] = x0 + (ux * along - uy * across) * r;
          verts[k++] = y0 + (uy * along + ux * across) * r;
          verts[k++] = along;
          verts[k++] = across;
          verts[k++] = L;
          verts[k++] = r;
        }
      }
      gl.useProgram(wipeProgram);
      gl.uniform2f(wipe.size, w, h);
      gl.uniform1f(wipe.soft, soft);
      gl.uniform1f(wipe.pxPerMm, mapPxPerMm);
      gl.uniform4f(wipe.colour, ...colour);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, k), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(wipe.pos);
      gl.vertexAttribPointer(wipe.pos, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(wipe.local);
      gl.vertexAttribPointer(wipe.local, 2, gl.FLOAT, false, 24, 8);
      gl.enableVertexAttribArray(wipe.len);
      gl.vertexAttribPointer(wipe.len, 1, gl.FLOAT, false, 24, 16);
      gl.enableVertexAttribArray(wipe.r);
      gl.vertexAttribPointer(wipe.r, 1, gl.FLOAT, false, 24, 20);
      gl.drawArrays(gl.TRIANGLES, 0, n * 6);
      gl.disableVertexAttribArray(wipe.local);
      gl.disableVertexAttribArray(wipe.len);
      gl.disableVertexAttribArray(wipe.r);
    };

    /** Take a constant off every texel of the bound target (drying, evaporating). */
    const fadeBy = (colour: readonly [number, number, number, number]) => {
      gl.useProgram(fadeProgram);
      gl.uniform4f(fade.colour, ...colour);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(fade.pos);
      gl.vertexAttribPointer(fade.pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
    };

    /** Add a constant to the whole bound map (blend ONE, ONE): the fog building up. */
    const addBy = (colour: readonly [number, number, number, number]) => {
      gl.useProgram(fadeProgram);
      gl.uniform4f(fade.colour, ...colour);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(fade.pos);
      gl.vertexAttribPointer(fade.pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    };

    const drawPane = (
      pane: ReturnType<typeof glassGeometry>[number],
      sim: DropSim,
      st: PaneState,
      dt: number,
      mapsOnly = false,
    ) => {
      const k = st.w / pane.w;
      let layer = layers.get(pane.el);
      if (!layer || !layer.isConnected) {
        layer = paneCanvas(pane.el, "pane:water");
        layers.set(pane.el, layer);
      }
      if (!beginPass(st.w, st.h, "water")) return;
      if (!ensureDrops(st.w, st.h) || !drops) return endPass();
      const pxMm = PX_PER_MM * k; // map px per mm

      // 1. New droplets, into the droplet map: heights add where they overlap.
      if (st.dropletFbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, st.dropletFbo);
        gl.viewport(0, 0, st.w, st.h);
        if (st.pending.length) {
          let done = 0;
          while (done < st.pending.length) {
            const batch = Math.min(4000, st.pending.length - done);
            grow(batch * 6 * VERT);
            let v = 0;
            for (let q = 0; q < batch; q++) {
              const d = st.pending[done + q]!;
              v = pushDrop(
                v,
                d.x * pxMm,
                d.y * pxMm,
                d.a * pxMm,
                1,
                d.a,
                capH(d.a),
                d.seed,
                d.liquid,
                shapeOf(d.a, 0),
              );
            }
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            drawDrops(batch * 6, st.w, st.h, 1 / DROPLET_HEIGHT_MAX, pxMm);
            gl.disable(gl.BLEND);
            done += batch;
          }
          st.pending.length = 0;
        }
        // 2. Every drop swallows the droplets under it; a running one sweeps its path.
        const caps: number[] = [];
        // The runners' tracks this frame, bucketed by what they leave (film R, standing G, softness): one wipe batch each.
        const liveTracks = new Map<string, number[]>();
        const seen = new Set<number>();
        /*
         * One body of water (Ony, 2026-10-10: "the drop doesn't stay a single
         * drop and keep its single drop effects -- it becomes part of the
         * stream"): a drop inside standing water that another runner laid --
         * a bead the head shed, the bulb it let go from, a pulse sliding
         * down a standing stream, a head crossing an older stream -- is the
         * stream's water. It is not drawn as a drop; its footprint is drawn
         * into the stream's standing water instead, and it shows again as
         * a drop once the stream has drained from round it. A drop the
         * stream's edge took (DropSim.drained) becomes a bulge the same way.
         */
        const inStream = new Set<number>();
        // Its footprint at the stream's own level there (not fresh water: that would keep the stream standing over it for ever), by level.
        const streamWater = new Map<string, number[]>();
        const asStreamWater = (x: number, y: number, a: number, level: number) => {
          const key = `0.85,${(Math.round(Math.min(STAND_LINE, level) * 20) / 20).toFixed(2)},0.6`;
          (streamWater.get(key) ?? streamWater.set(key, []).get(key)!).push(
            x / 2,
            y / 2,
            x / 2,
            y / 2,
            (a * 0.9 * pxMm) / 2,
          );
        };
        const standingBy = (k: number, sr: number) =>
          k >= 0 &&
          sim.rivulet[k]! > DropSim.TAKES_AT &&
          sim.rivuletBy[k] !== sr &&
          sim.laneTrack[k] !== sr;
        for (let i = 0; i < sim.count; i++) {
          const id = sim.serial[i]!;
          seen.add(id);
          const x = sim.x[i]! * pxMm;
          const y = sim.y[i]! * pxMm;
          const r = sim.radius(i) * pxMm;
          {
            const a = sim.radius(i);
            const moving = Math.hypot(sim.vx[i]!, sim.vy[i]!) >= 0.5;
            const kc = sim.laneIndex(sim.x[i]!, sim.y[i]!);
            const ka = sim.laneIndex(sim.x[i]!, sim.y[i]! + a + 0.5);
            const under = standingBy(kc, id) ? kc : moving && standingBy(ka, id) ? ka : -1;
            if (under >= 0) {
              inStream.add(id);
              // The stream's own water (its beads, the bulb it let go from) is already in it; only water it takes in becomes a bulge.
              const own =
                sim.parent[i]! >= 0 &&
                (sim.parent[i] === sim.laneTrack[under] || sim.parent[i] === sim.rivuletBy[under]);
              if (!own) asStreamWater(x, y, a, sim.rivulet[under]!);
            }
          }
          const p = st.prev.get(id);
          const step = p ? Math.hypot(x - p[0], y - p[1]) : 0;
          // Its sweep since last frame (never across a merge's jump: that is not where it went).
          if (p && (!mapsOnly || step > 0.3) && step < r * 4 + 3 * pxMm)
            // Over its drawn footprint (its patch) and the capillary snap: a droplet a hair from its edge is pulled in.
            caps.push(
              p[0],
              p[1],
              x,
              y,
              r * patchScale(id, restAngle(sim.liquidOf(i))) + MERGE_SNAP_MM * pxMm,
            );
          const run = sim.ran[i]!;
          /*
           * The track is laid along where the sim says the runner went
           * (DropSim.paths: a point per substep it moved by its own
           * velocity, never a merge's jump), not between two frames'
           * positions: a quarter-second frame at 50 mm/s drew one 12 mm
           * straight stroke, and a swallow mid-frame a sideways step --
           * zig-zags and right angles (Ony, 2026-10-09).
           */
          const trail = sim.paths.get(id);
          if (trail && trail.length >= 3) {
            /*
             * The film is narrower than the drop that laid it (its receding
             * edge, water-drops 2.5: a rivulet is narrower than its drop) and
             * thin at its edges. It starts as a thread where the drop let go
             * and widens over the first few radii of its run (Ony,
             * 2026-10-03: the streams had "a loop at the top" -- the track's
             * round end, full width, read as the stream turning back).
             */
            const a = sim.radius(i);
            /*
             * What it leaves depends on the runner (DropSim trailMode): a
             * clear line of water (a full film, standing as a rivulet and
             * slow to dry), a thin damp thread that its beads break from, or
             * next to nothing.
             */
            const mode = sim.trailMode(i);
            const stand =
              mode === "line" ? STAND_LINE : mode === "dotted" ? STAND_DOTTED : STAND_FAINT;
            // Under a stream the glass is wet whatever the runner leaves later: the stream clears the etch (else the frost showed through it as grit).
            const film = 0.85;
            const soft = mode === "line" ? 0.6 : mode === "dotted" ? 0.7 : 0.8;
            // From where its track was last frame (or the trail's first point) through every point it passed.
            let px0 = p ? p[3] : trail[3]!;
            let py0 = p ? p[1] / pxMm : trail[1]!;
            let run0 = p ? p[2] : trail[2]!;
            for (let k = 0; k < trail.length; k += 5) {
              const px1 = trail[k + 3]!;
              const py1 = trail[k + 1]!;
              const run1 = trail[k + 2]!;
              const rwMm = trail[k + 4]!;
              // A break (a merge moved it): the track goes on from the next point, nothing drawn across the move.
              if (Number.isNaN(px1)) {
                px0 = NaN;
                continue;
              }
              if (Number.isNaN(px0)) {
                px0 = px1;
                py0 = py1;
                run0 = run1;
                continue;
              }
              const ds = Math.hypot(px1 - px0, py1 - py0);
              if (ds < 0.05) continue;
              /*
               * At the centre and width the sim laid its lane with
               * (DropSim.paths): narrower than the drop, thin where it let
               * go, the track's own swells and necks, a lane's width down a
               * lane -- never the widest a lane has ever been nor a snap to
               * its centre line (the rod and the right angle, 2026-10-09).
               */
              const sx0 = px0;
              const sx1 = px1;
              /*
               * Bottom heavy (Ony, 2026-10-09): once the flow stops the water
               * drains down the track, so its top thins first and its foot
               * holds the most. The standing water a runner leaves grows with
               * its run over the first STAND_GROW_MM, from half to full.
               */
              // Bottom heavy down its length; and a creeper lays a damp path, not a stream (sim streamWeight).
              const heavy = standLevel(run1 - sim.ranStart[i]!) * sim.streamWeight(i);
              const key = `${film},${(Math.round(stand * heavy * 20) / 20).toFixed(2)},${soft}`;
              (liveTracks.get(key) ?? liveTracks.set(key, []).get(key)!).push(
                (sx0 * pxMm) / 2,
                (py0 * pxMm) / 2,
                (sx1 * pxMm) / 2,
                (py1 * pxMm) / 2,
                (rwMm * pxMm) / 2,
              );
              px0 = px1;
              py0 = py1;
              run0 = run1;
            }
          }
          {
            // Where its track ended this frame (centre x mm, y px, run, centre x mm again for the next frame's start).
            const t = sim.paths.get(id);
            const last =
              t && t.length >= 5 && !Number.isNaN(t[t.length - 2]!) ? t[t.length - 2]! : x / pxMm;
            st.prev.set(id, [x, y, run, last]);
          }
        }
        for (const id of st.prev.keys()) if (!seen.has(id)) st.prev.delete(id);
        sim.paths.clear();
        for (let k = 0; k < sim.drained.length; k += 3) {
          const mx = sim.drained[k]!;
          const my = sim.drained[k + 1]!;
          asStreamWater(
            mx * pxMm,
            my * pxMm,
            sim.drained[k + 2]!,
            Math.max(DropSim.TAKES_AT, sim.rivuletAt(mx, my)),
          );
        }
        sim.drained.length = 0;
        sim.dripped.length = 0;
        for (const [key, caps] of streamWater)
          (liveTracks.get(key) ?? liveTracks.set(key, []).get(key)!).push(...caps);
        st.inStream = inStream;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
        drawWipes(caps, st.w, st.h, [1, 1, 1, 1]);
        gl.disable(gl.BLEND);
        // Evaporation: a whole 8-bit step of height at a time.
        // Faster in a wind (the moving air carries the vapour off).
        st.dryClock += dt * (1 + (t("windDrying") * sim.windMph) / 10);
        const step = DROPLET_HEIGHT_MAX / 255;
        if (st.dryClock * DROPLET_DRY >= step) {
          const n = Math.floor((st.dryClock * DROPLET_DRY) / step);
          st.dryClock -= (n * step) / DROPLET_DRY;
          fadeBy([n / 255, 0, 0, 0]);
        }
        // 3. The film a runner leaves: wet, so clear; drying at FILM_DRY.
        if (st.wetFbo) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.wetFbo);
          gl.viewport(0, 0, Math.round(st.w / 2), Math.round(st.h / 2));
          gl.enable(gl.BLEND);
          /*
           * The deepest water wins, not the sum: a runner redraws its capsule
           * every frame, and adding those up flattened every stream into a
           * saturated, flat-topped bar (Ony, 2026-10-03: "looks like a solid
           * object"). With MAX the map keeps each stream's rounded cross-section.
           */
          if (minmax) gl.blendEquation(minmax.MAX_EXT);
          gl.blendFunc(gl.ONE, gl.ONE);
          const mapPxPerMm = st.w / 2 / (pane.w / PX_PER_MM);
          for (const [level, riv, line, caps] of st.oldTracks)
            drawWipes(
              caps,
              Math.round(st.w / 2),
              Math.round(st.h / 2),
              [level, riv, line, level],
              0.65,
              mapPxPerMm,
            );
          // For the verification rigs (dev only): the tracks as drawn, in wet-map px, to check nothing sits in them.
          if ((process.env.NODE_ENV !== "production") && st.oldTracks.length) {
            const w = window as unknown as { __waterOldTracks?: Map<HTMLElement, unknown> };
            (w.__waterOldTracks ??= new Map()).set(pane.el, {
              half: st.w / 2 / (pane.w / PX_PER_MM), // wet-map px per mm
              tracks: st.oldTracks.map((t) => [t[0], t[1], Array.from(t[3])]),
            });
          }
          st.oldTracks.length = 0;
          /*
           * Every runner leaves standing water behind it while it runs (clip
           * E: a trail still shows 3 s after; on clear glass a damp thread
           * with no standing water is invisible, and 85% of the runs were
           * dotted or faint -- the pane showed no streams). The level says
           * how long it stands (RIVULET_DRY takes a constant off a second):
           * a clear line 17 s, a thread 8 s, a near-dry track 4 s.
           */
          for (const [key, caps] of liveTracks) {
            const [film, stand, soft] = key.split(",").map(Number);
            drawWipes(
              caps,
              Math.round(st.w / 2),
              Math.round(st.h / 2),
              [film!, stand!, 1, film!],
              soft!,
              mapPxPerMm,
            );
          }
          if (minmax) gl.blendEquation(gl.FUNC_ADD);
          gl.disable(gl.BLEND);
          st.wetClock += dt;
          st.standClock += dt;
          st.clock += dt;
          /*
           * The film dries at FILM_DRY; a stream's standing water drains
           * down into its head at sim.rivuletDry (the Lab's "Stream drains
           * in"), each a whole 8-bit step at a time on its own clock, the
           * time it used taken off so the rates stay exact.
           */
          const filmSteps = Math.floor(st.wetClock * FILM_DRY * 255);
          const standSteps = Math.floor(st.standClock * sim.rivuletDry * 255);
          if (filmSteps > 0 || standSteps > 0) {
            // The track's shape (B, its centre line; A, its width) goes with the film: an old stream's footprint must not shape a new one through it.
            fadeBy([filmSteps / 255, standSteps / 255, filmSteps / 255, filmSteps / 255]);
            st.wetClock -= filmSteps / (FILM_DRY * 255);
            st.standClock -= standSteps / (sim.rivuletDry * 255);
          }
        }
        /*
         * 4. Condensation: steam fogging the glass, building up over about
         * FOG_BUILD seconds (a whole 8-bit step at a time). On the rain's own
         * face every drop's footprint and every runner's path wipes it, and
         * it builds back over the tracks; on the other face nothing touches it.
         */
        if (st.fogFbo) {
          const fw = Math.round(st.w / 2);
          const fh = Math.round(st.h / 2);
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.fogFbo);
          gl.viewport(0, 0, fw, fh);
          if (t("fogAmount") > 0) {
            st.fogClock = Math.max(st.fogClock, 0) + dt;
            const n = Math.floor((st.fogClock / FOG_BUILD) * 255);
            if (n > 0) {
              addBy([n / 255, 0, 0, 0]);
              st.fogClock -= (n / 255) * FOG_BUILD;
            }
            if (Math.round(t("fogSide")) === 0) {
              const half = caps.map((v) => v / 2);
              gl.enable(gl.BLEND);
              gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
              drawWipes(half, fw, fh, [1, 1, 1, 1], 0.35);
              gl.disable(gl.BLEND);
            }
          } else if (st.fogClock !== -1) {
            // Off: the glass is clear of it, and builds from nothing when it is turned on.
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            st.fogClock = -1;
          }
        }
      }

      if (mapsOnly) {
        filmFor(sim)?.step(Math.min(dt, 1 / 20), t("rainPhysicsSteps"));
        return endPass();
      }
      // 4. The drops map, cleared and drawn whole.
      const film = filmFor(sim);
      if (film) {
        // The fluid: its substeps for this frame (capped: on a slow GPU the water runs slow, never wild).
        film.step(Math.min(dt, 1 / 20), t("rainPhysicsSteps"));
        gl.useProgram(null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, drops.fbo);
      gl.viewport(0, 0, st.w, st.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (film) film.drawMap(st.w, st.h, pxMm, dropsType === gl.UNSIGNED_BYTE ? 1 / HEIGHT_MAX : 1);
      if (sim.count && !film) {
        grow(sim.count * 6 * VERT);
        let v = 0;
        let quads = 0;
        for (let i = 0; i < sim.count; i++) {
          const speed = Math.hypot(sim.vx[i]!, sim.vy[i]!);
          /*
           * A bead a runner shed into its wake is the stream's own water
           * while the stream stands over it: it shows once the standing
           * water has drained from round it (Ony, 2026-10-09: "the stream
           * slowly disappears leaving behind some drops along the path"),
           * never as a drop sitting on a stream.
           */
          if (st.inStream.has(sim.serial[i]!)) continue;
          // Stretched along its run as it speeds up (raindrop-fx raindrop.ts L82-L85).
          /*
           * A running head is water on the move, never one fixed shape (Ony,
           * 2026-10-10: "the drops when they turn into streams don't keep the
           * same exact shape at the head"): its outline's catches turn and
           * shift as it runs (the outline's seed advances with its run), and
           * it lengthens and gathers up as it surges and slows.
           */
          // A creeper barely over its let-go weight stays a bead as it moves (sim streamWeight); a runner draws out.
          const runW = speed >= 0.5 ? sim.streamWeight(i) : 0;
          const moving = speed >= 0.5 && sim.parent[i]! < 0 && runW > 0.35;
          const ranHere = sim.ran[i]!;
          const surge = moving ? (smoothNoise(sim.serial[i]!, ranHere / 3, 5) - 0.5) * 2 : 0;
          const stretch =
            (1 + 0.35 * runW * (2 / Math.PI) * Math.atan(0.05 * speed)) * (1 + 0.14 * surge);
          const theta = restAngle(sim.liquidOf(i));
          const parts = sim.parts(i);
          let a = sim.radius(i);
          let h0 = sim.capHeight(i);
          let out: ArrayLike<number> = NO_OUTLINE;
          if (parts.length > 1) {
            /*
             * A merged drop (DropSim parts: each lobe's footprint pinned where
             * it was): one sprite over the union of its lobes' contact circles,
             * that outline as harmonics round the drop's centre, and the cap
             * height that holds its volume over that footprint.
             */
            const o = outlineOf(sim.x[i]!, sim.y[i]!, parts, theta);
            a = o.r0;
            h0 = capHeightFor(sim.vol[i]!, o.area);
            out = o.coeffs;
          }
          /*
           * The glass never wets evenly: dirt, coating and wear change the
           * contact angle from one patch to the next by tens of degrees, so
           * one drop stands as a bead and its neighbour of the same volume
           * lies as a flat blob (the reference photographs; Ony, 2026-10-04:
           * "too uniform ... clusters of boils"). Each drop sits on its own
           * patch: 25 degrees under to 12 over the glass's own angle, its
           * footprint and height following at its volume.
           */
          {
            const ratio = patchScale(sim.serial[i]!, theta);
            /*
             * A running head is not the bead it was (Ony, 2026-10-10: "once it
             * becomes a stream the height and bulge shrinks ... it's being
             * spread out over the length of the stream"): drawn out along its
             * run (stretch) and spread lower as it goes -- its advancing edge
             * flattens and its water feeds back along the stream -- so the
             * same water stands over a longer, flatter footprint, the more
             * the faster and the further it has run.
             */
            const spread = moving
              ? stretch * (1 + 0.35 * Math.min(1, speed / 30) + 0.35 * Math.min(1, ranHere / 25))
              : 1;
            const area = Math.PI * a * a * ratio * ratio * spread;
            a *= ratio;
            h0 = capHeightFor(sim.vol[i]!, area);
          }
          /*
           * Which way is down for it: the way it runs; at rest, where the
           * wind and gravity push it together (Ony, 2026-10-10: drops "pool
           * to the appropriate direction based on where it's blowing from"),
           * its pear and sag deeper the harder it is pushed.
           */
          let dirX = 0;
          let dirY = 1;
          let shape = moving
            ? runnerShape(shapeOf(a, speed * runW), sim.serial[i]!, ranHere)
            : shapeOf(a, speed * runW);
          let wob = stretch;
          if (speed >= 0.5) {
            dirX = sim.vx[i]! / speed;
            dirY = sim.vy[i]! / speed;
          } else if (sim.windModel) {
            const lean = t("windLean");
            const gx = sim.driveX[i]! * lean;
            const gy = 1 + (sim.driveY[i]! - 1) * lean;
            const G = Math.hypot(gx, gy);
            if (G > 1e-3) {
              dirX = gx / G;
              dirY = gy / G;
              // How far past its own weight it is pushed: the water pools that way, the drop drawn out a little toward it.
              const more = Math.min(2.5, Math.max(0, Math.hypot(gx, gy - 1)));
              shape = [
                shape[0],
                shape[1] * (1 + 1.2 * more) + 0.08 * Math.min(1, more),
                Math.min(0.45, shape[2] * (1 + 2 * more) + 0.06 * Math.min(1, more)),
              ];
              wob *= 1 + 0.12 * Math.min(1.5, more);
            }
          }
          /*
           * Shivering in the wind (Ony, 2026-10-10: "does it have a slight
           * wobble?"): air running over a drop sets its surface oscillating,
           * more the harder it blows and the bigger the drop, in bursts with
           * the turbulence -- it stretches and gathers along the wind, rocks a
           * little and its cap bobs, so its highlights twinkle.
           */
          if (sim.windModel && t("windWobble") > 0 && sim.windMph > 2) {
            const [wx, wy] = sim.windAt(sim.x[i]!, sim.y[i]!);
            const u = Math.hypot(wx, wy) / MPH;
            const sr = sim.serial[i]!;
            const tt = sim.time;
            const amp =
              t("windWobble") *
              0.11 *
              Math.min(1.5, (u / 22) ** 2) *
              Math.min(1, a / 1.3) *
              (0.55 + 0.45 * Math.sin(1.7 * tt + 6.28 * hash01(sr, 61)));
            const f1 = 5 + 6 * hash01(sr, 62);
            const f2 = 3 + 4 * hash01(sr, 63);
            wob *= 1 + amp * Math.sin(6.2832 * f1 * tt + 6.28 * hash01(sr, 64));
            const rock = 0.6 * amp * Math.sin(6.2832 * f2 * tt + 6.28 * hash01(sr, 65));
            const c = Math.cos(rock);
            const sn = Math.sin(rock);
            const nx = dirX * c - dirY * sn;
            dirY = dirX * sn + dirY * c;
            dirX = nx;
            h0 *= 1 - 0.5 * amp * Math.sin(6.2832 * f1 * 1.37 * tt + 6.28 * hash01(sr, 66));
          }
          v = pushDrop(
            v,
            sim.x[i]! * pxMm,
            sim.y[i]! * pxMm,
            a * pxMm,
            wob,
            a,
            h0,
            ((sim.serial[i]! * 0.618034) % 997) + (moving ? ranHere * 0.045 : 0),
            sim.liquid[i]!,
            shape,
            0,
            /*
             * A bead pinched off a stream's thread pulls round (surface
             * tension): no tail. (Drawn out along its line, every bead read
             * as a little vertical rod -- Ony, 2026-10-10: "they're supposed
             * to turn into beads not rods"); a few keep a faint point.
             */
            sim.parent[i]! >= 0 ? 0.12 * hash01(sim.serial[i]!, 3) ** 2 : 0,
            out,
            dirX,
            dirY,
          );
          quads++;
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        drawDrops(
          quads * 6,
          st.w,
          st.h,
          dropsType === gl.UNSIGNED_BYTE ? 1 / HEIGHT_MAX : 1,
          pxMm,
          1,
        );
        gl.disable(gl.BLEND);
      }
      gl.disableVertexAttribArray(map.pos);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // 5. The water layer.
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composeProgram);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, drops.tex);
      gl.uniform1i(u.uDrops!, 2);
      gl.uniform2f(u.uDropsUv!, st.w / dropsW, st.h / dropsH);
      gl.uniform2f(u.uDropsTexel!, 1 / dropsW, 1 / dropsH);
      gl.uniform1f(u.uDropsFull!, dropsFull);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, st.droplets);
      gl.uniform1i(u.uDroplets!, 4);
      gl.uniform2f(u.uDropletsTexel!, 1 / st.w, 1 / st.h);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, st.wet);
      gl.uniform1i(u.uWet!, 5);
      const tex = pane.srcFull || pane.src ? photo(pane.srcFull || pane.src, pane.src) : null;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uPhoto!, 1);
      gl.uniform1f(u.uHasPhoto!, tex ? 1 : 0);
      const size = tex ? photoTex.size(tex) : undefined;
      gl.uniform2f(u.uPhotoTexels!, size?.[0] ?? 1024, size?.[1] ?? 1024);
      gl.uniform4f(u.uImage!, pane.ix, pane.iy, pane.iw, pane.ih);
      gl.uniform3f(u.uImageFit!, pane.ia, pane.ifocus.x, pane.ifocus.y);
      gl.uniform4f(u.uPane!, pane.x, pane.y, pane.w, pane.h);
      gl.uniform1f(u.uScale!, k);
      gl.uniform1f(u.uPxPerMm!, PX_PER_MM);
      gl.uniform1f(u.uThickness!, pane.causes.thickness);
      /*
       * How far behind the drops the photograph is: the pane's gap, the
       * distance the glass's refraction, the floor light and the shadows
       * all use (rain W1; it was a fixed 900 px "world outside" that nothing
       * else agreed with). Rain on the near face of clear glass looks through
       * the slab first, which brings the photograph nearer by its apparent
       * depth, thickness / n.
       */
      const frosted = pane.causes.material.frost > 0;
      const nearFace = rainOnNearFace(frosted);
      gl.uniform1f(
        u.uScene!,
        pane.causes.gap * t("dropSceneDepth") + (nearFace ? pane.causes.thickness / GLASS_IOR : 0),
      );
      gl.uniform1f(u.uSkyAbove!, t("dropSkyAbove"));
      gl.uniform1f(u.uNear!, nearFace ? 1 : 0);
      gl.uniform1f(u.uFrosted!, frosted ? 1 : 0);
      // The backlight shone into the pane's edges, which the water lets out (water.glsl backlitWater).
      gl.uniform1f(u.uBacklitGain!, t("backlight") * BACKLIT_GAIN);
      gl.uniform1f(u.uBacklitEdge!, t("backlightEdge"));
      gl.uniform1f(u.uBacklitFill!, t("backlightSize"));
      gl.uniform3fv(u.uBacklitColour!, backlitColour());
      gl.uniform1f(u.uFrost!, pane.causes.material.frost);
      /*
       * The grazing laser (effects/light/graze): where it is, and how much of
       * it is left at each drop it has crossed -- each takes its share
       * (GRAZE_BLOCK of what overlaps the beam), so those further along are
       * dimmer: the shadows down the beam.
       */
      gl.uniform3f(u.uGrazeA!, graze.x, graze.y, graze.on ? 1 : 0);
      gl.uniform3f(u.uGrazeB!, graze.dx, graze.dy, graze.width);
      gl.uniform3fv(u.uGrazeColour!, grazeColour());
      grazeBlock.fill(1e9);
      if (graze.on) {
        const hits: [number, number][] = [];
        for (let i = 0; i < sim.count; i++) {
          const cx = pane.x + sim.x[i]! * PX_PER_MM - graze.x;
          const cy = pane.y + sim.y[i]! * PX_PER_MM - graze.y;
          const along = cx * graze.dx + cy * graze.dy;
          if (along < 0) continue;
          const across = Math.abs(-cx * graze.dy + cy * graze.dx);
          const r = sim.radius(i) * PX_PER_MM;
          if (across > r + graze.width) continue;
          // A droplet narrower than the beam takes only its own width's share of it (a speck barely dims it).
          const overlap = Math.min(1, (r + graze.width - across) / (2 * graze.width));
          hits.push([along + r, overlap * Math.min(1, r / graze.width)]);
        }
        hits.sort((p, q) => p[0] - q[0]);
        let left = 1;
        for (let k = 0; k < Math.min(hits.length, GRAZE_BLOCKS); k++) {
          left *= 1 - GRAZE_BLOCK * hits[k]![1];
          grazeBlock[k * 2] = hits[k]![0];
          grazeBlock[k * 2 + 1] = left;
        }
        // Past the last drop counted, what is left stays.
        if (hits.length > GRAZE_BLOCKS) grazeBlock[(GRAZE_BLOCKS - 1) * 2 + 1] = left;
      }
      gl.uniform2fv(u.uGrazeBlock!, grazeBlock);
      gl.uniform1f(u.uRivEdgeSin!, rivuletEdgeSin());
      gl.uniform1f(u.uTime!, st.clock);
      gl.uniform1f(
        u.uDebug!,
        (process.env.NODE_ENV !== "production")
          ? Number((window as unknown as { __waterDebug?: number }).__waterDebug ?? 0)
          : 0,
      );
      gl.uniform1f(u.uStreamFlow!, STREAM_FLOW_MM_S);
      gl.uniform2f(u.uWetTexel!, 2 / st.w, 2 / st.h);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, st.fog);
      gl.uniform1i(u.uFog!, 6);
      gl.uniform1f(u.uFogAmount!, st.fog ? t("fogAmount") : 0);
      gl.uniform1f(u.uFogSide!, Math.round(t("fogSide")));
      // Four samples a pixel where there is water, on machines that run the full tier.
      gl.uniform1f(u.uSamples!, quality() === "full" ? 4 : 1);
      // On clear glass the water is a lens whichever face it is on; on frosted glass, only on the etched face.
      gl.uniform1f(u.uClear!, !frosted || Math.round(t("rainFace")) !== 1 ? 1 : 0);
      gl.uniform1f(u.uIor!, WATER.n);
      gl.uniform1f(u.uGlassIor!, GLASS_IOR);
      const look = lookOf(pane.el);
      gl.uniform1f(u.uSaturate!, look.saturate);
      gl.uniform4f(u.uFill!, ...look.fill);
      gl.uniform3f(u.uRoom!, 0.05, 0.045, 0.04);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, roomTex.texture);
      gl.uniform1i(u.uRoomTex!, 3);
      gl.uniform1f(u.uHasRoom!, roomTex.texture ? 1 : 0);
      gl.uniform1f(u.uRoomExposure!, roomLight.gain);
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vhNow = document.documentElement.clientHeight || window.innerHeight;
      gl.uniform2f(u.uViewCentre!, vw / 2, vhNow / 2);
      gl.uniform1f(u.uCameraDistance!, camera.distance(vw));
      gl.uniform3f(u.uSigmaBlood!, ...BLOOD.sigma);
      gl.uniform3f(u.uSigmaSlime!, ...SLIME.sigma);
      let n = 0;
      for (const l of pointLights()) {
        if (n >= MAX_WATER_LIGHTS || l.below || l.charge <= 0.002) continue;
        lightPos[n * 3] = l.x;
        lightPos[n * 3 + 1] = l.y;
        // Above the glass by its height; a light in the glass's plane (Light.plane) level with the drops' middles.
        lightPos[n * 3 + 2] = l.plane ? 3 : Math.max(l.height, 20);
        const strength = l.charge * Math.min(l.gain / 8, 2);
        lightColour[n * 3] = l.colour[0] * strength;
        lightColour[n * 3 + 1] = l.colour[1] * strength;
        lightColour[n * 3 + 2] = l.colour[2] * strength;
        lightRadius[n] = l.radius;
        /*
         * The lamp on the print, as the floor light sends it (FloorLight):
         * its charge eased, its power and height against the defaults
         * (cursor lamp and physical lights only), and "Light through glass".
         */
        const lit = l.charge * l.charge * (3 - 2 * l.charge);
        const scale = l.id === "cursor" || l.physicalFloor ? floorScale(l.gain, l.height) : 1;
        lightFloor[n] = lit * scale * t("floorLight");
        lightTint[n * 3] = l.colour[0];
        lightTint[n * 3 + 1] = l.colour[1];
        lightTint[n * 3 + 2] = l.colour[2];
        n++;
      }
      gl.uniform1i(u.uLightCount!, n);
      gl.uniform1fv(u.uLightFloor!, lightFloor);
      gl.uniform3fv(u.uLightTint!, lightTint);
      gl.uniform1f(u.uRoomFill!, Math.min(t("roomFill"), roomFillOverride()));
      gl.uniform1f(u.uBurning!, strongestCharge());
      // The lit floor this frame, where the lenses land (rain W2; effects/light/floor-map).
      const floorNow = floorMap();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, floorNow ? floorNow.texture : null);
      gl.uniform1i(u.uFloorMap!, 0);
      gl.uniform1f(u.uHasFloorMap!, floorNow ? 1 : 0);
      gl.uniform2f(u.uFloorSize!, floorNow?.width ?? 1, floorNow?.height ?? 1);
      // The copy printed on the glass, for the drops over it (effects/engine/type-layer).
      const ty = typeFor(pane, k);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, ty.has ? ty.tex : null);
      gl.uniform1i(u.uType!, 7);
      gl.uniform1f(u.uHasType!, ty.has ? 1 : 0);
      // The frost's blur as a mip level of the photograph, for a near-face drop's view of the far face.
      const texPerPx = (size?.[0] ?? 1024) / Math.max(pane.iw, 1);
      gl.uniform1f(
        u.uFrostLod!,
        frosted ? Math.max(0, Math.log2(Math.max(1, 2 * look.blur * texPerPx))) : 0,
      );
      /*
       * The photograph's own lights (PhotoLights: its brightest spots, as
       * lights under the glass), carried through each drop's lens (rain W1).
       * A print clips a lamp or a neon to white; it was brighter than that,
       * by EMIT_RADIANCE at full strength (estimate: a lit sign or a street
       * lamp in a night photograph is one to two orders of magnitude over
       * the white it was clipped to), so in a drop it is still a sparkle.
       */
      let ne = 0;
      for (const l of pointLights()) {
        if (ne >= MAX_WATER_EMITTERS || !l.below || l.charge <= 0.002) continue;
        if (l.x < pane.x - 400 || l.x > pane.x + pane.w + 400) continue;
        if (l.y < pane.y - 400 || l.y > pane.y + pane.h + 400) continue;
        emitPos[ne * 3] = l.x;
        emitPos[ne * 3 + 1] = l.y;
        emitPos[ne * 3 + 2] = Math.max(l.radius, 1);
        const e = EMIT_RADIANCE * l.charge;
        emitColour[ne * 3] = l.colour[0] * e;
        emitColour[ne * 3 + 1] = l.colour[1] * e;
        emitColour[ne * 3 + 2] = l.colour[2] * e;
        ne++;
      }
      gl.uniform1i(u.uEmitCount!, ne);
      gl.uniform3fv(u.uEmitPos!, emitPos);
      gl.uniform3fv(u.uEmitColour!, emitColour);
      gl.uniform3fv(u.uLightPos!, lightPos);
      gl.uniform3fv(u.uLightColour!, lightColour);
      gl.uniform1fv(u.uLightRadius!, lightRadius);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(composePos);
      gl.vertexAttribPointer(composePos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(composePos);
      blitAll(canvas, layer);
      if ((process.env.NODE_ENV !== "production")) {
        const w = window as unknown as { __waterFrames?: number };
        w.__waterFrames = (w.__waterFrames ?? 0) + 1;
      }
      endPass();
    };

    let lastLights = "";
    let lastClear = "";
    const task = addTask("water", ORDER.passes, (_now, dtMs) => {
      // The motion rig (dev only) may fix each frame's step, so a clip plays at true speed however slowly software GL draws.
      // With __waterSteps it takes only that many steps, then holds still until given more: one step per frame of a clip.
      let fixedDt = 0;
      if ((process.env.NODE_ENV !== "production")) {
        const w = window as unknown as { __waterDt?: number; __waterSteps?: number };
        fixedDt = Number(w.__waterDt ?? 0);
        if (fixedDt > 0 && typeof w.__waterSteps === "number") {
          if (w.__waterSteps > 0) w.__waterSteps -= 1;
          else fixedDt = 1e-6;
        }
      }
      const dt = fixedDt > 0 ? fixedDt : Math.min(dtMs / 1000, 0.25);
      /*
       * The rigs (dev only) may run the weather faster than the clock (software
       * GL draws a frame every few seconds): that many steps of the sim and its
       * maps per frame, each at a real frame's length, the picture once.
       */
      const speed = (process.env.NODE_ENV !== "production")
        ? Math.max(
            1,
            Math.round(Number((window as unknown as { __waterSpeed?: number }).__waterSpeed ?? 1)),
          )
        : 1;
      // How strongly the glass beads the rain: the drops' contact angle ("Beading").
      setWaterBeading(t("rainBeading"));
      for (const s of sims.values()) s.rivuletDry = 1 / Math.max(0.5, t("rainStreamDrain"));
      const vh = document.documentElement.clientHeight || window.innerHeight;
      // Rain: drops per second per square centimetre of glass, the rain type's times "Rain".
      const type = rainType(t("rainType"));
      const rain = type.rate * t("rainStrength");
      const fogging = t("fogAmount") > 0;
      let busy = rain > 0 || fogging;
      const lightsNow =
        pointLights()
          .filter((l) => !l.below && l.charge > 0.002)
          .map((l) => `${Math.round(l.x)},${Math.round(l.y)},${l.charge.toFixed(2)}`)
          .join(";") +
        (graze.on ? `|g${Math.round(graze.x)},${Math.round(graze.y)},${graze.dx.toFixed(3)}` : "") +
        `|b${t("backlight")},${t("backlightEdge")},${t("backlightSize")}`;
      const lightsMoved = lightsNow !== lastLights;
      lastLights = lightsNow;
      const clearNow = `${t("rainFace")},${t("fogAmount")},${t("fogSide")}`;
      const faceChanged = clearNow !== lastClear;
      lastClear = clearNow;
      for (const pane of glassGeometry()) {
        if (pane.y + pane.h < 0 || pane.y > vh || pane.w < 40 || pane.h < 40) continue;
        // A button made of a pane of glass is a control, not a window: no rain on it.
        if (pane.el.classList.contains("glass-button")) continue;
        // A drop shows the photograph behind its pane; a pane with none (the header bar) gets no rain yet.
        if (!pane.src) continue;
        const sim = simFor(pane);
        const st = stateFor(pane, sim);
        const areaCm2 = (sim.width * sim.height) / 100;
        applyWind(sim);
        // The rain reaching the glass comes and goes with the wind (Sim.rainRate).
        const rainHere = rain * sim.rainRate(t("windRainFollows"));
        for (let rep = 1; rep < speed; rep++) {
          const sdt = 1 / 30;
          const want = rainHere * areaCm2 * sdt;
          let n = Math.floor(want);
          if (random() < want - n) n++;
          for (let q = 0; q < n; q++) land(sim, st, rainVolume(random(), random(), type.median));
          setTrailShares(sim);
          sim.step(sdt);
          drawPane(pane, sim, st, sdt, true);
        }
        const expected = rainHere * areaCm2 * dt;
        let spawn = Math.floor(expected);
        if (random() < expected - spawn) spawn++;
        for (let q = 0; q < spawn; q++) {
          land(sim, st, rainVolume(random(), random(), type.median));
        }
        setTrailShares(sim);
        // Drizzle between the drops.
        const dz = expected * type.droplets * t("dropletScale");
        let nz = Math.floor(dz);
        if (random() < dz - nz) nz++;
        if (nz) drizzle(sim, st, nz);
        // The rain falling outside: as hard as the rain type falls (not the share the glass catches).
        if (drawRainfall(pane, sim, dt, rain)) busy = true;
        // In a wind the drops shiver: drawn every frame while it blows.
        const shivering = t("windWobble") > 0 && sim.windMph > 3;
        const moved =
          sim.step(dt) ||
          spawn > 0 ||
          st.pending.length > 0 ||
          fogging ||
          shivering ||
          filmFor(sim) !== null;
        if (moved) busy = true;
        if (
          moved ||
          lightsMoved ||
          faceChanged ||
          st.fresh ||
          !layers.has(pane.el) ||
          typeStale(pane, st.w / pane.w)
        ) {
          st.fresh = false;
          drawPane(pane, sim, st, dt);
        }
      }
      /*
       * The light through the drops onto the print (rain W2): for the
       * cursor lamp while it burns, redrawn whenever the drops or the lamp
       * moved. The floor light reads the map it publishes.
       */
      // The cursor lamp if it burns, else the brightest light that does (the drop page's glow).
      const lit = pointLights().filter((l) => !l.below && !l.span && l.charge > 0.002);
      const lamp =
        lit.find((l) => l.id === "cursor") ??
        lit.reduce<(typeof lit)[number] | undefined>(
          (best, l) => (!best || l.charge * l.gain > best.charge * best.gain ? l : best),
          undefined,
        );
      if (lamp && sims.size > 0) {
        const vwNow = document.documentElement.clientWidth || window.innerWidth;
        drawLensMap(vwNow, vh, lamp);
      } else if (lensFrame > 0) {
        publishLensMap(null);
        lensFrame = 0;
      }
      if (!busy) {
        // Nothing runs: evaporation still goes on, slowly (water-drops 6.1: 4 Hz is plenty).
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => task.wake(), 250);
      }
      return busy;
    });
    /*
     * The spray bottle (task 76): a squeeze aimed at a page point lands on
     * whatever panes its cone covers (effects/water/spray): into the drops
     * it hits, as droplets where it does not, and the sim's mist beads into
     * drops where enough gathers; slime lands as gobs.
     */
    const stopSpray = onSpray((x, y, liquid) => {
      const parcels = squeeze(liquid, random);
      for (const pane of glassGeometry()) {
        if (!pane.src) continue;
        const sim = simFor(pane);
        const st = stateFor(pane, sim);
        const l = LIQUIDS[liquid] ?? WATER;
        for (const p of parcels) {
          const px = x + p.dx * PX_PER_MM - pane.x;
          const py = y + p.dy * PX_PER_MM - pane.y;
          if (px < 0 || py < 0 || px >= pane.w || py >= pane.h) continue;
          const mx = px / PX_PER_MM;
          const my = py / PX_PER_MM;
          if (p.gob) {
            sim.addVolume(mx, my, p.volume, liquid);
          } else if (!sim.deposit(mx, my, p.volume, liquid)) {
            // A droplet of the volume it carries, at the liquid's resting angle.
            const a = radiusFor(p.volume, (l.thetaA + l.thetaR) / 2);
            st.pending.push({ x: mx, y: my, a: Math.min(a, 0.6), liquid, seed: random() * 1000 });
          }
        }
      }
      task.wake();
    });
    /*
     * The eye dropper (effects/water/drip): a drop of water falls on the
     * pane under the pointer, as rain of that size lands, and the sim takes
     * it from there -- it beads, merges, lets go and runs.
     */
    const stopDrip = onDrip((x, y, volume) => {
      for (const pane of glassGeometry()) {
        if (!pane.src) continue;
        const px = x - pane.x;
        const py = y - pane.y;
        if (px < 0 || py < 0 || px >= pane.w || py >= pane.h) continue;
        const sim = simFor(pane);
        stateFor(pane, sim);
        const film = filmFor(sim);
        if (film) film.addDrop(px / PX_PER_MM, py / PX_PER_MM, volume);
        else sim.addVolume(px / PX_PER_MM, py / PX_PER_MM, volume, WATER.id);
        break;
      }
      task.wake();
    });
    const wake = () => task.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    task.wake();

    const stopLoss = onSharedGlLoss(
      () => task.stop(),
      () => {},
    );
    return () => {
      window.clearInterval(maskTimer);
      stopSpray();
      stopDrip();
      task.stop();
      stopLoss();
      publishLensMap(null);
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      for (const layer of layers.values()) layer.remove();
      photoTex.dispose();
      roomTex.dispose();
      for (const st of states.values()) {
        gl.deleteTexture(st.droplets);
        gl.deleteFramebuffer(st.dropletFbo);
        gl.deleteTexture(st.wet);
        gl.deleteFramebuffer(st.wetFbo);
        gl.deleteTexture(st.fog);
        gl.deleteFramebuffer(st.fogFbo);
      }
      if (drops) {
        gl.deleteTexture(drops.tex);
        gl.deleteFramebuffer(drops.fbo);
      }
      gl.deleteBuffer(quadBuffer);
      gl.deleteBuffer(triangle);
    };
  }, []);
  return null;
}
