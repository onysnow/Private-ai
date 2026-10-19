'use client';
// Keep › Safety & data (mockup KEEP-safety-and-data; research Keep §7): one place that answers, at a glance, "Is my case
// safe on this computer, is it backed up, and what has left it?" Four parts: what lives where (left, large) with the
// totals and the period switch above it; the Keep cards (bottom); Your safety (right, top); the outbound log (right,
// bottom). The page does not scroll; the log scrolls inside. Hide screen top-right (Shift+Esc).
// Motion: none decorative; a new request draws one short pulse along its line, off under calm or reduced motion.
import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {Query} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

// Connects the generated client to the shared ApiClient, as every page that calls the API does.
import '../../lib/api-instance';
import {HIDE_SCREEN_EVENT} from '../../components/frame/app-frame';
import {ApiHttpError, errorMessage} from '../../lib/api-client';
import {getSafetyOptions, putSafetyAnswerMutation, putServiceModeMutation, settingsStatusOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {SafetyServiceOut, SafetySummaryOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {count, PERIODS, sinceOf} from './format';
import type {Period} from './format';
import {KeepCards} from './keep-cards';
import {OutboundLog} from './outbound-log';
import {WhatLivesWhere} from './what-lives-where';
import {YourSafety} from './your-safety';

/** The case: the one in the address (?inv=), or the one the workbench has open. */
function useCaseId(): string {
  const stored = useWorkbenchStore(state => state.investigationId);
  const [fromUrl, setFromUrl] = useState('');
  useEffect(() => { setFromUrl(new URLSearchParams(window.location.search).get('inv') ?? ''); }, []);
  return fromUrl || stored || '';
}

const isSafetyQuery = (q: Query) => {
  const id = (q.queryKey[0] as {_id?: string} | undefined)?._id;
  return id === 'getSafety' || id === 'getOutboundLog';
};

function Totals({summary, checking}: {summary: SafetySummaryOut; checking: boolean}): ReactElement {
  const t = summary.totals;
  const tiles: [number, string][] = [
    [t.requests, t.requests === 1 ? 'request left this computer' : 'requests left this computer'],
    [t.services_reached, t.services_reached === 1 ? 'service reached' : 'services reached'],
    [t.documents_sent, t.documents_sent === 1 ? 'document sent out' : 'documents sent out'],
    [t.ai_calls_outside, t.ai_calls_outside === 1 ? 'AI call outside' : 'AI calls outside'],
  ];
  return <ul className={`sd-totals${checking ? ' checking' : ''}`} aria-label="What left this computer in this period">
    {tiles.map(([n, words]) => <li key={words}><b className={n === 0 ? 'zero' : ''}>{count(n)}</b><span>{words}</span></li>)}
    {checking && <li className="sd-checking" aria-live="polite">checking</li>}
  </ul>;
}

function aiChip(summary: SafetySummaryOut): string {
  const ai = summary.stores.private_ai;
  const out = summary.totals.ai_calls_outside;
  if (!ai.enabled || !ai.provider) return out ? `AI off · ${count(out)} sent earlier` : 'AI off · nothing sent';
  if (ai.on_this_computer) return out ? `Private AI · local model · ${count(out)} sent` : 'Private AI · local model · nothing sent';
  return `AI · ${ai.provider} · ${out ? `${count(out)} sent` : 'nothing sent'}`;
}

export function SafetyScreen(): ReactElement {
  const inv = useCaseId();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>('week');
  const since = useMemo(() => sinceOf(period), [period]);
  const [picked, setPicked] = useState<string | null>(null);
  const summaryQuery = useQuery({
    ...getSafetyOptions({path: {investigation_id: inv}, query: since ? {since} : {}}),
    enabled: Boolean(inv), placeholderData: keepPreviousData, refetchInterval: 15_000,
  });
  const status = useQuery({...settingsStatusOptions(), retry: false});
  const summary = summaryQuery.data;
  const refresh = () => queryClient.invalidateQueries({predicate: isSafetyQuery});
  const mode = useMutation({...putServiceModeMutation(), onSuccess: refresh});
  const answer = useMutation({...putSafetyAnswerMutation(), onSuccess: refresh});

  // The frame's breadcrumb and its links keep the case.
  useEffect(() => {
    if (!summary) return;
    const store = useWorkbenchStore.getState();
    if (store.investigationId !== summary.investigation_id) store.setInvestigationId(summary.investigation_id);
    store.setInvestigationName(summary.investigation_name);
  }, [summary]);

  const ready = Boolean(summary);
  // The AI chip sits just after the frame's breadcrumb, which is fixed at the top left and as wide as its words.
  useEffect(() => {
    const crumbs = document.querySelector('.fr-crumbs');
    const root = document.querySelector<HTMLElement>('.sd');
    if (!crumbs || !root) return;
    const place = () => root.style.setProperty('--sd-crumbs-right', `${Math.round(crumbs.getBoundingClientRect().right)}px`);
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(crumbs);
    return () => ro.disconnect();
  }, [ready]);

  // Shift+Esc hides the screen (research Keep §7 "Corner").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && e.shiftKey) { e.preventDefault(); window.dispatchEvent(new Event(HIDE_SCREEN_EVENT)); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A new request draws one short pulse along its line: a service whose count went up since the last reply.
  const lastCounts = useRef<{since: string | null; counts: Map<string, number>} | null>(null);
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!summary || summaryQuery.isPlaceholderData) return;
    const counts = new Map(summary.services.map(s => [s.service, s.sent_count]));
    const before = lastCounts.current;
    lastCounts.current = {since, counts};
    if (!before || before.since !== since) return;
    const grew = summary.services.filter(s => s.sent_count > (before.counts.get(s.service) ?? 0)).map(s => s.service);
    if (!grew.length) return;
    setPulsing(new Set(grew));
    const t = window.setTimeout(() => setPulsing(new Set()), 400);
    return () => window.clearTimeout(t);
  }, [summary, since, summaryQuery.isPlaceholderData]);

  const onMode = (service: string, m: SafetyServiceOut['mode']) => mode.mutate({path: {investigation_id: inv}, body: {service, mode: m}});
  const onAnswer = (question: string, a: 'YES' | 'NO' | 'NOT_SURE' | null) =>
    answer.mutate({path: {investigation_id: inv}, body: {question: question as 'threats' | 'doxxing', answer: a}});

  if (!inv) return <div className="sd sd-empty"><p>Open a case first: Safety & data shows what lives on this computer for one case, and what has left it.</p></div>;
  if (!summary) {
    const down = summaryQuery.isError && !(summaryQuery.error instanceof ApiHttpError);
    return <div className="sd sd-empty" role="status">
      {summaryQuery.isError ? <p>{down ? 'Can’t reach the server on this computer. Nothing can leave the computer while it is stopped; Hide screen still works.'
        : errorMessage(summaryQuery.error, 'Safety & data could not be read')}</p> : <p>Checking what lives on this computer…</p>}
    </div>;
  }
  const checking = summaryQuery.isFetching && summaryQuery.isPlaceholderData;
  const stale = summaryQuery.isError;
  const pickedService = summary.services.find(s => s.service === picked) ?? null;
  return <div className="sd">
    <header className="sd-head">
      <div className="sd-head-line">
        <span className="sd-ai-chip">{aiChip(summary)}</span>
        <button type="button" className="sd-hide" onClick={() => window.dispatchEvent(new Event(HIDE_SCREEN_EVENT))} title="Cover the screen at once (Shift+Esc)">
          <span aria-hidden="true">◐</span> Hide screen</button>
      </div>
      <h1>What lives on <em>this computer</em>, and what leaves it</h1>
      {stale && <p className="sd-warn" role="status">Can’t reach the server on this computer: these are the last numbers it gave.</p>}
      {(mode.isError || answer.isError) && <p className="sd-warn" role="alert">{errorMessage(mode.error ?? answer.error, 'That change was not saved')}</p>}
    </header>
    <div className="sd-board">
      <section className="sd-panel sd-where-panel" aria-label="What lives where">
        <div className="sd-top">
          <Totals summary={summary} checking={checking}/>
          <div className="sd-period" role="group" aria-label="Period">
            {PERIODS.map(p => <button key={p.id} type="button" aria-pressed={period === p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
          </div>
        </div>
        <WhatLivesWhere summary={summary} status={status.data} onMode={onMode} onPickService={s => setPicked(p => p === s ? null : s)}
          pickedService={picked} pulsing={pulsing} checking={checking}/>
      </section>
      <KeepCards summary={summary} status={status.data} onChanged={refresh}/>
      <div className="sd-right">
        <YourSafety summary={summary} onAnswer={onAnswer}/>
        <OutboundLog investigationId={inv} since={since} service={picked} serviceName={pickedService?.name ?? null} allCount={summary.totals.requests}
          onClearService={() => setPicked(null)}/>
      </div>
    </div>
  </div>;
}
