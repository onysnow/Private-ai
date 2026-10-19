/**
 * Glow-in-the-dark paint (items 25, 25f): a phosphor, as two stores of light.
 *
 * Strontium aluminate -- the green of modern glow paint -- does not fade the
 * way a single exponential would. Light excites it into two kinds of trap:
 * shallow ones that empty within a couple of seconds (the bright first
 * flare you see the moment the light goes off) and deep ones that leak for
 * minutes (the steady mid glow that is left, fading slowly to nothing). The
 * glow is what both stores give back as they empty, so it falls hard at
 * first and then sits on a plateau that sinks slowly: exactly the behaviour
 * asked for.
 *
 * (The real paint's deep traps hold for hours -- afterglow is seen up to a
 * day later -- through a broad spread of trap depths, so its decay slows as
 * it goes. The two stores are that spread in its simplest form, on times a
 * visitor will watch.)
 *
 * WHAT CHARGES IT (item 25f). Only light short of about 450 nm can lift an
 * electron into a trap: "only photons with wavelength shorter than 450 nm are
 * able to" charge SrAl2O4:Eu,Dy, whose excitation peaks in the near UV, near
 * 365-395 nm (Botterman et al., Opt. Express 23, A868, 2015; the excitation
 * band peaks about 365 nm). It glows back at 520 nm (FWHM ~85 nm), which is
 * why its own glow cannot charge it. So a black light charges it fastest of
 * all, a violet laser nearly as well, a daylight flash a little, a warm lamp
 * barely, and a red flare, a red or green laser, not at all.
 *
 * Kept in one place so the paint (components/site/GlowPaint) and its test
 * read the same numbers. Times in seconds.
 */

/** How long the shallow traps take to empty to 1/e. */
export const FAST_DECAY = 1.2;
/** How long the deep traps take to empty to 1/e. */
export const SLOW_DECAY = 45;
/** Of the light taken in, the share that lands in the shallow traps. */
export const FAST_SHARE = 0.78;
/** The colour it glows: the yellow-green of strontium aluminate. */
export const PHOSPHOR_GLOW = [0.55, 1.0, 0.62] as const;

export type PhosphorCell = { fast: number; slow: number };

/** Light falls on a cell: fill both stores, never past full. */
export function excite(cell: PhosphorCell, amount: number) {
  cell.fast = Math.min(1, cell.fast + amount * FAST_SHARE);
  cell.slow = Math.min(1, cell.slow + amount * (1 - FAST_SHARE));
}

/** Time passes for a cell. */
export function decay(cell: PhosphorCell, seconds: number) {
  cell.fast *= Math.exp(-seconds / FAST_DECAY);
  cell.slow *= Math.exp(-seconds / SLOW_DECAY);
}

/**
 * How brightly a cell glows. The shallow store is emptying fast, so it gives
 * back a lot of light per second for a little while; the deep store a little
 * for a long time. The shallow store is weighted up to show that: it is what
 * makes the first seconds blaze.
 */
export function glowOf(cell: PhosphorCell): number {
  return Math.min(1, cell.fast * 1.15 + cell.slow * 1.2);
}

/** A light, as far as a phosphor cares: its visible colour and its share of UV. */
export type ExcitingLight = { colour: readonly [number, number, number]; uv: number };

/** How much of a UV source's power the paint can use (365 nm sits in the excitation band). */
const UV_EXCITES = 1;
/**
 * The visible part's reach into the band below 450 nm, from its colour:
 * what blue it has beyond the blue a warm or green light carries anyway
 * (0.8 of its green), as a share of the whole, scaled so a violet 405 nm
 * source counts nearly as well as UV. A warm lamp comes out near 5% (a warm
 * white's share below 450 nm), a daylight flash near 12%, anything red or
 * green nothing.
 */
const VISIBLE_SCALE = 1.5;

/** The share of a light's power that charges the paint, 0 to 1. */
export function excitationShare(light: ExcitingLight): number {
  const [r, g, b] = light.colour;
  const violet = Math.max(0, b - 0.8 * g) / Math.max(r + g + b, 1e-6);
  const visible = Math.min(1, violet * VISIBLE_SCALE);
  return Math.min(1, light.uv * UV_EXCITES + (1 - light.uv) * visible);
}

/** How fast light fills the stores: a share-1 source overhead at full strength, per second. */
export const CHARGE_RATE = 1;
