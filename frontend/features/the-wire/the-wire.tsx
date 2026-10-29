'use client';
// The Wire (See): the case as one map at three altitudes, from the approved prototype
// (docs/design/see-the-wire, SEE_THE_WIRE_PROTOTYPE.md). The map itself is drawn by
// wire-engine.ts; this component lays out its chrome, loads the case and mounts it.
import {useQuery} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getAllRecordTagsOptions, getInvestigationGraphOptions, getWireOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {RelationshipOut} from '../../lib/generated/types.gen';
import {certaintyOf} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';
import {AllLinks} from './all-links';
import {LinkPanel} from './link-panel';
import {KIND_SYMBOL, brighten, mountWire} from './wire-engine';
import {KIND_ICON} from '../../components/network/party-icons';
import {Wallet} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {GridLight} from '../effects/grid-light';
import {webglAvailable} from '../effects/webgl';
import {currentAppearance, onAppearanceChange} from '../../lib/theme';
import type {LinkInfo, LinkSure, OpenLink, PartyTags} from './wire-engine';

const SURE_OF = {supported: 'shown', unsupported: 'unshown', contested: 'disputed'} as const satisfies Record<string, LinkSure>;

/** How sure each link is, from the case's own review advisory (the rule the Relationships network uses), and
 * its end date. The app records no worked-out links yet, so none is drawn dotted. */
export function linkInfo(edges: RelationshipOut[]): LinkInfo {
  const out: LinkInfo = {};
  for (const r of edges) {
    const end = (r.properties.endDate ?? []).map(String).filter(Boolean).sort().pop() ?? '';
    out[r.id] = {sure: SURE_OF[certaintyOf(r.advisory)], end: end.slice(0, 10)};
  }
  return out;
}

// The Wire's kinds and the app's icon for each (org is the app's organisation; an account, held on its holder's card, a wallet).
const KIND_SYMBOLS: [string, LucideIcon][] = [['person', KIND_ICON.person], ['company', KIND_ICON.company], ['org', KIND_ICON.organisation],
  ['vehicle', KIND_ICON.vehicle], ['property', KIND_ICON.property], ['account', Wallet]]
  .filter((k): k is [string, LucideIcon] => Boolean(k[1])).map(([k, Icon]) => [KIND_SYMBOL[k], Icon]);

export function TheWire({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const query = useQuery({...getWireOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  // The same relationships the Relationships network reads (shared cache): how sure each link is.
  const graph = useQuery({...getInvestigationGraphOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const info = useMemo(() => linkInfo(graph.data?.edges ?? []), [graph.data]);
  const infoReady = !graph.isPending || !investigationId;
  // Your tags on parties (the old network's tag layer): a ring of coloured arcs outside each tagged party's dot.
  const recordTags = useQuery({...getAllRecordTagsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const partyTags = useMemo(() => {
    const out: PartyTags = {};
    for (const row of recordTags?.rows ?? []) if (row.record_type === 'entity') (out[row.record_id] ??= []).push({name: row.name, colour: row.colour});
    return out;
  }, [recordTags]);
  const tagKey = useMemo(() => {
    const seen = new Map<string, {name: string; colour: string; parties: number}>();
    for (const list of Object.values(partyTags)) for (const t of list) {
      const k = seen.get(t.name) ?? {...t, parties: 0};
      k.parties += 1;
      seen.set(t.name, k);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [partyTags]);
  const [tagsOn, setTagsOn] = useState(true);
  // Lamps behind the grid (features/effects/grid-light.tsx): Effects Full and normal motion only, where WebGL works.
  const grid = useRef<HTMLDivElement>(null);
  const [gridLight, setGridLight] = useState(false);
  useEffect(() => {
    const read = () => {
      const a = currentAppearance();
      setGridLight(a.effects === 'full' && a.motion !== 'calm' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && webglAvailable());
    };
    read();
    return onAppearanceChange(read);
  }, []);
  // The parties' Red Flags are as the rules last left them: when the records have changed since, this runs them once
  // and the run refetches the Wire.
  useRedFlagsQuery(investigationId);
  const root = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const traceEvidence = (evidenceId: string, title: string) => openProvenance({title, kind: 'evidence', acceptedRecordType: 'evidence', acceptedRecordId: evidenceId});
  // The link "One link" has open (SEE_1's link panel follows it).
  const [link, setLink] = useState<OpenLink | null>(null);
  // Every link as a list, with its evidence and the way to add one (the old Relationships panel's work).
  const [allLinks, setAllLinks] = useState(false);
  const asked = useWorkbenchStore(state => state.relationship);
  useEffect(() => { if (asked) setAllLinks(true); }, [asked]);
  const data = query.data;

  useEffect(() => {
    if (!root.current || !data || !data.entities.length || !infoReady) return undefined;
    return mountWire(root.current, data, {
      active: () => activeRef.current,
      openDossier,
      openFlag,
      openLink: setLink,
      traceEvidence: (evidenceId, title) => openProvenance({title, kind: 'evidence', acceptedRecordType: 'evidence', acceptedRecordId: evidenceId}),
    }, info, partyTags);
  }, [data, info, infoReady, openDossier, openFlag, openProvenance, partyTags]);

  if ((query.isPending || !infoReady) && investigationId) return <div className="tw tw-state" aria-busy="true"><p>Laying out the case…</p></div>;
  if (query.isError) return <div className="tw tw-state" role="alert"><p>{errorMessage(query.error, 'The Wire could not load the case')}</p>
    <button type="button" onClick={() => query.refetch()}>Try again</button></div>;
  if (!data || !data.entities.length) return <div className="tw tw-state"><p>No parties in this case yet. Records you accept in Decide appear here.</p></div>;

  return <div className={tagsOn ? 'tw' : 'tw tw-tags-off'} ref={root} aria-label="The Wire">
    <div className="tw-grid" ref={grid} aria-hidden="true">{gridLight && <GridLight grid={grid}/>}</div>
    <svg className="tw-map" role="img" aria-label="Map of the parties in this case and how they are linked">
      <defs>
        {/* Each kind's icon (components/network/party-icons, Lucide), drawn once and placed by the engine (KIND_SYMBOL). */}
        {KIND_SYMBOLS.map(([sym, Icon]) => <symbol key={sym} id={sym} viewBox="0 0 24 24"><Icon width={24} height={24} strokeWidth={2.2} color="currentColor"/></symbol>)}
        <filter id="tw-goo" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="b"/>
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -10"/>
        </filter>
        <filter id="tw-flagglow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="4.5"/></filter>
        <filter id="tw-tagglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge></filter>
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

    <header className="tw-head tw-glass">
      <h2>The Wire <i className="tw-alttitle">the whole case</i></h2>
      <div className="tw-arrange" role="group" aria-label="Arrange the parties">
        <button type="button" data-a="control" aria-pressed="false">Who controls whom</button>
        <button type="button" data-a="party" aria-pressed="false">Around a party</button>
        <button type="button" data-a="kind" aria-pressed="false">By kind</button>
        <button type="button" data-a="groups" aria-pressed="false">Linked groups</button>
        <button type="button" data-a="grid" aria-pressed="false">Grid</button>
      </div>
      <p className="tw-chosen"/>
      <p className="tw-rule" aria-live="polite"/>
      <div className="tw-active" aria-label="Active filters"/>
    </header>

    <div className="tw-tools">
      <input className="tw-search" list="tw-names" placeholder="Jump to a party  ( / )" aria-label="Jump to a party"/>
      <datalist id="tw-names"/>
      <button type="button" className="tw-tool tw-blens" aria-pressed="false">Lens <kbd>L</kbd></button>
      <button type="button" className="tw-tool tw-bpath" aria-pressed="false">Follow the money <kbd>F</kbd></button>
      <button type="button" className="tw-tool tw-bgroup" aria-pressed="true">Accounts in holders</button>
      <button type="button" className="tw-tool" aria-pressed={allLinks} onClick={() => setAllLinks(a => !a)}>All links · {graph.data?.edges.length ?? 0}</button>
      {tagKey.length > 0 && <button type="button" className="tw-tool" aria-pressed={tagsOn} onClick={() => setTagsOn(on => !on)}>Your tags</button>}
    </div>

    <div className="tw-pathbox tw-glass">
      <label>From <select className="tw-pfrom"/></label>
      <label>to <select className="tw-pto"/></label>
      <button type="button" className="tw-tool tw-pgo">Trace</button>
    </div>

    <nav className="tw-alt tw-glass" aria-label="How close you are">
      <button type="button" className="tw-mob tw-mback">‹ Back</button>
      <div className="cap">Altitude</div>
      <div className="track">
        <div className="rail"/>
        <div className="tw-needle"/>
        <button type="button" className="stop" data-m="case" style={{top: 0}}><i/>Whole case</button>
        <button type="button" className="stop" data-m="party" style={{top: 104}}><i/>Around a party</button>
        <button type="button" className="stop" data-m="wire" style={{top: 208}}><i/>One link</button>
      </div>
      <div className="tw-zoom">100%</div>
      <button type="button" className="tw-mob tw-mnext">Next flagged ›</button>
    </nav>

    <aside className="tw-trail tw-glass" aria-label="Where you have been">
      <div className="cap">Where you&apos;ve been</div>
      <ol/>
      <button type="button" className="tw-bnext">Next most-flagged ›</button>
    </aside>

    <aside className="tw-key tw-glass" aria-label="Key">
      <div className="tw-key-sure"/>
      {tagsOn && tagKey.length > 0 && <div className="tw-key-tags" aria-label="Your tags, a ring outside the dot">
        <span className="cap">Your tags</span>
        {tagKey.map(t => <span key={t.name} className="tag" title={`${t.parties} ${t.parties === 1 ? 'party' : 'parties'}`}><i style={{borderColor: brighten(t.colour), color: brighten(t.colour)}}/>{t.name} · {t.parties}</span>)}
      </div>}
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
    {link ? <LinkPanel link={link} info={info} onClose={() => setLink(null)} openDocument={openDocument} openFlag={openFlag} traceEvidence={traceEvidence}/> : null}
    {allLinks && <AllLinks investigationId={investigationId} onClose={() => setAllLinks(false)}/>}
    <div className="tw-tip tw-glass" role="tooltip"/>
  </div>;
}
