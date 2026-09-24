'use client';

// STRUCT-0040 / issue #40: general-purpose reusable ECharts wrapper.
//
// Uses echarts-for-react's `lib/core` entry point together with the
// tree-shaken echarts module from lib/echarts-setup.ts, so this component
// (and anything built on it) never pulls in the full echarts bundle -- see
// that file's docstring for the selective-import rationale.
//
// Infra only; not wired into any existing page (issue #40's own scope note).
// See components/charts/financial-flow-sankey.tsx and
// components/charts/case-timeline.tsx for concrete uses.

import * as React from 'react';
import type {CSSProperties} from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type {ECharts, EChartsOption} from 'echarts';

import {echarts, WORKBENCH_THEME_NAME} from '@/lib/echarts-setup';
import {cn} from '@/lib/utils';

export type ChartProps = {
  option: EChartsOption;
  height?: number | string;
  ariaLabel: string;
  onChartReady?: (instance: ECharts) => void;
  onEvents?: Record<string, (params: unknown) => void>;
  className?: string;
  notMerge?: boolean;
};

/**
 * Thin, reusable ECharts wrapper. `ariaLabel` is required (not optional)
 * because a canvas-rendered chart has no text content for assistive tech to
 * read otherwise -- callers should describe what the chart shows, not just
 * name its type.
 */
export function Chart({
  option,
  height = 360,
  ariaLabel,
  onChartReady,
  onEvents,
  className,
  notMerge = true,
}: ChartProps): React.ReactElement {
  const style: CSSProperties = {height, width: '100%'};

  return (
    <div role="img" aria-label={ariaLabel} className={cn('w-full', className)}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        theme={WORKBENCH_THEME_NAME}
        notMerge={notMerge}
        lazyUpdate
        style={style}
        opts={{renderer: 'canvas'}}
        onChartReady={onChartReady}
        onEvents={onEvents}
      />
    </div>
  );
}
