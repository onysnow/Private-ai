// @vitest-environment jsdom
// The Wire (features/the-wire): the case drawn as one map. Parties and links from the
// server, the account kept on its holder's card, a party's drawer with its flags and
// the dossier link, names shown as text (never as markup), and the empty case.
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TheWire, linkInfo} from '../features/the-wire/the-wire';
import {fmtAmt, fmtDate, linkSentence} from '../features/the-wire/wire-engine';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {emptyGraph, plainAdvisory, relationshipFixture} from '../test-support/page-routes';

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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-motion'); });

const reviewed = (stance: 'supports' | 'contradicts') => plainAdvisory({relationship_evidence_attachment_count: 1,
  relationship_evidence_review_counts: {supports: stance === 'supports' ? 1 : 0, contradicts: stance === 'contradicts' ? 1 : 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0}});
// SEE_1's links: a shown ownership, a disputed email, an unshown "signs for", and a directorship that ended.
const SEE1 = {
  investigation_id: 'inv-1',
  entities: [
    ent('k', 'Kestrel SA', {x: 500, y: 500, deg: 4, flags: {faint: 0, strong: 0, textbook: 2, items: [{level: 'textbook', id: 'ML-023', text: 'Circular ownership', flag_id: 'f9'}]}}),
    ent('l', 'Loop Two BV', {x: 300, y: 300}), ent('r', 'M. Ross', {kind: 'person', schema: 'Person', x: 700, y: 300}),
    ent('w', 'A. Weber', {kind: 'person', schema: 'Person', x: 300, y: 700}), ent('f', 'Fernhill Ltd', {x: 700, y: 700}),
  ],
  links: [
    {id: 'o1', s: 'l', t: 'k', schema: 'Ownership', fam: 'owns', amount: null, cur: '', date: '2016-02-01', role: '', pct: '100', ev: []},
    {id: 'u1', s: 'r', t: 'k', schema: 'UnknownLink', fam: 'other', amount: null, cur: '', date: '', role: 'signs for', pct: '', ev: []},
    {id: 'd1', s: 'w', t: 'k', schema: 'Directorship', fam: 'runs', amount: null, cur: '', date: '2014-03-01', role: 'director', pct: '', ev: []},
    {id: 'x1', s: 'r', t: 'f', schema: 'UnknownLink', fam: 'other', amount: null, cur: '', date: '2018-11-02', role: 'emailed about filing', pct: '',
      ev: [{doc: 'Leaked email', loc: 'email 2 Nov 2018', q: 'Please file it before the council meets', evidence_id: 'ev-9'}]},
  ],
  events: [],
};
const SEE1_GRAPH = emptyGraph([
  relationshipFixture({id: 'o1', advisory: reviewed('supports')}),
  relationshipFixture({id: 'u1', schema: 'UnknownLink'}),
  relationshipFixture({id: 'd1', schema: 'Directorship', properties: {endDate: ['2017-07-03']}, advisory: reviewed('supports')}),
  relationshipFixture({id: 'x1', schema: 'UnknownLink', advisory: reviewed('contradicts')}),
]);

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

  it('reads how sure each link is from the review advisory, with its end date', () => {
    const info = linkInfo(SEE1_GRAPH.edges as never);
    expect(info.o1).toEqual({sure: 'shown', end: ''});
    expect(info.u1).toEqual({sure: 'unshown', end: ''});
    expect(info.d1).toEqual({sure: 'shown', end: '2017-07-03'});
    expect(info.x1).toEqual({sure: 'disputed', end: ''});
  });

  it('writes each link as a sentence from the fixed verbs', () => {
    const l = (o: Record<string, unknown>) => ({id: 'x', s: 'a', t: 'b', schema: 'Payment', fam: 'money' as const, amount: 9800, cur: 'EUR', date: '', role: '', pct: '', ev: [], ...o});
    expect(linkSentence('money', [l({date: '2018-02-06'}), l({date: '2018-03-09'}), l({date: '2018-04-11'})], '')).toBe('paid 29,400 EUR · 3× · Feb–Apr 2018');
    expect(linkSentence('money', [l({amount: 42000, date: '2019-05-14', role: 'deposit'})], '')).toBe('paid 42,000 EUR “deposit” · May 2019');
    expect(linkSentence('owns', [l({schema: 'Ownership', fam: 'owns', pct: '60', date: ''})], '')).toBe('owns 60%');
    expect(linkSentence('runs', [l({schema: 'Directorship', fam: 'runs', date: '2017-07-03'})], '')).toBe('director since 2017');
    expect(linkSentence('runs', [l({schema: 'Directorship', fam: 'runs', role: 'director', date: '2014-03-01'})], '2017-07-03')).toBe('director · ended Jul 2017');
    expect(linkSentence('other', [l({schema: 'UnknownLink', fam: 'other', role: 'bid for', date: '2019-03-04'})], '')).toBe('bid for · 4 Mar 2019');
  });

  it('draws each link in the status grammar, labels it with its glyph, keeps the How sure key on and counts the window', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    await waitFor(() => expect(map.querySelectorAll('.strand').length).toBe(4));
    // Line style: dashed not yet shown, a double (core) line for disputed, solid shown.
    expect(map.querySelector('.strand.s-unshown')?.getAttribute('stroke-dasharray')).toBe('7 5');
    expect(map.querySelector('.strand.s-disputed + .strand-core')).not.toBeNull();
    expect(map.querySelector('.strand.s-shown')?.getAttribute('stroke-dasharray')).toBe('none');
    // Every link carries its sentence, led by its certainty glyph.
    const labels = [...map.querySelectorAll('.elab text')].map(t => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['✓ owns 100% since 2016', '? signs for', '✕ emailed about filing · 2 Nov 2018']));
    // The ended directorship says so, once the window passes its end.
    await waitFor(() => expect(labels.concat([...map.querySelectorAll('.elab text')].map(t => t.textContent))).toContain('✓ director · ended Jul 2017'));
    // The flag badge gives the level in words with the count.
    expect(map.textContent).toContain('TEXTBOOK · 2');
    expect(screen.getByLabelText('Key').textContent).toMatch(/How sure.*always on.*shown.*not yet shown.*disputed.*worked out by the app.*ended, drawn faint/);
    expect(document.querySelector('.tw-counts')?.textContent).toBe('Showing all 4 links · 1 ended, drawn faint · 1 undated, always shown');
  });

  it('shows the active filters as chips that clear', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    // Calm: the Wire goes straight down to the most-flagged party, with no flight.
    const chip = await screen.findByRole('button', {name: 'Clear: Around Kestrel SA'});
    const end = document.querySelectorAll<SVGGElement>('.tw-tsvg .handle')[1];
    fireEvent.keyDown(end, {key: 'ArrowLeft'});
    await waitFor(() => expect(document.querySelector('.tw-active')?.textContent).toMatch(/Dates .* – .*Clear all/));
    expect(document.querySelector('.tw-counts')?.textContent).toMatch(/^Showing \d of 4 links in this window/);
    fireEvent.click(chip);
    await waitFor(() => expect(screen.queryByRole('button', {name: 'Clear: Around Kestrel SA'})).toBeNull());
    fireEvent.click(screen.getByRole('button', {name: /^Clear: Dates/}));
    await waitFor(() => expect(document.querySelector('.tw-active')?.textContent).toBe(''));
  });

  it('steps through the labelled links with J / K and opens one with Enter', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('button', {name: 'Clear: Around Kestrel SA'});
    await waitFor(() => expect([...document.querySelectorAll<SVGGElement>('.elab')].some(g => g.style.display !== 'none')).toBe(true));
    // The calm descent to the party can still be redrawing the links: press J until one stays lit.
    await waitFor(() => {
      if (!document.querySelector('.elab.lit')) fireEvent.keyDown(window, {key: 'j'});
      expect(document.querySelector('.elab.lit')).not.toBeNull();
    });
    expect(document.querySelector('.tw-tip')?.textContent).toMatch(/Enter opens every record on this link/);
    fireEvent.keyDown(window, {key: 'Enter'});
    await waitFor(() => expect(document.querySelector('.tw-alttitle')?.textContent).toBe('one link, opened'));
  });
});
