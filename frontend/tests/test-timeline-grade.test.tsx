// @vitest-environment jsdom
// Grading a reporter's timeline event on Bellingcat's scale (features/timeline/lane-detail.tsx; backend
// app/services/timeline.py EVENT_GRADES), and adding one with N: the date is typed in words and its precision set from
// them. A source's own date is not an event: it waits in the "Not on the timeline yet" strip.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {EVENT_GRADES, TimelinePanel} from '../features/timeline/timeline-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {lanesBody} from '../test-support/page-routes';

const LANES = 'GET /api/investigations/inv-1/timeline/lanes';
const event = (extra: Record<string, unknown> = {}) => ({
  id: 'ev-1', kind: 'reporter_event', investigation_id: 'inv-1', title: 'Villa searched', description: null, date_start: '2023-11-14', date_end: null,
  precision: 'day', verification_status: 'asserted', grade: null, synthetic: false, refs: {}, provenance: {dataset: 'reporter'}, context: null,
  sort_key: '2023-11-14', ...extra});

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'ev-1', investigation_id: 'inv-1', title: 'Villa searched', description: null, date_start: '2023-11-14', date_end: null, precision: 'day',
  verification_status: 'asserted', grade: null, dataset: 'reporter', origin: null, placeholder: false, created_at: '2026-10-03T00:00:00', ...extra});

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('timeline event grades', () => {
  it('uses Bellingcat\'s five words, the airstrike-only level left out', () => {
    expect(Object.keys(EVENT_GRADES)).toEqual(['confirmed', 'likely', 'weak', 'unsubstantiated', 'unknown']);
  });

  it('grades a reporter\'s event in the panel, and a likely grade makes its mark shown', async () => {
    const api = mockApi({[LANES]: lanesBody('inv-1', [event()])});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('heading', {name: 'Villa searched'});
    api.add({'PATCH /api/timeline-events/ev-1': row({grade: 'likely'}),
      [LANES]: lanesBody('inv-1', [event({grade: 'likely', fact: 'shown', fact_note: 'Graded likely'})])});
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', {name: 'Grade (Bellingcat)'}), 'likely');
    expect(api.lastBody('PATCH /api/timeline-events/ev-1')).toEqual({grade: 'likely'});
    expect(await screen.findByText('Graded likely')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '14 Nov 2023: Villa searched, shown'})).toBeInTheDocument();
  });

  it('adds an event with N, reading "spring 2019" as a range of months, and can mark it a placeholder', async () => {
    const api = mockApi({[LANES]: lanesBody('inv-1', [event()]),
      'POST /api/timeline-events': row({id: 'ev-2', title: 'Meeting with the lawyer', date_start: '2019-03', date_end: '2019-05', precision: 'range', placeholder: true})});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('heading', {name: 'Villa searched'});
    const user = userEvent.setup();
    screen.getByLabelText('Timeline lanes').focus();
    await user.keyboard('n');
    await user.type(screen.getByLabelText('What happened'), 'Meeting with the lawyer');
    await user.type(screen.getByLabelText('When'), 'spring 2019');
    expect(screen.getByText('Read as Mar 2019 to May 2019: spring: a range of months')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/A placeholder/));
    await user.click(screen.getByRole('button', {name: 'Add'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/timeline-events')).toEqual({
      investigation_id: 'inv-1', verification_status: 'asserted', title: 'Meeting with the lawyer',
      date_start: '2019-03', date_end: '2019-05', precision: 'range', placeholder: true}));
    expect(await screen.findByText('On your timeline: Meeting with the lawyer')).toBeInTheDocument();
  });

  it('will not add a date it cannot read', async () => {
    mockApi({[LANES]: lanesBody('inv-1', [event()])});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('heading', {name: 'Villa searched'});
    const user = userEvent.setup();
    screen.getByLabelText('Timeline lanes').focus();
    await user.keyboard('n');
    await user.type(screen.getByLabelText('What happened'), 'Filing');
    await user.type(screen.getByLabelText('When'), 'last spring');
    expect(screen.getByText(/Not a date it can read/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add'})).toBeDisabled();
  });
});
