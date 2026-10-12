/**
 * Waviness: the slow ripple in rolled or hammered glass, as one surface.
 *
 * No sheet is flat. The surface is modelled as six long, shallow ripples at
 * unrelated angles and lengths (a sum of waves, the same model as a pool's
 * surface), different for every pane (its seed). Two things follow from that
 * one surface, and both read it here so they can never disagree:
 *
 *   the view through the glass: each point of the pane tips the line of sight
 *     by the surface's SLOPE there, so what is behind is seen shifted by
 *     scale x slope (waveSlope);
 *   the light through it: light is tipped the same way, and lands focused or
 *     spread by the surface's CURVATURE, the caustic net on the photograph
 *     (waveHessian, floor-light causticAt).
 *
 * The "Glass waviness" knob (floorCaustics) scales it; 0 is flat float glass
 * and none of this happens. The shift grows with the gap to the photograph:
 * the same tilt carried further moves further.
 *
 * GLSL twin: waviness.glsl.ts.
 */

export const WAVE_COUNT = 6;
/** The longest ripple, CSS px; each next is shorter by 1 / (1 + 0.33 k). */
export const WAVE_LONGEST = 190;

type Wave = { dx: number; dy: number; w: number; phase: number };

function waves(seed: number): Wave[] {
  const out: Wave[] = [];
  for (let k = 0; k < WAVE_COUNT; k++) {
    const ang = seed * 1.7 + k * 2.39996; // golden angle: never lined up
    const len = WAVE_LONGEST / (1 + k * 0.33);
    out.push({
      dx: Math.cos(ang),
      dy: Math.sin(ang),
      w: (2 * Math.PI) / len,
      phase: k * 1.618 + seed * 4,
    });
  }
  return out;
}

const shifted = (x: number, y: number, seed: number) => [x + seed * 613, y + seed * 389] as const;

/**
 * How far a displacement of the surface's slope carries, CSS px per unit,
 * for this waviness and gap. The caustic uses the same number: it is what
 * turns the surface's curvature into focusing.
 */
export function waveScale(waviness: number, gap: number): number {
  return 3.5 * waviness * Math.min(2.5, Math.max(0.3, gap / 70));
}

/**
 * The surface's slope at a pane-local point. Every ripple's amplitude is
 * chosen so it bends equally (a w^2 = 1/6), so each adds cos / (6 w) along
 * its direction.
 */
export function waveSlope(x: number, y: number, seed: number): [number, number] {
  const [px, py] = shifted(x, y, seed);
  let sx = 0;
  let sy = 0;
  for (const v of waves(seed)) {
    const c = Math.cos((v.dx * px + v.dy * py) * v.w + v.phase) / (6 * v.w);
    sx += c * v.dx;
    sy += c * v.dy;
  }
  return [sx, sy];
}

/** Its curvature (xx, yy, xy): the derivative of waveSlope. */
export function waveHessian(x: number, y: number, seed: number): [number, number, number] {
  const [px, py] = shifted(x, y, seed);
  let hxx = 0;
  let hyy = 0;
  let hxy = 0;
  for (const v of waves(seed)) {
    const curve = -Math.sin((v.dx * px + v.dy * py) * v.w + v.phase) / 6;
    hxx += curve * v.dx * v.dx;
    hyy += curve * v.dy * v.dy;
    hxy += curve * v.dx * v.dy;
  }
  return [hxx, hyy, hxy];
}
