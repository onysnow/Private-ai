'use client';

// STRUCT-0040 / issue #40: Case Timeline chart.
//
// Renders TimelineEvent records (lib/api-types.ts's `TimelineEvent`, which
// already matches the TAS Timeline Reconstruction module's event shape --
// see backend/app/ai/tas_spec/PROMPT_MODULES/03_TIMELINE_RECONSTRUCTION.md)
// as a horizontal timeline, grouped into lanes by `kind`. An event with a
// `date_end` after `date_start` draws as a bar spanning the range; an event
// with no end (or an equal/earlier one) draws as a point. Color follows
// `verification_status`, reusing the direct/verified/disputed/unresolved
// color vocabulary already used by components/entity-graph.tsx and
// components/charts/financial-flow-sankey.tsx, extended with the exact
// TimelineEvent verification statuses
// (backend/app/services/timeline.py's TIMELINE_EVENT_VERIFICATION_STATUSES:
// asserted/verified/approximate/disputed/unresolved) plus a neutral fallback
// for the synthetic statuses that module also emits
// (reporter_reviewed/system_recorded), so an unrecognized status never
// crashes rendering.
//
// Events with an unparseable date_start are excluded and counted rather
// than silently dropped or crashing the chart.
//
// Infra only; not wired into any existing page (issue #40's own scope note).

import * as React from 'react';
import {useMemo} from 'react';
import type {CustomSeriesRenderItem, EChartsOption} from 'echarts';

import {Chart} from './chart';
import type {TimelineEvent} from '@/lib/api-types';

export type CaseTimelineProps = {
  events: TimelineEvent[];
  height?: number | string;
  className?: string;
};

type StatusStyle = {fill: string; stroke: string};

const STATUS_STYLE: Record<string, StatusStyle> = {
  asserted: {fill: 'hsl(228, 100%, 76%)', stroke: 'hsl(228, 100%, 76%)'},
  verified: {fill: '#3fbf7f', stroke: '#3fbf7f'},
  approximate: {fill: '#c9a227', stroke: '#c9a227'},
  disputed: {fill: 'hsl(0, 72%, 51%)', stroke: 'hsl(0, 72%, 51%)'},
  unresolved: {fill: 'hsl(223, 28%, 74%)', stroke: 'hsl(223, 28%, 74%)'},
};
const FALLBACK_STYLE: StatusStyle = STATUS_STYLE.unresolved;

function statusStyle(status: string): StatusStyle {
  return STATUS_STYLE[status] ?? FALLBACK_STYLE;
}

type TimelineDatum = {
  start: number;
  laneIndex: number;
  end: number;
  status: string;
  eventId: string;
  title: string;
};

const renderItem: CustomSeriesRenderItem = (_params, api) => {
  const start = api.value(0) as number;
  const laneIndex = api.value(1) as number;
  const end = api.value(2) as number;
  const status = api.value(3) as string;
  const style = statusStyle(status);
  const startPoint = api.coord([start, laneIndex]);
  const laneHeight = Math.max(4, (api.size ? (api.size([0, 1]) as number[])[1] : 20) * 0.45);

  if (Number.isFinite(end) && end > start) {
    const endPoint = api.coord([end, laneIndex]);
    return {
      type: 'rect',
      shape: {
        x: startPoint[0],
        y: startPoint[1] - laneHeight / 2,
        width: Math.max(2, endPoint[0] - startPoint[0]),
        height: laneHeight,
        r: 3,
      },
      style: {fill: style.fill, opacity: 0.75, stroke: style.stroke},
    };
  }

  return {
    type: 'circle',
    shape: {cx: startPoint[0], cy: startPoint[1], r: Math.max(3, laneHeight / 2)},
    style: {fill: style.fill, stroke: style.stroke},
  };
};

export function CaseTimeline({events, height = 420, className}: CaseTimelineProps): React.ReactElement {
  const {option, excludedCount, laneCount} = useMemo(() => {
    const lanes = Array.from(new Set(events.map((event) => event.kind))).sort();
    const laneIndexOf = new Map(lanes.map((kind, index) => [kind, index]));

    const data: (TimelineDatum & {value: [number, number, number, string]})[] = [];
    let excluded = 0;

    for (const event of events) {
      const start = Date.parse(event.date_start);
      if (Number.isNaN(start)) {
        excluded += 1;
        continue;
      }
      const end = event.date_end ? Date.parse(event.date_end) : NaN;
      const laneIndex = laneIndexOf.get(event.kind) ?? 0;
      data.push({
        start,
        laneIndex,
        end,
        status: event.verification_status,
        eventId: event.id,
        title: event.title,
        value: [start, laneIndex, end, event.verification_status],
      });
    }

    const chartOption: EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const {dataIndex} = params as {dataIndex: number};
          const datum = data[dataIndex];
          if (!datum) return '';
          const dateLabel = Number.isFinite(datum.end)
            ? `${new Date(datum.start).toLocaleDateString()} – ${new Date(datum.end).toLocaleDateString()}`
            : new Date(datum.start).toLocaleDateString();
          return `${datum.title}<br/>${dateLabel}<br/>${datum.status}`;
        },
      },
      grid: {left: 140, right: 24, top: 24, bottom: 48},
      xAxis: {type: 'time'},
      yAxis: {
        type: 'category',
        data: lanes,
        inverse: true,
      },
      dataZoom: [{type: 'slider', xAxisIndex: 0}, {type: 'inside', xAxisIndex: 0}],
      series: [
        {
          type: 'custom',
          renderItem,
          encode: {x: [0, 2], y: 1},
          data: data.map((datum) => datum.value),
        },
      ],
    };

    return {option: chartOption, excludedCount: excluded, laneCount: lanes.length};
  }, [events]);

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline events to chart.</p>;
  }

  return (
    <div className={className}>
      {excludedCount > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {excludedCount} event{excludedCount === 1 ? '' : 's'} excluded (unparseable date).
        </p>
      )}
      <Chart
        option={option}
        height={height}
        ariaLabel={`Timeline of ${events.length - excludedCount} events across ${laneCount} categories`}
      />
    </div>
  );
}
