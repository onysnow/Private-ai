// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 7: the "Document ingestion & extraction" flow
// on app/page.tsx. Same cascade-mocking approach as leads/claims (cycles 4,
// 6): documents/uploadDocument/reviewDocCandidate all need `inv`, so the
// fixture drives selectInvestigation()'s full 9-call cascade plus
// AiReasoningPanel's own post-select fetch. Covers uploadDocument (multipart
// POST, then reload documents + load proposal candidates) and
// reviewDocCandidate's accept path (POST review, then the 5-way
// Promise.all reload of entities/claims/evidence/sources/documents). Left
// for a later cycle: OpenAleph sync/refresh and staging a relationship from
// an accepted claim candidate -- both layer on top of what's covered here
// rather than being core to the upload/review loop.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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

const validSettingsStatus = {
  environment: 'test',
  database: 'sqlite',
  document_storage_dir: '/tmp/docs',
  limits: {},
  restore_api_enabled: true,
  document_extraction: {
    pdf_ocr_enabled: false,
    pdf_ocr_language: 'eng',
    pdf_ocr_dpi: 300,
    pdf_ocr_min_native_chars: 200,
    local_entity_suggestions_enabled: false,
    entity_extraction_owner: 'workbench_local',
    ocr_runtime: {
      available: false,
      requested_languages: [],
      missing_languages: [],
      detail: 'not checked',
    },
  },
  access: {
    remote_api_enabled: false,
    mode: 'local_only',
    token_configured: false,
  },
  cors_allowed_origins: [],
  connectors: {},
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};

const emptyGraph = {
  nodes: [],
  edges: [],
  schemas: [],
  reconciliation: {
    collapsed_by_default: true,
    suppressed_duplicate_count: 0,
    underlying_edge_count: 0,
    visible_edge_count: 0,
  },
};

function docFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    filename: 'board-minutes.pdf',
    source_id: 'src-1',
    extraction_status: 'extracted',
    chunk_count: 12,
    candidate_counts: {entity: 2},
    ...overrides,
  };
}

function candidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cand-1',
    candidate_type: 'entity',
    payload: {caption: 'Kestrelwood Holdings Ltd', suggested_schema: 'Company'},
    review_status: 'proposed',
    confidence: 0.82,
    ...overrides,
  };
}

// The 9 selectInvestigation() cascade calls, in call order, plus the
// AiReasoningPanel queue fetch that follows once `inv` is non-empty.
function bootstrapCalls(documents: unknown[] = []) {
  return [
    jsonResponse([]), // GET connector-findings
    jsonResponse([]), // GET entities (raw array -- see test-page-leads.test.tsx's fix note)
    jsonResponse(emptyGraph), // GET graph
    jsonResponse({events: [], verification_counts: {}}), // GET timeline
    jsonResponse({items: []}), // GET leads/queue
    jsonResponse([]), // GET claims
    jsonResponse([]), // GET evidence
    jsonResponse([]), // GET sources
    jsonResponse(documents), // GET documents
    jsonResponse({candidates: []}), // AiReasoningPanel queue
  ];
}

async function bootstrapWithOneDocument(document: Record<string, unknown> = docFixture()): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of bootstrapCalls([document])) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText(String(document.filename));
  return {fetchMock};
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
    const {fetchMock} = await bootstrapWithOneDocument();
    const uploaded = docFixture({id: 'doc-2', filename: 'contract.pdf', chunk_count: 4, candidate_counts: {}});

    fetchMock
      .mockResolvedValueOnce(jsonResponse(uploaded)) // POST /api/documents/upload
      .mockResolvedValueOnce(jsonResponse([docFixture(), uploaded])) // GET documents reload
      .mockResolvedValueOnce(jsonResponse([candidateFixture({id: 'cand-2'})])); // GET candidates?status=proposed

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Document title'), 'Signed contract');
    await user.upload(fileInput(), new File(['pdf-bytes'], 'contract.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));

    // uploadDocument() sets "Extracted N chunk(s)..." then immediately calls
    // loadDocCandidates(d.id) with the default status='proposed', which
    // itself clears docStatus back to '' on success -- so the transient
    // upload message never actually persists to be asserted on. What does
    // persist: the reloaded documents list and the newly loaded proposals.
    await screen.findByText('contract.pdf');
    expect(screen.getByText('Kestrelwood Holdings Ltd')).toBeInTheDocument();

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[13];
    expect(uploadUrl).toContain('/api/documents/upload');
    expect((uploadInit as RequestInit).method).toBe('POST');
    const body = (uploadInit as RequestInit).body as FormData;
    expect(body.get('investigation_id')).toBe('inv-1');
    expect(body.get('title')).toBe('Signed contract');
    expect((body.get('file') as File).name).toBe('contract.pdf');
  });

  it('accepts an entity extraction proposal and reloads dependent records', async () => {
    const {fetchMock} = await bootstrapWithOneDocument();

    fetchMock.mockResolvedValueOnce(
      jsonResponse([candidateFixture()]),
    ); // GET /api/documents/doc-1/candidates?status=proposed
    await userEvent.setup().click(screen.getByRole('button', {name: 'Review proposals'}));
    await screen.findByText('Kestrelwood Holdings Ltd');

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // POST /api/extraction-candidates/cand-1/review
      .mockResolvedValueOnce(jsonResponse([])) // entities reload
      .mockResolvedValueOnce(jsonResponse([])) // claims reload
      .mockResolvedValueOnce(jsonResponse([])) // evidence reload
      .mockResolvedValueOnce(jsonResponse([])) // sources reload
      .mockResolvedValueOnce(jsonResponse([docFixture({candidate_counts: {}})])); // documents reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Accept'}));

    await screen.findByText('entity proposal accepted. Its document/chunk/review lineage is retained for provenance tracing.', {exact: false});
    expect(screen.queryByText('Kestrelwood Holdings Ltd')).not.toBeInTheDocument();

    const [reviewUrl, reviewInit] = fetchMock.mock.calls[14];
    expect(reviewUrl).toContain('/api/extraction-candidates/cand-1/review');
    expect(JSON.parse((reviewInit as RequestInit).body as string)).toMatchObject({
      decision: 'accept',
      caption: 'Kestrelwood Holdings Ltd',
      entity_schema: 'Company',
    });
  });

  it('requests explanations with proposals and shows each proposal\'s reasoning panel (#190)', async () => {
    const {fetchMock} = await bootstrapWithOneDocument();
    const explanation = {
      candidate_id: 'cand-1', candidate_type: 'entity', review_status: 'proposed',
      summary: 'Company named “Kestrelwood Holdings Ltd”',
      method: {id: 'openaleph_ftm_analyze', label: 'OpenAleph ftm-analyze mention', description: 'Detected by OpenAleph.', automated: true},
      rationale_basis: 'provider',
      confidence: {value: 1, basis: 'Fixed value of 1.0 set on import.'},
      parts: [{id: 'caption', label: 'Name', value: 'Kestrelwood Holdings Ltd', reasoning: ['OpenAleph returned this name as a mention.'], sources: []}],
      sources: [{kind: 'provider', id: 'm1', label: 'openaleph Mention', provider_entity_id: 'm1', collection_id: '7'}],
      caveats: [],
      review_rule: 'Nothing in this proposal is in the investigation until a reporter accepts it.',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse([candidateFixture({explanation})]));
    await userEvent.setup().click(screen.getByRole('button', {name: 'Review proposals'}));
    await screen.findByText(/Why this was proposed: OpenAleph ftm-analyze mention/);
    expect(screen.getByText('OpenAleph returned this name as a mention.')).toBeInTheDocument();
    const [url] = fetchMock.mock.calls[13];
    expect(String(url)).toContain('/api/documents/doc-1/candidates?status=proposed&explain=true');
  });
});

function jobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'doc-2',
    status: 'queued', finished: false, progress: null, message: 'Waiting to start', error: null, attempts: 0,
    runner: 'procrastinate', ...overrides,
  };
}

describe('Home document reading runs as a background job (ADR-0004)', () => {
  it('follows a queued read until it finishes, then loads the proposals', async () => {
    const {fetchMock} = await bootstrapWithOneDocument();
    const queued = docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'queued', chunk_count: 0, candidate_counts: {}, job: jobFixture()});
    const read = docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'complete', chunk_count: 3, candidate_counts: {entity: 1}});

    fetchMock
      .mockResolvedValueOnce(jsonResponse(queued, 202)) // POST /api/documents/upload
      .mockResolvedValueOnce(jsonResponse([docFixture(), queued])) // GET documents (shows it as queued)
      .mockResolvedValueOnce(jsonResponse(jobFixture({status: 'running', progress: 5, message: 'Reading the document'}))) // GET job
      .mockResolvedValueOnce(jsonResponse(jobFixture({status: 'succeeded', finished: true, progress: 100, message: 'Document read', attempts: 1}))) // GET job
      .mockResolvedValueOnce(jsonResponse(read)) // GET /api/documents/doc-2
      .mockResolvedValueOnce(jsonResponse([docFixture(), read])) // GET documents reload
      .mockResolvedValueOnce(jsonResponse([candidateFixture({id: 'cand-2'})])); // GET candidates

    const user = userEvent.setup();
    await user.upload(fileInput(), new File(['pdf-bytes'], 'scan.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));

    await screen.findByText('Saved. Reading the document: Reading the document (5%)');
    await screen.findByText('Kestrelwood Holdings Ltd', {}, {timeout: 4000});
    const urls = fetchMock.mock.calls.slice(13).map(([url]) => String(url));
    expect(urls[2]).toContain('/api/jobs/job-1');
    expect(urls[3]).toContain('/api/jobs/job-1');
    expect(urls[4]).toContain('/api/documents/doc-2');
    expect(urls[6]).toContain('/api/documents/doc-2/candidates');
  });

  it('says when reading failed and retries it from the document row', async () => {
    const failedDoc = docFixture({id: 'doc-9', filename: 'broken.pdf', extraction_status: 'failed', chunk_count: 0, candidate_counts: {}});
    const {fetchMock} = await bootstrapWithOneDocument(failedDoc);
    const failedJob = jobFixture({id: 'job-9', subject_id: 'doc-9', status: 'failed', finished: true, error: 'scan unreadable', attempts: 1});

    fetchMock
      .mockResolvedValueOnce(jsonResponse([failedJob])) // GET /api/jobs?subject_id=doc-9
      .mockResolvedValueOnce(jsonResponse(jobFixture({id: 'job-9', subject_id: 'doc-9', status: 'succeeded', finished: true, message: 'Document read', attempts: 2}))) // POST retry
      .mockResolvedValueOnce(jsonResponse([docFixture({id: 'doc-9', filename: 'broken.pdf', extraction_status: 'complete'})])); // GET documents reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Retry reading'}));
    await screen.findByText('broken.pdf: Document read');
    expect(screen.queryByRole('button', {name: 'Retry reading'})).not.toBeInTheDocument();
    const [listUrl] = fetchMock.mock.calls[13];
    expect(String(listUrl)).toContain('/api/jobs?subject_id=doc-9');
    const [retryUrl, retryInit] = fetchMock.mock.calls[14];
    expect(String(retryUrl)).toContain('/api/jobs/job-9/retry');
    expect((retryInit as RequestInit).method).toBe('POST');
  });
});

describe('Home remembers the open investigation in the address bar (?inv=)', () => {
  it('opens the investigation named in ?inv= and keeps it there', async () => {
    window.history.replaceState(null, '', '/?inv=inv-2');
    const second = {id: 'inv-2', name: 'Harbor contracts'};
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus))
      .mockResolvedValueOnce(jsonResponse([investigation, second]))
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']}));
    for (const response of bootstrapCalls([docFixture({id: 'doc-9', filename: 'harbor.pdf'})])) fetchMock.mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);
    const Home = await importHome();
    render(<Home />);
    await screen.findByText('harbor.pdf');
    expect(fetchMock.mock.calls.slice(3).map(([url]) => String(url)).some(url => url.includes('/api/investigations/inv-2/documents'))).toBe(true);
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
    const {fetchMock} = await bootstrapWithOneDocument();
    const fileA = new File(['a'], 'memo-a.txt', {type: 'text/plain'});
    const fileB = new File(['b'], 'memo-b.txt', {type: 'text/plain'});
    const fileC = new File(['c'], 'memo-c.txt', {type: 'text/plain'});

    fetchMock
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-a', filename: 'memo-a.txt'}))) // POST upload A
      .mockResolvedValueOnce(jsonResponse({detail: 'Document is empty'}, 400)) // POST upload B fails
      .mockResolvedValueOnce(jsonResponse(docFixture({id: 'doc-c', filename: 'memo-c.txt'}))) // POST upload C
      .mockResolvedValueOnce(jsonResponse([docFixture(), docFixture({id: 'doc-a'}), docFixture({id: 'doc-c'})])); // documents reload

    const user = userEvent.setup();
    await user.upload(bulkFileInput(), [fileA, fileB, fileC]);
    await user.click(screen.getByRole('button', {name: 'Import 3 document(s)'}));

    await screen.findByText(/Imported 2 of 3 file\(s\)\. 1 failed and were skipped/, {exact: false});
    expect(mockPush).toHaveBeenCalledWith('/review/batch?inv=inv-1&docs=doc-a,doc-c');

    // Three separate sequential POSTs, one per file, each with its own
    // filename-derived title and no manual title field (unlike the
    // single-file uploader).
    const uploadCalls = fetchMock.mock.calls.slice(13, 16);
    for (const [, init] of uploadCalls) {
      expect((init as RequestInit).method).toBe('POST');
    }
    const bodyA = (uploadCalls[0][1] as RequestInit).body as FormData;
    expect(bodyA.get('title')).toBe('memo-a');
    expect((bodyA.get('file') as File).name).toBe('memo-a.txt');
  });

  it('disables the import button until at least one file is chosen', async () => {
    await bootstrapWithOneDocument();
    expect(screen.getByRole('button', {name: 'Import 0 document(s)'})).toBeDisabled();
  });
});
