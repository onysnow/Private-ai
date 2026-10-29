'use client';
// Timeline › Build your own (mockup TIME_3; a mode beside the record, DECISIONS.md): several named timelines of your
// own, each the case's evidence in the order you want to tell it. Drag a card in from the palette or press Add; drag
// by its handle to reorder; × takes it off this timeline only. A card told out of date order says so in amber, and the
// record's date never moves. A placeholder ("When, if known") is a reporter's event with nothing attached yet: it is
// drawn dashed here and on My timeline in Lanes until a record is attached. Each person's own (DECISIONS_LOG 6, 11).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import type {DragEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {listBuiltTimelinesOptions, listBuiltTimelinesQueryKey, timelineLanesViewQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createBuiltTimeline, createTimelineEventEndpoint, deleteBuiltTimeline, updateBuiltTimeline} from '../../lib/generated/sdk.gen';
import type {BuiltTimelineOut, TimelineLaneEventOut, TimelineLanesOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {eventKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {exactness} from './lane-detail';
import {FACT, parseWhen, span} from './lanes-model';

/** For each card in a built order, whether it is told before a card dated earlier: its record date is earlier than
 *  the card before it. Overlapping dates (a month and a day in it) are never said to be out of order. */
export function toldOutOfOrder(cards: Array<Pick<TimelineLaneEventOut, 'date_start' | 'date_end'>>): boolean[] {
  return cards.map((c, i) => i > 0 && span(c)[1] < span(cards[i - 1])[0]);
}

const kindWord = (e: TimelineLaneEventOut) => (e.schema === 'Payment' ? 'payment' : e.placeholder ? 'placeholder' : e.kind === 'reporter_event' ? 'your event'
  : e.source_key.startsWith('source:') ? 'document' : eventKind(e.kind).name.toLowerCase());

type Props = {view: TimelineLanesOut; investigationId: string; onShowInLanes: (id: string) => void};

export function BuildYourOwn({view, investigationId, onShowInLanes}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const openProvenance = useWorkbenchStore(s => s.openProvenance);
  const built = useQuery({...listBuiltTimelinesOptions({path}), enabled: Boolean(investigationId)});
  const timelines: BuiltTimelineOut[] = built.data ?? [];
  const [current, setCurrent] = useState<string | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [kind, setKind] = useState<string>('all');
  const [compare, setCompare] = useState(false);
  const [when, setWhen] = useState('');
  const [what, setWhat] = useState('');
  const [naming, setNaming] = useState('');
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const [sure, setSure] = useState(false);

  const tl = timelines.find(t => t.id === current) ?? timelines[0];
  useEffect(() => { if (tl) { setCurrent(tl.id); setItems(tl.items); } }, [tl?.id, tl?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(view.events.map(e => [e.id, e])), [view.events]);
  const cards = items.map(id => byId.get(id)).filter((e): e is TimelineLaneEventOut => Boolean(e));
  const late = toldOutOfOrder(cards);
  const sel = (picked && byId.get(picked)) || null;

  const refresh = async () => {
    await queryClient.invalidateQueries({queryKey: listBuiltTimelinesQueryKey({path})});
    await queryClient.invalidateQueries({queryKey: timelineLanesViewQueryKey({path})});
  };
  const save = useMutation({
    mutationFn: async (next: string[]) => tl && (await updateBuiltTimeline({path: {...path, built_id: tl.id}, body: {name: tl.name, items: next}, throwOnError: true})).data,
    onSuccess: () => refresh(),
    onError: error => setMessage(errorMessage(error, 'Could not keep the order')),
  });
  const create = useMutation({
    mutationFn: async (name: string) => (await createBuiltTimeline({path, body: {name, items: []}, throwOnError: true})).data,
    onSuccess: async row => { setCurrent(row.id); setItems([]); setNaming(''); await refresh(); },
    onError: error => setMessage(errorMessage(error, 'Could not start the timeline')),
  });
  const drop = useMutation({
    mutationFn: async () => { if (tl) await deleteBuiltTimeline({path: {...path, built_id: tl.id}, throwOnError: true}); },
    onSuccess: async () => { setCurrent(null); setMessage('Timeline deleted; its events stay as they are'); await refresh(); },
  });
  const placeholder = useMutation({
    mutationFn: async () => {
      const at = parseWhen(when);
      const body = at ? {date_start: at.date_start, ...(at.date_end ? {date_end: at.date_end} : {}), precision: at.precision}
        : {date_start: String(new Date().getUTCFullYear()), precision: 'unknown'};
      return (await createTimelineEventEndpoint({body: {investigation_id: investigationId, title: what.trim(), verification_status: 'unresolved', placeholder: true, ...body}, throwOnError: true})).data;
    },
    onSuccess: async row => { setWhen(''); setWhat(''); await queryClient.invalidateQueries({queryKey: timelineLanesViewQueryKey({path})}); change([...items, row.id]); setPicked(row.id); },
    onError: error => setMessage(errorMessage(error, 'Could not add the placeholder')),
  });

  const change = (next: string[]) => { setItems(next); save.mutate(next); };
  const add = (id: string, at?: number) => { if (items.includes(id)) return; const next = [...items]; next.splice(at ?? next.length, 0, id); change(next); };
  const onDropLine = (ev: DragEvent<HTMLDivElement>, at?: number) => {
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/x-event');
    if (id && !items.includes(id)) { add(id, at); return; }
    if (dragging !== null && at !== undefined && at !== dragging) {
      const next = [...items];
      const [moved] = next.splice(dragging, 1);
      next.splice(at > dragging ? at - 1 : at, 0, moved);
      change(next);
    }
    setDragging(null);
  };

  const palette = view.events.filter(e => e.date_start && !e.placeholder)
    .filter(e => kind === 'all' || kindWord(e) === kind)
    .filter(e => !find.trim() || `${e.title} ${e.description ?? ''} ${e.source_label}`.toLowerCase().includes(find.trim().toLowerCase()));
  const kinds = Array.from(new Set(view.events.filter(e => !e.placeholder).map(kindWord)));
  const recordOrder = [...cards].sort((a, b) => a.sort_key.localeCompare(b.sort_key));
  const parsed = parseWhen(when);

  if (built.isError) return <p className="muted">{errorMessage(built.error, 'Could not load your timelines')}</p>;
  if (!built.data) return <p className="muted">Loading your timelines…</p>;

  return <div className="by">
    <aside className="by-palette" aria-label="All the evidence">
      <p className="tl2-cap">All the evidence · {view.events.filter(e => !e.placeholder).length} <span>drag one in, or Add</span></p>
      <input className="by-find" value={find} onChange={e => setFind(e.target.value)} placeholder="Find evidence…" aria-label="Find evidence"/>
      <div className="by-kinds" role="group" aria-label="Kind">
        <button aria-pressed={kind === 'all'} onClick={() => setKind('all')}>all {view.events.filter(e => !e.placeholder).length}</button>
        {kinds.map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k} {view.events.filter(e => !e.placeholder && kindWord(e) === k).length}</button>)}
      </div>
      <ul>
        {palette.map(e => <li key={e.id} className={items.includes(e.id) ? 'in' : ''} draggable={Boolean(tl) && !items.includes(e.id)}
          onDragStart={ev => { ev.dataTransfer.setData('text/x-event', e.id); ev.dataTransfer.effectAllowed = 'copy'; }}>
          <small style={{color: eventKind(e.kind).colour}}>{kindWord(e)}</small>
          <b>{e.title}</b>
          <span>{dateWords(e.date_start, e.precision)}{e.precision !== 'day' ? ` · ${e.precision} only` : ''}</span>
          {items.includes(e.id) ? <em>✓ in it</em> : <button disabled={!tl} onClick={() => add(e.id)} aria-label={`Add ${e.title}`}>Add</button>}
        </li>)}
      </ul>
    </aside>

    <section className="by-line-wrap">
      <div className="by-tabs">
        <div className="tl2-views" role="tablist" aria-label="Your timelines">
          {timelines.map(t => <button key={t.id} role="tab" aria-selected={t.id === tl?.id} onClick={() => { setCurrent(t.id); setItems(t.items); setPicked(null); }}>
            {t.name} <small>{t.items.length}</small></button>)}
        </div>
        <form className="by-new" onSubmit={ev => { ev.preventDefault(); if (naming.trim()) create.mutate(naming.trim()); }}>
          <input value={naming} onChange={e => setNaming(e.target.value)} placeholder="Name a new timeline" aria-label="Name a new timeline"/>
          <button type="submit" disabled={!naming.trim() || create.isPending}>+ New timeline</button>
        </form>
        <p className="tl2-none">Yours alone · not part of the evidence</p>
      </div>
      {message && <p className="tl2-msg" role="status">{message}</p>}
      {!tl ? <div className="tl2-empty"><b>No timeline of your own yet.</b> Name one above (“For the editor”, “The bid, for counsel”), then drag the evidence in, in the order you want to tell it.</div> : <>
        <div className="by-note"><i aria-hidden>⇄</i><p>Your order, not the record&apos;s. A card told out of date order says so in amber, and the record&apos;s date never moves.</p>
          <button className="tl2-plain" aria-pressed={compare} onClick={() => setCompare(v => !v)}>Compare with the record</button></div>
        <div className="by-line" onDragOver={ev => ev.preventDefault()} onDrop={ev => onDropLine(ev)} aria-label={`${tl.name}: ${cards.length} cards`}>
          {cards.map((e, i) => <div key={e.id} className={`by-card${sel?.id === e.id ? ' on' : ''}${late[i] ? ' late' : ''}${e.placeholder ? ' ph' : ''}`}
            onDragOver={ev => ev.preventDefault()} onDrop={ev => { ev.stopPropagation(); onDropLine(ev, i); }}>
            <div className="by-cardhead">
              <span className="by-handle" draggable onDragStart={ev => { setDragging(i); ev.dataTransfer.effectAllowed = 'move'; }} title="Drag to move" aria-hidden>⋮⋮</span>
              <small style={{color: eventKind(e.kind).colour}}>{kindWord(e)}</small>
              <button aria-label={`Take ${e.title} off this timeline`} onClick={() => change(items.filter(x => x !== e.id))}>×</button>
            </div>
            <button className="by-cardbody" onClick={() => setPicked(e.id)}>
              <b>{e.title}</b>
              <span>{e.placeholder ? (e.precision === 'unknown' ? 'when not known' : `${dateWords(e.date_start, e.precision)}?`) : dateWords(e.date_start, e.precision)}{e.precision !== 'day' && !e.placeholder ? ` · ${e.precision} only` : ''}</span>
              {late[i] && <em>earlier than the card before</em>}
              {compare && <em className="by-rec">#{recordOrder.indexOf(e) + 1} in the record</em>}
            </button>
            <span className="by-move">
              <button aria-label={`Move ${e.title} earlier in your order`} disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; change(n); }}>‹</button>
              <button aria-label={`Move ${e.title} later in your order`} disabled={i === cards.length - 1} onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; change(n); }}>›</button>
            </span>
          </div>)}
          <div className="by-dropend">{cards.length ? 'Drop a card here' : 'Drag evidence here, or press Add'}</div>
        </div>
        <p className="tl2-none">{cards.length} {cards.length === 1 ? 'card' : 'cards'} · the line scrolls sideways · drop a card from the left anywhere on it</p>
        <p className="tl2-cap">Placeholder · drawn dashed, nothing attached yet</p>
        <form className="by-ph" onSubmit={ev => { ev.preventDefault(); if (what.trim() && (!when.trim() || parsed)) placeholder.mutate(); }}>
          <label>When, if known <input value={when} onChange={e => setWhen(e.target.value)} placeholder="spring 2019"/></label>
          <label>What you think happened <input value={what} onChange={e => setWhat(e.target.value)} placeholder="The award was settled before the bids closed"/></label>
          <button type="submit" className="tl2-play" disabled={!what.trim() || (Boolean(when.trim()) && !parsed) || placeholder.isPending}>Add the placeholder</button>
        </form>
        <p className="tl2-none">{when.trim() && !parsed ? 'Not a date it can read: try “March 2019” or leave it empty.' : 'A placeholder is drawn dashed here and on My timeline in Lanes until a record is attached. Drag a card by its ⋮⋮ (or use ‹ ›) to move it; × takes it off this timeline only.'}</p>
        {sure ? <p className="tl2-none">Delete “{tl.name}”? Its events stay as they are. <button className="tp-link" onClick={() => { setSure(false); drop.mutate(); }}>Delete it</button> · <button className="tp-link" onClick={() => setSure(false)}>Keep it</button></p>
          : <button className="tp-link by-delete" onClick={() => setSure(true)}>Delete this timeline</button>}
      </>}
    </section>

    <aside className="tl2-side" aria-label="Card">
      {sel ? <>
        <p className="tl2-cap">{kindWord(sel)} <span>in “{tl?.name}”</span></p>
        <h3>{sel.title}</h3>
        <div className="tl2-chips"><span className="tl2-chip dash">{exactness(sel)}</span>
          <span className={`tl2-chip f-${FACT[sel.fact].tone}`}>{FACT[sel.fact].glyph} {FACT[sel.fact].name === 'not yet' ? 'not yet shown' : FACT[sel.fact].name}</span></div>
        {typeof sel.context?.evidence?.quote === 'string' && <blockquote className="sk-quote">“{sel.context.evidence.quote}”</blockquote>}
        <dl className="tl2-dl">
          <dt>In the record</dt><dd>{sel.placeholder ? 'not in the record: a placeholder' : `${dateWords(sel.date_start, sel.precision)} · ${sel.source_label}`}</dd>
          <dt>In your order</dt><dd>{items.includes(sel.id) ? `card ${items.indexOf(sel.id) + 1} of ${items.length}${late[cards.indexOf(sel)] ? ' · told before a card dated later' : ''}` : 'not in this timeline'}</dd>
        </dl>
        <div className="tl2-acts">
          {(typeof sel.refs.source_id === 'string' || sel.source_key.startsWith('source:')) && <button className="pri" onClick={() => openProvenance({title: sel.title, kind: 'timeline',
            sourceId: typeof sel.refs.source_id === 'string' ? sel.refs.source_id : sel.source_key.slice(7),
            sourceUrl: typeof sel.provenance.source_url === 'string' ? sel.provenance.source_url : undefined, detail: sel.description || sel.date_start})}>Open the source</button>}
          <button onClick={() => onShowInLanes(sel.id)}>Show in Lanes</button>
          {items.includes(sel.id) && <button className="plain" onClick={() => change(items.filter(x => x !== sel.id))}>Remove from this timeline</button>}
        </div>
        <p className="tl2-none">Removing takes it off this timeline only. The evidence, its date and its links stay as they are.</p>
      </> : <><p className="tl2-cap">Card</p><p className="tl2-none">Click a card to see it here.</p></>}
    </aside>
  </div>;
}
