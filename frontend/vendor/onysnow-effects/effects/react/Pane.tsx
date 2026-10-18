import type { CSSProperties, ElementType, ReactNode } from "react";
import { Glass } from "@fx/components/site/Glass";
import { DEFAULT_MATERIAL, MATERIAL_ATTR, type MaterialId } from "@fx/effects/materials/presets";
import {
  GAP_ATTR,
  SCRATCH_ATTR,
  SMUDGE_ATTR,
  THICKNESS_ATTR,
} from "@fx/effects/materials/pane-causes";

/**
 * One piece of glass, described once (optics plan step 2).
 *
 *   <Pane
 *     material="frosted-float"          what the glass is
 *     thickness={18}                    px
 *     edge={{ width: 40, corner: 0 }}   px: the bevel's real width, the corner's radius
 *     gap={70}                          px between the glass and the photographs behind it
 *     layers={{ smudge: 1, scratch: 1 }} how much of each surface layer it wears
 *   >
 *
 * Every prop is a CAUSE. The bend, the light on the edge, the light through
 * the glass and under it, and the side faces all follow from them, and every
 * pass reads the same description (effects/scene/scene measures it once, from the
 * element's attributes -- effects/materials/pane-causes).
 *
 * Leave a prop out and the pane is today's glass: frosted float, 18 px thick,
 * the "Edge width" and "Glass height" settings, both surface layers in full.
 * So a <Pane> with no props looks exactly as the panes always have.
 *
 * What does not yet read a per-pane value, and reads the page's instead: the
 * light under the glass takes the page's gap (per pane in step 7), and the
 * liquid glass takes the material's index from its own settings.
 */
export type PaneEdge = {
  /** The bevel's width, CSS px. */
  width?: number;
  /** The corner's radius, CSS px. Leave out to keep the one the class names give. */
  corner?: number;
};

export type PaneLayers = {
  /** How much of the smudge layer this pane wears, 0 to 1. */
  smudge?: number;
  /** How much of the scratch layer, 0 to 1. */
  scratch?: number;
};

export function Pane({
  children,
  material = DEFAULT_MATERIAL,
  thickness,
  edge,
  gap,
  layers,
  as,
  className,
  variant,
  overlap,
}: {
  children: ReactNode;
  material?: MaterialId;
  thickness?: number;
  edge?: PaneEdge;
  gap?: number;
  layers?: PaneLayers;
  as?: ElementType;
  className?: string;
  /** "bar" for the thin fixed bars (the header, the filter bar): thinner glass, less tint. */
  variant?: "panel" | "bar";
  /** Pulls the band up over whatever it follows, so its top edge has a photograph behind it. */
  overlap?: boolean;
}) {
  const causes: Record<string, string | number> = { [MATERIAL_ATTR]: material };
  if (thickness !== undefined) causes[THICKNESS_ATTR] = thickness;
  if (gap !== undefined) causes[GAP_ATTR] = gap;
  if (layers?.smudge !== undefined) causes[SMUDGE_ATTR] = layers.smudge;
  if (layers?.scratch !== undefined) causes[SCRATCH_ATTR] = layers.scratch;
  const style: CSSProperties | undefined =
    edge?.corner !== undefined ? { borderRadius: `${edge.corner}px` } : undefined;

  return (
    <Glass
      as={as}
      className={className}
      variant={variant}
      overlap={overlap}
      edgeWidth={edge?.width}
      causes={causes}
      style={style}
    >
      {children}
    </Glass>
  );
}
