// Dates in words, at the precision a record knows them to.

/** How much of a date an ISO value holds: "2009" a year, "2009-05" a month, a full date a day. */
function heldGrain(iso: string): 'year' | 'month' | 'day' {
  if (/^\d{4}$/.test(iso.trim())) return 'year';
  if (/^\d{4}-\d{2}$/.test(iso.trim())) return 'month';
  return 'day';
}

/** A date in words at the precision it is known to: 3 Oct 2023, Oct 2023, 2023,
 *  before 3 Oct 2023, after 3 Oct 2023, about 3 Oct 2023. Never more than the
 *  value holds: a range stored as "2009" to "2013" reads "2009" to "2013", not
 *  "1 Jan 2009" to "1 Jan 2013". */
export function dateWords(iso: string, precision?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const at = new Date(time);
  const month = at.toLocaleString('en-GB', {month: 'short', timeZone: 'UTC'});
  const held = heldGrain(iso);
  const grain = precision === 'year' || held === 'year' ? 'year' : precision === 'month' || held === 'month' ? 'month' : 'day';
  const words = grain === 'year' ? String(at.getUTCFullYear())
    : grain === 'month' ? `${month} ${at.getUTCFullYear()}`
      : `${at.getUTCDate()} ${month} ${at.getUTCFullYear()}`;
  if (precision === 'before') return `before ${words}`;
  if (precision === 'after') return `after ${words}`;
  if (precision === 'estimated') return `about ${words}`;
  return words;
}
