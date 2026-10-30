// @vitest-environment jsdom
// Timeline › Replay (features/timeline/replay.tsx; mockup TIME_4): the steps in date order, what was on the record by
// each, Play stopping at a step nobody has resolved, and Show in Lanes at this date.
import {act, cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TimelinePanel} from '../features/timeline/timeline-panel';
import {replayFold} from '../features/timeline/replay';
import type {TimelineLaneEventOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {lanesBody} from '../test-support/page-routes';

const LANES = 'GET /api/investigations/inv-1/timeline/lanes';
const ev = (id: string, title: string, date: string, extra: Partial<TimelineLaneEventOut> = {}): TimelineLaneEventOut => ({
  id, kind: 'reporter_event', investigation_id: 'inv-1', title, description: null, date_start: date, date_end: null,
  precision: date.length === 7 ? 'month' : 'day', verification_status: 'asserted', synthetic: false,
  refs: {}, provenance: {}, context: null, sort_key: date, parties: [], source_key: 'you', source_label: 'Typed by you',
  fact: 'shown', fact_note: null, ...extra});
const events = [
  ev('a', 'Kestrel SA is set up', '2016-03-01'),
  ev('b', 'The council opens a tender', '2019-01-15'),
  ev('c', 'A deposit, with no award recorded', '2019-05', {fact: 'not_yet', context: {evidence: {quote: 'The deposit went across in May'}} as never}),
  ev('d', 'Kestrel SA pays for the land', '2019-10-02'),
];

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', asOf: null});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Replay in a case with far-off steps', () => {
  const wide = [ev('old', 'A bank is incorporated', '1952-11-10'), ...events, ev('x', 'Kestrel SA sells on', '2019-12-01')];
  it('folds the steps far before the busy stretch and opens on its first step', async () => {
    mockApi({[LANES]: lanesBody('inv-1', wide)});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Replay'}));
    expect(screen.getByText('Step 2 of 6 · 1 Mar 2016')).toBeInTheDocument();
    expect(screen.queryByText('A bank is incorporated')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /1 step before the busy stretch, 1952: show them/}));
    await user.click(screen.getByText('A bank is incorporated'));
    expect(screen.getByText('Step 1 of 6 · 10 Nov 1952')).toBeInTheDocument();
  });

  it('puts the outliers on a short stub and spreads the busy stretch over the rest of the line', () => {
    const steps = lanesBody('inv-1', wide).steps as Parameters<typeof replayFold>[0];
    const fold = replayFold(steps);
    expect(fold.early).toBe(1);
    expect(fold.late).toBe(0);
    expect(fold.pos(steps[0])).toBeLessThan(8);
    expect(fold.pos(steps[1])).toBeGreaterThanOrEqual(8);
  });
});

describe('Replay', () => {
  it('plays the steps and waits at the one nobody has resolved', async () => {
    mockApi({[LANES]: lanesBody('inv-1', events)});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Replay'}));
    expect(screen.getByText('Step 1 of 4 · 1 Mar 2016')).toBeInTheDocument();
    expect(screen.getByText('1 event · 1 shown')).toBeInTheDocument();
    vi.useFakeTimers();
    act(() => { screen.getByRole('button', {name: /Play/}).click(); });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('heading', {name: 'The council opens a tender'})).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('heading', {name: 'A deposit, with no award recorded'})).toBeInTheDocument();
    expect(screen.getByText('Replay waits here until you go on.')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(screen.getByRole('heading', {name: 'A deposit, with no award recorded'})).toBeInTheDocument();
    expect(screen.getByText('3 events · 2 shown')).toBeInTheDocument();
    expect(screen.getAllByText(/The deposit went across in May/).length).toBeGreaterThan(0);
  });

  it('shows a step in Lanes at its date', async () => {
    mockApi({[LANES]: lanesBody('inv-1', events)});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Replay'}));
    await user.click(screen.getByRole('button', {name: 'Step 4: Kestrel SA pays for the land'}));
    await user.click(screen.getByRole('button', {name: 'Show in Lanes at this date'}));
    expect(screen.getByRole('tab', {name: 'Lanes'})).toHaveAttribute('aria-selected', 'true');
    expect(useWorkbenchStore.getState().asOf).toBe(2019);
    expect(await screen.findByRole('heading', {name: 'Kestrel SA pays for the land'})).toBeInTheDocument();
  });
});
