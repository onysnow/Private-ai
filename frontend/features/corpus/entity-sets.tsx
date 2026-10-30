'use client';
// Diagrams, timelines and lists in OpenAleph (ADR-0006, Wave C; backend
// app/services/openaleph_entitysets.py). Made from what the investigation's
// OpenAleph collection already holds -- the confirmed records the corpus sync
// sent -- so OpenAleph's diagram editor, timeline and lists show the same
// records the Workbench does. Sending a set again updates it in place and
// keeps where a reporter moved things in OpenAleph's diagram.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {GitFork, List, CalendarRange} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

import {Input} from '@/components/ui/input';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {
  listCorpusEntitySetsOptions, listCorpusEntitySetsQueryKey, listEntitiesOptions, sendCorpusEntitySetMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {EntitySetSentOut} from '../../lib/generated/types.gen';
import {timeWords} from '../../lib/timestamps';

const KIND_NAME: Record<string, string> = {diagram: 'Diagram', timeline: 'Timeline', list: 'List'};
const KIND_ICON: Record<string, LucideIcon> = {diagram: GitFork, timeline: CalendarRange, list: List};

/** What happened, in plain words. */
export function sentSummary(reply: EntitySetSentOut): string {
  const {entityset, added, removed, waiting_for_sync: waiting} = reply;
  const changes = [added ? `${added} added` : '', removed ? `${removed} taken out` : ''].filter(Boolean).join(', ') || 'nothing changed';
  const wait = waiting ? ` ${waiting} record(s) wait for the next sync and will show once it has run and this is sent again.` : '';
  return `${KIND_NAME[entityset.kind]} “${entityset.label}” is in OpenAleph: ${changes}.${wait}`;
}

export function EntitySets({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const [status, setStatus] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [listLabel, setListLabel] = useState('');
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const sets = useQuery({...listCorpusEntitySetsOptions({path}), enabled: Boolean(investigationId)});
  const entities = useQuery({...listEntitiesOptions({path, query: {limit: 500}}), enabled: listOpen && Boolean(investigationId)});
  const send = useMutation({...sendCorpusEntitySetMutation()});

  const sendSet = async (kind: 'diagram' | 'timeline' | 'list') => {
    try {
      const body = kind === 'list' ? {kind, label: listLabel.trim() || null, entity_ids: chosen} : {kind};
      const reply = await send.mutateAsync({path, body});
      setStatus(sentSummary(reply));
      if (kind === 'list') { setChosen([]); setListOpen(false); }
      await queryClient.invalidateQueries({queryKey: listCorpusEntitySetsQueryKey({path})});
    } catch (error) {
      setStatus(errorMessage(error, `Could not send the ${kind} to OpenAleph`));
    }
  };

  const shown = (entities.data ?? []).filter(e => e.caption.toLowerCase().includes(filter.trim().toLowerCase()));
  return <div className="candidate" aria-label="Diagrams, timelines and lists in OpenAleph">
    <Reveal detail="Made from the confirmed records the sync sent to the investigation's collection. Sending again updates the same one; where you moved things in OpenAleph's diagram stays."><b>Diagrams, timelines and lists in OpenAleph</b></Reveal>
    <div className="actions">
      <Button variant="outline" onClick={() => void sendSet('diagram')} disabled={send.isPending}>Send the relationships as a diagram</Button>
      <Button variant="outline" onClick={() => void sendSet('timeline')} disabled={send.isPending}>Send the dated records as a timeline</Button>
      <Button variant="outline" aria-expanded={listOpen} onClick={() => setListOpen(open => !open)}>Make a list…</Button>
    </div>
    {listOpen && <div className="statement" aria-label="Make a list">
      <Input aria-label="List name" placeholder="List name, e.g. People to call" value={listLabel}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setListLabel(e.target.value)}/>
      <Input aria-label="Find an entity" placeholder="Find an entity" value={filter}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}/>
      {entities.isPending && <p className="muted">Loading the entities…</p>}
      {entities.isError && <p className="muted">{errorMessage(entities.error, 'Could not load the entities')}</p>}
      <ul aria-label="Entities for the list">
        {shown.map(e => <li key={e.id}><label>
          <input type="checkbox" checked={chosen.includes(e.id)}
            onChange={() => setChosen(cur => (cur.includes(e.id) ? cur.filter(id => id !== e.id) : [...cur, e.id]))}/> {e.caption} <small>({e.schema})</small>
        </label></li>)}
      </ul>
      <Button onClick={() => void sendSet('list')} disabled={chosen.length === 0 || send.isPending}>Send the list ({chosen.length})</Button>
    </div>}
    {sets.isError && <p className="muted">{errorMessage(sets.error, 'Could not load what was sent')}</p>}
    {(sets.data ?? []).length > 0 && <ul aria-label="Sent to OpenAleph">
      {(sets.data ?? []).map(row => <li key={row.id}>
        {/* Its kind is its icon; the count and when it was sent are on hover. */}
        {(() => { const Icon = KIND_ICON[row.kind]; return <Reveal label={KIND_NAME[row.kind]} detail={<><b>{KIND_NAME[row.kind]}</b> · {row.items} record(s) · sent {timeWords(row.sent_at)}</>}>
          {Icon ? <Icon size={14} aria-hidden="true"/> : <span aria-hidden="true">·</span>}</Reveal>; })()}{' '}
        <a href={row.url} target="_blank" rel="noreferrer" aria-label={`${KIND_NAME[row.kind]}: ${row.label}`}>{row.label}</a>
      </li>)}
    </ul>}
    {status && <p className="muted" role="status">{status}</p>}
  </div>;
}
