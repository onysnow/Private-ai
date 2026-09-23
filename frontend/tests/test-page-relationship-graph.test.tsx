// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 10: the "FollowTheMoney relationship graph"
// flow on app/page.tsx (createRelationship, the schema-filter checkboxes,
// openGraphEdge, attachEvidenceToRelationship, reviewRelationshipEvidence).
// Like cycles 4/6/7, these all need `inv` set, so the full 9-call
// selectInvestigation() cascade plus AiReasoningPanel's post-select fetch is
// driven via loadAppBootstrap()'s auto-select (see
// test-page-leads.test.tsx's module docstring for the exact call order and
// why each cascade slot's shape matters).
//
// One thing this section's own loadEntities() does that no earlier cycle's
// target function did: whenever the loaded entities list doesn't already
// contain the current relSource/relTarget, it auto-fills them to
// entities[0]/entities[1] (see app/page.tsx's loadEntities). Seeding the
// cascade's entities response with two (or, for the disabled-guard test,
// one) canonical entities therefore pre-selects the relationship form's
// source/target selects without any user interaction -- no need to drive
// the <select> elements by hand.
//
// The <Graph> component here is a hand-written inline SVG (task #44's
// vis-network swap hasn't happened yet), so its edges/nodes are ordinary
// DOM elements with onClick handlers -- openGraphEdge is exercised through
// the simpler, always-visible `.relEdge` span in the relationshipList below
// the graph instead, which fires the exact same handler.
//
// Also because of that same loadEntities() auto-fill, `entityId` is
// non-empty by the time attachEvidenceToRelationship/reviewRelationshipEvidence
// succeed, so their trailing `if(entityId)void loadDossier(entityId)`
// fire-and-forget call actually fires. It's never mocked here (loadDossier
// itself chains three more fetches), so it fails and is caught by
// loadDossier's own try/catch, which alerts -- jsdom logs a harmless "Not
// implemented: window.alert()" notice to stderr for that. It doesn't
// consume any of this file's queued mock responses (there's nothing queued
// for it to consume) and doesn't affect any assertion below.
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
const entityB = {id: 'ent-2', caption: 'Jane Doe', schema: 'Person', properties: {}};

function emptyGraph(edges: unknown[] = []) {
  return {
    nodes: [],
    edges,
    schemas: [],
    reconciliation: {
      collapsed_by_default: true,
      suppressed_duplicate_count: 0,
      underlying_edge_count: 0,
      visible_edge_count: 0,
    },
  };
}

function relationshipFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel-1',
    relationship_entity_id: 'rel-entity-1',
    ftm_id: 'ftm-1',
    schema: 'Ownership',
    caption: 'Ownership',
    properties: {},
    source: {id: 'ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company'},
    target: {id: 'ent-2', caption: 'Jane Doe', schema: 'Person'},
    provenance: {statement_count: 0, sources: [], evidence_attachments: []},
    ...overrides,
  };
}

function evidencePoolRow() {
  return {
    evidence: {id: 'ev-1', source_id: 'src-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4'},
    source: {id: 'src-1', title: 'Board minutes'},
  };
}

// The 9 selectInvestigation() cascade calls, in call order. entities and
// graph edges are the two slots this section's tests actually vary.
function cascadeResponses(entities: unknown[], edges: unknown[] = [], evidence: unknown[] = []): Response[] {
  return [
    jsonResponse([]), // GET connector-findings
    jsonResponse(entities), // GET entities
    jsonResponse(emptyGraph(edges)), // GET graph
    jsonResponse({events: [], verification_counts: {}}), // GET timeline
    jsonResponse({items: []}), // GET leads/queue
    jsonResponse([]), // GET claims
    jsonResponse(evidence), // GET evidence
    jsonResponse([]), // GET sources
    jsonResponse([]), // GET documents
  ];
}

async function bootstrap(
  entities: unknown[],
  edges: unknown[] = [],
  evidence: unknown[] = [],
): Promise<{fetchMock: ReturnType<typeof vi.fn>}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of cascadeResponses(entities, edges, evidence)) {
    fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockResolvedValueOnce(jsonResponse({candidates: []})); // AiReasoningPanel
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');
  return {fetchMock};
}

describe('Home FollowTheMoney relationship graph', () => {
  it('pre-selects source/target from the loaded entities and creates a relationship', async () => {
    const {fetchMock} = await bootstrap([entityA, entityB]);

    // loadEntities() auto-fills relSource/relTarget to entities[0]/[1] when
    // neither is already in the list -- no <select> interaction needed, and
    // the "Add relationship" button should already be enabled.
    const addButton = await screen.findByRole('button', {name: 'Add relationship'});
    expect(addButton).not.toBeDisabled();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // POST /api/relationships
      .mockResolvedValueOnce(jsonResponse(emptyGraph([relationshipFixture()]))) // loadRelationships reload
      .mockResolvedValueOnce(jsonResponse([entityA, entityB])); // loadEntities reload

    await userEvent.setup().click(addButton);

    // createRelationship() doesn't open the edge detail panel (that's
    // openGraphEdge's job, tested separately below) -- it just reloads the
    // relationships list and entities, so the new edge's endpoints show up
    // as separate .relNode buttons in the relationshipList row.
    await screen.findByRole('button', {name: 'Kestrelwood Holdings Ltd'});
    expect(screen.getByRole('button', {name: 'Jane Doe'})).toBeInTheDocument();
    expect(screen.queryByText('No canonical relationships yet.')).not.toBeInTheDocument();

    const [postUrl, postInit] = fetchMock.mock.calls[13];
    expect(postUrl).toContain('/api/relationships');
    expect((postInit as RequestInit).method).toBe('POST');
    expect(JSON.parse((postInit as RequestInit).body as string)).toMatchObject({
      investigation_id: 'inv-1',
      schema: 'Ownership',
      source_entity_id: 'ent-1',
      target_entity_id: 'ent-2',
      properties: {},
      dataset: 'reporter',
      evidence_id: null,
    });
  });

  it('disables Add relationship when only one entity exists (source and target fall back to the same one)', async () => {
    await bootstrap([entityA]);

    expect(await screen.findByRole('button', {name: 'Add relationship'})).toBeDisabled();
  });

  it("opens a relationship edge and loads its evidence review history", async () => {
    const {fetchMock} = await bootstrap([entityA, entityB], [relationshipFixture()]);

    fetchMock.mockResolvedValueOnce(jsonResponse({reviews: []})); // GET evidence-reviews

    await userEvent.setup().click(screen.getByText('Ownership', {selector: '.relEdge'}));

    await screen.findByText('Kestrelwood Holdings Ltd → Jane Doe');
    // The base fixture has no evidence attachments yet, so the
    // assessment-history block (gated on evidence_attachments.length>0)
    // doesn't render at all -- what should render unconditionally for a
    // non-duplicate edge is the "attach evidence" form.
    expect(screen.getByText('Attach exact evidence')).toBeInTheDocument();

    const [reviewsUrl] = fetchMock.mock.calls[13];
    expect(reviewsUrl).toContain('/api/relationships/rel-1/evidence-reviews');
  });

  it('attaches evidence from the investigation pool to an opened relationship', async () => {
    const {fetchMock} = await bootstrap([entityA, entityB], [relationshipFixture()], [evidencePoolRow()]);

    fetchMock.mockResolvedValueOnce(jsonResponse({reviews: []})); // GET evidence-reviews
    await userEvent.setup().click(screen.getByText('Ownership', {selector: '.relEdge'}));
    await screen.findByText('Attach exact evidence');

    const attachButton = screen.getByRole('button', {name: 'Attach evidence'});
    expect(attachButton).toBeDisabled();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByDisplayValue('Choose investigation evidence…'), 'ev-1');
    expect(attachButton).not.toBeDisabled();

    const attached = relationshipFixture({
      provenance: {
        statement_count: 0,
        sources: [],
        evidence_attachments: [
          {
            attachment_id: 'att-1',
            attached_by: 'reporter',
            note: null,
            created_at: '2026-09-01T00:00:00Z',
            evidence: {id: 'ev-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', source: {id: 'src-1', title: 'Board minutes'}},
            latest_review: null,
          },
        ],
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(attached)); // POST .../evidence

    await user.click(attachButton);

    await screen.findByText('Evidence attached. Review its support state below.');
    // The quote renders alongside a "Exact evidence:" <b> label in the same
    // div, so its own text node isn't the element's whole textContent --
    // match on substring instead of the full leaf text.
    expect(screen.getByText('Approved 3/3, signed by CFO.', {exact: false})).toBeInTheDocument();

    const [attachUrl, attachInit] = fetchMock.mock.calls[14];
    expect(attachUrl).toContain('/api/relationships/rel-1/evidence');
    expect(JSON.parse((attachInit as RequestInit).body as string)).toMatchObject({evidence_id: 'ev-1', note: null});
  });

  it('requires a rationale before recording a relationship-evidence assessment', async () => {
    const attachedFixture = relationshipFixture({
      provenance: {
        statement_count: 0,
        sources: [],
        evidence_attachments: [
          {
            attachment_id: 'att-1',
            attached_by: 'reporter',
            note: null,
            created_at: '2026-09-01T00:00:00Z',
            evidence: {id: 'ev-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', source: {id: 'src-1', title: 'Board minutes'}},
            latest_review: null,
          },
        ],
      },
    });
    const {fetchMock} = await bootstrap([entityA, entityB], [attachedFixture], [evidencePoolRow()]);

    fetchMock.mockResolvedValueOnce(jsonResponse({reviews: []})); // GET evidence-reviews
    await userEvent.setup().click(screen.getByText('Ownership', {selector: '.relEdge'}));
    await screen.findByText('Approved 3/3, signed by CFO.', {exact: false});

    const supportsButton = screen.getByRole('button', {name: 'Supports'});
    expect(supportsButton).toBeDisabled();

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Required rationale before recording an evidence assessment'),
      'Board minutes directly confirm the ownership stake.',
    );
    expect(supportsButton).not.toBeDisabled();

    fetchMock
      .mockResolvedValueOnce(jsonResponse(attachedFixture)) // POST .../evidence/ev-1/reviews
      .mockResolvedValueOnce(jsonResponse({reviews: [{id: 'rev-1', relationship_edge_id: 'rel-1', evidence_id: 'ev-1', stance: 'supports', rationale: 'Board minutes directly confirm the ownership stake.', created_at: '2026-09-23T00:00:00Z'}]})); // GET evidence-reviews reload

    await user.click(supportsButton);

    await screen.findByText('Recorded supports assessment. Canonical relationship preserved.');
    expect(screen.getByText('Board minutes directly confirm the ownership stake.', {selector: 'div'})).toBeInTheDocument();

    const [reviewUrl, reviewInit] = fetchMock.mock.calls[14];
    expect(reviewUrl).toContain('/api/relationships/rel-1/evidence/ev-1/reviews');
    expect(JSON.parse((reviewInit as RequestInit).body as string)).toMatchObject({
      stance: 'supports',
      rationale: 'Board minutes directly confirm the ownership stake.',
    });
  });
});
