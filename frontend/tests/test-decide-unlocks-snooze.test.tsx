// @vitest-environment jsdom
// Decide: "by what it unlocks" (each card says what answering Yes would change, dry-run on the server) and H,
// putting a decision off until it changes, with the "n snoozed" list, Restore, and Z taking it back.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DecideScreen} from '../features/case-home/decide-screen';
import {wakesWhen} from '../features/case-home/use-decisions';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
type Unlocks = {score: number; claims: number; flags: number; chains: number; counted: boolean; words: string; lines: string[];
  flag_changes: {indicator_id: string; name: string; from_level: string | null; to_level: string; text: string}[]};
const none: Unlocks = {score: 0, claims: 0, flags: 0, chains: 0, counted: true, words: '', lines: [], flag_changes: []};

function proposal(id: string, question: string, unlocks: Unlocks, extra: Record<string, unknown> = {}) {
  const path = `/api/extraction-candidates/${id}/review`;
  return {
    kind: 'proposal', id, question, proposal: 'Relationship: Kestrel SA → Harbour Nominees Ltd', actor: 'Document reader', actor_kind: 'app',
    created_at: '2026-10-09T10:00:00', rank: 55, reason: 'Proposed from filing.pdf · confidence medium', level: null, confidence_band: 'medium',
    group: {key: 'doc:d2', label: 'filing.pdf', pages: null, pages_read: null},
    evidence: {document_id: 'd2', filename: 'filing.pdf', locator: 'p. 2', excerpt: 'Kestrel SA holds Harbour Nominees Ltd.', terms: [], rows: []},
    parties: [], consequences: [], known: [],
    choices: [
      {key: 'yes', label: 'Link them', method: 'POST', path, body: {decision: 'accept'}, happens: 'Adds the link between the two records with this passage as evidence.'},
      {key: 'no', label: 'No', method: 'POST', path, body: {decision: 'reject'}, happens: 'Marked rejected, with your reason; no link is added.'},
    ],
    open: {href: '/review?document=d2', label: 'Open in Review'}, unlocks, snooze: null, ...extra,
  };
}

const link = proposal('p1', 'Does this passage show the ownership Kestrel SA → Harbour Nominees Ltd?', {
  score: 2, claims: 0, flags: 1, chains: 1, counted: true, words: 'unlocks: 1 Red Flag rises, 1 chain completed',
  lines: ['▯▯▯ → ▮▯▯ Layered ownership (Kestrel SA, Harbour Nominees Ltd)', "Joins Kestrel SA's group (3 parties) to Harbour Nominees Ltd's (2), which no chain of links joins yet"],
  flag_changes: [{indicator_id: 'BO-002', name: 'Layered ownership', from_level: null, to_level: 'faint', text: '▯▯▯ → ▮▯▯ Layered ownership (Kestrel SA, Harbour Nominees Ltd)'}],
});
const plain = proposal('p2', 'Does this passage show the directorship A. Voss → Fernhill Ltd?', none);

/** The server's side: what is put off leaves the list until it is woken. */
function routes(items: ({id: string} & Record<string, unknown>)[], {snoozed = 0, asleep = [] as unknown[]} = {}) {
  const off = new Set<string>();
  return mockApi({
    'GET /api/investigations/inv-1/decisions': ({url}: RouteCall) => {
      if (url.searchParams.get('snoozed') === 'true') return {investigation_id: 'inv-1', counts: {}, total: asleep.length, offset: 0, items: asleep, snoozed: asleep.length};
      const shown = items.filter(i => !off.has(i.id));
      return {investigation_id: 'inv-1', counts: {proposal: shown.length}, total: shown.length, offset: 0, items: shown, snoozed: snoozed + off.size};
    },
    'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', flags: [], gone: [], rules: [], cannot_run: [], type: null},
    'POST /api/investigations/inv-1/decision-snoozes': ({body}: RouteCall) => {
      const b = body as {kind: string; item_id: string; until?: string | null; wake_on_activity: boolean};
      off.add(b.item_id);
      return {investigation_id: 'inv-1', ...b, snoozed_at: '2026-10-19T10:00:00', question: 'q', until: b.until ?? null};
    },
    'POST /api/investigations/inv-1/decision-snoozes/wake': ({body}: RouteCall) => {
      const b = body as {kind: string; item_id: string};
      const woke = off.delete(b.item_id);
      return {investigation_id: 'inv-1', ...b, woke};
    },
  });
}

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', pointedParty: null, asOf: null});
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Decide: by what it unlocks', () => {
  it('says on the card and the row what Yes would unlock, with the flag meter moving, and sorts by it', async () => {
    const api = routes([link, plain]);
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const card = await screen.findByRole('region', {name: 'Your decision'});
    const note = await within(card).findByRole('note', {name: 'unlocks: 1 Red Flag rises, 1 chain completed'});
    expect(within(note).getByText('▯▯▯ → ▮▯▯ Layered ownership (Kestrel SA, Harbour Nominees Ltd)')).toBeInTheDocument();
    expect(within(note).getByText(/Joins Kestrel SA's group/)).toBeInTheDocument();
    const queue = screen.getByRole('complementary', {name: 'To decide'});
    expect(within(queue).getAllByText(/unlocks: 1 Red Flag rises, 1 chain completed/)).toHaveLength(1);
    // The order "by what it unlocks" asks the server for the consequence order.
    fireEvent.change(within(queue).getByRole('combobox'), {target: {value: 'consequence'}});
    expect(within(queue).getByRole('option', {name: 'by what it unlocks (most first)'})).toBeInTheDocument();
    await waitFor(() => expect(api.lastUrl('GET /api/investigations/inv-1/decisions').searchParams.get('order')).toBe('consequence'));
  });

  it('shows nothing for an answer that unlocks nothing, and says when it was not worked out', async () => {
    routes([proposal('p3', 'Is this a link?', {...none, counted: false}), plain]);
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const card = await screen.findByRole('region', {name: 'Your decision'});
    expect(await within(card).findByText(/unlocks: not worked out here/)).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'j'});
    await within(card).findByRole('heading', {name: plain.question});
    expect(within(card).queryByText(/unlocks/)).toBeNull();
  });
});

describe('Decide: H later', () => {
  it('puts the card off until it changes, says so, and Z brings it back', async () => {
    const api = routes([link, plain]);
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const queue = await screen.findByRole('complementary', {name: 'To decide'});
    await screen.findByRole('heading', {name: link.question});
    fireEvent.keyDown(window, {key: 'h'});
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/decision-snoozes')).toEqual({kind: 'proposal', item_id: 'p1', until: null, wake_on_activity: true}));
    expect(await screen.findByRole('heading', {name: plain.question})).toBeInTheDocument();
    expect(within(queue).queryByText(link.question)).toBeNull();
    expect(await screen.findByText(/Put off/)).toBeInTheDocument();
    expect(screen.getByText(/comes back when it changes/)).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'z'});
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/decision-snoozes/wake')).toEqual({kind: 'proposal', item_id: 'p1'}));
    expect(await within(queue).findByText(link.question)).toBeInTheDocument();
  });

  it('puts it off until tomorrow from the card, and G then H puts nothing off', async () => {
    const api = routes([link, plain]);
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    await screen.findByRole('heading', {name: link.question});
    fireEvent.keyDown(window, {key: 'g'});
    fireEvent.keyDown(window, {key: 'h'});
    expect(api.calls('POST /api/investigations/inv-1/decision-snoozes')).toHaveLength(0);
    fireEvent.click(within(screen.getByRole('group', {name: 'Later'})).getByRole('button', {name: 'until tomorrow'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/decision-snoozes')).toHaveLength(1));
    const body = api.lastBody('POST /api/investigations/inv-1/decision-snoozes') as {until: string; wake_on_activity: boolean};
    expect(new Date(body.until).getTime()).toBeGreaterThan(Date.now());
    expect(body.wake_on_activity).toBe(true);
  });

  it('counts what is put off, lists it with when it comes back, and restores one', async () => {
    const asleep = [{...plain, snooze: {state: 'asleep', until: null, wake_on_activity: true, snoozed_at: '2026-10-19T09:00:00', why: null}}];
    const api = routes([link], {snoozed: 1, asleep});
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const queue = await screen.findByRole('complementary', {name: 'To decide'});
    const toggle = await within(queue).findByRole('button', {name: /1 snoozed/});
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = await within(queue).findByRole('group', {name: 'Put off'});
    expect(await within(list).findByText(plain.question)).toBeInTheDocument();
    expect(within(list).getByText(/Proposals · comes back when it changes/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(list).getByRole('button', {name: 'Restore'})); });
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/decision-snoozes/wake')).toEqual({kind: 'proposal', item_id: 'p2'}));
  });

  it('marks a decision that came back because it changed', async () => {
    routes([{...link, snooze: {state: 'woke', until: null, wake_on_activity: true, snoozed_at: '2026-10-19T09:00:00', why: 'It changed since you put it off.'}}]);
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel SA"/>);
    const queue = await screen.findByRole('complementary', {name: 'To decide'});
    expect(await within(queue).findByText(/back: it changed since you put it off/)).toBeInTheDocument();
  });
});

describe('wakesWhen', () => {
  it('says when a decision put off comes back', () => {
    expect(wakesWhen(null)).toBe('comes back when it changes');
    expect(wakesWhen('2026-10-20T08:00:00')).toMatch(/^comes back .+, or sooner if it changes$/);
    expect(wakesWhen('2026-10-20T08:00:00', false)).not.toMatch(/sooner/);
  });
});
