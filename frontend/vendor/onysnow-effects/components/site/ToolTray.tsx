import { useEffect, useState } from "react";
import { Magnifier } from "@fx/components/site/Magnifier";
import { FlareTorch } from "@fx/components/site/FlareTorch";
import { BlackLightScene } from "./BlackLightScene";
import { LaserBeam } from "@fx/components/site/LaserBeam";
import { Hammer } from "@fx/components/site/Hammer";
import { Flashlight } from "@fx/components/site/Flashlight";
import { SprayBottle } from "@fx/components/site/SprayBottle";
import { FireTorch } from "@fx/components/site/FireTorch";
import { GrazingLaser } from "@fx/components/site/GrazingLaser";
import { EyeDropper } from "@fx/components/site/EyeDropper";
import {
  heldTool,
  holdTool,
  onToolChange,
  toolTray,
  toolsOffered,
  type ToolId,
} from "@fx/effects/tools/held";

/** Line icons for the tray, 20 px, drawn in currentColor. */
const ICONS: Record<ToolId, React.ReactNode> = {
  lamp: (
    <>
      <path d="M7 12.5a5 5 0 1 1 6 0c-.6.5-1 1.2-1 2V15H8v-.5c0-.8-.4-1.5-1-2Z" />
      <path d="M8 17.5h4" />
    </>
  ),
  blacklight: (
    <>
      <path d="M7 12.5a5 5 0 1 1 6 0c-.6.5-1 1.2-1 2V15H8v-.5c0-.8-.4-1.5-1-2Z" />
      <path d="M8 17.5h4M2.5 8H4M16 8h1.5M4.5 3l1 1M15.5 3l-1 1" />
    </>
  ),
  flare: (
    <>
      <path d="M8.5 18.5 11.5 9" />
      <path d="M12 8.5c-1.6-1-1.4-3.2.4-5 .1 1.6 1.6 2 1.6 3.6 0 1.2-1 2-2 1.4Z" />
    </>
  ),
  laser: (
    <>
      <rect x="2.5" y="12" width="8" height="3" rx="1.5" transform="rotate(-30 6.5 13.5)" />
      <path d="m11 10 6.5-3.8" strokeDasharray="1.5 1.5" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.2 12.2 5 5" />
    </>
  ),
  flashlight: (
    <>
      <path d="M3 12.5 12 6.5l2 3-9 6z" />
      <path d="M12.5 5.5 15 4l2.5 4-2.5 1.5M17 3l1.5-1M18.5 6.5h1.5M16 1.2v1.6" />
    </>
  ),
  hammer: (
    <>
      <path d="M4.5 5.5 9 3l2.5 2.5L9 8z" />
      <path d="m8.5 7.5 8 8.5" />
    </>
  ),
  fire: (
    <>
      <path d="M9 18.5 10.5 11" />
      <path d="M10.6 10.5c-2.4-.6-3-3.3-1.2-5.6.2 1.4 1.2 1.6 1.4.4.3-1.4 1.6-2.4 2.2-3.3.4 2.6 2 3.6 1.6 6-.3 1.8-2 2.9-4 2.5Z" />
    </>
  ),
  graze: (
    <>
      <rect x="2" y="9" width="6" height="3" rx="1" />
      <path d="M8 10.5h10" strokeDasharray="1.2 1.6" />
      <circle cx="12" cy="10.5" r="1.6" />
      <circle cx="16" cy="10.5" r="1.1" />
      <path d="M2 14.5h16" />
    </>
  ),
  spray: (
    <>
      <path d="M7 8h5v9.5H7z" />
      <path d="M8 8V5.5h4L14 7M12 5.5V4H9" />
      <path d="M16 4.5h.01M17.5 6h.01M16.5 7.5h.01" />
    </>
  ),
  dropper: (
    <>
      <path d="M8 2.5h4v2.5H8z" />
      <path d="M8.5 5v8l1.5 4.5 1.5-4.5V5" />
      <path d="M10 18.5v.01" />
    </>
  ),
};

/** The tray: pick up one tool, putting down the last (?try=tools). */
function Tray({ held }: { held: ToolId }) {
  return (
    <div className="tool-tray" data-tool-tray role="toolbar" aria-label="What you hold">
      {toolsOffered().map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="tool-tray__tool"
          aria-pressed={held === tool.id}
          aria-label={tool.label}
          title={tool.label}
          onClick={() => holdTool(tool.id)}
        >
          <svg
            viewBox="0 0 20 20"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS[tool.id]}
          </svg>
        </button>
      ))}
    </div>
  );
}

/**
 * What the visitor holds (item 25e, effects/tools/held): the object drawn for
 * it, and the tray to change it. The lamp and the black light are the drawn
 * lamp (CustomCursor, CursorLight), which follows the hand on its own.
 */
export function HeldTool() {
  const [held, setHeld] = useState<ToolId | null>(null);
  const [tray, setTray] = useState(false);
  useEffect(() => {
    setHeld(heldTool());
    setTray(toolTray());
    return onToolChange(setHeld);
  }, []);
  if (held === null) return null;
  return (
    <>
      {held === "magnifier" ? <Magnifier /> : null}
      {held === "flare" ? <FlareTorch /> : null}
      {held === "laser" ? <LaserBeam /> : null}
      {held === "blacklight" ? <BlackLightScene /> : null}
      {held === "flashlight" ? <Flashlight /> : null}
      {held === "hammer" ? <Hammer /> : null}
      {held === "spray" ? <SprayBottle /> : null}
      {held === "fire" ? <FireTorch /> : null}
      {held === "graze" ? <GrazingLaser /> : null}
      {held === "dropper" ? <EyeDropper /> : null}
      {tray ? <Tray held={held} /> : null}
    </>
  );
}
