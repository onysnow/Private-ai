import { useEffect, useRef } from "react";
import {
  fracture,
  inside,
  type Crack,
  type GlassKind,
  type Pt,
  type Shard,
} from "@fx/effects/optics/fracture";
import { photoBreak, placementFor, type Placement } from "@fx/effects/optics/crack-photo";
import { loadCrackPhoto, type LoadedCrackPhoto } from "@fx/effects/optics/crack-photo-loader";
import { crackPhotoFor } from "@fx/lib/crack-photos";
import {
  loadEntry,
  pickEntry,
  placeBreak,
  type BreakEntry,
  type LibraryIndex,
} from "@fx/effects/optics/fracture-library";
import { loadShard, shardOutline, shardsFor } from "@fx/lib/glass-shards";
import { cursorLamp, onLightChange, pointLights } from "@fx/effects/light/lights";
// Glass's index: a crack face seen through the pane lies at 1/n of its depth.
import { N_GLASS, crackGlow, type CrackLightSource } from "@fx/effects/optics/crack-light";
import { faceLean, faceNormal, faceRoom, type RoomSampler } from "@fx/effects/optics/crack-face";
import { EDGES, edgeAt, sideTrace, type Edge } from "@fx/effects/optics/crack-side";
import { decodeRadiance, kneeRadiance, ROOM_KNEE, roomUvDir } from "@fx/effects/optics/environment";
import { roomLight } from "@fx/effects/light/lights";
import { glassGeometry, viewState } from "@fx/effects/scene/scene";
import { sharedGl } from "@fx/effects/engine/gl";
import { photoTextures } from "@fx/effects/engine/photo-texture";
import { paneLook } from "@fx/effects/engine/pane-look";
import { roomTexture } from "@fx/effects/engine/room-texture";
import { crackView, type CrackView } from "@fx/effects/optics/crack-view";
import { riserLit, riserSeen, stepAt, stepShadow } from "@fx/effects/optics/crack-step";
import { PART_DEPTH } from "@fx/effects/optics/crack-field";
import { onTuningApplied, t as knob } from "@fx/lib/tuning";
import { camera } from "@fx/effects/camera/camera";
import { previewing } from "@fx/effects/engine/preview";
import { adoptLayer } from "@fx/effects/engine/compositor";
import { clearShardMap, paintShardMap, setShardMap } from "@fx/effects/optics/shard-map";

/** The frost the panes' backdrop is blurred by, px (styles.css .glass: blur(30px)). */
const FROST_BLUR = 30;
/** The room as a riser mirrors it with no lamp on it: a dim glass-grey (the room's mean, by eye). */
const ROOM_RISER = [0.42, 0.5, 0.5] as const;
/** How far past the pane the frosted copy reaches, px: room for the shards' slip. */
const MARGIN = 24;
/** The pane's thickness, px: a crack face is this tall. */
const THICKNESS = 18;

/** The sharpest image under a point of the page. */
function photoUnder(el: HTMLElement, x: number, y: number): HTMLImageElement | null {
  for (let node: HTMLElement | null = el.parentElement; node; node = node.parentElement) {
    let best: HTMLImageElement | null = null;
    for (const img of node.querySelectorAll("img")) {
      const r = img.getBoundingClientRect();
      const over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (over && img.naturalWidth > (best?.naturalWidth ?? 0)) best = img;
    }
    if (best) return best;
  }
  return null;
}

/** A repeatable number in [0, 1) for a crack and a use. */
function hash(k: number, n: number): number {
  const x = Math.sin(k * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * One stroke that adds `tint` at `amount` and the lights' `glow` at
 * `share`, as a colour for the "lighter" blend (which adds colour times
 * alpha); null if it adds nothing.
 */
function additive(
  tint: readonly [number, number, number],
  amount: number,
  glow: readonly [number, number, number],
  share: number,
): string | null {
  const add = [0, 1, 2].map((i) => tint[i]! * amount + glow[i]! * share);
  const peak = Math.max(add[0]!, add[1]!, add[2]!);
  if (peak < 0.004) return null;
  const alpha = Math.min(1, peak);
  const [r, g, b] = add.map((v) => Math.round(Math.min(255, (v / peak) * 255)));
  return `rgb(${r} ${g} ${b} / ${alpha.toFixed(3)})`;
}

/** The glass's own green, seen through the depth of a crack face (sRGB). */
const FACE_TINT = [168, 228, 214] as const;

/**
 * The room the glass reflects (html[data-room-hdr], the same panorama the
 * glass shader samples), read once into memory so a crack face can be asked
 * what it mirrors in any direction (effects/optics/crack-face).
 */
let roomPixels: { w: number; h: number; data: Uint8ClampedArray } | null = null;
let roomLoading = "";
/**
 * Where a photographed break's crack mask crosses the pane's border: the
 * middle of each run of crack along a strip two device pixels deep inside
 * each edge, pane px.
 */
function borderCrossings(
  mc: CanvasRenderingContext2D,
  pw: number,
  ph: number,
  dpr: number,
): { at: Pt; edge: Edge }[] {
  const out: { at: Pt; edge: Edge }[] = [];
  const scan = (edge: Edge, x: number, y: number, sw: number, sh: number, along: "x" | "y") => {
    if (sw < 1 || sh < 1) return;
    const a = mc.getImageData(x, y, sw, sh).data;
    const n = along === "x" ? sw : sh;
    let start = -1;
    for (let i = 0; i <= n; i++) {
      let hit = false;
      if (i < n) {
        const m = along === "x" ? sh : sw;
        for (let j = 0; j < m && !hit; j++) {
          const k = along === "x" ? (j * sw + i) * 4 : (i * sw + j) * 4;
          hit = a[k + 3]! > 60;
        }
      }
      if (hit && start < 0) start = i;
      if (!hit && start >= 0) {
        const mid = (start + i - 1) / 2 / dpr;
        const at =
          edge === "left"
            ? { x: 0, y: mid }
            : edge === "right"
              ? { x: pw / dpr, y: mid }
              : edge === "top"
                ? { x: mid, y: 0 }
                : { x: mid, y: ph / dpr };
        out.push({ at, edge });
        start = -1;
      }
    }
  };
  scan("top", 0, 0, pw, 2, "x");
  scan("bottom", 0, ph - 2, pw, 2, "x");
  scan("left", 0, 0, 2, ph, "y");
  scan("right", pw - 2, 0, 2, ph, "y");
  return out;
}

function roomSampler(onLoad: () => void): RoomSampler | null {
  const src = document.documentElement.getAttribute("data-room-hdr");
  if (src && roomLoading !== src) {
    roomLoading = src;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 64;
      const cx = c.getContext("2d", { willReadFrequently: true });
      if (!cx) return;
      // Softened as a fracture face's ripples and hackle soften what it mirrors.
      cx.filter = "blur(2px)";
      cx.drawImage(img, 0, 0, c.width, c.height);
      roomPixels = { w: c.width, h: c.height, data: cx.getImageData(0, 0, c.width, c.height).data };
      onLoad();
    };
    img.src = src;
  }
  const px = roomPixels;
  if (!px) return null;
  return (dir) => {
    const [u, v] = roomUvDir(dir.x, dir.y, dir.z);
    const x = Math.min(px.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * px.w)));
    const y = Math.min(px.h - 1, Math.max(0, Math.floor(v * px.h)));
    const k = (y * px.w + x) * 4;
    const g = roomLight.gain;
    return [0, 1, 2].map((i) =>
      kneeRadiance(decodeRadiance(px.data[k + i]! / 255) * g, ROOM_KNEE),
    ) as [number, number, number];
  };
}

type Props = {
  kind?: GlassKind;
  /** How hard it was struck, 0 to 1. */
  energy?: number;
  /** Where, as a fraction of the pane. */
  at?: { x: number; y: number };
  seed?: number;
};

/**
 * A broken pane (item 10, ?try=broken on Lab samples), laid over the pane
 * it breaks. From the fracture research (claude/tools-research.md §2):
 *
 *   the pattern is the glass's (effects/optics/fracture): plain (annealed)
 *     into long radial shards with rings near the impact, laminated into a
 *     spider web;
 *   each shard has knocked a little out of the pane's plane, so what is seen
 *     through it -- the photograph behind, frosted as the pane frosts it --
 *     steps at every crack;
 *   a crack is a thin air gap with two new glass faces standing across the
 *     pane. Light inside the glass meets them past the critical angle, so
 *     they are mirrors: a crack flashes silver where the lamp, the face and
 *     your eye line up, and reads as a dark line where they do not;
 *   the lamp's light piped along the pane escapes at the cracks, so they
 *     glow near the lamp -- and every other light's too, the flash, a
 *     flare, the flashlight's beam where it points, each in its colour
 *     (effects/optics/crack-light);
 *   near the impact the fracture face turns from mirror to frosted mist and
 *     rough hackle -- whiter, wider cracks and a crushed star -- and the
 *     chipped edges split light into colour.
 */
export function BrokenGlass({
  kind = "annealed",
  energy = 0.7,
  at = { x: 0.38, y: 0.42 },
  seed = 1,
}: Props) {
  const view = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = view.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    /*
     * The break: from a photograph of broken glass of this kind when there is
     * one (lib/crack-photos) -- its cracks ARE the cracks, and the shards are
     * the pieces they cut -- otherwise generated (effects/optics/fracture).
     */
    type Piece = Shard & {
      holes?: Pt[][];
      /** A knocked-out piece that is one of the photographed pieces: it, turned, this size. */
      photo?: { img: HTMLImageElement; turn: number; size: number; at: Pt };
    };
    type Break = {
      shards: Piece[];
      cracks: (Crack & { t?: number[] })[];
      impact: Pt;
      crush: number;
      photo?: { loaded: LoadedCrackPhoto; placement: Placement };
      /** A simulated break: when its last crack arrived, microseconds. */
      duration?: number;
    };
    let broken: Break | null = null;
    let brokeFor = "";
    let photo: LoadedCrackPhoto | null = null;
    let disposed = false;
    /*
     * The simulated library (broken glass B1, ?try=breaklib;
     * effects/optics/fracture-library): a real break of this glass's kind,
     * placed at the strike. Fetched on the first strike; until it arrives
     * the generated break stands in.
     */
    let entry: BreakEntry | null = null;
    if (previewing("breaklib")) {
      void fetch("/breaks/index.json")
        .then((r) => (r.ok ? (r.json() as Promise<LibraryIndex>) : null))
        .then((index) => {
          const name = index ? pickEntry(index, kind, seed) : null;
          return name ? loadEntry(name) : null;
        })
        .then((loaded) => {
          if (disposed || !loaded) return;
          entry = loaded;
          brokeFor = "";
          wake();
        })
        .catch(() => {});
    }
    /** The cracks run slowed: real cracks cross a pane in a few hundred microseconds. */
    const SLOW_MOTION = 1500;
    /*
     * Ony's photographed pieces: every piece of this break wears a different
     * one, and the pieces knocked out fall as them (lib/glass-shards).
     */
    const shardPhotos: HTMLImageElement[] = [];
    for (const url of shardsFor(seed, 12)) {
      void loadShard(url).then((img) => {
        if (disposed || !img) return;
        shardPhotos.push(img);
        wake();
      });
    }
    const struckAt = performance.now();
    /** How long the knocked-out pieces take to fall out of sight, ms. */
    const FALL_MS = 1100;
    /** A piece's box, for laying a photograph over it. */
    const boxOf = (poly: readonly Pt[]) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of poly) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    /**
     * A shard photograph's glass laid over a piece: its middle (its dust,
     * chips and inner cracks -- not its own outline), turned and scaled to
     * cover the piece. Drawn "screen", so only its light adds.
     */
    const wearGlass = (
      img: HTMLImageElement,
      box: ReturnType<typeof boxOf>,
      k: number,
      alpha: number,
    ) => {
      const side = Math.max(box.w, box.h) * 1.5 + 8;
      const sw = img.naturalWidth * 0.55;
      const sh = img.naturalHeight * 0.55;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = "screen";
      ctx.translate(box.cx, box.cy);
      ctx.rotate(hash(seed, 900 + k) * Math.PI * 2);
      ctx.drawImage(
        img,
        (img.naturalWidth - sw) / 2,
        (img.naturalHeight - sh) / 2,
        sw,
        sh,
        -side / 2,
        -side / 2,
        side,
        side,
      );
      ctx.restore();
    };
    const photoUrl = crackPhotoFor(kind, seed);
    if (photoUrl) {
      void loadCrackPhoto(photoUrl).then((loaded) => {
        if (disposed || !loaded) return;
        photo = loaded;
        brokeFor = "";
        wake();
      });
    }
    let frame = 0;
    // The pane this break is laid over, and its pieces for the glass shader (step 3b).
    const pane = canvas.parentElement?.closest<HTMLElement>(".glass") ?? null;
    /*
     * With step 3b the break is the glass, so it goes in the pane's own slot
     * for it, under the light on the glass -- the room it reflects, the lamp,
     * the grime -- which it used to cover (effects/engine/compositor).
     */
    if (pane && previewing("shardlight")) adoptLayer(pane, "pane:broken", canvas);
    const shardMap = document.createElement("canvas");
    /*
     * The crack-face view pass (broken glass B2, ?try=breaklib;
     * effects/optics/crack-view): the faces drawn per pixel as what the
     * eye's ray meets inside the glass, so the picture folds at each crack.
     * The ribbons below stand in where there is no WebGL.
     */
    let faces: CrackView | null = null;
    let facesPhotos: ReturnType<typeof photoTextures> | null = null;
    let facesRoom: ReturnType<typeof roomTexture> | null = null;
    if (previewing("breaklib")) {
      const s = sharedGl();
      if (s) {
        facesPhotos = photoTextures(s.gl, () => wake());
        facesRoom = roomTexture(s.gl, () => wake());
        faces = crackView(facesPhotos, facesRoom, kind);
      }
    }
    let facesFor = "";
    // A photographed break's crack shape, as shade and as the light on it.
    const maskShade = document.createElement("canvas");
    const maskLight = document.createElement("canvas");
    // The frosted photograph, cached: blurring is the costly part.
    const frost = document.createElement("canvas");
    let frostFor = "";
    // Where a photographed break's cracks cross the pane's border (step 4), found once per placement.
    let crossings: { at: Pt; edge: Edge }[] = [];
    let crossFor = "";

    /*
     * Which piece lies either side of each crack segment, found once per
     * break (point-in-polygon a hair across the line each way), for the
     * steps the pieces' different heights make at the cracks (effects/optics/crack-step).
     */
    let sidesFor = "";
    let sides = new Map<string, [number, number]>();
    const liftsAt = (ck: number, i: number, mx: number, my: number, nx: number, ny: number) => {
      const k = `${ck}:${i}`;
      let v = sides.get(k);
      // A crack that does not go through the pane leaves the two sides one piece: no step.
      const face = (broken!.cracks[ck] as { face?: string } | undefined)?.face;
      if (face && face !== "both") return [0, 0] as [number, number];
      if (!v) {
        const find = (sx: number) => {
          const q = { x: mx + nx * sx, y: my + ny * sx };
          for (const sh of broken!.shards) if (!sh.missing && inside(sh.poly, q)) return sh.lift;
          return 0;
        };
        v = [find(-1.5), find(1.5)];
        sides.set(k, v);
      }
      return v;
    };

    const draw = () => {
      frame = 0;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w < 2 || h < 2) return;
      const key = `${Math.round(w)}x${Math.round(h)}`;
      const breakKey = `${key}|${entry ? "library" : photo ? "photo" : "made"}|${shardPhotos.length ? "glass" : ""}|d${knob("pieceDisplacement")}`;
      if (breakKey !== brokeFor) {
        const struck = { x: at.x * w, y: at.y * h };
        // The pane's own causes for the pieces: how unevenly they may sit, as a share of its thickness.
        const geomNow = pane ? glassGeometry().find((g) => g.el === pane) : undefined;
        const causes = {
          displacement: knob("pieceDisplacement"),
          thickness: geomNow?.causes.thickness ?? THICKNESS,
        };
        if (entry) {
          broken = placeBreak(entry, { w, h, at: struck, energy, kind, seed, ...causes });
        } else if (photo) {
          // Turned a different way strike by strike, so one photograph never repeats exactly.
          const placement = placementFor(
            photo.map,
            { w, h, at: struck },
            energy,
            hash(seed, 77) * Math.PI * 2,
          );
          const pb = photoBreak(
            photo.map,
            photo.regions,
            placement,
            seed,
            kind === "annealed" ? energy : 0,
            { kind, energy, ...causes },
          );
          const shards: Piece[] = [...pb.shards];
          /*
           * A full swing knocks a piece clean out. The photographed star
           * breaks have few closed pieces to lose, so the piece that goes is
           * one of Ony's photographed pieces itself: its outline is the hole,
           * and it is what falls.
           */
          const piece = shardPhotos[0];
          if (kind === "annealed" && energy > 0.8 && piece) {
            const outline = shardOutline(piece);
            if (outline.length >= 3) {
              const size = Math.min(w, h) * (0.12 + 0.5 * (energy - 0.8));
              const turn = hash(seed, 55) * Math.PI * 2;
              const c = Math.cos(turn);
              const sn = Math.sin(turn);
              shards.push({
                poly: outline.map((q) => ({
                  x: struck.x + (c * q.x - sn * q.y) * size,
                  y: struck.y + (sn * q.x + c * q.y) * size,
                })),
                tiltX: 0,
                tiltY: 0,
                lift: 0,
                slip: { x: 0, y: 0 },
                reach: 0,
                missing: true,
                photo: { img: piece, turn, size, at: struck },
              });
            }
          }
          broken = {
            shards,
            cracks: pb.cracks,
            impact: struck,
            crush: 0,
            photo: { loaded: photo, placement },
          };
        } else {
          broken = fracture({ w, h, at: struck, energy, kind, seed, ...causes });
        }
        brokeFor = breakKey;
        if (sidesFor !== breakKey) {
          sides = new Map();
          sidesFor = breakKey;
        }
        /*
         * Step 3b (?try=shardlight): the pieces go to the glass shader, which
         * draws the room each one reflects at its own slope.
         */
        if (pane && previewing("shardlight")) {
          shardMap.width = Math.round(w);
          shardMap.height = Math.round(h);
          const mc = shardMap.getContext("2d");
          if (mc && broken) {
            paintShardMap(mc, broken.shards, shardMap.width, shardMap.height);
            setShardMap(pane, shardMap);
          }
        }
      }
      if (!broken) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (faces && facesFor !== `${brokeFor}|${dpr}`) {
        faces.bake(broken, w, h, dpr, broken.crush * 4 + 10);
        facesFor = `${brokeFor}|${dpr}`;
      }
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Where the viewer is, in the pane's px: the parallax of the pieces' heights and the crack faces' slant.
      const eye = {
        x: document.documentElement.clientWidth / 2 + viewState.eyeX - rect.left,
        y: document.documentElement.clientHeight / 2 + viewState.eyeY - rect.top,
        z: camera.distance(document.documentElement.clientWidth),
      };
      // ---- The stepped view: each shard shows the frosted photograph from where it now lies. ----
      const img = photoUnder(canvas, rect.left + w / 2, rect.top + h / 2);
      if (img && img.complete && img.naturalWidth > 0) {
        const r = img.getBoundingClientRect();
        // object-fit: cover, centred: which part of the file is drawn where.
        const ia = img.naturalWidth / Math.max(img.naturalHeight, 1);
        const ea = r.width / Math.max(r.height, 1);
        const sw = ia > ea ? img.naturalHeight * ea : img.naturalWidth;
        const sh = ia > ea ? img.naturalHeight : img.naturalWidth / ea;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        const ox = r.left - rect.left;
        const oy = r.top - rect.top;
        // The frosted photograph, blurred once per place and size, not once per shard.
        const fkey = `${img.currentSrc}|${Math.round(ox)}|${Math.round(oy)}|${key}|${dpr}`;
        if (fkey !== frostFor) {
          frost.width = Math.round((w + 2 * MARGIN) * dpr);
          frost.height = Math.round((h + 2 * MARGIN) * dpr);
          const fc = frost.getContext("2d")!;
          fc.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr);
          fc.filter = `blur(${FROST_BLUR * 0.6}px)`;
          fc.drawImage(img, sx, sy, sw, sh, ox, oy, r.width, r.height);
          fc.filter = "none";
          frostFor = fkey;
        }
        const path = (s: { poly: readonly Pt[]; holes?: readonly (readonly Pt[])[] }) => {
          ctx.beginPath();
          for (const loop of [s.poly, ...(s.holes ?? [])]) {
            loop.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
          }
        };
        /*
         * The glass that did not break (past a photographed break's reach)
         * seen the same way as the pieces, unmoved, so the break has no edge
         * of its own where the pieces stop.
         */
        ctx.drawImage(frost, -MARGIN, -MARGIN, w + 2 * MARGIN, h + 2 * MARGIN);
        ctx.fillStyle = "rgb(255 255 255 / 0.06)";
        ctx.fillRect(0, 0, w, h);
        for (const s of broken.shards) {
          ctx.save();
          path(s);
          // A photographed piece can wrap round a smaller one: its holes are not its glass.
          ctx.clip("evenodd");
          if (s.missing) {
            // A hole: the photograph behind, seen with no glass in the way.
            ctx.drawImage(img, sx, sy, sw, sh, ox, oy, r.width, r.height);
          } else {
            /*
             * Tilted, the shard sees the photograph behind shifted by the gap
             * times the slope (about the pane's own gap to the photograph, a
             * few dozen px), and slipped by its slip.
             */
            const gap = 70;
            /*
             * A piece standing proud is nearer the eye: in perspective it
             * (and what it shows) sits further out from the point under the
             * eye by its height times the sight line's slope. A few tenths
             * of a px here; the step it makes at its cracks is drawn below.
             */
            const b = boxOf(s.poly);
            const px = (s.lift * (b.cx - eye.x)) / Math.max(eye.z, 1);
            const py = (s.lift * (b.cy - eye.y)) / Math.max(eye.z, 1);
            const dx = s.slip.x + Math.tan(s.tiltY) * gap + px;
            const dy = s.slip.y + Math.tan(s.tiltX) * gap + py;
            ctx.drawImage(frost, -MARGIN + dx, -MARGIN + dy, w + 2 * MARGIN, h + 2 * MARGIN);
            // The pane's own frosting over it, as the pane has.
            ctx.fillStyle = "rgb(255 255 255 / 0.06)";
            ctx.fillRect(0, 0, w, h);
            // And its own glass: one of the photographed pieces, a different one each.
            if (shardPhotos.length) {
              const k = broken.shards.indexOf(s);
              wearGlass(shardPhotos[k % shardPhotos.length]!, boxOf(s.poly), k, 0.55);
            }
          }
          ctx.restore();
        }
      }

      // ---- The crack faces, per pixel (B2): where the eye's ray meets a face, the picture folds. ----
      if (faces) {
        const geom = pane ? (glassGeometry().find((g) => g.el === pane) ?? null) : null;
        const lamps = pointLights()
          .filter((l) => l.charge > 0.002)
          .map((l) => ({
            x: l.x,
            y: l.y,
            z: l.height,
            colour: [l.colour[0] * l.charge, l.colour[1] * l.charge, l.colour[2] * l.charge] as [
              number,
              number,
              number,
            ],
          }));
        faces.draw(ctx, {
          w,
          h,
          scale: dpr,
          left: rect.left,
          top: rect.top,
          pane: geom,
          look: pane ? paneLook(pane) : { saturate: 1, fill: [0, 0, 0, 0], blur: 0 },
          thickness: geom?.causes.thickness ?? THICKNESS,
          gap: geom?.causes.gap ?? 70,
          ior: geom?.causes.material.ior ?? N_GLASS,
          frostBlur: (geom?.causes.material.frost ?? 1) > 0 ? FROST_BLUR * 0.6 : 0,
          eye: {
            x: document.documentElement.clientWidth / 2 + viewState.eyeX,
            y: document.documentElement.clientHeight / 2 + viewState.eyeY,
            z: camera.distance(document.documentElement.clientWidth),
          },
          arrivedUs: broken.duration
            ? ((performance.now() - struckAt) * 1000) / SLOW_MOTION
            : Infinity,
          lights: lamps,
          roomExposure: roomLight.gain,
        });
      }

      // ---- The crushed spot: pulverised glass, white, crazed with tiny cracks. ----
      const ix = broken.impact.x;
      const iy = broken.impact.y;
      const crushed = broken.shards.find((s) => s.crushed);
      if (crushed && !crushed.missing) {
        ctx.save();
        ctx.beginPath();
        crushed.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.clip();
        const cr = broken.crush * 1.3;
        const spot = ctx.createRadialGradient(ix, iy, 0, ix, iy, cr);
        // Pulverised glass scatters: pale, but no paint-white disc (Ony: cracks are glass).
        spot.addColorStop(0, "rgb(236 244 242 / 0.5)");
        spot.addColorStop(0.7, "rgb(214 232 228 / 0.22)");
        // Fading to nothing: a simulated break has no crushed-rim crack to clip it to the spot.
        spot.addColorStop(1, "rgb(214 232 228 / 0)");
        ctx.fillStyle = spot;
        ctx.fillRect(ix - cr, iy - cr, cr * 2, cr * 2);
        // Crazing: short cracks every way, and little arcs where flakes spalled.
        ctx.lineWidth = 0.5;
        for (let k = 0; k < 90; k++) {
          const a = hash(seed, 1000 + k) * Math.PI * 2;
          const r0 = broken.crush * hash(seed, 2000 + k);
          const len = 1.5 + 5 * hash(seed, 3000 + k);
          const x0 = ix + r0 * Math.cos(a);
          const y0 = iy + r0 * Math.sin(a);
          const b2 = a + (hash(seed, 4000 + k) - 0.5) * 2.4;
          ctx.strokeStyle = k % 3 ? "rgb(255 255 255 / 0.3)" : "rgb(40 60 60 / 0.35)";
          ctx.beginPath();
          if (k % 5 === 0) {
            ctx.arc(x0, y0, len, b2, b2 + 1.6);
          } else {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + len * Math.cos(b2), y0 + len * Math.sin(b2));
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      /*
       * Round the crushed spot, the hackle: dozens of fine radial cracks too
       * short to cut anything off, fading as they run out (the white burst at
       * the heart of every impact photograph).
       */
      if (!crushed?.missing && broken.crush > 0) {
        ctx.globalCompositeOperation = "lighter";
        const n = Math.round(30 + 50 * energy);
        for (let k = 0; k < n; k++) {
          const a = hash(seed, 5000 + k) * Math.PI * 2;
          const r0 = broken.crush * (0.7 + 0.3 * hash(seed, 6000 + k));
          const r1 = broken.crush * (1.4 + 2.2 * hash(seed, 7000 + k) ** 2);
          const bend = (hash(seed, 8000 + k) - 0.5) * 0.12;
          const g = ctx.createLinearGradient(
            ix + r0 * Math.cos(a),
            iy + r0 * Math.sin(a),
            ix + r1 * Math.cos(a + bend),
            iy + r1 * Math.sin(a + bend),
          );
          g.addColorStop(0, "rgb(230 246 242 / 0.3)");
          g.addColorStop(1, "rgb(168 228 214 / 0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(ix + r0 * Math.cos(a), iy + r0 * Math.sin(a));
          ctx.lineTo(ix + r1 * Math.cos(a + bend), iy + r1 * Math.sin(a + bend));
          ctx.stroke();
        }
        // The burst's glow: light scattered by the crazed glass, soft past the rim.
        const halo = ctx.createRadialGradient(ix, iy, broken.crush * 0.6, ix, iy, broken.crush * 3);
        halo.addColorStop(0, "rgb(220 240 236 / 0.14)");
        halo.addColorStop(1, "rgb(220 240 236 / 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(
          ix - broken.crush * 3,
          iy - broken.crush * 3,
          broken.crush * 6,
          broken.crush * 6,
        );
        ctx.globalCompositeOperation = "source-over";
      }

      // ---- The cracks: each a fracture face seen through the glass. ----
      // Every light in the scene, as the crack sees it: in the pane's pixels, against the lamp.
      const reference = Math.max(cursorLamp.gain, 1e-6);
      const sources: CrackLightSource[] = pointLights().map((l) => ({
        at: { x: l.x - rect.left, y: l.y - rect.top, z: l.height },
        colour: l.colour,
        strength: l.gain / reference,
        radiance: l.gain,
        charge: l.charge,
        aim: l.aim,
      }));
      // The lights over the pane: only those can shadow a step or light its riser (a photograph's own glow is under the glass).
      const overhead = pointLights()
        .filter((l) => !l.below)
        .map((l) => ({
          at: { x: l.x - rect.left, y: l.y - rect.top, z: l.height },
          colour: l.colour,
          strength: l.gain / reference,
          charge: l.charge,
          radius: l.radius,
        }));
      const depth = THICKNESS / N_GLASS;
      const roughReach = broken.crush * 4 + 10;
      const room = roomSampler(wake);
      /*
       * ---- Down the side faces (step 4) ----
       *
       * A crack that reaches the edge cuts the side face too, from the front
       * arris to the back one, slanting along the edge by the thickness times
       * the tangent of its lean (effects/optics/crack-side). On the side --
       * the long path through the glass that shows its green -- the gap is a
       * dark line, and the light piped along the pane, brightest there,
       * leaves through it as a bright one beside it.
       */
      const drawSide = (at: Pt, edge: Edge, across: Pt, lean: number, rough: number) => {
        const fn = faceNormal(across, lean);
        const tr = sideTrace(at, edge, fn, THICKNESS, eye);
        if (!tr || Math.hypot(tr.back.x - tr.front.x, tr.back.y - tr.front.y) < 0.4) return;
        const { rgb: glow } = crackGlow(sources, at, fn, eye, rough);
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "rgb(10 16 16 / 0.6)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(tr.front.x, tr.front.y);
        ctx.lineTo(tr.back.x, tr.back.y);
        ctx.stroke();
        const lit = additive([0.04, 0.06, 0.055], 1, glow, 1.6);
        if (!lit) return;
        // The bright line a hair along the edge, on the side the face leans to.
        const out = EDGES[edge];
        const ax = -out.y;
        const ay = out.x;
        const side =
          Math.sign(tr.shift ? (tr.back.x - tr.front.x) * ax + (tr.back.y - tr.front.y) * ay : 1) ||
          1;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = lit;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(tr.front.x + ax * 0.8 * side, tr.front.y + ay * 0.8 * side);
        ctx.lineTo(tr.back.x + ax * 0.8 * side, tr.back.y + ay * 0.8 * side);
        ctx.stroke();
      };

      if (broken.photo) {
        /*
         * ---- A photographed break's cracks, as glass ----
         *
         * The photograph says WHERE the cracks are (its crack strength, the
         * layer's alpha), not how they look: photographed, they are white
         * lines lit by someone else's light (Ony, 2026-10-01: they "look
         * terrible"; cracks are glass, hard to see until light hits them).
         * So only its shape is used: a hairline of shade where the gap turns
         * the light from behind away, and the light that reaches the faces
         * here -- the room's, a few per cent, and each lamp's, piped along
         * the pane to the gap and flashing where it is close
         * (effects/optics/crack-light) -- in the lamp's own colour.
         */
        const { loaded, placement } = broken.photo;
        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);
        for (const c of [maskShade, maskLight]) {
          if (c.width !== pw) c.width = pw;
          if (c.height !== ph) c.height = ph;
        }
        const placeMask = (mc: CanvasRenderingContext2D) => {
          mc.setTransform(1, 0, 0, 1, 0, 0);
          mc.globalCompositeOperation = "source-over";
          mc.clearRect(0, 0, pw, ph);
          mc.setTransform(dpr, 0, 0, dpr, 0, 0);
          mc.save();
          mc.beginPath();
          mc.rect(0, 0, w, h);
          for (const sh of broken!.shards) {
            if (!sh.missing) continue;
            sh.poly.forEach((q, i) => (i ? mc.lineTo(q.x, q.y) : mc.moveTo(q.x, q.y)));
            mc.closePath();
          }
          mc.clip("evenodd");
          mc.translate(placement.at.x, placement.at.y);
          mc.rotate(placement.turn);
          const k = placement.scale / loaded.layerScale;
          mc.scale(k, k);
          mc.translate(
            -loaded.map.strike.x * loaded.layerScale,
            -loaded.map.strike.y * loaded.layerScale,
          );
          mc.drawImage(loaded.layer, 0, 0);
          mc.restore();
          mc.globalCompositeOperation = "source-in";
        };
        const sc = maskShade.getContext("2d");
        const lc = maskLight.getContext("2d");
        if (sc && lc) {
          placeMask(sc);
          sc.fillStyle = "rgb(10 16 16)";
          sc.fillRect(0, 0, w, h);
          if (crossFor !== brokeFor) {
            crossings = borderCrossings(sc, pw, ph, dpr);
            crossFor = brokeFor;
          }
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 0.42;
          ctx.drawImage(maskShade, 0, 0);
          ctx.restore();
          placeMask(lc);
          // The room's few per cent, glass-green.
          lc.fillStyle = "rgb(168 228 214 / 0.07)";
          lc.fillRect(0, 0, w, h);
          lc.globalCompositeOperation = "source-atop";
          for (const l of sources) {
            const on = l.charge * l.strength;
            if (on <= 0.01) continue;
            const [r, g, b] = l.colour.map((v) => Math.round(Math.min(1, v) * 255));
            // Piped along the pane (crack-light PIPED_REACH), and a flash where the lamp is close over it.
            const piped = lc.createRadialGradient(l.at.x, l.at.y, 0, l.at.x, l.at.y, 520);
            piped.addColorStop(0, `rgb(${r} ${g} ${b} / ${Math.min(1, 0.55 * on).toFixed(3)})`);
            piped.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
            lc.fillStyle = piped;
            lc.fillRect(0, 0, w, h);
            const flash = lc.createRadialGradient(l.at.x, l.at.y, 0, l.at.x, l.at.y, 90);
            flash.addColorStop(0, `rgb(255 255 255 / ${Math.min(1, 0.8 * on).toFixed(3)})`);
            flash.addColorStop(1, "rgb(255 255 255 / 0)");
            lc.fillStyle = flash;
            lc.fillRect(0, 0, w, h);
          }
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(maskLight, 0, 0);
          ctx.restore();
        }
        // Its cracks down the sides: radial where they reach the edge, met square (the photo gives no lean).
        crossings.forEach(({ at: q, edge }, k) => {
          const o = EDGES[edge];
          const rough = Math.exp(-Math.hypot(q.x - ix, q.y - iy) / roughReach);
          drawSide(q, edge, { x: -o.y, y: o.x }, faceLean("radial", 400 + k, 0, rough), rough);
        });
        ctx.globalCompositeOperation = "source-over";
      }
      // How far the simulated cracks have got, microseconds after the strike, slowed.
      const arrivedUs = ((performance.now() - struckAt) * 1000) / SLOW_MOTION;
      let arriving = false;
      broken.cracks.forEach((c: Crack & { t?: number[] }, ck) => {
        if (c.kind === "crush" && crushed?.missing) return;
        let run = 0;
        // Each segment's normal, so a strip beside the crack can mitre its joins with its neighbours.
        const norms: Pt[] = [];
        for (let i = 0; i + 1 < c.pts.length; i++) {
          const a = c.pts[i]!;
          const b = c.pts[i + 1]!;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          norms.push({ x: -(b.y - a.y) / len, y: (b.x - a.x) / len });
        }
        const joinDir = (i: number): Pt => {
          // The mean of the two normals that meet at point i, scaled so the offset edge keeps its width.
          const p = norms[i - 1];
          const q = norms[i];
          if (!p || !q) return (p ?? q)!;
          const sx = p.x + q.x;
          const sy = p.y + q.y;
          const l = Math.hypot(sx, sy);
          if (l < 0.3) return q;
          // A sharp kink would need a long mitre; capped, so a strip never flares past 1.3 times its width.
          const cosHalf = Math.max(l / 2, 0.77);
          return { x: sx / l / cosHalf, y: sy / l / cosHalf };
        };
        for (let i = 0; i + 1 < c.pts.length; i++) {
          const a = c.pts[i]!;
          const b = c.pts[i + 1]!;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len < 0.05) continue;
          // A simulated crack is drawn only as far as it has run.
          if (c.t && c.t[i + 1] !== undefined && c.t[i + 1]! > arrivedUs) {
            arriving = true;
            break;
          }
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          // Across the crack, in the pane's plane.
          const nx = -(b.y - a.y) / len;
          const ny = (b.x - a.x) / len;
          // Near the impact the face is mist and hackle: rough, whiter.
          const fromImpact = Math.hypot(mx - ix, my - iy);
          const rough = c.kind === "crush" ? 1 : Math.exp(-fromImpact / roughReach);
          const lean = faceLean(c.kind, ck, run + len / 2, rough);
          run += len;
          /*
           * The face runs through the pane's depth leaning by `lean`; from
           * your eye, looking across the crack at a slant, its far edge is
           * displaced by the depth (seen through the glass, 1/n of it) times
           * the lean plus the slant. That is the ribbon's width and side.
           */
          const slant = ((mx - eye.x) * nx + (my - eye.y) * ny) / Math.max(eye.z, 1);
          /*
           * A crack on one face only (a simulated break's, effects/optics/crack-field
           * PART_DEPTH) runs part way into the pane: a narrower face, and from
           * the back a fainter line, seen through the glass.
           */
          const crackFace = (c as { face?: string }).face ?? "both";
          const partial = crackFace === "both" ? 1 : PART_DEPTH;
          const wide = depth * partial * (Math.tan(lean) + 0.5 * slant);
          const ox = nx * wide;
          const oy = ny * wide;

          // The face's normal, leaning with it: (n cos lean, sin lean).
          const fn = faceNormal({ x: nx, y: ny }, lean);
          // What every light sends to the eye from this face: its mirror flash and the piped light.
          const { rgb: glow, flash } = crackGlow(sources, { x: mx, y: my }, fn, eye, rough);
          /*
           * The room: what the face mirrors of it, in the direction it sends
           * your sight (effects/optics/crack-face) -- for most faces a few
           * per cent by the back face's bounce, so clear glass; more where it
           * leans over, and a bright window there is bright in it. Mist and
           * hackle near the strike scatter some of the room's light white.
           */
          const seen = room ? faceRoom({ x: mx, y: my }, fn, eye, room).rgb : [0, 0, 0];
          const mist = 0.06 * rough;
          const roomRgb = [0, 1, 2].map((i) => seen[i]! * (FACE_TINT[i]! / 255) + mist) as [
            number,
            number,
            number,
          ];
          // The air gap: light from behind it is turned away, a hairline of shade.
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = `rgb(10 16 16 / ${((0.34 + 0.16 * rough) * (crackFace === "back" ? 0.6 : 1)).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          /*
           * The step where the two pieces sit at different heights
           * (effects/optics/crack-step): the higher edge's shadow on the
           * lower piece from each lamp over the high side, and the riser --
           * a fracture face seen from the air -- where the eye is on the low
           * side, mirroring the room and catching the lamps over that side.
           */
          const [liftMinus, liftPlus] = liftsAt(ck, i, mx, my, nx, ny);
          const step = stepAt(liftMinus, liftPlus);
          if (step) {
            const n = { x: nx, y: ny };
            const strip = (
              side: number,
              width: number,
              style: string | CanvasGradient,
              op: GlobalCompositeOperation,
            ) => {
              if (width < 0.15) return;
              ctx.globalCompositeOperation = op;
              ctx.fillStyle = style;
              const ja = joinDir(i);
              const jb = joinDir(i + 1);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.lineTo(b.x + jb.x * side * width, b.y + jb.y * side * width);
              ctx.lineTo(a.x + ja.x * side * width, a.y + ja.y * side * width);
              ctx.closePath();
              ctx.fill();
            };
            for (const l of overhead) {
              const on = l.charge * l.strength;
              if (on <= 0.01) continue;
              const shadow = stepShadow(step, { x: mx, y: my }, n, l.at);
              if (shadow < 0.15) continue;
              /*
               * The lamp's light through the glass is what the edge blocks:
               * as dark as the shadow layer, with the penumbra the lamp's
               * size gives it (its radius over its height, times the rise).
               */
              const pen = Math.min(
                shadow,
                (Math.abs(step.rise) * l.radius) / Math.max(l.at.z, 1) + 0.5,
              );
              const g = ctx.createLinearGradient(
                mx,
                my,
                mx + nx * step.low * shadow,
                my + ny * step.low * shadow,
              );
              const dark = `rgb(4 8 8 / ${Math.min(0.55, 0.45 * on).toFixed(3)})`;
              g.addColorStop(0, dark);
              g.addColorStop(Math.max(0, 1 - pen / shadow), dark);
              g.addColorStop(1, "rgb(4 8 8 / 0)");
              strip(step.low, shadow, g, "source-over");
            }
            const riser = riserSeen(step, { x: mx, y: my }, n, eye);
            if (riser.width >= 0.15) {
              // The room in the riser (a face in the air: 40-90% mirror at these angles), plus each lamp on it.
              let rr = 0.6 * 0.55 * ROOM_RISER[0];
              let rg = 0.6 * 0.55 * ROOM_RISER[1];
              let rb = 0.6 * 0.55 * ROOM_RISER[2];
              for (const l of overhead) {
                const on = l.charge * l.strength * riserLit(step, { x: mx, y: my }, n, l.at);
                if (on <= 0.01) continue;
                rr += l.colour[0] * on * 0.8;
                rg += l.colour[1] * on * 0.8;
                rb += l.colour[2] * on * 0.8;
              }
              const lit = additive([rr, rg, rb], 1, [0, 0, 0], 0);
              if (lit) strip(riser.side, riser.width, lit, "lighter");
            }
            ctx.globalCompositeOperation = "source-over";
          }
          // The face: a ribbon from the crack to its far edge, glass-green, lit.
          ctx.globalCompositeOperation = "lighter";
          if (Math.abs(wide) > 0.6) {
            ctx.fillStyle = additive(roomRgb, 0.6, glow, 0.22) ?? "transparent";
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(b.x + ox, b.y + oy);
            ctx.lineTo(a.x + ox, a.y + oy);
            ctx.closePath();
            ctx.fill();
          }
          // Its far edge, where the face meets the pane's surface, catches the most.
          // The light piped along the pane leaves at the gap along its whole run: the edge carries it.
          ctx.strokeStyle = additive(roomRgb, 1, glow, 1.3) ?? "transparent";
          ctx.lineWidth = 0.55 + 0.6 * rough;
          ctx.beginPath();
          ctx.moveTo(a.x + ox, a.y + oy);
          ctx.lineTo(b.x + ox, b.y + oy);
          ctx.stroke();
          if (rough > 0.3 && flash > 0.05) {
            // A chipped, rough face splits the lamp's light into colour, a hair apart.
            for (const [cc, o] of [
              ["255 80 60", -0.7],
              ["60 120 255", 0.7],
            ] as const) {
              ctx.strokeStyle = `rgb(${cc} / ${(flash * 0.35 * rough).toFixed(3)})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x + nx * o, a.y + ny * o);
              ctx.lineTo(b.x + nx * o, b.y + ny * o);
              ctx.stroke();
            }
          }
        }
        // Where it reaches the pane's edge, down the side face.
        for (const end of [0, c.pts.length - 1]) {
          const p0 = c.pts[end]!;
          const edge = edgeAt(p0, w, h);
          if (!edge) continue;
          const p1 = c.pts[end === 0 ? 1 : end - 1];
          if (!p1) continue;
          const len = Math.hypot(p0.x - p1.x, p0.y - p1.y);
          if (len < 0.05) continue;
          const across = { x: -(p0.y - p1.y) / len, y: (p0.x - p1.x) / len };
          const rough =
            c.kind === "crush" ? 1 : Math.exp(-Math.hypot(p0.x - ix, p0.y - iy) / roughReach);
          drawSide(p0, edge, across, faceLean(c.kind, ck, end === 0 ? 0 : run, rough), rough);
        }
      });
      // A hole's rim: its faces seen whole, standing edge-on round it.
      ctx.globalCompositeOperation = "lighter";
      for (const s of broken.shards) {
        if (!s.missing) continue;
        ctx.strokeStyle = "rgb(206 236 226 / 0.22)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      /*
       * ---- The pieces knocked out, falling ----
       *
       * Each drops from where it was, as its own photographed piece of glass:
       * pushed back and aside by the blow, turning, falling away from you
       * (a little smaller as it goes) and out of sight.
       */
      if (arriving) wake();
      const t = (performance.now() - struckAt) / 1000;
      if (t * 1000 < FALL_MS && shardPhotos.length) {
        let k = 0;
        for (const s of broken.shards) {
          if (!s.missing) continue;
          const box = boxOf(s.poly);
          const vx = (hash(seed, 1200 + k) - 0.5) * 120;
          const vy = -30 + hash(seed, 1300 + k) * 50;
          const spin = (hash(seed, 1400 + k) - 0.5) * 6;
          const dx = vx * t;
          const dy = vy * t + 0.5 * 1800 * t * t;
          const shrink = 1 - 0.15 * Math.min(1, t / 1.1);
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - (t * 1000) / FALL_MS);
          ctx.translate(box.cx + dx, box.cy + dy);
          ctx.rotate(spin * t);
          ctx.scale(shrink, shrink);
          ctx.translate(-box.cx, -box.cy);
          ctx.beginPath();
          s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          if (s.photo) {
            // It is a photographed piece: drawn whole, as it was photographed.
            const { img, turn, size, at: c0 } = s.photo;
            const k2 = size / Math.max(img.naturalWidth, img.naturalHeight, 1);
            ctx.save();
            ctx.translate(c0.x, c0.y);
            ctx.rotate(turn);
            ctx.drawImage(
              img,
              (-img.naturalWidth * k2) / 2,
              (-img.naturalHeight * k2) / 2,
              img.naturalWidth * k2,
              img.naturalHeight * k2,
            );
            ctx.restore();
          } else {
            ctx.save();
            ctx.clip();
            // The glass of it: frosted as the pane was, and its own photographed glass.
            ctx.fillStyle = "rgb(214 232 228 / 0.18)";
            ctx.fillRect(box.x, box.y, box.w, box.h);
            wearGlass(shardPhotos[(k + 5) % shardPhotos.length]!, box, 1500 + k, 0.9);
            ctx.restore();
            ctx.strokeStyle = "rgb(206 236 226 / 0.7)";
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
          ctx.restore();
          k++;
        }
        frame = requestAnimationFrame(draw);
      }
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const stop = onLightChange(wake);
    // A setting change (the pieces' displacement) re-lays the break.
    const stopTuning = onTuningApplied(wake);
    const observer = new ResizeObserver(wake);
    observer.observe(canvas);
    window.addEventListener("scroll", wake, { passive: true });
    wake();
    // The photograph may arrive after the first draw.
    const late = window.setTimeout(wake, 1500);
    return () => {
      disposed = true;
      if (pane) clearShardMap(pane);
      faces?.dispose();
      facesPhotos?.dispose();
      facesRoom?.dispose();
      cancelAnimationFrame(frame);
      window.clearTimeout(late);
      stop();
      stopTuning();
      observer.disconnect();
      window.removeEventListener("scroll", wake);
    };
  }, [kind, energy, at.x, at.y, seed]);

  return (
    <canvas
      ref={view}
      aria-hidden="true"
      data-broken-glass={kind}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        pointerEvents: "none",
        // Over the pane's own glass, under what stands on it.
        zIndex: -1,
      }}
    />
  );
}
