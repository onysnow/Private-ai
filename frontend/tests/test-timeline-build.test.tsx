// @vitest-environment jsdom
// Timeline › Build your own (features/timeline/build-your-own.tsx; mockup TIME_3): your own order of the case's
// events, kept per person; a card told before one dated later says so; a placeholder is a reporter's event with
// nothing attached; removing a card never touches the event.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TimelinePanel} from '../features/timeline/timeline-panel';
import {toldOutOfOrder} from '../features/timeline/build-your-own';
import type {TimelineLaneEventOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {lanesBody} from '../test-support/page-routes';

const ev = (id: string, title: string, date: string, extra: Partial<TimelineLaneEventOut> = {}): TimelineLaneEventOut => ({
  id, kind: 'reporter_event', investigation_id: 'inv-1', title, description: null, date_start: date, date_end: null,
  precision: date.length === 7 ? 'month' : 'day', verification_status: 'asserted', synthetic: false,
  refs: {}, provenance: {}, context: null, sort_key: date, parties: [], source_key: 'you', source_label: 'Typed by you',
  fact: 'not_yet', fact_note: null, ...extra});
const events = [ev('tender', 'Council opens the tender', '2019-01-15'), ev('bid', 'Kestrel SA bids for the land', '2019-03-04'),
  ev('deposit', 'The deposit went across', '2019-05'), ev('bank', 'Fernhill Ltd pays Kestrel SA', '2018-02-06', {schema: 'Payment'})];
const BUILT = 'GET /api/investigations/inv-1/built-timelines';
const editor = {id: 'b-1', name: 'For the editor', owner: 'local-owner', items: ['tender', 'deposit', 'bank'], updated_at: '2026-10-29T00:00:00'};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('build your own', () => {
  it('says which cards are told before an earlier one, never for dates that overlap', () => {
    expect(toldOutOfOrder([events[0], events[2], events[3]])).toEqual([false, false, true]);
    expect(toldOutOfOrder([ev('a', 'A', '2019-05-20'), ev('b', 'B', '2019-05')])).toEqual([false, false]);
  });

  it('adds, moves and removes cards in your own order, and keeps it', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/timeline/lanes': lanesBody('inv-1', events), [BUILT]: [editor],
      'PUT /api/investigations/inv-1/built-timelines/b-1': (body: unknown) => ({...editor, ...(body as object)})});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Build your own'}));
    expect(await screen.findByText('earlier than the card before')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Add Kestrel SA bids for the land'}));
    expect(api.lastBody('PUT /api/investigations/inv-1/built-timelines/b-1')).toEqual({name: 'For the editor', items: ['tender', 'deposit', 'bank', 'bid']});
    await user.click(screen.getByRole('button', {name: 'Move Fernhill Ltd pays Kestrel SA earlier in your order'}));
    expect(api.lastBody('PUT /api/investigations/inv-1/built-timelines/b-1')).toEqual({name: 'For the editor', items: ['tender', 'bank', 'deposit', 'bid']});
    await user.click(screen.getByRole('button', {name: 'Take The deposit went across off this timeline'}));
    expect(api.lastBody('PUT /api/investigations/inv-1/built-timelines/b-1')).toEqual({name: 'For the editor', items: ['tender', 'bank', 'bid']});
  });

  it('adds a placeholder as a reporter\'s event with nothing attached, and puts it on the line', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/timeline/lanes': lanesBody('inv-1', events), [BUILT]: [editor],
      'POST /api/timeline-events': {id: 'ph-1', investigation_id: 'inv-1', title: 'The award was settled early', description: null, date_start: '2019-03', date_end: '2019-05',
        precision: 'range', verification_status: 'unresolved', grade: null, dataset: 'reporter', origin: null, placeholder: true, created_at: '2026-10-29T00:00:00'},
      'PUT /api/investigations/inv-1/built-timelines/b-1': (body: unknown) => ({...editor, ...(body as object)})});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Build your own'}));
    await user.type(await screen.findByLabelText('When, if known'), 'spring 2019');
    await user.type(screen.getByLabelText('What you think happened'), 'The award was settled early');
    await user.click(screen.getByRole('button', {name: 'Add the placeholder'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/timeline-events')).toEqual({investigation_id: 'inv-1', title: 'The award was settled early',
      verification_status: 'unresolved', placeholder: true, date_start: '2019-03', date_end: '2019-05', precision: 'range'}));
    await vi.waitFor(() => expect(api.lastBody('PUT /api/investigations/inv-1/built-timelines/b-1')).toEqual({name: 'For the editor', items: ['tender', 'deposit', 'bank', 'ph-1']}));
  });

  it('asks before deleting a timeline', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/timeline/lanes': lanesBody('inv-1', events), [BUILT]: [editor],
      'DELETE /api/investigations/inv-1/built-timelines/b-1': {status: 204, body: null}});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Build your own'}));
    await user.click(await screen.findByRole('button', {name: 'Delete this timeline'}));
    expect(api.calls('DELETE /api/investigations/inv-1/built-timelines/b-1')).toHaveLength(0);
    const ask = screen.getByText(/Delete “For the editor”\?/);
    await user.click(within(ask).getByRole('button', {name: 'Delete it'}));
    await vi.waitFor(() => expect(api.calls('DELETE /api/investigations/inv-1/built-timelines/b-1')).toHaveLength(1));
  });
});
