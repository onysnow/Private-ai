// @vitest-environment jsdom
// The watchlist (features/corpus/watchlist.tsx; backend app/services/watchlists.py):
// a name is watched, checked on demand, each document it turns up in shows
// once with OpenAleph's snippet, opens in the documents panel, and becomes a
// lead or is dismissed -- by the reporter.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {lastCheck, Watchlist} from '../features/corpus/watchlist';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {leadBody, watchlistBody} from '../test-support/page-routes';

const LIST = 'GET /api/investigations/inv-1/watchlist';
const ADD = 'POST /api/investigations/inv-1/watchlist';
const CHECK = 'POST /api/investigations/inv-1/watchlist/check';
const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', document: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const hit = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, document_id: `doc-${id}`, title: `${id}.txt`, page_number: null, status: 'new', lead_id: null, found_at: '2026-10-03T09:00:00',
  highlights: [[{text: 'Jane Doe paid ', match: false}, {text: 'Zanzibar Trading', match: true}]], ...overrides});
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'w-1', query: 'Zanzibar Trading', note: 'The shell', created_by: null, created_at: '2026-10-03T08:00:00',
  checked_at: null, check_state: null, check_detail: null, hits: [], ...overrides});

describe('Watchlist', () => {
  it('watches a name and checks it', async () => {
    const found = entry({checked_at: '2026-10-03T09:00:00', check_state: 'ok', hits: [hit('memo'), hit('minutes', {page_number: 2})]});
    const api = mockApi({
      [LIST]: watchlistBody('inv-1'),
      [ADD]: watchlistBody('inv-1', [entry()]),
      [CHECK]: {...watchlistBody('inv-1', [found]), checked: 1, new_hits: 2},
    });
    wrap(<Watchlist investigationId="inv-1"/>);
    expect(await screen.findByText('No name is watched yet.')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name or search to watch'), '  Zanzibar Trading ');
    await user.type(screen.getByLabelText('Why it is watched'), 'The shell');
    await user.click(screen.getByRole('button', {name: 'Watch'}));
    expect(await screen.findByText('Watching “Zanzibar Trading”.')).toBeInTheDocument();
    expect(api.lastBody(ADD)).toEqual({query: 'Zanzibar Trading', note: 'The shell'});
    expect(screen.getByText(/^Not checked yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Check now'}));
    expect(await screen.findByText('Found 2 new document(s).')).toBeInTheDocument();
    expect(screen.getByText('Found in 2 document(s), 2 to decide.')).toBeInTheDocument();
    const where = within(screen.getByRole('list', {name: 'Where “Zanzibar Trading” was found'}));
    expect(where.getAllByText('Zanzibar Trading')[0].tagName).toBe('MARK');
    expect(where.getByText('· page 2')).toBeInTheDocument();
    await user.click(where.getAllByRole('button', {name: 'Open document'})[1]);
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'doc-minutes', pageNumber: 2});
    expect(api.unmatched()).toEqual([]);
  });

  it('makes a hit a lead, dismisses another and stops watching', async () => {
    const watched = entry({checked_at: '2026-10-03T09:00:00', check_state: 'ok', hits: [hit('memo'), hit('minutes')]});
    const decided = entry({...watched, hits: [hit('memo', {status: 'lead', lead_id: 'lead-9'}), hit('minutes', {status: 'dismissed'})]});
    let listed = watchlistBody('inv-1', [watched]);
    const api = mockApi({
      [LIST]: () => listed,
      'POST /api/watchlist-hits/memo/lead': () => {
        listed = watchlistBody('inv-1', [{...watched, hits: [decided.hits[0], watched.hits[1]]}]);
        return leadBody({id: 'lead-9', title: '“Zanzibar Trading” in memo.txt', provider: 'openaleph', kind: 'connector'});
      },
      'POST /api/watchlist-hits/minutes/dismiss': watchlistBody('inv-1', [decided]),
      'DELETE /api/watchlist/w-1': watchlistBody('inv-1'),
      'GET /api/investigations/inv-1/leads': [],
    });
    wrap(<Watchlist investigationId="inv-1"/>);
    const user = userEvent.setup();
    const where = within(await screen.findByRole('list', {name: 'Where “Zanzibar Trading” was found'}));
    await user.click(where.getAllByRole('button', {name: 'Make a lead'})[0]);
    expect(await screen.findByText('““Zanzibar Trading” in memo.txt” is now a lead.')).toBeInTheDocument();
    expect(await screen.findByText('Made a lead')).toBeInTheDocument();
    expect(api.calls(LIST)).toHaveLength(2);

    await user.click(screen.getByRole('button', {name: 'Dismiss'}));
    expect(await screen.findByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByText('Found in 2 document(s), 0 to decide.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Stop watching'}));
    expect(await screen.findByText('Stopped watching “Zanzibar Trading”.')).toBeInTheDocument();
    expect(screen.getByText('No name is watched yet.')).toBeInTheDocument();
  });

  it('shows a refusal in the server’s words', async () => {
    mockApi({[LIST]: watchlistBody('inv-1', [entry()]), [ADD]: {status: 400, body: {detail: '“Zanzibar Trading” is already watched'}}});
    wrap(<Watchlist investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name or search to watch'), 'zanzibar trading');
    await user.click(screen.getByRole('button', {name: 'Watch'}));
    expect(await screen.findByText(/^“Zanzibar Trading” is already watched/)).toBeInTheDocument();
  });

  it('says why a check could not search', () => {
    expect(lastCheck(entry({checked_at: '2026-10-03T09:00:00', check_state: 'not_configured'}) as never))
      .toMatch(/: OpenAleph is not set up here, so the name was not searched\.$/);
    expect(lastCheck(entry({checked_at: '2026-10-03T09:00:00+00:00', check_state: 'error', check_detail: 'OpenAleph answered 502'}) as never))
      .toMatch(/: OpenAleph answered 502$/);
  });
});
