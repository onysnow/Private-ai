'use client';
// The case home's one-line AI strip (research AI §3–4 "Front and centre"): "AI: 1 draft waiting for review · last run
// 14:02", or "AI off". While a run is live it becomes a miniature of Watch the run: five column dots (RAS TAS QAS LAS
// DAS) that light as they are routed, the model ring (breathing only while the model writes) and a problem counter.
// After a run, the four tallies of its result. Clicking opens the run in Act › AI runs. Beside it, unless a run is live,
// an "Ask the case…" field opens step 1 of Ask the case with the question typed there.
import {useQuery} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import type {ReactElement} from 'react';

import {
  capabilitiesOptions, listAiRunEventsOptions, listAiRunsOptions, listInvestigationAiAnalysisCandidatesOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {apiTime} from '../../lib/timestamps';
import {Reveal} from '../../components/ui/reveal';
import {thoughtTallies} from './run-tally';

const SYSTEMS = ['ras', 'tas', 'qas', 'las', 'das'] as const;
const hhmm = (iso: string) => apiTime(iso).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', hour12: false});

export function AiStrip({investigationId}: {investigationId: string}): ReactElement | null {
  const router = useRouter();
  const openAiRun = useWorkbenchStore(s => s.openAiRun);
  const openAskCase = useWorkbenchStore(s => s.openAskCase);
  const caps = useQuery({...capabilitiesOptions(), staleTime: 60_000});
  const on = Boolean(caps.data?.ai_features_enabled);
  const runs = useQuery({...listAiRunsOptions({path: {investigation_id: investigationId}, query: {limit: 1}}), enabled: on && Boolean(investigationId),
    refetchInterval: query => (query.state.data?.runs[0] && !query.state.data.runs[0].finished ? 2000 : 30_000)});
  const drafts = useQuery({...listInvestigationAiAnalysisCandidatesOptions({path: {investigation_id: investigationId}, query: {review_status: 'proposed', limit: 100}}),
    enabled: on && Boolean(investigationId)});
  const latest = runs.data?.runs[0];
  const events = useQuery({...listAiRunEventsOptions({path: {investigation_id: investigationId, run_id: latest?.run_id ?? ''}, query: {after: 0}}),
    enabled: Boolean(latest), refetchInterval: latest && !latest.finished ? 1500 : false});
  if (!caps.data) return null;
  if (!on) return <Reveal detail="AI is turned off on this computer."><span className="ai-strip off">AI off</span></Reveal>;
  const waiting = drafts.data?.candidates.length ?? 0;
  const actHref = `/act?inv=${encodeURIComponent(investigationId)}#ai-runs`;
  const open = () => { if (latest) { openAiRun(latest.run_id); router.push(actHref); } };
  // Ready: a question field (research AI §1 "Ask the case…"). Enter opens step 1 of Ask the case with the question;
  // nothing runs until the plan has been seen.
  const askField = <form className="ai-ask" role="search" aria-label="Ask the case" onSubmit={e => {
    e.preventDefault();
    const field = e.currentTarget.elements.namedItem('question') as HTMLInputElement | null;
    openAskCase(field?.value.trim() ?? '');
    router.push(actHref);
  }}><input name="question" aria-label="Ask the case a question" placeholder="Ask the case…" autoComplete="off"/></form>;
  const list = events.data?.events ?? [];
  const routed = new Set(list.filter(e => e.kind === 'ROUTE').map(e => e.system));
  const writing = list.some(e => e.node === 'model' && e.verdict === 'STARTED') && !list.some(e => e.node === 'model' && e.verdict !== 'STARTED');
  const t = thoughtTallies(list);
  // "AI · 1 waiting" shows; what waits and when the last run was are revealed on it.
  const short = `AI · ${waiting} waiting`;
  const words = `${waiting} AI draft${waiting === 1 ? '' : 's'} waiting for review${latest ? ` · last run ${hhmm(latest.created_at)}` : ''}`;
  if (!latest) return <><Reveal detail={words}><span className="ai-strip"><span>{short}</span></span></Reveal>{askField}</>;
  if (!latest.finished) return <button type="button" className="ai-strip live" onClick={open}
    aria-label={`AI run live: ${[...routed].map(s => s.toUpperCase()).join(', ') || 'nothing'} routed, ${writing ? 'the model is writing, ' : ''}${latest.problems} problem${latest.problems === 1 ? '' : 's'}. Open it`}>
    <span className="ai-live">● live</span>
    <svg viewBox="0 0 96 16" width="96" height="16" aria-hidden="true">
      {SYSTEMS.map((s, i) => <circle key={s} cx={8 + i * 14} cy={8} r={4} className={routed.has(s) ? 'on' : ''}><title>{s.toUpperCase()}</title></circle>)}
      <circle cx={86} cy={8} r={5.5} className={`ring${writing ? ' writing' : ''}`}/>
    </svg>
    <b className={latest.problems ? 'bad' : ''}>{latest.problems} problem{latest.problems === 1 ? '' : 's'}</b></button>;
  return <><Reveal tabbable={false} detail={`${words}. Open the last run in Act › AI runs.`}><button type="button" className="ai-strip" onClick={open}>
    <span>{short}</span>
    <span className="ai-tallies" aria-label={`last run: ${t.good} verified, ${t.partial} in between, ${t.bad} stopped, ${t.neutral} findings`}>
      <i className="good">✓{t.good}</i><i className="partial">◆{t.partial}</i><i className="bad">✕{t.bad}</i><i className="neutral">○{t.neutral}</i></span></button></Reveal>{askField}</>;
}
