// A screen outside the case's stages can add its own places to the frame's breadcrumb (components/frame/app-frame.tsx),
// for example Learn › Red Flags catalogue › Hidden ownership › BO-007. The frame listens for this event.
export const TRAIL_TAIL_EVENT = 'pai:trail-tail';

export type TrailTail = {label: string; href?: string}[];

export function setTrailTail(tail: TrailTail): void {
  if (typeof window === 'undefined') return;
  (window as {__paiTrailTail?: TrailTail}).__paiTrailTail = tail;
  window.dispatchEvent(new CustomEvent<TrailTail>(TRAIL_TAIL_EVENT, {detail: tail}));
}

/** The tail last set, for a frame that mounts after the screen. */
export function currentTrailTail(): TrailTail {
  return typeof window === 'undefined' ? [] : (window as {__paiTrailTail?: TrailTail}).__paiTrailTail ?? [];
}
