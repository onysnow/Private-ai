'use client';
// Timeline › Replay (mockup TIME_4; research §2.9 "Story" and the Walkthrough's Play): the case walked in the order
// things happened, one step at a time, each step a Story claim in its own words (or, before there is a Story, one event).
// At each step only what was on the record by then is counted. Play stops at each step nobody has resolved, unless
// that is switched off (DECISIONS_LOG 6, call 10).
import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement, WheelEvent} from 'react';

import type {TimelineLaneEventOut, TimelineLanesOut, TimelineStepOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {exactness} from './lane-detail';
import {FACT, span} from './lanes-model';

const stepWhen = (s: Pick<TimelineStepOut, 'date_start' | 'date_end' | 'precision'>) =>
  s.date_end ? `${dateWords(s.date_start, s.precision)} – ${dateWords(s.date_end, s.precision)}` : dateWords(s.date_start, s.precision);

/** What was on the record by the end of a step: the events that had started by then, how many were shown, and how
 *  many of them a sequence check says are out of order. */
export function onRecordBy(view: TimelineLanesOut, step: TimelineStepOut): {events: number; shown: number; outOfOrder: number} {
  const end = span({date_start: step.date_start, date_end: step.date_end})[1];
  const by = view.events.filter(e => e.date_start && !e.placeholder && span(e)[0] <= end);
  const late = new Set(view.sequence.map(s => s.event_id));
  return {events: by.length, shown: by.filter(e => e.fact === 'shown').length, outOfOrder: by.filter(e => late.has(e.id)).length};
}

type Props = {view: TimelineLanesOut; onShowInLanes: (eventId: string, step: TimelineStepOut) => void};

export function TimelineReplay({view, onShowInLanes}: Props): ReactElement {
  const steps = view.steps;
  const openProvenance = useWorkbenchStore(s => s.openProvenance);
  const [at, setAt] = useState(0);
  const [card, setCard] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [stopAtOpen, setStopAtOpen] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const box = list.current?.parentElement, now = list.current?.querySelector<HTMLElement>('li.now');
    if (box && now && (now.offsetTop < box.scrollTop || now.offsetTop + now.offsetHeight > box.scrollTop + box.clientHeight)) box.scrollTop = now.offsetTop - box.clientHeight / 3;
  }, [at]);
  const step = steps[Math.min(at, Math.max(0, steps.length - 1))];
  const byId = useMemo(() => new Map(view.events.map(e => [e.id, e])), [view.events]);
  const records: TimelineLaneEventOut[] = step ? step.event_ids.map(id => byId.get(id)).filter((e): e is TimelineLaneEventOut => Boolean(e)) : [];
  const finding = step ? view.sequence.find(s => step.event_ids.includes(s.event_id)) : undefined;

  const go = (i: number) => { setAt(Math.max(0, Math.min(steps.length - 1, i))); setCard(0); setWaiting(false); };
  useEffect(() => {
    if (!playing || !steps.length) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => {
      if (at >= steps.length - 1) { setPlaying(false); return; }
      const next = at + 1;
      setAt(next); setCard(0);
      if (stopAtOpen && steps[next].unresolved) { setPlaying(false); setWaiting(true); }
    }, (reduced ? 3200 : 2400) / speed);
    return () => window.clearTimeout(id);
  }, [playing, at, steps, speed, stopAtOpen]);

  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('input, textarea, select')) return;
    const act: Record<string, () => void> = {
      ' ': () => { setWaiting(false); setPlaying(p => !p); }, ArrowRight: () => go(at + 1), ArrowLeft: () => go(at - 1),
      j: () => go(at + 1), k: () => go(at - 1), Home: () => go(0), End: () => go(steps.length - 1),
    };
    const fn = act[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
    if (fn) { ev.preventDefault(); fn(); }
  };
  // The wheel moves one card of the step's evidence.
  const onWheel = (ev: WheelEvent<HTMLDivElement>) => {
    if (records.length < 2 || Math.abs(ev.deltaY) < 8) return;
    setCard(c => Math.max(0, Math.min(records.length - 1, c + (ev.deltaY > 0 ? 1 : -1))));
  };

  if (!step) return <div className="tl2-empty"><b>Nothing to replay yet.</b> Replay walks the Story&apos;s claims in the order things happened;
    with no Story yet, it walks the dated events. Add a dated event (Lanes, <kbd>N</kbd>) or place claims in the Story (Act › Story).</div>;

  const record = onRecordBy(view, step);
  const first = span({date_start: steps[0].date_start})[0];
  const last = span({date_start: steps[steps.length - 1].date_start, date_end: steps[steps.length - 1].date_end})[1];
  const pos = (s: TimelineStepOut) => (last > first ? ((span({date_start: s.date_start})[0] - first) / (last - first)) * 100 : 50);
  const years: number[] = [];
  // At most eight year labels under the scrubber, on round years.
  const y0 = new Date(first).getUTCFullYear(), y1 = new Date(last).getUTCFullYear();
  const every = [1, 2, 5, 10, 20, 25, 50].find(n => (y1 - y0) / n <= 8) ?? 100;
  for (let y = Math.ceil(y0 / every) * every; y <= y1; y += every) years.push(y);
  const shownCard = records[Math.min(card, Math.max(0, records.length - 1))];
  const quote = (e?: TimelineLaneEventOut) => (e && typeof e.context?.evidence?.quote === 'string' ? e.context.evidence.quote : null);
  const sourceOf = (e: TimelineLaneEventOut) => ({sourceId: typeof e.refs.source_id === 'string' ? e.refs.source_id : e.source_key.startsWith('source:') ? e.source_key.slice(7) : undefined,
    sourceUrl: typeof e.provenance.source_url === 'string' ? e.provenance.source_url : undefined});

  return <div className="rp" tabIndex={-1} onKeyDown={onKey} aria-label="Replay">
    <aside className="rp-steps" aria-label="The steps">
      <p className="tl2-cap">The steps · {steps.length} <span>click one to jump</span></p>
      <ol ref={list}>
        {steps.map((s, i) => <li key={s.key} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <button aria-current={i === at ? 'step' : undefined} onClick={() => go(i)}>
            <b>{s.title}</b>
            <small>{stepWhen(s)}</small>
            <small className="rp-n">{s.event_ids.length} {s.event_ids.length === 1 ? 'record' : 'records'}{s.unresolved ? ' · unresolved' : ''}</small>
          </button></li>)}
      </ol>
      {view.steps_undated > 0 && <p className="tl2-none">{view.steps_undated} {view.steps_undated === 1 ? 'claim' : 'claims'} in the Story with nothing that dates {view.steps_undated === 1 ? 'it' : 'them'}: not a step.</p>}
    </aside>

    <section className="rp-stage" onWheel={onWheel} aria-live="polite">
      <p className="tl2-cap">Step {at + 1} of {steps.length} · {stepWhen(step)}{step.precision !== 'day' ? ` · ${exactness({date_start: step.date_start, date_end: step.date_end, precision: step.precision})}` : ''}</p>
      <h3>{step.title}</h3>
      <p className="rp-sub">{finding ? `${finding.say} ` : ''}{step.unresolved ? (stopAtOpen ? 'Replay stops here: nobody has resolved it.' : 'Nobody has resolved it.') : 'Shown.'}</p>
      <div className="rp-deck">
        {records.map((e, i) => {
          const d = i - card;
          if (d < -1 || d > 3) return null;
          return <button key={e.id} className={`rp-card${d === 0 ? ' rp-front' : ''}`} style={{transform: `translateY(${d * -14}px) scale(${1 - Math.abs(d) * 0.05})`, zIndex: 10 - Math.abs(d), opacity: d < 0 ? 0 : 1 - d * 0.22}}
            onClick={() => setCard(i)} tabIndex={d === 0 ? 0 : -1} aria-label={`Evidence ${i + 1} of ${records.length}: ${e.title}`}>
            <span className="rp-from">{e.source_label}</span>
            <span className="rp-body">{quote(e) ? <>“{quote(e)}”</> : e.description || e.title}</span>
            <span className="rp-foot"><i className={`tl2-glyph f-${FACT[e.fact].tone}`}>{FACT[e.fact].glyph}</i> {dateWords(e.date_start, e.precision)}{e.precision !== 'day' ? ` · ${e.precision} only` : ''}</span>
          </button>;
        })}
      </div>
      {records.length > 1 && <p className="tl2-none rp-cardn">Card {card + 1} of {records.length} · the wheel moves one</p>}
      <div className="rp-controls">
        <button className="rp-icon" aria-label="Back one step" onClick={() => go(at - 1)}>⏮</button>
        <button className="tl2-play" onClick={() => { setWaiting(false); setPlaying(p => !p); }}>{playing ? '❚❚ Pause' : '▶ Play'} <kbd>Space</kbd></button>
        <button className="rp-icon" aria-label="On one step" onClick={() => go(at + 1)}>⏭</button>
        <div className="rp-scrub" role="slider" aria-label="Steps by date" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={at + 1}
          aria-valuetext={`Step ${at + 1}: ${stepWhen(step)}`} tabIndex={0}>
          {years.map(y => <span key={y} className="rp-year" style={{left: `${last > first ? ((Date.UTC(y, 0, 1) - first) / (last - first)) * 100 : 0}%`}}>{y}</span>)}
          <span className="rp-line"/><span className="rp-done" style={{width: `${pos(step)}%`}}/>
          {steps.map((s, i) => <button key={s.key} className={`rp-dot${i === at ? ' now' : ''}${i < at ? ' done' : ''}${s.unresolved ? ' open' : ''}`} style={{left: `${pos(s)}%`}}
            onClick={() => go(i)} aria-label={`Step ${i + 1}: ${s.title}`} tabIndex={-1}/>)}
        </div>
        <div className="tl2-seg" role="group" aria-label="Speed">
          <button aria-pressed={speed === 1} onClick={() => setSpeed(1)}>1×</button><button aria-pressed={speed === 2} onClick={() => setSpeed(2)}>2×</button>
        </div>
        <button className="tl2-plain" aria-pressed={stopAtOpen} onClick={() => setStopAtOpen(v => !v)}>Stop at the unresolved</button>
      </div>
    </section>

    <aside className="rp-side" aria-label="By this step">
      <p className="tl2-cap">By this step <span>{stepWhen(step)}</span></p>
      <h3>What was on the record</h3>
      <p className="tl2-none">{record.events} {record.events === 1 ? 'event' : 'events'} · {record.shown} shown{record.outOfOrder ? ` · ${record.outOfOrder} out of order` : ''}</p>
      {step.unresolved && <div className="tl2-seqbox"><i aria-hidden>↯</i><p><b>Unresolved.</b> {waiting ? 'Replay waits here until you go on.' : 'Nobody has resolved this step.'}</p></div>}
      <p className="tl2-cap">Evidence at this step · {records.length}</p>
      <ul className="rp-evidence">
        {records.map((e, i) => <li key={e.id}><button onClick={() => setCard(i)} aria-current={i === card}>
          <i className={`tl2-glyph f-${FACT[e.fact].tone}`}>{FACT[e.fact].glyph}</i>
          <span><small>{dateWords(e.date_start, e.precision)}{e.precision !== 'day' ? ` · ${e.precision} only` : ''}</small>{quote(e) ? `“${quote(e)}”` : e.title}</span>
        </button></li>)}
      </ul>
      <div className="tl2-acts">
        {shownCard && <button className="pri" onClick={() => onShowInLanes(shownCard.id, step)}>Show in Lanes at this date</button>}
        {shownCard && (sourceOf(shownCard).sourceId || sourceOf(shownCard).sourceUrl) && <button onClick={() => openProvenance({title: shownCard.title, kind: 'timeline', ...sourceOf(shownCard),
          locator: typeof shownCard.provenance.locator === 'string' ? shownCard.provenance.locator : undefined, detail: shownCard.description || shownCard.date_start})}>Open the source</button>}
      </div>
      <p className="tl2-none">{view.steps_from === 'story' ? 'The steps are the Story’s claims in date order. Nothing here is generated; each step’s words are the claim’s own.'
        : 'No Story yet, so each dated event is a step. Once claims are placed in the Story (Act › Story), the steps are those claims, in their own words.'}</p>
    </aside>
  </div>;
}
