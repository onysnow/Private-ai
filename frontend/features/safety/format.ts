// Plain-words formatting for Keep › Safety & data (mockup KEEP-safety-and-data): sizes, "3 days ago", the short time
// in the outbound log, and the sentences the stores and services show. Pure, so they are tested without a server.
import type {SafetyServiceOut, SafetyStoresOut} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';

export const PERIODS = [
  {key: 'today', label: 'Today'},
  {key: '7d', label: '7 days'},
  {key: '30d', label: '30 days'},
  {key: 'all', label: 'All'},
] as const;
export type Period = (typeof PERIODS)[number]['key'];

export function bytes(n: number): string {
  if (n < 1000) return `${n} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = -1;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit += 1; }
  return `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function count(n: number): string {
  return n.toLocaleString('en-GB');
}

/** "3 days ago", "today", "never". Whole days by the reader's own calendar (the API's times are UTC; lib/timestamps). */
export function ago(value: string | null | undefined, now: Date): string {
  if (!value) return 'never';
  const then = apiTime(value);
  const day = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const days = day(now) - day(then);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayLabel(value: string): string {
  const d = apiTime(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The log's time column, in the reader's own time: HH:MM today, the weekday within a week, else the date. */
export function logTime(value: string, now: Date): string {
  const d = apiTime(value);
  const pad = (x: number) => String(x).padStart(2, '0');
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const MODE_LABEL: Record<string, string> = {
  off: 'OFF', on_click: 'ON CLICK', this_computer: 'THIS COMPUTER', automatic: 'AUTOMATIC', blocked: 'BLOCKED',
};

/** The line from the store region to a service: what is sent and how many times, or why nothing is. */
export function lineLabel(s: SafetyServiceOut): string {
  if (!s.counted) return 'not counted yet';
  if (s.mode === 'blocked') return 'blocked';
  if (s.mode === 'off') return 'nothing (off)';
  if (s.mode === 'this_computer') return 'stays on this computer';
  if (s.sent === 0) return 'nothing sent yet';
  return `${s.sends.join(', ')} · ${count(s.sent)}`;
}

/** A line is drawn solid when something went along it; dotted and grey when nothing did or could. */
export function lineState(s: SafetyServiceOut): 'used' | 'idle' | 'off' | 'blocked' {
  if (s.mode === 'blocked') return 'blocked';
  if (s.mode === 'off' || s.mode === 'this_computer') return 'off';
  return s.sent > 0 ? 'used' : 'idle';
}

export function privateAiLine(ai: SafetyStoresOut['private_ai']): {title: string; detail: string} {
  if (!ai.enabled || !ai.provider) return {title: 'Off', detail: 'AI features are off on this server'};
  if (ai.on_this_computer) return {title: 'Local model', detail: 'Outside AI is not used'};
  if (ai.provider === 'ollama' && !ai.remote_allowed) return {title: 'Local model', detail: 'Outside AI not allowed on this server'};
  return {title: `${ai.provider}${ai.model ? ` · ${ai.model}` : ''}`, detail: 'Outside AI: only when you start a run'};
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}
