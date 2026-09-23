// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 11 (first of the entity-dossier sub-cycles):
// the dossier's identity/merge history block and property-conflict
// decisions (decidePropertyConflict). The dossier is the largest single
// section in app/page.tsx -- identity history, property conflicts,
// relationships/claims/leads/tasks/timeline/external-finding sub-lists,
// post-merge reconciliation, canonical-duplicate merge, and cross-provider
// clusters -- so it's being split across several cycles rather than one
// pass; this cycle covers only the first two pieces.
//
// loadDossier() is reached by clicking "Open dossier", which needs
// `entityId` set -- but loadEntities() (see cycle 10's docstring) already
// auto-fills entityId to the first loaded entity once entities load, so no
// <select> interaction is needed, same shortcut used there.
//
// decidePropertyConflict() calls `window.prompt(...)` synchronously for a
// rationale before making its POST -- jsdom's window.prompt returns null by
// default (not an "not implemented" warning like alert/confirm), so it's
// stubbed here with a fixed return value per test.
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
  vi.restoreAllMocks();
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

function okResponse(): Response {
  return new Response(null, {status: 204});
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

function emptyReconciliation() {
  return {
    entity_id: 'ent-1',
    statement_duplicates: [],
    relationship_duplicates: [],
    summary: {statement_pairs: 0, relationship_pairs: 0, unresolved_pairs: 0},
  };
}

function dossierFixture(overrides: Record<string, unknown> = {}) {
  return {
    entity: entityA,
    summary: {
      statement_count: 5,
      relationship_count: 0,
      claim_count: 0,
      evidence_count: 0,
      lead_count: 0,
      external_finding_count: 0,
      unresolved_external_count: 0,
    },
    identity_history: {
      canonical_entity_id: 'ent-1',
      aliases: [{id: 'alias-1', caption: 'Kestrelwood Holdings LLC', schema: 'Company'}],
      canonical_decisions: [
        {
          id: 'dec-1',
          decision: 'same',
          confidence: 0.95,
          rationale: 'Matched registration number.',
          other_entity: {id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company'},
        },
      ],
      merge_audits: [
        {id: 'merge-1', source_entity_id: 'ent-2', target_entity_id: 'ent-1', rationale: 'Confirmed duplicate filing.'},
      ],
      unresolved_decision_count: 0,
    },
    property_conflicts: [],
    relationships: [],
    claims: [],
    evidence: [],
    ...overrides,
  };
}

function propertyConflict(overrides: Record<string, unknown> = {}) {
  return {
    prop: 'incorporation_date',
    status: 'unresolved',
    preferred_value: null,
    reason: 'Multiple conflicting values reported by different sources.',
    latest_decision: null,
    values: [
      {value: '2015-03-01', canonical: true, support_count: 2, conflict_count: 0, canonical_statements: [], external_assessments: []},
      {value: '2016-07-14', canonical: false, support_count: 1, conflict_count: 1, canonical_statements: [], external_assessments: []},
    ],
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

async function bootstrapAndOpenDossier(dossier: unknown): Promise<{fetchMock: ReturnType<typeof vi.fn>}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of cascadeResponses([entityA])) {
    fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockResolvedValueOnce(jsonResponse({candidates: []})); // AiReasoningPanel

  fetchMock
    .mockResolvedValueOnce(jsonResponse(dossier)) // GET dossier
    .mockResolvedValueOnce(jsonResponse([])) // GET duplicate-candidates
    .mockResolvedValueOnce(jsonResponse(emptyReconciliation())); // GET post-merge-reconciliation

  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');

  // loadEntities() auto-fills entityId to entities[0], so "Open dossier" is
  // already enabled without touching the entity <select>.
  await userEvent.setup().click(screen.getByRole('button', {name: 'Open dossier'}));
  await screen.findByText('Kestrelwood Holdings Ltd dossier');

  return {fetchMock};
}

describe('Home entity dossier: identity history & property conflicts', () => {
  it("renders the dossier's identity/merge history", async () => {
    await bootstrapAndOpenDossier(dossierFixture());

    expect(screen.getByText('Identity / merge history')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === ' · 1 merged alias(es) · 1 reporter identity decision(s)', {selector: 'small'}),
    ).toBeInTheDocument();
    expect(screen.getByText('Alias: Kestrelwood Holdings LLC', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('same: Kestrelwood Holdings LLC', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('Merge audit: ent-2 → ent-1', {exact: false})).toBeInTheDocument();
  });

  it('records a property-conflict decision with a prompted rationale', async () => {
    const {fetchMock} = await bootstrapAndOpenDossier(dossierFixture({property_conflicts: [propertyConflict()]}));

    expect(screen.queryByText('No unresolved multi-value property conflicts detected.')).not.toBeInTheDocument();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Confirmed via updated filing.');

    fetchMock
      .mockResolvedValueOnce(okResponse()) // POST decision
      .mockResolvedValueOnce(
        jsonResponse(
          dossierFixture({
            property_conflicts: [
              propertyConflict({
                status: 'resolved',
                latest_decision: {id: 'pcd-1', decision: 'temporal_change', values: ['2015-03-01', '2016-07-14'], rationale: 'Confirmed via updated filing.', created_at: '2026-09-23T00:00:00Z'},
              }),
            ],
          }),
        ),
      ) // GET dossier reload
      .mockResolvedValueOnce(jsonResponse([])) // GET duplicate-candidates reload
      .mockResolvedValueOnce(jsonResponse(emptyReconciliation())); // GET post-merge-reconciliation reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Temporal change'}));

    await screen.findByText('Reporter rationale: Confirmed via updated filing.', {exact: false});

    expect(promptSpy).toHaveBeenCalledWith('Reporter rationale for temporal_change:');

    const [decisionUrl, decisionInit] = fetchMock.mock.calls[16];
    expect(decisionUrl).toContain('/api/entities/ent-1/property-conflicts/incorporation_date/decisions');
    expect((decisionInit as RequestInit).method).toBe('POST');
    expect(JSON.parse((decisionInit as RequestInit).body as string)).toMatchObject({
      decision: 'temporal_change',
      values: ['2015-03-01', '2016-07-14'],
      rationale: 'Confirmed via updated filing.',
    });

    const [dossierReloadUrl] = fetchMock.mock.calls[17];
    const [duplicatesUrl] = fetchMock.mock.calls[18];
    const [reconciliationUrl] = fetchMock.mock.calls[19];
    expect(dossierReloadUrl).toContain('/api/entities/ent-1/dossier');
    expect(duplicatesUrl).toContain('/api/entities/ent-1/duplicate-candidates');
    expect(reconciliationUrl).toContain('/api/entities/ent-1/post-merge-reconciliation');
  });

  it('URL-encodes the property name and sends preferred_value for a "Prefer <value>" decision', async () => {
    const spacedConflict = propertyConflict({prop: 'registered address', values: [{value: '1 Main St', canonical: true, support_count: 1, conflict_count: 1, canonical_statements: [], external_assessments: []}, {value: '2 Main St', canonical: false, support_count: 1, conflict_count: 1, canonical_statements: [], external_assessments: []}]});
    const {fetchMock} = await bootstrapAndOpenDossier(dossierFixture({property_conflicts: [spacedConflict]}));

    vi.spyOn(window, 'prompt').mockReturnValue('Confirmed by the latest filing.');

    fetchMock
      .mockResolvedValueOnce(okResponse()) // POST decision
      .mockResolvedValueOnce(jsonResponse(dossierFixture({property_conflicts: [spacedConflict]}))) // GET dossier reload
      .mockResolvedValueOnce(jsonResponse([])) // GET duplicate-candidates reload
      .mockResolvedValueOnce(jsonResponse(emptyReconciliation())); // GET post-merge-reconciliation reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Prefer 1 Main St'}));

    await new Promise((resolve) => setTimeout(resolve, 0));

    const [decisionUrl, decisionInit] = fetchMock.mock.calls[16];
    expect(decisionUrl).toContain('/api/entities/ent-1/property-conflicts/registered%20address/decisions');
    expect(JSON.parse((decisionInit as RequestInit).body as string)).toMatchObject({
      decision: 'preferred',
      preferred_value: '1 Main St',
      values: ['1 Main St', '2 Main St'],
    });
  });
});
