// Whether the demo investigation should be hidden from investigation
// pickers throughout the app. This is a non-destructive, per-browser
// preference -- separate from actually deleting the demo investigation
// (see the "Delete demo data" flow in the settings page, which uses the
// real DELETE /investigations/{id} endpoint instead).
//
// This is the app's first use of browser storage, so every access is
// wrapped in try/catch and falls back to "not hidden" -- a blocked or
// unavailable localStorage should never make the demo investigation
// silently vanish or crash the app.

const KEY = 'pai:hide-demo-investigations';

export function isDemoHidden(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemoHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // Best-effort only -- if storage is unavailable there's nothing to persist.
  }
}

// Convenience filter for investigation lists: applies the current
// preference in one place so every call site stays consistent.
export function filterHiddenDemo<T extends {is_demo?: boolean}>(invs: T[]): T[] {
  if (!isDemoHidden()) return invs;
  return invs.filter((inv) => !inv.is_demo);
}
