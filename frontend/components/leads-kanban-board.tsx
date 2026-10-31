'use client';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement, ReactNode} from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type {DragEndEvent, DragStartEvent} from '@dnd-kit/core';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {Reveal} from './ui/reveal';

// Priority is the card's left edge (thick for urgent, medium for high, dashed for low), as on the horizons; a task's
// status is a dot. Both are named on reveal.
const EDGE: Record<string, string> = {urgent: 'border-l-[5px]', high: 'border-l-[3px]', low: 'border-l border-l-foreground/40 border-dashed'};
const TASK_DOT: Record<string, string> = {todo: '○', in_progress: '◐', blocked: '✕', done: '✓', cancelled: '–'};
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(w => w[0]?.toUpperCase()).join('').slice(0, 3);
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';

// The board asks only for what it draws, so a lead from the generated API
// client (LeadOut) fits as it is. The feature that loads the queue
// (features/leads) makes the changes the callbacks report.
export type LeadLinkCard = {id?: string | null; type?: string | null; target_id?: string | null; label?: string | null; note?: string | null};
export type TaskCard = {id: string; title?: string | null; status?: string | null; history?: unknown[] | null};
export type LeadCard = {
  id: string;
  title: string;
  detail?: string | null;
  provider?: string | null;
  status: string;
  priority: string;
  owner?: string | null;
  next_action?: string | null;
  links: LeadLinkCard[];
  tasks: TaskCard[];
  triage: {needs_attention: boolean; attention_score: number; reasons: string[]; stance_counts: {supports: number; contradicts: number; context: number}};
};

// Kanban columns mirror the backend's LEAD_STATUSES exactly
// (app/services/leads.py) -- dragging a card to a column PATCHes
// /api/leads/{id} with that status, reusing the existing endpoint.
const COLUMNS: {id: string; label: string}[] = [
  {id: 'unreviewed', label: 'Unreviewed'},
  {id: 'active', label: 'Active'},
  {id: 'blocked', label: 'Blocked'},
  {id: 'resolved', label: 'Resolved'},
  {id: 'rejected', label: 'Rejected'},
];

interface LeadsKanbanBoardProps {
  leads: LeadCard[];
  /** What went wrong with the last change, if anything. */
  problem?: string;
  leadTitle: string;
  setLeadTitle: (v: string) => void;
  leadDetail: string;
  setLeadDetail: (v: string) => void;
  leadPriority: string;
  setLeadPriority: (v: string) => void;
  leadOwner: string;
  setLeadOwner: (v: string) => void;
  /** Adds the lead from the fields; true when it was added (the form folds away again). */
  onCreateLead: () => void | boolean | Promise<void | boolean>;
  onStatusChange: (id: string, status: string) => void;
  onTraceLink: (lead: LeadCard, link: LeadLinkCard) => void;
  onTraceTask: (task: TaskCard, leadTitle: string) => void;
  onTaskStatus: (id: string, status: 'in_progress' | 'blocked' | 'done') => void;
  onConvert: (id: string, kind: 'claim' | 'task') => void;
  /** Drawn above the board (the panel's view switch). */
  viewSwitch?: ReactNode;
  /** Another view of the same leads (Now / Next / Later), drawn in place of the status columns. */
  board?: ReactNode;
}

type NewLeadProps = Pick<LeadsKanbanBoardProps, 'leadTitle' | 'setLeadTitle' | 'leadDetail' | 'setLeadDetail' | 'leadPriority' | 'setLeadPriority'
  | 'leadOwner' | 'setLeadOwner' | 'onCreateLead'>;

/** "+ New lead": one line at rest; a click unfolds the form in place (the question, priority, owner, what is known),
 *  Esc or Cancel folds it, and it folds by itself once the lead is added. */
export function NewLead(props: NewLeadProps): ReactElement {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => { if (wasOpen.current && !open) opener.current?.focus(); wasOpen.current = open; }, [open]);
  if (!open) return <Button ref={opener} type="button" size="sm" variant="outline" aria-expanded={false} onClick={() => setOpen(true)}>+ New lead</Button>;
  const add = async () => { if ((await props.onCreateLead()) === true) setOpen(false); };
  return <form className="grid basis-full gap-2 rounded-lg border bg-card p-2.5" aria-label="New lead" noValidate
    onSubmit={e => { e.preventDefault(); void add(); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
    <div className="flex flex-wrap items-center gap-2">
      <Input autoFocus className="min-w-[240px] flex-[3]" aria-label="The question" value={props.leadTitle}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.setLeadTitle(e.target.value)} placeholder="Who approved this contract?" />
      <Select value={props.leadPriority} onValueChange={props.setLeadPriority}>
        <SelectTrigger className="w-auto" aria-label="Priority"><SelectValue /></SelectTrigger>
        <SelectContent>{['normal', 'high', 'urgent', 'low'].map(x => <SelectItem value={x} key={x}>{x}</SelectItem>)}</SelectContent>
      </Select>
      <Input className="min-w-[140px] flex-1" aria-label="Owner" value={props.leadOwner}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.setLeadOwner(e.target.value)} placeholder="Owner" />
      <Button type="submit">Add lead</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
    <Textarea rows={2} aria-label="What is known" value={props.leadDetail} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => props.setLeadDetail(e.target.value)}
      placeholder="What is known, what is missing, and why it matters?" />
  </form>;
}

function LeadCardView({lead, onStatusChange, onTraceLink, onTraceTask, onTaskStatus, onConvert, dragHandleProps}: {
  lead: LeadCard;
  onStatusChange: LeadsKanbanBoardProps['onStatusChange'];
  onTraceLink: LeadsKanbanBoardProps['onTraceLink'];
  onTraceTask: LeadsKanbanBoardProps['onTraceTask'];
  onTaskStatus: LeadsKanbanBoardProps['onTaskStatus'];
  onConvert: LeadsKanbanBoardProps['onConvert'];
  dragHandleProps?: Record<string, unknown>;
}): ReactElement {
  const links = lead.links || [];
  const tasks = lead.tasks || [];
  return (
    <div className={`rounded-lg border ${EDGE[lead.priority] ?? ''} border-l-foreground/70 bg-card p-3 text-card-foreground shadow-xs space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <Reveal tabbable={false} detail={`${lead.priority} priority`}>
          <button type="button" className="text-left font-medium leading-snug cursor-grab active:cursor-grabbing" {...dragHandleProps}>
            {lead.title}
          </button></Reveal>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {lead.provider && <Reveal label={`${lead.provider} lead`} detail={`From ${lead.provider}: an outside lead`}><span aria-hidden="true">↗</span></Reveal>}
          {lead.owner && <Reveal label={`Owner: ${lead.owner}`} detail={`Owner: ${lead.owner}`}><span aria-hidden="true" className="rounded-full border px-1.5 text-xs">{initials(lead.owner)}</span></Reveal>}
        </span>
      </div>
      {lead.triage.needs_attention && <div className="text-xs text-destructive">⚠ evidence conflict score {lead.triage.attention_score}</div>}
      <Select value={lead.status} onValueChange={(status) => onStatusChange(lead.id, status)}>
        <SelectTrigger className="h-7 w-auto text-xs" aria-label={`Move "${lead.title}"`}><SelectValue /></SelectTrigger>
        <SelectContent>{COLUMNS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
      </Select>
      {lead.triage.needs_attention && (
        <div className="text-xs text-destructive"><b>Needs evidence review:</b> {lead.triage.reasons.join(' · ')}</div>
      )}
      {lead.next_action && <div className="text-xs"><b>Next:</b> {lead.next_action}</div>}
      {lead.detail && <div className="text-sm">{lead.detail}</div>}
      <div className="text-sm text-muted-foreground">
        <Reveal detail={`${links.length} linked record(s) · ${tasks.length} task(s) · ${lead.triage.stance_counts.supports} support / ${lead.triage.stance_counts.contradicts} contradiction / ${lead.triage.stance_counts.context} context`}>
          <span>✓ {lead.triage.stance_counts.supports} · ✕ {lead.triage.stance_counts.contradicts} · ☐ {tasks.length}</span></Reveal>
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {links.map(link => (
            <Button key={link.id || `${link.type}:${link.target_id}`} size="sm" variant="outline" onClick={() => onTraceLink(lead, link)} disabled={!link.type || !link.target_id}>
              Trace {link.type || 'linked record'}{link.label ? `: ${link.label.slice(0, 40)}` : ''}
            </Button>
          ))}
        </div>
      )}
      {tasks.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="text-xs font-semibold">Reporting tasks</div>
          {tasks.map(task => (
            <div key={task.id} className="flex flex-wrap items-center gap-1 text-xs">
              <Reveal detail={`${task.status || 'todo'} · ${(task.history || []).length} event(s)`}>
                <span><span aria-hidden="true">{TASK_DOT[task.status || 'todo'] ?? '○'}</span> {task.title || 'Task'}</span></Reveal>
              <Button size="sm" variant="ghost" onClick={() => onTraceTask(task, lead.title)}>Trace</Button>
              {task.status !== 'done' && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => onTaskStatus(task.id, 'in_progress')}>In progress</Button>
                  <Button size="sm" variant="ghost" onClick={() => onTaskStatus(task.id, 'blocked')}>Blocked</Button>
                  <Button size="sm" variant="ghost" onClick={() => onTaskStatus(task.id, 'done')}>Done</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1 border-t pt-2">
        <Button size="sm" variant="outline" onClick={() => onConvert(lead.id, 'claim')}>Make claim</Button>
        <Button size="sm" variant="outline" onClick={() => onConvert(lead.id, 'task')}>Make task</Button>
      </div>
    </div>
  );
}

function DraggableLeadCard(props: Parameters<typeof LeadCardView>[0]) {
  const {attributes, listeners, setNodeRef, transform, isDragging} = useDraggable({id: props.lead.id});
  const style = transform
    ? {transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10, opacity: isDragging ? 0.4 : 1}
    : undefined;
  return (
    <div ref={setNodeRef} style={style}>
      <LeadCardView {...props} dragHandleProps={{...attributes, ...listeners}} />
    </div>
  );
}

function KanbanColumn({column, leads, children}: {column: {id: string; label: string}; leads: LeadCard[]; children: ReactNode}): ReactElement {
  const {setNodeRef, isOver} = useDroppable({id: column.id});
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[260px] flex-1 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors ${isOver ? 'bg-muted/70 ring-2 ring-primary/40' : ''}`}
    >
      <div className="flex items-baseline gap-1.5 px-1">
        <span className="text-sm font-semibold">{column.label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[80px]">{children}</div>
    </div>
  );
}

export function LeadsKanbanBoard(props: LeadsKanbanBoardProps): ReactElement {
  const {leads, onStatusChange, onTraceLink, onTraceTask, onTaskStatus, onConvert} = props;
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 4}}),
    useSensor(KeyboardSensor),
  );

  const byColumn = (status: string) => leads.filter(l => l.status === status);
  // Leads whose status isn't one of the five known columns (shouldn't happen,
  // but fail open rather than silently dropping cards from the board).
  const known = new Set(COLUMNS.map(c => c.id));
  const overflow = leads.filter(l => !known.has(l.status));
  const activeLead = activeId ? leads.find(l => l.id === activeId) : undefined;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }
  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const {active, over} = event;
    if (!over) return;
    const targetStatus = String(over.id);
    const lead = leads.find(l => l.id === active.id);
    if (lead && known.has(targetStatus) && lead.status !== targetStatus) {
      onStatusChange(lead.id, targetStatus);
    }
  }

  return (
    <Card className="card" id="leads">
      <CardHeader className="pb-3">
        <CardTitle><Reveal detail={`Questions stay separate from claims until evidence supports a conversion. Connector hits remain leads until reviewed.${props.board ? '' : ' Drag a card to change its status.'}`}>
          <span>Questions & reporting leads</span></Reveal></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.problem && <p className="muted" role="alert">{props.problem}</p>}
        {/* The other view (Now / Next / Later) draws its own toolbar, with the view switch and "+ New lead" in it. */}
        {!props.board && <div className="flex flex-wrap items-center gap-2">{props.viewSwitch}<NewLead {...props}/></div>}

        {props.board ?? <>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {COLUMNS.map(column => (
              <KanbanColumn key={column.id} column={column} leads={byColumn(column.id)}>
                {byColumn(column.id).map(lead => (
                  <DraggableLeadCard key={lead.id} lead={lead} onStatusChange={onStatusChange} onTraceLink={onTraceLink} onTraceTask={onTraceTask} onTaskStatus={onTaskStatus} onConvert={onConvert} />
                ))}
              </KanbanColumn>
            ))}
          </div>
          <DragOverlay>
            {activeLead ? (
              <div className="w-[260px]">
                <LeadCardView lead={activeLead} onStatusChange={onStatusChange} onTraceLink={onTraceLink} onTraceTask={onTraceTask} onTaskStatus={onTaskStatus} onConvert={onConvert} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {overflow.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Leads with an unrecognized status (not shown above):</div>
            {overflow.map(lead => (
              <LeadCardView key={lead.id} lead={lead} onStatusChange={onStatusChange} onTraceLink={onTraceLink} onTraceTask={onTraceTask} onTaskStatus={onTaskStatus} onConvert={onConvert} />
            ))}
          </div>
        )}
        </>}
      </CardContent>
    </Card>
  );
}
