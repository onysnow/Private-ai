// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 13 (third and final entity-dossier
// sub-cycle): single-provider enrich(), multi-provider enrichAll(), and
// decideCluster() on the cross-provider candidates it produces. See cycle
// 11's docstring for why the dossier area is split across cycles.
//
// Unlike the rest of the dossier (identity history, property conflicts,
// canonical duplicates, reconciliation), the "Cross-provider candidates"
// block that decideCluster acts on is a SIBLING of the `dossier &&` block
// in app/page.tsx, not nested inside it -- it renders whenever `clusters`
// is non-empty, independent of whether a dossier has been opened. So none
// of these tests need to click "Open dossier" at all; they only need
// `entityId` set, which loadEntities() (cycle 10's finding) already
// auto-fills to the first loaded entity.
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
const entityA = {id: 'ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company', properties: {}};

function emptyGraph() {
  return {
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
}

function clusterFixture(overrides: Record<string, unknown> = {}) {
  return {
    cluster_key: 'cluster-1',
    score: 0.82,
    finding_ids: ['find-1', 'find-2'],
    findings: [
      {id: 'find-1', provider: 'aleph', caption: 'Kestrelwood Holdings Ltd'},
      {id: 'find-2', provider: 'opensanctions', caption: 'Kestrelwood Holdings'},
    ],
    pairs: [{reasons: [{kind: 'name_match', detail: 'Normalized names match exactly.'}]}],
    ...overrides,
  };
}

// The 9 selectInvestigation() cascade calls, in call order -- see
// test-page-leads.test.tsx's module docstring.
function cascadeResponses(entities: unknown[]): Response[] {
  return [
    jsonResponse([]), // GET connector-findings
    jsonResponse(entities), // GET entities
    jsonResponse(emptyGraph()), // GET graph
    jsonResponse({events: [], verification_counts: {}}), // GET timeline
    jsonResponse({items: []}), // GET leads/queue
    jsonResponse([]), // GET claims
    jsonResponse([]), // GET evidence
    jsonResponse([]), // GET sources
    jsonResponse([]), // GET documents
  ];
}

async function bootstrap(): Promise<{fetchMock: ReturnType<typeof vi.fn>}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of cascadeResponses([entityA])) {
    fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockResolvedValueOnce(jsonResponse({candidates: []})); // AiReasoningPanel
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');

  // loadEntities() auto-fills entityId to entities[0], so the enrich
  // buttons are already enabled with no <select> interaction needed.
  await screen.findByRole('button', {name: 'Enrich all providers'});
  return {fetchMock};
}

describe('Home entity dossier: enrichment & cross-provider clusters', () => {
  it('runs a single-provider enrich and reloads connector findings', async () => {
    const {fetchMock} = await bootstrap();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {id: 'find-3', provider: 'aleph', caption: 'Kestrelwood Holdings', properties: {}, review_status: 'unreviewed'},
          {id: 'find-4', provider: 'aleph', caption: 'Kestrelwood Trading Ltd', properties: {}, review_status: 'unreviewed'},
        ]),
      ) // POST /api/entities/ent-1/enrich/aleph
      .mockResolvedValueOnce(jsonResponse([])); // GET connector-findings reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich with aleph'}));

    await screen.findByText('aleph: 2 finding(s)');

    const [enrichUrl, enrichInit] = fetchMock.mock.calls[13];
    expect(enrichUrl).toContain('/api/entities/ent-1/enrich/aleph');
    expect((enrichInit as RequestInit).method).toBe('POST');

    const [findingsUrl] = fetchMock.mock.calls[14];
    expect(findingsUrl).toContain('/api/investigations/inv-1/connector-findings');
  });

  it('runs enrichAll and renders the resulting cross-provider cluster', async () => {
    const {fetchMock} = await bootstrap();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'session-1',
          status: 'completed',
          runs: [
            {provider: 'aleph', status: 'ok', result_count: 3},
            {provider: 'opensanctions', status: 'ok', result_count: 1},
          ],
        }),
      ) // POST /api/entities/ent-1/enrich (session)
      .mockResolvedValueOnce(jsonResponse([clusterFixture()])) // GET clusters
      .mockResolvedValueOnce(jsonResponse([])); // loadFindings reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich all providers'}));

    await screen.findByText('completed · aleph: ok (3) · opensanctions: ok (1)');
    expect(screen.getByText('Cross-provider candidates')).toBeInTheDocument();
    expect(screen.getByText('82% possible same outside entity')).toBeInTheDocument();
    expect(screen.getByText('aleph: Kestrelwood Holdings Ltd')).toBeInTheDocument();
    expect(screen.getByText('opensanctions: Kestrelwood Holdings')).toBeInTheDocument();
    expect(screen.getByText('name_match: Normalized names match exactly.')).toBeInTheDocument();

    const [sessionUrl, sessionInit] = fetchMock.mock.calls[13];
    expect(sessionUrl).toContain('/api/entities/ent-1/enrich');
    expect(JSON.parse((sessionInit as RequestInit).body as string)).toMatchObject({providers: ['aleph']});

    const [clustersUrl] = fetchMock.mock.calls[14];
    expect(clustersUrl).toContain('/api/enrichment-sessions/session-1/clusters');
  });

  it('records a cluster decision and reloads the cluster list', async () => {
    const {fetchMock} = await bootstrap();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({id: 'session-1', status: 'completed', runs: [{provider: 'aleph', status: 'ok'}]}))
      .mockResolvedValueOnce(jsonResponse([clusterFixture()]))
      .mockResolvedValueOnce(jsonResponse([]));

    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich all providers'}));
    await screen.findByText('Cross-provider candidates');

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // POST clusters/decision
      .mockResolvedValueOnce(jsonResponse([clusterFixture({decision: {decision: 'positive'}})])); // GET clusters reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Same external entity'}));

    await screen.findByText('Latest decision: positive');

    const [decisionUrl, decisionInit] = fetchMock.mock.calls[16];
    expect(decisionUrl).toContain('/api/enrichment-sessions/session-1/clusters/decision');
    expect(JSON.parse((decisionInit as RequestInit).body as string)).toMatchObject({
      finding_ids: ['find-1', 'find-2'],
      decision: 'positive',
      confidence: 0.9,
    });

    const [reloadUrl] = fetchMock.mock.calls[17];
    expect(reloadUrl).toContain('/api/enrichment-sessions/session-1/clusters');
  });
});
