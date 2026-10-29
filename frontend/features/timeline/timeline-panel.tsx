'use client';
// Investigation timeline (mockup TIME_1; research §2.9): "What happened when, and how sure are we?" The working view is
// Lanes (features/timeline/lanes.tsx); the event list is its List view (L), and adding an event is N. Each event has
// one mark for whether it is shown; how exact its date is is the band.
import type {ReactElement} from 'react';

import {useQuery} from '@tanstack/react-query';
import {timelineLanesViewOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {TimelineLanes} from './lanes';

export {EVENT_GRADES} from './lanes-model';

type Props = {investigationId: string};

export function TimelinePanel({investigationId}: Props): ReactElement {
  // The same query Lanes reads: the count and why it opened where it did, said once at the top.
  const lanes = useQuery({...timelineLanesViewOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const n = lanes.data?.events.length ?? 0;
  return <section className="tl2-panel" aria-labelledby="tl2-title">
    <header className="tl2-head">
      <h2 id="tl2-title">What happened when, and how sure are we?</h2>
      <p>One lane per party. Each mark says whether the event is shown; its band says how exact the date is.</p>
      {lanes.data && <p className="tl2-status">{n} {n === 1 ? 'event' : 'events'}{lanes.data.opens_on ? ' · opened on the next unresolved' : ''}
        {lanes.data.span.busiest ? ` · ${lanes.data.span.first}–${lanes.data.span.last} · busiest ${lanes.data.span.busiest}` : ''}</p>}
    </header>
    <TimelineLanes investigationId={investigationId}/>
  </section>;
}
