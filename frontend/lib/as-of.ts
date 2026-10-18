// The investigation's one year slider (docs/discovery/README.md, "Overlays"):
// the network, the money and the timeline show the state as of the chosen
// year. What "as of" means for each record is stated here, once:
//
//   a link with a start and/or end date (FollowTheMoney startDate, endDate)
//     is shown when it had started by the end of that year and had not
//     ended before it began;
//   a link with one date (a payment's date) is shown once that date is
//     reached;
//   an event is shown once its start date is reached;
//   a record with no date is always shown, and counted as undated, because
//     nothing says whether it held then.
// Years only: dates are compared by their first four digits, so a date known
// only to the year still places correctly.

export type Span = {start?: string; end?: string};

const YEAR = /^(\d{4})/;

export function yearOf(value: string | null | undefined): number | null {
  const m = YEAR.exec(value ?? '');
  return m ? Number(m[1]) : null;
}

const first = (properties: Record<string, string[] | undefined> | undefined, key: string): string | undefined =>
  properties?.[key]?.find(v => yearOf(v) !== null);

/** A link's dates, from its FollowTheMoney properties. */
export function linkSpan(properties: Record<string, string[] | undefined> | undefined): Span {
  const start = first(properties, 'startDate') ?? first(properties, 'date');
  const end = first(properties, 'endDate');
  return {start, end};
}

export function isDated(span: Span): boolean {
  return yearOf(span.start) !== null || yearOf(span.end) !== null;
}

/** Whether a record with these dates is shown as of the year (null: all time). */
export function shownAsOf(span: Span, asOf: number | null): boolean {
  if (asOf === null) return true;
  const start = yearOf(span.start);
  const end = yearOf(span.end);
  if (start === null && end === null) return true;
  if (start !== null && start > asOf) return false;
  if (end !== null && end < asOf) return false;
  return true;
}

/** The first and last year any of these dates names, or null when none does. */
export function yearRange(values: (string | null | undefined)[]): {from: number; to: number} | null {
  const years = values.map(yearOf).filter((y): y is number => y !== null);
  return years.length ? {from: Math.min(...years), to: Math.max(...years)} : null;
}
