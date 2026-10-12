/**
 * The crack field: a break's crack segments as textures the pane shader can
 * read per pixel (broken glass B2; docs/broken-glass-system.md 3.5).
 *
 * Two tables, both RGBA8 so they work in every WebGL1:
 *
 *   the SEGMENT TABLE, SEG_TEXELS texels a segment, 1024 texels a row:
 *     0: x0, y0   (pane px, 16 bits each, 1/16 px steps: v = round(x * 16))
 *     1: x1, y1
 *     2: lean (radians, signed, 16 bits: v = lean * 8192 + 32768), roughness (0-255), kind
 *     3: arrival (microseconds, 16 bits), face (0 through the pane, 1 the struck face only, 2 the back only)
 *
 *   the FIELD, one texel per pane device pixel: the nearest segment's index
 *     (RG, 16 bits, 65535 for none) and the second nearest (BA), among the
 *     segments within REACH px. The shader recomputes the exact distance
 *     from the table, so the field only has to name the candidates.
 *
 * Pure: typed arrays in, typed arrays out; the GL upload is the caller's.
 */

import type { Crack, Fracture } from "./fracture";
import { faceLean } from "./crack-face";

export const SEG_TEXELS = 4;
export const TABLE_WIDTH = 1024;
/** The furthest a crack face's band can reach from its line, px: the thickest glass at the widest view. */
export const REACH = 24;
export const NO_SEGMENT = 65535;

export type Segment = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The face's lean off square, radians, signed across the crack. */
  lean: number;
  /** 0 smooth mirror, 1 mist and hackle near the strike. */
  rough: number;
  kind: Crack["kind"];
  /** When it cracked, microseconds. */
  arrival: number;
  /**
   * How deep it goes: through the pane, or from one face part way in (a
   * simulated break's cracks start on the back face and not all of them
   * reach the front; Ony, 2026-10-02: "lots of the cracks don't go all the
   * way thru" -- some really don't).
   */
  face: CrackFace;
};

export type CrackFace = "both" | "struck" | "back";
const FACE_CODE: Record<CrackFace, number> = { both: 0, struck: 1, back: 2 };
/** How far into the pane a crack that shows on one face only reaches, as a share of the thickness. */
export const PART_DEPTH = 0.55;

const KIND_CODE: Record<Crack["kind"], number> = { radial: 0, branch: 1, ring: 2, crush: 3 };

/** The break's cracks as straight segments with their face leans. */
export function segmentsOf(
  fr: Pick<Fracture, "impact"> & { cracks: (Crack & { t?: number[]; face?: CrackFace })[] },
  roughReach: number,
): Segment[] {
  const out: Segment[] = [];
  fr.cracks.forEach((c: Crack & { t?: number[]; face?: CrackFace }, ck) => {
    // The crushed zone is pulverised glass, not faces: BrokenGlass draws it (B4), not this pass.
    if (c.kind === "crush") return;
    let run = 0;
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i]!;
      const b = c.pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.05) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const fromImpact = Math.hypot(mx - fr.impact.x, my - fr.impact.y);
      const rough = Math.exp(-fromImpact / roughReach);
      out.push({
        x0: a.x,
        y0: a.y,
        x1: b.x,
        y1: b.y,
        lean: faceLean(c.kind, ck, run + len / 2, rough),
        rough,
        kind: c.kind,
        arrival: c.t?.[i + 1] ?? 0,
        face: c.face ?? "both",
      });
      run += len;
    }
  });
  return out;
}

function put16(data: Uint8Array, at: number, v: number) {
  const n = Math.max(0, Math.min(65535, Math.round(v)));
  data[at] = n >> 8;
  data[at + 1] = n & 255;
}

/** The segment table as RGBA8 texels: width TABLE_WIDTH, `rows` rows. */
export function bakeTable(segs: readonly Segment[]): { data: Uint8Array; rows: number } {
  const texels = Math.max(1, segs.length * SEG_TEXELS);
  const rows = Math.ceil(texels / TABLE_WIDTH);
  const data = new Uint8Array(TABLE_WIDTH * rows * 4);
  segs.forEach((s, i) => {
    const t = i * SEG_TEXELS * 4;
    put16(data, t, s.x0 * 16);
    put16(data, t + 2, s.y0 * 16);
    put16(data, t + 4, s.x1 * 16);
    put16(data, t + 6, s.y1 * 16);
    put16(data, t + 8, s.lean * 8192 + 32768);
    data[t + 10] = Math.round(Math.max(0, Math.min(1, s.rough)) * 255);
    data[t + 11] = KIND_CODE[s.kind];
    put16(data, t + 12, s.arrival);
    data[t + 14] = FACE_CODE[s.face];
    data[t + 15] = 255;
  });
  return { data, rows };
}

/**
 * The field for a pane `w` x `h` px drawn at `scale` device px per px: the
 * nearest and second-nearest segments within REACH of each texel.
 */
export function bakeField(
  segs: readonly Segment[],
  w: number,
  h: number,
  scale: number,
): { data: Uint8Array; width: number; height: number } {
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const data = new Uint8Array(width * height * 4);
  data.fill(255); // none
  if (segs.length === 0) return { data, width, height };
  // A grid of REACH-sized cells: each segment is listed in every cell its band can touch.
  const cell = REACH;
  const cols = Math.ceil(w / cell) + 1;
  const rowsN = Math.ceil(h / cell) + 1;
  const grid: number[][] = Array.from({ length: cols * rowsN }, () => []);
  segs.forEach((s, i) => {
    const x0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - REACH) / cell));
    const x1 = Math.min(cols - 1, Math.floor((Math.max(s.x0, s.x1) + REACH) / cell));
    const y0 = Math.max(0, Math.floor((Math.min(s.y0, s.y1) - REACH) / cell));
    const y1 = Math.min(rowsN - 1, Math.floor((Math.max(s.y0, s.y1) + REACH) / cell));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) grid[cy * cols + cx]!.push(i);
  });
  const dist2 = (s: Segment, px: number, py: number) => {
    const dx = s.x1 - s.x0;
    const dy = s.y1 - s.y0;
    const l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / l2));
    const qx = s.x0 + dx * t - px;
    const qy = s.y0 + dy * t - py;
    return qx * qx + qy * qy;
  };
  const r2 = REACH * REACH;
  for (let y = 0; y < height; y++) {
    const py = (y + 0.5) / scale;
    const cy = Math.min(rowsN - 1, Math.floor(py / cell));
    for (let x = 0; x < width; x++) {
      const px = (x + 0.5) / scale;
      const list = grid[cy * cols + Math.min(cols - 1, Math.floor(px / cell))]!;
      let best = NO_SEGMENT;
      let bestD = r2;
      let second = NO_SEGMENT;
      let secondD = r2;
      for (const i of list) {
        const d = dist2(segs[i]!, px, py);
        if (d < bestD) {
          second = best;
          secondD = bestD;
          best = i;
          bestD = d;
        } else if (d < secondD) {
          second = i;
          secondD = d;
        }
      }
      const at = (y * width + x) * 4;
      put16(data, at, best);
      put16(data, at + 2, second);
    }
  }
  return { data, width, height };
}
