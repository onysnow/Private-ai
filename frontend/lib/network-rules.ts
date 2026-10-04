// The light half of the network's arrangements (lib/network-arrange.ts
// lays the parties out): the rules in words, which arrangement fits the
// links, the size of a party's dot and name. Kept apart so the panel can
// say what the drawing will do without loading the layout libraries.
import type {PartyKind} from './viz-tokens';

/** Past this many parties the panel draws with Sigma (WebGL), in linked groups only. */
export const NETWORK_SVG_LIMIT = 150;

export type Arrangement = 'control' | 'around' | 'kind' | 'clusters';

export type ArrParty = {id: string; label: string; kind: PartyKind};
export type ArrLink = {id: string; from: string; to: string; control: boolean};

export type Guide =
  | {type: 'band'; y0: number; y1: number; x0: number; x1: number; label: string}
  | {type: 'ring'; cx: number; cy: number; r: number; label: string}
  | {type: 'column'; x0: number; x1: number; y0: number; y1: number; label: string; colour: string};

export type Placed = {
  /** Each party's dot centre. */
  positions: Record<string, {x: number; y: number}>;
  guides: Guide[];
  width: number;
  height: number;
};

// ---- the party box: its dot and its name -------------------------------

export const NAME_PX = 13;
export const LINE_PX = 16;
const CHAR_PX = NAME_PX * 0.6;      // the width render/map.mjs estimates for a character
const NAME_CHARS = 20;              // characters on a line before the name wraps
export const MAX_RADIUS = 20;
const PAD = 14;

/** A dot's radius: area grows with the number of links (radius by the square root). */
export function dotRadius(links: number): number {
  return Math.min(MAX_RADIUS, 11 + 3 * Math.sqrt(Math.max(0, links - 1)));
}

/** A name on at most two lines of about NAME_CHARS characters, broken
 * between words; what does not fit ends in an ellipsis (the full name is
 * the party's label for screen readers and its tooltip). */
export function nameLines(label: string, max = NAME_CHARS): string[] {
  const words = label.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length > 2) {
    const second = lines.slice(1).join(' ');
    lines.length = 1;
    lines.push(second.length > max ? `${second.slice(0, max - 1).trimEnd()}…` : second);
  }
  return lines.map(line => (line.length > max + 4 ? `${line.slice(0, max + 3)}…` : line));
}

/** The box a party takes: as wide as its dot or its longest line, as tall as
 * the biggest dot and two lines (every box the same height, so the dots of
 * one level sit on one line). */
export function partyBox(label: string): {width: number; height: number; lines: string[]} {
  const lines = nameLines(label);
  const width = Math.max(2 * MAX_RADIUS, ...lines.map(l => l.length * CHAR_PX)) + PAD;
  return {width, height: 2 * MAX_RADIUS + 6 + 2 * LINE_PX + 6, lines};
}

// ---- choosing an arrangement ------------------------------------------

/** The arrangement a reporter most likely needs for these links, and why. */
export function chooseArrangement(parties: ArrParty[], links: ArrLink[], focus?: string | null): {arrangement: Arrangement; why: string} {
  if (focus && parties.some(p => p.id === focus)) {
    return {arrangement: 'around', why: 'Chosen because you opened the network from this party.'};
  }
  const control = links.filter(l => l.control).length;
  if (control > 0) {
    return {arrangement: 'control', why: `Chosen because ${control} of the ${links.length} links here say who owns or directs whom.`};
  }
  const kinds = new Set(parties.map(p => p.kind)).size;
  if (kinds > 1) {
    return {arrangement: 'kind', why: `Chosen because no link here is an ownership or directorship, and the parties are of ${kinds} kinds.`};
  }
  return {arrangement: 'clusters', why: 'Chosen because no link here is an ownership or directorship and every party is of one kind.'};
}

/** The rule each arrangement follows, in one sentence. */
export function ruleOf(arrangement: Arrangement, focusName?: string): {label: string; text: string} {
  switch (arrangement) {
    case 'control': return {label: 'Arranged by control:', text: 'each owner or director sits above what it owns or directs. Other links run between the levels and move nothing.'};
    case 'around': return {label: `Arranged around ${focusName ?? 'one party'}:`, text: 'each ring holds the parties one more link away from it.'};
    case 'kind': return {label: 'Arranged by kind:', text: 'one column per kind of party, the most-linked at the top of each.'};
    case 'clusters': return {label: 'Arranged in linked groups:', text: 'parties that share links are pulled together. How far apart two groups sit, and in which direction, means nothing.'};
  }
}

export function degrees(parties: ArrParty[], links: ArrLink[]): Map<string, number> {
  const out = new Map(parties.map(p => [p.id, 0]));
  for (const l of links) { out.set(l.from, (out.get(l.from) ?? 0) + 1); out.set(l.to, (out.get(l.to) ?? 0) + 1); }
  return out;
}

/** The party with the most links (then the first by name): the centre "Around" uses when none is picked. */
export function mostLinked(parties: ArrParty[], links: ArrLink[]): string {
  const degree = degrees(parties, links);
  return [...parties].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label))[0].id;
}
