// @vitest-environment jsdom
// app/review/batch/page.tsx: the batch triage table shown right after a
// bulk import (design doc "Document Ingestion & Review System Design",
// Phase 1). Covers: the summary count, the "problems only" filter, the
// per-row Review action, and the "Start review (problems first)" action
// that jumps into the one-document review queue starting at the first
// flagged document while still handing it the whole batch to walk through.
// The stub answers by route (ADR-0005, line 15): the page asks for every
// document in the batch at once, so each test says what the server holds
// for each id.
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

async function importBatchPage(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/review/batch/page');
  return mod.default;
}

const documentRoute = (id: string) => `GET /api/documents/${id}`;
const LIST = 'GET /api/investigations/inv-1/documents';

/** A document as the investigation's list returns it (the generated DocumentOut shape). */
function listed(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1', investigation_id: 'inv-1', filename: 'clean.txt', source_id: 'src-1', mime_type: 'text/plain', sha256: 'abc',
    extraction_status: 'complete', extraction_error: null, extraction_issues: [], created_at: '2026-10-02T00:00:00',
    chunk_count: 1, candidate_counts: {evidence: 1}, openaleph_document_id: null, openaleph_schema: null, parent_document_id: null,
    ...overrides,
  };
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
    const api = mockApi({
      [documentRoute('doc-a')]: docFixture({id: 'doc-a', filename: 'clean.txt'}),
      [documentRoute('doc-b')]: docFixture({
        id: 'doc-b', filename: 'partial.pdf', extraction_issues: ['1 of 2 page(s) produced no extractable text.'], candidate_counts: {evidence: 1, entity: 2},
      }),
      [documentRoute('doc-c')]: docFixture({
        id: 'doc-c', filename: 'broken.docx', extraction_status: 'failed', extraction_error: 'Unsupported or corrupt file', candidate_counts: {},
      }),
      [LIST]: [],
    });

    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    await screen.findByTestId('batch-triage-page');
    expect(screen.getByTestId('triage-summary')).toHaveTextContent('3 document(s) imported · 2 with problems');
    expect(screen.getByTestId('triage-row-doc-a')).toBeInTheDocument();
    expect(screen.getByTestId('triage-row-doc-b')).toBeInTheDocument();
    expect(screen.getByTestId('triage-row-doc-c')).toBeInTheDocument();
    // Each document in the batch is asked for once.
    for (const id of ['doc-a', 'doc-b', 'doc-c']) expect(api.calls(documentRoute(id)), id).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);

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
    mockApi({
      [documentRoute('doc-a')]: docFixture({id: 'doc-a', filename: 'first.txt'}),
      [documentRoute('doc-b')]: docFixture({id: 'doc-b', filename: 'second.txt'}),
    });

    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    const rowB = await screen.findByTestId('triage-row-doc-b');
    await userEvent.setup().click(within(rowB).getByRole('button', {name: 'Review'}));

    expect(mockPush).toHaveBeenCalledWith('/review?inv=inv-1&docs=doc-b,doc-a');
  });

  it('"Start review" jumps to the first flagged document, keeping the rest of the batch queued behind it', async () => {
    setParams('inv=inv-1&docs=doc-a,doc-b,doc-c');
    mockApi({
      [documentRoute('doc-a')]: docFixture({id: 'doc-a', filename: 'clean.txt'}),
      [documentRoute('doc-b')]: docFixture({id: 'doc-b', filename: 'flagged.txt', extraction_issues: ['issue']}),
      [documentRoute('doc-c')]: docFixture({id: 'doc-c', filename: 'clean2.txt'}),
    });

    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    const startButton = await screen.findByTestId('start-review-button');
    expect(startButton).toHaveTextContent('Start review (problems first)');
    await userEvent.setup().click(startButton);

    expect(mockPush).toHaveBeenCalledWith('/review?inv=inv-1&docs=doc-b,doc-a,doc-c');
  });

  it('shows a clean empty state when the batch has no documents', async () => {
    setParams('inv=inv-1&docs=');
    // Nothing is listed, so nothing is asked for.
    const api = mockApi();
    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    await screen.findByText(/Nothing was imported in this batch/);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('lists the files found inside an archive of the batch under it and reviews them after it', async () => {
    setParams('inv=inv-1&docs=doc-zip');
    mockApi({
      [documentRoute('doc-zip')]: docFixture({id: 'doc-zip', filename: 'bundle.zip', candidate_counts: {}, chunk_count: 0}),
      [LIST]: [
        listed({id: 'doc-zip', filename: 'bundle.zip', openaleph_schema: 'Package', candidate_counts: {}}),
        listed({id: 'doc-first', filename: 'letters/first.txt', parent_document_id: 'doc-zip', candidate_counts: {entity: 1}}),
        listed({id: 'doc-inner', filename: 'inner.zip', parent_document_id: 'doc-zip', openaleph_schema: 'Package', candidate_counts: {}}),
        listed({id: 'doc-deep', filename: 'deep.txt', parent_document_id: 'doc-inner', extraction_status: 'failed', extraction_error: 'needs OpenAleph'}),
        listed({id: 'doc-other', filename: 'unrelated.txt'}),
      ],
    });
    const BatchTriagePage = await importBatchPage();
    render(<BatchTriagePage />);

    await screen.findByTestId('triage-row-doc-first');
    expect(screen.getByTestId('triage-summary')).toHaveTextContent('1 document(s) imported · 3 file(s) found inside · 1 with problems');
    expect(within(screen.getByTestId('triage-row-doc-deep')).getByText('Inside inner.zip')).toBeInTheDocument();
    expect(screen.queryByTestId('triage-row-doc-other')).not.toBeInTheDocument();

    await userEvent.setup().click(within(screen.getByTestId('triage-row-doc-zip')).getByRole('button', {name: 'Review'}));
    expect(mockPush).toHaveBeenCalledWith('/review?inv=inv-1&docs=doc-zip,doc-first,doc-inner,doc-deep');
  });
});
