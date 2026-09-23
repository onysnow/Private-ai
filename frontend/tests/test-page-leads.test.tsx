// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 4: the "Questions & reporting leads" flow on
// app/page.tsx. Unlike the API-access and investigation-search flows (cycles
// 1-2), this one needs `inv` set, so an investigation must actually be
// selected -- there is no way to reach createLead/setLeadStatus/convertLead
// otherwise (each starts with `if(!inv...)return`). loadAppBootstrap()
// auto-selects investigations[0] when the list is non-empty, which fires
// selectInvestigation()'s full 9-endpoint Promise.all cascade (findings,
// entities, graph, timeline, leads/queue, claims, evidence, sources,
// documents, in that exact call order -- each loader is an async function
// that runs synchronously up to its own fetch(), and Promise.all invokes
// the array left-to-right, so the mocked fetch sequence below is positional,
// not matched by URL). Every cascade endpoint except leads/queue is given an
// empty-but-valid body since api.array()/api.parsed() never inspects items
// in an empty array; only the lead fixture has to satisfy isLeadItem in
// full.
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

function leadFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    title: 'Who approved this contract?',
    status: 'unreviewed',
    priority: 'high',
    owner: 'A. Reporter',
    detail: 'Need to confirm the approver identity.',
    provider: null,
    next_action: null,
    links: [],
    tasks: [],
    triage: {
      needs_attention: true,
      attention_score: 2,
      stance_counts: {supports: 1, contradicts: 0, context: 0},
      linked_claim_count: 0,
      disputed_claim_count: 0,
      reasons: ['unresolved contradiction'],
    },
    ...overrides,
  };
}

// The 9 selectInvestigation() cascade calls, in call order, each an
// empty-but-shape-valid body -- see module docstring.
function cascadeResponses(leads: unknown[] = []) {
  return [
    jsonResponse([]), // GET connector-findings
    jsonResponse([]), // GET entities (parseEntityList expects the raw array, not {entities:[]})
    jsonResponse(emptyGraph), // GET graph
    jsonResponse({events: [], verification_counts: {}}), // GET timeline
    jsonResponse({items: leads}), // GET leads/queue
    jsonResponse([]), // GET claims
    jsonResponse([]), // GET evidence
    jsonResponse([]), // GET sources
    jsonResponse([]), // GET documents
  ];
}

async function bootstrapWithOneLead(): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  for (const response of cascadeResponses([leadFixture()])) {
    fetchMock.mockResolvedValueOnce(response);
  }
  // AiReasoningPanel (issue #36 UI) has its own effect keyed on investigationId
  // and fires its own fetch once `inv` becomes non-empty, after the 9-call
  // cascade above -- separate from selectInvestigation's Promise.all.
  fetchMock.mockResolvedValueOnce(jsonResponse({candidates: []}));
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Who approved this contract?');
  return {fetchMock};
}

describe('Home questions & reporting leads', () => {
  it('renders a queued lead with its triage state', async () => {
    await bootstrapWithOneLead();

    expect(screen.getByText('Who approved this contract?')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === 'high · unreviewed · ⚠ evidence conflict score 2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Needs evidence review:')).toBeInTheDocument();
    expect(screen.getByText('unresolved contradiction', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('Owner: A. Reporter')).toBeInTheDocument();
  });

  it('creates a lead (POST then PATCH priority/owner) and reloads the queue', async () => {
    const {fetchMock} = await bootstrapWithOneLead();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({id: 'lead-2'})) // POST /api/leads
      .mockResolvedValueOnce(jsonResponse({})) // PATCH /api/leads/lead-2
      .mockResolvedValueOnce(
        jsonResponse({items: [leadFixture(), leadFixture({id: 'lead-2', title: 'Second question', status: 'unreviewed', priority: 'urgent', owner: ''})]}),
      ); // GET leads/queue reload

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Who approved this contract?'),
      'Second question',
    );
    const prioritySelect = screen.getByDisplayValue('normal');
    await user.selectOptions(prioritySelect, 'urgent');
    await user.click(screen.getByRole('button', {name: 'Add lead'}));

    await screen.findByText('Second question');

    expect(fetchMock).toHaveBeenCalledTimes(16);
    const [postUrl, postInit] = fetchMock.mock.calls[13];
    expect(postUrl).toContain('/api/leads');
    expect(JSON.parse((postInit as RequestInit).body as string)).toMatchObject({
      investigation_id: 'inv-1',
      title: 'Second question',
      status: 'unreviewed',
    });
    const [patchUrl, patchInit] = fetchMock.mock.calls[14];
    expect(patchUrl).toContain('/api/leads/lead-2');
    expect((patchInit as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((patchInit as RequestInit).body as string)).toMatchObject({priority: 'urgent'});
  });

  it('does not create a lead with a blank title', async () => {
    const {fetchMock} = await bootstrapWithOneLead();
    const callsBefore = fetchMock.mock.calls.length;

    await userEvent.setup().click(screen.getByRole('button', {name: 'Add lead'}));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(callsBefore);
  });

  it('moves a lead through status transitions via setLeadStatus', async () => {
    const {fetchMock} = await bootstrapWithOneLead();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({})) // PATCH status=active
      .mockResolvedValueOnce(jsonResponse({items: [leadFixture({status: 'active'})]})); // reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Active'}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(15));

    const [patchUrl, patchInit] = fetchMock.mock.calls[13];
    expect(patchUrl).toContain('/api/leads/lead-1');
    expect(JSON.parse((patchInit as RequestInit).body as string)).toMatchObject({status: 'active'});
  });

  it('converts a lead to a claim and reloads both leads and claims', async () => {
    const {fetchMock} = await bootstrapWithOneLead();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({claim_id: 'claim-1'})) // POST convert
      .mockResolvedValueOnce(jsonResponse({items: [leadFixture({status: 'converted'})]})) // leads reload
      .mockResolvedValueOnce(jsonResponse([])); // claims reload

    await userEvent.setup().click(screen.getByRole('button', {name: 'Make claim'}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(16));

    const [convertUrl, convertInit] = fetchMock.mock.calls[13];
    expect(convertUrl).toContain('/api/leads/lead-1/convert');
    expect(JSON.parse((convertInit as RequestInit).body as string)).toMatchObject({kind: 'claim'});
  });
});
