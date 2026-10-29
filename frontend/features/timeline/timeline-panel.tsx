'use client';
// Investigation timeline (mockups TIME_1–TIME_8; research §2.9): "What happened when, and how sure are we?" One event
// store, several views switched from the top edge. Lanes is the working view and opens every case (DECISIONS_LOG 6);
// the event list is its List view (L), and adding an event is N. Each event has one mark for whether it is shown; how
// exact its date is is the band.
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {timelineLanesViewOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {TimelineLanes} from './lanes';
import {TimelinePeriods, inPeriod} from './periods';
import {TimelineReplay} from './replay';
import {span} from './lanes-model';
import {useWorkbenchStore} from '../../lib/workbench-store';

export {EVENT_GRADES} from './lanes-model';

type Props = {investigationId: string};
type View = 'lanes' | 'replay' | 'periods';
const VIEWS: Array<[View, string]> = [['lanes', 'Lanes'], ['replay', 'Replay'], ['periods', 'Periods']];

export function TimelinePanel({investigationId}: Props): ReactElement {
  // The same query each view reads: the count and why it opened where it did, said once at the top.
  const lanes = useQuery({...timelineLanesViewOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const [view, setView] = useState<View>('lanes');
  // An event picked in another view, shown in Lanes (with a serial so picking the same one again still moves there).
  const [focus, setFocus] = useState<{id: string; serial: number} | null>(null);
  const show = (id: string) => { setFocus(f => ({id, serial: (f?.serial ?? 0) + 1})); setView('lanes'); };
  const setAsOf = useWorkbenchStore(st => st.setAsOf);
  const n = lanes.data?.events.length ?? 0;
  const LEDE: Record<View, string> = {
    lanes: 'One lane per party. Each mark says whether the event is shown; its band says how exact the date is.',
    replay: 'Replay walks the story in the order things happened. At each step you see only what was on the record by then.',
    periods: 'Each period you named, with your summary of it and its evidence.',
  };
  return <section className="tl2-panel" aria-labelledby="tl2-title">
    <header className="tl2-head">
      <h2 id="tl2-title">What happened when, and how sure are we?</h2>
      <p>{LEDE[view]}</p>
      <div className="tl2-views" role="tablist" aria-label="Timeline views">
        {VIEWS.map(([k, w]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{w}</button>)}
      </div>
      {lanes.data && <p className="tl2-status">{n} {n === 1 ? 'event' : 'events'}{lanes.data.opens_on && view === 'lanes' ? ' · opened on the next unresolved' : ''}
        {lanes.data.span.busiest ? ` · ${lanes.data.span.first}–${lanes.data.span.last} · busiest ${lanes.data.span.busiest}` : ''}</p>}
    </header>
    {view === 'lanes' && <TimelineLanes investigationId={investigationId} picked={focus}/>}
    {view === 'replay' && lanes.data && <TimelineReplay view={lanes.data}
      onShowInLanes={(id, step) => { setAsOf(new Date(span({date_start: step.date_start, date_end: step.date_end})[1]).getUTCFullYear()); show(id); }}/>}
    {view === 'periods' && lanes.data && <TimelinePeriods view={lanes.data} investigationId={investigationId} onSelect={show}
      onOpenLanes={p => { const first = inPeriod(lanes.data!.events, p)[0]; if (first) show(first.id); else setView('lanes'); }}/>}
  </section>;
}
