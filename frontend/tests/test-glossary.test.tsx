// @vitest-environment jsdom
// Learn › Glossary (app/glossary/page.tsx, features/glossary/glossary-screen.tsx): every term, not the first 200, in a
// windowed list with an A–Z rail; search; the Area picker grouped by family with removable pills; pointing at a row
// shows it in the card after a dwell, a click pins it; each area's own definition in a tab, "No definition yet"
// where an area lists the term without wording it; the old ?indicator= links open the catalogue.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import GlossaryPage from '../app/glossary/page';
import {ROW_H, filterTerms, letterOf} from '../features/glossary/glossary-screen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/glossary', useSearchParams: () => new URLSearchParams()}));

const hint = (term: string, definition: string, areas: string[], definitions = 1) => ({term, definition, areas, related: [], definitions, names: [{text: term, exact: false}]});
// 250 terms: more than the old page's cap of 200.
const many = Array.from({length: 246}, (_, i) => hint(`Zeta term ${String(i).padStart(3, '0')}`, `Filler definition ${i}. Second sentence.`, ['ML']));
const hints = [
  hint('Beneficial owner', 'The person who in the end owns or controls a company. More words.', ['BO']),
  hint('Nominee', 'Someone who holds shares in name for another.', ['BO', 'ML', 'SF'], 2),
  hint('Pass-through account', 'An account where money flows straight in and out.', ['ML']),
  hint('#TAPEX', 'A tag used in suspicious transaction reports.', ['KX']),
  ...many,
];
const area = (key: string, name: string, terms: number) => ({key, name, scope: '', summary: '', indicators: 10, verified: 10, terms});
const areas = [area('BO', 'Hidden ownership and shell companies', 2), area('ML', 'Money laundering', 248), area('SF', 'Terrorist financing', 1), area('KX', 'Kidnapping', 1),
  {...area('APP', "The app's own names", 0), indicators: 0, verified: 0}];
const nomineeEntry = {term: 'Nominee', definition: 'Someone who holds shares in name for another.', examples: ['A director for hire'], source_url: 'https://example.test/bo',
  cases: ['Case to look up'], related: ['Beneficial owner', 'Not a term here'], indicators: ['BO-004'], areas: ['BO', 'ML', 'SF'],
  definitions: [{area: 'BO', definition: 'Someone who holds shares in name for another.', source_url: 'https://example.test/bo'},
    {area: 'ML', definition: 'A front used to move money for someone else.', source_url: 'https://example.test/ml'}]};
const routes = {
  'GET /api/catalogue/terms': hints,
  'GET /api/catalogue/areas': areas,
  'GET /api/catalogue/glossary/entry': ({url}: {url: URL}) => {
    const term = url.searchParams.get('term') ?? '';
    if (term.toLowerCase() === 'nominee') return nomineeEntry;
    const h = hints.find(x => x.term.toLowerCase() === term.toLowerCase());
    return h ? {term: h.term, definition: h.definition, examples: [], source_url: 'https://example.test/x', cases: [], related: [], indicators: [], areas: h.areas,
      definitions: [{area: h.areas[0], definition: h.definition, source_url: 'https://example.test/x'}]} : {status: 404, body: {detail: 'Term not found'}};
  },
};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: ''}); window.history.replaceState(null, '', '/glossary'); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('filterTerms and letters', () => {
  it('finds names first, then definitions; only in the chosen areas', () => {
    expect(filterTerms(hints, 'owner', []).map(h => h.term)).toEqual(['Beneficial owner']);
    expect(filterTerms(hints, 'money', []).map(h => h.term)).toEqual(['Pass-through account']);
    expect(filterTerms(hints, 'nominee', ['SF']).map(h => h.term)).toEqual(['Nominee']);
    expect(filterTerms(hints, '', ['KX']).map(h => h.term)).toEqual(['#TAPEX']);
    const shells = [hint('Public shell company', 'A listed shell.', ['FR']), hint('Shell company', 'No operations.', ['BO']), hint('Shell company formation', 'Making shells.', ['BO']),
      hint('Front', 'Often a shell company.', ['BO'])];
    expect(filterTerms(shells, 'shell company', []).map(h => h.term)).toEqual(['Shell company', 'Shell company formation', 'Public shell company', 'Front']);
    expect(letterOf('#TAPEX')).toBe('#');
    expect(letterOf("'Honour'-based abuse")).toBe('#');
    expect(letterOf('nominee')).toBe('N');
  });
});

describe('Glossary', () => {
  it('lists every term (not the first 200) in a windowed list, and the rail jumps to a letter', async () => {
    mockApi(routes);
    render(<GlossaryPage/>);
    expect(await screen.findByText(`${hints.length}`)).toBeInTheDocument();
    expect(screen.getByText(/of 250 terms/)).toBeInTheDocument();
    const list = screen.getByRole('listbox', {name: 'Terms'});
    // Windowed: only the rows near the view are in the page, but the list is as tall as every row.
    expect(within(list).getAllByRole('option').length).toBeLessThan(hints.length);
    expect((list.firstElementChild as HTMLElement).style.height).toBe(`${hints.length * ROW_H}px`);
    expect(screen.getByRole('button', {name: 'Z, 246 terms'})).toBeEnabled();
    expect(screen.getByRole('button', {name: 'Q, 0 terms'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name: 'Z, 246 terms'}));
    expect(list.scrollTop).toBe(4 * ROW_H);
  });

  it('searches, filters by area with removable pills, and opens a term with each area’s definition', async () => {
    mockApi(routes);
    render(<GlossaryPage/>);
    const user = userEvent.setup();
    await screen.findByText(/of 250 terms/);
    await user.type(screen.getByLabelText('Search the glossary'), 'nominee');
    await waitFor(() => expect(screen.getByText(/of 250 terms/).textContent).toMatch(/^1 of/));
    await waitFor(() => expect(window.location.search).toContain('q=nominee'));

    await user.click(screen.getByRole('button', {name: /^Area/}));
    await user.click(screen.getByRole('checkbox', {name: /Terrorist financing/}));
    expect(screen.getByRole('button', {name: 'Remove Terrorist financing'})).toBeInTheDocument();
    expect(window.location.search).toContain('area=SF');

    await user.click(within(screen.getByRole('listbox', {name: 'Terms'})).getByRole('option', {name: /Nominee/}));
    const card = await screen.findByRole('article');
    expect(within(card).getByRole('heading', {level: 2, name: 'Nominee'})).toBeInTheDocument();
    expect(within(card).getByText(/Defined in 2 areas, listed in 3/)).toBeInTheDocument();
    const tabs = await within(card).findAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Hidden ownership and shell companies', 'Money laundering', 'Terrorist financing ○']);
    await user.click(tabs[1]);
    expect(within(card).getByText('A front used to move money for someone else.')).toBeInTheDocument();
    await user.click(tabs[2]);
    expect(within(card).getByText('No definition yet in Terrorist financing.')).toBeInTheDocument();
    expect(within(card).getByRole('link', {name: 'BO-004'})).toHaveAttribute('href', '/learn?indicator=BO-004');
    // A related term the glossary holds opens in place; one it does not is plain text.
    expect(within(card).getByText('Not a term here').tagName).toBe('SPAN');
    await user.click(screen.getByRole('button', {name: 'Remove Terrorist financing'}));
    expect(window.location.search).not.toContain('area=');
  });

  it('shows a row in the card after a short dwell, without pinning it', async () => {
    mockApi(routes);
    window.history.replaceState(null, '', '/glossary?q=Nominee');
    render(<GlossaryPage/>);
    expect(await screen.findByRole('heading', {level: 2, name: 'Nominee'})).toBeInTheDocument();
    await act(async () => { fireEvent.change(screen.getByLabelText('Search the glossary'), {target: {value: ''}}); });
    const row = await screen.findByRole('option', {name: /Beneficial owner/});
    fireEvent.pointerEnter(row);
    expect(await screen.findByRole('heading', {level: 2, name: 'Beneficial owner'})).toBeInTheDocument();
    fireEvent.pointerLeave(screen.getByRole('listbox', {name: 'Terms'}));
    expect(await screen.findByRole('heading', {level: 2, name: 'Nominee'})).toBeInTheDocument();
  });

  it('moves with J / K and pins with Enter', async () => {
    mockApi(routes);
    render(<GlossaryPage/>);
    await screen.findByText(/of 250 terms/);
    const list = screen.getByRole('listbox', {name: 'Terms'});
    fireEvent.keyDown(list, {key: 'j'});
    fireEvent.keyDown(list, {key: 'j'});
    fireEvent.keyDown(list, {key: 'k'});
    fireEvent.keyDown(list, {key: 'Enter'});
    expect(await screen.findByRole('heading', {level: 2, name: hints[1].term})).toBeInTheDocument();
    expect(window.location.search).toContain(`term=${hints[1].term}`);
  });

  it('goes from the search box to the terms with ↓, and Enter there opens the first term', async () => {
    mockApi(routes);
    render(<GlossaryPage/>);
    const user = userEvent.setup();
    await screen.findByText(/of 250 terms/);
    await user.type(screen.getByLabelText('Search the glossary'), 'nominee');
    await waitFor(() => expect(screen.getByText(/of 250 terms/).textContent).toMatch(/^1 of/));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('listbox', {name: 'Terms'}));
    screen.getByLabelText('Search the glossary').focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', {level: 2, name: 'Nominee'})).toBeInTheDocument();
  });
});
