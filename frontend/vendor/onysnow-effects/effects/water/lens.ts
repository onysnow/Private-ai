/**
 * The JS twin of the water layer's lens (water.glsl.ts), for tests
 * (water-drops.md 7.5 step 3, 9.1).
 *
 * A drop is a spherical cap of contact radius a and height h0 (mm). At a
 * distance r from its centre its face slopes by s = r / sqrt(R^2 - r^2),
 * R = (a^2 + h0^2) / 2 h0. Same units throughout.
 */
export function capSlope(r: number, a: number, h0: number): number {
  const R = (a * a + h0 * h0) / (2 * h0);
  if (r >= a) return 0;
  return r / Math.sqrt(Math.max(R * R - r * r, 1e-12));
}

/** The small-slope estimate of where the photograph is seen through the point r from the drop's centre (signed, along the same line). */
export function seenAt(r: number, a: number, h0: number, n: number, gap: number): number {
  return r - (n - 1) * gap * capSlope(r, a, h0);
}

/** The drop's focal length as a thin plano-convex lens: R / (n - 1). */
export function focalLength(a: number, h0: number, n: number): number {
  return (a * a + h0 * h0) / (2 * h0) / (n - 1);
}

/** The critical angle inside water against air, degrees: asin(1 / n). */
export function criticalAngle(n: number): number {
  return (Math.asin(1 / n) * 180) / Math.PI;
}

export type Trace = {
  /** How far across the photograph the ray lands from where it entered the water, along the slope's direction (negative: toward the higher side). */
  offset: number;
  /** Totally reflected at the glass's back face: the point shows the room, not the photograph. */
  tir: boolean;
};

/**
 * The exact trace (water.glsl.ts traceDrop), in one plane: a ray from
 * straight ahead meets the water's face where it slopes by `slope` (rising
 * toward positive offset), refracts into the water (Snell), crosses the flat
 * water-glass and glass-air faces -- the tangential n sin(theta) is the
 * same in every layer -- and lands on the photograph: through the rest of
 * the water's height h, the glass's thickness T and the gap G.
 */
export function trace(
  slope: number,
  h: number,
  nWater: number,
  nGlass: number,
  T: number,
  G: number,
): Trace {
  const alpha = Math.atan(Math.abs(slope));
  const inside = Math.asin(Math.sin(alpha) / nWater);
  const tilt = alpha - inside; // the ray's angle from the glass's normal, in the water
  const k = nWater * Math.sin(tilt); // n sin(theta), carried through every flat face
  if (k >= 1) return { offset: 0, tir: true };
  const tanIn = (n: number) => {
    const s = k / n;
    return s / Math.sqrt(1 - s * s);
  };
  const d = h * Math.tan(tilt) + T * tanIn(nGlass) + G * tanIn(1);
  // Toward the higher side: up the slope.
  return { offset: Math.sign(slope) * d, tir: false };
}
