'use client';
// The Wire (See): the case as one map at three altitudes, from the approved prototype
// (docs/design/see-the-wire, SEE_THE_WIRE_PROTOTYPE.md). The map itself is drawn by
// wire-engine.ts; this component lays out its chrome, loads the case and mounts it.
import {useQuery} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {ConnectionGrid} from '../../components/connection-grid';
import {errorMessage} from '../../lib/api-client';
import {getInvestigationGraphOptions, getWireOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {RelationshipOut} from '../../lib/generated/types.gen';
import {certaintyOf, linkFamily, partyKind} from '../../lib/viz-tokens';
import type {Certainty} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';
import {LinkDrawer} from './link-drawer';
import {ARR_NAMES, mountWire} from './wire-engine';
import type {ArrChoice, LinkInfo, LinkSure, LinkView, WireApi} from './wire-engine';

const SURE_OF = {supported: 'shown', unsupported: 'unshown', contested: 'disputed'} as const satisfies Record<string, LinkSure>;

/** How sure each link is, from the case's own review advisory (the rule the Relationships network uses), and
 * its end date. Links the app worked out come from the Wire's own worked_out and are drawn dotted by the map. */
export function linkInfo(edges: RelationshipOut[]): LinkInfo {
  const out: LinkInfo = {};
  for (const r of edges) {
    const end = (r.properties.endDate ?? []).map(String).filter(Boolean).sort().pop() ?? '';
    out[r.id] = {sure: SURE_OF[certaintyOf(r.advisory)], end: end.slice(0, 10)};
  }
  return out;
}

export function TheWire({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const query = useQuery({...getWireOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  // The same relationships the Relationships network reads (shared cache): how sure each link is.
  const graph = useQuery({...getInvestigationGraphOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const info = useMemo(() => linkInfo(graph.data?.edges ?? []), [graph.data]);
  const infoReady = !graph.isPending || !investigationId;
  // The parties' Red Flags are as the rules last left them: when the records have changed since, this runs them once
  // and the run refetches the Wire.
  useRedFlagsQuery(investigationId);
  const root = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const data = query.data;
  const [view, setView] = useState<LinkView | null>(null);
  const [grid, setGrid] = useState<{on: boolean; preview: boolean}>({on: false, preview: false});
  const api = useRef<WireApi | null>(null);
  // Counts the map's mounts, so a link asked for in the address (?link=, from To check or Decide) opens once it is drawn.
  const [mounts, setMounts] = useState(0);
  const edges = useMemo(() => Object.fromEntries((graph.data?.edges ?? []).map(r => [r.id, r])), [graph.data]);
  // The Grid arrangement: the same stored links as a matrix (components/connection-grid.tsx); accounts on their holders.
  const gridData = useMemo(() => {
    if (!data) return {nodes: [], links: []};
    const byId = Object.fromEntries(data.entities.map(e => [e.id, e]));
    const rep = (id: string) => byId[id]?.holder ?? id;
    const nodes = data.entities.filter(e => !e.holder).map(e => ({id: e.id, label: e.short, kind: partyKind(e.schema)}));
    const certainty: Record<LinkSure, Certainty> = {shown: 'supported', unshown: 'unsupported', disputed: 'contested', worked: 'unsupported'};
    const links = data.links.filter(l => byId[l.s] && byId[l.t] && rep(l.s) !== rep(l.t)).map(l => ({id: l.id, from: rep(l.s), to: rep(l.t),
      family: linkFamily(l.schema), certainty: info[l.id] ? certainty[info[l.id].sure] : undefined}));
    return {nodes, links};
  }, [data, info]);

  useEffect(() => {
    if (!root.current || !data || !data.entities.length || !infoReady) return undefined;
    const destroy = mountWire(root.current, data, {
      active: () => activeRef.current,
      openDossier,
      openFlag,
      traceEvidence: (evidenceId, title) => openProvenance({title, kind: 'evidence', acceptedRecordType: 'evidence', acceptedRecordId: evidenceId}),
      showLink: setView,
      showGrid: (on, preview) => setGrid({on, preview}),
      expose: a => { api.current = a; setMounts(n => n + 1); },
    }, info);
    return () => { destroy(); setView(null); setGrid({on: false, preview: false}); };
  }, [data, info, infoReady, openDossier, openFlag, openProvenance]);
  const closeView = () => { setView(null); api.current?.closed(); };

  // /see?link=<id>#the-wire (a To check item for a link, or its Decide card) opens that link's panel; the address
  // then drops ?link= so a reload or Back does not open it again.
  useEffect(() => {
    if (!active || !mounts || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const asked = url.searchParams.get('link');
    if (!asked) return;
    url.searchParams.delete('link');
    window.history.replaceState(window.history.state, '', url.href);
    api.current?.openLink(asked);
  }, [active, mounts]);

  if ((query.isPending || !infoReady) && investigationId) return <div className="tw tw-state" aria-busy="true"><p>Laying out the case…</p></div>;
  if (query.isError) return <div className="tw tw-state" role="alert"><p>{errorMessage(query.error, 'The Wire could not load the case')}</p>
    <button type="button" onClick={() => query.refetch()}>Try again</button></div>;
  if (!data || !data.entities.length) return <div className="tw tw-state"><p>No parties in this case yet. Records you accept in Decide appear here.</p></div>;

  return <div className="tw" ref={root} aria-label="The Wire">
    <svg className="tw-map" role="img" aria-label="Map of the parties in this case and how they are linked">
      <defs>
        <filter id="tw-goo" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="b"/>
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -10"/>
        </filter>
        <radialGradient id="tw-glow"><stop offset="0" stopColor="#E8A95B" stopOpacity=".35"/><stop offset="1" stopColor="#E8A95B" stopOpacity="0"/></radialGradient>
      </defs>
      <g className="tw-cam">
        <g className="tw-terr" filter="url(#tw-goo)"/>
        <g className="tw-terr-l"/>
        <g className="tw-sec"/>
        <g className="tw-edges"/>
        <g className="tw-nodes"/>
        <g className="tw-elabs"/>
        <g className="tw-more"/>
      </g>
    </svg>
    <svg className="tw-overlay" aria-hidden="true"><g className="tw-lens"/></svg>

    <div className="tw-arrbox">
      <div className="tw-arr tw-glass" role="radiogroup" aria-label="Arrangement">
        {(Object.keys(ARR_NAMES) as ArrChoice[]).map(a => <button key={a} type="button" role="radio" aria-checked="false" data-a={a}>{ARR_NAMES[a]}</button>)}
      </div>
      <p className="tw-chosen" aria-live="polite"/>
    </div>

    <header className="tw-head tw-glass">
      <h2>The Wire <i className="tw-alttitle">the whole case</i></h2>
      <p className="tw-rule" aria-live="polite"/>
      <div className="tw-active" aria-label="Active filters"/>
    </header>

    <div className="tw-tools">
      <input className="tw-search" list="tw-names" placeholder="Jump to a party  ( / )" aria-label="Jump to a party"/>
      <datalist id="tw-names"/>
      <button type="button" className="tw-tool tw-blens" aria-pressed="false">Lens <kbd>L</kbd></button>
      <button type="button" className="tw-tool tw-bpath" aria-pressed="false">Follow the money <kbd>F</kbd></button>
      <button type="button" className="tw-tool tw-bgroup" aria-pressed="true">Accounts in holders</button>
    </div>

    <div className="tw-pathbox tw-glass">
      <label>From <select className="tw-pfrom"/></label>
      <label>to <select className="tw-pto"/></label>
      <button type="button" className="tw-tool tw-pgo">Trace</button>
    </div>

    <nav className="tw-alt tw-glass" aria-label="How close you are">
      <div className="cap">Altitude</div>
      <div className="track">
        <div className="rail"/>
        <div className="tw-needle"/>
        <button type="button" className="stop" data-m="case" style={{top: 0}}><i/>Whole case</button>
        <button type="button" className="stop" data-m="party" style={{top: 104}}><i/>Around a party</button>
        <button type="button" className="stop" data-m="wire" style={{top: 208}}><i/>One link</button>
      </div>
      <div className="tw-zoom">100%</div>
    </nav>

    <aside className="tw-trail tw-glass" aria-label="Where you have been">
      <div className="cap">Where you&apos;ve been</div>
      <ol/>
      <button type="button" className="tw-bnext">Next most-flagged ›</button>
    </aside>

    <aside className="tw-key tw-glass" aria-label="Key">
      <div className="tw-key-sure"/>
      <details className="tw-key-more">
        <summary>Kinds and colours ▾</summary>
        <div className="tw-key-body"/>
      </details>
    </aside>

    <section className="tw-time tw-glass" aria-label="Time strip">
      <button type="button" className="tw-play" aria-label="Play the case through time">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>
      </button>
      <svg className="tw-tsvg"/>
      <p className="tw-counts" aria-live="polite"/>
    </section>

    <div className="tw-wire" aria-live="polite"><svg className="tw-wsvg"/></div>
    <aside className="tw-drawer tw-glass" aria-live="polite"/>
    {grid.on && <div className={`tw-grid tw-glass${grid.preview ? ' peek' : ''}`} aria-label="Grid: one row and one column per party">
      <ConnectionGrid nodes={gridData.nodes} links={gridData.links} onLink={id => api.current?.openLink(id)}/>
    </div>}
    {view && api.current && <aside className="tw-ldrawer tw-glass" aria-label={view.kind === 'link' ? 'The link' : 'How they are linked'}>
      <LinkDrawer view={view} investigationId={investigationId} api={api.current} edges={edges} onClose={closeView}/>
    </aside>}
    <div className="tw-tip tw-glass" role="tooltip"/>
  </div>;
}
