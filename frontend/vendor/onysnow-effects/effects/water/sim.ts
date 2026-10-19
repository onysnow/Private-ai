/**
 * Drops on a pane of glass (task 77; docs/research/water-drops.md 6.1, 7).
 *
 * The structure -- a drop list, trail drops split off a running drop,
 * momentum-conserving merges that skip a drop's own trail, a uniform grid
 * for finding neighbours -- is ported from raindrop-fx (MIT):
 *
 *   raindrop-fx, Copyright (c) 2021 SardineFish, MIT License
 *   https://github.com/SardineFish/raindrop-fx/tree/bae4081
 *   (src/raindrop.ts, src/simulator.ts, src/spawner.ts)
 *
 * with what water-drops.md 7.2 says to change:
 *   - real units (mm, uL = mm^3) and real time, sub-stepped, so the result
 *     does not depend on the frame rate (raindrop-fx stepped a fixed 0.03 s
 *     whatever the frame time);
 *   - when a drop slides is the Furmidge retention force, not a random
 *     resistance re-rolled every 0.1-0.4 s: it slides when
 *     rho g V > k w gamma (cos thetaR - cos thetaA) (water-drops 2.2-2.3);
 *   - how fast is the friction law, U = (rho g V - F0) / (beta w eta)
 *     (Li et al. 2023; water-drops 2.4), approached over about 0.1 s,
 *     not an unbounded acceleration;
 *   - a pinning field (coarse noise over the pane) scales the hysteresis,
 *     so drops stick and slip and meander where the glass is dirtier, and a
 *     wet film left by earlier drops lowers it so later drops follow old
 *     tracks (water-drops 6.1);
 *   - a drop is removed when it has evaporated (raindrop-fx let the volume go
 *     negative and relied on the NaN), and the grid is rebuilt each pass
 *     with cells at least twice the largest reach, so no pair is missed
 *     (raindrop-fx's 30 px cells missed reaches up to 61.6 px).
 *
 * Pure TypeScript, no DOM or GL, so it can be tested on its own. x runs
 * right and y down the pane (gravity is +y), in millimetres.
 */

import {
  FRICTION_BETA,
  FURMIDGE_K,
  GRAVITY,
  LIQUIDS,
  type Liquid,
  liquidsVersion,
} from "./liquids";
import type { Wind } from "./wind";

/** The smallest drop kept; below it, gone (evaporated, or too small to see). */
export const V_MIN = 0.01;
/** The longest sub-step, s (water-drops 7.6: at most 1/60 s). */
export const MAX_SUBSTEP = 1 / 60;
/** The step the sim always takes, s: a fixed step, so the result is the same at any frame rate. */
export const SUBSTEP = 1 / 120;
/** How quickly a drop reaches its friction-law speed, s (water-drops 6.1: about 100 ms). */
export /** How quickly the drop you steer follows a change of direction, s. */
const PLAYER_TURN_TAU = 0.3;
const SPEED_TAU = 0.1;
/**
 * How far a running drop goes between trail beads, mm, and a bead's size
 * against its runner (by volume, cubed). Ony (2026-10-02): "raindrops in sort
 * of a dotted line ... when a stream runs down the glass and leaves that
 * dotted trail behind it". The film a runner draws behind it is a thin
 * thread that breaks into beads (Rayleigh-Plateau: a thread of width w
 * pinches into beads about 4.5 w apart), so the beads are small and close --
 * a dotted line -- not raindrop-fx's sparse 0.3-0.5 drops 6-8 mm apart. How
 * dense, per runner: some shed a dotted line (TRAIL_DENSE), some a sparse one.
 */
export const TRAIL_EVERY: readonly [number, number] = [1.4, 3.6];
export const TRAIL_SIZE: readonly [number, number] = [0.14, 0.26];
/** The share of runners that leave a sparse trail instead (every TRAIL_SPARSE x farther, bigger beads). */
export const TRAIL_SPARSE_SHARE = 0.35;
/**
 * What a runner leaves behind it (Ony, 2026-10-03: "water lines / no water
 * lines ... a trail that sometimes are a clear line or a line dotted with
 * little rain drops"). How much water a runner sheds into its track depends
 * on how the glass under it wets: on a cleaner strip the thread holds and
 * stays a continuous line; on a dirtier one it breaks into beads; on a
 * water-repellent patch it leaves almost nothing. Per runner, by these
 * shares (estimate, from the reference photographs): LINE, DOTTED, the rest
 * nothing.
 */
export const TRAIL_LINE_SHARE = 0.4;
/** How deep the film a runner leaves is, mm: a clear line, and a thread or damp track (estimate: wet films on glass are tens of microns). */
export const FILM_LINE_MM = 0.04;
export const FILM_THREAD_MM = 0.012;
export const TRAIL_DOTTED_SHARE = 0.35;
export type TrailMode = "line" | "dotted" | "none";
/**
 * Stick-slip (Ony: drips that "start dripping, stop and can start again").
 * The glass's grip varies over a couple of millimetres (PIN_FINE either
 * way) so a runner near its threshold stalls on a sticky spot; a gust, or
 * the patter of other drops landing, shakes the glass and frees it for a
 * moment: every GUST_EVERY seconds on average the grip drops by GUST_DROP
 * for GUST_LENGTH seconds (estimates).
 */
export const PIN_FINE = 0.3;
export const GUST_EVERY = 5;
export const GUST_DROP = 0.18;
export const GUST_LENGTH = 0.6;
/**
 * Small sliders move in bursts (Ony's rain clips, 98 checked gravity slides,
 * 2026-10-09): a burst of about SLIP_BURST s, then a rest of SLIP_REST_MIN to
 * SLIP_REST_MAX s, sliding only about 16% of the time, and most of what a
 * real window holds never moves at all. Big water -- a runner well past its
 * threshold, a stream -- runs on without stopping (clip E fronts, about a
 * quarter of the frame a second). A drop counts as small below SLIP_BELOW
 * times the volume that slides on the slipperiest glass.
 */
/**
 * A raindrop hitting the glass skids down a little on impact (Ony,
 * 2026-10-10: "the bigger the drop, the more it will drop a little bit when
 * it first hits the glass. Big ones might even start a stream if it drops a
 * little, touches another drop or hits another drop on impact"; "tiny ones
 * don't skid though"): nothing under IMPACT_FROM_UL, and from there about
 * IMPACT_SKID_MM times (volume - IMPACT_FROM_UL)^0.7 millimetres (a 3 uL
 * drop about a millimetre, 10 uL four, 20 uL six -- estimate), over the
 * first SPEED_TAU seconds; a drop it lands on is jolted the same way. A
 * drop already moving is held less than one at rest (the receding contact
 * line is already moving: kinetic against static hysteresis, KINETIC_PIN
 * of the grip), so a jolted or skidding drop that is nearly heavy enough
 * runs on.
 */
export const IMPACT_SKID_MM = 0.8;
export const IMPACT_FROM_UL = 1.5;
export const KINETIC_PIN = 0.75;
/** An impact skid's smear eases from its drop's width to its stream's over this much run, mm. */
export const IMPACT_TAIL_MM = 4;
/** Above this speed a runner's rear is a cusp and pearls (mm/s, estimate: the fast heads of clip E, 40+ mm/s, trail beads; slow creepers leave a film). */
export const PEARL_SPEED = 30;
export const SLIP_BURST = 0.17;
export const SLIP_REST_MIN = 0.5;
export const SLIP_REST_MAX = 1.1;
/*
 * By volume, continuously (Ony, 2026-10-09: "the more drops that merge into
 * the stream the faster and more consistent the flow, so less start and
 * stop"): the rests and the burst fade out between the threshold and this
 * multiple of it (was 2.5: a head that had just let go crept in bursts a
 * fifth of the time for most of its run, and the GIF showed streams that
 * hardly moved).
 */
export const SLIP_BELOW = 2.2;
/** In a burst a small drop moves faster than its steady speed: the clips' bursts are about 2.8x their slides' mean speed. */
export const SLIP_BURST_SPEED = 1.8;
export const TRAIL_SPARSE = 3;
/** The film grid's cell, mm, and how fast a film dries, 1/s (estimate: about 20 s). */
export const FILM_CELL = 2;
export const FILM_DRY = 1 / 20;
/**
 * A stream is water on the move, not a mark on the glass (Ony, 2026-10-09:
 * "the track moves down and as the water flows the tail thins, shortens and
 * the stream slowly disappears leaving behind some drops along the path").
 * Behind the running head its wake drains down into it: the standing water
 * a runner lays (WaterDrops STAND_*, the wet map's G) thins away at this
 * rate, so the oldest, uppermost part of the wake goes first -- the tail
 * recedes -- and a few seconds after the head stops the stream is gone,
 * leaving its film line and the beads it shed. Was 1/60: a track stood for
 * a minute and was re-wetted by every pulse, so the picture was frozen
 * streams with a moving skin. Clip E: a stream's visible life is about 1.3
 * s at the head, the drained line a few seconds more. The lane goes with it.
 */
export const RIVULET_DRY = 1 / 5;
/**
 * A stream's lane (docs/research-streams.md): the sim owns every standing
 * stream at the width it is drawn, on a LANE_CELL mm grid, and counts it as
 * water while it stands above LANE_SEEN (the level the map still draws). A
 * line runner's lane is the stream as drawn (streamWidth, streamShift),
 * LANE_SHARE times its half-width for the map's soft edge. In the catalogue's 233
 * streams the lanes are clear: drops sit beside a stream, within a width of
 * its edge, never in it (38 of 55 noted "none on it").
 */
export const LANE_CELL = 1;
export const LANE_SHARE = 1.25;
export const LANE_SEEN = 0.05;
/**
 * How much of the glass's grip a standing stream takes away: on a wet lane a
 * drop's contact line has no dry glass to pin to, so rain landing in the
 * lane runs down it at once -- the pulses that keep a real stream flowing
 * (Ony, 2026-10-09: "drops are supposed to follow the path of least
 * resistance"). 0.9: a 1 uL raindrop runs where dry glass holds 9.
 */
export const LANE_SLIP = 0.9;
/**
 * How much of the grip a track's wet film takes away (was 0.5): once a
 * stream has drained, its track stays the path the next raindrop runs
 * down, for as long as the film lasts (FILM_DRY) -- the streams of a real
 * window keep re-forming in the same places.
 */
export const FILM_SLIP = 0.9;
/**
 * Spray too fine to see as drops lands as mist: volume per FILM_CELL cell,
 * which condenses into a drop once a cell holds MIST_CONDENSE uL
 * (liquids-spray.md 5.3: "condense into a drop at >= 0.5 uL in a 2 mm
 * cell", estimate), and dries meanwhile at MIST_DRY of itself a second
 * (estimate: a fine mist on glass is gone in under a minute).
 */
export const MIST_CONDENSE = 0.5;
export const MIST_DRY = 1 / 30;
/** The pinning field's cell, mm, and how far it moves the hysteresis either way (estimate). */
export const PIN_CELL = 6;
/** How strongly a drop is steered sideways by the field's gradient, mm (estimate; was 1: its 6 mm cells held a slant straight for a centimetre). */
export const MEANDER = 0.3;
/**
 * The glass's fine dirt, mm, and how hard it steers (estimate). Ony
 * (2026-10-02): streams are "never in a straight line"; they "zig zag as
 * they can tend to form where raindrops already are when the surface
 * tension pulls them one way or another". A runner's front meets clean and
 * dirty spots a couple of millimetres across and is deflected by each, and
 * it bends toward any drop just ahead of it (CAPTURE_REACH), which its
 * front touches and pulls it into before it merges.
 */
export const FINE_CELL = 4;
/*
 * 233 hand-traced streams: a stream wanders by about 0.7 of its own width,
 * slowly (a full wiggle over about 45 widths), leaning about 3 degrees: the
 * fine dirt nudges it, it does not zig-zag at every speck (was 0.9). The
 * dirt's cell went 1.6 to 4 mm and the lag 3 to 5 mm (2026-10-09): at 1.6
 * the front swung every couple of millimetres, a chain of short straight
 * strokes at alternating angles; a bend's radius is several widths
 * (Le Grand-Piteira et al.: 2.5-15).
 */
export const MEANDER_FINE = 0.3;
/** How far ahead and to the side a runner feels a drop, in its radii plus mm. */
export const CAPTURE_REACH = 2.5;
/**
 * How far a runner's front runs before it has turned aside, mm: a lag in
 * distance, not time, so a fast pulse wiggles at the same scale as a slow
 * creeper (Ony, 2026-10-09: the fast runs came out as straight rods -- at
 * 50 mm/s a 0.08 s lag was 4 mm of straight line before any turn). A few
 * millimetres: a bend rounds over that, never a corner.
 */
export const SIDE_LAG_MM = 5;
/** The least speed the lag is reckoned at, mm/s (a creeper turns within SIDE_LAG_MM / this seconds). */
export const SIDE_LAG_FLOOR = 4;
/**
 * Sideways, a runner leans at most this (tan): the catalogue's streams
 * lean 3 degrees on average, the clips' slides stay within about 21; a
 * slant held straight for a centimetre is a crack, not water (Ony,
 * 2026-10-09: "straight diagonal angles ... do not occur").
 */
export const SIDE_MAX = 0.12;
/**
 * A runner's front is drawn back toward the line it has been running down
 * (per mm off it, as a share of its speed), over MEANDER_MEMORY mm of run:
 * a lean is never held for long -- the path bends back and over, a slow
 * sinuous wander (Le Grand-Piteira et al.: meanders, not slants), not a
 * straight slant for a centimetre (Ony, 2026-10-09: "diagonal parts of
 * streams going too long").
 */
export const MEANDER_BACK = 0.08;
/** After a merge moves a runner's water sideways, its drawn track eases over to it across this much run, mm. */
export const TRACK_EASE_MM = 2.5;
export const MEANDER_MEMORY = 12;
/** In a standing stream's lane a runner is held to the lane's centre, as a share of its speed per mm off it. */
export const LANE_FOLLOW = 0.25;
export const CAPTURE_PULL = 0.9;
/** How hard a runner's front is drawn toward wet glass just ahead of it (a share of its speed per unit of wetness across it). */
export const WET_FOLLOW = 0.6;
/** How long a merged drop takes to pull round again, s (was 300: Ony, 2026-10-09, "watch out for blobs" -- a mass of lobes that sat for minutes read as a sculpture; a minute keeps the merged shapes the photographs show without that). */
export const SKEW_RELAX = 60;
/**
 * The most lobes a drop keeps (Ony, 2026-10-02: "rain drops aren't always
 * round when they bunch together ... weird shapes that aren't even circles
 * at all"). Two resting drops that touch do not pull into one circle: their
 * contact lines stay pinned where each was, so the merged drop is the two
 * footprints joined by a neck -- a peanut, a clover, a lumpy blob after
 * three or four -- and only creeps round over tens of seconds. A drop is
 * kept as up to this many parts, each a cap at its own place with its share
 * of the volume; past it, the two closest parts are joined.
 */
export const MAX_PARTS = 7;
/** Drops landing at least this big (uL) splash into an uneven footprint. */
export const SPLASH_MIN = 0.15;

/** A spherical cap's contact radius and height from its volume and contact angle (water-drops 2.1). */
const halfTan = new Map<number, number>();
export function capOf(volume: number, thetaDeg: number): { a: number; h: number } {
  let t = halfTan.get(thetaDeg);
  if (t === undefined) {
    t = Math.tan((thetaDeg * Math.PI) / 360);
    halfTan.set(thetaDeg, t);
  }
  // V = pi a^3 t (3 + t^2) / 6, with h = a t.
  const a = Math.cbrt((6 * Math.max(volume, 0)) / (Math.PI * t * (3 + t * t)));
  return { a, h: a * t };
}

/** The equilibrium contact angle, between the advancing and receding ones. */
export const restAngle = (l: Liquid) => (l.thetaA + l.thetaR) / 2;
/**
 * The glass never wets evenly: each drop sits on its own patch, its contact
 * angle 25 degrees under to 12 over the glass's own, so its footprint is
 * this times the even-glass radius (the renderer draws it so; the merge
 * test uses it, so two drops that look as if they touch have touched).
 */
export function patchScale(serial: number, thetaDeg: number): number {
  const th2 = Math.min(120, Math.max(18, thetaDeg - 25 + 37 * hash01(serial, 7)));
  return capOf(1, th2).a / capOf(1, thetaDeg).a;
}
/**
 * Two drops whose edges come within this of each other join (mm): the
 * first contact of two drops is all but instant -- a capillary bridge forms
 * in microseconds and pulls them together (Ony, 2026-10-10: "the initial
 * contact happens extremely fast"), so a drop never sits a hair from its
 * neighbour looking as if it touches.
 */
export const MERGE_SNAP_MM = 0.3;

/**
 * Wind on the water (src/effects/water/wind.ts; Ony, 2026-10-10). Air along
 * the glass drags on a drop roughly as rho_air U^2 over its frontal area (its
 * width times its height), against a weight that goes as its width squared
 * times its height: the push over the weight goes as U^2 / a, so the wind
 * moves small water relative to its weight more than big (the windshield
 * study, Phys. Rev. Fluids 2022: in a wind up the glass small drops climb,
 * big ones still fall, the middling hover). A drop sits in the air's
 * boundary layer at the glass, so it feels much less than the free wind:
 * WIND_PUSH puts a 1.5 mm drop's push at about 0.35 of its weight in a
 * 20 mph wind and 2.2 times in 50 mph (estimates; shedding experiments,
 * Milne & Amirfazli: water drops of tens of uL shed at about 8-20 m/s).
 */
export const WIND_PUSH = 0.0065;
/** Water gathered against a bottom frame drips off once a pool holds about this much, uL (a pendant drop's limit at a wetted edge, estimate). */
export const DRIP_UL = 28;
/** The breeze the rain types' rates were set in, mph (a little wind is always there: rain falling straight down barely touches a vertical window). */
export const BREEZE_MPH = 8;
/** The push is capped at this many times a drop's weight (a gale tears water off before it pushes harder). */
export const WIND_PUSH_MAX = 6;
/** How far behind a frame's edge its lee (the shelter) and its stagnation (the swirl) reach, mm. */
export const FRAME_LEE_MM = 14;
/** A raindrop's fall speed for the slant of its impact, m/s (terminal speeds 4-9). */
export const RAIN_FALL_MS = 6.5;
/** What the wind effects are turned up or down by (the Lab's Wind group), 1 as estimated. */
export type WindEffects = {
  push: number;
  lean: number;
  wobble: number;
  strip: number;
  shudder: number;
  spray: number;
  drying: number;
  frame: number;
};
export const WIND_EFFECTS: WindEffects = {
  push: 1,
  lean: 1,
  wobble: 1,
  strip: 1,
  shudder: 1,
  spray: 1,
  drying: 1,
  frame: 1,
};

/** The weight of a drop of `volume` uL, N. */
export function weight(volume: number, l: Liquid): number {
  return l.rho * GRAVITY * volume * 1e-9;
}

/** The Furmidge retention force on a drop of contact radius `a` mm, N, with the hysteresis scaled by `pin`. */
export function retention(a: number, l: Liquid, pin = 1): number {
  const dc = Math.cos((l.thetaR * Math.PI) / 180) - Math.cos((l.thetaA * Math.PI) / 180);
  return FURMIDGE_K * 2 * a * 1e-3 * l.gamma * dc * pin;
}

/** The friction-law speed of a drop, mm/s (0 if it is held). */
export function slideSpeed(volume: number, l: Liquid, pin = 1): number {
  const { a } = capOf(volume, restAngle(l));
  const excess = weight(volume, l) - retention(a, l, pin);
  if (excess <= 0) return 0;
  return (excess / (FRICTION_BETA * 2 * a * 1e-3 * l.eta)) * 1e3;
}

/** The volume at which a drop starts to slide, uL (bisection on the Furmidge balance). */
export function slideThreshold(l: Liquid, pin = 1): number {
  let lo = 1e-4;
  let hi = 1e4;
  for (let k = 0; k < 80; k++) {
    const mid = Math.sqrt(lo * hi);
    if (slideSpeed(mid, l, pin) > 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** A hash of two integers to [0, 1): what raindrop-fx re-rolled, fixed per drop and event so it doesn't hang on the frame rate. */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export type SimOptions = {
  /** The pane, mm. */
  width: number;
  height: number;
  seed?: number;
  /** At most this many drops (water-drops 7.6: 400 a page). */
  maxDrops?: number;
  /** How far the pinning field moves the hysteresis either way (0: clean, uniform glass). */
  pinning?: number;
  /** Whether running drops leave trail drops. */
  trails?: boolean;
  /** Whether drops evaporate (off only for tests that count volume). */
  evaporate?: boolean;
};

/*
 * ---- A stream's geometry: shared by the sim (its lane) and the renderer (its drawn track) ----
 */
/** A stream reaches its full width over this many of its drop's radii of run (times the stream's own TAPER_SPREAD). */
export const TRAIL_TAPER = 6;
/**
 * How a stream starts is its own (Ony, 2026-10-09: "All the streams have
 * the same tail end"; the catalogue's 205 noted starts: a fifth enter from
 * the top edge, a sixth taper in from nothing, a tenth hang from a drop or
 * bulb they let go from, the rest start under a drop or in a lane). The
 * taper's length runs from half to twice TRAIL_TAPER by the stream's hash,
 * and its thinnest width from 0.2 to 0.6 of full.
 */
export function trackTaper(id: number, run: number, a: number, from = 0): number {
  /*
   * A smooth curve from the thinnest width to full, never a flat stretch
   * (Ony, 2026-10-09: "a small straight consistent thickness length right
   * at the start on most of the streams" -- max(floor, curve) held the floor
   * for the first half of the reach). Reach a third to two and a half times
   * TRAIL_TAPER radii; the thinnest a point (a sixth of starts taper in from
   * nothing) up to half width, most of them thin.
   */
  const reach = TRAIL_TAPER * a * (0.3 + 2.2 * hash01(id, 515));
  const grown = Math.min(1, run / reach);
  // Never under a tenth: thinner drew as a hair-line spike (Ony, 2026-10-10: a stream with a second thin pointed head at its top).
  const floor = 0.1 + 0.4 * hash01(id, 516) ** 2;
  /*
   * Widening from its first millimetre (Ony, 2026-10-10: "make sure the
   * tails don't have the perfect half circle, and small segment of
   * consistent length+thickness"): a smoothstep starts flat, so the first
   * stretch held the floor's width and ended in that width's round cap. A
   * curve rising at once (its power 0.5-0.9 by the stream), and the very
   * top drawn in from almost nothing over 0.5-1.7 mm, so no stream ends in
   * a cap of its own width.
   */
  const rise = grown ** (0.5 + 0.4 * hash01(id, 519));
  // Drawn in from where it started (an impact smear's run is counted on, but its top is still drawn in), and ragged there: torn from the glass, never a clean round cap.
  const since = Math.max(0, run - from);
  const lead = Math.min(1, since / (0.5 + 1.2 * hash01(id, 520))) ** 0.5;
  const rag = 1 + 0.45 * (smoothNoise(id, since / 0.45, 9) - 0.5) * 2 * Math.max(0, 1 - since / 3);
  return (floor + (1 - floor) * rise) * (0.08 + 0.92 * lead) * rag;
}
/**
 * When a resting drop lets go: the share of its water it leaves where it
 * sat, as a bulb the stream hangs from (0: a clean start). Not one size
 * (Ony, 2026-10-09: "No stream should have a perfect symmetrical half
 * circle end!! Let alone a bunch of them next to each other"): a little
 * under half leave anything, from a bead of a twelfth to nearly half, and a
 * heavy drop may leave more than half -- the stream hangs from the drop
 * that fed it.
 */
export function letGoRemnant(id: number, volume: number, threshold: number): number {
  // A quarter leave anything: most a bead (a twelfth to a quarter), off to one side of the stream's start (the let-go event places it).
  const h = hash01(id, 517);
  if (h > 0.25) return 0;
  return 0.08 + 0.17 * hash01(id, 519) ** 1.5;
}
/**
 * How much standing water a stream holds at a point, by how far down its
 * own length the point is (`since`, mm from where its track began): a
 * stream drains downward, so its top holds least and goes first, its foot
 * most (Ony, 2026-10-09: bottom heavy; 2026-10-10: the tail thins and
 * shortens as the water flows). From a third at its start to full over
 * STAND_GROW_MM. The renderer draws the stream's standing water the same.
 */
export const STAND_GROW_MM = 60;
export function standLevel(since: number): number {
  return 0.35 + 0.65 * Math.min(1, Math.max(0, since) / STAND_GROW_MM);
}
/**
 * How wide a runner's stream is here, as a share of its drop's radius (Ony,
 * 2026-10-04: "It would most likely get thinner towards the top. Not keep
 * bulging randomly"). A thread where the drop let go, widening steadily over
 * its first STREAM_GROW_MM of run as it gathers what it passes; the drop's
 * own radius grows as it swallows drops, so the stream steps wider below each
 * one it took. Along it only a gentle, smooth unevenness, never bulges.
 */
export const STREAM_GROW_MM = 8;
/**
 * `id` is the track's (DropSim.trackId: a pulse running down an earlier
 * stream's lane takes that stream's id), `y` the point on the pane, mm: the
 * swells and necks along a stream are the glass's -- where the contact line
 * caught -- so a later runner down the same path swells and necks in the
 * same places instead of fattening the lane into a band (every pulse's own
 * lumps, MAX-blended into the map, summed to a rod of the widest width).
 */
export function streamWidth(id: number, run: number, y: number): number {
  // The catalogue's heads are 1.5-2.5x their body's width: the body 0.4-0.67 of the head's diameter.
  const share = 0.45;
  // Each stream its own width: a thin thread, or a wide flat rivulet (reference A, 1 and 3).
  const girth = 0.7 + 0.6 * hash01(id, 911) ** 2;
  /*
   * 233 streams traced by hand in 40 of 117 photographs
   * (docs/rain-reference-catalogue.md, "Streams measured"): past its first few
   * millimetres a stream keeps its width (bottom against top: median 1.0);
   * one in six widens down its length (to up to twice), one in six narrows
   * (to about 0.6), and along it the width varies by about 16%.
   */
  // Thin where it let go (trackTaper has the curve; this only keeps the first millimetre from a needle).
  const start = 0.7 + 0.3 * Math.min(1, run / STREAM_GROW_MM);
  const kind = hash01(id, 913);
  const along = Math.min(1, run / 120);
  /*
   * Bottom heavy by default (Ony, 2026-10-09: "streams need to be bottom
   * heavy ... since it flows down"): most widen by a third over their run,
   * a sixth by a full width, a sixth narrow (the catalogue's medians said
   * 1.0 bottom over top; he wants the drained look, thin above, full below).
   */
  const trend = kind < 0.16 ? 1 + along : kind > 0.82 ? 1 - 0.3 * along : 1 + 0.35 * along;
  /*
   * Along it the edges are lumpy, never two parallel lines (Ony, 2026-10-08:
   * the streams read as rods -- straight, even, hard-edged): it swells where
   * water gathered and necks between, every few millimetres, on top of a
   * slower drift.
   */
  // Gentle necks: a neck under about two thirds of the swell read as a chain of sausages (Ony, 2026-10-10).
  // Lumpy along it, never a rod (Ony, 2026-10-09/10): swells and necks every few mm on a slower drift, short of a chain of sausages.
  const wobble =
    0.62 +
    0.42 * smoothNoise(id, y / 3, 0) +
    0.32 * smoothNoise(id, y / 10, 1) +
    0.12 * smoothNoise(id, y / 1.3, 3);
  return share * girth * start * trend * wobble;
}

/** Smooth value noise along a stream's run, 0-1 (seeded by the runner and a channel). */
export function smoothNoise(id: number, c: number, ch: number): number {
  const k = Math.floor(c);
  const f = c - k;
  const sf = f * f * (3 - 2 * f);
  return hash01(id * 7 + ch, k) * (1 - sf) + hash01(id * 7 + ch, k + 1) * sf;
}

/**
 * How far a stream's centre line strays sideways from the runner's path, as
 * a share of its width: the contact line catches on one side and lets go on
 * the other, so its two edges wander apart and together, not in step. By
 * the track's id and the point on the pane (see streamWidth).
 */
export function streamShift(id: number, y: number): number {
  // A slow wander (the catalogue: about 0.7 widths over tens of widths) and a small quick one that keeps the two edges out of step.
  return (
    0.35 * (smoothNoise(id, y / 10, 2) - 0.5) * 2 + 0.2 * (smoothNoise(id, y / 2.6, 4) - 0.5) * 2
  );
}
/** The wander in mm at a half-width: a share of the width, but no more than a millimetre's worth, so a wide stream's centre never slants sharply across its path. */
export function streamShiftMm(id: number, y: number, rw: number): number {
  return streamShift(id, y) * Math.min(rw, 1) * 2;
}

/**
 * The drops on one pane: a struct of arrays, swap-removed. A drop's id
 * (`serial`) is stable; its index is not.
 */
export class DropSim {
  readonly width: number;
  readonly height: number;
  readonly max: number;
  readonly seed: number;
  pinning: number;
  trails: boolean;
  evaporate: boolean;
  count = 0;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** Volume, uL (mm^3). */
  readonly vol: Float64Array;
  readonly liquid: Uint8Array;
  readonly serial: Int32Array;
  /** The drop it was shed from (-1: none): not merged with it, nor with its siblings. */
  readonly parent: Int32Array;
  /** How far it has run since it last shed a trail drop, mm; and how many it has shed. */
  readonly run: Float64Array;
  readonly shed: Int32Array;
  /** How far each drop has run in all, mm: the stream's width and wander are functions of it (streamWidth, streamShift). */
  readonly ran: Float64Array;
  /**
   * The track a runner is on: its own serial, or the id of the earlier
   * stream whose lane it runs down (streamWidth, streamShift: the swells,
   * necks and wander belong to the path on the glass, so a pulse retraces
   * them). A pearl it sheds carries this as its parent.
   */
  readonly trackId: Int32Array;
  /** The half-width of the lane a runner is running down, mm (0 on glass of its own): its track is at least this wide (see the substep). */
  readonly laneWidth: Float64Array;
  /** The track a runner came from and how far it has blended into the one it took (0-1 over a few mm): the join is a curve, not a step. */
  readonly trackWas: Int32Array;
  readonly trackMix: Float64Array;
  /** The x a runner's path has been running down lately, mm (an average over MEANDER_MEMORY of run). */
  readonly pathX: Float64Array;
  /** How far a runner's drawn track still sits off its centre after a merge moved it, mm (eases to 0 over TRACK_EASE_MM of run). */
  readonly trackOff: Float64Array;
  /** How much wider than its stream a drop's track is just after an impact skid (eases to 1 over IMPACT_TAIL_MM of run). */
  readonly tailBoost: Float64Array;
  /** Where (in its run) a drop's track began: an impact smear's run is counted from past the taper, its top drawn in from here. */
  readonly ranStart: Float64Array;
  /**
   * Coalescence (Ony, 2026-10-10: "the initial surfaces fusing [is quick],
   * but it takes longer if the drop is bigger for it to be absorbed"): after
   * a merge the two footprints stay as the merged drop's lobes, joined at
   * once by the neck, and the lobes pull together over fuseTau seconds --
   * longer the bigger the smaller drop -- until fuseUntil (clock).
   */
  readonly fuseTau: Float64Array;
  readonly fuseUntil: Float64Array;
  /** How fast a stream's standing water drains away, 1/s (RIVULET_DRY; the Lab's "Stream drains in"). */
  rivuletDry = RIVULET_DRY;
  /** The wet film earlier drops left, 0-1, in FILM_CELL cells. */
  readonly film: Float32Array;
  /**
   * Where a clear line's rivulet stands, on the film's grid: 1 fresh, thinning
   * at RIVULET_DRY a second. Rain landing on it runs into it, so nothing sits
   * on a stream (Ony, 2026-10-04: the stream "going on top of other drops").
   */
  readonly rivulet: Float32Array;
  /** Which runner (serial) laid each rivulet cell: a drop does not drain into its own line. */
  readonly rivuletBy: Int32Array;
  /** Which track (trackId) each rivulet cell belongs to: a pulse down it takes the track's id and re-wets it at its width. */
  readonly laneTrack: Int32Array;
  /** The rivulet (lane) grid is finer than the film's: LANE_CELL mm. */
  readonly laneCols: number;
  readonly laneRows: number;
  /** Each lane cell's half-width, mm, as its stream was laid: a pulse re-wets the lane at that width. */
  readonly laneHalf: Float32Array;
  private drainClock = 0;
  readonly filmCols: number;
  readonly filmRows: number;
  /** Mist: spray volume not yet a drop, uL per FILM_CELL cell, and which liquid. */
  readonly mist: Float32Array;
  readonly mistLiquid: Uint8Array;
  /** Bumped whenever the mist changes, for a renderer that uploads it. */
  mistVersion = 0;
  private nextSerial = 1;
  private readonly pinField: Float32Array;
  private readonly pinCols: number;
  private readonly pinRows: number;
  /** Merges in the last step (volume-weighted, for the renderer's splat). */
  merges = 0;
  /**
   * The parts a merge leaves (MAX_PARTS): drop i's part k is at
   * (x + partX, y + partY) mm with partF of its volume, k < partN[i]; slot
   * i * MAX_PARTS + k. The offsets creep in over SKEW_RELAX; a running drop
   * pulls round at once.
   */
  readonly partX: Float64Array;
  readonly partY: Float64Array;
  readonly partF: Float64Array;
  readonly partN: Uint8Array;
  /** Moved, grew or is new since the last merge test: only these can have come to touch another. */
  private readonly dirty: Uint8Array;
  /**
   * The drop you steer (the drop page, Ony 2026-10-10: "control a drop of
   * water with the arrow keys or controller"): its serial (-1: none), the
   * push you give it in its own weights, and how much of the glass's grip it
   * feels (it is the one that moves: enough to go where you send it, still
   * water on glass -- it merges, grows, leaves its trail).
   */
  /**
   * What the bottom edge is (Ony, 2026-10-10: streams "need to actually hit
   * the bottom of the edge. and either disappear because it's a window and it
   * goes out of sight or it hits the edge and then pools on the bottom ...
   * until it drips"). false: the glass goes on past the pane (the site's
   * panes are sections of a window) -- water runs on out of sight. true: a
   * frame -- water comes to rest against it, gathers along it as drops join,
   * and a pool heavy enough drips off (DRIP_UL).
   */
  bottomPool = false;
  player = -1;
  playerPush: [number, number] = [0, 0];
  playerGrip = 0.35;
  /** The share of the friction law's speed the steered drop goes at while you steer it. */
  playerSpeed = 0.15;
  /** A fixed sideways push, as a share of the weight (the old rain type wind; tests). */
  wind = 0;
  /** The wind along the glass (wind.ts), or none. */
  windModel: Wind | null = null;
  /** How much of each wind effect (the Lab). */
  windFx: WindEffects = { ...WIND_EFFECTS };
  /** Each drop's drive this step, in weights: gravity (0, 1) plus the wind's push. */
  readonly driveX: Float64Array;
  readonly driveY: Float64Array;
  /** Strip events so far (each drop's own count, for its hashes). */
  private stripN = 0;
  /** The wind's speed at the pane's middle at the last step, mph, and a shudder of the pane left, s. */
  windMph = 0;
  private windWas = 0;
  private shudderLeft = 0;
  private shudderSize = 0;

  constructor(o: SimOptions) {
    this.width = o.width;
    this.height = o.height;
    this.max = o.maxDrops ?? 400;
    this.seed = o.seed ?? 1;
    this.pinning = o.pinning ?? 0.35;
    this.trails = o.trails ?? true;
    this.evaporate = o.evaporate ?? true;
    const n = this.max;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.vol = new Float64Array(n);
    this.liquid = new Uint8Array(n);
    this.serial = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.run = new Float64Array(n);
    this.shed = new Int32Array(n);
    this.ran = new Float64Array(n);
    this.trackId = new Int32Array(n);
    this.laneWidth = new Float64Array(n);
    this.trackWas = new Int32Array(n);
    this.trackMix = new Float64Array(n);
    this.pathX = new Float64Array(n);
    this.trackOff = new Float64Array(n);
    this.tailBoost = new Float64Array(n);
    this.ranStart = new Float64Array(n);
    this.fuseTau = new Float64Array(n);
    this.fuseUntil = new Float64Array(n);
    this.partX = new Float64Array(n * MAX_PARTS);
    this.partY = new Float64Array(n * MAX_PARTS);
    this.partF = new Float64Array(n * MAX_PARTS);
    this.partN = new Uint8Array(n);
    this.dirty = new Uint8Array(n);
    this.driveX = new Float64Array(n);
    this.driveY = new Float64Array(n).fill(1);
    this.filmCols = Math.max(1, Math.ceil(o.width / FILM_CELL));
    this.filmRows = Math.max(1, Math.ceil(o.height / FILM_CELL));
    this.film = new Float32Array(this.filmCols * this.filmRows);
    this.laneCols = Math.max(1, Math.ceil(o.width / LANE_CELL));
    this.laneRows = Math.max(1, Math.ceil(o.height / LANE_CELL));
    this.rivulet = new Float32Array(this.laneCols * this.laneRows);
    this.rivuletBy = new Int32Array(this.laneCols * this.laneRows).fill(-1);
    this.laneTrack = new Int32Array(this.laneCols * this.laneRows).fill(-1);
    this.laneHalf = new Float32Array(this.laneCols * this.laneRows);
    this.mist = new Float32Array(this.filmCols * this.filmRows);
    this.mistLiquid = new Uint8Array(this.filmCols * this.filmRows);
    this.pinCols = Math.max(2, Math.ceil(o.width / PIN_CELL) + 1);
    this.pinRows = Math.max(2, Math.ceil(o.height / PIN_CELL) + 1);
    this.pinField = new Float32Array(this.pinCols * this.pinRows);
    for (let i = 0; i < this.pinField.length; i++) {
      this.pinField[i] = hash01(this.seed * 7919 + 13, i) * 2 - 1;
    }
  }

  /** Add a drop (returns its index, or -1 if full or too small). */
  add(x: number, y: number, volume: number, liquid = 0, parent = -1): number {
    if (this.count >= this.max || !(volume >= V_MIN)) return -1;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vol[i] = volume;
    this.liquid[i] = liquid;
    this.partN[i] = 1;
    this.partX[i * MAX_PARTS] = 0;
    this.partY[i * MAX_PARTS] = 0;
    this.partF[i * MAX_PARTS] = 1;
    this.keepOn(i);
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vol[i] = volume;
    this.liquid[i] = liquid;
    this.serial[i] = this.nextSerial++;
    this.parent[i] = parent;
    this.run[i] = 0;
    this.shed[i] = 0;
    this.ran[i] = 0;
    this.trackId[i] = this.serial[i]!;
    this.laneWidth[i] = 0;
    this.trackWas[i] = this.serial[i]!;
    this.trackMix[i] = 1;
    this.pathX[i] = x;
    this.trackOff[i] = 0;
    this.tailBoost[i] = 1;
    this.ranStart[i] = 0;
    this.fuseTau[i] = 0;
    this.fuseUntil[i] = 0;
    this.dirty[i] = 1;
    this.partN[i] = 1;
    this.partX[i * MAX_PARTS] = 0;
    this.partY[i * MAX_PARTS] = 0;
    this.partF[i * MAX_PARTS] = 1;
    return i;
  }

  /**
   * Add liquid at a point (a spray droplet landing): into the drop it lands
   * on if there is one, else a new drop. Returns the index it went to.
   */
  addVolume(x: number, y: number, volume: number, liquid = 0): number {
    /*
     * Onto the fresh wet film of a track: it spreads into the film, never
     * sits on top. Into a standing stream's lane it lands as a drop that
     * runs at once (pinAt: a lane holds nothing back) -- the pulse that
     * feeds the stream; the drain below never takes a running drop.
     */
    const aLand = capOf(volume, restAngle(LIQUIDS[liquid] ?? LIQUIDS[0]!)).a;
    const inLane = this.touchesLane(x, y, aLand);
    // A droplet too small to run spreads into a fresh film; a raindrop on the film is a drop that runs down the track.
    if (!inLane && this.filmAt(x, y) > 0.3 && volume < 0.3) {
      this.filmVolume += volume;
      return -1;
    }
    // The skid of its impact, mm/s over SPEED_TAU (none for a drop too light to skid).
    const skid =
      volume > IMPACT_FROM_UL
        ? (IMPACT_SKID_MM * Math.pow(volume - IMPACT_FROM_UL, 0.7)) / SPEED_TAU
        : 0;
    /*
     * Which way it skids: the way it was moving along the glass when it hit
     * -- down at its fall speed, and with the wind it was carried in (rain
     * blown at a slant hits at a slant, and skids and splashes downwind).
     */
    let kx = 0;
    let ky = 1;
    let slant = 0;
    if (this.windModel) {
      const [wx, wy] = this.windAt(x, y);
      const vy = RAIN_FALL_MS + wy;
      const m = Math.hypot(wx, vy) || 1;
      kx = wx / m;
      ky = vy / m;
      slant = Math.min(1, Math.hypot(wx, wy) / RAIN_FALL_MS);
      // Spray: in a strong wind a raindrop bursts on impact, and the wind carries the mist of it on over the glass.
      if (this.windFx.spray > 0 && volume > IMPACT_FROM_UL && this.windMph > 15)
        this.sprayFrom(x, y, kx, ky, volume, aLand, liquid);
    }
    // A raindrop that hits water already on the glass splashes (below), whether it lands in it or at its edge.
    let hit = false;
    for (let i = 0; i < this.count; i++) {
      if (this.liquid[i] !== liquid) continue;
      const a = this.radius(i);
      const dx = this.x[i]! - x;
      const dy = this.y[i]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < (a + aLand) * (a + aLand)) hit = true;
      if (d2 < a * a) {
        this.grow(i, x, y, volume);
        // Jolted by the hit: the momentum shared over all the water there, and a smear as wide as the water (impactTail).
        if (skid > 0) {
          const jolt = (skid * volume) / this.vol[i]!;
          this.vy[i] = ky >= 0 ? Math.max(this.vy[i]!, jolt * ky) : jolt * ky;
          this.vx[i] = this.vx[i]! + jolt * kx;
          this.impactTail(i);
        }
        if (volume > IMPACT_FROM_UL)
          this.splashSpecks(x, y, volume, this.radius(i), liquid, kx * slant, ky * slant);
        return i;
      }
    }
    const j = this.add(x, y, volume, liquid);
    if (j >= 0) {
      this.splash(j);
      if (skid > 0) {
        this.vy[j] = skid * ky;
        this.vx[j] = skid * kx;
        this.impactTail(j);
      }
      if (hit && volume > IMPACT_FROM_UL)
        this.splashSpecks(x, y, volume, aLand, liquid, kx * slant, ky * slant);
    }
    return j;
  }

  /**
   * A drop skidding from an impact smears a track as wide as itself, not a
   * thin stream (Ony, 2026-10-10: "when larger drops impact they need a
   * tail that reflects the size of the drop so there is not an immediate
   * size difference like a sperm cell"): its track starts at full width
   * (its run counted past the taper) and about twice its stream's width,
   * easing to its stream's over IMPACT_TAIL_MM.
   */
  private impactTail(i: number) {
    const a = this.radius(i);
    if (this.ran[i]! < TRAIL_TAPER * a * 2.6) {
      this.ran[i] = TRAIL_TAPER * a * 2.6;
      this.ranStart[i] = this.ran[i]!;
    }
    this.tailBoost[i] = 1.6 + 0.5 * hash01(this.serial[i]!, 531);
  }

  /**
   * Spray (Ony, 2026-10-10): a raindrop bursting on the glass in a strong
   * wind, or water torn off a drop, goes partly to a mist the wind carries
   * on over the glass: a fine dusting downwind, which beads into droplets
   * where enough gathers (the sim's mist).
   */
  private sprayFrom(
    x: number,
    y: number,
    dx: number,
    dy: number,
    volume: number,
    around: number,
    liquid: number,
  ) {
    const k = Math.min(1, (this.windMph - 15) / 25) * this.windFx.spray;
    const n = Math.round(4 + 10 * k);
    const seed = this.nextSerial * 37 + 11;
    for (let q = 0; q < n; q++) {
      const spread = (hash01(seed, q * 3) - 0.5) * 1.1;
      const c = Math.cos(spread);
      const sn = Math.sin(spread);
      const ux = dx * c - dy * sn;
      const uy = dx * sn + dy * c;
      const d = around + 1 + (3 + 14 * k) * hash01(seed, q * 3 + 1);
      this.mistAt(
        x + ux * d,
        y + uy * d,
        volume * 0.004 * k * (0.5 + hash01(seed, q * 3 + 2)),
        liquid,
      );
    }
  }

  /**
   * Stripping (Ony, 2026-10-10): in a strong enough wind the air tears water
   * off a big drop's downwind edge and flings it on over the glass as small
   * drops, with a mist; a drop that oscillates hard in a gust sheds the most
   * (Milne & Amirfazli: drops shape-oscillate before they shed). From a push
   * of about its own weight on, more the harder and the bigger the drop.
   */
  private strip(i: number, a: number, dt: number) {
    const v = this.vol[i]!;
    if (v < 1.2 || this.count >= this.max) return;
    const rx = this.driveX[i]!;
    const ry = this.driveY[i]! - 1;
    const r = Math.hypot(rx, ry);
    if (r < 0.9) return;
    const rate = this.windFx.strip * 1.2 * (r - 0.9) * Math.min(1, v / 6);
    const sr = this.serial[i]!;
    const tick = Math.floor(this.clock / dt);
    if (hash01(sr * 7 + this.seed, tick) >= 1 - Math.exp(-rate * dt)) return;
    const k = this.stripN++;
    const ux = rx / r;
    const uy = ry / r;
    const spread = (hash01(sr, 9000 + k) - 0.5) * 0.7;
    const c = Math.cos(spread);
    const sn = Math.sin(spread);
    const fx = ux * c - uy * sn;
    const fy = ux * sn + uy * c;
    const sv = Math.min(0.4, Math.max(0.02, v * (0.01 + 0.04 * hash01(sr, 9100 + k))));
    const d = a + 1.5 + Math.min(25, (2 + 6 * (r - 0.9)) * (0.4 + hash01(sr, 9200 + k)));
    const px = this.x[i]! + fx * d;
    const py = this.y[i]! + fy * d;
    this.vol[i] = v - sv;
    if (px > 0 && py > 0 && px < this.width && py < this.height)
      this.addVolume(px, py, sv * 0.85, this.liquid[i]!);
    if (this.windFx.spray > 0)
      this.sprayFrom(
        this.x[i]! + fx * a,
        this.y[i]! + fy * a,
        fx,
        fy,
        sv * 40,
        0.5,
        this.liquid[i]!,
      );
    this.dirty[i] = 1;
  }

  /**
   * Splash (Ony, 2026-10-10: "if the drop hits another drop there can be
   * like a splash that puts specks on the glass around it"): a raindrop
   * hitting water already there throws droplets out sideways -- more and
   * further the bigger it is -- that land as specks a little way round
   * the water.
   */
  private splashSpecks(
    x: number,
    y: number,
    volume: number,
    around: number,
    liquid: number,
    biasX = 0,
    biasY = 0,
  ) {
    const seed = this.nextSerial * 31 + 7;
    const n =
      2 + Math.floor(7 * Math.min(1, (volume - IMPACT_FROM_UL) / 6) * (0.5 + hash01(seed, 1)));
    for (let k = 0; k < n && this.count < this.max; k++) {
      const ang = hash01(seed, 10 + k) * Math.PI * 2;
      const d = around + 0.4 + (1 + 2.5 * hash01(seed, 30 + k)) * Math.sqrt(volume) * 0.6;
      const v = 0.004 + 0.03 * hash01(seed, 50 + k) ** 2;
      // Thrown on the way the drop was going, as much as it came in at a slant.
      const sx = x + Math.cos(ang) * d + biasX * d * 1.2;
      const sy = y + Math.sin(ang) * d * 0.8 + biasY * d * 1.2;
      if (sx < 0 || sy < 0 || sx > this.width || sy > this.height) continue;
      this.add(sx, sy, v, liquid);
    }
  }

  /**
   * Liquid landing on drop i at a point: a resting drop keeps it where it
   * landed, a new lobe (its contact line spreads out there and pins); a
   * running one takes it in and stays round.
   */
  private grow(i: number, x: number, y: number, volume: number) {
    const v0 = this.vol[i]!;
    const v = v0 + volume;
    const still = Math.hypot(this.vx[i]!, this.vy[i]!) < 0.5;
    const list = still ? [...this.parts(i), [x, y, volume] as [number, number, number]] : [];
    this.x[i] = (this.x[i]! * v0 + x * volume) / v;
    this.y[i] = (this.y[i]! * v0 + y * volume) / v;
    this.vol[i] = v;
    this.dirty[i] = 1;
    this.partsOf(i, still ? list : [[this.x[i]!, this.y[i]!, v]]);
  }

  liquidOf(i: number): Liquid {
    return LIQUIDS[this.liquid[i]!] ?? LIQUIDS[0]!;
  }

  /** Contact radius, mm. */
  radius(i: number): number {
    if (this.cachedFor !== liquidsVersion) {
      this.radK.length = 0;
      this.holdBelow.length = 0;
      this.cachedFor = liquidsVersion;
    }
    const id = this.liquid[i]!;
    let k = this.radK[id];
    if (k === undefined) {
      k = capOf(1, restAngle(this.liquidOf(i))).a;
      this.radK[id] = k;
    }
    // a goes as the cube root of the volume at a fixed contact angle.
    return k * Math.cbrt(Math.max(this.vol[i]!, 0));
  }

  /** Each liquid's contact radius for 1 uL, and the volume below which a drop cannot slide on the slipperiest glass here. */
  private readonly radK: number[] = [];
  private readonly holdBelow: number[] = [];
  private holdPinning = NaN;
  private cachedFor = -1;

  /** Below this volume a resting drop of liquid `id` stays put wherever it is (the least pinned, wettest glass). */
  /**
   * How much standing water drop i lays as it moves, 0-1 (Ony, 2026-10-10:
   * "a drop would not be an almost perfect vertical rod"): a drop barely
   * heavy enough to creep leaves a damp path, not a stream of its own width
   * -- its streak and the drop together read as a rod -- and a runner with
   * water to spare, a full stream. From nothing at its let-go weight to all
   * of it at SLIP_BELOW times that, where it stops stuttering and runs.
   */
  streamWeight(i: number): number {
    const held = this.heldBelow(this.liquid[i]!);
    const t = Math.min(1, Math.max(0, (this.vol[i]! / held - 1) / (SLIP_BELOW - 1)));
    return t * t * (3 - 2 * t);
  }

  private heldBelow(id: number): number {
    if (this.holdPinning !== this.pinning || this.cachedFor !== liquidsVersion) {
      this.holdBelow.length = 0;
      this.holdPinning = this.pinning;
    }
    let v = this.holdBelow[id];
    if (v === undefined) {
      const l = LIQUIDS[id] ?? LIQUIDS[0]!;
      const fine = PIN_FINE * (this.pinning / 0.35);
      v =
        slideThreshold(l, Math.max(0.05, (1 - this.pinning - fine) * 0.5 * (1 - GUST_DROP))) * 0.98;
      this.holdBelow[id] = v;
    }
    return v;
  }

  /** Cap height, mm. */
  capHeight(i: number): number {
    return capOf(this.vol[i]!, restAngle(this.liquidOf(i))).h;
  }

  /** The pinning field at a point: the hysteresis's multiplier there, lowered where the glass is wet. */
  pinAt(x: number, y: number, wetSlip = true): number {
    // In step with the coarse dirt: clean, uniform glass (pinning 0) has neither.
    const fine = PIN_FINE * (this.pinning / 0.35) * this.fineAt(x * 1.31 + 17.3, y * 1.27 + 5.1);
    if (!wetSlip) return (1 + this.pinning * this.fieldAt(x, y) + fine) * (1 - this.gust);
    return (
      (1 + this.pinning * this.fieldAt(x, y) + fine) *
      // On the wet film of a track the contact line finds little dry glass to pin to (FILM_SLIP).
      (1 - FILM_SLIP * Math.min(1, this.filmAt(x, y))) *
      // Down a standing stream there is next to nothing to hold the front back: water runs into water (LANE_SLIP).
      (1 - LANE_SLIP * Math.min(1, this.rivuletAt(x, y) / 0.5)) *
      (1 - this.gust)
    );
  }

  /** What runner i leaves behind it. */
  trailMode(i: number): TrailMode {
    const h = hash01(this.serial[i]!, 777);
    const own =
      h < this.lineShare ? "line" : h < this.lineShare + this.dottedShare ? "dotted" : "none";
    // A pearl its runner shed is a bead on the trail, never a stream of its own: a lane of its own under the runner's foot would drain the runner.
    if (this.parent[i]! >= 0) return own === "line" ? "dotted" : own;
    // Running down a standing stream, or a track still wet, it is the stream: it leaves the line wet again whatever it would leave on dry glass.
    if (
      own !== "line" &&
      (this.rivuletAt(this.x[i]!, this.y[i]!) > LANE_SEEN ||
        this.filmAt(this.x[i]!, this.y[i]!) > 0.3)
    )
      return "line";
    return own;
  }

  /** The shares of runners that leave a clear line and a dotted trail (the rest leave next to nothing). */
  lineShare = TRAIL_LINE_SHARE;
  dottedShare = TRAIL_DOTTED_SHARE;

  /** The water runners have left in their tracks so far, uL (it dries there). */
  filmVolume = 0;
  /**
   * Where each runner has been since the renderer last asked (serial ->
   * x, y, run, track centre x, track half-width, mm, per substep it moved
   * by its own velocity; five NaNs mark a break where a merge moved it):
   * the track is drawn along this, at the width and centre the sim laid its
   * lane with, never between two frames' positions. A frame of a quarter
   * second at 50 mm/s is 12 mm in one straight stroke, and a swallow
   * mid-frame jumped the centre sideways: zig-zags, right angles (Ony,
   * 2026-10-09). The sim's own substeps are a millimetre apart.
   */
  readonly paths = new Map<number, number[]>();
  /**
   * The drops a standing stream took since the renderer last asked (x, y,
   * contact radius, mm): each becomes the stream's water where it sat --
   * a bulge in the stream, not a drop that vanished (Ony, 2026-10-10: "the
   * drop doesn't stay a single drop ... it becomes part of the stream").
   */
  readonly drained: number[] = [];
  /** Where pools on a bottom frame dripped off this step, mm (x, y pairs; the renderer may draw the fall). */
  readonly dripped: number[] = [];
  /** A stream takes a drop at its edge once it stands at least this high (LANE_SEEN is a lane only just there). */
  static readonly TAKES_AT = 0.3;

  /** How far the glass's grip is eased by a gust now, 0-GUST_DROP. */
  gust = 0;
  private clock = 0;
  /** The wind sampled on a coarse grid over the pane this step (it varies over a gust front's sweep, not drop by drop). */
  private windGrid = new Float32Array(0);
  private windGridAt = NaN;
  private static readonly WIND_GRID = 6;

  /** The free wind at a point this step, m/s (the grid, bilinear). */
  private windRaw(x: number, y: number): [number, number] {
    const m = this.windModel!;
    const n = DropSim.WIND_GRID;
    if (this.windGridAt !== this.clock || this.windGrid.length !== n * n * 2) {
      if (this.windGrid.length !== n * n * 2) this.windGrid = new Float32Array(n * n * 2);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const [a, b] = m.at(this.clock, (i / (n - 1)) * this.width, (j / (n - 1)) * this.height);
          this.windGrid[(j * n + i) * 2] = a;
          this.windGrid[(j * n + i) * 2 + 1] = b;
        }
      this.windGridAt = this.clock;
    }
    const gx = Math.min(n - 1.001, Math.max(0, (x / this.width) * (n - 1)));
    const gy = Math.min(n - 1.001, Math.max(0, (y / this.height) * (n - 1)));
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const g = this.windGrid;
    const at = (ii: number, jj: number, c: number) => g[(jj * n + ii) * 2 + c]!;
    const lerp = (c: number) =>
      (at(i, j, c) * (1 - fx) + at(i + 1, j, c) * fx) * (1 - fy) +
      (at(i, j + 1, c) * (1 - fx) + at(i + 1, j + 1, c) * fx) * fy;
    return [lerp(0), lerp(1)];
  }

  /** The sim's clock, s (the wind's time, the drops' wobble). */
  get time(): number {
    return this.clock;
  }

  /**
   * The wind along the glass at a pane point, m/s, with the frame's effect on
   * it: in the lee of the frame the wind comes from, the glass is sheltered
   * (the air leaves the frame's edge and comes down again a little way on);
   * against the frame it blows toward, the air stagnates and turns along the
   * frame, up in the pane's upper half and down in its lower (estimates).
   */
  windAt(x: number, y: number): [number, number] {
    const m = this.windModel;
    if (!m) return [0, 0];
    let [wx, wy] = this.windRaw(x, y);
    const f = this.windFx.frame;
    if (f > 0 && (wx !== 0 || wy !== 0)) {
      const ss = (d: number) => {
        const u = Math.min(1, Math.max(0, d / FRAME_LEE_MM));
        return u * u * (3 - 2 * u);
      };
      // The lee of the frame the wind comes from.
      const up = wx > 0 ? x : this.width - x;
      const upY = wy > 0 ? y : this.height - y;
      const lee = Math.min(
        1 -
          f *
            (1 - (0.3 + 0.7 * ss(up))) *
            Math.min(1, (Math.abs(wx) / (Math.hypot(wx, wy) + 1e-9)) * 1.5),
        1 -
          f *
            (1 - (0.3 + 0.7 * ss(upY))) *
            Math.min(1, (Math.abs(wy) / (Math.hypot(wx, wy) + 1e-9)) * 1.5),
      );
      wx *= Math.max(0, lee);
      wy *= Math.max(0, lee);
      // Against the frame it blows toward: the push into it dies and turns along it.
      const downX = wx > 0 ? this.width - x : x;
      const sx = 1 - f * (1 - ss(downX));
      const turnX = wx * (1 - sx);
      wx *= sx;
      wy += Math.abs(turnX) * 0.6 * (y < this.height / 2 ? -1 : 1);
      const downY = wy > 0 ? this.height - y : y;
      const sy = 1 - f * (1 - ss(downY));
      const turnY = wy * (1 - sy);
      wy *= sy;
      wx += Math.abs(turnY) * 0.6 * (x < this.width / 2 ? -1 : 1);
    }
    return [wx, wy];
  }

  /** How much the wind pushes water of contact radius a mm at a point, in its weights: [x, y]. */
  windPush(x: number, y: number, a: number): [number, number] {
    let px = this.wind;
    let py = 0;
    if (this.windModel) {
      const [wx, wy] = this.windAt(x, y);
      const u = Math.hypot(wx, wy);
      if (u > 0) {
        const r = Math.min(
          WIND_PUSH_MAX,
          (this.windFx.push * WIND_PUSH * u * u) / Math.max(a, 0.25),
        );
        px += (r * wx) / u;
        py += (r * wy) / u;
      }
    }
    return [px, py];
  }

  /**
   * How much rain lands here relative to the pane's average (wind-driven rain
   * on a facade: heaviest toward the edges and corners the wind meets, less
   * in the lee of the frame; BSD-148). 0.25-1.6.
   */
  landWeight(x: number, y: number): number {
    const m = this.windModel;
    if (!m || !(m.params.mph > 0)) return 1;
    const [wx, wy] = this.windRaw(x, y);
    const u = Math.hypot(wx, wy);
    if (u < 0.5) return 1;
    const f = this.windFx.frame;
    const strong = Math.min(1, u / 10);
    // The lee strip behind the frame the wind comes from.
    const up = wx > 0 ? x : this.width - x;
    const upY = wy > 0 ? y : this.height - y;
    const lee = (d: number, share: number) => {
      const t = Math.min(1, Math.max(0, d / (FRAME_LEE_MM * 0.8)));
      return 1 - f * strong * share * 0.75 * (1 - t * t * (3 - 2 * t));
    };
    let w = lee(up, Math.abs(wx) / u) * lee(upY, Math.abs(wy) / u);
    // Toward the windward side the pane catches more (the upper corners of a facade catch most).
    const across = wx > 0 ? 1 - x / this.width : x / this.width;
    w *=
      1 +
      0.5 * strong * (Math.abs(wx) / u) * (across - 0.5) +
      0.25 * strong * (1 - y / this.height - 0.5);
    return Math.max(0.25, Math.min(1.6, w));
  }

  /**
   * How hard it rains on the glass at this moment relative to the rain
   * type's rate (calibrated in a breeze of BREEZE_MPH): a vertical pane only
   * catches the rain the wind drives at it, so in a calm it gets a fraction
   * and in a gale several times as much, and it comes in waves with the
   * gusts (driving rain goes as the wind's speed, BSD-148).
   */
  rainRate(follow: number): number {
    const m = this.windModel;
    if (!m) return 1;
    const mph = m.mphAt(this.clock, this.width / 2, this.height / 2);
    const k = Math.min(3.5, 0.3 + (0.7 * mph) / BREEZE_MPH);
    return 1 + (k - 1) * Math.max(0, Math.min(1, follow));
  }

  /** The field's slope across the pane at a point, per mm. */
  private pinSlopeAcross(x: number, y: number, px: number, py: number): number {
    const e = 0.5;
    return (
      (this.pinning *
        (this.fieldAt(x + e * px, y + e * py) - this.fieldAt(x - e * px, y - e * py))) /
      (2 * e)
    );
  }

  private fineSlopeAcross(x: number, y: number, px: number, py: number): number {
    const e = 0.3;
    return (
      ((this.fineAt(x + e * px, y + e * py) - this.fineAt(x - e * px, y - e * py)) / (2 * e)) *
      FINE_CELL
    );
  }

  private pinSlopeX(x: number, y: number): number {
    const e = 0.5;
    return (this.pinning * (this.fieldAt(x + e, y) - this.fieldAt(x - e, y))) / (2 * e);
  }

  /** The fine dirt's slope across the pane at a point (value noise, FINE_CELL), per mm times the cell. */
  private fineSlopeX(x: number, y: number): number {
    const e = 0.3;
    return ((this.fineAt(x + e, y) - this.fineAt(x - e, y)) / (2 * e)) * FINE_CELL;
  }

  private fineAt(x: number, y: number): number {
    const gx = x / FINE_CELL;
    const gy = y / FINE_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const s = this.seed * 104729 + 71;
    const v = (p: number, q: number) => hash01(s + p * 7919, q) * 2 - 1;
    const top = v(i, j) * (1 - sx) + v(i + 1, j) * sx;
    const bot = v(i, j + 1) * (1 - sx) + v(i + 1, j + 1) * sx;
    return top * (1 - sy) + bot * sy;
  }

  /**
   * How hard a runner is drawn sideways toward the drops just below it, as a
   * share of its speed: each drop within reach pulls by its size and nearness.
   */
  private pullToward(i: number, a: number): number {
    const x = this.x[i]!;
    const y = this.y[i]!;
    let pull = 0;
    for (let j = 0; j < this.count; j++) {
      if (j === i || this.liquid[j] !== this.liquid[i] || this.related(i, j)) continue;
      const dy = this.y[j]! - y;
      const aj = this.radius(j);
      const reachY = a * CAPTURE_REACH + aj + 1;
      if (dy <= 0 || dy > reachY) continue;
      const dx = this.x[j]! - x;
      const reachX = a * 1.5 + aj + 1;
      if (Math.abs(dx) > reachX) continue;
      const near = (1 - dy / reachY) * (1 - Math.abs(dx) / reachX);
      pull += Math.sign(dx) * near * Math.min(1, aj / a);
    }
    return CAPTURE_PULL * pull;
  }

  private fieldAt(x: number, y: number): number {
    const gx = Math.max(0, Math.min(this.pinCols - 1.001, x / PIN_CELL));
    const gy = Math.max(0, Math.min(this.pinRows - 1.001, y / PIN_CELL));
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    // Smoothstep between the cell corners: value noise.
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const c = this.pinCols;
    const f = this.pinField;
    const top = f[j * c + i]! * (1 - sx) + f[j * c + i + 1]! * sx;
    const bot = f[(j + 1) * c + i]! * (1 - sx) + f[(j + 1) * c + i + 1]! * sx;
    return top * (1 - sy) + bot * sy;
  }

  filmAt(x: number, y: number): number {
    const i = Math.floor(x / FILM_CELL);
    const j = Math.floor(y / FILM_CELL);
    if (i < 0 || j < 0 || i >= this.filmCols || j >= this.filmRows) return 0;
    return this.film[j * this.filmCols + i]!;
  }

  /** How much of a standing rivulet there is at a point, 0-1. */
  rivuletAt(x: number, y: number): number {
    const k = this.laneIndex(x, y);
    return k < 0 ? 0 : this.rivulet[k]!;
  }

  /** The lane cell at a point, or -1 off the pane. */
  laneIndex(x: number, y: number): number {
    const i = Math.floor(x / LANE_CELL);
    const j = Math.floor(y / LANE_CELL);
    if (i < 0 || j < 0 || i >= this.laneCols || j >= this.laneRows) return -1;
    return j * this.laneCols + i;
  }

  /**
   * Whether a contact patch of radius a at (x, y) touches a standing stream's
   * lane that is not its own (`own`: the drop's serial, and its parent's):
   * the stream is water, so where the two meet they are one liquid and the
   * drop goes into the stream (docs/research-streams.md 5.1).
   */
  touchesLane(x: number, y: number, a: number, own = -1, parent = -1, level = LANE_SEEN): boolean {
    const i0 = Math.max(0, Math.floor((x - a) / LANE_CELL));
    const i1 = Math.min(this.laneCols - 1, Math.floor((x + a) / LANE_CELL));
    const j0 = Math.max(0, Math.floor((y - a) / LANE_CELL));
    const j1 = Math.min(this.laneRows - 1, Math.floor((y + a) / LANE_CELL));
    const r2 = (a + LANE_CELL * 0.5) * (a + LANE_CELL * 0.5);
    for (let j = j0; j <= j1; j++) {
      const cy = (j + 0.5) * LANE_CELL - y;
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * LANE_CELL - x;
        if (cx * cx + cy * cy > r2) continue;
        const k = j * this.laneCols + i;
        if (this.rivulet[k]! <= level) continue;
        const by = this.rivuletBy[k]!;
        const track = this.laneTrack[k]!;
        // Its own line, or its runner's (a bulb it let go from, by serial; a bead it shed, by track).
        if (by === own || track === own || (parent >= 0 && (by === parent || track === parent)))
          continue;
        return true;
      }
    }
    return false;
  }

  /** The half-width a standing stream was laid with at a point, mm (0 off any lane). */
  laneHalfAt(x: number, y: number): number {
    const i = Math.floor(x / LANE_CELL);
    const j = Math.floor(y / LANE_CELL);
    if (i < 0 || j < 0 || i >= this.laneCols || j >= this.laneRows) return 0;
    const k = j * this.laneCols + i;
    return this.rivulet[k]! > LANE_SEEN ? this.laneHalf[k]! : 0;
  }

  /** Where a standing stream's centre is, across a point: the mean x of its lane cells on this row within reach, or NaN. */
  laneCentreAt(x: number, y: number, reach: number): number {
    const j = Math.floor(y / LANE_CELL);
    if (j < 0 || j >= this.laneRows) return NaN;
    const i0 = Math.max(0, Math.floor((x - reach) / LANE_CELL));
    const i1 = Math.min(this.laneCols - 1, Math.floor((x + reach) / LANE_CELL));
    let sum = 0;
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      if (this.rivulet[j * this.laneCols + i]! > LANE_SEEN) {
        sum += (i + 0.5) * LANE_CELL;
        n++;
      }
    }
    return n ? sum / n : NaN;
  }

  /**
   * A stream entering from the top edge: water running down from above the
   * pane (clip E: half the streams start at the top edge; the catalogue: a
   * fifth). A runner at its running weight and more, already at full
   * width (its run counted as if it began above), moving.
   */
  enterFromTop(x: number, volume: number, liquid = 0): number {
    const l = LIQUIDS[liquid] ?? LIQUIDS[0]!;
    const a = capOf(volume, restAngle(l)).a;
    const i = this.add(Math.min(this.width - a, Math.max(a, x)), a * 0.6, volume, liquid);
    if (i < 0) return -1;
    this.ran[i] = TRAIL_TAPER * a * 2.5;
    // Already running, and leaning a little either way as it arrives (water from above comes in at a slant as often as not).
    const u = slideSpeed(volume, l, 1) * 0.5;
    this.vy[i] = u;
    this.vx[i] = u * SIDE_MAX * 0.4 * (hash01(this.serial[i]!, 518) * 2 - 1);
    this.dirty[i] = 1;
    // Its track comes in over the top edge (from above the pane), so no end of it shows there.
    const sr = this.serial[i]!;
    const rw = a * streamWidth(sr, this.ran[i]!, 0);
    // Its stream is counted from the top edge (it drains from there, as any stream from its start).
    this.ranStart[i] = this.ran[i]!;
    this.paths.set(sr, [this.x[i]!, -2 * a, this.ran[i]!, this.x[i]!, rw]);
    return i;
  }

  /** Lay a runner's lane: every cell within its half-width of the point, as the track is drawn. */
  private layLane(
    x: number,
    y: number,
    half: number,
    serial: number,
    level = 1,
    track = serial,
    laid = half,
  ) {
    const i0 = Math.max(0, Math.floor((x - half) / LANE_CELL));
    const i1 = Math.min(this.laneCols - 1, Math.floor((x + half) / LANE_CELL));
    const j0 = Math.max(0, Math.floor((y - half) / LANE_CELL));
    const j1 = Math.min(this.laneRows - 1, Math.floor((y + half) / LANE_CELL));
    const r2 = (half + LANE_CELL * 0.5) * (half + LANE_CELL * 0.5);
    for (let j = j0; j <= j1; j++) {
      const cy = (j + 0.5) * LANE_CELL - y;
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * LANE_CELL - x;
        if (cx * cx + cy * cy > r2) continue;
        const k = j * this.laneCols + i;
        if (this.rivulet[k]! > level) continue;
        this.rivulet[k] = level;
        this.rivuletBy[k] = serial;
        this.laneTrack[k] = track;
        this.laneHalf[k] = laid;
      }
    }
  }

  private wet(x: number, y: number) {
    const i = Math.floor(x / FILM_CELL);
    const j = Math.floor(y / FILM_CELL);
    if (i < 0 || j < 0 || i >= this.filmCols || j >= this.filmRows) return;
    this.film[j * this.filmCols + i] = 1;
  }

  /**
   * Spray landing (task 76): `volume` uL of `liquid` at a point. Into a drop
   * it lands on; otherwise into the mist, which becomes a drop where enough
   * gathers. Returns whether it went into a drop.
   */
  /** Into the mist at a point, without looking for a drop there (the wind's spray: a dusting, mostly between drops). */
  private mistAt(x: number, y: number, volume: number, liquid = 0) {
    if (!(volume > 0) || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const c = Math.floor(y / FILM_CELL) * this.filmCols + Math.floor(x / FILM_CELL);
    if (this.mistLiquid[c] !== liquid && this.mist[c]! > 0) this.mist[c] = 0;
    this.mistLiquid[c] = liquid;
    this.mist[c] = this.mist[c]! + volume;
    this.mistVersion++;
    if (this.mist[c]! >= MIST_CONDENSE) {
      const cx = (c % this.filmCols) * FILM_CELL + FILM_CELL / 2;
      const cy = Math.floor(c / this.filmCols) * FILM_CELL + FILM_CELL / 2;
      const v = this.mist[c]!;
      this.mist[c] = 0;
      this.addVolume(cx, cy, v, liquid);
    }
  }

  deposit(x: number, y: number, volume: number, liquid = 0): boolean {
    if (!(volume > 0) || x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    for (let i = 0; i < this.count; i++) {
      if (this.liquid[i] !== liquid) continue;
      const a = this.radius(i);
      const dx = this.x[i]! - x;
      const dy = this.y[i]! - y;
      if (dx * dx + dy * dy < a * a) {
        this.vol[i] = this.vol[i]! + volume;
        return true;
      }
    }
    const c = Math.floor(y / FILM_CELL) * this.filmCols + Math.floor(x / FILM_CELL);
    if (this.mistLiquid[c] !== liquid && this.mist[c]! > 0) {
      // Another liquid's mist here: the newer one takes the cell (they do not mix in this model).
      this.mist[c] = 0;
    }
    this.mistLiquid[c] = liquid;
    this.mist[c] = this.mist[c]! + volume;
    this.mistVersion++;
    if (this.mist[c]! >= MIST_CONDENSE) {
      const cx = (c % this.filmCols) * FILM_CELL + FILM_CELL / 2;
      const cy = Math.floor(c / this.filmCols) * FILM_CELL + FILM_CELL / 2;
      const v = this.mist[c]!;
      this.mist[c] = 0;
      this.addVolume(cx, cy, v, liquid);
    }
    return false;
  }

  /** The total volume in the mist, uL. */
  mistVolume(): number {
    let s = 0;
    for (let i = 0; i < this.mist.length; i++) s += this.mist[i]!;
    return s;
  }

  /** Remove a drop by index (swap with the last). */
  remove(i: number) {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.vol[i] = this.vol[last]!;
    this.liquid[i] = this.liquid[last]!;
    this.serial[i] = this.serial[last]!;
    this.parent[i] = this.parent[last]!;
    this.run[i] = this.run[last]!;
    this.shed[i] = this.shed[last]!;
    this.ran[i] = this.ran[last]!;
    this.trackId[i] = this.trackId[last]!;
    this.laneWidth[i] = this.laneWidth[last]!;
    this.trackWas[i] = this.trackWas[last]!;
    this.trackMix[i] = this.trackMix[last]!;
    this.pathX[i] = this.pathX[last]!;
    this.trackOff[i] = this.trackOff[last]!;
    this.tailBoost[i] = this.tailBoost[last]!;
    this.ranStart[i] = this.ranStart[last]!;
    this.fuseTau[i] = this.fuseTau[last]!;
    this.fuseUntil[i] = this.fuseUntil[last]!;
    this.partN[i] = this.partN[last]!;
    this.dirty[i] = this.dirty[last]!;
    for (let k = 0; k < MAX_PARTS; k++) {
      this.partX[i * MAX_PARTS + k] = this.partX[last * MAX_PARTS + k]!;
      this.partY[i * MAX_PARTS + k] = this.partY[last * MAX_PARTS + k]!;
      this.partF[i * MAX_PARTS + k] = this.partF[last * MAX_PARTS + k]!;
    }
  }

  /** Time not yet stepped, s: the sim always steps exactly SUBSTEP, so any frame rate gives the same drops. */
  private pending = 0;

  /**
   * Advance by dt seconds, in fixed steps of SUBSTEP (at most MAX_SUBSTEP);
   * what is left over waits for the next call. Returns whether anything
   * moved or merged (false: the sim can sleep; only evaporation and the
   * film's drying are left, which can tick slowly). A long gap (a hidden
   * tab) is capped at a quarter of a second, as the scheduler caps it.
   */
  step(dt: number): boolean {
    if (!(dt > 0)) return false;
    this.pending = Math.min(this.pending + dt, 0.25);
    let active = false;
    this.merges = 0;
    while (this.pending >= SUBSTEP - 1e-9) {
      this.pending -= SUBSTEP;
      active = this.substep(SUBSTEP) || active;
    }
    return active;
  }

  /**
   * Run on by `dt` seconds in coarse steps of MAX_SUBSTEP * 2 (1/30 s): the
   * rain that fell before you arrived, where a few minutes must be simulated
   * at once. Resting drops do not care about the step; runners cover four
   * times as far a step, which the merge test still catches.
   */
  fastForward(dt: number): void {
    const coarse = MAX_SUBSTEP * 2;
    for (let t = 0; t < dt - 1e-9; t += coarse) this.substep(coarse);
  }

  private substep(dt: number): boolean {
    let moving = false;
    // Gusts: one at a random moment in each GUST_EVERY-second slot, of a random strength.
    this.clock += dt;
    const slot = Math.floor(this.clock / GUST_EVERY);
    const at = slot * GUST_EVERY + hash01(this.seed * 131 + 7, slot) * (GUST_EVERY - GUST_LENGTH);
    this.gust =
      this.clock >= at && this.clock < at + GUST_LENGTH
        ? GUST_DROP *
          Math.min(1, this.pinning / 0.35) *
          (0.4 + 0.6 * hash01(this.seed * 131 + 9, slot))
        : 0;
    /*
     * The wind now: its speed at the pane's middle, and the pane shuddering in
     * a hard gust -- a sharp rise in a strong wind flexes the glass, and every
     * drop near letting go lets go at once (a cascade of new streams).
     */
    let dryBy = 1;
    if (this.windModel) {
      const mph = this.windModel.mphAt(this.clock, this.width / 2, this.height / 2);
      const rise = (mph - this.windWas) / Math.max(dt, 1e-6);
      this.windWas = mph;
      this.windMph = mph;
      if (this.windFx.shudder > 0 && mph > 18 && rise > 9 && this.shudderLeft <= 0) {
        this.shudderLeft = 0.35 + 0.3 * hash01(this.seed * 17 + 3, Math.floor(this.clock * 4));
        this.shudderSize = Math.min(0.45, 0.012 * (mph - 12)) * this.windFx.shudder;
      }
      // Wind dries the glass: evaporation goes up with the air moving over it (about 1 + U / 10 mph).
      dryBy = 1 + (this.windFx.drying * mph) / 10;
    } else this.windMph = 0;
    if (this.shudderLeft > 0) {
      this.shudderLeft -= dt;
      this.gust = Math.max(this.gust, this.shudderSize);
    }
    // The film dries.
    const dry = Math.exp(-FILM_DRY * dryBy * dt);
    for (let i = 0; i < this.film.length; i++) this.film[i] = this.film[i]! * dry;
    const thin = this.rivuletDry * (1 + (dryBy - 1) * 0.3) * dt;
    for (let i = 0; i < this.rivulet.length; i++)
      if (this.rivulet[i]! > 0) this.rivulet[i] = Math.max(0, this.rivulet[i]! - thin);
    if (this.evaporate) {
      const mistDry = Math.exp(-MIST_DRY * dryBy * dt);
      let any = false;
      for (let i = 0; i < this.mist.length; i++) {
        const m = this.mist[i]!;
        if (m <= 0) continue;
        const next = m * mistDry;
        this.mist[i] = next < 1e-4 ? 0 : next;
        any = true;
      }
      if (any) this.mistVersion++;
    }
    // Toward the friction-law speed, the same whatever the step (exact for a first-order lag).
    const ease = 1 - Math.exp(-dt / SPEED_TAU);
    const relax = Math.exp(-dt / SKEW_RELAX);
    for (let i = 0; i < this.count; i++) {
      const l = this.liquidOf(i);
      // Evaporation, as the contact radius (diffusion-limited).
      const a = this.radius(i);
      const you = this.serial[i] === this.player;
      if (this.evaporate && !you) this.vol[i] = this.vol[i]! - l.evaporation * a * dryBy * dt;
      /*
       * What drives it: gravity, one weight down the pane, and the wind's push
       * along the glass (windPush) -- together its weight as the glass feels
       * it (G) and the way it would go (the drive). A drop pushed sideways or
       * up the glass is held, lets go and runs by that, as by gravity alone.
       */
      const [pwx, pwy] = this.windPush(this.x[i]!, this.y[i]!, a);
      /*
       * The drop you steer: while you press, it goes the way you press and
       * only that way (Ony, 2026-10-10: "pushing sideways should move
       * sideways not run at an angle ... every direction"): your push
       * stands in for gravity and the wind. Let go and it is water again.
       */
      const steering = you && (this.playerPush[0] !== 0 || this.playerPush[1] !== 0);
      // Not pressing, your drop holds where it is (Ony, 2026-10-11: "quit making the one you're controlling fall downwards").
      const gx = you ? (steering ? this.playerPush[0] : 0) : pwx;
      const gy = you ? (steering ? this.playerPush[1] : 0) : 1 + pwy;
      this.driveX[i] = gx;
      this.driveY[i] = gy;
      const G = Math.max(1e-3, Math.hypot(gx, gy));
      const nx = gx / G;
      const ny = gy / G;
      const veff = this.vol[i]! * G;
      if (G > 1.15 && this.windFx.strip > 0) this.strip(i, a, dt);
      // Too small to slide even on the slipperiest glass, and at rest: nothing else to do.
      if (
        this.vy[i] === 0 &&
        this.vx[i] === 0 &&
        veff < this.heldBelow(this.liquid[i]!) &&
        this.rivuletAt(this.x[i]!, this.y[i]!) <= LANE_SEEN &&
        this.filmAt(this.x[i]!, this.y[i]!) < 0.3
      ) {
        this.creep(i, this.fuseKeep(i, dt, relax));
        continue;
      }
      const x = this.x[i]!;
      const y = this.y[i]!;
      // Held at its front, the advancing edge: the film it lays behind it helps the next drop, not itself.
      /*
       * A bead of a stream's thread holds where it pinched off: it is what
       * the drained thread left, sitting on its own receding contact line,
       * not water running into water (the wet track's slip is for what
       * comes down it later).
       */
      // While you steer it the glass holds it less (it goes where you send it); let go, it is held as any drop.
      const pin =
        this.pinAt(x + nx * a, y + ny * a, this.parent[i]! < 0) * (steering ? this.playerGrip : 1);
      let u = slideSpeed(veff, l, pin);
      // Resting on the frame: it cannot go on down (only along it, if something pushes it so).
      const onSill = this.bottomPool && y + a * 0.75 >= this.height - 0.02;
      if (onSill && ny > 0.3 && !steering) u = 0;
      // The drop you steer goes at a pace you can follow (Ony, 2026-10-10: "way too fast ... maybe 15% of that speed").
      if (steering) u *= this.playerSpeed;
      /*
       * A drop already moving -- jolted by an impact, skidding from its own
       * landing -- that the glass would hold at rest: its contact line is
       * moving, held only by the kinetic grip (KINETIC_PIN), so a drop near
       * its threshold runs on instead of stopping. Only below the
       * threshold: a running drop's speed is the friction law's.
       */
      if (u === 0 && Math.hypot(this.vx[i]!, this.vy[i]!) > 2)
        u = slideSpeed(veff, l, pin * KINETIC_PIN);
      /*
       * Letting go: a resting drop that starts to run may leave part of
       * itself where it sat -- its rear stays pinned and necks off
       * (letGoRemnant) -- so some streams hang from a bulb or from the drop
       * that fed them, and others start clean.
       */
      if (
        u > 0 &&
        this.ran[i] === 0 &&
        this.vy[i] === 0 &&
        this.vx[i] === 0 &&
        this.parent[i]! < 0
      ) {
        const sr = this.serial[i]!;
        const share = letGoRemnant(sr, veff, slideThreshold(l, pin));
        if (share > 0 && this.count < this.max) {
          const left = this.vol[i]! * share;
          this.vol[i] = this.vol[i]! - left;
          /*
           * The bulb is what the rear's pinned contact line held back: off
           * to one side of the stream's start as often as not, and lumpy --
           * two lobes where the line caught twice -- never a round cap sat
           * square on the stream (Ony, 2026-10-09: the same half-circle end
           * on every stream).
           */
          // Off to one side of where the stream starts, never sat square on it as its cap.
          const bx = x + (hash01(sr, 521) < 0.5 ? -1 : 1) * (0.45 + 0.4 * hash01(sr, 525)) * a;
          const by = y - a * (0.15 + 0.35 * hash01(sr, 522));
          const j = this.add(bx, by, left, this.liquid[i]!, sr);
          if (j >= 0) {
            this.dirty[j] = 0;
            if (hash01(sr, 523) < 0.6) {
              const ba = this.radius(j);
              const ang = hash01(sr, 524) * Math.PI * 2;
              const d = ba * (0.3 + 0.4 * hash01(sr, 525));
              const f = 0.25 + 0.3 * hash01(sr, 526);
              this.partsOf(j, [
                [bx + Math.cos(ang) * d, by + Math.sin(ang) * d, left * f],
                [
                  bx - Math.cos(ang) * d * (f / (1 - f)),
                  by - Math.sin(ang) * d * (f / (1 - f)),
                  left * (1 - f),
                ],
              ]);
              this.keepOn(j);
            }
          }
          u = slideSpeed(this.vol[i]! * G, l, pin);
        }
      }
      /*
       * Stick-slip, by how much water the runner is (Ony, 2026-10-09: "the
       * more drops that merge into the stream the faster and more consistent
       * the flow, so less start and stop"): at its threshold a drop creeps
       * in short bursts with long rests; the rests shorten and the bursts
       * lengthen as it grows, and past SLIP_BELOW times the threshold it
       * runs without a pause. A head that swallows what it passes grows
       * into a steady stream as it goes.
       */
      if (u > 0) {
        const held = this.heldBelow(this.liquid[i]!);
        const small = Math.min(
          1,
          Math.max(0, (SLIP_BELOW * held - veff) / ((SLIP_BELOW - 1) * held)),
        );
        if (small > 0) {
          // This drop's own rhythm, from its serial, so neighbours don't pulse together.
          const sr = this.serial[i]!;
          const rest =
            (SLIP_REST_MIN + (SLIP_REST_MAX - SLIP_REST_MIN) * hash01(sr, 4242)) * small * small;
          const burst = SLIP_BURST + (1 - small) * 0.8;
          const period = burst + rest;
          const phase = (this.clock + period * hash01(sr, 4243)) % period;
          u = phase < burst ? u * (1 + (SLIP_BURST_SPEED - 1) * small) : 0;
        }
      }
      // Down, steered sideways toward the cleaner glass (the field's slope), its fine dirt, and the drops just ahead.
      // (The steering below is across the fall line; with the wind driving it sideways, across its drive: faded as the drive turns from down.)
      const down = ny > 0 ? ny * ny : 0;
      // The dirt's slope across its drive (x in still air): it is steered toward the cleaner glass whichever way it runs.
      let side =
        -MEANDER * this.pinSlopeAcross(x, y, ny, -nx) +
        MEANDER_FINE * this.fineSlopeAcross(x + nx * a, y + ny * a, ny, -nx);
      if (u > 0) side += this.pullToward(i, a);
      /*
       * The path of least resistance (Ony, 2026-10-09): just ahead, the front
       * runs on toward wet glass -- an old track's film, best of all a stream
       * still standing -- because a wet path holds it back least. So later
       * runners find earlier ones and follow their channels.
       */
      if (u > 0) {
        // Just ahead along its drive, either side of it.
        const ax = x + nx * (a + 1);
        const ay = y + ny * (a + 1);
        const wet = (q: number) => {
          const px = ax + ny * q;
          const py = ay - nx * q;
          return Math.max(this.filmAt(px, py), this.rivuletAt(px, py));
        };
        side += WET_FOLLOW * (wet(a + 1) - wet(-a - 1));
      }
      /*
       * At most about 15 degrees off the fall line (Ony, 2026-10-04: a stream
       * in straight slants with sharp corners, like a crack; 117 reference
       * photographs: streams on a window lean under 5 degrees and wander a few
       * of their own widths). It was 27 degrees, and the coarse field held it
       * there for centimetres at a time.
       */
      /*
       * In a standing stream's lane the front is held to the channel: water
       * runs where the glass is already wet, and the lane's own bends are
       * the path (Ony, 2026-10-09: a pulse must follow the lane, not draw a
       * straight line of its own through it).
       */
      if (u > 0) {
        const centre = this.laneCentreAt(x, y + a + 1, a + 1);
        // Its own channel only: a lane a drop's width away is another stream's.
        if (!Number.isNaN(centre) && Math.abs(centre - x) < a) {
          // Eased in with nearness, and never more than a gentle lean: the join is a curve, not a straight leg (Ony: no long diagonals).
          const off = (centre - x) / a;
          side += LANE_FOLLOW * off * Math.abs(off) * a * down;
        }
      }
      /*
       * Softly: a hard clamp held the front at the limit in straight slants
       * with sharp corners between them (Ony, 2026-10-09: the lanes were
       * zig-zags of straight diagonals). tanh bends toward the limit and
       * leaves the dirt's small nudges room to show.
       */
      // Back toward the line it has been on: a slow wander, never a held slant.
      if (u > 0) {
        if (this.ran[i] === 0) this.pathX[i] = x;
        side -= ((MEANDER_BACK * (x - this.pathX[i]!)) / Math.max(a, 1)) * down;
      }
      side = SIDE_MAX * Math.tanh(side / SIDE_MAX);
      /*
       * Along its drive at the friction law's speed, with the wander across
       * it: straight down in still air (side, 1), leaning with the wind, and
       * sideways or up the glass when the wind outweighs gravity.
       */
      const tvx = u * (nx + side * ny);
      const tvy = u * (ny - side * nx);
      if (you) {
        /*
         * Your drop turns as one body (Ony, 2026-10-11: "the entire drop will
         * be not moving but rotate? and then hard right turn"): both
         * components of its velocity come to the pressed direction by the
         * same lag, so a change of direction is an arc, never a stop and a
         * hard corner (x had its own short lag, y the friction law's).
         */
        const k = 1 - Math.exp(-dt / PLAYER_TURN_TAU);
        const ux = steering ? u * nx : 0;
        const uy = steering ? u * ny : 0;
        this.vx[i] = this.vx[i]! + (ux - this.vx[i]!) * k;
        this.vy[i] = this.vy[i]! + (uy - this.vy[i]!) * k;
        if (Math.hypot(this.vx[i]!, this.vy[i]!) < 1e-3 && !steering) {
          this.vx[i] = 0;
          this.vy[i] = 0;
        }
      } else {
        this.vy[i] = this.vy[i]! + (tvy - this.vy[i]!) * ease;
        /*
         * Sideways, the front answers each speck at once (the contact line
         * moves, not the whole drop's momentum): a short lag, so a stream
         * wiggles on the scale of the dirt instead of drifting in a straight
         * slant (Ony, 2026-10-03: streams like rods).
         */
        // By the speed it has as much as the speed it is heading for: a stopping drop loses its lean as fast as its fall (else it hooked sideways at the end of every burst).
        const easeSide =
          1 - Math.exp((-dt * Math.max(u, Math.abs(this.vy[i]!), SIDE_LAG_FLOOR)) / SIDE_LAG_MM);
        // From its first step it goes where the glass sends it (else the first few mm of every start were a straight spike).
        if (this.ran[i] === 0 && u > 0) this.vx[i] = tvx;
        else this.vx[i] = this.vx[i]! + (tvx - this.vx[i]!) * easeSide;
      }
      this.creep(i, this.fuseKeep(i, dt, relax));
      if (Math.hypot(this.vx[i]!, this.vy[i]!) < 1e-3 && u === 0) {
        this.vy[i] = 0;
        this.vx[i] = 0;
        continue;
      }
      // A running drop's shape is its run's (stretched along it, the renderer's): what a merge left pulls in.
      this.creep(
        i,
        this.fuseTau[i]! > 0 && this.clock < this.fuseUntil[i]! ? this.fuseKeep(i, dt, 0.9) : 0.9,
      );
      moving = true;
      this.dirty[i] = 1;
      const dx = this.vx[i]! * dt;
      const dy = this.vy[i]! * dt;
      this.x[i] = x + dx;
      this.y[i] = y + dy;
      this.keepOn(i);
      // Against a frame: it cannot go on into it, so it runs along it (water driven into the frame runs down the edge).
      if (Math.abs(this.x[i]! - (x + dx)) > 1e-6) this.vx[i] = 0;
      if (Math.abs(this.y[i]! - (y + dy)) > 1e-6) {
        // Against the top it can still fall; against a bottom frame it stops.
        this.vy[i] = this.y[i]! > this.height / 2 ? 0 : Math.max(0, this.vy[i]!);
      }
      const ds = Math.hypot(dx, dy);
      // Which way it went, and so where behind it is (straight down in still air).
      const bx = ds > 1e-9 ? dx / ds : 0;
      const by = ds > 1e-9 ? dy / ds : 1;
      // The film it leaves where it was (Kaneda 1993: water remains behind the flow).
      this.wet(x - bx * a * 0.5, y - by * a * 0.5);
      this.pathX[i] =
        this.pathX[i]! + (this.x[i]! - this.pathX[i]!) * Math.min(1, ds / MEANDER_MEMORY);
      this.run[i] = this.run[i]! + ds;
      const ran0 = this.ran[i]!;
      this.ran[i] = ran0 + ds;
      {
        /*
         * The lane behind it: the stream exactly as the renderer draws it
         * (streamWidth, streamShift of the run so far, thin where it let
         * go), laid along this step so no cell is skipped, a little wider
         * (LANE_SHARE) for the map's soft edge.
         */
        const id = this.serial[i]!;
        // The wake behind every head is standing water (what stays after differs: the film, the beads).
        const stand = 1;
        /*
         * Down an earlier stream's lane it is that stream's pulse: it takes
         * the track's id, so its swells, necks and wander are the path's
         * (streamWidth by y), and keeps it for the rest of its run. Just
         * ahead of its front (past the disc it laid itself): whose lane is
         * there, and how wide; off any lane the width it remembers goes
         * within a few millimetres -- it has left the lane.
         */
        {
          const k = this.laneIndex(x, y + a + 1);
          const other = k >= 0 && this.rivulet[k]! > LANE_SEEN && this.rivuletBy[k] !== id;
          if (other && this.laneTrack[k] !== this.trackId[i] && this.laneTrack[k] !== id) {
            this.trackWas[i] = this.trackId[i]!;
            this.trackId[i] = this.laneTrack[k]!;
            this.trackMix[i] = 0;
          }
          this.trackMix[i] = Math.min(1, this.trackMix[i]! + ds / 4);
          // The lane's width eased in over a couple of millimetres, out over four.
          const target = other ? this.laneHalf[k]! / LANE_SHARE : 0;
          const w = this.laneWidth[i]!;
          this.laneWidth[i] =
            target > w ? w + (target - w) * Math.min(1, ds / 2) : Math.max(target, w - ds / 4);
        }
        const track = this.trackId[i]!;
        const was = this.trackWas[i]!;
        const mix = this.trackMix[i]!;
        const laneW = this.laneWidth[i]!;
        const weight = Math.max(0.06, this.streamWeight(i));
        const steps = Math.max(1, Math.ceil(ds / (LANE_CELL * 0.5)));
        /*
         * Its own width at every point along a path of its own; down a lane
         * another runner laid, that lane's width there (the whole wetted
         * band fills again: inside it the water meets no dry glass), which
         * is the width its maker laid, swells and necks fixed to the glass.
         * Never the widest the lane has ever been: taking the max against
         * its own last disc, laid half a width ahead, made every stream
         * the envelope of its widest moment (Ony, 2026-10-09: "going
         * straight with the same thickness and straight consistent edges"),
         * and snapping the line to the lane's centre drew a sideways step
         * where a runner met a lane -- the right angle he saw. The drawn
         * centre is its own, shifted by the track's wander.
         */
        let cx = x;
        let cyOff = 0;
        let rw = 0;
        for (let q = 0; q <= steps; q++) {
          const f = q / steps;
          const run = ran0 + ds * f;
          const px = x + dx * f - bx * a * 0.5;
          let py = y + dy * f - by * a * 0.5;
          /*
           * The swells and wander are fixed to the glass along the way it
           * runs (down the pane in still air: y; across it in a wind --
           * keyed by y, a stream blown sideways kept one width all the way,
           * a rod).
           */
          const key = py * by + px * bx;
          const width =
            mix >= 1
              ? streamWidth(track, run, key)
              : streamWidth(was, run, key) * (1 - mix) + streamWidth(track, run, key) * mix;
          const own = a * width * trackTaper(id, run, a, this.ranStart[i]!) * this.tailBoost[i]!;
          rw = Math.max(own, laneW);
          const shift =
            mix >= 1
              ? streamShiftMm(track, key, rw)
              : streamShiftMm(was, key, rw) * (1 - mix) + streamShiftMm(track, key, rw) * mix;
          // Across the way it runs.
          cx = px + shift * by + this.trackOff[i]! * Math.exp((-ds * f) / TRACK_EASE_MM);
          cyOff = -shift * bx;
          py += cyOff;
          // At least half a cell wide so no cell is skipped; the width remembered is the true one.
          this.layLane(
            cx,
            py,
            Math.max(LANE_CELL * 0.5, rw * LANE_SHARE),
            id,
            stand * standLevel(run - this.ranStart[i]!) * weight,
            track,
            rw * LANE_SHARE,
          );
        }
        this.trackOff[i] = this.trackOff[i]! * Math.exp(-ds / TRACK_EASE_MM);
        this.tailBoost[i] = 1 + (this.tailBoost[i]! - 1) * Math.exp(-ds / IMPACT_TAIL_MM);
        {
          // Its path, for the renderer: where it is, its run, and the track as laid -- centre and half-width, mm.
          const t = this.paths.get(id);
          const e = [this.x[i]!, this.y[i]! + cyOff, this.ran[i]!, cx, rw];
          if (t) t.push(...e);
          else this.paths.set(id, e);
        }
      }
      /*
       * The water a runner leaves in its track is water it no longer has: a
       * film about FILM_LINE_MM deep across the track's width for a clear
       * line, thinner for a thread or a near-dry track. A stream draining
       * itself into its own line slows and stalls, and goes on again when it
       * picks up another drop -- the surges of a real window.
       */
      if (this.trails && l.trails) {
        const mode = this.trailMode(i);
        const depth = mode === "line" ? FILM_LINE_MM : FILM_THREAD_MM;
        const share = mode === "line" ? 0.55 : mode === "dotted" ? 0.3 : 0.22;
        // Down a lane already wet it lays no new film: a pulse runs the length of the stream (clip E: half the streams reach the top edge).
        const dry = 1 - Math.min(1, this.rivuletAt(x, y + a) / 0.5);
        // The drop you steer leaves its trail too, but thinly: enough to see it give water to the glass, not enough to empty it in a breath.
        const lost = Math.min(
          this.vol[i]!,
          depth * 2 * a * share * ds * dry * (this.serial[i] === this.player ? 0.6 : 1),
        );
        this.vol[i] = this.vol[i]! - lost;
        this.filmVolume += lost;
      }
      /*
       * Pearls: a drop running fast enough that its rear is a cusp leaves
       * small drops behind (Le Grand, Daerr & Limat 2005; Podgorski 2001);
       * and every stream's wake, as it drains, breaks into droplets along
       * the path (Frenkel 1948; Ony, 2026-10-09: "the stream slowly
       * disappears leaving behind some drops along the path"). So every
       * head sheds beads: a fast one or a dotted thread closely, a clear
       * line sparsely (shedTrail); they sit under the standing water until
       * it drains (the renderer hides a bead in a standing lane).
       */
      if (this.trails && l.trails) this.shedTrail(i, a);
    }
    // Gone: evaporated, or run off the bottom.
    for (let i = this.count - 1; i >= 0; i--) {
      const v = this.vol[i]!;
      // Off the bottom: out of sight once it is wholly past the edge (the window goes on).
      if (!(v >= V_MIN) || this.y[i]! - this.radius(i) > this.height) {
        this.remove(i);
        continue;
      }
      // A pool on a bottom frame heavy enough to hang: a drip falls from it, and what stays is the rest.
      if (this.bottomPool && v > DRIP_UL * (0.8 + 0.4 * hash01(this.serial[i]!, 4400))) {
        const a = this.radius(i);
        if (this.y[i]! + a * 0.75 >= this.height - 0.05) {
          this.vol[i] = v * (0.35 + 0.2 * hash01(this.serial[i]!, 4401 + Math.floor(this.clock)));
          this.dripped.push(this.x[i]!, this.height);
          this.dirty[i] = 1;
        }
      }
    }
    if (this.mergeAll()) moving = true;
    /*
     * A drop that touches a standing stream joins it (Ony, 2026-10-09: drops
     * "absorb drops they touch"): the stream is water, so where their edges
     * meet the two are one liquid and the drop drains into the stream and on
     * down with it. Checked four times a second at the drop's sides and
     * foot, never against the line the drop itself is laying.
     */
    this.drainClock += dt;
    const sweep = this.drainClock >= 0.25;
    if (sweep) this.drainClock = 0;
    for (let i = this.count - 1; i >= 0; i--) {
      // A running drop in a lane is the stream's own pulse: it goes on down, laying the line wet again.
      if (Math.hypot(this.vx[i]!, this.vy[i]!) >= 0.5) continue;
      // The drop you steer takes the stream in, never the other way round.
      if (this.serial[i] === this.player) continue;
      const a = this.radius(i);
      const x = this.x[i]!;
      const y = this.y[i]!;
      // Every step the cheap test (its centre in a lane: a landing just made); four times a second the full one, its contact patch.
      if (!sweep && this.rivuletAt(x, y) <= DropSim.TAKES_AT) continue;
      if (this.touchesLane(x, y, a, this.serial[i]!, this.parent[i]!, DropSim.TAKES_AT)) {
        this.filmVolume += this.vol[i]!;
        this.drained.push(x, y, a);
        this.remove(i);
        moving = true;
      }
    }
    return moving;
  }

  /** Shed a trail drop once it has run far enough (raindrop-fx raindrop.ts L88-L108). */
  private shedTrail(i: number, a: number) {
    /*
     * The water a running head leaves behind it is a thread, and a thread
     * of water is unstable (Rayleigh-Plateau): as the stream drains and
     * thins it pinches into sections that pull together into beads about
     * 4.5 of its widths apart (Ony, 2026-10-10: "the stream will start to
     * separate into smaller sections that pull together into small water
     * beads. The water doesn't just fade away"). So the head lays its
     * beads as it goes, each the stream's own water over one spacing; they
     * are part of the stream while it stands (hidden in it) and show as it
     * drains from round them. A fast head's cusp pearls closer.
     */
    // Only a head lays a thread (a bead sliding down the wet track is the thread's water, not a stream of its own).
    if (this.parent[i]! >= 0) return;
    const s = this.serial[i]!;
    const k = this.shed[i]!;
    const speed = Math.hypot(this.vx[i]!, this.vy[i]!);
    const id = this.trackId[i]!;
    const rw =
      a * streamWidth(id, this.ran[i]!, this.y[i]! - a * 0.5) * trackTaper(s, this.ran[i]!, a);
    const close = this.trailMode(i) === "dotted" || speed > PEARL_SPEED ? 0.6 : 1;
    const every =
      Math.max(1.0, 4.5 * 2 * rw * (0.45 + 1.25 * hash01(s, k * 3 + 1) ** 1.5) * close) *
      (s === this.player ? 3 : 1);
    if (this.run[i]! < every) return;
    // Shed where it crossed the mark, and carry what it ran past it.
    const past = this.run[i]! - every;
    this.run[i] = past;
    this.shed[i] = k + 1;
    const along = speed || 1;
    const ux = speed > 0 ? this.vx[i]! / along : 0;
    const uy = speed > 0 ? this.vy[i]! / along : 1;
    const backX = ux * past;
    const backY = uy * past;
    // The thread's water over one spacing (a low cap, about 0.4 of its half-width high), varied, and never much of the head.
    /*
     * Varied after the cap, not before it: capped first, a stream's beads all
     * came out the one size (Ony, 2026-10-10: "too many of the same beads").
     * A thread breaks unevenly -- some sections gather more, and between the
     * main beads it leaves satellites, droplets a fraction their size.
     */
    const hv = hash01(s, k * 3 + 2);
    const v = Math.min(
      1,
      Math.min(this.vol[i]! * 0.025, 0.6, 0.35 * rw * rw * every) * (0.25 + 1.6 * hv * hv),
    );
    if (v < V_MIN || this.count >= this.max) return;
    const sat = hash01(s, k * 7 + 5);
    if (sat < 0.35 && this.count + 1 < this.max) {
      const sv = v * (0.04 + 0.14 * hash01(s, k * 7 + 6));
      if (sv >= V_MIN) {
        const back = every * (0.35 + 0.3 * sat);
        const q = (hash01(s, k * 7 + 7) - 0.5) * 0.8 * rw;
        const js = this.add(
          this.x[i]! - backX + this.trackOff[i]! + q * uy - ux * (a * 0.8 + back),
          this.y[i]! - backY - q * ux - uy * (a * 0.8 + back),
          sv,
          this.liquid[i]!,
          this.trackId[i]!,
        );
        if (js >= 0) this.vol[i] = this.vol[i]! - sv;
      }
    }
    // On the thread's line: a little either side of where the runner's centre passed.
    const side = (hash01(s, k * 3 + 3) - 0.5) * 0.5 * rw;
    // Behind it (above), where its tail was; the track's bead (parent: the track, so it is not drained into its own stream).
    const j = this.add(
      this.x[i]! - backX + side * uy + this.trackOff[i]! - ux * a * 0.8,
      this.y[i]! - backY - side * ux - uy * a * 0.8,
      v,
      this.liquid[i]!,
      this.trackId[i]!,
    );
    if (j >= 0) {
      this.vol[i] = this.vol[i]! - v;
      /*
       * A bead is a piece of the stream that let go (Ony, 2026-10-11: "they
       * start off as more vertical, like a segment of the tail, and then the
       * surface tension brings it back together into a round shape"): it
       * starts as that segment -- its water in a short line along the
       * stream's own direction -- and draws itself round over a fraction of
       * a second, never a round drop appearing from nowhere.
       */
      const aj = this.radius(j);
      const len = Math.min(every * 0.8, aj * 4);
      const n = v > 12 * V_MIN ? 3 : 2;
      const cx = this.x[j]!;
      const cy = this.y[j]!;
      const list: [number, number, number][] = [];
      for (let m = 0; m < n; m++) {
        const f = (m / (n - 1) - 0.5) * len;
        list.push([cx + ux * f, cy + uy * f, v / n]);
      }
      this.partsOf(j, list);
      this.fuseTau[j] = 0.16;
      this.fuseUntil[j] = this.clock + 0.16 * 5;
    }
  }

  /** Whether i and j may merge: not a drop and its own trail, nor two of one drop's trail. */
  private related(i: number, j: number): boolean {
    /*
     * A running head does not take back the beads it is laying behind it
     * (they are its trail). Once it stops, or between two beads, water that
     * touches is one water (Ony, 2026-10-10: drops too close together merge).
     */
    const pi = this.parent[i]!;
    const pj = this.parent[j]!;
    const runs = (k: number) => Math.hypot(this.vx[k]!, this.vy[k]!) >= 0.5;
    return (pi === this.serial[j] && runs(j)) || (pj === this.serial[i] && runs(i));
  }

  /**
   * Merge every overlapping pair (contact circles touching): volume adds,
   * momentum is kept, the centre goes to the volume-weighted mean. The grid
   * is rebuilt each pass with cells at least twice the largest radius, so
   * any two drops that touch are in the same or neighbouring cells.
   * Passes repeat until nothing merges (a grown drop can reach new ones).
   */
  private mergeAll(): boolean {
    let any = false;
    let some = false;
    for (let i = 0; i < this.count; i++) if (this.dirty[i]) some = true;
    if (!some) return false;
    for (let pass = 0; pass < 8; pass++) {
      if (!this.mergePass()) break;
      any = true;
    }
    this.dirty.fill(0, 0, this.count);
    return any;
  }

  private cellStart = new Int32Array(1);
  private order = new Int32Array(1);
  private radii = new Float64Array(1);

  private mergePass(): boolean {
    const n = this.count;
    if (n < 2) return false;
    if (this.radii.length < n) {
      this.radii = new Float64Array(this.max);
      this.order = new Int32Array(this.max);
    }
    let maxA = 0;
    for (let i = 0; i < n; i++) {
      // Its reach: the drawn footprint (patchScale) out to its furthest lobe, and the snap.
      const a = this.reachOf(i);
      this.radii[i] = a;
      if (a > maxA) maxA = a;
    }
    const cell = Math.max(2 * maxA, 1);
    // Drops may hang a little off the pane: pad by a cell either side.
    const cols = Math.ceil(this.width / cell) + 3;
    const rows = Math.ceil(this.height / cell) + 3;
    const cellOf = (i: number) => {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(this.x[i]! / cell) + 1));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(this.y[i]! / cell) + 1));
      return cy * cols + cx;
    };
    // Counting sort by cell.
    const cells = cols * rows;
    if (this.cellStart.length < cells + 1) this.cellStart = new Int32Array(cells + 1);
    const start = this.cellStart;
    start.fill(0, 0, cells + 1);
    for (let i = 0; i < n; i++) start[cellOf(i) + 1]!++;
    for (let c = 0; c < cells; c++) start[c + 1] = start[c + 1]! + start[c]!;
    const fill = start.slice(0, cells);
    for (let i = 0; i < n; i++) this.order[fill[cellOf(i)]!++] = i;

    const dead = new Uint8Array(n);
    let merged = false;
    for (let i = 0; i < n; i++) {
      if (dead[i] || !this.dirty[i]) continue;
      const c = cellOf(i);
      const cx = c % cols;
      const cy = (c - cx) / cols;
      for (let oy = -1; oy <= 1; oy++) {
        const ry = cy + oy;
        if (ry < 0 || ry >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const rx = cx + ox;
          if (rx < 0 || rx >= cols) continue;
          const cc = ry * cols + rx;
          for (let q = start[cc]!; q < start[cc + 1]!; q++) {
            const j = this.order[q]!;
            // Two that both moved are tested once, from the lower index.
            if (j === i || dead[j] || dead[i] || (this.dirty[j] && j < i)) continue;
            if (this.liquid[i] !== this.liquid[j]) continue;
            if (this.related(i, j)) continue;
            const dx = this.x[j]! - this.x[i]!;
            const dy = this.y[j]! - this.y[i]!;
            const reach = this.radii[i]! + this.radii[j]!;
            if (dx * dx + dy * dy >= reach * reach) continue;
            // Their contact circles overlap, or their drawn footprints touch (a flatter patch reaches further).
            const ra = this.radius(i) + this.radius(j);
            if (dx * dx + dy * dy >= ra * ra && !this.touching(i, j)) continue;
            // The larger keeps its identity; the smaller is absorbed.
            const [keep, gone] = this.vol[i]! >= this.vol[j]! ? [i, j] : [j, i];
            this.absorb(keep, gone);
            dead[gone] = 1;
            this.dirty[keep] = 1;
            this.radii[keep] = this.reachOf(keep);
            merged = true;
            this.merges++;
          }
        }
      }
    }
    if (merged) {
      for (let i = n - 1; i >= 0; i--) if (dead[i]) this.remove(i);
    }
    return merged;
  }

  /** How far drop i's drawn footprint reaches from its centre, mm (its furthest lobe), and the merge snap. */
  private reachOf(i: number): number {
    const sc = patchScale(this.serial[i]!, restAngle(this.liquidOf(i)));
    const o = i * MAX_PARTS;
    let r = this.radius(i) * sc;
    if (this.partN[i]! > 1)
      for (let k = 0; k < this.partN[i]!; k++) {
        const pa = capOf(this.vol[i]! * this.partF[o + k]!, restAngle(this.liquidOf(i))).a * sc;
        r = Math.max(r, Math.hypot(this.partX[o + k]!, this.partY[o + k]!) + pa);
      }
    return Math.max(r, this.radius(i)) + MERGE_SNAP_MM * 0.5;
  }

  /** Whether two drops' drawn footprints (each lobe, at its patch's size) touch, within MERGE_SNAP_MM. */
  private touching(i: number, j: number): boolean {
    const pi = this.footprint(i);
    const pj = this.footprint(j);
    for (let p = 0; p < pi.length; p += 3)
      for (let q = 0; q < pj.length; q += 3) {
        const r = pi[p + 2]! + pj[q + 2]! + MERGE_SNAP_MM;
        const dx = pi[p]! - pj[q]!;
        const dy = pi[p + 1]! - pj[q + 1]!;
        if (dx * dx + dy * dy < r * r) return true;
      }
    return false;
  }

  /** A drop's footprint as discs (x, y, radius, mm): one, or one per lobe. */
  private footprint(i: number): number[] {
    const sc = patchScale(this.serial[i]!, restAngle(this.liquidOf(i)));
    if (this.partN[i]! <= 1) return [this.x[i]!, this.y[i]!, this.radius(i) * sc];
    const out: number[] = [];
    const o = i * MAX_PARTS;
    for (let k = 0; k < this.partN[i]!; k++)
      out.push(
        this.x[i]! + this.partX[o + k]!,
        this.y[i]! + this.partY[o + k]!,
        capOf(this.vol[i]! * this.partF[o + k]!, restAngle(this.liquidOf(i))).a * sc,
      );
    return out;
  }

  /** Pull a drop's parts toward its centre by `keep` of their offsets; parts that have closed up join. */
  /** How much of its lobes' spread a drop keeps this step: its coalescence while it lasts, else `otherwise`. */
  private fuseKeep(i: number, dt: number, otherwise: number): number {
    if (this.fuseTau[i]! > 0 && this.clock < this.fuseUntil[i]!)
      return Math.exp(-dt / this.fuseTau[i]!);
    if (this.fuseTau[i]! > 0) this.fuseTau[i] = 0;
    return otherwise;
  }

  private creep(i: number, keep: number) {
    const n = this.partN[i]!;
    if (n <= 1) return;
    const o = i * MAX_PARTS;
    for (let k = 0; k < n; k++) {
      this.partX[o + k] = this.partX[o + k]! * keep;
      this.partY[o + k] = this.partY[o + k]! * keep;
    }
    // Parts closer than a tenth of the drop's radius are one.
    const a = this.radius(i);
    if (n === 2) {
      const d = Math.hypot(
        this.partX[o]! - this.partX[o + 1]!,
        this.partY[o]! - this.partY[o + 1]!,
      );
      if (d < 0.1 * a) this.partsOf(i, [[this.x[i]!, this.y[i]!, this.vol[i]!]]);
    } else {
      let spread = 0;
      for (let k = 0; k < n; k++)
        spread = Math.max(spread, Math.hypot(this.partX[o + k]!, this.partY[o + k]!));
      if (spread < 0.05 * a) this.partsOf(i, [[this.x[i]!, this.y[i]!, this.vol[i]!]]);
    }
  }

  /**
   * Keep drop i wholly on the glass (Ony, 2026-10-03: "the rain gets cut at
   * the edges. That's not how rain would react to an edge"): a drop cannot
   * hang past the pane's edge, its contact line stops there, so one that
   * lands or slides against a side or the top sits against it.
   */
  private keepOn(i: number) {
    const a = this.radius(i);
    let lo = a;
    let hi = this.width - a;
    // Its lobes reach further than its own radius.
    const o = i * MAX_PARTS;
    for (let k = 0; k < this.partN[i]!; k++) {
      const pa = capOf(this.vol[i]! * this.partF[o + k]!, restAngle(this.liquidOf(i))).a;
      lo = Math.max(lo, pa - this.partX[o + k]!);
      hi = Math.min(hi, this.width - pa - this.partX[o + k]!);
    }
    if (lo <= hi) this.x[i] = Math.min(hi, Math.max(lo, this.x[i]!));
    else this.x[i] = this.width / 2;
    if (this.y[i]! < a) this.y[i] = a;
    // A frame along the bottom: it rests against it, its contact line at the edge.
    if (this.bottomPool && this.y[i]! > this.height - a * 0.75) this.y[i] = this.height - a * 0.75;
  }

  /**
   * A drop landing does not settle round: it spreads on impact and pulls
   * back, and its contact line catches on the glass's specks as it does, so
   * it rests in an uneven footprint (Ony, 2026-10-03: "keep adding more
   * misshapen raindrops"). Two to four lobes round its centre, most of the
   * water in one.
   */
  private splash(i: number) {
    const v = this.vol[i]!;
    if (v < SPLASH_MIN) return;
    const s = this.serial[i]!;
    const lobes = 1 + Math.floor(hash01(s, 501) * 3.2);
    const a = this.radius(i);
    const list: [number, number, number][] = [];
    let left = v;
    for (let k = 0; k < lobes; k++) {
      const ang = hash01(s, 510 + k) * Math.PI * 2;
      const d = a * (0.35 + 0.45 * hash01(s, 520 + k));
      const share = left * (0.15 + 0.3 * hash01(s, 530 + k));
      list.push([this.x[i]! + Math.cos(ang) * d, this.y[i]! + Math.sin(ang) * d, share]);
      left -= share;
    }
    list.push([this.x[i]!, this.y[i]!, left]);
    // The centre of the water, kept.
    let cx = 0;
    let cy = 0;
    for (const p of list) {
      cx += p[0] * p[2];
      cy += p[1] * p[2];
    }
    this.x[i] = cx / v;
    this.y[i] = cy / v;
    this.partsOf(i, list);
    this.keepOn(i);
  }

  /** Drop i's parts, page mm and uL. */
  parts(i: number): [number, number, number][] {
    const o = i * MAX_PARTS;
    const out: [number, number, number][] = [];
    for (let k = 0; k < this.partN[i]!; k++)
      out.push([
        this.x[i]! + this.partX[o + k]!,
        this.y[i]! + this.partY[o + k]!,
        this.vol[i]! * this.partF[o + k]!,
      ]);
    return out;
  }

  /** Set drop i's parts from page positions and volumes (its centre and volume must already be theirs). */
  private partsOf(i: number, list: [number, number, number][]) {
    // Too many: join the two closest, volume-weighted, until they fit.
    while (list.length > MAX_PARTS) {
      let bi = 0;
      let bj = 1;
      let bd = Infinity;
      for (let p = 0; p < list.length; p++)
        for (let q = p + 1; q < list.length; q++) {
          const d = Math.hypot(list[p]![0] - list[q]![0], list[p]![1] - list[q]![1]);
          if (d < bd) {
            bd = d;
            bi = p;
            bj = q;
          }
        }
      const [x1, y1, v1] = list[bi]!;
      const [x2, y2, v2] = list[bj]!;
      const v = v1 + v2;
      list[bi] = [(x1 * v1 + x2 * v2) / v, (y1 * v1 + y2 * v2) / v, v];
      list.splice(bj, 1);
    }
    let total = 0;
    for (const p of list) total += p[2];
    const o = i * MAX_PARTS;
    this.partN[i] = list.length;
    for (let k = 0; k < list.length; k++) {
      this.partX[o + k] = list[k]![0] - this.x[i]!;
      this.partY[o + k] = list[k]![1] - this.y[i]!;
      this.partF[o + k] = total > 0 ? list[k]![2] / total : 1 / list.length;
    }
  }

  /** Put drop `gone` into drop `keep`: volume, momentum and centre of volume kept exactly. */
  private absorb(keep: number, gone: number) {
    const va = this.vol[keep]!;
    const vb = this.vol[gone]!;
    const v = va + vb;
    // Resting drops keep each other's footprints (pinned contact lines); a running one swallows and goes on round.
    /*
     * Only two drops that both sat where they landed keep their pinned
     * footprints (a peanut, a clover); one that slid into the other -- a
     * creeper caught between bursts included -- is moving water, and the
     * merged drop pulls round (else a creeper and the drop below it stood
     * as a vertical capsule for a minute: Ony, 2026-10-10, "rods").
     */
    const still =
      Math.hypot(this.vx[keep]!, this.vy[keep]!) < 0.5 &&
      Math.hypot(this.vx[gone]!, this.vy[gone]!) < 0.5 &&
      this.ran[keep]! < 0.5 &&
      this.ran[gone]! < 0.5;
    // Both footprints, always: the neck joins them at once and the lobes then pull together (fuseTau).
    const list = [...this.parts(keep), ...this.parts(gone)];
    /*
     * A running head that swallows a bigger resting drop is still the same
     * stream: the merged drop carries the runner's identity on, so the lane
     * behind it stays its own (else the next drain check found the merged
     * drop "touching another's stream" and drained the head away).
     */
    const youGone =
      this.player >= 0 && (this.serial[gone] === this.player || this.serial[keep] === this.player);
    const goneRuns = Math.hypot(this.vx[gone]!, this.vy[gone]!) >= 0.5;
    const keepRuns = Math.hypot(this.vx[keep]!, this.vy[keep]!) >= 0.5;
    if (goneRuns && !keepRuns) {
      this.serial[keep] = this.serial[gone]!;
      this.run[keep] = this.run[gone]!;
      this.shed[keep] = this.shed[gone]!;
      this.ran[keep] = this.ran[gone]!;
      this.trackId[keep] = this.trackId[gone]!;
      this.laneWidth[keep] = this.laneWidth[gone]!;
      this.trackWas[keep] = this.trackWas[gone]!;
      this.trackMix[keep] = this.trackMix[gone]!;
      this.pathX[keep] = this.pathX[gone]!;
      this.trackOff[keep] = this.trackOff[gone]!;
      this.tailBoost[keep] = this.tailBoost[gone]!;
      this.ranStart[keep] = this.ranStart[gone]!;
    }
    const x0 = this.x[keep]!;
    const x1 = this.x[gone]!;
    this.x[keep] = (this.x[keep]! * va + this.x[gone]! * vb) / v;
    this.y[keep] = (this.y[keep]! * va + this.y[gone]! * vb) / v;
    /*
     * The merge moves the water's centre at once; that move is not a run.
     * Drawn as a jump it was a sideways step (Ony, 2026-10-09: right
     * angles); drawn as a break, a jog where the line restarted off to one
     * side (2026-10-10). The stream is one body of water: its track goes on
     * from where it was and eases over to where the water now is across
     * TRACK_EASE_MM of run (trackOff), a curve.
     */
    if (goneRuns || keepRuns) {
      const was = goneRuns && !keepRuns ? x1 : x0;
      this.trackOff[keep] = Math.max(-2, Math.min(2, this.trackOff[keep]! + was - this.x[keep]!));
    }
    this.vx[keep] = (this.vx[keep]! * va + this.vx[gone]! * vb) / v;
    this.vy[keep] = (this.vy[keep]! * va + this.vy[gone]! * vb) / v;
    this.vol[keep] = v;
    // What you steer goes on as you, whichever of the two the water is kept in.
    if (youGone) this.serial[keep] = this.player;
    this.partsOf(keep, list);
    /*
     * The smaller one drains into the bigger (its Laplace pressure is higher):
     * a tiny drop in a tenth of a second or so, a big one over most of a
     * second (estimates; coalescence of sessile drops). Two that sat where
     * they landed are held by their pinned lines: they draw together only
     * partway (about a third of the way in) and keep a lobed footprint; a moving one
     * pulls round.
     */
    const small = Math.min(va, vb);
    this.fuseTau[keep] = 0.05 + 0.12 * Math.cbrt(small);
    this.fuseUntil[keep] = this.clock + this.fuseTau[keep]! * (still ? 0.45 : 4);
    // It is no longer anyone's trail.
    this.parent[keep] = -1;
  }

  /** The total volume on the pane, uL. */
  totalVolume(): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) s += this.vol[i]!;
    return s;
  }
}
