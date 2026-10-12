/**
 * Fireworks physics (task 81; docs/research/fireworks.md 7).
 *
 * A star is a burning pellet thrown out by the burst charge. Air drag is
 * quadratic, F = 1/2 rho_a C_D A v^2 (Zohdi 2016), so with K = rho_a C_D A /
 * (2 m) a star thrown at v0 with gravity off travels r(t) = ln(1 + K v0 t) / K
 * and falls, burnt out, at sqrt(g / K). Star: radius 10 mm, density 1250
 * kg/m^3 (estimate, ~1/2-inch cubes). Ejection for a 10-go shell about
 * 150 m/s (computed in 2.3 from the JPA burst widths), scaled with the burst.
 */

export const AIR = 1.225;
export const CD = 0.5;
export const G = 9.81;

export type StarSpec = { radius: number; density: number };
export const STAR: StarSpec = { radius: 0.01, density: 1250 };

/** K = rho_a C_D A / (2 m), per metre. */
export function dragK(s: StarSpec = STAR): number {
  const m = (4 / 3) * Math.PI * s.radius ** 3 * s.density;
  const A = Math.PI * s.radius ** 2;
  return (AIR * CD * A) / (2 * m);
}

/** Distance from the burst after t s, gravity off: ln(1 + K v0 t) / K. */
export function radiusAt(t: number, v0: number, K = dragK()): number {
  return Math.log(1 + K * v0 * t) / K;
}

/** A burnt-out star's terminal fall speed, m/s. */
export function terminalSpeed(K = dragK()): number {
  return Math.sqrt(G / K);
}

/**
 * Shell sizes (JPA via San-en): burst width and height, m. The ejection
 * speed for each is scaled so a peony's radius at burn-out (2 s) is
 * about half the burst width.
 */
export const SHELLS = {
  3: { width: 60, height: 120 },
  5: { width: 150, height: 190 },
  7: { width: 200, height: 250 },
  10: { width: 280, height: 330 },
  20: { width: 500, height: 450 },
} as const;
export type ShellSize = keyof typeof SHELLS;

/** The ejection speed that puts a star at half the burst width after `burn` s (gravity off). */
export function ejectionFor(size: ShellSize, burn = 2, K = dragK()): number {
  const r = SHELLS[size].width / 2;
  // r = ln(1 + K v0 t) / K  ->  v0 = (exp(K r) - 1) / (K t)
  return (Math.exp(K * r) - 1) / (K * burn);
}

/** One step of a star under gravity and quadratic drag (semi-implicit Euler), SI units, y up. */
export function stepStar(
  s: { x: number; y: number; vx: number; vy: number },
  dt: number,
  K = dragK(),
  windX = 0,
) {
  const rx = s.vx - windX;
  const ry = s.vy;
  const v = Math.hypot(rx, ry);
  s.vx += -K * v * rx * dt;
  s.vy += (-K * v * ry - G) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

/*
 * The colours (fireworks.md 3.2): the emitters' bands, as linear RGB at
 * their brightest (computed from the band tables to XYZ, rounded): strontium
 * a deep red, barium green, copper blue, sodium yellow, calcium orange; and
 * the burning charcoal of a spark at about 1900 K, titanium about 3000 K
 * (estimate).
 */
export const CHEMISTRY = {
  strontium: [1.0, 0.08, 0.05],
  calcium: [1.0, 0.42, 0.06],
  sodium: [1.0, 0.72, 0.18],
  barium: [0.32, 1.0, 0.22],
  copper: [0.12, 0.36, 1.0],
  magnesium: [1.0, 0.98, 0.94],
} as const satisfies Record<string, readonly [number, number, number]>;
export type Chemistry = keyof typeof CHEMISTRY;

/**
 * The page-light flash limit (WCAG 2.3.1: no more than three flashes in
 * any second): a burst may light the page only if fewer than three bursts
 * have done so in the last second.
 */
export class FlashLimiter {
  private times: number[] = [];
  allow(now: number): boolean {
    this.times = this.times.filter((t) => now - t < 1000);
    if (this.times.length >= 3) return false;
    this.times.push(now);
    return true;
  }
}
