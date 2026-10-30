// @vitest-environment jsdom
// The mapping the app proposes for a table (features/documents/table-proposal.tsx; backend
// app/services/table_proposals.py): "Looks like payments", each column's role, the first row as it would be read, and
// one action to accept, change or dismiss it. Nothing is made until a person accepts.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {madeWords, proposalTitle, sampleLine, sureness, TableProposal} from '../features/documents/table-proposal';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const VIEW = 'GET /api/documents/doc-1/table-proposal';
const ACCEPT = 'POST /api/documents/doc-1/table-proposal/accept';
const DISMISS = 'POST /api/documents/doc-1/table-proposal/dismiss';
const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const col = (column: string, role: string | null, confidence: number | null = 0.95) =>
  ({column, role, confidence: role ? confidence : null, why: role ? 'From its header; every value in the first rows reads as it' : null});
const ROLES = [{role: 'date', label: 'date'}, {role: 'amount', label: 'amount'}, {role: 'debit', label: 'money out'},
  {role: 'credit', label: 'money in'}, {role: 'counterparty', label: 'other party'}, {role: 'purpose', label: 'purpose'},
  {role: 'currency', label: 'currency'}, {role: 'value_date', label: 'value date'}];
const STATEMENT = {
  kind: 'payments', schema: null, shape: 'statement', account_holder: null, sheet: null, confidence: 0.93, decimal: ',',
  date_order: 'DMY', currency: null,
  columns: [col('Buchungstag', 'date'), col('Valuta', 'value_date'), col('Auftraggeber / Empfänger', 'counterparty', 0.9),
    col('Verwendungszweck', 'purpose', 0.9), col('Soll', 'debit'), col('Haben', 'credit'), col('Währung', 'currency'), col('Saldo', null)],
  sample: [{number: 2, date: '2024-04-03', amount: '1234.56', currency: 'EUR', payee: 'Stadtwerke München', purpose: 'Strom April', problems: []}],
};
const proposed = {document_id: 'doc-1', status: 'proposed', proposal: STATEMENT, roles: ROLES, decision: null, problem: null};
const accepted = {...proposed, status: 'accepted',
  decision: {decision: 'accepted', decided_by: 'anna', decided_at: '2026-10-30T10:00:00', mapping_id: 'map-1', changed: true}};
const run = {mapping: {id: 'map-1', document_id: 'doc-1', sheet: null, query: {}, created_by: 'anna', created_at: '2026-10-30T10:00:00',
  rows_read: 3, entities_proposed: 3, links_proposed: 3, prepare: {}}, entities_proposed: 3, links_proposed: 3, already_proposed: 0, skipped: []};

describe('TableProposal', () => {
  it('shows what the table looks like and which column is which, and asks whose account it is before accepting', async () => {
    let state: unknown = proposed;
    const onAccepted = vi.fn();
    const api = mockApi({[VIEW]: () => state, [ACCEPT]: () => { state = accepted; return {proposal: accepted, run}; }});
    wrap(<TableProposal documentId="doc-1" onAccepted={onAccepted}/>);
    const user = userEvent.setup();

    expect(await screen.findByText("Looks like one account's payments")).toBeInTheDocument();
    const cols = within(screen.getByRole('list', {name: 'Which column is which'}));
    expect(cols.getByText(/Soll/).textContent).toBe('Soll → money out');
    expect(cols.getByText(/Buchungstag/).textContent).toBe('Buchungstag → date');
    expect(cols.getByText('+1 left out')).toBeInTheDocument();
    expect(document.querySelector('.tp-sample')?.textContent).toContain('1,234.56 EUR · the account holder → Stadtwerke München · 2024-04-03');

    const accept = screen.getByRole('button', {name: 'Accept'});
    expect(accept).toBeDisabled();                 // whose account is not said yet
    await user.type(screen.getByLabelText('Account holder'), 'Anna Weber');
    expect(document.querySelector('.tp-sample')?.textContent).toContain('1,234.56 EUR · Anna Weber → Stadtwerke München');
    await user.click(accept);
    expect(await screen.findByText('Payments mapped', {exact: false})).toBeInTheDocument();
    expect(api.lastBody(ACCEPT)).toEqual({sheet: null, account_holder: 'Anna Weber'});
    expect(screen.getByRole('status').textContent).toContain('3 parties and 3 payments to review');
    expect(onAccepted).toHaveBeenCalled();
  });

  it('sends the columns a person changed', async () => {
    const api = mockApi({[VIEW]: {...proposed, proposal: {...STATEMENT, account_holder: 'Anna Weber'}}, [ACCEPT]: {proposal: accepted, run}});
    wrap(<TableProposal documentId="doc-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Edit'}));
    await user.selectOptions(screen.getByLabelText('Verwendungszweck: what it is'), '');
    await user.selectOptions(screen.getByLabelText('How dates are written'), 'MDY');
    await user.click(screen.getByRole('button', {name: 'Accept'}));
    await vi.waitFor(() => expect(api.calls(ACCEPT)).toHaveLength(1));
    const body = api.lastBody(ACCEPT) as {columns: {column: string; role: string | null}[]; date_order: string};
    expect(body.date_order).toBe('MDY');
    expect(body.columns.find(c => c.column === 'Verwendungszweck')?.role).toBeNull();
    expect(body.columns.find(c => c.column === 'Soll')?.role).toBe('debit');
  });

  it('dismisses it without making anything', async () => {
    let state: unknown = proposed;
    const dismissed = {...proposed, status: 'dismissed', decision: {decision: 'dismissed', decided_by: 'anna', decided_at: '2026-10-30T10:00:00', mapping_id: null, changed: false}};
    const api = mockApi({[VIEW]: () => state, [DISMISS]: () => { state = dismissed; return dismissed; }});
    wrap(<TableProposal documentId="doc-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Dismiss'}));
    expect(await screen.findByText('Mapping proposal dismissed')).toBeInTheDocument();
    expect(api.calls(ACCEPT)).toHaveLength(0);
  });

  it('shows nothing for a table with nothing proposed', async () => {
    const api = mockApi({[VIEW]: {document_id: 'doc-1', status: 'none', proposal: null, roles: [], decision: null, problem: null}});
    const {container} = wrap(<TableProposal documentId="doc-1"/>);
    await vi.waitFor(() => expect(api.calls(VIEW)).toHaveLength(1));
    expect(container.textContent).toBe('');
  });
});

describe('table proposal words', () => {
  it('names the table, the sureness and what accepting made', () => {
    expect(proposalTitle({kind: 'payments', shape: 'pair', schema: null})).toBe('Looks like payments');
    expect(proposalTitle({kind: 'parties', shape: null, schema: 'Company'})).toBe('Looks like a list of companies');
    expect([sureness(0.95), sureness(0.7), sureness(0.5), sureness(null)]).toEqual(['high', 'mid', 'low', 'person']);
    expect(madeWords('payments', 1, 2, 1)).toBe('1 party and 2 payments to review; 1 value or row left out');
    expect(madeWords('parties', 4, 0, 0)).toBe('4 records to review');
    expect(sampleLine({number: 2, problems: [], amount: '30000000', currency: 'USD', payer: '1MDB', payee: 'Good Star Limited', date: '2011-05-20'}, 'payments', ''))
      .toBe('30,000,000 USD · 1MDB → Good Star Limited · 2011-05-20');
  });
});
