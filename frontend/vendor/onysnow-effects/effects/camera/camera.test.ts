import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { CAMERA_DISTANCE } from "@fx/effects/optics/environment";
import { t } from "@fx/lib/tuning";
import { camera } from "./camera";

/*
 * Light-system design, step D: the lens and the eye are the camera's, and
 * nothing else reads their knobs.
 */
const CAMERA_KNOBS = [
  "viewFollow",
  "polariser",
  "vignetting",
  "polariserAngle",
  "aperture",
  "spread",
  "coreFalloff",
  "ghostGain",
  "haloGain",
  "ghostCount",
  "ghostSpacing",
  "ghostSize",
  "ghostShape",
  "ghostBokeh",
  "apertureBlades",
  "catsEye",
  "flareRainbow",
  "haloRings",
  "haloSize",
  "starSpikes",
  "rimGlare",
  "rimGlareSize",
  "edgeBloom",
];

describe("the camera", () => {
  it("reports exactly what its knobs say", () => {
    expect(camera.follow).toBe(t("viewFollow"));
    expect(camera.aperture).toBe(t("aperture"));
    expect(camera.apertureGrowth).toBe(t("spread"));
    expect(camera.lens.coreFalloff).toBe(t("coreFalloff"));
    expect(camera.lens.ghosts).toBe(t("ghostGain"));
    expect(camera.lens.halo).toBe(t("haloGain"));
    expect(camera.lens.ghostCount).toBe(t("ghostCount"));
    expect(camera.lens.blades).toBe(t("apertureBlades"));
    expect(camera.lens.rainbow).toBe(t("flareRainbow"));
    expect(camera.lens.glare).toBe(t("rimGlare"));
    expect(camera.lens.glareSize).toBe(t("rimGlareSize"));
    expect(camera.distance(1280)).toBe(CAMERA_DISTANCE * 1280);
  });

  it("is the only thing that reads a camera knob or the camera's distance", () => {
    const root = join(__dirname, "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(root);
    const knob = new RegExp(`\\bt\\(\\s*"(${CAMERA_KNOBS.join("|")})"\\s*\\)`);
    const offenders = files
      .map((p) => relative(root, p))
      .filter((p) => p !== "effects/camera/camera.ts")
      .filter((p) => {
        const src = readFileSync(join(root, p), "utf8");
        const usesDistance =
          p !== "effects/optics/environment.ts" && /CAMERA_DISTANCE\s*\*/.test(src);
        return knob.test(src) || usesDistance;
      });
    expect(offenders).toEqual([]);
  });
});
