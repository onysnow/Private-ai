'use client';
// The investigation's timeline drawn with ECharts (a custom series): left to
// right by date, one row per kind of event (the rows are named in words --
// "Events you recorded", "Dates in records" -- not by their internal names).
//
// What the marks say (lib/viz-tokens.ts EVENT_KIND, EVENT_STATUS):
//   row and colour   the kind of event (position first, colour again, so
//                    the row is found either way)
//   mark's fill      how sure its date is: filled when verified, half-filled
//                    when asserted, an empty ring when unresolved, a dashed
//                    ring when approximate, filled with a red "!" when
//                    disputed (hue is kept for the kind; MacEachren et al.
//                    2012 found fill value and pattern read as certainty)
//   a soft band      a date known only to the month or the year covers that
//                    whole month or year -- where the event could be -- with
//                    the mark at its middle (location uncertainty drawn as
//                    a blurred extent, the variable MacEachren et al. rated
//                    most intuitive)
//   a bar            an event that runs from one date to another
// Each mark is named beside it where there is room (ECharts hides a name
// that would overlap another); every name is in the tooltip and the list
// under the chart. The bar under the axis and the mouse wheel pick a stretch
// of time. Events whose date cannot be read are left out and counted.
import * as React from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {CustomSeriesRenderItem, EChartsOption} from 'echarts';

import {Chart} from './chart';
import {dateWords} from '@/lib/dates';
import {EVENT_KIND_ORDER, SWATCH, eventKind, eventStatus} from '@/lib/viz-tokens';

export {dateWords};

export type CaseTimelineEvent = {
  id: string;
  kind: string;
  title: string;
  date_start: string;
  date_end?: string | null;
  verification_status: string;
  precision?: string;
  grade?: string | null;
};

export type CaseTimelineProps = {
  events: CaseTimelineEvent[];
  height?: number | string;
  className?: string;
};

/** Where an event sits in time: its start, its end, and whether that end
 * is the end of a month or year the date is known only to. */
export function eventSpan(event: Pick<CaseTimelineEvent, 'date_start' | 'date_end' | 'precision'>): {start: number; end: number; fuzzy: boolean} | null {
  const start = Date.parse(event.date_start);
  if (Number.isNaN(start)) return null;
  const end = event.date_end ? Date.parse(event.date_end) : NaN;
  if (Number.isFinite(end) && end > start) return {start, end, fuzzy: false};
  const at = new Date(start);
  if (event.precision === 'month') return {start, end: Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1), fuzzy: true};
  if (event.precision === 'year') return {start, end: Date.UTC(at.getUTCFullYear() + 1, 0, 1), fuzzy: true};
  return {start, end: start, fuzzy: false};
}

type Datum = {value: [number, number, number, number]; event: CaseTimelineEvent; fuzzy: boolean};

const MARK_R = 6;

function renderItemFor(data: Datum[]): CustomSeriesRenderItem {
  return (params, api) => {
    const datum = data[params.dataIndex as number];
    const {event, fuzzy} = datum;
    const kind = eventKind(event.kind), status = eventStatus(event.verification_status);
    const [start, lane, end] = [api.value(0) as number, api.value(1) as number, api.value(2) as number];
    const from = api.coord([start, lane]), to = api.coord([end, lane]);
    const spans = end > start;
    const centre = spans ? (fuzzy ? [(from[0] + to[0]) / 2, from[1]] : from) : from;
    // The name goes on whichever side of the mark has more room in the plot,
    // cut to fit that room (about 6.5 px a character at 11.5 px).
    const plot = (params as unknown as {coordSys?: {x: number; width: number}}).coordSys ?? {x: 0, width: Infinity};
    const roomRight = plot.x + plot.width - centre[0] - (spans && !fuzzy ? Math.max(0, to[0] - from[0]) : 0) - 14;
    const roomLeft = centre[0] - plot.x - 14;
    const nearRight = roomLeft > roomRight;
    const fits = Math.max(4, Math.floor((nearRight ? roomLeft : roomRight) / 6.5));
    const name = event.title.length > Math.min(34, fits) ? `${event.title.slice(0, Math.min(34, fits) - 1).trimEnd()}…` : event.title;
    const children: Record<string, unknown>[] = [];
    if (spans) {
      children.push(fuzzy
        ? {type: 'rect', shape: {x: from[0], y: from[1] - 9, width: Math.max(2, to[0] - from[0]), height: 18, r: 9},
          style: {fill: kind.colour, opacity: 0.22}}
        : {type: 'rect', shape: {x: from[0], y: from[1] - 4, width: Math.max(2, to[0] - from[0]), height: 8, r: 4},
          style: {fill: kind.colour, opacity: 0.85}});
    }
    children.push({
      type: 'circle', shape: {cx: centre[0], cy: centre[1], r: MARK_R},
      style: {
        fill: status.fill === 'solid' ? kind.colour : status.fill === 'half' ? `${kind.colour}73` : SWATCH.card,
        stroke: kind.colour, lineWidth: 2, lineDash: status.dashed ? [3, 2] : undefined,
      },
      // The event's name to the right of its mark (past the end of a bar),
      // hidden by the series' label layout where it would overlap another.
      textContent: {style: {text: name, fill: SWATCH.parchment, fontSize: 11.5,
        textBorderColor: '#1c262b', textBorderWidth: 3}},
      textConfig: nearRight ? {position: 'left', distance: 8} : {position: 'right', distance: 8 + (spans && !fuzzy ? Math.max(0, to[0] - from[0]) : 0)},
    });
    if (status.contested) {
      children.push({type: 'circle', shape: {cx: centre[0] + 7, cy: centre[1] - 7, r: 5}, style: {fill: SWATCH.brick, stroke: SWATCH.card, lineWidth: 1}});
      children.push({type: 'text', x: centre[0] + 7, y: centre[1] - 7, style: {text: '!', fill: SWATCH.ink, fontSize: 8, fontWeight: 700, align: 'center', verticalAlign: 'middle'}});
    }
    return {
      type: 'group', children,
    } as unknown as ReturnType<CustomSeriesRenderItem>;
  };
}

/** The width of the box the chart is drawn in, as it changes. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    setWidth(box.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Below this width the row names move inside the plot, above each row, so the dates keep the width. */
const NARROW_PX = 560;

export function CaseTimeline({events, height = 420, className}: CaseTimelineProps): React.ReactElement {
  const [box, width] = useWidth();
  const narrow = width > 0 && width < NARROW_PX;
  const {option, excludedCount, laneCount, shown} = useMemo(() => {
    const present = Array.from(new Set(events.map(e => e.kind)));
    const lanes = [...EVENT_KIND_ORDER.filter(k => present.includes(k)), ...present.filter(k => !EVENT_KIND_ORDER.includes(k)).sort()];
    const laneIndexOf = new Map(lanes.map((kind, index) => [kind, index]));
    const data: Datum[] = [];
    let excluded = 0;
    for (const event of events) {
      const span = eventSpan(event);
      if (!span) { excluded += 1; continue; }
      data.push({value: [span.start, laneIndexOf.get(event.kind) ?? 0, span.end, data.length], event, fuzzy: span.fuzzy});
    }
    const times = data.flatMap(d => [d.value[0], d.value[2]]);
    const pad = Math.max(30 * 86_400_000, (Math.max(...times) - Math.min(...times)) * 0.06);
    const chartOption: EChartsOption = {
      tooltip: {
        trigger: 'item', backgroundColor: SWATCH.card, borderColor: '#4e4234', textStyle: {color: SWATCH.parchment, fontSize: 12},
        formatter: (params: unknown) => {
          const datum = data[(params as {dataIndex: number}).dataIndex];
          if (!datum) return '';
          const e = datum.event;
          const when = e.date_end && Date.parse(e.date_end) > Date.parse(e.date_start)
            ? `${dateWords(e.date_start, e.precision)} to ${dateWords(e.date_end, e.precision)}` : dateWords(e.date_start, e.precision);
          const escape = (s: string) => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c] as string);
          return `<b>${escape(e.title)}</b><br/>${escape(when)}${datum.fuzzy ? ' (known only to the ' + (e.precision ?? '') + ')' : ''}<br/>`
            + `${escape(eventKind(e.kind).name)} · ${escape(eventStatus(e.verification_status).name)}${e.grade ? ` · graded ${escape(e.grade)}` : ''}`;
        },
      },
      grid: {left: narrow ? 8 : 172, right: narrow ? 12 : 40, top: 16, bottom: 64},
      xAxis: {
        type: 'time', min: Math.min(...times) - pad, max: Math.max(...times) + pad,
        axisLine: {lineStyle: {color: '#4e4234'}}, axisLabel: {color: SWATCH.tan, fontSize: 11, hideOverlap: true},
        splitLine: {show: true, lineStyle: {color: '#2a353b'}},
      },
      yAxis: {
        type: 'category', data: lanes.map(k => eventKind(k).name), inverse: true,
        axisLine: {show: false}, axisTick: {show: false},
        axisLabel: narrow
          ? {inside: true, verticalAlign: 'bottom', lineHeight: 36, color: SWATCH.parchment, fontSize: 11, fontWeight: 600}
          : {color: SWATCH.parchment, fontSize: 12, fontWeight: 600, width: 160, overflow: 'truncate'},
        splitArea: {show: true, areaStyle: {color: ['#1f292e', '#1c262b']}},
      },
      dataZoom: [
        {type: 'slider', xAxisIndex: 0, height: 22, bottom: 14, borderColor: '#4e4234', backgroundColor: '#1a2328',
          fillerColor: 'rgba(212,161,82,0.18)', handleStyle: {color: SWATCH.amber, borderColor: SWATCH.amber},
          moveHandleStyle: {color: '#4e4234'}, textStyle: {color: SWATCH.tan, fontSize: 10},
          dataBackground: {lineStyle: {color: '#4e4234'}, areaStyle: {color: '#2a353b'}}, labelFormatter: (value: number) => dateWords(new Date(value).toISOString(), 'month')},
        {type: 'inside', xAxisIndex: 0},
      ],
      series: [{
        type: 'custom', renderItem: renderItemFor(data), encode: {x: [0, 2], y: 1},
        data: data.map(d => d.value), labelLayout: {hideOverlap: true}, clip: true,
      }],
    };
    return {option: chartOption, excludedCount: excluded, laneCount: lanes.length, shown: data.length};
  }, [events, narrow]);

  if (events.length === 0) return <p className="text-sm text-muted-foreground">No timeline events to chart.</p>;

  return <div className={className} ref={box}>
    {excludedCount > 0 && <p className="mb-2 text-xs" style={{color: SWATCH.tan}}>
      {excludedCount} event{excludedCount === 1 ? '' : 's'} left out: the date could not be read.</p>}
    <Chart option={option} height={height} ariaLabel={`Timeline of ${shown} event${shown === 1 ? '' : 's'} in ${laneCount} row${laneCount === 1 ? '' : 's'}; the list under it holds every event in words`}/>
  </div>;
}
