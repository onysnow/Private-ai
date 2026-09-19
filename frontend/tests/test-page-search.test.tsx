// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 2: the "Investigation search" flow on app/page.tsx
// (the internalSearch() handler and its results list). Like
// test-page-api-access.test.tsx, this targets one self-contained flow rather
// than the whole 60+-hook component: internalSearch() only needs `internalQ`
// (never `inv`) to fire, and setSelectInvestigation's 9-way fetch cascade is
// avoided entirely by keeping the investigations list empty, exactly as the
// API-access bootstrap tests already do.
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

// Minimal fixtures satisfying isSearchResult: type, group (one of the fixed
// literal set), id, investigation_id, title, snippet, score, provenance
// (object), metadata (object).
const canonicalHit = {
  type: 'entity',
  group: 'canonical',
  id: 'ent-1',
  investigation_id: 'inv-1',
  title: 'Kestrelwood Holdings',
  snippet: 'A shell entity mentioned in filing 12.',
  score: 3.5,
  provenance: {},
  metadata: {},
};

const externalLeadHit = {
  type: 'connector_finding',
  group: 'external_lead',
  id: 'find-1',
  investigation_id: 'inv-1',
  title: 'Aleph result for Kestrelwood',
  snippet: 'An unreviewed external lead.',
  score: 1.2,
  provenance: {},
  metadata: {},
};

function searchBody(results: unknown[]) {
  return {
    results,
    counts: {},
    group_counts: {},
  };
}

async function bootstrapAndFindSearchInput(): Promise<HTMLElement> {
  const Home = await importHome();
  render(<Home />);
  await screen.findByText(
    'Local-only API access. No bearer token is required on loopback.',
  );
  return screen.getByPlaceholderText('Search this investigation…');
}

describe('Home investigation search', () => {
  it('runs a search on button click and renders grouped results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET /api/settings/status
      .mockResolvedValueOnce(jsonResponse([])) // GET /api/investigations
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})) // GET /api/connectors
      .mockResolvedValueOnce(
        jsonResponse(searchBody([canonicalHit, externalLeadHit])),
      ); // GET /api/search?...
    vi.stubGlobal('fetch', fetchMock);

    const input = await bootstrapAndFindSearchInput();
    const user = userEvent.setup();
    await user.type(input, 'Kestrelwood');
    await user.click(screen.getByRole('button', {name: 'Search records'}));

    await screen.findByText('Kestrelwood Holdings');
    expect(screen.getByText('External leads — review required')).toBeInTheDocument();
    expect(screen.getByText('Aleph result for Kestrelwood')).toBeInTheDocument();
    // Canonical hits get a "Trace provenance" action; external leads instead
    // get a plain caution note and no trace action.
    expect(
      screen.getByRole('button', {name: 'Trace provenance'}),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'External connector result; treat as a lead until reviewed and promoted.',
      ),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const searchUrl = fetchMock.mock.calls[3][0] as string;
    expect(searchUrl).toContain('/api/search?');
    expect(searchUrl).toContain('q=Kestrelwood');
    expect(searchUrl).toContain('limit=75');
    // No investigation is selected in this test, so the request must not
    // scope to one.
    expect(searchUrl).not.toContain('investigation_id=');
    expect(searchUrl).not.toContain('include_reconciled_duplicates=');
  });

  it('runs a search on Enter and includes include_reconciled_duplicates when checked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']}))
      .mockResolvedValueOnce(jsonResponse(searchBody([canonicalHit])));
    vi.stubGlobal('fetch', fetchMock);

    const input = await bootstrapAndFindSearchInput();
    const user = userEvent.setup();
    await user.click(
      screen.getByLabelText('Include reviewed duplicate copies'),
    );
    await user.type(input, 'Kestrelwood{Enter}');

    await screen.findByText('Kestrelwood Holdings');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const searchUrl = fetchMock.mock.calls[3][0] as string;
    expect(searchUrl).toContain('include_reconciled_duplicates=true');
  });

  it('does not search on an empty query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']}));
    vi.stubGlobal('fetch', fetchMock);

    await bootstrapAndFindSearchInput();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Search records'}));

    // internalSearch() returns immediately when internalQ.trim() is empty --
    // no fourth call should ever be made.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
