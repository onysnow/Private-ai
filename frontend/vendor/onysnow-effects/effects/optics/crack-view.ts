/**
 * The crack-face view pass (broken glass B2; docs/broken-glass-system.md
 * 3.5): the break's faces baked as textures, drawn per pixel on the shared
 * context, and copied onto the break's own canvas where a face was hit.
 *
 * The 2D ribbons (BrokenGlass) stand in for it on the minimal tier and
 * where there is no WebGL: this pass draws the same faces, but as what the
 * eye's ray meets inside the glass, so the picture folds at each crack
 * (crack-view.glsl).
 */

import {
  beginPass,
  buildProgram,
  endPass,
  fullScreenTriangle,
  sharedGl,
} from "@fx/effects/engine/gl";
import type { PhotoTextures } from "@fx/effects/engine/photo-texture";
import type { PaneLook } from "@fx/effects/engine/pane-look";
import type { RoomTexture } from "@fx/effects/engine/room-texture";
import type { GlassRect } from "@fx/effects/scene/scene";
import type { Crack, Fracture } from "./fracture";
import { bakeField, bakeTable, segmentsOf, TABLE_WIDTH } from "./crack-field";
import { CRACK_VIEW_FRAGMENT, CRACK_VIEW_VERTEX, MAX_CRACK_LIGHTS } from "./crack-view.glsl";

/** What the pass needs of a break: its cracks (with arrival times when simulated) and where it was struck. */
export type CrackViewBreak = Pick<Fracture, "impact"> & { cracks: (Crack & { t?: number[] })[] };

export type CrackViewLight = {
  /** Viewport px, and height over the page. */
  x: number;
  y: number;
  z: number;
  /** Linear colour times how much it is on. */
  colour: [number, number, number];
};

export type CrackViewDraw = {
  /** The break's canvas: CSS size and device scale. */
  w: number;
  h: number;
  scale: number;
  /** Where the canvas lies in the viewport, CSS px. */
  left: number;
  top: number;
  /** The pane it breaks, for its photograph, look and causes; null draws the fill only. */
  pane: GlassRect | null;
  look: PaneLook;
  thickness: number;
  gap: number;
  ior: number;
  /** The frost's blur, CSS px (0 for clear glass). */
  frostBlur: number;
  /** The eye: viewport px and its distance. */
  eye: { x: number; y: number; z: number };
  /** How far the cracks have run, microseconds (Infinity when all are there). */
  arrivedUs: number;
  lights: readonly CrackViewLight[];
  /** The room's exposure ("Room brightness"). */
  roomExposure: number;
};

export type CrackView = {
  /** Bake the break's faces for a canvas `w` x `h` CSS px at `scale`. */
  bake(fr: CrackViewBreak, w: number, h: number, scale: number, roughReach: number): void;
  /** Draw the faces' view into `target` (the 2D context, with its device transform set). False if nothing was drawn. */
  draw(target: CanvasRenderingContext2D, opts: CrackViewDraw): boolean;
  dispose(): void;
};

const U = [
  "uField",
  "uFieldSize",
  "uTable",
  "uTableRows",
  "uPane",
  "uScale",
  "uThickness",
  "uGap",
  "uIor",
  "uViewCentre",
  "uCameraDistance",
  "uPhoto",
  "uHasPhoto",
  "uImage",
  "uImageFit",
  "uPhotoTexels",
  "uFrostLod",
  "uSaturate",
  "uFill",
  "uArrived",
  "uLightCount",
  "uLightPos",
  "uLightColour",
  "uRoomTex",
  "uHasRoom",
  "uRoomExposure",
  "uRoomMean",
] as const;

/** The pass on the shared context; null where there is no WebGL. */
export function crackView(
  photos: PhotoTextures,
  room: RoomTexture,
  label = "pane",
): CrackView | null {
  const s = sharedGl();
  if (!s) return null;
  const { gl } = s;
  const lod = gl.getExtension("EXT_shader_texture_lod");
  const header = lod
    ? "#extension GL_EXT_shader_texture_lod : enable\n#define HAS_TEXTURE_LOD 1\n"
    : "";
  const program = buildProgram(gl, CRACK_VIEW_VERTEX, header + CRACK_VIEW_FRAGMENT, "crack view");
  if (!program) return null;
  const tri = fullScreenTriangle(gl, program);
  const u = Object.fromEntries(U.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<
    (typeof U)[number],
    WebGLUniformLocation | null
  >;
  const field = gl.createTexture();
  const table = gl.createTexture();
  let fieldW = 0;
  let fieldH = 0;
  let tableRows = 0;
  let segments = 0;
  const upload = (
    tex: WebGLTexture | null,
    unit: number,
    w: number,
    h: number,
    data: Uint8Array,
  ) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  };
  const lightPos = new Float32Array(MAX_CRACK_LIGHTS * 3);
  const lightColour = new Float32Array(MAX_CRACK_LIGHTS * 3);
  // Development only: what the pass last did, for the rigs.
  const state = {
    segments: 0,
    draws: 0,
    photo: false,
    field: [0, 0] as [number, number],
    lod: 0,
    lights: [] as number[],
    eye: [0, 0, 0] as number[],
  };
  if ((process.env.NODE_ENV !== "production")) {
    const w = window as unknown as { __crackView?: Record<string, typeof state> };
    (w.__crackView ??= {})[label] = state;
  }

  return {
    bake(fr, w, h, scale, roughReach) {
      if (gl.isContextLost()) return;
      const segs = segmentsOf(fr, roughReach);
      segments = segs.length;
      const t = bakeTable(segs);
      const f = bakeField(segs, w, h, scale);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      upload(table, 2, TABLE_WIDTH, t.rows, t.data);
      upload(field, 3, f.width, f.height, f.data);
      tableRows = t.rows;
      fieldW = f.width;
      fieldH = f.height;
      state.segments = segments;
      state.field = [fieldW, fieldH];
    },
    draw(target, o) {
      if (segments === 0 || fieldW === 0 || gl.isContextLost()) return false;
      const pass = beginPass(o.w * o.scale, o.h * o.scale, "crack view");
      if (!pass) return false;
      tri.bind();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, table);
      gl.uniform1i(u.uTable, 2);
      gl.uniform1f(u.uTableRows, tableRows);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.uniform1i(u.uField, 3);
      gl.uniform2f(u.uFieldSize, fieldW, fieldH);
      gl.uniform4f(u.uPane, o.left, o.top, o.w, o.h);
      gl.uniform1f(u.uScale, o.scale);
      gl.uniform1f(u.uThickness, o.thickness);
      gl.uniform1f(u.uGap, o.gap);
      gl.uniform1f(u.uIor, o.ior);
      gl.uniform2f(u.uViewCentre, o.eye.x, o.eye.y);
      gl.uniform1f(u.uCameraDistance, Math.max(o.eye.z, 1));
      const pane = o.pane;
      const tex =
        pane && (pane.srcFull || pane.src) ? photos.get(pane.srcFull || pane.src, pane.src) : null;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uPhoto, 1);
      gl.uniform1f(u.uHasPhoto, tex ? 1 : 0);
      const size = tex ? photos.size(tex) : undefined;
      const texels: [number, number] = [size?.[0] ?? 1024, size?.[1] ?? 1024];
      gl.uniform2f(u.uPhotoTexels, texels[0], texels[1]);
      if (pane) {
        gl.uniform4f(u.uImage, pane.ix, pane.iy, pane.iw, pane.ih);
        gl.uniform3f(u.uImageFit, pane.ia, pane.ifocus.x, pane.ifocus.y);
      } else {
        gl.uniform4f(u.uImage, o.left, o.top, o.w, o.h);
        gl.uniform3f(u.uImageFit, o.w / Math.max(o.h, 1), 0.5, 0.5);
      }
      // The frost's blur as a mip level: a Gaussian of sigma s is about a box 2 s wide, log2 of that in texels.
      const texPerPx = texels[0] / Math.max(pane?.iw ?? o.w, 1);
      const frostLod =
        o.frostBlur > 0 ? Math.max(0, Math.log2(Math.max(1, 2 * o.frostBlur * texPerPx))) : 0;
      gl.uniform1f(u.uFrostLod, frostLod);
      gl.uniform1f(u.uSaturate, o.look.saturate);
      gl.uniform4f(u.uFill, ...o.look.fill);
      gl.uniform1f(u.uArrived, Number.isFinite(o.arrivedUs) ? o.arrivedUs : 1e9);
      const n = Math.min(o.lights.length, MAX_CRACK_LIGHTS);
      for (let i = 0; i < n; i++) {
        const l = o.lights[i]!;
        lightPos.set([l.x, l.y, l.z], i * 3);
        lightColour.set(l.colour, i * 3);
      }
      gl.uniform1i(u.uLightCount, n);
      gl.uniform3fv(u.uLightPos, lightPos);
      gl.uniform3fv(u.uLightColour, lightColour);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, room.texture);
      gl.uniform1i(u.uRoomTex, 4);
      gl.uniform1f(u.uHasRoom, room.texture ? 1 : 0);
      gl.uniform1f(u.uRoomExposure, o.roomExposure);
      const m = room.mean;
      gl.uniform3f(
        u.uRoomMean,
        m[0] * o.roomExposure,
        m[1] * o.roomExposure,
        m[2] * o.roomExposure,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      endPass();
      state.draws++;
      state.photo = Boolean(tex);
      state.lod = frostLod;
      state.lights = [
        n,
        ...Array.from(lightPos.slice(0, n * 3)),
        ...Array.from(lightColour.slice(0, n * 3)),
      ];
      state.eye = [o.eye.x, o.eye.y, o.eye.z];
      if ((process.env.NODE_ENV !== "production")) {
        // The pass's own output, before it goes under the ribbons, for the rigs.
        const dump =
          (state as { dump?: HTMLCanvasElement }).dump ?? document.createElement("canvas");
        dump.width = pass.canvas.width;
        dump.height = pass.canvas.height;
        dump.getContext("2d")?.drawImage(pass.canvas, 0, 0);
        (state as { dump?: HTMLCanvasElement }).dump = dump;
      }
      // Onto the break's canvas, in CSS px: the target's transform scales it.
      target.save();
      target.globalCompositeOperation = "source-over";
      target.drawImage(pass.canvas, 0, 0, o.w, o.h);
      target.restore();
      return true;
    },
    dispose() {
      gl.deleteTexture(field);
      gl.deleteTexture(table);
      tri.delete();
      gl.deleteProgram(program);
    },
  };
}
