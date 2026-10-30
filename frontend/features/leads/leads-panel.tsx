'use client';
// Questions & reporting leads: the queue of what still needs asking, with
// the reporter's own leads beside connector hits that stay leads until
// reviewed. Moved out of app/page.tsx (Foundation Fixes fix 3); the calls
// and their reply checks are generated from the API schema (fix 2). The
// board itself (components/leads-kanban-board.tsx) only draws and reports
// what the reporter did; this panel loads the queue and makes the changes.
// It opens on the leads by when to chase them (Now / Next / Later,
// leads-horizons.tsx, research Act §6); "By status" is the status columns.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {LeadsKanbanBoard, NewLead} from '../../components/leads-kanban-board';
import {LeadsHorizons} from './leads-horizons';
import type {Horizon} from './leads-horizons';
import type {LeadCard, LeadLinkCard, TaskCard} from '../../components/leads-kanban-board';
import {errorMessage} from '../../lib/api-client';
import {leadQueueOptions, leadQueueQueryKey, listClaimsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {convertLeadEndpoint, createLeadEndpoint, updateLeadEndpoint, updateReportingTaskEndpoint} from '../../lib/generated/sdk.gen';
import type {LeadOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Props = {investigationId: string};

/** The queue this panel shows: every lead, resolved ones included. Other
 * panels that make a lead mark this key stale. */
export const leadQueueKey = (investigationId: string): ReturnType<typeof leadQueueQueryKey> =>
  leadQueueQueryKey({path: {investigation_id: investigationId}, query: {unresolved_only: false}});

export function LeadsPanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const [leadTitle, setLeadTitle] = useState('');
  const [leadDetail, setLeadDetail] = useState('');
  const [leadPriority, setLeadPriority] = useState('normal');
  const [leadOwner, setLeadOwner] = useState('');
  const [problem, setProblem] = useState('');
  const [view, setView] = useState<'horizons' | 'status'>('horizons');

  const queue = useQuery({...leadQueueOptions({path: {investigation_id: investigationId}, query: {unresolved_only: false}}), enabled: Boolean(investigationId)});
  const leads: LeadOut[] = queue.data?.items ?? [];
  const reloadLeads = () => queryClient.invalidateQueries({queryKey: leadQueueKey(investigationId)});

  const createLead = async (): Promise<boolean> => {
    if (!investigationId || !leadTitle.trim()) return false;
    try {
      const created = (await createLeadEndpoint({body: {investigation_id: investigationId, title: leadTitle.trim(), detail: leadDetail.trim() || null, status: 'unreviewed'}, throwOnError: true})).data;
      await updateLeadEndpoint({path: {lead_id: created.id}, body: {priority: leadPriority, owner: leadOwner.trim() || null}, throwOnError: true});
      setLeadTitle('');
      setLeadDetail('');
      setProblem('');
      await reloadLeads();
      return true;
    } catch (error) {
      setProblem(errorMessage(error, 'Could not add the lead'));
      return false;
    }
  };

  const setLeadStatus = async (id: string, status: string) => {
    try {
      await updateLeadEndpoint({path: {lead_id: id}, body: {status}, throwOnError: true});
      setProblem('');
      await reloadLeads();
    } catch (error) {
      setProblem(errorMessage(error, 'Could not change the lead'));
    }
  };

  const setLeadHorizon = async (id: string, horizon: Horizon | null) => {
    try {
      await updateLeadEndpoint({path: {lead_id: id}, body: {horizon}, throwOnError: true});
      setProblem('');
      await reloadLeads();
    } catch (error) {
      setProblem(errorMessage(error, 'Could not move the lead'));
    }
  };

  const convertLead = async (id: string, kind: 'claim' | 'task') => {
    try {
      await convertLeadEndpoint({path: {lead_id: id}, body: {kind}, throwOnError: true});
      setProblem('');
      // A new claim belongs in the verification workspace's list too.
      await Promise.all([
        reloadLeads(),
        kind === 'claim' ? queryClient.invalidateQueries({queryKey: listClaimsQueryKey({path: {investigation_id: investigationId}})}) : Promise.resolve(),
      ]);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not convert the lead'));
    }
  };

  const setTaskStatus = async (id: string, status: 'in_progress' | 'blocked' | 'done') => {
    try {
      await updateReportingTaskEndpoint({path: {task_id: id}, body: {status}, throwOnError: true});
      setProblem('');
      await reloadLeads();
    } catch (error) {
      setProblem(errorMessage(error, 'Could not change the task'));
    }
  };

  const traceLink = (lead: LeadCard, link: LeadLinkCard) => {
    if (!link.type || !link.target_id) return;
    const base = {title: link.label || lead.title, kind: `lead ${link.type} link`, detail: link.note ?? undefined};
    if (link.type === 'entity') return openProvenance({...base, entityId: link.target_id});
    if (link.type === 'source') return openProvenance({...base, sourceId: link.target_id});
    if (link.type === 'claim' || link.type === 'evidence') return openProvenance({...base, acceptedRecordType: link.type, acceptedRecordId: link.target_id});
    if (link.type === 'relationship') return openProvenance({...base, traceRecordType: 'relationship', acceptedRecordId: link.target_id});
  };

  const traceTask = (task: TaskCard, leadTitle: string) => {
    openProvenance({title: task.title || leadTitle, kind: 'reporting task', traceRecordType: 'task', acceptedRecordId: task.id});
  };

  const trouble = problem || (queue.isError ? errorMessage(queue.error, 'Could not load the leads') : '');

  const viewSwitch = <div className="flex gap-1 text-sm" role="group" aria-label="Show the leads">
    {([['horizons', 'Now / Next / Later'], ['status', 'By status']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id}
      className={`rounded-md border px-2.5 py-1 ${view === id ? 'bg-muted font-medium' : 'text-muted-foreground'}`} onClick={() => setView(id)}>{label}</button>)}
  </div>;

  const newLead = <NewLead leadTitle={leadTitle} setLeadTitle={setLeadTitle} leadDetail={leadDetail} setLeadDetail={setLeadDetail}
    leadPriority={leadPriority} setLeadPriority={setLeadPriority} leadOwner={leadOwner} setLeadOwner={setLeadOwner} onCreateLead={createLead}/>;

  return <LeadsKanbanBoard
    leads={leads} problem={trouble} viewSwitch={viewSwitch}
    board={view === 'horizons' ? <LeadsHorizons leads={leads} onMove={setLeadHorizon} onStatus={setLeadStatus} onConvert={convertLead}
      tools={<>{viewSwitch}{newLead}</>}/> : undefined}
    leadTitle={leadTitle} setLeadTitle={setLeadTitle} leadDetail={leadDetail} setLeadDetail={setLeadDetail}
    leadPriority={leadPriority} setLeadPriority={setLeadPriority} leadOwner={leadOwner} setLeadOwner={setLeadOwner}
    onCreateLead={createLead} onStatusChange={setLeadStatus} onTraceLink={traceLink} onTraceTask={traceTask} onTaskStatus={setTaskStatus} onConvert={convertLead}
  />;
}
