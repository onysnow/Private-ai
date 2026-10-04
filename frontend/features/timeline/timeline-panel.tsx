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
import {ChartFrame, FootStat, KeyRow, KeySection} from '../../components/charts/chart-frame';
import {EVENT_KIND_ORDER, EVENT_STATUS, SWATCH, eventKind, eventStatus} from '../../lib/viz-tokens';
import {dateWords} from '../../lib/dates';

// ECharts needs a browser canvas, so the chart is loaded on demand and never
// counts against the page's first load.
const CaseTimeline = dynamic(() => import('../../components/charts/case-timeline').then(m => m.CaseTimeline),
  {ssr: false, loading: () => <p className="muted p-4">Loading the timeline…</p>});

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

  const kindsShown = [...EVENT_KIND_ORDER.filter(k => events.some(e => e.kind === k)), ...Array.from(new Set(events.map(e => e.kind))).filter(k => !EVENT_KIND_ORDER.includes(k))];
  const statusesShown = Object.keys(EVENT_STATUS).filter(st => events.some(e => e.verification_status === st));
  const fuzzyShown = events.some(e => !e.date_end && (e.precision === 'month' || e.precision === 'year'));
  const rangeShown = events.some(e => e.date_end && Date.parse(e.date_end) > Date.parse(e.date_start));

  const legend = <>
    <KeySection title="Rows" channel="row and colour: what kind of event">
      {kindsShown.map(k => <KeyRow key={k} swatch={<StatusMark colour={eventKind(k).colour} status="verified"/>}>{eventKind(k).name}</KeyRow>)}
    </KeySection>
    <KeySection title="How sure the date is" channel="the mark's fill and outline">
      {statusesShown.map(st => <KeyRow key={st} swatch={<StatusMark colour={SWATCH.sage} status={st}/>}>{eventStatus(st).name}</KeyRow>)}
    </KeySection>
    {(fuzzyShown || rangeShown) && <KeySection title="Spans">
      {fuzzyShown && <KeyRow swatch={<svg width="36" height="18"><rect x="1" y="1" width="34" height="16" rx="8" fill={SWATCH.sage} opacity=".22"/>
        <circle cx="18" cy="9" r="5" fill={SWATCH.sage}/></svg>}>Known only to the month or year: the band covers it</KeyRow>}
      {rangeShown && <KeyRow swatch={<svg width="36" height="12"><rect x="1" y="2" width="34" height="8" rx="4" fill={SWATCH.sage}/></svg>}>Runs from one date to another</KeyRow>}
    </KeySection>}
  </>;

  return <Card className="card">
    <CardHeader className="pb-3">
      <CardTitle>Timeline</CardTitle>
      <CardDescription>Dates from the records, the sources and your own events, kept apart by where they come from.</CardDescription>
    </CardHeader>
    <CardContent>
      {timeline.isError && <p className="muted">{errorMessage(timeline.error, 'Could not load the timeline')}</p>}
      {events.length > 0 && <ChartFrame kind="timeline" title="What happened when"
        rule={{label: 'Left to right by date:', text: 'one row per kind of event. A date known only to the month or year is a soft band over that month or year.'}}
        legend={legend}
        footer={<>
          {Object.entries(counts).map(([k, v]) => <FootStat key={k} value={v}>{eventStatus(k).name.toLowerCase()}</FootStat>)}
          <span>Drag the bar under the chart, or scroll over it, to look at a stretch of time.</span>
        </>}>
        <div style={{padding: '8px 8px 0'}}><CaseTimeline events={events} height={Math.max(220, 90 + kindsShown.length * 56)}/></div>
      </ChartFrame>}
      {events.length > 0 && <ol className="tl-list" aria-label="Events in date order">
        {events.map(e => <li key={e.id} className="tl-event" style={{borderLeftColor: eventKind(e.kind).colour}}>
          <div className="tl-when"><StatusMark colour={eventKind(e.kind).colour} status={e.verification_status}/>
            <span>{dateWords(e.date_start, e.precision)}{e.date_end ? ` to ${dateWords(e.date_end, e.precision)}` : ''}</span></div>
          <div className="tl-body">
            <b>{e.title}</b>
            <small>{eventKind(e.kind).name} · {eventStatus(e.verification_status).name}{e.precision && e.precision !== 'day' ? ` · known to the ${e.precision}` : ''}
              {e.grade ? <> · <span title={EVENT_GRADES[e.grade]}>graded {e.grade}</span></> : null}</small>
            {e.description && <p>{e.description}</p>}
            {text(e.provenance.origin) && <small>Origin: {text(e.provenance.origin)}</small>}
            {e.context?.claim && <small>Claim: {e.context.claim.status} · confidence {Math.round(e.context.claim.confidence * 100)}%</small>}
            {e.context?.claim_advisory?.needs_review && <small className="tl-warn">Linked claim needs review; this event is kept.</small>}
            {e.context?.relationship_advisory?.needs_review && <small className="tl-warn">The relationship&apos;s support needs review{e.context.relationship_advisory.has_independent_support ? '; independent support remains' : ''}.</small>}
            {e.context?.evidence && <small>Evidence{text(e.context.evidence.locator) ? ` · ${text(e.context.evidence.locator)}` : ''}: {text(e.context.evidence.quote) || 'linked evidence'}</small>}
            {e.context?.claim?.evidence_stances?.length ? <small>Evidence stance: {e.context.claim.evidence_stances.map(x => String(x.stance)).join(', ')}</small> : null}
          </div>
          <div className="tl-actions">
            {e.kind === 'reporter_event' && <Select value={e.grade ?? UNGRADED} onValueChange={value => regrade.mutate({id: e.id, value})}>
              <SelectTrigger className="w-auto" aria-label={`Grade of ${e.title}`}><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNGRADED}>Not graded</SelectItem>
                {Object.entries(EVENT_GRADES).map(([value, meaning]) => <SelectItem key={value} value={value}>{`${value}: ${meaning}`}</SelectItem>)}
              </SelectContent>
            </Select>}
            {text(e.provenance.source_url) && <a href={text(e.provenance.source_url)} target="_blank" rel="noreferrer">Open source</a>}
            <Button size="sm" variant="outline" onClick={() => openProvenance({
              title: e.title, kind: 'timeline', sourceId: text(e.refs.source_id), sourceUrl: text(e.provenance.source_url),
              locator: text(e.provenance.locator), detail: e.description || e.date_start,
            })}>Trace provenance</Button>
          </div>
        </li>)}
      </ol>}
      <details className="tl-add">
        <summary>Add an event</summary>
        <div className="searchrow">
          <Input value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="Event title"/>
          <Input value={date} onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} placeholder="YYYY-MM-DD, YYYY-MM, or YYYY"/>
          <Select value={precision} onValueChange={setPrecision}>
            <SelectTrigger className="w-auto" aria-label="Known to the"><SelectValue/></SelectTrigger>
            <SelectContent>{PRECISIONS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-auto" aria-label="How sure the date is"><SelectValue/></SelectTrigger>
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
        <p className="muted text-xs">A reporter&apos;s event can be graded on Bellingcat&apos;s scale (confirmed, likely, weak, unsubstantiated, unknown).
          The date&apos;s status says how sure the date is; the grade, how sure the event is.</p>
      </details>
      {problem && <p className="muted">{problem}</p>}
    </CardContent>
  </Card>;
}

/** An event's mark as the chart draws it: filled, half-filled, an empty or dashed ring, or filled with a red "!". */
export function StatusMark({colour, status}: {colour: string; status: string}): ReactElement {
  const look = eventStatus(status);
  return <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden style={{flex: '0 0 auto'}}>
    <circle cx="9" cy="10" r="6" fill={look.fill === 'solid' ? colour : look.fill === 'half' ? `${colour}73` : SWATCH.card} stroke={colour} strokeWidth="2"
      strokeDasharray={look.dashed ? '3 2' : undefined}/>
    {look.contested && <><circle cx="16" cy="4.5" r="4.5" fill={SWATCH.brick}/><text x="16" y="7" fontSize="7" fontWeight="700" textAnchor="middle" fill={SWATCH.ink}>!</text></>}
  </svg>;
}
