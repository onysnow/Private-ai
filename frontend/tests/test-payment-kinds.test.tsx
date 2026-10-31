// @vitest-environment jsdom
// What kind of payment a Payment link is (DECISIONS_LOG 33): its mark, named on reveal; set in Add by hand and on an
// opened link; an amount owed (an agreed price, a fine, an order) listed under "Owed, not paid" in See › Money and
// never drawn or added.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PAYMENT_KIND, PAYMENT_KINDS, PaymentKindMark} from '../components/network/marks';
import {AddByHand} from '../features/by-hand/add-by-hand';
import {MoneyView} from '../features/money/money-view';
import {RelationshipDetail} from '../features/relationship-graph/relationship-detail';
import type {GraphEdge} from '../features/relationship-graph/graph';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall} from '../test-support/mock-api';
import {relationshipFixture} from '../test-support/page-routes';

vi.mock('next/dynamic', () => ({default: () => () => <div data-testid="dynamic-stub"/>}));

const wrap = (ui: ReactElement) => render(<QueryProvider>{ui}</QueryProvider>);
beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', asOf: null}); });
afterEach(() => cleanup());

const tx = (id: string, from: string, to: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, relationship_id: id, dateTime: '2016-05-24', from, to, from_entity_id: from, to_entity_id: to, amount, currency: 'EUR',
  statedPurpose: null, paymentKind: null, transactionNumber: null, evidence: null, evidence_count: 0, supporting_evidence_count: 0,
  status: 'no_claim_dependency', flowType: 'inferred', certainty: 'not_yet_shown', locator: null, ...extra,
});

describe('payment kinds', () => {
  it('has a word and a meaning for each kind, and three of them are amounts owed', () => {
    expect(PAYMENT_KINDS).toEqual(['transfer', 'loan', 'fee', 'settlement', 'price', 'fine', 'ordered']);
    expect(PAYMENT_KINDS.filter(k => PAYMENT_KIND[k].owed)).toEqual(['price', 'fine', 'ordered']);
  });

  it('draws no mark when the kind is not said, and names the kind on reveal', async () => {
    const {container} = render(<><PaymentKindMark kind={null}/><PaymentKindMark kind="fine"/></>);
    expect(container.querySelectorAll('[data-kind]')).toHaveLength(1);
    const mark = screen.getByRole('img', {name: 'A fine or penalty'});
    await userEvent.setup().click(mark);
    expect(await screen.findByText(/Owed, not paid: kept out of the totals/, {selector: '#rv-card *'})).toBeInTheDocument();
  });

  it('lists amounts owed apart in See › Money, with their marks, and draws only the money that moved', async () => {
    mockApi({
      'GET /api/investigations/inv-1/financial-flows': {investigation_id: 'inv-1', currencies: ['EUR'], flow_type_rule: 'r', duplicate_rule: 'd', owed_rule: 'o',
        transactions: [tx('p1', 'Fund', 'Shell', 5000000, {paymentKind: 'loan'})],
        owed: [tx('f1', 'Bank', 'Regulator', 13300000, {paymentKind: 'fine', currency: 'SGD'})], incomplete: []},
      'GET /api/investigations/inv-1/money-checks': {investigation_id: 'inv-1', as_of: null, ran_at: '2026-10-30T10:00:00Z', rule: 'r', currencies: []},
      'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', rules: [], cannot_run: [], gone: [], flags: [],
        investigation_type: {set_by: 'app', areas: [], suggested: []}},
    });
    const {container} = wrap(<MoneyView investigationId="inv-1"/>);
    const owed = await screen.findByRole('list', {name: 'Amounts owed, not paid'});
    expect(owed).toHaveTextContent('Bank → Regulator · 13,300,000 SGD');
    expect(within(owed).getByRole('img', {name: 'A fine or penalty'})).toBeInTheDocument();
    // The currency tabs and the ledger hold only the money that moved; the loan carries its mark.
    expect(screen.getByRole('tab', {name: 'EUR · 1'})).toBeInTheDocument();
    expect(screen.queryByRole('tab', {name: /SGD/})).toBeNull();
    const row = [...container.querySelectorAll('tr')].find(r => r.textContent?.includes('Fund'))!;
    expect(within(row).getByRole('img', {name: 'A loan'})).toBeInTheDocument();
    expect([...container.querySelectorAll('tr')].some(r => r.textContent?.includes('Regulator'))).toBe(false);
  });

  it('sends the kind picked in Add by hand with the link', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/by-hand/suggest': ({url}: {url: URL}) => (url.searchParams.get('q')?.toLowerCase().startsWith('ban')
        ? [{id: 'e-bank', caption: 'Bank', schema: 'Company', matched: 'Bank', as: 'its name'}]
        : [{id: 'e-mas', caption: 'Regulator', schema: 'PublicBody', matched: 'Regulator', as: 'its name'}]),
      'POST /api/investigations/inv-1/by-hand/preview': {already: [], waiting: [], changes: []},
      'POST /api/investigations/inv-1/by-hand': {status: 201, body: {record_type: 'link', record_id: 'r1', evidence_id: null, lead_id: 'l1', parties: []}},
      'GET /api/investigations/inv-1/documents': [],
    });
    wrap(<AddByHand investigationId="inv-1"/>);
    const user = userEvent.setup();
    const [first, second] = screen.getAllByLabelText('party');
    await user.type(first, 'Bank');
    await user.click(await screen.findByRole('option', {name: /Bank/}));
    await user.type(second, 'Regu');
    await user.click(await screen.findByRole('option', {name: /Regulator/}));
    await user.selectOptions(screen.getByLabelText('Kind of payment'), 'fine');
    await user.click(screen.getByRole('radio', {name: /I know it, no source yet/}));
    await user.click(screen.getByRole('button', {name: 'Add the link'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/by-hand')).toHaveLength(1));
    expect(api.calls('POST /api/investigations/inv-1/by-hand')[0].body).toMatchObject({link: {schema: 'Payment', payment_kind: 'fine'}});
  });

  it('sets and clears the kind on an opened payment', async () => {
    const edge = relationshipFixture({schema: 'Payment', source_prop: 'payer', target_prop: 'beneficiary', payment_kind: null}) as GraphEdge;
    const api = mockApi({
      'GET /api/relationships/rel-1/evidence-reviews': {relationship_id: 'rel-1', reviews: []},
      'PATCH /api/relationships/rel-1/payment-kind': (call: RouteCall) => ({...edge, payment_kind: (call.body as {payment_kind: string | null}).payment_kind}),
    });
    const updated = vi.fn();
    wrap(<RelationshipDetail investigationId="inv-1" edge={edge} evidencePool={[]} onUpdated={updated}/>);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Kind of payment'), 'ordered');
    await waitFor(() => expect(api.calls('PATCH /api/relationships/rel-1/payment-kind')).toHaveLength(1));
    expect(api.calls('PATCH /api/relationships/rel-1/payment-kind')[0].body).toEqual({payment_kind: 'ordered'});
    await waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({payment_kind: 'ordered'})));
  });
});
