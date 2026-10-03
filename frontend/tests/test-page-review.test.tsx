// @vitest-environment jsdom
// app/review/page.tsx: the one-document-at-a-time review queue added for
// bulk import (2026-09-30). Covers: the extraction-issues banner, the
// rule-based clarifying-question gate on an ambiguous entity proposal,
// accept/reject updating per-document and running totals, Next/Finish
// pagination to the final summary, and the fallback mode that resolves its
// own document list (via ?inv= with no ?docs=) by finding every document in
// the investigation that still has proposed candidates. The stub answers by
// route (ADR-0005, line 15): each test says which documents and proposals
// the server holds.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';

const {searchParamsRef, mockPush} = vi.hoisted(() => ({
  searchParamsRef: {current: new URLSearchParams()},
  mockPush: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  usePathname: () => '/review',
}));

function setParams(query: string) {
  searchParamsRef.current = new URLSearchParams(query);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockPush.mockClear();
});

async function importReviewPage(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/review/page');
  return mod.default;
}

const documentRoute = (id: string) => `GET /api/documents/${id}`;
const candidatesRoute = (id: string) => `GET /api/documents/${id}/candidates`;

function docFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1', investigation_id: 'inv-1', filename: 'memo.txt', source_id: 'src-1',
    extraction_status: 'complete', extraction_error: null, extraction_issues: [],
    chunk_count: 2, candidate_counts: {evidence: 1},
    ...overrides,
  };
}

// A document detail response carrying chunks (Phase 1 split pane): the
// real GET /api/documents/{id} endpoint always includes these, but most
// fixtures above omit them since those tests don't exercise the source pane.
function docWithChunksFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...docFixture(),
    chunks: [
      {id: 'chunk-1', document_id: 'doc-1', ordinal: 1, locator: 'line 1', page_number: null, text: 'Alpha Corporation signed the deal.'},
      {id: 'chunk-2', document_id: 'doc-1', ordinal: 2, locator: 'line 2', page_number: null, text: 'A second, unrelated paragraph.'},
    ],
    ...overrides,
  };
}

function evidenceCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cand-evidence', candidate_type: 'evidence',
    payload: {quote: 'A perfectly ordinary sentence.', locator: 'line 1'},
    review_status: 'proposed', confidence: 1.0,
    ...overrides,
  };
}

function ambiguousEntityCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cand-entity', candidate_type: 'entity',
    payload: {caption: 'Alaric Voss', suggested_schema: 'Person'},
    review_status: 'proposed', confidence: 0.4,
    ...overrides,
  };
}

describe('Document review queue: issues and clarifying questions', () => {
  it('shows the extraction-issues banner and lets the reporter accept a plain proposal', async () => {
    setParams('inv=inv-1&docs=doc-1');
    const review = 'POST /api/extraction-candidates/cand-evidence/review';
    const api = mockApi({
      [documentRoute('doc-1')]: docFixture({extraction_issues: ['1 of 2 page(s) produced no extractable text.']}),
      [candidatesRoute('doc-1')]: [evidenceCandidate()],
      [review]: {candidate: {id: 'cand-evidence', review_status: 'accepted'}, record: {}},
    });

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByTestId('issue-banner');
    expect(screen.getByText(/1 of 2 page\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Document 1 of 1')).toBeInTheDocument();
    // The queue asks for the proposals still open, with their explanations.
    expect(api.lastUrl(candidatesRoute('doc-1')).searchParams.get('status')).toBe('proposed');
    expect(api.lastUrl(candidatesRoute('doc-1')).searchParams.get('explain')).toBe('true');

    await userEvent.setup().click(screen.getByRole('button', {name: 'Accept'}));

    await screen.findByText('No proposals were generated from what could be parsed.');
    expect(api.calls(review)).toHaveLength(1);
    expect(api.lastBody(review)).toMatchObject({decision: 'accept'});
    expect(api.unmatched()).toEqual([]);
  });

  it('gates Accept on an ambiguous entity until the clarifying question is answered, then sends the chosen schema', async () => {
    setParams('inv=inv-1&docs=doc-1');
    const review = 'POST /api/extraction-candidates/cand-entity/review';
    const api = mockApi({
      [documentRoute('doc-1')]: docFixture(),
      [candidatesRoute('doc-1')]: [ambiguousEntityCandidate()],
      [review]: {candidate: {}, record: {}},
      // No record shares its words and OpenAleph holds nothing like it.
      'GET /api/extraction-candidates/cand-entity/entity-matches': {candidate_id: 'cand-entity', caption: 'Alaric Voss', schema: 'Person',
        matches: [], strong_match: null, provider_lead: {provider: null, provider_entity_id: null, provider_resolved_entity_id: null}, identity_rule: ''},
      'GET /api/extraction-candidates/cand-entity/openaleph-matches': {candidate_id: 'cand-entity', schema: 'Person', state: 'ok', detail: null, hidden: 0, results: []},
    });

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    const card = await screen.findByTestId('candidate-cand-entity');
    expect(within(card).getByText(/Is "Alaric Voss" a Person or an Organization\?/)).toBeInTheDocument();
    const acceptButton = within(card).getByRole('button', {name: 'Accept'});
    expect(acceptButton).toBeDisabled();

    const user = userEvent.setup();
    // "Person" is the suggested answer for this fixture (no org suffix
    // matched) -- click it to confirm.
    await user.click(within(card).getByRole('button', {name: /^Person/}));
    expect(acceptButton).toBeEnabled();
    expect(api.calls(review)).toHaveLength(0);

    await user.click(acceptButton);
    expect(api.calls(review)).toHaveLength(1);
    expect(api.lastBody(review)).toEqual({
      decision: 'accept', note: 'Reviewed in bulk-import review queue', caption: 'Alaric Voss', entity_schema: 'Person',
    });
    expect(api.unmatched()).toEqual([]);
  });

  it('paginates Next across documents and reaches a final summary with running totals', async () => {
    setParams('inv=inv-1&docs=doc-1,doc-2');
    const api = mockApi({
      [documentRoute('doc-1')]: docFixture(),
      [candidatesRoute('doc-1')]: [evidenceCandidate()],
      [documentRoute('doc-2')]: docFixture({id: 'doc-2', filename: 'second.txt'}),
      [candidatesRoute('doc-2')]: [],
    });

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByText('Document 1 of 2');
    // The second document is not loaded until the reporter moves on to it.
    expect(api.calls(documentRoute('doc-2'))).toHaveLength(0);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Next document'}));

    await screen.findByText('second.txt');
    expect(screen.getByText('Document 2 of 2')).toBeInTheDocument();
    expect(api.calls(documentRoute('doc-2'))).toHaveLength(1);
    expect(api.calls(candidatesRoute('doc-2'))).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Finish'}));

    await screen.findByTestId('review-summary');
    expect(screen.getByText(/2 document\(s\) reviewed this session/)).toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });

  it('walks a recorded import in its own order, from the document the reporter chose', async () => {
    setParams('inv=inv-1&batch=batch-1&start=doc-b');
    const api = mockApi({
      'GET /api/ingestion-batches/batch-1': {id: 'batch-1', investigation_id: 'inv-1', label: 'Bulk import', created_by: null,
        created_at: '2026-10-03T01:00:00', items: [], documents: [], review_order: ['doc-a', 'doc-b', 'doc-c']},
      [documentRoute('doc-b')]: docFixture({id: 'doc-b', filename: 'scan.pdf'}),
      [candidatesRoute('doc-b')]: [],
    });

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByText('Document 1 of 3');
    await screen.findByText('scan.pdf');
    expect(api.calls('GET /api/investigations/inv-1/documents')).toHaveLength(0);   // no scan of the whole investigation
    expect(api.unmatched()).toEqual([]);
  });

  it('falls back to every document in the investigation that still has proposed candidates when no ?docs= is given', async () => {
    setParams('inv=inv-1');
    const api = mockApi({
      'GET /api/investigations/inv-1/documents': [docFixture({id: 'doc-a'}), docFixture({id: 'doc-b', filename: 'clean.txt'})],
      [candidatesRoute('doc-a')]: [evidenceCandidate()], // doc-a: one proposal still open
      [candidatesRoute('doc-b')]: [], // doc-b: none, fully reviewed already
      [documentRoute('doc-a')]: docFixture({id: 'doc-a'}),
    });

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByText('Document 1 of 1');
    await screen.findByText('memo.txt');
    // Every document was checked for open proposals; only doc-a was opened.
    expect(api.calls(candidatesRoute('doc-b'))).toHaveLength(1);
    expect(api.calls(documentRoute('doc-a'))).toHaveLength(1);
    expect(api.calls(documentRoute('doc-b'))).toHaveLength(0);
    expect(api.unmatched()).toEqual([]);
  });

  it('shows a clean empty state when nothing needs review', async () => {
    setParams('inv=inv-1');
    const api = mockApi({'GET /api/investigations/inv-1/documents': []});

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByText(/Nothing here needs review right now/);
    expect(api.unmatched()).toEqual([]);
  });
});

describe('Document review queue: split-pane source highlighting', () => {
  it('highlights only the hovered candidate\'s exact span, in its own chunk, and clears on mouse-leave', async () => {
    setParams('inv=inv-1&docs=doc-1');
    const entity = ambiguousEntityCandidate({
      id: 'cand-entity', chunk_id: 'chunk-1',
      payload: {caption: 'Alpha Corporation', suggested_schema: 'Organization', span: {start_char: 0, end_char: 17}},
    });
    const evidence = evidenceCandidate({
      id: 'cand-evidence', chunk_id: 'chunk-2',
      payload: {quote: 'A second, unrelated paragraph.', locator: 'line 2', span: {start_char: 0, end_char: 30}},
    });
    mockApi({
      [documentRoute('doc-1')]: docWithChunksFixture(),
      [candidatesRoute('doc-1')]: [entity, evidence],
    });

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    const sourcePane = await screen.findByTestId('source-pane');
    // Nothing highlighted yet -- no candidate is focused/hovered.
    expect(within(sourcePane).queryByTestId('source-highlight')).not.toBeInTheDocument();

    // One shared session for every hover/unhover below: user-event tracks
    // pointer position per-session, so a fresh setup() per call has no
    // memory of a prior hover and unhover becomes a no-op.
    const user = userEvent.setup();
    const entityCard = screen.getByTestId('candidate-cand-entity');
    await user.hover(entityCard);

    const highlight = within(sourcePane).getByTestId('source-highlight');
    expect(highlight).toHaveTextContent('Alpha Corporation');
    // The other chunk's evidence span must not also be lit up at the same time.
    expect(within(sourcePane).getAllByTestId('source-highlight')).toHaveLength(1);

    await user.unhover(entityCard);
    expect(within(sourcePane).queryByTestId('source-highlight')).not.toBeInTheDocument();

    const evidenceCard = screen.getByTestId('candidate-cand-evidence');
    await user.hover(evidenceCard);
    expect(within(sourcePane).getByTestId('source-highlight')).toHaveTextContent('A second, unrelated paragraph.');
  });

  it('renders plain chunk text with no crash when a document has no extracted chunks', async () => {
    setParams('inv=inv-1&docs=doc-1');
    mockApi({
      [documentRoute('doc-1')]: docFixture(), // no chunks field at all
      [candidatesRoute('doc-1')]: [evidenceCandidate()],
    });

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByTestId('source-pane');
    expect(screen.getByText(/No extracted source text is available/)).toBeInTheDocument();
  });
});
