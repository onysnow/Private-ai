'use client';
// The Wire (See): the case as one map at three altitudes, from the approved prototype
// (docs/design/see-the-wire, SEE_THE_WIRE_PROTOTYPE.md). The map itself is drawn by
// wire-engine.ts; this component lays out its chrome, loads the case and mounts it.
import {useQuery} from '@tanstack/react-query';
import {useEffect, useRef} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getWireOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';
import {mountWire} from './wire-engine';

export function TheWire({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const query = useQuery({...getWireOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
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

  useEffect(() => {
    if (!root.current || !data || !data.entities.length) return undefined;
    return mountWire(root.current, data, {
      active: () => activeRef.current,
      openDossier,
      openFlag,
      traceEvidence: (evidenceId, title) => openProvenance({title, kind: 'evidence', acceptedRecordType: 'evidence', acceptedRecordId: evidenceId}),
    });
  }, [data, openDossier, openFlag, openProvenance]);

  if (query.isPending && investigationId) return <div className="tw tw-state" aria-busy="true"><p>Laying out the case…</p></div>;
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
        <g className="tw-more"/>
      </g>
    </svg>
    <svg className="tw-overlay" aria-hidden="true"><g className="tw-lens"/></svg>

    <header className="tw-head tw-glass">
      <h2>The Wire <i className="tw-alttitle">the whole case</i></h2>
      <p className="tw-rule" aria-live="polite"/>
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

    <details className="tw-key tw-glass">
      <summary>Key ▾</summary>
      <div className="tw-key-body"/>
    </details>

    <section className="tw-time tw-glass" aria-label="Time strip">
      <button type="button" className="tw-play" aria-label="Play the case through time">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>
      </button>
      <svg className="tw-tsvg"/>
    </section>

    <div className="tw-wire" aria-live="polite"><svg className="tw-wsvg"/></div>
    <aside className="tw-drawer tw-glass" aria-live="polite"/>
    <div className="tw-tip tw-glass" role="tooltip"/>
  </div>;
}
