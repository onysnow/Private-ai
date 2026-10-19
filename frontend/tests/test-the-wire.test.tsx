// @vitest-environment jsdom
// The Wire (features/the-wire): the case drawn as one map. Parties and links from the
// server, the account kept on its holder's card, a party's drawer with its flags and
// the dossier link, names shown as text (never as markup), and the empty case.
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TheWire} from '../features/the-wire/the-wire';
import {fmtAmt, fmtDate} from '../features/the-wire/wire-engine';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const ent = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, short: name, kind: 'company', schema: 'Company', note: '', deg: 1, holder: null, c: 0, x: 400, y: 400, jur: '', flags: null, ...extra,
});
const WIRE = {
  investigation_id: 'inv-1',
  entities: [
    ent('a', 'Meridian Holdings Ltd', {x: 300, y: 300, deg: 2, flags: {faint: 0, strong: 1, textbook: 0, items: [{level: 'strong', id: 'ML-021', text: '3 payments just under €10,000', flag_id: 'f1'}]}}),
    ent('b', '<b>Bellcastle</b> Trading', {x: 700, y: 500}),
    ent('acct', 'Account 0042', {kind: 'account', schema: 'BankAccount', holder: 'a', x: 300, y: 300}),
    ent('lone', 'Unlinked Trust', {c: -1, deg: 0, x: 260, y: 1560}),
  ],
  links: [
    {id: 'l1', s: 'b', t: 'acct', schema: 'Payment', fam: 'money', amount: 9800, cur: 'EUR', date: '2018-02-06', role: '', pct: '', ev: []},
    {id: 'l2', s: 'a', t: 'acct', schema: 'Ownership', fam: 'owns', amount: null, cur: '', date: '', role: '', pct: '', ev: []},
  ],
  events: [{date: '2017-07-03', title: 'Director appointed', entity: null}],
};

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1'});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('The Wire', () => {
  it('draws the parties, keeps the account on its holder and opens a party with its flags', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': WIRE});
    const openDossier = vi.fn();
    useWorkbenchStore.setState({openDossier});
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    await waitFor(() => expect(map.querySelectorAll('g.node').length).toBe(4));
    // The account is drawn on Meridian's card as a bead, not as a party of its own.
    expect(map.textContent).toContain('1 ACCOUNT');
    expect(screen.getByText(/Each patch is a group/)).toBeInTheDocument();
    // Names are text: a name that looks like markup is shown as written.
    expect(screen.getAllByRole('option', {name: '<b>Bellcastle</b> Trading'}).length).toBeGreaterThan(0);
    expect(document.querySelector('.tw b b')).toBeNull();
    fireEvent.click(map.querySelectorAll('g.node')[0]);
    const drawer = document.querySelector('.tw-drawer')!;
    await waitFor(() => expect(drawer.classList.contains('open')).toBe(true));
    expect(drawer.textContent).toContain('Meridian Holdings Ltd');
    expect(drawer.textContent).toContain('3 payments just under €10,000');
    fireEvent.click(screen.getByRole('button', {name: 'Open the dossier'}));
    expect(openDossier).toHaveBeenCalledWith('a');
  });

  it('says plainly when the case has no parties yet', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': {...WIRE, entities: [], links: [], events: []}});
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText(/No parties in this case yet/)).toBeInTheDocument();
  });

  it('writes amounts in full under a million, so a payment just under a threshold stays visible', () => {
    expect(fmtAmt(9800, 'EUR')).toBe('9,800 EUR');
    expect(fmtAmt(1_250_000, 'EUR')).toBe('1.3 m EUR');
    expect(fmtAmt(2_500_000_000, 'USD')).toBe('2.5 bn USD');
    expect(fmtDate('2018-02-06')).toBe('6 Feb 2018');
    expect(fmtDate('2018-02')).toBe('Feb 2018');
    expect(fmtDate('')).toBe('no date');
  });
});
