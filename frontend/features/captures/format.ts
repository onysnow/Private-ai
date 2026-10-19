// Words and shapes for the Links & captures screen (mockup INTAKE_3; ADR-0016). Pure, so they are tested alone.
import {apiTime} from '../../lib/timestamps';

const LINK = /^https?:\/\/\S+$/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

/** Pasted text that is only web addresses, one to a line; anything else is not a link paste (a note that mentions one stays text). */
export function linksIn(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every(l => LINK.test(l)) ? lines : [];
}

/** "19 Oct 2026 10:14:09 UTC": the server keeps UTC, and a capture's time is evidence, so it is shown as UTC. */
export function utcWords(iso: string | null | undefined, seconds = true): string {
  if (!iso) return '';
  const at = apiTime(iso);
  const time = `${two(at.getUTCHours())}:${two(at.getUTCMinutes())}${seconds ? `:${two(at.getUTCSeconds())}` : ''}`;
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()} ${time} UTC`;
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

/** The address without its scheme: "www.marlow.example/2019/03/sale". */
export function addressOf(url: string): string {
  try { const u = new URL(url); return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`; } catch { return url; }
}

/** "186 KB", "2.4 MB": what the receipt lists beside each file. */
export function bytesWords(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The fingerprint in groups of four, the middle left out: the whole value is one click away (copy). */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return '';
  const head = hash.slice(0, 16).match(/.{4}/g)?.join(' ') ?? hash;
  return `${head} …${hash.slice(-8, -4)} ${hash.slice(-4)}`;
}

type Tone = 'good' | 'quiet' | 'warn' | 'bad';
export type Badge = {word: string; tone: Tone; mark: string};

/** What a capture is called in the list: its outcome, or what its latest re-check found. A word as well as a colour. */
export function badgeOf(c: {outcome: string; change?: string | null}): Badge {
  if (c.outcome === 'saved') {
    if (c.change === 'changed') return {word: 'Changed since capture', tone: 'warn', mark: '△'};
    if (c.change === 'gone') return {word: 'Gone', tone: 'bad', mark: '✕'};
    return {word: 'Saved', tone: 'good', mark: '✓'};
  }
  if (c.outcome === 'link_only') return {word: c.change === 'gone' ? 'Gone' : 'Link only', tone: 'bad', mark: '!'};
  if (c.outcome === 'not_seen') return {word: 'Not seen', tone: 'warn', mark: '○'};
  return {word: 'Not saved', tone: 'bad', mark: '✕'};
}

/** One line for a re-check in the history. */
export function checkWords(c: {state: string; at: string}): string {
  const what: Record<string, string> = {
    same: 'Same text', changed: 'Changed: a new copy was kept', gone: 'Gone: the page is not there; the saved copy is kept',
    unreachable: 'Could not be reached', not_seen: 'A login wall now: nothing was seen',
  };
  return `${what[c.state] ?? c.state} · ${utcWords(c.at, false)}`;
}

/** What a capture's reply says, for the line under the paste field. */
export function resultWords(state: string, title: string | null | undefined): string {
  const name = title ? `“${title}”` : 'this page';
  switch (state) {
    case 'already_in_case': return `Already in the case as ${name} · same fingerprint. Nothing new was saved.`;
    case 'same': return `${name} has the same text as the saved copy. A line was added to its checks.`;
    case 'changed': return `${name} has changed. The new copy is saved; the first is kept as it was.`;
    case 'gone': return `${name} is no longer there. The saved copy is kept, and the removal is recorded.`;
    case 'unreachable': return 'The site could not be reached, so nothing was compared. Try again later.';
    case 'not_seen': return 'The site now asks for a login. Nothing behind it was seen.';
    default: return '';
  }
}

/** A date the page displays, in words when it is a full date and time, else as the page wrote it (it is not ours to correct). */
export function displayedDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? utcWords(value, false) : value;
}
