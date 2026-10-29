// @vitest-environment jsdom
// Grading a reporter's timeline event on Bellingcat's scale
// (features/timeline/timeline-panel.tsx; backend app/services/timeline.py
// EVENT_GRADES): the grade can be set when the event is added and changed
// later, and each graded event says its grade, with what it means.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../components/charts/chart', () => ({Chart: () => <div data-testid="chart-stub"/>}));

import {EVENT_GRADES, TimelinePanel} from '../features/timeline/timeline-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {timelineBody} from '../test-support/page-routes';

const TIMELINE = 'GET /api/investigations/inv-1/timeline';
const event = (extra: Record<string, unknown> = {}) => ({
  id: 'ev-1', kind: 'reporter_event', investigation_id: 'inv-1', title: 'Villa searched', description: null, date_start: '2023-11-14', date_end: null,
  precision: 'day', verification_status: 'verified', grade: null, synthetic: false, refs: {}, provenance: {dataset: 'reporter'}, context: null,
  sort_key: '2023-11-14', ...extra});

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'ev-1', investigation_id: 'inv-1', title: 'Villa searched', description: null, date_start: '2023-11-14', date_end: null, precision: 'day',
  verification_status: 'verified', grade: null, dataset: 'reporter', origin: null, created_at: '2026-10-03T00:00:00', ...extra});

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('timeline event grades', () => {
  it('uses Bellingcat\'s five words, the airstrike-only level left out', () => {
    expect(Object.keys(EVENT_GRADES)).toEqual(['confirmed', 'likely', 'weak', 'unsubstantiated', 'unknown']);
  });

  it('grades a reporter\'s event, shows the grade with its meaning, and sends a grade with a new event', async () => {
    const api = mockApi({[TIMELINE]: timelineBody('inv-1', [event()])});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    await screen.findByText(/Villa searched/);
    api.add({'PATCH /api/timeline-events/ev-1': row({grade: 'likely'}), [TIMELINE]: timelineBody('inv-1', [event({grade: 'likely'})])});
    const user = userEvent.setup();
    screen.getByRole('combobox', {name: 'Grade of Villa searched'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: /^likely: several sources report it/}));
    const graded = await screen.findByText('graded likely');
    expect(graded).toHaveAttribute('title', EVENT_GRADES.likely);
    expect(api.lastBody('PATCH /api/timeline-events/ev-1')).toEqual({grade: 'likely'});

    api.add({'POST /api/timeline-events': row({id: 'ev-2', title: 'Meridian registered', grade: 'weak'})});
    await user.type(screen.getByPlaceholderText('Event title'), 'Meridian registered');
    await user.type(screen.getByPlaceholderText('YYYY-MM-DD, YYYY-MM, or YYYY'), '2019-03-04');
    screen.getByRole('combobox', {name: 'Grade'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'weak'}));
    await user.click(screen.getByRole('button', {name: 'Add event'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/timeline-events')).toMatchObject({title: 'Meridian registered', grade: 'weak'}));
    expect(within(document.body).queryByText('Could not add the event')).toBeNull();
  });

  it('asks for the sources\' own dates only when the switch is on', async () => {
    const api = mockApi({[TIMELINE]: timelineBody('inv-1', [event()])});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    await screen.findByText(/Villa searched/);
    expect(api.lastUrl(TIMELINE).searchParams.get('include_source_dates')).toBeNull();
    await userEvent.setup().click(screen.getByRole('checkbox', {name: /when each source was published or filed/}));
    await vi.waitFor(() => expect(api.lastUrl(TIMELINE).searchParams.get('include_source_dates')).toBe('true'));
  });
});
