'use client';
// Claim verification workspace: claims stay separate from source material.
// Open one to see its linked evidence, which canonical relationships rest on
// that evidence, and its review history; attach evidence from the case's
// pool as support, contradiction or context; record a review with a
// rationale. Moved out of app/page.tsx (Foundation Fixes fix 3); the calls
// and their reply checks are generated from the API schema (fix 2). Any
// panel can ask for a claim to be opened through the shared store
// (lib/workbench-store.ts); this panel opens it if it holds the claim.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, KeyboardEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {errorMessage} from '../../lib/api-client';
import {
  getClaimReviewWorkspaceOptions, getClaimReviewWorkspaceQueryKey, listClaimsOptions, listClaimsQueryKey, listInvestigationEvidenceOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {createClaimEndpoint, createClaimReview, linkClaimEvidenceEndpoint} from '../../lib/generated/sdk.gen';
import type {ClaimOut, ClaimReviewWorkspaceOut, EvidencePoolRow} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

/** The canonical relationships the page still holds, as far as this panel
 * needs them: to name a relationship that depends on the open claim. */
export type RelationshipSummary = {id: string; schema: string; source: {caption: string}; target: {caption: string}};

type Props = {
  investigationId: string;
  relationships: RelationshipSummary[];
  /** Opens the page's relationship detail for one of `relationships`. */
  onInspectRelationship: (relationshipId: string) => void;
};

type Stance = 'supports' | 'contradicts' | 'context';
const CLAIM_STATUSES = ['lead', 'unverified', 'supported', 'confirmed', 'disputed', 'rejected'];
// One empty list while the claims load, so the effect below sees the same value.
const NO_CLAIMS: ClaimOut[] = [];

export function ClaimsPanel({investigationId, relationships, onInspectRelationship}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const openClaim = useWorkbenchStore(state => state.openClaim);
  const asked = useWorkbenchStore(state => state.claim);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState('unverified');
  const [claimConfidence, setClaimConfidence] = useState(0);
  const [newClaimText, setNewClaimText] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [rationale, setRationale] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [createProblem, setCreateProblem] = useState('');

  const path = {investigation_id: investigationId};
  const claimsQuery = useQuery({...listClaimsOptions({path}), enabled: Boolean(investigationId)});
  const evidenceQuery = useQuery({...listInvestigationEvidenceOptions({path}), enabled: Boolean(investigationId)});
  const claims: ClaimOut[] = claimsQuery.data ?? NO_CLAIMS;
  const evidencePool: EvidencePoolRow[] = evidenceQuery.data ?? [];
  const selectedClaim = selectedId ? claims.find(c => c.id === selectedId) ?? null : null;
  const workspaceQuery = useQuery({...getClaimReviewWorkspaceOptions({path: {claim_id: selectedId ?? ''}}), enabled: Boolean(selectedClaim)});
  const workspace: ClaimReviewWorkspaceOut | null = selectedClaim ? workspaceQuery.data ?? null : null;
  const claimEvidence = workspace?.evidence ?? [];

  // A new case starts with no claim open.
  useEffect(() => { setSelectedId(null); setReviewStatus(''); }, [investigationId]);

  // Opening a claim (from the list here or from a dossier) starts the review
  // form from the claim's current status and confidence. Each request is
  // answered once, when the list holds the claim; the list refreshing later
  // does not reopen it.
  const answered = useRef(0);
  useEffect(() => {
    if (!asked || asked.serial === answered.current) return;
    const claim = claims.find(c => c.id === asked.claimId);
    if (!claim) return;
    answered.current = asked.serial;
    setSelectedId(claim.id);
    setClaimStatus(claim.status);
    setClaimConfidence(claim.confidence);
    setReviewStatus('');
  }, [asked, claims]);

  const createClaim = async () => {
    if (!investigationId || !newClaimText.trim()) return;
    try {
      const created = (await createClaimEndpoint({body: {investigation_id: investigationId, text: newClaimText.trim(), status: 'unverified', confidence: 0}, throwOnError: true})).data;
      setNewClaimText('');
      setCreateProblem('');
      await queryClient.invalidateQueries({queryKey: listClaimsQueryKey({path})});
      openClaim(created.id);
    } catch (error) {
      setCreateProblem(errorMessage(error, 'Could not add the claim'));
    }
  };

  const saveClaimReview = async () => {
    if (!selectedClaim) return;
    if (!rationale.trim()) {
      setReviewStatus('Add a reporter rationale before recording this review.');
      return;
    }
    try {
      const result = (await createClaimReview({path: {claim_id: selectedClaim.id}, body: {status: claimStatus, confidence: claimConfidence, rationale: rationale.trim()}, throwOnError: true})).data;
      const updated = result.claim;
      // The reply already carries the claim and its workspace as they now stand.
      queryClient.setQueryData<ClaimOut[]>(listClaimsQueryKey({path}), current => current?.map(c => (c.id === updated.id ? updated : c)));
      queryClient.setQueryData(getClaimReviewWorkspaceQueryKey({path: {claim_id: updated.id}}), result.workspace);
      setRationale('');
      setReviewStatus(`Recorded immutable review: ${updated.status} at ${Math.round(updated.confidence * 100)}% confidence.`);
    } catch (error) {
      setReviewStatus(errorMessage(error, 'Could not record the review'));
    }
  };

  const attachEvidence = async (row: EvidencePoolRow, stance: Stance) => {
    if (!selectedClaim) return;
    try {
      await linkClaimEvidenceEndpoint({path: {claim_id: selectedClaim.id}, body: {evidence_id: row.evidence.id, stance, note: evidenceNote.trim() || null}, throwOnError: true});
      setEvidenceNote('');
      await queryClient.invalidateQueries({queryKey: getClaimReviewWorkspaceQueryKey({path: {claim_id: selectedClaim.id}})});
      setReviewStatus(`Linked evidence as ${stance}.`);
    } catch (error) {
      setReviewStatus(errorMessage(error, 'Could not link the evidence'));
    }
  };

  const hasLink = (evidenceId: string, stance: Stance) => claimEvidence.some(row => row.evidence?.id === evidenceId && row.stance === stance);

  const statusLine = reviewStatus || (selectedClaim && workspaceQuery.isPending ? 'Loading claim review workspace…'
    : selectedClaim && workspaceQuery.isError ? errorMessage(workspaceQuery.error, 'Could not load the claim review workspace') : '');

  return <Card className="card" id="claim-verification">
    <CardHeader className="pb-3">
      <CardTitle>Claim verification workspace</CardTitle>
      <CardDescription>Claims stay separate from source material. Review the exact linked evidence, preserve whether each item supports, contradicts, or only contextualizes the claim, then explicitly set verification status and confidence.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="searchrow">
        <Input value={newClaimText} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewClaimText(e.target.value)} onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void createClaim(); }} placeholder="Write a testable factual claim…"/>
        <Button onClick={createClaim} disabled={!newClaimText.trim()}>Add unverified claim</Button>
      </div>
      {createProblem && <p className="muted">{createProblem}</p>}
      {claimsQuery.isError && <p className="muted">{errorMessage(claimsQuery.error, 'Could not load the claims')}</p>}
      <div className="twocol">
        <div>
          {claims.length === 0 ? <p className="muted">No claims yet.</p> : claims.map(c => <button className="finding" key={c.id} onClick={() => openClaim(c.id)}>
            <strong>{c.text}</strong><small>{c.status} · {Math.round(c.confidence * 100)}% confidence</small>
          </button>)}
        </div>
        <div>
          {!selectedClaim ? <p className="muted">Choose a claim to inspect its evidence and verification state.</p> : <>
            <h4>{selectedClaim.text}</h4>
            <div className="searchrow">
              <Select value={claimStatus} onValueChange={setClaimStatus}>
                <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
                <SelectContent>{CLAIM_STATUSES.map(status => <SelectItem value={status} key={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <label>Confidence {Math.round(claimConfidence * 100)}% <Slider className="w-32" value={[claimConfidence]} min={0} max={1} step={0.05} onValueChange={(vals: number[]) => setClaimConfidence(vals[0])}/></label>
              <Input value={rationale} onChange={(e: ChangeEvent<HTMLInputElement>) => setRationale(e.target.value)} placeholder="Required rationale for this review"/>
              <Button onClick={saveClaimReview} disabled={!rationale.trim()}>Record review</Button>
            </div>
            {statusLine && <p className="muted">{statusLine}</p>}
            {workspace && <>
              <div className="candidate">
                <b>Evidence balance</b>
                <div>{workspace.stance_counts.supports} supporting · {workspace.stance_counts.contradicts} contradicting · {workspace.stance_counts.context} context</div>
              </div>
              <h4>Dependent canonical relationships</h4>
              {workspace.dependent_relationships.length === 0 ? <p className="muted">No canonical relationship currently depends on this claim&apos;s linked evidence.</p> : workspace.dependent_relationships.map(dep => {
                const rel = relationships.find(r => r.id === dep.id);
                const trace = () => openProvenance({title: selectedClaim.text, kind: 'claim-dependent relationship', traceRecordType: 'relationship', acceptedRecordId: dep.id});
                return <div className="candidate" key={dep.id}>
                  <b>{rel ? `${rel.source.caption} → ${rel.target.caption}` : `Relationship ${dep.id}`}</b>
                  <div>{rel?.schema || 'FollowTheMoney relationship'} · {dep.evidence_ids.length} linked evidence record(s)</div>
                  <Button onClick={() => rel ? onInspectRelationship(rel.id) : trace()}>Inspect relationship</Button>
                  <Button onClick={trace}>Trace relationship</Button>
                </div>;
              })}
              <h4>Immutable review history</h4>
              {workspace.review_history.length === 0 ? <p className="muted">No reporter review has been recorded yet.</p> : workspace.review_history.map(event => <div className="statement" key={event.id}>
                <b>{event.from_status} → {event.to_status}</b> · {Math.round(event.from_confidence * 100)}% → {Math.round(event.to_confidence * 100)}%
                <div>{event.rationale}</div>
                {event.created_at && <small>{new Date(event.created_at).toLocaleString()}</small>}
              </div>)}
            </>}
            <h4>Linked evidence</h4>
            {claimEvidence.length === 0 ? <p className="muted">No evidence is linked to this claim yet.</p> : claimEvidence.map(row => <div className="candidate" key={row.id}>
              <b>{row.stance}</b>{row.source?.title && <span> · {row.source.title}</span>}
              <div>{row.evidence?.quote || row.evidence?.notes || 'Evidence record'}</div>
              {row.evidence?.locator && <small>Exact locator: {row.evidence.locator}</small>}
              {row.note && <div><small>Reporter note: {row.note}</small></div>}
              {row.source?.url && <div><a href={row.source.url} target="_blank" rel="noreferrer">Open source</a></div>}
              <Button onClick={() => openProvenance({
                title: selectedClaim.text, kind: `claim evidence: ${row.stance}`, sourceId: row.evidence?.source_id, sourceUrl: row.source?.url ?? undefined,
                locator: row.evidence?.locator ?? undefined, detail: row.evidence?.quote || row.evidence?.notes || undefined,
                acceptedRecordType: 'evidence', acceptedRecordId: row.evidence?.id,
              })}>Trace provenance</Button>
            </div>)}
            <h4>Investigation evidence pool</h4>
            <p className="muted">Attach accepted evidence without changing the claim&apos;s verification status automatically. The backend rejects cross-investigation links and treats an identical claim/evidence/stance link idempotently.</p>
            <Input value={evidenceNote} onChange={(e: ChangeEvent<HTMLInputElement>) => setEvidenceNote(e.target.value)} placeholder="Optional reporter note for the next evidence link"/>
            {evidencePool.length === 0 ? <p className="muted">No evidence records are available in this investigation yet.</p> : evidencePool.map(row => <div className="candidate" key={row.evidence.id}>
              <b>{row.source.title}</b>
              <div>{row.evidence.quote || row.evidence.notes || 'Evidence record'}</div>
              {row.evidence.locator && <small>Exact locator: {row.evidence.locator}</small>}
              {row.source.url && <div><a href={row.source.url} target="_blank" rel="noreferrer">Open source</a></div>}
              <Button onClick={() => openProvenance({
                title: row.source.title, kind: 'evidence pool', sourceId: row.source.id, sourceUrl: row.source.url ?? undefined,
                locator: row.evidence.locator ?? undefined, detail: row.evidence.quote || row.evidence.notes || undefined,
                acceptedRecordType: 'evidence', acceptedRecordId: row.evidence.id,
              })}>Trace provenance</Button>
              <div>
                <Button disabled={hasLink(row.evidence.id, 'supports')} onClick={() => attachEvidence(row, 'supports')}>Supports{hasLink(row.evidence.id, 'supports') ? ' ✓' : ''}</Button>
                <Button disabled={hasLink(row.evidence.id, 'contradicts')} onClick={() => attachEvidence(row, 'contradicts')}>Contradicts{hasLink(row.evidence.id, 'contradicts') ? ' ✓' : ''}</Button>
                <Button disabled={hasLink(row.evidence.id, 'context')} onClick={() => attachEvidence(row, 'context')}>Context{hasLink(row.evidence.id, 'context') ? ' ✓' : ''}</Button>
              </div>
            </div>)}
          </>}
        </div>
      </div>
    </CardContent>
  </Card>;
}
