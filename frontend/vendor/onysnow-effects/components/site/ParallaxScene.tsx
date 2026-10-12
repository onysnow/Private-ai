import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Img, type ImgSource } from "./Img";
import { cn } from "@fx/lib/utils";
import { camera } from "@fx/effects/camera/camera";
import { previewing } from "@fx/effects/engine/preview";
import { scrollSlide } from "@fx/effects/optics/viewpoint";
import { paneCauses } from "@fx/effects/scene/scene";

/**
 * Room for a glass band to sit over this photograph's edge.
 *
 * A seam band (see PhotoSection) floats across the join between the photograph
 * above it and the one below, and what shows through the glass is THOSE
 * photographs carrying on underneath -- not a third picture. So this box grows
 * by exactly the part of the band that overlaps it, and the band pulls itself
 * in by the same amount: the image really is behind the glass, and nothing on
 * the page moves.
 *
 * content-box, because the height comes from a min-height. Under border-box
 * the padding is counted INSIDE the min-height and an empty photograph never
 * grows at all.
 */
export const SEAM_ROOM = {
  boxSizing: "content-box",
  paddingTop: "var(--seam-above, 0px)",
  paddingBottom: "var(--seam-below, 0px)",
} as const;

const DEPTH = { subtle: 0.04, standard: 0.08, deep: 0.14 } as const;

const SCRIM = {
  none: "",
  bottom: "bg-gradient-to-t from-background via-background/40 to-transparent",
  full: "bg-background/55",
} as const;

/**
 * A full-bleed photograph that scrolls slower than the content laid over it,
 * which is what produces the sense of depth.
 *
 * Transform-only — never layout properties — so it stays on the compositor.
 * Parallax is switched off under `prefers-reduced-motion` and on small screens,
 * where the effect tends to stutter and costs more than it gives.
 */
/**
 * How wide the photograph is drawn, for its srcset. Not "100vw": it covers a
 * box 128% as tall as a section that is itself most of a screen or more, so
 * a wide photograph is drawn well past the screen's width, and "100vw" had the
 * browser fetch a file smaller than that and stretch it. About 1.1 screens tall
 * times 1.28 times the photograph's shape covers every section here.
 */
function sceneSizes(image: ImgSource | null | undefined): string {
  const aspect = image?.width && image.height ? image.width / image.height : 1.5;
  return `max(100vw, ${(140 * aspect).toFixed(1)}vh)`;
}

export function ParallaxScene({
  image,
  focus,
  children,
  depth = "standard",
  scrim = "bottom",
  height = "min-h-[80svh]",
  className,
}: {
  image: ImgSource | null | undefined;
  /** The focal point chosen for this spot in the Studio (lib/page-photos). */
  focus?: { x: number; y: number } | null | undefined;
  children?: ReactNode;
  depth?: keyof typeof DEPTH;
  scrim?: keyof typeof SCRIM;
  height?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  const shift = DEPTH[depth] * 100;
  /*
   * ?try=gapparallax (item 33): how far the photograph lags the glass comes
   * from the pane standing over it -- its gap and the eye's distance
   * (effects/optics/viewpoint, scrollSlide) -- rather than a depth preset.
   * Across the whole time the section is on screen the page scrolls by the
   * screen's height plus the section's, so the photograph lags by that
   * times gap / (distance + gap), half each side of the middle.
   */
  const [physical, setPhysical] = useState<number | null>(null);
  useEffect(() => {
    if (!previewing("gapparallax")) return;
    const measure = () => {
      const node = ref.current;
      if (!node) return setPhysical(null);
      // The pane over this photograph: inside it, or a band across its edge.
      const box = node.getBoundingClientRect();
      const pane =
        node.querySelector<HTMLElement>(".glass:not(.glass--bar)") ??
        [...document.querySelectorAll<HTMLElement>(".glass:not(.glass--bar)")].find((g) => {
          const r = g.getBoundingClientRect();
          return (
            r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right
          );
        });
      if (!pane) return setPhysical(null);
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      const travel = vh + box.height;
      setPhysical(scrollSlide(travel / 2, paneCauses(pane).gap, camera.distance(vw)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    physical === null ? [`-${shift}%`, `${shift}%`] : [`${-physical}px`, `${physical}px`],
  );

  return (
    /*
     * `data-photo` marks this as a photographic surface for the cursor.
     * The scrim and vignette are siblings of the image and cover it edge to
     * edge, so a hit test from the pointer lands on a plain div and finds no
     * `img` above it. The marker is on the container they all share.
     */
    <div ref={ref} data-photo className={cn("relative", height, className)} style={SEAM_ROOM}>
      {/*
       * The clip wraps the PICTURE, not the section.
       *
       * It used to be on the container. It has to exist -- the parallax image
       * is 128% tall and slides, so without a clip the oversized photograph
       * spills out of the section -- but on the container it also cropped
       * everything else, and the thing it cropped that matters is the glass.
       *
       * The pane's light layer sits at `inset: -90px` precisely so a lit edge
       * can throw light OUT of the glass; that spill above the top edge is
       * most of what says the edge is bright rather than merely pale. The
       * container's clip cut it off dead at the boundary, which reads as a
       * hard line where the softest part of the glow should be.
       *
       * Same fix as the photo anchor further up: move the clip in to the only
       * thing that needs it, and let everything resting on the section escape.
       * `rounded-[inherit]` so a section given a corner radius still rounds
       * its picture.
       */}
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <motion.div
          className="absolute inset-0 max-md:!translate-y-0"
          {...(reduced ? {} : { style: { y } })}
          {...(children ? {} : { "aria-hidden": true })}
        >
          {/* Oversized so the translation never reveals an edge. */}
          {/*
            data-view-shift: moved by the viewpoint (see effects/optics/
            viewpoint.ts) -- the photograph is behind the glass, so it slides
            under it as the eye moves.
          */}
          <div data-view-shift="" suppressHydrationWarning className="view-shift absolute inset-0">
            <Img
              image={image}
              className="h-[128%] w-full"
              sizes={sceneSizes(image)}
              imgClassName="object-cover"
              focus={focus}
            />
          </div>
        </motion.div>
        {scrim === "none" ? null : (
          <div data-scrim className={cn("absolute inset-0", SCRIM[scrim])} />
        )}
        <div className="image-vignette pointer-events-none absolute inset-0" />
      </div>
      {children ? (
        /* data-scene-content: marks the content wrapper for styles.css, where
           `[data-scene-content] > .glass` lifts the pane above the NEXT
           section's photograph so the pane's bottom light bleed isn't painted
           over. No z-index here -- a z-indexed wrapper becomes a stacking
           context / backdrop root and cuts the pane's backdrop-filter off
           (see SeamSection in PhotoSection). */
        <div data-scene-content className="relative flex h-full flex-col justify-end">
          {children}
        </div>
      ) : null}
    </div>
  );
}
