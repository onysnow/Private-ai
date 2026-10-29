'use client';
// Timeline › Stack in depth (mockup TIME_2; Ony's "stack in depth", discovery README 10 Oct): each layer is a stretch
// of time holding the evidence dated in it, as fine as the dates allow; the later layers recede behind. One notch of
// the wheel (or J/K, ↓/↑) pushes the top layer out; empty stretches are skipped and said ("4 weeks later"); evidence
// dated only to a month or a year gets its own dashed layer at the start of that month or year, never a day. Plain
// CSS 3D, five cards a layer and "+n more" (DECISIONS_LOG 6, call 4).
import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement, WheelEvent} from 'react';

import type {TimelineLaneEventOut, TimelineLanesOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {Reveal} from '../../components/ui/reveal';
import {eventKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {exactness} from './lane-detail';
import {bounds} from './lanes-model';
import {FactMark, KeysMark, KindDot} from './marks';

export type Step = 'day' | 'week' | 'month' | 'year';
export const STEPS: Step[] = ['day', 'week', 'month', 'year'];
const DAY = 86_400_000;
const PER_LAYER = 5;

export type Layer = {key: string; at: number; label: string; fuzzy: boolean; events: TimelineLaneEventOut[]; gap?: string};

const grain = (e: TimelineLaneEventOut): Step | 'day' => (e.date_start.length === 4 || e.precision === 'year' ? 'year' : e.date_start.length === 7 || e.precision === 'month' ? 'month' : 'day');
const rank: Record<Step, number> = {day: 0, week: 1, month: 2, year: 3};

function startOf(t: number, step: Step): number {
  const d = new Date(t);
  if (step === 'day') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (step === 'week') { const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return day - ((d.getUTCDay() + 6) % 7) * DAY; }
  if (step === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return Date.UTC(d.getUTCFullYear(), 0, 1);
}

function stepsBetween(a: number, b: number, step: Step): number {
  if (step === 'day') return Math.round((b - a) / DAY);
  if (step === 'week') return Math.round((b - a) / (7 * DAY));
  const da = new Date(a), db = new Date(b);
  const months = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + db.getUTCMonth() - da.getUTCMonth();
  return step === 'month' ? months : db.getUTCFullYear() - da.getUTCFullYear();
}

/** A gap in the largest whole unit that says it: "3 years", "4 months", "4 weeks", "5 days". */
export function gapWords(ms: number): string {
  const days = Math.round(ms / DAY);
  const [n, unit] = days >= 730 ? [Math.round(days / 365.25), 'year'] : days >= 60 ? [Math.round(days / 30.44), 'month'] : days >= 14 ? [Math.round(days / 7), 'week'] : [days, 'day'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function layerLabel(at: number, step: Step): string {
  const iso = new Date(at).toISOString().slice(0, 10);
  if (step === 'day') return dateWords(iso, 'day');
  if (step === 'week') return `Week of ${dateWords(iso, 'day')}`;
  if (step === 'month') return dateWords(iso.slice(0, 7), 'month');
  return iso.slice(0, 4);
}

/** The layers at a step: dated evidence grouped by the stretch it falls in, a fuzzy layer for each month or year that
 *  holds evidence known only to it (when the step is finer), and the gap before each layer said in words. */
export function layersFor(events: TimelineLaneEventOut[], step: Step): Layer[] {
  const map = new Map<string, Layer>();
  for (const e of events) {
    if (!e.date_start || e.placeholder || e.precision === 'unknown') continue;
    const g = grain(e);
    const fuzzy = g !== 'day' && rank[g as Step] > rank[step];
    const own: Step = fuzzy ? (g as Step) : step;
    const at = startOf(bounds(e.date_start)[0], own);
    const key = `${fuzzy ? 'f' : 'l'}:${own}:${at}`;
    const layer = map.get(key) ?? {key, at, fuzzy, events: [],
      label: fuzzy ? `Sometime in ${layerLabel(at, own)}` : layerLabel(at, step)};
    layer.events.push(e);
    map.set(key, layer);
  }
  // A fuzzy layer sits at the start of its month or year, before the layers in it.
  const layers = [...map.values()].sort((a, b) => a.at - b.at || Number(b.fuzzy) - Number(a.fuzzy));
  let last: Layer | undefined;
  for (const layer of layers) {
    if (last && !layer.fuzzy && !last.fuzzy) {
      if (stepsBetween(last.at, layer.at, step) > 1) layer.gap = `${gapWords(layer.at - last.at)} later`;
    }
    last = layer.fuzzy ? undefined : layer; // a gap is said between two dated layers only, never across a fuzzy one
    layer.events.sort((a, b) => a.sort_key.localeCompare(b.sort_key));
  }
  return layers;
}

/** Auto: the finest step that keeps the stack to a layer count a person can step through. */
export function autoStep(events: TimelineLaneEventOut[]): Step {
  return STEPS.find(s => layersFor(events, s).length <= 30) ?? 'year';
}

type Props = {view: TimelineLanesOut; onShowInLanes: (id: string) => void};

export function TimelineStack({view, onShowInLanes}: Props): ReactElement {
  const openProvenance = useWorkbenchStore(s => s.openProvenance);
  const [choice, setChoice] = useState<Step | 'auto'>('auto');
  const step = choice === 'auto' ? autoStep(view.events) : choice;
  const layers = useMemo(() => layersFor(view.events, step), [view.events, step]);
  const [top, setTop] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const wheelAt = useRef(0);
  useEffect(() => { setTop(0); setOpen(null); }, [step]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setTop(t => { if (t >= layers.length - 1) { setPlaying(false); return t; } return t + 1; }), 1800);
    return () => window.clearInterval(id);
  }, [playing, layers.length]);

  const layer = layers[Math.min(top, Math.max(0, layers.length - 1))];
  const sel = (picked && layer?.events.find(e => e.id === picked)) || layer?.events[0];
  const move = (d: number) => { setTop(t => Math.max(0, Math.min(layers.length - 1, t + d))); setPicked(null); setOpen(null); };
  const onWheel = (ev: WheelEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (Math.abs(ev.deltaY) < 8 || now - wheelAt.current < 350) return; // one notch, one layer
    wheelAt.current = now;
    move(ev.deltaY > 0 ? 1 : -1);
  };
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const act: Record<string, () => void> = {j: () => move(1), k: () => move(-1), ArrowDown: () => move(1), ArrowUp: () => move(-1), ' ': () => setPlaying(p => !p)};
    const fn = act[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
    if (fn) { ev.preventDefault(); fn(); }
  };

  if (!layer) return <div className="tl2-empty"><b>No dated records yet.</b> Drop a document with dates, or add an event in Lanes (<kbd>N</kbd>).</div>;
  const fuzzyNext = layers.slice(top + 1).find(l => l.fuzzy);
  const kinds = Array.from(new Set(view.events.map(e => e.kind)));
  const quote = (e: TimelineLaneEventOut) => (typeof e.context?.evidence?.quote === 'string' ? e.context.evidence.quote : null);
  const sourceId = (e: TimelineLaneEventOut) => (typeof e.refs.source_id === 'string' ? e.refs.source_id : e.source_key.startsWith('source:') ? e.source_key.slice(7) : undefined);
  const sourceUrl = (e: TimelineLaneEventOut) => (typeof e.provenance.source_url === 'string' ? e.provenance.source_url : undefined);
  const shownCards = open === layer.key ? layer.events : layer.events.slice(0, PER_LAYER);

  return <div className="sk" tabIndex={-1} onKeyDown={onKey} aria-label="Stack in depth">
    <aside className="sk-layers" aria-label="Layers">
      <p className="tl2-cap"><Reveal detail={`Step: ${step}`}><span>Layers {layers.length}</span></Reveal></p>
      <ol>
        {layers.map((l, i) => <li key={l.key}>
          {l.gap && <small className="sk-gap">… {l.gap}</small>}
          <button aria-current={i === top} className={l.fuzzy ? 'fuzzy' : ''} onClick={() => { setTop(i); setPicked(null); }}>
            <i aria-hidden/>{l.label}<span>{l.events.length}</span></button>
        </li>)}
      </ol>
      <p className="tl2-cap"><Reveal detail="Auto picks the finest step the dates support. Evidence dated only to a month gets its own dashed layer at the start of that month, never a day."><span>Step</span></Reveal></p>
      <div className="sk-steps" role="group" aria-label="Step">
        <button aria-pressed={choice === 'auto'} onClick={() => setChoice('auto')}>Auto</button>
        <Reveal tabbable={false} detail="No record here is dated to the minute"><button disabled>minute</button></Reveal>
        <Reveal tabbable={false} detail="No record here is dated to the hour"><button disabled>hour</button></Reveal>
        {STEPS.map(s => <button key={s} aria-pressed={choice === s} onClick={() => setChoice(s)}>{s}</button>)}
      </div>
    </aside>

    <section className="sk-stage" onWheel={onWheel}>
      <div className="sk-depth" aria-live="polite">
        {layers.slice(top + 1, top + 5).reverse().map((l, j, arr) => {
          const d = arr.length - j;
          return <div key={l.key} className={`sk-layer behind${l.fuzzy ? ' fuzzy' : ''}`} style={{transform: `translateY(${-d * 46}px) translateZ(${-d * 90}px) scale(${1 - d * 0.06})`, opacity: 1 - d * 0.2, zIndex: 10 - d}} aria-hidden>
            <p className="sk-title">{l.label} <small>{l.events.length}</small></p>
          </div>;
        })}
        <div key={layer.key} className={`sk-layer sk-front${layer.fuzzy ? ' fuzzy' : ''}`}>
          <p className="sk-title"><Reveal detail={`${layer.events.length} ${layer.events.length === 1 ? 'item' : 'items'}${layer.fuzzy ? ' · not placed on a day' : ''}`}><span>{layer.label} <small>{layer.events.length}</small></span></Reveal></p>
          <div className="sk-cards">
            {shownCards.map(e => <Reveal key={e.id} tabbable={false} detail={<><b>{eventKind(e.kind).name}</b><span className="rv-row">{e.source_label}</span></>}>
              <button className="sk-card" aria-pressed={sel?.id === e.id} style={{borderTopColor: eventKind(e.kind).colour}} onClick={() => setPicked(e.id)}>
              <span className="sk-paper">{quote(e) ? `“${quote(e)}”` : e.description || e.title}</span>
              <b>{e.title}</b>
              <span className="sk-foot"><FactMark fact={e.fact} tabbable={false}/>{dateWords(e.date_start, e.precision)}</span>
            </button></Reveal>)}
            {layer.events.length > PER_LAYER && open !== layer.key && <button className="sk-more" onClick={() => setOpen(layer.key)}>+{layer.events.length - PER_LAYER} more</button>}
          </div>
        </div>
      </div>
      <p className="sk-next">{top < layers.length - 1 ? `Next · ${layers[top + 1].gap ? `${layers[top + 1].gap} · ` : ''}${layers[top + 1].label}` : 'The last layer'}</p>
      <div className="rp-controls">
        <button className="tl2-play" onClick={() => setPlaying(p => !p)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="tl2-plain" onClick={() => move(-1)} disabled={top === 0}>Back</button>
        <button className="tl2-play" onClick={() => move(1)} disabled={top >= layers.length - 1}>Next layer</button>
        <KeysMark><kbd>Space</kbd> play · <kbd>↓</kbd> or <kbd>J</kbd> next layer · <kbd>↑</kbd> or <kbd>K</kbd> back · one notch of the wheel is one layer</KeysMark>
        {/* One hue per kind: the card's top edge; the kind named on each dot. */}
        <span className="sk-kinds">{kinds.map(k => <KindDot key={k} kind={k}/>)}</span>
      </div>
    </section>

    <aside className="sk-side" aria-label="Card">
      {sel && <>
        <p className="tl2-cap">{layer.label}</p>
        <h3>{sel.title}</h3>
        <div className="tl2-chips">
          <FactMark fact={sel.fact} note={sel.fact_note} big/><KindDot kind={sel.kind}/>
          <Reveal detail={exactness(sel)}><span className="tl2-chip dash">{dateWords(sel.date_start, sel.precision)}</span></Reveal>
        </div>
        {(quote(sel) || sel.description) && <blockquote className="sk-quote">{quote(sel) ? `“${quote(sel)}”` : sel.description}</blockquote>}
        <dl className="tl2-dl"><dt>Source</dt><dd>{sel.source_label}</dd></dl>
        <div className="tl2-acts">
          {(sourceId(sel) || sourceUrl(sel)) && <button className="pri" onClick={() => openProvenance({title: sel.title, kind: 'timeline', sourceId: sourceId(sel), sourceUrl: sourceUrl(sel),
            locator: typeof sel.provenance.locator === 'string' ? sel.provenance.locator : undefined, detail: sel.description || sel.date_start})}>Open the source</button>}
          <button onClick={() => onShowInLanes(sel.id)}>Show in Lanes</button>
        </div>
        {fuzzyNext && !layer.fuzzy && <p className="tl2-none">{fuzzyNext.events.length} {fuzzyNext.events.length === 1 ? 'item' : 'items'} dated only as “{fuzzyNext.label.replace('Sometime in ', '')}” sit in their own layer. <button className="tp-link" onClick={() => setTop(layers.indexOf(fuzzyNext))}>Open them</button></p>}
      </>}
    </aside>
  </div>;
}
