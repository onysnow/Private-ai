// @vitest-environment jsdom
// Timeline › Board (features/timeline/board.tsx; mockup TIME_5): one board per period (or year), its items, string
// only where a record joins two items (dashed while not shown), a chart of payments never added up, the style kept,
// and notes pinned to a board.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TimelinePanel} from '../features/timeline/timeline-panel';
import {boardItems, boardOpensAt, boardsFor} from '../features/timeline/board';
import type {TimelineLaneEventOut, TimelineLanesOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {lanesBody} from '../test-support/page-routes';

const ev = (id: string, title: string, date: string, extra: Partial<TimelineLaneEventOut> = {}): TimelineLaneEventOut => ({
  id, kind: 'relationship_date', investigation_id: 'inv-1', title, description: null, date_start: date, date_end: null,
  precision: 'day', verification_status: 'asserted', synthetic: true, refs: {}, provenance: {}, context: null, sort_key: date,
  parties: [], source_key: 'you', source_label: 'Typed by you', fact: 'not_yet', fact_note: null, ...extra});
const parties = [{id: 'ross', caption: 'M. Ross', schema: 'Person', country: null, events: 2}, {id: 'kestrel', caption: 'Kestrel SA', schema: 'Company', country: null, events: 3}];
const events = [
  ev('minutes', 'Bids received', '2019-03-04', {parties: ['kestrel'], fact: 'shown'}),
  ev('meet', 'Ross meets the council', '2019-02-01', {parties: ['ross']}),
  ev('p1', 'Payment one', '2019-05-02', {schema: 'Payment', amount: 9800, currency: 'EUR', parties: ['kestrel']}),
  ev('p2', 'Payment two', '2019-06-02', {schema: 'Payment', amount: 42000, currency: 'EUR', parties: ['kestrel']}),
  ev('old', 'Kestrel SA registered', '2016-03-01', {parties: ['kestrel']}),
];
const BOARD = 'GET /api/investigations/inv-1/timeline/board';

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('board model', () => {
  it('has one board a year until periods are named, then one per period', () => {
    const view = lanesBody('inv-1', events, {parties}) as unknown as TimelineLanesOut;
    // The 2016 registration lies far before the busy 2019: it gets its own board at the start, and the board opens on 2019.
    expect(boardsFor(view).map(b => [b.name, b.years, b.fold ?? null])).toEqual([['Before', '2016', 'early'], ['2019', '2019', null]]);
    expect(boardOpensAt(view, boardsFor(view))).toBe(1);
    expect(boardsFor({...view, periods: [{id: 'p', name: 'The bid', date_start: '2019', date_end: '2019', summary: '', made_by: null}]}).map(b => b.name)).toEqual(['The bid']);
  });

  it('cuts a long busy stretch into a handful of boards of whole years, not a tab a year', () => {
    const many: TimelineLaneEventOut[] = [ev('f', 'Founded', '1952-11-10')];
    const per: Record<number, number> = {2009: 18, 2010: 10, 2011: 13, 2012: 37, 2013: 28, 2014: 28, 2015: 2, 2016: 14};
    for (const [y, n] of Object.entries(per)) for (let i = 0; i < n; i += 1) many.push(ev(`${y}-${i}`, `Event ${y} ${i}`, `${y}-0${1 + (i % 9)}-1${i % 9}`));
    const boards = boardsFor(lanesBody('inv-1', many) as unknown as TimelineLanesOut);
    expect(boards.map(b => b.years)).toEqual(['1952', '2009–11', '2012', '2013', '2014–16']);
    expect(boards[0].fold).toBe('early');
    expect(boardOpensAt(lanesBody('inv-1', many) as unknown as TimelineLanesOut, boards)).toBe(1);
  });

  it('strings an event to each party it names, dashed until shown, and charts two payments or more', () => {
    const view = lanesBody('inv-1', events, {parties}) as unknown as TimelineLanesOut;
    const {items, strings} = boardItems(view, boardsFor(view)[1], [{id: 'n', board: '2019', text: 'Who decided the award?', x: 0.5, y: 0.1}]);
    expect(items.map(i => i.key)).toEqual(['event:meet', 'event:minutes', 'party:kestrel', 'party:ross', 'chart', 'note:n']);
    expect(strings).toEqual([
      {a: 'event:meet', b: 'party:ross', label: '', shown: false},
      {a: 'event:minutes', b: 'party:kestrel', label: '', shown: true},
      {a: 'chart', b: 'party:kestrel', label: '', shown: false},
    ]);
  });
});

describe('Board', () => {
  it('keeps the style and a pinned note with the case', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/timeline/lanes': lanesBody('inv-1', events, {parties}),
      [BOARD]: {style: 'rich', positions: {}, notes: []},
      'PUT /api/investigations/inv-1/timeline/board': (body: unknown) => body});
    render(<QueryProvider><TimelinePanel investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Board'}));
    await user.click(await screen.findByRole('tab', {name: '2019'}));
    expect(screen.getByText('2 payments, each its own bar: never added up')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Clean'}));
    expect(api.lastBody('PUT /api/investigations/inv-1/timeline/board')).toMatchObject({style: 'clean'});
    await user.type(screen.getByLabelText('A note for this board'), 'Who decided the award?');
    await user.click(screen.getByRole('button', {name: 'Pin the note'}));
    expect(api.lastBody('PUT /api/investigations/inv-1/timeline/board')).toMatchObject({style: 'clean',
      notes: [{board: '2019', text: 'Who decided the award?', x: 0.72, y: 0.04}]});
    expect(screen.getByRole('button', {name: 'Who decided the award?'})).toBeInTheDocument();
  });
});
