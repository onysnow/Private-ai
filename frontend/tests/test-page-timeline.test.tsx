// @vitest-environment jsdom
// Issue #40 wiring: the "Investigation timeline" section (now the
// TimelinePanel in features/timeline/timeline-panel.tsx, which loads its
// own events through the generated client) renders the reusable
// <CaseTimeline> chart above the existing event list whenever the
// investigation has timeline events. The ECharts wrapper (<Chart>) is
// stubbed -- jsdom has no canvas -- so this asserts the chart option the
// panel ends up building from the loaded events, matching
// tests/test-case-timeline.test.tsx. The chart itself still arrives through
// next/dynamic, as it does in the product.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

const {chartSpy} = vi.hoisted(() => ({chartSpy: vi.fn()}));
vi.mock('../components/charts/chart', () => ({
  Chart: (props: Record<string, unknown>) => {
    chartSpy(props);
    return <div data-testid="chart-stub" />;
  },
}));

beforeEach(() => {
  chartSpy.mockClear();
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};

// A full TimelineEventOut: the panel's generated reply check needs every
// field, not only the six the chart draws.
const timelineEvent = {
  id: 'ev-t1', kind: 'reporter_event', investigation_id: 'inv-1', title: 'Board approves transfer', description: null,
  date_start: '2024-03-02', date_end: null, precision: 'day', verification_status: 'verified', synthetic: false,
  provenance: {}, refs: {}, context: null, sort_key: '2024-03-02',
};

async function bootstrap(events: unknown[]): Promise<void> {
  const api = mockApi(pageRoutes({investigations: [investigation], events}));
  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');
  // The panel loads the timeline on its own; wait until it has asked.
  await waitFor(() => expect(api.calls('GET /api/investigations/inv-1/timeline')).toHaveLength(1));
}

describe('Home investigation timeline chart', () => {
  it('renders the case timeline chart from the loaded events, above the unchanged event list', async () => {
    await bootstrap([timelineEvent]);
    await screen.findByText('Board approves transfer', {selector: 'b'});
    expect(screen.getByText('2 Mar 2024')).toBeInTheDocument();
    expect(await screen.findByTestId('chart-stub')).toBeInTheDocument();
    const option = chartSpy.mock.calls.at(-1)?.[0].option as {series: Array<{data: unknown[][]}>};
    // [start, row, end, index]: a day-precise date is a point (end = start).
    expect(option.series[0].data[0]).toEqual([Date.parse('2024-03-02'), 0, Date.parse('2024-03-02'), 0]);
  });

  it('does not render the chart when there are no events', async () => {
    await bootstrap([]);
    expect(screen.queryByTestId('chart-stub')).not.toBeInTheDocument();
  });
});
