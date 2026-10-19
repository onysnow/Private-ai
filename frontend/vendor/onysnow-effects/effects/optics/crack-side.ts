/**
 * Where a crack runs down the pane's side face (item 10 step 4;
 * docs/broken-glass-light.md; Ony, 2026-10-01: "the cracks go all the way
 * through the thickness and down the sides at the right angle").
 *
 * A crack that reaches the pane's edge cuts the side face too: its fracture
 * face meets the side along a line from the front arris to the back one.
 * That line is where the two planes cross -- the face (normal `face`, leaning
 * through the thickness by its kind, effects/optics/crack-face) and the side
 * (normal `out`, the edge's outward direction in the pane's plane) -- so a
 * square crack crosses the side straight from front to back, and a leaning
 * one slants along the edge by the thickness times the tangent of its lean
 * (the concentric cracks and the cone's walls far more than the radial ones,
 * which meet the reverse side at a right angle: the forensic "3R rule").
 *
 * Seen from the front, the side face shows only on the edge's own side of
 * your eye and is foreshortened to a few pixels (effects/optics/edge-side
 * sideWidth); its back arris is drawn toward the eye by distance / (distance
 * + thickness). The trace is projected the same way.
 *
 * Coordinates as in edge-side: pane px, x right, y down, z toward the viewer;
 * front face z 0, back face z -thickness. Pure; BrokenGlass draws it.
 */
import type { V3 } from "./crack-light";

export type Pt = { x: number; y: number };

/** The pane's four edges by their outward direction. */
export const EDGES = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
} as const;
export type Edge = keyof typeof EDGES;

/** The edge a point on the pane's border lies on (within `tol` px), or null. */
export function edgeAt(p: Pt, w: number, h: number, tol = 1.5): Edge | null {
  if (p.x <= tol) return "left";
  if (p.x >= w - tol) return "right";
  if (p.y <= tol) return "top";
  if (p.y >= h - tol) return "bottom";
  return null;
}

/**
 * The crack's trace across the side face at `at` (a point on edge `edge`),
 * as drawn: from the front arris to the back arris, screen-projected. Null
 * when that side face is not seen from `eye` or the face runs along the side.
 * `maxShift` caps how far along the edge it may slant, in thicknesses.
 */
export function sideTrace(
  at: Pt,
  edge: Edge,
  face: V3,
  thickness: number,
  eye: V3,
  maxShift = 3,
): { front: Pt; back: Pt; shift: number } | null {
  const out = EDGES[edge];
  // The side shows only past your eye on its own side.
  const offset = (at.x - eye.x) * out.x + (at.y - eye.y) * out.y;
  if (offset <= 0) return null;
  // Where the two planes cross: face x side's normal.
  const dx = face.y * 0 - face.z * out.y;
  const dy = face.z * out.x - face.x * 0;
  const dz = face.x * out.y - face.y * out.x;
  if (Math.abs(dz) < 1e-3) return null;
  // Scaled to run from the front face (z 0) to the back (z -thickness).
  const k = -thickness / dz;
  let sx = dx * k;
  let sy = dy * k;
  const shift = Math.hypot(sx, sy);
  const cap = maxShift * thickness;
  if (shift > cap) {
    sx *= cap / shift;
    sy *= cap / shift;
  }
  const D = Math.max(eye.z, 1);
  const f = D / (D + thickness);
  return {
    front: { x: at.x, y: at.y },
    back: { x: eye.x + (at.x + sx - eye.x) * f, y: eye.y + (at.y + sy - eye.y) * f },
    shift: Math.min(shift, cap),
  };
}
