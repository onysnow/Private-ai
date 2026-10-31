// @vitest-environment jsdom
// The watchlist (features/corpus/watchlist.tsx; backend app/services/watchlists.py):
// a name (with its other names) is watched, checked on demand, each document it
// turns up in shows once as a compact snippet beside the names, the picked one's
// passage opens in the reading room at its page, and becomes a lead or is
// dismissed -- by the reporter.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {aroundMatch, lastCheck, splitAliases, Watchlist, watchQuery} from '../features/corpus/watchlist';
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

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
    expect(await screen.findByText(/^No name is watched yet/)).toBeInTheDocument();
    const user = userEvent.setup();
    // The other names and the reason appear once a name is typed.
    expect(screen.queryByLabelText('Why it is watched')).toBeNull();
    await user.type(screen.getByLabelText('Name or search to watch'), '  Zanzibar Trading ');
    await user.type(screen.getByLabelText('Why it is watched'), 'The shell');
    await user.click(screen.getByRole('button', {name: 'Watch'}));
    expect(await screen.findByText('Watching “Zanzibar Trading”.')).toBeInTheDocument();
    expect(api.lastBody(ADD)).toEqual({query: 'Zanzibar Trading', note: 'The shell'});
    expect(screen.getAllByText(/^Not checked yet/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', {name: 'Check now'}));
    expect(await screen.findByText('Found 2 new document(s).')).toBeInTheDocument();
    expect(screen.getByText('Found in 2 document(s), 2 to decide.')).toBeInTheDocument();
    const where = within(screen.getByRole('list', {name: 'Where “Zanzibar Trading” was found'}));
    expect(where.getAllByText('Zanzibar Trading')[0].tagName).toBe('MARK');
    expect(where.getByText('p. 2')).toBeInTheDocument();
    // Never looked at before: both are new to the reporter.
    expect(where.getAllByLabelText('New since you last looked')).toHaveLength(2);
    await user.click(where.getByText('minutes.txt'));
    await user.click(screen.getByRole('button', {name: /Open at page 2/}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'doc-minutes', pageNumber: 2});
    expect(api.unmatched()).toEqual([]);
  });

  it('watches a name with its other names', async () => {
    const api = mockApi({[LIST]: watchlistBody('inv-1'), [ADD]: watchlistBody('inv-1', [entry({query: 'Low Taek Jho (Jho Low, Jho)'})])});
    wrap(<Watchlist investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name or search to watch'), 'Low Taek Jho');
    await user.type(screen.getByLabelText('Other names'), 'Jho Low, Jho');
    await user.click(screen.getByRole('button', {name: 'Watch'}));
    expect(await screen.findByText('Watching “Low Taek Jho (Jho Low, Jho)”.')).toBeInTheDocument();
    expect(api.lastBody(ADD)).toEqual({query: 'Low Taek Jho (Jho Low, Jho)', note: null});
    // The list shows the name; the other names are a mark, named on hover.
    const names = within(screen.getByRole('list', {name: 'Watched names'}));
    expect(names.getByText('Low Taek Jho')).toBeInTheDocument();
    expect(names.getByLabelText('also Jho Low, Jho')).toBeInTheDocument();
  });

  it('counts only what is new since the reporter last looked at a name', async () => {
    window.localStorage.setItem('wl-looked:inv-1', JSON.stringify({'w-1': Date.parse('2026-10-03T10:00:00Z')}));
    const watched = entry({checked_at: '2026-10-03T12:00:00', check_state: 'local', hits: [
      hit('fresh', {found_at: '2026-10-03T11:00:00'}), hit('old', {found_at: '2026-10-03T09:00:00'})]});
    mockApi({[LIST]: watchlistBody('inv-1', [watched])});
    wrap(<Watchlist investigationId="inv-1"/>);
    expect(await screen.findByLabelText('1 new since you last looked')).toBeInTheDocument();
    const where = within(screen.getByRole('list', {name: 'Where “Zanzibar Trading” was found'}));
    expect(where.getAllByLabelText('New since you last looked')).toHaveLength(1);
    // Searched in the case's own documents is not an alert.
    expect(screen.getByText(/in this investigation's own read documents/).closest('[hidden]')).not.toBeNull();
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
    await screen.findByRole('list', {name: 'Where “Zanzibar Trading” was found'});
    // The first hit is picked; its passage and decisions sit beside the list.
    await user.click(screen.getByRole('button', {name: 'Add to leads'}));
    expect(await screen.findByText('““Zanzibar Trading” in memo.txt” was added to leads.')).toBeInTheDocument();
    expect(api.calls(LIST)).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('button', {name: /To decide/})).toHaveTextContent('To decide 1'));

    await user.click(screen.getByRole('button', {name: 'Dismiss'}));
    expect(await screen.findByText('Found in 2 document(s), 0 to decide.')).toBeInTheDocument();
    // Nothing left to decide: the list shows every hit, each decision as its mark.
    expect(screen.getByRole('button', {name: /^All/})).toHaveAttribute('aria-pressed', 'true');
    const where = within(screen.getByRole('list', {name: 'Where “Zanzibar Trading” was found'}));
    expect(where.getByLabelText('In leads')).toBeInTheDocument();
    expect(where.getByLabelText('Dismissed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Stop watching Zanzibar Trading'}));
    expect(await screen.findByText('Stopped watching “Zanzibar Trading”.')).toBeInTheDocument();
    expect(screen.getByText(/^No name is watched yet/)).toBeInTheDocument();
  });

  it('shows a refusal in the server’s words', async () => {
    mockApi({[LIST]: watchlistBody('inv-1', [entry()]), [ADD]: {status: 400, body: {detail: '“Zanzibar Trading” is already watched'}}});
    wrap(<Watchlist investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name or search to watch'), 'zanzibar trading');
    await user.click(screen.getByRole('button', {name: 'Watch'}));
    expect(await screen.findByText(/^“Zanzibar Trading” is already watched/)).toBeInTheDocument();
  });

  it('reads a name and its other names, and cuts a snippet to its match', () => {
    expect(splitAliases('Low Taek Jho (Jho Low, Jho)')).toEqual({name: 'Low Taek Jho', aliases: ['Jho Low', 'Jho']});
    expect(splitAliases('"Jane Doe" OR Zanzibar')).toEqual({name: '"Jane Doe" OR Zanzibar', aliases: []});
    expect(watchQuery(' Low Taek Jho ', 'Jho Low,, Jho ')).toBe('Low Taek Jho (Jho Low, Jho)');
    expect(watchQuery('Zanzibar', '')).toBe('Zanzibar');
    const cut = aroundMatch([{text: `${'word '.repeat(40)}and then `, match: false}, {text: 'Jho Low', match: true}, {text: ' paid.', match: false}], 20);
    expect(cut[0].text.startsWith('… ')).toBe(true);
    expect(cut[0].text.length).toBeLessThanOrEqual(22);
    expect(cut.slice(1)).toEqual([{text: 'Jho Low', match: true}, {text: ' paid.', match: false}]);
  });

  it('says why a check could not search', () => {
    expect(lastCheck(entry({checked_at: '2026-10-03T09:00:00', check_state: 'not_configured'}) as never))
      .toMatch(/: OpenAleph is not set up here, so the name was not searched\.$/);
    expect(lastCheck(entry({checked_at: '2026-10-03T09:00:00+00:00', check_state: 'error', check_detail: 'OpenAleph answered 502'}) as never))
      .toMatch(/: OpenAleph answered 502$/);
  });
});
