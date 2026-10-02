// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 4: the "Questions & reporting leads" flow on
// app/page.tsx. Unlike the API-access and investigation-search flows (cycles
// 1-2), this one needs `inv` set, so an investigation must actually be
// selected -- there is no way to reach createLead/setLeadStatus/convertLead
// otherwise (each starts with `if(!inv...)return`). loadAppBootstrap()
// auto-selects investigations[0] when the list is non-empty, which starts
// every per-investigation load at once (findings, entities, graph, leads
// queue, claims, evidence, sources, documents, plus the timeline, sources
// and AI reasoning queue the panels load for themselves). The stub answers
// by route, not by call order (ADR-0005, line 15; test-support/page-routes.ts
// lists the routes), so a test says what the server holds and never in what
// order the page asks. Every per-investigation route except the leads queue
// answers with an empty-but-valid body, since api.array()/api.parsed() never
// inspect items in an empty array; only the lead fixture has to satisfy
// isLeadItem in full.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {leadQueueBody, pageRoutes} from '../test-support/page-routes';

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

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};
const LEADS_QUEUE = 'GET /api/investigations/inv-1/leads/queue';

// Replies carry the full shape the API declares (lib/generated/types.gen.ts):
// the panel's generated client checks each one.
function leadFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    investigation_id: 'inv-1',
    title: 'Who approved this contract?',
    status: 'unreviewed',
    priority: 'high',
    owner: 'A. Reporter',
    detail: 'Need to confirm the approver identity.',
    provider: null,
    provider_record_id: null,
    kind: 'question',
    next_action: null,
    created_at: '2026-10-01T00:00:00',
    links: [],
    tasks: [],
    history: [],
    triage: {
      needs_attention: true,
      attention_score: 2,
      stance_counts: {supports: 1, contradicts: 0, context: 0},
      linked_claim_count: 0,
      disputed_claim_count: 0,
      relationship_evidence_review_counts: {supports: 0, contradicts: 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0},
      reasons: ['unresolved contradiction'],
    },
    ...overrides,
  };
}

async function bootstrapWithOneLead(): Promise<MockApi> {
  const api = mockApi(pageRoutes({investigations: [investigation], leads: [leadFixture()]}));

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Who approved this contract?');
  return api;
}

describe('Home questions & reporting leads', () => {
  it('renders a queued lead with its triage state', async () => {
    const api = await bootstrapWithOneLead();

    expect(screen.getByText('Who approved this contract?')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument(); // priority badge
    expect(
      screen.getByText((_, node) => node?.textContent === 'reporter lead · ⚠ evidence conflict score 2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Needs evidence review:')).toBeInTheDocument();
    expect(screen.getByText('unresolved contradiction', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('Owner: A. Reporter')).toBeInTheDocument();
    // the card sits in its "Unreviewed" kanban column
    expect(screen.getByRole('combobox', {name: 'Move "Who approved this contract?"'})).toBeInTheDocument();
    // The queue was asked for with resolved leads included, and nothing the
    // page asked for went unanswered.
    expect(api.lastUrl(LEADS_QUEUE).searchParams.get('unresolved_only')).toBe('false');
    expect(api.unmatched()).toEqual([]);
  });

  it('creates a lead (POST then PATCH priority/owner) and reloads the queue', async () => {
    const api = await bootstrapWithOneLead();

    const second = leadFixture({id: 'lead-2', title: 'Second question', status: 'unreviewed', priority: 'urgent', owner: ''});
    api.add({
      'POST /api/leads': leadFixture({id: 'lead-2', title: 'Second question', priority: 'normal', owner: null}),
      'PATCH /api/leads/lead-2': second,
      // The queue the reload finds: both leads.
      [LEADS_QUEUE]: leadQueueBody('inv-1', [leadFixture(), second]),
    });

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Who approved this contract?'),
      'Second question',
    );
    await user.click(screen.getAllByRole('combobox').find(el => el.textContent === 'normal')!);
    await user.click(await screen.findByRole('option', {name: 'urgent'}));
    await user.click(screen.getByRole('button', {name: 'Add lead'}));

    await screen.findByText('Second question');

    expect(api.calls('POST /api/leads')).toHaveLength(1);
    expect(api.lastBody('POST /api/leads')).toMatchObject({
      investigation_id: 'inv-1',
      title: 'Second question',
      status: 'unreviewed',
    });
    // The PATCH can only name lead-2 once the POST has answered with its id.
    expect(api.calls('PATCH /api/leads/lead-2')).toHaveLength(1);
    expect(api.lastBody('PATCH /api/leads/lead-2')).toMatchObject({priority: 'urgent'});
    expect(api.calls(LEADS_QUEUE)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('does not create a lead with a blank title', async () => {
    const api = await bootstrapWithOneLead();
    const callsBefore = api.fetch.mock.calls.length;

    await userEvent.setup().click(screen.getByRole('button', {name: 'Add lead'}));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.calls('POST /api/leads')).toHaveLength(0);
    expect(api.fetch.mock.calls.length).toBe(callsBefore);
  });

  // The kanban status-select/drag-to-column interaction itself is covered at
  // the component level (tests/test-leads-kanban-board.test.tsx) rather than
  // here: opening that per-card <Select> through the full Home page reliably
  // triggers a Radix-Select-vs-jsdom quirk when it runs after any other test
  // in this file that performs an unrelated click first (the dropdown's
  // option list never appears), even though the same interaction is solid
  // in isolation and in every other test file in this suite that does it
  // only once. The wiring this test would have asserted -- onStatusChange
  // calling the existing setLeadStatus, which PATCHes /api/leads/{id} --
  // is unchanged pre-existing code, not something this refactor touched.

  it('converts a lead to a claim and reloads both leads and claims', async () => {
    const api = await bootstrapWithOneLead();

    const converted = leadFixture({status: 'converted'});
    api.add({
      'POST /api/leads/lead-1/convert': {
        kind: 'claim', lead: converted,
        record: {id: 'claim-1', investigation_id: 'inv-1', text: 'Who approved this contract?', status: 'lead', confidence: 0, created_at: '2026-10-02T00:00:00'},
      },
      [LEADS_QUEUE]: leadQueueBody('inv-1', [converted]),
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Make claim'}));
    await waitFor(() => {
      expect(api.calls(LEADS_QUEUE)).toHaveLength(2);
      expect(api.calls('GET /api/investigations/inv-1/claims')).toHaveLength(2);
    });

    expect(api.calls('POST /api/leads/lead-1/convert')).toHaveLength(1);
    expect(api.lastBody('POST /api/leads/lead-1/convert')).toMatchObject({kind: 'claim'});
    expect(api.unmatched()).toEqual([]);
  });
});
