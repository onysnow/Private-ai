/**
 * What every light in the scene does at a crack (item 10, step 3).
 *
 * A crack is a thin air gap with two new glass faces standing across the
 * pane. Light inside the glass meets a face past the critical angle and is
 * mirrored whole, so a crack flashes where a light, the face and your eye
 * line up; and light piped along the pane escapes at the gap, so a crack
 * glows near a light. That was worked out for the cursor lamp alone. Here it
 * is every light in the list -- the flash, a flare, the flashlight's beam,
 * a neon sign -- each in its own colour, at its own strength against the
 * lamp's, and a beam only where it points (effects/light/beam).
 *
 * Pure: the caller (components/site/BrokenGlass) walks the cracks and draws.
 */

import { beamFactor, type Aim } from "@fx/effects/light/beam";

/** Glass's index. */
export const N_GLASS = 1.518;
/** Past this angle from a crack face's normal, the face is a mirror (TIR). */
export const CRITICAL = Math.asin(1 / N_GLASS);
/** Glass-to-air reflectance square on: the back face's share of a downward ray. */
export const BACK_R0 = Math.pow((N_GLASS - 1) / (N_GLASS + 1), 2);
/** How far light piped along the pane reaches before it is spent, px (the glass shader's exp(-d/780)). */
export const PIPED_REACH = 780;

export type V3 = { x: number; y: number; z: number };

/** A light as a crack sees it: in the pane's own pixels, z its height above the glass. */
export type CrackLightSource = {
  at: V3;
  colour: readonly [number, number, number];
  /** Its strength against the lamp's own (the lamp at full is 1): what it pipes along the pane. */
  strength: number;
  /**
   * How far past white the light itself is, seen directly ("Core gain" for
   * the lamp, 8 by default): what its mirror image in a crack face shows.
   */
  radiance: number;
  /** How hard it is burning, 0 to 1. */
  charge: number;
  aim?: Aim | undefined;
};

/**
 * The light a crack segment sends to the eye from every light: its mirror
 * flash and the piped light escaping at it, as linear RGB (the lamp's full
 * flash on axis is about 1.4 in each channel).
 *
 * `mid` is the segment's middle on the pane (z 0), `face` the fracture
 * face's unit normal (leaning with the face), `eye` the viewer, `rough` how
 * much the face has turned to mist and hackle near the impact (0 to 1).
 */
export function crackGlow(
  lights: readonly CrackLightSource[],
  mid: { x: number; y: number },
  face: V3,
  eye: V3,
  rough: number,
): { rgb: [number, number, number]; flash: number } {
  const rgb: [number, number, number] = [0, 0, 0];
  let strongestFlash = 0;
  const te = { x: eye.x - mid.x, y: eye.y - mid.y, z: eye.z };
  const tel = Math.hypot(te.x, te.y, te.z) || 1;
  for (const light of lights) {
    const on = light.charge * light.strength;
    if (on <= 0) continue;
    const L = light.at;
    const tl = { x: mid.x - L.x, y: mid.y - L.y, z: -L.z };
    // A beam lights only what it points at.
    const beam = beamFactor(light.aim, tl.x, tl.y, tl.z);
    if (beam <= 1e-4) continue;
    // Into the glass: the ray steepens (Snell, n = 1.518).
    const tll = Math.hypot(tl.x, tl.y, tl.z) || 1;
    const horiz = Math.hypot(tl.x, tl.y) || 1;
    const sinIn = horiz / tll / N_GLASS;
    const inGlass = {
      x: (tl.x / horiz) * sinIn,
      y: (tl.y / horiz) * sinIn,
      z: -Math.sqrt(1 - sinIn * sinIn),
    };
    const d = inGlass.x * face.x + inGlass.y * face.y + inGlass.z * face.z;
    const incidence = Math.acos(Math.min(1, Math.abs(d)));
    // Past the critical angle the air gap is a perfect mirror; short of it, the Fresnel share.
    const mirror = incidence > CRITICAL ? 1 : 0.08 + 0.3 * Math.pow(incidence / CRITICAL, 6);
    const out = {
      x: inGlass.x - 2 * d * face.x,
      y: inGlass.y - 2 * d * face.y,
      z: inGlass.z - 2 * d * face.z,
    };
    /*
     * A face standing near square to the pane mirrors the light on DOWN, deeper
     * into the glass: it only reaches you after the back surface sends it up
     * again. That bounce is partial -- Fresnel at the glass's back face, about
     * 4% square on (Schlick, R0 = ((n-1)/(n+1))^2) -- since the light went in
     * from air it is never past the critical angle there. A face leaning
     * enough sends it up directly.
     */
    let back = 1;
    if (out.z <= 0) {
      out.z = -out.z;
      back = BACK_R0 + (1 - BACK_R0) * Math.pow(1 - Math.min(1, out.z), 5);
    }
    let flash = 0;
    if (out.z > 0) {
      const outH = Math.hypot(out.x, out.y) || 1;
      const sinOut = Math.min(1, (outH / Math.hypot(out.x, out.y, out.z)) * N_GLASS);
      const leave = {
        x: (out.x / outH) * sinOut,
        y: (out.y / outH) * sinOut,
        z: Math.sqrt(1 - sinOut * sinOut),
      };
      const aligned = Math.max(0, (leave.x * te.x + leave.y * te.y + leave.z * te.z) / tel);
      flash =
        mirror * back * Math.pow(aligned, 60 - 50 * rough) * light.charge * light.radiance * beam;
    }
    // Light piped along the pane escapes at the crack, brighter near the light.
    const piped = on * beam * Math.exp(-Math.hypot(mid.x - L.x, mid.y - L.y) / PIPED_REACH) * 0.12;
    strongestFlash = Math.max(strongestFlash, flash);
    const amount = flash * 1.4 + piped;
    rgb[0] += amount * light.colour[0];
    rgb[1] += amount * light.colour[1];
    rgb[2] += amount * light.colour[2];
  }
  return { rgb, flash: strongestFlash };
}
