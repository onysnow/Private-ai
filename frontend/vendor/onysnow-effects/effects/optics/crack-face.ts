/**
 * What a crack's fracture face shows of the room (item 10 step 3;
 * docs/broken-glass-light.md; Ony, 2026-10-01: "cracks are glass -- hard to
 * see until light hits them, not white").
 *
 * A crack is an air gap through the whole thickness, between two new glass
 * faces. Your line of sight goes into the glass, meets the face and, past
 * the critical angle (41.2 deg for n 1.518), is mirrored whole (TIR). Where
 * it goes then decides what the face shows:
 *
 * - It cannot do both: your sight inside the glass is within 41 deg of
 *   straight in, and to leave by the front it must be within 41 deg of
 *   straight out, so a mirror turning it round meets it at under 41 deg --
 *   short of total reflection. A face leaning well over (the cone's walls)
 *   sends it back out only by its partial Fresnel reflection, a few to a
 *   few tens of per cent: a dim mirror of the room behind you, bright only
 *   where that is a window or a lamp.
 * - A face near square (the radial cracks) mirrors it whole but on DOWN
 *   through the glass; it reaches the room only by the back face's 4%
 *   bounce, and otherwise shows the scene behind a little sideways: nearly
 *   invisible. Clear glass, not a white line.
 * - So a crack shines when a LIGHT lines up (effects/optics/crack-light:
 *   in at the front, mirrored by the face, back up by the back face) or
 *   pipes along the pane to it -- "hard to see until light hits them".
 *
 * How far the faces lean, by kind of crack (forensic fractography: radial
 * cracks run through nearly square -- the "3R rule"; concentric cracks
 * lean through the thickness; the Hertzian cone's walls stand 20-40 deg
 * from the surface, i.e. 50-70 deg off square; Hertzian cone,
 * Forensic glass analysis, Wikipedia), each twisted in and out by hackle
 * as it runs, most near the strike.
 *
 * Pure; components/site/BrokenGlass draws it.
 */
import { N_GLASS, BACK_R0, CRITICAL, type V3 } from "./crack-light";
import type { CrackKind } from "./fracture";

/** A crack kind's typical lean off square, radians, before the hackle's twist. */
export const KIND_LEAN: Record<CrackKind, number> = {
  radial: 0.06,
  branch: 0.09,
  ring: 0.5,
  crush: 1.05,
};

/** A repeatable number in [0, 1). */
function hash(k: number, n: number): number {
  const x = Math.sin(k * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The face's lean off square at arc length `s` along crack `k`, radians,
 * signed (which way it leans across the crack): the kind's lean, twisted
 * in and out by hackle, more near the strike (`rough` 0-1).
 */
export function faceLean(kind: CrackKind, k: number, s: number, rough: number): number {
  const base = KIND_LEAN[kind] ?? 0.08;
  const sign = hash(k, 9) < 0.5 ? -1 : 1;
  const twist =
    (0.08 + 0.14 * rough) *
    (0.65 * Math.sin(s / (31 + 20 * hash(k, 1)) + 6.3 * hash(k, 2)) +
      0.35 * Math.sin(s / (9 + 6 * hash(k, 3)) + 6.3 * hash(k, 4)));
  return sign * base + twist;
}

/** The face's unit normal: across the crack (`across`, in the pane's plane), leaning by `lean` toward the viewer. */
export function faceNormal(across: { x: number; y: number }, lean: number): V3 {
  return {
    x: across.x * Math.cos(lean),
    y: across.y * Math.cos(lean),
    z: Math.sin(lean),
  };
}

/** A room as a function of direction (x right, y down, z toward the viewer): linear radiance. */
export type RoomSampler = (dir: V3) => [number, number, number];

/**
 * What the face sends to your eye of the room, linear RGB, and how much of
 * it is a mirror view (1: TIR straight back out the front; ~0.04: by the
 * back face's bounce). `mid` is the point on the pane (z 0), `eye` the
 * viewer.
 */
export function faceRoom(
  mid: { x: number; y: number },
  face: V3,
  eye: V3,
  room: RoomSampler,
): { rgb: [number, number, number]; mirror: number } {
  // Your line of sight, into the glass: steepened by Snell at the front face.
  const tx = mid.x - eye.x;
  const ty = mid.y - eye.y;
  const tz = -eye.z;
  const tl = Math.hypot(tx, ty, tz) || 1;
  const horiz = Math.hypot(tx, ty) || 1;
  const sinIn = Math.hypot(tx, ty) / tl / N_GLASS;
  const v = { x: (tx / horiz) * sinIn, y: (ty / horiz) * sinIn, z: -Math.sqrt(1 - sinIn * sinIn) };
  const d = v.x * face.x + v.y * face.y + v.z * face.z;
  const incidence = Math.acos(Math.min(1, Math.abs(d)));
  const share = incidence > CRITICAL ? 1 : 0.04 + 0.3 * Math.pow(incidence / CRITICAL, 6);
  const out = { x: v.x - 2 * d * face.x, y: v.y - 2 * d * face.y, z: v.z - 2 * d * face.z };
  let mirror = share;
  if (out.z <= 0) {
    // On down: only the back face's partial bounce brings any of the room back up.
    out.z = -out.z;
    mirror *= BACK_R0 + (1 - BACK_R0) * Math.pow(1 - Math.min(1, out.z), 5);
  }
  // Out through the front face, bent away from the normal.
  const oh = Math.hypot(out.x, out.y) || 1;
  const ol = Math.hypot(out.x, out.y, out.z) || 1;
  const sinOut = (oh / ol) * N_GLASS;
  if (sinOut >= 1) return { rgb: [0, 0, 0], mirror: 0 }; // trapped: it runs on along the pane
  const dir = {
    x: (out.x / oh) * sinOut,
    y: (out.y / oh) * sinOut,
    z: Math.sqrt(1 - sinOut * sinOut),
  };
  const c = room(dir);
  return { rgb: [c[0] * mirror, c[1] * mirror, c[2] * mirror], mirror };
}
