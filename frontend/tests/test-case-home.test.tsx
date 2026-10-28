// @vitest-environment jsdom
// Case home and Decide (features/case-home): the case's question written in place, the
// standing numbers as links, Next up with its answers and keys, an answer held a few
// seconds so Undo works, missing values as their own kind, and the Decide queue.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {CaseHome, continuousYears, sourceLine, yearSpan} from '../features/case-home/case-home';
import {DecideScreen} from '../features/case-home/decide-screen';
import {pageOf} from '../features/case-home/decision-card';
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
  to_decide_by_kind: {to_check: 1, missing: 1}, money: {currency: 'EUR', amount: 29400, payments: 3, from_sources: 1, other_currencies: []},
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

/** A claim proposal from page 2 of filing.pdf, whose document has 1 of 3 pages read. */
function proposal(id: string, band: 'high' | 'medium' | 'low', question: string) {
  const path = `/api/extraction-candidates/${id}/review`;
  return {
    kind: 'proposal', id, question, proposal: 'Claim: the parcel', actor: 'Document reader', actor_kind: 'app', created_at: '2026-10-09T10:00:00', rank: 60,
    reason: `Proposed from filing.pdf · confidence ${band}`, level: null, confidence_band: band,
    group: {key: 'doc:d2', label: 'filing.pdf', pages: 3, pages_read: 1},
    evidence: {document_id: 'd2', filename: 'filing.pdf', locator: 'p. 2', excerpt: 'The parcel was sold.', terms: [], rows: []}, parties: [], consequences: [], known: [],
    choices: [
      {key: 'yes', label: 'Keep it', method: 'POST', path, body: {decision: 'accept'}, happens: 'Creates the claim as Not yet shown, with this passage linked as supporting evidence.'},
      {key: 'no', label: 'Not a claim', method: 'POST', path, body: {decision: 'reject'}, happens: 'Marked rejected, with your reason; no claim is made.'},
    ],
    open: {href: '/review?document=d2', label: 'Open in Review'},
  };
}

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/investigations/inv-1/standing': standing,
    'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {to_check: 1, missing: 1}, total: 2, offset: 0, items: [checkItem, missingItem]},
    'GET /api/investigations/inv-1/claims': [{id: 'c1', investigation_id: 'inv-1', text: 'Kestrel SA bought the harbour land in 2020 with its own funds.', status: 'disputed', confidence: 0.3, created_at: '2026-10-01T00:00:00'}],
    'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', flags: [], gone: [], rules: [], cannot_run: [], type: null},
    'GET /api/investigations/inv-1/documents': [],
    'GET /api/documents/d1/page-image': () => new Response(new Uint8Array([137, 80, 78, 71]), {headers: {'content-type': 'image/png'}}),
    'GET /api/investigations/inv-1/claim-sources': [{claim_id: 'c1', source: 'Board minutes', locator: 'p. 4', count: 3, sources_for: 1, sources_against: 2,
      names: ['Harbour Gazette', 'land register'], leads_open: 0}],
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
    await userEvent.setup().click(await within(card).findByRole('button', {name: /View full page/}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1', pageNumber: 4});
    expect(await screen.findByText('AI draft to review')).toBeInTheDocument();
    expect(screen.getByText('Kestrel SA bought the harbour land in 2020 with its own funds.')).toBeInTheDocument();
    expect(await screen.findByText('1 source for · 2 against · Harbour Gazette, land register')).toBeInTheDocument();
  });

  it('focuses a module with 1–4 and steps inside it with J / K', async () => {
    routes({
      'GET /api/investigations/inv-1/claims': [
        {id: 'c1', investigation_id: 'inv-1', text: 'Kestrel SA bought the harbour land in 2020 with its own funds.', status: 'disputed', confidence: 0.3, created_at: '2026-10-01T00:00:00'},
        {id: 'c2', investigation_id: 'inv-1', text: 'M. Ross signed for Harbour Nominees.', status: 'lead', confidence: 0.3, created_at: '2026-10-01T00:00:00'},
        {id: 'c3', investigation_id: 'inv-1', text: 'Fernhill Ltd paid €29,400.', status: 'supported', confidence: 0.9, created_at: '2026-10-01T00:00:00'},
      ],
    });
    wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    const check = screen.getByRole('region', {name: 'Check'});
    expect(await within(check).findByLabelText('Claims: 1 of 3')).toBeInTheDocument();
    fireEvent.keyDown(window, {key: '2'});
    expect(check).toHaveFocus();
    fireEvent.keyDown(window, {key: 'j'});
    expect(within(check).getByLabelText('Claims: 2 of 3')).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'k'});
    expect(within(check).getByLabelText('Claims: 1 of 3')).toBeInTheDocument();
    fireEvent.keyDown(window, {key: '1'});
    expect(screen.getByRole('region', {name: 'Bring in'})).toHaveFocus();
  });

  it('puts the source one click away when a decision has no passage to show', async () => {
    const aiItem = {...missingItem, kind: 'ai', id: 'ai-1', question: 'Accept this logic check as checked analysis?', proposal: 'Logic check', actor: 'AI', actor_kind: 'ai',
      reason: 'AI draft · asked: Do the conclusions follow?', evidence: null, group: {key: 'ai', label: 'AI drafts'}, consequences: [],
      choices: [{key: 'yes', label: 'Accept', method: 'POST', path: '/api/ai-analysis-candidates/ai-1/review', body: {decision: 'accept'}}],
      open: {href: '/act#ai-reasoning-panel', label: 'Read the whole draft'}};
    routes({'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {ai: 1}, total: 1, offset: 0, items: [aiItem]}});
    wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    const card = await screen.findByTestId('decision-card');
    expect(within(card).getByRole('link', {name: /Read the whole draft/})).toHaveAttribute('href', '/act?inv=inv-1#ai-reasoning-panel');
  });

  it('marks flagged years and lights the years of the party pointed at', async () => {
    routes({
      'GET /api/investigations/inv-1/standing': {...standing, timeline: {...standing.timeline, years: [{year: '2016', events: 4, flags: 0}, {year: '2017', events: 9, flags: 1}, {year: '2018', events: 2, flags: 0}]}},
      'GET /api/investigations/inv-1/graph': {nodes: [{id: 'e1', caption: 'Fernhill Ltd', schema: 'Company'}], edges: [], schemas: [], reconciliation: {hidden_duplicate_edges: 0}},
      'GET /api/entities/e1/years': {entity_id: 'e1', years: [2017, 2018]},
    });
    useWorkbenchStore.setState({pointedParty: 'e1'});
    wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    const rail = await screen.findByRole('navigation', {name: 'Years in the case'});
    expect(await within(rail).findByLabelText('9 events, 1 Red Flag')).toBeInTheDocument();
    expect(within(rail).getByRole('button', {name: /2017/})).toHaveClass('flagged');
    expect(await screen.findByText('lights 2017–18 everywhere')).toBeInTheDocument();
    await waitFor(() => expect(within(rail).getByRole('button', {name: /2018/})).toHaveClass('lit'));
    expect(within(rail).getByRole('button', {name: /2016/})).not.toHaveClass('lit');
  });

  it('shows every year on the rail, a year without events as an empty tick', async () => {
    routes({'GET /api/investigations/inv-1/standing': {...standing, timeline: {...standing.timeline, years: [{year: '2016', events: 4, flags: 0}, {year: '2019', events: 2, flags: 0}]}}});
    wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    const rail = await screen.findByRole('navigation', {name: 'Years in the case'});
    expect(within(rail).getAllByRole('button').map(b => b.querySelector('b')?.textContent)).toEqual(['2016', '2017', '2018', '2019']);
    expect(within(rail).getByRole('button', {name: /2017/})).toHaveClass('empty');
    expect(within(rail).getByRole('button', {name: /2016/})).not.toHaveClass('empty');
  });

  it('says where the document being read is, page by page', async () => {
    routes({
      'GET /api/investigations/inv-1/documents': [{id: 'd9', investigation_id: 'inv-1', filename: 'minutes.pdf', source_id: 'src-d9', mime_type: null, sha256: 'abc', extraction_status: 'extracting',
        extraction_error: null, extraction_issues: [], created_at: '2026-10-12T00:00:00', chunk_count: 0, candidate_counts: {}, parent_document_id: null}],
      'GET /api/jobs': [{id: 'j1', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'd9', status: 'running', finished: false, progress: 43,
        message: 'Reading with OCR · page 6 of 11', error: null, attempts: 1, runner: 'inline', result: null, created_at: '2026-10-12T00:00:00',
        started_at: '2026-10-12T00:00:01', finished_at: null, updated_at: '2026-10-12T00:00:02'}],
    });
    wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);
    expect(await screen.findByText('Reading with OCR · page 6 of 11')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', {name: 'Reading'})).toHaveAttribute('aria-valuenow', '43');
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
    // The key for No opens the reasons, as a click does; pressing it again answers without one.
    fireEvent.keyDown(window, {key: 'd'});
    expect(await screen.findByRole('group', {name: 'Why not'})).toBeInTheDocument();
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

  it('takes a held answer off its chip count at once, and opens the source in its reader with O', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    routes();
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const queue = await screen.findByRole('complementary', {name: 'To decide'});
    expect(await within(queue).findByRole('button', {name: 'All 2'})).toBeInTheDocument();
    await screen.findByRole('heading', {name: checkItem.question});
    fireEvent.keyDown(window, {key: 'o'});
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1', pageNumber: 4});
    fireEvent.keyDown(window, {key: '1'});
    // Held, not yet sent: it leaves the list and its count straight away; Z puts both back.
    expect(within(queue).getByRole('button', {name: 'All 1'})).toBeInTheDocument();
    expect(within(queue).queryByRole('button', {name: /^To check/})).toBeNull();
    fireEvent.keyDown(window, {key: 'z'});
    expect(within(queue).getByRole('button', {name: 'All 2'})).toBeInTheDocument();
    expect(within(queue).getByRole('button', {name: 'To check 1'})).toBeInTheDocument();
  });

  it('groups by source with the pages read, and says what each answer does', async () => {
    routes({'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {proposal: 2}, total: 2, offset: 0,
      items: [proposal('p1', 'high', 'Keep this as a claim to check: “The parcel was sold”?'), proposal('p2', 'low', 'Keep this as a claim to check: “The board met”?')]}});
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const queue = await screen.findByRole('complementary', {name: 'To decide'});
    expect(await within(queue).findByText('filing.pdf')).toBeInTheDocument();
    expect(within(queue).getByText(/pages read: 1 of 3/)).toBeInTheDocument();
    const happens = await screen.findByLabelText('What happens');
    expect(within(happens).getByText('Creates the claim as Not yet shown, with this passage linked as supporting evidence.')).toBeInTheDocument();
    expect(within(happens).getByText('Marked rejected, with your reason; no claim is made.')).toBeInTheDocument();
    expect(within(happens).getByText(/Not a claim/)).toBeInTheDocument();
    // One high proposal is not a batch: no bulk button.
    expect(within(queue).queryByRole('button', {name: /Accept all/})).toBeNull();
  });

  it('accepts all high proposals of a source after a confirmation naming the count, with one undo', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const named = {...proposal('p4', 'high', 'Is “Fernhill Ltd” in this passage the record Fernhill Ltd?'),
      choices: [{key: 'yes', label: 'Same record', method: 'POST', path: '/api/extraction-candidates/p4/review', body: {decision: 'accept', entity_identity_decision: 'same', matched_entity_id: 'e1'}, happens: null}]};
    const api = routes({
      'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {proposal: 4}, total: 4, offset: 0,
        items: [proposal('p1', 'high', 'Keep A?'), proposal('p2', 'high', 'Keep B?'), proposal('p3', 'medium', 'Keep C?'), named]},
      'POST /api/extraction-candidates/p1/review': {candidate: {}, record: null}, 'POST /api/extraction-candidates/p2/review': {candidate: {}, record: null},
    });
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const queue = await screen.findByRole('complementary', {name: 'To decide'});
    // The name that asks same-or-new and the medium one are left out.
    fireEvent.click(await within(queue).findByRole('button', {name: '✓ Accept all 2 high'}));
    const confirm = within(queue).getByRole('group', {name: 'Accept all 2 high'});
    expect(within(confirm).getByText(/proposals rated high in filing\.pdf/)).toBeInTheDocument();
    expect(within(confirm).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Keep A?', 'Keep B?']);
    fireEvent.click(within(confirm).getByRole('button', {name: 'Accept 2'}));
    expect(await screen.findByText('✓ Accepted 2')).toBeInTheDocument();
    expect(within(queue).queryByText('Keep A?')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: /Undo all 2/}));
    expect(await within(queue).findByText('Keep A?')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(HOLD_MS + 100); });
    expect(api.calls('POST /api/extraction-candidates/p1/review')).toHaveLength(0);
    fireEvent.click(within(queue).getByRole('button', {name: '✓ Accept all 2 high'}));
    fireEvent.click(within(queue).getByRole('button', {name: 'Accept 2'}));
    act(() => { vi.advanceTimersByTime(HOLD_MS + 100); });
    await waitFor(() => expect(api.calls('POST /api/extraction-candidates/p2/review')).toHaveLength(1));
    expect(api.lastBody('POST /api/extraction-candidates/p1/review')).toEqual({decision: 'accept'});
    expect(api.calls('POST /api/extraction-candidates/p4/review')).toHaveLength(0);
  });

  it('keeps the last ten answers, undoing a held one, reopening a saved check, and saying why a saved proposal cannot', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const api = routes({
      'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {to_check: 1, proposal: 1}, total: 2, offset: 0, items: [checkItem, proposal('p1', 'high', 'Keep A?')]},
      'POST /api/checks/chk-1/decide': {investigation_id: 'inv-1', items: [], gone: [], missing: []},
      'POST /api/extraction-candidates/p1/review': {candidate: {}, record: null},
    });
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    await screen.findByRole('heading', {name: checkItem.question});
    fireEvent.keyDown(window, {key: '1'});
    const strip = screen.getByRole('group', {name: 'Last 10'});
    fireEvent.click(within(strip).getByRole('button', {name: `Undo Shows it: ${checkItem.question}`}));
    expect(await screen.findByRole('heading', {name: checkItem.question})).toBeInTheDocument();
    fireEvent.keyDown(window, {key: '1'});
    fireEvent.keyDown(window, {key: '1'});
    act(() => { vi.advanceTimersByTime(HOLD_MS + 100); });
    await waitFor(() => expect(api.calls('POST /api/checks/chk-1/decide')).toHaveLength(1));
    await waitFor(() => expect(api.calls('POST /api/extraction-candidates/p1/review')).toHaveLength(1));
    const saved = await within(strip).findByRole('button', {name: 'Keep it: Keep A? — Saved. Proposals cannot be taken back once sent.'});
    expect(saved).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(saved);
    fireEvent.click(await within(strip).findByRole('button', {name: `Undo Shows it: ${checkItem.question}`}));
    await waitFor(() => expect(api.lastBody('POST /api/checks/chk-1/decide')).toEqual({status: 'open'}));
    expect(api.calls('POST /api/extraction-candidates/p1/review')).toHaveLength(1);
  });

  it('answers No on a watchlist hit at once: its dismiss keeps no reason, so no chips are offered', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const hit = {...checkItem, kind: 'watchlist', id: 'wh-1', level: null, question: 'Is this mention of Fernhill worth a lead?',
      choices: [{key: 'yes', label: 'Add to leads', method: 'POST', path: '/api/watchlist-hits/wh-1/lead', body: {}, happens: 'Opens a lead pointing at this page.'},
                {key: 'no', label: 'Dismiss', method: 'POST', path: '/api/watchlist-hits/wh-1/dismiss', body: {}, happens: 'Dismissed; it leaves the list. A hit keeps no reason.'}]};
    const api = routes({'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {watchlist: 1}, total: 1, offset: 0, items: [hit]},
      'POST /api/watchlist-hits/wh-1/dismiss': {investigation_id: 'inv-1', entries: [], new_hits: 0}});
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    fireEvent.click(await screen.findByRole('button', {name: /Dismiss/}));
    expect(screen.queryByRole('group', {name: 'Why not'})).toBeNull();
    act(() => { vi.advanceTimersByTime(HOLD_MS + 100); });
    await waitFor(() => expect(api.lastBody('POST /api/watchlist-hits/wh-1/dismiss')).toEqual({}));
  });

  it('shows a list that would not load as an error alone, with a retry', async () => {
    let fail = true;
    const api = routes({'GET /api/investigations/inv-1/decisions': () => {
      if (fail) throw new TypeError('Failed to fetch');
      return {investigation_id: 'inv-1', counts: {to_check: 1}, total: 1, offset: 0, items: [checkItem]};
    }});
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load what waits for you.')).toBeInTheDocument();
    expect(within(alert).getByText(/The server did not answer\./)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing waits for you/)).toBeNull();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    fail = false;
    fireEvent.click(within(alert).getByRole('button', {name: 'Retry'}));
    expect(await screen.findByRole('heading', {name: checkItem.question})).toBeInTheDocument();
    expect(api.calls('GET /api/investigations/inv-1/decisions').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a server the case frame could not reach as the same error state, retried by the frame', async () => {
    routes();
    const retry = vi.fn();
    wrap(<DecideScreen investigationId="" investigationName="" unreachable={{error: new Error('Failed to fetch'), retry}}/>);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/The server did not answer\./)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing waits for you/)).toBeNull();
    fireEvent.click(within(alert).getByRole('button', {name: 'Retry'}));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('pageOf', () => {
  it('reads the page a locator names', () => {
    expect(pageOf('p. 4')).toBe(4);
    expect(pageOf('page 12 (OCR)')).toBe(12);
    expect(pageOf('pp. 3–4')).toBe(3);
    expect(pageOf('row 2')).toBeNull();
    expect(pageOf(null)).toBeNull();
  });
});

describe('sourceLine', () => {
  it('says how many sources go each way, or that no passage is linked yet', () => {
    expect(sourceLine(undefined)).toBe('No passage yet');
    expect(sourceLine({count: 0, leads_open: 1})).toBe('No passage yet · 1 lead open');
    expect(sourceLine({count: 2, sources_for: 2, names: ['Filing']})).toBe('2 sources for · Filing');
  });
});

describe('continuousYears', () => {
  it('keeps every year from the first to the last, a year with nothing as an empty tick', () => {
    expect(continuousYears([{year: '2019', events: 1, flags: 0}, {year: '2016', events: 0, flags: 2}]).map(y => [y.year, y.events, y.flags]))
      .toEqual([['2016', 0, 2], ['2017', 0, 0], ['2018', 0, 0], ['2019', 1, 0]]);
    expect(continuousYears([])).toEqual([]);
  });
});

describe('yearSpan', () => {
  it('joins runs of years', () => {
    expect(yearSpan([2018, 2015, 2017])).toBe('2015, 2017–18');
    expect(yearSpan([1999, 2000])).toBe('1999–2000');
  });
});

describe('markTerms', () => {
  it('marks every term, longest first, ignoring case', () => {
    expect(markTerms('Acting On behalf of F. Ltd', ['on behalf of', 'on'])).toEqual([{text: 'Acting ', hit: false}, {text: 'On behalf of', hit: true}, {text: ' F. Ltd', hit: false}]);
  });
});

describe('A table-row card', () => {
  afterEach(cleanup);
  it('shows the row cells in place of a passage and what the case already holds', async () => {
    const {DecisionCard} = await import('../features/case-home/decision-card');
    const item = {
      ...checkItem, kind: 'proposal', id: 'p-1', level: null, choices: [], parties: [],
      question: 'Does row 2 show a payment of $65,000,000 from Meridian Holdings Ltd to Bellcastle Trading Group on 23 May 2011?',
      evidence: {document_id: 'd2', filename: 'ledger.csv', locator: 'row 2', excerpt: null, terms: [],
                 rows: [{number: 2, cells: {Date: '2011-05-23', Payer: 'Meridian Holdings Ltd', Amount: '65000000'}}]},
      known: ['Already in the case: $330,000,000 from Meridian Holdings Ltd to Bellcastle Trading Group, no date'],
    } as unknown as Parameters<typeof DecisionCard>[0]['item'];
    wrap(<DecisionCard item={item} position={1} total={1} keys="decide" active={false} onDecide={() => undefined}/>);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', {name: 'Payer'})).toBeTruthy();
    expect(within(table).getByRole('cell', {name: '65000000'})).toBeTruthy();
    expect(screen.queryByText('No passage is stored with this item.')).toBeNull();
    expect(within(screen.getByRole('list', {name: 'Already in the case'})).getByText(/\$330,000,000 from Meridian/)).toBeTruthy();
  });
});
