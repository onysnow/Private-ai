// @vitest-environment jsdom
// Leads as Now / Next / Later (features/leads/leads-horizons.tsx, research Act §6): the panel opens on the horizons,
// with the inbox lane for leads not yet placed, Now's cap, status as a mark on the card, the "…" menu, M then 1 / 2 / 3
// from the keyboard, the server's refusal when Now is full, and the Done view.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {LeadsPanel} from '../features/leads/leads-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {leadQueueBody} from '../test-support/page-routes';

const QUEUE = 'GET /api/investigations/inv-1/leads/queue';

function lead(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id, investigation_id: 'inv-1', title, status: 'active', priority: 'normal', owner: null, detail: null, provider: null, provider_record_id: null,
    kind: 'question', next_action: null, horizon: null, created_at: '2026-10-01T00:00:00', links: [], tasks: [], history: [],
    triage: {needs_attention: false, attention_score: 0, stance_counts: {supports: 0, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0,
      relationship_evidence_review_counts: {supports: 0, contradicts: 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0}, reasons: []},
    ...overrides,
  };
}
const task = (id: string, status: string) => ({id, investigation_id: 'inv-1', lead_id: 'l1', title: `Task ${id}`, detail: null, status, priority: 'normal', owner: null,
  due_date: null, created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00', task_context: null, history: []});

const LEADS = [
  lead('l1', 'Were the four payments cash?', {horizon: 'now', priority: 'urgent', owner: 'A. Reporter', status: 'blocked',
    tasks: [task('t1', 'todo'), task('t2', 'in_progress'), task('t3', 'done')],
    links: [{id: 'k1', lead_id: 'l1', type: 'claim', target_id: 'c1', label: 'Harbour Nominees paid Fernhill Ltd four times', note: null, created_at: '2026-10-01T00:00:00'}],
    triage: {...lead('x', '').triage, stance_counts: {supports: 2, contradicts: 1, context: 0}}}),
  lead('l2', 'Who owns Harbour Nominees?', {horizon: 'next'}),
  lead('l3', 'Watchlist hit: Kestrel SA', {status: 'unreviewed', provider: 'watchlist'}),
  lead('l4', 'Ask the registry for the 2018 filing', {status: 'resolved', horizon: 'later',
    history: [{id: 'h1', lead_id: 'l4', from_status: 'active', to_status: 'resolved', note: 'The registry sent it on 3 Oct', created_at: '2026-10-03T00:00:00'}]}),
];

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null, claim: null});
});
afterEach(() => cleanup());

async function renderPanel(routes: Record<string, unknown> = {}) {
  const api = mockApi({[QUEUE]: leadQueueBody('inv-1', LEADS), ...routes});
  render(<QueryProvider><LeadsPanel investigationId="inv-1"/></QueryProvider>);
  await screen.findByText('Were the four payments cash?');
  return api;
}

describe('Leads as Now / Next / Later', () => {
  it('places open leads by horizon, with the inbox above, Now’s cap, and status as a mark on the card', async () => {
    await renderPanel();
    expect(screen.getByRole('button', {name: 'Now / Next / Later'})).toHaveAttribute('aria-pressed', 'true');
    const now = screen.getByRole('region', {name: 'Now, 1 of 5'});
    expect(within(now).getByText('1 / 5')).toBeInTheDocument();
    const card = within(now).getByRole('button', {name: /^Were the four payments cash\?, blocked, urgent priority/});
    expect(within(card).getByLabelText('Status: blocked')).toHaveTextContent('✕ blocked');
    expect(within(card).getByLabelText('Owner: A. Reporter')).toHaveTextContent('AR');
    expect(within(card).getByText('Harbour Nominees paid Fernhill Ltd four times')).toBeInTheDocument();
    expect(within(card).getByLabelText('Tasks: Task t1 todo, Task t2 in progress, Task t3 done')).toHaveTextContent('○◐✓');
    expect(within(card).getByLabelText('2 supporting, 1 contradicting')).toHaveTextContent('✓ 2 · ✕ 1');
    expect(within(screen.getByRole('region', {name: 'Next, 1'})).getByText('Who owns Harbour Nominees?')).toBeInTheDocument();
    const inbox = screen.getByRole('region', {name: 'Inbox · not yet placed, 1'});
    expect(within(inbox).getByText('Watchlist hit: Kestrel SA')).toBeInTheDocument();
    expect(within(inbox).getByText('from watchlist')).toBeInTheDocument();
    // A finished lead is not on the board.
    expect(screen.queryByText('Ask the registry for the 2018 filing')).not.toBeInTheDocument();
  });

  it('moves a lead from its menu and from the keyboard, and reloads the queue', async () => {
    const api = await renderPanel({'PATCH /api/leads/l3': lead('l3', 'Watchlist hit: Kestrel SA', {horizon: 'next'}),
      'PATCH /api/leads/l2': lead('l2', 'Who owns Harbour Nominees?', {horizon: 'later'})});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Actions for “Watchlist hit: Kestrel SA”'}));
    await user.click(screen.getByRole('menuitem', {name: 'Move to Next'}));
    await waitFor(() => expect(api.lastBody('PATCH /api/leads/l3')).toEqual({horizon: 'next'}));
    await waitFor(() => expect(api.calls(QUEUE)).toHaveLength(2));
    expect(screen.getByText('Moved “Watchlist hit: Kestrel SA” to Next')).toBeInTheDocument();

    screen.getByRole('button', {name: /^Who owns Harbour Nominees\?/}).focus();
    await user.keyboard('m3');
    await waitFor(() => expect(api.lastBody('PATCH /api/leads/l2')).toEqual({horizon: 'later'}));
    await user.keyboard('m0');
    await waitFor(() => expect(api.lastBody('PATCH /api/leads/l2')).toEqual({horizon: null}));
  });

  it('shows the server’s reason when Now is full', async () => {
    await renderPanel({'PATCH /api/leads/l2': {status: 400, body: {detail: 'Now already holds 5 leads: move one to Next or finish it first'}}});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Actions for “Who owns Harbour Nominees?”'}));
    await user.click(screen.getByRole('menuitem', {name: 'Move to Now'}));
    expect(await screen.findByText(/Now already holds 5 leads/)).toBeInTheDocument();
  });

  it('lists finished leads with their outcome and reason in the Done view, and reopens one', async () => {
    const api = await renderPanel({'PATCH /api/leads/l4': lead('l4', 'Ask the registry for the 2018 filing')});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Done (1)'}));
    const done = screen.getByRole('list', {name: 'Done leads'});
    const row = within(done).getByText('Ask the registry for the 2018 filing').closest('li')!;
    expect(row).toHaveTextContent('✓ resolved');
    expect(row).toHaveTextContent('The registry sent it on 3 Oct');
    await user.click(within(row).getByRole('button', {name: 'Reopen'}));
    await waitFor(() => expect((api.lastBody('PATCH /api/leads/l4') as {status: string}).status).toBe('active'));
  });
});
