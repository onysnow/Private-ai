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
    return [n.id, {x: W / 2 + Math.cos(angle) * (W / 2 - 62), y: H / 2 + Math.sin(angle) * (H / 2 - 26)}];
  }));
  const shownEdges = edges.filter(e => at.has(e.source!.id) && at.has(e.target!.id));
  if (graphQuery.isPending && investigationId) return <div className="ch-skeleton" aria-busy="true" aria-label="Drawing who is linked"/>;
  if (!top.length) return <p className="ch-empty">No parties linked yet. Links appear here once records are linked in Check.</p>;
  return <figure className="ch-net">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The ${top.length} most-linked parties and ${shownEdges.length} links between them`}>
      {shownEdges.map(e => {
        const a = at.get(e.source!.id)!, b = at.get(e.target!.id)!;
        const sure = linkSure(e);
        const lit = pointed && (pointed === e.source!.id || pointed === e.target!.id);
        const year = linkYear(e);
        const mark = sure === 'supported' ? ' ✓' : sure === 'disputed' ? ' ×' : '';
        const label = `${year ?? ''}${mark}`.trim();
        return <g key={e.id} className={`ch-link ch-link-${sure}${lit ? ' lit' : ''}`}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
          {sure === 'disputed' && <line x1={a.x} y1={a.y + 3} x2={b.x} y2={b.y + 3}/>}
          {label && <text className="ch-link-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle">{label}</text>}
          <title>{`${e.source!.caption} → ${e.schema} → ${e.target!.caption}: ${sure === 'supported' ? 'shown' : sure === 'disputed' ? 'disputed' : 'not yet shown'}`}</title>
        </g>;
      })}
      {top.map(n => {
        const p = at.get(n.id)!;
        const on = pointed === n.id;
        return <g key={n.id} className={`ch-node${on ? ' on' : ''}`} transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button"
          aria-label={`${n.caption}, ${degree.get(n.id) ?? 0} links`} aria-pressed={on}
          onMouseEnter={() => point(n.id)} onFocus={() => point(n.id)} onClick={() => point(on ? null : n.id)}>
          <Mark shape={shapeOf(n.schema)}/>
          <text y={-13} textAnchor="middle">{n.caption.length > 22 ? `${n.caption.slice(0, 21)}…` : n.caption}</text>
        </g>;
      })}
    </svg>
    <figcaption>
      <span><i className="ch-key ch-key-supported"/>shown</span>
      <span><i className="ch-key ch-key-unshown"/>not yet shown</span>
      <span><i className="ch-key ch-key-disputed"/>disputed</span>
      {[...new Set(top.map(n => shapeOf(n.schema)))].filter(k => k !== 'company').map(k => <span key={k}>
        <svg className="ch-key-shape" viewBox="-10 -10 20 20" aria-hidden="true"><Mark shape={k}/></svg>{k}</span>)}
      <span className="ch-net-count">{nodes.length} parties · {edges.length} links</span>
    </figcaption>
  </figure>;
}
