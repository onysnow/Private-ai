'use client';
// Per-claim review of an AI answer (research AI §2; mockup AI_1's trace drawer, section 3). One claim's words with the
// grounded / guessed underline, Keep · Correct · Reject for it, and step 4 of Ask the case: the review sheet, every
// claim of the answer on the left and the chosen one on the right. Decisions are saved one by one on the proposal
// (POST /ai-analysis-candidates/{id}/claim-review) and also land in the run record as steps by you. The whole answer
// is still accepted or rejected as one; until then, and until a person keeps or corrects a claim, its words stay plum.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {errorMessage} from '../../lib/api-client';
import {onScreen, typingInto} from '../../lib/on-screen';
import {singleKeysOn} from '../../lib/shortcuts';
import {
  getAiAnalysisCandidateEndpointOptions, getAiAnalysisCandidateEndpointQueryKey, reviewAiAnalysisCandidateEndpointMutation, reviewAiClaimEndpointMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {AiAnalysisCandidateOut} from '../../lib/generated/types.gen';
import {acceptedByAPerson, decisionWords, REJECT_REASONS, reviewItems} from './claim-review';
import type {Decision, ReviewItem} from './claim-review';

const words = (v: string | null | undefined) => (v ? (v.charAt(0) + v.slice(1).toLowerCase()).replace(/_/g, ' ') : '');
const refWords = (item: ReviewItem) => item.grounded.map(r => `${r.record_type}:${r.record_id.slice(0, 8)}`).join(', ');

/** A decision as a shape and a word, never colour alone: kept ✓ circle, corrected ◆, rejected ✕ square, waiting a dashed plum ring. */
export function DecisionShape({decision}: {decision: string | null | undefined}): ReactElement {
  const d = decision ?? 'wait';
  return <svg className={`cr-shape ${d}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    {d === 'keep' && <><circle cx={7} cy={7} r={5}/><path d="M4.6 7 l1.7 1.7 l3.1 -3.3"/></>}
    {d === 'correct' && <rect x={3.3} y={3.3} width={7.4} height={7.4} transform="rotate(45 7 7)"/>}
    {d === 'reject' && <><rect x={2} y={2} width={10} height={10}/><path d="M4.5 4.5 l5 5 M9.5 4.5 l-5 5"/></>}
    {d === 'wait' && <circle cx={7} cy={7} r={5}/>}
  </svg>;
}

/** The underline key: grounded solid, guessed dashed, plum while no person has accepted the words. */
export function UnderlineKey(): ReactElement {
  return <p className="cr-key" aria-label="Key for the claim underlines">
    <span><u className="cr-text grounded">grounded</u> cites a record in the packet</span>
    <span><u className="cr-text guessed">guessed</u> no record says it</span>
    <span><u className="cr-text grounded ai">plum</u> AI words no person has accepted</span>
  </p>;
}

/** One claim's words: grounded or guessed, plum until accepted; a correction shows yours with the model's beside it, struck. */
export function ClaimText({item, reviewStatus}: {item: ReviewItem; reviewStatus: string | undefined}): ReactElement {
  const d = item.decision?.decision;
  const ground = item.grounded.length ? 'grounded' : 'guessed';
  const hover = item.grounded.length ? `Rests on ${refWords(item)}, in the packet the run was checked against` : 'No record in the packet says this: the model’s own words';
  const said = item.grounded.length ? `, grounded in ${item.grounded.length} record${item.grounded.length === 1 ? '' : 's'}` : ', guessed: no record cited';
  if (d === 'correct' && item.decision?.text) return <span className="cr-claim">
    <span className="cr-text mine">{item.decision.text}</span><span className="sr-only">, corrected by you; the model wrote: </span>
    {' '}<s className="cr-was" title="The model’s words, kept beside yours">{item.text}</s></span>;
  const plum = !acceptedByAPerson(item, reviewStatus) && d !== 'reject';
  const text = <span className={`cr-text ${ground}${plum ? ' ai' : ''}`} title={hover}>{item.text}</span>;
  return <span className="cr-claim">{d === 'reject' ? <del>{text}</del> : text}<span className="sr-only">{said}{d === 'reject' ? ', rejected by you' : plum ? ', AI words not yet accepted' : ''}</span></span>;
}

/** Keep · Correct · Reject for one claim, or the decision made and Undo. Read-only once the whole answer is reviewed. */
export function ClaimDecision({candidate, item, onSaved, compact = false}: {
  candidate: AiAnalysisCandidateOut; item: ReviewItem; onSaved?: () => void; compact?: boolean;
}): ReactElement {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'correct' | 'reject'>('idle');
  const [text, setText] = useState(item.text);
  const [reason, setReason] = useState('');
  useEffect(() => { setMode('idle'); setText(item.decision?.text ?? item.text); setReason(''); }, [item.id, item.text, item.decision?.text]);
  const save = useMutation({...reviewAiClaimEndpointMutation(), onSuccess: data => {
    queryClient.setQueryData(getAiAnalysisCandidateEndpointQueryKey({path: {candidate_id: candidate.id}}), data);
    setMode('idle');
    onSaved?.();
  }});
  const send = (decision: Decision | 'clear', extra: {text?: string; reason?: string} = {}) =>
    save.mutate({path: {candidate_id: candidate.id}, body: {claim_id: item.id, decision, text: extra.text ?? null, reason: extra.reason ?? null}});
  const open = candidate.review_status === 'proposed';
  const d = item.decision;
  if (!open) return <p className="cr-decide done"><DecisionShape decision={d?.decision}/> {d ? decisionWords(d) : `the whole answer was ${candidate.review_status}`}{d?.reason ? `: ${d.reason}` : ''}</p>;
  return <div className={`cr-decide${compact ? ' compact' : ''}`} role="group" aria-label={`Your decision on ${item.id}`}>
    {d && mode === 'idle' && <span className="cr-made"><DecisionShape decision={d.decision}/> {decisionWords(d)}{d.reason ? `: ${d.reason}` : ''}
      <button type="button" className="cr-undo" onClick={() => send('clear')} disabled={save.isPending}>Undo</button></span>}
    {mode === 'idle' && <span className="cr-buttons">
      <button type="button" aria-pressed={d?.decision === 'keep'} onClick={() => send('keep')} disabled={save.isPending || d?.decision === 'keep'}>✓ Keep</button>
      <button type="button" aria-pressed={d?.decision === 'correct'} onClick={() => setMode('correct')} disabled={save.isPending}>◆ Correct</button>
      <button type="button" aria-pressed={d?.decision === 'reject'} onClick={() => setMode('reject')} disabled={save.isPending}>✕ Reject</button>
    </span>}
    {mode === 'correct' && <form className="cr-form" onSubmit={e => { e.preventDefault(); send('correct', {text: text.trim()}); }}>
      <label>How it should read <small>kept as yours; the model’s words stay beside it</small>
        <textarea rows={compact ? 2 : 3} value={text} onChange={e => setText(e.target.value)} autoFocus/></label>
      <span><button type="submit" className="br-primary" disabled={!text.trim() || text.trim() === item.text.trim() || save.isPending}>Save correction</button>
        <button type="button" onClick={() => setMode('idle')}>Cancel</button></span>
    </form>}
    {mode === 'reject' && <form className="cr-form" onSubmit={e => { e.preventDefault(); send('reject', {reason: reason.trim()}); }}>
      <span className="cr-reasons" role="group" aria-label="Why reject it">{REJECT_REASONS.map(r => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</span>
      <input aria-label="Why reject this claim" value={reason} onChange={e => setReason(e.target.value)} placeholder="Or say why, in a few words" autoFocus/>
      <span><button type="submit" className="br-primary" disabled={!reason.trim() || save.isPending}>Reject the claim</button>
        <button type="button" onClick={() => setMode('idle')}>Cancel</button></span>
    </form>}
    {save.isError && <span role="alert" className="br-bad">{errorMessage(save.error, 'Not saved')}</span>}
  </div>;
}

/** Step 4 of Ask the case: every claim of the answer, decided one by one, then the whole answer accepted or rejected. */
export function ReviewSheet({candidateId, header, onBack, onSaved, active = true}: {
  candidateId: string | null; header: ReactNode; onBack: () => void; onSaved?: () => void; active?: boolean;
}): ReactElement {
  const queryClient = useQueryClient();
  const q = useQuery({...getAiAnalysisCandidateEndpointOptions({path: {candidate_id: candidateId ?? ''}}), enabled: Boolean(candidateId)});
  const candidate = q.data;
  const items = reviewItems(candidate);
  const [at, setAt] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const item = items[Math.min(at, Math.max(0, items.length - 1))];
  const whole = useMutation({...reviewAiAnalysisCandidateEndpointMutation(), onSuccess: () => {
    setRejecting(false);
    void queryClient.invalidateQueries({queryKey: getAiAnalysisCandidateEndpointQueryKey({path: {candidate_id: candidateId ?? ''}})});
    onSaved?.();
  }});
  const rootRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  // J/K move, A keeps, E corrects, R rejects (research AI §2, the same keys as document review).
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !singleKeysOn() || typingInto(e.target) || !onScreen(rootRef.current) || !items.length) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || k === 'k') { e.preventDefault(); setAt(a => Math.max(0, Math.min(items.length - 1, a + (k === 'j' ? 1 : -1)))); }
      else if (['a', 'e', 'r'].includes(k)) {
        const button = rootRef.current?.querySelector<HTMLButtonElement>(`.cr-detail .cr-buttons button:nth-child(${k === 'a' ? 1 : k === 'e' ? 2 : 3})`);
        if (button && !button.disabled) { e.preventDefault(); button.click(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  useEffect(() => { listRef.current?.querySelector('li.on')?.scrollIntoView?.({block: 'nearest'}); }, [at]);

  const counts = {keep: 0, correct: 0, reject: 0, wait: 0};
  for (const i of items) counts[(i.decision?.decision as 'keep' | 'correct' | 'reject' | undefined) ?? 'wait'] += 1;
  const open = candidate?.review_status === 'proposed';
  return <section className="br br-review" aria-label="Review the answer" ref={rootRef}>
    {header}
    {!candidateId ? <p className="br-tray">This run saved no answer to review. <button type="button" className="br-quiet" onClick={onBack}>Back to the run</button></p>
      : q.isLoading ? <div className="wr-skeleton" aria-label="Loading the answer"><i/><i/><i/></div>
      : q.isError ? <p role="alert" className="br-bad">{errorMessage(q.error, 'Could not read the answer')}</p>
      : !items.length ? <p className="br-tray">This answer has no claims to decide one by one; accept or reject it as a whole. <button type="button" className="br-quiet" onClick={onBack}>Back to the run</button></p>
      : <>
        <div className="cr-bar">
          <p role="status"><b>{items.length} {candidate?.module === 'hypothesis_test' ? 'hypotheses' : 'claims'}</b> · {counts.keep} kept · {counts.correct} corrected · {counts.reject} rejected · <em>{counts.wait} wait for you</em></p>
          <UnderlineKey/>
          <button type="button" className="br-quiet" onClick={onBack}>Back to the run</button>
        </div>
        <div className="cr-cols">
          <ol className="cr-list" ref={listRef} aria-label="The answer’s claims">
            {items.map((i, n) => <li key={i.id} className={`${n === at ? 'on' : ''}${i.decision ? ` ${i.decision.decision}` : ''}`}>
              <button type="button" onClick={() => setAt(n)} aria-current={n === at ? 'true' : undefined}
                aria-label={`${i.id}, ${words(i.classification) || 'unclassified'}, ${i.confidenceTerm ? words(i.confidenceTerm).toLowerCase() : 'no likelihood given'}, ${i.grounded.length} source${i.grounded.length === 1 ? '' : 's'}, ${decisionWords(i.decision)}`}>
                <DecisionShape decision={i.decision?.decision}/><span className="cr-id">{i.id}</span>
                <span className="cr-row-text"><ClaimText item={i} reviewStatus={candidate?.review_status}/></span>
                <small>{words(i.classification)}{i.confidenceTerm ? ` · ${words(i.confidenceTerm).toLowerCase()}` : ''}</small>
                <b>{i.decision ? decisionWords(i.decision).split(' · ')[0] : 'waits'}</b></button></li>)}
          </ol>
          {item && candidate && <div className="cr-detail" aria-label={`${item.id} in full`} role="region">
            <p className="br-eyebrow">{item.id} · {words(item.classification) || 'unclassified'} <span className="br-chip ai">model says</span></p>
            <p className="cr-big"><ClaimText item={item} reviewStatus={candidate.review_status}/></p>
            <dl className="br-facts">
              <dt>Likelihood</dt><dd>{item.confidenceTerm ? `model: ${words(item.confidenceTerm).toLowerCase()}` : 'not given (old format)'}</dd>
              <dt>Rests on</dt><dd>{item.refs.length ? <ul className="wr-refs">{item.refs.map(r => {
                const inPacket = item.grounded.some(g => g.record_type === r.record_type && g.record_id === r.record_id);
                return <li key={`${r.record_type}:${r.record_id}`} className={inPacket ? '' : 'out'}><b>{r.record_type}:{r.record_id.slice(0, 8)}</b> {inPacket ? 'in the packet' : 'not in the packet'}</li>;
              })}</ul> : 'no record: the model’s own words'}</dd>
            </dl>
            <ClaimDecision candidate={candidate} item={item} onSaved={onSaved}/>
            <small className="cr-keys">J / K move · A keep · E correct · R reject</small>
          </div>}
        </div>
      </>}
    {candidate && items.length > 0 && <footer className="br-foot">
      {open && !rejecting && <>
        <button type="button" className="br-primary" onClick={() => whole.mutate({path: {candidate_id: candidate.id}, body: {decision: 'accept', note: null}})}
          disabled={whole.isPending}>✓ Accept the answer</button>
        <button type="button" onClick={() => setRejecting(true)}>✕ Reject the answer with reason</button></>}
      {rejecting && <form className="br-add br-why" onSubmit={e => { e.preventDefault(); whole.mutate({path: {candidate_id: candidate.id}, body: {decision: 'reject', note: note.trim()}}); }}>
        <input aria-label="Why reject the whole answer" value={note} onChange={e => setNote(e.target.value)} autoFocus/>
        <button type="submit" disabled={!note.trim() || whole.isPending}>Reject</button></form>}
      {!open && <span className="br-ok" role="status">The answer was {candidate.review_status}{candidate.review_status === 'accepted' && counts.reject ? `, without the ${counts.reject} claim${counts.reject === 1 ? '' : 's'} you rejected` : ''}.</span>}
      {whole.isError && <span role="alert" className="br-bad">{errorMessage(whole.error, 'Not saved')}</span>}
      <span className="br-note">{open ? 'Claims you have not decided are accepted with the answer. Nothing joins the case until you accept it.' : 'Decisions close with the answer.'}</span>
    </footer>}
  </section>;
}
