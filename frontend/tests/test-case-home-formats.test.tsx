// @vitest-environment jsdom
// The Case home's formats (features/case-home/formats.tsx; research §03 D1, §04.11 "Format"): Editorial, Desk and
// Story lay out the same parts as the Board; the top band stays; 1–4, J / K and Enter work in each; a theme suggests
// a format but never chooses it.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AppearancePanel} from '../features/appearance/appearance-panel';
import {CaseHome} from '../features/case-home/case-home';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {APPEARANCE_BOOT_SCRIPT, keepAppearance, keptAppearance, SUGGESTED_FORMAT} from '../lib/theme';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const INV = {id: 'inv-1', name: 'Kestrel SA', description: null, question: 'Who really owns the harbour land?', is_demo: false, type_areas: null, ai_run_profile: null, created_at: '2026-10-01T00:00:00'};

const standing = {
  investigation_id: 'inv-1', claims: {total: 22, supported: 11, disputed: 3, unshown: 8, ruled_out: 0}, to_check: 1, missing: 0, to_decide: 1,
  to_decide_by_kind: {to_check: 1}, money: {currency: 'EUR', amount: 29400, payments: 3, from_sources: 1, other_currencies: []},
  timeline: {events: 46, from: '2016', to: '2023', years: [{year: '2016', events: 4}, {year: '2017', events: 9}]},
  documents: {total: 14, unread: 2, failed: 0}, sources: 5, evidence: 9, network: {parties: 31, links: 46},
  flags: {open: 1, textbook: 1, strong: 0, faint: 0}, leads: {open: 2}, watchlist: {names: 1, new_hits: 0},
};

const checkItem = {
  kind: 'to_check', id: 'chk-1', question: 'Does page 4 show that the harbour parcel was bought on behalf of Fernhill Ltd?',
  proposal: 'Circular ownership: a passage that may show it', actor: 'Red Flags', actor_kind: 'app', created_at: '2026-10-09T10:00:00', rank: 320,
  reason: 'From the Textbook Red Flag Circular ownership', level: 'textbook', group: {key: 'doc:d1', label: 'minutes.pdf'},
  evidence: {document_id: 'd1', filename: 'minutes.pdf', locator: 'p. 4', excerpt: 'settled through a nominee arrangement acting on behalf of F. Ltd', terms: ['nominee arrangement', 'on behalf of']},
  parties: [{id: 'e1', name: 'Fernhill Ltd', schema: 'Company'}], consequences: ['Kept on the flag.'],
  choices: [
    {key: 'yes', label: 'Shows it', method: 'POST', path: '/api/checks/chk-1/decide', body: {status: 'shows'}},
    {key: 'no', label: 'Does not', method: 'POST', path: '/api/checks/chk-1/decide', body: {status: 'does_not'}},
    {key: 'unsure', label: 'Unclear', method: 'POST', path: '/api/checks/chk-1/decide', body: {status: 'unclear'}},
  ],
  open: {href: '/check#to-check', label: 'Open To check'},
};

const claim = (id: string, text: string, created: string) => ({id, investigation_id: 'inv-1', text, status: 'disputed', confidence: 0.3, created_at: created});

function routes() {
  return mockApi({
    'GET /api/investigations/inv-1/standing': standing,
    'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {to_check: 1}, total: 1, offset: 0, items: [checkItem]},
    'GET /api/investigations/inv-1/claims': [claim('c1', 'Kestrel SA bought the harbour land in 2020.', '2026-10-01T00:00:00'),
      claim('c2', 'Fernhill Ltd paid for it.', '2026-10-05T00:00:00'), claim('c3', 'The council knew.', '2026-10-03T00:00:00')],
    'GET /api/investigations/inv-1/red-flags': {investigation_id: 'inv-1', flags: [], gone: [], rules: [], cannot_run: [], type: null},
    'GET /api/investigations/inv-1/documents': [],
    'GET /api/documents/d1/page-image': () => new Response(new Uint8Array([137, 80, 78, 71]), {headers: {'content-type': 'image/png'}}),
    'GET /api/investigations/inv-1/claim-sources': [],
    'GET /api/investigations/inv-1/graph': {nodes: [], edges: [], schemas: [], reconciliation: {hidden_duplicate_edges: 0}},
    'GET /api/investigations/inv-1/since': {investigation_id: 'inv-1', after: '2026-10-01T00:00:00', changes: []},
    'GET /api/investigations': [INV],
  });
}

const home = () => wrap(<CaseHome investigation={INV} investigations={[INV]} onSwitch={vi.fn()} loading={false}/>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', pointedParty: null, asOf: null});
  window.localStorage.clear();
  window.sessionStorage.clear();
  push.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('format setting', () => {
  it('keeps every format, and the first-paint script sets the kept one', () => {
    for (const format of ['editorial', 'desk', 'story', 'board'] as const) {
      keepAppearance({format});
      expect(keptAppearance().format).toBe(format);
      expect(document.documentElement.dataset.format).toBe(format);
    }
    window.localStorage.setItem('pai:appearance', JSON.stringify({format: 'story'}));
    delete document.documentElement.dataset.format;
    new Function(APPEARANCE_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.format).toBe('story');
    window.localStorage.setItem('pai:appearance', JSON.stringify({format: 'poster'}));
    new Function(APPEARANCE_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.format).toBe('board');
  });

  it('suggests a format for a theme without choosing it', async () => {
    routes();
    keepAppearance({theme: 'archive', format: 'story'});
    wrap(<AppearancePanel/>);
    const group = screen.getByRole('radiogroup', {name: /^Format/});
    const desk = await within(group).findByRole('radio', {name: /^Desk: .*Suggested for Archive\./});
    expect(desk).toHaveTextContent('Suggested for Archive');
    expect(desk).toHaveTextContent('corkboard of evidence');
    expect(within(group).getByRole('radio', {name: /^Story/})).toHaveAttribute('aria-checked', 'true');
    expect(keptAppearance().format).toBe('story');
    expect(SUGGESTED_FORMAT).toEqual({'rain-noir': 'board', archive: 'desk'});
    // Arrows move between the tiles; Enter chooses.
    within(group).getByRole('radio', {name: /^Story/}).focus();
    fireEvent.keyDown(group, {key: 'ArrowLeft'});
    expect(desk).toHaveFocus();
    await userEvent.setup().keyboard('{Enter}');
    expect(keptAppearance().format).toBe('desk');
    await waitFor(() => expect(desk).toHaveAttribute('aria-checked', 'true'));
    expect(within(group).queryAllByRole('radio').every(r => !(r as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('Board', () => {
  it('opens a focused module whole-screen with Enter', async () => {
    routes();
    home();
    const check = await screen.findByRole('region', {name: 'Check'});
    fireEvent.keyDown(window, {key: '2'});
    expect(check).toHaveFocus();
    fireEvent.keyDown(check, {key: 'Enter'});
    expect(push).toHaveBeenCalledWith('/check?inv=inv-1#claim-verification');
  });
});

describe('Editorial', () => {
  it('lists the parts as big words; pointing previews one, 1–4 bring one forward, Enter on a word opens it', async () => {
    routes();
    keepAppearance({format: 'editorial'});
    home();
    // The top band stays where it is.
    expect(screen.getByRole('heading', {name: 'Kestrel SA', level: 1})).toBeInTheDocument();
    const words = await screen.findByRole('navigation', {name: /^Case home: point at a word/});
    const links = within(words).getAllByRole('link');
    expect(links.map(l => l.querySelector('.fm-word-name')?.textContent)).toEqual(['Next up', 'Bring in', 'Check', 'See', 'Act']);
    expect(links[2]).toHaveAttribute('href', '/check?inv=inv-1#claim-verification');
    await within(words).findByText('22 claims');
    expect(within(words).getByText('1 to decide')).toBeInTheDocument();
    // Next up is shown first, with its keys on.
    expect(await screen.findByTestId('decision-card')).toBeInTheDocument();
    expect(screen.getByRole('region', {name: 'Next up, previewed'})).toBeInTheDocument();
    fireEvent.mouseEnter(links[2]);
    const stage = await screen.findByRole('region', {name: 'Check, previewed'});
    expect(within(stage).getByRole('region', {name: 'Check'})).toBeInTheDocument();
    expect(screen.queryByTestId('decision-card')).toBeNull();
    // 4 brings Act forward and focuses it.
    fireEvent.keyDown(window, {key: '4'});
    await waitFor(() => expect(screen.getByRole('region', {name: 'Act · Red Flags'})).toHaveFocus());
    expect(links[4]).toHaveAttribute('aria-current', 'true');
    // ↓ moves along the words and previews each.
    links[0].focus();
    fireEvent.keyDown(links[0], {key: 'ArrowDown'});
    expect(links[1]).toHaveFocus();
    expect(screen.getByRole('region', {name: 'Bring in, previewed'})).toBeInTheDocument();
  });
});

describe('Desk', () => {
  it('pins the parts as cut-outs with date labels; one opens as a calm card and Esc puts it back', async () => {
    routes();
    keepAppearance({format: 'desk'});
    home();
    const open = await screen.findByRole('button', {name: 'Open Check as a card, claim added 5 Oct 2026'});
    expect(await screen.findByRole('button', {name: 'Open Next up as a card, waiting since 9 Oct 2026'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Open See as a card, records 2016–2023'})).toBeInTheDocument();
    // Cut-outs are pictures: their insides take no keys and no focus.
    expect(document.querySelector('[data-part="check"] .fm-cut-body')).toHaveAttribute('inert');
    await userEvent.setup().click(open);
    const card = screen.getByRole('region', {name: 'Check, open on the desk'});
    const check = within(card).getByRole('region', {name: 'Check'});
    await waitFor(() => expect(check).toHaveFocus());
    await within(check).findByLabelText('Claims: 1 of 3');
    fireEvent.keyDown(window, {key: 'j'});
    expect(within(check).getByLabelText('Claims: 2 of 3')).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(screen.queryByRole('region', {name: 'Check, open on the desk'})).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', {name: /^Open Check as a card/})).toHaveFocus());
    // 1 opens Bring in as the card.
    fireEvent.keyDown(window, {key: '1'});
    expect(await screen.findByRole('region', {name: 'Bring in, open on the desk'})).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('region', {name: 'Bring in'}).find(r => !r.closest('[inert]'))).toHaveFocus());
    await userEvent.setup().click(screen.getByRole('button', {name: /Back to the desk/}));
    expect(screen.queryByRole('region', {name: /open on the desk/})).toBeNull();
  });

  it('keeps Next up’s answer keys off while it is only a cut-out', async () => {
    routes();
    keepAppearance({format: 'desk'});
    home();
    await screen.findByRole('button', {name: /^Open Next up as a card/});
    const card = await screen.findByTestId('decision-card');
    expect(card.closest('[inert]')).not.toBeNull();
  });
});

describe('Story', () => {
  it('lays the parts out as chapters with how far through you are; the wheel moves chapters, not modules', async () => {
    routes();
    keepAppearance({format: 'story'});
    home();
    const chapters = await screen.findAllByRole('region', {name: /^Chapter \d of 5: /});
    expect(chapters.map(c => c.getAttribute('aria-label'))).toEqual(['Chapter 1 of 5: Next up', 'Chapter 2 of 5: Bring in', 'Chapter 3 of 5: Check', 'Chapter 4 of 5: See', 'Chapter 5 of 5: Act']);
    expect(screen.getByRole('progressbar', {name: 'How far through the case home'})).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0% through')).toBeInTheDocument();
    const scroller = document.querySelector<HTMLElement>('.fm-chapters')!;
    Object.defineProperty(scroller, 'scrollHeight', {configurable: true, value: 2000});
    Object.defineProperty(scroller, 'clientHeight', {configurable: true, value: 400});
    act(() => { scroller.scrollTop = 800; fireEvent.scroll(scroller); });
    expect(screen.getByText('50% through')).toBeInTheDocument();
    expect(screen.getByText(/3 of 5 · Check/)).toBeInTheDocument();
    // Every module is there to work with: 2 focuses Check, J steps in it; the wheel over it does not.
    const check = within(chapters[2]).getByRole('region', {name: 'Check'});
    fireEvent.keyDown(window, {key: '2'});
    expect(check).toHaveFocus();
    await within(check).findByLabelText('Claims: 1 of 3');
    const list = check.querySelector('.ch-list')!;
    fireEvent.pointerEnter(list);
    await new Promise(r => setTimeout(r, 260));
    fireEvent.wheel(list, {deltaY: 120});
    expect(within(check).getByLabelText('Claims: 1 of 3')).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'j'});
    expect(within(check).getByLabelText('Claims: 2 of 3')).toBeInTheDocument();
  });
});
