'use client';
// Timeline › Periods (mockup TIME_8; research §2.9): each period the reporter named is its own screen, with its years
// large, its name, the reporter's own summary of it, what happened in it, and the evidence for it. ↑ ↓ or the rail
// move between periods; Open in Lanes shows the same stretch as lanes.
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {timelineLanesViewQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createTimelinePeriod, deleteTimelinePeriod, updateTimelinePeriod} from '../../lib/generated/sdk.gen';
import type {TimelineLaneEventOut, TimelineLanesOut, TimelinePeriodOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {bounds, parseWhen, span, stretches, yearsWords} from './lanes-model';
import {FactMark} from './marks';
import {Reveal} from '../../components/ui/reveal';

/** The period's years as its title says them: "2019", or "2016–2017". */
export function periodYears(p: Pick<TimelinePeriodOut, 'date_start' | 'date_end'>): string {
  const a = p.date_start.slice(0, 4), b = p.date_end.slice(0, 4);
  return a === b ? a : `${a}–${b}`;
}

/** The events in a period: those that can be in it (their dates overlap it). */
export function inPeriod(events: TimelineLaneEventOut[], p: Pick<TimelinePeriodOut, 'date_start' | 'date_end'>): TimelineLaneEventOut[] {
  const lo = bounds(p.date_start)[0], hi = bounds(p.date_end)[1];
  return events.filter(e => e.date_start && span(e)[1] >= lo && span(e)[0] <= hi).sort((a, b) => a.sort_key.localeCompare(b.sort_key));
}

const WORDS: Record<string, [string, string]> = {
  payment: ['payment', 'payments'], reporter_event: ['event you recorded', 'events you recorded'], relationship_date: ['link', 'links'],
  entity_date: ['date in a record', 'dates in records'], source_date: ['document', 'documents'], property_temporal_interval: ['reviewed period', 'reviewed periods'],
};

/** "In this period: 3 payments, 1 link", from the kinds of record in it. */
export function periodWords(events: TimelineLaneEventOut[]): string {
  const count = new Map<string, number>();
  for (const e of events) {
    const key = e.schema === 'Payment' ? 'payment' : e.kind;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count].map(([k, n]) => { const [one, many] = WORDS[k] ?? ['event', 'events']; return `${n} ${n === 1 ? one : many}`; }).join(', ');
}

type Props = {view: TimelineLanesOut; investigationId: string; onOpenLanes: (p: TimelinePeriodOut) => void; onSelect: (id: string) => void};

export function TimelinePeriods({view, investigationId, onOpenLanes, onSelect}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const periods = view.periods;
  const [at, setAt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [naming, setNaming] = useState(periods.length === 0);
  // The stretches the record falls into, offered as periods to name: one click fills the dates, the name is yours.
  const [seed, setSeed] = useState<{from: string; to: string; n: number} | null>(null);
  const offers = periods.length ? [] : stretches(view.events).filter(s => !s.fold);
  const [message, setMessage] = useState('');
  useEffect(() => { if (at >= periods.length) setAt(Math.max(0, periods.length - 1)); }, [periods.length, at]);
  const p = periods[at];
  const events = p ? inPeriod(view.events, p) : [];
  const evidence = events.filter(e => e.refs.source_id || e.refs.evidence_id || e.context?.evidence || e.source_key.startsWith('source:')).slice(0, 4);

  const refresh = () => queryClient.invalidateQueries({queryKey: timelineLanesViewQueryKey({path})});
  const save = useMutation({
    mutationFn: async (summary: string) => p && (await updateTimelinePeriod({path: {...path, period_id: p.id},
      body: {name: p.name, date_start: p.date_start, date_end: p.date_end, summary}, throwOnError: true})).data,
    onSuccess: async () => { setEditing(false); setMessage('Summary kept'); await refresh(); },
    onError: error => setMessage(errorMessage(error, 'Could not keep the summary')),
  });
  const remove = useMutation({
    mutationFn: async () => { if (p) await deleteTimelinePeriod({path: {...path, period_id: p.id}, throwOnError: true}); },
    onSuccess: async () => { setMessage('Period taken away; its events stay'); await refresh(); },
    onError: error => setMessage(errorMessage(error, 'Could not take the period away')),
  });
  const create = useMutation({
    mutationFn: async (body: {name: string; date_start: string; date_end: string; summary: string}) => (await createTimelinePeriod({path, body, throwOnError: true})).data,
    onSuccess: async row => { setNaming(false); setMessage(`Period named: ${row.name}`); await refresh(); setAt(periods.length); },
    onError: error => setMessage(errorMessage(error, 'Could not name the period')),
  });

  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('input, textarea')) return;
    if (ev.key === 'ArrowDown' || ev.key === 'j') { ev.preventDefault(); setAt(i => Math.min(periods.length - 1, i + 1)); setEditing(false); }
    if (ev.key === 'ArrowUp' || ev.key === 'k') { ev.preventDefault(); setAt(i => Math.max(0, i - 1)); setEditing(false); }
  };

  return <div className="tp" tabIndex={-1} onKeyDown={onKey} aria-label="Timeline periods">
    {message && <p className="tl2-msg" role="status">{message}</p>}
    {!p ? <div className="tp-empty">
      <p><b>No periods named yet.</b> Name the stretches of the case (“Set-up 2016”, “The money 2018”) and each becomes its own screen,
        with your summary of it and its evidence. They are drawn as tints on Lanes too.</p>
      {offers.length > 1 && <div className="tp-offers" role="group" aria-label="Stretches in the record">
        <p className="tl2-cap"><Reveal detail="The busy part of the case cut into runs of years holding about as many records each. Pick one to fill in its dates; the name and the summary are yours.">
          <span>Where the record falls</span></Reveal></p>
        {offers.map(o => { const words = yearsWords(o.from, o.to); const max = Math.max(...offers.map(x => x.count));
          return <button key={words} className="tp-offer" aria-pressed={seed?.from === String(o.from) && seed?.to === String(o.to)}
            onClick={() => { setSeed(n => ({from: String(o.from), to: String(o.to), n: (n?.n ?? 0) + 1})); setNaming(true); }}>
            <b>{words}</b><i aria-hidden style={{width: `${Math.max(8, (o.count / max) * 100)}%`}}/>
            <small>{o.count} {o.count === 1 ? 'record' : 'records'}</small></button>; })}
      </div>}
    </div> : <div className="tp-screen">
      <div className="tp-text">
        <p className="tl2-cap">Period {at + 1} of {periods.length}</p>
        <p className={`tp-years${periodYears(p).length > 4 ? ' long' : ''}`} aria-hidden>{periodYears(p)}</p>
        <h3>{p.name}</h3>
        <p className="tp-span">{dateWords(p.date_start, p.date_start.length === 4 ? 'year' : 'month')} to {dateWords(p.date_end, p.date_end.length === 4 ? 'year' : 'month')}
          {events.length ? ` · in this period: ${periodWords(events)}` : ' · nothing recorded in it yet'}</p>
        {editing ? <div className="tp-edit">
          <label>Your summary of this period<textarea autoFocus rows={5} value={draft} onChange={e => setDraft(e.target.value)}/></label>
          <div className="tl2-acts"><button className="pri" onClick={() => save.mutate(draft)} disabled={save.isPending}>Keep it</button>
            <button className="plain" onClick={() => setEditing(false)}>Cancel</button></div>
        </div> : p.summary ? <>
          <p className="tp-summary">{p.summary}</p>
          <p className="tp-by">Summary written by {!p.made_by || p.made_by === 'local-owner' ? 'you' : p.made_by} · <button className="tp-link" onClick={() => { setDraft(p.summary); setEditing(true); }}>change it</button></p>
        </> : <p className="tp-summary muted-summary">No summary yet. <button className="tp-link" onClick={() => { setDraft(''); setEditing(true); }}>Write what happened in this period</button></p>}
        <div className="tl2-acts">
          <button className="pri" onClick={() => onOpenLanes(p)}>Open in Lanes</button>
          <button className="plain" onClick={() => setNaming(true)}>Name another period</button>
          <button className="plain" onClick={() => remove.mutate()} disabled={remove.isPending}>Take this period away</button>
        </div>
        {events.length > 0 && <ol className="tp-events" aria-label={`What happened in ${p.name}`}>
          {events.slice(0, 8).map(e => <li key={e.id}><button onClick={() => onSelect(e.id)}>
            <time>{dateWords(e.date_start, e.precision)}</time>
            <FactMark fact={e.fact} tabbable={false}/>
            <span>{e.title}</span></button></li>)}
          {events.length > 8 && <li className="tl2-none">and {events.length - 8} more: Open in Lanes</li>}
        </ol>}
      </div>
      <div className="tp-cards" aria-label="Evidence in this period">
        {evidence.map(e => {
          const quote = typeof e.context?.evidence?.quote === 'string' ? e.context.evidence.quote : null;
          return <button key={e.id} className="tp-card" onClick={() => onSelect(e.id)}>
            <b>{e.title}</b>
            {(quote || e.description) && <span>{quote ? `“${quote}”` : e.description}</span>}
            <small>{dateWords(e.date_start, e.precision)} · {e.source_label.length > 48 ? `${e.source_label.slice(0, 47)}…` : e.source_label}</small>
          </button>;
        })}
        {evidence.length === 0 && events.length > 0 && <p className="tl2-none">No event in this period points at a document yet.</p>}
      </div>
      <nav className="tp-rail" aria-label="Periods">
        {periods.map((q, i) => <button key={q.id} aria-current={i === at} onClick={() => { setAt(i); setEditing(false); }}>
          <span>{q.name}</span><i aria-hidden/></button>)}
      </nav>
    </div>}
    {naming && <NamePeriod key={seed ? `${seed.from}-${seed.to}-${seed.n}` : 'blank'} from={seed?.from} to={seed?.to} pending={create.isPending} onCancel={() => setNaming(false)} onName={(name, a, b, summary) => create.mutate({name, date_start: a, date_end: b, summary})}/>}
  </div>;
}

function NamePeriod({onName, onCancel, pending, from = '', to = ''}: {onName: (name: string, a: string, b: string, summary: string) => void; onCancel: () => void; pending: boolean; from?: string; to?: string}): ReactElement {
  const [name, setName] = useState('');
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const [summary, setSummary] = useState('');
  const pa = parseWhen(a), pb = parseWhen(b);
  return <form className="tl2-form" onSubmit={ev => { ev.preventDefault(); if (pa && pb && name.trim()) onName(name.trim(), pa.date_start, pb.date_end ?? pb.date_start, summary.trim()); }}>
    <b>Name a period</b>
    <label>Name <input autoFocus={Boolean(from)} value={name} onChange={e => setName(e.target.value)} placeholder="The bid"/></label>
    <label>From <input value={a} onChange={e => setA(e.target.value)} placeholder="January 2019"/></label>
    <label>To <input value={b} onChange={e => setB(e.target.value)} placeholder="2019"/></label>
    <label>Your summary (optional) <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="What happened in it, in your words"/></label>
    <div className="tl2-acts"><button type="submit" className="pri" disabled={!pa || !pb || !name.trim() || pending}>Name it</button>
      <button type="button" className="plain" onClick={onCancel}>Cancel</button></div>
  </form>;
}
