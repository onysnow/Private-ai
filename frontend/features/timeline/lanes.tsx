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
import {KIND_ICON} from '../../components/network/party-icons';
import {Reveal} from '../../components/ui/reveal';
import {PARTY, eventKind, partyKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {LaneDetail} from './lane-detail';
import {FACT, FACT_ORDER, bounds, denseStretch, isFuzzy, justUnder, lanesOf, layoutLabels, parseWhen, quarters, span, windowFor, wrapName, yearStep} from './lanes-model';
import type {Fact, LanesBy, Zoom} from './lanes-model';
import {Aside, FactMark, KeysMark, KindDot, factWord} from './marks';

const LABEL_W = 184;
const ROW = 44;
const TOP = 74; // quarter bars and period names
const AXIS = 26;
const MONEY = 46;
const LINE = 10_000;
const LANES_SHOWN = 7;
const MONTH = 30.44 * 86_400_000;
const LATER_W = 118; // the chip for records after the window, at the axis's right end

type Lane = {key: string; name: string; sub: string; party?: string; schema?: string; mine?: boolean};

function laneName(view: TimelineLanesOut, by: LanesBy, key: string): Lane {
  if (by === 'party') {
    const p = view.parties.find(x => x.id === key);
    if (!p) return {key, name: 'No party named', sub: 'events about no one in the case'};
    return {key, name: p.caption, sub: [p.schema.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), p.country?.toUpperCase()].filter(Boolean).join(' · '), party: p.id, schema: p.schema};
  }
  if (by === 'kind') return {key, name: eventKind(key).name, sub: 'kind of record'};
  if (by === 'sure') return {key, name: FACT[key as Fact].name.replace(/^./, c => c.toUpperCase()), sub: 'is it shown'};
  const any = view.events.find(e => e.source_key === key);
  return {key, name: any?.source_label ?? key, sub: key.startsWith('source:') ? 'a source' : key === 'you' ? 'typed in the app' : 'a dataset'};
}

const shortTitle = (t: string, n = 34) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const money = (n: number, currency?: string | null) => `${currency === 'EUR' ? '€' : ''}${n.toLocaleString('en-GB', {maximumFractionDigits: 0})}${currency && currency !== 'EUR' ? ` ${currency}` : ''}`;

export function TimelineLanes({investigationId, picked}: {investigationId: string; picked?: {id: string; serial: number} | null}): ReactElement {
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
  // Far outliers (a 1952 founding in a 2009–2016 case) are folded into a chip at the lane's edge until it is clicked.
  const [unfold, setUnfold] = useState<{early: boolean; late: boolean}>({early: false, late: false});
  const [asOf, setAsOf] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [why, setWhy] = useState(false);
  const [adding, setAdding] = useState<null | 'event' | 'period' | 'goto'>(null);
  const [message, setMessage] = useState('');
  const [width, setWidth] = useState(960);
  const [roomH, setRoomH] = useState(0); // the chart's height on screen: as many lanes as fit are shown
  const wrap = useRef<HTMLDivElement>(null);
  const clipId = `tl2-clip-${useId().replace(/:/g, '')}`;
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => { setWidth(Math.max(560, Math.floor(entry.contentRect.width))); setRoomH(Math.floor(entry.contentRect.height)); });
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

  const events = useMemo(() => (view?.events ?? []).filter(e => e.date_start && e.precision !== 'unknown' && !hidden.has(e.fact) && !(hideFuzzy && isFuzzy(e) && !e.date_end)), [view, hidden, hideFuzzy]);
  // A date nobody knows (a placeholder's "when not known") is never drawn on a day.
  const allDated = useMemo(() => (view?.events ?? []).filter(e => e.date_start && e.precision !== 'unknown'), [view]);
  // The axis opens on the case's dense stretch: records far before or after it (a 1952 founding) fold into a chip at
  // the lane's edge, and clicking the chip extends the view to them.
  const dense = useMemo(() => denseStretch(allDated.map(e => span(e)[0])), [allDated]);
  const allFirst = allDated.length ? Math.min(...allDated.map(e => span(e)[0])) : Date.UTC(2020, 0, 1);
  const allLast = allDated.length ? Math.max(...allDated.map(e => span(e)[1])) : Date.UTC(2021, 0, 1);
  const denseLast = dense ? dense[1] : allLast;
  const firstAt = unfold.early || !dense ? allFirst : dense[0];
  const lastAt = unfold.late || !dense ? allLast : denseLast;
  const foldsEarly = Boolean(dense) && new Date(allFirst).getUTCFullYear() < new Date(dense![0]).getUTCFullYear();
  const foldsLate = Boolean(dense) && new Date(allLast).getUTCFullYear() > new Date(denseLast).getUTCFullYear();
  const sel = view?.events.find(e => e.id === selected) ?? null;
  const focus = sel ? (span(sel)[0] + span(sel)[1]) / 2 : asOf ?? lastAt;
  const [from, to] = windowFor(zoom, firstAt, lastAt, focus);
  const [caseFrom, caseTo] = windowFor('all', firstAt, lastAt, lastAt);

  const earlier = events.filter(e => span(e)[1] < from).sort((a, b) => span(a)[0] - span(b)[0]);
  const later = events.filter(e => span(e)[0] > to).sort((a, b) => span(b)[1] - span(a)[1]);
  /** A chip at the lane's edge: zoomed in, it goes back to the whole stretch; on the whole stretch, it unfolds. */
  const reach = (side: 'early' | 'late') => { if (zoom !== 'all') setZoom('all'); else setUnfold(u => ({...u, [side]: true})); };
  const chartW = Math.max(200, width - LABEL_W - 16);
  // The view opens on the next event nobody has resolved, within the case's own years (not a 1952 stub).
  const opensOn = useMemo(() => {
    const open = [...allDated].filter(e => e.fact !== 'shown' && !e.placeholder).sort((a, b) => a.sort_key.localeCompare(b.sort_key));
    return (open.find(e => span(e)[1] >= firstAt) ?? open[0])?.id ?? null;
  }, [allDated, firstAt]);
  useEffect(() => {
    if (selected === null && opensOn && !picked) setSelected(opensOn);
  }, [opensOn, selected, picked]);
  useEffect(() => { if (picked) setSelected(picked.id); }, [picked]);
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
  // A case with many parties shows its busiest lanes, in the order they first appear; the rest are one click away. The
  // page never scrolls: as many lanes are shown as fit the chart's height (at least three), the rest behind "+ N more".
  const fit = roomH > 0 ? Math.max(3, Math.floor((roomH - TOP - 22 - AXIS - (moneyRow ? MONEY : 0) - 6) / ROW) - (by === 'party' ? 1 : 0)) : LANES_SHOWN;
  const shownKeys = useMemo(() => {
    if (allLanes || laneKeys.length <= fit) return laneKeys;
    const busy = new Map(laneKeys.map(k => [k, events.filter(e => lanesOf(e, by).includes(k)).length]));
    // The lit party's lane and the selected event's lanes are always shown, inside the same count.
    const must = new Set<string>();
    if (lit && laneKeys.includes(lit)) must.add(lit);
    const sel = events.find(e => e.id === selected);
    if (sel) for (const k of lanesOf(sel, by)) if (laneKeys.includes(k)) must.add(k);
    const keep = new Set(must);
    for (const k of [...laneKeys].sort((a, b) => (busy.get(b) ?? 0) - (busy.get(a) ?? 0))) { if (keep.size >= Math.max(fit, must.size)) break; keep.add(k); }
    return laneKeys.filter(k => keep.has(k));
  }, [allLanes, laneKeys, events, by, lit, selected, fit]);
  const laneRows: Lane[] = view ? [
    ...(by === 'party' ? [{key: 'mine', name: 'My timeline', sub: 'what you believe', mine: true}] : []),
    ...shownKeys.map(k => laneName(view, by, k)),
  ] : [];
  const moreLanes = laneKeys.length - shownKeys.length;
  const lastLane = laneRows.length - 1;
  const rowY = (i: number) => TOP + i * ROW + ROW / 2;
  const lanesH = laneRows.length * ROW;
  const moreRow = laneKeys.length > fit ? 22 : 0;
  const axisY = TOP + lanesH + moreRow;
  const height = axisY + AXIS + (moneyRow ? MONEY : 0) + 6;
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
  const pxYear = chartW / Math.max(1, (to - from) / (365.25 * 86_400_000));
  const yearEvery = yearStep(1, pxYear);
  const tickEnd = LABEL_W + chartW - (later.length || (zoom === 'all' && unfold.late && foldsLate) ? LATER_W + 34 : 30);
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
      <button className="tl2-play" onClick={() => setPlaying(p => !p)} aria-pressed={playing}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
      {asOf !== null && <button className="tl2-plain" onClick={() => { setPlaying(false); moveAsOf(null); }}>Show all dates</button>}
      <div className="tl2-seg tl2-right" role="group" aria-label="Rows">
        <button aria-pressed={flags} onClick={() => setFlags(v => !v)}>Flags</button>
        <button aria-pressed={moneyRow} onClick={() => setMoneyRow(v => !v)}>Money</button>
        <button aria-pressed={periodsOn} onClick={() => setPeriodsOn(v => !v)}>Periods</button>
      </div>
      <button className="tl2-plain" aria-pressed={list} onClick={() => setList(v => !v)}>List</button>
    </div>

    <div className="tl2-key" aria-label="Key, and filter">
      <span className="tl2-cap">Mark</span>
      {FACT_ORDER.map(f => <button key={f} className={`tl2-keyitem f-${FACT[f].tone}`} aria-pressed={!hidden.has(f)}
        onClick={() => setHidden(h => { const n = new Set(h); if (n.has(f)) n.delete(f); else n.add(f); return n; })}>
        <Reveal tabbable={false} describe={false} detail={<b>{factWord(f)}</b>}><span><i aria-hidden="true">{FACT[f].glyph}</i><span className="sr-only">{FACT[f].name}</span> {facts[f] ?? 0}</span></Reveal></button>)}
      <span className="tl2-cap">Kind</span>
      {[...kindCounts].map(([k, n]) => <span key={k} className="tl2-kind"><KindDot kind={k}/>{n}</span>)}
      <span className="tl2-cap">Date</span>
      {/* One switch for the bands: the band, how many, and a track that is on while they are drawn; what it does on reveal. */}
      {fuzzyCount > 0 ? <Reveal tabbable={false} detail={<><b>{fuzzyCount} {fuzzyCount === 1 ? 'date' : 'dates'} known only to the month or the year</b>
        <span className="rv-row">Drawn as a band, never on a day. {hideFuzzy ? 'Hidden now: click to draw them.' : 'Click to hide them and see only the exact dates.'}</span></>}>
        <button className="tl2-switch" role="switch" aria-checked={!hideFuzzy} aria-label={`Month-or-year dates, ${fuzzyCount}`} onClick={() => setHideFuzzy(v => !v)}>
          <i className="tl2-bandkey" aria-hidden="true"/><span aria-hidden="true">{fuzzyCount}</span><i className="tl2-track" aria-hidden="true"/></button></Reveal>
        : <span className="tl2-kind"><Reveal label="A band" detail="A band: the date is known only to the month or the year, never a day."><i className="tl2-bandkey" aria-hidden="true"/></Reveal></span>}
    </div>

    <div className="tl2-body">
      <div className="tl2-main">
        {message && <p className="tl2-msg" role="status">{message}</p>}
        {view.events.length === 0 ? <div className="tl2-empty"><b>No dated records yet.</b> Drop a document with dates, or add an event (<kbd>N</kbd>).</div>
          : list ? <ol className="tl2-list" aria-label="Events in date order">
            {order.map(e => <li key={e.id} aria-current={e.id === selected} onClick={() => setSelected(e.id)}>
              <time>{dateWords(e.date_start, e.precision)}{e.date_end ? ` – ${dateWords(e.date_end, e.precision)}` : ''}</time>
              <FactMark fact={e.fact} note={e.fact_note}/>
              <span><Reveal tabbable={false} detail={e.source_label}><b>{e.title}</b></Reveal></span>
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
                      <title>{`${lane.name} · ${lane.sub}`}</title>
                      {lane.schema && (() => { const kind = partyKind(lane.schema); const Icon = KIND_ICON[kind];
                        return <g aria-hidden="true"><circle cx={17} cy={y} r={10} fill="none" stroke={PARTY[kind].ring} strokeWidth={1.5}/>
                          {Icon && <Icon x={11} y={y - 6} width={12} height={12} color={PARTY[kind].ring} strokeWidth={2.2}/>}</g>; })()}
                      {(() => { const lines = wrapName(lane.name, lane.schema ? 18 : 22);
                        return <text x={lane.schema ? 33 : 8} y={lines.length > 1 ? y - 3 : y + 5} className={`tl2-lanename big${lines.length > 1 ? ' two' : ''}`}>
                          {lines.map((l, j) => <tspan key={j} x={lane.schema ? 33 : 8} dy={j ? 15 : 0}>{l}</tspan>)}</text>; })()}
                    </g>
                    <g clipPath={`url(#${clipId})`}>
                    {(() => {
                      // Each label beside its mark, never over another label or a mark: the selected one first, then
                      // left to right; a label with no room is shown when its mark is hovered.
                      const drawn = marksFor(lane).map(m => {
                        const e = m.e;
                        const many = m.ids.length > 1;
                        const ranged = Boolean(e.date_end);
                        const fuzzy = !ranged && isFuzzy(e);
                        const cx = fuzzy ? (m.x0 + m.x1) / 2 : m.x0;
                        const label = many ? (e.schema === 'Payment' && e.amount ? `${m.ids.length} payments · ${money(e.amount, e.currency)}${m.ids.every(id => view.events.find(v => v.id === id)?.amount === e.amount) ? ' each' : '…'}` : `${m.ids.length} events`)
                          : `${e.schema === 'Payment' && e.amount ? `${money(e.amount, e.currency)} ` : ''}${shortTitle(e.title)}`;
                        const w = label.length * (ranged ? 5.7 : 6.4);
                        // A range is a thin line with its label above; anything else has its label after it, or before it.
                        const after = ranged ? Math.max(cx, LABEL_W) + 10 : many ? m.x1 + 12 : fuzzy ? Math.max(cx + 12, m.x1 + 12) : cx + 12;
                        const before = ranged ? cx - 10 : many ? m.x0 - 12 : fuzzy ? m.x0 - 6 : cx - 12;
                        const row = ranged ? 'above' : 'main';
                        const at = [{row, x0: after, x1: after + w}, {row, x0: before - w, x1: before}];
                        const body: [number, number] = ranged ? [m.x0 - 7, Math.max(m.x1, m.x0) + 7] : many ? [m.x0 - 9, m.x1 + 9] : fuzzy ? [m.x0 - 2, Math.max(m.x0 + 6, m.x1) + 2] : [cx - 9, cx + 9];
                        return {m, e, many, ranged, fuzzy, cx, label, at, body, on: m.ids.includes(selected ?? '')};
                      });
                      const taken = new Map<string, Array<[number, number]>>([['main', drawn.map(d => d.body)]]);
                      const placed = layoutLabels([...drawn.filter(d => d.on), ...drawn.filter(d => !d.on)].map(d => ({id: d.m.ids.join(), at: d.at})), taken, LABEL_W + 2, LABEL_W + chartW - 2);
                      return drawn.map(({m, e, many, ranged, fuzzy, cx, label, at, on}) => {
                      const later = asOf !== null && span(e)[0] > asOf;
                      const lightOn = lit ? m.ids.some(id => view.events.find(v => v.id === id)?.parties.includes(lit)) : true;
                      const seq = outOfOrder.get(e.id);
                      const placeholder = Boolean(e.placeholder) || (lane.mine && !e.refs.source_id && !e.refs.evidence_id && !e.refs.entity_id && !e.refs.relationship_entity_id && !e.refs.claim_id);
                      const where = placed.get(m.ids.join());
                      const spot = at[where ?? 0];
                      const ly = ranged ? y - 11 : y + 4;
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
                        {where === undefined
                          ? <text x={Math.max(LABEL_W + 4, Math.min(spot.x0, LABEL_W + chartW - (spot.x1 - spot.x0)))} y={ly} className={`tl2-label peek${ranged ? ' above' : ''}`} aria-hidden="true">{label}</text>
                          : <text x={where === 1 ? spot.x1 : spot.x0} y={ly} textAnchor={where === 1 ? 'end' : 'start'} className={`tl2-label${ranged ? ' above' : ''}`}>{label}</text>}
                        {seq && <text x={cx + 12} y={y + 18} className="tl2-seqword">no {seq.missing} recorded</text>}
                      </g>;
                      });
                    })()}
                    </g>
                  </g>;
                })}

                {(moreLanes > 0 || allLanes) && laneKeys.length > fit && <g className="tl2-more click" role="button" onClick={() => setAllLanes(v => !v)}>
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
                {/* A year is named every `yearEvery` years, so the names never run together; the other years keep a short tick. */}
                {years.map(y => { const t = Date.UTC(y, 0, 1); const named = y % yearEvery === 0;
                  if (t < from || t > to || (!named && pxYear < 5)) return null;
                  return <g key={y}>
                  <line x1={x(t)} x2={x(t)} y1={named ? axisY - 4 : axisY} y2={named ? axisY + 8 : axisY + 5} className="tl2-axis"/>
                  {named && x(t) < tickEnd && <text x={x(t) + 4} y={axisY + 18} className="tl2-tick">{y}</text>}</g>; })}
                {months.map(t => <line key={t} x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 5} className="tl2-axis"/>)}
                {earlier.length > 0 ? <g className="tl2-earlier click" role="button" onClick={() => reach('early')}
                  aria-label={`${earlier.length} earlier, from ${new Date(span(earlier[0])[0]).getUTCFullYear()}: show them`}>
                  <title>{earlier.slice(0, 8).map(e => `${dateWords(e.date_start, e.precision)} · ${e.title}`).join('\n')}{earlier.length > 8 ? `\n+ ${earlier.length - 8} more` : ''}</title>
                  <rect x={8} y={axisY + 7} width={LABEL_W - 24} height={18} rx={9}/>
                  <text x={18} y={axisY + 20}>‹ {new Date(span(earlier[0])[0]).getUTCFullYear()} · {earlier.length} earlier</text>
                </g> : zoom === 'all' && unfold.early && foldsEarly && <g className="tl2-earlier click" role="button" onClick={() => setUnfold(u => ({...u, early: false}))}
                  aria-label="Fold the early records back">
                  <rect x={8} y={axisY + 7} width={LABEL_W - 24} height={18} rx={9}/>
                  <text x={18} y={axisY + 20}>› fold to {new Date(dense![0]).getUTCFullYear()}</text>
                </g>}
                {later.length > 0 ? <g className="tl2-earlier click" role="button" onClick={() => reach('late')}
                  aria-label={`${later.length} later, to ${new Date(span(later[0])[1]).getUTCFullYear()}: show them`}>
                  <title>{later.slice(0, 8).map(e => `${dateWords(e.date_start, e.precision)} · ${e.title}`).join('\n')}{later.length > 8 ? `\n+ ${later.length - 8} more` : ''}</title>
                  <rect x={LABEL_W + chartW - LATER_W} y={axisY + 7} width={LATER_W} height={18} rx={9}/>
                  <text x={LABEL_W + chartW - 10} y={axisY + 20} textAnchor="end">{later.length} later · {new Date(span(later[0])[1]).getUTCFullYear()} ›</text>
                </g> : zoom === 'all' && unfold.late && foldsLate && <g className="tl2-earlier click" role="button" onClick={() => setUnfold(u => ({...u, late: false}))}
                  aria-label="Fold the late records back">
                  <rect x={LABEL_W + chartW - LATER_W} y={axisY + 7} width={LATER_W} height={18} rx={9}/>
                  <text x={LABEL_W + chartW - 10} y={axisY + 20} textAnchor="end">fold to {new Date(denseLast).getUTCFullYear()} ‹</text>
                </g>}
                <rect x={LABEL_W} y={axisY - 6} width={chartW} height={AXIS + 4} className="tl2-scrub" onPointerDown={dragFrom}>
                  <title>Drag to move the as-of handle</title></rect>
                {asOf !== null && asOf >= from && asOf <= to && <g className="tl2-asof">
                  <line x1={x(asOf)} x2={x(asOf)} y1={TOP - 14} y2={axisY + 4}/>
                  <circle cx={x(asOf)} cy={axisY + 4} r={5} onPointerDown={dragFrom as unknown as (e: PointerEvent<SVGCircleElement>) => void}/>
                  <text x={x(asOf) > LABEL_W + chartW - 300 ? x(asOf) - 6 : x(asOf) + 6} textAnchor={x(asOf) > LABEL_W + chartW - 300 ? 'end' : 'start'} y={TOP - 16}>AS OF END OF {dateWords(new Date(asOf).toISOString().slice(0, 7), 'month').toUpperCase()}<title>Later events fade</title></text>
                </g>}

                {/* Money: payments on a log scale, the reporting line dashed, never added up. */}
                {moneyRow && <g className="tl2-money">
                  <text x={8} y={axisY + AXIS + 26} className="tl2-lanename big">Money{amounts.length ? <title>Log scale · each payment its own bar, never added up</title> : null}</text>
                  {!amounts.length && <text x={8} y={axisY + AXIS + 40} className="tl2-small">no payments with an amount</text>}
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
            <p className="tl2-cap">Not on the timeline yet <Aside label="How to place one">Drag one onto the lanes, or press <kbd>N</kbd> and type “March 2019”, “spring 2019”, “2019”.</Aside></p>
            {view.not_placed.length === 0 ? <p className="tl2-none">Every dated document is on the timeline.</p>
              : <div className="tl2-cards">{view.not_placed.map(f => <div key={f.source_id} className="tl2-card" draggable
                onDragStart={ev => { ev.dataTransfer.setData('text/x-source', f.source_id); ev.dataTransfer.effectAllowed = 'copy'; }}>
                <Reveal tabbable={false} detail={<><b>{f.title}</b><span className="rv-row">{f.kind.replace(/_/g, ' ')}</span></>}><b>{shortTitle(f.title, 52)}</b></Reveal>
                <span>{dateWords(f.date, f.precision)} · {f.date_key}{f.precision !== 'day' ? ` · ${f.precision} only` : ''}</span>
                <button onClick={() => place.mutate({title: f.title, date_start: f.date, precision: f.precision, source_id: f.source_id})}>Place it</button>
              </div>)}
              {view.not_placed_total > view.not_placed.length && <p className="tl2-none">and {view.not_placed_total - view.not_placed.length} more</p>}</div>}
          </div>
          <div className="tl2-undated">
            <p><Reveal detail="Kept here, never placed on a day."><b>Undated · {view.undated_total}</b></Reveal></p>
            {view.undated.slice(0, 4).map(u => <p key={u.source_id} className="tl2-none"><Reveal detail={u.why}><span>“{shortTitle(u.title, 40)}”</span></Reveal></p>)}
          </div>
        </div>
        <p className="tl2-keys"><KeysMark><kbd>Space</kbd> play · <kbd>J</kbd><kbd>K</kbd> events · <kbd>←</kbd><kbd>→</kbd> move the as-of handle · <kbd>+</kbd><kbd>−</kbd><kbd>0</kbd> zoom ·
          <kbd>F</kbd><kbd>M</kbd><kbd>P</kbd> flags · money · periods · <kbd>L</kbd> list · <kbd>G</kbd> go to a date · <kbd>N</kbd> add · <kbd>Esc</kbd> unlight · click a name to light it in every lane</KeysMark>
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
    {when.trim() ? <small>{parsed ? `Read as ${parsed.date_end ? `${dateWords(parsed.date_start, 'month')} to ${dateWords(parsed.date_end, 'month')}` : dateWords(parsed.date_start, parsed.precision)}: ${parsed.words}` : 'Not a date it can read: try “March 2019” or “2019-03”'}</small>
      : <small><Aside label="About the date">The precision is set from what you type.</Aside></small>}
    <label className="row"><input type="checkbox" checked={placeholder} onChange={e => setPlaceholder(e.target.checked)}/> <Reveal tabbable={false} detail="I believe it, no evidence yet. Drawn dashed."><span>A placeholder</span></Reveal></label>
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
