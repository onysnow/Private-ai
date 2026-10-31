'use client';
// All links, inside The Wire (DECISIONS_LOG 12, call 13): what the old See › Relationships panel did besides drawing,
// so links have one place. Every FollowTheMoney relationship record of the case as a list (from → what → to), reviewed
// duplicates folded into the preferred record unless asked for, each link's evidence and assessments opened in place,
// and the way to add a party or a link (See › Add by hand, which asks where it comes from). A request from another
// panel to open a relationship (the dossier, Claims) is answered here.
import {useQuery} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {caseHref} from '../../lib/case-href';
import {getInvestigationGraphOptions, listInvestigationEvidenceOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {withEnds} from '../relationship-graph/graph';
import type {GraphEdge} from '../relationship-graph/graph';
import {RelationshipDetail} from '../relationship-graph/relationship-detail';

/** One link in words: its kind and role, a challenged claim, and where a duplicate copy stands. */
export function linkLabel(r: GraphEdge): string {
  return `${r.schema}${r.properties.role?.[0] ? ` · ${r.properties.role[0]}` : ''}`
    + (r.advisory.needs_review ? ` · ⚠ challenged claim${r.advisory.has_independent_support ? ' · independent support remains' : ''}` : '')
    + (r.reconciliation?.is_preferred && r.reconciliation.suppressed_duplicate_count > 0 ? ` · preferred (+${r.reconciliation.suppressed_duplicate_count} duplicate)`
      : r.reconciliation?.suppressed_duplicate ? ' · duplicate copy' : '');
}

export function AllLinks({investigationId, onClose}: {investigationId: string; onClose: () => void}): ReactElement {
  const router = useRouter();
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const asked = useWorkbenchStore(state => state.relationship);
  const [duplicates, setDuplicates] = useState(false);
  const [edge, setEdge] = useState<GraphEdge | null>(null);
  const [opened, setOpened] = useState(0);
  const [find, setFind] = useState('');
  const path = {investigation_id: investigationId};
  const graph = useQuery({...getInvestigationGraphOptions({path, ...(duplicates ? {query: {include_reconciled_duplicates: true}} : {})})}).data;
  const evidencePool = useQuery({...listInvestigationEvidenceOptions({path})}).data ?? [];
  const links = useMemo(() => (graph?.edges ?? []).filter(withEnds), [graph]);
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? links.filter(r => `${r.source.caption} ${r.target.caption} ${r.schema}`.toLowerCase().includes(q)) : links;
  }, [links, find]);
  const open = (r: GraphEdge) => { setEdge(r); setOpened(n => n + 1); };

  // Each request to open a relationship is answered once: with the record the asker passed, or this list's copy.
  const answered = useRef(0);
  useEffect(() => {
    if (!asked || asked.serial === answered.current) return;
    const record = asked.request.record ?? links.find(r => r.id === asked.request.relationshipId);
    if (!record || !withEnds(record)) return;
    answered.current = asked.serial;
    open(record);
  }, [asked, links]);

  const rec = graph?.reconciliation;
  return <aside className="tw-links tw-glass" aria-label="All links">
    <button type="button" className="x" onClick={onClose} aria-label="Close all links">×</button>
    <p className="kind">All links · {links.length}</p>
    <div className="tw-links-bar">
      <input type="search" aria-label="Find a link" placeholder="Find a party or a kind of link" value={find} onChange={e => setFind(e.target.value)}/>
      <label><input type="checkbox" checked={duplicates} onChange={e => { setDuplicates(e.target.checked); setEdge(null); }}/> Reviewed duplicate copies</label>
      <button type="button" className="tw-tool" onClick={() => router.push(caseHref('/see#add-by-hand', investigationId))}>Add a party or a link</button>
    </div>
    {rec && rec.suppressed_duplicate_count > 0 && <p className="tw-links-note">{rec.visible_edge_count} links shown from {rec.underlying_edge_count} records;
      {' '}{rec.suppressed_duplicate_count} reviewed duplicate{rec.suppressed_duplicate_count === 1 ? '' : 's'} folded into the preferred record.</p>}
    {edge && <div className="tw-links-detail"><RelationshipDetail key={opened} investigationId={investigationId} edge={edge} evidencePool={evidencePool} onUpdated={setEdge}/>
      <button type="button" className="tw-tool" onClick={() => setEdge(null)}>Back to the list</button></div>}
    {!edge && (links.length === 0 ? <p className="tw-links-note">No links in this case yet. Add one by hand, or accept one in Decide.</p>
      : <ul className="tw-links-list">{shown.map(r => <li key={r.id}>
        <button type="button" className="node" onClick={() => openDossier(r.source.id)}>{r.source.caption}</button>
        <button type="button" className="edge" onClick={() => open(r)}>{linkLabel(r)} →</button>
        <button type="button" className="node" onClick={() => openDossier(r.target.id)}>{r.target.caption}</button>
      </li>)}</ul>)}
  </aside>;
}
