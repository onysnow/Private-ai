import type { CSSProperties, ReactNode } from "react";
import { INTERFACE_ATTR, INTERFACE_GAP_ATTR, STACK_ATTR } from "@fx/effects/scene/graph";

/**
 * Panes resting on panes (light-engine step E).
 *
 *   <Stack interface="air" gap={12}>
 *     <Pane ... />   the bottom layer, resting on the photographs
 *     <Pane ... />   the next one up
 *   </Stack>
 *
 * The layers are the <Pane>s inside it, in document order from the BOTTOM
 * up, and they should overlap: position them yourself (absolutely, in a
 * grid cell, however suits the page). `interface` is what sits between each
 * pair, a cause like the gap:
 *
 *   air      separate panes, `gap` px of air between them (0 allowed)
 *   contact  resting on each other, dry
 *   bonded   laminated: the run behaves as one thick pane
 *
 * Everything else follows (effects/scene/graph): each layer's height, the
 * light that reaches it through the ones above, the light through the whole
 * stack onto the photographs, and the stack's reflection.
 */
export function Stack({
  children,
  interface: link = "air",
  gap = 0,
  className,
  style,
}: {
  children: ReactNode;
  interface?: "air" | "contact" | "bonded";
  /** Air between layers, CSS px. Only for `interface="air"`. */
  gap?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const attrs: Record<string, string> = { [STACK_ATTR]: "", [INTERFACE_ATTR]: link };
  if (link === "air") attrs[INTERFACE_GAP_ATTR] = String(Math.max(0, gap));
  return (
    <div {...attrs} className={className} style={style}>
      {children}
    </div>
  );
}
