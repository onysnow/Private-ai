// The Wire (See; prototype docs/design/see-the-wire/src.html, approved 12 Oct 2026): the
// case as one map flown over at three altitudes. Whole case: parties in soft merged
// patches (groups from the server's community detection). Around a party: compass
// sectors (owners W, owns E, money in N, money out S, both ways NE, other SW), ring 1
// as cards, ring 2 chosen by flags and links. One link: every record between two
// parties as beads on a line of dates, each hanging the quote that shows it.
// Also: the lens (L), follow the money (F), accounts rolled into their holders, shell
// chains as decks, the time strip with Play, and the "Where you've been" trail.
// From SEE_1 (research §2.2): every link carries its sentence with its certainty glyph
// (✓ shown, ? not yet shown, ✕ disputed, ƒ worked out), its line style follows the same
// grammar (solid, dashed, double, dotted; ended links faint), the "How sure" key stays
// on, a flagged party wears a ring and a badge with its level and count, the active
// filters show as chips, and the time strip counts the links held in its window.
//
// It draws straight into SVG (hundreds of moving parts each frame), so it is plain DOM
// code mounted by the-wire.tsx; every listener is removed by the returned destroy().
import type {WireEntityOut, WireLinkOut, WireOut} from '../../lib/generated/types.gen';
import {onScreen} from '../../lib/on-screen';

/** How sure a link is (the status grammar): read from the case's review advisory by the-wire.tsx. */
export type LinkSure = 'shown' | 'unshown' | 'disputed' | 'worked';
/** Per link id: how sure it is, and its end date when the record gives one (an ended link is drawn faint). */
export type LinkInfo = Record<string, {sure: LinkSure; end: string}>;
/** The reporter's own tags on parties (entity id → its tags), drawn as a ring of coloured arcs outside the dot. */
export type PartyTags = Record<string, {name: string; colour: string}[]>;

/** The link the "One link" altitude has open, for the link panel: its two parties (an account drawn on its holder
 * counts as the holder's side) and every record between them. */
export type OpenLink = {key: string; a: {id: string; name: string}; b: {id: string; name: string}; aSide: string[]; records: WireLinkOut[]};

export type WireHooks = {
  active: () => boolean;
  /** The "One link" altitude opened a link (or closed it, with null): the link panel follows it. */
  openLink?: (link: OpenLink | null) => void;
  openDossier: (entityId: string) => void;
  openFlag: (flagId: string) => void;
  traceEvidence: (evidenceId: string, title: string) => void;
};

type Flags = {faint: number; strong: number; textbook: number; items: {level: string; id: string; text: string; flag_id: string}[]};
type Mode = 'case' | 'party' | 'wire' | 'path';
type Target = {x: number; y: number; o: number; v: number; a?: number};
type Strand = {fam: string; s: string; t: string; links: WireLinkOut[]; sum: number; cur: string; sure: LinkSure | null};
type Bundle = {key: string; a: string; b: string; links: WireLinkOut[]; strands: Record<string, Strand>};
type Chain = {id: string; mids: string[]; ends: string[]; open: boolean};
type NodeEl = {
  id: string; g: SVGGElement; halo: SVGCircleElement; tags: SVGGElement | null; dx: number; hw: number; hh: number; dust: SVGCircleElement; dot: SVGGElement; lbl: SVGTextElement; card: SVGGElement;
  beads: SVGGElement; flag: SVGGElement; isChain: boolean; cur: Target; tgt: Target; from: Target | null;
};
type EdgeEl = {g: SVGGElement; p: SVGPathElement; u: SVGPathElement | null; h: SVGPathElement; d2: SVGPathElement | null; S: Strand; w: number; bend: number; want: boolean;
  mid?: {x: number; y: number}; q?: number[]; lab: {g: SVGGElement; w: number; t: SVGTextElement; body: SVGTSpanElement; ended: boolean} | null;
  // SEE_1's lettered stubs: a link longer than 40% of the view's diagonal is drawn as its two ends, each with the same letter.
  stub: {a: SVGGElement; b: SVGGElement; on: boolean} | null};
type Box = {x0: number; x1: number; y0: number; y1: number};
type Pt = {x: number; y: number; in: boolean; d?: number};

const NS = 'http://www.w3.org/2000/svg';
// Kinds and link families keep the prototype's Case Night colours: a kind is told by
// its colour and its name in the key and on every card, never by colour alone.
const KIND: Record<string, {fill: string; ring: string; name: string}> = {
  person: {fill: '#314d65', ring: '#7FB7E0', name: 'Person'}, company: {fill: '#4e4234', ring: '#d4a152', name: 'Company'},
  org: {fill: '#3a5c52', ring: '#baac91', name: 'Organisation'}, vehicle: {fill: '#743a2f', ring: '#c98a5e', name: 'Vessel'},
  property: {fill: '#45271f', ring: '#bc9574', name: 'Property'}, account: {fill: '#393941', ring: '#a8a2b8', name: 'Bank account'},
  other: {fill: '#393941', ring: '#a89a7d', name: 'Other'},
};
/** The symbol (drawn by the-wire.tsx from components/network/party-icons) that shows each kind. */
export const KIND_SYMBOL: Record<string, string> = {person: 'tw-k-person', company: 'tw-k-company', org: 'tw-k-org', vehicle: 'tw-k-vehicle',
  property: 'tw-k-property', account: 'tw-k-account'};
const FAM: Record<string, {c: string; n: string}> = {
  owns: {c: '#d4a152', n: 'Owns'}, runs: {c: '#baac91', n: 'Directs or works for'}, money: {c: '#c98a5e', n: 'Paid'}, other: {c: '#927e5d', n: 'Linked, kind not yet known'},
};
// The status grammar (02_RULES.md): a shape and a word for each, never colour alone.
export const SURE: Record<LinkSure, {g: string; n: string; dash: string; rank: number}> = {
  disputed: {g: '✕', n: 'Disputed', dash: 'none', rank: 0}, unshown: {g: '?', n: 'Not yet shown', dash: '7 5', rank: 1},
  worked: {g: 'ƒ', n: 'Worked out by the app', dash: '1.5 4', rank: 2}, shown: {g: '✓', n: 'Shown', dash: 'none', rank: 3},
};
const DISPUTED = '#FF8070';
const TERR = ['#2E4D67', '#2f4f44', '#4d3d2c', '#4f3036', '#3d3858', '#3b4f5e', '#55402b', '#2d4a52', '#4a3f55', '#34503c'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A tag swatch lifted towards white, so a dark swatch still glows on the night background. */
export const brighten = (hex: string, by = 0.5): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `#${[16, 8, 0].map(sh => Math.round(((n >> sh) & 255) + (255 - ((n >> sh) & 255)) * by).toString(16).padStart(2, '0')).join('')}`;
};
export const esc = (text: unknown): string => String(text ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
export const fmtAmt = (a: number | null | undefined, c: string): string => {
  if (a == null) return '';
  const u = c || '';
  if (a >= 1e9) return `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 2).replace(/\.?0+$/, '')} bn ${u}`.trim();
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '')} m ${u}`.trim();
  // Under a million the amount is written out: rounding 9,800 to "10 k" would hide a
  // payment kept just under a reporting threshold, which is what a reporter looks for.
  return `${a.toLocaleString('en-GB', {maximumFractionDigits: 2})} ${u}`.trim();
};
export const fmtDate = (d: string): string => {
  if (!d) return 'no date';
  const [y, m, dd] = d.split('-');
  return `${dd ? `${+dd} ` : ''}${m ? `${MONTHS[+m - 1]} ` : ''}${y}`;
};
export const tval = (d: string): number | null => {
  if (!d) return null;
  const [y, m, dd] = d.split('-').map(Number);
  return y + ((m || 1) - 1) / 12 + ((dd || 1) - 1) / 365;
};
const fmtYM = (t: number): string => { const y = Math.floor(t); return `${MONTHS[Math.min(11, Math.floor((t - y) * 12))]} ${y}`; };
const monthYear = (d: string): string => { const [y, m] = d.split('-'); return m ? `${MONTHS[+m - 1]} ${y}` : y; };

/** A strand's sentence, from the fixed link verbs (research §2.2): "owns 60%", "director since 2017",
 * "paid 29,400 EUR · 3× Feb–Apr 2018", "bid for · 4 Mar 2019". It reads from the strand's first party to its second. */
/** A jurisdiction code written out ("VG" → "British Virgin Islands"); the code itself when the browser has no name. */
export const placeName = (code: string): string => {
  try { return new Intl.DisplayNames(['en'], {type: 'region'}).of(code.toUpperCase()) ?? code; } catch { return code; }
};

/** Text cut to `n` characters at a word, with an ellipsis when cut (the whole of it is on hover). */
export const clipWords = (text: string, n: number): string => {
  if (text.length <= n) return text;
  const cut = text.slice(0, n - 1), at = cut.lastIndexOf(' ');
  return `${(at > n * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:·–-]+$/, '')}…`;
};

export function linkSentence(fam: string, links: WireLinkOut[], ended: string): string {
  const l0 = links[0];
  const n = links.length;
  if (fam === 'money') {
    const sum = links.reduce((s, l) => s + (l.amount || 0), 0);
    const ds = links.map(l => l.date).filter(Boolean).sort();
    const span = !ds.length ? '' : ds[0].slice(0, 7) === ds[ds.length - 1].slice(0, 7) ? monthYear(ds[0])
      : ds[0].slice(0, 4) === ds[ds.length - 1].slice(0, 4) ? `${MONTHS[+ds[0].slice(5, 7) - 1] ?? ''}–${monthYear(ds[ds.length - 1])}`
        : `${monthYear(ds[0])}–${monthYear(ds[ds.length - 1])}`;
    const why = n === 1 && l0.role ? ` “${clipWords(l0.role, 24)}”` : '';
    return `paid ${sum ? fmtAmt(sum, l0.cur) : 'an amount not stated'}${why}${n > 1 ? ` · ${n}×` : ''}${span ? ` · ${span}` : ''}`;
  }
  const many = n > 1 ? ` · ×${n}` : '';
  const when = ended ? ` · ended ${monthYear(ended)}` : l0.date ? ` since ${l0.date.slice(0, 4)}` : '';
  if (fam === 'owns') return `${l0.pct ? `owns ${l0.pct.replace(/%$/, '')}%` : l0.role ? clipWords(l0.role, 32) : 'owns'}${when}${many}`;
  if (fam === 'runs') {
    const verb = l0.role ? clipWords(l0.role, 32) : l0.schema === 'Directorship' ? 'director' : l0.schema === 'Employment' ? 'works for' : 'member of';
    return `${verb}${when}${many}`;
  }
  return `${l0.role ? clipWords(l0.role, 32) : 'linked'}${l0.date && !ended ? ` · ${fmtDate(l0.date)}` : ended ? ` · ended ${monthYear(ended)}` : ''}${many}`;
}

export function mountWire(root: HTMLElement, data: WireOut, hooks: WireHooks, info: LinkInfo = {}, partyTags: PartyTags = {}): () => void {
  // Calm (Appearance) and the system's reduced motion both stop the camera and the nodes travelling.
  const RM = () => document.documentElement.dataset.motion === 'calm' || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const q = <T extends Element>(s: string): T => root.querySelector(s) as T;
  const el = <K extends keyof SVGElementTagNameMap>(t: K, a: Record<string, string | number> = {}, p?: Element): SVGElementTagNameMap[K] => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, String(a[k]));
    if (p) p.appendChild(e);
    return e;
  };
  // A party's kind as its icon (SEE_1: a building, a person, a house in the dot). The Lucide shapes are symbols The
  // Wire draws once (KIND_SYMBOL); a kind with no icon of its own gets none, so no icon claims more than the record says.
  const kindIcon = (kind: string, cx: number, cy: number, size: number, colour: string, parent: Element) => {
    const sym = KIND_SYMBOL[kind];
    if (!sym) return;
    el('use', {href: `#${sym}`, x: cx - size / 2, y: cy - size / 2, width: size, height: size, color: colour, class: 'kind-icon'}, parent);
  };
  const cleanups: (() => void)[] = [];
  const on = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn as EventListener, opts);
    cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };

  /* ---------- model ---------- */
  const D = data;
  const E: Record<string, WireEntityOut> = {};
  D.entities.forEach(e => { E[e.id] = e; });
  let rollAccounts = true;
  const rep = (id: string): string => (rollAccounts && E[id]?.holder ? E[id].holder! : id);
  const fscore = (f: Flags | null | undefined) => (f ? f.textbook * 4 + f.strong * 2 + f.faint : 0);
  const flagsOf = (id: string): Flags => {
    const out: Flags = {faint: 0, strong: 0, textbook: 0, items: []};
    const add = (f: Flags | null | undefined) => { if (!f) return; out.faint += f.faint; out.strong += f.strong; out.textbook += f.textbook; out.items.push(...f.items); };
    add(E[id]?.flags as Flags | null);
    if (rollAccounts) D.entities.filter(e => e.holder === id).forEach(e => add(e.flags as Flags | null));
    return out;
  };
  const nOpen = (f: Flags) => f.faint + f.strong + f.textbook;
  const sureOf = (l: WireLinkOut): LinkSure | null => info[l.id]?.sure ?? null;
  const endOf = (l: WireLinkOut): string => info[l.id]?.end ?? '';
  const bkey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  let bundles: Record<string, Bundle> = {};
  let adj: Record<string, Set<string>> = {};
  let deg: Record<string, number> = {};
  let chains: Chain[] = [];
  let chainOf: Record<string, Chain> = {};
  function build(): void {
    bundles = {}; adj = {}; deg = {};
    for (const l of D.links) {
      if (!E[l.s] || !E[l.t]) continue;
      const a = rep(l.s), b = rep(l.t);
      if (a === b) continue;
      const key = bkey(a, b);
      const B = bundles[key] || (bundles[key] = {key, a: a < b ? a : b, b: a < b ? b : a, links: [], strands: {}});
      B.links.push(l);
      // One curve per kind, direction and certainty: a shown payment and an unshown one between the same two
      // parties are two lines, each with its own style and sentence (SEE_1, Fernhill → Kestrel).
      const sure = sureOf(l);
      const sk = `${l.fam}|${l.fam === 'other' ? '' : `${a}>${b}`}|${sure ?? ''}`;
      const S = B.strands[sk] || (B.strands[sk] = {fam: l.fam, s: a, t: b, links: [], sum: 0, cur: l.cur, sure});
      S.links.push(l);
      if (l.amount) S.sum += l.amount;
      (adj[a] || (adj[a] = new Set())).add(b);
      (adj[b] || (adj[b] = new Set())).add(a);
    }
    for (const id in E) deg[id] = adj[id] ? adj[id].size : 0;
    // Shell chains: companies with exactly two neighbours, linked to both by ownership only.
    chains = []; chainOf = {};
    const mid = (id: string) => E[id].kind === 'company' && !E[id].holder && deg[id] === 2
      && [...adj[id]].every(n => bundles[bkey(id, n)].links.every(l => l.fam === 'owns'));
    const seen = new Set<string>();
    for (const id in E) {
      if (seen.has(id) || !mid(id)) continue;
      const run = [id]; seen.add(id);
      for (const dir of [0, 1]) {
        let cur = id, prev: string | null = null;
        for (;;) {
          const nx = [...adj[cur]].filter(n => n !== prev && !run.includes(n));
          const n = nx[dir === 0 ? 0 : nx.length - 1];
          if (!n || !mid(n) || seen.has(n)) break;
          seen.add(n);
          if (dir) run.push(n); else run.unshift(n);
          prev = cur; cur = n;
        }
      }
      const ends = [...new Set(run.flatMap(r => [...adj[r]]).filter(n => !run.includes(n)))];
      const c: Chain = {id: `chain${chains.length}`, mids: run, ends, open: false};
      chains.push(c);
      run.forEach(r => { chainOf[r] = c; });
    }
  }
  build();

  /* territories: the server's groups; unlinked parties in their own row */
  type Terr = {id: string; members: string[]; name: string; tint: string; flags: number};
  const terr: Record<string, Terr> = {};
  for (const e of D.entities) {
    if (e.holder) continue;
    const t = deg[e.id] === 0 || e.c < 0 ? 'loose' : String(e.c);
    (terr[t] || (terr[t] = {id: t, members: [], name: '', tint: '', flags: 0})).members.push(e.id);
  }
  Object.values(terr).forEach((t, i) => {
    if (t.id === 'loose') { t.name = 'Not linked to anyone yet'; t.tint = '#33404c'; } else {
      const top = t.members.slice().sort((a, b) => deg[b] - deg[a])[0];
      t.name = `Around ${E[top].short}`; t.tint = TERR[i % TERR.length];
    }
    t.flags = t.members.reduce((s, m) => s + nOpen(flagsOf(m)), 0);
  });
  const mostFlagged = D.entities.filter(e => !e.holder).map(e => [fscore(flagsOf(e.id)), deg[e.id], e.id] as const)
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]).map(x => x[2]);

  /* arrangements of the whole case (SEE_1): Linked groups is the server's map; the others are laid out here */
  type Arrange = 'groups' | 'control' | 'kind' | 'grid';
  type XY = {x: number; y: number};
  type Band = {x: number; top: number; name: string; sub: string};
  const parties = () => D.entities.filter(e => !(rollAccounts && e.holder && E[e.holder]));
  const byName = (a: string, b: string) => E[a].short.localeCompare(E[b].short);
  // Who controls whom: owners and directors above what they own or run, a band per step down; a loop of control
  // stops at the sixth step. Parties in no chain of control sit in the last band.
  function controlLayout(): {pos: Record<string, XY>; bands: Band[]; depth: number} {
    const ids = parties().map(e => e.id), set = new Set(ids);
    const down: Record<string, Set<string>> = {}, up: Record<string, Set<string>> = {};
    for (const l of D.links) {
      if (l.fam !== 'owns' && l.fam !== 'runs') continue;
      const a = rep(l.s), b = rep(l.t);
      if (a === b || !set.has(a) || !set.has(b)) continue;
      (down[a] || (down[a] = new Set())).add(b);
      (up[b] || (up[b] = new Set())).add(a);
    }
    const inChain = ids.filter(id => down[id] || up[id]);
    const d: Record<string, number> = {};
    inChain.forEach(id => { d[id] = 0; });
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const a of inChain) for (const b of down[a] || []) if (d[b] < Math.min(6, d[a] + 1)) { d[b] = Math.min(6, d[a] + 1); moved = true; }
      if (!moved) break;
    }
    const depth = inChain.length ? Math.max(...inChain.map(id => d[id])) : -1;
    const pos: Record<string, XY> = {}, bands: Band[] = [];
    let y = 160;
    // Wide and shallow, so a few bands still fill the screen: parties 340 apart, bands 230 apart; the band's name
    // stands to the right of the widest row (set once every band is placed).
    const row = (members: string[], name: string) => {
      if (!members.length) return;
      const per = 8, gap = 340;
      members.forEach((id, i) => {
        const r = Math.floor(i / per), inRow = Math.min(per, members.length - r * per), col = i % per;
        pos[id] = {x: 1200 + (col - (inRow - 1) / 2) * gap, y: y + r * 140};
      });
      bands.push({x: 0, top: y, name, sub: `${members.length} ${members.length === 1 ? 'PARTY' : 'PARTIES'}`});
      y += Math.ceil(members.length / per) * 140 + 90;
    };
    for (let k = 0; k <= depth; k++) {
      // Each party sits under the average place of the ones above it, so lines cross less.
      const above = (id: string) => { const ps = [...(up[id] || [])].filter(p => pos[p]); return ps.length ? ps.reduce((sum, p) => sum + pos[p].x, 0) / ps.length : 1200; };
      const members = inChain.filter(id => d[id] === k).sort((a, b) => above(a) - above(b) || byName(a, b));
      row(members, k === 0 ? 'Top of the chain' : `${k} step${k === 1 ? '' : 's'} down`);
    }
    row(ids.filter(id => !(id in d)).sort(byName), 'In no chain of control');
    const right = Math.max(1200, ...Object.values(pos).map(p => p.x)) + 300;
    bands.forEach(b => { b.x = right; });
    return {pos, bands, depth};
  }
  // By kind: a column per kind, the most linked at the top.
  function kindLayout(): {pos: Record<string, XY>; bands: Band[]} {
    const cols: Record<string, string[]> = {};
    for (const e of parties()) (cols[e.kind] || (cols[e.kind] = [])).push(e.id);
    const pos: Record<string, XY> = {}, bands: Band[] = [];
    let x = 260;
    for (const [kind, ids] of Object.entries(cols).sort((a, b) => b[1].length - a[1].length)) {
      ids.sort((a, b) => deg[b] - deg[a] || byName(a, b));
      const per = 10, sub = Math.ceil(ids.length / per);
      const stagger = (bands.length % 2) * 60;
      ids.forEach((id, i) => { pos[id] = {x: x + Math.floor(i / per) * 220, y: 200 + stagger + (i % per) * 130}; });
      bands.push({x: x + (sub - 1) * 110, top: 200, name: (KIND[kind] ?? KIND.other).name, sub: `${ids.length} ${ids.length === 1 ? 'PARTY' : 'PARTIES'}`});
      x += sub * 220 + 140;
    }
    return {pos, bands};
  }
  // Grid: every party in name order.
  function gridLayout(): {pos: Record<string, XY>; bands: Band[]} {
    const ids = parties().map(e => e.id).sort(byName), cols = Math.max(1, Math.ceil(Math.sqrt(ids.length * 1.6)));
    const pos: Record<string, XY> = {};
    ids.forEach((id, i) => { pos[id] = {x: 260 + (i % cols) * 230, y: 200 + Math.floor(i / cols) * 140}; });
    return {pos, bands: []};
  }
  const nControl = D.links.filter(l => l.fam === 'owns' || l.fam === 'runs').length;
  // The first arrangement: control when more than half the links are ownership or directorship and a chain shows.
  let arrange: Arrange = nControl * 2 > D.links.length && controlLayout().depth >= 1 ? 'control' : 'groups';
  let arrangeChosen = true;
  let layout: {pos: Record<string, XY>; bands: Band[]} | null = null;
  const relayout = () => { layout = arrange === 'control' ? controlLayout() : arrange === 'kind' ? kindLayout() : arrange === 'grid' ? gridLayout() : null; };
  relayout();
  /** Where a party sits in the whole-case view, in the arrangement shown. */
  const at = (id: string): XY => layout?.pos[id] ?? {x: E[id].x, y: E[id].y};

  /* time span: from the case's own dates */
  const allT = [...D.links.map(l => tval(l.date)), ...D.events.map(e => tval(e.date))].filter((t): t is number => t != null);
  const T0 = allT.length ? Math.floor(Math.min(...allT)) : new Date().getFullYear() - 5;
  const T1 = allT.length ? Math.max(T0 + 1, Math.max(...allT) + 0.2) : new Date().getFullYear() + 0.2;

  /* ---------- view state ---------- */
  const svg = q<SVGSVGElement>('.tw-map'), cam = q<SVGGElement>('.tw-cam');
  let W = root.clientWidth || 1200, H = root.clientHeight || 800;
  const C = {x: 1200, y: 800, k: 0.5};
  let Cto: {x: number; y: number; k: number; from: {x: number; y: number; k: number}} | null = null;
  let mode: Mode = 'case', focus = mostFlagged[0] ?? '', wireKey = '', pathIds: string[] = [];
  const expanded = new Set<string>();
  let trail: string[] = [];
  const range = [T0, T1];
  const lens = {on: false, x: 0, y: 0, R: 150};
  const node: Record<string, NodeEl> = {};
  let tw: {t0: number; dur: number} | null = null;
  let raf = 0;
  const local = (ev: {clientX: number; clientY: number}) => { const r = root.getBoundingClientRect(); return {x: ev.clientX - r.left, y: ev.clientY - r.top}; };

  /* node elements */
  function mkNode(id: string, isChain: boolean): NodeEl {
    const g = el('g', {class: 'node'}, q('.tw-nodes'));
    const K = isChain ? KIND.company : KIND[E[id].kind] ?? KIND.other;
    const halo = el('circle', {r: 26, fill: 'none', stroke: '#FF8070', 'stroke-width': 2, class: 'halo', style: 'display:none'}, g);
    const dust = el('circle', {r: 2.4, fill: K.ring, opacity: 0.5}, g);
    const dot = el('g', {}, g);
    if (isChain) {
      for (let i = 2; i >= 0; i--) el('rect', {x: -58 + i * 5, y: -17 - i * 5, width: 116, height: 34, rx: 7, fill: K.fill, stroke: K.ring, 'stroke-width': 1.2, opacity: 1 - i * 0.22}, dot);
      el('text', {class: 'card-s', x: 0, y: 4, 'text-anchor': 'middle'}, dot);
    } else {
      const r = 4 + Math.sqrt(deg[id] || 0) * 2.6;
      el('circle', {r, fill: K.fill, stroke: K.ring, 'stroke-width': 1.6, class: 'ring'}, dot);
      // The kind as its icon (SEE_1), where the dot is big enough to hold one.
      if (r >= 8.5) kindIcon(E[id].kind, 0, 0, r * 1.15, K.ring, dot);
    }
    const lbl = el('text', {class: 'lbl', 'text-anchor': 'middle'}, g);
    const card = el('g', {}, g);
    // A tagged party's card is wider on the left, so its tag ring clears the card's edge and its name.
    const own = isChain ? [] : partyTags[id] ?? [];
    const pad = own.length ? 14 : 0, dx = -70 - pad / 2, tx = -52 + pad / 3;
    // A flagged card's outline takes its level's colour over a glow (paintFlag); the glow sits behind the card.
    // The glow is light from the outline (the grid's lamp colour): a wide soft spread and a tight bright core, added to
    // what is behind them as light is.
    el('rect', {x: -90 - pad, y: -27, width: 180 + pad, height: 54, rx: 11, class: 'flag-glow wide', fill: 'none', filter: 'url(#tw-flagglow)', style: 'display:none'}, card);
    el('rect', {x: -90 - pad, y: -27, width: 180 + pad, height: 54, rx: 11, class: 'flag-glow core', fill: 'none', filter: 'url(#tw-flagglow-core)', style: 'display:none'}, card);
    el('rect', {x: -90 - pad, y: -27, width: 180 + pad, height: 54, rx: 11, class: 'card-bg', stroke: K.ring, 'stroke-width': 1.4, 'data-ring': K.ring}, card);
    el('circle', {cx: dx, cy: 0, r: 11, fill: K.fill, stroke: K.ring, 'stroke-width': 1.5, class: 'kind-dot'}, card);
    if (!isChain) kindIcon(E[id].kind, dx, 0, 13, K.ring, card);
    el('text', {class: 'card-t', x: tx, y: -4}, card);
    el('text', {class: 'card-s', x: tx, y: 14}, card);
    const beads = el('g', {}, card);
    const flag = el('g', {transform: 'translate(91,-28)', class: 'flag-dot'}, card); // the count's circle, on the card's top right corner
    on<PointerEvent>(flag, 'pointerenter', ev => { if (ev.pointerType === 'touch') return; g.classList.add('flag-hot'); showFlagTip(ev, id); });
    on(flag, 'pointerleave', () => { g.classList.remove('flag-hot'); hideTip(); });
    g.appendChild(halo); // over the card, so its ring round the kind dot shows
    // Your tags: one arc per tag, sharing a ring outside the flag ring (shown while the Your tags layer is on). Each arc
    // is its swatch brightened, over a blurred copy that breathes, so the ring reads as giving off light.
    let tags: SVGGElement | null = null;
    if (own.length) {
      tags = el('g', {class: 'tw-tagring'}, g);
      const seg = 100 / own.length, gap = own.length > 1 ? 5 : 0;
      const arc = (layer: SVGGElement, colour: string, i: number, width: number) => el('circle', {fill: 'none', stroke: colour, 'stroke-width': width,
        'stroke-linecap': own.length > 1 ? 'round' : 'butt', pathLength: 100, 'stroke-dasharray': `${Math.max(seg - gap, 1)} ${100 - seg + gap}`,
        'stroke-dashoffset': -i * seg, transform: 'rotate(-90)'}, layer);
      const glow = el('g', {class: 'glow', filter: 'url(#tw-tagglow)'}, tags);
      const sharp = el('g', {class: 'sharp'}, tags);
      own.forEach((t, i) => { const c = brighten(t.colour); arc(glow, c, i, 7); arc(sharp, c, i, 2.8); });
    }
    const N: NodeEl = {id, g, halo, tags, dx, hw: 90 + pad / 2, hh: 27, dust, dot, lbl, card, beads, flag, isChain, cur: {x: 0, y: 0, o: 0, v: 0}, tgt: {x: 0, y: 0, o: 0, v: 0}, from: null};
    on<MouseEvent>(g, 'click', ev => { ev.stopPropagation(); onNodeClick(id); });
    on<PointerEvent>(g, 'pointerenter', ev => { if (ev.pointerType !== 'touch') showTip(ev, id); });
    on(g, 'pointerleave', hideTip);
    node[id] = N;
    return N;
  }
  const wrapWords = (t: string, n: number) => {
    const L = [''];
    for (const x of t.split(' ')) { if (`${L[L.length - 1]} ${x}`.trim().length > n && L[L.length - 1]) L.push(x); else L[L.length - 1] = `${L[L.length - 1]} ${x}`.trim(); }
    return L;
  };
  function paintCard(N: NodeEl): void {
    const e = E[N.id];
    if (!e) return;
    const t = N.card.querySelector('.card-t')!;
    t.textContent = '';
    const all = wrapWords(e.short, 22), L = all.slice(0, 2);
    if (all.length > 2) L[1] = `${L[1].slice(0, 21)}…`;
    // The card is as wide as its name (no empty run after it) and one line tall for a one-line name. The kind is the
    // icon in the dot; the jurisdiction is on hover (showTip), where it is written out in full.
    const spans = L.map((line, i) => { const ts = el('tspan', {dy: i ? 14 : (L.length > 1 ? -7 : 0)}, t); ts.textContent = line; return ts; });
    let textW = 0;
    spans.forEach((ts, i) => { let w = L[i].length * 7.2; try { w = ts.getComputedTextLength() || w; } catch { /* not laid out (tests) */ } textW = Math.max(textW, w); });
    const pad = N.tags ? 14 : 0, textOff = 38 + pad * 4 / 3;
    const W = Math.min(250, Math.max(112, textOff + textW + 16)), hw = W / 2, hh = L.length > 1 ? 25 : pad ? 23 : 19;
    const dx = -hw + 20 + pad / 2, tx = -hw + textOff;
    N.dx = dx; N.hw = hw; N.hh = hh;
    t.setAttribute('x', String(tx)); t.setAttribute('y', '4');
    spans.forEach(ts => ts.setAttribute('x', String(tx)));
    for (const r of Array.from(N.card.querySelectorAll<SVGRectElement>('.card-bg, .flag-glow'))) {
      r.setAttribute('x', String(-hw)); r.setAttribute('y', String(-hh)); r.setAttribute('width', String(W)); r.setAttribute('height', String(hh * 2));
    }
    N.card.querySelector('.kind-dot')?.setAttribute('cx', String(dx));
    N.card.querySelector('.kind-icon')?.setAttribute('x', String(dx - 6.5));
    N.card.querySelector('.card-s')!.textContent = '';
    N.flag.setAttribute('transform', `translate(${hw + 1},${-hh - 1})`);
    const accts = rollAccounts ? D.entities.filter(a => a.holder === N.id) : [];
    N.beads.textContent = '';
    accts.forEach((_, i) => { el('circle', {cx: -hw + 12 + i * 13, cy: hh + 6, r: 4.5, fill: KIND.account.fill, stroke: KIND.account.ring, 'stroke-width': 1.3}, N.beads); });
    if (accts.length) { const ax = el('text', {class: 'card-s', x: -hw + 12 + accts.length * 13, y: hh + 9.5}, N.beads); ax.textContent = `${accts.length} ${accts.length > 1 ? 'ACCOUNTS' : 'ACCOUNT'}`; }
    paintFlag(N, flagsOf(N.id));
  }
  const LEVEL_C: Record<string, string> = {textbook: '#FF8070', strong: '#F6966A', faint: '#E9AFA8'};
  function paintFlag(N: NodeEl, f: Flags): void {
    const g = N.flag, bg = N.card.querySelector<SVGRectElement>('.card-bg')!, glows = Array.from(N.card.querySelectorAll<SVGRectElement>('.flag-glow'));
    g.textContent = '';
    const n = nOpen(f);
    if (!n) {
      bg.setAttribute('stroke', bg.dataset.ring ?? ''); bg.setAttribute('stroke-width', '1.4'); bg.removeAttribute('stroke-dasharray');
      glows.forEach(gl => { gl.style.display = 'none'; }); N.g.classList.remove('flagged', 'faint', 'strong', 'textbook');
      return;
    }
    const lvl = f.textbook ? 'textbook' : f.strong ? 'strong' : 'faint', c = LEVEL_C[lvl];
    // The outline is the level: its colour, dashed when faint so the level never rests on colour alone. The light
    // round it is the grid's pale blue, stronger by level and brighter on hover.
    bg.setAttribute('stroke', c); bg.setAttribute('stroke-width', '1.8');
    if (lvl === 'faint') bg.setAttribute('stroke-dasharray', '5 3'); else bg.removeAttribute('stroke-dasharray');
    glows.forEach(gl => { gl.style.display = ''; });
    N.g.classList.remove('faint', 'strong', 'textbook'); N.g.classList.add('flagged', lvl);
    // The count in a small circle on the top right corner; hover it for the flags themselves.
    el('circle', {r: 15, class: 'flag-hit', fill: 'transparent'}, g);
    el('circle', {r: 10.5, class: 'flag-disc', fill: lvl === 'textbook' ? '#8E2420' : '#1b2633', stroke: c, 'stroke-width': 1.6}, g);
    const t = el('text', {y: 4, 'text-anchor': 'middle', class: 'flag-n', fill: lvl === 'textbook' ? '#ffe9e4' : c}, g);
    t.textContent = String(n);
    g.setAttribute('aria-label', `${n} open Red Flag${n > 1 ? 's' : ''}, the strongest ${lvl}`);
  }
  function showFlagTip(ev: PointerEvent, id: string): void {
    const f = flagsOf(id), n = nOpen(f);
    if (!n) return;
    const counts = (['textbook', 'strong', 'faint'] as const).filter(k => f[k]).map(k => `${f[k]} ${k}`).join(' · ');
    let h = `<b>${n} open Red Flag${n > 1 ? 's' : ''}</b><span class="m">${counts}</span>`;
    const rank: Record<string, number> = {textbook: 0, strong: 1, faint: 2};
    const items = [...f.items].sort((x, y) => (rank[x.level] ?? 3) - (rank[y.level] ?? 3));
    for (const it of items.slice(0, 4)) h += `<span class="tip-flag"><i class="${esc(it.level)}">${esc(it.level)}</i>${esc(it.text)}</span>`;
    if (f.items.length > 4) h += `<span class="m">and ${f.items.length - 4} more</span>`;
    h += '<span class="m">An indicator, not a finding. Click the card to open them.</span>';
    tip.innerHTML = h;
    placeTip(ev);
    tip.classList.add('on');
  }

  /* ---------- layouts ---------- */
  const chainPos = (c: Chain) => { let x = 0, y = 0; c.mids.forEach(m => { const p = at(m); x += p.x; y += p.y; }); return {x: x / c.mids.length, y: y / c.mids.length}; };
  function caseTargets(): Record<string, Target> {
    const T: Record<string, Target> = {};
    for (const e of D.entities) {
      if (rollAccounts && e.holder && E[e.holder]) { const p = at(e.holder); T[e.id] = {x: p.x, y: p.y, o: 0, v: 0}; continue; }
      const c = chainOf[e.id];
      if (c && !c.open) { const p = chainPos(c); T[e.id] = {x: p.x, y: p.y, o: 0, v: 0}; continue; }
      const p = at(e.id);
      T[e.id] = {x: p.x, y: p.y, o: 1, v: 1};
    }
    chains.forEach(c => { const p = chainPos(c); T[c.id] = {x: p.x, y: p.y, o: c.open ? 0 : 1, v: 1}; });
    return T;
  }

  type PartyInfo = {f: string; cx: number; cy: number; R1: number; RX: number; secLabels: {k: string; a: number; n: string; c: number}[]; more: {p: string; n: number; x: number; y: number}[]};
  let partyInfo: PartyInfo | null = null;
  let moreEls: {p: string; w: number; g: SVGGElement; lead: SVGPathElement}[] = [];
  function partyTargets(f: string): Record<string, Target> {
    const T: Record<string, Target> = {};
    const cx = E[f].x, cy = E[f].y;
    const ring1 = [...(adj[f] || [])];
    const sect: Record<string, string> = {};
    const SEC: Record<string, {a: number; n: string}> = {N: {a: -90, n: 'Money in'}, NE: {a: -38, n: 'Money both ways'}, E: {a: 0, n: 'What it owns or runs'},
      S: {a: 90, n: 'Money out'}, SW: {a: 140, n: 'Other links'}, W: {a: 180, n: 'Owners and directors'}};
    for (const n of ring1) {
      let ci = 0, co = 0, mi = 0, mo = 0;
      for (const l of bundles[bkey(f, n)].links) {
        const t = rep(l.t);
        if (l.fam === 'owns' || l.fam === 'runs') { if (t === f) ci++; else co++; } else if (l.fam === 'money') { if (t === f) mi++; else mo++; }
      }
      sect[n] = ci ? 'W' : co ? 'E' : (mi && mo) ? 'NE' : mi ? 'N' : mo ? 'S' : 'SW';
    }
    const groups = ['N', 'NE', 'E', 'S', 'SW', 'W'].map(k => ({k, ids: ring1.filter(n => sect[n] === k)
      .sort((a, b) => fscore(flagsOf(b)) - fscore(flagsOf(a)) || deg[b] - deg[a])})).filter(g => g.ids.length);
    const ang: Record<string, number> = {};
    const secLabels: PartyInfo['secLabels'] = [];
    if (groups.length) {
      const total = groups.reduce((s, g) => s + g.ids.length + 0.8, 0);
      let start = SEC[groups[0].k].a - (groups[0].ids.length + 0.8) / total * 180;
      for (const g of groups) {
        const span = (g.ids.length + 0.8) / total * 360;
        g.ids.forEach((n, i) => { ang[n] = start + span * (i + 0.9) / (g.ids.length + 0.8); });
        secLabels.push({k: g.k, a: start + span / 2, n: SEC[g.k].n, c: g.ids.length});
        start += span;
      }
    }
    const R1 = Math.max(255, ring1.length * 215 / (2 * Math.PI)), RX = 1.55;
    ring1.forEach((n, i) => {
      const a = ang[n] * Math.PI / 180, st = ring1.length > 11 && i % 2 ? 1.22 : 1;
      T[n] = {x: cx + Math.cos(a) * R1 * RX * st, y: cy + Math.sin(a) * R1 * st, o: 1, v: 2, a: ang[n]};
    });
    T[f] = {x: cx, y: cy, o: 1, v: 2, a: 0};
    // Ring 2 by degree of interest: flags count three times a link.
    const doi = (m: string) => fscore(flagsOf(m)) * 3 + deg[m] + (E[m].kind === 'person' ? 1 : 0);
    const more: {p: string; n: number}[] = [];
    const cand: {m: string; p: string; s: number}[] = [];
    for (const n of ring1) {
      const kids = [...adj[n]].filter(m => m !== f && !ring1.includes(m)).sort((a, b) => doi(b) - doi(a));
      const cap = expanded.has(n) ? 99 : 2;
      kids.forEach((m, i) => { if (i < cap) cand.push({m, p: n, s: doi(m)}); });
      if (kids.length > cap) more.push({p: n, n: kids.length - cap});
    }
    const placed: Record<string, string> = {};
    let budget = 46 - ring1.length;
    cand.sort((a, b) => b.s - a.s).forEach(c => {
      if (placed[c.m] || budget <= 0) {
        if (!placed[c.m]) { const x = more.find(y => y.p === c.p); if (x) x.n++; else more.push({p: c.p, n: 1}); }
        return;
      }
      placed[c.m] = c.p; budget--;
    });
    const byParent: Record<string, string[]> = {};
    for (const m in placed) (byParent[placed[m]] || (byParent[placed[m]] = [])).push(m);
    const R2 = R1 * 1.62;
    for (const p in byParent) {
      const ks = byParent[p], a0 = T[p].a ?? 0;
      ks.forEach((m, i) => {
        const a = (a0 + (i - (ks.length - 1) / 2) * (ks.length > 4 ? 6 : 9)) * Math.PI / 180, rr = R2 + (i % 2) * 46;
        T[m] = {x: cx + Math.cos(a) * rr * RX, y: cy + Math.sin(a) * rr, o: 1, v: 1};
      });
    }
    for (const e of D.entities) if (!T[e.id]) T[e.id] = {x: e.x, y: e.y, o: rollAccounts && e.holder ? 0 : 1, v: 0};
    chains.forEach(c => { const p = chainPos(c); T[c.id] = {x: p.x, y: p.y, o: 0, v: 0}; });
    partyInfo = {f, cx, cy, R1, RX, secLabels, more: more.map(m => {
      const a = (T[m.p].a ?? 0) * Math.PI / 180;
      return {...m, x: T[m.p].x + Math.cos(a) * 150, y: T[m.p].y + Math.sin(a) * 58};
    })};
    return T;
  }
  function pathTargets(ids: string[]): Record<string, Target> {
    const T: Record<string, Target> = {};
    const gap = Math.min(250, 2400 / ids.length);
    ids.forEach((id, i) => { T[id] = {x: C.x + (i - (ids.length - 1) / 2) * gap, y: C.y + (i % 2 ? 60 : -60), o: 1, v: 2}; });
    for (const e of D.entities) if (!T[e.id]) T[e.id] = {x: e.x, y: e.y, o: rollAccounts && e.holder ? 0 : 1, v: 0};
    chains.forEach(c => { const p = chainPos(c); T[c.id] = {x: p.x, y: p.y, o: 0, v: 0}; });
    return T;
  }

  /* ---------- mode changes ---------- */
  function go(m: Mode, opts: {id?: string; noTrail?: boolean; slow?: boolean} = {}): void {
    if (!focus && m !== 'case') return;
    if (m !== 'wire' && mode === 'wire') hooks.openLink?.(null);
    mode = m;
    if (m === 'party') {
      focus = opts.id || focus;
      if (!opts.noTrail) { trail = trail.filter(t => t !== focus); trail.push(focus); if (trail.length > 7) trail.shift(); }
    }
    const T = m === 'case' ? caseTargets() : m === 'path' ? pathTargets(pathIds) : partyTargets(focus);
    for (const id in T) { const N = node[id]; if (!N) continue; N.from = {...N.cur}; N.tgt = T[id]; }
    tw = {t0: performance.now(), dur: RM() ? 1 : opts.slow ? 1500 : 950};
    let to: {x: number; y: number; k: number};
    if (m === 'case') to = fitBox(Object.values(T).filter(t => t.o), 120);
    else if (m === 'party') to = fitBox(Object.values(T).filter(t => t.v > 0), 40, 1.1);
    else if (m === 'path') to = fitBox(Object.values(T).filter(t => t.v > 0), 60, 1.25);
    else { const [a, b] = wireKey.split('|'); to = {x: (T[a].x + T[b].x) / 2, y: (T[a].y + T[b].y) / 2, k: Math.min(3.2, C.k * 2.2)}; }
    Cto = {...to, from: {...C}};
    if (m !== 'wire') { q('.tw-wire').classList.remove('on'); svg.style.opacity = '1'; }
    litLink = null;
    drawStatic(); renderChrome(); kick();
  }
  function fitBox(pts: Target[], pad: number, maxK = 1.6): {x: number; y: number; k: number} {
    if (!pts.length) return {x: 1200, y: 800, k: 0.5};
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const L = W > 900 ? 240 : 20, R = W > 900 ? 140 : 20, Tp = W > 900 ? 150 : 120, B = 130;
    const k = Math.max(0.15, Math.min(maxK, (W - L - R) / (x1 - x0 + 2 * pad + 180), (H - Tp - B) / (y1 - y0 + 2 * pad + 60)));
    return {x: (x0 + x1) / 2 - ((L - R) / 2) / k, y: (y0 + y1) / 2 - ((Tp - B) / 2) / k, k};
  }

  /* ---------- frame ---------- */
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function frame(now: number): void {
    raf = 0;
    let busy = false;
    if (tw) {
      const p = Math.min(1, (now - tw.t0) / tw.dur), e = ease(p);
      for (const id in node) {
        const N = node[id];
        if (!N.from) continue;
        N.cur.x = N.from.x + (N.tgt.x - N.from.x) * e; N.cur.y = N.from.y + (N.tgt.y - N.from.y) * e; N.cur.o = N.from.o + (N.tgt.o - N.from.o) * e; N.cur.v = N.tgt.v;
      }
      if (Cto) { C.x = Cto.from.x + (Cto.x - Cto.from.x) * e; C.y = Cto.from.y + (Cto.y - Cto.from.y) * e; C.k = Cto.from.k * Math.pow(Cto.k / Cto.from.k, e); }
      if (p < 1) busy = true; else { tw = null; Cto = null; for (const id in node) node[id].from = null; }
    }
    render();
    if (busy) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const toScreen = (x: number, y: number) => ({x: (x - C.x) * C.k + W / 2, y: (y - C.y) * C.k + H / 2});
  const toWorld = (x: number, y: number) => ({x: (x - W / 2) / C.k + C.x, y: (y - H / 2) / C.k + C.y});
  function disp(N: NodeEl): Pt {
    const {x, y} = N.cur;
    if (lens.on && mode === 'case') {
      const s = toScreen(x, y), dx = s.x - lens.x, dy = s.y - lens.y, d = Math.hypot(dx, dy);
      if (d < lens.R && d > 0) {
        const m = 2.2, r = d / lens.R, nd = lens.R * (1 + m) * r / (1 + m * r);
        const w = toWorld(lens.x + dx / d * nd, lens.y + dy / d * nd);
        return {x: w.x, y: w.y, in: true, d};
      }
    }
    return {x, y, in: false};
  }
  const endedBy = (links: WireLinkOut[], t: number): string => {
    const ends = links.map(endOf);
    if (!ends.every(e => e && (tval(e) ?? Infinity) < t)) return '';
    return ends.sort()[ends.length - 1];
  };
  const inRange = (l: WireLinkOut) => { const t = tval(l.date); return t == null || (t >= range[0] - 0.001 && t <= range[1] + 0.001); };

  let edgeEls: Record<string, EdgeEl> = {};
  let rtEls: {k: string; g: SVGGElement; o: string}[] = [];
  let terrEls: {g: SVGGElement; a: SVGTextElement; b: SVGTextElement; x: number; top: number; big: boolean; n: number}[] = [];
  let terrBoxes: Box[] = [], cardBoxes: Box[] = [], secBoxes: Box[] = [];
  let secEls: {t: SVGTextElement; a: number; r: number; rx: number; cx: number; cy: number}[] = [];
  let hopEls: {k: string; g: SVGGElement}[] = [];
  const overlap = (b: Box, list: Box[]) => list.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);

  // The grid is far behind the map: it follows the camera at a sixth of its travel, and its cells grow with the zoom,
  // so zoomed in the grid is close, large and soft, zoomed all the way out it is small, sharp and far.
  const gridEl = root.querySelector<HTMLElement>('.tw-grid');
  let gridKey = '';
  function moveGrid(): void {
    if (!gridEl) return;
    // 24 px cells all the way out (15%), about 65 px at 63%, 75 px at 100%, 240 px at 400%; past about 50% the grid is
    // close enough to the lens to fall slightly out of focus.
    const still = RM(), gs = still ? 48 : 24 * Math.pow(C.k / 0.15, 0.7), blur = still ? 0 : Math.min(2.4, Math.max(0, (C.k - 0.5) * 1.1));
    const off = (v: number) => (still ? 0 : ((v % gs) + gs) % gs);
    const key = `${off(-C.x * C.k / 6).toFixed(1)}|${off(-C.y * C.k / 6).toFixed(1)}|${gs.toFixed(2)}|${blur.toFixed(2)}`;
    if (key === gridKey) return;
    gridKey = key;
    const [gx, gy, , bl] = key.split('|');
    gridEl.style.setProperty('--gx', `${gx}px`); gridEl.style.setProperty('--gy', `${gy}px`); gridEl.style.setProperty('--gs', `${gs.toFixed(2)}px`);
    gridEl.style.filter = Number(bl) > 0.05 ? `blur(${bl}px)` : '';
  }

  function render(): void {
    cam.setAttribute('transform', `translate(${W / 2},${H / 2}) scale(${C.k}) translate(${-C.x},${-C.y})`);
    moveGrid();
    const P: Record<string, Pt> = {};
    const cands: {id: string; N: NodeEl; d: Pt; pri: number}[] = [];
    // Cards keep a readable size on screen (about 170 px wide) whatever the zoom.
    const cs = Math.min(2.6, Math.max(1, 0.95 / C.k));
    for (const id in node) {
      const N = node[id], d = disp(N);
      P[id] = d;
      const o = N.cur.o, v = N.cur.v;
      N.g.setAttribute('transform', `translate(${d.x},${d.y})`);
      N.g.style.opacity = String(o);
      N.g.style.display = o < 0.02 ? 'none' : '';
      N.dust.style.display = v === 0 ? '' : 'none';
      N.dot.style.display = v === 1 || (v === 2 && N.isChain) ? '' : 'none';
      N.card.style.display = v === 2 && !N.isChain ? '' : 'none';
      if (v === 2) N.card.setAttribute('transform', `scale(${cs})`);
      N.g.style.pointerEvents = v === 0 ? 'none' : '';
      if (N.isChain) continue;
      const fl = flagsOf(id);
      // The ring: any open Red Flag, its edge by level (textbook pulses, strong solid, faint dashed).
      const lvl = fl.textbook ? 'textbook' : fl.strong ? 'strong' : fl.faint ? 'faint' : '';
      N.halo.style.display = v === 1 && lvl ? '' : 'none'; // a card shows its level in its outline
      if (lvl && N.halo.dataset.level !== lvl) {
        N.halo.dataset.level = lvl;
        N.halo.setAttribute('class', `halo ${lvl}`);
        N.halo.setAttribute('stroke', lvl === 'textbook' ? '#FF8070' : lvl === 'strong' ? '#F6966A' : '#E9AFA8');
        N.halo.setAttribute('stroke-dasharray', lvl === 'faint' ? '3 3' : 'none');
      }
      // On a card the ring sits round the card's kind dot; on a dot, round the dot.
      N.halo.setAttribute('r', String(v === 2 && !N.isChain ? 14 * cs : 4 + Math.sqrt(deg[id] || 0) * 2.6 + 5));
      N.halo.setAttribute('cx', String(v === 2 && !N.isChain ? N.dx * cs : 0));
      if (N.tags) {
        N.tags.style.display = v > 0 ? '' : 'none';
        const r = v === 2 ? 18.5 * cs : 4 + Math.sqrt(deg[id] || 0) * 2.6 + 9;
        N.tags.setAttribute('transform', v === 2 ? `translate(${N.dx * cs},0)` : '');
        for (const c of Array.from(N.tags.querySelectorAll('circle'))) c.setAttribute('r', String(r));
      }
      N.lbl.style.display = 'none';
      if (v === 1 && !(lens.on && mode === 'case' && d.in)) cands.push({id, N, d, pri: fscore(fl) * 10 + deg[id] + (mode === 'case' ? 0 : 100)});
    }
    const stubbed: EdgeEl[] = [];
    const longPx = Math.hypot(W, H) * 0.4;
    for (const k in edgeEls) {
      const R = edgeEls[k], a = P[R.S.s], b = P[R.S.t], na = node[R.S.s], nb = node[R.S.t];
      const vis = Boolean(na && nb && a && b) && na.cur.v > 0 && nb.cur.v > 0 && na.cur.o > 0.02 && nb.cur.o > 0.02 && R.want;
      R.g.style.display = vis ? '' : 'none';
      if (R.stub) R.stub.on = false;
      if (!vis) { if (R.stub) { R.stub.a.style.display = 'none'; R.stub.b.style.display = 'none'; } continue; }
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, bend = R.bend * Math.min(80, len * 0.16);
      const mx = (a.x + b.x) / 2 - dy / len * bend, my = (a.y + b.y) / 2 + dx / len * bend;
      let dd = `M${a.x},${a.y}Q${mx},${my} ${b.x},${b.y}`;
      // A link across most of the view is drawn as its two ends with one letter each (SEE_1), unless it is lit.
      const sa = toScreen(a.x, a.y), sb = toScreen(b.x, b.y);
      if (R.stub && longPx > 0 && Math.hypot(sb.x - sa.x, sb.y - sa.y) > longPx && !R.g.classList.contains('lit')) {
        const t = Math.min(0.2, 46 / Math.hypot(sb.x - sa.x, sb.y - sa.y)), u = 1 - t;
        const at = (f: number) => [(1 - f) * (1 - f) * a.x + 2 * (1 - f) * f * mx + f * f * b.x, (1 - f) * (1 - f) * a.y + 2 * (1 - f) * f * my + f * f * b.y];
        const [e1x, e1y] = at(t), [s2x, s2y] = at(u);
        dd = `M${a.x},${a.y}Q${a.x + (mx - a.x) * t},${a.y + (my - a.y) * t} ${e1x},${e1y}M${s2x},${s2y}Q${mx + (b.x - mx) * u},${my + (b.y - my) * u} ${b.x},${b.y}`;
        R.stub.on = true;
        R.stub.a.setAttribute('transform', `translate(${e1x},${e1y}) scale(${1 / C.k})`);
        R.stub.b.setAttribute('transform', `translate(${s2x},${s2y}) scale(${1 / C.k})`);
        stubbed.push(R);
      }
      if (R.stub) { R.stub.a.style.display = R.stub.on ? '' : 'none'; R.stub.b.style.display = R.stub.on ? '' : 'none'; }
      R.p.setAttribute('d', dd); R.h.setAttribute('d', dd);
      if (R.u) R.u.setAttribute('d', dd);
      if (R.d2) R.d2.setAttribute('d', dd);
      const live = R.S.links.some(inRange);
      // Ended: every record on the strand ended before the window's end. Drawn faint, and its sentence says when.
      const ended = endedBy(R.S.links, range[1]);
      R.g.style.opacity = String((live ? (ended ? 0.38 : 1) : 0.08) * Math.min(na.cur.o, nb.cur.o));
      if (R.u) R.u.style.display = live && !ended ? '' : 'none';
      const sw = R.w / (mode === 'case' ? Math.max(0.7, C.k) : 1);
      R.p.setAttribute('stroke-width', String(R.d2 ? sw + 3 : sw));
      if (R.d2) R.d2.setAttribute('stroke-width', String(Math.max(0.8, sw + 0.2)));
      if (R.lab && R.lab.ended !== Boolean(ended)) {
        R.lab.ended = Boolean(ended);
        R.lab.body.textContent = linkSentence(R.S.fam, R.S.links, ended);
        let w = ((R.S.sure ? 2 : 0) + (R.lab.body.textContent ?? '').length) * 6.3;
        try { w = R.lab.t.getComputedTextLength() || w; } catch { /* not laid out (tests) */ }
        R.lab.w = w + 14;
        sizePill(R.lab.g, R.lab.w);
      }
      if (R.u) { R.u.setAttribute('stroke-width', String(sw + 1.4)); R.u.style.opacity = mode === 'case' ? '.55' : '1'; }
      R.mid = {x: mx * 0.5 + (a.x + b.x) / 4, y: my * 0.5 + (a.y + b.y) / 4};
      R.q = [a.x, a.y, mx, my, b.x, b.y];
    }
    // Letters in a steady order, so a link keeps its letter while the view moves.
    stubbed.sort((p, o) => (p.S.s + p.S.t + p.S.fam).localeCompare(o.S.s + o.S.t + o.S.fam)).forEach((R, i) => {
      const letter = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26) + 1) : '');
      const words = R.lab?.body.textContent || linkSentence(R.S.fam, R.S.links, '');
      for (const g of [R.stub!.a, R.stub!.b]) {
        g.style.opacity = R.g.style.opacity;
        g.querySelector('text')!.textContent = letter;
        g.querySelector('title')!.textContent = `${letter}: ${E[R.S.s]?.short ?? ''} ${words} ${E[R.S.t]?.short ?? ''}. A long link, drawn as its two ends; the other end has the letter ${letter}. Click to open every record on it.`;
      }
    });
    terrBoxes = [];
    for (const t of terrEls.slice().sort((a, b) => Number(b.big) - Number(a.big))) {
      const fs = t.big ? 17 : 14, s = toScreen(t.x, t.top), sy = s.y - 60 * C.k - 6, w = t.n * fs * 0.5;
      const bx = {x0: s.x - w / 2, x1: s.x + w / 2, y0: sy - fs, y1: sy + 16};
      const clash = overlap(bx, terrBoxes);
      t.g.style.display = clash ? 'none' : '';
      if (clash) continue;
      terrBoxes.push(bx);
      const wy = (sy - H / 2) / C.k + C.y;
      t.a.setAttribute('x', String(t.x)); t.a.setAttribute('y', String(wy)); t.a.setAttribute('font-size', String(fs / C.k)); t.a.setAttribute('stroke-width', String(5 / C.k));
      t.b.setAttribute('x', String(t.x)); t.b.setAttribute('y', String(wy + 14 / C.k)); t.b.setAttribute('font-size', String(10 / C.k)); t.b.setAttribute('stroke-width', String(4 / C.k));
    }
    cardBoxes = [];
    for (const id in node) {
      const N = node[id];
      if (N.cur.v === 2 && !N.isChain && N.cur.o > 0.5) {
        const s = toScreen(P[id].x, P[id].y);
        cardBoxes.push({x0: s.x - (N.hw + 4) * C.k * cs, x1: s.x + (N.hw + 12) * C.k * cs, y0: s.y - (N.hh + (nOpen(flagsOf(id)) ? 13 : 5)) * C.k * cs,
          y1: s.y + (N.hh + (D.entities.some(a => a.holder === id) ? 16 : 4)) * C.k * cs});
      }
    }
    const rtBoxes: Box[] = [];
    for (const L of rtEls) {
      const R = edgeEls[L.k];
      if (!R || R.g.style.display === 'none') { L.g.style.display = 'none'; continue; }
      L.g.style.display = '';
      const a = P[focus], b = P[L.o];
      // Chips keep their size on screen whatever the zoom (at 65% they were too small to read).
      // Along the line from the focus, clear of the cards where it can be.
      const w = Number(L.g.querySelector('rect')?.getAttribute('width')) || 150;
      const at = (f: number) => {
        const cx = a.x * (1 - f) + b.x * f, cy = a.y * (1 - f) + b.y * f - 30 / C.k, sc = toScreen(cx, cy);
        return {cx, cy, b: {x0: sc.x - w / 2, x1: sc.x + w / 2, y0: sc.y - 13, y1: sc.y + 13}};
      };
      const spot = [0.58, 0.5, 0.42, 0.66, 0.34].map(at).find(o => !overlap(o.b, cardBoxes)) ?? at(0.58);
      L.g.setAttribute('transform', `translate(${spot.cx},${spot.cy}) scale(${1 / C.k})`);
      rtBoxes.push(spot.b);
    }
    // Sector names: the first radius between the focus and its ring that is clear of cards and chips.
    secBoxes = rtBoxes;
    for (const S of secEls) {
      let ok: {wx: number; wy: number; b: Box} | null = null;
      for (const f of [0.6, 0.5, 0.7, 0.42, 0.8, 0.34]) {
        const wx = S.cx + Math.cos(S.a) * S.r * f * S.rx, wy = S.cy + Math.sin(S.a) * S.r * f, s = toScreen(wx, wy);
        const w = (S.t.textContent ?? '').length * 9.4, b = {x0: s.x - w / 2, x1: s.x + w / 2, y0: s.y - 11, y1: s.y + 6};
        if (!overlap(b, cardBoxes) && !overlap(b, secBoxes)) { ok = {wx, wy, b}; break; }
      }
      S.t.style.display = ok ? '' : 'none';
      if (ok) {
        S.t.setAttribute('x', String(ok.wx)); S.t.setAttribute('y', String(ok.wy));
        S.t.setAttribute('font-size', String(12 / C.k)); S.t.setAttribute('stroke-width', String(5 / C.k)); secBoxes.push(ok.b);
      }
    }
    // "+N more" chips: beside their party, outward from the focus, at the first spot clear of every card, dot, its name
    // and link chip (they used to sit at a fixed offset, over the cards' names). A leader line keeps them tied to it.
    const dotBoxes: Box[] = [];
    for (const id in node) {
      const N = node[id];
      if (N.cur.v !== 1 || N.cur.o < 0.5 || !P[id]) continue;
      const s = toScreen(P[id].x, P[id].y), half = Math.max(16, (E[id]?.short.length ?? 8) * 3.6);
      dotBoxes.push({x0: s.x - half, x1: s.x + half, y0: s.y - 14, y1: s.y + 30});
    }
    const moreBoxes: Box[] = [];
    for (const M of moreEls) {
      const at = P[M.p], from = P[focus];
      if (!at) { M.g.style.display = 'none'; M.lead.style.display = 'none'; continue; }
      M.g.style.display = ''; M.lead.style.display = '';
      const s = toScreen(at.x, at.y), f = from ? toScreen(from.x, from.y) : {x: W / 2, y: H / 2};
      const base = Math.atan2(s.y - f.y, s.x - f.x) || 0;
      const box = (x: number, y: number) => ({x0: x - M.w / 2 - 4, x1: x + M.w / 2 + 4, y0: y - 17, y1: y + 17});
      const clear = (b: Box) => !overlap(b, cardBoxes) && !overlap(b, dotBoxes) && !overlap(b, secBoxes) && !overlap(b, moreBoxes)
        && b.x0 > 8 && b.x1 < W - 8 && b.y0 > 8 && b.y1 < H - 8;
      let spot: {x: number; y: number} | null = null;
      for (const d of [120, 150, 185, 225, 270]) {
        for (const turn of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, Math.PI]) {
          const x = s.x + Math.cos(base + turn) * d, y = s.y + Math.sin(base + turn) * d * 0.62;
          if (clear(box(x, y))) { spot = {x, y}; break; }
        }
        if (spot) break;
      }
      spot ??= {x: s.x + Math.cos(base) * 150, y: s.y + Math.sin(base) * 93};
      moreBoxes.push(box(spot.x, spot.y));
      const wx = (spot.x - W / 2) / C.k + C.x, wy = (spot.y - H / 2) / C.k + C.y;
      M.g.setAttribute('transform', `translate(${wx},${wy}) scale(${1 / C.k})`);
      M.lead.setAttribute('d', `M${at.x},${at.y}L${wx},${wy}`);
      M.lead.setAttribute('stroke-width', String(1.2 / C.k));
    }
    secBoxes.push(...moreBoxes);
    for (const h of hopEls) {
      const R = edgeEls[h.k];
      if (!R || !R.mid) { h.g.style.display = 'none'; continue; }
      h.g.style.display = '';
      h.g.setAttribute('transform', `translate(${R.mid.x},${R.mid.y - 20 / C.k}) scale(${1 / C.k})`);
    }
    const taken = placeLabels(cands);
    placeLinkLabels(taken);
    const lensOn = lens.on && mode === 'case';
    q<SVGGElement>('.tw-nodes').style.setProperty('--lo', lensOn ? '.28' : '1');
    q<SVGGElement>('.tw-terr-l').style.opacity = lensOn ? '.3' : '1';
    renderLens(P);
    q('.tw-zoom').textContent = `${Math.round(C.k * 100)}%`;
  }

  function placeLabels(cands: {id: string; N: NodeEl; d: Pt; pri: number}[]): Box[] {
    const boxes = terrBoxes.concat(cardBoxes, secBoxes);
    cands.sort((a, b) => b.pri - a.pri);
    const fsS = mode === 'case' ? 12 : 11.5;
    for (const c of cands) {
      const s = toScreen(c.d.x, c.d.y), r = (4 + Math.sqrt(deg[c.id]) * 2.6) * C.k, off = r + fsS + 2;
      // Always under the dot, so every name sits in the same place; a long name is shortened (the whole of it is on
      // hover), and one that has no room under its dot is left to hover rather than moved above or beside it.
      const name = clipWords(E[c.id].short, 20);
      const w = name.length * fsS * 0.56;
      // Centred under it first, then under it starting at the dot or ending at it: always the same height under the dot.
      const spots: {dx: number; dy: number; anchor: string}[] = [{dx: 0, dy: off, anchor: 'middle'}, {dx: -r, dy: off, anchor: 'start'}, {dx: r, dy: off, anchor: 'end'}];
      const box = (p: typeof spots[number]) => {
        const x0 = p.anchor === 'middle' ? s.x - w / 2 : p.anchor === 'start' ? s.x + p.dx : s.x + p.dx - w;
        return {x0: x0 - 3, x1: x0 + w + 3, y0: s.y + p.dy - fsS, y1: s.y + p.dy + 3};
      };
      const at = spots.find(p => { const b = box(p); return b.x0 >= 0 && b.x1 <= W && !overlap(b, boxes); });
      if (!at) continue;
      boxes.push(box(at));
      c.N.lbl.style.display = '';
      c.N.lbl.setAttribute('font-size', String(fsS / C.k)); c.N.lbl.setAttribute('stroke-width', String(4 / C.k));
      c.N.lbl.setAttribute('x', String(at.dx / C.k)); c.N.lbl.setAttribute('y', String((at.dy - 2) / C.k)); c.N.lbl.setAttribute('text-anchor', at.anchor);
      c.N.lbl.textContent = name;
    }
    return boxes;
  }

  /* Link sentences: placed by importance (links of the party in the middle, then the least sure, then the
     biggest money), each kept clear of cards, names and other sentences; one that would overlap is left off
     and counted under the time strip. Drawn at a constant size on screen whatever the zoom. */
  let hiddenLabels = 0;
  function placeLinkLabels(boxes: Box[]): void {
    const dots: Box[] = [];
    for (const id in node) {
      const N = node[id];
      if (N.cur.v !== 1 || N.cur.o < 0.5) continue;
      const s = toScreen(N.cur.x, N.cur.y), r = (4 + Math.sqrt(deg[id] || 0) * 2.6) * C.k + 3;
      dots.push({x0: s.x - r, x1: s.x + r, y0: s.y - r, y1: s.y + r});
    }
    const placed = boxes.concat(dots);
    const order = Object.values(edgeEls).filter(R => R.lab).sort((a, b) => pri(b) - pri(a));
    let hidden = 0;
    const top = 120, bottom = H - 112;
    for (const R of order) {
      const L = R.lab!;
      const vis = R.g.style.display !== 'none' && R.q && R.S.links.some(inRange) && (mode !== 'case' || C.k >= 0.32);
      if (!vis) { L.g.style.display = 'none'; continue; }
      // The middle of the curve first, then further along it either way.
      const [ax, ay, mx, my, bx, by] = R.q!;
      let spot: {x: number; y: number; b: Box} | null = null;
      for (const t of R.stub?.on ? [0.14, 0.86, 0.2, 0.8] : [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85]) {
        const u = 1 - t, x = u * u * ax + 2 * u * t * mx + t * t * bx, y = u * u * ay + 2 * u * t * my + t * t * by, s = toScreen(x, y);
        const b = {x0: s.x - L.w / 2 - 2, x1: s.x + L.w / 2 + 2, y0: s.y - 12, y1: s.y + 12};
        if (b.x0 >= 0 && b.x1 <= W && b.y0 >= top && b.y1 <= bottom && !overlap(b, placed)) { spot = {x, y, b}; break; }
      }
      if (!spot) { L.g.style.display = 'none'; hidden++; continue; }
      placed.push(spot.b);
      L.g.style.display = '';
      L.g.style.opacity = R.g.style.opacity;
      L.g.setAttribute('transform', `translate(${spot.x},${spot.y}) scale(${1 / C.k})`);
    }
    if (hidden !== hiddenLabels) { hiddenLabels = hidden; renderCounts(); }
  }
  function pri(R: EdgeEl): number {
    const touches = mode === 'party' && (R.S.s === focus || R.S.t === focus) ? 1e6 : 0;
    const unsure = R.S.sure ? (3 - SURE[R.S.sure].rank) * 1e4 : 0;
    return touches + unsure + Math.log10(R.S.sum + 1) * 100 + R.S.links.length;
  }

  const sizePill = (g: SVGGElement, w: number) => {
    g.querySelectorAll('rect').forEach((r, i) => { r.setAttribute('x', String(-w / 2 + i * 2.5)); r.setAttribute('width', String(w - i * 5)); });
  };
  const pathEdge = (s: string, t: string) => pathIds.some((a, i) => i < pathIds.length - 1 && ((a === s && pathIds[i + 1] === t) || (a === t && pathIds[i + 1] === s)));

  /* static layers: edges, territories, sector labels, "more" chips */
  function drawStatic(): void {
    const gE = q<SVGGElement>('.tw-edges'), gLab = q<SVGGElement>('.tw-elabs');
    gE.textContent = ''; gLab.textContent = ''; edgeEls = {}; rtEls = []; hopEls = [];
    const tgtV = (id: string) => Boolean(node[id]) && node[id].tgt.v > 0;
    for (const key in bundles) {
      const B = bundles[key], strands = Object.values(B.strands);
      strands.forEach((S, i) => {
        let s = S.s, t = S.t;
        // In the whole-case view a collapsed shell chain stands in for its companies.
        const cs = chainOf[s], ct = chainOf[t];
        if (mode === 'case') { if (cs && !cs.open) s = cs.id; if (ct && !ct.open) t = ct.id; if (s === t) return; }
        let want = tgtV(s) && tgtV(t);
        if (mode === 'party' || mode === 'wire') { const v1 = node[s].tgt.v, v2 = node[t].tgt.v; want = v1 > 0 && v2 > 0 && (s === focus || t === focus || v1 === 2 || v2 === 2); }
        if (mode === 'path') want = pathEdge(s, t);
        const fam = FAM[S.fam] || FAM.other;
        const g = el('g', {}, gE);
        const money = S.fam === 'money';
        const w = money && S.sum ? 1.2 + Math.log10(S.sum / 1e6 + 1) * 1.25 : 1.6;
        const isPath = mode === 'path' && want;
        // Line style is how sure (dashed not yet shown, double disputed, dotted worked out); colour is the kind.
        const sure = S.sure ? SURE[S.sure] : null;
        const p = el('path', {class: `strand${S.sure ? ` s-${S.sure}` : ''}`, stroke: isPath || S.sure === 'disputed' ? DISPUTED : fam.c,
          'stroke-opacity': mode === 'case' ? 0.55 : 0.9, 'stroke-dasharray': sure?.dash ?? 'none'}, g);
        const d2 = S.sure === 'disputed' ? el('path', {class: 'strand-core'}, g) : null;
        const u = money ? el('path', {class: 'pulse', stroke: isPath ? '#ffe9e4' : '#ffd9a8', 'stroke-opacity': 0.95}, g) : null;
        const h = el('path', {class: 'hit'}, g);
        const n = strands.length, bend = n === 1 ? 0.25 : (i - (n - 1) / 2) * 1.1 + 0.15;
        // The link's sentence on the line, led by its certainty glyph; the pill's edge follows the line style.
        let lab: EdgeEl['lab'] = null;
        if (mode === 'case' || mode === 'party') {
          const lg = el('g', {class: `elab${S.sure ? ` s-${S.sure}` : ''}`, role: 'button', tabindex: -1}, gLab);
          el('rect', {y: -10, height: 20, rx: 6}, lg);
          // Disputed: a double edge, as on its line.
          if (S.sure === 'disputed') el('rect', {y: -7.5, height: 15, rx: 4, class: 'inner'}, lg);
          const t = el('text', {y: 4, 'text-anchor': 'middle'}, lg);
          const words = linkSentence(S.fam, S.links, '');
          if (sure) { const gl = el('tspan', {class: 'glyph'}, t); gl.textContent = `${sure.g} `; }
          const body = el('tspan', {}, t);
          body.textContent = words;
          let tw = ((sure ? 2 : 0) + words.length) * 6.3;
          try { tw = t.getComputedTextLength() || tw; } catch { /* not laid out (tests) */ }
          sizePill(lg, tw + 14);
          const ti = el('title', {}, lg);
          ti.textContent = `${E[S.s]?.short ?? ''} ${words}${E[S.t] ? ` ${E[S.t].short}` : ''}${sure ? ` (${sure.n.toLowerCase()})` : ''}`;
          on<MouseEvent>(lg, 'click', ev => { ev.stopPropagation(); openWire(B.key); });
          on<PointerEvent>(lg, 'pointerenter', ev => { if (ev.pointerType !== 'touch') showLinkTip(ev, S); });
          on(lg, 'pointerleave', hideTip);
          lab = {g: lg, w: tw + 14, t, body, ended: false};
        }
        let stub: EdgeEl['stub'] = null;
        if (mode === 'case' || mode === 'party') {
          const badge = () => {
            const sg = el('g', {class: `stub${S.sure ? ` s-${S.sure}` : ''}`, role: 'button', tabindex: -1, style: 'display:none'}, gLab);
            el('circle', {r: 9, stroke: S.sure === 'disputed' ? DISPUTED : fam.c}, sg);
            el('text', {y: 3.6, 'text-anchor': 'middle'}, sg);
            el('title', {}, sg);
            on<MouseEvent>(sg, 'click', ev => { ev.stopPropagation(); openWire(B.key); });
            on<PointerEvent>(sg, 'pointerenter', ev => { if (ev.pointerType !== 'touch') showLinkTip(ev, S); });
            on(sg, 'pointerleave', hideTip);
            return sg;
          };
          stub = {a: badge(), b: badge(), on: false};
        }
        edgeEls[`${key}#${i}`] = {g, p, u, h, d2, S: {...S, s, t}, w, bend, want, lab, stub};
        on<MouseEvent>(h, 'click', ev => { ev.stopPropagation(); openWire(B.key); });
        on<PointerEvent>(h, 'pointerenter', ev => { if (ev.pointerType !== 'touch') showLinkTip(ev, S); });
        on(h, 'pointerleave', hideTip);
      });
    }
    // Round trips around the focus: money both ways with one party.
    if (mode === 'party') {
      for (const key in bundles) {
        const B = bundles[key];
        if (B.a !== focus && B.b !== focus) continue;
        const st = Object.values(B.strands).filter(s => s.fam === 'money');
        if (new Set(st.map(x => x.s)).size !== 2) continue;
        const other = B.a === focus ? B.b : B.a;
        const fl = flagsOf(focus).items.concat(flagsOf(other).items).find(x => x.id === 'ML-023');
        const ki = Object.keys(edgeEls).find(k => k.startsWith(`${key}#`) && edgeEls[k].S.fam === 'money');
        if (!ki) continue;
        const g = el('g', {}, gLab);
        // The flag's own level (it was always written TEXTBOOK); only a textbook flag takes the alarm fill.
        const r = el('rect', {y: -12, height: 24, rx: 12, fill: fl?.level === 'textbook' ? '#8E2420' : '#1E3448', stroke: fl ? '#FF8070' : '#6F8AA3'}, g);
        const t = el('text', {class: 'round-l', 'text-anchor': 'middle', y: 4}, g);
        t.textContent = fl ? `ROUND TRIP · ${fl.level.toUpperCase()}` : 'MONEY BOTH WAYS';
        let tw = t.textContent.length * 7.4;
        try { tw = t.getComputedTextLength() || tw; } catch { /* not laid out (tests) */ }
        r.setAttribute('x', String(-(tw + 24) / 2)); r.setAttribute('width', String(tw + 24));
        rtEls.push({k: ki, g, o: other});
      }
    }
    if (mode === 'path') {
      for (let i = 0; i < pathIds.length - 1; i++) {
        const a = pathIds[i], b = pathIds[i + 1], key = bkey(a, b), B = bundles[key];
        const ki = Object.keys(edgeEls).find(k => k.startsWith(`${key}#`));
        if (!ki || !B) continue;
        const pay = B.links.filter(l => l.fam === 'money'), L = pay.length ? pay : B.links, l0 = L[0];
        const fwd = L.some(l => rep(l.s) === a), sum = pay.reduce((s, l) => s + (l.amount || 0), 0);
        const years = [...new Set(pay.map(l => l.date.slice(0, 4)).filter(Boolean))].sort();
        const span = years.length ? ` · ${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ''}` : '';
        const txt = pay.length ? `${fwd ? 'PAID' : 'WAS PAID BY'} · ${pay.length > 1 ? `${pay.length} PAYMENTS · ` : ''}${fmtAmt(sum, l0.cur).toUpperCase()}${span}`
          : `${(FAM[l0.fam] || FAM.other).n.toUpperCase()}${fwd ? '' : ' (OTHER WAY)'}`;
        const g = el('g', {}, gLab);
        const r = el('rect', {y: -11, height: 22, rx: 11, class: 'hop-bg', stroke: '#FF8070'}, g);
        const t = el('text', {class: 'round-l', 'text-anchor': 'middle', y: 4}, g);
        t.textContent = txt;
        // Sized to the drawn text (a guessed width per letter clipped longer chips).
        let tw = txt.length * 7.4;
        try { tw = t.getComputedTextLength() || tw; } catch { /* not laid out (tests) */ }
        r.setAttribute('x', String(-(tw + 20) / 2)); r.setAttribute('width', String(tw + 20));
        hopEls.push({k: ki, g});
      }
    }
    // Territories.
    const gT = q<SVGGElement>('.tw-terr'), gL = q<SVGGElement>('.tw-terr-l');
    gT.textContent = ''; gL.textContent = ''; terrEls = [];
    if (mode === 'case' && layout) {
      for (const band of layout.bands) {
        const g = el('g', {}, gL);
        const a = el('text', {class: 'terr-l', 'text-anchor': 'middle'}, g);
        a.textContent = band.name;
        const b = el('text', {class: 'terr-s', 'text-anchor': 'middle'}, g);
        b.textContent = band.sub;
        terrEls.push({g, a, b, x: band.x, top: band.top, big: true, n: band.name.length});
      }
    } else if (mode === 'case') {
      for (const t of Object.values(terr)) {
        const ms = t.members;
        let x = 0, top = 1e9;
        ms.forEach(m => { x += E[m].x; top = Math.min(top, E[m].y); });
        x /= ms.length;
        ms.forEach(m => el('circle', {cx: E[m].x, cy: E[m].y, r: t.id === 'loose' ? 70 : 88, fill: t.tint, 'fill-opacity': 0.75}, gT));
        const g = el('g', {}, gL);
        const a = el('text', {class: 'terr-l', 'text-anchor': 'middle'}, g);
        a.textContent = t.name;
        const b = el('text', {class: 'terr-s', 'text-anchor': 'middle'}, g);
        b.textContent = `${ms.length} ${ms.length === 1 ? 'PARTY' : 'PARTIES'}${t.flags ? ` · ${t.flags} OPEN FLAGS` : ''}`;
        if (t.flags) b.setAttribute('fill', '#F6966A');
        terrEls.push({g, a, b, x, top, big: ms.length > 6, n: t.name.length});
      }
    }
    // Sectors and "more" chips.
    const gS = q<SVGGElement>('.tw-sec'), gM = q<SVGGElement>('.tw-more');
    gS.textContent = ''; gM.textContent = ''; secEls = []; moreEls = [];
    if (mode === 'party' && partyInfo) {
      const I = partyInfo;
      el('ellipse', {cx: I.cx, cy: I.cy, rx: I.R1 * I.RX, ry: I.R1, fill: 'none', stroke: 'rgb(111 138 163 / .22)', 'stroke-dasharray': '2 6'}, gS);
      el('ellipse', {cx: I.cx, cy: I.cy, rx: I.R1 * I.RX * 1.62, ry: I.R1 * 1.62, fill: 'none', stroke: 'rgb(111 138 163 / .12)', 'stroke-dasharray': '2 8'}, gS);
      el('circle', {cx: I.cx, cy: I.cy, r: 150, fill: 'url(#tw-glow)'}, gS);
      for (const s of I.secLabels) {
        const t = el('text', {class: 'sec', 'text-anchor': 'middle'}, gS);
        t.textContent = s.n;
        secEls.push({t, a: s.a * Math.PI / 180, r: I.R1, rx: I.RX, cx: I.cx, cy: I.cy});
      }
      for (const m of I.more) {
        // A folded stack: a leader back to its party, then a tab with three stacked dots and the count.
        // The leader is drawn with the sector rings, under the links, cards and chips, so it never crosses one.
        const lead = el('path', {class: 'more-lead'}, gS);
        const g = el('g', {class: 'more', transform: `translate(${m.x},${m.y})`, role: 'button', tabindex: 0, 'aria-label': `Show ${m.n} more linked to ${E[m.p].short}`}, gM);
        const w = 80 + String(m.n).length * 8, ws = 40 + String(m.n).length * 8;
        // At rest a condensed tab (three stacked dots and the count); on hover or keyboard focus it opens to the full chip.
        // It is placed by its full width, so opening never covers anything.
        const small = el('g', {class: 'more-s'}, g);
        el('rect', {x: -ws / 2, y: -11, width: ws, height: 22, rx: 11, class: 'more-bg'}, small);
        for (const [i, dx] of [0, 4, 8].entries()) el('circle', {cx: -ws / 2 + 10 + dx, cy: 0, r: 3.4, class: `more-stack s${i}`}, small);
        el('text', {x: -ws / 2 + 25, y: 4.5, class: 'more-n'}, small).textContent = `+${m.n}`;
        const full = el('g', {class: 'more-f'}, g);
        el('rect', {x: -w / 2, y: -13, width: w, height: 26, rx: 6, class: 'more-bg'}, full);
        for (const [i, dx] of [0, 5, 10].entries()) el('circle', {cx: -w / 2 + 11 + dx, cy: 0, r: 4.2, class: `more-stack s${i}`}, full);
        const t = el('text', {x: -w / 2 + 30, y: 4.5}, full);
        el('tspan', {class: 'more-n'}, t).textContent = `+${m.n}`;
        el('tspan', {class: 'more-w', dx: 4}, t).textContent = 'more';
        const open = () => { expanded.add(m.p); go('party', {noTrail: true}); };
        on<MouseEvent>(g, 'click', ev => { ev.stopPropagation(); open(); });
        on<KeyboardEvent>(g, 'keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
        moreEls.push({p: m.p, w, g, lead});
      }
    }
    chains.forEach(c => { const t = node[c.id]?.dot.querySelector('text'); if (t) t.textContent = c.mids.length > 1 ? `CHAIN OF ${c.mids.length} COMPANIES` : '1 COMPANY BETWEEN'; });
  }

  /* ---------- lens ---------- */
  function renderLens(P: Record<string, Pt>): void {
    const g = q<SVGGElement>('.tw-lens');
    g.textContent = '';
    if (!(lens.on && mode === 'case')) return;
    el('circle', {cx: lens.x, cy: lens.y, r: lens.R, fill: 'rgb(232 169 91 / .05)', stroke: '#E8A95B', 'stroke-width': 1.5}, g);
    el('circle', {cx: lens.x, cy: lens.y, r: lens.R + 5, fill: 'none', stroke: 'rgb(232 169 91 / .25)', 'stroke-width': 8}, g);
    const inside: {id: string; s: {x: number; y: number}; a: number}[] = [];
    for (const id in node) {
      const N = node[id];
      if (N.cur.v < 1 || N.cur.o < 0.5 || N.isChain || !P[id].in) continue;
      const s = toScreen(P[id].x, P[id].y);
      inside.push({id, s, a: Math.atan2(s.y - lens.y, s.x - lens.x)});
    }
    inside.sort((a, b) => (fscore(flagsOf(b.id)) * 10 + deg[b.id]) - (fscore(flagsOf(a.id)) * 10 + deg[a.id]));
    const extra = inside.length - 14;
    inside.splice(14);
    inside.sort((a, b) => a.a - b.a);
    const gap = Math.min(0.36, 2 * Math.PI / Math.max(1, inside.length));
    for (let i = 1; i < inside.length; i++) if (inside[i].a - inside[i - 1].a < gap) inside[i].a = inside[i - 1].a + gap;
    const kinds: Record<string, number> = {};
    inside.forEach(o => {
      kinds[E[o.id].kind] = (kinds[E[o.id].kind] || 0) + 1;
      const r = lens.R + 18, lx = lens.x + Math.cos(o.a) * r, ly = lens.y + Math.sin(o.a) * r;
      el('line', {x1: o.s.x, y1: o.s.y, x2: lx, y2: ly, stroke: 'rgb(245 236 218 / .35)', 'stroke-width': 1}, g);
      const right = Math.cos(o.a) >= 0;
      const t = el('text', {x: lx + (right ? 4 : -4), y: ly + 4, 'text-anchor': right ? 'start' : 'end', class: 'lbl', 'font-size': 12.5, 'stroke-width': 4, style: 'opacity:1'}, g);
      t.textContent = E[o.id].short;
      const n = nOpen(flagsOf(o.id));
      if (n) { const ft = el('tspan', {fill: '#F6966A', 'font-weight': 600}, t); ft.textContent = `  ▮ ${n}`; }
    });
    const plural = (k: string, n: number) => {
      const name = (KIND[k] ?? KIND.other).name.toLowerCase();
      if (n === 1) return `1 ${name}`;
      return `${n} ${name === 'person' ? 'people' : name === 'company' ? 'companies' : name === 'property' ? 'properties' : `${name}s`}`;
    };
    const t = el('text', {x: lens.x, y: lens.y - lens.R - 16, 'text-anchor': 'middle', class: 'lbl lens-sum', 'font-size': 11.5, 'stroke-width': 4, style: 'opacity:1'}, g);
    t.textContent = inside.length ? Object.entries(kinds).map(([k, n]) => plural(k, n)).join(' · ') + (extra > 0 ? ` · ${extra} more under the lens` : '') : 'Move over the map';
  }

  /* ---------- wire: one link opened ---------- */
  let wireTimer = 0;
  function openWire(key: string): void {
    wireKey = key;
    const [a, b] = key.split('|');
    if (mode !== 'party' || (a !== focus && b !== focus)) focus = a;
    go('wire');
    window.clearTimeout(wireTimer);
    wireTimer = window.setTimeout(drawWire, RM() ? 0 : 420);
    const B = bundles[key];
    if (B) {
      let [pa, pb] = [B.a, B.b];
      if (pb === focus) [pa, pb] = [pb, pa];
      drawer.classList.remove('open');
      hooks.openLink?.({key, a: {id: pa, name: E[pa].short}, b: {id: pb, name: E[pb].short},
        aSide: D.entities.filter(e => rep(e.id) === pa).map(e => e.id), records: B.links});
    }
  }
  function drawWire(): void {
    const box = q<HTMLDivElement>('.tw-wire');
    box.classList.toggle('on', mode === 'wire');
    svg.style.opacity = mode === 'wire' ? '.16' : '1';
    box.querySelectorAll('.end,.tag').forEach(x => x.remove());
    const s = q<SVGSVGElement>('.tw-wsvg');
    s.textContent = '';
    if (mode !== 'wire') return;
    const B = bundles[wireKey];
    if (!B) return;
    let a = B.a, b = B.b;
    if (b === focus) [a, b] = [b, a];
    const narrow = W <= 560, TW = narrow ? 170 : 210, m = narrow ? 122 : 190;
    const r = box.getBoundingClientRect(), w = r.width, h = r.height, cy = h / 2, x0 = m, x1 = w - m;
    const mk = (id: string, right: boolean) => {
      const d = document.createElement('button');
      d.type = 'button'; d.className = 'end';
      d.style[right ? 'right' : 'left'] = '0';
      d.style.borderColor = (KIND[E[id].kind] ?? KIND.other).ring;
      d.innerHTML = `<small>${esc((KIND[E[id].kind] ?? KIND.other).name)}</small>${esc(E[id].short)}`;
      d.title = 'Centre here';
      d.onclick = () => go('party', {id});
      box.appendChild(d);
    };
    mk(a, false); mk(b, true);
    el('line', {x1: x0 - 10, y1: cy, x2: x1 + 10, y2: cy, stroke: '#6F8AA3', 'stroke-width': 2}, s);
    const L = B.links.slice().sort((p, o) => (tval(p.date) || 0) - (tval(o.date) || 0));
    const dated = L.filter(l => l.date), und = L.filter(l => !l.date);
    const ts = dated.map(l => tval(l.date)!);
    let t0 = ts.length ? Math.min(...ts) : 0, t1 = ts.length ? Math.max(...ts) : 1;
    if (t1 - t0 < 0.5) { t0 -= 0.5; t1 += 0.5; }
    const span = und.length ? (x1 - x0) * (dated.length ? 0.78 : 0) : (x1 - x0);
    const X = (l: WireLinkOut) => x0 + 30 + (tval(l.date)! - t0) / (t1 - t0) * (span - 60);
    const undX: Record<string, number> = {};
    und.forEach((l, i) => { undX[l.id] = x0 + span + ((x1 - x0 - span) * (i + 1) / (und.length + 1)); });
    if (dated.length) {
      for (let y = Math.ceil(t0); y <= Math.floor(t1); y++) {
        const x = x0 + 30 + (y - t0) / (t1 - t0) * (span - 60);
        el('line', {x1: x, x2: x, y1: cy - 6, y2: cy + 6, stroke: '#6F8AA3'}, s);
        const t = el('text', {x, y: cy + 22, 'text-anchor': 'middle', class: 'axis'}, s);
        t.textContent = String(y);
      }
    }
    if (und.length) { const t = el('text', {x: x0 + span + (x1 - x0 - span) / 2, y: cy + 22, 'text-anchor': 'middle', class: 'axis'}, s); t.textContent = 'NO DATE'; }
    const used: {x0: number; x1: number; off: number; h: number; up: boolean}[] = [];
    L.forEach(l => {
      const x = l.date ? X(l) : undX[l.id], fwd = rep(l.s) === a, up = fwd, fam = FAM[l.fam] || FAM.other;
      const rr = l.amount ? 4 + Math.log10(l.amount / 1e6 + 1) * 3.2 : 6;
      const g = el('g', {}, s);
      el('line', {x1: x, x2: x, y1: cy, y2: cy + (up ? -1 : 1) * 48, stroke: fam.c, 'stroke-width': 1.2, 'stroke-dasharray': '2 3'}, g);
      el('circle', {cx: x, cy, r: rr, fill: fam.c, class: 'bead'}, g);
      el('path', {d: fwd ? `M${x + rr + 4},${cy - 4}l6,4l-6,4` : `M${x - rr - 4},${cy - 4}l-6,4l6,4`, fill: 'none', stroke: fam.c, 'stroke-width': 1.6}, g);
      const tg = document.createElement('div');
      tg.className = 'tag';
      const ev = l.ev[0];
      const head = l.fam === 'money' ? `${fmtAmt(l.amount, l.cur)} · ${fmtDate(l.date)}`
        : `${fam.n}${l.pct ? ` · ${l.pct}%` : ''}${l.date ? ` · from ${fmtDate(l.date)}` : ''}`;
      const sure = sureOf(l), end = endOf(l);
      const chip = sure ? `<span class="sure s-${sure}"><i aria-hidden="true">${SURE[sure].g}</i> ${esc(SURE[sure].n)}</span>` : '';
      tg.innerHTML = `${chip}<b>${esc(head)}${end ? ` · ended ${esc(fmtDate(end))}` : ''}</b>${esc((l.role || '').slice(0, 90))}${ev ? `<span class="q">“${esc(ev.q.slice(0, 120))}${ev.q.length > 120 ? '…' : ''}”</span><cite>${esc(ev.doc)}${ev.loc ? ` · ${esc(ev.loc)}` : ''}</cite>` : '<span class="q">No quote shows it yet.</span>'}`;
      if (ev?.evidence_id) {
        const tr = document.createElement('button');
        tr.type = 'button'; tr.className = 'trace'; tr.textContent = 'Trace';
        tr.onclick = () => hooks.traceEvidence(ev.evidence_id!, ev.doc || 'Evidence');
        tg.appendChild(tr);
      }
      const left = Math.max(0, Math.min(w - TW, x - TW / 2));
      tg.style.left = `${left}px`;
      box.appendChild(tg);
      const th = tg.offsetHeight;
      let off = 48;
      for (const u of used.filter(o => o.up === up && left < o.x1 + 8 && left + TW > o.x0 - 8).sort((p, o) => p.off - o.off)) {
        if (off + th > u.off - 8 && off < u.off + u.h + 8) off = u.off + u.h + 10;
      }
      used.push({x0: left, x1: left + TW, off, h: th, up});
      tg.style[up ? 'bottom' : 'top'] = `${h / 2 + off}px`;
    });
  }

  /* ---------- follow the money: shortest chain, payments preferred ---------- */
  function shortest(a: string, b: string): string[] | null {
    const dist: Record<string, number> = {}, prev: Record<string, string> = {}, Q = new Set(Object.keys(adj));
    for (const k of Q) dist[k] = 1e9;
    if (!(a in dist) || !(b in dist)) return null;
    dist[a] = 0;
    while (Q.size) {
      let u: string | null = null;
      for (const k of Q) if (u === null || dist[k] < dist[u]) u = k;
      Q.delete(u!);
      if (u === b || dist[u!] >= 1e9) break;
      for (const v of adj[u!]) {
        const B = bundles[bkey(u!, v)];
        const w = B.links.some(l => l.fam === 'money') ? 1 : B.links.some(l => l.fam === 'owns') ? 1.3 : 2.2;
        if (dist[u!] + w < dist[v]) { dist[v] = dist[u!] + w; prev[v] = u!; }
      }
    }
    if (dist[b] >= 1e9) return null;
    const p = [b];
    while (p[0] !== a) p.unshift(prev[p[0]]);
    return p;
  }
  function runPath(): void {
    const a = q<HTMLSelectElement>('.tw-pfrom').value, b = q<HTMLSelectElement>('.tw-pto').value;
    if (!a || !b || a === b) return;
    const p = shortest(a, b);
    if (!p) { showRule(`No chain of links joins <b>${esc(E[a].short)}</b> and <b>${esc(E[b].short)}</b> in the records yet.`); return; }
    pathIds = p;
    go('path');
  }

  /* ---------- chrome ---------- */
  const ARR: Record<Arrange, string> = {control: 'Who controls whom', groups: 'Linked groups', kind: 'By kind', grid: 'Grid'};
  function renderArrange(): void {
    root.querySelectorAll<HTMLButtonElement>('.tw-arrange button').forEach(b => {
      const m = b.dataset.a;
      b.setAttribute('aria-pressed', String(m === 'party' ? mode === 'party' : mode === 'case' && m === arrange));
    });
    const why = q<HTMLElement>('.tw-chosen');
    if (!why) return;
    why.textContent = mode !== 'case' ? '' : !arrangeChosen ? `${ARR[arrange]}: your choice` : arrange === 'control'
      ? `Chosen because ${nControl} of ${D.links.length} links are ownership or directorship`
      : `Chosen because ${D.links.length - nControl} of ${D.links.length} links are payments and other ties, so groups show who deals with whom`;
  }
  const showRule = (h: string) => { q('.tw-rule').innerHTML = h; };
  function renderChrome(): void {
    const titles: Record<Mode, string> = {case: 'the whole case', party: 'around a party', wire: 'one link, opened', path: 'following the money'};
    q('.tw-alttitle').textContent = titles[mode];
    root.querySelectorAll<HTMLButtonElement>('.tw-alt .stop').forEach(s => s.setAttribute('aria-current', String(s.dataset.m === (mode === 'path' ? 'case' : mode))));
    q<HTMLElement>('.tw-needle').style.top = `${({case: 5, party: 109, wire: 213, path: 5})[mode]}px`;
    if (!D.entities.length) { showRule('No parties in this case yet. Records you accept in Decide arrive here.'); return; }
    const f = flagsOf(focus);
    if (mode === 'case') {
      const nT = Object.values(terr).filter(t => t.id !== 'loose').length;
      const tail = `${D.entities.length} parties, ${D.links.length} links. Roll the wheel over a party to go down to it.`;
      showRule(arrange === 'control' ? `Owners and directors above what they own or run, one band per step down. ${tail}`
        : arrange === 'kind' ? `A column per kind, the most linked at the top. ${tail}`
          : arrange === 'grid' ? `Every party in name order. ${tail}`
            : `Each patch is a group of parties more linked to each other than to the rest: <b>${nT} ${nT === 1 ? 'group' : 'groups'}</b>, ${tail} Bigger dot, more links.`);
    }
    renderArrange();
    if (mode === 'party') {
      const why = focus === mostFlagged[0] && nOpen(f) ? ` Opened here because it has the most open Red Flags (${nOpen(f)}).` : '';
      showRule(`<b>${esc(E[focus].short)}</b> is in the middle. Owners and directors on the left, what it owns on the right, money in above, money out below. The next ring is chosen by flags and links.${why}`);
    }
    if (mode === 'wire' && bundles[wireKey]) {
      const B = bundles[wireKey];
      showRule(`Every record between <b>${esc(E[B.a].short)}</b> and <b>${esc(E[B.b].short)}</b>, on a line of dates. Above the line goes one way, below goes back. Each tag is the source that shows it.`);
    }
    if (mode === 'path') showRule(`The shortest chain of links from <b>${esc(E[pathIds[0]].short)}</b> to <b>${esc(E[pathIds[pathIds.length - 1]].short)}</b>: ${pathIds.length - 1} ${pathIds.length === 2 ? 'step' : 'steps'}. Payments are preferred over other links when there is a choice. Everything else is set aside, not removed.`);
    const ol = q<HTMLOListElement>('.tw-trail ol');
    ol.textContent = '';
    trail.forEach(id => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = E[id].short; b.onclick = () => go('party', {id});
      li.appendChild(b); ol.appendChild(li);
    });
    q('.tw-blens').setAttribute('aria-pressed', String(lens.on && mode === 'case'));
    renderActive();
    q('.tw-bpath').setAttribute('aria-pressed', String(mode === 'path'));
  }

  /* drawer */
  const drawer = q<HTMLElement>('.tw-drawer');
  function openDrawer(id: string): void {
    const e = E[id], f = flagsOf(id), accts = D.entities.filter(a => a.holder === id);
    const nb = [...(adj[id] || [])], fams: Record<string, number> = {};
    nb.forEach(n => bundles[bkey(id, n)].links.forEach(l => { fams[l.fam] = (fams[l.fam] || 0) + 1; }));
    drawer.innerHTML = `<button type="button" class="x" aria-label="Close">✕</button>
      <div class="kind">${esc((KIND[e.kind] ?? KIND.other).name)}${e.jur ? ` · ${esc(e.jur.toUpperCase())}` : ''}</div><h2>${esc(e.name)}</h2>${e.note ? `<p>${esc(e.note)}</p>` : ''}
      ${nOpen(f) ? `<h3>Red Flags · ${nOpen(f)} open</h3><ul>${f.items.slice(0, 4).map(x => `<li><button type="button" class="flagrow" data-flag="${esc(x.flag_id)}"><span class="flagchip ${esc(x.level)}">${esc(x.level)}</span> ${esc(x.text)}</button></li>`).join('')}</ul>` : ''}
      ${accts.length ? `<h3>Accounts held · ${accts.length}</h3><ul>${accts.map(a => `<li>${esc(a.name)}</li>`).join('')}</ul>` : ''}
      <h3>Links · ${nb.length} ${nb.length === 1 ? 'party' : 'parties'}</h3><p class="num">${Object.entries(fams).map(([k, n]) => `${n} ${esc((FAM[k] || FAM.other).n.toLowerCase())}`).join(' · ') || 'None yet'}</p>
      <div class="acts"><button type="button" class="pri" data-act="centre">Centre here</button><button type="button" data-act="from">Follow the money from here</button><button type="button" data-act="dossier">Open the dossier</button></div>`;
    drawer.classList.add('open');
    drawer.querySelector<HTMLButtonElement>('.x')!.onclick = () => drawer.classList.remove('open');
    drawer.querySelectorAll<HTMLButtonElement>('[data-flag]').forEach(b => { b.onclick = () => hooks.openFlag(b.dataset.flag!); });
    drawer.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === 'centre') go('party', {id});
        else if (b.dataset.act === 'from') { q<HTMLSelectElement>('.tw-pfrom').value = id; togglePath(true); } else hooks.openDossier(id);
      };
    });
  }
  function onNodeClick(id: string): void {
    if (id.startsWith('chain')) { const c = chains.find(x => x.id === id); if (c) c.open = true; go('case'); return; }
    if ((mode === 'party' && id !== focus) || mode === 'case') { go('party', {id}); openDrawer(id); return; }
    openDrawer(id);
  }

  /* tooltips */
  const tip = q<HTMLDivElement>('.tw-tip');
  const placeTip = (ev: MouseEvent) => { const p = local(ev); tip.style.left = `${Math.min(W - 290, p.x + 14)}px`; tip.style.top = `${Math.min(H - 120, p.y + 14)}px`; };
  function showTip(ev: MouseEvent, id: string): void {
    if (id.startsWith('chain')) {
      const c = chains.find(x => x.id === id)!;
      tip.innerHTML = `<b>${c.mids.length > 1 ? `Chain of ${c.mids.length} companies` : 'One company in between'}</b><span class="m">${c.mids.map(m => esc(E[m].short)).join(' → ')}. Each owns the next and nothing else. Click to open it out.</span>`;
    } else {
      const e = E[id], f = flagsOf(id);
      tip.innerHTML = `<b>${esc(e.short)}</b><span class="m">${esc((KIND[e.kind] ?? KIND.other).name)}${e.jur ? ` · ${esc(placeName(e.jur))}` : ''} · ${deg[id]} linked ${deg[id] === 1 ? 'party' : 'parties'}${nOpen(f) ? ` · ${nOpen(f)} open flags` : ''}</span>`;
    }
    placeTip(ev);
    tip.classList.add('on');
  }
  function showLinkTip(ev: MouseEvent, S: Strand): void {
    const n = S.links.length, fam = (FAM[S.fam] || FAM.other).n;
    let h = `<b>${esc(E[S.s].short)} → ${esc(E[S.t].short)}</b><span class="m">${n} ${S.fam === 'money' ? (n > 1 ? 'payments' : 'payment') : fam.toLowerCase() + (n > 1 ? ` ×${n}` : '')}${S.sum ? ` · ${esc(fmtAmt(S.sum, S.cur))}` : ''}</span>`;
    const via = S.links.filter(l => rep(l.s) !== l.s || rep(l.t) !== l.t);
    if (via.length) h += `<span class="m">Through ${via.length > 1 ? 'accounts' : 'an account'} held by ${esc(rep(via[0].s) !== via[0].s ? E[rep(via[0].s)].short : E[rep(via[0].t)].short)}</span>`;
    h += '<span class="m">Click to open every record on this link.</span>';
    tip.innerHTML = h;
    placeTip(ev);
    tip.classList.add('on');
  }
  const hideTip = () => tip.classList.remove('on');
  let litLink: string | null = null;
  function setLitLink(k: string | null): void {
    if (litLink && edgeEls[litLink]) { edgeEls[litLink].g.classList.remove('lit'); edgeEls[litLink].lab?.g.classList.remove('lit'); kick(); }
    litLink = k && edgeEls[k] ? k : null;
    if (!litLink) { hideTip(); return; }
    const R = edgeEls[litLink];
    R.g.classList.add('lit'); R.lab?.g.classList.add('lit');
    kick();  // a lit link is drawn whole, even when it is long enough to be drawn as two lettered ends
    const words = R.lab?.body.textContent ?? '';
    const sure = R.S.sure ? SURE[R.S.sure] : null;
    tip.innerHTML = `<b>${esc(E[R.S.s]?.short ?? '')} ${esc(words)} ${esc(E[R.S.t]?.short ?? '')}</b><span class="m">${sure ? `${esc(sure.g)} ${esc(sure.n)} · ` : ''}Enter opens every record on this link · J / K next, previous</span>`;
    const r = R.lab?.g.getBoundingClientRect(), box = root.getBoundingClientRect();
    tip.style.left = `${Math.min(W - 290, Math.max(8, (r ? r.left - box.left : W / 2)))}px`;
    tip.style.top = `${Math.min(H - 120, (r ? r.bottom - box.top : H / 2) + 8)}px`;
    tip.classList.add('on');
  }

  /* key */
  (() => {
    let h = '';
    for (const kk of ['person', 'company', 'org', 'property', 'vehicle']) h += `<div class="row"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="${KIND[kk].fill}" stroke="${KIND[kk].ring}" stroke-width="1.3"/><use href="#${KIND_SYMBOL[kk]}" x="3.5" y="3.5" width="11" height="11" color="${KIND[kk].ring}"/></svg>${KIND[kk].name}</div>`;
    for (const f of ['owns', 'runs', 'money', 'other']) h += `<div class="row"><svg width="30" height="10" aria-hidden="true"><path d="M2 5H28" stroke="${FAM[f].c}" stroke-width="2.4" ${f === 'other' ? 'stroke-dasharray="5 4"' : ''}/></svg>${FAM[f].n}</div>`;
    h += '<div class="row"><svg width="30" height="10" aria-hidden="true"><path d="M2 5H28" stroke="#c98a5e" stroke-width="2"/><path d="M2 5H28" stroke="#ffd9a8" stroke-width="3.4" stroke-dasharray="1 9" stroke-linecap="round"/></svg>Lights run the way money went</div>';
    h += '<div class="row"><svg width="30" height="10" aria-hidden="true"><path d="M2 5H28" stroke="#c98a5e" stroke-width="1.2"/></svg>Thicker line, more money</div>';
    h += '<div class="row"><svg width="30" height="12" aria-hidden="true"><circle cx="5" cy="6" r="4" fill="#393941" stroke="#a8a2b8"/><circle cx="16" cy="6" r="4" fill="#393941" stroke="#a8a2b8"/></svg>Accounts, kept on their holder</div>';
    q('.tw-key-body').innerHTML = h;
    // How sure: always on (SEE_1). Colour says what a link is; the line and the glyph say how sure.
    const line = (extra: string, core = '') => `<svg width="34" height="10" aria-hidden="true"><path d="M2 5H32" stroke="#baac91" stroke-width="2" ${extra}/>${core}</svg>`;
    let k = '<div class="cap">How sure <span>always on</span></div>';
    k += `<div class="row">${line('')}<b>${SURE.shown.g}</b> shown</div>`;
    k += `<div class="row">${line(`stroke-dasharray="${SURE.unshown.dash}"`)}<b>${SURE.unshown.g}</b> not yet shown</div>`;
    k += `<div class="row"><svg width="34" height="10" aria-hidden="true"><path d="M2 5H32" stroke="${DISPUTED}" stroke-width="5"/><path d="M2 5H32" class="core" stroke-width="2"/></svg><b>${SURE.disputed.g}</b> disputed</div>`;
    k += `<div class="row">${line(`stroke-dasharray="${SURE.worked.dash}" stroke-linecap="round"`)}<b>${SURE.worked.g}</b> worked out by the app</div>`;
    k += `<div class="row">${line('stroke-opacity=".38"')}ended, drawn faint</div>`;
    k += '<div class="row"><svg width="34" height="14" aria-hidden="true"><path d="M1 7H8M26 7H33" stroke="#baac91" stroke-width="2"/><circle cx="12" cy="7" r="5" fill="none" stroke="#baac91"/><circle cx="22" cy="7" r="5" fill="none" stroke="#baac91"/></svg>a long link: its two ends, one letter</div>';
    k += '<div class="row"><svg width="34" height="14" aria-hidden="true"><circle cx="17" cy="7" r="5.5" fill="#4e4234" stroke="#d4a152" stroke-width="1.4"/><circle cx="17" cy="7" r="6.6" fill="none" stroke="#F6966A" stroke-width="1.4" transform="scale(1)"/></svg>a party with open Red Flags: its outline in the level\'s colour, dashed when faint; the corner circle counts them</div>';
    q('.tw-key-sure').innerHTML = k;
  })();

  /* active filters, as chips (SEE_1 "Active"): each one clears with its ✕ */
  function renderActive(): void {
    const box = q<HTMLDivElement>('.tw-active');
    if (!box) return;
    const chips: {t: string; clear: () => void}[] = [];
    if (range[0] > T0 + 0.01 || range[1] < T1 - 0.01) chips.push({t: `Dates ${fmtYM(range[0])} – ${fmtYM(range[1])}`, clear: () => { range[0] = T0; range[1] = T1; drawTime(); render(); }});
    if (mode === 'party' && E[focus]) chips.push({t: `Around ${E[focus].short}`, clear: () => go('case')});
    if (mode === 'wire' && bundles[wireKey]) chips.push({t: `One link: ${E[bundles[wireKey].a].short} – ${E[bundles[wireKey].b].short}`, clear: () => go('party', {noTrail: true})});
    if (mode === 'path' && pathIds.length > 1) chips.push({t: `Following ${E[pathIds[0]].short} → ${E[pathIds[pathIds.length - 1]].short}`, clear: () => { q('.tw-pathbox').classList.remove('on'); go('case'); }});
    if (lens.on && mode === 'case') chips.push({t: 'Lens', clear: () => toggleLens()});
    box.textContent = '';
    if (!chips.length) return;
    const cap = document.createElement('span');
    cap.className = 'cap'; cap.textContent = 'Active';
    box.appendChild(cap);
    for (const c of chips) {
      const sp = document.createElement('span'), b = document.createElement('button');
      sp.className = 'chip'; sp.textContent = `${c.t} `;
      b.type = 'button'; b.textContent = '✕'; b.setAttribute('aria-label', `Clear: ${c.t}`); b.onclick = c.clear;
      sp.appendChild(b); box.appendChild(sp);
    }
    if (chips.length > 1) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'clear'; b.textContent = 'Clear all';
      b.onclick = () => { range[0] = T0; range[1] = T1; if (lens.on) lens.on = false; q('.tw-pathbox').classList.remove('on'); drawTime(); go('case'); };
      box.appendChild(b);
    }
  }

  /* the counts under the time strip: what the window holds */
  let countsText = '';
  function renderCounts(): void {
    const all = D.links.filter(l => E[l.s] && E[l.t]);
    const full = range[0] <= T0 + 0.01 && range[1] >= T1 - 0.01;
    const undated = all.filter(l => !l.date).length;
    const held = all.filter(l => l.date && inRange(l)).length + undated;
    const ended = all.filter(l => inRange(l) && endedBy([l], range[1])).length;
    const t = `${full ? `Showing all ${all.length} ${all.length === 1 ? 'link' : 'links'}` : `Showing ${held} of ${all.length} links in this window`}`
      + `${ended ? ` · ${ended} ended, drawn faint` : ''}${undated ? ` · ${undated} undated, always shown` : ''}`
      + `${hiddenLabels ? ` · ${hiddenLabels} link ${hiddenLabels === 1 ? 'sentence' : 'sentences'} left off where ${hiddenLabels === 1 ? 'it' : 'they'} would overlap: zoom in` : ''}`;
    if (t === countsText) return;
    countsText = t;
    const p = q<HTMLParagraphElement>('.tw-counts');
    if (p) p.textContent = t;
  }

  /* time strip */
  const tsvg = q<SVGSVGElement>('.tw-tsvg');
  function drawTime(): void {
    tsvg.textContent = '';
    const r = tsvg.getBoundingClientRect(), w = r.width || 600, h = r.height || 74;
    const X = (t: number) => (Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0) * w;
    const bins: Record<string, number> = {};
    for (const l of D.links) {
      if (l.fam !== 'money' || !l.date || !l.amount) continue;
      const b = Math.floor(tval(l.date)! * 4) / 4;
      bins[b] = (bins[b] || 0) + l.amount;
    }
    const max = Math.max(1, ...Object.values(bins)), base = h - 18;
    el('line', {x1: 0, x2: w, y1: base, y2: base, stroke: '#6F8AA3'}, tsvg);
    const step = Math.max(1, Math.ceil((T1 - T0) / Math.max(1, w / 60)));
    for (let y = Math.ceil(T0); y <= T1; y += step) {
      const x = X(y);
      el('line', {x1: x, x2: x, y1: base, y2: base + 4, stroke: '#6F8AA3'}, tsvg);
      const t = el('text', {x: x + 3, y: base + 14, class: 'tcap'}, tsvg);
      t.textContent = String(y);
    }
    for (const b in bins) {
      const x = X(+b), bh = Math.max(2, Math.log10(bins[b] / 1e6 + 1) / Math.log10(max / 1e6 + 1) * (base - 22));
      const live = +b >= range[0] - 0.25 && +b <= range[1];
      const rc = el('rect', {x: x + 1, y: base - bh, width: Math.max(3, w / (T1 - T0) / 4 - 2), height: bh, rx: 1.5, fill: live ? '#c98a5e' : '#3d5268'}, tsvg);
      const ti = el('title', {}, rc);
      ti.textContent = `${Math.floor(+b)} Q${(+b % 1) * 4 + 1}: ${fmtAmt(bins[b], '')} paid`;
    }
    for (const e of D.events) {
      const t = tval(e.date);
      if (t == null) continue;
      const c = el('circle', {cx: X(t), cy: 8, r: 3, fill: '#7FB7E0', 'fill-opacity': 0.8}, tsvg);
      const ti = el('title', {}, c);
      ti.textContent = `${fmtDate(e.date)}: ${e.title}`;
    }
    const tc = el('text', {x: 0, y: -2, class: 'tcap'}, tsvg);
    tc.textContent = W <= 560 ? 'Money per quarter' : 'Money paid per quarter · dots are dated events';
    const a = X(range[0]), b = X(range[1]);
    el('rect', {x: 0, y: 12, width: a, height: base - 12, class: 'shade'}, tsvg);
    el('rect', {x: b, y: 12, width: w - b, height: base - 12, class: 'shade'}, tsvg);
    for (const [x, i] of [[a, 0], [b, 1]] as const) {
      const g = el('g', {class: 'handle', tabindex: 0, role: 'slider', 'aria-label': i ? 'End of the window' : 'Start of the window',
        'aria-valuemin': T0, 'aria-valuemax': T1, 'aria-valuenow': range[i].toFixed(2), 'aria-valuetext': fmtYM(range[i])}, tsvg);
      el('rect', {x: x - 16, y: 12, width: 32, height: base - 12, fill: 'transparent'}, g);
      el('line', {x1: x, x2: x, y1: 12, y2: base, stroke: '#E8A95B', 'stroke-width': 2}, g);
      el('rect', {x: x - 4, y: (base + 12) / 2 - 10, width: 8, height: 20, rx: 3, fill: '#E8A95B'}, g);
      const set = (t: number) => {
        if (i === 0) range[0] = Math.min(range[1] - 0.25, Math.max(T0, t)); else range[1] = Math.max(range[0] + 0.25, Math.min(T1, t));
        drawTime(); render();
      };
      g.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        const mv = (e2: PointerEvent) => set(T0 + (e2.clientX - r.left) / w * (T1 - T0));
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
      });
      g.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); set(range[i] + (ev.key === 'ArrowRight' ? 0.25 : -0.25)); root.querySelectorAll<SVGGElement>('.handle')[i]?.focus(); }
      });
    }
    renderCounts(); renderActive();
    const lab = el('text', {x: w, y: -2, 'text-anchor': 'end', class: 'tcap win'}, tsvg);
    lab.textContent = (range[0] <= T0 + 0.01 && range[1] >= T1 - 0.01) ? (W <= 560 ? 'All dates · drag' : 'Showing all dates · drag the handles') : `Showing ${fmtYM(range[0])} – ${fmtYM(range[1])}`;
  }
  let playing = 0;
  const playIcon = q<SVGPathElement>('.tw-play path');
  on(q('.tw-play'), 'click', () => {
    if (playing) { cancelAnimationFrame(playing); playing = 0; playIcon.setAttribute('d', 'M4 2.5v11l9-5.5z'); return; }
    playIcon.setAttribute('d', 'M4 3h3v10H4zM9 3h3v10H9z');
    const startEnd = Math.min(T1, T0 + Math.max(0.5, (T1 - T0) * 0.2));
    range[0] = T0; range[1] = startEnd;
    const t0 = performance.now();
    const stepFn = (now: number) => {
      const p = Math.min(1, (now - t0) / 9000);
      range[1] = startEnd + p * (T1 - startEnd);
      drawTime(); render();
      if (p < 1) playing = requestAnimationFrame(stepFn); else { playing = 0; playIcon.setAttribute('d', 'M4 2.5v11l9-5.5z'); }
    };
    playing = requestAnimationFrame(stepFn);
  });

  /* ---------- input ---------- */
  // Mouse: drag to pan, wheel to zoom. Touch (the prototype's 21 Oct pass): one finger pans, even when it starts on a
  // card, and only becomes a pan once it moves; two fingers pinch and pan together. A pan or pinch never also counts
  // as a tap on whatever the fingers ended on.
  let drag: {x: number; y: number; cx: number; cy: number; moved: boolean; id?: number} | null = null;
  let gestured = false, pinch: {d: number; mx: number; my: number} | null = null;
  const touchPts = new Map<number, {x: number; y: number}>();
  const pdist = () => { const [a, b] = [...touchPts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const pmid = () => { const [a, b] = [...touchPts.values()]; return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; };
  const moveLens = (p: {x: number; y: number}) => { lens.x = Math.max(lens.R + 20, Math.min(W - lens.R - 20, p.x)); lens.y = Math.max(lens.R + 40, Math.min(H - lens.R - 40, p.y)); kick(); };
  // One zoom for wheel and pinch: past a depth, the view changes altitude under the pointer or the fingers.
  function zoomAt(f: number, p: {x: number; y: number}, out: boolean): void {
    const before = toWorld(p.x, p.y);
    C.k = Math.max(0.15, Math.min(4, C.k * f));
    const after = toWorld(p.x, p.y);
    C.x += before.x - after.x; C.y += before.y - after.y;
    kick();
    if (mode === 'case' && C.k > 1.9) {
      let best: string | null = null, bd = 90;
      for (const id in node) {
        const N = node[id];
        if (N.cur.v < 1 || N.isChain) continue;
        const s = toScreen(N.cur.x, N.cur.y), d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < bd) { bd = d; best = id; }
      }
      if (best) go('party', {id: best, slow: true});
    } else if (mode === 'party' && C.k < 0.42) go('case');
    else if (mode === 'wire' && out) go('party', {noTrail: true});
    else if (mode === 'path' && C.k < 0.3) go('case');
  }
  const capture = (id: number) => { try { svg.setPointerCapture?.(id); } catch { /* the pointer is already gone */ } };
  on<PointerEvent>(svg, 'pointerdown', e => {
    gestured = false;
    if (e.pointerType === 'touch') {
      touchPts.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (touchPts.size === 2) {
        gestured = true; drag = null;
        const m = pmid();
        pinch = {d: pdist() || 1, mx: m.x, my: m.y};
        for (const id of touchPts.keys()) capture(id);
      } else if (touchPts.size === 1) {
        drag = {x: e.clientX, y: e.clientY, cx: C.x, cy: C.y, moved: false, id: e.pointerId};
        if (lens.on && mode === 'case') moveLens(local(e));
      }
      return;
    }
    if ((e.target as Element).closest('.node,.hit,.more,.elab')) return;
    drag = {x: e.clientX, y: e.clientY, cx: C.x, cy: C.y, moved: false};
    svg.classList.add('drag');
    capture(e.pointerId);
  });
  on<PointerEvent>(svg, 'pointermove', e => {
    if (e.pointerType === 'touch') {
      if (!touchPts.has(e.pointerId)) return;
      touchPts.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pinch && touchPts.size >= 2) {
        const d = pdist() || 1, m = pmid();
        if (!tw) { C.x -= (m.x - pinch.mx) / C.k; C.y -= (m.y - pinch.my) / C.k; zoomAt(d / pinch.d, local({clientX: m.x, clientY: m.y}), d < pinch.d); }
        pinch.d = d; pinch.mx = m.x; pinch.my = m.y;
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) <= 8) return;
        drag.moved = true; gestured = true; capture(e.pointerId);
      }
      if (lens.on && mode === 'case') moveLens(local(e));
      else { C.x = drag.cx - dx / C.k; C.y = drag.cy - dy / C.k; kick(); }
      return;
    }
    if (lens.on && mode === 'case') moveLens(local(e));
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; gestured = true; }
    C.x = drag.cx - dx / C.k; C.y = drag.cy - dy / C.k;
    kick();
  });
  const endPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      touchPts.delete(e.pointerId);
      if (touchPts.size < 2) pinch = null;
      // Lifting one finger of a pinch carries on as a pan with the other.
      if (touchPts.size === 1) { const [id, p] = [...touchPts.entries()][0]; drag = {x: p.x, y: p.y, cx: C.x, cy: C.y, moved: true, id}; } else drag = null;
      return;
    }
    drag = null;
    svg.classList.remove('drag');
  };
  on<PointerEvent>(svg, 'pointerup', endPointer);
  on<PointerEvent>(svg, 'pointercancel', endPointer);
  on<MouseEvent>(svg, 'click', e => { if (gestured) { e.stopPropagation(); e.preventDefault(); } }, {capture: true});
  on<WheelEvent>(svg, 'wheel', e => {
    e.preventDefault();
    if (tw) return;
    zoomAt(Math.exp(-e.deltaY * 0.0016), local(e), e.deltaY > 0);
  }, {passive: false});
  on(svg, 'click', () => { if (gestured) return; drawer.classList.remove('open'); });
  root.querySelectorAll<HTMLButtonElement>('.tw-alt .stop').forEach(b => on(b, 'click', () => {
    const m = b.dataset.m as Mode;
    if (m === 'wire') {
      const k = Object.keys(bundles).filter(x => x.split('|').includes(focus)).sort((x, y) => bundles[y].links.length - bundles[x].links.length)[0];
      if (!k) return;
      if (mode === 'case') go('party');
      openWire(k);
    } else go(m);
  }));
  root.querySelectorAll<HTMLButtonElement>('.tw-arrange button').forEach(b => on(b, 'click', () => {
    const m = b.dataset.a!;
    if (m === 'party') { go('party'); return; }
    arrange = m as Arrange; arrangeChosen = false;
    relayout();
    go('case');
  }));
  const toggleLens = () => { lens.on = !lens.on; if (lens.on && mode !== 'case') go('case'); lens.x = W / 2; lens.y = H / 2; renderChrome(); kick(); };
  on(q('.tw-blens'), 'click', toggleLens);
  function togglePath(open: boolean): void { q('.tw-pathbox').classList.toggle('on', open); if (open) runPath(); else go('party', {noTrail: true}); }
  on(q('.tw-bpath'), 'click', () => togglePath(mode !== 'path'));
  on(q('.tw-pgo'), 'click', runPath);
  const bGroup = q<HTMLButtonElement>('.tw-bgroup');
  on(bGroup, 'click', () => {
    rollAccounts = !rollAccounts;
    bGroup.setAttribute('aria-pressed', String(rollAccounts));
    build();
    relayout();
    D.entities.forEach(e => { if (node[e.id]) paintCard(node[e.id]); });
    go(mode === 'wire' ? 'party' : mode, {noTrail: true});
  });
  const nextFlagged = () => { if (!mostFlagged.length) return; const i = mostFlagged.indexOf(focus); go('party', {id: mostFlagged[(i + 1) % mostFlagged.length]}); };
  const back = () => {
    if (drawer.classList.contains('open')) drawer.classList.remove('open');
    else if (mode === 'wire') go('party', {noTrail: true});
    else if (mode === 'party' || mode === 'path') { q('.tw-pathbox').classList.remove('on'); go('case'); }
  };
  on(q('.tw-bnext'), 'click', nextFlagged);
  // Narrow (the phone layout): the altitude bar's Back and Next stand in for Esc and the trail, and the drawer is a
  // sheet that a swipe down closes.
  on(q('.tw-mback'), 'click', back);
  on(q('.tw-mnext'), 'click', nextFlagged);
  let sheetY: number | null = null;
  on<TouchEvent>(drawer, 'touchstart', e => { sheetY = drawer.scrollTop <= 0 ? e.touches[0].clientY : null; }, {passive: true});
  on<TouchEvent>(drawer, 'touchend', e => {
    if (sheetY !== null && e.changedTouches[0].clientY - sheetY > 70 && W <= 900) drawer.classList.remove('open');
    sheetY = null;
  }, {passive: true});
  const sIn = q<HTMLInputElement>('.tw-search');
  on(sIn, 'change', () => {
    const e = D.entities.find(x => x.name === sIn.value || x.short === sIn.value);
    if (e) { go('party', {id: rep(e.id)}); openDrawer(rep(e.id)); }
    sIn.value = '';
  });
  let stepIdx = -1;
  const ringOrder = () => [...(adj[focus] || [])].sort((a, b) => (node[a].tgt.a || 0) - (node[b].tgt.a || 0));
  on<KeyboardEvent>(window, 'keydown', e => {
    // The Wire shares its stage with Money: act only when its own tab is the one showing.
    if (!hooks.active() || !onScreen(root) || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    if (e.key === '/') { e.preventDefault(); sIn.focus(); } else if (e.key === 'l' || e.key === 'L') toggleLens();
    else if (e.key === 'f' || e.key === 'F') togglePath(mode !== 'path');
    else if (e.key === 'Escape') back();
    else if (e.key === 'Backspace' && trail.length > 1) { trail.pop(); go('party', {id: trail[trail.length - 1], noTrail: true}); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && mode === 'party') {
      const r = ringOrder();
      if (!r.length) return;
      e.preventDefault();
      stepIdx = (stepIdx + (e.key === 'ArrowRight' ? 1 : -1) + r.length) % r.length;
      const id = r[stepIdx];
      openDrawer(id);
      const rect = node[id].card.querySelector('rect');
      rect?.setAttribute('stroke-width', '3');
      window.setTimeout(() => rect?.setAttribute('stroke-width', '1.4'), 900);
    } else if (e.key === 'Enter' && litLink) { const k = litLink.split('#')[0]; setLitLink(null); openWire(k); }
    else if (e.key === 'Enter' && mode === 'party' && stepIdx >= 0) { const r = ringOrder(); go('party', {id: r[stepIdx]}); stepIdx = -1; }
    else if ((e.key === 'j' || e.key === 'J' || e.key === 'k' || e.key === 'K') && (mode === 'party' || mode === 'case')) {
      // J / K: the next or previous link with its sentence on screen (SEE_1); Enter opens it.
      const keys = Object.keys(edgeEls).filter(k => edgeEls[k].lab && edgeEls[k].lab!.g.style.display !== 'none').sort((a, b) => pri(edgeEls[b]) - pri(edgeEls[a]));
      if (!keys.length) return;
      e.preventDefault();
      const i = litLink ? keys.indexOf(litLink) : -1;
      setLitLink(keys[(i + (e.key.toLowerCase() === 'j' ? 1 : -1) + keys.length + (i < 0 && e.key.toLowerCase() === 'k' ? 1 : 0)) % keys.length]);
    }
  });
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    drawTime();
    if (mode === 'wire') drawWire();
    go(mode, {noTrail: true});
  });
  ro?.observe(root);

  /* ---------- boot ---------- */
  for (const e of D.entities) mkNode(e.id, false);
  chains.forEach(c => mkNode(c.id, true));
  D.entities.forEach(e => paintCard(node[e.id]));
  const names = q<HTMLDataListElement>('datalist');
  const opts = D.entities.filter(e => !e.holder).sort((a, b) => a.short.localeCompare(b.short));
  opts.forEach(e => { const o = document.createElement('option'); o.value = e.short; names.appendChild(o); });
  for (const sel of ['.tw-pfrom', '.tw-pto']) opts.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.short; q(sel).appendChild(o); });
  if (mostFlagged.length > 1) { q<HTMLSelectElement>('.tw-pfrom').value = mostFlagged[1]; q<HTMLSelectElement>('.tw-pto').value = mostFlagged[0]; }
  // Start on the whole map, then go down to the most-flagged party.
  const T = caseTargets();
  for (const id in T) { Object.assign(node[id].cur, T[id]); node[id].tgt = {...T[id]}; }
  Object.assign(C, fitBox(Object.values(T).filter(t => t.o), 120));
  mode = 'case';
  drawStatic(); render(); renderChrome(); drawTime();
  // Link chips are sized from their text; measured before the web fonts arrive, the real text overflowed them.
  let fontsLive = true;
  document.fonts?.ready.then(() => {
    if (!fontsLive) return;
    for (const R of Object.values(edgeEls)) {
      if (!R.lab) continue;
      let tw = 0;
      try { tw = R.lab.t.getComputedTextLength(); } catch { /* not laid out */ }
      if (tw > 0) { sizePill(R.lab.g, tw + 14); R.lab.w = tw + 14; }
    }
    kick();
  }).catch(() => undefined);
  const boot = window.setTimeout(() => { if (focus && deg[focus]) go('party', {id: focus, slow: true}); }, RM() ? 0 : 900);

  return () => {
    fontsLive = false;
    window.clearTimeout(boot); window.clearTimeout(wireTimer);
    if (raf) cancelAnimationFrame(raf);
    if (playing) cancelAnimationFrame(playing);
    ro?.disconnect();
    cleanups.forEach(f => f());
    for (const sel of ['.tw-nodes', '.tw-edges', '.tw-terr', '.tw-terr-l', '.tw-sec', '.tw-more', '.tw-lens', '.tw-wsvg', '.tw-tsvg']) { const x = root.querySelector(sel); if (x) x.textContent = ''; }
    root.querySelectorAll('datalist option, .tw-pfrom option, .tw-pto option, .tw-wire .end, .tw-wire .tag').forEach(x => x.remove());
  };
}
