/**
 * How a party balloon moves through the air (task 74; docs/research/balloons.md 3).
 *
 * SI units. An 11" latex balloon: 11.42 L, 0.279 m across, 3 g of latex
 * (BalloonHQ), helium 0.166 g/L at 20 C; the air it displaces 1.2041 kg/m3;
 * drag coefficient 0.50, measured on a party balloon (Cross, "Aerodynamics
 * of a party balloon"); added mass half the displaced air, as for a sphere.
 * Drag is quadratic, so it is applied as a force each step; buoyancy is a
 * force too, so the added mass -- which is inertia, not weight -- does not
 * also fall under gravity (balloons.md 3.2).
 */

export const AIR_DENSITY = 1.2041;
export const HELIUM_DENSITY = 0.166;
export const GRAVITY = 9.81;
export const DRAG_CD = 0.5;
/** Latex for an 11" balloon, kg; it scales with the skin's area. */
export const LATEX_11 = 0.003;
export const DIAMETER_11 = 0.279;

export type Fill = "helium" | "air";

export type BalloonPhysics = {
  /** Diameter, m. */
  diameter: number;
  /** What its body weighs (latex + gas), kg: the mass gravity pulls. */
  mass: number;
  /** Half the displaced air, kg: inertia only. */
  addedMass: number;
  /** Buoyancy minus weight, N, upward positive. */
  netLift: number;
  /** Frontal area, m^2. */
  area: number;
};

/** A balloon of `diameter` m (11" = 0.279), filled with helium or air. */
export function balloonPhysics(diameter: number, fill: Fill): BalloonPhysics {
  const r = diameter / 2;
  const volume = (4 / 3) * Math.PI * r * r * r;
  const latex = LATEX_11 * (diameter / DIAMETER_11) ** 2;
  // Air inside is at a slight over-pressure (1.3-4 kPa): 1.3-4% denser (balloons.md 3.1); 2.5%.
  const gas = fill === "helium" ? HELIUM_DENSITY * volume : AIR_DENSITY * 1.025 * volume;
  const displaced = AIR_DENSITY * volume;
  return {
    diameter,
    mass: latex + gas,
    addedMass: 0.5 * displaced,
    netLift: (displaced - gas - latex) * GRAVITY,
    area: Math.PI * r * r,
  };
}

/** Quadratic drag on a balloon moving at v (m/s) through air moving at wind: -1/2 rho Cd A |v_rel| v_rel. */
export function drag(
  vx: number,
  vy: number,
  windX: number,
  windY: number,
  area: number,
): [number, number] {
  const rx = vx - windX;
  const ry = vy - windY;
  const s = Math.hypot(rx, ry);
  const k = 0.5 * AIR_DENSITY * DRAG_CD * area * s;
  return [-k * rx, -k * ry];
}

/** Terminal speed under a steady force F (N): sqrt(2F / (rho Cd A)). */
export function terminalSpeed(force: number, area: number): number {
  return Math.sqrt((2 * Math.abs(force)) / (AIR_DENSITY * DRAG_CD * area));
}
