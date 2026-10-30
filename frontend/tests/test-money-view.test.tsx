// @vitest-environment jsdom
// See › Money (mockup SEE_2): loads with the view, one currency at a time, the columns with the ghost of
// missing money and the return arc of a round trip, the checks as leads with what could be innocent,
// the ledger strip with Red Flags' bracket, J / K, and "Traced so far".
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {MoneyView, stripValues} from '../features/money/money-view';
import {cycleClosers, layout, pathOf, placeLabels, shortAmount, wrapName, type Payment} from '../features/money/money-layout';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const sankeySpy = vi.fn();
vi.mock('next/dynamic', () => ({default: () => (props: unknown) => { sankeySpy(props); return <div data-testid="sankey-stub"/>; }}));

const tx = (id: string, from: [string, string], to: [string, string], amount: number, extra: Record<string, unknown> = {}) => ({
  id, relationship_id: id, dateTime: '2018-02-06', from: from[1], to: to[1], from_entity_id: from[0], to_entity_id: to[0], amount, currency: 'EUR',
  statedPurpose: null, transactionNumber: null, evidence: null, evidence_count: 0, supporting_evidence_count: 0, status: 'no_claim_dependency',
  flowType: 'inferred', certainty: 'not_yet_shown', locator: null, ...extra,
});
const FERN: [string, string] = ['fern', 'Fernhill Ltd']; const KES: [string, string] = ['kes', 'Kestrel SA'];
const COUNCIL: [string, string] = ['council', 'Harbour Council']; const LOOP: [string, string] = ['loop', 'Loop Two BV'];
const LEDGER = {
  investigation_id: 'inv-1', currencies: ['EUR', 'GBP'], flow_type_rule: 'rule', duplicate_rule: 'dupes once',
  transactions: [
    tx('p1', FERN, KES, 9800), tx('p2', FERN, KES, 9800, {dateTime: '2018-03-09'}), tx('p3', FERN, KES, 9800, {dateTime: '2018-04-11'}),
    tx('p4', KES, COUNCIL, 1250000, {dateTime: '2019-05-01', certainty: 'shown', flowType: 'direct', statedPurpose: 'land price', locator: 'council minutes p.4'}),
    tx('p5', KES, LOOP, 180000, {dateTime: '2021-03-01'}),
    tx('g1', FERN, COUNCIL, 500, {currency: 'GBP'}),
  ],
  incomplete: [{...tx('x1', FERN, KES, 0), amount: null, problems: ['amount missing']}],
};
const CHECKS = {
  investigation_id: 'inv-1', as_of: null, ran_at: '2026-10-10T14:02:00Z', rule: 'not a finding',
  currencies: [{currency: 'EUR', payments: 5, round_trips: [], checks: [
    {kind: 'grey_hole', party_id: 'kes', party: 'Kestrel SA', amount_in: 29400, amount_out: 1430000, payments_in: 3, payments_out: 2, gap: 1400600,
      innocent: 'a bank loan, or money from the owners, that the case does not hold yet', lead_idea: 'ask for Kestrel SA’s 2018–21 accounts'},
    {kind: 'black_hole', party_id: 'loop', party: 'Loop Two BV', amount_in: 180000, amount_out: 0, payments_in: 1, payments_out: 0, gap: 180000,
      innocent: 'a holding company keeping cash', lead_idea: 'ask for Loop Two BV’s bank statements'},
  ]}],
};
const indicator = {id: 'ML-021', name: 'Structuring', definition: '', area: 'ML', area_name: 'Money laundering',
  levels: {faint: 'x', strong: 'x', textbook: 'x', threshold_source: 'none', threshold_note: 'not a rule'}, sources: [], innocent_explanations: [], cross_hints: [], version: 1};
const FLAGS = {investigation_id: 'inv-1', rules: [], cannot_run: [], gone: [], investigation_type: {set_by: 'app', areas: [], suggested: []}, flags: [{
  id: 'f1', indicator_id: 'ML-021', rule_version: 1, level: 'faint', status: 'open', dismissed_reason: null, lead_id: null, weight: 1, weight_parts: [],
  parties: [{id: 'fern', name: 'Fernhill Ltd', schema: 'Company'}], links: ['p1', 'p2', 'p3'], facts: {}, not_shown: [],
  summary: 'Fernhill Ltd made 3 payments between €9,000 and €10,000 (€29,400 in all), each just under the €10,000 line.',
  first_seen_at: '2026-10-10T00:00:00', last_seen_at: '2026-10-10T00:00:00', gone_at: null, indicator,
}]};
const LEAD = {
  id: 'lead-1', investigation_id: 'inv-1', title: 'Grey hole: Kestrel SA (EUR)', status: 'unreviewed', priority: 'normal', owner: null, detail: null,
  provider: null, provider_record_id: null, kind: 'question', next_action: null, created_at: '2026-10-01T00:00:00', links: [], tasks: [], history: [],
  triage: {needs_attention: false, attention_score: 0, stance_counts: {supports: 0, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0,
    relationship_evidence_review_counts: {supports: 0, contradicts: 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0}, reasons: []},
};
const routes = {
  'GET /api/investigations/inv-1/financial-flows': LEDGER,
  'GET /api/investigations/inv-1/money-checks': CHECKS,
  'GET /api/investigations/inv-1/red-flags': FLAGS,
};
const wrap = (ui: ReactElement) => render(<QueryProvider>{ui}</QueryProvider>);

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', asOf: null}); sankeySpy.mockClear(); });
afterEach(() => cleanup());

describe('the money picture', () => {
  const p = (id: string, a: string, b: string, amount: number, date: string): Payment =>
    ({id, from: a, to: b, fromId: a, toId: b, amount, date, certainty: 'shown', purpose: null, locator: null});

  it('puts payers first, those who pass money on in the middle and where it ends up last, with the ghost before a grey hole', () => {
    const pic = layout([p('1', 'F', 'K', 10, '2018'), p('2', 'K', 'C', 100, '2019'), p('3', 'N', 'L', 5, '2019')], 'EUR', {ghosts: {K: 90}, marks: {K: ['grey_hole']}});
    const col = (id: string) => pic.nodes.find(n => n.id === id)!.col;
    expect(pic.columns.map(c => c.title)).toEqual(['Comes from', 'Passes through', 'Goes to']);
    expect([col('F'), col('ghost:K'), col('K'), col('C'), col('L')]).toEqual([0, 0, 1, 2, 2]);
    const ghost = pic.bands.find(b => b.certainty === 'worked_out')!;
    expect(ghost.label).toBe('ƒ €90 · worked out');
    expect(pic.nodes.find(n => n.id === 'K')!.marks).toEqual(['grey_hole']);
    expect(pathOf(pic, pic.bands.find(b => b.toId === 'C')!.key).size).toBe(3);
  });

  it('puts a chip on each band in the status grammar: what it carried and, when shown, where', () => {
    const shown = {...p('1', 'K', 'C', 1250000, '2019-05-20'), purpose: 'land price', locator: 'council minutes p.4'};
    const three = ['a', 'b', 'c'].map(id => p(id, 'F', 'K', 9800, '2018-02-06'));
    const open = {...p('d', 'F', 'K', 42000, '2019-05-14'), certainty: 'not_yet_shown' as const, purpose: 'deposit'};
    const pic = layout([shown, ...three, open], 'EUR');
    const chip = (to: string, c: string) => pic.bands.find(b => b.toId === to && b.certainty === c)!.chip;
    expect(chip('C', 'shown')).toMatchObject({text: '✓ land price', sub: 'council minutes p.4'});
    expect(chip('K', 'shown')).toMatchObject({text: '✓ 3 × €9,800'});
    expect(chip('K', 'not_yet_shown')).toMatchObject({text: '○ €42,000 “deposit”', sub: null});
  });

  it('folds all but the largest flows into one "others (n)" band, and every party keeps its exact totals', () => {
    // A pays B 100, and pays 30 small payees 1 each (2 payments to each); B pays C 90.
    const ps = [p('big', 'A', 'B', 100, '2018'), p('on', 'B', 'C', 90, '2019')];
    for (let i = 0; i < 30; i++) ps.push(p(`s${i}a`, 'A', `S${i}`, 1, '2019'), p(`s${i}b`, 'A', `S${i}`, 1, '2019'));
    const all = layout(ps, 'EUR');
    expect(all.flows).toBe(32);
    expect(all.folded).toBeNull();
    expect(all.bands).toHaveLength(32);
    const pic = layout(ps, 'EUR', {top: 20});
    expect(pic.bands).toHaveLength(21);
    const others = pic.bands.find(b => b.certainty === 'others')!;
    expect(pic.folded).toEqual({flows: 12, payments: 24, amount: 24});
    expect(others.ids).toHaveLength(24);
    expect(others.label).toBe('others (12) · €24 in 24 payments');
    // The drawn bands and "others" together carry every payment, exactly once.
    expect(pic.bands.flatMap(b => b.ids).sort()).toEqual(ps.map(x => x.id).sort());
    expect(pic.bands.reduce((s, b) => s + b.amount, 0)).toBe(ps.reduce((s, x) => s + x.amount, 0));
    // A's label is all it paid (100 + 60), though 24 of its payments are folded away.
    expect(pic.nodes.find(n => n.id === 'A')).toMatchObject({amountOut: 160, others: false});
    const ends = pic.nodes.filter(n => n.others);
    expect(ends.map(n => [n.col, n.name])).toEqual([[0, 'others (12)'], [pic.columns.length - 1, 'others (12)']]);
    // A crowded column packs its parties closer and makes the picture taller, never with overlapping bars.
    const last = pic.nodes.filter(n => n.col === pic.columns.length - 1).sort((a, b) => a.y - b.y);
    last.slice(1).forEach((n, i) => expect(n.y).toBeGreaterThanOrEqual(last[i].y + last[i].h));
    expect(pic.height).toBeGreaterThan(340);
  });

  it('draws a ledger of thousands of payments in a moment', () => {
    const ps: Payment[] = [];
    for (let i = 0; i < 3000; i++) ps.push(p(`x${i}`, `P${i % 400}`, `R${(i * 7) % 900}`, 10 + (i % 97), `20${10 + (i % 10)}-01-01`));
    const t0 = performance.now();
    const pic = layout(ps, 'EUR', {top: 20});
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(pic.bands.filter(b => b.certainty !== 'worked_out')).toHaveLength(21);
    expect(pic.bands.reduce((s, b) => s + b.amount, 0)).toBe(ps.reduce((s, x) => s + x.amount, 0));
  });

  it('places every party\'s label so none overlaps another, none crosses into the next column and none runs off the picture', () => {
    // A ledger like the demo case's: long names, nine-digit sums, crowded columns, two steps through the middle.
    const long = (i: number) => `Party ${i} International Investment Holdings Corporation (BVI) Limited`;
    const ps: Payment[] = [];
    for (let i = 0; i < 9; i++) {
      ps.push({...p(`a${i}`, `S${i}`, `M${i % 4}`, 300_000_000 + i * 7_000_000, '2012'), from: long(i), to: long(10 + (i % 4))});
      ps.push({...p(`b${i}`, `M${i % 4}`, `N${i % 3}`, 200_000_000 + i, '2013'), from: long(10 + (i % 4)), to: long(20 + (i % 3))});
      ps.push({...p(`c${i}`, `N${i % 3}`, `E${i}`, 150_000_000 + i, '2014'), from: long(20 + (i % 3)), to: long(30 + i)});
    }
    const pic = layout(ps, 'USD', {top: 20});
    const {labels, height} = placeLabels(pic, ps, 'USD');
    expect(labels).toHaveLength(pic.nodes.filter(n => !(n.others && n.col === pic.columns.length - 1)).length);
    expect(height).toBeGreaterThanOrEqual(pic.height);
    const col = (id: string) => pic.nodes.find(n => n.id === id)!.col;
    labels.forEach((a, i) => {
      expect(a.top).toBeGreaterThanOrEqual(20);
      expect(a.top + a.h).toBeLessThanOrEqual(height);
      expect(a.x + a.w).toBeLessThanOrEqual(col(a.nodeId) < pic.columns.length - 1 ? pic.columns[col(a.nodeId) + 1].x : pic.width);
      labels.slice(i + 1).forEach(b => expect(a.x < b.x + b.w && a.x + a.w > b.x && a.top < b.top + b.h && a.top + a.h > b.top).toBe(false));
    });
    // Long names are shortened (the full name is revealed on the label), and nine-digit sums are written short.
    expect(labels.some(l => l.cut)).toBe(true);
    expect(labels.flatMap(l => l.lines.map(x => `${x.text}${x.tail ?? ''}`)).join(' ')).toMatch(/\$3\d\dm/);
    expect(labels.filter(l => l.leader).every(l => l.leader!.startsWith('M'))).toBe(true);
  });

  it('wraps a long name over two lines and cuts the rest with an ellipsis; writes big sums short', () => {
    expect(wrapName('Kestrel SA', 200)).toEqual({lines: ['Kestrel SA'], cut: false});
    const w = wrapName('1MDB Global Investments Limited of the Cayman Islands', 140);
    expect(w.cut).toBe(true);
    expect(w.lines).toHaveLength(2);
    expect(w.lines[1].endsWith('…')).toBe(true);
    expect(wrapName('Enterprise Emerging Markets Fund', 150, 1).lines[0]).toMatch(/^Enterprise Emerging M.*…$/);
    expect(shortAmount(1_250_000, 'EUR')).toBe('€1,250,000');
    expect(shortAmount(646_464_649, 'USD')).toBe('$646m');
    expect(shortAmount(1_592_311_599, 'USD')).toBe('$1.59bn');
    expect(shortAmount(5_200_000, 'SGD', 1e6)).toBe('5.2m SGD');
  });

  it('writes the strip\'s values only where they overlap nothing', () => {
    const bars = Array.from({length: 12}, (_, i) => ({id: `v${i}`, x: 100 + i * 4, top: 20 + (i % 3), amount: 500_000_000 + i}));
    const vals = stripValues(bars, 'USD', 420, 130, {x: 200, y: 80, w: 68, h: 12}, 10000);
    expect(vals.length).toBeGreaterThan(0);
    expect(vals.length).toBeLessThan(bars.length);
    const box = (v: typeof vals[number]) => { const w = v.text.length * 5.8; return {x: v.anchor === 'start' ? v.x : v.x - w, y: v.y - 9, w, h: 11}; };
    vals.map(box).forEach((a, i, all) => {
      expect(a.x).toBeGreaterThanOrEqual(0); expect(a.x + a.w).toBeLessThanOrEqual(420);
      all.slice(i + 1).forEach(b => expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false));
    });
  });

  it('never refuses a cycle: the latest payment of a round trip is drawn as a return arc', () => {
    const ps = [p('1', 'A', 'B', 100, '2018-01-01'), p('2', 'B', 'C', 90, '2018-06-01'), p('3', 'C', 'A', 85, '2019-01-01')];
    expect([...cycleClosers(ps)]).toEqual(['3']);
    const pic = layout(ps, 'EUR');
    expect(pic.returns).toHaveLength(1);
    expect(pic.returns[0].label).toBe('returns to A · €85');
    expect(pic.bands.map(b => b.ids[0]).sort()).toEqual(['1', '2']);
  });
});

describe('MoneyView', () => {
  it('loads with the view, keeps each currency apart, and labels each band and party', async () => {
    mockApi(routes);
    wrap(<MoneyView investigationId="inv-1"/>);
    // "EUR only" shows; the sentence is revealed on it (Ony, 29 Oct), in the page for screen readers.
    expect((await screen.findByText('Euro payments only. The 1 sterling payment is kept apart and never added to these.')).closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('EUR only').closest('.rv')).toHaveAccessibleDescription('Euro payments only. The 1 sterling payment is kept apart and never added to these.');
    expect(screen.getByRole('tab', {name: 'EUR · 5'})).toHaveAttribute('aria-selected', 'true');
    const list = screen.getByRole('list', {name: 'The payments, in order'});
    expect(within(list).getByText('Fernhill Ltd to Kestrel SA: 3 × €9,800 (not yet shown)')).toBeInTheDocument();
    expect(within(list).getByText('Kestrel SA to Harbour Council: €1,250,000 · land price (shown)')).toBeInTheDocument();
    // The worked-out sum's explanation is revealed on its line, and each check mark is named on reveal.
    expect(screen.getByText('= what left Kestrel SA minus what came in', {exact: false}).closest('[hidden]')).not.toBeNull();
    expect(screen.getAllByRole('img', {name: 'Grey hole'}).length).toBeGreaterThan(0);
    expect(screen.getByText(/Not charted: 1 payment missing something/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', {name: 'GBP · 1'}));
    expect(screen.getByText('Sterling payments only. The 5 euro payments are kept apart and never added to these.')).toBeInTheDocument();
  });

  it('asks the four questions as leads with what could be innocent, and says when one finds nothing', async () => {
    const api = mockApi({...routes, 'POST /api/leads': LEAD});
    wrap(<MoneyView investigationId="inv-1"/>);
    const grey = await screen.findByRole('article', {name: 'Grey hole: Kestrel SA'});
    expect(grey).toHaveTextContent('€29,400 recorded in, €1,430,000 out: €1,400,600 has no recorded source.');
    expect(grey).toHaveTextContent('Could be innocent: a bank loan, or money from the owners, that the case does not hold yet.');
    // The four checks in a row: hollow when none was found, each named on reveal.
    expect(screen.getByRole('img', {name: 'Miracle: none found'})).toBeInTheDocument();
    expect(screen.getByRole('img', {name: 'Round trip: none found'})).toHaveAccessibleDescription(/No euro chain returns to its payer\./);
    expect(within(grey).getByText('Lead idea:', {exact: false}).closest('[hidden]')).not.toBeNull();
    await userEvent.setup().click(within(grey).getByRole('button', {name: 'Make a lead'}));
    await waitFor(() => expect(api.calls('POST /api/leads')).toHaveLength(1));
    expect(api.lastBody('POST /api/leads')).toMatchObject({investigation_id: 'inv-1', title: 'Grey hole: Kestrel SA (EUR)'});
    expect(await within(grey).findByRole('button', {name: 'Lead made ✓'})).toBeDisabled();
  });

  it('brackets the payments a Red Flag names, walks the ledger with J / K, and adds what is clicked to Traced so far', async () => {
    mockApi(routes);
    const {container} = wrap(<MoneyView investigationId="inv-1"/>);
    expect(await screen.findByText(/each just under the €10,000 line/)).toBeInTheDocument();
    expect(container.querySelector('.mn-bracket')).not.toBeNull();
    expect(screen.getByText('€10,000 line')).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'j'});
    expect(container.querySelector('tr.lit')).toHaveTextContent('9 Mar 2018');
    const band = [...container.querySelectorAll<SVGPathElement>('.mn-band')].find(b => b.textContent?.startsWith('Kestrel SA to Harbour Council'))!;
    fireEvent.click(band);
    expect(screen.getByText('Traced so far').parentElement).toHaveTextContent('€1,250,0001 payment');
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(screen.getByText('Traced so far').parentElement).toHaveTextContent('€00 payments');
    fireEvent.keyDown(window, {key: 'l'});
    expect(screen.getByRole('radio', {name: 'Ledger'})).toHaveAttribute('aria-checked', 'true');
  });

  it('draws the flow from the same payments, and says so when there are none', async () => {
    mockApi(routes);
    wrap(<MoneyView investigationId="inv-1"/>);
    await userEvent.setup().click(await screen.findByRole('radio', {name: 'Flow'}));
    await screen.findByTestId('sankey-stub');
    const props = sankeySpy.mock.calls.at(-1)?.[0] as {transactions: Array<{id: string}>; fold?: {top: number; all: boolean}};
    expect(props.transactions.map(t => t.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    // A very large ledger folds to the 20 largest flows in the Flow layout too, as in Columns.
    expect(props.fold).toMatchObject({top: 20, all: false});
    cleanup();
    mockApi({...routes, 'GET /api/investigations/inv-1/financial-flows': {...LEDGER, transactions: [], incomplete: []}});
    wrap(<MoneyView investigationId="inv-1"/>);
    expect(await screen.findByText('No payment has an amount yet.')).toBeInTheDocument();
  });

  it('adds a money check to To check once, then says it is already there', async () => {
    const KEPT = {investigation_id: 'inv-1', gone: [], missing: [], items: [{
      id: 'tc-1', indicator_id: 'grey_hole', indicator_name: 'Grey hole', kind: 'money', question: 'Grey hole at Kestrel SA: more out than in',
      status: 'open', note: null, decided_at: null, parties: [{id: 'kes', name: 'Kestrel SA', schema: 'Company'}], flag_id: null, related_flags: [],
      document: null, locator: 'EUR ledger', excerpt: '29,400 EUR recorded in, 1,430,000 EUR out: 1,400,600 EUR has no recorded source.', terms: [],
      first_seen_at: '2026-10-10T00:00:00', gone_at: null,
    }]};
    const api = mockApi({...routes, 'POST /api/investigations/inv-1/checks/money': KEPT});
    wrap(<MoneyView investigationId="inv-1"/>);
    const grey = await screen.findByRole('article', {name: 'Grey hole: Kestrel SA'});
    await userEvent.setup().click(within(grey).getByRole('button', {name: 'Add to To check'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/checks/money')).toHaveLength(1));
    expect(api.lastBody('POST /api/investigations/inv-1/checks/money')).toMatchObject({currency: 'EUR', kind: 'grey_hole', party_id: 'kes', as_of: null});
    expect(await within(grey).findByRole('button', {name: 'In To check ✓'})).toBeDisabled();
    // The other checks can still be added.
    expect(within(screen.getByRole('article', {name: 'Black hole: Loop Two BV'})).getByRole('button', {name: 'Add to To check'})).toBeEnabled();
  });

  it('says a check is already in To check when the server says it is kept', async () => {
    const kept = {...CHECKS, currencies: [{...CHECKS.currencies[0], checks: CHECKS.currencies[0].checks.map(c => c.kind === 'grey_hole' ? {...c, to_check_id: 'tc-1'} : c)}]};
    mockApi({...routes, 'GET /api/investigations/inv-1/money-checks': kept});
    wrap(<MoneyView investigationId="inv-1"/>);
    const grey = await screen.findByRole('article', {name: 'Grey hole: Kestrel SA'});
    expect(within(grey).getByRole('button', {name: 'In To check ✓'})).toBeDisabled();
  });

  it('pointing at a band, with the mouse or the keyboard, lights all its ledger rows in the table and on the strip', async () => {
    mockApi(routes);
    const {container} = wrap(<MoneyView investigationId="inv-1"/>);
    await screen.findByText(/each just under the €10,000 line/);
    const band = screen.getByRole('button', {name: 'Fernhill Ltd to Kestrel SA: 3 × €9,800 (not yet shown)'});
    const litRows = () => [...container.querySelectorAll('.mn-table tr.lit')].map(r => r.querySelector('td')?.textContent);
    fireEvent.mouseEnter(band);
    expect(litRows()).toEqual(['6 Feb 2018', '9 Mar 2018', '11 Apr 2018']);
    expect(container.querySelectorAll('.mn-bar.lit')).toHaveLength(3);
    expect(band).toHaveClass('lit');
    fireEvent.mouseLeave(band);
    expect(litRows()).toEqual([]);
    expect(container.querySelectorAll('.mn-bar.lit')).toHaveLength(0);
    // Tab onto a band does the same; Enter adds it to Traced so far.
    act(() => band.focus());
    expect(litRows()).toHaveLength(3);
    fireEvent.keyDown(band, {key: 'Enter'});
    expect(screen.getByText('Traced so far').parentElement).toHaveTextContent('€29,4003 payments');
    expect(band).toHaveAttribute('aria-pressed', 'true');
    act(() => band.blur());
    expect(litRows()).toEqual([]);
  });

  it('draws the 20 largest flows of a very large ledger, folds the rest into "others (n)" that opens out, and keeps the totals exact', async () => {
    // 1 large payment from a fund, then 60 payees each paid by one of 30 payers: 61 flows, 151 payments.
    const FUND: [string, string] = ['fund', 'Northwind Fund'];
    const big = [tx('b0', FUND, KES, 5000000, {dateTime: '2017-01-01'})];
    for (let i = 0; i < 150; i++) {
      const payer: [string, string] = [`pay${i % 30}`, `Payer ${i % 30}`];
      const payee: [string, string] = [`to${i % 60}`, `Payee ${i % 60}`];
      big.push(tx(`q${i}`, payer, payee, 1000 + (i % 60) * 100, {dateTime: `2019-${String(1 + (i % 12)).padStart(2, '0')}-01`}));
    }
    const total = big.reduce((s, t) => s + t.amount, 0);
    mockApi({...routes, 'GET /api/investigations/inv-1/financial-flows': {...LEDGER, transactions: big, incomplete: []},
      'GET /api/investigations/inv-1/money-checks': {...CHECKS, currencies: [{currency: 'EUR', payments: big.length, round_trips: [], checks: []}]}});
    const {container} = wrap(<MoneyView investigationId="inv-1"/>);
    const others = await screen.findByRole('button', {name: /^others \(41\) · €[\d,]+ in \d+ payments: the smaller flows/});
    expect(container.querySelectorAll('.mn-band')).toHaveLength(21);
    expect(screen.getByText(/The 20 largest of 61 flows are drawn; others \(41\) holds the/)).toBeInTheDocument();
    // Pointing at "others" lights every payment folded into it.
    fireEvent.mouseEnter(others);
    const foldedCount = Number(others.getAttribute('aria-label')!.match(/in (\d+) payments/)![1]);
    expect(container.querySelectorAll('.mn-bar.lit')).toHaveLength(foldedCount);
    fireEvent.mouseLeave(others);
    // The 20 drawn bands carry exactly the 20 largest flows; "others" carries exactly the rest.
    const byPair = new Map<string, number>();
    for (const t of big) byPair.set(`${t.from_entity_id}>${t.to_entity_id}`, (byPair.get(`${t.from_entity_id}>${t.to_entity_id}`) ?? 0) + t.amount);
    const top20 = [...byPair.values()].sort((a, b) => b - a).slice(0, 20).reduce((s, a) => s + a, 0);
    expect(others.getAttribute('aria-label')).toContain(`€${(total - top20).toLocaleString('en-GB')} in`);
    for (const b of container.querySelectorAll('.mn-band')) if (b !== others) fireEvent.click(b);
    expect(screen.getByText('Traced so far').parentElement).toHaveTextContent(`€${top20.toLocaleString('en-GB')}`);
    // A party's label keeps its exact total even when some of its flows are folded away: Payer 20 pays
    // Payee 50 €12,000 (drawn) and Payee 20 €9,000 (folded). The picture is dense, so the count waits on the label.
    const label = [...container.querySelectorAll('.mn-node-name')].find(t => t.textContent === 'Payer 20')!;
    expect(label.parentElement!.textContent).toContain('Payer 20€21,000');
    fireEvent.click(others);
    expect(container.querySelectorAll('.mn-band')).toHaveLength(61);
    expect(screen.getByText(/All 61 flows are drawn/)).toBeInTheDocument();
    // Opened out, every band can be traced, and the total is every payment's.
    for (const b of container.querySelectorAll<SVGPathElement>('.mn-band')) if (!b.classList.contains('traced')) fireEvent.click(b);
    expect(screen.getByText('Traced so far').parentElement).toHaveTextContent(`€${total.toLocaleString('en-GB')}${big.length} payments`);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Fold to the 20 largest'}));
    expect(container.querySelectorAll('.mn-band')).toHaveLength(21);
  });

  it('keeps every band chip inside the picture and off the others, leaving out one with no room near its band', async () => {
    // SEE_2's own euro payments: the €60,000 band runs between two names with no room for its chip (the mockup draws none).
    const NOM: [string, string] = ['nom', 'Harbour Nominees Ltd'];
    const ledger = {...LEDGER, transactions: [...LEDGER.transactions,
      tx('p6', FERN, KES, 42000, {dateTime: '2019-05-14', statedPurpose: 'deposit'}), tx('p7', NOM, LOOP, 60000, {dateTime: '2019-06-12'})]};
    mockApi({...routes, 'GET /api/investigations/inv-1/financial-flows': ledger});
    wrap(<MoneyView investigationId="inv-1"/>);
    const fig = await screen.findByRole('img', {name: /Money in EUR/});
    const height = Number(fig.getAttribute('viewBox')!.split(' ')[3]);
    const boxes = [...fig.querySelectorAll('.mn-chip-band')].map(g => {
      const [x, y] = g.getAttribute('transform')!.match(/-?[\d.]+/g)!.map(Number);
      const r = g.querySelector('rect')!;
      return {x, top: y - 13, w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height'))};
    });
    expect(boxes.length).toBeGreaterThan(2);
    for (const b of boxes) { expect(b.top).toBeGreaterThanOrEqual(20); expect(b.top + b.h).toBeLessThanOrEqual(height); }
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => expect(a.x < b.x + b.w && a.x + a.w > b.x && a.top < b.top + b.h && a.top + a.h > b.top).toBe(false)));
  });

  it('shows a payment made over a span with its end date', async () => {
    const spanned = {...LEDGER, transactions: LEDGER.transactions.map(t => t.id === 'p5' ? {...t, dateEnd: '2021-06'} : t)};
    mockApi({...routes, 'GET /api/investigations/inv-1/financial-flows': spanned});
    const {container} = wrap(<MoneyView investigationId="inv-1"/>);
    await screen.findByText(/each just under the €10,000 line/);
    const row = [...container.querySelectorAll('tr')].find(r => r.textContent?.includes('Loop Two BV'));
    expect(row).toHaveTextContent('1 Mar 2021 to Jun 2021');
  });

  it('shows a payment known only by its end date as "by" that date', async () => {
    const ended = {...LEDGER, transactions: LEDGER.transactions.map(t => t.id === 'p5' ? {...t, dateTime: null, dateEnd: '2021-06'} : t)};
    mockApi({...routes, 'GET /api/investigations/inv-1/financial-flows': ended});
    const {container} = wrap(<MoneyView investigationId="inv-1"/>);
    await screen.findByText(/each just under the €10,000 line/);
    await waitFor(() => expect([...container.querySelectorAll('tr')].find(r => r.textContent?.includes('Loop Two BV'))).toHaveTextContent('by Jun 2021'));
  });

  it('shows the reason when the ledger cannot be read', async () => {
    mockApi({...routes, 'GET /api/investigations/inv-1/financial-flows': {status: 500, body: {detail: 'ledger unavailable'}}});
    wrap(<MoneyView investigationId="inv-1"/>);
    expect(await screen.findByText(/ledger unavailable/)).toBeInTheDocument();
  });
});

describe('a dense picture says less at rest', () => {
  const pay = (i: number, from: string, to: string, amount: number): Payment => ({id: `p${i}`, from, to, fromId: from, toId: to, amount,
    date: `2012-0${1 + (i % 9)}-01`, certainty: 'shown', purpose: null, locator: `page ${i}`});
  it('names a middle party alone and a source with its total; a sparse one keeps every sum', () => {
    const chain = [pay(1, 'A', 'B', 9e6), pay(2, 'B', 'C', 8e6), pay(3, 'C', 'D', 7e6)];
    const sparse = layout(chain, 'USD');
    const middle = (pic: ReturnType<typeof layout>, quiet?: boolean) => placeLabels(pic, chain, 'USD', quiet).labels.find(l => l.nodeId === 'B')!;
    expect(middle(sparse).lines.some(l => l.kind === 'sum')).toBe(true);
    expect(middle(sparse, true).lines.map(l => l.kind)).toEqual(['name']);
    const many = Array.from({length: 9}, (_, i) => pay(10 + i, `S${i}`, `T${i}`, (i + 1) * 1e6));
    const dense = layout(many, 'USD');
    const source = placeLabels(dense, many, 'USD').labels.find(l => l.nodeId === 'S3')!;
    expect(source.lines).toEqual([{text: 'S3', kind: 'name'}, {text: '$4,000,000', kind: 'sum'}]);
  });
});
