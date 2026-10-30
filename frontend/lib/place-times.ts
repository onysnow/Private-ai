// When things happened at the investigation's places (backend
// app/services/places.py, each place's `events`), as stretches of time, and
// the places a stretch of time picks. No ECharts here: the places panel uses
// these without pulling the timeline strip into the page's first load.
import {dateWords} from './dates';
import type {PlaceEventOut, PlaceOut, PlacePictureOut} from './generated/types.gen';

export const DAY_MS = 86_400_000;

/** A stretch of time, in ms since 1970 (UTC), from the start of its first day to the end of its last. */
export type TimeWindow = {from: number; to: number};

const dayMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/** When an event happened, in ms: from the start of its first day to the end of its last. */
export function eventWindow(event: Pick<PlaceEventOut, 'first_day' | 'last_day'>): TimeWindow {
  return {from: dayMs(event.first_day), to: dayMs(event.last_day) + DAY_MS};
}

/** The stretch of time every place's events cover, or null when none is dated. */
export function eventsExtent(places: PlaceOut[]): TimeWindow | null {
  const windows = places.flatMap(place => (place.events ?? []).map(eventWindow));
  if (!windows.length) return null;
  return {from: Math.min(...windows.map(w => w.from)), to: Math.max(...windows.map(w => w.to))};
}

/** The places with an event that overlaps the window; every place when there is no window. */
export function placesInWindow(places: PlaceOut[], span: TimeWindow | null): PlaceOut[] {
  if (!span) return places;
  return places.filter(place => (place.events ?? []).some(event => {
    const when = eventWindow(event);
    return when.from < span.to && when.to > span.from;
  }));
}

/** The events at a place that overlap the window; all of them when there is no window. */
export function eventsInWindow(place: PlaceOut, span: TimeWindow | null): PlaceEventOut[] {
  const events = place.events ?? [];
  if (!span) return events;
  return events.filter(event => { const when = eventWindow(event); return when.from < span.to && when.to > span.from; });
}

/** Whether a picture was taken inside the window: true when there is no window, null when its day is not known
 * (an undated picture is neither in nor out, so it is never hidden by the window). */
export function pictureInWindow(picture: Pick<PlacePictureOut, 'first_day' | 'last_day'>, span: TimeWindow | null): boolean | null {
  if (!span) return true;
  if (!picture.first_day || !picture.last_day) return null;
  return dayMs(picture.first_day) < span.to && dayMs(picture.last_day) + DAY_MS > span.from;
}

/** A day in words, as the timeline chart writes it: 14 Nov 2023 (UTC). */
export function dayText(ms: number): string {
  return dateWords(isoDay(ms));
}


/** A moment's day as a date field writes it: 2023-11-14 (UTC). */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
