// @vitest-environment jsdom
// Timeline › Periods (features/timeline/periods.tsx; mockup TIME_8): each named period as its own screen, its years,
// what happened in it in plain counts, the reporter's summary kept with who wrote it, and Open in Lanes.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TimelinePanel} from '../features/timeline/timeline-panel';
import {inPeriod, periodWords, periodYears} from '../features/timeline/periods';
import type {TimelineLaneEventOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {lanesBody} from '../test-support/page-routes';

const LANES = 'GET /api/investigations/inv-1/timeline/lanes';
const ev = (id: string, title: string, date: string, extra: Partial<TimelineLaneEventOut> = {}): TimelineLaneEventOut => ({
  id, kind: 'relationship_date', investigation_id: 'inv-1', title, description: null, date_start: date, date_end: null,
  precision: date.length === 7 ? 'month' : date.length === 4 ? 'year' : 'day', verification_status: 'asserted', synthetic: true,
  refs: {}, provenance: {}, context: null, sort_key: date, parties: [], source_key: 'you', source_label: 'Typed by you',
  fact: 'not_yet', fact_note: null, ...extra});
const money = {id: 'p-1', name: 'The money', date_start: '2018', date_end: '2018-12', summary: 'Three payments just under the line.', made_by: 'local-owner'};
const bid = {id: 'p-2', name: 'The bid', date_start: '2019', date_end: '2019', summary: '', made_by: 'local-owner'};
const events = [
  ev('a', 'Fernhill Ltd paid Kestrel SA', '2018-02-01', {schema: 'Payment', amount: 9800}),
  ev('b', 'Fernhill Ltd paid Kestrel SA', '2018-03-01', {schema: 'Payment', amount: 9800, refs: {source_id: 'src-1'}, source_key: 'source:src-1', source_label: 'Bank statement'}),
  ev('c', 'Kestrel SA — director → A. Weber', '2018-07', {}),
  ev('d', 'Tender opens', '2019-01-15', {kind: 'reporter_event'}),
];

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', asOf: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('periods model', () => {
  it('says a period\'s years, the events that can be in it, and what they are', () => {
    expect(periodYears(money)).toBe('2018');
    expect(periodYears({date_start: '2016', date_end: '2017-06'})).toBe('2016–2017');
    expect(inPeriod(events, money).map(e => e.id)).toEqual(['a', 'b', 'c']);
    expect(periodWords(inPeriod(events, money))).toBe('2 payments, 1 link');
    expect(periodWords([events[3]])).toBe('1 event you recorded');
  });
});

describe('Periods before any is named', () => {
  it('offers the stretches the record falls into, and one click fills in its dates', async () => {
    mockApi({[LANES]: lanesBody('inv-1', events)});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Periods'}));
    const offers = screen.getByRole('group', {name: 'Stretches in the record'});
    expect(offers).toHaveTextContent('2018');
    expect(offers).toHaveTextContent('3 records');
    await user.click(screen.getByRole('button', {name: /^2019/}));
    expect(screen.getByLabelText('From')).toHaveValue('2019');
    expect(screen.getByLabelText('To')).toHaveValue('2019');
  });
});

describe('Periods', () => {
  it('shows each period with its summary and evidence, steps between them, and opens one in Lanes', async () => {
    mockApi({[LANES]: lanesBody('inv-1', events, {periods: [money, bid]})});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Periods'}));
    expect(screen.getByRole('heading', {name: 'The money'})).toBeInTheDocument();
    expect(screen.getByText('Period 1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/in this period: 2 payments, 1 link/)).toBeInTheDocument();
    expect(screen.getByText('Three payments just under the line.')).toBeInTheDocument();
    expect(screen.getByText(/Summary written by you/)).toBeInTheDocument();
    // Only the payment that points at a document is a card.
    expect(screen.getByRole('button', {name: /Fernhill Ltd paid Kestrel SA\s*1 Mar 2018 · Bank statement/})).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'The bid'}));
    expect(screen.getByRole('heading', {name: 'The bid'})).toBeInTheDocument();
    expect(screen.getByText('Write what happened in this period')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Open in Lanes'}));
    expect(screen.getByRole('tab', {name: 'Lanes'})).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', {name: 'Tender opens'})).toBeInTheDocument();
  });

  it('keeps the summary a person writes, with the period\'s name and dates unchanged', async () => {
    const api = mockApi({[LANES]: lanesBody('inv-1', events, {periods: [bid]}),
      'PUT /api/investigations/inv-1/timeline/periods/p-2': {...bid, summary: 'The council opens a tender.'}});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Periods'}));
    await user.click(screen.getByRole('button', {name: 'Write what happened in this period'}));
    await user.type(screen.getByLabelText('Your summary of this period'), 'The council opens a tender.');
    await user.click(screen.getByRole('button', {name: 'Keep it'}));
    await vi.waitFor(() => expect(api.lastBody('PUT /api/investigations/inv-1/timeline/periods/p-2')).toEqual({
      name: 'The bid', date_start: '2019', date_end: '2019', summary: 'The council opens a tender.'}));
  });

  it('asks for a first period when none is named', async () => {
    const api = mockApi({[LANES]: lanesBody('inv-1', events),
      'POST /api/investigations/inv-1/timeline/periods': {status: 201, body: {...money, summary: ''}}});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Periods'}));
    expect(screen.getByText('No periods named yet.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'The money');
    await user.type(screen.getByLabelText('From'), '2018');
    await user.type(screen.getByLabelText('To'), 'December 2018');
    await user.click(screen.getByRole('button', {name: 'Name it'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/timeline/periods')).toEqual({
      name: 'The money', date_start: '2018', date_end: '2018-12', summary: ''}));
  });
});
