// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 8: the "Download backup" half of app/page.tsx's
// backup card (previewBackup/restoreBackup were covered in cycle 5;
// downloadBackup was deliberately left for its own cycle there because it
// needs an investigation selected AND jsdom object-URL/anchor-click
// plumbing, a different kind of setup than fetch mocking alone). Unlike
// previewBackup/restoreBackup, downloadBackup has an `if(!inv)return` guard,
// so it needs the full selectInvestigation() cascade driven via
// loadAppBootstrap()'s auto-select, same pattern as cycles 4/6/7.
//
// downloadBackup calls api.blob(), which resolves the raw Response and
// calls .blob() on it -- jsdom's fetch/Response support that natively, no
// special mocking needed there. What jsdom does NOT implement is
// URL.createObjectURL/revokeObjectURL (absent entirely, not just stubbed),
// so those are assigned directly onto the global URL class for the
// duration of each test. HTMLAnchorElement.prototype.click is spied on
// (not just left to jsdom) because jsdom logs a "not implemented:
// navigation" error when a real click on an <a href="blob:..."> tries to
// navigate -- the spy lets the test capture the link's href/download
// attributes at the moment of the (synthetic) click, before
// downloadBackup's own `link.remove()` call removes it from the DOM.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
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
  vi.restoreAllMocks();
  delete (URL as unknown as {createObjectURL?: unknown}).createObjectURL;
  delete (URL as unknown as {revokeObjectURL?: unknown}).revokeObjectURL;
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

function blobResponse(bytes: string, status = 200): Response {
  // A jsdom-environment `new Blob(...)` isn't the same class undici's
  // Response/`.blob()` expect (`object.stream is not a function`), so pass
  // the body as a plain string instead -- Response accepts that natively,
  // and downloadBackup only cares that `.blob()` on the received Response
  // resolves to *a* Blob, not about its exact source construction.
  return new Response(bytes, {
    status,
    headers: {'content-type': 'application/zip'},
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

// The 9 selectInvestigation() cascade calls, in call order -- see
// test-page-leads.test.tsx's module docstring for why the shapes below
// (raw arrays for entities/claims/evidence/sources/documents, not
// {entities: [...]}) and the 10th AiReasoningPanel call are required.
function cascadeResponses(): Response[] {
  return [
    jsonResponse([]), // GET connector-findings
    jsonResponse([]), // GET entities
    jsonResponse(emptyGraph), // GET graph
    jsonResponse({events: [], verification_counts: {}}), // GET timeline
    jsonResponse({items: []}), // GET leads/queue
    jsonResponse([]), // GET claims
    jsonResponse([]), // GET evidence
    jsonResponse([]), // GET sources
    jsonResponse([]), // GET documents
  ];
}

async function bootstrapWithSelectedInvestigation(): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of cascadeResponses()) {
    fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockResolvedValueOnce(jsonResponse({candidates: []})); // AiReasoningPanel
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Download backup'})).not.toBeDisabled());
  return {fetchMock};
}

describe('Home portable backup download', () => {
  it('is disabled until an investigation is selected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
      .mockResolvedValueOnce(jsonResponse([])) // GET investigations (none)
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
    vi.stubGlobal('fetch', fetchMock);

    const Home = await importHome();
    render(<Home />);
    await screen.findByText('Portable investigation backup & restore');

    expect(screen.getByRole('button', {name: 'Download backup'})).toBeDisabled();
  });

  it('downloads the backup archive and triggers a browser save via an object URL', async () => {
    const {fetchMock} = await bootstrapWithSelectedInvestigation();

    fetchMock.mockResolvedValueOnce(blobResponse('zip-bytes')); // GET export

    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    (URL as unknown as {createObjectURL: typeof createObjectURL}).createObjectURL = createObjectURL;
    (URL as unknown as {revokeObjectURL: typeof revokeObjectURL}).revokeObjectURL = revokeObjectURL;

    let capturedHref = '';
    let capturedDownload = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      capturedHref = this.href;
      capturedDownload = this.download;
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Download backup'}));

    await screen.findByText('Backup downloaded.');

    const [exportUrl] = fetchMock.mock.calls[13];
    expect(exportUrl).toContain('/api/investigations/inv-1/export');
    expect(exportUrl).toContain('include_documents=true');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // The Blob passed to createObjectURL comes back from undici's
    // Response.blob(), a different realm/class than jsdom's global `Blob`
    // (see blobResponse's comment above) -- `toBeInstanceOf(Blob)` doesn't
    // hold across that boundary, so check duck-typed shape instead.
    const downloadedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(downloadedBlob.size).toBe('zip-bytes'.length);
    expect(capturedHref).toBe('blob:mock-url');
    expect(capturedDownload).toBe('investigation-inv-1.jwbackup.zip');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // downloadBackup appends the link, clicks it, then removes it -- it
    // should not be left behind in the document.
    expect(document.querySelectorAll('a[download]').length).toBe(0);
  });

  it('shows an error status when the export request fails', async () => {
    const {fetchMock} = await bootstrapWithSelectedInvestigation();

    fetchMock.mockRejectedValueOnce(new Error('export endpoint unreachable'));

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as unknown as {createObjectURL: typeof createObjectURL}).createObjectURL = createObjectURL;
    (URL as unknown as {revokeObjectURL: (url: string) => void}).revokeObjectURL = vi.fn();

    await userEvent.setup().click(screen.getByRole('button', {name: 'Download backup'}));

    await screen.findByText('export endpoint unreachable');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
