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
    expect(document.querySelector('.tw-counts')?.textContent).toMatch(/^Showing all 4 links · 1 ended, drawn faint · 1 undated, always shown/);
  });

  it('shows the active filters as chips that clear', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    // Around a party, from the switch: Calm goes straight there, with no flight.
    fireEvent.click(await screen.findByRole('radio', {name: 'Around a party'}));
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
    fireEvent.click(await screen.findByRole('radio', {name: 'Around a party'}));
    await screen.findByRole('button', {name: 'Clear: Around Kestrel SA'});
    await waitFor(() => expect([...document.querySelectorAll<SVGGElement>('.elab')].some(g => g.style.display !== 'none')).toBe(true));
    fireEvent.keyDown(window, {key: 'j'});
    const lit = document.querySelector('.elab.lit');
    expect(lit).not.toBeNull();
    expect(document.querySelector('.tw-tip')?.textContent).toMatch(/Enter opens every record on this link/);
    // J / K open the link in the detail panel too ("Link · 1 of n").
    expect((await screen.findByRole('complementary', {name: 'The link'})).textContent).toMatch(/Link · 1 of \d/);
    fireEvent.keyDown(window, {key: 'Enter'});
    await waitFor(() => expect(document.querySelector('.tw-alttitle')?.textContent).toBe('one link, opened'));
    expect(screen.queryByRole('complementary', {name: 'The link'})).toBeNull();
  });

  it('offers five arrangements, says why one was chosen, previews one while pointed at and keeps one when clicked', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    mockApi({'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const group = await screen.findByRole('radiogroup', {name: 'Arrangement'});
    expect([...group.querySelectorAll('[role=radio]')].map(b => b.textContent)).toEqual(['Who controls whom', 'Around a party', 'By kind', 'Linked groups', 'Grid']);
    // Two of the four links say who owns or directs whom: the shared rule picks control and says so.
    await waitFor(() => expect(screen.getByRole('radio', {name: 'Who controls whom'})).toHaveAttribute('aria-checked', 'true'));
    expect(document.querySelector('.tw-chosen')?.textContent).toBe('Chosen because 2 of the 4 links here say who owns or directs whom.');
    // Its guides are labelled like SEE_1's levels.
    expect(document.querySelector('.tw-sec')?.textContent).toMatch(/Top of the chain/);
    // Pointing at By kind previews it, faded; leaving brings control back.
    const root = document.querySelector('.tw')!;
    fireEvent.mouseEnter(screen.getByRole('radio', {name: 'By kind'}));
    await vi.advanceTimersByTimeAsync(200);
    expect(root.classList.contains('tw-peeking')).toBe(true);
    expect(document.querySelector('.tw-chosen')?.textContent).toMatch(/^Preview: By kind/);
    expect(screen.getByRole('radio', {name: 'Who controls whom'})).toHaveAttribute('aria-checked', 'true');
    fireEvent.mouseLeave(group);
    expect(root.classList.contains('tw-peeking')).toBe(false);
    expect(document.querySelector('.tw-sec')?.textContent).toMatch(/Top of the chain/);
    // Scrolling over the switch steps the preview.
    fireEvent.wheel(group, {deltaY: 100});
    expect(screen.getByRole('radio', {name: 'Around a party'}).classList.contains('peek')).toBe(true);
    fireEvent.mouseLeave(group);
    // Clicked, it stays, and the line gives that arrangement's rule.
    fireEvent.click(screen.getByRole('radio', {name: 'By kind'}));
    expect(screen.getByRole('radio', {name: 'By kind'})).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelector('.tw-chosen')?.textContent).toMatch(/^Arranged by kind:/);
    expect(document.querySelector('.tw-sec')?.textContent).toMatch(/People.*Companies|Companies.*People/);
    // Arrow keys move along the radio group; Grid draws the same links as a matrix.
    fireEvent.keyDown(screen.getByRole('radio', {name: 'By kind'}), {key: 'End'});
    expect(await screen.findByLabelText('Grid: one row and one column per party')).toBeInTheDocument();
    expect(screen.getByRole('radio', {name: 'Grid'})).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', {name: 'Linked groups'}));
    await waitFor(() => expect(screen.queryByLabelText('Grid: one row and one column per party')).toBeNull());
    vi.useRealTimers();
  });

  it('draws a link the app worked out dotted with ƒ, and its panel says which rule and links it came from', async () => {
    const worked = {...SEE1, worked_out: [{id: 'worked:l:f', s: 'l', t: 'f', schema: 'Ownership', fam: 'owns', pct: '', share_unknown_because: 'the ownership runs in a circle, so the shares cannot be added up',
      rule: 'indirect_ownership', rule_name: 'Indirect ownership', rule_text: 'The percentages multiplied along each path.', inputs: ['o1'], paths: 1, steps: 2, via: ['k'], flag_id: null}]};
    mockApi({'GET /api/investigations/inv-1/wire': worked, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH,
      'GET /api/investigations/inv-1/paths': {from_id: 'l', to_id: 'k', max_len: 4, total: 0, truncated: false, chains: []}});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    await waitFor(() => expect(map.querySelector('.strand.s-worked')).not.toBeNull());
    expect(map.querySelector('.strand.s-worked')?.getAttribute('stroke-dasharray')).toBe('1.5 4');
    const label = [...map.querySelectorAll<SVGGElement>('.elab.s-worked')][0];
    expect(label.querySelector('text')?.textContent).toBe('ƒ owns a share not known · worked out');
    expect(document.querySelector('.tw-counts')?.textContent).toMatch(/1 worked out by the app \(ƒ\), never stored/);
    fireEvent.click(label);
    const panel = await screen.findByRole('complementary', {name: 'The link'});
    expect(panel.textContent).toMatch(/Worked out by the app/);
    expect(panel.textContent).toMatch(/ƒ Worked out by the app never stored as a reviewed fact/);
    expect(panel.textContent).toMatch(/from the rule Indirect ownership/);
    expect(panel.textContent).toMatch(/The share is not known: the ownership runs in a circle/);
    expect(screen.getByRole('button', {name: 'Loop Two BV owns 100% Kestrel SA'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Open the source'})).toBeNull();
    // How is Loop Two linked to the case's subject: no chain of up to 4, try 6.
    expect(await screen.findByText(/No chain of up to 4 links joins them/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Try 6'})).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(screen.queryByRole('complementary', {name: 'The link'})).toBeNull());
  });

  it('opens a link in the panel with the page and the words lit, its sources, its Red Flag and how two parties are linked', async () => {
    vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: vi.fn(() => 'blob:page'), revokeObjectURL: vi.fn()}));
    const quote = {doc: 'Luxembourg business register', loc: 'RCS B204417 p.1', q: 'Harbour Nominees Ltd appointed director', evidence_id: 'ev-1', document_id: 'doc-1', page: 2, pdf: true};
    const flag = {flag_id: 'f9', id: 'BO-001', level: 'textbook', name: 'Circular ownership', text: '', path: 'Kestrel SA → Loop Two BV → Kestrel SA', innocent: 'Group cross-holdings'};
    const data = {...SEE1, links: SEE1.links.map(l => (l.id === 'o1' ? {...l, ev: [quote], flags: [flag]} : l))};
    const api = mockApi({'GET /api/investigations/inv-1/wire': data, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH,
      'GET /api/documents/doc-1/page-image': 'png',
      'GET /api/investigations/inv-1/paths': {from_id: 'l', to_id: 'k', max_len: 4, total: 2, truncated: false, chains: [
        {parties: [{id: 'l', name: 'Loop Two BV'}, {id: 'r', name: 'M. Ross'}, {id: 'k', name: 'Kestrel SA'}],
          links: [{id: 'x9', schema: 'UnknownLink', from: 'r', to: 'l', certainty: 'supported'}, {id: 'u1', schema: 'UnknownLink', from: 'r', to: 'k', certainty: 'unsupported'}], weakest: 'unsupported'},
        {parties: [{id: 'l', name: 'Loop Two BV'}, {id: 'k', name: 'Kestrel SA'}], links: [{id: 'o1', schema: 'Ownership', from: 'l', to: 'k', certainty: 'supported'}], weakest: 'supported'},
      ]},
      'GET /api/investigations/inv-1/checks': {investigation_id: 'inv-1', items: [], gone: [], missing: []},
      'POST /api/relationships/u1/to-check': {investigation_id: 'inv-1', gone: [], missing: [], items: [{id: 'c-9', indicator_id: 'link', indicator_name: 'Weak link', kind: 'link', question: 'Find a reviewed source for: M. Ross signs for Kestrel SA',
        status: 'open', note: null, decided_at: null, parties: [{id: 'r', name: 'M. Ross', schema: 'Person'}, {id: 'k', name: 'Kestrel SA', schema: 'Company'}],
        flag_id: null, related_flags: [], document: null, locator: 'UnknownLink', excerpt: null, terms: [], first_seen_at: '2026-10-10T00:00:00', gone_at: null,
        relationship_id: 'u1'}]}});
    const openDocument = vi.fn();
    const openFlag = vi.fn();
    useWorkbenchStore.setState({openDocument, openFlag});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    const owns = () => [...map.querySelectorAll('.elab')].find(g => g.querySelector('text')?.textContent === '✓ owns 100% since 2016');
    await waitFor(() => expect(owns()).toBeDefined());
    fireEvent.click(owns()!);
    const panel = await screen.findByRole('complementary', {name: 'The link'});
    expect(panel.querySelector('h2')?.textContent).toBe('Loop Two BV owns 100% of Kestrel SA, since 1 Feb 2016');
    expect(panel.textContent).toMatch(/✓ Shown/);
    expect(panel.textContent).toMatch(/1 source agrees/);
    // The page, drawn by the API with the quoted words lit.
    expect(await screen.findByRole('img', {name: 'Luxembourg business register, page 2, the quoted words lit'})).toBeInTheDocument();
    expect(api.lastUrl('GET /api/documents/doc-1/page-image').searchParams.get('highlight')).toBe('Harbour Nominees Ltd appointed director');
    expect(panel.querySelector('.tw-sources')?.textContent).toBe('Luxembourg business register · RCS B204417 p.1 · p.2');
    fireEvent.click(screen.getByRole('button', {name: 'Open the source'}));
    expect(openDocument).toHaveBeenCalledWith('doc-1', 2);
    // Its Red Flag, with the innocent explanation visible.
    expect(panel.textContent).toMatch(/Part of a Red Flag.*Circular ownership.*Could be innocent: Group cross-holdings/);
    // How is Loop Two linked to Kestrel SA: strongest chain first, "1 more chain".
    expect(await screen.findByText('Every link shown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: '1 more chain'}));
    expect(screen.getByText(/The chain breaks at “signs for”: no reviewed source yet\./)).toBeInTheDocument();
    expect(screen.getByText(/Rests on 1 unshown link/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Add to To check →'}));
    expect(await screen.findByText('Added to To check ✓')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Open To check →'})).toHaveAttribute('href', '/check?inv=inv-1#to-check');
    expect(api.calls('POST /api/relationships/u1/to-check')).toHaveLength(1);
    expect(api.calls('POST /api/relationships/u1/lead-from-context')).toHaveLength(0);
    // Pointing at a chain lights its links on the map.
    fireEvent.mouseEnter(screen.getByRole('listitem', {name: /Chain 2: Rests on 1 unshown link/}));
    expect(document.querySelector('.tw')?.classList.contains('chain-on')).toBe(true);
    expect(map.querySelector('g.chain-lit .strand.s-unshown')).not.toBeNull();
  });

  it('opens the link the address asks for (?link=, from To check or Decide) and then drops it from the address', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    document.documentElement.dataset.motion = 'calm';
    window.history.replaceState(null, '', '/see?link=o1&inv=inv-1#the-wire');
    try {
      render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
      const panel = await screen.findByRole('complementary', {name: 'The link'});
      expect(panel.querySelector('h2')?.textContent).toMatch(/^Loop Two BV owns 100% of Kestrel SA/);
      expect(window.location.search).toBe('?inv=inv-1');
      expect(window.location.hash).toBe('#the-wire');
    } finally { window.history.replaceState(null, '', '/'); }
  });

  it('draws a link that would cross the whole map as two lettered stubs; pointing at one lights both and the whole line', async () => {
    const far = {investigation_id: 'inv-1', entities: [ent('a', 'Far West Ltd', {x: 120, y: 120}), ent('b', 'Far East Ltd', {x: 2280, y: 1380}),
      ent('c', 'Middle Ltd', {x: 1200, y: 760}), ent('d', 'Near Middle Ltd', {x: 1260, y: 800})],
    links: [{id: 'p1', s: 'a', t: 'b', schema: 'Payment', fam: 'money', amount: 5000, cur: 'EUR', date: '2019-01-01', role: '', pct: '', ev: []},
      {id: 'p2', s: 'c', t: 'd', schema: 'Payment', fam: 'money', amount: 100, cur: 'EUR', date: '2019-01-02', role: '', pct: '', ev: []}], events: []};
    mockApi({'GET /api/investigations/inv-1/wire': far});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    // No link says who controls whom and every party is a company: Linked groups, the whole map.
    fireEvent.click(await screen.findByRole('radio', {name: 'Linked groups'}));
    await waitFor(() => expect([...map.querySelectorAll<SVGGElement>('.stub')].filter(g => g.style.display !== 'none')).toHaveLength(1));
    const stub = [...map.querySelectorAll<SVGGElement>('.stub')].find(g => g.style.display !== 'none')!;
    expect([...stub.querySelectorAll('text')].map(t => t.textContent)).toEqual(['A', 'A']);
    expect(stub.getAttribute('aria-label')).toMatch(/^A: Far West Ltd to Far East Ltd/);
    const line = map.querySelector('g.stubbed')!;
    expect(line.querySelector('.strand')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
    fireEvent.mouseEnter(stub);
    expect(line.classList.contains('stub-lit')).toBe(true);
    expect(stub.classList.contains('lit')).toBe(true);
    expect(line.querySelector('.ghost')?.getAttribute('d')).toMatch(/Q/);
    fireEvent.mouseLeave(stub);
    expect(line.classList.contains('stub-lit')).toBe(false);
  });
});
