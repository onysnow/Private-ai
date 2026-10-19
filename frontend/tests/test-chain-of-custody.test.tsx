// @vitest-environment jsdom
// Check › Chain of Custody (mockup CHECK_2): the seal, one row of cards per piece of evidence from the file to the
// claim, the detail panel with Re-check hash, the custody log and its export, L for the log as a list.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({useRouter: () => ({push})}));

import {ChainOfCustody, logTable, sealLine} from '../features/custody/chain-of-custody';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const SHA = 'a3f907c2'.padEnd(60, '0') + '5d1e';
const card = (id: string, kind: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, kind, title, lines: [], who: null, actor: 'app', when: '2026-10-02T09:14:00Z', checks: [], wire: {style: 'worked_out', words: ''},
  document_id: null, sha256: null, text: null, quote: null, page: null, ...extra,
});
const CHAIN = {
  claim: {id: 'c1', text: 'Harbour Nominees Ltd held 40% of Fernhill Ltd from March 2018', status: 'supported', confidence: 0.8},
  rows: [
    {evidence_id: 'e1', stance: 'supports', source: {title: 'Stock transfer form J30', source_type: 'document', tier: 'A', issuer: null},
      anchor: {start: 27, end: 79, exact: true}, rests_on: [{kind: 'claim', id: 'c1', label: 'Harbour Nominees Ltd held 40%', level: null},
        {kind: 'flag', id: 'f1', label: 'Red Flag BO-031', level: 'strong'}], cards: [
      card('file:e1', 'file', 'Fernhill_share_transfer_2018.pdf', {who: 'Ony', actor: 'person', checks: [{label: 'hash', ok: true}], document_id: 'd1', sha256: SHA,
        lines: ['uploaded by Ony · 02 Oct 09:14'], wire: {style: 'worked_out', words: 'read by the app'}}),
      card('read:e1', 'reading', 'Page 3 of 4', {who: 'App reader', lines: ['read by OCR', 'app reader'], checks: [{label: 'OCR', ok: true}], wire: {style: 'worked_out', words: 'p.3'}}),
      card('passage:e1', 'passage', 'Passage · page 3 (OCR)', {text: 'to the person named below: Harbour Nominees Limited, being forty per cent (40%) of the issued share capital',
        quote: 'Harbour Nominees Limited, being forty per cent (40%)', page: 3, checks: [{label: 'says it', ok: true}], wire: {style: 'proposed', words: 'proposed'}}),
      card('decision:e1', 'decision', 'Proposed', {who: 'a person', actor: 'person', lines: ['Name-finder · entity · 0.78', 'accepted by a person'],
        checks: [{label: 'accepted', ok: true}], wire: {style: 'confirmed', words: 'supports'}}),
    ]},
    {evidence_id: 'e2', stance: 'contradicts', cards: [
      card('source:e2', 'source', 'Companies House CS01', {actor: 'person', quote: 'Shareholder: Kestrel SA, 100%', lines: ['https://example.test/cs01'], wire: {style: 'confirmed', words: 'quoted'}}),
      card('decision:e2', 'decision', 'Answered', {actor: 'person', who: 'a person', lines: ['filed 14 Dec 2017, before the transfer'], wire: {style: 'against', words: 'against'}}),
    ]},
  ],
  ai: [{id: 'ai1', module: 'case_synthesis', status: 'pending', when: '2026-10-10T14:02:00Z', run_id: 'job-9'}],
  log: [
    {when: '2026-10-02T09:14:00Z', who: 'Ony', actor: 'person', what: 'Uploaded Fernhill_share_transfer_2018.pdf · SHA-256 recorded at intake', card: 'file:e1'},
    {when: '2026-10-02T09:15:00Z', who: 'App reader', actor: 'app', what: 'Read 4 pages of Fernhill_share_transfer_2018.pdf by OCR', card: 'read:e1'},
    {when: '2026-10-10T14:02:00Z', who: 'AI · case synthesis', actor: 'ai', what: 'Quoted the claim in a draft (not accepted yet)', card: 'ai:ai1'},
  ],
  seal: {steps: 7, people: 1, app_services: 2, outside_services: 0, hashes_intact: true, hashes_checked: 1, ai_uses: 1, sources_for: 1, against: 1},
  done: {claim_id: 'c1', target: 'supported', met: false, left: 1, unknown: 0, rules: [
    {key: 'supporting', label: 'At least one supporting item is linked', state: 'met', detail: '1 supporting item'},
    {key: 'says_it', label: 'Every supporting quote says it, in its document', state: 'met', detail: '1 found word for word'},
    {key: 'locator', label: 'Every supporting item has an exact locator', state: 'not_met', detail: '1 without a page, paragraph or timestamp.'},
    {key: 'file', label: 'The file behind each item still matches its fingerprint', state: 'met', detail: '1 file checked'},
    {key: 'contradictions', label: 'Every contradicting item has a written answer', state: 'met', detail: '1 answered'},
    {key: 'not_leads_only', label: 'Not resting on leads-only sources alone', state: 'met', detail: 'At least one supporting source is above the leads-only tier.'},
  ]},
  checked_at: '2026-10-12T00:00:00Z',
};
const routes = {
  'GET /api/investigations/inv-1/claims': [{id: 'c1', investigation_id: 'inv-1', text: CHAIN.claim.text, status: 'supported', confidence: 0.8, created_at: '2026-10-01T00:00:00'}],
  'GET /api/claims/c1/custody-chain': CHAIN,
};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', chain: null, document: null}); });
afterEach(() => cleanup());

describe('Chain of Custody', () => {
  it('writes the seal a methods note can carry, and the log as a plain table', () => {
    expect(sealLine(CHAIN as never)).toBe('7 steps · 1 person · 2 app services · 0 outside services · hashes intact · 1 AI use');
    const table = logTable(CHAIN as never).split('\n');
    expect(table[3]).toBe('When (UTC)\tWho\tKind\tWhat was done');
    expect(table[4]).toBe('2026-10-02T09:14:00Z\tOny\tperson\tUploaded Fernhill_share_transfer_2018.pdf · SHA-256 recorded at intake');
  });

  it('draws a row of steps for each piece of evidence, for and against, and the claim at the end', async () => {
    mockApi(routes);
    render(<QueryProvider><ChainOfCustody investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText(/7 steps · 1 person/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /^File: Fernhill_share_transfer_2018\.pdf\. hash passed$/})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /^Passage: .*says it passed$/})).toBeInTheDocument();
    // The claim card carries the server's Done checklist for Supported: each rule met or not, and what it waits on.
    const claim = screen.getByRole('article', {name: `The claim: ${CHAIN.claim.text}`});
    const done = within(claim).getByLabelText('Done for Supported');
    expect(done).toHaveTextContent('Done for Supported · 1 left');
    expect(within(done).getByLabelText('Every contradicting item has a written answer: met. 1 answered')).toHaveTextContent('✓ against answered');
    expect(within(done).getByLabelText('Every supporting item has an exact locator: not met. 1 without a page, paragraph or timestamp.'))
      .toHaveTextContent('✕ each says wherewaits on: 1 without a page, paragraph or timestamp.');
    expect(within(done).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('article', {name: 'AI step'})).toHaveTextContent('Case synthesis draft quoted this claim');
    // The passage opens first in the detail panel, with its words lit.
    const detail = screen.getByRole('complementary', {name: 'Step 3 of 4: Passage'});
    expect(detail.querySelector('mark')).toHaveTextContent('Harbour Nominees Limited, being forty per cent (40%)');
    expect(within(detail).getByText(/a3f9 07c2 … 5d1e/)).toBeInTheDocument();
    expect(detail).toHaveTextContent('Stock transfer form J30, page 3');
    expect(detail).toHaveTextContent('exact quote at characters 27–79 of the passage');
    expect(within(detail).getByText(/Red Flag BO-031/)).toBeInTheDocument();
    // The AI step leads to its run.
    await userEvent.setup().click(screen.getByRole('button', {name: 'Watch the run →'}));
    expect(useWorkbenchStore.getState().aiRun).toMatchObject({runId: 'job-9'});
    expect(push).toHaveBeenCalledWith('/act?inv=inv-1#ai-runs');
  });

  it('re-checks the file, opens the page, and shows the chain as a list with L', async () => {
    const api = mockApi({...routes, 'POST /api/documents/d1/recheck-hash': {document_id: 'd1', sha256: SHA, matches: true, checked_at: '2026-10-12T10:00:00Z'}});
    render(<QueryProvider><ChainOfCustody investigationId="inv-1"/></QueryProvider>);
    const detail = await screen.findByRole('complementary', {name: 'Step 3 of 4: Passage'});
    const user = userEvent.setup();
    await user.click(within(detail).getByRole('button', {name: 'Re-check hash'}));
    await waitFor(() => expect(api.calls('POST /api/documents/d1/recheck-hash')).toHaveLength(1));
    expect(await within(detail).findByText(/✓ re-checked now/)).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', {name: 'Open page 3'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1', pageNumber: 3});
    await user.click(within(detail).getByRole('button', {name: 'What if this breaks?'}));
    expect(within(detail).getByRole('status')).toHaveTextContent('If this step breaks, everything after it in this row falls, and with it:Claim: Harbour Nominees Ltd held 40%Flag: Red Flag BO-031');
    fireEvent.keyDown(window, {key: 'l'});
    expect(screen.getByRole('list', {name: 'The chain as a list'})).toHaveTextContent('Ony: Uploaded Fernhill_share_transfer_2018.pdf');
    fireEvent.keyDown(window, {key: 'l'});
    await user.click(screen.getByRole('button', {name: /^Source: Companies House CS01/}));
    expect(screen.getByRole('complementary', {name: 'Step 1 of 2: Source'})).toHaveTextContent('Answered: filed 14 Dec 2017, before the transfer');
  });

  it('replays the log as the wheel turns over it, lighting each step\'s card and wires', async () => {
    mockApi(routes);
    const {container} = render(<QueryProvider><ChainOfCustody investigationId="inv-1"/></QueryProvider>);
    const log = await screen.findByRole('region', {name: 'Custody log'});
    fireEvent.pointerEnter(log);
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the dwell
    try {
      // The wheel moves the replay, not the page, while there is a step to move to.
      expect(fireEvent.wheel(log, {deltaY: 100})).toBe(false);
      const rows = within(log).getAllByRole('row');
      expect(rows[0]).toHaveAttribute('aria-current', 'step');
      expect(screen.getByRole('button', {name: /^File: Fernhill/})).toHaveClass('lit');
      expect(container.querySelectorAll('.cc-wire.lit')).toHaveLength(1); // the file's one wire, into the reading
      fireEvent.wheel(log, {deltaY: 100});
      expect(rows[1]).toHaveAttribute('aria-current', 'step');
      expect(screen.getByRole('button', {name: /^Reading: /})).toHaveClass('lit');
      expect(container.querySelectorAll('.cc-wire.lit')).toHaveLength(2); // in from the file, out to the passage
      fireEvent.wheel(log, {deltaY: 100});
      expect(screen.getByRole('article', {name: 'AI step'})).toHaveClass('lit');
      // At the end of the log the page scrolls on.
      expect(fireEvent.wheel(log, {deltaY: 100})).toBe(true);
      expect(rows[2]).toHaveAttribute('aria-current', 'step');
      fireEvent.wheel(log, {deltaY: -100});
      expect(rows[1]).toHaveAttribute('aria-current', 'step');
      fireEvent.mouseLeave(log);
      expect(rows[1]).not.toHaveAttribute('aria-current');
      expect(container.querySelectorAll('.cc-wire.lit')).toHaveLength(0);
    } finally { now.mockRestore(); }
  });

  it('draws the wires in when the chain opens, and at once with reduced motion', async () => {
    mockApi(routes);
    const first = render(<QueryProvider><ChainOfCustody investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('region', {name: 'Custody log'});
    expect(first.container.querySelector('svg.cc-lines')).toHaveClass('draw');
    first.unmount();
    const had = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {configurable: true, value: (q: string) => ({matches: q.includes('reduce'), media: q})});
    try {
      const calm = render(<QueryProvider><ChainOfCustody investigationId="inv-1"/></QueryProvider>);
      await screen.findByRole('region', {name: 'Custody log'});
      expect(calm.container.querySelector('svg.cc-lines')).not.toHaveClass('draw');
    } finally { if (had) Object.defineProperty(window, 'matchMedia', had); else delete (window as {matchMedia?: unknown}).matchMedia; }
  });

  it('opens the claim another panel asked for, and says when there is nothing to trace', async () => {
    mockApi({...routes, 'GET /api/investigations/inv-1/claims': []});
    render(<QueryProvider><ChainOfCustody investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText('No claim yet. A Chain of Custody starts from a claim: add one in Claims.')).toBeInTheDocument();
  });
});
