import type { ReactNode } from "react";
import { Pane } from "@fx/effects/react/Pane";

/**
 * A frosted content band. Kept as a named wrapper because "section" is what
 * these are at the call sites. A <Pane> of today's glass; see effects/react/Pane.
 */
export function GlassSection({
  children,
  className,
  overlap = true,
}: {
  children: ReactNode;
  className?: string;
  overlap?: boolean;
}) {
  return (
    <Pane className={className ?? ""} overlap={overlap}>
      {children}
    </Pane>
  );
}
