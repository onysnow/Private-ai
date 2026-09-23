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

async function bootstrapWithOneDocument(): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of bootstrapCalls([docFixture()])) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('board-minutes.pdf');
  return {fetchMock};
}

function fileInput(): HTMLInputElement {
  // Two file inputs exist on the page (backup restore, document upload) --
  // select by `accept` since neither has a distinguishing label/testid.
  const input = document.querySelector('input[type="file"][accept*=".pdf"]');
  if (!input) throw new Error('document file input not found');
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
});
