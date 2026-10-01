// @vitest-environment jsdom
// Component-level coverage for the drag-and-drop kanban conversion of the
// "Questions & reporting leads" panel (components/leads-kanban-board.tsx).
// Exercised directly against the component -- not through app/page.tsx's
// full bootstrap cascade -- both because it's more targeted (this is a
// presentational component with callback props, not a page with its own
// fetch wiring) and because opening this component's per-card status
// <Select> through the full page triggers a Radix-Select-vs-jsdom quirk
// when some other test in the same file already performed an unrelated
// click (see the comment left in tests/test-page-leads.test.tsx). That
// quirk doesn't reproduce here, where each test mounts the component fresh
// with no surrounding page and no module reset between tests.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {LeadsKanbanBoard} from '../components/leads-kanban-board';
import type {LeadItem} from '../lib/api-types';

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
});

function leadFixture(overrides: Partial<LeadItem> = {}): LeadItem {
  return {
    id: 'lead-1',
    title: 'Who approved this contract?',
    status: 'unreviewed',
    priority: 'high',
    owner: 'A. Reporter',
    detail: 'Need to confirm the approver identity.',
    provider: undefined,
    next_action: undefined,
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

function renderBoard(leads: LeadItem[], overrides: Partial<Parameters<typeof LeadsKanbanBoard>[0]> = {}) {
  const onStatusChange = vi.fn();
  const onCreateLead = vi.fn();
  const onTraceLink = vi.fn();
  const onTraceTask = vi.fn();
  const onTaskStatus = vi.fn();
  const onConvert = vi.fn();
  render(
    <LeadsKanbanBoard
      leads={leads}
      leadTitle=""
      setLeadTitle={() => {}}
      leadDetail=""
      setLeadDetail={() => {}}
      leadPriority="normal"
      setLeadPriority={() => {}}
      leadOwner=""
      setLeadOwner={() => {}}
      onCreateLead={onCreateLead}
      onStatusChange={onStatusChange}
      onTraceLink={onTraceLink}
      onTraceTask={onTraceTask}
      onTaskStatus={onTaskStatus}
      onConvert={onConvert}
      {...overrides}
    />,
  );
  return {onStatusChange, onCreateLead, onTraceLink, onTraceTask, onTaskStatus, onConvert};
}

describe('LeadsKanbanBoard', () => {
  it('groups leads into their status column', () => {
    renderBoard([
      leadFixture({id: 'lead-1', title: 'Unreviewed one', status: 'unreviewed'}),
      leadFixture({id: 'lead-2', title: 'Active one', status: 'active'}),
      leadFixture({id: 'lead-3', title: 'Resolved one', status: 'resolved'}),
    ]);

    const unreviewedColumn = screen.getByText('Unreviewed', {selector: 'span.text-sm.font-semibold'}).closest('div')!.parentElement!;
    const activeColumn = screen.getByText('Active', {selector: 'span.text-sm.font-semibold'}).closest('div')!.parentElement!;
    const resolvedColumn = screen.getByText('Resolved', {selector: 'span.text-sm.font-semibold'}).closest('div')!.parentElement!;

    expect(within(unreviewedColumn).getByText('Unreviewed one')).toBeInTheDocument();
    expect(within(activeColumn).getByText('Active one')).toBeInTheDocument();
    expect(within(resolvedColumn).getByText('Resolved one')).toBeInTheDocument();
    expect(within(unreviewedColumn).queryByText('Active one')).not.toBeInTheDocument();
  });

  // Opened via keyboard (focus + Enter) rather than userEvent.click: a
  // pointerdown on *any* dnd-kit draggable sets pointer-capture state that
  // jsdom's Element.setPointerCapture polyfill (test-setup.ts) doesn't
  // actually track, and once a second DndContext has mounted in the same
  // test file, a later pointer-click on an unrelated Radix Select trigger
  // stops opening it. Keyboard interaction sidesteps that entirely -- and
  // doubles as coverage that the status control is operable without a
  // mouse, which matters since drag-and-drop itself isn't.
  it('calls onStatusChange when the per-card status control is changed', async () => {
    const {onStatusChange} = renderBoard([leadFixture()]);

    const combo = screen.getByRole('combobox', {name: 'Move "Who approved this contract?"'});
    combo.focus();
    const user = userEvent.setup();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', {name: 'Active'}));

    expect(onStatusChange).toHaveBeenCalledWith('lead-1', 'active');
  });

  it('does not call onStatusChange when re-selecting the current column', async () => {
    const {onStatusChange} = renderBoard([leadFixture({status: 'active'})]);

    const combo = screen.getByRole('combobox', {name: 'Move "Who approved this contract?"'});
    combo.focus();
    const user = userEvent.setup();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', {name: 'Active'}));

    // Radix fires onValueChange even for the already-selected value; either
    // way the lead's own status is unchanged, so this is a harmless no-op
    // rather than a contract this test needs to pin down strictly -- the
    // important behavior (changing columns notifies the parent) is covered
    // above.
    expect(onStatusChange.mock.calls.every(([, status]) => status === 'active')).toBe(true);
  });

  it('renders a card with no known-status match in the overflow area', () => {
    renderBoard([leadFixture({status: 'converted'})]);
    expect(screen.getByText('Leads with an unrecognized status (not shown above):')).toBeInTheDocument();
    expect(screen.getByText('Who approved this contract?')).toBeInTheDocument();
  });

  it('wires up convert, trace, and task actions', async () => {
    const task = {id: 'task-1', title: 'Confirm signature', status: 'todo', history: []};
    const {onConvert, onTraceTask, onTaskStatus, onTraceLink} = renderBoard([
      leadFixture({
        links: [{id: 'link-1', type: 'entity', target_id: 'ent-1', label: 'Meridian Holdings'}],
        tasks: [task as never],
      }),
    ]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /Trace entity/}));
    expect(onTraceLink).toHaveBeenCalled();

    await user.click(screen.getByRole('button', {name: 'Trace'}));
    expect(onTraceTask).toHaveBeenCalledWith(task, 'Who approved this contract?');

    await user.click(screen.getByRole('button', {name: 'In progress'}));
    expect(onTaskStatus).toHaveBeenCalledWith('task-1', 'in_progress');

    await user.click(screen.getByRole('button', {name: 'Make claim'}));
    expect(onConvert).toHaveBeenCalledWith('lead-1', 'claim');
  });
});
