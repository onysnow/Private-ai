'use client';
// The entity dossier: everything the workbench holds about one canonical
// entity, with the reporter's identity work on it -- property-conflict
// decisions, duplicate review, a previewed merge, and the duplicate pairs
// a merge leaves to reconcile. Moved out of app/page.tsx (Foundation Fixes
// fix 3); the calls and their reply checks are generated from the API
// schema (fix 2). Any panel asks for a dossier through the shared store
// (lib/workbench-store.ts); this panel answers. The dossier, its duplicate
// candidates and its reconciliation are three queries: the first is keyed
// by the entity asked for, the other two by the record that answered (a
// merged alias resolves to the surviving record).
import {useQuery, useQueryClient} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import type {EntityFormSubmitPayload} from '../../components/entity-form';
import {entityPropertyAdditions} from '../../lib/entity-schema';
import {
  entityDuplicateCandidatesOptions, entityDuplicateCandidatesQueryKey, entityPostMergeReconciliationOptions, entityPostMergeReconciliationQueryKey,
  getEntityDossierOptions, getEntityDossierQueryKey, getInvestigationFinancialFlowsQueryKey, getInvestigationGraphQueryKey, listEntitiesQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {
  canonicalEntityResolution, createLeadFromRelationshipContext, decideEntityPostMergeReconciliation, decidePropertyConflict, entityMergeExecute,
  entityMergePreview, updateEntity,
} from '../../lib/generated/sdk.gen';
import type {CanonicalMergePreviewOut, EntityRelationshipOut} from '../../lib/generated/types.gen';
import {invalidateInvestigationData} from '../../lib/investigation-queries';
import {reportPayloadError} from '../../lib/report-error';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {leadQueueKey} from '../leads/leads-panel';
import {CorpusExpand} from './corpus-expand';
import {DuplicateCandidates} from './duplicate-candidates';
import type {DuplicateDecision} from './duplicate-candidates';
import {OwnershipChain} from './ownership-chain';
import {PropertyConflicts} from './property-conflicts';
import type {PendingConflict} from './property-conflicts';
import {ReconciliationReview} from './reconciliation-review';
import type {ReconciliationDecision, ReconciliationRecordType} from './reconciliation-review';

// The entity form is loaded on demand so it stays out of the page's first load.
const EntityForm = dynamic(() => import('../../components/entity-form').then(m => m.EntityForm), {ssr: false, loading: () => <p className="muted">Loading form…</p>});

/** `entityId`: the dossier to show, as the inspector slot's trail names it; without it, the latest request is answered. */
type Props = {investigationId: string; entityId?: string};

/** How a relationship's attached evidence was reviewed, counted by stance.
 * A compact graph edge carries an aggregate advisory without these counts. */
function evidenceReviewCounts(r: EntityRelationshipOut): string | null {
  if (r.advisory.presentation_aggregate) return null;
  return Object.entries(r.advisory.relationship_evidence_review_counts).filter(([, count]) => Number(count) > 0).map(([stance, count]) => `${stance} ${count}`).join(' · ');
}

export function DossierPanel({investigationId, entityId: shownId}: Props): ReactElement | null {
  const queryClient = useQueryClient();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const openClaim = useWorkbenchStore(state => state.openClaim);
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const openRelationship = useWorkbenchStore(state => state.openRelationship);
  const setEntityId = useWorkbenchStore(state => state.setEntityId);
  const asked = useWorkbenchStore(state => state.dossier);
  // The entity whose dossier is shown (as asked for; a merged alias answers with its surviving record).
  const [openId, setOpenId] = useState(shownId ?? '');
  const [editingEntity, setEditingEntity] = useState(false);
  const [mergePreviews, setMergePreviews] = useState<Record<string, CanonicalMergePreviewOut>>({});
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const [conflictRationale, setConflictRationale] = useState('');

  const dossierQuery = useQuery({...getEntityDossierOptions({path: {entity_id: openId}}), enabled: Boolean(openId)});
  const dossier = openId ? dossierQuery.data ?? null : null;
  const activeId = dossier?.entity.id ?? '';
  const duplicatesQuery = useQuery({...entityDuplicateCandidatesOptions({path: {entity_id: activeId}}), enabled: Boolean(activeId)});
  const reconciliationQuery = useQuery({...entityPostMergeReconciliationOptions({path: {entity_id: activeId}}), enabled: Boolean(activeId)});

  // A new case starts with no dossier open.
  useEffect(() => { setOpenId(shownId ?? ''); setMergePreviews({}); setEditingEntity(false); }, [investigationId, shownId]);

  // Each request to open a dossier is answered once.
  const answered = useRef(0);
  useEffect(() => {
    if (shownId !== undefined || !asked || asked.serial === answered.current) return;
    answered.current = asked.serial;
    setMergePreviews({});
    setEditingEntity(false);
    setOpenId(asked.entityId);
  }, [asked, shownId]);

  // A dossier asked for by a merged alias answers with the surviving record:
  // the selected entity follows it.
  useEffect(() => { if (activeId) setEntityId(activeId); }, [activeId, setEntityId]);

  // A failed load is reported the way the page reported it, once per failure.
  const reported = useRef<unknown>(null);
  useEffect(() => {
    const error = dossierQuery.error ?? duplicatesQuery.error ?? reconciliationQuery.error;
    if (error && reported.current !== error) { reported.current = error; reportPayloadError(error); }
  }, [dossierQuery.error, duplicatesQuery.error, reconciliationQuery.error]);

  /** Reads the open dossier again: it, its duplicate candidates and its reconciliation. */
  const reloadDossier = async () => {
    setMergePreviews({});
    await Promise.all([
      queryClient.invalidateQueries({queryKey: getEntityDossierQueryKey({path: {entity_id: openId}})}),
      queryClient.invalidateQueries({queryKey: entityDuplicateCandidatesQueryKey({path: {entity_id: activeId}})}),
      queryClient.invalidateQueries({queryKey: entityPostMergeReconciliationQueryKey({path: {entity_id: activeId}})}),
    ]);
  };

  const confirmPropertyConflict = async () => {
    if (!dossier || !pendingConflict) return;
    const {prop, values, decision, preferred_value} = pendingConflict;
    const rationale = conflictRationale.trim() || undefined;
    setPendingConflict(null);
    try {
      await decidePropertyConflict({path: {entity_id: dossier.entity.id, prop}, body: {decision, values, preferred_value, rationale}, throwOnError: true});
      await reloadDossier();
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const decideCanonicalDuplicate = async (otherId: string, decision: DuplicateDecision) => {
    if (!dossier) return;
    try {
      await canonicalEntityResolution({
        path: {entity_id: dossier.entity.id},
        body: {other_entity_id: otherId, decision, confidence: decision === 'unsure' ? 0.5 : 0.9, rationale: 'Reporter-reviewed canonical duplicate decision'},
        throwOnError: true,
      });
      await reloadDossier();
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const previewCanonicalMerge = async (otherId: string) => {
    if (!dossier) return;
    try {
      const value = (await entityMergePreview({path: {entity_id: dossier.entity.id}, query: {target_entity_id: otherId}, throwOnError: true})).data;
      setMergePreviews(prev => ({...prev, [otherId]: value}));
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A merge changes the case everywhere: every list is read again, and the
  // surviving record's dossier opens fresh. The folded record's own queries
  // are only marked stale -- nothing should ask for it again.
  const executeCanonicalMerge = async (otherId: string) => {
    if (!dossier) return;
    const preview = mergePreviews[otherId];
    if (!preview?.can_execute) return;
    const merged = dossier.entity.id;
    try {
      await entityMergeExecute({
        path: {entity_id: merged},
        body: {target_entity_id: otherId, preview_digest: preview.preview_digest, rationale: 'Reporter executed previewed canonical merge.'},
        throwOnError: true,
      });
      await invalidateInvestigationData(queryClient, merged);
      openDossier(otherId);
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A statement decision changes only the reconciliation view; a relationship
  // decision also changes which edges the graph, the ledger and this dossier show.
  const decideReconciliation = async (recordType: ReconciliationRecordType, a: string, b: string, decision: ReconciliationDecision, preferredRecordId?: string) => {
    if (!dossier) return;
    try {
      await decideEntityPostMergeReconciliation({
        path: {entity_id: dossier.entity.id},
        body: {record_type: recordType, record_a_id: a, record_b_id: b, decision, rationale: 'Reporter-reviewed post-merge duplicate reconciliation.', preferred_record_id: preferredRecordId},
        throwOnError: true,
      });
      await queryClient.invalidateQueries({queryKey: entityPostMergeReconciliationQueryKey({path: {entity_id: dossier.entity.id}})});
      if (recordType === 'relationship') {
        await Promise.all([
          queryClient.invalidateQueries({queryKey: getInvestigationGraphQueryKey({path: {investigation_id: investigationId}})}),
          queryClient.invalidateQueries({queryKey: getInvestigationFinancialFlowsQueryKey({path: {investigation_id: investigationId}})}),
          queryClient.invalidateQueries({queryKey: getEntityDossierQueryKey({path: {entity_id: openId}})}),
        ]);
      }
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A lead made here lands in the leads panel's queue, which is marked stale.
  const createLeadFromRelationship = async (r: EntityRelationshipOut) => {
    if (!investigationId) return;
    try {
      await createLeadFromRelationshipContext({path: {relationship_id: r.id}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: leadQueueKey(investigationId)});
      await reloadDossier();
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const updateEntityManually = async (payload: EntityFormSubmitPayload): Promise<void> => {
    if (!dossier) throw new Error('No entity is open.');
    const body: {caption?: string; properties?: Record<string, string[]>} = {};
    if (payload.caption !== dossier.entity.caption) body.caption = payload.caption;
    const additions = entityPropertyAdditions(dossier.entity.properties, payload.properties);
    if (Object.keys(additions).length > 0) body.properties = additions;
    if (!body.caption && !body.properties) { setEditingEntity(false); return; }
    await updateEntity({path: {entity_id: dossier.entity.id}, body, throwOnError: true});
    setEditingEntity(false);
    await reloadDossier();
    if (investigationId) await queryClient.invalidateQueries({queryKey: listEntitiesQueryKey({path: {investigation_id: investigationId}})});
  };

  const duplicateCandidates = duplicatesQuery.data;
  const reconciliation = reconciliationQuery.data;
  // The dossier shows once all three of its parts are in, as it did before.
  if (!dossier || !duplicateCandidates || !reconciliation) return null;
  const entity = dossier.entity;
  const summary = dossier.summary;
  const identity = dossier.identity_history;
  const traceRelationship = (r: EntityRelationshipOut) => openProvenance({title: `${r.source?.caption} → ${r.target?.caption}`, kind: 'dossier relationship', traceRecordType: 'relationship', acceptedRecordId: r.id});

  return <>
    <div className="candidate">
      <h4>{entity.caption} dossier</h4>
      <Button variant="outline" onClick={() => setEditingEntity(v => !v)}>{editingEntity ? 'Cancel edit' : 'Edit entity'}</Button>
      {editingEntity && <div className="candidate">
        <p className="muted">Caption can be changed freely. A new property value is added alongside any existing value for that property, never in place of it -- resolve disagreements between values with the property-conflict actions below.</p>
        <EntityForm entity={entity} onSubmit={updateEntityManually} onCancel={() => setEditingEntity(false)}/>
      </div>}
      {dossier.alias_resolution && <p className="muted"><b>Merged alias:</b> {dossier.alias_resolution.requested_caption} now resolves to this canonical entity. Historical merge records are preserved.</p>}
      <small>{entity.schema} · {summary.statement_count} statements · {summary.relationship_count} relationships · {summary.claim_count} claims · {summary.evidence_count} evidence · {summary.lead_count} leads · {summary.external_finding_count} external findings</small>
      <div>
        <b>Identity / merge history</b>
        <small> · {identity.aliases.length} merged alias(es) · {identity.canonical_decisions.length} reporter identity decision(s){identity.unresolved_decision_count > 0 ? ` · ${identity.unresolved_decision_count} unresolved` : ''}</small>
        {identity.aliases.map(a => <div key={a.id}>Alias: {a.caption} <small>· {a.schema || 'entity'} · preserved record {a.id}</small></div>)}
        {identity.canonical_decisions.slice(0, 8).map(d => <div key={d.id}>{d.decision}: {d.other_entity?.caption || 'unknown entity'} <small>· {Math.round(d.confidence * 100)}% reporter confidence{d.rationale ? ` · ${d.rationale}` : ''}</small></div>)}
        {identity.merge_audits.slice(0, 8).map(m => <div key={m.id}>Merge audit: {m.source_entity_id} → {m.target_entity_id}{m.rationale && <small> · {m.rationale}</small>}</div>)}
        <p className="muted">Identity decisions are reporter-reviewed judgments, not facts inferred by connectors. Merge audits and alias records remain preserved.</p>
      </div>
      {summary.unresolved_external_count > 0 && <p><b>{summary.unresolved_external_count} external finding(s) need review.</b></p>}
      <PropertyConflicts conflicts={dossier.property_conflicts} onDecide={pending => { setPendingConflict(pending); setConflictRationale(''); }}/>
      <div>
        <b>Relationships</b>
        {summary.relationship_suppressed_duplicate_count > 0 && <small> · {summary.relationship_count} preferred edge(s) shown; {summary.relationship_suppressed_duplicate_count} reviewed duplicate edge(s) collapsed. Expand them in the relationship graph.</small>}
        {dossier.relationships.slice(0, 8).map(r => {
          const counts = evidenceReviewCounts(r);
          return <div className="statement" key={r.id}>
            <div>
              {r.schema}: {r.source?.caption} → {r.target?.caption}
              {r.advisory.needs_review && <small> · ⚠ review needed{r.advisory.has_independent_support ? ' · independent support remains' : ''}</small>}
              {counts !== null && <small> · evidence: {counts}</small>}
              {r.reconciliation?.is_preferred && r.reconciliation.suppressed_duplicate_count > 0 && <small> · preferred presentation for {r.reconciliation.suppressed_duplicate_count} reviewed duplicate edge(s)</small>}
            </div>
            <div className="actions">
              <Button onClick={() => openRelationship({relationshipId: r.id, record: r})}>Review relationship evidence</Button>
              <Button onClick={() => void createLeadFromRelationship(r)}>Create question / lead with exact context</Button>
              <Button onClick={() => traceRelationship(r)}>Trace relationship</Button>
            </div>
          </div>;
        })}
      </div>
      <OwnershipChain key={`chain-${entity.id}`} entityId={entity.id} onParty={openDossier}/>
      <div><b>Claims</b>{dossier.claims.slice(0, 8).map(x => <div key={x.claim.id}><Button onClick={() => openClaim(x.claim.id)}>{x.claim.status}: {x.claim.text}</Button></div>)}</div>
      <div><b>Leads / questions</b>{dossier.leads.slice(0, 8).map(x => <div key={x.lead.id}>{x.lead.status}: {x.lead.title}{x.lead.provider && <small> · {x.lead.provider}</small>}</div>)}</div>
      <div><b>Reporting tasks</b>{dossier.tasks.slice(0, 8).map(t => <div key={t.id}>{t.status}: {t.title}{t.priority && <small> · {t.priority}</small>}{t.owner && <small> · {t.owner}</small>}</div>)}</div>
      <div><b>Timeline</b>{dossier.timeline.slice(0, 8).map(e => <div key={e.id}>{e.date_start}: {e.title}<small> · {e.verification_status}</small></div>)}</div>
      <div><b>External / Aleph leads</b>{dossier.external.findings.slice(0, 8).map(f => <div key={f.id}>{f.review_status || 'unreviewed'}: {f.caption || f.id}{f.provider && <small> · {f.provider}</small>}</div>)}</div>
      <CorpusExpand key={entity.id} entityId={entity.id}/>
      <div>
        <b>Evidence</b>
        {dossier.evidence.slice(0, 8).map(x => <div key={x.evidence.id}>
          {x.source?.title}: {x.evidence.quote || x.evidence.notes || ''} {x.evidence.locator ? `(${x.evidence.locator})` : ''} <Button onClick={() => openProvenance({
            title: entity.caption, kind: 'dossier evidence', sourceId: x.source?.id, sourceUrl: x.source?.url ?? undefined, locator: x.evidence.locator ?? undefined,
            detail: x.evidence.quote || x.evidence.notes || undefined, entityId: entity.id, acceptedRecordType: 'evidence', acceptedRecordId: x.evidence.id,
          })}>Trace provenance</Button>
        </div>)}
      </div>
      <ReconciliationReview reconciliation={reconciliation} onDecide={(recordType, a, b, decision, preferred) => void decideReconciliation(recordType, a, b, decision, preferred)}/>
      <DuplicateCandidates candidates={duplicateCandidates} previews={mergePreviews}
        onDecide={(otherId, decision) => void decideCanonicalDuplicate(otherId, decision)}
        onPreviewMerge={otherId => void previewCanonicalMerge(otherId)}
        onExecuteMerge={otherId => void executeCanonicalMerge(otherId)}/>
    </div>
    <Dialog open={!!pendingConflict} onOpenChange={(open: boolean) => { if (!open) setPendingConflict(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reporter rationale for {pendingConflict?.decision}</DialogTitle>
          <DialogDescription>Optional context for this property-conflict decision.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Property conflict rationale" value={conflictRationale} onChange={(e: ChangeEvent<HTMLInputElement>) => setConflictRationale(e.target.value)} placeholder="Rationale (optional)"/>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingConflict(null)}>Cancel</Button>
          <Button onClick={() => void confirmPropertyConflict()}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
