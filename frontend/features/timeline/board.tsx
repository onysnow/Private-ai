'use client';
// Timeline › Board (mockup TIME_5; Workbench redesign boards 7, 12, 13): one board per named period (one a year until
// periods are named) with that stretch's documents, people, a small chart of its payments and the reporter's own
// notes, joined by string only where a record joins two items: dashed while that record is not yet shown. The
// period's own timeline is docked below. Rich (paper, tacks, red string) by default, Clean one switch away; cards can
// be moved and the string follows (DECISIONS_LOG 6, call 9). Positions and notes are kept with the case.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getTimelineBoardOptions, getTimelineBoardQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {putTimelineBoard} from '../../lib/generated/sdk.gen';
import type {TimelineBoardOut, TimelineLaneEventOut, TimelineLanesOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {exactness} from './lane-detail';
import {Reveal} from '../../components/ui/reveal';
import {PartyMark} from '../../components/network/marks';
import {FACT, bounds, foldOutliers, span, stretches, yearsWords} from './lanes-model';
import {Aside, FactMark} from './marks';
import {inPeriod, periodYears} from './periods';

const MAX_EVENTS = 8;
const MAX_PEOPLE = 4;

export type BoardDef = {key: string; name: string; years: string; from: number; to: number; fold?: 'early' | 'late'};
export type BoardItem =
  | {key: string; kind: 'event'; event: TimelineLaneEventOut}
  | {key: string; kind: 'party'; id: string; caption: string; schema: string}
  | {key: string; kind: 'chart'; payments: TimelineLaneEventOut[]}
  | {key: string; kind: 'note'; id: string; text: string};
export type BoardString = {a: string; b: string; label: string; shown: boolean};

/** The boards: one per named period; until periods are named, the case's dense stretch cut into a handful of runs of
 *  whole years holding about as many records each, with the far outliers before and after it on one board each at the
 *  ends (never thirty tabs of one-record years). */
export function boardsFor(view: TimelineLanesOut): BoardDef[] {
  if (view.periods.length) return view.periods.map(p => ({key: p.id, name: p.name, years: periodYears(p), from: bounds(p.date_start)[0], to: bounds(p.date_end)[1]}));
  return stretches(view.events).map(({from: a, to: b, fold}) => {
    const years = yearsWords(a, b);
    return {key: fold ? `fold:${fold}` : years, name: fold === 'early' ? 'Before' : fold === 'late' ? 'After' : years, years, from: Date.UTC(a, 0, 1), to: Date.UTC(b + 1, 0, 1) - 1, ...(fold ? {fold} : {})};
  });
}

/** The board a case opens on: the first that is not a fold of outliers, or (with named periods) the first period that
 *  reaches into the case's dense stretch. */
export function boardOpensAt(view: TimelineLanesOut, boards: BoardDef[]): number {
  if (view.periods.length) {
    const folded = foldOutliers(view.events.filter(e => e.date_start && !e.placeholder && e.precision !== 'unknown'));
    const i = folded ? boards.findIndex(b => b.to >= folded.from && b.from <= folded.to) : 0;
    return Math.max(0, i);
  }
  return Math.max(0, boards.findIndex(b => !b.fold));
}

/** A board's items and its string: the events most worth seeing (unresolved first, then those with a document), the
 *  people they are about, a chart when there are two payments or more, and the notes; a string joins an event to
 *  each party it names, dashed when the event is not yet shown. */
export function boardItems(view: TimelineLanesOut, board: BoardDef, notes: TimelineBoardOut['notes']): {items: BoardItem[]; strings: BoardString[]; more: number} {
  const all = inPeriod(view.events.filter(e => !e.placeholder && e.precision !== 'unknown'), {date_start: new Date(board.from).toISOString().slice(0, 10), date_end: new Date(board.to).toISOString().slice(0, 10)});
  const weight = (e: TimelineLaneEventOut) => (e.fact !== 'shown' ? 2 : 0) + (e.source_key.startsWith('source:') || e.context?.evidence ? 1 : 0);
  const payments = all.filter(e => e.schema === 'Payment' && e.amount);
  const chart = payments.length >= 2;
  const pool = all.filter(e => !(chart && e.schema === 'Payment'));
  const events = [...pool].sort((a, b) => weight(b) - weight(a) || a.sort_key.localeCompare(b.sort_key)).slice(0, MAX_EVENTS)
    .sort((a, b) => a.sort_key.localeCompare(b.sort_key));
  const count = new Map<string, number>();
  for (const e of [...events, ...payments]) for (const p of e.parties) count.set(p, (count.get(p) ?? 0) + 1);
  const people = [...count].sort((a, b) => b[1] - a[1]).slice(0, MAX_PEOPLE).map(([id]) => view.parties.find(p => p.id === id)).filter(Boolean) as TimelineLanesOut['parties'];
  const items: BoardItem[] = [
    ...events.map(e => ({key: `event:${e.id}`, kind: 'event' as const, event: e})),
    ...people.map(p => ({key: `party:${p.id}`, kind: 'party' as const, id: p.id, caption: p.caption, schema: p.schema})),
    ...(chart ? [{key: 'chart', kind: 'chart' as const, payments}] : []),
    ...notes.filter(n => n.board === board.key).map(n => ({key: `note:${n.id}`, kind: 'note' as const, id: n.id, text: n.text})),
  ];
  const strings: BoardString[] = [];
  for (const e of events) for (const p of people) if (e.parties.includes(p.id)) strings.push({a: `event:${e.id}`, b: `party:${p.id}`, label: e.schema === 'Payment' && e.amount ? `${e.amount.toLocaleString('en-GB')} ${e.currency ?? ''}`.trim() : '', shown: e.fact === 'shown'});
  if (chart) for (const p of people) if (payments.some(e => e.parties.includes(p.id))) strings.push({a: 'chart', b: `party:${p.id}`, label: '', shown: payments.every(e => e.fact === 'shown')});
  return {items, strings, more: pool.length - events.length};
}

/** Where an item sits until someone moves it: a loose grid, a little turned, so the board reads as pinned paper. */
function defaultSpot(i: number, n: number): [number, number] {
  const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(n * 1.8))));
  const rows = Math.ceil(n / cols);
  const row = Math.floor(i / cols), col = i % cols;
  const jitter = ((i * 37) % 9) / 100;
  return [0.02 + (col / cols) * 0.95 + jitter * 0.3, 0.03 + (row / rows) * 0.9 + (col % 2) * (0.35 / rows)];
}

type Props = {view: TimelineLanesOut; investigationId: string; onShowInLanes: (id: string) => void};

export function TimelineBoard({view, investigationId, onShowInLanes}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const openProvenance = useWorkbenchStore(s => s.openProvenance);
  const kept = useQuery({...getTimelineBoardOptions({path}), enabled: Boolean(investigationId)});
  const boards = useMemo(() => boardsFor(view), [view]);
  const [at, setAt] = useState(() => boardOpensAt(view, boards));
  const [layout, setLayout] = useState<TimelineBoardOut>({style: 'rich', positions: {}, notes: []});
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({w: 900, h: 520});
  useEffect(() => { if (kept.data) setLayout(kept.data); }, [kept.data]);
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setSize({w: entry.contentRect.width, h: entry.contentRect.height}));
    ro.observe(el);
    return () => ro.disconnect();
  }, [kept.data]);

  const save = useMutation({
    mutationFn: async (next: TimelineBoardOut) => (await putTimelineBoard({path, body: {style: next.style, notes: next.notes,
      positions: Object.fromEntries(Object.entries(next.positions).map(([b, m]) => [b, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [v[0], v[1]] as [number, number]]))]))}, throwOnError: true})).data,
    onSuccess: data => queryClient.setQueryData(getTimelineBoardQueryKey({path}), data),
    onError: error => setMessage(errorMessage(error, 'Could not keep the board')),
  });
  const keep = (next: TimelineBoardOut) => { setLayout(next); save.mutate(next); };

  const board = boards[Math.min(at, Math.max(0, boards.length - 1))];
  if (kept.isError) return <p className="muted">{errorMessage(kept.error, 'Could not load the board')}</p>;
  if (!board) return <div className="tl2-empty"><b>No dated records yet.</b> A board holds a period&apos;s documents, people and notes; name periods in Periods, or add dated events in Lanes.</div>;

  const {items, strings, more} = boardItems(view, board, layout.notes);
  const spots = layout.positions[board.key] ?? {};
  const spot = (key: string, i: number): [number, number] => {
    const s = spots[key];
    return s ? [s[0], s[1]] : defaultSpot(i, items.length);
  };
  const place = new Map(items.map((it, i) => [it.key, spot(it.key, i)]));
  const px = (key: string): [number, number] => { const [x, y] = place.get(key) ?? [0, 0]; return [x * size.w + 95, y * size.h + 40]; };
  const rich = layout.style === 'rich';

  const drag = (key: string) => (ev: ReactPointerEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('button, a, input')) return;
    const box = area.current?.getBoundingClientRect();
    if (!box) return;
    const [x0, y0] = place.get(key) ?? [0, 0];
    const sx = ev.clientX, sy = ev.clientY;
    let moved = false;
    let last: [number, number] = [x0, y0];
    const move = (m: PointerEvent) => {
      moved = moved || Math.abs(m.clientX - sx) + Math.abs(m.clientY - sy) > 4;
      last = [Math.min(0.97, Math.max(0, x0 + (m.clientX - sx) / box.width)), Math.min(0.95, Math.max(0, y0 + (m.clientY - sy) / box.height))];
      setLayout(l => ({...l, positions: {...l.positions, [board.key]: {...(l.positions[board.key] ?? {}), [key]: last}}}));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (moved) setLayout(l => { const next = {...l, positions: {...l.positions, [board.key]: {...(l.positions[board.key] ?? {}), [key]: last}}}; save.mutate(next); return next; });
      else setPicked(key);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const sel = items.find(it => it.key === picked);
  const selEvent = sel?.kind === 'event' ? sel.event : undefined;
  const selStrings = sel ? strings.filter(s => s.a === sel.key || s.b === sel.key) : [];
  const nameOf = (key: string) => { const it = items.find(i => i.key === key); return !it ? key : it.kind === 'event' ? it.event.title : it.kind === 'party' ? it.caption : it.kind === 'chart' ? `Payments · ${board.years}` : it.text; };
  const dock = items.filter((it): it is Extract<BoardItem, {kind: 'event'}> => it.kind === 'event');
  const sourceId = (e: TimelineLaneEventOut) => (typeof e.refs.source_id === 'string' ? e.refs.source_id : e.source_key.startsWith('source:') ? e.source_key.slice(7) : undefined);

  return <div className="bd">
    <section className="bd-main">
      <div className="bd-top">
        <div className="tl2-views" role="tablist" aria-label="Boards">
          {boards.map((b, i) => <button key={b.key} role="tab" aria-selected={i === at} className={b.fold ? 'bd-foldtab' : undefined} onClick={() => { setAt(i); setPicked(null); }}>
            {b.fold ? <Reveal tabbable={false} detail={`${b.fold === 'early' ? 'Before' : 'After'} the busy stretch of the case: its few far-off records on one board`}>
              <span>{b.fold === 'early' ? '⇤ ' : ''}{b.years}{b.fold === 'late' ? ' ⇥' : ''}</span></Reveal> : <>{b.name}{b.name !== b.years ? <small> · {b.years}</small> : null}</>}</button>)}
        </div>
        <div className="tl2-views" role="group" aria-label="Style">
          <button aria-pressed={rich} onClick={() => keep({...layout, style: 'rich'})}>Rich</button>
          <button aria-pressed={!rich} onClick={() => keep({...layout, style: 'clean'})}>Clean</button>
        </div>
        {!view.periods.length && <Aside label="About the boards">Until periods are named (Periods), the busy stretch of the case is cut into a few runs of years holding about as many records each; the far-off records before and after it get one board each at the ends.</Aside>}
      </div>
      {message && <p className="tl2-msg" role="status">{message}</p>}
      <div ref={area} className={`bd-board ${rich ? 'rich' : 'clean'}`} aria-label={`Board: ${board.name}`}>
        <svg className="bd-string" width={size.w} height={size.h} aria-hidden>
          {strings.map(s => { const [ax, ay] = px(s.a), [bx, by] = px(s.b); const mx = (ax + bx) / 2, my = (ay + by) / 2 + 24;
            return <g key={s.a + s.b}><path d={`M${ax},${ay} Q${mx},${my} ${bx},${by}`} className={s.shown ? '' : 'dashed'}/>
              {s.label && <text x={mx} y={my - 6}>{s.label}</text>}</g>; })}
        </svg>
        {items.map((it, i) => {
          const [x, y] = spot(it.key, i);
          const turn = rich ? (((i * 53) % 7) - 3) * 0.6 : 0;
          return <div key={it.key} className={`bd-item bd-${it.kind}${picked === it.key ? ' on' : ''}`} style={{left: `${x * 100}%`, top: `${y * 100}%`, transform: `rotate(${turn}deg)`}}
            onPointerDown={drag(it.key)} role="button" tabIndex={0} aria-label={nameOf(it.key)} onKeyDown={ev => { if (ev.key === 'Enter') setPicked(it.key); }}>
            {rich && <i className="bd-tack" aria-hidden/>}
            {it.kind === 'event' && <>
              <small><Reveal tabbable={false} detail={it.event.source_label}><span>{dateWords(it.event.date_start, it.event.precision)}</span></Reveal></small>
              <p>{typeof it.event.context?.evidence?.quote === 'string' ? `“${it.event.context.evidence.quote}”` : it.event.title}</p>
              <span className={`bd-mark f-${FACT[it.event.fact].tone}`}><FactMark fact={it.event.fact} tabbable={false}/></span>
            </>}
            {it.kind === 'party' && <><span className="bd-face"><PartyMark schema={it.schema} size={22} tabbable={false}/></span><b>{it.caption}</b></>}
            {it.kind === 'chart' && <><small>Payments · {board.years}</small>
              <svg width="190" height="70" aria-label={`${it.payments.length} payments`}>{(() => { const max = Math.max(...it.payments.map(p => p.amount ?? 0));
                return it.payments.slice(0, 12).map((p, j) => <rect key={p.id} x={6 + j * 15} width={10} y={64 - ((p.amount ?? 0) / max) * 58} height={((p.amount ?? 0) / max) * 58} className="bd-bar"><title>{`${p.amount} ${p.currency ?? ''} · ${dateWords(p.date_start, p.precision)}`}</title></rect>); })()}</svg>
              <small>{it.payments.length} payments, each its own bar: never added up</small></>}
            {it.kind === 'note' && <><p>{it.text}</p><button aria-label="Take this note off the board" onClick={() => keep({...layout, notes: layout.notes.filter(n => n.id !== it.id)})}>×</button></>}
          </div>;
        })}
        {more > 0 && <p className="bd-more">{more} more in this period · Show in Lanes</p>}
      </div>
      <form className="bd-noteform" onSubmit={ev => { ev.preventDefault(); if (!note.trim()) return;
        keep({...layout, notes: [...layout.notes, {id: `n${Date.now().toString(36)}`, board: board.key, text: note.trim(), x: 0.72, y: 0.04}]}); setNote(''); }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="A note for this board: a question, a hunch" aria-label="A note for this board" maxLength={400}/>
        <button type="submit" disabled={!note.trim()}>Pin the note</button>
      </form>
      <div className="bd-dock" aria-label={`${board.name}: its own timeline`}>
        <p className="tl2-cap"><Reveal detail="One dot per item on the board"><span>{board.name !== board.years ? `${board.name} · ` : ''}{board.years}</span></Reveal></p>
        <div className="bd-dockline">
          {dock.map(it => { const t = span(it.event)[0]; const left = ((t - board.from) / Math.max(1, board.to - board.from)) * 100;
            return <button key={it.key} className={`bd-dot f-${FACT[it.event.fact].tone}${picked === it.key ? ' on' : ''}`} style={{left: `${Math.min(100, Math.max(0, left))}%`}}
              aria-label={`${dateWords(it.event.date_start, it.event.precision)}: ${it.event.title}`} onClick={() => setPicked(it.key)}/>; })}
        </div>
      </div>
    </section>
    <aside className="tl2-side" aria-label="On the board">
      <p className="tl2-cap">On the board</p>
      {!sel ? <p className="tl2-none">Click a card to see it here. <Aside label="Moving cards">Drag a card to move it; the string follows.</Aside></p> : <>
        <h3>{nameOf(sel.key)}</h3>
        {selEvent && <div className="tl2-chips"><FactMark fact={selEvent.fact} note={selEvent.fact_note} big/>
          <Reveal detail={exactness(selEvent)}><span className="tl2-chip dash">{dateWords(selEvent.date_start, selEvent.precision)}</span></Reveal></div>}
        <p className="tl2-cap"><Reveal detail="String is drawn only where a record joins two items. A dashed string is a link not yet shown."><span>String · {selStrings.length}</span></Reveal></p>
        <ul className="bd-strings">{selStrings.map(s => <li key={s.a + s.b}><FactMark fact={s.shown ? 'shown' : 'not_yet'}/>
          <span>{s.label}</span><span>{nameOf(s.a === sel.key ? s.b : s.a)}</span></li>)}</ul>
        {selEvent && <div className="tl2-acts">
          {sourceId(selEvent) && <button className="pri" onClick={() => openProvenance({title: selEvent.title, kind: 'timeline', sourceId: sourceId(selEvent),
            sourceUrl: typeof selEvent.provenance.source_url === 'string' ? selEvent.provenance.source_url : undefined, detail: selEvent.description || selEvent.date_start})}>Open the source</button>}
          <button onClick={() => onShowInLanes(selEvent.id)}>Show in Lanes</button>
        </div>}
      </>}
    </aside>
  </div>;
}
