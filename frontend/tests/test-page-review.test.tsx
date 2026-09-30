// @vitest-environment jsdom
// app/review/page.tsx: the one-document-at-a-time review queue added for
// bulk import (2026-09-30). Covers: the extraction-issues banner, the
// rule-based clarifying-question gate on an ambiguous entity proposal,
// accept/reject updating per-document and running totals, Next/Finish
// pagination to the final summary, and the fallback mode that resolves its
// own document list (via ?inv= with no ?docs=) by finding every document in
// the investigation that still has proposed candidates.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

async function importReviewPage(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/review/page');
  return mod.default;
}

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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docFixture({extraction_issues: ['1 of 2 page(s) produced no extractable text.']})))
      .mockResolvedValueOnce(jsonResponse([evidenceCandidate()]));
    vi.stubGlobal('fetch', fetchMock);

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByTestId('issue-banner');
    expect(screen.getByText(/1 of 2 page\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Document 1 of 1')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({candidate: {id: 'cand-evidence', review_status: 'accepted'}, record: {}}));
    await userEvent.setup().click(screen.getByRole('button', {name: 'Accept'}));

    await screen.findByText('No proposals were generated from what could be parsed.');
    const [reviewUrl, reviewInit] = fetchMock.mock.calls[2];
    expect(String(reviewUrl)).toContain('/api/extraction-candidates/cand-evidence/review');
    expect(JSON.parse((reviewInit as RequestInit).body as string)).toMatchObject({decision: 'accept'});
  });

  it('gates Accept on an ambiguous entity until the clarifying question is answered, then sends the chosen schema', async () => {
    setParams('inv=inv-1&docs=doc-1');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docFixture()))
      .mockResolvedValueOnce(jsonResponse([ambiguousEntityCandidate()]));
    vi.stubGlobal('fetch', fetchMock);

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

    fetchMock.mockResolvedValueOnce(jsonResponse({candidate: {}, record: {}}));
    await user.click(acceptButton);
    const [, reviewInit] = fetchMock.mock.calls[2];
    expect(JSON.parse((reviewInit as RequestInit).body as string)).toMatchObject({
      decision: 'accept', caption: 'Alaric Voss', entity_schema: 'Person',
    });
  });

  it('paginates Next across documents and reaches a final summary with running totals', async () => {
    setParams('inv=inv-1&docs=doc-1,doc-2');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docFixture()))
      .mockResolvedValueOnce(jsonResponse([evidenceCandidate()]))
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-2', filename: 'second.txt'})))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByText('Document 1 of 2');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Next document'}));

    await screen.findByText('second.txt');
    expect(screen.getByText('Document 2 of 2')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Finish'}));

    await screen.findByTestId('review-summary');
    expect(screen.getByText(/2 document\(s\) reviewed this session/)).toBeInTheDocument();
  });

  it('falls back to every document in the investigation that still has proposed candidates when no ?docs= is given', async () => {
    setParams('inv=inv-1');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([docFixture({id: 'doc-a'}), docFixture({id: 'doc-b', filename: 'clean.txt'})])) // GET investigations/inv-1/documents
      .mockResolvedValueOnce(jsonResponse([evidenceCandidate()])) // doc-a proposed candidates: has one
      .mockResolvedValueOnce(jsonResponse([])) // doc-b proposed candidates: none, fully reviewed already
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-a'}))) // loadDoc(doc-a) detail
      .mockResolvedValueOnce(jsonResponse([evidenceCandidate()])); // loadDoc(doc-a) candidates
    vi.stubGlobal('fetch', fetchMock);

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByText('Document 1 of 1');
    await screen.findByText('memo.txt');
  });

  it('shows a clean empty state when nothing needs review', async () => {
    setParams('inv=inv-1');
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByText(/Nothing here needs review right now/);
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docWithChunksFixture()))
      .mockResolvedValueOnce(jsonResponse([entity, evidence]));
    vi.stubGlobal('fetch', fetchMock);

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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docFixture())) // no chunks field at all
      .mockResolvedValueOnce(jsonResponse([evidenceCandidate()]));
    vi.stubGlobal('fetch', fetchMock);

    const ReviewPage = await importReviewPage();
    render(<ReviewPage />);

    await screen.findByTestId('source-pane');
    expect(screen.getByText(/No extracted source text is available/)).toBeInTheDocument();
  });
});
