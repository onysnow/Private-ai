// @vitest-environment jsdom
// The dashboard on the generated client and TanStack Query (Foundation Fixes
// fixes 2 and 3): the investigation picker (a hidden demo case left out),
// the four counts and the two lists of the open case, another case picked
// (the numbers before stay until it answers), the empty state, and the error
// lines.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {Routes} from '../test-support/mock-api';
import {entityFixture, investigationRecord, leadQueueBody, timelineBody} from '../test-support/page-routes';

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

function leadFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1', investigation_id: 'inv-1', title: 'Who approved this contract?', status: 'unreviewed', priority: 'high', owner: null,
    detail: null, provider: null, provider_record_id: null, kind: 'question', next_action: null, created_at: '2026-10-01T00:00:00',
    links: [], tasks: [], history: [],
    triage: {
      needs_attention: false, attention_score: 0, stance_counts: {supports: 0, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0,
      relationship_evidence_review_counts: {supports: 0, contradicts: 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0}, reasons: [],
    },
    ...overrides,
  };
}

function claimFixture(id: string, status: string) {
  return {id, investigation_id: 'inv-1', text: `Claim ${id}`, status, confidence: 0.5, created_at: '2026-10-01T00:00:00'};
}

function eventFixture(id: string, title: string, date: string) {
  return {
    id, kind: 'reporter_event', investigation_id: 'inv-1', title, description: null, date_start: date, date_end: null, precision: 'day',
    verification_status: 'asserted', synthetic: false, refs: {}, provenance: {}, context: null, sort_key: date,
  };
}

const DEMO = {id: 'inv-demo', name: 'Demo Investigation', is_demo: true};
const CASE = {id: 'inv-1', name: 'Harbor contracts'};
const OTHER = {id: 'inv-2', name: 'Shell companies'};

/** The four reads of one investigation, in the generated shapes. */
function caseRoutes(id: string, records: {leads?: unknown[]; claims?: unknown[]; entities?: unknown[]; events?: unknown[]} = {}): Routes {
  const base = `/api/investigations/${id}`;
  return {
    [`GET ${base}/leads/queue`]: leadQueueBody(id, records.leads ?? []),
    [`GET ${base}/claims`]: records.claims ?? [],
    [`GET ${base}/entities`]: records.entities ?? [],
    [`GET ${base}/timeline`]: timelineBody(id, records.events ?? []),
  };
}

const busyCase = {
  leads: [
    leadFixture({id: 'lead-1', title: 'Who approved this contract?', status: 'unreviewed', priority: 'urgent', triage: {...leadFixture().triage, needs_attention: true, attention_score: 3}}),
    leadFixture({id: 'lead-2', title: 'Find the board minutes', status: 'active', priority: 'normal'}),
    leadFixture({id: 'lead-3', title: 'Closed out', status: 'resolved', priority: 'low'}),
  ],
  claims: [claimFixture('c-1', 'confirmed'), claimFixture('c-2', 'confirmed'), claimFixture('c-3', 'disputed')],
  entities: [entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company'), entityFixture('ent-2', 'Jane Doe', 'Person')],
  events: Array.from({length: 7}, (_, i) => eventFixture(`ev-${i + 1}`, `Event ${i + 1}`, `2024-0${i + 1}-01`)),
};

async function renderDashboard(routes: Routes) {
  const api = mockApi(routes);
  vi.resetModules();
  const {default: Dashboard} = await import('../app/dashboard/page');
  render(<Dashboard/>);
  return api;
}

describe('Dashboard', () => {
  it('opens the first investigation and shows its counts, the leads needing attention and the latest events', async () => {
    const api = await renderDashboard({
      'GET /api/investigations': [CASE, OTHER].map(investigationRecord),
      ...caseRoutes('inv-1', busyCase),
    });

    await screen.findByText('Who approved this contract?');
    // A count card is the label's parent (the "Open leads" link is an <a>, not a <div>).
    const card = (label: string) => screen.getByText(label, {selector: 'div'}).parentElement as HTMLElement;
    expect(within(card('Open leads')).getByText('2')).toBeInTheDocument();
    expect(within(card('Open leads')).getByText('1 flagged for attention')).toBeInTheDocument();
    expect(within(card('Claims')).getByText('3')).toBeInTheDocument();
    expect(screen.getByText('confirmed · 2')).toBeInTheDocument();
    expect(screen.getByText('disputed · 1')).toBeInTheDocument();
    expect(within(card('Entities tracked')).getByText('2')).toBeInTheDocument();
    expect(within(card('Timeline events')).getByText('7')).toBeInTheDocument();
    expect(screen.getByText('6 shown below')).toBeInTheDocument();
    // The six latest events, newest first; the first one is not among them.
    expect(screen.getByText('Event 7')).toBeInTheDocument();
    expect(screen.queryByText('Event 1')).not.toBeInTheDocument();
    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('inv-1');
    expect(api.lastUrl('GET /api/investigations/inv-1/leads/queue').searchParams.get('unresolved_only')).toBe('false');
    expect(api.unmatched()).toEqual([]);
  });

  it('shows another investigation when it is picked', async () => {
    const api = await renderDashboard({
      'GET /api/investigations': [CASE, OTHER].map(investigationRecord),
      ...caseRoutes('inv-1', busyCase),
      ...caseRoutes('inv-2', {claims: [claimFixture('c-9', 'lead')]}),
    });
    await screen.findByText('Who approved this contract?');

    await userEvent.setup().selectOptions(screen.getByRole('combobox'), 'inv-2');

    await screen.findByText('lead · 1');
    expect(screen.getByText('Nothing flagged right now.')).toBeInTheDocument();
    expect(screen.getByText('No timeline events yet.')).toBeInTheDocument();
    expect(api.calls('GET /api/investigations/inv-2/claims')).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('keeps the numbers shown until the picked investigation has answered, and when it cannot', async () => {
    await renderDashboard({
      'GET /api/investigations': [CASE, OTHER].map(investigationRecord),
      ...caseRoutes('inv-1', busyCase),
      ...caseRoutes('inv-2'),
      'GET /api/investigations/inv-2/claims': {status: 404, body: {detail: 'Investigation not found'}},
    });
    await screen.findByText('Who approved this contract?');

    await userEvent.setup().selectOptions(screen.getByRole('combobox'), 'inv-2');

    await screen.findByText(/Investigation not found/);
    expect(within(screen.getByText('Claims', {selector: 'div'}).parentElement as HTMLElement).getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Who approved this contract?')).toBeInTheDocument();
  });

  it('leaves out the demo investigation when it is hidden in this browser', async () => {
    window.localStorage.setItem('pai:hide-demo-investigations', '1');
    await renderDashboard({
      'GET /api/investigations': [DEMO, CASE].map(investigationRecord),
      ...caseRoutes('inv-1'),
    });
    expect(await screen.findByRole('combobox')).toHaveValue('inv-1');
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Harbor contracts']);
  });

  it('says so when there is no investigation yet', async () => {
    const api = await renderDashboard({'GET /api/investigations': []});
    await screen.findByText('No investigations yet.');
    expect(screen.getByRole('link', {name: 'Start one in the workbench'})).toHaveAttribute('href', '/#investigation-search');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });

  it('shows why the investigations could not be loaded', async () => {
    await renderDashboard({'GET /api/investigations': {status: 500, body: {detail: 'Database unavailable'}}});
    await screen.findByText(/Database unavailable/);
  });

  it('shows why the open investigation could not be read', async () => {
    await renderDashboard({
      'GET /api/investigations': [CASE].map(investigationRecord),
      ...caseRoutes('inv-1'),
      'GET /api/investigations/inv-1/claims': {status: 404, body: {detail: 'Investigation not found'}},
    });
    await screen.findByText(/Investigation not found/);
  });

  it('reports a reply of the wrong shape instead of showing it', async () => {
    await renderDashboard({
      'GET /api/investigations': [CASE].map(investigationRecord),
      ...caseRoutes('inv-1'),
      'GET /api/investigations/inv-1/entities': [{id: 'ent-1'}],
    });
    await waitFor(() => expect(screen.getByText(/Invalid API payload from \/api\/investigations\/inv-1\/entities/)).toBeInTheDocument());
  });
});
