// @vitest-environment jsdom
// Act › Red Flags (mockup ACT_1): one ranking with marks, the filters with count and Reset, the level ladder,
// "Before you call it" as a checklist kept on the flag, the parties carrying flags, and the A / X keys.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RedFlagsBoard, changesSince, ladder} from '../features/act/red-flags-board';
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
  cannot_run: [], ran_at: '2026-10-10T00:00:00', stale: false, flags: fs, gone: [], investigation_type: {set_by: 'app', areas: [], suggested: []}});
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

describe('reading never writes', () => {
  it('reads the stored flags and, when the rules have never run, runs them once and shows what they found', async () => {
    const api = mockApi({...routes,
      'GET /api/investigations/inv-1/red-flags': {...body([]), ran_at: null, stale: true},
      'POST /api/investigations/inv-1/red-flags/run': body(flags)});
    renderBoard();
    expect(await screen.findByLabelText('Running the rules')).toBeInTheDocument();
    expect(screen.queryByText(/No pattern fires/)).not.toBeInTheDocument();
    const rows = await within(screen.getByRole('listbox')).findAllByRole('option');
    expect(rows).toHaveLength(2);
    expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(1);
    expect(document.querySelector('.rb-run')).toHaveTextContent(/Run the rules\s*ran \d+ days ago/);
  });

  it('does not run the rules when nothing changed since they ran, and runs them on demand with "Run the rules"', async () => {
    const api = mockApi({...routes, 'POST /api/investigations/inv-1/red-flags/run': {...body(flags), ran_at: new Date().toISOString().slice(0, 19)}});
    renderBoard();
    await within(await screen.findByRole('listbox')).findAllByRole('option');
    expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(0);
    expect(screen.getByRole('complementary', {name: 'Before you call it'})).toHaveTextContent(/Rules ran \d+ days ago/);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Run the rules'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(1));
    expect(await screen.findByText('just now')).toBeInTheDocument();
  });

  it('runs a stale read once, even when the answer still reads stale (no run after run)', async () => {
    const api = mockApi({...routes,
      'GET /api/investigations/inv-1/red-flags': {...body(flags), stale: true},
      'POST /api/investigations/inv-1/red-flags/run': {...body(flags), ran_at: '2026-10-11T00:00:00', stale: true}});
    renderBoard();
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(1));
    await new Promise(r => setTimeout(r, 50));
    expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(1);
    expect(await screen.findByText(/the records changed since/)).toBeInTheDocument();
  });

  it('says why when the rules cannot be run (a reader), and keeps showing the stored flags', async () => {
    mockApi({...routes, 'POST /api/investigations/inv-1/red-flags/run': {status: 403, body: {detail: 'Only someone who can edit this case can run the rules'}}});
    renderBoard();
    await within(await screen.findByRole('listbox')).findAllByRole('option');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Run the rules'}));
    expect(await screen.findByText(/Only someone who can edit this case/)).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(2);
  });
});

describe('hover-preview', () => {
  it('pointing at a row previews its flag in the centre; leaving the list brings the chosen flag back; J / K still move', async () => {
    mockApi(routes);
    renderBoard();
    const rows = await within(await screen.findByRole('listbox')).findAllByRole('option');
    expect(screen.getByRole('region', {name: 'The open Red Flag'})).toHaveTextContent('Circular ownership');
    fireEvent.mouseEnter(rows[1]);
    const peek = screen.getByRole('region', {name: 'Preview of a Red Flag'});
    expect(within(peek).getByRole('heading', {name: 'Structuring below reporting thresholds'})).toBeInTheDocument();
    expect(peek).toHaveTextContent(/Preview · click the row to open it/);
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'false');
    fireEvent.mouseLeave(screen.getByRole('listbox'));
    expect(within(screen.getByRole('region', {name: 'The open Red Flag'})).getByRole('heading', {name: 'Circular ownership'})).toBeInTheDocument();
    // J moves the chosen flag (and ends a preview), as before.
    fireEvent.mouseEnter(rows[1]);
    fireEvent.keyDown(rows[0].closest('.rb')!, {key: 'j'});
    expect(screen.queryByRole('region', {name: 'Preview of a Red Flag'})).not.toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(rows[0].closest('.rb')!, {key: 'k'});
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    // Clicking the previewed row opens it.
    fireEvent.mouseEnter(rows[1]);
    fireEvent.click(rows[1]);
    expect(within(screen.getByRole('region', {name: 'The open Red Flag'})).getByRole('heading', {name: 'Structuring below reporting thresholds'})).toBeInTheDocument();
  });
});

describe('scroll over the picture', () => {
  const pay = (id: string, amount: number, date: string, certainty: string) => ({id, relationship_id: id, amount, currency: 'USD', dateTime: date, certainty,
    evidence: certainty === 'not_yet_shown' ? 'bank statement p.3' : null, evidence_count: 0, supporting_evidence_count: 0, status: 'no_claim_dependency',
    flowType: 'direct', from: 'Harbour Nominees', from_entity_id: 'hn', to: 'Fernhill Ltd', to_entity_id: 'fh', statedPurpose: null, transactionNumber: null, locator: null});
  it('steps through the payments one notch at a time, the one in focus ringed and named', async () => {
    const ml = flag('f1', ML, 'faint', 1.2, {links: ['p1', 'p2', 'p3'], facts: {family: 'count_in_band', unreviewed_links: []}});
    mockApi({...routes, 'GET /api/investigations/inv-1/red-flags': body([ml]),
      'GET /api/investigations/inv-1/financial-flows': {investigation_id: 'inv-1', incomplete: [], currencies: [], flow_type_rule: '', duplicate_rule: '',
        transactions: [pay('p1', 9400, '2019-03-12', 'shown'), pay('p2', 9850, '2019-04-26', 'shown'), pay('p3', 9600, '2019-05-23', 'not_yet_shown')]}});
    renderBoard();
    const picture = await screen.findByRole('figure', {name: /scroll over, or use the arrow keys/});
    expect(picture).toHaveTextContent('scroll over to step through · 1 of 3 shown');
    expect(picture.querySelector('.rb-pay-focus')).toHaveTextContent('$9,400 on 12 Mar 2019 · Harbour Nominees → Fernhill Ltd ✓ Shown');
    fireEvent.pointerEnter(picture);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 1000); // past the dwell
    fireEvent.wheel(picture, {deltaY: 100});
    expect(picture).toHaveTextContent('2 of 3 shown');
    fireEvent.wheel(picture, {deltaY: 100});
    expect(picture.querySelector('.rb-pay-focus')).toHaveTextContent('$9,600 on 23 May 2019 · Harbour Nominees → Fernhill Ltd ○ Not yet shown · bank statement p.3');
    expect(picture.querySelectorAll('.rb-pay.focus')).toHaveLength(1);
    fireEvent.wheel(picture, {deltaY: 100});
    expect(picture).toHaveTextContent('3 of 3 shown');
    fireEvent.keyDown(picture, {key: 'ArrowLeft'});
    expect(picture).toHaveTextContent('2 of 3 shown');
    clock.mockRestore();
  });
});

describe('what changed since the last visit', () => {
  const gone = {...flag('g1', indicator('BO-032', 'Unrelated parties share an address', {}), 'faint', 1), gone_at: '2026-10-11T00:00:00'};
  it('lists what is new or no longer fires since the last visit, in order', () => {
    const out = changesSince(flags as never, [gone] as never, '2026-10-08T00:00:00.000Z');
    expect(out.map(c => [c.kind, c.flag.id])).toEqual([['new', 'f1'], ['new', 'f2'], ['gone', 'g1']]);
    expect(changesSince(flags as never, [gone] as never, '2026-10-10T00:00:00.000Z').map(c => c.flag.id)).toEqual(['g1']);
    expect(changesSince(flags as never, [gone] as never, null)).toEqual([]);
  });

  it('plays the changes back once, one at a time, lighting a new flag in the list', async () => {
    window.localStorage.setItem('pai:flags-visit:inv-1', '2026-10-10T12:00:00.000Z');
    mockApi({...routes, 'GET /api/investigations/inv-1/red-flags': {...body([flag('f3', BO, 'textbook', 1, {first_seen_at: '2026-10-11T00:00:00'}), flags[0]]), gone: [gone]}});
    renderBoard();
    const strip = await screen.findByRole('group', {name: 'What changed since your last visit'});
    expect(strip).toHaveTextContent('Since your last visit · 10 Oct: 1 new · 1 no longer fires');
    await waitFor(() => expect(strip).toHaveTextContent('1 of 2 ✚ New BO-001 Circular ownership'));
    // The row is lit by the board after the strip's step renders (an effect), so wait for it too.
    await waitFor(() => expect(document.querySelector('.rb-row.lit')).toHaveAccessibleName(/Circular ownership/));
    await waitFor(() => expect(strip).toHaveTextContent('2 of 2 − No longer fires BO-032 Unrelated parties share an address'), {timeout: 3000});
    await waitFor(() => expect(within(strip).getByRole('button', {name: 'Replay'})).toBeInTheDocument(), {timeout: 3000});
    expect(document.querySelector('.rb-row.lit')).toBeNull();
  });

  it('a kind that changed many times is one step with its count', async () => {
    document.documentElement.dataset.motion = 'calm';
    try {
      window.localStorage.setItem('pai:flags-visit:inv-1', '2026-10-08T12:00:00.000Z');
      mockApi({...routes, 'GET /api/investigations/inv-1/red-flags': body([flags[0], {...flags[0], id: 'f1b'}])});
      renderBoard();
      const strip = await screen.findByRole('group', {name: 'What changed since your last visit'});
      expect(strip).toHaveTextContent('Since your last visit · 8 Oct: 2 new');
      expect(strip.querySelectorAll('.rb-changed-all li')).toHaveLength(1);
      expect(strip).toHaveTextContent('✚ New ML-021 Structuring below reporting thresholds ×2');
    } finally { delete document.documentElement.dataset.motion; }
  });

  it('in calm motion lists every change at once, with no timed playback', async () => {
    document.documentElement.dataset.motion = 'calm';
    try {
      window.localStorage.setItem('pai:flags-visit:inv-1', '2026-10-10T12:00:00.000Z');
      mockApi({...routes, 'GET /api/investigations/inv-1/red-flags': {...body(flags), gone: [gone]}});
      renderBoard();
      const strip = await screen.findByRole('group', {name: 'What changed since your last visit'});
      expect(strip.querySelectorAll('.rb-changed-all li')).toHaveLength(1);
      expect(strip).toHaveTextContent('− No longer fires BO-032');
      expect(strip).not.toHaveTextContent('1 of 1');
    } finally { delete document.documentElement.dataset.motion; }
  });
});
