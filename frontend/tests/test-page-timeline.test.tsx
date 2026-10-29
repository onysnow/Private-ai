// @vitest-environment jsdom
// The "Investigation timeline" section (TimelinePanel in features/timeline/timeline-panel.tsx) draws the case's
// events as Lanes (mockup TIME_1) from the generated client: one mark per event, saying whether it is shown.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

vi.mock('../components/charts/chart', () => ({Chart: () => <div data-testid="chart-stub"/>}));

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../components/case/workbench-all');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};

const timelineEvent = {
  id: 'ev-t1', kind: 'reporter_event', investigation_id: 'inv-1', title: 'Board approves transfer', description: null,
  date_start: '2024-03-02', date_end: null, precision: 'day', verification_status: 'verified', synthetic: false,
  provenance: {}, refs: {}, context: null, sort_key: '2024-03-02',
};

async function bootstrap(events: unknown[]): Promise<void> {
  const api = mockApi(pageRoutes({investigations: [investigation], events}));
  const Home = await importHome();
  render(<Home />);
  await screen.findByRole('heading', {level: 1, name: 'Kestrelwood filings'});
  await waitFor(() => expect(api.calls('GET /api/investigations/inv-1/timeline/lanes').length).toBeGreaterThan(0));
}

describe('Home investigation timeline', () => {
  it('draws each event as one mark on My timeline, saying whether it is shown', async () => {
    await bootstrap([timelineEvent]);
    expect(await screen.findByRole('button', {name: '2 Mar 2024: Board approves transfer, shown'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'What happened when, and how sure are we?'})).toBeInTheDocument();
  });

  it('says how to start when there are no events', async () => {
    await bootstrap([]);
    expect(await screen.findByText('No dated records yet.')).toBeInTheDocument();
  });
});
