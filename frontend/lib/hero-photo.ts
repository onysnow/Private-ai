// The photograph behind Rain Noir's glass (research §04.11, innovation 1: "Let the reporter choose the hero
// photograph ... stored locally, marked as decoration and never mixed with evidence"). It is kept in this
// browser's own IndexedDB, apart from the case and its files, and never sent anywhere. The effect system
// rains only on a pane with a photograph behind it, so without one the case title band stays dry.

const DB = 'pai-decoration';
const STORE = 'pictures';
const KEY = 'rain-photo';
export const HERO_PHOTO_EVENT = 'pai:hero-photo';

export type HeroPhoto = {name: string; url: string};

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(db => new Promise(resolve => {
    if (!db) return resolve(null);
    try {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => { resolve(req.result); db.close(); };
      req.onerror = () => { resolve(null); db.close(); };
    } catch { resolve(null); db.close(); }
  }));
}

// One address per kept photograph, shared by everything that shows it; made again only after a change.
let current: Promise<HeroPhoto | null> | null = null;

/** The chosen photograph as an address the page can show, or null when none is chosen. */
export function loadHeroPhoto(): Promise<HeroPhoto | null> {
  current ??= run<{name: string; blob: Blob} | undefined>('readonly', s => s.get(KEY))
    .then(kept => kept?.blob ? {name: kept.name, url: URL.createObjectURL(kept.blob)} : null);
  return current;
}

function changed(): void {
  const old = current;
  current = null;
  void old?.then(p => { if (p) URL.revokeObjectURL(p.url); });
  window.dispatchEvent(new Event(HERO_PHOTO_EVENT));
}

/** Keep a picture file as the photograph behind the glass. Only images are taken. */
export async function saveHeroPhoto(file: File): Promise<boolean> {
  if (!file.type.startsWith('image/')) return false;
  const ok = await run('readwrite', s => s.put({name: file.name, blob: file}, KEY));
  changed();
  return ok !== null;
}

export async function clearHeroPhoto(): Promise<void> {
  await run('readwrite', s => s.delete(KEY));
  changed();
}

/** Calls back whenever the photograph is chosen or removed; returns the unsubscribe. */
export function onHeroPhotoChange(fn: () => void): () => void {
  window.addEventListener(HERO_PHOTO_EVENT, fn);
  return () => window.removeEventListener(HERO_PHOTO_EVENT, fn);
}
