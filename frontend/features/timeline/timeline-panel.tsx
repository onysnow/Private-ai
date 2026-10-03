'use client';
// Investigation timeline: dated FollowTheMoney statements and source
// metadata beside reporter-authored events, each marked with how sure the
// reporter is. Moved out of app/page.tsx (Foundation Fixes fix 3); the
// calls and their reply checks are generated from the API schema (fix 2).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {errorMessage} from '../../lib/api-client';
import {getInvestigationTimelineOptions, getInvestigationTimelineQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createTimelineEventEndpoint, gradeTimelineEventEndpoint} from '../../lib/generated/sdk.gen';
import type {TimelineEventOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

// ECharts needs a browser canvas, so the chart is loaded on demand and never
// counts against the page's first load.
const CaseTimeline = dynamic(() => import('../../components/charts/case-timeline').then(m => m.CaseTimeline),
  {ssr: false, loading: () => <p className="muted">Loading timeline chart…</p>});

type Props = {investigationId: string};

const PRECISIONS = ['day', 'month', 'year', 'range', 'unknown'];
const STATUSES = ['asserted', 'verified', 'approximate', 'disputed', 'unresolved'];
// How well an event is substantiated: Bellingcat's grading scale (ADR-0005,
// line 5; backend app/services/timeline.py EVENT_GRADES, which these words
// follow). The status above is about the date; the grade about the event.
export const EVENT_GRADES: Record<string, string> = {
  confirmed: 'enough evidence, from several verification techniques and at least three sources cross-referenced',
  likely: 'several sources report it and most of the information can be verified, with minor contradictions',
  weak: 'a single source says it happened',
  unsubstantiated: 'no conclusion can be reached for lack of evidence',
  unknown: 'what happened cannot be identified',
};
type Grade = 'confirmed' | 'likely' | 'weak' | 'unsubstantiated' | 'unknown';
const UNGRADED = 'none';

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function TimelinePanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [precision, setPrecision] = useState('day');
  const [status, setStatus] = useState('asserted');
  const [grade, setGrade] = useState(UNGRADED);
  const [problem, setProblem] = useState('');

  const path = {investigation_id: investigationId};
  const timeline = useQuery({...getInvestigationTimelineOptions({path}), enabled: Boolean(investigationId)});

  const add = useMutation({
    mutationFn: async () => (await createTimelineEventEndpoint({body: {
      investigation_id: investigationId, title: title.trim(), date_start: date.trim(), precision, verification_status: status,
      ...(grade !== UNGRADED ? {grade: grade as Grade} : {}),
    }, throwOnError: true})).data,
    onSuccess: async () => {
      setTitle(''); setDate(''); setGrade(UNGRADED); setProblem('');
      await queryClient.invalidateQueries({queryKey: getInvestigationTimelineQueryKey({path})});
    },
    onError: error => setProblem(errorMessage(error, 'Could not add the event')),
  });
  const regrade = useMutation({
    mutationFn: async ({id, value}: {id: string; value: string}) => (await gradeTimelineEventEndpoint({
      path: {timeline_event_id: id}, body: {grade: value === UNGRADED ? null : value as Grade}, throwOnError: true})).data,
    onSuccess: async () => {
      setProblem('');
      await queryClient.invalidateQueries({queryKey: getInvestigationTimelineQueryKey({path})});
    },
    onError: error => setProblem(errorMessage(error, 'Could not grade the event')),
  });

  const events: TimelineEventOut[] = timeline.data?.events ?? [];
  const counts = timeline.data?.verification_counts ?? {};

  return <Card className="card">
    <CardHeader className="pb-3">
      <CardTitle>Investigation timeline</CardTitle>
      <CardDescription>Dated FollowTheMoney statements and source metadata stay distinguishable from reporter-authored approximate, disputed, or verified events.
        A reporter&apos;s event can also be graded on Bellingcat&apos;s scale (confirmed, likely, weak, unsubstantiated, unknown).</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="searchrow">
        <Input value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="Event title"/>
        <Input value={date} onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} placeholder="YYYY-MM-DD, YYYY-MM, or YYYY"/>
        <Select value={precision} onValueChange={setPrecision}>
          <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
          <SelectContent>{PRECISIONS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
          <SelectContent>{STATUSES.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="w-auto" aria-label="Grade"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNGRADED}>Not graded</SelectItem>
            {Object.keys(EVENT_GRADES).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => add.mutate()} disabled={!investigationId || !title.trim() || !date.trim() || add.isPending}>Add event</Button>
      </div>
      {problem && <p className="muted">{problem}</p>}
      {timeline.isError && <p className="muted">{errorMessage(timeline.error, 'Could not load the timeline')}</p>}
      <p className="muted">{Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
      {events.length > 0 && <CaseTimeline events={events} height={320}/>}
      <div>
        {events.map(e => <div className="candidate" key={e.id}>
          <b>{e.date_start}{e.date_end ? ` → ${e.date_end}` : ''} · {e.title}</b> <small>{e.kind} · {e.verification_status} · {e.precision}
            {e.grade ? <> · <span title={EVENT_GRADES[e.grade]}>graded {e.grade}</span></> : null}</small>
          {e.kind === 'reporter_event' && <div className="searchrow">
            <Select value={e.grade ?? UNGRADED} onValueChange={value => regrade.mutate({id: e.id, value})}>
              <SelectTrigger className="w-auto" aria-label={`Grade of ${e.title}`}><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNGRADED}>Not graded</SelectItem>
                {Object.entries(EVENT_GRADES).map(([value, meaning]) => <SelectItem key={value} value={value}>{`${value}: ${meaning}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>}
          {e.description && <div>{e.description}</div>}
          {text(e.provenance.origin) && <small>Origin: {text(e.provenance.origin)}</small>}
          {e.context?.claim && <div><small>Claim: {e.context.claim.status} · confidence {Math.round(e.context.claim.confidence * 100)}%</small></div>}
          {e.context?.claim_advisory?.needs_review && <div><small>⚠ Linked claim requires review; this timeline event is preserved.</small></div>}
          {e.context?.relationship_advisory?.needs_review && <div><small>⚠ Relationship support requires review{e.context.relationship_advisory.has_independent_support ? ' · independent support remains' : ''}.</small></div>}
          {e.context?.evidence && <div><small>Evidence{text(e.context.evidence.locator) ? ` · ${text(e.context.evidence.locator)}` : ''}: {text(e.context.evidence.quote) || 'linked evidence'}</small></div>}
          {e.context?.claim?.evidence_stances?.length ? <div><small>Evidence stance: {e.context.claim.evidence_stances.map(x => String(x.stance)).join(', ')}</small></div> : null}
          {text(e.provenance.source_url) && <div><a href={text(e.provenance.source_url)} target="_blank" rel="noreferrer">Open source</a></div>}
          <Button onClick={() => openProvenance({
            title: e.title, kind: 'timeline', sourceId: text(e.refs.source_id), sourceUrl: text(e.provenance.source_url),
            locator: text(e.provenance.locator), detail: e.description || e.date_start,
          })}>Trace provenance</Button>
        </div>)}
      </div>
    </CardContent>
  </Card>;
}
