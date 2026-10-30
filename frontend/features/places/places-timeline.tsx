'use client';
// The places' timeline (mockup PLACE_1): a strip under the map with one row per place that has a dated event, each
// event a mark on a shared time axis with year ticks (a dot for a day, a band for a longer stretch, hollow when a date
// is known only to the month or year). A window lies across the rows: drag its edges, drag it to move it, or drag
// anywhere on the strip to draw a new one. The map and the list keep only the places with an event in the window;
// events outside it grey. The edges are sliders (arrows move a month, Page Up/Down a year), and the dates can be typed
// in the window's own control (WCAG 2.1.1). Places with no dated event are counted in one line, named on reveal.
// One filter drives both views, after Bellingcat's map of civilian harm in Ukraine and Forensic Architecture's
// TimeMap (design doc, "Timelines and maps"). The events come from the investigation's timeline (backend
// app/services/places.py).
import {useRef, useState} from 'react';
import type {ChangeEvent, KeyboardEvent, PointerEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import type {PlaceEventOut, PlaceOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {DAY_MS, dayText, eventWindow, eventsExtent, isoDay} from '../../lib/place-times';
import type {TimeWindow} from '../../lib/place-times';

const STATUS_WORDS: Record<string, string> = {verified: 'verified', asserted: 'asserted', disputed: 'disputed', system_recorded: 'recorded'};
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** When an event happened, in words at the precision it was recorded: "2009 – 2013", never "1 Jan 2009 – 31 Dec 2013". */
export function placeEventWhen(event: Pick<PlaceEventOut, 'date_start' | 'date_end'>): string {
  return event.date_end && event.date_end !== event.date_start ? `${dateWords(event.date_start)} – ${dateWords(event.date_end)}` : dateWords(event.date_start);
}

/** The stretch of time two date fields give, or null when they cover every event. */
export function fieldWindow(from: string, to: string, extent: TimeWindow): TimeWindow | null {
  const start = from ? Date.parse(`${from}T00:00:00Z`) : extent.from;
  const end = to ? Date.parse(`${to}T00:00:00Z`) + DAY_MS : extent.to;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return start <= extent.from && end >= extent.to ? null : {from: start, to: end};
}

/** The strip's axis: the events' extent with a little room each side, so no mark sits on the edge. */
export function stripAxis(extent: TimeWindow): TimeWindow {
  const pad = Math.max((extent.to - extent.from) * 0.03, 15 * DAY_MS);
  return {from: extent.from - pad, to: extent.to + pad};
}

/** The years to tick on an axis: each 1 Jan inside it, thinned to at most `most` ticks. */
export function yearTicks(axis: TimeWindow, most = 10): number[] {
  const first = new Date(axis.from).getUTCFullYear() + 1, last = new Date(axis.to).getUTCFullYear();
  const span = Math.max(1, last - first + 1);
  const step = [1, 2, 5, 10, 20, 50].find(s => span / s <= most) ?? 100;
  const ticks: number[] = [];
  for (let y = Math.ceil(first / step) * step; y <= last; y += step) ticks.push(Date.UTC(y, 0, 1));
  return ticks;
}

/** A window kept inside the events' extent, at least a day long, snapped to whole days; null when it is all of it. */
export function clampWindow(w: TimeWindow, extent: TimeWindow): TimeWindow | null {
  const snap = (t: number) => Math.round(t / DAY_MS) * DAY_MS;
  let from = Math.max(extent.from, snap(Math.min(w.from, w.to))), to = Math.min(extent.to, snap(Math.max(w.from, w.to)));
  if (to - from < DAY_MS) { if (to >= extent.to) from = to - DAY_MS; else to = from + DAY_MS; }
  return from <= extent.from && to >= extent.to ? null : {from, to};
}

type Props = {
  places: PlaceOut[];
  picked: string | null;
  timeWindow: TimeWindow | null;
  onWindow: (window: TimeWindow | null) => void;
  onPick: (placeId: string) => void;
};

type Drag = {kind: 'from' | 'to' | 'move' | 'new'; x0: number; start: TimeWindow; anchor: number};

export function PlacesTimeline({places, picked, timeWindow, onWindow, onPick}: Props): ReactElement {
  const track = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const [typing, setTyping] = useState(false);
  const extent = eventsExtent(places);
  const rows = places.filter(place => (place.events ?? []).length);
  const undated = places.filter(place => !(place.events ?? []).length);

  if (!extent) {
    return <p className="pls-empty" data-testid="places-timeline-empty">
      <Reveal detail="An event about a place, or about a link to it (an ownership that started on a date), shows here as a strip to pick a stretch of time from.">
        <span>No event on the timeline is dated at these places</span></Reveal></p>;
  }
  const axis = stripAxis(extent);
  const pct = (t: number) => `${((t - axis.from) / (axis.to - axis.from)) * 100}%`;
  const shown = timeWindow ?? extent;
  const at = (clientX: number): number => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !box.width) return axis.from;
    return axis.from + ((clientX - box.left) / box.width) * (axis.to - axis.from);
  };
  const begin = (kind: Drag['kind']) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    drag.current = {kind, x0: event.clientX, start: shown, anchor: at(event.clientX)};
    track.current?.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const t = at(event.clientX);
    const shift = t - d.anchor;
    const next: TimeWindow = d.kind === 'from' ? {from: d.start.from + shift, to: d.start.to}
      : d.kind === 'to' ? {from: d.start.from, to: d.start.to + shift}
      : d.kind === 'new' ? {from: d.anchor, to: t}
      : (() => { const len = d.start.to - d.start.from; const from = Math.min(Math.max(d.start.from + shift, extent.from), extent.to - len); return {from, to: from + len}; })();
    if (d.kind === 'new' && Math.abs(event.clientX - d.x0) < 4) return;   // a click, not a drag
    onWindow(clampWindow(next, extent));
  };
  const end = () => { drag.current = null; };
  const key = (edge: 'from' | 'to') => (event: KeyboardEvent<HTMLDivElement>) => {
    const by: Record<string, number> = {ArrowLeft: -MONTH_MS, ArrowDown: -MONTH_MS, ArrowRight: MONTH_MS, ArrowUp: MONTH_MS, PageDown: -YEAR_MS, PageUp: YEAR_MS};
    let value = shown[edge];
    if (event.key in by) value += by[event.key];
    else if (event.key === 'Home') value = extent.from;
    else if (event.key === 'End') value = extent.to;
    else return;
    event.preventDefault();
    onWindow(clampWindow({...shown, [edge]: value}, extent));
  };
  const first = isoDay(extent.from), last = isoDay(extent.to - DAY_MS);
  const shownFrom = timeWindow ? isoDay(timeWindow.from) : '';
  const shownTo = timeWindow ? isoDay(timeWindow.to - DAY_MS) : '';
  const change = (which: 'from' | 'to') => (event: ChangeEvent<HTMLInputElement>) => {
    const from = which === 'from' ? event.target.value : shownFrom;
    const to = which === 'to' ? event.target.value : shownTo;
    onWindow(fieldWindow(from, to, extent));
  };
  const inWindow = (e: PlaceEventOut) => { const w = eventWindow(e); return w.from < shown.to && w.to > shown.from; };
  const range = `${dayText(shown.from)} – ${dayText(shown.to - DAY_MS)}`;

  return <div className="pls" data-testid="places-timeline"
    role="group" aria-label={`Timeline of ${rows.length} place${rows.length === 1 ? '' : 's'} with dated events, from ${dayText(extent.from)} to ${dayText(extent.to - DAY_MS)}`}>
    <div className="pls-head">
      <span className="tl2-cap">When</span>
      {/* The window's own control: its dates, typed when that is easier than dragging. */}
      <button type="button" className={`pls-when${timeWindow ? ' on' : ''}`} aria-expanded={typing} onClick={() => setTyping(v => !v)}
        aria-label={timeWindow ? `Window ${range}; type the dates` : 'All dates; type a From and a To date'}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="2.5" width="11" height="10" rx="2" fill="none" stroke="currentColor"/><path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="currentColor"/></svg>
        {timeWindow ? range : 'All dates'}</button>
      {typing && <div className="pls-type" role="group" aria-label="Show the places with an event between two dates">
        <label>From <input type="date" value={shownFrom} min={first} max={last} onChange={change('from')}/></label>
        <label>To <input type="date" value={shownTo} min={first} max={last} onChange={change('to')}/></label>
      </div>}
      <Reveal className="pls-hint" detail="Drag the window's edges, drag the window to move it, or drag across the strip to draw a new one. The edges take the arrow keys (a month) and Page Up/Down (a year).">
        <span className="tl2-q" aria-hidden="true">?</span></Reveal>
      <p className="sr-only" aria-live="polite">{timeWindow ? `Showing the places with an event between ${dayText(timeWindow.from)} and ${dayText(timeWindow.to - DAY_MS)}.` : 'All places.'}</p>
    </div>
    <div className="pls-grid" style={{['--pls-rows' as string]: rows.length}}>
      <ul className="pls-names">
        {rows.map(place => <li key={place.entity_id}>
          <button type="button" className={place.entity_id === picked ? 'on' : ''} aria-pressed={place.entity_id === picked}
            onClick={() => onPick(place.entity_id)} title={place.caption}>{place.caption}</button></li>)}
      </ul>
      <div className="pls-track" ref={track} onPointerDown={begin('new')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {yearTicks(axis).map(t => <span key={t} className="pls-tick" style={{left: pct(t)}}><i>{new Date(t).getUTCFullYear()}</i></span>)}
        {rows.map(place => <div key={place.entity_id} className={`pls-row${place.entity_id === picked ? ' on' : ''}`}>
          {(place.events ?? []).map(e => {
            const w = eventWindow(e);
            const band = (w.to - w.from) / (axis.to - axis.from) > 0.012;
            const when = placeEventWhen(e);
            return <button key={e.id} type="button" tabIndex={-1}
              className={`pls-mark ${band ? 'band' : 'dot'} v-${e.verification_status}${e.exact ? '' : ' hollow'}${inWindow(e) ? '' : ' out'}`}
              style={band ? {left: pct(w.from), width: `calc(${pct(w.to)} - ${pct(w.from)})`} : {left: pct((w.from + w.to) / 2)}}
              aria-label={`${e.title}, ${when}, ${STATUS_WORDS[e.verification_status] ?? e.verification_status}`}
              data-tip={`${when} · ${e.title}`}
              onPointerDown={ev => ev.stopPropagation()} onClick={() => onPick(place.entity_id)}/>;
          })}
        </div>)}
        <div className={`pls-window${timeWindow ? ' set' : ''}`} style={{left: pct(shown.from), width: `calc(${pct(shown.to)} - ${pct(shown.from)})`}}
          onPointerDown={begin('move')}>
          <div className="pls-edge from" role="slider" tabIndex={0} aria-label="Window starts"
            aria-valuemin={extent.from} aria-valuemax={extent.to} aria-valuenow={shown.from} aria-valuetext={dayText(shown.from)}
            onPointerDown={begin('from')} onKeyDown={key('from')}/>
          <div className="pls-edge to" role="slider" tabIndex={0} aria-label="Window ends"
            aria-valuemin={extent.from} aria-valuemax={extent.to} aria-valuenow={shown.to} aria-valuetext={dayText(shown.to - DAY_MS)}
            onPointerDown={begin('to')} onKeyDown={key('to')}/>
        </div>
      </div>
    </div>
    {undated.length > 0 && <p className="pls-undated">
      <Reveal detail={<>{undated.slice(0, 14).map(p => <span key={p.entity_id} className="rv-row">{p.caption}</span>)}
        {undated.length > 14 ? <span className="rv-row">and {undated.length - 14} more</span> : null}</>}>
        <span>+{undated.length} {undated.length === 1 ? 'place' : 'places'} with no dated event</span></Reveal></p>}
  </div>;
}
