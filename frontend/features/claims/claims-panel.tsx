'use client';
// Check › Claims: the claim verification workspace. Claims stay separate from source material. The case's claims are a
// dense list on the left (status as colour, the claim, its confidence as a number); the open claim fills the right:
// its evidence balance as large numbers, the evidence linked to it (stance as a line), the review form with the Done
// rules, the review history, the canonical relationships that rest on it, and the case's evidence pool one click away
// ("Attach evidence"). The calls and their reply checks are generated from the API schema. Any panel can ask for a
// claim to be opened through the shared store (lib/workbench-store.ts); this panel opens it if it holds the claim.
//
// Shown by default: the counts, each claim's status colour, its words and its confidence when it has one, the open
// claim's numbers and evidence. On hover or focus: the status words, grades, explanations, locators and notes.
// Evidence a newer record replaces is marked superseded (./superseded.tsx): struck and faded, not counted; what
// replaced it, why and who on hover, where the record that replaced it lights up in the list; Undo counts it again.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Link2, Plus, Replace, Route, Search, Undo2, X} from 'lucide-react';
import {useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, KeyboardEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
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
import {
  createClaimEndpoint, createClaimReview, linkClaimEvidenceEndpoint, supersedeClaimEvidenceEndpoint, unsupersedeClaimEvidenceEndpoint,
} from '../../lib/generated/sdk.gen';
import type {ClaimOut, ClaimReviewWorkspaceOut, EvidencePoolRow} from '../../lib/generated/types.gen';
import {timeWords} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {WatchButton} from '../inbox/watch-button';
import {SupersedeForm, supersededDetail} from './superseded';
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
// Each stance figure's name, revealed on it.
const STANCE_NAME: Record<Stance, string> = {supports: 'supporting', contradicts: 'contradicting', context: 'context'};
// The evidence pool can hold hundreds of records: the first ones show, the search finds the rest.
const POOL_PAGE = 30;

// The status grammar (docs/handoff/02_RULES.md): each claim status takes the shape of the state it stands for, so
// the colour, the shape (Settings › Appearance › Status marks) and the word all agree. The case home uses the same mapping.
const CLAIM_SHAPE: Record<string, ClaimStatus> = {
  supported: 'supported', confirmed: 'supported', disputed: 'disputed', rejected: 'ruled_out', lead: 'unshown', unverified: 'unshown',
};
const SHAPE_WORD: Record<ClaimStatus, string> = {disputed: 'Disputed', unshown: 'Not yet shown', supported: 'Supported or confirmed', ruled_out: 'Ruled out'};
const SHAPE_ORDER: ClaimStatus[] = ['disputed', 'unshown', 'supported', 'ruled_out'];
const shapeOf = (status: string): ClaimStatus => CLAIM_SHAPE[status] ?? 'unshown';
const statusWord = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);
const pct = (n: number): number => Math.round(n * 100);

/** A status chip for one claim status: the grammar's mark and border, the claim's own word. */
function ClaimStatusChip({status}: {status: string}): ReactElement {
  return <StatusChip status={shapeOf(status)} label={statusWord(status)}/>;
}

const DONE_WORD = {met: 'Met', not_met: 'Not met', unknown: 'Cannot be checked here'} as const;

/** A grade in words: "medium evidence, high agreement", or null when the claim has none. */
export function gradeText(claim: {evidence_grade?: string | null; agreement_grade?: string | null}): string | null {
  return claim.evidence_grade && claim.agreement_grade ? `${claim.evidence_grade} evidence, ${claim.agreement_grade} agreement` : null;
}

// Words that say nothing about which evidence fits a claim.
const STOP = new Set(['that', 'this', 'with', 'from', 'were', 'was', 'have', 'has', 'which', 'their', 'there', 'they', 'into', 'than', 'then', 'been', 'also', 'when', 'what', 'about']);
/** A claim's telling words: four letters or more, lower case, without the common ones. */
export function wordsOf(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}$]{4,}/gu) ?? []).filter(w => !STOP.has(w)));
}
/** How many of the claim's telling words a piece of evidence holds. */
export function overlap(words: Set<string>, text: string): number {
  if (!words.size) return 0;
  const there = wordsOf(text);
  let n = 0;
  for (const w of words) if (there.has(w)) n += 1;
  return n;
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
  const [shapes, setShapes] = useState<Set<ClaimStatus>>(new Set());
  const [typed, setTyped] = useState('');
  const q = useDeferredValue(typed.trim().toLowerCase());
  const [attaching, setAttaching] = useState(false);
  const [poolTyped, setPoolTyped] = useState('');
  // The link whose superseded form is open, the call in flight, and the replacing record pointed at.
  const [superseding, setSuperseding] = useState<string | null>(null);
  const [supersedeBusy, setSupersedeBusy] = useState(false);
  const [replacer, setReplacer] = useState<string | null>(null);
  const poolQ = useDeferredValue(poolTyped.trim().toLowerCase());
  const listRef = useRef<HTMLDivElement>(null);

  const path = {investigation_id: investigationId};
  const claimsQuery = useQuery({...listClaimsOptions({path}), enabled: Boolean(investigationId)});
  const evidenceQuery = useQuery({...listInvestigationEvidenceOptions({path}), enabled: Boolean(investigationId)});
  const claims: ClaimOut[] = claimsQuery.data ?? NO_CLAIMS;
  const evidencePool: EvidencePoolRow[] = useMemo(() => evidenceQuery.data ?? [], [evidenceQuery.data]);
  const openChain = useWorkbenchStore(state => state.openChain);
  const selectedClaim = selectedId ? claims.find(c => c.id === selectedId) ?? null : null;
  const workspaceQuery = useQuery({...getClaimReviewWorkspaceOptions({path: {claim_id: selectedId ?? ''}}), enabled: Boolean(selectedClaim)});
  const workspace: ClaimReviewWorkspaceOut | null = selectedClaim ? workspaceQuery.data ?? null : null;
  const claimEvidence = useMemo(() => workspace?.evidence ?? [], [workspace]);

  // A new case starts with no claim open and nothing filtered.
  useEffect(() => { setSelectedId(null); setReviewStatus(''); setShapes(new Set()); setTyped(''); setAttaching(false); setSuperseding(null); }, [investigationId]);

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
    setRationale('');
    setOverrideReason('');
  }, [asked, claims]);

  const counts = useMemo(() => {
    const out = {disputed: 0, unshown: 0, supported: 0, ruled_out: 0} as Record<ClaimStatus, number>;
    for (const c of claims) out[shapeOf(c.status)] += 1;
    return out;
  }, [claims]);
  const shown = useMemo(() => claims.filter(c => (!shapes.size || shapes.has(shapeOf(c.status))) && (!q || c.text.toLowerCase().includes(q))), [claims, shapes, q]);
  const filtering = Boolean(shapes.size || q);
  const clearFilters = (): void => { setShapes(new Set()); setTyped(''); };
  const toggleShape = (s: ClaimStatus): void => setShapes(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  const onListKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const at = shown.findIndex(c => c.id === selectedId);
    const next = shown[Math.min(shown.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    openClaim(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-claim="${next.id}"]`)?.focus();
  };

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
      setReviewStatus(`Recorded immutable review: ${updated.status} at ${pct(updated.confidence)}% confidence${words ? `; ${words}` : ''}.`);
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

  // The reply is the claim's workspace as it now stands: its counts and Done rules leave the superseded record out.
  const markSuperseded = async (linkId: string, reason: string | null, byEvidenceId: string | null) => {
    if (!selectedClaim) return;
    setSupersedeBusy(true);
    try {
      const reply = reason === null
        ? await unsupersedeClaimEvidenceEndpoint({path: {claim_id: selectedClaim.id, link_id: linkId}, throwOnError: true})
        : await supersedeClaimEvidenceEndpoint({path: {claim_id: selectedClaim.id, link_id: linkId}, body: {reason, by_evidence_id: byEvidenceId}, throwOnError: true});
      queryClient.setQueryData(getClaimReviewWorkspaceQueryKey({path: {claim_id: selectedClaim.id}}), reply.data);
      setSuperseding(null);
      setReviewStatus(reason === null ? 'Counted again: the superseded mark is undone.' : 'Marked superseded: shown, no longer counted toward the claim.');
    } catch (error) {
      setReviewStatus(errorMessage(error, reason === null ? 'Could not undo the mark' : 'Could not mark it superseded'));
    } finally {
      setSupersedeBusy(false);
    }
  };

  const hasLink = (evidenceId: string, stance: Stance) => claimEvidence.some(row => row.evidence?.id === evidenceId && row.stance === stance);

  // The pool, searched, the records that share the most words with the open claim first; what is already linked to
  // it sinks to the end.
  const claimText = selectedClaim?.text ?? '';
  const pool = useMemo(() => {
    const linked = new Set(claimEvidence.map(r => r.evidence?.id));
    const words = wordsOf(claimText);
    const rows = evidencePool.filter(r => !poolQ || [r.evidence.quote, r.evidence.notes, r.evidence.locator, r.source.title].some(t => (t ?? '').toLowerCase().includes(poolQ)))
      .map(r => ({row: r, linked: linked.has(r.evidence.id), score: overlap(words, `${r.evidence.quote ?? ''} ${r.evidence.notes ?? ''} ${r.source.title}`)}));
    rows.sort((a, b) => Number(a.linked) - Number(b.linked) || b.score - a.score);
    return rows.map(r => r.row);
  }, [evidencePool, poolQ, claimEvidence, claimText]);

  // The Done rules for the status chosen (backend app/services/claim_done.py): Supported and Confirmed need them met, or a written reason.
  const done = workspace && (claimStatus === 'supported' || claimStatus === 'confirmed') ? workspace.done[claimStatus] : null;
  const blocked = Boolean(done && !done.met && !overrideReason.trim());

  const statusLine = reviewStatus || (selectedClaim && workspaceQuery.isPending ? 'Loading claim review workspace…'
    : selectedClaim && workspaceQuery.isError ? errorMessage(workspaceQuery.error, 'Could not load the claim review workspace') : '');

  const loading = claimsQuery.isPending && Boolean(investigationId);

  return <div className="cw">
    <header className="cw-head">
      {/* Ony, 29 Oct: the screen's explanation is revealed on its count. */}
      <h2 className="cw-count"><Reveal tabbable={false} describe={false} detail="Claims stay separate from source material. Review the exact linked evidence, preserve whether each item supports, contradicts, or only contextualizes the claim, then explicitly set verification status and confidence.">
        <span><b>{loading ? '…' : claims.length}</b> <span>claims</span></span></Reveal></h2>
      {/* The tally is also the filter: each status's colour and count; its word on reveal. */}
      <div className="cw-tally" role="group" aria-label="Show claims by status">{SHAPE_ORDER.filter(s => counts[s]).map(s =>
        <Reveal key={s} tabbable={false} describe={false} detail={<><b>{SHAPE_WORD[s]}</b><span className="rv-row">{counts[s]} claim{counts[s] === 1 ? '' : 's'} · click to show only these</span></>}>
          <button type="button" className={`cw-tally-n t-${s}${shapes.has(s) ? ' on' : ''}`} aria-pressed={shapes.has(s)} aria-label={`${SHAPE_WORD[s]}: ${counts[s]}`}
            onClick={() => toggleShape(s)}><i aria-hidden="true"/>{counts[s]}</button></Reveal>)}</div>
      <label className="cw-search">
        <Search size={16} aria-hidden="true"/>
        <input type="search" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Find a claim…" aria-label="Find a claim"/>
        {typed && <button type="button" aria-label="Clear the search" onClick={() => setTyped('')}><X size={14} aria-hidden="true"/></button>}
      </label>
    </header>

    <div className="cw-body">
      <aside className="cw-left" aria-label="Claims">
        <div className="cw-new">
          <Plus size={16} aria-hidden="true"/>
          <input value={newClaimText} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewClaimText(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void createClaim(); }} placeholder="Write a testable factual claim…" aria-label="A new claim"/>
          <button type="button" className="cw-btn pri" onClick={createClaim} disabled={!newClaimText.trim()}>Add unverified claim</button>
        </div>
        {createProblem && <p className="cw-muted" role="alert">{createProblem}</p>}
        {claimsQuery.isError && <p className="cw-muted">{errorMessage(claimsQuery.error, 'Could not load the claims')}</p>}
        {filtering && <p className="cw-showing"><b>{shown.length}</b> of {claims.length} <button type="button" className="cw-link" onClick={clearFilters}>Clear</button></p>}
        <div className="cw-list" ref={listRef} onKeyDown={onListKey}>
          {loading && <p className="cw-muted">Loading the claims…</p>}
          {!loading && !claimsQuery.isError && claims.length === 0 && <div className="cw-none"><b>No claims yet.</b><span>Write the first one above: one fact, stated so evidence can prove or disprove it.</span></div>}
          {claims.length > 0 && shown.length === 0 && <p className="cw-muted">Nothing matches. <button type="button" className="cw-link" onClick={clearFilters}>Clear the filters</button></p>}
          {/* The confidence is a number and shows when there is one; its words and the IPCC grade are revealed on the row. */}
          {/* A claim with no confidence and no grade has nothing to reveal, so it carries no card. */}
          {shown.map(c => {
            const row = <button type="button" data-claim={c.id} className={`cl-row cl-${shapeOf(c.status)}`} onClick={() => openClaim(c.id)}
              aria-current={c.id === selectedId ? 'true' : undefined}>
              <ClaimStatusChip status={c.status}/>
              <strong>{c.text}</strong>
              <small className={`cl-conf${c.confidence ? '' : ' none'}`}>{c.confidence ? `${pct(c.confidence)}%` : ''}</small>
            </button>;
            return c.confidence || gradeText(c) ? <Reveal key={c.id} tabbable={false} className="cl-row-wrap"
              detail={`${pct(c.confidence)}% confidence${gradeText(c) ? ` · ${gradeText(c)}` : ''}`}>{row}</Reveal>
              : <span key={c.id} className="cl-row-wrap">{row}</span>;
          })}
        </div>
      </aside>

      <section className="cw-right" aria-label={selectedClaim ? 'The open claim' : 'Claims overview'}>
        {!selectedClaim ? <ClaimsOverview counts={counts} total={claims.length} onShape={s => setShapes(new Set([s]))}/> : <>
          <header className="cw-detail-head">
            <div className="cl-head"><ClaimStatusChip status={selectedClaim.status}/><h4>{selectedClaim.text}</h4></div>
            <div className="cw-acts">
              <button type="button" className="cw-btn" onClick={() => { openChain(selectedClaim.id); window.location.hash = 'chain-of-custody'; }}>
                <Route size={15} aria-hidden="true"/> Chain of Custody</button>
              <WatchButton investigationId={investigationId} recordType="claim" recordId={selectedClaim.id} className="cw-btn"/>
            </div>
          </header>

          {/* The figures; each is named on reveal, and a zero is quiet. */}
          {workspace && <div className="cw-nums">
            <Reveal tabbable={false} describe={false} detail={<><b>{pct(selectedClaim.confidence)}% confidence</b>
              <span className="rv-row">{gradeText(selectedClaim) ? `Graded: ${gradeText(selectedClaim)}` : 'Not graded yet'}</span></>}>
              <span className={`cw-num${selectedClaim.confidence ? '' : ' zero'}`}><b>{pct(selectedClaim.confidence)}<small>%</small></b></span></Reveal>
            {/* Counts by stance, each drawn in its stance's line and named on reveal. */}
            <span className="cl-counts" role="img" aria-label={`${workspace.stance_counts.supports} supporting · ${workspace.stance_counts.contradicts} contradicting · ${workspace.stance_counts.context} context`}>
              {(['supports', 'contradicts', 'context'] as const).map(k => <Reveal key={k} tabbable={false} describe={false}
                detail={<><b>{workspace.stance_counts[k]} {STANCE_NAME[k]}</b>{k === 'supports' && <span className="rv-row">Grade the claim on the IPCC grid from this balance: evidence is limited, medium or robust by its type, amount, quality and consistency; agreement is low, medium or high by how far the evidence agrees.</span>}</>}>
                <span className={`cw-num s-${k}${workspace.stance_counts[k] ? '' : ' zero'}`} aria-hidden="true"><b>{workspace.stance_counts[k]}</b><StanceGlyph stance={k} width={34}/></span></Reveal>)}</span>
            {(workspace.superseded_count ?? 0) > 0 && <Reveal tabbable={false} describe={false}
              detail={<><b>Superseded</b><span className="rv-row">Replaced by a newer record: shown struck below, not counted for or against the claim.</span></>}>
              <span className="cw-num cl-gone-n"><b>{workspace.superseded_count}</b><span>superseded</span></span></Reveal>}
            <Reveal tabbable={false} describe={false} detail={<b>From {workspace.source_count ?? 0} source{workspace.source_count === 1 ? '' : 's'}</b>}>
              <span className={`cw-num cl-sources${workspace.source_count ? '' : ' zero'}`} role="img" aria-label={`From ${workspace.source_count ?? 0} source${workspace.source_count === 1 ? '' : 's'}`}>
                <b>{workspace.source_count ?? 0}</b><SourcesIcon/></span></Reveal>
          </div>}
          {/* Sections with nothing in them are not drawn: one quiet line says what is empty. */}
          {workspace && (claimEvidence.length === 0 || workspace.review_history.length === 0 || workspace.dependent_relationships.length === 0) &&
            <p className="cw-quiet">
              {claimEvidence.length === 0 && <span>No evidence is linked to this claim yet.</span>}
              {workspace.review_history.length === 0 && <span>No review recorded yet.</span>}
              {workspace.dependent_relationships.length === 0 && <Reveal detail="No canonical relationship currently depends on this claim's linked evidence."><span>Nothing rests on it.</span></Reveal>}
              {claimEvidence.length === 0 && <button type="button" className={`cw-btn${attaching ? ' on' : ''}`} aria-expanded={attaching} onClick={() => setAttaching(v => !v)}>
                <Link2 size={15} aria-hidden="true"/> Attach evidence</button>}
            </p>}
          {statusLine && <p className="cw-status" role="status">{statusLine}</p>}

          {(claimEvidence.length > 0 || attaching) && <section className="cw-sec">
            {claimEvidence.length > 0 && <h5 className="cw-sec-h">Linked evidence <span className="cw-sec-n">{claimEvidence.length}</span>
              <button type="button" className={`cw-btn${attaching ? ' on' : ''}`} aria-expanded={attaching} onClick={() => setAttaching(v => !v)}>
                <Link2 size={15} aria-hidden="true"/> Attach evidence</button></h5>}
            {/* Each link's stance is its line (Chain of Custody's styles), named on reveal; locator and note on the quote. */}
            {claimEvidence.length > 0 && <ol className="cw-evs">{claimEvidence.map(row => {
              const gone = row.superseded ?? null;
              const words = row.evidence?.quote || row.evidence?.notes || 'Evidence record';
              const quote = <blockquote className="cw-quote">{gone ? <s>{words}</s> : words}</blockquote>;
              const lit = Boolean(replacer && row.evidence?.id === replacer && !gone);
              return <li className={`cl-ev cl-ev-${row.stance}${gone ? ' cl-ev-gone' : ''}${lit ? ' cl-ev-replacer' : ''}`} key={row.id}
                onPointerEnter={gone?.by_evidence_id ? () => setReplacer(gone.by_evidence_id ?? null) : undefined}
                onPointerLeave={gone?.by_evidence_id ? () => setReplacer(null) : undefined}>
                <StanceMark stance={row.stance}/>
                <div className="cl-ev-body">
                  {gone || row.evidence?.locator || row.note ? <Reveal detail={<>
                    {gone && supersededDetail(gone)}
                    {row.evidence?.locator && <span className="rv-row">Exact locator: {row.evidence.locator}</span>}
                    {row.note && <span className="rv-row">Reporter note: {row.note}</span>}
                  </>}>{quote}</Reveal> : quote}
                  {row.source?.title && <span className="cl-ev-src">{row.source.url ? <a href={row.source.url} target="_blank" rel="noreferrer">{row.source.title}</a> : row.source.title}</span>}
                  {superseding === row.id && <SupersedeForm row={row} linked={claimEvidence} pool={pool} busy={supersedeBusy}
                    onSave={(reason, by) => void markSuperseded(row.id, reason, by)} onCancel={() => setSuperseding(null)}/>}
                </div>
                <span className="cl-ev-acts">
                  {gone && <Reveal tabbable={false} describe={false} detail="Undo: count it toward the claim again">
                    <button type="button" className="cw-icon" aria-label="Undo superseded" disabled={supersedeBusy}
                      onClick={() => void markSuperseded(row.id, null, null)}><Undo2 size={15} aria-hidden="true"/></button></Reveal>}
                  <Reveal tabbable={false} describe={false} detail={gone ? 'Change what replaced it, or why' : 'Mark superseded by a newer record'}>
                    <button type="button" className="cw-icon" aria-label={gone ? 'Change the superseded mark' : 'Mark superseded'} aria-expanded={superseding === row.id}
                      onClick={() => setSuperseding(v => (v === row.id ? null : row.id))}><Replace size={15} aria-hidden="true"/></button></Reveal>
                  <Reveal tabbable={false} describe={false} detail="Trace its provenance">
                    <button type="button" className="cw-icon" aria-label="Trace provenance" onClick={() => openProvenance({
                      title: selectedClaim.text, kind: `claim evidence: ${row.stance}`, sourceId: row.evidence?.source_id, sourceUrl: row.source?.url ?? undefined,
                      locator: row.evidence?.locator ?? undefined, detail: row.evidence?.quote || row.evidence?.notes || undefined,
                      acceptedRecordType: 'evidence', acceptedRecordId: row.evidence?.id,
                    })}><Route size={15} aria-hidden="true"/></button></Reveal>
                </span>
              </li>;
            })}</ol>}

            {attaching && <div className="cw-pool">
              <div className="cw-pool-bar">
                <label className="cw-search sm"><Search size={15} aria-hidden="true"/>
                  <input type="search" value={poolTyped} onChange={e => setPoolTyped(e.target.value)} placeholder={`Search ${evidencePool.length} evidence records…`} aria-label="Search the evidence pool"/></label>
                <Input value={evidenceNote} onChange={(e: ChangeEvent<HTMLInputElement>) => setEvidenceNote(e.target.value)} placeholder="Optional reporter note for the next evidence link"/>
              </div>
              {evidencePool.length === 0 ? <p className="cw-muted">No evidence records are available in this investigation yet.</p>
                : pool.length === 0 ? <p className="cw-muted">No evidence matches.</p> : <ul className="cw-pool-list">{pool.slice(0, POOL_PAGE).map(row => <li key={row.evidence.id} className="cw-pool-row">
                  <div className="cw-pool-text">
                    {row.evidence.locator ? <Reveal detail={`Exact locator: ${row.evidence.locator}`}><span className="cw-pool-quote">{row.evidence.quote || row.evidence.notes || 'Evidence record'}</span></Reveal>
                      : <span className="cw-pool-quote">{row.evidence.quote || row.evidence.notes || 'Evidence record'}</span>}
                    <span className="cl-ev-src">{row.source.title}</span>
                  </div>
                  <div className="cw-pool-acts">
                    {/* Actions keep their words; each also carries its stance's line. */}
                    {(['supports', 'contradicts', 'context'] as const).map(k => <button type="button" key={k} className="cw-stance" disabled={hasLink(row.evidence.id, k)} onClick={() => attachEvidence(row, k)}>
                      <StanceGlyph stance={k} width={16}/>{STANCE_BUTTON[k]}{hasLink(row.evidence.id, k) ? ' ✓' : ''}</button>)}
                    <Reveal tabbable={false} describe={false} detail="Trace its provenance">
                      <button type="button" className="cw-icon" aria-label="Trace provenance" onClick={() => openProvenance({
                        title: row.source.title, kind: 'evidence pool', sourceId: row.source.id, sourceUrl: row.source.url ?? undefined,
                        locator: row.evidence.locator ?? undefined, detail: row.evidence.quote || row.evidence.notes || undefined,
                        acceptedRecordType: 'evidence', acceptedRecordId: row.evidence.id,
                      })}><Route size={15} aria-hidden="true"/></button></Reveal>
                  </div>
                </li>)}</ul>}
              {pool.length > POOL_PAGE && <p className="cw-muted">{pool.length - POOL_PAGE} more: search to find them.</p>}
            </div>}
          </section>}

          <section className="cw-sec">
            <h5 className="cw-sec-h">Review</h5>
            <div className="cw-form">
              <StatusPicker value={claimStatus} current={selectedClaim.status} onChange={setClaimStatus}/>
            </div>
            <div className="cw-form">
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
              {/* The confidence is its figure; the slider under it sets it, and its name is revealed. */}
              <Reveal tabbable={false} describe={false} detail="Confidence: how sure you are, from 0 to 100%">
                <span className="cw-conf"><b className={claimConfidence ? '' : 'zero'}>{pct(claimConfidence)}<small>%</small></b>
                  <Slider className="w-40" value={[claimConfidence]} min={0} max={1} step={0.05}
                    onValueChange={(vals: number[]) => setClaimConfidence(vals[0])}/></span></Reveal>
            </div>
            <div className="cw-form">
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
          </section>

          {workspace && <>
            {workspace.review_history.length > 0 && <section className="cw-sec">
              <h5 className="cw-sec-h">Review history <span className="cw-sec-n">{workspace.review_history.length}</span></h5>
              {/* The status shapes and the rationale show; the words, confidences, grades and time are revealed on the rationale. */}
              {<ol className="cw-hist">{workspace.review_history.map(event => <li key={event.id}>
                <span className="cl-move"><ClaimStatusChip status={event.from_status}/><span aria-hidden="true">→</span><ClaimStatusChip status={event.to_status}/></span>
                <div>
                  <Reveal detail={<>
                    <span className="rv-row">{event.from_status} → {event.to_status}</span>
                    <span className="rv-row">{pct(event.from_confidence)}% → {pct(event.to_confidence)}%</span>
                    {(event.to_evidence_grade || event.from_evidence_grade) && <span className="rv-row">{gradeText({evidence_grade: event.from_evidence_grade, agreement_grade: event.from_agreement_grade}) ?? 'not graded'} → {gradeText({evidence_grade: event.to_evidence_grade, agreement_grade: event.to_agreement_grade}) ?? 'not graded'}</span>}
                    {event.created_at && <span className="rv-row">{timeWords(event.created_at)}</span>}
                  </>}><div>{event.rationale}</div></Reveal>
                  {event.override_reason && <div className="done-overridden">Marked without: {(event.unmet_rules ?? []).join(', ')}. Reason: {event.override_reason}</div>}
                </div>
              </li>)}</ol>}
            </section>}

            {workspace.dependent_relationships.length > 0 && <section className="cw-sec">
              <h5 className="cw-sec-h">Relationships resting on it <span className="cw-sec-n">{workspace.dependent_relationships.length}</span></h5>
              {<ul className="cw-rels">{workspace.dependent_relationships.map(dep => {
                  const rel = relationships.find(r => r.id === dep.id);
                  const trace = () => openProvenance({title: selectedClaim.text, kind: 'claim-dependent relationship', traceRecordType: 'relationship', acceptedRecordId: dep.id});
                  return <li key={dep.id}>
                    <span className="cl-rel"><FamilyMark schema={rel?.schema}/>
                      <Reveal detail={`${rel?.schema || 'FollowTheMoney relationship'} · ${dep.evidence_ids.length} linked evidence record(s)`}>
                        {rel ? `${rel.source.caption} → ${rel.target.caption}` : `Relationship ${dep.id}`}</Reveal></span>
                    <button type="button" className="cw-btn" onClick={() => rel ? onInspectRelationship(rel.id) : trace()}>Inspect relationship</button>
                    <button type="button" className="cw-btn" onClick={trace}>Trace relationship</button>
                  </li>;
                })}</ul>}
            </section>}
          </>}
        </>}
      </section>
    </div>
  </div>;
}

/** No claim open: the case's claims at a glance, each status a bar as long as its share; a click shows only those. */
function ClaimsOverview({counts, total, onShape}: {counts: Record<ClaimStatus, number>; total: number; onShape: (s: ClaimStatus) => void}): ReactElement {
  return <div className="cw-over">
    <p className="cw-over-ask">Choose a claim to inspect its evidence and verification state.</p>
    {total > 0 && <ul className="cw-over-bars">{SHAPE_ORDER.filter(s => counts[s]).map(s => <li key={s}>
      <button type="button" className={`cw-over-bar t-${s}`} onClick={() => onShape(s)} aria-label={`Show the ${counts[s]} ${SHAPE_WORD[s].toLowerCase()} claims`}>
        <b>{counts[s]}</b><span className="cw-over-word">{SHAPE_WORD[s]}</span>
        <span className="cw-over-track" aria-hidden="true"><i style={{width: `${(counts[s] / total) * 100}%`}}/></span>
      </button></li>)}</ul>}
  </div>;
}

const STATUS_WORD: Record<string, string> = {lead: 'Lead', unverified: 'Unverified', supported: 'Supported', confirmed: 'Confirmed', disputed: 'Disputed', rejected: 'Rejected'};

/** The claim's status to record, as the app's status control: one choice per status, each its status colour and its
 *  word (a control keeps its words); the one picked fills with its colour, the claim's status now is ringed. Arrows move. */
function StatusPicker({value, current, onChange}: {value: string; current: string; onChange: (status: string) => void}): ReactElement {
  const move = (e: KeyboardEvent<HTMLDivElement>): void => {
    const by = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!by) return;
    e.preventDefault();
    const next = CLAIM_STATUSES[(CLAIM_STATUSES.indexOf(value) + by + CLAIM_STATUSES.length) % CLAIM_STATUSES.length];
    onChange(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-status="${next}"]`)?.focus();
  };
  return <div className="cw-statuses" role="radiogroup" aria-label="Status" onKeyDown={move}>{CLAIM_STATUSES.map(st =>
    <button key={st} type="button" role="radio" aria-checked={value === st} tabIndex={value === st ? 0 : -1} data-status={st}
      data-current={current === st || undefined} className={`t-${shapeOf(st)}`} onClick={() => onChange(st)}>
      <i aria-hidden="true"/>{STATUS_WORD[st]}</button>)}</div>;
}

/** The number of sources, as a mark: two stacked pages. */
function SourcesIcon(): ReactElement {
  return <svg className="cl-src-icon" viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M6 3.5h7l3 3v10H6z"/><path d="M13 3.5v3h3"/><path d="M4 6v12h9"/></svg>;
}
