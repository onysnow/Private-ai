'use client';
// The right panel of Timeline › Lanes (mockup TIME_1): the event in words, its one mark and how exact its date is,
// where it comes from, the sequence check if it fails one, the actions (Open the source, Make a lead, Add to my
// timeline, Trace), a reporter's grade, and the events before and after it in its lane.
import {useMutation, useQueryClient} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {timelineLanesViewQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {gradeTimelineEventEndpoint} from '../../lib/generated/sdk.gen';
import type {TimelineLaneEventOut, TimelineLanesOut, TimelineSequenceOut} from '../../lib/generated/types.gen';
import {dateWords} from '../../lib/dates';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {Reveal} from '../../components/ui/reveal';
import {EVENT_GRADES, span} from './lanes-model';
import {FactMark, KeysMark, KindDot} from './marks';

type Grade = 'confirmed' | 'likely' | 'weak' | 'unsubstantiated' | 'unknown';

/** How exact the date is, as the chip says it. */
export function exactness(e: Pick<TimelineLaneEventOut, 'date_start' | 'date_end' | 'precision'>): string {
  if (e.date_end || e.precision === 'range') return 'a range';
  if (e.precision === 'estimated') return 'about · worked out';
  if (e.precision === 'before' || e.precision === 'after') return `${e.precision} a date`;
  if (e.precision === 'year' || e.date_start.length === 4) return 'year only · never a day';
  if (e.precision === 'month' || e.date_start.length === 7) return 'month only · never a day';
  return 'to the day';
}

/** When, in words that never claim more than the date holds. */
export function whenWords(e: Pick<TimelineLaneEventOut, 'date_start' | 'date_end' | 'precision'>): string {
  if (e.date_end) return `between ${dateWords(e.date_start, e.precision)} and ${dateWords(e.date_end, e.precision)}`;
  const words = dateWords(e.date_start, e.precision);
  return e.date_start.length < 10 || e.precision === 'month' || e.precision === 'year' ? `sometime in ${words}` : words;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

type Props = {
  view: TimelineLanesOut; event: TimelineLaneEventOut | null; lane: string | null; finding?: TimelineSequenceOut;
  opened: boolean; investigationId: string;
  onSelect: (id: string) => void; onStep: (d: 1 | -1) => void;
  onLead: (title: string, detail: string) => void; onMine: (e: TimelineLaneEventOut) => void;
};

export function LaneDetail({view, event: e, lane, finding, opened, investigationId, onSelect, onStep, onLead, onMine}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openProvenance = useWorkbenchStore(s => s.openProvenance);
  const regrade = useMutation({
    mutationFn: async ({id, value}: {id: string; value: string}) => (await gradeTimelineEventEndpoint({
      path: {timeline_event_id: id}, body: {grade: value === 'none' ? null : value as Grade}, throwOnError: true})).data,
    onSuccess: () => queryClient.invalidateQueries({queryKey: timelineLanesViewQueryKey({path: {investigation_id: investigationId}})}),
  });
  if (!e) return <aside className="tl2-side" aria-label="Event"><p className="tl2-cap">Event</p>
    <p className="tl2-none">Click a mark to see it here.</p></aside>;

  const party = lane && e.parties.includes(lane) ? lane : e.parties[0];
  const partyName = view.parties.find(p => p.id === party)?.caption;
  const inLane = party ? view.events.filter(v => v.parties.includes(party) && v.date_start).sort((a, b) => span(a)[0] - span(b)[0]) : [];
  const at = inLane.findIndex(v => v.id === e.id);
  const before = at > 0 ? inLane[at - 1] : undefined;
  const after = at >= 0 && at < inLane.length - 1 ? inLane[at + 1] : undefined;
  const sourceId = text(e.refs.source_id) ?? (e.source_key.startsWith('source:') ? e.source_key.slice(7) : undefined);
  const sourceUrl = text(e.provenance.source_url);
  const trace = () => openProvenance({title: e.title, kind: 'timeline', sourceId, sourceUrl, locator: text(e.provenance.locator), detail: e.description || e.date_start});
  const nearest = finding?.after_id ? view.events.find(v => v.id === finding.after_id) : undefined;

  return <aside className="tl2-side" aria-label="Event">
    <p className="tl2-cap">Event <KeysMark><kbd>J</kbd> / <kbd>K</kbd> next event{opened ? <span className="rv-row">Opened here because it is the next event nobody has resolved.</span> : null}</KeysMark></p>
    {/* The mark and the kind are the event's colour and glyph; their words, and why it is shown or not, on reveal. */}
    <h3>{e.title}</h3>
    <div className="tl2-chips">
      <FactMark fact={e.fact} note={e.fact_note} big/><KindDot kind={e.kind}/>
      <Reveal detail={exactness(e)}><span className="tl2-chip dash">{whenWords(e)}</span></Reveal>
      {e.placeholder && <Reveal detail="I believe it, no evidence yet: drawn dashed until a record is attached."><span className="tl2-chip dash">placeholder</span></Reveal>}
    </div>
    <dl className="tl2-dl">
      <dt>From</dt><dd>{e.source_key.startsWith('dataset:')
        ? <Reveal detail={<>Imported dataset, no document named<span className="rv-row">{e.source_label}</span></>}><span>An imported dataset</span></Reveal>
        : e.source_label}</dd>
      {e.amount != null && <><dt>Amount</dt><dd>{e.amount.toLocaleString('en-GB')} {e.currency ?? ''}</dd></>}
    </dl>
    {finding && <div className="tl2-seqbox">
      <i aria-hidden>↯</i>
      <p>Comes before any recorded {finding.missing}{nearest ? <> ({nearest.title}, {dateWords(nearest.date_start, nearest.precision)} → <b>?</b> → this)</> : null}.</p>
    </div>}
    {e.description && <p className="tl2-desc">{e.description}</p>}
    {e.context?.claim_advisory?.needs_review && <p className="tl2-warn">Its claim needs review; this event is kept.</p>}
    {e.context?.relationship_advisory?.needs_review && <p className="tl2-warn">The link&apos;s support needs review.</p>}
    <div className="tl2-acts">
      {(sourceId || sourceUrl) && <button className="pri" onClick={trace}>Open the source</button>}
      <button onClick={() => onLead(e.title, `${whenWords(e)} · ${e.source_label}. ${e.fact_note ?? ''}`.trim())}>Make a lead</button>
      {e.kind !== 'reporter_event' && <button onClick={() => onMine(e)}>Add to my timeline</button>}
      {!(sourceId || sourceUrl) && <button onClick={trace}>Trace</button>}
    </div>
    {e.kind === 'reporter_event' && <label className="tl2-grade">Grade (Bellingcat)
      <select value={e.grade ?? 'none'} onChange={ev => regrade.mutate({id: e.id, value: ev.target.value})}>
        <option value="none">Not graded</option>
        {Object.entries(EVENT_GRADES).map(([k, words]) => <option key={k} value={k} title={words}>{k}</option>)}
      </select></label>}
    {e.kind === 'reporter_event' && e.grade && EVENT_GRADES[e.grade] && <p className="tl2-none"><Reveal label="What the grade means" detail={<><b>{e.grade}</b><span className="rv-row">{EVENT_GRADES[e.grade]}</span></>}>
      <span className="tl2-q" aria-hidden="true">ⓘ</span></Reveal></p>}
    {party && <>
      <p className="tl2-cap"><Reveal detail={`In ${partyName ?? 'this'}’s lane`}><span>Before and after</span></Reveal></p>
      <ul className="tl2-around">
        <li><button aria-label="Before" onClick={() => (before ? onSelect(before.id) : onStep(-1))}>←</button>
          <span>{before ? dateWords(before.date_start, 'year') : '–'}</span><span>{before ? before.title : 'nothing recorded'}</span></li>
        <li><button aria-label="After" onClick={() => (after ? onSelect(after.id) : onStep(1))}>→</button>
          <span>{after ? dateWords(after.date_start, 'year') : '–'}</span><span>{after ? after.title : 'nothing recorded'}</span></li>
      </ul>
    </>}
  </aside>;
}
