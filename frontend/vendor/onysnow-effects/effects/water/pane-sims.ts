import type { DropSim } from "./sim";

/** Each pane's water (WaterDrops fills it): for things that act on the water from outside, as the drop page does. */
export const paneSims = new Map<HTMLElement, DropSim>();
