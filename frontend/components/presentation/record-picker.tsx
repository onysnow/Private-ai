'use client';
// Evidence picker for the presentation_draft module: search the
// investigation (the existing /api/search endpoint, through the generated
// client, which checks each reply against the API schema), add hits of any record
// type the backend accepts as a record_ref, and keep the picked set visible
// as removable chips. Only what is picked here can be cited by the draft.
import {useState} from 'react';
import type {FormEvent, ReactElement} from 'react';
import {Check, Plus, Search, X} from 'lucide-react';

import {errorMessage} from '../../lib/api-client';
import {searchWorkbench} from '../../lib/generated/sdk.gen';
import type {SearchHitOut} from '../../lib/generated/types.gen';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

// app/services/assistant_context.py SELECTABLE_RECORD_TYPES. Search calls a
// reporting task "reporting_task" (app/services/search.py); everywhere a
// reporter picks or cites one it is "task".
export const SELECTABLE_SEARCH_TYPES = new Set(['entity', 'claim', 'evidence', 'relationship', 'source', 'document', 'lead', 'reporting_task']);
export const toRecordType = (hitType: string): string => (hitType === 'reporting_task' ? 'task' : hitType);
const TYPE_LABEL: Record<string, string> = {entity: 'Entity', claim: 'Claim', evidence: 'Evidence', relationship: 'Relationship', source: 'Source', document: 'Document', lead: 'Lead', task: 'Task'};

export type SelectedRef = {record_type: string, record_id: string, label: string};
const keyOf = (r: {record_type: string, record_id: string}) => `${r.record_type}:${r.record_id}`;

// Search titles a claim hit just "Claim"; its snippet is the claim itself.
const hitLabel = (hit: SearchHitOut) => (hit.type === 'claim' && hit.snippet ? hit.snippet : hit.title);

type Props = {investigationId: string, selected: SelectedRef[], onChange: (next: SelectedRef[]) => void, disabled?: boolean};

export function RecordPicker({investigationId, selected, onChange, disabled}: Props): ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHitOut[]>([]);
  const [status, setStatus] = useState('');
  const [searching, setSearching] = useState(false);
  const picked = new Set(selected.map(keyOf));

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!investigationId || !query.trim()) return;
    setSearching(true);
    setStatus('');
    try {
      const body = (await searchWorkbench({query: {q: query.trim(), investigation_id: investigationId, limit: 25}, throwOnError: true})).data;
      const hits = body.results.filter(r => SELECTABLE_SEARCH_TYPES.has(r.type));
      setResults(hits);
      if (!hits.length) setStatus('No matching claims, evidence, entities, leads, tasks, sources, documents or relationships.');
    } catch (error) {
      setResults([]);
      setStatus(errorMessage(error, 'Search failed'));
    } finally {
      setSearching(false);
    }
  };

  const toggle = (hit: SearchHitOut) => {
    const ref = {record_type: toRecordType(hit.type), record_id: hit.id, label: hitLabel(hit)};
    onChange(picked.has(keyOf(ref)) ? selected.filter(r => keyOf(r) !== keyOf(ref)) : [...selected, ref]);
  };
  const addAll = () => {
    const next = [...selected];
    for (const hit of results) {
      const ref = {record_type: toRecordType(hit.type), record_id: hit.id, label: hitLabel(hit)};
      if (!next.some(r => keyOf(r) === keyOf(ref))) next.push(ref);
    }
    onChange(next);
  };

  return <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" data-testid="presentation-record-picker">
    <div className="min-w-0">
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden/>
          <Input aria-label="Search records to add" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search claims, evidence, entities, leads, tasks…" disabled={disabled} className="pl-8"/>
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={disabled || searching || !query.trim()}>{searching ? 'Searching…' : 'Search'}</Button>
      </form>
      {status && <p className="mt-2 text-sm text-muted-foreground">{status}</p>}
      {results.length > 0 && <>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
          <button type="button" onClick={addAll} disabled={disabled} className="font-medium text-primary hover:underline disabled:opacity-50">Add all</button>
        </div>
        <ul className="mt-1 max-h-80 space-y-1 overflow-y-auto pr-1" data-testid="record-results">
          {results.map(hit => {
            const type = toRecordType(hit.type);
            const on = picked.has(`${type}:${hit.id}`);
            return <li key={`${hit.type}:${hit.id}`}>
              <button type="button" onClick={() => toggle(hit)} disabled={disabled} aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${TYPE_LABEL[type] || type}: ${hitLabel(hit)}`}
                className={`flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${on ? 'border-primary/60 bg-primary/10' : 'border-border bg-card/50 hover:border-primary/40 hover:bg-muted/60'}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${on ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}>{on ? <Check className="h-3 w-3"/> : <Plus className="h-3 w-3"/>}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{TYPE_LABEL[type] || type}</span>
                  <span className="block truncate text-sm text-foreground">{hitLabel(hit)}</span>
                  {hit.snippet && hit.snippet !== hitLabel(hit) && <span className="line-clamp-2 block text-xs text-muted-foreground">{hit.snippet}</span>}
                </span>
              </button>
            </li>;
          })}
        </ul>
      </>}
    </div>
    <div className="min-w-0 rounded-md border border-dashed border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" data-testid="selected-count">Selected evidence · {selected.length}</span>
        {selected.length > 0 && <button type="button" onClick={() => onChange([])} disabled={disabled} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">Clear</button>}
      </div>
      {selected.length === 0
        ? <p className="mt-2 text-sm text-muted-foreground">Nothing picked yet. The draft can only cite records you add here.</p>
        : <ul className="mt-2 flex flex-wrap gap-1.5">{selected.map(r => <li key={keyOf(r)} className="flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 py-0.5 pl-2.5 pr-1 text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{TYPE_LABEL[r.record_type] || r.record_type}</span>
            <span className="max-w-[16rem] truncate">{r.label}</span>
            <button type="button" onClick={() => onChange(selected.filter(x => keyOf(x) !== keyOf(r)))} disabled={disabled} aria-label={`Remove ${r.label}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"><X className="h-3 w-3"/></button>
          </li>)}</ul>}
    </div>
  </div>;
}
