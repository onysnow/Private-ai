'use client';
// The workbench page's frame (docs/discovery/README.md, page-by-page audit;
// the approved page mockup): a rail of the five stages that stays on screen
// and jumps to each part, "Where things stand" tiles, and one numbered section
// per stage. The counts come from the same cached reads the panels use, so
// the frame asks the server for nothing extra.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement, ReactNode} from 'react';

import {
  getInvestigationGraphOptions, getInvestigationPlacesOptions, getRedFlagsOptions, getInvestigationTimelineOptions, leadQueueOptions, listClaimsOptions,
  listDocumentsOptions, listInvestigationEvidenceOptions, listSourcesOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {RelationshipOut} from '../../lib/generated/types.gen';
import {SURE, SURE_ORDER} from '../../lib/record-kinds';
import type {Sure} from '../../lib/record-kinds';
import {STAGES} from '../../lib/stages';
import type {Stage, StageKey} from '../../lib/stages';
import {SWATCH} from '../../lib/viz-tokens';

// How sure, for the tiles: the same mapping the search uses (backend
// app/services/search_view.py SURE_OF_CLAIM / SURE_OF_EVENT / SURE_OF_LINK).
const CLAIM_SURE: Record<string, Sure> = {supported: 'supported', confirmed: 'supported', lead: 'not_yet', unverified: 'not_yet', disputed: 'disputed', rejected: 'rejected'};
const EVENT_SURE: Record<string, Sure> = {verified: 'supported', asserted: 'not_yet', approximate: 'not_yet', unresolved: 'not_yet', disputed: 'disputed'};
const LINK_SURE: Record<string, Sure> = {independent_support: 'supported', challenged_support: 'disputed', mixed_support: 'disputed', no_supporting_claim: 'not_yet', no_claim_dependency: 'not_yet'};
const OPEN_LEAD = new Set(['unreviewed', 'active', 'blocked']);

function count<T>(rows: T[], key: (row: T) => string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) { const k = key(row); if (k) out[k] = (out[k] ?? 0) + 1; }
  return out;
}

function linkSure(edge: RelationshipOut): Sure {
  const state = (edge.advisory as {support_state?: string} | null | undefined)?.support_state ?? '';
  return LINK_SURE[state] ?? 'not_yet';
}

type SureCounts = Record<string, number>;

/** Everything the rail and the tiles show. */
export type Standing = {
  claims: {total: number; sure: SureCounts};
  evidence: {total: number; sources: number};
  documents: number;
  network: {parties: number; links: number; sure: SureCounts};
  timeline: {total: number; from?: string; to?: string; sure: SureCounts};
  leads: {open: number; status: Record<string, number>; urgent: number};
  places: number;
  /** Open Red Flags. */
  flags: number;
};

/** Everything the rail and the tiles show, from the panels' own cached reads. */
export function useStanding(investigationId: string): Standing {
  const path = {investigation_id: investigationId};
  const enabled = Boolean(investigationId);
  const claims = useQuery({...listClaimsOptions({path}), enabled}).data ?? [];
  const evidence = useQuery({...listInvestigationEvidenceOptions({path}), enabled}).data ?? [];
  const sources = useQuery({...listSourcesOptions({path}), enabled}).data ?? [];
  const documents = useQuery({...listDocumentsOptions({path}), enabled}).data ?? [];
  const graph = useQuery({...getInvestigationGraphOptions({path}), enabled}).data;
  const timeline = useQuery({...getInvestigationTimelineOptions({path}), enabled}).data;
  const leads = useQuery({...leadQueueOptions({path, query: {unresolved_only: false}}), enabled}).data;
  const places = useQuery({...getInvestigationPlacesOptions({path}), enabled}).data;
  const redFlags = useQuery({...getRedFlagsOptions({path}), enabled}).data;
  const edges = graph?.edges ?? [];
  const events = timeline?.events ?? [];
  const years = events.map(e => (e.date_start ?? '').slice(0, 4)).filter(y => /^\d{4}$/.test(y)).sort();
  const leadRows = leads?.items ?? [];
  return {
    claims: {total: claims.length, sure: count(claims, c => CLAIM_SURE[c.status])},
    evidence: {total: evidence.length, sources: sources.length},
    documents: documents.length,
    network: {parties: graph?.nodes.length ?? 0, links: edges.length, sure: count(edges, linkSure)},
    timeline: {total: timeline?.total ?? events.length, from: years[0], to: years[years.length - 1], sure: count(events, e => EVENT_SURE[e.verification_status ?? ''])},
    leads: {open: leadRows.filter(l => OPEN_LEAD.has(l.status)).length, status: count(leadRows.filter(l => OPEN_LEAD.has(l.status)), l => l.status),
      urgent: leadRows.filter(l => OPEN_LEAD.has(l.status) && l.priority === 'urgent').length},
    places: places?.places.length ?? 0,
    flags: (redFlags?.flags ?? []).filter(f => f.status === 'open').length,
  };
}

function SureBar({sure}: {sure: Record<string, number>}): ReactElement {
  const total = SURE_ORDER.reduce((n, s) => n + (sure[s] ?? 0), 0);
  return <span className="wb-bar" aria-hidden="true">
    {total ? SURE_ORDER.filter(s => sure[s]).map(s => <i key={s} style={{flexGrow: sure[s], background: SURE[s].fill}}/>) : <i style={{flexGrow: 1, background: '#26272b'}}/>}
  </span>;
}

function SureList({sure, names}: {sure: Record<string, number>; names?: Partial<Record<Sure, string>>}): ReactElement {
  return <ul className="wb-legend">{SURE_ORDER.filter(s => sure[s]).map(s => <li key={s}>
    <i style={{background: SURE[s].fill}}/>{sure[s]} {names?.[s] ?? SURE[s].name.toLowerCase()}</li>)}</ul>;
}

const STAGE_OF_TILE: Record<string, StageKey> = {claims: 'verify', evidence: 'collect', network: 'map', timeline: 'map', leads: 'report'};

function Tile({name, anchor, children}: {name: string; anchor: string; children: ReactNode}): ReactElement {
  const stage = STAGES.find(s => s.key === STAGE_OF_TILE[name.toLowerCase()]);
  return <a className="wb-tile" href={`#${anchor}`} style={{borderTopColor: stage?.colour}}>
    <span className="wb-tile-name">{name}</span>
    {children}
  </a>;
}

export function StandingTiles({standing}: {standing: Standing}): ReactElement {
  const {claims, evidence, network, timeline, leads} = standing;
  const LEAD_COLOUR: Record<string, string> = {active: SWATCH.amber, unreviewed: SWATCH.taupe, blocked: SWATCH.brick};
  return <section className="wb-tiles" aria-label="Where things stand">
    <Tile name="Claims" anchor="claim-verification">
      <span className="wb-big"><b>{claims.total}</b> {claims.total === 1 ? 'claim' : 'claims'}</span>
      <SureBar sure={claims.sure}/><SureList sure={claims.sure} names={{supported: 'supported', not_yet: 'not yet shown', disputed: 'disputed', rejected: 'rejected'}}/>
    </Tile>
    <Tile name="Evidence" anchor="source-capture">
      <span className="wb-big"><b>{evidence.total}</b> {evidence.total === 1 ? 'record' : 'records'} · {evidence.sources} {evidence.sources === 1 ? 'source' : 'sources'}</span>
    </Tile>
    <Tile name="Network" anchor="relationship-graph">
      <span className="wb-big"><b>{network.parties}</b> parties · {network.links} links</span>
      <SureBar sure={network.sure}/><SureList sure={network.sure} names={{supported: 'supported', not_yet: 'not yet shown', disputed: 'contested'}}/>
    </Tile>
    <Tile name="Timeline" anchor="timeline">
      <span className="wb-big"><b>{timeline.total}</b> {timeline.total === 1 ? 'event' : 'events'}{timeline.from ? `, ${timeline.from === timeline.to ? timeline.from : `${timeline.from}–${timeline.to}`}` : ''}</span>
      <SureBar sure={timeline.sure}/><SureList sure={timeline.sure} names={{supported: 'verified', not_yet: 'asserted or approximate', disputed: 'disputed'}}/>
    </Tile>
    <Tile name="Leads" anchor="leads">
      <span className="wb-big"><b>{leads.open}</b> open</span>
      <ul className="wb-legend">
        {Object.entries(leads.status).map(([s, n]) => <li key={s}><i style={{background: LEAD_COLOUR[s] ?? SWATCH.taupe}}/>{n} {s}</li>)}
        {leads.urgent > 0 && <li><i style={{background: SWATCH.brick, borderRadius: '50%'}}/>{leads.urgent} urgent</li>}
      </ul>
    </Tile>
  </section>;
}

/** The numbers beside each part in the rail. */
function partCount(standing: Standing, anchor: string): string | null {
  switch (anchor) {
    case 'document-ingestion': return String(standing.documents);
    case 'source-capture': return `${standing.evidence.sources} · ${standing.evidence.total}`;
    case 'relationship-graph': return `${standing.network.parties} · ${standing.network.links}`;
    case 'timeline': return String(standing.timeline.total);
    case 'places': return String(standing.places);
    case 'leads': return String(standing.leads.open);
    case 'red-flags': return String(standing.flags);
    default: return null;
  }
}

export function StageRail({investigationName, standing}: {investigationName: string; standing: Standing}): ReactElement {
  return <nav className="wb-rail" aria-label="Parts of the investigation">
    <p className="wb-rail-eyebrow">Investigation</p>
    <p className="wb-rail-name">{investigationName || 'None open'}</p>
    <ol>
      {STAGES.map(stage => <li key={stage.key}>
        <a className="wb-rail-stage" href={`#stage-${stage.key}`}><StageNumber stage={stage}/>{stage.name}</a>
        <ul style={{borderLeftColor: `${stage.colour}55`}}>
          {stage.parts.map(part => {
            const n = partCount(standing, part.anchor);
            return <li key={part.anchor}><a href={`#${part.anchor}`}><span>{part.label}</span>{n !== null && <small>{n}</small>}</a></li>;
          })}
        </ul>
      </li>)}
    </ol>
  </nav>;
}

function StageNumber({stage}: {stage: Stage}): ReactElement {
  return <span className="wb-num" style={{background: stage.colour}}>{stage.n}</span>;
}

export function StageSection({stage, children}: {stage: StageKey; children: ReactNode}): ReactElement {
  const s = STAGES.find(x => x.key === stage) as Stage;
  return <section className="wb-stage" id={`stage-${s.key}`} aria-labelledby={`stage-${s.key}-title`}>
    <header className="wb-stage-head" style={{borderBottomColor: s.colour}}>
      <StageNumber stage={s}/><h2 id={`stage-${s.key}-title`}>{s.name}</h2><p>{s.line}</p>
    </header>
    <div className="wb-stage-body">{children}</div>
  </section>;
}
