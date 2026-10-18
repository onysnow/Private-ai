/**
 * The camera: how the picture is recorded, not what light exists
 * (light-system design, step D).
 *
 * Everything that is the lens or the eye rather than the scene lives here:
 * where the eye is and how far it follows the pointer, the aperture and how
 * it opens with the shutter's charge, the lens's core, ghosts and halo, the
 * glare a bright edge spreads into, and the afterimage the flash leaves. The
 * passes read the camera; none of them reads a camera knob, and a static test
 * (camera.test.ts) holds them to that.
 *
 * The values that come from a knob are getters, so the camera reports exactly
 * what the knob says when read: the same numbers the passes read directly
 * before, which is why nothing on the page changed. The afterimage's knobs
 * reach its CSS through their own custom properties (lib/tuning cssVar), which
 * is the camera's output channel for the stylesheet.
 */

import { CAMERA_DISTANCE } from "@fx/effects/optics/environment";
import { t } from "@fx/lib/tuning";

export const camera = {
  /** How far the eye follows the pointer, 0 to 1 ("Viewpoint follows pointer"). */
  get follow() {
    return t("viewFollow");
  },
  /** The eye's distance from the screen, CSS px, for a viewport this wide. */
  distance(viewportWidth: number) {
    return (t("viewDistance") || CAMERA_DISTANCE) * viewportWidth;
  },
  /** The aperture's radius ("Aperture radius"), and how much it grows with the charge. */
  get aperture() {
    return t("aperture");
  },
  get apertureGrowth() {
    return t("spread");
  },
  /** How much of the lens's natural (cos^4) vignetting the picture shows, 0 to 1. */
  get vignetting() {
    return t("vignetting");
  },
  /** A polarising filter on the lens (step H): how perfect, 0 none, and its turn in radians. */
  get polariser() {
    return t("polariser");
  },
  get polariserAngle() {
    return (t("polariserAngle") * Math.PI) / 180;
  },
  /** How much light a photograph's blown highlights held: the bokeh's brightness. */
  get bokeh() {
    return t("bokeh");
  },
  /** The lens: how tight its image of a bright core is, and its ghosts and halo. */
  lens: {
    get coreFalloff() {
      return t("coreFalloff");
    },
    get ghosts() {
      return t("ghostGain");
    },
    get halo() {
      return t("haloGain");
    },
    /** The lens's make-up (2k): its elements, blades, barrel and coatings. */
    get ghostCount() {
      return t("ghostCount");
    },
    get ghostSpacing() {
      return t("ghostSpacing");
    },
    get ghostSize() {
      return t("ghostSize");
    },
    get ghostShape() {
      return t("ghostShape");
    },
    get ghostBokeh() {
      return t("ghostBokeh");
    },
    get blades() {
      return t("apertureBlades");
    },
    get catsEye() {
      return t("catsEye");
    },
    get rainbow() {
      return t("flareRainbow");
    },
    get haloRings() {
      return t("haloRings");
    },
    get haloSize() {
      return t("haloSize");
    },
    get spikes() {
      return t("starSpikes");
    },
    /** The glare a bright edge spreads into, and how far. */
    get glare() {
      return t("rimGlare");
    },
    get glareSize() {
      return t("rimGlareSize");
    },
    /** How much a lit edge is spread into a glow round it ("Edge bloom"). */
    get edgeBloom() {
      return t("edgeBloom");
    },
  },
};
