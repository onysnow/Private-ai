/**
 * How far each piece of a broken pane is tilted (item 10; docs/broken-glass-
 * light.md, "Why the pieces tilt by degrees").
 *
 * The blow pushes the pane in: round the strike it bends into a shallow dish
 * before it breaks, and the pieces are left in it. Laminated glass keeps the
 * dish whole -- the interlayer holds every piece where the bend left it -- so
 * its pieces slope down toward the strike by the dish's slope. Annealed
 * pieces sit loosely in the frame and each settles at its own angle, most
 * near the strike. Modelled, not measured: a cone
 * dent whose slope grows with the blow, 1 to 4 degrees, out to a radius that
 * grows with it too, and a random knock on top for loose pieces.
 *
 * A face turned by t throws the room's reflection 2t further round, so these
 * degrees are what make neighbouring pieces show different parts of the room
 * -- a window in one, a dark wall in the next.
 */

import type { GlassKind } from "./fracture";

const DEG = Math.PI / 180;

/** The dent's slope, radians, and how far out it reaches (a share of the pane's diagonal). */
export function dent(kind: GlassKind, energy: number): { slope: number; reach: number } {
  const E = Math.max(0, Math.min(1, energy));
  const slope = (1 + 3 * E) * DEG;
  // Laminated bends wide before it lets go; annealed breaks sooner.
  const reach = (kind === "laminated" ? 0.3 : 0.18) + 0.3 * E;
  return { slope, reach };
}

/** The random knock's size for a piece `reach` (share of the diagonal) from the strike, radians. */
export function knockSize(kind: GlassKind, energy: number, reach: number): number {
  const E = Math.max(0, Math.min(1, energy));
  const loose = kind === "laminated" ? 0.25 : 1;
  return loose * (0.5 + 2.5 * E) * DEG * (0.25 + 0.75 * Math.exp(-reach * 4));
}

/**
 * A piece's tilts: radians about x (its slope down the page) and about y
 * (across), as the shard map takes them (shard-map shardNormal).
 *
 * `ux, uy`: the unit direction from the strike to the piece; `reach`: how far,
 * as a share of the diagonal; `r1, r2`: two repeatable numbers in [0, 1).
 */
export function pieceTilt(
  kind: GlassKind,
  energy: number,
  ux: number,
  uy: number,
  reach: number,
  r1: number,
  r2: number,
): { tiltX: number; tiltY: number } {
  const d = dent(kind, energy);
  // Inside the dent the glass slopes up away from the strike: its normal leans
  // back toward the strike (z toward the viewer). A soft shoulder at the rim.
  const inDent = d.reach > 0 ? Math.max(0, Math.min(1, (d.reach - reach) / (0.25 * d.reach))) : 0;
  const s = Math.tan(d.slope) * inDent;
  const knock = knockSize(kind, energy, reach);
  const sx = -s * ux + Math.tan((r1 - 0.5) * 2 * knock);
  const sy = -s * uy + Math.tan((r2 - 0.5) * 2 * knock);
  return { tiltX: Math.atan(sy), tiltY: Math.atan(sx) };
}

/**
 * How far a piece stands proud of the pane or sinks into it, px (+ toward
 * the viewer): the surface displacement (Ony, 2026-10-02: "different shards
 * protruding or sinking more than the others. Nothing crazy, but it does
 * happen"). Loose annealed pieces settle at their own heights, most near
 * the strike where they were knocked hardest; the interlayer holds
 * laminated pieces nearly flush. `displacement` is the pane's setting, 0
 * (flush) to 1 (each piece up to LIFT_SHARE of the thickness, so a step
 * between two pieces up to twice that); `thickness` px; `r` a repeatable
 * number in [0, 1).
 */
export const LIFT_SHARE = 0.15;

export function pieceLift(
  kind: GlassKind,
  energy: number,
  reach: number,
  displacement: number,
  thickness: number,
  r: number,
): number {
  const E = Math.max(0, Math.min(1, energy));
  const d = Math.max(0, Math.min(1, displacement));
  const loose = kind === "laminated" ? 0.15 : 1;
  const most = d * LIFT_SHARE * thickness * loose * (0.4 + 0.6 * E);
  // A hard tail: most pieces move a little, a few a lot.
  const u = r * 2 - 1;
  return most * Math.sign(u) * Math.pow(Math.abs(u), 1.6) * (0.3 + 0.7 * Math.exp(-reach * 4));
}
