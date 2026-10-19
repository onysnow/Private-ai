// Single-key shortcuts ([ ] ?) can be switched off (WCAG 2.1.4). A per-browser preference; on by default.
const KEY = 'pai:single-keys';

export function singleKeysOn(): boolean {
  try { return window.localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSingleKeys(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, 'off');
  } catch { /* best effort */ }
}
