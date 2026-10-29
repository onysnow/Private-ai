'use client';
// Act › AI runs › Ask the case: the questions kept to be asked again, and whether this case runs them by itself
// (docs/project-notes/PLATFORM_NEEDS_PLAN.md, part 4). Ask it puts the question back in the box; Run now runs it in the
// background under the case's run settings; Stop asking forgets it. The case's research mode follows Settings › AI and
// research unless the case has its own, saved with a reason. Whatever runs, its answer is a proposal in Decide.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {apiTime} from '../../lib/timestamps';
import {
  deleteSavedQuestionMutation, getCaseResearchOptions, getCaseResearchQueryKey, listAiRunsQueryKey, putCaseResearchMutation, runSavedQuestionMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {SavedQuestionOut} from '../../lib/generated/types.gen';

type Mode = 'off' | 'ask' | 'automatic';
const MODE_WORDS: Record<Mode, string> = {off: 'Off', ask: 'Ask first', automatic: 'Without approval'};
const MODE_LINES: Record<Mode, string> = {
  off: 'Saved questions run only when you press Run now.',
  ask: 'When new documents arrive, Needs you asks whether to run again.',
  automatic: 'When an import finishes, every saved question runs again by itself. The answers wait in Decide.',
};

export function SavedQuestions({investigationId, onAsk}: {investigationId: string; onAsk: (q: SavedQuestionOut) => void}): ReactElement | null {
  const queryClient = useQueryClient();
  const key = getCaseResearchQueryKey({path: {investigation_id: investigationId}});
  const research = useQuery({...getCaseResearchOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const [choosing, setChoosing] = useState<Mode | null>(null);
  const [reason, setReason] = useState('');
  const [said, setSaid] = useState('');
  const refresh = () => {
    void queryClient.invalidateQueries({queryKey: key});
    void queryClient.invalidateQueries({queryKey: listAiRunsQueryKey({path: {investigation_id: investigationId}})});
  };
  const setMode = useMutation({...putCaseResearchMutation(), onSuccess: data => { queryClient.setQueryData(key, data); setChoosing(null); setReason(''); }});
  const runNow = useMutation({...runSavedQuestionMutation(), onSuccess: () => { setSaid('Running in the background. The answer will wait for you in AI drafts.'); refresh(); }});
  const stop = useMutation({...deleteSavedQuestionMutation(), onSuccess: refresh});

  if (!research.data) return null;
  const d = research.data;
  const mode = d.mode as Mode;
  const problem = setMode.error ?? runNow.error ?? stop.error;

  return <div className="br-saved" aria-labelledby="br-saved-head">
    <p className="br-eyebrow" id="br-saved-head">Saved questions</p>
    {!d.questions.length ? <p className="br-quietline">None yet. Save a question from its plan to ask it again{mode === 'automatic' ? ', or by itself after each import' : ''}.</p>
      : <ul>{d.questions.map(q => <li key={q.id}>
        {/* When it last ran is revealed on the question. */}
        <Reveal detail={q.last_run_at ? `Last run ${apiTime(q.last_run_at).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}` : 'Not run yet'}>
          <span>{q.question}{q.module === 'hypothesis_test' && q.working_theory ? <em> · testing “{q.working_theory}”</em> : null}</span></Reveal>
        <button type="button" className="br-quiet" onClick={() => onAsk(q)}>Ask it</button>
        <button type="button" className="br-quiet" disabled={!d.ai_enabled || runNow.isPending} onClick={() => runNow.mutate({path: {saved_question_id: q.id}})}>Run now</button>
        <button type="button" className="br-quiet" disabled={stop.isPending} onClick={() => stop.mutate({path: {saved_question_id: q.id}})}>Stop asking it</button>
      </li>)}</ul>}

    <div className="br-saved-mode">
      <span className="br-seg" role="radiogroup" aria-label="This case: research without asking">
        {/* What each mode does is revealed on it. */}
        {(['off', 'ask', 'automatic'] as const).map(m => <Reveal key={m} tabbable={false} detail={MODE_LINES[m]}><button type="button" role="radio" aria-checked={mode === m}
          className={(choosing ?? mode) === m ? 'on' : ''} onClick={() => { if (m !== mode) { setChoosing(m); setReason(''); } else setChoosing(null); }}>{MODE_WORDS[m]}</button></Reveal>)}
      </span>
      <small>{d.own ? <>This case’s own choice{d.reason ? `: “${d.reason}”` : ''}. <button type="button" className="br-quiet"
        disabled={setMode.isPending} onClick={() => setMode.mutate({path: {investigation_id: investigationId}, body: {mode: null}})}>Follow Settings again ({MODE_WORDS[d.default as Mode] ?? d.default})</button></>
        : 'As in Settings › AI and research.'}</small>
    </div>
    {choosing && <form className="br-add br-why" noValidate onSubmit={e => {
      e.preventDefault();
      setMode.mutate({path: {investigation_id: investigationId}, body: {mode: choosing, reason: reason.trim()}});
    }}>
      <input value={reason} onChange={e => setReason(e.target.value)} aria-label="Why this case does research differently" maxLength={300}
        placeholder="Why this case does research differently, in one line" autoFocus/>
      <button type="submit" disabled={setMode.isPending || !reason.trim()}>Save for this case</button>
      <button type="button" onClick={() => setChoosing(null)}>Cancel</button>
    </form>}
    {!d.ai_enabled && <p className="br-quietline">No model is set up, so nothing runs.</p>}
    {said && <p role="status" className="br-ok">{said}</p>}
    {problem && <p role="alert" className="br-bad">{errorMessage(problem, 'Could not do that.')}</p>}
  </div>;
}
