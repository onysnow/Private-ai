// @vitest-environment jsdom
// To check (features/to-check/to-check-panel.tsx): a slim card per item with
// the question, who it is about, and for a passage the indicator's words in
// place; a person decides each one, with a note; an item links to its Red
// Flag, and a flag's "records can't show" part links back to its item.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RedFlagsPanel} from '../features/red-flags/red-flags-panel';
import {marked, ToCheckPanel} from '../features/to-check/to-check-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', pointedParty: null, flag: null, check: null});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const checklist = {
  id: 'c-1', indicator_id: 'BO-002', indicator_name: 'Layered ownership', kind: 'checklist', question: 'whether there is a business reason for the layers',
  status: 'open', note: null, decided_at: null, parties: [{id: 'a', name: 'Layer 0', schema: 'Company'}], flag_id: 'f-1', related_flags: [],
  document: null, locator: null, excerpt: null, terms: [], first_seen_at: '2026-10-10T00:00:00', gone_at: null,
};
const passage = {
  ...checklist, id: 'c-2', kind: 'passage', question: 'Does the passage describe layers hiding the owner?', flag_id: null, related_flags: ['f-1', 'f-9'],
  parties: [{id: 'h', name: 'Harbour Nominees Ltd', schema: 'Company'}], document: {id: 'd-1', filename: 'filing.txt'}, locator: 'p1',
  excerpt: 'Harbour Nominees Ltd supplied a Nominee Director to every company.', terms: ['nominee director'],
};
const body = (items: unknown[], gone: unknown[] = []) => ({investigation_id: 'inv-1', items, gone});

describe('ToCheckPanel', () => {
  it('shows the question, the indicator, the parties and the passage with its words marked', async () => {
    mockApi({'GET /api/investigations/inv-1/checks': body([checklist, passage])});
    wrap(<ToCheckPanel investigationId="inv-1"/>);
    const first = await screen.findByRole('article', {name: 'To check: Whether there is a business reason for the layers'});
    expect(within(first).getByText('Checklist')).toBeInTheDocument();
    expect(within(first).getByText(/Layered ownership · BO-002/)).toBeInTheDocument();
    expect(screen.getByText('2 open · 0 decided')).toBeInTheDocument();
    const second = screen.getByRole('article', {name: 'To check: Does the passage describe layers hiding the owner?'});
    expect(within(second).getByText('Nominee Director').tagName).toBe('MARK');
    expect(within(second).getByText(/2 other flags on these parties/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(second).getByRole('button', {name: 'filing.txt'}));
    expect(useWorkbenchStore.getState().document?.documentId).toBe('d-1');
    await user.click(within(first).getByRole('button', {name: 'Its Red Flag'}));
    expect(useWorkbenchStore.getState().flag?.flagId).toBe('f-1');
  });

  it('keeps a decision with a note, and folds decided items away', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/checks': body([checklist]),
      'POST /api/checks/c-1/decide': body([{...checklist, status: 'shows', note: 'No reason in the annual report', decided_at: '2026-10-10T01:00:00'}]),
      'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', rules: [], cannot_run: [], flags: [], gone: [],
        investigation_type: {set_by: 'app', areas: [], suggested: []}},
    });
    wrap(<ToCheckPanel investigationId="inv-1"/>);
    const card = await screen.findByRole('article', {name: /business reason/});
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', {name: 'Add a note'}));
    await user.type(within(card).getByRole('textbox', {name: 'What you saw'}), 'No reason in the annual report');
    await user.click(within(card).getByRole('button', {name: 'Shows it'}));
    await waitFor(() => expect(api.lastBody('POST /api/checks/c-1/decide')).toEqual({status: 'shows', note: 'No reason in the annual report'}));
    expect(await screen.findByText('Decided (1)')).toBeInTheDocument();
    expect(screen.getByText('0 open · 1 decided')).toBeInTheDocument();
    expect(screen.getByText(/: No reason in the annual report/)).toBeInTheDocument();
  });

  it('says when there is nothing to check yet', async () => {
    mockApi({'GET /api/investigations/inv-1/checks': body([])});
    wrap(<ToCheckPanel investigationId="inv-1"/>);
    expect(await screen.findByText(/Nothing to check yet/)).toBeInTheDocument();
  });

  it('marks whole words only, ignoring case', () => {
    const parts = marked('A nominee  Director; a nominee directorship.', ['nominee director']);
    expect(parts.filter(p => typeof p !== 'string')).toHaveLength(1);
  });
});

describe('a Red Flag and its items in To check', () => {
  it('links each part the records cannot show to its item, with the decision once made', async () => {
    const flag = {
      id: 'f-1', indicator_id: 'BO-002', rule_version: 1, level: 'faint', status: 'open', dismissed_reason: null, lead_id: null,
      weight: 1, weight_parts: [{why: 'one flag', value: 1}], parties: [{id: 'a', name: 'Layer 0', schema: 'Company'}], links: [], facts: {},
      not_shown: ['whether there is a business reason for the layers'], checks: [{id: 'c-1', question: 'whether there is a business reason for the layers', status: 'unclear'}],
      summary: 'Six layers.', first_seen_at: '2026-10-10T00:00:00', last_seen_at: '2026-10-10T00:00:00', gone_at: null, indicator: null,
    };
    mockApi({'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', rules: [], cannot_run: [], flags: [flag], gone: [],
      investigation_type: {set_by: 'app', areas: [], suggested: []}}});
    wrap(<RedFlagsPanel investigationId="inv-1"/>);
    const card = await screen.findByRole('article', {name: 'Red Flag: BO-002'});
    expect(within(card).getByText('(Unclear)')).toBeInTheDocument();
    await userEvent.setup().click(within(card).getByRole('button', {name: 'whether there is a business reason for the layers'}));
    expect(useWorkbenchStore.getState().check?.checkId).toBe('c-1');
  });

  it('opens a flag when an item asks for it', async () => {
    const flag = {
      id: 'f-1', indicator_id: 'BO-002', rule_version: 1, level: 'faint', status: 'open', dismissed_reason: null, lead_id: null,
      weight: 1, weight_parts: [], parties: [], links: [], facts: {}, not_shown: [], checks: [], summary: 'Six layers.',
      first_seen_at: '2026-10-10T00:00:00', last_seen_at: '2026-10-10T00:00:00', gone_at: null, indicator: null,
    };
    mockApi({'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', rules: [], cannot_run: [], flags: [flag], gone: [],
      investigation_type: {set_by: 'app', areas: [], suggested: []}}});
    wrap(<RedFlagsPanel investigationId="inv-1"/>);
    await screen.findByRole('article', {name: 'Red Flag: BO-002'});
    useWorkbenchStore.getState().openFlag('f-1');
    expect(await screen.findByRole('complementary', {name: 'Red Flag details: BO-002'})).toBeInTheDocument();
  });
});
