/**
 * The step at a crack where one piece sits higher than the other (surface
 * displacement; effects/optics/shard-tilt pieceLift). Nothing crazy -- a few
 * px at most -- but it is what makes a broken pane read as pieces and not a
 * drawing: along the crack the higher piece's edge throws a shadow onto the
 * lower one, and from the low side you see the riser, a fracture face seen
 * from the air, which mirrors the room and catches the lamp.
 *
 * x right, y down, z toward the viewer; `n` is the unit normal across the
 * crack; `lift` is each piece's height. Pure: the drawing is BrokenGlass's.
 */

import type { Pt } from "./fracture";

export type Step = {
  /** The height difference, px, + when the +n side is higher. */
  rise: number;
  /** Which side of the crack is lower: +1 the +n side, -1 the -n side. */
  low: 1 | -1;
};

/** The step between the two pieces at a crack, or null when they sit level (within `tol` px). */
export function stepAt(liftMinus: number, liftPlus: number, tol = 0.15): Step | null {
  const rise = liftPlus - liftMinus;
  if (Math.abs(rise) < tol) return null;
  return { rise, low: rise > 0 ? -1 : 1 };
}

/**
 * The riser as the eye sees it: how wide a strip it shows beside the crack
 * line, px, and on which side (0 when it is hidden behind the higher piece).
 * The eye sees the riser only from the low side, and in perspective the
 * higher edge projects further from the eye, so the strip lies on the HIGH
 * side of the crack line. `mid` is a point on the crack, `eye` the viewer.
 */
export function riserSeen(
  step: Step,
  mid: Pt,
  n: Pt,
  eye: { x: number; y: number; z: number },
): { width: number; side: 1 | -1 } {
  // The sight line's slope across the crack: + when the eye is on the -n side.
  const slant = ((mid.x - eye.x) * n.x + (mid.y - eye.y) * n.y) / Math.max(eye.z, 1);
  // The eye is on the +n side when slant < 0; it sees the riser from the low side only.
  const eyeSide: 1 | -1 = slant < 0 ? 1 : -1;
  if (eyeSide !== step.low) return { width: 0, side: step.low };
  return { width: Math.abs(step.rise * slant), side: step.low === 1 ? -1 : 1 };
}

/**
 * The shadow the higher edge throws across the crack onto the lower piece
 * from a light at `light` (px, and its height over the pane): how wide, px,
 * 0 when the light is over the low side (then the riser is lit instead).
 */
export function stepShadow(
  step: Step,
  mid: Pt,
  n: Pt,
  light: { x: number; y: number; z: number },
): number {
  const across = (light.x - mid.x) * n.x + (light.y - mid.y) * n.y;
  const lightSide: 1 | -1 = across >= 0 ? 1 : -1;
  if (lightSide === step.low) return 0;
  return (Math.abs(step.rise) * Math.abs(across)) / Math.max(light.z, 1);
}

/** How squarely a light at `light` falls on the riser: 0 from behind it, 1 straight on. */
export function riserLit(
  step: Step,
  mid: Pt,
  n: Pt,
  light: { x: number; y: number; z: number },
): number {
  const across = (light.x - mid.x) * n.x + (light.y - mid.y) * n.y;
  // The riser faces the low side.
  const toward = across * step.low;
  if (toward <= 0) return 0;
  const along = Math.hypot(light.x - mid.x, light.y - mid.y);
  const dist = Math.hypot(along, light.z) || 1;
  return toward / dist;
}
