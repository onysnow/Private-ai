import { previewing } from "@fx/effects/engine/preview";
import { onTuningApplied, t } from "@fx/lib/tuning";

/**
 * What the cursor holds for every visitor, chosen in the lab (Cursor >
 * "What the cursor holds"; Ony, 2026-10-01: "I want to be able to choose
 * from flare, UV, flashlight, magnifying glass etc in the lab menu"). The
 * order of the lab's list.
 */
export const CURSOR_TOOL_ORDER: readonly ToolId[] = [
  "lamp",
  "blacklight",
  "flare",
  "flashlight",
  "magnifier",
  "laser",
  "spray",
  "dropper",
];

function chosenTool(): ToolId {
  return CURSOR_TOOL_ORDER[Math.round(t("cursorTool"))] ?? "lamp";
}

/**
 * What the visitor is holding (item 25e, claude/tools-research.md §3.2).
 *
 * One thing at a time, as with two hands and a camera: the lamp, the black
 * light, a road flare, a laser pointer or a magnifying glass. The camera --
 * the shutter and its flash -- is not a tool; it is the viewer, and fires
 * whatever is held.
 *
 * A tool is a light, an optical object, or both. This module only says which
 * one is in the hand and what light that puts in the scene; the lights
 * themselves stay in effects/light, the objects in their components.
 *
 * Which tool is held first comes from the address: `?try=blacklight`,
 * `?try=flare`, `?try=laser`, `?try=magnifier` or `?try=flashlight` start with it; `?try=tools`
 * shows the tray to change it.
 */

export type ToolId =
  | "lamp"
  | "blacklight"
  | "flare"
  | "laser"
  | "magnifier"
  | "flashlight"
  | "hammer"
  | "spray"
  | "fire"
  | "graze"
  | "dropper";

export type Tool = {
  id: ToolId;
  label: string;
  /**
   * The lamp's part in it: "white" the lamp's own light, "uv" the black
   * light's, none if the hand holds something else instead. The magnifier
   * is an illuminated one -- a ring of light round the lens, as a reading
   * magnifier has -- so the lamp stays with it.
   */
  lamp: "white" | "uv" | null;
  /**
   * Whether the lamp is seen as the lamp (the drawn lamp: its core and the
   * camera's flare round it). In the magnifier it is a ring in the rim,
   * which the magnifier draws itself.
   */
  lampSeen: boolean;
};

export const TOOLS: readonly Tool[] = [
  { id: "lamp", label: "Lamp", lamp: "white", lampSeen: true },
  { id: "blacklight", label: "Black light", lamp: "uv", lampSeen: true },
  { id: "flare", label: "Flare", lamp: null, lampSeen: false },
  { id: "laser", label: "Laser", lamp: null, lampSeen: false },
  { id: "magnifier", label: "Magnifier", lamp: "white", lampSeen: false },
  /*
   * A flashlight (item 25i): its own light, a beam (effects/light/beam), so
   * the lamp is put down. Press and hold to plant it and aim it.
   */
  { id: "flashlight", label: "Flashlight", lamp: null, lampSeen: false },
  /*
   * A glazier's hammer, to break a pane (item 10, ?try=broken): a strike
   * is a moment, so the lamp stays in the other hand to see the cracks by.
   */
  { id: "hammer", label: "Hammer", lamp: "white", lampSeen: true },
  /*
   * A spray bottle (task 76, with ?try=drops): water, blood or slime onto
   * the glass (Water > "Spray bottle holds"). The lamp stays in the other
   * hand to see the drops by, as with the hammer.
   */
  { id: "spray", label: "Spray bottle", lamp: "white", lampSeen: true },
  /*
   * A burning torch (task 82, ?try=fire): its own flickering firelight,
   * so the lamp is put down; the room goes dark round it.
   */
  { id: "fire", label: "Torch (fire)", lamp: null, lampSeen: false },
  /*
   * A laser skimming the glass's face through the rain (with ?try=drops):
   * the water lights up where it crosses it. The lamp stays in the other
   * hand, dimmed by the room.
   */
  { id: "graze", label: "Laser across the glass", lamp: null, lampSeen: false },
  /*
   * An eye dropper (Ony, 2026-10-09): a pipette over the glass -- press
   * to let a drop fall, hold to keep them coming. The lamp stays in the
   * other hand to watch the water run by.
   */
  { id: "dropper", label: "Eye dropper", lamp: "white", lampSeen: true },
];

const byId = new Map(TOOLS.map((t) => [t.id, t]));

let held: ToolId | null = null;
const watchers = new Set<(id: ToolId) => void>();

/** The tool the address starts with, the lamp if none. */
function initialTool(): ToolId {
  for (const id of ["blacklight", "flare", "laser", "magnifier", "flashlight", "fire"] as const) {
    if (previewing(id)) return id;
  }
  return chosenTool();
}

/*
 * When the lab's choice changes (or the saved choice arrives with the site's
 * settings), the hand takes it up. Only on a change: a tool picked from the
 * tray is not taken away every time any setting is applied.
 */
let lastChoice: ToolId | null = null;
if (typeof window !== "undefined") {
  // The defaults' choice is the starting one; only a different saved or drafted choice moves the hand.
  lastChoice = chosenTool();
  onTuningApplied(() => {
    const choice = chosenTool();
    if (choice === lastChoice) return;
    lastChoice = choice;
    holdTool(choice);
  });
}

/** What is in the hand now. */
export function heldTool(): ToolId {
  if (held === null) {
    if (typeof window === "undefined") return "lamp";
    held = initialTool();
  }
  return held;
}

/** Put down what is held and pick up another. */
export function holdTool(id: ToolId) {
  if (heldTool() === id) return;
  held = id;
  for (const fn of watchers) fn(id);
}

/** Watch the hand (returns the unwatch). */
export function onToolChange(fn: (id: ToolId) => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

/** The lamp's part in what is held: "white", "uv", or null if the lamp is put down. */
export function lampMode(): Tool["lamp"] {
  const tool = byId.get(heldTool());
  return tool ? tool.lamp : "white";
}

/** Whether the lamp is drawn as the lamp (not inside a magnifier's rim, nor put down). */
export function lampSeen(): boolean {
  return byId.get(heldTool())?.lampSeen ?? true;
}

/**
 * Whether the camera is in the hand: the lamp, white or UV, with its ring,
 * its winding and its shutter. Every other tool is its own cursor -- the
 * ring, the dot, the charge and the shutter are put away with the lamp
 * (Ony, 2026-10-01: "when I am using the other tools I dont want to be able
 * to use/see the original cursor with its charge effects or anything").
 */
export function cameraInHand(): boolean {
  const id = heldTool();
  return id === "lamp" || id === "blacklight";
}

/** Whether the tray is shown (?try=tools, ?try=broken for the hammer, ?try=drops for the spray bottle). */
export function toolTray(): boolean {
  return previewing("tools") || previewing("broken") || previewing("drops");
}

/** The tools on offer: the hammer only while breaking glass is tried (?try=broken), the spray bottle only with the drops (?try=drops). */
export function toolsOffered(): readonly Tool[] {
  return TOOLS.filter(
    (t) =>
      (t.id !== "hammer" || previewing("broken")) &&
      (t.id !== "spray" || previewing("drops")) &&
      (t.id !== "graze" || previewing("drops")) &&
      (t.id !== "dropper" || previewing("drops")) &&
      (t.id !== "fire" || previewing("fire") || previewing("tools")),
  );
}

/** For tests: put the hand back as a fresh page load would find it. */
export function resetTool(id: ToolId | null = null) {
  held = id;
}

// For the verification rigs (dev only): pick up a tool.
if (typeof window !== "undefined" && (process.env.NODE_ENV !== "production"))
  (window as unknown as { __holdTool?: (id: ToolId) => void }).__holdTool = (id) => holdTool(id);
