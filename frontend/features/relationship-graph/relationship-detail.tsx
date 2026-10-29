'use client';
// One opened relationship: its FollowTheMoney statements, the exact
// evidence attached to it, the reporter's assessments of that evidence
// (each with a required rationale; the assessment history is immutable),
// and, for a compact edge that stands in for reviewed duplicates, the
// provenance inventory beneath it. The canonical relationship itself is
// never changed by an assessment.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {FamilyMark, StanceMark} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {
  getInvestigationGraphQueryKey, listRelationshipEvidenceReviewsOptions, listRelationshipEvidenceReviewsQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {attachRelationshipEvidenceEndpoint, createLeadFromRelationshipContext, reviewRelationshipEvidenceEndpoint} from '../../lib/generated/sdk.gen';
import type {EvidencePoolRow, GraphOut, RelationshipOut} from '../../lib/generated/types.gen';
import {isQueryOf} from '../../lib/investigation-queries';
import {reportPayloadError} from '../../lib/report-error';
import {apiTime} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {leadQueueKey} from '../leads/leads-panel';
import {withEnds} from './graph';
import type {GraphEdge} from './graph';

type Stance = 'supports' | 'contradicts' | 'context' | 'superseded' | 'unresolved';
const STANCES: [Stance, string][] = [['supports', 'Supports'], ['contradicts', 'Contradicts'], ['context', 'Context'], ['superseded', 'Superseded'], ['unresolved', 'Unresolved']];

type Props = {
  investigationId: string;
  edge: GraphEdge;
  evidencePool: EvidencePoolRow[];
  /** The relationship as the server now holds it, after evidence was attached or reviewed. */
  onUpdated: (updated: GraphEdge) => void;
};

export function RelationshipDetail({investigationId, edge, evidencePool, onUpdated}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const [rationale, setRationale] = useState('');
  const [status, setStatus] = useState('');
  const [attachId, setAttachId] = useState('');
  const [attachNote, setAttachNote] = useState('');

  const reviewsQuery = useQuery(listRelationshipEvidenceReviewsOptions({path: {relationship_id: edge.id}}));
  const reviews = reviewsQuery.data?.reviews ?? [];

  // Opening another relationship starts its form afresh.
  useEffect(() => { setRationale(''); setStatus(''); setAttachId(''); setAttachNote(''); }, [edge.id]);

  // The graph's own copy of the edge follows the reply; an open dossier is
  // read again, since the edge's advisory in it may have changed.
  const applyUpdate = async (updated: RelationshipOut) => {
    if (withEnds(updated)) onUpdated(updated);
    queryClient.setQueriesData<GraphOut>({queryKey: getInvestigationGraphQueryKey({path: {investigation_id: investigationId}})}, graph =>
      graph ? {...graph, edges: graph.edges.map(r => (r.id === updated.id ? updated : r))} : graph);
    await queryClient.invalidateQueries({predicate: query => isQueryOf(query, 'getEntityDossier')});
  };

  const attachEvidence = async () => {
    if (!attachId) return;
    try {
      setStatus('Attaching exact evidence…');
      const updated = (await attachRelationshipEvidenceEndpoint({path: {relationship_id: edge.id}, body: {evidence_id: attachId, note: attachNote.trim() || null}, throwOnError: true})).data;
      setAttachId('');
      setAttachNote('');
      setStatus('Evidence attached. Review its support state below.');
      await applyUpdate(updated);
    } catch (error) {
      setStatus(errorMessage(error, 'Relationship evidence attachment failed'));
    }
  };

  const reviewEvidence = async (evidenceId: string, stance: Stance) => {
    if (!rationale.trim()) return;
    try {
      const updated = (await reviewRelationshipEvidenceEndpoint({path: {relationship_id: edge.id, evidence_id: evidenceId}, body: {stance, rationale: rationale.trim()}, throwOnError: true})).data;
      setRationale('');
      await queryClient.invalidateQueries({queryKey: listRelationshipEvidenceReviewsQueryKey({path: {relationship_id: updated.id}})});
      setStatus(`Recorded ${stance} assessment. Canonical relationship preserved.`);
      await applyUpdate(updated);
    } catch (error) {
      setStatus(errorMessage(error, 'Relationship evidence review failed'));
    }
  };

  // A lead made here lands in the leads panel's queue, which is marked stale.
  const createLead = async () => {
    if (!investigationId) return;
    try {
      await createLeadFromRelationshipContext({path: {relationship_id: edge.id}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: leadQueueKey(investigationId)});
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const title = `${edge.source.caption} → ${edge.target.caption}`;
  const attachments = edge.provenance.evidence_attachments ?? [];
  const attachedIds = new Set(attachments.map(att => att.evidence?.id).filter(Boolean));
  const statusLine = status || (reviewsQuery.isError ? errorMessage(reviewsQuery.error, 'Could not load relationship evidence review history') : '');
  const reconciled = edge.reconciliation;

  return <div className="candidate">
    {/* The record's id, statement count and duplicate state are revealed on the title; its family is its line; a claim
        that needs review is an alert and shows. */}
    <b><Reveal detail={<span className="rv-mono">FtM relationship: {edge.ftm_id} · {edge.provenance.statement_count || 0} provenance statements{reconciled?.is_preferred && reconciled.suppressed_duplicate_count > 0 ? ` · preferred presentation; ${reconciled.suppressed_duplicate_count} reviewed duplicate edge(s) collapsed` : reconciled?.suppressed_duplicate ? ` · reviewed duplicate copy; preferred edge ${reconciled.preferred_record_id}` : ''}</span>}>{title}</Reveal></b>
    <div className="relKind"><FamilyMark schema={edge.schema}/>{edge.properties.role?.[0] ? <span>{edge.properties.role[0]}</span> : null}
      {edge.advisory.needs_review && <span className="relAlert">⚠ claim review needed{edge.advisory.has_independent_support ? <Reveal detail="Independent support remains."> · <span>support remains</span></Reveal> : ''}</span>}</div>
    <div>
      <Button onClick={() => void createLead()}>Create reporting lead from relationship</Button>
      <Button onClick={() => openProvenance({title, kind: 'relationship claims + provenance', traceRecordType: 'relationship', acceptedRecordId: edge.id})}>Trace relationship + claims</Button>
    </div>
    {edge.aggregate_provenance && <div>
      <b><Reveal detail={`${edge.aggregate_provenance.underlying_relationship_count} preserved relationship records · ${edge.aggregate_provenance.evidence_count} exact evidence records · presentation only; no records were merged.`}>
        Reviewed duplicate provenance inventory:</Reveal></b>
      {edge.aggregate_provenance.evidence.map(ev => <div className="statement" key={ev.id}>
        <b>{ev.source?.title || 'Evidence'}</b>{ev.locator ? ` · ${ev.locator}` : ''}
        <div>{ev.quote || ev.notes || 'Evidence record'}</div>
        <Button onClick={() => openProvenance({
          title, kind: 'reviewed duplicate relationship evidence', sourceId: ev.source?.id, sourceUrl: ev.source?.url ?? undefined, locator: ev.locator ?? undefined,
          detail: ev.quote || ev.notes || undefined, acceptedRecordType: 'evidence', acceptedRecordId: ev.id,
        })}>Trace exact evidence</Button>
      </div>)}
    </div>}
    {!edge.aggregate_provenance && <div className="candidate">
      <b><Reveal detail="Only evidence from this investigation is offered. Existing attachments are excluded.">Attach exact evidence</Reveal></b>
      <div className="relationshipForm">
        <Select value={attachId} onValueChange={setAttachId}>
          <SelectTrigger className="w-auto"><SelectValue placeholder="Choose investigation evidence…"/></SelectTrigger>
          <SelectContent>{evidencePool.filter(row => !attachedIds.has(row.evidence.id)).map(row => <SelectItem key={row.evidence.id} value={row.evidence.id}>{row.source.title}: {(row.evidence.locator || row.evidence.quote || row.evidence.notes || row.evidence.id).slice(0, 90)}</SelectItem>)}</SelectContent>
        </Select>
        <input value={attachNote} onChange={(e: ChangeEvent<HTMLInputElement>) => setAttachNote(e.target.value)} placeholder="Attachment note (optional)"/>
        <Button disabled={!attachId} onClick={() => void attachEvidence()}>Attach evidence</Button>
      </div>
    </div>}
    {!edge.aggregate_provenance && attachments.map(att => {
      const evidence = att.evidence;
      if (!evidence) return null;
      return <div className="statement" key={att.attachment_id}>
        <div>
          <b>Exact evidence:</b> {evidence.quote || evidence.notes || 'Evidence record'}{evidence.locator ? ` (${evidence.locator})` : ''}
          {att.latest_review && <div className="relKind"><StanceMark stance={String(att.latest_review.stance || 'unresolved')}/>
            <small>{String(att.latest_review.rationale || '')}</small></div>}
          <Button onClick={() => openProvenance({
            title, kind: 'relationship evidence', sourceId: evidence.source?.id, sourceUrl: evidence.source?.url ?? undefined, locator: evidence.locator ?? undefined,
            detail: evidence.quote || evidence.notes || undefined, acceptedRecordType: 'evidence', acceptedRecordId: evidence.id,
          })}>Trace exact evidence</Button>
        </div>
        <div className="actions">
          {STANCES.map(([stance, label]) => <Button key={stance} disabled={!rationale.trim()} onClick={() => void reviewEvidence(evidence.id, stance)}>{label}</Button>)}
        </div>
      </div>;
    })}
    {!edge.aggregate_provenance && attachments.length > 0 && <div className="candidate">
      <b>Reporter relationship-evidence assessment</b>
      <input value={rationale} onChange={(e: ChangeEvent<HTMLInputElement>) => setRationale(e.target.value)} placeholder="Required rationale before recording an evidence assessment"/>
      {statusLine && <p className="muted">{statusLine}</p>}
      <h4>Immutable assessment history</h4>
      {reviews.length === 0 ? <p className="muted">No relationship-evidence assessments recorded yet.</p> : reviews.map(review => <div className="statement" key={review.id}>
        {/* The stance is its line; the evidence id and the time are revealed on the rationale. */}
        <StanceMark stance={review.stance}/>
        <Reveal detail={<><span className="rv-row rv-mono">evidence {review.evidence_id}</span><span className="rv-row">{apiTime(review.created_at).toLocaleString()}</span></>}>
          <div>{review.rationale}</div></Reveal>
      </div>)}
    </div>}
    {edge.statements.map(st => <div key={st.id}>
      <Reveal detail={`${st.dataset}${st.origin ? ` · ${st.origin}` : ''}`}><span><b>{st.prop}</b>: {st.value}</span></Reveal> <Button onClick={() => openProvenance({title, kind: 'relationship statement', sourceId: st.origin ?? undefined, detail: `${st.prop}: ${st.value}`})}>Trace provenance</Button>
    </div>)}
  </div>;
}
