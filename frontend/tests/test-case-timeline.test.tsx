// @vitest-environment jsdom
// STRUCT-0040 / issue #40: coverage for CaseTimeline.
//
// components/charts/chart.tsx is mocked so these tests assert what this
// component owns: building timeline lanes/data from timeline event records,
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

import {CaseTimeline, dateWords, eventSpan} from '../components/charts/case-timeline';
import type {CaseTimelineEvent} from '../components/charts/case-timeline';

afterEach(() => {
  cleanup();
  chartSpy.mockClear();
});

function event(overrides: Partial<CaseTimelineEvent> & Pick<CaseTimelineEvent, 'id' | 'kind' | 'title' | 'date_start'>): CaseTimelineEvent {
  return {
    verification_status: 'asserted',
    ...overrides,
  };
}

describe('CaseTimeline', () => {
  const lastOption = () => chartSpy.mock.calls[chartSpy.mock.calls.length - 1][0].option;

  it('shows a message and renders no chart when there are no events', () => {
    render(<CaseTimeline events={[]} />);
    expect(screen.getByText('No timeline events to chart.')).toBeInTheDocument();
    expect(chartSpy).not.toHaveBeenCalled();
  });

  it('names its rows in words, in a fixed order, your own events first', () => {
    render(<CaseTimeline events={[
      event({id: 'e1', kind: 'source_date', title: 'Filed', date_start: '2024-02-01'}),
      event({id: 'e2', kind: 'reporter_event', title: 'Meeting', date_start: '2024-03-01'}),
      event({id: 'e3', kind: 'some_new_kind', title: 'Other', date_start: '2024-03-02'}),
    ]}/>);
    expect(lastOption().yAxis.data).toEqual(['Events you recorded', 'Dates of sources', 'some new kind']);
  });

  it('leaves out events whose date cannot be read, and says how many', () => {
    render(<CaseTimeline events={[
      event({id: 'e1', kind: 'reporter_event', title: 'Good', date_start: '2024-03-01'}),
      event({id: 'e2', kind: 'reporter_event', title: 'Bad', date_start: 'not-a-date'}),
    ]}/>);
    expect(screen.getByText('1 event left out: the date could not be read.')).toBeInTheDocument();
    expect(lastOption().series[0].data).toHaveLength(1);
    expect(chartSpy.mock.calls[0][0].ariaLabel).toContain('Timeline of 1 event in 1 row');
  });

  it('spans an event that runs between dates, and a date known only to the month or year over that month or year', () => {
    expect(eventSpan({date_start: '2024-03-01'})).toEqual({start: Date.parse('2024-03-01'), end: Date.parse('2024-03-01'), fuzzy: false});
    expect(eventSpan({date_start: '2024-01-01', date_end: '2024-01-05'})).toEqual({start: Date.parse('2024-01-01'), end: Date.parse('2024-01-05'), fuzzy: false});
    expect(eventSpan({date_start: '2021-02', precision: 'month'})).toEqual({start: Date.UTC(2021, 1, 1), end: Date.UTC(2021, 2, 1), fuzzy: true});
    expect(eventSpan({date_start: '2021', precision: 'year'})).toEqual({start: Date.UTC(2021, 0, 1), end: Date.UTC(2022, 0, 1), fuzzy: true});
    expect(eventSpan({date_start: 'soon'})).toBeNull();
    expect(dateWords('2023-10-03', 'day')).toBe('3 Oct 2023');
    expect(dateWords('2023-10', 'month')).toBe('Oct 2023');
    expect(dateWords('2023', 'year')).toBe('2023');
  });

  it('draws how sure a date is in the mark, not its colour: filled, half, empty, dashed, and a red "!" when disputed', () => {
    const statuses = ['verified', 'asserted', 'unresolved', 'approximate', 'disputed'];
    render(<CaseTimeline events={statuses.map((st, i) => event({id: `e${i}`, kind: 'reporter_event', title: st, date_start: `2024-0${i + 1}-01`, verification_status: st}))}/>);
    const option = lastOption();
    const api = (index: number) => ({value: (dim: number) => option.series[0].data[index][dim], coord: ([x, y]: number[]) => [x / 1e9, y * 10]});
    const drawn = statuses.map((_, i) => option.series[0].renderItem({dataIndex: i}, api(i)));
    const mark = (i: number) => drawn[i].children.find((c: {type: string}) => c.type === 'circle');
    const amber = '#d4a152';
    expect(mark(0).style).toMatchObject({fill: amber, stroke: amber});              // verified
    expect(mark(1).style.fill).toBe(`${amber}73`);                                 // asserted: half
    expect(mark(2).style.fill).toBe('#1a2328');                                    // unresolved: empty
    expect(mark(3).style.lineDash).toEqual([3, 2]);                                // approximate: dashed
    expect(drawn[4].children.some((c: {type: string; style?: {text?: string}}) => c.type === 'text' && c.style?.text === '!')).toBe(true);
    expect(mark(0).textContent.style.text).toBe('verified');                      // named beside its mark
  });
});
