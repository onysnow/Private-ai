// What Places (mockup PLACE_1; research §2.10) works out before it draws: which places are on this map and which are
// far off (edge markers, DECISIONS_LOG 6 call 6), where each sits, a party's path hop by hop, and an address that
// holds several parties. Pure functions, tested on their own.
import type {PlaceOut} from '../../lib/generated/types.gen';

export type Point = {x: number; y: number};
export type Box = {w: number; h: number; pad: number};

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function km(a: Pick<PlaceOut, 'latitude' | 'longitude'>, b: Pick<PlaceOut, 'latitude' | 'longitude'>): number {
  const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** The places on this map and those far off: a place more than five times the typical distance from the middle of
 *  the others (and over 50 km) is drawn as a marker on the edge, pointing at it, rather than shrinking the map. */
export function onAndOff(places: PlaceOut[]): {on: PlaceOut[]; off: PlaceOut[]} {
  if (places.length < 3) return {on: places, off: []};
  const centre = {latitude: median(places.map(p => p.latitude)), longitude: median(places.map(p => p.longitude))};
  const d = places.map(p => km(centre, p));
  const typical = Math.max(1, median(d));
  const off = places.filter((_, i) => d[i] > typical * 5 && d[i] > 50);
  return off.length && off.length < places.length ? {on: places.filter(p => !off.includes(p)), off} : {on: places, off: []};
}

/** A projection that fits the places in the box: longitude scaled by the cosine of the middle latitude, so a
 *  kilometre is as long east-west as north-south. */
export function projector(places: Array<Pick<PlaceOut, 'latitude' | 'longitude'>>, box: Box): (p: Pick<PlaceOut, 'latitude' | 'longitude'>) => Point {
  if (!places.length) return () => ({x: box.w / 2, y: box.h / 2});
  const lats = places.map(p => p.latitude), lons = places.map(p => p.longitude);
  const k = Math.cos(toRad((Math.min(...lats) + Math.max(...lats)) / 2));
  const x0 = Math.min(...lons) * k, x1 = Math.max(...lons) * k, y0 = Math.min(...lats), y1 = Math.max(...lats);
  const span = Math.max(x1 - x0, y1 - y0, 0.002);
  const scale = Math.min((box.w - 2 * box.pad) / Math.max(x1 - x0, span * 0.2), (box.h - 2 * box.pad) / Math.max(y1 - y0, span * 0.2));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return p => ({x: box.w / 2 + (p.longitude * k - cx) * scale, y: box.h / 2 - (p.latitude - cy) * scale});
}

/** Where on the frame's edge a marker for a far place sits, and the compass word for its direction. */
export function edgeMarker(from: Point, to: Point, box: Box): {x: number; y: number; arrow: string} {
  const dx = to.x - from.x, dy = to.y - from.y;
  const t = Math.min(Math.abs((box.w / 2 - 24) / (dx || 1e-9)), Math.abs((box.h / 2 - 24) / (dy || 1e-9)));
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const arrows = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
  return {x: box.w / 2 + dx * t, y: box.h / 2 + dy * t, arrow: arrows[(Math.round(angle / 45) + 8) % 8]};
}

export type Hop = {place: PlaceOut; day: string; title: string; shown: boolean};

/** A party's path: the places linked to it with a dated event on that link, in date order; two hops in a row at the
 *  same place are one. A hop is dashed when its event is not verified. */
export function pathOf(places: PlaceOut[], partyId: string): Hop[] {
  const hops: Hop[] = [];
  for (const place of places) {
    const mine = new Set(place.links.filter(l => l.entity_id === partyId).map(l => l.relationship_id));
    for (const e of place.events ?? []) {
      if (e.relationship_id && mine.has(e.relationship_id)) hops.push({place, day: e.first_day, title: e.title, shown: e.verification_status === 'verified'});
    }
  }
  hops.sort((a, b) => a.day.localeCompare(b.day));
  return hops.filter((h, i) => i === 0 || h.place.entity_id !== hops[i - 1].place.entity_id);
}

/** The parties whose path visits two places or more: the ones a path can be drawn for. */
export function travellers(places: PlaceOut[]): Array<{id: string; caption: string; hops: number}> {
  const seen = new Map<string, string>();
  for (const p of places) for (const l of p.links) seen.set(l.entity_id, l.caption);
  return [...seen].map(([id, caption]) => ({id, caption, hops: pathOf(places, id).length})).filter(t => t.hops >= 2)
    .sort((a, b) => b.hops - a.hops || a.caption.localeCompare(b.caption));
}

/** An address that holds several parties (companies registered there): how many. */
export function heldHere(place: PlaceOut): number {
  return place.schema === 'Address' ? new Set(place.links.map(l => l.entity_id)).size : 0;
}
