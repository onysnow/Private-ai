// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 7: the "Document ingestion & extraction" flow
// on app/page.tsx. Same approach as leads/claims (cycles 4, 6):
// documents/uploadDocument/reviewDocCandidate all need `inv`, so the fixture
// lets loadAppBootstrap() open the one investigation, which starts every
// per-investigation load (test-support/page-routes.ts; replies are keyed by
// route, not by call order -- ADR-0005, line 15). Covers uploadDocument
// (multipart POST, then reload documents + load proposal candidates) and
// reviewDocCandidate's accept path (POST review, then the reload of
// entities/claims/evidence/sources/documents). Left for a later cycle:
// OpenAleph sync/refresh and staging a relationship from an accepted claim
// candidate -- both layer on top of what's covered here rather than being
// core to the upload/review loop.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi, RouteCall} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

// Bulk import (2026-09-30) navigates to /review with useRouter().push() once
// the whole batch is uploaded. vi.hoisted keeps one stable spy instance that
// both the mock factory (hoisted above imports) and the test bodies below
// can reference -- see test-setup.ts's global default for why this mock is
// needed at all (no real app-router tree exists in these RTL renders).
const {mockPush} = vi.hoisted(() => ({mockPush: vi.fn()}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockPush.mockClear();
});

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../components/case/workbench-all');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};

const DOCUMENTS = 'GET /api/investigations/inv-1/documents';
const UPLOAD = 'POST /api/documents/upload';

// Replies carry the full shape the API declares (lib/generated/types.gen.ts):
// the panel's generated client checks each one.
function docFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    investigation_id: 'inv-1',
    filename: 'board-minutes.pdf',
    source_id: 'src-1',
    mime_type: 'application/pdf',
    sha256: 'abc123',
    extraction_status: 'extracted',
    extraction_error: null,
    extraction_issues: [],
    created_at: '2026-10-01T00:00:00',
    chunk_count: 12,
    candidate_counts: {entity: 2},
    ...overrides,
  };
}

function candidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cand-1',
    investigation_id: 'inv-1',
    document_id: 'doc-1',
    chunk_id: 'chunk-1',
    candidate_type: 'entity',
    payload: {caption: 'Kestrelwood Holdings Ltd', suggested_schema: 'Company'},
    review_status: 'proposed',
    confidence: 0.82,
    accepted_record_type: null,
    accepted_record_id: null,
    reviewer_note: null,
    created_at: '2026-10-01T00:00:00',
    reviewed_at: null,
    ...overrides,
  };
}

/** The multipart body of an upload call. */
function uploadForm(call: RouteCall): FormData {
  return call.body as FormData;
}

async function bootstrapWithOneDocument(document: Record<string, unknown> = docFixture()): Promise<MockApi> {
  const api = mockApi(pageRoutes({investigations: [investigation], documents: [document]}));

  const Home = await importHome();
  render(<Home />);
  await screen.findByText(String(document.filename));
  return api;
}

function fileInput(): HTMLInputElement {
  // Three file inputs exist on the page now (backup restore, single-file
  // document upload, bulk import) -- the single-upload one is the first
  // ".pdf"-accepting, non-multiple input in DOM order.
  const input = document.querySelector('input[type="file"][accept*=".pdf"]:not([multiple])');
  if (!input) throw new Error('document file input not found');
  return input as HTMLInputElement;
}

function bulkFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"][accept*=".pdf"][multiple]');
  if (!input) throw new Error('bulk import file input not found');
  return input as HTMLInputElement;
}

describe('Home document ingestion & extraction', () => {
  it('disables Upload & extract until a file is chosen', async () => {
    await bootstrapWithOneDocument();
    expect(screen.getByRole('button', {name: 'Upload & extract'})).toBeDisabled();
  });

  it('uploads a document, reloads the list, and loads its proposal candidates', async () => {
    const api = await bootstrapWithOneDocument();
    const uploaded = docFixture({id: 'doc-2', filename: 'contract.pdf', chunk_count: 4, candidate_counts: {}});

    api.add({
      [UPLOAD]: uploaded,
      [DOCUMENTS]: [docFixture(), uploaded], // the list the reload finds
      'GET /api/documents/doc-2/candidates': [candidateFixture({id: 'cand-2'})],
    });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Document title'), 'Signed contract');
    await user.upload(fileInput(), new File(['pdf-bytes'], 'contract.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));

    // uploadDocument() sets "Extracted N chunk(s)..." and keeps it once the
    // proposals are in (loading them used to clear it). What persists: that
    // line, the reloaded documents list and the newly loaded proposals.
    await screen.findByText('contract.pdf');
    expect(screen.getByText('Kestrelwood Holdings Ltd')).toBeInTheDocument();
    expect(screen.getByText('Extracted 4 chunk(s). Review proposals before canonicalizing.')).toBeInTheDocument();

    expect(api.calls(UPLOAD)).toHaveLength(1);
    const body = uploadForm(api.calls(UPLOAD)[0]);
    expect(body.get('investigation_id')).toBe('inv-1');
    expect(body.get('title')).toBe('Signed contract');
    expect((body.get('file') as File).name).toBe('contract.pdf');
    expect(api.calls(DOCUMENTS)).toHaveLength(2);
    expect(api.lastUrl('GET /api/documents/doc-2/candidates').searchParams.get('status')).toBe('proposed');
    expect(api.unmatched()).toEqual([]);
  });

  it('accepts an entity extraction proposal and reloads dependent records', async () => {
    const api = await bootstrapWithOneDocument();
    const review = 'POST /api/extraction-candidates/cand-1/review';

    api.add({'GET /api/documents/doc-1/candidates': [candidateFixture()]});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Review proposals'}));
    await screen.findByText('Kestrelwood Holdings Ltd');

    api.add({
      [review]: {candidate: candidateFixture({review_status: 'accepted', accepted_record_type: 'entity', accepted_record_id: 'ent-9'}), record: {id: 'ent-9'}},
      [DOCUMENTS]: [docFixture({candidate_counts: {}})], // the list the reload finds
    });
    // Every record kind the proposal may have changed is loaded once more
    // after the review (the sources are also loaded by the provenance panel
    // on its own, so count from where each route stands now).
    const reloaded = ['entities', 'claims', 'evidence', 'sources', 'documents'].map(kind => `GET /api/investigations/inv-1/${kind}`);
    const before = reloaded.map(route => api.calls(route).length);

    await userEvent.setup().click(screen.getByRole('button', {name: 'Accept'}));

    await screen.findByText('entity proposal accepted. Its document/chunk/review lineage is retained for provenance tracing.', {exact: false});
    expect(screen.queryByText('Kestrelwood Holdings Ltd')).not.toBeInTheDocument();

    expect(api.calls(review)).toHaveLength(1);
    expect(api.lastBody(review)).toMatchObject({
      decision: 'accept',
      caption: 'Kestrelwood Holdings Ltd',
      entity_schema: 'Company',
    });
    reloaded.forEach((route, i) => expect(api.calls(route).length, route).toBe(before[i] + 1));
    expect(api.unmatched()).toEqual([]);
  });

  it('requests explanations with proposals and shows each proposal\'s reasoning panel (#190)', async () => {
    const api = await bootstrapWithOneDocument();
    const explanation = {
      candidate_id: 'cand-1', candidate_type: 'entity', review_status: 'proposed',
      summary: 'Company named “Kestrelwood Holdings Ltd”',
      method: {id: 'openaleph_ftm_analyze', label: 'OpenAleph ftm-analyze mention', description: 'Detected by OpenAleph.', automated: true},
      rationale_basis: 'provider',
      confidence: {value: 1, basis: 'Fixed value of 1.0 set on import.'},
      parts: [{id: 'caption', label: 'Name', value: 'Kestrelwood Holdings Ltd', reasoning: ['OpenAleph returned this name as a mention.'], sources: []}],
      sources: [{kind: 'provider', id: 'm1', label: 'openaleph Mention', provider: 'openaleph', provider_entity_id: 'm1', collection_id: '7'}],
      caveats: [],
      review_rule: 'Nothing in this proposal is in the investigation until a reporter accepts it.',
    };
    api.add({'GET /api/documents/doc-1/candidates': [candidateFixture({explanation})]});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Review proposals'}));
    await screen.findByText(/Why this was proposed: OpenAleph ftm-analyze mention/);
    expect(screen.getByText('OpenAleph returned this name as a mention.')).toBeInTheDocument();
    const url = api.lastUrl('GET /api/documents/doc-1/candidates');
    expect(url.searchParams.get('status')).toBe('proposed');
    expect(url.searchParams.get('explain')).toBe('true');
  });
});

function jobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'doc-2',
    status: 'queued', finished: false, progress: null, message: 'Waiting to start', error: null, attempts: 0,
    runner: 'procrastinate', result: null, created_at: '2026-10-01T00:00:00', started_at: null, finished_at: null,
    updated_at: '2026-10-01T00:00:00', ...overrides,
  };
}

describe('Home document reading runs as a background job (ADR-0004)', () => {
  it('follows a queued read until it finishes, then loads the proposals', async () => {
    const api = await bootstrapWithOneDocument();
    const queued = docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'queued', chunk_count: 0, candidate_counts: {}, job: jobFixture()});
    const read = docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'complete', chunk_count: 3, candidate_counts: {entity: 1}});

    // The job advances with each poll: running on the first, done on the next.
    let polls = 0;
    api.add({
      [UPLOAD]: {status: 202, body: queued},
      // The document list shows the upload as queued until it has been read.
      [DOCUMENTS]: () => [docFixture(), polls < 2 ? queued : read],
      'GET /api/jobs/job-1': () => (++polls === 1
        ? jobFixture({status: 'running', progress: 5, message: 'Reading the document'})
        : jobFixture({status: 'succeeded', finished: true, progress: 100, message: 'Document read', attempts: 1})),
      'GET /api/documents/doc-2': {...read, chunks: []},
      'GET /api/documents/doc-2/candidates': [candidateFixture({id: 'cand-2'})],
    });

    const user = userEvent.setup();
    await user.upload(fileInput(), new File(['pdf-bytes'], 'scan.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));

    await screen.findByText('Saved. Reading the document: Reading the document (5%)');
    await screen.findByText('Kestrelwood Holdings Ltd', {}, {timeout: 4000});
    // Two polls until the job finished, then the read document and its
    // proposals; the list was reloaded on save and again when the read ended.
    expect(api.calls('GET /api/jobs/job-1')).toHaveLength(2);
    expect(api.calls('GET /api/documents/doc-2')).toHaveLength(1);
    expect(api.calls('GET /api/documents/doc-2/candidates')).toHaveLength(1);
    expect(api.calls(DOCUMENTS)).toHaveLength(3);
    expect(api.unmatched()).toEqual([]);
  });

  it('says when reading failed and retries it from the document row', async () => {
    const failedDoc = docFixture({id: 'doc-9', filename: 'broken.pdf', extraction_status: 'failed', chunk_count: 0, candidate_counts: {}});
    const api = await bootstrapWithOneDocument(failedDoc);
    const failedJob = jobFixture({id: 'job-9', subject_id: 'doc-9', status: 'failed', finished: true, error: 'scan unreadable', attempts: 1});
    const retry = 'POST /api/jobs/job-9/retry';

    api.add({
      'GET /api/jobs': [failedJob],
      [retry]: jobFixture({id: 'job-9', subject_id: 'doc-9', status: 'succeeded', finished: true, message: 'Document read', attempts: 2}),
      [DOCUMENTS]: [docFixture({id: 'doc-9', filename: 'broken.pdf', extraction_status: 'complete'})], // the list the reload finds
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Retry reading'}));
    await screen.findByText('broken.pdf: Document read');
    expect(screen.queryByRole('button', {name: 'Retry reading'})).not.toBeInTheDocument();
    expect(api.calls('GET /api/jobs')).toHaveLength(1);
    expect(api.lastUrl('GET /api/jobs').searchParams.get('subject_id')).toBe('doc-9');
    expect(api.calls(retry)).toHaveLength(1);
    expect(api.calls(DOCUMENTS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });
});

describe('Home remembers the open investigation in the address bar (?inv=)', () => {
  it('opens the investigation named in ?inv= and keeps it there', async () => {
    window.history.replaceState(null, '', '/?inv=inv-2');
    const second = {id: 'inv-2', name: 'Harbor contracts'};
    // Both cases are on the server; only the one named in the address is opened.
    const api = mockApi(pageRoutes({investigations: [investigation, second], documents: [docFixture({id: 'doc-9', filename: 'harbor.pdf'})]}));
    const Home = await importHome();
    render(<Home />);
    await screen.findByText('harbor.pdf');
    expect(api.calls('GET /api/investigations/inv-2/documents')).toHaveLength(1);
    expect(api.calls(DOCUMENTS)).toHaveLength(0);
    expect(window.location.search).toBe('?inv=inv-2');
    window.history.replaceState(null, '', '/');
  });

  it('writes the opened investigation into the address', async () => {
    window.history.replaceState(null, '', '/');
    await bootstrapWithOneDocument();
    expect(window.location.search).toBe('?inv=inv-1');
    window.history.replaceState(null, '', '/');
  });
});

describe('Home bulk document import', () => {
  it('uploads every selected file sequentially, tolerates one failure, and navigates to the batch triage screen', async () => {
    const api = await bootstrapWithOneDocument();
    const fileA = new File(['a'], 'memo-a.txt', {type: 'text/plain'});
    const fileB = new File(['b'], 'memo-b.txt', {type: 'text/plain'});
    const fileC = new File(['c'], 'memo-c.txt', {type: 'text/plain'});

    api.add({
      // The server refuses the empty-looking second file and saves the others.
      [UPLOAD]: (call: RouteCall) => {
        const name = (uploadForm(call).get('file') as File).name;
        if (name === 'memo-b.txt') return {status: 400, body: {detail: 'Document is empty'}};
        return docFixture({id: name === 'memo-a.txt' ? 'doc-a' : 'doc-c', filename: name});
      },
      [DOCUMENTS]: [docFixture(), docFixture({id: 'doc-a'}), docFixture({id: 'doc-c'})], // the list the reload finds
      // The import is one record the triage screen follows.
      'POST /api/investigations/inv-1/ingestion-batches': {id: 'batch-1', investigation_id: 'inv-1', label: 'memo-a.txt and 2 more', created_by: null,
        created_at: '2026-10-03T01:00:00', items: [], documents: [], review_order: []},
    });

    const user = userEvent.setup();
    await user.upload(bulkFileInput(), [fileA, fileB, fileC]);
    await user.click(screen.getByRole('button', {name: 'Import 3 document(s)'}));

    await screen.findByText(/Imported 2 of 3 file\(s\)\. 1 failed and were skipped/, {exact: false});
    expect(mockPush).toHaveBeenCalledWith('/review/batch?inv=inv-1&batch=batch-1');

    // Three separate sequential POSTs, one per file in the order chosen,
    // each with its own filename-derived title and no manual title field
    // (unlike the single-file uploader).
    const uploads = api.calls(UPLOAD);
    expect(uploads.map(call => (uploadForm(call).get('file') as File).name)).toEqual(['memo-a.txt', 'memo-b.txt', 'memo-c.txt']);
    expect(uploads.map(call => uploadForm(call).get('title'))).toEqual(['memo-a', 'memo-b', 'memo-c']);
    expect(uploads.map(call => uploadForm(call).get('investigation_id'))).toEqual(['inv-1', 'inv-1', 'inv-1']);
    await waitFor(() => expect(api.calls(DOCUMENTS)).toHaveLength(2));
    expect(api.unmatched()).toEqual([]);
  });

  it('disables the import button until at least one file is chosen', async () => {
    await bootstrapWithOneDocument();
    expect(screen.getByRole('button', {name: 'Import 0 document(s)'})).toBeDisabled();
  });
});
