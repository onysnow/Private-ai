// @vitest-environment jsdom
// The Wire (features/the-wire): the case drawn as one map. Parties and links from the
// server, the account kept on its holder's card, a party's drawer with its flags and
// the dossier link, names shown as text (never as markup), the empty case, and touch
// (a finger's pan is not a tap, no hover tips for a finger, the phone bar's Back and Next).
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {InspectorSlot} from '../features/inspector/inspector-slot';
import {TheWire, linkInfo} from '../features/the-wire/the-wire';
import {brighten, clipWords, fmtAmt, fmtDate, linkSentence} from '../features/the-wire/wire-engine';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {dossierFixture, dossierRoutes, emptyGraph, entityFixture, plainAdvisory, relationshipFixture} from '../test-support/page-routes';

// The store's own openDossier, before a test swaps in a spy.
const storeOpenDossier = useWorkbenchStore.getState().openDossier;

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

  it('cuts a long role at a word with an ellipsis, never mid-word', () => {
    expect(clipWords('Owning entity in the Cook Islands trust structure', 32)).toBe('Owning entity in the Cook…');
    expect(clipWords('Founder and chairman of the board', 32)).toBe('Founder and chairman of the…');
    expect(clipWords('Director', 32)).toBe('Director');
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
    // A flagged card's outline takes its level; the count sits in a circle on its corner, named in words.
    const kestrel = [...map.querySelectorAll('g.node')].find(g => g.classList.contains('textbook'))!;
    expect(kestrel.querySelector('.card-bg')?.getAttribute('stroke')).toBe('#FF8070');
    expect(kestrel.querySelector('.flag-dot')?.getAttribute('aria-label')).toBe('2 open Red Flags, the strongest textbook');
    expect(kestrel.querySelector('.flag-dot .flag-n')?.textContent).toBe('2');
    // The kind is the icon in the card's dot (SEE_1), not a word on the card.
    expect(kestrel.querySelector('use.kind-icon')?.getAttribute('href')).toBe('#tw-k-company');
    expect(document.getElementById('tw-k-company')?.tagName).toBe('symbol');
    expect(kestrel.querySelector('.card-s')?.textContent).not.toMatch(/COMPANY/);
    // Hovering the circle brightens the glow and shows the flags themselves.
    fireEvent.pointerEnter(kestrel.querySelector('.flag-dot')!, {pointerType: 'mouse'});
    expect(kestrel.classList.contains('flag-hot')).toBe(true);
    const tip = document.querySelector('.tw-tip')!;
    expect(tip.textContent).toContain('2 open Red Flags');
    expect(tip.textContent).toContain('Circular ownership');
    fireEvent.pointerLeave(kestrel.querySelector('.flag-dot')!);
    expect(kestrel.classList.contains('flag-hot')).toBe(false);
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

  it('opens a card on a tap, but not at the end of a finger pan that started on it', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': WIRE});
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    await waitFor(() => expect(map.querySelectorAll('g.node').length).toBe(4));
    const card = map.querySelectorAll('g.node')[0];
    const drawer = document.querySelector('.tw-drawer')!;
    const touch = {pointerType: 'touch', pointerId: 7};
    fireEvent.pointerDown(card, {...touch, clientX: 100, clientY: 100});
    fireEvent.pointerMove(card, {...touch, clientX: 160, clientY: 130});
    fireEvent.pointerUp(card, {...touch, clientX: 160, clientY: 130});
    fireEvent.click(card);
    expect(drawer.classList.contains('open')).toBe(false);
    // A tap: the finger goes down and up without moving.
    fireEvent.pointerDown(card, {...touch, clientX: 100, clientY: 100});
    fireEvent.pointerUp(card, {...touch, clientX: 100, clientY: 100});
    fireEvent.click(card);
    await waitFor(() => expect(drawer.classList.contains('open')).toBe(true));
  });

  it('shows a card\'s hover tip for the mouse, never for a finger', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': WIRE});
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    await waitFor(() => expect(map.querySelectorAll('g.node').length).toBe(4));
    const card = map.querySelectorAll('g.node')[0];
    const tip = document.querySelector('.tw-tip')!;
    fireEvent.pointerEnter(card, {pointerType: 'touch', clientX: 100, clientY: 100});
    expect(tip.classList.contains('on')).toBe(false);
    fireEvent.pointerEnter(card, {pointerType: 'mouse', clientX: 100, clientY: 100});
    expect(tip.classList.contains('on')).toBe(true);
  });

  it('has Back and Next flagged on the altitude bar, as Esc and the trail do', async () => {
    mockApi({'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('button', {name: 'Clear: Around Kestrel SA'});
    const title = document.querySelector('.tw-alttitle')!;
    const before = title.textContent;
    fireEvent.click(screen.getByRole('button', {name: '‹ Back'}));
    await waitFor(() => expect(title.textContent).toBe('the whole case'));
    expect(before).not.toBe('the whole case');
    fireEvent.click(screen.getByRole('button', {name: 'Next flagged ›'}));
    await waitFor(() => expect(title.textContent).toBe(before));
  });

  it('opens a link with its panel: the sentence, how sure, the page drawn with the words lit, its sources and its Red Flag', async () => {
    const openDocument = vi.fn();
    const openFlag = vi.fn();
    useWorkbenchStore.setState({openDocument, openFlag});
    const api = mockApi({
      'GET /api/investigations/inv-1/wire': SEE1, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH,
      'GET /api/relationships/o1/sources': {relationship_id: 'o1', flags: [{flag_id: 'f9', id: 'ML-023', level: 'textbook', text: 'Circular ownership'}], evidence: [
        {evidence_id: 'e1', quote: 'Loop Two BV holds all the shares', locator: 'p.4', source_title: 'Share register', document_id: 'd1', filename: 'register.pdf',
          page: 4, stance: 'supports', reviewed_at: '2026-10-06T10:00:00'},
        {evidence_id: 'e2', quote: 'sole shareholder', locator: '', source_title: 'Board minutes (typed)', document_id: null, filename: '', page: null, stance: null, reviewed_at: null},
      ]},
      'GET /api/documents/d1/page-image': () => new Response(new Uint8Array([137, 80, 78, 71]), {headers: {'content-type': 'image/png'}}),
    });
    document.documentElement.dataset.motion = 'calm';
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('button', {name: 'Clear: Around Kestrel SA'});
    const pill = await waitFor(() => {
      const g = [...document.querySelectorAll<SVGGElement>('.elab')].find(x => x.style.display !== 'none' && x.textContent?.includes('owns 100%'));
      expect(g).toBeTruthy();
      return g!;
    });
    fireEvent.click(pill);
    const panel = await screen.findByRole('complementary', {name: 'The link'});
    expect(panel.querySelector('h2')?.textContent).toBe('Loop Two BV owns 100% since 2016 Kestrel SA');
    expect(panel.textContent).toContain('✓ Shown');
    await waitFor(() => expect(panel.textContent).toContain('2 sources'));
    expect(api.lastUrl('GET /api/documents/d1/page-image').searchParams.get('highlight')).toBe('Loop Two BV holds all the shares');
    expect(api.lastUrl('GET /api/documents/d1/page-image').searchParams.get('crop')).toBe('true');
    expect(panel.textContent).toContain('Share register · p.4 · supports it, reviewed 6 Oct 2026');
    expect(panel.textContent).toContain('Board minutes (typed) · not reviewed yet');
    fireEvent.click(screen.getByRole('button', {name: 'Open the source'}));
    expect(openDocument).toHaveBeenCalledWith('d1', 4);
    fireEvent.click(screen.getByRole('button', {name: /Circular ownership/}));
    expect(openFlag).toHaveBeenCalledWith('f9');
    // Esc steps back up from the link: the panel goes with it.
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(screen.queryByRole('complementary', {name: 'The link'})).toBeNull());
  });

  it('arranges the whole case by who controls whom when most links are ownership or directorship, and says why', async () => {
    // Loop Two owns Kestrel, Weber runs it, Kestrel owns Fernhill: 3 of 4 links are control.
    const control = {...SEE1, links: [...SEE1.links.filter(l => l.id !== 'x1'),
      {id: 'o2', s: 'k', t: 'f', schema: 'Ownership', fam: 'owns', amount: null, cur: '', date: '', role: '', pct: '40', ev: []}]};
    mockApi({'GET /api/investigations/inv-1/wire': control, 'GET /api/investigations/inv-1/graph': SEE1_GRAPH});
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    expect(screen.getByRole('button', {name: 'Who controls whom'})).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.tw-chosen')?.textContent).toBe('Chosen because 3 of 4 links are ownership or directorship');
    const bands = () => [...map.querySelectorAll('.terr-l')].map(t => t.textContent);
    expect(bands()).toEqual(['Top of the chain', '1 step down', '2 steps down', 'In no chain of control']);
    fireEvent.click(screen.getByRole('button', {name: 'By kind'}));
    expect(screen.getByRole('button', {name: 'By kind'})).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.tw-chosen')?.textContent).toBe('By kind: your choice');
    expect(bands()).toEqual(['Company', 'Person']);
    fireEvent.click(screen.getByRole('button', {name: 'Linked groups'}));
    expect(screen.getByText(/Each patch is a group/)).toBeInTheDocument();
  });
  it('draws your tags as a ring of arcs outside a tagged party, with a key, and hides them with Your tags', async () => {
    const row = (record_id: string, name: string, colour: string, record_type = 'entity') => ({record_type, record_id, name, colour, tag_id: name});
    mockApi({'GET /api/investigations/inv-1/wire': WIRE, 'GET /api/investigations/inv-1/record-tags': {investigation_id: 'inv-1',
      rows: [row('a', 'Owner', '#7FB7E0'), row('a', 'Check again', '#E9AFA8'), row('b', 'Owner', '#7FB7E0'), row('l1', 'Owner', '#7FB7E0', 'relationship')]}});
    render(<QueryProvider><TheWire investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    await waitFor(() => expect(map.querySelectorAll('.tw-tagring').length).toBe(2));
    // Meridian carries two tags, each its own arc of the one ring.
    // Each arc is its swatch brightened, over a glowing copy.
    const ring = map.querySelectorAll('.tw-tagring')[0];
    expect(Array.from(ring.querySelectorAll('.sharp circle')).map(c => c.getAttribute('stroke'))).toEqual([brighten('#7FB7E0'), brighten('#E9AFA8')]);
    expect(ring.querySelectorAll('.glow circle')).toHaveLength(2);
    expect(brighten('#3e6181')).toBe('#9fb0c0');
    const key = screen.getByLabelText('Key');
    expect(key.textContent).toContain('Owner · 2');
    expect(key.textContent).toContain('Check again · 1');
    const toggle = screen.getByRole('button', {name: 'Your tags'});
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('The Wire').classList.contains('tw-tags-off')).toBe(true);
    expect(key.textContent).not.toContain('Owner');
  });

  it('leaves Esc to the inspector slot while a dossier is open over it, then steps back itself', async () => {
    // DECISIONS_LOG 40: the slot is the layer on top. The Wire's key handler was added first, so without the layer check
    // it would act on the same Esc (closing its drawer) before the slot took the key.
    mockApi({'GET /api/investigations/inv-1/wire': WIRE, ...dossierRoutes('a', dossierFixture(entityFixture('a', 'Meridian Holdings Ltd', 'Company')))});
    useWorkbenchStore.setState({openDossier: storeOpenDossier, inspector: []});
    if (!window.matchMedia) {
      window.matchMedia = ((query: string) => ({matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false})) as unknown as typeof window.matchMedia;
    }
    render(<QueryProvider><TheWire investigationId="inv-1"/><InspectorSlot investigationId="inv-1"/></QueryProvider>);
    const map = await screen.findByRole('img', {name: /Map of the parties/});
    await waitFor(() => expect(map.querySelectorAll('g.node').length).toBe(4));
    fireEvent.click(map.querySelectorAll('g.node')[0]);
    const drawer = document.querySelector('.tw-drawer')!;
    await waitFor(() => expect(drawer.classList.contains('open')).toBe(true));
    fireEvent.click(screen.getByRole('button', {name: 'Open the dossier'}));
    const slot = document.querySelector<HTMLElement>('aside[aria-label="Inspector"]')!;
    expect(slot).toBeVisible();

    // One Esc: the slot closes, The Wire's drawer stays open.
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(slot).not.toBeVisible();
    expect(drawer.classList.contains('open')).toBe(true);
    // The next Esc is The Wire's: its drawer closes.
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(drawer.classList.contains('open')).toBe(false);
  });
});
