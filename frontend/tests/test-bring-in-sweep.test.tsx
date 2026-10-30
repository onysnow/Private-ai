// @vitest-environment jsdom
// Bring in, after the 30 Oct sweep: Search's screen before a search (what can be searched with counts, names to try
// from the case's parties, recent searches, Enter rather than a loud button), the watchlist's named counts and its pane
// for a name found nowhere, and Following's at-rest notice as a mark (an alert only when the disk is not encrypted).
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Watchlist} from '../features/corpus/watchlist';
import {ListAtRest} from '../features/following/following';
import {SearchPanel} from '../features/search/search-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {useLockStore} from '../lib/app-lock';
import type {LockStateOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {corpusSearchBody, entityFixture, watchlistBody} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null, document: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const standing = {
  investigation_id: 'inv-1', claims: {total: 22, supported: 11, disputed: 3, unshown: 8, ruled_out: 0}, to_check: 1, missing: 1, to_decide: 2,
  to_decide_by_kind: {}, money: {currency: 'EUR', amount: 0, payments: 0, starting_payers: 0, others: []},
  timeline: {events: 46, from: '2016', to: '2023', years: []}, documents: {total: 14, unread: 2, failed: 0}, sources: 5, evidence: 9,
  network: {parties: 31, links: 46}, flags: {open: 0, textbook: 0, strong: 0, faint: 0}, leads: {open: 2}, watchlist: {names: 0, new_hits: 0},
};
const searchBody = {query: 'Jho Low', investigation_id: 'inv-1', total: 0, returned: 0, counts: {}, group_counts: {}, facets: {}, results: []};

describe('Search before a search', () => {
  it('shows what can be searched with counts, runs a party as a search, and keeps it as a recent search', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/standing': standing,
      'GET /api/investigations/inv-1/entities': [entityFixture('ent-1', 'Jho Low', 'Person')],
      'GET /api/search': searchBody,
      'GET /api/investigations/inv-1/corpus/search': corpusSearchBody('inv-1'),
      'GET /api/investigations/inv-1/tags': {investigation_id: 'inv-1', tags: []},
    });
    wrap(<SearchPanel investigationId="inv-1"/>);
    const kinds = within(screen.getByRole('region', {name: 'What can be searched'}));
    await waitFor(() => expect(kinds.getByRole('button', {name: /Parties/})).toHaveTextContent('31'));
    expect(kinds.getByRole('button', {name: /Claims and events/})).toHaveTextContent('68');
    expect(kinds.getByRole('button', {name: /Documents/})).toHaveTextContent('14');
    // No search yet: no empty Recent card; a long name to try ends in an ellipsis with the whole name on hover.
    expect(screen.queryByRole('region', {name: 'Recent searches'})).not.toBeInTheDocument();
    const tryName = await within(screen.getByRole('region', {name: 'Names to try'})).findByRole('button', {name: /Jho Low/});
    expect(tryName.closest('.rv')).not.toBeNull();

    const user = userEvent.setup();
    // A kind narrows the next search.
    await user.click(kinds.getByRole('button', {name: /Parties/}));
    expect(screen.getByPlaceholderText('Search parties…')).toBeInTheDocument();
    await user.click(await within(screen.getByRole('region', {name: 'Names to try'})).findByRole('button', {name: /Jho Low/}));
    await waitFor(() => expect(api.lastUrl('GET /api/search').searchParams.get('q')).toBe('Jho Low'));
    expect(api.lastUrl('GET /api/search').searchParams.get('kind')).toBe('party');
    expect(screen.getByLabelText('Search this investigation')).toHaveValue('Jho Low');

    // Clearing goes back to the screen before a search, with the search kept.
    await user.click(screen.getByRole('button', {name: 'Clear the search'}));
    expect(within(screen.getByRole('region', {name: 'Recent searches'})).getByRole('button', {name: 'Jho Low'})).toBeInTheDocument();
  });
});

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'w-1', query: 'Low Taek Jho (Jho Low)', note: 'The financier', created_by: null, created_at: '2026-10-03T08:00:00',
  checked_at: '2026-10-03T09:00:00', check_state: 'local', check_detail: null, hits: [], ...overrides});
const hit = (id: string) => ({id, document_id: `doc-${id}`, title: `${id}.txt`, page_number: null, status: 'new', lead_id: null, found_at: '2026-10-03T09:00:00',
  highlights: [[{text: 'paid ', match: false}, {text: 'Jho Low', match: true}]]});

describe('Watchlist counts and a name found nowhere', () => {
  it('names a count, shows none at zero, and gives a name found nowhere the whole pane', async () => {
    mockApi({'GET /api/investigations/inv-1/watchlist': watchlistBody('inv-1', [
      entry(), entry({id: 'w-2', query: 'Tanore Finance', checked_at: null, check_state: null}), entry({id: 'w-3', query: 'Aabar', hits: [hit('a'), hit('b')]})])});
    wrap(<Watchlist investigationId="inv-1"/>);
    const names = within(await screen.findByRole('list', {name: 'Watched names'}));
    expect(await names.findByRole('button', {name: /^Aabar/})).toHaveTextContent('2 hits');
    expect(names.getByRole('button', {name: /^Low Taek Jho/}).querySelector('.wl-count')).toBeNull();
    expect(names.getByLabelText('Not checked yet')).toBeInTheDocument();

    // Aabar has hits to decide, so it opens first with its passage; a name found nowhere takes both panes.
    expect(screen.getByLabelText('The picked passage')).toBeInTheDocument();
    await userEvent.setup().click(names.getByRole('button', {name: /^Low Taek Jho/}));
    expect(screen.queryByLabelText('The picked passage')).not.toBeInTheDocument();
    expect(screen.getByText('In no document yet')).toBeInTheDocument();
    expect(screen.getByText('The financier', {selector: '.wl-none-note'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Search for it now'})).toBeInTheDocument();
  });
});

describe('Following: the list at rest', () => {
  const lock = (disk: string, protection: string) => useLockStore.setState({state: {protection, locked: false, pin: false,
    disk: {state: disk}} as unknown as LockStateOut});

  it('is a lock mark with its sentence on hover when the disk is encrypted', () => {
    lock('encrypted', 'passphrase');
    render(<ListAtRest/>);
    expect(screen.getByRole('img', {name: 'Protected at rest'})).toBeInTheDocument();
    expect(screen.getByText(/the disk is encrypted; backups are encrypted with your passphrase/).closest('[hidden]')).not.toBeNull();
    cleanup();
    lock('encrypted', 'none');
    render(<ListAtRest/>);
    expect(screen.getByRole('img', {name: 'Partly protected at rest'})).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays an alert when the disk is not encrypted, the sentence and what to do on hover', () => {
    lock('not_encrypted', 'none');
    render(<ListAtRest/>);
    expect(screen.getByRole('alert')).toHaveTextContent('List not encrypted');
    expect(screen.getByText(/Turn on the disk’s encryption/).closest('[hidden]')).not.toBeNull();
  });
});
