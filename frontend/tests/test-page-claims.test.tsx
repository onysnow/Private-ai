// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 6: the "Claim verification workspace" flow on
// app/page.tsx. Like leads (cycle 4), every handler here needs `inv` set, so
// the fixture drives selectInvestigation()'s full 9-call cascade plus
// AiReasoningPanel's own post-select fetch (see test-page-leads.test.tsx's
// docstring for the exact call order/count). The claims and evidence
// cascade slots are seeded with one row each so createClaim/openClaim,
// saveClaimReview, and attachEvidenceToClaim are all reachable without a
// second bootstrap.
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

function claimFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    investigation_id: 'inv-1',
    text: 'The contract was approved on March 3.',
    status: 'unverified',
    confidence: 0.4,
    ...overrides,
  };
}

function evidencePoolRow() {
  return {
    evidence: {id: 'ev-1', source_id: 'src-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4'},
    source: {id: 'src-1', title: 'Board minutes'},
  };
}

function emptyWorkspace(claim: ReturnType<typeof claimFixture>) {
  return {
    claim,
    evidence: [],
    dependent_relationships: [],
    review_history: [],
    stance_counts: {supports: 0, contradicts: 0, context: 0},
  };
}

// The 9 selectInvestigation() cascade calls, in call order, plus the
// AiReasoningPanel queue fetch that follows once `inv` is non-empty.
function bootstrapCalls(claims: unknown[], evidence: unknown[]) {
  return [
    jsonResponse([]), // GET connector-findings
    jsonResponse([]), // GET entities (parseEntityList expects the raw array, not {entities:[]})
    jsonResponse(emptyGraph), // GET graph
    jsonResponse({events: [], verification_counts: {}}), // GET timeline
    jsonResponse({items: []}), // GET leads/queue
    jsonResponse(claims), // GET claims
    jsonResponse(evidence), // GET evidence
    jsonResponse([]), // GET sources
    jsonResponse([]), // GET documents
    jsonResponse({candidates: []}), // AiReasoningPanel queue
  ];
}

async function bootstrapWithClaimAndEvidence(): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of bootstrapCalls([claimFixture()], [evidencePoolRow()])) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('The contract was approved on March 3.');
  return {fetchMock};
}

describe('Home claim verification workspace', () => {
  it('disables Add unverified claim until text is entered', async () => {
    await bootstrapWithClaimAndEvidence();
    expect(screen.getByRole('button', {name: 'Add unverified claim'})).toBeDisabled();
  });

  it('creates a claim, reloads the list, and opens its review workspace', async () => {
    const {fetchMock} = await bootstrapWithClaimAndEvidence();
    const created = claimFixture({id: 'claim-2', text: 'The vendor was paid twice.'});

    fetchMock
      .mockResolvedValueOnce(jsonResponse(created)) // POST /api/claims
      .mockResolvedValueOnce(jsonResponse([claimFixture(), created])) // GET claims reload
      .mockResolvedValueOnce(jsonResponse(emptyWorkspace(created))); // GET review-workspace

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Write a testable factual claim…'),
      'The vendor was paid twice.',
    );
    await user.click(screen.getByRole('button', {name: 'Add unverified claim'}));

    await screen.findByRole('heading', {name: 'The vendor was paid twice.', level: 4});
    expect(screen.getByText('No evidence is linked to this claim yet.')).toBeInTheDocument();

    const [postUrl, postInit] = fetchMock.mock.calls[13];
    expect(postUrl).toContain('/api/claims');
    expect(JSON.parse((postInit as RequestInit).body as string)).toMatchObject({
      investigation_id: 'inv-1',
      text: 'The vendor was paid twice.',
      status: 'unverified',
    });
  });

  it('requires a rationale before Record review is enabled, then saves the review', async () => {
    const {fetchMock} = await bootstrapWithClaimAndEvidence();

    fetchMock.mockResolvedValueOnce(jsonResponse(emptyWorkspace(claimFixture()))); // GET review-workspace
    await userEvent.setup().click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText("No canonical relationship currently depends on this claim's linked evidence.");
    expect(screen.getByRole('button', {name: 'Record review'})).toBeDisabled();

    const updated = claimFixture({status: 'confirmed', confidence: 0.9});
    fetchMock.mockResolvedValueOnce(
      jsonResponse({claim: updated, workspace: emptyWorkspace(updated)}),
    ); // POST /api/claims/claim-1/reviews

    const user = userEvent.setup();
    await user.selectOptions(screen.getByDisplayValue('unverified'), 'confirmed');
    await user.type(
      screen.getByPlaceholderText('Required rationale for this review'),
      'Board minutes confirm the date directly.',
    );
    await user.click(screen.getByRole('button', {name: 'Record review'}));

    await screen.findByText('Recorded immutable review: confirmed at 90% confidence.');

    const [reviewUrl, reviewInit] = fetchMock.mock.calls[14];
    expect(reviewUrl).toContain('/api/claims/claim-1/reviews');
    expect(JSON.parse((reviewInit as RequestInit).body as string)).toMatchObject({
      status: 'confirmed',
      rationale: 'Board minutes confirm the date directly.',
    });
  });

  it('attaches pool evidence to the open claim as supporting', async () => {
    const {fetchMock} = await bootstrapWithClaimAndEvidence();

    fetchMock.mockResolvedValueOnce(jsonResponse(emptyWorkspace(claimFixture()))); // GET review-workspace
    await userEvent.setup().click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('No evidence is linked to this claim yet.');

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // POST /api/claims/claim-1/evidence
      .mockResolvedValueOnce(
        jsonResponse(
          emptyWorkspace(claimFixture()).evidence
            ? {
                ...emptyWorkspace(claimFixture()),
                evidence: [
                  {id: 'link-1', stance: 'supports', evidence: evidencePoolRow().evidence, source: evidencePoolRow().source, note: null},
                ],
                stance_counts: {supports: 1, contradicts: 0, context: 0},
              }
            : emptyWorkspace(claimFixture()),
        ),
      ); // GET review-workspace reload (openClaim re-fetch)

    await userEvent.setup().click(screen.getByRole('button', {name: 'Supports'}));

    await waitFor(() => expect(screen.getByText('Linked evidence as supports.')).toBeInTheDocument());
    const [attachUrl, attachInit] = fetchMock.mock.calls[14];
    expect(attachUrl).toContain('/api/claims/claim-1/evidence');
    expect(JSON.parse((attachInit as RequestInit).body as string)).toMatchObject({
      evidence_id: 'ev-1',
      stance: 'supports',
    });
  });
});
