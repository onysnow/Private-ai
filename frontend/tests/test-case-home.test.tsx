// @vitest-environment jsdom
// Case home and Decide (features/case-home): the case's question written in place, the
// standing numbers as links, Next up with its answers and keys, an answer held a few
// seconds so Undo works, missing values as their own kind, and the Decide queue.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {CaseHome} from '../features/case-home/case-home';
import {DecideScreen} from '../features/case-home/decide-screen';
import {HOLD_MS, markTerms} from '../features/case-home/use-decisions';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const INV = {id: 'inv-1', name: 'Kestrel SA', description: null, question: 'Who really owns the harbour land?', is_demo: false, type_areas: null, created_at: '2026-10-01T00:00:00'};

const standing = {
  investigation_id: 'inv-1', claims: {total: 22, supported: 11, disputed: 3, unshown: 8, ruled_out: 0}, to_check: 1, missing: 1, to_decide: 2,
  to_decide_by_kind: {to_check: 1, missing: 1}, money: {currency: 'EUR', amount: 29400, payments: 3, other_currencies: []},
  timeline: {events: 46, from: '2016', to: '2023', years: [{year: '2016', events: 4}, {year: '2017', events: 9}]},
  documents: {total: 14, unread: 2, failed: 0}, sources: 5, evidence: 9, network: {parties: 31, links: 46},
  flags: {open: 1, textbook: 1, strong: 0, faint: 0}, leads: {open: 2}, watchlist: {names: 1, new_hits: 0},
};

const checkItem = {
  kind: 'to_check', id: 'chk-1', question: 'Does page 4 show that the harbour parcel was bought on behalf of Fernhill Ltd?',
  proposal: 'Circular ownership: a passage that may show it', actor: 'Red Flags', actor_kind: 'app', created_at: '2026-10-09T10:00:00', rank: 320,
  reason: 'From the Textbook Red Flag Circular ownership', level: 'textbook', group: {key: 'doc:d1', label: 'minutes.pdf'},
  evidence: {document_id: 'd1', filename: 'minutes.pdf', locator: 'p. 4', excerpt: 'settled through a nominee arrangement acting on behalf of F. Ltd', terms: ['nominee arrangement', 'on behalf of']},
  parties: [{id: 'e1', name: 'Fernhill Ltd', schema: 'Company'}], consequences: ['Kept on the flag.'],
  choices: [
    {key: 'yes', label: 'Shows it', method: 'POST', path: '/api/checks/chk-1/decide', body: {status: 'shows'}},
    {key: 'no', label: 'Does not', method: 'POST', path: '/api/checks/chk-1/decide', body: {status: 'does_not'}},
    {key: 'unsure', label: 'Unclear', method: 'POST', path: '/api/checks/chk-1/decide', body: {status: 'unclear'}},
  ],
  open: {href: '/check#to-check', label: 'Open To check'},
};
const missingItem = {
  ...checkItem, kind: 'missing', id: 'mv-1', question: 'How much did Fernhill Ltd pay Kestrel SA?', reason: 'Missing: payment amount on Payment Fernhill Ltd → Kestrel SA',
  level: null, rank: 40, actor: 'Missing values', evidence: null, group: {key: 'missing:MV-PAY-AMT', label: 'Payment amount'},
  consequences: ['While it is missing: Money traced leaves it out.', 'Filling in the value removes this by itself.'],
  choices: [
    {key: 'yes', label: 'Chase it', method: 'POST', path: '/api/checks/mv-1/decide', body: {status: 'chasing'}},
    {key: 'no', label: "Can't be known", method: 'POST', path: '/api/checks/mv-1/decide', body: {status: 'unknowable'}},
    {key: 'unsure', label: "Doesn't apply", method: 'POST', path: '/api/checks/mv-1/decide', body: {status: 'not_needed'}},
  ],
  open: {href: '/see#relationship-graph', label: 'Fill it in'},
};

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/investigations/inv-1/standing': standing,
    'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {to_check: 1, missing: 1}, items: [checkItem, missingItem]},
    'GET /api/investigations/inv-1/claims': [{id: 'c1', investigation_id: 'inv-1', text: 'Kestrel SA bought the harbour land in 2020 with its own funds.', status: 'disputed', confidence: 0.3, created_at: '2026-10-01T00:00:00'}],
    'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', flags: [], gone: [], rules: [], cannot_run: [], type: null},
    'GET /api/investigations/inv-1/documents': [],
    'GET /api/investigations/inv-1/graph': {nodes: [], edges: [], schemas: [], reconciliation: {hidden_duplicate_edges: 0}},
    'GET /api/investigations/inv-1/since': {investigation_id: 'inv-1', after: '2026-10-01T00:00:00', changes: [{key: 'ai', count: 1, label: 'AI draft to review', actor_kind: 'ai', href: '/decide?kind=ai', level: null}]},
    ...extra,
  });
}

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', pointedParty: null, asOf: null});
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Case home', () => {
  it('shows the question, the standing numbers as links and Next up with its evidence', async () => {
    routes();
    window.localStorage.setItem('pai:last-visit:inv-1', '2026-10-01T00:00:00.000Z');
    wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    expect(screen.getByRole('heading', {name: 'Kestrel SA', level: 1})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Who really owns the harbour land?'})).toBeInTheDocument();
    const strip = screen.getByRole('list', {name: 'Where the case stands'});
    await within(strip).findByText('11');
    expect(within(strip).getByRole('link', {name: /3\s*claims disputed/})).toHaveAttribute('href', '/check?inv=inv-1#claim-verification');
    expect(within(strip).getByRole('link', {name: /2\s*to decide/})).toHaveAttribute('href', '/decide?inv=inv-1');
    expect(within(strip).getByText('€29,400')).toBeInTheDocument();
    const card = await screen.findByTestId('decision-card');
    expect(within(card).getByText('From the Textbook Red Flag Circular ownership')).toBeInTheDocument();
    expect(within(card).getByText('nominee arrangement', {selector: 'mark'})).toBeInTheDocument();
    expect(within(card).getByRole('button', {name: /Shows it/})).toHaveAttribute('aria-keyshortcuts', 'S');
    expect(await screen.findByText('AI draft to review')).toBeInTheDocument();
    expect(screen.getByText('Kestrel SA bought the harbour land in 2020 with its own funds.')).toBeInTheDocument();
  });

  it('writes the question in place', async () => {
    const api = routes({'PATCH /api/investigations/inv-1': {...INV, question: 'Who paid for the parcel?'}, 'GET /api/investigations': [INV]});
    wrap(<CaseHome investigation={{...INV, question: null}} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Write the question this case answers'}));
    await user.type(screen.getByRole('textbox', {name: 'The question'}), 'Who paid for the parcel?');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    await waitFor(() => expect(api.lastBody('PATCH /api/investigations/inv-1')).toEqual({question: 'Who paid for the parcel?'}));
  });

  it('holds an answer so it can be undone, then sends it to the endpoint the item names', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const api = routes({'POST /api/checks/chk-1/decide': {investigation_id: 'inv-1', items: [], gone: [], missing: []}});
    wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    await screen.findByTestId('decision-card');
    fireEvent.keyDown(window, {key: 's'});
    expect(await screen.findByText(/Saved in a moment/)).toBeInTheDocument();
    // The next item shows at once: here, the missing value with its own three answers.
    expect(await screen.findByText('How much did Fernhill Ltd pay Kestrel SA?')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Chase it/})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Undo/}));
    expect(await screen.findByText('Does page 4 show that the harbour parcel was bought on behalf of Fernhill Ltd?')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(HOLD_MS + 100); });
    expect(api.calls('POST /api/checks/chk-1/decide')).toHaveLength(0);
    fireEvent.keyDown(window, {key: 'd'});
    act(() => { vi.advanceTimersByTime(HOLD_MS + 100); });
    await waitFor(() => expect(api.lastBody('POST /api/checks/chk-1/decide')).toEqual({status: 'does_not'}));
  });

  it('offers a first case and the sample case when there is none', async () => {
    const api = routes({'POST /api/investigations': INV, 'GET /api/investigations': [INV]});
    const onSwitch = vi.fn();
    wrap(<CaseHome investigation={null} investigations={[]} onSwitch={onSwitch} loading={false}/>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', {name: 'Name'}), 'Kestrel SA');
    await user.type(screen.getByRole('textbox', {name: /The question it answers/}), 'Who really owns the harbour land?');
    await user.click(screen.getByRole('button', {name: 'Start the case'}));
    await waitFor(() => expect(onSwitch).toHaveBeenCalledWith('inv-1'));
    expect(api.lastBody('POST /api/investigations')).toEqual({name: 'Kestrel SA', question: 'Who really owns the harbour land?'});
    expect(screen.getByRole('button', {name: 'Or open the sample case to look around'})).toBeInTheDocument();
  });
});

describe('Decide', () => {
  it('lists every kind with counts, filters, and answers with 1/2/3 and reason chips', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const api = routes({'POST /api/checks/mv-1/decide': {investigation_id: 'inv-1', items: [], gone: [], missing: []}});
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const queue = await screen.findByRole('complementary', {name: 'To decide'});
    expect(await within(queue).findByRole('button', {name: 'All 2'})).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(queue).getByRole('button', {name: 'Missing 1'}));
    expect(await screen.findByRole('heading', {name: 'How much did Fernhill Ltd pay Kestrel SA?'})).toBeInTheDocument();
    expect(screen.getByText(/Money traced leaves it out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Can't be known/}));
    fireEvent.click(screen.getByRole('button', {name: 'Not public'}));
    act(() => { vi.advanceTimersByTime(HOLD_MS + 100); });
    await waitFor(() => expect(api.lastBody('POST /api/checks/mv-1/decide')).toEqual({status: 'unknowable', note: 'Not public'}));
  });
});

describe('markTerms', () => {
  it('marks every term, longest first, ignoring case', () => {
    expect(markTerms('Acting On behalf of F. Ltd', ['on behalf of', 'on'])).toEqual([{text: 'Acting ', hit: false}, {text: 'On behalf of', hit: true}, {text: ' F. Ltd', hit: false}]);
  });
});
