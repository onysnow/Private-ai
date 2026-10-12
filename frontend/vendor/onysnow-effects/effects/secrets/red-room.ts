/**
 * Secret 2: the red room (item 39, claude/site-ideas.md; ?try=redroom).
 *
 * Fire the shutter at a photograph -- wind it and click a picture -- and
 * the page becomes a darkroom. The only light is the safelight: a deep red
 * that photographic paper cannot see (it is blind past about 590 nm, which
 * is why a darkroom can be lit at all). Everything shows as a negative in
 * that red, the way a print looks in the developer before it is fixed, and
 * the cursor becomes a loupe that shows the true frame under it.
 *
 * This module is the state: whether the room is on, and whether it has
 * ever been found (kept in the browser -- the secrets are for their own
 * sake, so nothing needs enforcing on a server). No React here.
 */

/**
 * The safelight's colour, linear RGB: a red filter over a lamp (a Kodak
 * No. 1A or an LED at about 630 nm) -- nearly all red, a trace of orange.
 */
export const SAFELIGHT_COLOUR = [1.0, 0.1, 0.03] as const;

const FOUND_KEY = "onysnow:secret-redroom";

let active = false;
let print: string | null = null;
const watchers = new Set<(on: boolean) => void>();

/** Whether the room is lit by the safelight now. */
export function redRoomOn(): boolean {
  return active;
}

/** Whether this browser has found the room before. */
export function redRoomFound(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(FOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function set(on: boolean) {
  if (active === on) return;
  active = on;
  if (typeof document !== "undefined")
    document.documentElement.toggleAttribute("data-red-room", on);
  for (const fn of watchers) fn(on);
}

/** The photograph that was taken to get in, hanging on the line (item 40). */
export function redRoomPrint(): string | null {
  return print;
}

/** Into the darkroom: the room is found; `photo` is the picture that was taken, to hang. */
export function enterRedRoom(photo?: string | null) {
  print = photo ?? null;
  try {
    localStorage.setItem(FOUND_KEY, "1");
  } catch {
    /* found, but not remembered */
  }
  set(true);
}

/** Lights on: back to the page. */
export function leaveRedRoom() {
  set(false);
}

/*
 * Found, not entered (Ony, 2026-10-10: "it's supposed to flash and then a
 * new nav item appears on the nav, that being the red room"): taking a
 * picture of a photograph fires the flash and, as it fades, a "Red room"
 * item appears in the nav; going through that door is what puts the lights
 * out. The picture you took waits to be hung on the line.
 */
let waiting: string | null = null;
const finders = new Set<(found: boolean) => void>();

/** The shutter fired at a photograph: the door appears (the room is found), with the picture waiting. */
export function findRedRoom(photo?: string | null) {
  waiting = photo ?? waiting;
  const first = !redRoomFound();
  try {
    localStorage.setItem(FOUND_KEY, "1");
  } catch {
    /* found, but not remembered */
  }
  for (const fn of finders) fn(true);
  return first;
}

/** Through the door: into the darkroom with the picture last taken (if any). */
export function openRedRoom() {
  enterRedRoom(waiting);
}

/** Watch for the door appearing (returns the unwatch). */
export function onRedRoomFound(fn: (found: boolean) => void): () => void {
  finders.add(fn);
  return () => {
    finders.delete(fn);
  };
}

/** Watch the room (returns the unwatch). */
export function onRedRoom(fn: (on: boolean) => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}
