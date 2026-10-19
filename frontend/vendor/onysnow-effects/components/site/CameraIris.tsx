import { useId } from "react";

/**
 * A leaf-shutter iris, as an SVG.
 *
 * Shared, because it is now drawn in two places -- the cursor and the site
 * loader -- and eight hand-written blade paths copied into both files is a
 * guarantee that one of them quietly stops matching the other.
 *
 * WHY THE CLIP PATH ID IS GENERATED
 *
 * It used to be the literal string "cursor-iris-housing". With one iris on the
 * page that is fine. With two, it is a duplicate id: `url(#...)` resolves to
 * whichever comes first in the document, so both irises would clip against the
 * first one's housing. `useId` gives each instance its own.
 *
 * WHY THE BLADES PIVOT WHERE THEY DO
 *
 * Each blade hinges about a point ON the housing ring and swings inward,
 * which is what a leaf shutter does and why the opening is a polygon: straight
 * inner edges sweeping across one another. Rotating blades about the CENTRE
 * instead -- which is what every snippet of this going around does -- spins a
 * pinwheel and never produces the polygon at all.
 *
 * All the blades share one rotation, so a single keyframe animates the lot;
 * only the pivot differs, and that is static per blade.
 */

/**
 * Eight blades, at 45 degrees apart.
 *
 * Eight rather than six, which the old comment here claimed while the code
 * drew eight. Eight is what a fast lens with a rounded aperture tends to have
 * and it is what this has always actually rendered; the comment was the part
 * that was wrong.
 */
const BLADES = [0, 45, 90, 135, 180, 225, 270, 315];

export function CameraIris({ className }: { className?: string }) {
  const housing = `iris-housing-${useId().replace(/:/g, "")}`;

  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <clipPath id={housing}>
        <circle cx="50" cy="50" r="46" />
      </clipPath>
      <g clipPath={`url(#${housing})`}>
        {BLADES.map((angle) => (
          <g key={angle} transform={`rotate(${angle} 50 50)`}>
            <path className="custom-cursor__blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z" />
          </g>
        ))}
      </g>
    </svg>
  );
}
