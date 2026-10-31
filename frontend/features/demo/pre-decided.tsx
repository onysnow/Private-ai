'use client';
// The demo's pre-made decisions on screen (DECISIONS_LOG 45, 53; backend app/services/demo_decided.py): a demo case
// opens as a nearly finished investigation, its review decisions signed "Demo (pre-decided)". Where the queue is
// (Decide, Case home's Next up) one quiet line says how many the demo decided ahead, with its counts by kind on hover
// and "Undo them" behind a confirmation that says what comes back to the queue. Where one decision is shown, a
// pre-made one carries the demo's mark, "Decided ahead by the demo" on hover. Nothing shows on a case that is not a
// demo: the counts endpoint answers 404 there, and a case known not to be a demo is not asked at all.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {UseQueryResult} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {getPreDecidedOptions, undoPreDecidedMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {DemoPreDecidedOut, DemoPreDecidedUndo, GetPreDecidedError} from '../../lib/generated/types.gen';

/** Who signs the demo's decisions (backend app/db/decided_by.py). */
export const DEMO_DECIDER_ID = 'demo-pre-decided';
export const DEMO_DECIDER_NAME = 'Demo (pre-decided)';
/** The demo's note on each decision starts with this; the rule that made it follows. */
const NOTE_PREFIX = `${DEMO_DECIDER_NAME}: `;

export type PreDecidedKind = NonNullable<DemoPreDecidedUndo['kind']>;
const KINDS: PreDecidedKind[] = ['proposal', 'check', 'watchlist'];
const KIND_WORDS: Record<PreDecidedKind, [string, string]> = {
  proposal: ['proposal', 'proposals'], check: ['check or missing value', 'checks and missing values'], watchlist: ['watchlist hit', 'watchlist hits'],
};
/** What each decision became, as words (the statuses demo_decided.py sets). */
const OUTCOME: Record<string, string> = {
  accepted: 'accepted', rejected: 'rejected', unclear: 'set aside as unclear', not_needed: 'not needed here', dismissed: 'dismissed',
};
/** Statuses that mean "still waiting": never counted as decided. */
const WAITING = new Set(['proposed', 'open', 'new']);

const words = (n: number, kind: PreDecidedKind) => `${n} ${KIND_WORDS[kind][n === 1 ? 0 : 1]}`;

/** How many the demo decided, in all and by kind (what is waiting again after an undo is left out). */
export function decidedCounts(data: DemoPreDecidedOut | undefined): {total: number; byKind: Record<PreDecidedKind, number>} {
  const byKind = {proposal: 0, check: 0, watchlist: 0};
  for (const kind of KINDS) {
    for (const [status, n] of Object.entries(data?.counts[kind] ?? {})) if (!WAITING.has(status)) byKind[kind] += n;
  }
  return {total: byKind.proposal + byKind.check + byKind.watchlist, byKind};
}

/** Whether a decision was made ahead by the demo: signed by it, or (a proposal, which keeps no signer in its reply)
 *  noted by it. */
export function isDemoDecided(row: {decided_by_id?: string | null; decided_by_name?: string | null; who?: string | null; note?: string | null;
  reviewer_note?: string | null}): boolean {
  return row.decided_by_id === DEMO_DECIDER_ID || row.decided_by_name === DEMO_DECIDER_NAME || row.who === DEMO_DECIDER_NAME
    || Boolean(row.reviewer_note?.startsWith(NOTE_PREFIX)) || Boolean(row.note?.startsWith(NOTE_PREFIX));
}

/** The rule the demo noted on a decision, without its signature ("the case already holds this payment."). */
export function demoRule(note: string | null | undefined): string | null {
  return note?.startsWith(NOTE_PREFIX) ? note.slice(NOTE_PREFIX.length) : null;
}

/** The demo's mark: a stamp in a dashed ring, as the demo's decisions are stamped ahead of the person. */
export function DemoGlyph({size = 16}: {size?: number}): ReactElement {
  return <svg className="pd-glyph" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="8" cy="8" r="6.3" strokeDasharray="2 1.6"/><path d="M5.2 8.3l1.9 1.9 3.8-4.2"/>
  </svg>;
}

/** The mark on one decision the demo made: "Decided ahead by the demo" and its rule on hover, and Undo when given. */
export function DemoMark({rule, onUndo, undoing = false}: {rule?: string | null; onUndo?: () => void; undoing?: boolean}): ReactElement {
  return <span className="pd-mark-wrap">
    <Reveal label="Decided ahead by the demo" detail={<><b>Decided ahead by the demo</b>{rule && <span className="rv-row">{rule}</span>}
      <span className="rv-row">Not a person&rsquo;s decision. Undo puts it back in the queue.</span></>}>
      <span className="pd-mark"><DemoGlyph/></span></Reveal>
    {onUndo && <button type="button" className="pd-undo-one" onClick={onUndo} disabled={undoing}>{undoing ? 'Undoing…' : 'Undo'}</button>}
  </span>;
}

/** The demo's counts for a case, or nothing on a case that is not a demo (isDemo false: not asked; else the endpoint's
 *  404 says so). */
export function usePreDecided(investigationId: string, isDemo?: boolean): UseQueryResult<DemoPreDecidedOut, GetPreDecidedError> {
  return useQuery({...getPreDecidedOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId) && isDemo !== false, retry: false});
}

/** Undo some of the demo's decisions (all, one kind, or one item), then refresh what reads them: the queue, the
 *  counts, the panels that list the decided items. */
export function useUndoPreDecided(investigationId: string): {run: (body: DemoPreDecidedUndo) => Promise<number>; pending: boolean} {
  const queryClient = useQueryClient();
  const mutation = useMutation({...undoPreDecidedMutation()});
  const run = async (body: DemoPreDecidedUndo): Promise<number> => {
    const reply = await mutation.mutateAsync({path: {investigation_id: investigationId}, body});
    await queryClient.invalidateQueries();
    return reply.undone ?? 0;
  };
  return {run, pending: mutation.isPending};
}

/** The quiet line where the queue is: the demo's mark, "n pre-decided" and Undo them; that the demo decided them, why,
 *  and the counts by kind are on hover (DECISIONS_LOG 53). Nothing when the demo decided none. */
export function PreDecidedLine({investigationId, isDemo, className}: {investigationId: string; isDemo?: boolean; className?: string}): ReactElement | null {
  const query = usePreDecided(investigationId, isDemo);
  const undo = useUndoPreDecided(investigationId);
  const [asked, setAsked] = useState<PreDecidedKind | 'all' | null>(null);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const {total, byKind} = decidedCounts(query.data);
  if (!query.data || (!total && !said)) return null;

  const ask = (what: PreDecidedKind | 'all') => { setAsked(what); setSaid(''); setProblem(''); };
  const confirm = async () => {
    if (!asked) return;
    try {
      const n = await undo.run(asked === 'all' ? {} : {kind: asked});
      setSaid(`${n} back in the queue to decide.`);
      setAsked(null);
    } catch (error) { setProblem(errorMessage(error, 'Could not undo them')); }
  };
  const kinds = KINDS.filter(k => byKind[k]);
  const outcomes = (kind: PreDecidedKind) => Object.entries(query.data?.counts[kind] ?? {}).filter(([s, n]) => n && !WAITING.has(s))
    .map(([s, n]) => `${n} ${OUTCOME[s] ?? s.replace(/_/g, ' ')}`).join(' · ');

  if (asked) {
    const n = asked === 'all' ? total : byKind[asked];
    const back: ReactNode = asked === 'all'
      ? kinds.map(k => <li key={k}>{words(byKind[k], k)}</li>)
      : <li>{words(byKind[asked], asked)}</li>;
    return <div className={`pd-confirm${className ? ` ${className}` : ''}`} role="group" aria-label="Undo the demo’s decisions">
      <p>Put <b>{n}</b> of the demo&rsquo;s decisions back in the queue? They wait for you in Decide again:</p>
      <ul>{back}</ul>
      <p className="pd-quiet">Your own decisions stay as they are.</p>
      {problem && <p role="alert">{problem}</p>}
      <div><button type="button" className="pd-go" onClick={() => void confirm()} disabled={undo.pending}>{undo.pending ? 'Undoing…' : `Undo ${n}`}</button>
        <button type="button" onClick={() => setAsked(null)}>Cancel</button></div>
    </div>;
  }

  return <p className={`pd-line${className ? ` ${className}` : ''}`} aria-label="Decided ahead by the demo">
    {total > 0 && <>
      <Reveal label={`${total} decided ahead by the demo`} describe={false} detail={<>
        <b>Decided ahead by the demo</b>
        <span className="rv-row">The demo is a nearly finished case: it decided these from what the case already holds.</span>
        {kinds.map(k => <span key={k} className="rv-row pd-kind"><span><b>{words(byKind[k], k)}</b>{outcomes(k) && <small>{outcomes(k)}</small>}</span>
          <button type="button" className="pd-undo-kind" onClick={() => ask(k)} aria-label={`Undo the ${KIND_WORDS[k][1]}`}>Undo</button></span>)}
      </>}>
        <span className="pd-count"><DemoGlyph/><b>{total}</b> pre-decided</span></Reveal>
      <button type="button" className="pd-undo" onClick={() => ask('all')}>Undo them</button>
    </>}
    {said && <span role="status" className="pd-quiet">{said}</span>}
  </p>;
}
