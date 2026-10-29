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
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {FamilyMark, StanceGlyph, StanceMark} from '../../components/network/marks';
import {StatusChip} from '../../components/status';
import type {ClaimStatus} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {
  getClaimReviewWorkspaceOptions, getClaimReviewWorkspaceQueryKey, listClaimsOptions, listClaimsQueryKey, listInvestigationEvidenceOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {createClaimEndpoint, createClaimReview, linkClaimEvidenceEndpoint} from '../../lib/generated/sdk.gen';
import type {ClaimOut, ClaimReviewWorkspaceOut, EvidencePoolRow} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {WatchButton} from '../inbox/watch-button';
import './claims.css';

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
// The confidence grade on each claim: the IPCC AR5 evidence-by-agreement
// grid (ADR-0005, line 5; backend app/services/claims.py). Both halves are
// the reporter's judgement, made from the evidence balance shown below.
const EVIDENCE_GRADES = ['limited', 'medium', 'robust'] as const;
const AGREEMENT_GRADES = ['low', 'medium', 'high'] as const;
const UNGRADED = 'none';
const STANCE_BUTTON: Record<Stance, string> = {supports: 'Supports', contradicts: 'Contradicts', context: 'Context'};

// The status grammar (docs/handoff/02_RULES.md): each claim status takes the shape of the state it stands for, so
// every status shows a shape and its own word, never colour alone. The same mapping as the case home's Check module.
const CLAIM_SHAPE: Record<string, ClaimStatus> = {
  supported: 'supported', confirmed: 'supported', disputed: 'disputed', rejected: 'ruled_out', lead: 'unshown', unverified: 'unshown',
};
const shapeOf = (status: string): ClaimStatus => CLAIM_SHAPE[status] ?? 'unshown';
const statusWord = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

/** A status chip for one claim status: the grammar's mark and border, the claim's own word. */
function ClaimStatusChip({status}: {status: string}): ReactElement {
  return <StatusChip status={shapeOf(status)} label={statusWord(status)}/>;
}

const DONE_WORD = {met: 'Met', not_met: 'Not met', unknown: 'Cannot be checked here'} as const;

/** A grade in words: "medium evidence, high agreement", or null when the claim has none. */
export function gradeText(claim: {evidence_grade?: string | null; agreement_grade?: string | null}): string | null {
  return claim.evidence_grade && claim.agreement_grade ? `${claim.evidence_grade} evidence, ${claim.agreement_grade} agreement` : null;
}

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
  const [evidenceGrade, setEvidenceGrade] = useState<string>(UNGRADED);
  const [agreementGrade, setAgreementGrade] = useState<string>(UNGRADED);
  const [newClaimText, setNewClaimText] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [rationale, setRationale] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [createProblem, setCreateProblem] = useState('');

  const path = {investigation_id: investigationId};
  const claimsQuery = useQuery({...listClaimsOptions({path}), enabled: Boolean(investigationId)});
  const evidenceQuery = useQuery({...listInvestigationEvidenceOptions({path}), enabled: Boolean(investigationId)});
  const claims: ClaimOut[] = claimsQuery.data ?? NO_CLAIMS;
  const evidencePool: EvidencePoolRow[] = evidenceQuery.data ?? [];
  const openChain = useWorkbenchStore(state => state.openChain);
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
    setEvidenceGrade(claim.evidence_grade ?? UNGRADED);
    setAgreementGrade(claim.agreement_grade ?? UNGRADED);
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
    const graded = evidenceGrade !== UNGRADED && agreementGrade !== UNGRADED;
    if ((evidenceGrade === UNGRADED) !== (agreementGrade === UNGRADED)) {
      setReviewStatus('A confidence grade gives both the evidence and the agreement.');
      return;
    }
    try {
      const grade = graded ? {evidence_grade: evidenceGrade as typeof EVIDENCE_GRADES[number], agreement_grade: agreementGrade as typeof AGREEMENT_GRADES[number]} : {};
      const result = (await createClaimReview({path: {claim_id: selectedClaim.id}, body: {status: claimStatus, confidence: claimConfidence, rationale: rationale.trim(), ...grade,
        ...(overrideReason.trim() ? {override_reason: overrideReason.trim()} : {})}, throwOnError: true})).data;
      const updated = result.claim;
      // The reply already carries the claim and its workspace as they now stand.
      queryClient.setQueryData<ClaimOut[]>(listClaimsQueryKey({path}), current => current?.map(c => (c.id === updated.id ? updated : c)));
      queryClient.setQueryData(getClaimReviewWorkspaceQueryKey({path: {claim_id: updated.id}}), result.workspace);
      setRationale('');
      setOverrideReason('');
      const words = gradeText(updated);
      setReviewStatus(`Recorded immutable review: ${updated.status} at ${Math.round(updated.confidence * 100)}% confidence${words ? `; ${words}` : ''}.`);
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

  // The Done rules for the status chosen (backend app/services/claim_done.py): Supported and Confirmed need them met, or a written reason.
  const done = workspace && (claimStatus === 'supported' || claimStatus === 'confirmed') ? workspace.done[claimStatus] : null;
  const blocked = Boolean(done && !done.met && !overrideReason.trim());

  const statusLine = reviewStatus || (selectedClaim && workspaceQuery.isPending ? 'Loading claim review workspace…'
    : selectedClaim && workspaceQuery.isError ? errorMessage(workspaceQuery.error, 'Could not load the claim review workspace') : '');

  return <Card className="card" id="claim-verification">
    <CardHeader className="pb-3">
      {/* Ony, 29 Oct: the card's explanation is revealed on its title. */}
      <CardTitle><Reveal detail="Claims stay separate from source material. Review the exact linked evidence, preserve whether each item supports, contradicts, or only contextualizes the claim, then explicitly set verification status and confidence.">
        Claim verification workspace</Reveal></CardTitle>
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
          {/* The confidence is a number and shows; its words and the IPCC grade are revealed on the row. */}
          {claims.length === 0 ? <p className="muted">No claims yet.</p> : claims.map(c => <Reveal key={c.id} tabbable={false} className="cl-row-wrap"
            detail={`${Math.round(c.confidence * 100)}% confidence${gradeText(c) ? ` · ${gradeText(c)}` : ''}`}>
            <button type="button" className={`finding cl-row cl-${shapeOf(c.status)}`} onClick={() => openClaim(c.id)}
              aria-current={c.id === selectedId ? 'true' : undefined}>
              <ClaimStatusChip status={c.status}/>
              <strong>{c.text}</strong><small className="cl-conf"><span className="cl-bar" aria-hidden="true"><i style={{width: `${Math.round(c.confidence * 100)}%`}}/></span>
                {Math.round(c.confidence * 100)}%</small>
            </button></Reveal>)}
        </div>
        <div>
          {!selectedClaim ? <p className="muted">Choose a claim to inspect its evidence and verification state.</p> : <>
            <div className="cl-head"><ClaimStatusChip status={selectedClaim.status}/><h4>{selectedClaim.text}</h4></div>
            <p><Button variant="outline" size="sm" onClick={() => { openChain(selectedClaim.id); window.location.hash = 'chain-of-custody'; }}>
              Chain of Custody: how this got here</Button>{' '}
              <WatchButton investigationId={investigationId} recordType="claim" recordId={selectedClaim.id} className="ap-btn"/></p>
            <div className="searchrow">
              <Select value={claimStatus} onValueChange={setClaimStatus}>
                <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
                <SelectContent>{CLAIM_STATUSES.map(status => <SelectItem value={status} key={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={evidenceGrade} onValueChange={setEvidenceGrade}>
                <SelectTrigger className="w-auto" aria-label="Evidence"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNGRADED}>Evidence: not graded</SelectItem>
                  {EVIDENCE_GRADES.map(grade => <SelectItem value={grade} key={grade}>{`Evidence: ${grade}`}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={agreementGrade} onValueChange={setAgreementGrade}>
                <SelectTrigger className="w-auto" aria-label="Agreement"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNGRADED}>Agreement: not graded</SelectItem>
                  {AGREEMENT_GRADES.map(grade => <SelectItem value={grade} key={grade}>{`Agreement: ${grade}`}</SelectItem>)}
                </SelectContent>
              </Select>
              <label>Confidence {Math.round(claimConfidence * 100)}% <Slider className="w-32" value={[claimConfidence]} min={0} max={1} step={0.05} onValueChange={(vals: number[]) => setClaimConfidence(vals[0])}/></label>
              <Input value={rationale} onChange={(e: ChangeEvent<HTMLInputElement>) => setRationale(e.target.value)} placeholder="Required rationale for this review"/>
              <Button onClick={saveClaimReview} disabled={!rationale.trim() || blocked}>
                {done && !done.met ? (overrideReason.trim() ? `Mark ${claimStatus} anyway` : `${claimStatus === 'confirmed' ? 'Confirmed' : 'Supported'} — ${done.left} check${done.left === 1 ? '' : 's'} left`) : 'Record review'}
              </Button>
            </div>
            {done && <div className="done-list" data-testid="claim-done">
              <b>{claimStatus === 'confirmed' ? 'Confirmed' : 'Supported'} means</b>
              <ul>{done.rules.map(r => <li key={r.key} className={`done-${r.state}`}>
                {/* A publication gate: the rules stay; each rule's long detail is revealed on its shape. */}
                <Reveal label={DONE_WORD[r.state]} detail={<><b>{DONE_WORD[r.state]}</b><span className="rv-row">{r.detail}</span></>}>
                  <span aria-hidden="true">{r.state === 'met' ? '✓' : r.state === 'not_met' ? '✕' : '○'}</span></Reveal>
                <span><b>{r.label}</b></span>
              </li>)}</ul>
              {!done.met && <label className="done-override">Mark it anyway, because…
                <Input value={overrideReason} onChange={(e: ChangeEvent<HTMLInputElement>) => setOverrideReason(e.target.value)}
                  placeholder="Some true facts have one source. Say why this one can stand; the reason is kept with the review."/></label>}
            </div>}
            {statusLine && <p className="muted">{statusLine}</p>}
            {workspace && <>
              <div className="candidate cl-balance">
                <Reveal detail="Grade the claim on the IPCC grid from this: evidence is limited, medium or robust by its type, amount, quality and consistency; agreement is low, medium or high by how far the evidence agrees."><b>Evidence balance</b></Reveal>
                {/* Counts by stance, each drawn in its stance's line; the words are read with them and revealed. */}
                <Reveal label={`${workspace.stance_counts.supports} supporting · ${workspace.stance_counts.contradicts} contradicting · ${workspace.stance_counts.context} context`} describe={false}
                  detail={`${workspace.stance_counts.supports} supporting · ${workspace.stance_counts.contradicts} contradicting · ${workspace.stance_counts.context} context`}>
                  <span className="cl-counts" aria-hidden="true">
                    {(['supports', 'contradicts', 'context'] as const).map(k => <span key={k}><StanceGlyph stance={k}/> <b>{workspace.stance_counts[k]}</b></span>)}</span></Reveal>
                <div className="cl-sources">From {workspace.source_count ?? 0} source{workspace.source_count === 1 ? '' : 's'}</div>
              </div>
              <h4>Dependent canonical relationships</h4>
              {workspace.dependent_relationships.length === 0 ? <p className="muted"><Reveal detail="No canonical relationship currently depends on this claim's linked evidence.">None</Reveal></p> : workspace.dependent_relationships.map(dep => {
                const rel = relationships.find(r => r.id === dep.id);
                const trace = () => openProvenance({title: selectedClaim.text, kind: 'claim-dependent relationship', traceRecordType: 'relationship', acceptedRecordId: dep.id});
                return <div className="candidate" key={dep.id}>
                  <b className="cl-rel"><FamilyMark schema={rel?.schema}/>
                    <Reveal detail={`${rel?.schema || 'FollowTheMoney relationship'} · ${dep.evidence_ids.length} linked evidence record(s)`}>
                      {rel ? `${rel.source.caption} → ${rel.target.caption}` : `Relationship ${dep.id}`}</Reveal></b>
                  <Button onClick={() => rel ? onInspectRelationship(rel.id) : trace()}>Inspect relationship</Button>
                  <Button onClick={trace}>Trace relationship</Button>
                </div>;
              })}
              <h4>Immutable review history</h4>
              {/* The status shapes and the rationale show; the words, confidences, grades and time are revealed on the rationale. */}
              {workspace.review_history.length === 0 ? <p className="muted">No reporter review has been recorded yet.</p> : workspace.review_history.map(event => <div className="statement" key={event.id}>
                <b className="cl-move"><ClaimStatusChip status={event.from_status}/> → <ClaimStatusChip status={event.to_status}/></b>
                <Reveal detail={<>
                  <span className="rv-row">{event.from_status} → {event.to_status}</span>
                  <span className="rv-row">{Math.round(event.from_confidence * 100)}% → {Math.round(event.to_confidence * 100)}%</span>
                  {(event.to_evidence_grade || event.from_evidence_grade) && <span className="rv-row">{gradeText({evidence_grade: event.from_evidence_grade, agreement_grade: event.from_agreement_grade}) ?? 'not graded'} → {gradeText({evidence_grade: event.to_evidence_grade, agreement_grade: event.to_agreement_grade}) ?? 'not graded'}</span>}
                  {event.created_at && <span className="rv-row">{apiTime(event.created_at).toLocaleString()}</span>}
                </>}><div>{event.rationale}</div></Reveal>
                {event.override_reason && <div className="done-overridden">Marked without: {(event.unmet_rules ?? []).join(', ')}. Reason: {event.override_reason}</div>}
              </div>)}
            </>}
            <h4>Linked evidence</h4>
            {/* Each link's stance is its line (Chain of Custody's styles), named on reveal; locator and note on the quote. */}
            {claimEvidence.length === 0 ? <p className="muted">No evidence is linked to this claim yet.</p> : claimEvidence.map(row => <div className={`candidate cl-ev cl-ev-${row.stance}`} key={row.id}>
              <b className="cl-ev-head"><StanceMark stance={row.stance}/>{row.source?.title && <span>{row.source.title}</span>}</b>
              {row.evidence?.locator || row.note ? <Reveal detail={<>
                {row.evidence?.locator && <span className="rv-row">Exact locator: {row.evidence.locator}</span>}
                {row.note && <span className="rv-row">Reporter note: {row.note}</span>}
              </>}><div>{row.evidence?.quote || row.evidence?.notes || 'Evidence record'}</div></Reveal>
                : <div>{row.evidence?.quote || row.evidence?.notes || 'Evidence record'}</div>}
              {row.source?.url && <div><a href={row.source.url} target="_blank" rel="noreferrer">Open source</a></div>}
              <Button onClick={() => openProvenance({
                title: selectedClaim.text, kind: `claim evidence: ${row.stance}`, sourceId: row.evidence?.source_id, sourceUrl: row.source?.url ?? undefined,
                locator: row.evidence?.locator ?? undefined, detail: row.evidence?.quote || row.evidence?.notes || undefined,
                acceptedRecordType: 'evidence', acceptedRecordId: row.evidence?.id,
              })}>Trace provenance</Button>
            </div>)}
            <h4><Reveal detail="Attach accepted evidence without changing the claim's verification status automatically. The backend rejects cross-investigation links and treats an identical claim/evidence/stance link idempotently.">
              Investigation evidence pool</Reveal></h4>
            <Input value={evidenceNote} onChange={(e: ChangeEvent<HTMLInputElement>) => setEvidenceNote(e.target.value)} placeholder="Optional reporter note for the next evidence link"/>
            {evidencePool.length === 0 ? <p className="muted">No evidence records are available in this investigation yet.</p> : evidencePool.map(row => <div className="candidate" key={row.evidence.id}>
              <b>{row.source.title}</b>
              {row.evidence.locator ? <Reveal detail={`Exact locator: ${row.evidence.locator}`}><div>{row.evidence.quote || row.evidence.notes || 'Evidence record'}</div></Reveal>
                : <div>{row.evidence.quote || row.evidence.notes || 'Evidence record'}</div>}
              {row.source.url && <div><a href={row.source.url} target="_blank" rel="noreferrer">Open source</a></div>}
              <Button onClick={() => openProvenance({
                title: row.source.title, kind: 'evidence pool', sourceId: row.source.id, sourceUrl: row.source.url ?? undefined,
                locator: row.evidence.locator ?? undefined, detail: row.evidence.quote || row.evidence.notes || undefined,
                acceptedRecordType: 'evidence', acceptedRecordId: row.evidence.id,
              })}>Trace provenance</Button>
              <div>
                {/* Actions keep their words; each also carries its stance's line. */}
                {(['supports', 'contradicts', 'context'] as const).map(k => <Button key={k} disabled={hasLink(row.evidence.id, k)} onClick={() => attachEvidence(row, k)}>
                  <StanceGlyph stance={k}/>{STANCE_BUTTON[k]}{hasLink(row.evidence.id, k) ? ' ✓' : ''}</Button>)}
              </div>
            </div>)}
          </>}
        </div>
      </div>
    </CardContent>
  </Card>;
}
