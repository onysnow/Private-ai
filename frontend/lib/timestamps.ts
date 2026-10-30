// When something happened, as the API sends it: an ISO 8601 date and time in UTC, the offset
// often left out (backend app/schemas/responses.py Timestamp: "the offset may be left out (UTC is
// meant)"). JavaScript reads a date and time without an offset as local time, so a time read with
// a bare `new Date(...)` is shown hours off anywhere but UTC. Read them here instead.

import {MONTHS} from './dates';

const HAS_OFFSET = /(Z|[+-]\d\d:?\d\d)$/i;

/** A time from the API as a Date: without an offset, UTC is meant. */
export function apiTime(iso: string): Date {
  const text = iso.trim();
  return new Date(HAS_OFFSET.test(text) || !text.includes('T') ? text : `${text}Z`);
}

const two = (n: number) => String(n).padStart(2, '0');

/** The day of a time from the API, in the reader's own time: "10 Oct 2026". */
export function timeDayWords(iso: string): string {
  const at = apiTime(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

/** A time from the API in the reader's own time, the way every screen writes one: "10 Oct 2026, 15:02". */
export function timeWords(iso: string): string {
  const at = apiTime(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${timeDayWords(iso)}, ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** The day of a time from the API for a narrow column, where the full time is a hover away: "10 Oct" this year,
 *  "Oct 2025" an earlier or later one (never a day without its year being plain). */
export function compactDay(iso: string, now = new Date()): string {
  const at = apiTime(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.getFullYear() === now.getFullYear() ? `${at.getDate()} ${MONTHS[at.getMonth()]}` : `${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

/** A time from the API kept in UTC on purpose (a provenance line): "2026-10-10 14:02 UTC". */
export function utcStamp(iso: string): string {
  const at = apiTime(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** A time from the API in the reader's own time, as "2026-10-10 15:02": for logs set in monospace only. */
export function shortStamp(iso: string): string {
  const at = apiTime(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}
