// @vitest-environment jsdom
// The demo's pre-made decisions on screen (features/demo/pre-decided.tsx, DECISIONS_LOG 53): on a demo case Decide
// and Case home's Next up carry one quiet line, "n decided ahead by the demo", its counts by kind on hover, and "Undo
// them" behind a confirmation that says what comes back; after an undo the queue is asked again. A decision the demo
// made carries its mark where it is shown alone (To check), with its own Undo. Nothing shows on a case that is not a demo.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DecideScreen} from '../features/case-home/decide-screen';
import {decidedCounts, isDemoDecided} from '../features/demo/pre-decided';
import {ToCheckPanel} from '../features/to-check/to-check-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const COUNTS = {proposal: {accepted: 20, rejected: 267}, check: {not_needed: 160, unclear: 7}, watchlist: {dismissed: 2}};
const NONE = {proposal: {}, check: {}, watchlist: {}};
const counts = (c: Record<string, Record<string, number>>, undone?: number) =>
  ({investigation_id: 'inv-1', decided_by: 'Demo (pre-decided)', counts: c, ...(undone === undefined ? {} : {undone})});
const decisions = {investigation_id: 'inv-1', counts: {}, total: 0, offset: 0, items: []};

function demoRoutes() {
  let now: Record<string, Record<string, number>> = COUNTS;
  const api = mockApi({
    'GET /api/investigations/inv-1/decisions': decisions,
    'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', flags: [], gone: [], rules: [], cannot_run: [], type: null},
    'GET /api/demo/pre-decided/inv-1': () => counts(now),
    'POST /api/demo/pre-decided/inv-1/undo': ({body}: {body: unknown}) => {
      const kind = (body as {kind?: keyof typeof COUNTS}).kind;
      const before = decidedCounts(counts(now)).total;
      now = kind ? {...now, [kind]: {}} : NONE;
      return counts(now, before - decidedCounts(counts(now)).total);
    },
  });
  return api;
}

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', pointedParty: null, asOf: null, flag: null, check: null});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('the demo’s decisions in Decide', () => {
  it('shows one quiet line with the total; the counts by kind are on hover', async () => {
    demoRoutes();
    wrap(<DecideScreen investigationId="inv-1" investigationName="1MDB" isDemo/>);
    const line = await screen.findByLabelText('Decided ahead by the demo', {selector: 'p'});
    expect(within(line).getByText('456')).toBeInTheDocument();
    expect(within(line).getByRole('button', {name: 'Undo them'})).toBeInTheDocument();
    // By kind only on reveal.
    expect(screen.queryByText('287 proposals')).toBeNull();
    fireEvent.focus(within(line).getByRole('img', {name: '456 decided ahead by the demo'}));
    const card = await screen.findByRole('tooltip');
    expect(within(card).getByText('287 proposals')).toBeInTheDocument();
    expect(within(card).getByText('20 accepted · 267 rejected')).toBeInTheDocument();
    expect(within(card).getByText('167 checks and missing values')).toBeInTheDocument();
    expect(within(card).getByText('2 watchlist hits')).toBeInTheDocument();
  });

  it('Undo them asks first, says what comes back, then undoes all and asks for the queue again', async () => {
    const api = demoRoutes();
    const user = userEvent.setup();
    wrap(<DecideScreen investigationId="inv-1" investigationName="1MDB" isDemo/>);
    await user.click(await screen.findByRole('button', {name: 'Undo them'}));
    const ask = screen.getByRole('group', {name: 'Undo the demo’s decisions'});
    expect(within(ask).getByText('287 proposals')).toBeInTheDocument();
    expect(within(ask).getByText('167 checks and missing values')).toBeInTheDocument();
    expect(within(ask).getByText('2 watchlist hits')).toBeInTheDocument();
    expect(api.calls('POST /api/demo/pre-decided/inv-1/undo')).toHaveLength(0);
    const asked = api.calls('GET /api/investigations/inv-1/decisions').length;
    await user.click(within(ask).getByRole('button', {name: 'Undo 456'}));
    await waitFor(() => expect(api.calls('POST /api/demo/pre-decided/inv-1/undo')).toHaveLength(1));
    expect(api.lastBody('POST /api/demo/pre-decided/inv-1/undo')).toEqual({});
    expect(await screen.findByText('456 back in the queue to decide.')).toBeInTheDocument();
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-1/decisions').length).toBeGreaterThan(asked));
    expect(screen.queryByRole('button', {name: 'Undo them'})).toBeNull();
  });

  it('Cancel leaves them; one kind is undone from the hover card', async () => {
    const api = demoRoutes();
    const user = userEvent.setup();
    wrap(<DecideScreen investigationId="inv-1" investigationName="1MDB" isDemo/>);
    await user.click(await screen.findByRole('button', {name: 'Undo them'}));
    await user.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(api.calls('POST /api/demo/pre-decided/inv-1/undo')).toHaveLength(0);
    fireEvent.focus(screen.getByRole('img', {name: '456 decided ahead by the demo'}));
    fireEvent.click(within(await screen.findByRole('tooltip')).getByRole('button', {name: 'Undo the proposals'}));
    const ask = screen.getByRole('group', {name: 'Undo the demo’s decisions'});
    expect(within(ask).getByText('287 proposals')).toBeInTheDocument();
    expect(within(ask).queryByText('2 watchlist hits')).toBeNull();
    await user.click(within(ask).getByRole('button', {name: 'Undo 287'}));
    await waitFor(() => expect(api.lastBody('POST /api/demo/pre-decided/inv-1/undo')).toEqual({kind: 'proposal'}));
    // The line comes back with what is left.
    expect(await screen.findByRole('img', {name: '169 decided ahead by the demo'})).toBeInTheDocument();
  });

  it('shows nothing on a case that is not a demo', async () => {
    let api = demoRoutes();
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel" isDemo={false}/>);
    expect(await screen.findByText(/Nothing waits for you/)).toBeInTheDocument();
    expect(api.calls('GET /api/demo/pre-decided/inv-1')).toHaveLength(0);
    expect(screen.queryByText(/decided ahead by the demo/)).toBeNull();
    cleanup();
    // When the frame does not know, the counts endpoint says: 404 on a case that is not a demo.
    api = mockApi({'GET /api/investigations/inv-1/decisions': decisions,
      'GET /api/demo/pre-decided/inv-1': {status: 404, body: {detail: 'No demo case with this id'}}});
    wrap(<DecideScreen investigationId="inv-1" investigationName="Kestrel"/>);
    await waitFor(() => expect(api.calls('GET /api/demo/pre-decided/inv-1')).toHaveLength(1));
    expect(await screen.findByText(/Nothing waits for you/)).toBeInTheDocument();
    expect(screen.queryByText(/decided ahead by the demo/)).toBeNull();
    expect(screen.queryByRole('button', {name: 'Undo them'})).toBeNull();
  });
});

describe('one decision the demo made', () => {
  const item = {
    id: 'c-1', indicator_id: 'BO-002', indicator_name: 'Layered ownership', kind: 'checklist', question: 'whether there is a business reason for the layers',
    status: 'unclear', note: 'Demo (pre-decided): set aside as the finished case left it; not answered by a person. Open it again to answer.', decided_at: '2026-10-30T00:00:00',
    decided_by_id: 'demo-pre-decided', decided_by_name: 'Demo (pre-decided)',
    parties: [], flag_id: null, related_flags: [], document: null, locator: null, excerpt: null, terms: [], first_seen_at: '2026-10-10T00:00:00', gone_at: null,
  };

  it('carries the demo’s mark in To check, its rule on hover, and Undo sends just that item', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/checks': {investigation_id: 'inv-1', items: [item], gone: []},
      'POST /api/demo/pre-decided/inv-1/undo': counts(NONE, 1),
    });
    wrap(<ToCheckPanel investigationId="inv-1"/>);
    const mark = await screen.findByRole('img', {name: 'Decided ahead by the demo'});
    // The demo's note is not written on the card; its rule is on hover.
    expect(screen.getByText(/set aside as the finished case left it/).closest('[hidden]')).not.toBeNull();
    fireEvent.focus(mark);
    expect(within(await screen.findByRole('tooltip')).getByText(/set aside as the finished case left it/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Undo'}));
    await waitFor(() => expect(api.lastBody('POST /api/demo/pre-decided/inv-1/undo')).toEqual({kind: 'check', id: 'c-1'}));
    expect(api.calls('POST /api/checks/c-1/decide')).toHaveLength(0);
  });

  it('tells the demo’s decisions from a person’s', () => {
    expect(isDemoDecided({decided_by_id: 'demo-pre-decided'})).toBe(true);
    expect(isDemoDecided({who: 'Demo (pre-decided)'})).toBe(true);
    expect(isDemoDecided({reviewer_note: 'Demo (pre-decided): the case already holds this payment.'})).toBe(true);
    expect(isDemoDecided({decided_by_id: 'local-owner', decided_by_name: 'Ony', note: 'not public'})).toBe(false);
    // What waits again after an undo is not counted as decided.
    expect(decidedCounts(counts({proposal: {accepted: 2, proposed: 5}, check: {open: 3}, watchlist: {}})).total).toBe(2);
  });
});
