// Keep › Safety & data: the words and numbers the screen shows, as pure functions so they are tested without a server.
import type {OutboundRequestOut, SafetyServiceOut} from '../../lib/generated/types.gen';

export type Period = 'today' | 'week' | 'month' | 'all';
export const PERIODS: {id: Period; label: string}[] = [
  {id: 'today', label: 'Today'}, {id: 'week', label: '7 days'}, {id: 'month', label: '30 days'}, {id: 'all', label: 'All'},
];

/** The start of a period in this browser's own day (Today starts at local midnight), as the API's UTC time; All is null. */
export function sinceOf(period: Period, now: Date = new Date()): string | null {
  if (period === 'all') return null;
  const start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  else start.setTime(now.getTime() - (period === 'week' ? 7 : 30) * 86_400_000);
  // Rounded down to the minute, so a refetch inside the same minute reuses the cached reply.
  start.setSeconds(0, 0);
  return start.toISOString();
}

/** The API's times are UTC, sent without an offset (backend/app/schemas/responses.py Timestamp). */
export function parseTime(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function count(n: number): string {
  return n.toLocaleString('en-GB');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

/** "3 days ago", "today", "yesterday". */
export function ago(value: string, now: Date = new Date()): string {
  const then = parseTime(value);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function dayMonthYear(value: string): string {
  return parseTime(value).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
}

/** The log's time column: the time today, the weekday this week, else the date. */
export function logTime(value: string, now: Date = new Date()): string {
  const t = parseTime(value);
  const sameDay = t.toDateString() === now.toDateString();
  if (sameDay) return t.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
  if (now.getTime() - t.getTime() < 6 * 86_400_000) return t.toLocaleDateString('en-GB', {weekday: 'short'});
  return t.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
}

export type LineState = 'sent' | 'quiet' | 'never' | 'off' | 'blocked';

/** How a service's line is drawn: sent this period (solid), nothing this period, never used, off (dotted, grey),
 * or blocked by the server (dotted, with ✕). */
export function lineState(s: SafetyServiceOut): LineState {
  if (s.locked_reason) return 'blocked';
  if (s.mode === 'OFF') return 'off';
  if (s.sent_count > 0) return 'sent';
  return s.ever_used ? 'quiet' : 'never';
}

/** The words on a line: what is sent and how many times ("search text · 31"). */
export function lineLabel(s: SafetyServiceOut): string {
  const state = lineState(s);
  if (state === 'blocked') return '✕ blocked';
  if (state === 'off') return 'nothing (off)';
  if (state === 'never') return 'never used';
  if (state === 'quiet') return 'nothing this period';
  return `${s.sent_kinds.map(k => k.value_kind).join(', ')} · ${count(s.sent_count)}`;
}

export const MODE_WORDS: Record<SafetyServiceOut['mode'], string> = {OFF: 'Off', ASK: 'Ask first', AUTOMATIC: 'Automatic'};

/** Who started a request, as the log's muted line says it. */
export function startedBy(r: OutboundRequestOut): string {
  return r.started_by === 'person' ? 'you asked' : 'automatic check';
}
