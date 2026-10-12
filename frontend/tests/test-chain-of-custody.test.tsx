// @vitest-environment jsdom
// Check › Chain of Custody (mockup CHECK_2): the seal, one row of cards per piece of evidence from the file to the
// claim, the detail panel with Re-check hash, the custody log and its export, L for the log as a list.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

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
    {evidence_id: 'e1', stance: 'supports', cards: [
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
  ai: [{id: 'ai1', module: 'case synthesis', status: 'pending', when: '2026-10-10T14:02:00Z'}],
  log: [
    {when: '2026-10-02T09:14:00Z', who: 'Ony', actor: 'person', what: 'Uploaded Fernhill_share_transfer_2018.pdf · SHA-256 recorded at intake', card: 'file:e1'},
    {when: '2026-10-02T09:15:00Z', who: 'App reader', actor: 'app', what: 'Read 4 pages of Fernhill_share_transfer_2018.pdf by OCR', card: 'read:e1'},
    {when: '2026-10-10T14:02:00Z', who: 'AI · case synthesis', actor: 'ai', what: 'Quoted the claim in a draft (not accepted yet)', card: 'ai:ai1'},
  ],
  seal: {steps: 7, people: 1, app_services: 2, outside_services: 0, hashes_intact: true, hashes_checked: 1, ai_uses: 1, sources_for: 1, against: 1},
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
    expect(screen.getByRole('article', {name: `The claim: ${CHAIN.claim.text}`})).toHaveTextContent('✕ 1 against');
    expect(screen.getByRole('article', {name: 'AI step'})).toHaveTextContent('case synthesis draft quoted this claim');
    // The passage opens first in the detail panel, with its words lit.
    const detail = screen.getByRole('complementary', {name: 'Step 3 of 4: Passage'});
    expect(detail.querySelector('mark')).toHaveTextContent('Harbour Nominees Limited, being forty per cent (40%)');
    expect(within(detail).getByText(/a3f907c2…5d1e/)).toBeInTheDocument();
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
    expect(within(detail).getByRole('button', {name: 'What if this breaks?'})).toBeDisabled();
    fireEvent.keyDown(window, {key: 'l'});
    expect(screen.getByRole('list', {name: 'The chain as a list'})).toHaveTextContent('Ony: Uploaded Fernhill_share_transfer_2018.pdf');
    fireEvent.keyDown(window, {key: 'l'});
    await user.click(screen.getByRole('button', {name: /^Source: Companies House CS01/}));
    expect(screen.getByRole('complementary', {name: 'Step 1 of 2: Source'})).toHaveTextContent('none: no file in the case to check it against');
  });

  it('opens the claim another panel asked for, and says when there is nothing to trace', async () => {
    mockApi({...routes, 'GET /api/investigations/inv-1/claims': []});
    render(<QueryProvider><ChainOfCustody investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText('No claim yet. A Chain of Custody starts from a claim: add one in Claims.')).toBeInTheDocument();
  });
});
