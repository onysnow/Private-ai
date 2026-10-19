'use client';
// The places' timeline: a strip under the map with one row per place and
// each dated event at that place on a shared time axis (a dot for a day, a
// bar from start to end, drawn hollow when a date is known only to the
// month or year). Two dates, "From" and "To", pick a stretch of time: the
// map and the list keep only the places with an event in it, and the strip
// shades it and greys the events outside it. Picking a place on the map, in
// the list or on the strip picks out its row here and its dot on the map.
// One filter drives both views, after Bellingcat's map of civilian harm in
// Ukraine and Forensic Architecture's TimeMap (design doc, "Timelines and
// maps"). The dates are native date fields, so the stretch of time can be
// set from the keyboard (WCAG 2.1.1). The events come from the
// investigation's timeline (backend app/services/places.py).
import type {EChartsOption} from 'echarts';
import {useMemo} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Chart} from '../../components/charts/chart';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import type {PlaceEventOut, PlaceOut} from '../../lib/generated/types.gen';
import {DAY_MS, dayText, eventWindow, eventsExtent, isoDay} from '../../lib/place-times';
import type {TimeWindow} from '../../lib/place-times';

const ROW_PX = 28;
const AXIS_PX = 44;   // the time axis under the rows
const PICKED_COLOUR = '#8A2F1E';
const DIM_COLOUR = '#9C8E78';
const WINDOW_SHADE = 'rgba(138, 47, 30, 0.22)';
const STATUS_WORDS: Record<string, string> = {verified: 'verified', asserted: 'asserted', disputed: 'disputed', system_recorded: 'recorded'};

type Mark = {value: [number, number, number, number]; name: string; event: PlaceEventOut; placeId: string};

/** The strip's ECharts option: a row per place with events and its events
 * as marks; the stretch of time picked shaded, the events outside it grey,
 * and, when a place is picked, the other places' events grey. */
export function stripOption(places: PlaceOut[], picked: string | null, span: TimeWindow | null = null): EChartsOption {
  const extent = eventsExtent(places);
  const rows = places.filter(place => (place.events ?? []).length);
  // A category axis runs upward: the first place goes last so it reads at the top.
  const names = rows.map(place => place.caption).reverse();
  const marks: Mark[] = rows.flatMap((place, index) => (place.events ?? []).map(event => {
    const {from, to} = eventWindow(event);
    return {value: [rows.length - 1 - index, from, to, event.exact ? 1 : 0], name: event.title, event, placeId: place.entity_id};
  }));
  const inSpan = (mark: Mark): boolean => !span || (mark.value[1] < span.to && mark.value[2] > span.from);
  const colour = (mark: Mark): string => ((!picked || picked === mark.placeId) && inSpan(mark) ? PICKED_COLOUR : DIM_COLOUR);
  return {
    animation: false,
    useUTC: true,
    grid: {left: 8, right: 16, top: 8, bottom: 8, containLabel: true},
    // Rich text, not HTML: the titles come from the records, so they are never read as markup.
    tooltip: {trigger: 'item', renderMode: 'richText', formatter: (params: unknown) => {
      const mark = (params as {data: Mark}).data;
      const {from, to} = eventWindow(mark.event);
      const when = to - from > DAY_MS ? `${dayText(from)} – ${dayText(to - DAY_MS)}` : dayText(from);
      return `${mark.event.title}\n${when}${mark.event.exact ? '' : ' (not known to the day)'} · ${STATUS_WORDS[mark.event.verification_status] ?? mark.event.verification_status}`;
    }},
    // The axis ends with the last day an event covers.
    xAxis: {type: 'time', axisLabel: {hideOverlap: true}, ...(extent ? {min: extent.from, max: extent.to - 1} : {})},
    yAxis: {type: 'category', data: names, axisTick: {show: false},
      axisLabel: {formatter: (name: string) => (name.length > 28 ? `${name.slice(0, 27)}…` : name)}},
    series: [{
      type: 'custom',
      encode: {x: [1, 2], y: 0},
      data: marks,
      ...(span ? {markArea: {silent: true, itemStyle: {color: WINDOW_SHADE}, data: [[{xAxis: span.from}, {xAxis: span.to - 1}]]}} : {}),
      renderItem: (params, api) => {
        const row = api.value(0) as number;
        const start = api.coord([api.value(1), row]);
        const end = api.coord([api.value(2), row]);
        const exact = api.value(3) === 1;
        const fill = colour(marks[params.dataIndex]);
        const style = {fill: exact ? fill : '#FFFFFF', stroke: fill, lineWidth: 2};
        // A day is a dot; a longer stretch a bar; hollow when a date is known only to the month or year.
        if (end[0] - start[0] < 10) return {type: 'circle', shape: {cx: (start[0] + end[0]) / 2, cy: start[1], r: 5}, style};
        return {type: 'rect', shape: {x: start[0], y: start[1] - 5, width: end[0] - start[0], height: 10, r: 3}, style};
      },
    }],
  };
}

/** The stretch of time two date fields give, or null when they cover every event. */
export function fieldWindow(from: string, to: string, extent: TimeWindow): TimeWindow | null {
  const start = from ? Date.parse(`${from}T00:00:00Z`) : extent.from;
  const end = to ? Date.parse(`${to}T00:00:00Z`) + DAY_MS : extent.to;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return start <= extent.from && end >= extent.to ? null : {from: start, to: end};
}

type Props = {
  places: PlaceOut[];
  picked: string | null;
  timeWindow: TimeWindow | null;
  onWindow: (window: TimeWindow | null) => void;
  onPick: (placeId: string) => void;
};

export function PlacesTimeline({places, picked, timeWindow, onWindow, onPick}: Props): ReactElement {
  const extent = useMemo(() => eventsExtent(places), [places]);
  const option = useMemo(() => stripOption(places, picked, timeWindow), [places, picked, timeWindow]);
  const onEvents = useMemo(() => ({
    click: (params: unknown) => { const mark = (params as {data?: Mark}).data; if (mark) onPick(mark.placeId); },
  }), [onPick]);
  const dated = places.filter(place => (place.events ?? []).length).length;

  if (!extent) {
    return <p className="muted text-sm" data-testid="places-timeline-empty">No event on the timeline is dated at these places, so there is no
      stretch of time to pick. An event about a place, or about a link to it (an ownership that started on a date), shows here.</p>;
  }
  const first = isoDay(extent.from), last = isoDay(extent.to - DAY_MS);
  const shownFrom = timeWindow ? isoDay(timeWindow.from) : '';
  const shownTo = timeWindow ? isoDay(timeWindow.to - DAY_MS) : '';
  const change = (which: 'from' | 'to') => (event: ChangeEvent<HTMLInputElement>) => {
    const from = which === 'from' ? event.target.value : shownFrom;
    const to = which === 'to' ? event.target.value : shownTo;
    onWindow(fieldWindow(from, to, extent));
  };
  return <div data-testid="places-timeline">
    <Chart option={option} height={AXIS_PX + dated * ROW_PX} onEvents={onEvents}
      ariaLabel={`Timeline of ${dated} place${dated === 1 ? '' : 's'} with dated events, from ${dayText(extent.from)} to ${dayText(extent.to - DAY_MS)}`}/>
    <div className="searchrow" role="group" aria-label="Show the places with an event between two dates">
      <label className="text-sm">From <Input type="date" className="w-auto" value={shownFrom} min={first} max={last} onChange={change('from')}/></label>
      <label className="text-sm">To <Input type="date" className="w-auto" value={shownTo} min={first} max={last} onChange={change('to')}/></label>
      {timeWindow && <Button variant="link" size="sm" onClick={() => onWindow(null)}>All dates</Button>}
    </div>
    <p className="muted text-sm" aria-live="polite">
      {timeWindow ? `Showing the places with an event between ${dayText(timeWindow.from)} and ${dayText(timeWindow.to - DAY_MS)}.`
        : 'All places. Set a From or a To date to show only the places with an event in that stretch of time.'}
    </p>
  </div>;
}
