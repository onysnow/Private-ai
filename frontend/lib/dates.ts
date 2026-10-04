// Dates in words, at the precision a record knows them to.

/** A date in words at the precision it is known to: 3 Oct 2023, Oct 2023, 2023. */
export function dateWords(iso: string, precision?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const at = new Date(time);
  const month = at.toLocaleString('en-GB', {month: 'short', timeZone: 'UTC'});
  if (precision === 'year') return String(at.getUTCFullYear());
  if (precision === 'month') return `${month} ${at.getUTCFullYear()}`;
  return `${at.getUTCDate()} ${month} ${at.getUTCFullYear()}`;
}
