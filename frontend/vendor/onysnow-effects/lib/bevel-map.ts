/**
 * The displacement map for the pane bevel, computed from a distance field.
 *
 * WHAT CHANGED AND WHY
 *
 * The map used to be a single 8x128 PNG: a one-dimensional vertical profile,
 * green channel only, stretched across every pane with
 * `preserveAspectRatio="none"`. That carries two assumptions that are no longer
 * true. It has no horizontal component at all, so a pane narrow enough to show
 * its left and right arrises has no bend there; and its profile is a squircle
 * ramp, which is not the cross-section of a rounded-over edge.
 *
 * This computes the field instead, per pane geometry:
 *
 *   1. a rounded-rectangle signed distance function, so the bevel follows the
 *      pane's actual corner radius rather than being stretched over it;
 *   2. a circular height profile, `sqrt(d * (2R - d))` -- the true
 *      cross-section of an edge rounded over with radius R;
 *   3. the surface normal from the gradient of that height, by central
 *      differences, which is exact at every pixel and every size.
 *
 * The SDF and the height profile are from ybouane/liquidglass (MIT), which
 * arrives at the same place for a WebGL pipeline that rasterises the page into
 * a texture. We keep `backdrop-filter`, which gets the real backdrop from the
 * compositor for nothing, and take the geometry.
 *
 * ENCODING, WHICH IS FUSSY AND HAS BROKEN BEFORE
 *
 * `feDisplacementMap` reads the red channel as the X component of the
 * displacement and green as Y, each mapped from [0, 255] onto [-0.5, 0.5] and
 * then scaled. 128 is the fixed point: a pixel encoded 128 is not moved. Any
 * drift in the body of the map shifts the entire backdrop behind the pane,
 * which is what "the photographs are smeared" looked like the last time this
 * was wrong. `interiorIsNeutral` below is the guard.
 */

/*
 * The SDF, the height profile and the Snell offset used to be defined here,
 * and again -- differently -- in each shader. They live in the shared optics
 * library now, so the bend this map draws and the light the shaders draw are
 * computed from the same edge. Re-exported so existing imports keep working.
 */
import { waveSlope } from "@fx/effects/optics/waviness";
import {
  refractionOffset,
  roundedRectSDF,
  roundedRectSDFSmooth,
  type SurfaceProfile,
} from "@fx/effects/optics/edge-profile";
export { refractionOffset, roundedRectSDF, surfaceHeight } from "@fx/effects/optics/edge-profile";
export type { SurfaceProfile } from "@fx/effects/optics/edge-profile";

export type BevelField = {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, ready for `putImageData`. */
  data: Uint8ClampedArray;
  /**
   * The largest offset anywhere in the field, in map pixels.
   *
   * The map encodes each offset as a fraction of this, so the filter's `scale`
   * has to be set to it for the result to come out in real pixels. That is the
   * number that used to be a chosen 40.
   */
  maxOffset: number;
};

export type BevelOptions = {
  /** How wide the rounded-over edge is, in map pixels. */
  bezelWidth: number;
  /** How thick the slab is behind the bevel, in map pixels. */
  thickness: number;
  /** Index of refraction. 1.5 is ordinary glass. */
  ior: number;
  profile?: SurfaceProfile;
  /**
   * Bevel the top and bottom edges only. A band that runs the full width of
   * the page has no sides worth the name -- they are off the edge of the
   * screen -- and bending them draws corners where there should be none.
   */
  straight?: boolean;
  /**
   * Rolled or hammered glass (effects/optics/waviness): its ripples tip the
   * line of sight across the whole face, so what is behind is seen shifted
   * by the surface's slope, as well as bent at the bevel. `shift` is how far
   * one unit of slope moves it, in CSS px (waveScale); `cssPerMap` how many
   * CSS px one map pixel stands for; `seed` which surface the pane wears.
   */
  wave?: { shift: number; seed: number; cssPerMap: number } | undefined;
  /** ?try=corners: round the bevel's contours through the corners over this depth, map px. */
  cornerSoft?: number;
};

/**
 * Compute the map for one pane geometry.
 *
 * Everything is in the map's own pixel space. The caller scales the pane's
 * dimensions down uniformly before calling, so the bevel stays in proportion
 * when the map is stretched back over the pane.
 */
export function bevelField(
  width: number,
  height: number,
  radius: number,
  options: BevelOptions,
): BevelField {
  const { bezelWidth, thickness, ior, profile = "circle", wave } = options;
  const data = new Uint8ClampedArray(width * height * 4);
  const halfH = height / 2;
  // Straight: measure distance to the top and bottom only, as if the pane
  // ran on forever sideways.
  const halfW = options.straight ? 1e7 : width / 2;
  const e = 1;

  const ox = new Float32Array(width * height);
  const oy = new Float32Array(width * height);
  let maxOffset = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = options.straight ? 0 : x + 0.5 - halfW;
      const py = y + 0.5 - halfH;

      const inside = -roundedRectSDFSmooth(
        px,
        py,
        halfW,
        halfH,
        radius,
        options.straight ? 0 : (options.cornerSoft ?? 0),
      );
      if (inside <= 0) continue;
      const i = y * width + x;
      if (wave && wave.shift > 0) {
        // Pane-local CSS px from its top-left: the point the floor's caustic reads.
        const [sx, sy] = waveSlope(
          (x + 0.5) * wave.cssPerMap,
          (y + 0.5) * wave.cssPerMap,
          wave.seed,
        );
        ox[i] = (sx * wave.shift) / wave.cssPerMap;
        oy[i] = (sy * wave.shift) / wave.cssPerMap;
      }
      // Past the bevel the face is flat, so the ray goes straight through.
      if (inside >= bezelWidth) {
        const mag = Math.hypot(ox[i]!, oy[i]!);
        if (mag > maxOffset) maxOffset = mag;
        continue;
      }

      /*
       * The direction is the SDF's own gradient, which points straight in from
       * the nearest edge -- along the top it is downward, at a corner it is
       * diagonal, and it follows the corner radius without being told about
       * it. The magnitude is Snell. Separating the two is what lets one
       * one-dimensional profile wrap correctly around a two-dimensional pane.
       */
      const soft = options.straight ? 0 : (options.cornerSoft ?? 0);
      const sdf = (qx: number, qy: number) =>
        roundedRectSDFSmooth(qx, qy, halfW, halfH, radius, soft);
      const dR = -sdf(px + e, py);
      const dL = -sdf(px - e, py);
      const dD = -sdf(px, py + e);
      const dU = -sdf(px, py - e);

      let gx = (dR - dL) / (2 * e);
      let gy = (dD - dU) / (2 * e);
      const len = Math.hypot(gx, gy);
      if (len < 1e-6) continue;
      gx /= len;
      gy /= len;

      const offset = refractionOffset(inside / bezelWidth, bezelWidth, thickness, ior, profile);

      ox[i] = ox[i]! + gx * offset;
      oy[i] = oy[i]! + gy * offset;
      const mag = Math.hypot(ox[i]!, oy[i]!);
      if (mag > maxOffset) maxOffset = mag;
    }
  }

  const norm = maxOffset > 0 ? 1 / maxOffset : 0;

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    // 128 exactly, not 127.5 rounded: a pixel in the body of the pane must not
    // move at all, and a half-step bias across the whole interior is a visible
    // shift of the entire backdrop.
    data[o] = 128 + Math.round(ox[i]! * norm * 127);
    data[o + 1] = 128 + Math.round(oy[i]! * norm * 127);
    data[o + 2] = 0;
    data[o + 3] = 255;
  }

  return { width, height, data, maxOffset };
}

/** True when nothing in the flat middle of the pane is displaced. */
export function interiorIsNeutral(field: BevelField, bezelWidth: number): boolean {
  const { width, height, data } = field;
  const halfW = width / 2;
  const halfH = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = -roundedRectSDF(x + 0.5 - halfW, y + 0.5 - halfH, halfW, halfH, 0);
      if (inside <= bezelWidth + 2) continue;
      const o = (y * width + x) * 4;
      if (data[o] !== 128 || data[o + 1] !== 128) return false;
    }
  }
  return true;
}
