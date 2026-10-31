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
import {Reveal} from '../../components/ui/reveal';
import {foldOutliers, span, yearsWords} from './lanes-model';
import {FactMark, KeysMark} from './marks';

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

/** The steps split around the case's dense stretch: how many lead in from far before it (a 1952 founding), how many
 *  trail far after it, and where the steps axis puts each step: the outliers squeezed onto a short stub at each end,
 *  the dense stretch spread over the rest, so its steps are not crushed into the last tenth of the line. */
export function replayFold(steps: TimelineStepOut[]): {early: number; late: number; from: number; to: number; pos: (s: Pick<TimelineStepOut, 'date_start'>) => number} {
  const folded = foldOutliers(steps.map((s, i) => ({date_start: s.date_start, date_end: s.date_end, i})));
  const at = (s: Pick<TimelineStepOut, 'date_start'>) => span({date_start: s.date_start})[0];
  if (!steps.length || !folded) return {early: 0, late: 0, from: 0, to: 0, pos: () => 50};
  const early = folded.early.length, late = folded.late.length;
  const t0 = steps.length ? at(steps[0]) : 0, t1 = steps.length ? at(steps[steps.length - 1]) : 0;
  const lo = early ? 8 : 0, hi = late ? 92 : 100;
  const scale = (t: number, a: number, b: number, x0: number, x1: number) => (b > a ? x0 + ((t - a) / (b - a)) * (x1 - x0) : (x0 + x1) / 2);
  const pos = (s: Pick<TimelineStepOut, 'date_start'>) => {
    const t = at(s);
    if (t < folded.from) return scale(t, t0, folded.from, 0, lo - 2);
    if (t > folded.to) return scale(t, folded.to, t1, hi + 2, 100);
    return scale(t, folded.from, folded.to, lo, hi);
  };
  return {early, late, from: folded.from, to: folded.to, pos};
}

type Props = {view: TimelineLanesOut; onShowInLanes: (eventId: string, step: TimelineStepOut) => void};

export function TimelineReplay({view, onShowInLanes}: Props): ReactElement {
  const steps = view.steps;
  const openProvenance = useWorkbenchStore(s => s.openProvenance);
  const fold = useMemo(() => replayFold(steps), [steps]);
  // It opens on the first step of the dense stretch; the far-off steps before it are folded in the list until asked for.
  const [at, setAt] = useState(() => (fold.early < steps.length ? fold.early : 0));
  const [unfold, setUnfold] = useState({early: false, late: false});
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
  const pos = fold.pos;
  const years: number[] = [];
  // At most eight year labels under the scrubber, on round years of the dense stretch.
  const y0 = new Date(fold.from).getUTCFullYear(), y1 = new Date(fold.to).getUTCFullYear();
  const every = [1, 2, 5, 10, 20, 25, 50].find(n => (y1 - y0) / n <= 8) ?? 100;
  for (let y = Math.ceil(y0 / every) * every; y <= y1; y += every) years.push(y);
  const yearOf = (s: TimelineStepOut) => new Date(span({date_start: s.date_start})[0]).getUTCFullYear();
  const showEarly = unfold.early || at < fold.early, showLate = unfold.late || at >= steps.length - fold.late;
  const foldRow = (side: 'early' | 'late') => {
    const rows = side === 'early' ? steps.slice(0, fold.early) : steps.slice(steps.length - fold.late);
    const words = yearsWords(yearOf(rows[0]), yearOf(rows[rows.length - 1]));
    return <li key={`fold:${side}`} className={`rp-fold${side === 'early' && at >= fold.early ? ' done' : ''}`}>
      <button onClick={() => setUnfold(u => ({...u, [side]: true}))} aria-expanded={false}
        aria-label={`${rows.length} ${rows.length === 1 ? 'step' : 'steps'} ${side === 'early' ? 'before' : 'after'} the busy stretch, ${words}: show them`}>
        <b>{side === 'early' ? '⇤ ' : ''}{words}{side === 'late' ? ' ⇥' : ''}</b>
        <small className="rp-n">{rows.length} {rows.length === 1 ? 'step' : 'steps'}</small>
      </button></li>;
  };
  const shownCard = records[Math.min(card, Math.max(0, records.length - 1))];
  const quote = (e?: TimelineLaneEventOut) => (e && typeof e.context?.evidence?.quote === 'string' ? e.context.evidence.quote : null);
  const sourceOf = (e: TimelineLaneEventOut) => ({sourceId: typeof e.refs.source_id === 'string' ? e.refs.source_id : e.source_key.startsWith('source:') ? e.source_key.slice(7) : undefined,
    sourceUrl: typeof e.provenance.source_url === 'string' ? e.provenance.source_url : undefined});

  return <div className="rp" tabIndex={-1} onKeyDown={onKey} aria-label="Replay">
    <aside className="rp-steps" aria-label="The steps">
      <p className="tl2-cap">The steps · {steps.length}</p>
      <ol ref={list}>
        {fold.early > 0 && !showEarly && foldRow('early')}
        {steps.map((s, i) => ((i < fold.early && !showEarly) || (i >= steps.length - fold.late && !showLate)) ? null : <li key={s.key} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <button aria-current={i === at ? 'step' : undefined} onClick={() => go(i)}>
            <b>{s.title}</b>
            <small>{stepWhen(s)}</small>
            <small className="rp-n">{s.event_ids.length}{s.unresolved ? <i className="rp-open" aria-hidden="true"> ↯</i> : null}
              <span className="sr-only"> {s.event_ids.length === 1 ? 'record' : 'records'}{s.unresolved ? ', unresolved' : ''}</span></small>
          </button></li>)}
        {fold.late > 0 && !showLate && foldRow('late')}
      </ol>
      {view.steps_undated > 0 && (view.steps_from === 'story'
        ? <p className="tl2-none"><Reveal detail={`${view.steps_undated === 1 ? 'A claim' : 'Claims'} in the Story with nothing that dates ${view.steps_undated === 1 ? 'it' : 'them'}: not a step.`}>
          <span>{view.steps_undated} undated</span></Reveal></p>
        // The Story is too thin to walk (at most one dated claim): the dated events are the steps, and this says why.
        : <p className="tl2-none" data-testid="replay-thin-story"><Reveal detail={`${view.steps_undated} of the Story's claims have no dated event, so they cannot be put in order. Date them (Lanes, N, with the claim) and Replay walks the Story.`}>
          <span>The record&apos;s events · the Story has {view.steps_undated} undated {view.steps_undated === 1 ? 'claim' : 'claims'}</span></Reveal></p>)}
    </aside>

    <section className="rp-stage" onWheel={onWheel} aria-live="polite">
      <p className="tl2-cap">Step {at + 1} of {steps.length} · {stepWhen(step)}{step.precision !== 'day' ? <Reveal label="How exact" detail={exactness({date_start: step.date_start, date_end: step.date_end, precision: step.precision})}><span className="tl2-q" aria-hidden="true">~</span></Reveal> : null}</p>
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
            <span className="rp-foot"><FactMark fact={e.fact} tabbable={false}/> {dateWords(e.date_start, e.precision)}</span>
          </button>;
        })}
      </div>
      {records.length > 1 && <p className="tl2-none rp-cardn">Card {card + 1} of {records.length}</p>}
      <div className="rp-controls">
        <button className="rp-icon" aria-label="Back one step" onClick={() => go(at - 1)}>⏮</button>
        <button className="tl2-play" onClick={() => { setWaiting(false); setPlaying(p => !p); }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="rp-icon" aria-label="On one step" onClick={() => go(at + 1)}>⏭</button>
        <div className="rp-scrub" role="slider" aria-label="Steps by date" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={at + 1}
          aria-valuetext={`Step ${at + 1}: ${stepWhen(step)}`} tabIndex={0}>
          {years.map(y => <span key={y} className="rp-year" style={{left: `${Math.min(96, Math.max(4, pos({date_start: String(y)})))}%`}}>{y}</span>)}
          <span className="rp-line"/><span className="rp-done" style={{width: `${pos(step)}%`}}/>
          {steps.map((s, i) => <button key={s.key} className={`rp-dot${i === at ? ' now' : ''}${i < at ? ' done' : ''}${s.unresolved ? ' open' : ''}`} style={{left: `${pos(s)}%`}}
            onClick={() => go(i)} aria-label={`Step ${i + 1}: ${s.title}`} tabIndex={-1}/>)}
        </div>
        <div className="tl2-seg" role="group" aria-label="Speed">
          <button aria-pressed={speed === 1} onClick={() => setSpeed(1)}>1×</button><button aria-pressed={speed === 2} onClick={() => setSpeed(2)}>2×</button>
        </div>
        <button className="tl2-plain" aria-pressed={stopAtOpen} onClick={() => setStopAtOpen(v => !v)}>Stop at the unresolved</button>
        <KeysMark><kbd>Space</kbd> play · <kbd>←</kbd><kbd>→</kbd> or <kbd>J</kbd><kbd>K</kbd> a step · <kbd>Home</kbd><kbd>End</kbd> first and last · the wheel moves one card · click a step to jump</KeysMark>
      </div>
    </section>

    <aside className="rp-side" aria-label="By this step">
      <p className="tl2-cap">By this step</p>
      <h3>What was on the record</h3>
      <p className="tl2-none">{record.events} {record.events === 1 ? 'event' : 'events'} · {record.shown} shown{record.outOfOrder ? ` · ${record.outOfOrder} out of order` : ''}</p>
      {step.unresolved && <div className="tl2-seqbox"><i aria-hidden>↯</i><p><b>Unresolved.</b> {waiting ? 'Replay waits here until you go on.' : 'Nobody has resolved this step.'}</p></div>}
      <p className="tl2-cap">Evidence at this step · {records.length}</p>
      <ul className="rp-evidence">
        {records.map((e, i) => <li key={e.id}><button onClick={() => setCard(i)} aria-current={i === card}>
          <FactMark fact={e.fact} tabbable={false}/>
          <span><small>{dateWords(e.date_start, e.precision)}</small>{quote(e) ? `“${quote(e)}”` : e.title}</span>
        </button></li>)}
      </ul>
      <div className="tl2-acts">
        {shownCard && <button className="pri" onClick={() => onShowInLanes(shownCard.id, step)}>Show in Lanes at this date</button>}
        {shownCard && (sourceOf(shownCard).sourceId || sourceOf(shownCard).sourceUrl) && <button onClick={() => openProvenance({title: shownCard.title, kind: 'timeline', ...sourceOf(shownCard),
          locator: typeof shownCard.provenance.locator === 'string' ? shownCard.provenance.locator : undefined, detail: shownCard.description || shownCard.date_start})}>Open the source</button>}
      </div>
      <p className="tl2-none"><Reveal label="Where the steps come from" detail={view.steps_from === 'story' ? 'The steps are the Story’s claims in date order. Nothing here is generated; each step’s words are the claim’s own.'
        : view.steps_undated > 0 ? 'The Story has too few dated claims to walk, so each dated event is a step. Once its claims are dated, the steps are those claims, in their own words.'
        : 'No Story yet, so each dated event is a step. Once claims are placed in the Story (Act › Story), the steps are those claims, in their own words.'}><span className="tl2-q" aria-hidden="true">ⓘ</span></Reveal></p>
    </aside>
  </div>;
}
