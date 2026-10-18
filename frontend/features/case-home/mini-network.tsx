'use client';
// "See · who is linked" on Case home: the six most-linked parties and the links
// between them, each link drawn by how sure it is (solid shown, dashed not yet
// shown, double disputed) and named in words beneath. Pointing at a party lights it
// everywhere (the shared pointedParty).
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {getInvestigationGraphOptions} from '../../lib/generated/@tanstack/react-query.gen';
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

function Mark({shape}: {shape: Shape}): ReactElement {
  if (shape === 'person') return <circle r={8}/>;
  if (shape === 'property') return <path d="M-8,8 V-1 L0,-9 L8,-1 V8 Z"/>;
  if (shape === 'account') return <path d="M0,-9 L9,0 L0,9 L-9,0 Z"/>;
  return <rect x={-8} y={-8} width={16} height={16} rx={3}/>;
}

export function MiniNetwork({investigationId}: {investigationId: string}): ReactElement {
  const graphQuery = useQuery({...getInvestigationGraphOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const graph = graphQuery.data;
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const point = useWorkbenchStore(state => state.setPointedParty);
  const nodes = graph?.nodes ?? [];
  const edges = (graph?.edges ?? []).filter(e => e.source && e.target);
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
        const mark = sure === 'supported' ? '✓' : sure === 'disputed' ? '×' : '○';
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
        return <g key={n.id} className={`ch-node${on ? ' on' : ''}`} transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button"
          aria-label={`${n.caption}, ${degree.get(n.id) ?? 0} links`} aria-pressed={on}
          onMouseEnter={() => point(n.id)} onFocus={() => point(n.id)} onClick={() => point(on ? null : n.id)}>
          <Mark shape={shapeOf(n.schema)}/>
          <text y={p.y > H / 2 ? 22 : -13} textAnchor="middle">{n.caption.length > 22 ? `${n.caption.slice(0, 21)}…` : n.caption}</text>
        </g>;
      })}
    </svg>
    <figcaption>
      <span><i className="ch-key ch-key-supported"/>shown</span>
      <span><i className="ch-key ch-key-unshown"/>not yet shown</span>
      <span><i className="ch-key ch-key-disputed"/>disputed</span>
      <span className="ch-net-count">{nodes.length} parties · {edges.length} links</span>
    </figcaption>
  </figure>;
}
