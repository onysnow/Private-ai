import {
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import {
  paneCauses,
  paneEdgeWidth,
  registerLitSurface,
  registerPaneSides,
  registerScenePane,
  surfaceSeed,
} from "@fx/effects/scene/scene";
import { requestBevelFilter } from "@fx/lib/bevel-filters";
import { registerPane } from "@fx/lib/glass-panes";
import { onTuningApplied, t } from "@fx/lib/tuning";
import { waveScale } from "@fx/effects/optics/waviness";
import { EDGE_WIDTH_ATTR } from "@fx/effects/optics/edge-profile";
import { GLOW_LAYER_Z, layerProps, SIDE_LAYER_Z } from "@fx/effects/engine/compositor";
import { FAR_ARRIS_SPAN, farArrisGradientCss, sideGradientCss } from "@fx/effects/optics/edge-side";
import { cn } from "@fx/lib/utils";

/*
 * The side faces' colours, worked out once from the absorption model
 * (effects/optics/edge-side.ts). Each gradient runs from the face's front
 * arris inward; the far-arris line straddles the corner.
 */
const SIDE_STYLE = {
  top: {
    zIndex: SIDE_LAYER_Z,
    backgroundImage: sideGradientCss("to bottom"),
    "--far-arris": farArrisGradientCss("to bottom"),
    "--far-arris-span": `${FAR_ARRIS_SPAN}px`,
  },
  bottom: {
    zIndex: SIDE_LAYER_Z,
    backgroundImage: sideGradientCss("to top"),
    "--far-arris": farArrisGradientCss("to top"),
    "--far-arris-span": `${FAR_ARRIS_SPAN}px`,
  },
  left: {
    zIndex: SIDE_LAYER_Z,
    backgroundImage: sideGradientCss("to right"),
    "--far-arris": farArrisGradientCss("to right"),
    "--far-arris-span": `${FAR_ARRIS_SPAN}px`,
  },
  right: {
    zIndex: SIDE_LAYER_Z,
    backgroundImage: sideGradientCss("to left"),
    "--far-arris": farArrisGradientCss("to left"),
    "--far-arris-span": `${FAR_ARRIS_SPAN}px`,
  },
} as unknown as Record<"top" | "bottom" | "left" | "right", CSSProperties>;

/*
 * How far type and the plastic stand off the glass, as a share of a mounted
 * print's (the "Content depth" setting): the fractions their shadows were
 * always scaled by in styles.css, now said once, as the causes they are.
 */
const TYPE_STANDOFF = 0.42;
const PLASTIC_STANDOFF = 0.5;

/* The lit edge's layer: above the side faces, adding light (see .glass-glow). */
const GLOW_STYLE = { zIndex: GLOW_LAYER_Z } as CSSProperties;

/**
 * SVG filters inside backdrop-filter are Chromium-only. Where they are not
 * supported, a url() in the value would invalidate the whole declaration and
 * take the blur down with it -- so the bevel is only offered where it works.
 */
const BEVEL_SUPPORTED =
  typeof CSS !== "undefined" && CSS.supports?.("backdrop-filter", 'url("#x")') === true;

/**
 * Every frosted surface on the site.
 *
 * The cursor's light on the glass — the lit arris, the bloom, the reflected
 * source, the grime it rakes out — is NOT here. It lives in one shared WebGL
 * pass (components/site/GlassLight.tsx) because those are all the same light
 * seen several ways and have to be able to sum past white, which stacked CSS
 * layers cannot do; they can only paint over one another. What remains here is
 * what the pane is like with no light on it at all.
 *
 * There used to be three of these — the content bands, the header and the
 * filter bar each had their own blur, tint and border, and they had drifted
 * far enough apart that the header never matched the sections. This owns the
 * class, the cursor registration and the bloom layer in one place, so a change
 * to how glass behaves is a change here and nowhere else.
 *
 * `variant="bar"` is the thin fixed bars: less tint, shallower bezel.
 *
 * `edgeWidth` is how wide this pane's rounded-over edge is, in CSS pixels.
 * Leave it out and the pane uses the "Edge width" knob. It is a cause: the
 * bend, the light on the edge and the edge of the shadow all follow from it.
 */
export function Glass({
  children,
  className,
  as: Tag = "div",
  variant = "panel",
  /** Pulls the band up over whatever it follows, so its top edge has a photograph behind it. */
  overlap = false,
  edgeWidth,
  causes,
  style,
}: {
  children: ReactNode;
  className?: string | undefined;
  as?: ElementType | undefined;
  variant?: "panel" | "bar" | undefined;
  overlap?: boolean | undefined;
  edgeWidth?: number | undefined;
  /**
   * The pane's own causes as element attributes (data-material,
   * data-thickness, ...). Set by <Pane>; see effects/materials/pane-causes.
   */
  causes?: Record<string, string | number> | undefined;
  style?: CSSProperties | undefined;
}) {
  /*
   * A callback ref, NOT useRef plus an empty-dependency effect.
   *
   * An effect with no dependencies runs once, on mount. If React later swaps
   * the underlying DOM node while the component stays mounted — which it does
   * to this subtree during hydration — the object ref quietly points at the
   * new node and the effect never runs again, so the panel is never
   * registered. That is exactly what happened: the header, which lives in the
   * root layout, lit correctly while every content band on the page sat on
   * its CSS fallbacks with no thickness and no cursor response at all.
   *
   * A callback ref is invoked with every node React attaches, so registration
   * follows the element rather than the component's lifetime.
   */
  const release = useRef<(() => void) | null>(null);
  /*
   * The node, kept so the effect below can register it.
   *
   * The ref callback cannot do that registration itself: refs are attached
   * during the commit, and the thing being guarded against is anything
   * touching this element before React has finished hydrating it. An effect
   * is the guarantee -- React does not run a subtree's effects until it has
   * committed that subtree.
   */
  const node = useRef<HTMLElement | null>(null);
  /* The side faces: siblings of the pane, rendered before it attaches. */
  const sideTop = useRef<HTMLSpanElement | null>(null);
  const sideBottom = useRef<HTMLSpanElement | null>(null);
  const sideLeft = useRef<HTMLSpanElement | null>(null);
  const sideRight = useRef<HTMLSpanElement | null>(null);
  const glowLayer = useRef<HTMLCanvasElement | null>(null);

  const attach = useCallback(
    (el: HTMLElement | null) => {
      node.current = el;
      release.current?.();
      if (!el) {
        release.current = null;
        return;
      }

      const unregister = registerScenePane(el);

      /*
       * The bevel map depends on the pane's size and corner radius.
       *
       * It used to be one baked PNG stretched over every pane, which meant a
       * 64px bar and a 400px band were bent by the same profile -- so the bevel
       * was a different physical depth on each, which is the one thing a bevel
       * is not. The map is computed per geometry now (lib/bevel-map.ts), so the
       * pane has to ask for the filter that matches it and point its refraction
       * layer at it. Until that resolves, the CSS fallback in styles.css stands.
       */
      const fit = () => {
        const rect = el.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        // Full-width bands bend at the top and bottom only: no sides, no corners.
        const straight =
          rect.width >= (document.documentElement.clientWidth || window.innerWidth) - 1;
        const id = requestBevelFilter({
          width: rect.width,
          height: rect.height,
          radius,
          edgeWidth: edgeWidth ?? paneEdgeWidth(el),
          straight,
          thickness: paneCauses(el).thickness,
          // Rolled glass bends the view by its ripples too ("Glass waviness";
          // the same surface throws the caustic, effects/optics/waviness).
          waveShift: waveScale(t("floorCaustics"), paneCauses(el).gap),
          waveSeed: surfaceSeed(el),
        });
        /*
         * Onto the pane itself, as a variable the stylesheet folds into the
         * pane's own backdrop-filter. Not onto the refraction layer, which is
         * a child and cannot see past the pane (see `.glass` in styles.css);
         * and not as an inline backdrop-filter, which would beat the rules that
         * switch the CSS frost off under liquid glass.
         */
        if (id && BEVEL_SUPPORTED) el.style.setProperty("--glass-bevel", `url("#${id}")`);
      };

      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(el);
      // The edge width is a knob too; a new width is a new map.
      const stopTuning = onTuningApplied(fit);

      /*
       * The copy resting on the pane casts a shadow too.
       *
       * Registered per block rather than once for the whole panel: the light is
       * a cursor a few hundred pixels away, not the sun, so the direction it
       * throws a heading at one end of a full-width band is visibly not the
       * direction it throws a paragraph at the other. Done here so no call site
       * has to know about it.
       */
      const copy = [...el.querySelectorAll<HTMLElement>("h1, h2, h3, h4, p, blockquote")];
      // Type throws a glyph-shaped shadow (text-shadow), never a box: it does
      // not block the light on the glass as a rectangle.
      // A line of type stands off the glass by a fraction of what a mounted
      // print does (the 0.42 its shadow has always been scaled by).
      const letGo = copy.map((node) =>
        registerLitSurface(node, { occludes: false, standoff: TYPE_STANDOFF, material: "ink" }),
      );
      /*
       * Plastic resting on the pane (the orange buttons) is lit too: it catches
       * the lamp on its edge and throws a coloured shadow. Not an occluder --
       * it is translucent, so it tints the light rather than blocking it.
       */
      for (const node of el.querySelectorAll<HTMLElement>(".plastic")) {
        // Dark plastic (the round arrow buttons) is opaque: it blocks the
        // light as a shape and has no pigment to fluoresce (2i).
        const dark = node.classList.contains("plastic--dark");
        letGo.push(
          registerLitSurface(node, {
            occludes: dark,
            standoff: PLASTIC_STANDOFF,
            material: dark ? "ink" : "dayglo-orange",
          }),
        );
      }

      release.current = () => {
        observer.disconnect();
        stopTuning();
        for (const stop of letGo) stop();
        unregister();
      };
      // A new edge width on the pane is a new bevel map, so re-fit when it changes.
    },
    [edgeWidth],
  );

  /*
   * Tell the rasterised glass this pane exists, and that it is safe to touch.
   * See lib/glass-panes.ts -- this effect is the whole reason that registry
   * exists rather than a querySelectorAll.
   */
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    return registerPane(el);
  }, []);

  /*
   * Its side faces, placed on its edges by the same pass that measures it
   * (effects/scene/scene). In an effect because they are siblings, attached after
   * the pane's own ref runs.
   */
  useEffect(() => {
    const el = node.current;
    if (!el || !sideTop.current || !sideBottom.current) return;
    return registerPaneSides(
      el,
      sideTop.current,
      sideBottom.current,
      glowLayer.current,
      sideLeft.current,
      sideRight.current,
    );
  }, []);

  const pane = (
    <Tag
      ref={attach}
      /*
       * This element's attributes are set from outside React, by design.
       *
       * `applyGlassConfig` writes `data-config` here -- it is how the tuning
       * panel reaches the rasterised glass, which watches the attribute with
       * a MutationObserver -- and `RasterGlass` writes `data-liquid` once a
       * pane's instance is up. The server renders neither, so React finds
       * attributes it did not put there and reports a hydration mismatch it
       * cannot patch up.
       *
       * Same situation, and the same answer, as the <html> element in
       * __root.tsx: the honest fix is to tell React this element's attributes
       * are not its business, rather than to delay the writes until hydration
       * happens to be finished. A frame's delay was tried and did not hold --
       * lazily-loaded route content is still hydrating well after the first
       * paint, so the race just moved.
       */
      suppressHydrationWarning
      {...(edgeWidth !== undefined ? { [EDGE_WIDTH_ATTR]: edgeWidth } : {})}
      {...causes}
      style={style}
      className={cn(
        "glass",
        variant === "bar" && "glass--bar",
        overlap && "-mt-14 lg:-mt-24",
        className,
      )}
    >
      {/* Bright points behind the glass, thrown out of focus into discs. */}
      <span {...layerProps("pane:bokeh")} />
      {/*
        The bezel, bending and dispersing what is behind it. One layer over the
        whole pane: the displacement map carries the profile, pushing at the
        edges and neutral through the middle, which is what a bevel IS.
      */}
      <span {...layerProps("pane:refraction")} />
      {/*
        The room it reflects is drawn by the glass light pass (GlassLight),
        from the room's real brightness and the glass's Fresnel -- in both
        glass modes. It used to be a CSS layer here; see effects/optics/
        environment.ts for why that could not be both physical and visible.
      */}
      {/* The specular band the shutter flash sweeps across the panel. */}
      <span {...layerProps("pane:glare")} />
      {children}
    </Tag>
  );

  /*
   * The side faces -- the pane's thickness, between its arrises. Which ones
   * you can see depends on where the pane sits against your eye, so they open
   * and close against each other as you scroll. Siblings AFTER the pane, not
   * children: see .glass-side in styles.css for why only a sibling can absorb
   * what is seen through them.
   */
  return (
    <>
      {pane}
      <span
        ref={sideTop}
        aria-hidden="true"
        data-glass-ignore=""
        className="glass-side glass-side--top"
        style={SIDE_STYLE.top}
      />
      <span
        ref={sideBottom}
        aria-hidden="true"
        data-glass-ignore=""
        className="glass-side glass-side--bottom"
        style={SIDE_STYLE.bottom}
      />
      {/* And the left and right faces, where the pane's left and right edges are in view. */}
      <span
        ref={sideLeft}
        aria-hidden="true"
        data-glass-ignore=""
        className="glass-side glass-side--left"
        style={SIDE_STYLE.left}
      />
      <span
        ref={sideRight}
        aria-hidden="true"
        data-glass-ignore=""
        className="glass-side glass-side--right"
        style={SIDE_STYLE.right}
      />
      {/*
        The lit edge and its bloom, above the side faces: the light a lit
        arris throws comes off the front corner and is not absorbed by the
        side behind it. Drawn by the glass light pass (GlassLight).
      */}
      <canvas
        ref={glowLayer}
        aria-hidden="true"
        data-glass-ignore=""
        className="glass-glow"
        style={GLOW_STYLE}
      />
    </>
  );
}
