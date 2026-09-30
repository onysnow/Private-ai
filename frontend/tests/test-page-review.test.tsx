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
    expect(screen.getByText('memo.txt')).toBeInTheDocument();
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
