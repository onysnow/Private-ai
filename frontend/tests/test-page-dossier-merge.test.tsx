// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 12 (second entity-dossier sub-cycle): the
// dossier's canonical-duplicate merge workflow (decideCanonicalDuplicate,
// previewCanonicalMerge, executeCanonicalMerge) and post-merge
// reconciliation (decideReconciliation). See cycle 11's docstring for why
// the dossier is split across multiple cycles, and cycle 10's finding
// about loadEntities() auto-filling entityId (used here the same way to
// reach "Open dossier" with no <select> interaction).
//
// Each test below keeps only the fixture data relevant to what it's
// exercising: a duplicate-candidate test carries an empty reconciliation
// (0 pairs, so that panel doesn't render), and the reconciliation test
// carries an empty duplicateCandidates list -- both panels have their own
// "Unsure" button, so keeping them mutually exclusive per test avoids an
// ambiguous query rather than needing extra disambiguation.
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
const entityB = {id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company', properties: {}};

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

function emptyReconciliation(entityId = 'ent-1') {
  return {
    entity_id: entityId,
    statement_duplicates: [],
    relationship_duplicates: [],
    summary: {statement_pairs: 0, relationship_pairs: 0, unresolved_pairs: 0},
  };
}

function dossierFixture(entity: unknown, overrides: Record<string, unknown> = {}) {
  return {
    entity,
    summary: {
      statement_count: 5,
      relationship_count: 0,
      claim_count: 0,
      evidence_count: 0,
      lead_count: 0,
      external_finding_count: 0,
      unresolved_external_count: 0,
    },
    property_conflicts: [],
    relationships: [],
    claims: [],
    evidence: [],
    ...overrides,
  };
}

function duplicateCandidate(overrides: Record<string, unknown> = {}) {
  return {
    entity_id: 'ent-2',
    caption: 'Kestrelwood Holdings LLC',
    schema: 'Company',
    score: 0.87,
    latest_decision: null,
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

async function bootstrapAndOpenDossier(
  dossier: unknown,
  duplicates: unknown[],
  reconciliation: unknown,
): Promise<{fetchMock: ReturnType<typeof vi.fn>}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of cascadeResponses([entityA, entityB])) {
    fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockResolvedValueOnce(jsonResponse({candidates: []})); // AiReasoningPanel

  fetchMock
    .mockResolvedValueOnce(jsonResponse(dossier)) // GET dossier
    .mockResolvedValueOnce(jsonResponse(duplicates)) // GET duplicate-candidates
    .mockResolvedValueOnce(jsonResponse(reconciliation)); // GET post-merge-reconciliation

  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');

  // loadEntities() auto-fills entityId to entities[0].
  await userEvent.setup().click(screen.getByRole('button', {name: 'Open dossier'}));
  await screen.findByText('Kestrelwood Holdings Ltd dossier');

  return {fetchMock};
}

describe('Home entity dossier: canonical duplicates & merge', () => {
  it('records a "same entity" duplicate decision and reloads the dossier', async () => {
    const {fetchMock} = await bootstrapAndOpenDossier(dossierFixture(entityA), [duplicateCandidate()], emptyReconciliation());

    await screen.findByText('Possible canonical duplicates');
    expect(screen.getByRole('button', {name: 'Preview merge into this record'})).toBeDisabled();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // POST canonical-resolution
      .mockResolvedValueOnce(jsonResponse(dossierFixture(entityA))) // GET dossier reload
      .mockResolvedValueOnce(
        jsonResponse([duplicateCandidate({latest_decision: {id: 'dec-1', decision: 'same', confidence: 0.9}})]),
      ) // GET duplicate-candidates reload
      .mockResolvedValueOnce(jsonResponse(emptyReconciliation())); // GET post-merge-reconciliation reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Same entity'}));

    // The wrapping <div> around this <small> has no other text, so a plain
    // getByText would match both -- disambiguate the same way earlier
    // cycles did for a div-wraps-only-a-small pattern.
    await screen.findByText('Latest review: same · 90%', {selector: 'small'});
    expect(screen.getByRole('button', {name: 'Preview merge into this record'})).not.toBeDisabled();

    const [decisionUrl, decisionInit] = fetchMock.mock.calls[16];
    expect(decisionUrl).toContain('/api/entities/ent-1/canonical-resolution');
    expect(JSON.parse((decisionInit as RequestInit).body as string)).toMatchObject({
      other_entity_id: 'ent-2',
      decision: 'same',
      confidence: 0.9,
    });
  });

  it('previews a canonical merge once the duplicate is marked "same" and executes it', async () => {
    const {fetchMock} = await bootstrapAndOpenDossier(
      dossierFixture(entityA),
      [duplicateCandidate({latest_decision: {id: 'dec-1', decision: 'same', confidence: 0.9}})],
      emptyReconciliation(),
    );

    const previewButton = await screen.findByRole('button', {name: 'Preview merge into this record'});
    expect(previewButton).not.toBeDisabled();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        source: {id: 'ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company'},
        target: {id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company'},
        references: {},
        total_references: 12,
        blockers: [],
        can_execute: true,
        preview_digest: 'digest-abc',
      }),
    ); // GET merge-preview

    await userEvent.setup().click(previewButton);

    await screen.findByText('12 reference(s) would move · 0 blocker(s)');
    const executeButton = screen.getByRole('button', {name: 'Execute previewed merge'});
    expect(executeButton).not.toBeDisabled();

    const [previewUrl] = fetchMock.mock.calls[16];
    expect(previewUrl).toContain('/api/entities/ent-1/merge-preview?target_entity_id=ent-2');

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // POST merge
      .mockResolvedValueOnce(jsonResponse([entityA, entityB])) // loadEntities(inv) reload
      .mockResolvedValueOnce(jsonResponse(dossierFixture(entityB))) // loadDossier(ent-2): GET dossier
      .mockResolvedValueOnce(jsonResponse([])) // GET duplicate-candidates
      .mockResolvedValueOnce(jsonResponse(emptyReconciliation('ent-2'))); // GET post-merge-reconciliation

    await userEvent.setup().click(executeButton);

    await screen.findByText('Kestrelwood Holdings LLC dossier');

    const [mergeUrl, mergeInit] = fetchMock.mock.calls[17];
    expect(mergeUrl).toContain('/api/entities/ent-1/merge');
    expect(JSON.parse((mergeInit as RequestInit).body as string)).toMatchObject({
      target_entity_id: 'ent-2',
      preview_digest: 'digest-abc',
    });

    const [entitiesReloadUrl] = fetchMock.mock.calls[18];
    const [newDossierUrl] = fetchMock.mock.calls[19];
    expect(entitiesReloadUrl).toContain('/api/investigations/inv-1/entities');
    expect(newDossierUrl).toContain('/api/entities/ent-2/dossier');
  });

  it('records a post-merge reconciliation decision on a duplicate statement pair', async () => {
    const statementPair = {
      record_type: 'statement',
      same_assertion: true,
      provenance_differs: false,
      latest_decision: null,
      record_a: {id: 'st-1', prop: 'name', value: 'Kestrelwood Holdings', dataset: 'aleph'},
      record_b: {id: 'st-2', prop: 'name', value: 'Kestrelwood Holdings Ltd', dataset: 'reporter'},
    };
    const reconciliationWithPair = {
      entity_id: 'ent-1',
      statement_duplicates: [statementPair],
      relationship_duplicates: [],
      summary: {statement_pairs: 1, relationship_pairs: 0, unresolved_pairs: 1},
    };
    const {fetchMock} = await bootstrapAndOpenDossier(dossierFixture(entityA), [], reconciliationWithPair);

    await screen.findByText('Post-merge duplicate review');
    expect(screen.getByText('1 statement pair(s) · 0 relationship pair(s) · 1 unresolved')).toBeInTheDocument();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // POST post-merge-reconciliation
      .mockResolvedValueOnce(
        jsonResponse({
          ...reconciliationWithPair,
          statement_duplicates: [{...statementPair, latest_decision: {id: 'rd-1', record_type: 'statement', record_a_id: 'st-1', record_b_id: 'st-2', decision: 'duplicate'}}],
          summary: {statement_pairs: 1, relationship_pairs: 0, unresolved_pairs: 0},
        }),
      ); // GET post-merge-reconciliation reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Duplicate · prefer first'}));

    await screen.findByText('1 statement pair(s) · 0 relationship pair(s) · 0 unresolved');

    const [decisionUrl, decisionInit] = fetchMock.mock.calls[16];
    expect(decisionUrl).toContain('/api/entities/ent-1/post-merge-reconciliation');
    expect(JSON.parse((decisionInit as RequestInit).body as string)).toMatchObject({
      record_type: 'statement',
      record_a_id: 'st-1',
      record_b_id: 'st-2',
      decision: 'duplicate',
      preferred_record_id: 'st-1',
    });

    const [reloadUrl] = fetchMock.mock.calls[17];
    expect(reloadUrl).toContain('/api/entities/ent-1/post-merge-reconciliation');
  });
});
