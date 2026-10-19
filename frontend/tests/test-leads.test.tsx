// @vitest-environment jsdom
// The questions & reporting leads panel, moved out of app/page.tsx onto the
// generated client (Foundation Fixes fixes 2 and 3): the queue, adding a
// lead, moving it between columns, converting it, moving its tasks, and
// asking for traces through the shared store. The board itself is covered
// in test-leads-kanban-board.test.tsx.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ClaimsPanel} from '../features/claims/claims-panel';
import {LeadsPanel} from '../features/leads/leads-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {leadQueueBody} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null, claim: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const QUEUE = 'GET /api/investigations/inv-1/leads/queue';

function leadFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1', investigation_id: 'inv-1', title: 'Who approved this contract?', status: 'unreviewed', priority: 'high', owner: 'A. Reporter',
    detail: 'Need to confirm the approver identity.', provider: null, provider_record_id: null, kind: 'question', next_action: null,
    created_at: '2026-10-01T00:00:00', links: [], tasks: [], history: [],
    triage: {
      needs_attention: true, attention_score: 2, stance_counts: {supports: 1, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0,
      relationship_evidence_review_counts: {supports: 0, contradicts: 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0},
      reasons: ['unresolved contradiction'],
    },
    ...overrides,
  };
}

const task = {
  id: 'task-1', investigation_id: 'inv-1', lead_id: 'lead-1', title: 'Call the clerk', detail: null, status: 'todo', priority: 'normal', owner: null, due_date: null,
  created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00', task_context: null,
  history: [{id: 'tw-1', from_status: null, to_status: 'todo', note: 'Reporting task created', created_at: '2026-10-01T00:00:00', lead_provenance: null}],
};
const links = [
  {id: 'link-1', lead_id: 'lead-1', type: 'claim', target_id: 'claim-1', label: 'The contract was approved', note: 'Claim context: supports', created_at: '2026-10-01T00:00:00'},
  {id: 'link-2', lead_id: 'lead-1', type: 'relationship', target_id: 'rel-1', label: 'Jane Doe — Directorship → Kestrelwood', note: null, created_at: '2026-10-01T00:00:00'},
  {id: 'link-3', lead_id: 'lead-1', type: null, target_id: null, label: null, note: null, created_at: '2026-10-01T00:00:00'},
];

async function renderPanel(leads: unknown[] = [leadFixture()], routes: Record<string, unknown> = {}) {
  const api = mockApi({[QUEUE]: leadQueueBody('inv-1', leads), ...routes});
  wrap(<LeadsPanel investigationId="inv-1"/>);
  await screen.findByText('Who approved this contract?');
  // The status columns (the panel opens on Now / Next / Later; test-leads-horizons.test.tsx covers that view).
  await userEvent.setup().click(screen.getByRole('button', {name: 'By status'}));
  return api;
}

describe('LeadsPanel', () => {
  it('shows the queue with every lead, resolved ones included, and its triage state', async () => {
    const api = await renderPanel();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'reporter lead · ⚠ evidence conflict score 2')).toBeInTheDocument();
    expect(screen.getByText('Needs evidence review:')).toBeInTheDocument();
    expect(screen.getByText('unresolved contradiction', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('Owner: A. Reporter')).toBeInTheDocument();
    expect(screen.getByRole('combobox', {name: 'Move "Who approved this contract?"'})).toBeInTheDocument();
    expect(api.lastUrl(QUEUE).searchParams.get('unresolved_only')).toBe('false');
    expect(api.unmatched()).toEqual([]);
  });

  it('creates a lead (POST, then PATCH its priority and owner) and reloads the queue', async () => {
    const api = await renderPanel();
    const second = leadFixture({id: 'lead-2', title: 'Second question', priority: 'urgent', owner: 'B. Reporter'});
    api.add({
      'POST /api/leads': leadFixture({id: 'lead-2', title: 'Second question', priority: 'normal', owner: null}),
      'PATCH /api/leads/lead-2': second,
      [QUEUE]: leadQueueBody('inv-1', [leadFixture(), second]),
    });
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Who approved this contract?'), 'Second question');
    await user.type(screen.getByPlaceholderText('What is known, what is missing, and why it matters?'), 'The signature is unclear.');
    await user.type(screen.getByPlaceholderText('Owner'), 'B. Reporter');
    await user.click(screen.getAllByRole('combobox').find(el => el.textContent === 'normal')!);
    await user.click(await screen.findByRole('option', {name: 'urgent'}));
    await user.click(screen.getByRole('button', {name: 'Add lead'}));

    await screen.findByText('Second question');
    expect(api.lastBody('POST /api/leads')).toEqual({investigation_id: 'inv-1', title: 'Second question', detail: 'The signature is unclear.', status: 'unreviewed'});
    expect(api.lastBody('PATCH /api/leads/lead-2')).toEqual({priority: 'urgent', owner: 'B. Reporter'});
    expect(api.calls(QUEUE)).toHaveLength(2);
    expect(screen.getByPlaceholderText('Who approved this contract?')).toHaveValue('');
    expect(screen.getByPlaceholderText('What is known, what is missing, and why it matters?')).toHaveValue('');
    expect(api.unmatched()).toEqual([]);
  });

  it('does not create a lead with a blank title', async () => {
    const api = await renderPanel();
    const before = api.fetch.mock.calls.length;
    await userEvent.setup().click(screen.getByRole('button', {name: 'Add lead'}));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.calls('POST /api/leads')).toHaveLength(0);
    expect(api.fetch.mock.calls.length).toBe(before);
  });

  it('moves a lead to another column and reloads the queue', async () => {
    const api = await renderPanel();
    api.add({'PATCH /api/leads/lead-1': leadFixture({status: 'active'}), [QUEUE]: leadQueueBody('inv-1', [leadFixture({status: 'active'})])});
    // Opened from the keyboard: a pointer click on a dnd-kit draggable's
    // select is unreliable under jsdom (see test-leads-kanban-board.test.tsx).
    const user = userEvent.setup();
    screen.getByRole('combobox', {name: 'Move "Who approved this contract?"'}).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', {name: 'Active'}));
    await waitFor(() => expect(api.calls(QUEUE)).toHaveLength(2));
    expect(api.lastBody('PATCH /api/leads/lead-1')).toEqual({status: 'active'});
    expect(api.unmatched()).toEqual([]);
  });

  it('converts a lead to a claim and marks both the queue and the claims stale', async () => {
    const api = mockApi({
      [QUEUE]: leadQueueBody('inv-1', [leadFixture()]),
      'GET /api/investigations/inv-1/claims': [],
      'GET /api/investigations/inv-1/evidence': [],
    });
    wrap(<><LeadsPanel investigationId="inv-1"/><ClaimsPanel investigationId="inv-1" relationships={[]} onInspectRelationship={vi.fn()}/></>);
    await screen.findByText('Who approved this contract?');
    await userEvent.setup().click(screen.getByRole('button', {name: 'By status'}));
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-1/claims')).toHaveLength(1));
    const converted = leadFixture({status: 'active'});
    api.add({
      'POST /api/leads/lead-1/convert': {kind: 'claim', lead: converted, record: {id: 'claim-1', investigation_id: 'inv-1', text: 'Who approved this contract?', status: 'lead', confidence: 0, created_at: '2026-10-02T00:00:00'}},
      [QUEUE]: leadQueueBody('inv-1', [converted]),
      'GET /api/investigations/inv-1/claims': [{id: 'claim-1', investigation_id: 'inv-1', text: 'Who approved this contract?', status: 'lead', confidence: 0, created_at: '2026-10-02T00:00:00'}],
    });
    await userEvent.setup().click(screen.getByRole('button', {name: 'Make claim'}));
    await waitFor(() => {
      expect(api.calls(QUEUE)).toHaveLength(2);
      expect(api.calls('GET /api/investigations/inv-1/claims')).toHaveLength(2);
    });
    expect(api.lastBody('POST /api/leads/lead-1/convert')).toEqual({kind: 'claim'});
    await screen.findByText('0% confidence');
    expect(screen.getByText('0% confidence').closest('button')).toHaveClass('cl-unshown');
    expect(api.unmatched()).toEqual([]);
  });

  it('converts a lead to a task and moves the task along, reloading the queue each time', async () => {
    const api = await renderPanel();
    const withTask = leadFixture({status: 'active', tasks: [task]});
    api.add({
      'POST /api/leads/lead-1/convert': {kind: 'task', lead: withTask, record: task},
      [QUEUE]: leadQueueBody('inv-1', [withTask]),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Make task'}));
    await screen.findByText('Call the clerk · todo · 1 event(s)');
    expect(api.lastBody('POST /api/leads/lead-1/convert')).toEqual({kind: 'task'});

    const done = {...task, status: 'done', history: [{id: 'tw-2', from_status: 'todo', to_status: 'done', note: 'Task marked done in Next.js workbench', created_at: '2026-10-02T00:00:00', lead_provenance: null}, ...task.history]};
    api.add({'PATCH /api/reporting-tasks/task-1': done, [QUEUE]: leadQueueBody('inv-1', [leadFixture({status: 'active', tasks: [done]})])});
    await user.click(screen.getByRole('button', {name: 'Done'}));
    await screen.findByText('Call the clerk · done · 2 event(s)');
    expect(api.lastBody('PATCH /api/reporting-tasks/task-1')).toEqual({status: 'done'});
    expect(screen.queryByRole('button', {name: 'In progress'})).not.toBeInTheDocument();
    expect(api.calls(QUEUE)).toHaveLength(3);
    expect(api.unmatched()).toEqual([]);
  });

  it('asks for a trace of a linked record or a task through the shared store', async () => {
    await renderPanel([leadFixture({links, tasks: [task]})]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Trace claim: The contract was approved'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({
      title: 'The contract was approved', kind: 'lead claim link', detail: 'Claim context: supports', acceptedRecordType: 'claim', acceptedRecordId: 'claim-1',
    });
    await user.click(screen.getByRole('button', {name: 'Trace relationship: Jane Doe — Directorship → Kestrelwood'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({
      title: 'Jane Doe — Directorship → Kestrelwood', kind: 'lead relationship link', detail: undefined, traceRecordType: 'relationship', acceptedRecordId: 'rel-1',
    });
    // A link with nothing to point at cannot be traced.
    expect(screen.getByRole('button', {name: 'Trace linked record'})).toBeDisabled();

    await user.click(screen.getByRole('button', {name: 'Trace'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({title: 'Call the clerk', kind: 'reporting task', traceRecordType: 'task', acceptedRecordId: 'task-1'});
  });

  it('shows the server\'s reason when a change is refused', async () => {
    const api = await renderPanel();
    api.add({'POST /api/leads/lead-1/convert': {status: 400, body: {detail: 'Invalid task priority'}}});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Make task'}));
    await screen.findByText(/Invalid task priority/);
    expect(api.calls(QUEUE)).toHaveLength(1);
  });
});
