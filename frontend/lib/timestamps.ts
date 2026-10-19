// When something happened, as the API sends it: an ISO 8601 date and time in UTC, the offset
// often left out (backend app/schemas/responses.py Timestamp: "the offset may be left out (UTC is
// meant)"). JavaScript reads a date and time without an offset as local time, so a time read with
// a bare `new Date(...)` is shown hours off anywhere but UTC. Read them here instead.

const HAS_OFFSET = /(Z|[+-]\d\d:?\d\d)$/i;

/** A time from the API as a Date: without an offset, UTC is meant. */
export function apiTime(iso: string): Date {
  const text = iso.trim();
  return new Date(HAS_OFFSET.test(text) || !text.includes('T') ? text : `${text}Z`);
}

/** A time from the API in the reader's own time, as "2026-10-10 15:02". */
export function shortStamp(iso: string): string {
  const at = apiTime(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}
