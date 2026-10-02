'use client';
// Investigation search: canonical records, exact evidence, reporting work,
// review proposals and external leads, each kept in its own group. Moved
// out of app/page.tsx (Foundation Fixes fix 3); the call and its reply
// check are generated from the API schema (fix 2).
import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ChangeEvent, KeyboardEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {errorMessage} from '../../lib/api-client';
import {searchWorkbenchOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {SearchHitOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import type {ProvenanceRequest} from '../../lib/workbench-store';
import {CorpusResults} from './corpus-results';

type Props = {
  /** Empty means "search every investigation this session may see". */
  investigationId: string;
};

const GROUPS = ['canonical', 'evidence', 'reporting', 'workflow', 'review', 'external_lead', 'other'] as const;
const RESULT_LIMIT = 75;

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** What the provenance panel needs to follow a hit back to its sources. The
 * hit's provenance block names the record to trace; its type decides which
 * trace the panel runs. */
export function provenanceRequestForHit(hit: SearchHitOut): ProvenanceRequest {
  const traceType = text(hit.provenance.trace_record_type);
  const traceId = text(hit.provenance.trace_record_id);
  const accepted = traceType === 'claim' || traceType === 'evidence' ? traceType : undefined;
  const direct = traceType === 'relationship' || traceType === 'lead' || traceType === 'task' ? traceType : undefined;
  return {
    title: hit.title,
    kind: `search:${hit.type}`,
    sourceId: text(hit.provenance.source_id),
    sourceUrl: text(hit.provenance.source_url),
    locator: text(hit.provenance.locator),
    detail: hit.snippet,
    entityId: traceType === 'entity' ? traceId : undefined,
    acceptedRecordType: accepted,
    acceptedRecordId: accepted || direct ? traceId : undefined,
    documentId: traceType === 'document' ? traceId : undefined,
    traceRecordType: direct,
  };
}

function groupLabel(group: string): string {
  return group === 'external_lead' ? 'External leads — review required' : group.replace('_', ' ');
}

export function SearchPanel({investigationId}: Props): ReactElement {
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const [draft, setDraft] = useState('');
  const [includeReconciledDuplicates, setIncludeReconciledDuplicates] = useState(false);
  // The query runs for the last submitted search, not for every keystroke.
  const [submitted, setSubmitted] = useState<{q: string; investigationId: string; includeReconciledDuplicates: boolean} | null>(null);

  const search = useQuery({
    ...searchWorkbenchOptions({query: {
      q: submitted?.q ?? '',
      limit: RESULT_LIMIT,
      investigation_id: submitted?.investigationId || undefined,
      include_reconciled_duplicates: submitted?.includeReconciledDuplicates || undefined,
    }}),
    enabled: submitted !== null,
  });

  // Results belong to the case they were searched in.
  useEffect(() => { setSubmitted(null); }, [investigationId]);

  const submit = () => {
    const q = draft.trim();
    if (!q) return;
    setSubmitted({q, investigationId, includeReconciledDuplicates});
  };

  const results = search.data?.results ?? [];
  const counts = search.data?.counts ?? {};
  const groupCounts = search.data?.group_counts ?? {};

  return <Card className="card" id="investigation-search">
    <CardHeader className="pb-3">
      <CardTitle>Investigation search</CardTitle>
      <CardDescription>Search canonical records, exact evidence, reporting work, review proposals, and external/Aleph leads without collapsing their evidentiary status.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="searchrow">
        <Input value={draft} onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') submit(); }} placeholder="Search this investigation…"/>
        <Button onClick={submit}>Search records</Button>
        <label><Checkbox checked={includeReconciledDuplicates} onCheckedChange={(checked: boolean | 'indeterminate') => setIncludeReconciledDuplicates(checked === true)}/> Include reviewed duplicate copies</label>
      </div>
      {search.isError && <p className="muted">{errorMessage(search.error, 'Search failed')}</p>}
      {Object.keys(groupCounts).length > 0 && <p className="muted">Groups: {Object.entries(groupCounts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
      {Object.keys(counts).length > 0 && <p className="muted">Types: {Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
      <div>
        {GROUPS.map(group => {
          const rows = results.filter(r => r.group === group);
          if (!rows.length) return null;
          return <div key={group}>
            <h4>{groupLabel(group)}</h4>
            {rows.map(r => <div className="candidate" key={`${r.type}:${r.id}`}>
              <b>{r.title}</b> <small>{r.type} · score {r.score.toFixed(1)}</small>
              <div>{r.snippet}</div>
              {text(r.provenance.locator) && <small>Locator: {text(r.provenance.locator)}</small>}
              {text(r.provenance.source_url) && <div><a href={text(r.provenance.source_url)} target="_blank" rel="noreferrer">Open source</a></div>}
              {r.group === 'external_lead'
                ? <small>External connector result; treat as a lead until reviewed and promoted.</small>
                : <Button onClick={() => openProvenance(provenanceRequestForHit(r))}>Trace provenance</Button>}
            </div>)}
          </div>;
        })}
      </div>
      {submitted?.investigationId && <CorpusResults investigationId={submitted.investigationId} q={submitted.q}/>}
    </CardContent>
  </Card>;
}
