// What the Lanes view (mockup TIME_1; research §2.9) works out from the case's events before it draws: when each
// event can be, the window a zoom shows, the lanes, the quarter bars with their share shown, the flag brackets, and a
// date typed in words. Pure functions, so each is tested on its own.
import type {TimelineLaneEventOut, TimelinePeriodOut} from '../../lib/generated/types.gen';

export type Fact = TimelineLaneEventOut['fact'];
export type LanesBy = 'party' | 'kind' | 'source' | 'sure';
export type Zoom = 'all' | '5y' | '2y' | '1y';

const DAY = 86_400_000;

/** The one mark per event (research §2.9): is the event shown. Glyph, words, and the CSS name of its colour. */
export const FACT: Record<Fact, {glyph: string; name: string; tone: string}> = {
  shown: {glyph: '✓', name: 'shown', tone: 'shown'},
  not_yet: {glyph: '?', name: 'not yet', tone: 'notyet'},
  disputed: {glyph: '!', name: 'disputed', tone: 'disputed'},
  worked_out: {glyph: 'ƒ', name: 'worked out', tone: 'worked'},
};
export const FACT_ORDER: Fact[] = ['shown', 'not_yet', 'disputed', 'worked_out'];

/** The first and last moment (ms, UTC) a date known to the year, month or day can be. */
export function bounds(iso: string): [number, number] {
  const text = iso.slice(0, 10);
  const [y, m, d] = text.split('-').map(Number);
  if (!m) return [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1) - 1];
  if (!d) return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1) - 1];
  const at = Date.UTC(y, m - 1, d);
  return [at, at + DAY - 1];
}

/** When an event can be: from the start of its first date to the end of its last. */
export function span(e: Pick<TimelineLaneEventOut, 'date_start' | 'date_end'>): [number, number] {
  const [lo] = bounds(e.date_start);
  const [, hi] = bounds(e.date_end || e.date_start);
  return [lo, Math.max(lo, hi)];
}

/** Known to less than a day: drawn as a band, never a point on an invented 1 January. */
export function isFuzzy(e: Pick<TimelineLaneEventOut, 'date_start' | 'date_end' | 'precision'>): boolean {
  return Boolean(e.date_end) || e.date_start.length < 10 || ['month', 'year', 'range', 'estimated'].includes(e.precision);
}

/** The window a zoom shows: the case's own years for All, else that many years ending at `focus`. */
export function windowFor(zoom: Zoom, first: number, last: number, focus: number): [number, number] {
  const all: [number, number] = [Date.UTC(new Date(first).getUTCFullYear(), 0, 1), Date.UTC(new Date(last).getUTCFullYear() + 1, 0, 1)];
  if (zoom === 'all') return all;
  const years = zoom === '5y' ? 5 : zoom === '2y' ? 2 : 1;
  const width = years * 365.25 * DAY;
  let to = Math.min(all[1], Math.max(all[0] + width, focus + width / 2));
  let from = to - width;
  if (from < all[0]) { from = all[0]; to = from + width; }
  return [from, to];
}

const YEAR = 365.25 * DAY;

/** The dense stretch of a case: the shortest span holding most of its records (`share`), grown outward while the next
 *  record is close (within a year, or a fifth of that span). What lies beyond is a far outlier, folded into a chip at
 *  the lane's edge (a 1952 founding in a 2009–2016 case). A small case keeps every record. */
export function denseStretch(starts: number[], share = 0.8): [number, number] | null {
  if (!starts.length) return null;
  const s = [...starts].sort((a, b) => a - b);
  const n = s.length;
  if (n < 5) return [s[0], s[n - 1]];
  const k = Math.ceil(n * share);
  let best = 0;
  for (let i = 0; i + k - 1 < n; i += 1) if (s[i + k - 1] - s[i] < s[best + k - 1] - s[best]) best = i;
  let lo = best, hi = best + k - 1;
  const gap = Math.max(YEAR, (s[hi] - s[lo]) * 0.2);
  while (lo > 0 && s[lo] - s[lo - 1] <= gap) lo -= 1;
  while (hi < n - 1 && s[hi + 1] - s[hi] <= gap) hi += 1;
  return [s[lo], s[hi]];
}

/** A case's events split around its dense stretch (the other views open there, as Lanes does): `early` and `late` are
 *  the far outliers, by whole year, as Lanes folds them; `core` is the rest. Undated events are left out of all three. */
export type Folded<T> = {early: T[]; core: T[]; late: T[]; from: number; to: number} | null;
export function foldOutliers<T extends Pick<TimelineLaneEventOut, 'date_start' | 'date_end'>>(events: T[]): Folded<T> {
  const dated = events.filter(e => e.date_start);
  const dense = denseStretch(dated.map(e => span(e)[0]));
  if (!dense) return null;
  const y0 = new Date(dense[0]).getUTCFullYear(), y1 = new Date(dense[1]).getUTCFullYear();
  const year = (e: T) => new Date(span(e)[0]).getUTCFullYear();
  return {early: dated.filter(e => year(e) < y0), core: dated.filter(e => year(e) >= y0 && year(e) <= y1), late: dated.filter(e => year(e) > y1),
    from: Date.UTC(y0, 0, 1), to: Date.UTC(y1 + 1, 0, 1) - 1};
}

/** The years of a run of records, as a title says them: "2009", "2009–11", "1952–2007". */
export function yearsWords(a: number, b: number): string {
  if (a === b) return String(a);
  return Math.floor(a / 100) === Math.floor(b / 100) && b - a < 10 ? `${a}–${String(b).slice(2)}` : `${a}–${b}`;
}

/** The dense years cut into a handful of runs (at most `most`) holding about as many records each, on whole years:
 *  each run closes before the year that would take it further past its share than stopping short. Years with no
 *  record never make a run of their own. */
export function yearRuns(counts: Map<number, number>, from: number, to: number, most = 4): Array<[number, number]> {
  const held = [...counts].filter(([y, c]) => y >= from && y <= to && c > 0);
  const total = held.reduce((n, [, c]) => n + c, 0);
  const groups = Math.max(1, Math.min(most, held.length));
  const target = total / groups;
  const runs: Array<[number, number]> = [];
  let start = from, acc = 0;
  for (let y = from; y <= to; y += 1) {
    const c = counts.get(y) ?? 0;
    if (acc > 0 && runs.length < groups - 1 && Math.abs(acc - target) < Math.abs(acc + c - target)) { runs.push([start, y - 1]); start = y; acc = 0; }
    acc += c;
  }
  runs.push([start, to]);
  // Each run is named by the years that hold its records: an empty year at either end is left off.
  const has = (y: number) => (counts.get(y) ?? 0) > 0;
  return runs.map(([a, b]) => { while (a < b && !has(a)) a += 1; while (b > a && !has(b)) b -= 1; return [a, b] as [number, number]; });
}

/** The stretches a case falls into before any period is named: its dense years cut into a handful of runs (yearRuns),
 *  plus the far outliers before and after (`fold`). Board uses them as its boards; Periods offers them as periods to name. */
export function stretches(events: TimelineLaneEventOut[]): Array<{from: number; to: number; count: number; fold?: 'early' | 'late'}> {
  const folded = foldOutliers(events.filter(e => e.date_start && !e.placeholder && e.precision !== 'unknown'));
  if (!folded) return [];
  const year = (e: Pick<TimelineLaneEventOut, 'date_start' | 'date_end'>) => new Date(span(e)[0]).getUTCFullYear();
  const counts = new Map<number, number>();
  for (const e of folded.core) counts.set(year(e), (counts.get(year(e)) ?? 0) + 1);
  const y0 = new Date(folded.from).getUTCFullYear(), y1 = new Date(folded.to).getUTCFullYear();
  const end = (rows: TimelineLaneEventOut[], fold: 'early' | 'late') => ({from: Math.min(...rows.map(year)), to: Math.max(...rows.map(year)), count: rows.length, fold});
  return [
    ...(folded.early.length ? [end(folded.early, 'early')] : []),
    ...yearRuns(counts, y0, y1).map(([a, b]) => ({from: a, to: b, count: folded.core.filter(e => year(e) >= a && year(e) <= b).length})),
    ...(folded.late.length ? [end(folded.late, 'late')] : []),
  ];
}

/** Every how many years the axis names a year, so the names never run into each other. */
export function yearStep(years: number, width: number, minGap = 52): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) if ((width / Math.max(1, years)) * step >= minGap) return step;
  return 100;
}

/** Labels laid out so none covers another or a mark. Each label offers places in order of preference (beside its mark
 *  on the right, then on the left), each on a row; `taken` already holds the marks on each row. First come, first
 *  served, so pass the selected one first. Returns, for each label that fits, the index of the place it took; a label
 *  with no free place is left out (shown on hover instead). */
export function layoutLabels(want: Array<{id: string; at: Array<{row: string; x0: number; x1: number}>}>, taken: Map<string, Array<[number, number]>>,
  left: number, right: number, pad = 6): Map<string, number> {
  const placed = new Map<string, number>();
  for (const w of want) {
    const i = w.at.findIndex(p => p.x0 >= left && p.x1 <= right && !(taken.get(p.row) ?? []).some(([a, b]) => p.x0 < b + pad && p.x1 > a - pad));
    if (i < 0) continue;
    const p = w.at[i];
    taken.set(p.row, [...(taken.get(p.row) ?? []), [p.x0, p.x1]]);
    placed.set(w.id, i);
  }
  return placed;
}

/** A name in at most two lines of about `per` characters, broken between words; what does not fit ends in "…". */
export function wrapName(name: string, per: number): string[] {
  if (name.length <= per) return [name];
  const words = name.split(/\s+/);
  let first = '';
  while (words.length && (first ? `${first} ${words[0]}` : words[0]).length <= per) first = first ? `${first} ${words.shift()}` : words.shift()!;
  if (!first) { first = name.slice(0, per); words.splice(0, words.length, name.slice(per)); }
  const rest = words.join(' ');
  return [first, rest.length > per ? `${rest.slice(0, per - 1)}…` : rest].filter(Boolean);
}

/** The lanes an event goes in, by party, kind, source or how sure. An event about two parties is in both lanes. */
export function lanesOf(e: TimelineLaneEventOut, by: LanesBy): string[] {
  if (by === 'kind') return [e.kind];
  if (by === 'source') return [e.source_key];
  if (by === 'sure') return [e.fact];
  return e.parties.length ? e.parties : ['none'];
}

export type Quarter = {from: number; to: number; count: number; shown: number};

/** Records per quarter in the window, with how many of them are shown (the confidence line). */
export function quarters(events: TimelineLaneEventOut[], from: number, to: number): Quarter[] {
  const out: Quarter[] = [];
  const start = new Date(from);
  let y = start.getUTCFullYear(), q = Math.floor(start.getUTCMonth() / 3);
  for (;;) {
    const a = Date.UTC(y, q * 3, 1), b = Date.UTC(y, q * 3 + 3, 1) - 1;
    if (a > to) break;
    out.push({from: a, to: b, count: 0, shown: 0});
    q += 1;
    if (q === 4) { q = 0; y += 1; }
  }
  for (const e of events) {
    const [lo] = span(e);
    const bucket = out.find(qq => lo >= qq.from && lo <= qq.to);
    if (!bucket) continue;
    bucket.count += 1;
    if (e.fact === 'shown') bucket.shown += 1;
  }
  return out;
}

export type FlagBracket = {lane: string; from: number; to: number; ids: string[]; say: string};

/** Payments just under a reporting line from one payer, more than one within a year: a bracket over the time they
 *  cover (the Red Flag of splitting a sum to stay under the line). Amounts are compared, never added up. */
export function justUnder(events: TimelineLaneEventOut[], line = 10_000, share = 0.9): FlagBracket[] {
  const near = events.filter(e => e.schema === 'Payment' && e.amount != null && e.amount >= line * share && e.amount < line && e.parties.length);
  const byPayer = new Map<string, TimelineLaneEventOut[]>();
  for (const e of near) byPayer.set(e.parties[0], [...(byPayer.get(e.parties[0]) ?? []), e]);
  const out: FlagBracket[] = [];
  for (const [payer, list] of byPayer) {
    const sorted = [...list].sort((a, b) => span(a)[0] - span(b)[0]);
    let group: TimelineLaneEventOut[] = [];
    const close = () => {
      if (group.length > 1) {
        const currency = group[0].currency ? ` ${group[0].currency}` : '';
        out.push({lane: payer, from: span(group[0])[0], to: span(group[group.length - 1])[1], ids: group.map(e => e.id),
          say: `just under ${line.toLocaleString('en-GB')}${currency} ×${group.length}`});
      }
    };
    for (const e of sorted) {
      if (group.length && span(e)[0] - span(group[0])[0] > 365 * DAY) { close(); group = []; }
      group.push(e);
    }
    close();
  }
  return out;
}

/** The periods that cover a moment. */
export function periodAt(periods: TimelinePeriodOut[], at: number): TimelinePeriodOut | undefined {
  return periods.find(p => at >= bounds(p.date_start)[0] && at <= bounds(p.date_end)[1]);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SEASONS: Record<string, [number, number]> = {spring: [3, 5], summer: [6, 8], autumn: [9, 11], fall: [9, 11], winter: [12, 14]};
const two = (n: number) => String(n).padStart(2, '0');

export type ParsedWhen = {date_start: string; date_end?: string; precision: string; words: string};

/** A date typed in words ("March 2019", "spring 2019", "2019", "2 May 2019", "Q2 2018", "2019-05-02"), as a start, an
 *  end and how exact it is. Null when it cannot be read: nothing is guessed. */
export function parseWhen(text: string): ParsedWhen | null {
  const t = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(t);
  if (m) {
    if (m[3]) return {date_start: `${m[1]}-${m[2]}-${m[3]}`, precision: 'day', words: 'a day'};
    if (m[2]) return {date_start: `${m[1]}-${m[2]}`, precision: 'month', words: 'a month'};
    return {date_start: m[1], precision: 'year', words: 'a year'};
  }
  m = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(t) ?? null;
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3)) + 1;
    if (month > 0 && Number(m[1]) >= 1 && Number(m[1]) <= 31) return {date_start: `${m[3]}-${two(month)}-${two(Number(m[1]))}`, precision: 'day', words: 'a day'};
  }
  m = /^([a-z]+) (\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3)) + 1;
    if (month > 0 && MONTHS.some(x => m![1].startsWith(x))) return {date_start: `${m[2]}-${two(month)}`, precision: 'month', words: 'a month'};
    const season = SEASONS[m[1]];
    if (season) {
      const y = Number(m[2]);
      const end = season[1] > 12 ? `${y + 1}-${two(season[1] - 12)}` : `${y}-${two(season[1])}`;
      return {date_start: `${y}-${two(season[0])}`, date_end: end, precision: 'range', words: `${m[1]}: a range of months`};
    }
  }
  m = /^q([1-4]) (\d{4})$/.exec(t);
  if (m) {
    const q = Number(m[1]);
    return {date_start: `${m[2]}-${two(q * 3 - 2)}`, date_end: `${m[2]}-${two(q * 3)}`, precision: 'range', words: 'a quarter'};
  }
  return null;
}

// How well an event is substantiated: Bellingcat's grading scale (ADR-0005, line 5; backend app/services/timeline.py
// EVENT_GRADES, which these words follow). It feeds the one mark: confirmed or likely is shown.
export const EVENT_GRADES: Record<string, string> = {
  confirmed: 'enough evidence, from several verification techniques and at least three sources cross-referenced',
  likely: 'several sources report it and most of the information can be verified, with minor contradictions',
  weak: 'a single source says it happened',
  unsubstantiated: 'no conclusion can be reached for lack of evidence',
  unknown: 'what happened cannot be identified',
};
