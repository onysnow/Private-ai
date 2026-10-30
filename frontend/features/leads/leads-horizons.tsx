'use client';
// Leads as Now / Next / Later (research Act §6; the ProdPad horizons): three columns of unequal width, Now capped at
// five open leads ("4 / 5", the server refuses a sixth), and an Inbox lane above them for leads not yet placed
// (connector, watchlist, note and Red Flag leads arrive there: every lead waits for a person). Status is a mark on the
// card (shape + word), not a column; finished leads (resolved, rejected) are a separate "Done" view with their outcome.
// A card: title, priority edge (thicker for higher, with the word), status mark, what it is for, owner initials, task
// dots (○ todo, ◐ in progress, ✕ blocked, ✓ done) and evidence counts (✓ supports · ✕ contradicts). Its actions sit
// in a "…" menu. Drag a card between horizons, or focus it and press M then 1 / 2 / 3 (0 for the inbox).
import {DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors} from '@dnd-kit/core';
import type {DragEndEvent} from '@dnd-kit/core';
import {useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode} from 'react';

import type {LeadCard} from '../../components/leads-kanban-board';
import {Reveal} from '../../components/ui/reveal';

export type Horizon = 'now' | 'next' | 'later';
export type HorizonLead = LeadCard & {horizon?: Horizon | null; history?: {to_status: string; note?: string | null; created_at: string}[]};
type Place = Horizon | 'inbox';

export const NOW_CAP = 5;
const DONE = new Set(['resolved', 'rejected']);
const COLUMNS: {id: Horizon; label: string; key: string}[] = [{id: 'now', label: 'Now', key: '1'}, {id: 'next', label: 'Next', key: '2'}, {id: 'later', label: 'Later', key: '3'}];
const PLACE_WORD: Record<Place, string> = {now: 'Now', next: 'Next', later: 'Later', inbox: 'the inbox'};
const STATUS_MARK: Record<string, [string, string]> = {unreviewed: ['◌', 'unreviewed'], active: ['●', 'active'], blocked: ['✕', 'blocked'],
  resolved: ['✓', 'resolved'], rejected: ['⊘', 'rejected']};
const TASK_DOT: Record<string, string> = {todo: '○', in_progress: '◐', blocked: '✕', done: '✓', cancelled: '–'};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(w => w[0]?.toUpperCase()).join('').slice(0, 3);
export const placeOf = (lead: HorizonLead): Place => lead.horizon ?? 'inbox';

type Actions = {
  onMove: (id: string, horizon: Horizon | null) => void;
  onStatus: (id: string, status: string) => void;
  onConvert: (id: string, kind: 'claim' | 'task') => void;
};

function Menu({lead, actions}: {lead: HorizonLead; actions: Actions}): ReactElement {
  const [open, setOpen] = useState(false);
  const place = placeOf(lead);
  const item = (label: string, run: () => void, hidden = false) => hidden ? null
    : <li key={label}><button type="button" role="menuitem" onClick={() => { setOpen(false); run(); }}>{label}</button></li>;
  return <span className="relative">
    <button type="button" className="rounded px-1.5 text-muted-foreground hover:bg-muted" aria-haspopup="menu" aria-expanded={open}
      aria-label={`Actions for “${lead.title}”`} onClick={() => setOpen(o => !o)} onPointerDown={e => e.stopPropagation()}>…</button>
    {open && <ul role="menu" aria-label={`Actions for “${lead.title}”`} onPointerDown={e => e.stopPropagation()}
      className="absolute right-0 z-20 mt-1 grid min-w-[190px] gap-0.5 rounded-md border bg-popover p-1 text-xs shadow-md [&_button]:w-full [&_button]:rounded [&_button]:px-2 [&_button]:py-1 [&_button]:text-left hover:[&_button]:bg-muted">
      {COLUMNS.map(c => item(`Move to ${c.label}`, () => actions.onMove(lead.id, c.id), place === c.id))}
      {item('Back to the inbox', () => actions.onMove(lead.id, null), place === 'inbox')}
      {item('Mark active', () => actions.onStatus(lead.id, 'active'), lead.status === 'active')}
      {item('Mark blocked', () => actions.onStatus(lead.id, 'blocked'), lead.status === 'blocked')}
      {item('Resolved', () => actions.onStatus(lead.id, 'resolved'))}
      {item('Set aside (rejected)', () => actions.onStatus(lead.id, 'rejected'))}
      {item('Make claim', () => actions.onConvert(lead.id, 'claim'))}
      {item('Make task', () => actions.onConvert(lead.id, 'task'))}
    </ul>}
  </span>;
}

function Card({lead, actions, onKeyMove}: {lead: HorizonLead; actions: Actions; onKeyMove: (lead: HorizonLead, place: Place) => void}): ReactElement {
  const {attributes, listeners, setNodeRef, transform, isDragging} = useDraggable({id: lead.id});
  const armed = useRef(false);
  const [status, word] = STATUS_MARK[lead.status] ?? ['◌', lead.status];
  const forLink = lead.links.find(l => l.type === 'claim') ?? lead.links.find(l => l.label);
  const counts = lead.triage.stance_counts;
  const edge = lead.priority === 'urgent' ? 'border-l-[5px]' : lead.priority === 'high' ? 'border-l-[3px]' : lead.priority === 'low' ? 'border-l border-dashed' : 'border-l';
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'm' || e.key === 'M') { armed.current = true; e.preventDefault(); return; }
    if (armed.current) {
      armed.current = false;
      const place = e.key === '0' ? 'inbox' : COLUMNS.find(c => c.key === e.key)?.id;
      if (place) { e.preventDefault(); onKeyMove(lead, place); }
    }
  };
  return <article ref={setNodeRef} {...attributes} {...listeners} onKeyDown={e => { onKey(e); listeners?.onKeyDown?.(e); }}
    aria-roledescription="lead" aria-label={`${lead.title}, ${word}, ${lead.priority} priority. Press M then 1, 2 or 3 to move it to Now, Next or Later.`}
    style={transform ? {transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10, opacity: isDragging ? 0.6 : 1} : undefined}
    className={`grid gap-1 rounded-lg border ${edge} border-l-foreground/70 bg-card p-2.5 text-card-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}>
    {/* Status is the glyph before the title and priority the left edge (thick urgent, medium high, dashed low): both
        named on reveal. Owner, source and tasks share the last line; a line with nothing in it is not drawn. */}
    <div className="flex items-start gap-2">
      <Reveal tabbable={false} describe={false} detail={<><b>{word}</b> · {lead.priority} priority</>}>
        <span aria-label={`Status: ${word}`} className="text-sm leading-snug text-muted-foreground"><span aria-hidden="true">{status}</span></span></Reveal>
      <b className="flex-1 text-sm font-medium leading-snug">{lead.title}</b>
      <Menu lead={lead} actions={actions}/>
    </div>
    {forLink?.label && <div className="text-xs"><Reveal tabbable={false} describe={false} detail="For"><span className="text-muted-foreground" aria-label="For:">↳</span></Reveal> {forLink.label}</div>}
    {(lead.owner || lead.provider || lead.tasks.length > 0 || counts.supports + counts.contradicts > 0) && <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {lead.owner && <Reveal tabbable={false} describe={false} detail={lead.owner}>
        <span aria-label={`Owner: ${lead.owner}`} className="rounded-full border px-1.5 text-[11px]">{initials(lead.owner)}</span></Reveal>}
      {lead.provider && <Reveal tabbable={false} describe={false} detail={`From ${lead.provider.replace(/_/g, ' ')}`}>
        <span aria-label={`From ${lead.provider.replace(/_/g, ' ')}`}>↗</span></Reveal>}
      {lead.tasks.length > 0 && <span aria-label={`Tasks: ${lead.tasks.map(t => `${t.title ?? 'task'} ${(t.status ?? 'todo').replace('_', ' ')}`).join(', ')}`}>
        {lead.tasks.map(t => <Reveal key={t.id} tabbable={false} describe={false} detail={`${t.title ?? 'Task'} · ${(t.status ?? 'todo').replace('_', ' ')}`}>
          <span aria-hidden="true">{TASK_DOT[t.status ?? 'todo'] ?? '○'}</span></Reveal>)}</span>}
      {counts.supports + counts.contradicts > 0 && <span aria-label={`${counts.supports} supporting, ${counts.contradicts} contradicting`}>✓ {counts.supports} · ✕ {counts.contradicts}</span>}
    </div>}
  </article>;
}

function Column({id, label, title, count, cap, wide, children}: {id: Place; label: string; title?: ReactNode; count: number; cap?: number; wide?: string; children: ReactNode}): ReactElement {
  const {setNodeRef, isOver} = useDroppable({id});
  // The count is part of the title ("Now 4 / 5"), not a badge at the far end.
  return <section ref={setNodeRef} aria-label={`${label}${cap ? `, ${count} of ${cap}` : `, ${count}`}`}
    className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 ${wide ?? ''} ${isOver ? 'bg-muted/70 ring-2 ring-primary/40' : ''}`}>
    <header className="flex items-baseline gap-1.5 px-1" aria-hidden="true">
      <span className="text-sm font-semibold">{title ?? label}</span>
      <span className={`text-sm tabular-nums ${cap && count >= cap ? 'font-semibold' : 'text-muted-foreground'}`}>{cap ? `${count} / ${cap}` : count}</span>
    </header>
    <div className={id === 'inbox' ? 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2' : 'flex min-h-[70px] flex-col gap-2'}>{children}</div>
  </section>;
}

export function LeadsHorizons({leads, onMove, onStatus, onConvert, tools}: {leads: HorizonLead[]; tools?: ReactNode} & Actions): ReactElement {
  const [done, setDone] = useState(false);
  const [said, setSaid] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}), useSensor(KeyboardSensor));
  const open = leads.filter(l => !DONE.has(l.status));
  const finished = leads.filter(l => DONE.has(l.status));
  const at = (place: Place) => open.filter(l => placeOf(l) === place);
  const move = (lead: HorizonLead, place: Place) => {
    if (placeOf(lead) === place) return;
    onMove(lead.id, place === 'inbox' ? null : place);
    setSaid(`Moved “${lead.title}” to ${PLACE_WORD[place]}`);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const lead = open.find(l => l.id === event.active.id);
    const place = event.over?.id as Place | undefined;
    if (lead && place) move(lead, place);
  };
  const actions = {onMove: (id: string, h: Horizon | null) => { const l = open.find(x => x.id === id); if (l) move(l, h ?? 'inbox'); }, onStatus, onConvert};
  const card = (lead: HorizonLead) => <Card key={lead.id} lead={lead} actions={actions} onKeyMove={move}/>;

  return <div className="grid gap-3" aria-label="Leads by when to chase them">
    <div className="flex flex-wrap items-center gap-2">
      {tools}
      {/* The move mark is named on hover, with how to move a lead (the keys). */}
      <Reveal label="Moving a lead" detail={<><b>Moving a lead</b> · drag a card between horizons, or focus it and press M then 1 Now · 2 Next · 3 Later · 0 inbox.</>}>
        <span className="px-1 text-base text-muted-foreground" aria-hidden="true">⇄</span></Reveal>
      <button type="button" className={`ml-auto flex items-baseline gap-1.5 rounded-md px-2 py-1 text-sm ${done ? 'bg-muted font-semibold' : 'font-medium text-muted-foreground hover:bg-muted/60'}`}
        aria-pressed={done} aria-label={`Done, ${finished.length}`} onClick={() => setDone(d => !d)}>
        <span>Done</span><span className="tabular-nums">{finished.length}</span></button>
    </div>
    <p className="sr-only" aria-live="polite">{said}</p>
    {done ? <ul className="grid gap-1.5" aria-label="Done leads">
      {finished.length ? finished.map(l => {
        const [mark, word] = STATUS_MARK[l.status] ?? ['✓', l.status];
        // The reason a person gave when it was finished; the panel's own stock note is not a reason.
        const note = l.history?.find(h => h.to_status === l.status)?.note;
        const reason = note && !/in Next\.js workbench$/.test(note) ? note : null;
        return <li key={l.id} className="flex flex-wrap items-baseline gap-2 rounded border bg-card px-2.5 py-1.5 text-sm">
          <Reveal label={word} detail={word}><span className="text-xs text-muted-foreground" aria-hidden="true">{mark}</span></Reveal>
          {reason ? <Reveal detail={reason}><b className="font-medium">{l.title}</b></Reveal> : <b className="font-medium">{l.title}</b>}
          <button type="button" className="ml-auto text-xs underline" onClick={() => onStatus(l.id, 'active')}>Reopen</button>
        </li>;
      }) : <li className="text-sm text-muted-foreground">Nothing finished yet.</li>}
    </ul> : !open.length ? <p className="text-sm text-muted-foreground">No leads yet — add one, or turn a Red Flag into a lead.</p>
      : <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {at('inbox').length > 0 && <Column id="inbox" label="Inbox · not yet placed"
          title={<Reveal tabbable={false} describe={false} detail="Not yet placed: every lead that arrives (by hand, from a connector, the watchlist or a Red Flag) waits here for a person to put it in Now, Next or Later.">
            <span>Inbox</span></Reveal>} count={at('inbox').length}>{at('inbox').map(card)}</Column>}
        <div className="grid gap-3 md:grid-cols-[1.25fr_1fr_0.85fr]">
          {COLUMNS.map(c => <Column key={c.id} id={c.id} label={c.label} count={at(c.id).length} cap={c.id === 'now' ? NOW_CAP : undefined}>
            {at(c.id).length ? at(c.id).map(card) : <p className="px-1 text-xs text-muted-foreground">{c.id === 'now' ? 'Nothing being chased now.' : 'Empty.'}</p>}
          </Column>)}
        </div>
      </DndContext>}
  </div>;
}
