// @vitest-environment jsdom
// Timeline › Lanes (features/timeline/lanes.tsx, lanes-model.ts; mockup TIME_1): what is worked out before drawing
// (dates in words, a date's bounds, the zoom window, the stub for a record far before the rest, quarter bars and the
// just-under flag), and what a person can do on it: read the out-of-order banner and make a lead of it, place a
// document from the strip, filter by the key, light a party, and name a period.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TimelinePanel} from '../features/timeline/timeline-panel';
import {bounds, justUnder, mainStart, parseWhen, quarters, windowFor} from '../features/timeline/lanes-model';
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
  fact: 'not_yet', fact_note: 'Nothing shows it yet', ...extra});

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', asOf: null, provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('lanes model', () => {
  it('reads dates typed in words and refuses what it cannot read', () => {
    expect(parseWhen('March 2019')).toMatchObject({date_start: '2019-03', precision: 'month'});
    expect(parseWhen('spring 2019')).toMatchObject({date_start: '2019-03', date_end: '2019-05', precision: 'range'});
    expect(parseWhen('winter 2019')).toMatchObject({date_start: '2019-12', date_end: '2020-02'});
    expect(parseWhen('2 May 2019')).toMatchObject({date_start: '2019-05-02', precision: 'day'});
    expect(parseWhen('Q2 2018')).toMatchObject({date_start: '2018-04', date_end: '2018-06', precision: 'range'});
    expect(parseWhen('2019')).toMatchObject({date_start: '2019', precision: 'year'});
    expect(parseWhen('last spring')).toBeNull();
    expect(parseWhen('2 Smarch 2019')).toBeNull();
  });

  it('bounds a month or a year to its first and last moment, never an invented 1 January', () => {
    expect(bounds('2019-05').map(t => new Date(t).toISOString().slice(0, 10))).toEqual(['2019-05-01', '2019-05-31']);
    expect(bounds('2019').map(t => new Date(t).toISOString().slice(0, 10))).toEqual(['2019-01-01', '2019-12-31']);
  });

  it('leaves a record far before the rest to a stub, and zooms a window that stays in the case', () => {
    const t = (y: number) => Date.UTC(y, 0, 1);
    expect(mainStart([t(1952), t(2016), t(2017), t(2018), t(2019)])).toBe(t(2016));
    expect(mainStart([t(2016), t(2017)])).toBe(t(2016));
    const [a, b] = windowFor('2y', t(2016), t(2021), t(2016));
    expect(new Date(a).getUTCFullYear()).toBe(2016);
    expect(Math.round((b - a) / (365.25 * 86_400_000))).toBe(2);
  });

  it('counts each quarter and how many in it are shown', () => {
    const qs = quarters([ev('a', 'A', '2019-02-01', {fact: 'shown'}), ev('b', 'B', '2019-03-01'), ev('c', 'C', '2019-05-01')], Date.UTC(2019, 0, 1), Date.UTC(2019, 11, 31));
    expect(qs.slice(0, 2).map(q => [q.count, q.shown])).toEqual([[2, 1], [1, 0]]);
  });

  it('brackets payments just under the line from one payer within a year, never adding them up', () => {
    const pay = (id: string, date: string, amount: number) => ev(id, `Payment ${id}`, date, {schema: 'Payment', amount, currency: 'EUR', parties: ['fern', 'kestrel']});
    const [flag] = justUnder([pay('1', '2018-02-01', 9800), pay('2', '2018-03-01', 9800), pay('3', '2018-04-01', 9800), pay('4', '2018-05-01', 42000)]);
    expect(flag).toMatchObject({lane: 'fern', ids: ['1', '2', '3'], say: 'just under 10,000 EUR ×3'});
    expect(justUnder([pay('1', '2018-02-01', 9800), pay('2', '2020-03-01', 9800)])).toEqual([]);
  });
});

describe('Lanes', () => {
  const parties = [{id: 'fern', caption: 'Fernhill Ltd', schema: 'Company', country: null, events: 2},
    {id: 'kestrel', caption: 'Kestrel SA', schema: 'Company', country: 'lu', events: 1}];
  const pay = ev('pay', 'Fernhill Ltd paid Kestrel SA', '2019-05', {schema: 'Payment', amount: 42000, currency: 'EUR', parties: ['fern', 'kestrel']});
  const tender = ev('tender', 'Tender opens', '2019-01-15', {kind: 'reporter_event', fact: 'shown', fact_note: 'Graded likely', parties: ['fern']});
  const sequence = [{event_id: 'pay', rule: 'procurement', rule_name: 'A public contract', missing: 'award', after_id: 'tender', found_later_id: null,
    say: 'Fernhill Ltd paid Kestrel SA comes before any recorded award.', why: 'A tender is usually followed by an award, then a contract, then payment.',
    basis: 'Open Contracting Data Standard', steps: ['tender', 'bid', 'award', 'contract', 'payment']}];

  it('says what is out of order, why, and makes a lead of it only when asked', async () => {
    const api = mockApi({[LANES]: lanesBody('inv-1', [tender, pay], {parties, sequence}),
      'POST /api/leads': {id: 'lead-1', investigation_id: 'inv-1', title: 'Out of order: Fernhill Ltd paid Kestrel SA', detail: null, status: 'unreviewed', provider: null, provider_record_id: null, created_at: '2026-10-29T00:00:00'}});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const banner = await screen.findByRole('note');
    expect(banner).toHaveTextContent('Out of order. Fernhill Ltd paid Kestrel SA comes before any recorded award.');
    expect(api.calls('POST /api/leads')).toHaveLength(0);
    const user = userEvent.setup();
    await user.click(within(banner).getByRole('button', {name: 'Why this order?'}));
    expect(within(banner).getByText('award')).toHaveClass('gone');
    await user.click(within(banner).getByRole('button', {name: 'Make a lead'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/leads')).toEqual({investigation_id: 'inv-1',
      title: 'Out of order: Fernhill Ltd paid Kestrel SA', detail: 'Fernhill Ltd paid Kestrel SA comes before any recorded award. A tender is usually followed by an award, then a contract, then payment.'}));
    // The panel opens on the next unresolved event, which is the payment, and says it fails the check.
    expect(screen.getByRole('heading', {name: 'Fernhill Ltd paid Kestrel SA'})).toBeInTheDocument();
    expect(screen.getByText(/Comes before any recorded award/)).toHaveTextContent('Comes before any recorded award (Tender opens, 15 Jan 2019 → ? → this).');
    // Said under the payment in both its lanes, the payer's and the payee's.
    expect(screen.getAllByText('no award recorded')).toHaveLength(2);
  });

  it('places a document from the strip with its own date and source, and lists sources with no date', async () => {
    const api = mockApi({[LANES]: lanesBody('inv-1', [pay], {parties,
      not_placed: [{source_id: 'src-9', title: 'Loop Two BV annual accounts', kind: 'filing', date: '2020', precision: 'year', date_key: 'filing date'}], not_placed_total: 1,
      undated: [{source_id: 'src-8', title: 'A photo of the fence', kind: 'photo', why: 'Its details hold no date'}], undated_total: 1}),
      'POST /api/timeline-events': {id: 'ev-9', investigation_id: 'inv-1', title: 'Loop Two BV annual accounts', description: null, date_start: '2020', date_end: null,
        precision: 'year', verification_status: 'asserted', grade: null, dataset: 'reporter', origin: null, placeholder: false, source_id: 'src-9', created_at: '2026-10-29T00:00:00'}});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText('2020 · filing date · year only')).toBeInTheDocument();
    expect(screen.getByText('“A photo of the fence” · its details hold no date')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Place it'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/timeline-events')).toEqual({investigation_id: 'inv-1', verification_status: 'asserted',
      title: 'Loop Two BV annual accounts', date_start: '2020', precision: 'year', source_id: 'src-9'}));
  });

  it('hides a mark from the key, and lights a party in every lane', async () => {
    mockApi({[LANES]: lanesBody('inv-1', [tender, pay], {parties})});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    // A reporter's event about a party is on My timeline and in that party's lane.
    expect(await screen.findAllByRole('button', {name: '15 Jan 2019: Tender opens, shown'})).toHaveLength(2);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /shown 1/}));
    expect(screen.queryAllByRole('button', {name: '15 Jan 2019: Tender opens, shown'})).toHaveLength(0);
    await user.click(screen.getByRole('button', {name: /shown 1/}));
    await user.click(screen.getByRole('button', {name: 'Light Kestrel SA in every lane'}));
    const marks = screen.getAllByRole('button', {name: /Tender opens, shown/});
    expect(marks.every(m => m.classList.contains('dim'))).toBe(true);
    expect(screen.getAllByRole('button', {name: /Fernhill Ltd paid Kestrel SA/})[0]).not.toHaveClass('dim');
  });

  it('names a period from words, and draws it over the lanes', async () => {
    const api = mockApi({[LANES]: lanesBody('inv-1', [pay], {parties}),
      'POST /api/investigations/inv-1/timeline/periods': {status: 201, body: {id: 'p-1', name: 'The money', date_start: '2019', date_end: '2019-12', summary: '', made_by: null}}});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('heading', {name: 'Fernhill Ltd paid Kestrel SA'});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Name a period'}));
    await user.type(screen.getByLabelText('Name'), 'The money');
    await user.type(screen.getByLabelText('From'), '2019');
    await user.type(screen.getByLabelText('To'), 'December 2019');
    api.add({[LANES]: lanesBody('inv-1', [pay], {parties, periods: [{id: 'p-1', name: 'The money', date_start: '2019', date_end: '2019-12', summary: '', made_by: null}]})});
    await user.click(screen.getByRole('button', {name: 'Name it'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/timeline/periods')).toEqual({name: 'The money', date_start: '2019', date_end: '2019-12'}));
    expect(await screen.findByText('THE MONEY')).toBeInTheDocument();
  });
});
