// @vitest-environment jsdom
// Act › Red Flags (mockup ACT_1): one ranking with marks, the filters with count and Reset, the level ladder,
// "Before you call it" as a checklist kept on the flag, the parties carrying flags, and the A / X keys.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RedFlagsBoard, ladder} from '../features/act/red-flags-board';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/act', useSearchParams: () => new URLSearchParams()}));

const indicator = (id: string, name: string, levels: Record<string, string>) => ({
  id, name, definition: 'x', area: id.slice(0, 2), area_name: id.startsWith('ML') ? 'Money laundering' : 'Hidden ownership',
  levels: {faint: 'To be set by Ony', strong: 'To be set by Ony', textbook: 'Meets the published definition as worded', threshold_source: 'none', threshold_note: 'The band is not a rule.', ...levels},
  sources: [{title: 'Concealment of Beneficial Ownership', publisher: 'FATF', url: 'https://example.test/fatf', locator: 'Annex E', quote: 'complexity that makes no commercial sense'}],
  innocent_explanations: ['Group cross-holdings', 'Treasury shares'], cross_hints: [], version: 1,
});
const flag = (id: string, ind: ReturnType<typeof indicator>, level: string, weight: number, extra: Record<string, unknown> = {}) => ({
  id, indicator_id: ind.id, rule_version: 2, level, status: 'open', dismissed_reason: null, lead_id: null, weight, weight_parts: [],
  parties: [{id: 'hn', name: 'Harbour Nominees', schema: 'Company'}, {id: 'fh', name: 'Fernhill Ltd', schema: 'Company'}, {id: 'ks', name: 'Kestrel SA', schema: 'Company'}],
  links: ['l1'], facts: {unreviewed_links: ['l1'], band_reason: 'Found 4.'}, not_shown: ['whether the money was cash', 'whether it was split'],
  summary: `${ind.name} in the records.`, checks: [{id: 'ck1', question: 'whether the money was cash', status: 'open'}],
  first_seen_at: '2026-10-09T00:00:00', last_seen_at: '2026-10-10T00:00:00', gone_at: null,
  innocent: [{text: 'Group cross-holdings', state: 'not_looked_at', note: null}, {text: 'Treasury shares', state: 'not_looked_at', note: null}],
  indicator: ind, ...extra,
});
const ML = indicator('ML-021', 'Structuring below reporting thresholds', {faint: 'Two or more payments in the band'});
const BO = indicator('BO-001', 'Circular ownership', {});
const flags = [flag('f1', ML, 'faint', 1.2), flag('f2', BO, 'textbook', 0.9, {parties: [{id: 'ks', name: 'Kestrel SA', schema: 'Company'}], facts: {}})];
const body = (fs: unknown[]) => ({investigation_id: 'inv-1', rules: [{indicator_id: 'BO-001', version: 1, name: 'Circular ownership'}, {indicator_id: 'ML-021', version: 2, name: 'Structuring'}],
  cannot_run: [], flags: fs, gone: [], investigation_type: {set_by: 'app', areas: [], suggested: []}});
const routes = {'GET /api/investigations/inv-1/red-flags': body(flags),
  'GET /api/investigations/inv-1/financial-flows': {investigation_id: 'inv-1', transactions: [], incomplete: [], currencies: [], flow_type_rule: '', duplicate_rule: ''}};
const renderBoard = () => render(<QueryProvider><RedFlagsBoard investigationId="inv-1"/></QueryProvider>);

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', flag: null}); window.localStorage.clear(); });
afterEach(() => cleanup());

describe('the level ladder', () => {
  it('marks the rung reached, says when a rung has no published threshold, and names the facts Textbook needs', () => {
    const rungs = ladder(flags[0] as never);
    expect(rungs.map(r => [r.level, r.state])).toEqual([['textbook', 'needs'], ['strong', 'not_set'], ['faint', 'met']]);
    expect(rungs[0].needs).toEqual(['whether the money was cash', 'whether it was split']);
    expect(rungs[1].text).toBe('No published threshold for this rung yet.');
    expect(rungs[2].text).toBe('Found 4.');
  });
});

describe('RedFlagsBoard', () => {
  it('ranks Textbook first, marks what rests on an unshown link, and counts the parties carrying flags', async () => {
    mockApi(routes);
    renderBoard();
    const list = await screen.findByRole('listbox', {name: 'Red Flags, ranked'});
    const rows = await within(list).findAllByRole('option');
    expect(rows[0]).toHaveAccessibleName('Rank 1, Textbook, Circular ownership, Kestrel SA');
    expect(rows[1]).toHaveAccessibleName('Rank 2, Faint, Structuring below reporting thresholds, Harbour Nominees and Fernhill Ltd and 1 more');
    expect(rows[1]).toHaveTextContent('○ rests on 1 link not yet shown');
    expect(screen.getByRole('button', {name: 'Kestrel SA: 2 flags'})).toBeInTheDocument();
    expect(document.querySelector('.rb-count-reset')).toHaveTextContent('2 of 2 flags');
    expect(document.querySelector('.rb-coverage')).toHaveTextContent('2 of 2 record rules ran');
  });

  it('filters by level and by party, with a count and Reset', async () => {
    mockApi(routes);
    renderBoard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Textbook 1/}));
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    expect(document.querySelector('.rb-count-reset')).toHaveTextContent('1 of 2 flags · Reset');
    await user.click(screen.getByRole('button', {name: 'Reset'}));
    await user.click(screen.getByRole('button', {name: 'Harbour Nominees: 1 flag'}));
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });

  it('keeps the innocent explanations as a checklist: ruling one out needs what ruled it out', async () => {
    const api = mockApi({...routes, 'POST /api/red-flags/f2/innocent': body([flags[0], {...flags[1],
      innocent: [{text: 'Group cross-holdings', state: 'ruled_out', note: 'No cross-holdings in the filings'}, {text: 'Treasury shares', state: 'not_looked_at', note: null}]}])});
    renderBoard();
    const before = await screen.findByRole('complementary', {name: 'Before you call it'});
    expect(await within(before).findByText('Could be innocent · 0 of 2 checked')).toBeInTheDocument();
    expect(within(before).getByText('whether the money was cash')).toBeInTheDocument();
    expect(within(before).getByText(/complexity that makes no commercial sense/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(before).getAllByRole('button', {name: 'Rule out…'})[0]);
    const input = within(before).getByRole('textbox', {name: 'What ruled out: Group cross-holdings'});
    expect(within(before).getByRole('button', {name: 'Rule out'})).toBeDisabled();
    await user.type(input, 'No cross-holdings in the filings');
    await user.click(within(before).getByRole('button', {name: 'Rule out'}));
    await waitFor(() => expect(api.calls('POST /api/red-flags/f2/innocent')).toHaveLength(1));
    expect(api.lastBody('POST /api/red-flags/f2/innocent')).toEqual({text: 'Group cross-holdings', state: 'ruled_out', note: 'No cross-holdings in the filings'});
    expect(await within(before).findByText('Could be innocent · 1 of 2 checked')).toBeInTheDocument();
    expect(within(before).getByText('Ruled out: No cross-holdings in the filings')).toBeInTheDocument();
  });

  it('A adds the open flag to leads; X asks why before setting it aside; a money flag links to the money view', async () => {
    const api = mockApi({...routes, 'POST /api/red-flags/f2/lead': {status: 500, body: {detail: 'nope'}}});
    renderBoard();
    const open = await screen.findByRole('region', {name: 'The open Red Flag'});
    await within(open).findByRole('button', {name: /Add to leads/});
    const board = open.closest('.rb')!;
    fireEvent.keyDown(board, {key: 'a'});
    await waitFor(() => expect(api.calls('POST /api/red-flags/f2/lead')).toHaveLength(1));
    fireEvent.keyDown(board, {key: 'x'});
    expect(within(open).getByLabelText('Why set it aside?')).toBeInTheDocument();
    expect(within(open).getByRole('button', {name: 'Set aside'})).toBeDisabled();
    fireEvent.keyDown(board, {key: 'j'});
    expect(await within(screen.getByRole('region', {name: 'The open Red Flag'})).findByRole('link', {name: 'Show in money flows'})).toHaveAttribute('href', expect.stringContaining('/see'));
    expect(within(screen.getByRole('region', {name: 'The open Red Flag'})).getByRole('button', {name: 'Share'})).toBeDisabled();
  });
});
