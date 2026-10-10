'use client';
// The investigation's one year slider (docs/discovery/README.md, "Overlays";
// what "as of" means: lib/as-of.ts). It sits at the top of the Map stage; the
// network, the money and the timeline all read the same year from the shared
// store. Its range runs from the first to the last year any link or event
// names.
import {useQuery} from '@tanstack/react-query';
import type {ChangeEvent, ReactElement} from 'react';

import {linkSpan, yearRange} from '../../lib/as-of';
import {getInvestigationGraphOptions, getInvestigationTimelineOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

export function YearSlider({investigationId}: {investigationId: string}): ReactElement | null {
  const asOf = useWorkbenchStore(state => state.asOf);
  const setAsOf = useWorkbenchStore(state => state.setAsOf);
  const path = {investigation_id: investigationId};
  const enabled = Boolean(investigationId);
  const graph = useQuery({...getInvestigationGraphOptions({path}), enabled}).data;
  const timeline = useQuery({...getInvestigationTimelineOptions({path}), enabled}).data;
  const dates = [
    ...(graph?.edges ?? []).flatMap(e => { const span = linkSpan(e.properties); return [span.start, span.end]; }),
    ...(timeline?.events ?? []).flatMap(e => [e.date_start, e.date_end]),
  ];
  const range = yearRange(dates);
  if (!range) return null;
  const year = asOf ?? range.to;
  return <div className="yr-slider" role="group" aria-label="Show the investigation as of a year">
    <span className="yr-label">As of</span>
    <b className="yr-value" aria-live="polite">{asOf === null ? 'all time' : asOf}</b>
    <span className="yr-end">{range.from}</span>
    <input type="range" min={range.from} max={range.to} step={1} value={year} aria-label="Year"
      aria-valuetext={asOf === null ? 'All time' : String(asOf)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setAsOf(Number(e.target.value))}/>
    <span className="yr-end">{range.to}</span>
    <button type="button" className="cf-tool" onClick={() => setAsOf(null)} disabled={asOf === null}>All time</button>
    <small>The network, the money and the timeline show what held by the end of that year. Undated records always show.</small>
  </div>;
}
