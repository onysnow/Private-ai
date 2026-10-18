// The command palette (⌘K) can be opened on any screen; "Search records" hands the query to the workbench's search
// panel. On the workbench it arrives as an event; from another page it waits in session storage until the panel mounts.
export const SEARCH_EVENT = 'pai:search-records';
const KEY = 'pai:pending-search';

export function handOffSearch(q: string): 'here' | 'navigate' {
  if (typeof document !== 'undefined' && document.getElementById('investigation-search')) {
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT, {detail: q}));
    return 'here';
  }
  try { window.sessionStorage.setItem(KEY, q); } catch { /* the panel opens empty instead */ }
  return 'navigate';
}

export function takePendingSearch(): string | null {
  try {
    const q = window.sessionStorage.getItem(KEY);
    if (q !== null) window.sessionStorage.removeItem(KEY);
    return q;
  } catch { return null; }
}
