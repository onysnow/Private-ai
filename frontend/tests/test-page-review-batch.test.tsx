// @vitest-environment jsdom
// app/review/batch/page.tsx: the batch triage table shown right after a
// bulk import (design doc "Document Ingestion & Review System Design",
// Phase 1). Covers: the summary count, the "problems only" filter, the
// per-row Review action, and the "Start review (problems first)" action
// that jumps into the one-document review queue starting at the first
// flagged document while still handing it the whole batch to walk through.
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
  usePathname: () => '/review/batch',
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

async function importBatchPage(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/review/batch/page');
  return mod.default;
}

function docFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1', investigation_id: 'inv-1', filename: 'clean.txt', source_id: 'src-1',
    extraction_status: 'complete', extraction_error: null, extraction_issues: [],
    chunk_count: 1, candidate_counts: {evidence: 1},
    ...overrides,
  };
}

describe('Batch triage table', () => {
  it('summarizes the batch and lets the reporter filter to rows with problems', async () => {
    setParams('inv=inv-1&docs=doc-a,doc-b,doc-c');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-a', filename: 'clean.txt'})))
      .mockResolvedValueOnce(jsonResponse(docFixture({
        id: 'doc-b', filename: 'partial.pdf', extraction_issues: ['1 of 2 page(s) produced no extractable text.'], candidate_counts: {evidence: 1, entity: 2},
      })))
      .mockResolvedValueOnce(jsonResponse(docFixture({
        id: 'doc-c', filename: 'broken.docx', extraction_status: 'failed', extraction_error: 'Unsupported or corrupt file', candidate_counts: {},
      })));
    vi.stubGlobal('fetch', fetchMock);

    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    await screen.findByTestId('batch-triage-page');
    expect(screen.getByTestId('triage-summary')).toHaveTextContent('3 document(s) imported · 2 with problems');
    expect(screen.getByTestId('triage-row-doc-a')).toBeInTheDocument();
    expect(screen.getByTestId('triage-row-doc-b')).toBeInTheDocument();
    expect(screen.getByTestId('triage-row-doc-c')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('problems-only-toggle'));

    expect(screen.queryByTestId('triage-row-doc-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('triage-row-doc-b')).toBeInTheDocument();
    expect(screen.getByTestId('triage-row-doc-c')).toBeInTheDocument();

    await user.click(screen.getByTestId('problems-only-toggle'));
    expect(screen.getByTestId('triage-row-doc-a')).toBeInTheDocument();
  });

  it('jumps a per-row Review click into the one-document queue starting at that document', async () => {
    setParams('inv=inv-1&docs=doc-a,doc-b');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-a', filename: 'first.txt'})))
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-b', filename: 'second.txt'})));
    vi.stubGlobal('fetch', fetchMock);

    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    const rowB = await screen.findByTestId('triage-row-doc-b');
    await userEvent.setup().click(within(rowB).getByRole('button', {name: 'Review'}));

    expect(mockPush).toHaveBeenCalledWith('/review?inv=inv-1&docs=doc-b,doc-a');
  });

  it('"Start review" jumps to the first flagged document, keeping the rest of the batch queued behind it', async () => {
    setParams('inv=inv-1&docs=doc-a,doc-b,doc-c');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-a', filename: 'clean.txt'})))
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-b', filename: 'flagged.txt', extraction_issues: ['issue']})))
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-c', filename: 'clean2.txt'})));
    vi.stubGlobal('fetch', fetchMock);

    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    const startButton = await screen.findByTestId('start-review-button');
    expect(startButton).toHaveTextContent('Start review (problems first)');
    await userEvent.setup().click(startButton);

    expect(mockPush).toHaveBeenCalledWith('/review?inv=inv-1&docs=doc-b,doc-a,doc-c');
  });

  it('shows a clean empty state when the batch has no documents', async () => {
    setParams('inv=inv-1&docs=');
    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    await screen.findByText(/Nothing was imported in this batch/);
  });
});
