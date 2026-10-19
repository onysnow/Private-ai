// @vitest-environment jsdom
// Learn › Practise (research Knowledge §6; features/knowledge/practise-screen.tsx): "⟲ Practise · n due" opens the
// flip cards on the case's areas; the front is the sign as a scene, Space turns it, the back has the name, the levels,
// "Could be innocent" and the source; 1 / 2 answer Again / Good (1–4 with Hard / Easy on); Again comes round again;
// "Nothing due. Next in … · Practise anyway"; an empty deck says how to add a card; Esc leaves; ＋ Flip card on the
// indicator page keeps the indicator.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import LearnPage from '../app/learn/page';
import {firstSentence, untilWords} from '../features/knowledge/practise-data';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/learn', useSearchParams: () => new URLSearchParams()}));

const LADDER = [1, 3, 7, 14, 30, 60, 120];
const area = (key: string, name: string, indicators: number) => ({key, name, scope: '', summary: '', indicators, verified: indicators, terms: 3});
const areas = [area('BO', 'Hidden ownership and shell companies', 2), area('SA', 'Safety of investigators', 1)];
const row = (id: string, name: string) => ({id, name, area: id.slice(0, 2), checkable: 'lookups', status: 'verified', levels_set: ['strong'], rule: false});
const rows = {BO: [row('BO-001', 'Circular ownership'), row('BO-007', "Mass-registration address, or 'company factory'")], SA: [row('SA-001', 'Threats to the reporter')]};
const detail = (id: string, name: string, definition: string) => ({
  id, name, definition, areas: [id.slice(0, 2)], area_name: areas.find(a => a.key === id.slice(0, 2))!.name, typology: null, status: 'verified',
  sources: [{title: 'Annex E', publisher: 'FATF/Egmont', year: '2018', url: 'https://example.test/fatf', locator: 'p. 185', quote: 'Address of mass registration', quote_verified: true, licence: null, checked: null}],
  examples: ['Over 208,000 UK companies at company-factory addresses'], cases: [], data_needed: [], checkable: 'lookups', lookup_sources: ['OpenCorporates'],
  levels: {faint: 'To be set by Ony', strong: 'More than 100 companies at one address', textbook: 'More than 1,000 companies at one address', threshold_source: 'none', threshold_note: null},
  threshold_verified: false, cross_hints: [], innocent_explanations: ['Accountants host many registered offices', 'Virtual offices'], jurisdictions: 'UK', version: 1,
});
const details = {
  'BO-001': detail('BO-001', 'Circular ownership', 'Companies own each other in a loop. The loop hides who is at the top.'),
  'BO-007': detail('BO-007', "Mass-registration address, or 'company factory'", 'A company’s registered address is shared with 212 other companies. It is often an agent’s office.'),
  'SA-001': detail('SA-001', 'Threats to the reporter', 'Someone threatens the reporter.'),
};
const redFlags = {investigation_id: 'inv-1', rules: [], cannot_run: [], flags: [], gone: [],
  investigation_type: {set_by: 'reporter', areas: [{key: 'BO', name: 'Hidden ownership and shell companies', reasons: []}], suggested: []}};
const glossaryEntry = {term: 'Nominee director', definition: 'A director who acts on someone else’s instructions.', examples: ['Signs papers for a fee'],
  source_url: 'https://www.example.test/nominee', cases: [], related: [], indicators: [], areas: ['BO'], definitions: []};

type Card = {id: string; kind: 'indicator' | 'term'; ref: string; name: string; areas: string[]; added_from: string; step: number; interval_days: number;
  due_at: string; due: boolean; last_answer: 'again' | 'hard' | 'good' | 'easy' | null; last_reviewed_at: string | null; reviews: number; lapses: number;
  created_at: string; next_days: {again: number; hard: number; good: number; easy: number}};
const nextDays = (step: number) => ({again: 0, hard: LADDER[Math.max(step - 1, 0)], good: LADDER[Math.min(step, 6)], easy: LADDER[Math.min(step + 1, 6)]});
const card = (id: string, kind: Card['kind'], ref: string, name: string, cardAreas: string[]): Card => ({
  id, kind, ref, name, areas: cardAreas, added_from: 'flip_card', step: 0, interval_days: 0, due_at: '2026-10-19T08:00:00', due: true, last_answer: null,
  last_reviewed_at: null, reviews: 0, lapses: 0, created_at: '2026-10-19T08:00:00', next_days: nextDays(0)});

/** A small server: the reporter's cards, answered on the ladder. */
function learningServer(initial: Card[]) {
  const cards = initial.map(c => ({...c}));
  const inDeck = (c: Card, url: URL) => {
    const deck = url.searchParams.get('deck') ?? 'all';
    const caseAreas = (url.searchParams.get('areas') ?? '').split(',').filter(Boolean);
    if (deck === 'case') return c.areas.some(a => caseAreas.includes(a));
    if (deck === 'terms') return c.kind === 'term';
    if (deck === 'safety') return c.areas.includes('SA');
    if (deck === 'area') return c.areas.includes(url.searchParams.get('area') ?? '');
    return true;
  };
  const counts = (list: Card[], deck: string, a: string | null = null) => ({deck, area: a, total: list.length, due: list.filter(c => c.due).length,
    next_due_at: list.filter(c => !c.due).map(c => c.due_at).sort()[0] ?? null});
  return {
    cards,
    routes: {
      'GET /api/learning/summary': ({url}: RouteCall) => {
        const caseAreas = (url.searchParams.get('areas') ?? '').split(',').filter(Boolean);
        const all = counts(cards, 'all');
        return {total: all.total, due: all.due, next_due_at: all.next_due_at, ladder_days: LADDER,
          decks: [all, counts(cards.filter(c => c.areas.some(a => caseAreas.includes(a))), 'case'), counts(cards.filter(c => c.kind === 'term'), 'terms'),
            counts(cards.filter(c => c.areas.includes('SA')), 'safety')],
          areas: [...new Set(cards.flatMap(c => c.areas))].sort().map(a => counts(cards.filter(c => c.areas.includes(a)), 'area', a))};
      },
      'GET /api/learning/cards': ({url}: RouteCall) => {
        const ref = url.searchParams.get('ref');
        const mine = cards.filter(c => inDeck(c, url) && (!ref || c.ref === ref));
        const dueOnly = url.searchParams.get('due_only') === 'true';
        const due = mine.filter(c => c.due);
        const later = mine.filter(c => !c.due);
        return {total: mine.length, due: due.length, next_due_at: later.map(c => c.due_at).sort()[0] ?? null, cards: dueOnly ? due : [...due, ...later]};
      },
      'POST /api/learning/answers': ({body}: RouteCall) => {
        const {card_id: id, answer} = body as {card_id: string; answer: 'again' | 'hard' | 'good' | 'easy'};
        const c = cards.find(x => x.id === id)!;
        const days = c.next_days[answer];
        c.step = answer === 'again' ? 0 : answer === 'hard' ? c.step : c.step + (answer === 'easy' ? 2 : 1);
        Object.assign(c, {interval_days: days, due: days === 0, due_at: days === 0 ? '2026-10-19T08:00:00' : new Date(Date.now() + days * 86400000).toISOString(),
          last_answer: answer, reviews: c.reviews + 1, next_days: nextDays(c.step)});
        return {...c};
      },
      'POST /api/learning/cards': ({body}: RouteCall) => {
        const {ref} = body as {kind: string; ref: string};
        const made = card(`c-${ref}`, 'indicator', ref, details[ref as keyof typeof details].name, [ref.slice(0, 2)]);
        cards.push(made);
        return made;
      },
    },
  };
}

function baseRoutes() {
  return {
    'GET /api/catalogue/areas': areas,
    'GET /api/catalogue/map': {areas: [], cross_hints: []},
    'GET /api/catalogue/indicators': ({url}: RouteCall) => {
      const list = rows[(url.searchParams.get('area') ?? 'BO') as keyof typeof rows] ?? [];
      return {total: list.length, indicators: list};
    },
    'GET /api/catalogue/glossary': {total: 2116, terms: []},
    'GET /api/catalogue/glossary/entry': glossaryEntry,
    'GET /api/catalogue/terms': [],
    'GET /api/investigations/inv-1/red-flags': redFlags,
    'GET /api/investigations': [{id: 'inv-1', name: 'Harbour land', description: null, created_at: '2026-10-01T00:00:00Z', is_demo: false}],
    ...Object.fromEntries(Object.entries(details).map(([id, d]) => [`GET /api/catalogue/indicators/${id}`, d])),
  };
}

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: '', investigationName: ''});
  window.localStorage.clear();
  window.history.replaceState(null, '', '/learn?inv=inv-1&area=BO&indicator=BO-007');
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const space = () => act(() => { fireEvent.keyDown(window, {key: ' '}); });
const key = (k: string) => act(() => { fireEvent.keyDown(window, {key: k}); });

describe('Learn › Practise', () => {
  it('opens on the case’s areas, turns with Space, answers with keys and ends with “Nothing due”', async () => {
    const server = learningServer([card('c1', 'indicator', 'BO-007', details['BO-007'].name, ['BO']), card('c2', 'indicator', 'BO-001', 'Circular ownership', ['BO']),
      card('c3', 'indicator', 'SA-001', 'Threats to the reporter', ['SA'])]);
    const api = mockApi({...baseRoutes(), ...server.routes});
    render(<LearnPage/>);
    const door = await screen.findByRole('button', {name: 'Practise · 3 due'});
    await userEvent.setup().click(door);

    const practise = await screen.findByRole('region', {name: 'Practise: My case’s areas'});
    expect(window.location.search).toContain('tab=practise');
    expect(window.location.search).toContain('deck=case');
    expect(api.lastUrl('GET /api/learning/cards').searchParams.get('areas')).toBe('BO');
    expect(screen.getByRole('button', {name: 'My case’s areas, 2 due of 2'})).toHaveAttribute('aria-pressed', 'true');
    // The front: the sign as a short scene (its first sentence), not its name.
    expect(await within(practise).findByText('A company’s registered address is shared with 212 other companies.')).toBeInTheDocument();
    expect(practise).toHaveTextContent('card 1 of 2');
    const flip = within(practise).getByRole('group', {name: 'Card 1 of 2'});
    expect(within(flip).getByText("Mass-registration address, or 'company factory'").closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
    // Answer keys do nothing before the card is turned.
    key('2');
    expect(api.calls('POST /api/learning/answers')).toHaveLength(0);
    space();
    const turned = within(practise).getByRole('group', {name: "Mass-registration address, or 'company factory', turned"});
    expect(turned).toHaveClass('flipped');
    const levels = within(turned).getByRole('list', {name: 'Levels'});
    expect(within(levels).getAllByRole('listitem')[0]).toHaveTextContent('not set');
    expect(turned).toHaveTextContent('✓ Could be innocent');
    expect(turned).toHaveTextContent('Accountants host many registered offices');
    expect(turned).toHaveTextContent('FATF/Egmont 2018 · p. 185 · ✓ quote confirmed');
    // Again / Good, each saying when the card comes back.
    expect(within(practise).getByRole('button', {name: 'Again, back in this sitting, key 1'})).toBeInTheDocument();
    expect(within(practise).getByRole('button', {name: 'Good, back in 1 day, key 2'})).toBeInTheDocument();
    expect(within(practise).queryByRole('button', {name: /^Hard/})).toBeNull();

    key('2');
    await waitFor(() => expect(api.calls('POST /api/learning/answers')).toHaveLength(1));
    expect(api.calls('POST /api/learning/answers')[0].body).toEqual({card_id: 'c1', answer: 'good'});
    expect(await within(practise).findByText('Companies own each other in a loop.')).toBeInTheDocument();
    expect(practise).toHaveTextContent('card 2 of 2 · 1 answered');
    space();
    await userEvent.setup().click(within(practise).getByRole('button', {name: /^Good/}));

    expect(await within(practise).findByText(/Nothing due\. Next in 1 day/)).toBeInTheDocument();
    expect(practise).toHaveTextContent('2 answered.');
    await userEvent.setup().click(within(practise).getByRole('button', {name: 'Practise anyway'}));
    await waitFor(() => expect(api.lastUrl('GET /api/learning/cards').searchParams.get('due_only')).toBe('false'));
    expect(await within(practise).findByRole('group', {name: 'Card 1 of 2'})).toBeInTheDocument();
    expect(practise).toHaveTextContent('practising anyway');

    // Esc leaves for the catalogue, and the address forgets Practise.
    key('Escape');
    expect(await screen.findByRole('button', {name: /^Practise · \d due$/})).toBeInTheDocument();
    expect(window.location.search).not.toContain('tab=practise');
  });

  it('asks how to add a card when a deck is empty, and practises terms front to back', async () => {
    const server = learningServer([card('t1', 'term', 'Nominee director', 'Nominee director', ['BO'])]);
    mockApi({...baseRoutes(), ...server.routes});
    window.history.replaceState(null, '', '/learn?inv=inv-1&tab=practise&deck=safety');
    render(<LearnPage/>);
    const practise = await screen.findByRole('region', {name: 'Practise: Safety'});
    expect(await within(practise).findByText(/Open a term and press/)).toHaveTextContent('Open a term and press ＋ Flip card.');

    await userEvent.setup().click(screen.getByRole('button', {name: 'Terms I opened, 1 due of 1'}));
    const terms = await screen.findByRole('region', {name: 'Practise: Terms I opened'});
    expect(window.location.search).toContain('deck=terms');
    expect(await within(terms).findByText('A director who acts on someone else’s instructions.')).toBeInTheDocument();
    space();
    const back = within(terms).getByRole('group', {name: 'Nominee director, turned'});
    expect(back).toHaveTextContent('Term · BO');
    expect(back).toHaveTextContent('Source: example.test');
  });

  it('shows Hard and Easy behind the setting, keys 1–4, and brings an Again card round again', async () => {
    const server = learningServer([card('c1', 'indicator', 'BO-007', details['BO-007'].name, ['BO'])]);
    const api = mockApi({...baseRoutes(), ...server.routes});
    window.history.replaceState(null, '', '/learn?tab=practise&deck=all');
    render(<LearnPage/>);
    const practise = await screen.findByRole('region', {name: 'Practise: All my cards'});
    // No case open: its deck says so instead of opening empty.
    expect(screen.getByRole('button', {name: /^My case’s areas/})).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('checkbox', {name: 'Hard / Easy too'}));
    expect(window.localStorage.getItem('pai:practise-four-answers')).toBe('1');
    await within(practise).findByText(/registered address is shared/);
    space();
    expect(within(practise).getAllByRole('button', {name: /key \d$/}).map(b => b.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['1 Again now', '2 Hard 1 day', '3 Good 1 day', '4 Easy 3 days']);
    key('1');
    await waitFor(() => expect(api.calls('POST /api/learning/answers')).toHaveLength(1));
    // Again: the same card comes round again at the end of the sitting.
    expect(await within(practise).findByRole('group', {name: 'Card 2 of 2'})).toBeInTheDocument();
    space();
    key('4');
    await waitFor(() => expect(api.calls('POST /api/learning/answers')).toHaveLength(2));
    expect(api.calls('POST /api/learning/answers')[1].body).toEqual({card_id: 'c1', answer: 'easy'});
    expect(await within(practise).findByText(/Nothing due\. Next in 3 days/)).toBeInTheDocument();
  });

  it('keeps an indicator as a flip card from its page', async () => {
    const server = learningServer([]);
    const api = mockApi({...baseRoutes(), ...server.routes});
    render(<LearnPage/>);
    const page = await screen.findByRole('region', {name: 'Indicator BO-007'});
    expect(await screen.findByRole('button', {name: 'Practise · 0 due'})).toBeInTheDocument();
    await userEvent.setup().click(await within(page).findByRole('button', {name: '＋ Flip card'}));
    await waitFor(() => expect(api.calls('POST /api/learning/cards')).toHaveLength(1));
    expect(api.calls('POST /api/learning/cards')[0].body).toEqual({kind: 'indicator', ref: 'BO-007'});
    expect((await within(page).findByText(/✓ Flip card/)).closest('[role="status"]')).toHaveTextContent('✓ Flip card kept, due now in Practise');
    expect(await screen.findByRole('button', {name: 'Practise · 1 due'})).toBeInTheDocument();
  });
});

describe('practise words', () => {
  it('takes the first sentence without stopping at an abbreviation, and says how long until a time', () => {
    expect(firstSentence('Shares held e.g. by a nominee. Then more.')).toBe('Shares held e.g. by a nominee.');
    expect(firstSentence('No full stop')).toBe('No full stop');
    const now = new Date('2026-10-19T00:00:00Z');
    expect(untilWords('2026-10-21T00:00:00', now)).toBe('in 2 days');
    expect(untilWords('2026-10-19T05:00:00Z', now)).toBe('in 5 hours');
    expect(untilWords('2026-10-19T00:00:30Z', now)).toBe('in a minute');
  });
});
