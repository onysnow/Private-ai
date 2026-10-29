'use client';
// Timeline › Lanes (mockup TIME_1; research §2.9): one lane per party (or per kind, source, or how sure), My timeline
// above the record, one mark per event for whether it is shown and a band for how exact its date is, quarter bars
// with a share-shown line, named periods as tints, the Flags, Money and Periods rows, Play with an as-of handle, the
// sequence check, the drag-on filmstrip and the undated tray. The event list is the List view (L).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import type {DragEvent, KeyboardEvent, PointerEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getInvestigationTimelineQueryKey, timelineLanesViewOptions, timelineLanesViewQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createLeadEndpoint, createTimelineEventEndpoint, createTimelinePeriod} from '../../lib/generated/sdk.gen';
import type {TimelineLaneEventOut, TimelineLanesOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {eventKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {LaneDetail} from './lane-detail';
import {FACT, FACT_ORDER, bounds, isFuzzy, justUnder, lanesOf, mainStart, parseWhen, quarters, span, windowFor} from './lanes-model';
import type {Fact, LanesBy, Zoom} from './lanes-model';

const LABEL_W = 170;
const ROW = 44;
const TOP = 74; // quarter bars and period names
const AXIS = 26;
const MONEY = 46;
const LINE = 10_000;
const LANES_SHOWN = 7;
const MONTH = 30.44 * 86_400_000;

type Lane = {key: string; name: string; sub: string; party?: string; mine?: boolean};

function laneName(view: TimelineLanesOut, by: LanesBy, key: string): Lane {
  if (by === 'party') {
    const p = view.parties.find(x => x.id === key);
    if (!p) return {key, name: 'No party named', sub: 'events about no one in the case'};
    return {key, name: p.caption, sub: [p.schema.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), p.country?.toUpperCase()].filter(Boolean).join(' · '), party: p.id};
  }
  if (by === 'kind') return {key, name: eventKind(key).name, sub: 'kind of record'};
  if (by === 'sure') return {key, name: FACT[key as Fact].name.replace(/^./, c => c.toUpperCase()), sub: 'is it shown'};
  const any = view.events.find(e => e.source_key === key);
  return {key, name: any?.source_label ?? key, sub: key.startsWith('source:') ? 'a source' : key === 'you' ? 'typed in the app' : 'a dataset'};
}

const shortTitle = (t: string, n = 34) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const money = (n: number, currency?: string | null) => `${currency === 'EUR' ? '€' : ''}${n.toLocaleString('en-GB', {maximumFractionDigits: 0})}${currency && currency !== 'EUR' ? ` ${currency}` : ''}`;

export function TimelineLanes({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const lanes = useQuery({...timelineLanesViewOptions({path}), enabled: Boolean(investigationId)});
  const view = lanes.data;
  const storeAsOf = useWorkbenchStore(s => s.asOf);
  const setStoreAsOf = useWorkbenchStore(s => s.setAsOf);

  const [by, setBy] = useState<LanesBy>('party');
  const [zoom, setZoom] = useState<Zoom>('all');
  const [flags, setFlags] = useState(true);
  const [moneyRow, setMoneyRow] = useState(true);
  const [periodsOn, setPeriodsOn] = useState(true);
  const [list, setList] = useState(false);
  const [hidden, setHidden] = useState<Set<Fact>>(new Set());
  const [hideFuzzy, setHideFuzzy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [allLanes, setAllLanes] = useState(false);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [why, setWhy] = useState(false);
  const [adding, setAdding] = useState<null | 'event' | 'period' | 'goto'>(null);
  const [message, setMessage] = useState('');
  const [width, setWidth] = useState(960);
  const wrap = useRef<HTMLDivElement>(null);
  const clipId = `tl2-clip-${useId().replace(/:/g, '')}`;
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(560, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);


  // One time rail: the year slider elsewhere moves the handle here, and the handle moves it.
  useEffect(() => {
    if (storeAsOf === null) { setAsOf(null); return; }
    setAsOf(cur => (cur !== null && new Date(cur).getUTCFullYear() === storeAsOf ? cur : Date.UTC(storeAsOf + 1, 0, 1) - 1));
  }, [storeAsOf]);
  const moveAsOf = useCallback((at: number | null) => {
    setAsOf(at);
    setStoreAsOf(at === null ? null : new Date(at).getUTCFullYear());
  }, [setStoreAsOf]);

  const events = useMemo(() => (view?.events ?? []).filter(e => e.date_start && !hidden.has(e.fact) && !(hideFuzzy && isFuzzy(e) && !e.date_end)), [view, hidden, hideFuzzy]);
  const allDated = useMemo(() => (view?.events ?? []).filter(e => e.date_start), [view]);
  // The axis spans the case's own years: a record far before the rest (a 1952 founding) is a stub at the left edge.
  const firstAt = mainStart(allDated.map(e => span(e)[0])) ?? Date.UTC(2020, 0, 1);
  const lastAt = allDated.length ? Math.max(...allDated.map(e => span(e)[1])) : Date.UTC(2021, 0, 1);
  const sel = view?.events.find(e => e.id === selected) ?? null;
  const focus = sel ? (span(sel)[0] + span(sel)[1]) / 2 : asOf ?? lastAt;
  const [from, to] = windowFor(zoom, firstAt, lastAt, focus);
  const [caseFrom, caseTo] = windowFor('all', firstAt, lastAt, lastAt);

  const earlier = events.filter(e => span(e)[1] < from).sort((a, b) => span(a)[0] - span(b)[0]);
  const chartW = Math.max(200, width - LABEL_W - 16);
  // The view opens on the next event nobody has resolved, within the case's own years (not a 1952 stub).
  const opensOn = useMemo(() => {
    const open = [...allDated].filter(e => e.fact !== 'shown' && !e.placeholder).sort((a, b) => a.sort_key.localeCompare(b.sort_key));
    return (open.find(e => span(e)[1] >= firstAt) ?? open[0])?.id ?? null;
  }, [allDated, firstAt]);
  useEffect(() => {
    if (selected === null && opensOn) setSelected(opensOn);
  }, [opensOn, selected]);
  const x = (t: number) => LABEL_W + ((t - from) / (to - from)) * chartW;
  const xCase = (t: number) => LABEL_W + ((t - caseFrom) / (caseTo - caseFrom)) * chartW;

  // Play: the case grows month by month from the window's start; later events fade behind the handle.
  useEffect(() => {
    if (!playing) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = window.setInterval(() => {
      setAsOf(cur => {
        const next = (cur === null || cur >= to ? from : cur) + MONTH;
        if (next >= to) { setPlaying(false); setStoreAsOf(new Date(to - 1).getUTCFullYear()); return to - 1; }
        return next;
      });
    }, reduced ? 600 : 160);
    return () => window.clearInterval(id);
  }, [playing, from, to, setStoreAsOf]);
  useEffect(() => { if (!playing && asOf !== null) setStoreAsOf(new Date(asOf).getUTCFullYear()); }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const laneKeys = useMemo(() => {
    if (!view) return [] as string[];
    if (by === 'party') {
      const keys = view.parties.map(p => p.id);
      return events.some(e => !e.parties.length && e.kind !== 'reporter_event') ? [...keys, 'none'] : keys;
    }
    if (by === 'sure') return FACT_ORDER.filter(f => events.some(e => e.fact === f));
    return Array.from(new Set(events.map(e => lanesOf(e, by)[0])));
  }, [view, by, events]);
  // A case with many parties shows its busiest lanes, in the order they first appear; the rest are one click away.
  const shownKeys = useMemo(() => {
    if (allLanes || laneKeys.length <= LANES_SHOWN) return laneKeys;
    const busy = new Map(laneKeys.map(k => [k, events.filter(e => lanesOf(e, by).includes(k)).length]));
    const keep = new Set([...laneKeys].sort((a, b) => (busy.get(b) ?? 0) - (busy.get(a) ?? 0)).slice(0, LANES_SHOWN));
    if (lit) keep.add(lit);
    const sel = events.find(e => e.id === selected);
    if (sel) for (const k of lanesOf(sel, by)) keep.add(k);
    return laneKeys.filter(k => keep.has(k));
  }, [allLanes, laneKeys, events, by, lit, selected]);
  const laneRows: Lane[] = view ? [
    ...(by === 'party' ? [{key: 'mine', name: 'My timeline', sub: 'what you believe', mine: true}] : []),
    ...shownKeys.map(k => laneName(view, by, k)),
  ] : [];
  const moreLanes = laneKeys.length - shownKeys.length;
  const lastLane = laneRows.length - 1;
  const rowY = (i: number) => TOP + i * ROW + ROW / 2;
  const lanesH = laneRows.length * ROW;
  const moreRow = laneKeys.length > LANES_SHOWN ? 22 : 0;
  const axisY = TOP + lanesH + moreRow;
  const height = axisY + AXIS + (moneyRow ? MONEY : 0) + 6;
  const usedLabels = new Map<string, Array<[number, number]>>();
  /** Whether a label fits beside its mark in this lane without covering another; it is kept if so. */
  const fits = (laneKey: string, x0: number, text: string): boolean => {
    const x1 = x0 + text.length * 6.2;
    if (x1 > LABEL_W + chartW + 40) return false;
    const taken = usedLabels.get(laneKey) ?? [];
    if (taken.some(([a, b]) => x0 < b + 6 && x1 > a - 6)) return false;
    usedLabels.set(laneKey, [...taken, [x0, x1]]);
    return true;
  };

  const inLane = (e: TimelineLaneEventOut, lane: Lane) => lane.mine ? e.kind === 'reporter_event' : lanesOf(e, by).includes(lane.key) && !(by === 'party' && e.kind === 'reporter_event' && !e.parties.length);
  const sequence = view?.sequence ?? [];
  const outOfOrder = new Map(sequence.map(s => [s.event_id, s]));
  const brackets = flags ? justUnder(events, LINE) : [];
  const amounts = events.filter(e => e.schema === 'Payment' && e.amount);
  const lo10 = Math.log10(Math.max(1, Math.min(...amounts.map(e => e.amount as number), LINE / 10)));
  const hi10 = Math.log10(Math.max(...amounts.map(e => e.amount as number), LINE * 2));
  const moneyY = (n: number) => axisY + AXIS + MONEY - 6 - ((Math.log10(n) - lo10) / (hi10 - lo10)) * (MONEY - 14);
  const quarterBars = quarters(events, caseFrom, caseTo);
  const maxQ = Math.max(1, ...quarterBars.map(q => q.count));

  // Marks within one lane closer than a mark's width join a group ("3 payments").
  type Mark = {ids: string[]; x0: number; x1: number; e: TimelineLaneEventOut};
  const marksFor = (lane: Lane): Mark[] => {
    const list = events.filter(e => inLane(e, lane)).map(e => ({e, x0: x(span(e)[0]), x1: x(span(e)[1])}))
      .filter(m => m.x1 >= LABEL_W - 4 && m.x0 <= LABEL_W + chartW + 4).sort((a, b) => a.x0 - b.x0);
    const out: Mark[] = [];
    for (const m of list) {
      const last = out[out.length - 1];
      const mid = (m.x0 + m.x1) / 2, lastMid = last ? (last.x0 + last.x1) / 2 : -99;
      const short = (mm: {x0: number; x1: number}) => mm.x1 - mm.x0 < 24;
      if (last && mid - lastMid < 16 && short(m) && short(last) && !m.e.date_end && !last.e.date_end) { last.ids.push(m.e.id); last.x1 = Math.max(last.x1, m.x1); }
      else out.push({ids: [m.e.id], x0: m.x0, x1: m.x1, e: m.e});
    }
    return out;
  };

  const order = useMemo(() => [...events].sort((a, b) => a.sort_key.localeCompare(b.sort_key) || a.title.localeCompare(b.title)), [events]);
  const step = (d: 1 | -1) => {
    const i = order.findIndex(e => e.id === selected);
    const next = order[Math.min(order.length - 1, Math.max(0, i + d))];
    if (next) setSelected(next.id);
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({queryKey: timelineLanesViewQueryKey({path})});
    await queryClient.invalidateQueries({queryKey: getInvestigationTimelineQueryKey({path})});
  };
  const place = useMutation({
    mutationFn: async (body: {title: string; date_start: string; date_end?: string; precision: string; source_id?: string; entity_id?: string; relationship_entity_id?: string; placeholder?: boolean; origin?: string}) =>
      (await createTimelineEventEndpoint({body: {investigation_id: investigationId, verification_status: 'asserted', ...body}, throwOnError: true})).data,
    onSuccess: async row => { setMessage(`On your timeline: ${row.title}`); setSelected(row.id); setAdding(null); await invalidate(); },
    onError: error => setMessage(errorMessage(error, 'Could not put it on the timeline')),
  });
  const lead = useMutation({
    mutationFn: async (body: {title: string; detail: string}) => (await createLeadEndpoint({body: {investigation_id: investigationId, ...body}, throwOnError: true})).data,
    onSuccess: row => setMessage(`Lead made: ${row.title}`),
    onError: error => setMessage(errorMessage(error, 'Could not make the lead')),
  });
  const period = useMutation({
    mutationFn: async (body: {name: string; date_start: string; date_end: string}) => (await createTimelinePeriod({path, body, throwOnError: true})).data,
    onSuccess: async row => { setMessage(`Period named: ${row.name}`); setAdding(null); setPeriodsOn(true); await invalidate(); },
    onError: error => setMessage(errorMessage(error, 'Could not name the period')),
  });

  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const target = ev.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key;
    const act: Record<string, () => void> = {
      ' ': () => setPlaying(p => !p), j: () => step(1), k: () => step(-1),
      ArrowRight: () => moveAsOf(Math.min(caseTo, (asOf ?? to) + MONTH)), ArrowLeft: () => moveAsOf(Math.max(caseFrom, (asOf ?? to) - MONTH)),
      '+': () => setZoom(z => (z === 'all' ? '5y' : z === '5y' ? '2y' : '1y')), '=': () => setZoom(z => (z === 'all' ? '5y' : z === '5y' ? '2y' : '1y')),
      '-': () => setZoom(z => (z === '1y' ? '2y' : z === '2y' ? '5y' : 'all')), 0: () => setZoom('all'),
      f: () => setFlags(v => !v), m: () => setMoneyRow(v => !v), p: () => setPeriodsOn(v => !v), l: () => setList(v => !v),
      g: () => setAdding('goto'), n: () => setAdding('event'),
      Escape: () => { setLit(null); setAdding(null); setWhy(false); },
    };
    const fn = act[k.length === 1 ? k.toLowerCase() : k];
    if (fn) { ev.preventDefault(); fn(); }
  };

  const dragFrom = (ev: PointerEvent<SVGRectElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const at = (clientX: number) => from + ((clientX - box.left - LABEL_W) / chartW) * (to - from);
    moveAsOf(Math.min(caseTo, Math.max(caseFrom, at(ev.clientX))));
    const move = (m: globalThis.PointerEvent) => moveAsOf(Math.min(caseTo, Math.max(caseFrom, at(m.clientX))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onDrop = (ev: DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/x-source');
    const f = view?.not_placed.find(n => n.source_id === id);
    if (f) place.mutate({title: f.title, date_start: f.date, precision: f.precision, source_id: f.source_id});
  };

  if (lanes.isError) return <p className="muted">{errorMessage(lanes.error, 'Could not load the timeline')}</p>;
  if (!view) return <p className="muted">Loading the timeline…</p>;
  const finding = (sel && outOfOrder.get(sel.id)) ?? sequence[0];
  const findingEvent = finding ? view.events.find(e => e.id === finding.event_id) : undefined;
  const facts = view.facts as Record<string, number>;
  const fuzzyCount = view.events.filter(e => isFuzzy(e) && !e.date_end).length;
  const kindCounts = new Map<string, number>();
  for (const e of view.events) kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
  const years: number[] = [];
  for (let y = new Date(from).getUTCFullYear(); Date.UTC(y, 0, 1) <= to; y += 1) years.push(y);
  const months = zoom === '1y' ? Array.from({length: 13}, (_, i) => Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth() + i, 1)).filter(t => t > from && t < to) : [];

  return <div className="tl2" onKeyDown={onKey} tabIndex={-1} aria-label="Timeline lanes">
    <div className="tl2-bar">
      <div className="tl2-seg" role="group" aria-label="Lanes by">
        <span className="tl2-cap">Lanes by</span>
        {([['party', 'Party'], ['kind', 'Kind'], ['source', 'Source'], ['sure', 'How sure']] as const).map(([k, w]) =>
          <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{w}</button>)}
      </div>
      <div className="tl2-seg" role="group" aria-label="Zoom">
        <span className="tl2-cap">Zoom</span>
        {([['all', 'All'], ['5y', '5 y'], ['2y', '2 y'], ['1y', '1 y']] as const).map(([k, w]) =>
          <button key={k} aria-pressed={zoom === k} onClick={() => setZoom(k)}>{w}</button>)}
      </div>
      <button className="tl2-play" onClick={() => setPlaying(p => !p)} aria-pressed={playing}>{playing ? '❚❚ Pause' : '▶ Play'} <kbd>Space</kbd></button>
      {asOf !== null && <button className="tl2-plain" onClick={() => { setPlaying(false); moveAsOf(null); }}>Show all dates</button>}
      <div className="tl2-seg tl2-right" role="group" aria-label="Rows">
        <button aria-pressed={flags} onClick={() => setFlags(v => !v)}>Flags <kbd>F</kbd></button>
        <button aria-pressed={moneyRow} onClick={() => setMoneyRow(v => !v)}>Money <kbd>M</kbd></button>
        <button aria-pressed={periodsOn} onClick={() => setPeriodsOn(v => !v)}>Periods <kbd>P</kbd></button>
      </div>
      <button className="tl2-plain" aria-pressed={list} onClick={() => setList(v => !v)}>List <kbd>L</kbd></button>
    </div>

    <div className="tl2-key" aria-label="Key, and filter">
      <span className="tl2-cap">Mark</span>
      {FACT_ORDER.map(f => <button key={f} className={`tl2-keyitem f-${FACT[f].tone}`} aria-pressed={!hidden.has(f)}
        onClick={() => setHidden(h => { const n = new Set(h); if (n.has(f)) n.delete(f); else n.add(f); return n; })}>
        <i>{FACT[f].glyph}</i> {FACT[f].name} {facts[f] ?? 0}</button>)}
      <span className="tl2-cap">Kind</span>
      {[...kindCounts].map(([k, n]) => <span key={k} className="tl2-kind"><i style={{background: eventKind(k).colour}}/>{eventKind(k).name.toLowerCase()} {n}</span>)}
      <span className="tl2-cap">Date</span>
      <span className="tl2-kind"><i className="tl2-bandkey"/>month / year</span>
      {fuzzyCount > 0 && <button className="tl2-keyitem" aria-pressed={hideFuzzy} onClick={() => setHideFuzzy(v => !v)}>{hideFuzzy ? 'show them' : 'hide them'} {fuzzyCount}</button>}
    </div>

    <div className="tl2-body">
      <div className="tl2-main">
        {message && <p className="tl2-msg" role="status">{message}</p>}
        {view.events.length === 0 ? <div className="tl2-empty"><b>No dated records yet.</b> Drop a document with dates, or add an event (<kbd>N</kbd>).</div>
          : list ? <ol className="tl2-list" aria-label="Events in date order">
            {order.map(e => <li key={e.id} aria-current={e.id === selected} onClick={() => setSelected(e.id)}>
              <time>{dateWords(e.date_start, e.precision)}{e.date_end ? ` – ${dateWords(e.date_end, e.precision)}` : ''}</time>
              <i className={`tl2-glyph f-${FACT[e.fact].tone}`} aria-label={FACT[e.fact].name}>{FACT[e.fact].glyph}</i>
              <span><b>{e.title}</b><small>{e.source_label}</small></span>
            </li>)}
          </ol>
            : <div ref={wrap} className="tl2-chart" onDragOver={ev => ev.preventDefault()} onDrop={onDrop}>
              <svg ref={svg} width={width} height={height} role="img" aria-label={`Timeline: ${events.length} events in ${laneRows.length} lanes`}>
                {/* Quarter bars over the whole case, the zoom window drawn over them, and the share shown. */}
                <text x={8} y={22} className="tl2-small">RECORDS PER QUARTER</text>
                <text x={8} y={36} className="tl2-small tl2-shareword">— share shown</text>
                <rect x={LABEL_W} y={6} width={chartW} height={46} className="tl2-qbg" onPointerDown={ev => {
                  const box = svg.current?.getBoundingClientRect();
                  if (box) { const t = caseFrom + ((ev.clientX - box.left - LABEL_W) / chartW) * (caseTo - caseFrom); setSelected(order.reduce((best, e) => Math.abs(span(e)[0] - t) < Math.abs(span(best)[0] - t) ? e : best, order[0])?.id ?? null); }
                }}/>
                {quarterBars.map(q => <rect key={q.from} x={xCase(q.from) + 1} width={Math.max(1, xCase(q.to) - xCase(q.from) - 2)}
                  y={52 - (q.count / maxQ) * 40} height={(q.count / maxQ) * 40} className="tl2-qbar"/>)}
                <polyline className="tl2-shareline" fill="none" points={quarterBars.filter(q => q.count).map(q => `${(xCase(q.from) + xCase(q.to)) / 2},${52 - (q.shown / q.count) * 40}`).join(' ')}/>
                {zoom !== 'all' && <rect x={xCase(from)} y={4} width={xCase(to) - xCase(from)} height={50} className="tl2-window"/>}

                {/* Named periods as tints, their names over the lanes. */}
                {periodsOn && view.periods.map((p, i) => {
                  const a = Math.max(LABEL_W, x(bounds(p.date_start)[0])), b = Math.min(LABEL_W + chartW, x(bounds(p.date_end)[1]));
                  if (b <= a) return null;
                  return <g key={p.id}><rect x={a} y={TOP - 14} width={b - a} height={lanesH + 14} className={`tl2-period t${i % 2}`}/>
                    <text x={a + 6} y={TOP - 3} className="tl2-small">{p.name.toUpperCase()}</text></g>;
                })}

                {/* Lanes. */}
                {laneRows.map((lane, i) => {
                  const y = rowY(i);
                  const litLane = lit && lane.party === lit;
                  return <g key={lane.key} className={`tl2-lane${lane.mine ? ' mine' : ''}${litLane ? ' lit' : ''}`}>
                    {i < lastLane && <line x1={LABEL_W} x2={LABEL_W + chartW} y1={y + ROW / 2} y2={y + ROW / 2} className="tl2-rule"/>}
                    <g className={lane.party ? 'tl2-name click' : 'tl2-name'} onClick={() => lane.party && setLit(l => (l === lane.party ? null : lane.party!))}
                      role={lane.party ? 'button' : undefined} aria-label={lane.party ? `Light ${lane.name} in every lane` : undefined}>
                      <text x={8} y={y - 1} className="tl2-lanename">{shortTitle(lane.name, 22)}</text>
                      <text x={8} y={y + 13} className="tl2-small">{lane.sub}</text>
                    </g>
                    <g clipPath={`url(#${clipId})`}>
                    {(() => { const ms = marksFor(lane); usedLabels.set(lane.key, ms.map(m => [m.x0 - 9, Math.max(m.x1, m.x0) + 5] as [number, number])); return ms; })().map(m => {
                      const e = m.e;
                      const many = m.ids.length > 1;
                      const ranged = Boolean(e.date_end);
                      const fuzzy = !ranged && isFuzzy(e);
                      const cx = fuzzy ? (m.x0 + m.x1) / 2 : m.x0;
                      const later = asOf !== null && span(e)[0] > asOf;
                      const on = m.ids.includes(selected ?? '');
                      const lightOn = lit ? m.ids.some(id => view.events.find(v => v.id === id)?.parties.includes(lit)) : true;
                      const seq = outOfOrder.get(e.id);
                      const placeholder = Boolean(e.placeholder) || (lane.mine && !e.refs.source_id && !e.refs.evidence_id && !e.refs.entity_id && !e.refs.relationship_entity_id && !e.refs.claim_id);
                      const label = many ? (e.schema === 'Payment' && e.amount ? `${m.ids.length} payments · ${money(e.amount, e.currency)}${m.ids.every(id => view.events.find(v => v.id === id)?.amount === e.amount) ? ' each' : '…'}` : `${m.ids.length} events`)
                        : `${e.schema === 'Payment' && e.amount ? `${money(e.amount, e.currency)} ` : ''}${shortTitle(e.title)}`;
                      // A range is a thin line with its label above; a month or year a band with its label after it.
                      const lx = ranged ? cx + 10 : many ? m.x1 + 12 : fuzzy ? Math.max(cx + 12, m.x1 + 12) : cx + 12;
                      const ly = ranged ? y - 9 : y + 4;
                      const showLabel = on || fits(`${lane.key}${ranged ? ':above' : ''}`, lx, label);
                      return <g key={m.ids.join()} className={`tl2-mark f-${FACT[e.fact].tone}${later ? ' later' : ''}${on ? ' on' : ''}${lightOn ? '' : ' dim'}${placeholder ? ' placeholder' : ''}${seq ? ' seq' : ''}`}
                        onClick={() => setSelected(m.ids[0])} role="button" tabIndex={-1}
                        aria-label={`${dateWords(e.date_start, e.precision)}: ${e.title}, ${FACT[e.fact].name}`}>
                        <title>{many ? m.ids.map(id => view.events.find(v => v.id === id)?.title).join('\n') : `${dateWords(e.date_start, e.precision)}${e.date_end ? ` – ${dateWords(e.date_end, e.precision)}` : ''} · ${e.title}`}</title>
                        {ranged && <path d={`M${m.x0},${y} H${Math.max(m.x0 + 4, m.x1)} M${Math.max(m.x0 + 4, m.x1)},${y - 5} V${y + 5}`} className="tl2-range"/>}
                        {fuzzy && <rect x={m.x0} y={y - 6} width={Math.max(6, m.x1 - m.x0)} height={12} rx={6} className="tl2-band"/>}
                        {many ? <>
                          <rect x={m.x0 - 8} y={y - 8} width={m.x1 - m.x0 + 16} height={16} rx={8} className="tl2-group"/>
                          {m.ids.slice(0, 5).map((id, j) => <circle key={id} cx={m.x0 + (j * (m.x1 - m.x0)) / Math.max(1, Math.min(5, m.ids.length) - 1)} cy={y} r={4} className="tl2-dot"/>)}
                        </> : <>
                          <circle cx={cx} cy={y} r={ranged ? 5.5 : 7.5} className="tl2-ring"/>
                          {!ranged && <text x={cx} y={y + 3.5} className="tl2-glyph-t">{FACT[e.fact].glyph}</text>}
                        </>}
                        {showLabel && <text x={lx} y={ly} className={`tl2-label${ranged ? ' above' : ''}`}>{label}</text>}
                        {seq && <text x={cx + 12} y={y + 18} className="tl2-seqword">no {seq.missing} recorded</text>}
                      </g>;
                    })}
                    </g>
                  </g>;
                })}

                {(moreLanes > 0 || allLanes) && laneKeys.length > LANES_SHOWN && <g className="tl2-more click" role="button" onClick={() => setAllLanes(v => !v)}>
                  <text x={8} y={TOP + lanesH + 15}>{allLanes ? 'Show the busiest lanes' : `+ ${moreLanes} more ${moreLanes === 1 ? 'lane' : 'lanes'}`}</text>
                </g>}

                {/* Flags: a bracket over the time the flag covers, on the payer's lane. */}
                <g clipPath={`url(#${clipId})`}>{brackets.map(b => {
                  const li = by === 'party' ? laneRows.findIndex(l => l.party === b.lane) : 0;
                  const y = rowY(Math.max(0, li)) - 17;
                  const a = x(b.from) - 6, z = x(b.to) + 6;
                  return <g key={b.ids.join()} className="tl2-flag" onClick={() => setSelected(b.ids[0])}>
                    <path d={`M${a},${y + 6} V${y} H${z} V${y + 6}`} fill="none"/>
                    <text x={z + 6} y={y + 4}>▮▮ FLAG · {b.say}</text>
                  </g>;
                })}</g>

                {/* The sequence check: a faint arrow from the step that is there to the event that comes too soon. */}
                {sequence.map(s => {
                  const a = view.events.find(e => e.id === s.after_id), b = view.events.find(e => e.id === s.event_id);
                  if (!a || !b) return null;
                  const ia = laneRows.findIndex(l => inLane(a, l)), ib = laneRows.findIndex(l => inLane(b, l));
                  if (ia < 0 || ib < 0) return null;
                  const ax = x(span(a)[0]), bx = x(span(b)[0]);
                  return <path key={s.event_id + s.rule} className="tl2-dep" d={`M${ax},${rowY(ia)} C${(ax + bx) / 2},${rowY(ia)} ${(ax + bx) / 2},${rowY(ib)} ${bx - 9},${rowY(ib)}`} markerEnd={`url(#${clipId}-arrow)`} clipPath={`url(#${clipId})`}/>;
                })}
                <defs><clipPath id={clipId}><rect x={LABEL_W - 2} y={0} width={chartW + 4} height={height}/></clipPath>
                  <marker id={`${clipId}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="tl2-arrowhead"/></marker></defs>

                {/* The axis, and the as-of handle. */}
                <line x1={LABEL_W} x2={LABEL_W + chartW} y1={axisY + 2} y2={axisY + 2} className="tl2-axis"/>
                {years.map(y => { const t = Date.UTC(y, 0, 1); return t >= from && t <= to ? <g key={y}>
                  <line x1={x(t)} x2={x(t)} y1={axisY - 4} y2={axisY + 8} className="tl2-axis"/>
                  {x(t) < LABEL_W + chartW - 30 && <text x={x(t) + 4} y={axisY + 18} className="tl2-tick">{y}</text>}</g> : null; })}
                {months.map(t => <line key={t} x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 5} className="tl2-axis"/>)}
                {earlier.length > 0 && <g className="tl2-earlier click" role="button" onClick={() => setSelected(earlier[0].id)}
                  aria-label={`${earlier.length} earlier: ${earlier[0].title}`}>
                  <rect x={8} y={axisY - 4} width={LABEL_W - 24} height={18} rx={9}/>
                  <text x={18} y={axisY + 9}>‹ {new Date(span(earlier[0])[0]).getUTCFullYear()} · {earlier.length} earlier</text>
                </g>}
                <rect x={LABEL_W} y={axisY - 6} width={chartW} height={AXIS + 4} className="tl2-scrub" onPointerDown={dragFrom}>
                  <title>Drag to move the as-of handle</title></rect>
                {asOf !== null && asOf >= from && asOf <= to && <g className="tl2-asof">
                  <line x1={x(asOf)} x2={x(asOf)} y1={TOP - 14} y2={axisY + 4}/>
                  <circle cx={x(asOf)} cy={axisY + 4} r={5} onPointerDown={dragFrom as unknown as (e: PointerEvent<SVGCircleElement>) => void}/>
                  <text x={x(asOf) > LABEL_W + chartW - 300 ? x(asOf) - 6 : x(asOf) + 6} textAnchor={x(asOf) > LABEL_W + chartW - 300 ? 'end' : 'start'} y={TOP - 16}>AS OF END OF {dateWords(new Date(asOf).toISOString().slice(0, 7), 'month').toUpperCase()} · LATER EVENTS FADE</text>
                </g>}

                {/* Money: payments on a log scale, the reporting line dashed, never added up. */}
                {moneyRow && <g className="tl2-money">
                  <text x={8} y={axisY + AXIS + 20} className="tl2-lanename">Money</text>
                  <text x={8} y={axisY + AXIS + 34} className="tl2-small">{amounts.length ? 'log scale · never added' : 'no payments with an amount'}</text>
                  {amounts.some(e => e.currency === 'EUR') && <>
                    <line x1={LABEL_W} x2={LABEL_W + chartW} y1={moneyY(LINE)} y2={moneyY(LINE)} className="tl2-line10k"/>
                    <text x={LABEL_W + chartW - 4} y={moneyY(LINE) - 3} className="tl2-small tl2-line10kword" textAnchor="end">€10,000 REPORTING LINE</text>
                  </>}
                  {amounts.map(e => { const xx = x(span(e)[0]); return xx >= LABEL_W && xx <= LABEL_W + chartW ?
                    <rect key={e.id} x={xx - 2} y={moneyY(e.amount as number)} width={4} height={axisY + AXIS + MONEY - 6 - moneyY(e.amount as number)}
                      className={`tl2-paybar${brackets.some(b => b.ids.includes(e.id)) ? ' flagged' : ''}${isFuzzy(e) ? ' fuzzy' : ''}`} onClick={() => setSelected(e.id)}>
                      <title>{money(e.amount as number, e.currency)} · {dateWords(e.date_start, e.precision)}</title></rect> : null; })}
                </g>}
              </svg>
            </div>}

        {finding && findingEvent && <div className="tl2-banner" role="note">
          <i aria-hidden>↯</i>
          <p><b>Out of order.</b> {finding.say} {finding.why}
            {why && <span className="tl2-why">
              <span className="tl2-steps">{finding.steps.map(s => <span key={s} className={s === finding.missing ? 'gone' : ''}>{s}</span>)}</span>
              <small>{finding.basis}. Said, never made a lead on its own.</small>
              {finding.found_later_id && <small>A {finding.missing} is recorded later: {view.events.find(e => e.id === finding.found_later_id)?.title}.</small>}
            </span>}
          </p>
          <div className="tl2-acts">
            <button onClick={() => lead.mutate({title: `Out of order: ${findingEvent.title}`, detail: `${finding.say} ${finding.why}`})} disabled={lead.isPending}>Make a lead</button>
            <button className="plain" aria-expanded={why} onClick={() => setWhy(v => !v)}>Why this order?</button>
          </div>
        </div>}

        {adding === 'event' && <AddForm onCancel={() => setAdding(null)} pending={place.isPending}
          onAdd={(title, when, placeholder) => place.mutate({title, ...when, placeholder})}/>}
        {adding === 'period' && <PeriodForm onCancel={() => setAdding(null)} pending={period.isPending}
          onAdd={(name, a, b) => period.mutate({name, date_start: a, date_end: b})}/>}
        {adding === 'goto' && <GoTo onCancel={() => setAdding(null)} onGo={t => { moveAsOf(t); setAdding(null); }}/>}

        <div className="tl2-strip">
          <div className="tl2-film">
            <p className="tl2-cap">Not on the timeline yet · drag one on <span>or press <kbd>N</kbd> and type “March 2019”, “spring 2019”, “2019”</span></p>
            {view.not_placed.length === 0 ? <p className="tl2-none">Every dated document is on the timeline.</p>
              : <div className="tl2-cards">{view.not_placed.map(f => <div key={f.source_id} className="tl2-card" draggable
                onDragStart={ev => { ev.dataTransfer.setData('text/x-source', f.source_id); ev.dataTransfer.effectAllowed = 'copy'; }}>
                <small>{f.kind.replace(/_/g, ' ')}</small>
                <b>{shortTitle(f.title, 52)}</b>
                <span>{dateWords(f.date, f.precision)} · {f.date_key}{f.precision !== 'day' ? ` · ${f.precision} only` : ''}</span>
                <button onClick={() => place.mutate({title: f.title, date_start: f.date, precision: f.precision, source_id: f.source_id})}>Place it</button>
              </div>)}
              {view.not_placed_total > view.not_placed.length && <p className="tl2-none">and {view.not_placed_total - view.not_placed.length} more</p>}</div>}
          </div>
          <div className="tl2-undated">
            <p><b>Undated · {view.undated_total}</b> kept here, never placed on a day</p>
            {view.undated.slice(0, 4).map(u => <p key={u.source_id} className="tl2-none">“{shortTitle(u.title, 40)}” · {u.why.toLowerCase()}</p>)}
          </div>
        </div>
        <p className="tl2-keys"><kbd>Space</kbd> play · <kbd>J</kbd><kbd>K</kbd> events · <kbd>←</kbd><kbd>→</kbd> move the as-of handle · <kbd>+</kbd><kbd>−</kbd><kbd>0</kbd> zoom ·
          <kbd>F</kbd><kbd>M</kbd><kbd>P</kbd> flags · money · periods · <kbd>L</kbd> list · <kbd>G</kbd> go to a date · <kbd>N</kbd> add · <kbd>Esc</kbd> unlight · click a name to light it in every lane ·
          <button className="tl2-plain" onClick={() => setAdding('period')}>Name a period</button></p>
      </div>
      <LaneDetail view={view} event={sel} lane={by === 'party' ? (lit ?? sel?.parties[0] ?? null) : null} finding={sel ? outOfOrder.get(sel.id) : undefined}
        opened={sel !== null && sel.id === opensOn} onSelect={setSelected} onStep={step} investigationId={investigationId}
        onLead={(title, detail) => lead.mutate({title, detail})}
        onMine={e => place.mutate({title: e.title, date_start: e.date_start, date_end: e.date_end ?? undefined, precision: e.precision,
          source_id: (e.refs.source_id as string | undefined) ?? undefined,
          relationship_entity_id: (e.refs.relationship_entity_id as string | undefined) ?? undefined,
          entity_id: e.refs.relationship_entity_id ? undefined : (e.refs.entity_id as string | undefined) ?? undefined, origin: `timeline:${e.id}`})}/>
    </div>
  </div>;
}

function AddForm({onAdd, onCancel, pending}: {onAdd: (title: string, when: {date_start: string; date_end?: string; precision: string}, placeholder: boolean) => void; onCancel: () => void; pending: boolean}): ReactElement {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [placeholder, setPlaceholder] = useState(false);
  const parsed = parseWhen(when);
  return <form className="tl2-form" onSubmit={ev => { ev.preventDefault(); if (parsed && title.trim()) onAdd(title.trim(), {date_start: parsed.date_start, ...(parsed.date_end ? {date_end: parsed.date_end} : {}), precision: parsed.precision}, placeholder); }}>
    <b>Add to my timeline</b>
    <label>What happened <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting with Fernhill"/></label>
    <label>When <input value={when} onChange={e => setWhen(e.target.value)} placeholder="March 2019, spring 2019, 2019, 2 May 2019"/></label>
    <small>{when.trim() ? parsed ? `Read as ${parsed.date_end ? `${dateWords(parsed.date_start, 'month')} to ${dateWords(parsed.date_end, 'month')}` : dateWords(parsed.date_start, parsed.precision)}: ${parsed.words}` : 'Not a date it can read: try “March 2019” or “2019-03”' : 'The precision is set from what you type.'}</small>
    <label className="row"><input type="checkbox" checked={placeholder} onChange={e => setPlaceholder(e.target.checked)}/> A placeholder: I believe it, no evidence yet (drawn dashed)</label>
    <div className="tl2-acts"><button type="submit" disabled={!parsed || !title.trim() || pending}>Add</button><button type="button" className="plain" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function PeriodForm({onAdd, onCancel, pending}: {onAdd: (name: string, a: string, b: string) => void; onCancel: () => void; pending: boolean}): ReactElement {
  const [name, setName] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const pa = parseWhen(a), pb = parseWhen(b);
  return <form className="tl2-form" onSubmit={ev => { ev.preventDefault(); if (pa && pb && name.trim()) onAdd(name.trim(), pa.date_start, pb.date_end ?? pb.date_start); }}>
    <b>Name a period</b>
    <label>Name <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="The money"/></label>
    <label>From <input value={a} onChange={e => setA(e.target.value)} placeholder="2018"/></label>
    <label>To <input value={b} onChange={e => setB(e.target.value)} placeholder="December 2018"/></label>
    <div className="tl2-acts"><button type="submit" disabled={!pa || !pb || !name.trim() || pending}>Name it</button><button type="button" className="plain" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function GoTo({onGo, onCancel}: {onGo: (t: number) => void; onCancel: () => void}): ReactElement {
  const [when, setWhen] = useState('');
  const parsed = parseWhen(when);
  return <form className="tl2-form" onSubmit={ev => { ev.preventDefault(); if (parsed) onGo(bounds(parsed.date_end ?? parsed.date_start)[1]); }}>
    <b>Go to a date</b>
    <label>Date <input autoFocus value={when} onChange={e => setWhen(e.target.value)} placeholder="May 2019"/></label>
    <div className="tl2-acts"><button type="submit" disabled={!parsed}>Go</button><button type="button" className="plain" onClick={onCancel}>Cancel</button></div>
  </form>;
}
