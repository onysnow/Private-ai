// @vitest-environment jsdom
// STRUCT-0040 / issue #40: coverage for CaseTimeline.
//
// components/charts/chart.tsx is mocked so these tests assert what this
// component owns: building timeline lanes/data from TimelineEvent records,
// excluding unparseable dates (and counting them), and distinguishing
// ranged vs. point events -- not echarts's own canvas rendering.
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const chartSpy = vi.hoisted(() => vi.fn());

vi.mock('../components/charts/chart', () => ({
  Chart: (props: Record<string, unknown>) => {
    chartSpy(props);
    return <div data-testid="chart-stub" />;
  },
}));

import {CaseTimeline} from '../components/charts/case-timeline';
import type {TimelineEvent} from '../lib/api-types';

afterEach(() => {
  cleanup();
  chartSpy.mockClear();
});

function event(overrides: Partial<TimelineEvent> & Pick<TimelineEvent, 'id' | 'kind' | 'title' | 'date_start'>): TimelineEvent {
  return {
    precision: 'day',
    verification_status: 'asserted',
    provenance: {},
    refs: {},
    ...overrides,
  };
}

describe('CaseTimeline', () => {
  it('shows a message and renders no chart when there are no events', () => {
    render(<CaseTimeline events={[]} />);
    expect(screen.getByText('No timeline events to chart.')).toBeInTheDocument();
    expect(chartSpy).not.toHaveBeenCalled();
  });

  it('builds one lane per unique event kind, sorted', () => {
    render(
      <CaseTimeline
        events={[
          event({id: 'e1', kind: 'meeting', title: 'Meeting', date_start: '2024-03-01T00:00:00Z'}),
          event({id: 'e2', kind: 'filing', title: 'Filing', date_start: '2024-02-01T00:00:00Z'}),
        ]}
      />,
    );
    const option = chartSpy.mock.calls[0][0].option;
    expect(option.yAxis.data).toEqual(['filing', 'meeting']);
  });

  it('excludes events with an unparseable date_start and reports the count', () => {
    render(
      <CaseTimeline
        events={[
          event({id: 'e1', kind: 'meeting', title: 'Good', date_start: '2024-03-01T00:00:00Z'}),
          event({id: 'e2', kind: 'meeting', title: 'Bad', date_start: 'not-a-date'}),
        ]}
      />,
    );
    expect(screen.getByText('1 event excluded (unparseable date).')).toBeInTheDocument();
    const option = chartSpy.mock.calls[0][0].option;
    expect(option.series[0].data).toHaveLength(1);
  });

  it('encodes a ranged event with a finite end and a point event with NaN end', () => {
    render(
      <CaseTimeline
        events={[
          event({id: 'e1', kind: 'meeting', title: 'Point', date_start: '2024-03-01T00:00:00Z'}),
          event({
            id: 'e2',
            kind: 'meeting',
            title: 'Range',
            date_start: '2024-01-01T00:00:00Z',
            date_end: '2024-01-05T00:00:00Z',
          }),
        ]}
      />,
    );
    const data = chartSpy.mock.calls[0][0].option.series[0].data as Array<[number, number, number, string]>;
    const point = data.find(([start]) => start === Date.parse('2024-03-01T00:00:00Z'));
    const range = data.find(([start]) => start === Date.parse('2024-01-01T00:00:00Z'));
    expect(Number.isNaN(point?.[2])).toBe(true);
    expect(range?.[2]).toBe(Date.parse('2024-01-05T00:00:00Z'));
  });

  it('passes verification_status through as the data encoding', () => {
    render(
      <CaseTimeline
        events={[event({id: 'e1', kind: 'meeting', title: 'Disputed', date_start: '2024-03-01T00:00:00Z', verification_status: 'disputed'})]}
      />,
    );
    const data = chartSpy.mock.calls[0][0].option.series[0].data as Array<[number, number, number, string]>;
    expect(data[0][3]).toBe('disputed');
  });

  it('includes the included/excluded/lane counts in the aria label', () => {
    render(
      <CaseTimeline
        events={[
          event({id: 'e1', kind: 'meeting', title: 'A', date_start: '2024-03-01T00:00:00Z'}),
          event({id: 'e2', kind: 'filing', title: 'B', date_start: 'bad'}),
        ]}
      />,
    );
    const ariaLabel = chartSpy.mock.calls[0][0].ariaLabel as string;
    expect(ariaLabel).toContain('1 events');
    expect(ariaLabel).toContain('2 categories');
  });
});
