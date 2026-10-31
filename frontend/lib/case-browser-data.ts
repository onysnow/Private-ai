// What this browser keeps for a case in localStorage, beside the server's records: the Your safety answers and plan,
// recent searches, the last Is it real? check, watchlist looks and visit times, and where you last were in it. Deleting
// the case removes all of it. Locking the app removes the recent searches and the last check (the names a reporter
// looked up); the safety plan is kept, since it is the reporter's own and would be lost (DECISIONS_LOG 59).

const PER_CASE = [
  (id: string) => `workbench.your-safety.${id}`,
  (id: string) => `sv-recent:${id}`,
  (id: string) => `ir-last:${id}`,
  (id: string) => `wl-looked:${id}`,
  (id: string) => `pai:last-visit:${id}`,
  (id: string) => `pai:flags-visit:${id}`,
];
const CASE_PLACES = 'pai:case-places';
const ON_LOCK = ['sv-recent:', 'ir-last:'];

/** Remove everything this browser keeps for the case. */
export function forgetCase(investigationId: string): void {
  if (!investigationId) return;
  try {
    const store = window.localStorage;
    for (const key of PER_CASE) store.removeItem(key(investigationId));
    const places = JSON.parse(store.getItem(CASE_PLACES) ?? '{}') as Record<string, unknown>;
    if (places && typeof places === 'object' && !Array.isArray(places) && investigationId in places) {
      delete places[investigationId];
      store.setItem(CASE_PLACES, JSON.stringify(places));
    }
  } catch { /* blocked storage keeps nothing to remove */ }
}

/** Remove what names a reporter looked up, in every case: done when the app locks. */
export function forgetOnLock(): void {
  try {
    const store = window.localStorage;
    const keys = Array.from({length: store.length}, (_, i) => store.key(i)).filter((k): k is string => Boolean(k));
    for (const key of keys) if (ON_LOCK.some(prefix => key.startsWith(prefix))) store.removeItem(key);
  } catch { /* blocked storage keeps nothing to remove */ }
}
