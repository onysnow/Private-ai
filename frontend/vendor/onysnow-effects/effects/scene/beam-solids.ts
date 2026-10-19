import type { Material } from "@fx/effects/materials/presets";
import type { Vec } from "@fx/effects/optics/beam";

/**
 * Glass solids standing end-on in the page's plane (item 25g), for what
 * travels in that plane -- the laser's beam (effects/optics/beam). A prism
 * seen end-on is its triangle; the beam meets its faces as it meets a pane's
 * edges. Each registers the outline it presents, measured when asked, and
 * what it is made of.
 */
export type BeamSolid = {
  /** Its outline in viewport CSS px: a convex polygon, corners in order. */
  outline(): Vec[];
  material: Material;
};

const solids = new Set<BeamSolid>();

/** Put a solid in the beam's way (returns the removal). */
export function registerBeamSolid(solid: BeamSolid): () => void {
  solids.add(solid);
  return () => {
    solids.delete(solid);
  };
}

/** The solids in the beam's plane now. */
export function beamSolids(): readonly BeamSolid[] {
  return [...solids];
}
