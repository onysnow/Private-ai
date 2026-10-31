'use client';
// "See · who is linked" on Case home: the six most-linked parties and the links
// between them, each link drawn by how sure it is (solid shown, dashed not yet
// shown, double disputed) and named in words beneath. Pointing at a party lights it
// everywhere (the shared pointedParty). The year rail's "as of" year shows the links
// that held then (lib/as-of.ts), as the network does.
import {useQuery} from '@tanstack/react-query';
import {useRef} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {KIND_ICON} from '../../components/network/party-icons';
import {Reveal} from '../../components/ui/reveal';
import {linkSpan, shownAsOf} from '../../lib/as-of';
import {PARTY, partyKind} from '../../lib/viz-tokens';

import {getInvestigationGraphOptions, getStandingOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {RelationshipOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Sure = 'supported' | 'disputed' | 'unshown';
const W = 360;
const H = 190;

export function linkSure(edge: RelationshipOut): Sure {
  const state = String((edge.advisory as {support_state?: string} | null | undefined)?.support_state ?? '');
  if (/challenged|mixed_support|conflict/.test(state)) return 'disputed';
  if (/independent|^supported/.test(state)) return 'supported';
  return 'unshown';
}

/** The year a link is dated in, from its own dates. */
export function linkYear(edge: RelationshipOut): string | null {
  const props = (edge.properties ?? {}) as Record<string, unknown>;
  for (const key of ['date', 'startDate', 'endDate']) {
    const values = props[key];
    const first = Array.isArray(values) ? values[0] : values;
    const year = String(first ?? '').slice(0, 4);
    if (/^\d{4}$/.test(year)) return year;
  }
  return null;
}

const SIGN: Record<string, string> = {EUR: '€', GBP: '£', USD: '$'};
const first = (edge: RelationshipOut, key: string): string => {
  const v = ((edge.properties ?? {}) as Record<string, unknown>)[key];
  return String((Array.isArray(v) ? v[0] : v) ?? '');
};
function amountText(amount: number, currency: string): string {
  const sign = SIGN[currency] ?? (currency ? `${currency} ` : '');
  const shown = amount >= 1_000_000 ? `${Number((amount / 1_000_000).toPrecision(3))}M`
    : amount >= 100_000 ? `${Math.round(amount / 1000)}k` : amount.toLocaleString('en-GB');
  return `${sign}${shown}`;
}

/** The links between two parties in a word or two, as the mockup labels them:
 *  "director", "owns", payments added up as "paid €29,400". */
export function linkWord(edges: RelationshipOut | RelationshipOut[]): string {
  const list = Array.isArray(edges) ? edges : [edges];
  const payments = list.filter(e => e.schema === 'Payment');
  const words: Record<string, string> = {Ownership: 'owns', Directorship: 'director', Membership: 'member', Employment: 'employed',
    Family: 'family', Associate: 'associate', Representation: 'represents', Succession: 'succeeded', Debt: 'owes', Sponsorship: 'sponsor'};
  const out = [...new Set(list.filter(e => e.schema !== 'Payment').map(e => words[e.schema] ?? e.schema.toLowerCase()))];
  if (payments.length) {
    const currencies = new Set(payments.map(e => first(e, 'currency').toUpperCase()));
    const sum = payments.reduce((n, e) => n + (Number(first(e, 'amount')) || 0), 0);
    out.push(currencies.size === 1 && sum > 0 ? `paid ${amountText(sum, [...currencies][0])}` : 'paid');
  }
  return out.slice(0, 2).join(' · ');
}

type Shape = 'person' | 'property' | 'account' | 'company';
export function shapeOf(schema: string): Shape {
  if (schema === 'Person') return 'person';
  if (['RealEstate', 'Asset', 'Vessel', 'Airplane', 'Vehicle'].includes(schema)) return 'property';
  if (['BankAccount', 'CryptoWallet', 'Security'].includes(schema)) return 'account';
  return 'company';
}

/** A party as the Relationships network draws it: its kind's icon in the kind's ring colour (party-icons.ts, PARTY). */
function Mark({schema}: {schema: string}): ReactElement {
  const kind = partyKind(schema);
  const Icon = KIND_ICON[kind];
  const ring = PARTY[kind].ring;
  return <g className="ch-node-mark" style={{color: ring}}>
    <circle className="ch-node-dot" r={10} style={{stroke: ring}}/>
    {Icon ? <Icon className="ch-node-icon" x={-6.5} y={-6.5} size={13} strokeWidth={2.2}/> : <circle className="ch-node-other" r={2.5} style={{fill: ring}}/>}
  </g>;
}

export function MiniNetwork({investigationId}: {investigationId: string}): ReactElement {
  const graphQuery = useQuery({...getInvestigationGraphOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  // Every party in the case, counted on the server (the same standing Case home reads).
  const inCase = useQuery({...getStandingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data?.network.parties;
  const graph = graphQuery.data;
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const point = useWorkbenchStore(state => state.setPointedParty);
  const asOf = useWorkbenchStore(state => state.asOf);
  // Pointing (hover or focus) already lights a party; the click that follows keeps it lit
  // rather than turning it off again. A second click turns it off.
  const pointedByHover = useRef<string | null>(null);
  const reach = (id: string) => {
    if (pointed === id) return;
    pointedByHover.current = id;
    point(id);
  };
  const press = (id: string) => {
    if (pointedByHover.current === id) { pointedByHover.current = null; return; }
    pointedByHover.current = null;
    point(pointed === id ? null : id);
  };
  const edges = (graph?.edges ?? []).filter(e => e.source && e.target
    && shownAsOf(linkSpan(e.properties as Record<string, string[] | undefined>), asOf));
  // As of a year, the parties are those with a link that held then.
  const linked = new Set(edges.flatMap(e => [e.source!.id, e.target!.id]));
  const nodes = (graph?.nodes ?? []).filter(n => asOf === null || linked.has(n.id));
  const degree = new Map<string, number>();
  for (const e of edges) for (const id of [e.source!.id, e.target!.id]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const top = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.caption.localeCompare(b.caption)).slice(0, 6);
  const at = new Map(top.map((n, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(top.length, 1);
    return [n.id, {x: W / 2 + Math.cos(angle) * (W / 2 - 62), y: H / 2 + Math.sin(angle) * (H / 2 - 34)}];
  }));
  const shownEdges = edges.filter(e => at.has(e.source!.id) && at.has(e.target!.id));
  // One line a pair of parties, however many links join them.
  const byPair = new Map<string, RelationshipOut[]>();
  for (const e of shownEdges) {
    const key = [e.source!.id, e.target!.id].sort().join('|');
    byPair.set(key, [...(byPair.get(key) ?? []), e]);
  }
  const pairs = [...byPair.values()];
  const placed: {x: number; y: number; w: number}[] = [];
  if (graphQuery.isPending && investigationId) return <div className="ch-skeleton" aria-busy="true" aria-label="Drawing who is linked"/>;
  if (!top.length && asOf !== null && graph?.nodes.length) return <p className="ch-empty">No link had started by {asOf}. Choose another year, or the same year again for all years.</p>;
  if (!top.length) return <p className="ch-empty">No parties linked yet. Links appear here once records are linked in Check.</p>;
  return <figure className="ch-net">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The ${top.length} most-linked parties and ${shownEdges.length} links between them`}>
      {pairs.map(group => {
        const e = group[0];
        const a = at.get(e.source!.id)!, b = at.get(e.target!.id)!;
        const sures = group.map(linkSure);
        const sure: Sure = sures.includes('disputed') ? 'disputed' : sures.every(x => x === 'supported') ? 'supported' : 'unshown';
        const lit = pointed && (pointed === e.source!.id || pointed === e.target!.id);
        const years = group.filter(x => x.schema !== 'Payment').map(linkYear).filter(Boolean);
        const mark = sure === 'supported' ? '✓' : sure === 'disputed' ? '✕' : '○';
        const label = [linkWord(group), years[0], mark].filter(Boolean).join(' ');
        // The label sits beside the line's middle, on its upper side.
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len, ny = dx / len;
        if (ny > 0) { nx = -nx; ny = -ny; }
        // Near the right or left side, put it on the inner side of the line so it stays in view.
        const mx = (a.x + b.x) / 2;
        if ((nx > 0.6 && mx > W - 110) || (nx < -0.6 && mx < 110)) { nx = -nx; ny = -ny; }
        const anchor = Math.abs(nx) > 0.6 ? (nx > 0 ? 'start' : 'end') : 'middle';
        const lx = (a.x + b.x) / 2 + nx * 9;
        let ly = (a.y + b.y) / 2 + ny * 9 + 3;
        // Move a label down a line while it would sit on one already placed.
        const width = label.length * 5;
        const left = anchor === 'start' ? lx : anchor === 'end' ? lx - width : lx - width / 2;
        for (let tries = 0; tries < 4 && placed.some(r => left < r.x + r.w && r.x < left + width && Math.abs(ly - r.y) < 11); tries += 1) ly += 11;
        placed.push({x: left, y: ly, w: width});
        return <g key={e.id} className={`ch-link ch-link-${sure}${lit ? ' lit' : ''}`}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
          {sure === 'disputed' && <line x1={a.x + nx * 3} y1={a.y + ny * 3} x2={b.x + nx * 3} y2={b.y + ny * 3}/>}
          {label && <text className="ch-link-label" x={lx} y={ly} textAnchor={anchor}>{label}</text>}
          <title>{group.map(x => `${x.source!.caption} → ${x.schema} → ${x.target!.caption}: ${({supported: 'shown', disputed: 'disputed', unshown: 'not yet shown'})[linkSure(x)]}`).join('\n')}</title>
        </g>;
      })}
      {top.map(n => {
        const p = at.get(n.id)!;
        const on = pointed === n.id;
        const name = n.caption.length > 22 ? `${n.caption.slice(0, 21)}…` : n.caption;
        const below = p.y > H / 2;
        const half = Math.max(12, name.length * 3.2);
        return <g key={n.id} className={`ch-node${on ? ' on' : ''}`} transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button"
          aria-label={`${n.caption}, ${PARTY[partyKind(n.schema)].name}, ${degree.get(n.id) ?? 0} links`} aria-pressed={on}
          onMouseEnter={() => reach(n.id)} onFocus={() => reach(n.id)} onClick={() => press(n.id)}
          onKeyDown={(event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); press(n.id); } }}>
          {/* The whole party, mark and name, takes the pointer: the gap between them is not the drawing's. */}
          <rect className="ch-node-hit" x={-half} y={below ? -11 : -25} width={half * 2} height={37}/>
          <title>{`${n.caption} · ${PARTY[partyKind(n.schema)].name}`}</title>
          <Mark schema={n.schema}/>
          <text y={below ? 22 : -13} textAnchor="middle">{name}</text>
        </g>;
      })}
    </svg>
    <figcaption>
      {/* The line styles are the marks; their key is on hover or focus of a small key mark (Ony, 29 Oct). */}
      <Reveal label="Key to the lines" detail={<>
        <span className="rv-row"><i className="ch-key ch-key-supported"/>shown</span>
        <span className="rv-row"><i className="ch-key ch-key-unshown"/>not yet shown</span>
        <span className="rv-row"><i className="ch-key ch-key-disputed"/>disputed</span>
        <span className="rv-row">Point at a party to light it everywhere.</span></>}>
        <span className="ch-net-key" aria-hidden="true"><i className="ch-key ch-key-supported"/><i className="ch-key ch-key-unshown"/><i className="ch-key ch-key-disputed"/></span></Reveal>
      <Reveal className="ch-net-count" detail={`${linked.size} ${linked.size === 1 ? 'party has' : 'parties have'} a link${asOf !== null ? ` as of ${asOf}` : ''}. ${inCase !== undefined ? `The case holds ${inCase} in all. ` : ''}The six most linked are drawn.`}>
        <span>{linked.size} linked{inCase !== undefined ? ` · ${inCase} in the case` : ''}{asOf !== null ? ` · as of ${asOf}` : ''}</span></Reveal>
    </figcaption>
  </figure>;
}
