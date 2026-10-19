// @vitest-environment jsdom
// Learn › Red Flags catalogue (mockup KNOWLEDGE_KEEP_1; app/learn/page.tsx, features/knowledge/*): the map of the
// areas as a listbox (arrow keys step, the case's flags ring an area), the area card, the indicator list with
// how-checked glyphs and counted filters, the indicator page (ladder with "not set" and "This case", innocent and
// signs side by side, checked by, sources, case, this case's flag), Map / Table / Cards, and the place in the address.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import LearnPage from '../app/learn/page';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {TRAIL_TAIL_EVENT} from '../lib/trail';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/learn', useSearchParams: () => new URLSearchParams()}));

const area = (key: string, name: string, indicators: number, summary = '') => ({key, name, scope: '', summary, indicators, verified: indicators, terms: 3});
const areas = [area('BO', 'Hidden ownership and shell companies', 3, 'Hiding who really owns a company.'), area('ML', 'Money laundering', 2), area('SA', 'Safety of investigators', 1),
  {...area('APP', "The app's own names", 0), indicators: 0, verified: 0}];
const counts = (key: string, records: number, lookups: number, person: number, rules: number) => ({key, records, lookups, person, pending: 0, rules});
const map = {areas: [counts('BO', 1, 2, 0, 1), counts('ML', 2, 0, 0, 1), counts('SA', 0, 0, 1, 0)], cross_hints: [{source: 'BO', target: 'ML', count: 7}]};
const row = (id: string, name: string, checkable: string, rule = false, status = 'verified') => ({id, name, area: id.slice(0, 2), checkable, status, levels_set: ['textbook'], rule});
const rows: Record<string, ReturnType<typeof row>[]> = {
  BO: [row('BO-001', 'Circular ownership', 'records', true), row('BO-007', "Mass-registration address, or 'company factory'", 'lookups'), row('BO-008', 'Post-box only address', 'lookups', false, 'pending')],
  ML: [row('ML-021', 'Structuring', 'records', true), row('ML-023', 'Circular payments', 'records', true)],
  SA: [row('SA-001', 'Threats to the reporter', 'person')],
};
const detail = (id: string, name: string, more: Record<string, unknown> = {}) => ({
  id, name, definition: `The definition of ${name}.`, areas: [id.slice(0, 2)], area_name: areas.find(a => a.key === id.slice(0, 2))!.name, typology: null, status: 'verified',
  sources: [{title: 'Annex E', publisher: 'FATF/Egmont', year: '2018', url: 'https://example.test/fatf', locator: 'p. 185', quote: 'Address of mass registration', quote_verified: true, licence: null, checked: null},
    {title: 'Report', publisher: 'Global Witness', year: '2018', url: 'https://example.test/gw', locator: null, quote: 'Company factories', quote_verified: false, licence: null, checked: null}],
  examples: ['Over 208,000 UK companies at company-factory addresses'],
  cases: [{name: 'Business centre, no-PSC companies', year: '2018', jurisdiction: 'UK', what_happened: 'Many firms at one address.', outcome: 'alleged_in_reporting', outcome_verified: true, source_url: 'https://example.test/case', source_title: null}],
  data_needed: ['Address'], checkable: 'lookups', lookup_sources: ['OpenCorporates'],
  levels: {faint: 'To be set by Ony', strong: 'More than 100 companies at one address', textbook: 'More than 1,000 companies at one address', threshold_source: 'https://example.test/gw', threshold_note: null},
  threshold_verified: true, cross_hints: [], innocent_explanations: ['Accountants host many registered offices', 'Virtual offices'], jurisdictions: 'UK', version: 1, ...more,
});
const details: Record<string, ReturnType<typeof detail>> = {
  'BO-001': detail('BO-001', 'Circular ownership', {checkable: 'records', lookup_sources: []}),
  'BO-007': detail('BO-007', "Mass-registration address, or 'company factory'"),
  'BO-008': detail('BO-008', 'Post-box only address', {status: 'pending'}),
  'ML-021': detail('ML-021', 'Structuring', {checkable: 'records'}),
  'ML-023': detail('ML-023', 'Circular payments', {checkable: 'records'}),
  'SA-001': detail('SA-001', 'Threats to the reporter', {checkable: 'person'}),
};
const flag = (id: string, indicator: string, level: string) => ({id, indicator_id: indicator, rule_version: 1, level, status: 'open', dismissed_reason: null, lead_id: null, weight: 1,
  weight_parts: [], parties: [], links: [], facts: {}, summary: `${indicator} fires on Harbour Nominees.`, not_shown: [], checks: [], years: [],
  first_seen_at: '2026-10-09T00:00:00Z', last_seen_at: '2026-10-10T00:00:00Z', gone_at: null, innocent: [], indicator: null});
const redFlags = {investigation_id: 'inv-1', rules: [{indicator_id: 'BO-001', version: 1, name: 'Circular ownership'}, {indicator_id: 'ML-021', version: 1, name: 'Structuring'}],
  cannot_run: [], flags: [flag('f1', 'BO-007', 'strong'), flag('f2', 'ML-021', 'faint')], gone: [], investigation_type: {set_by: 'app', areas: [], suggested: []}};

const routes = {
  'GET /api/catalogue/areas': areas,
  'GET /api/catalogue/map': map,
  'GET /api/catalogue/indicators': ({url}: {url: URL}) => {
    const a = url.searchParams.get('area');
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const list = a ? rows[a] ?? [] : Object.values(rows).flat().filter(r => `${r.id} ${r.name}`.toLowerCase().includes(q));
    return {total: list.length, indicators: list};
  },
  'GET /api/catalogue/glossary': {total: 2116, terms: []},
  'GET /api/catalogue/terms': [],
  'GET /api/investigations/inv-1/red-flags': redFlags,
  'GET /api/investigations': [{id: 'inv-1', name: 'Harbour land', description: null, created_at: '2026-10-01T00:00:00Z', is_demo: false}],
  ...Object.fromEntries(Object.entries(details).map(([id, d]) => [`GET /api/catalogue/indicators/${id}`, d])),
};

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: '', investigationName: ''});
  window.localStorage.clear();
  window.history.replaceState(null, '', '/learn?inv=inv-1&area=BO&indicator=BO-007');
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Learn › Red Flags catalogue', () => {
  it('opens the place in the address with the case laid over it', async () => {
    const tails: unknown[] = [];
    const listen = (e: Event) => tails.push((e as CustomEvent).detail);
    window.addEventListener(TRAIL_TAIL_EVENT, listen);
    mockApi(routes);
    render(<LearnPage/>);

    // The map: a listbox of areas, family by family, each read with its count and how many fire in this case.
    const mapBox = await screen.findByRole('listbox', {name: 'Areas, in families'});
    expect(await within(mapBox).findByRole('option', {name: 'Hidden ownership and shell companies, 3 indicators, 1 fire in this case', selected: true})).toBeInTheDocument();
    expect(within(mapBox).getByRole('option', {name: 'Safety of investigators, 1 indicators, 0 fire in this case'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: '3 areas · 6 indicators'})).toBeInTheDocument();

    // The area card: scope, how its indicators are checked, and the case's flags in it.
    const card = screen.getByRole('article', {name: 'Hidden ownership and shell companies, the area'});
    expect(card).toHaveTextContent('Hiding who really owns a company. 1 checkable from your records, 2 after lookups, 0 only by a person.');
    expect(within(card).getByRole('button', {name: /Strong BO-007/})).toBeInTheDocument();

    // The list: counted filters, glyph plus words for screen readers, the case's level inline, pending dashed.
    const list = await screen.findByRole('listbox', {name: 'Indicators in Hidden ownership and shell companies'});
    expect(await screen.findByRole('button', {name: 'All 3'})).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', {name: 'Fire here 1'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '⇄ Lookups 2'})).toBeInTheDocument();
    const selected = within(list).getByRole('option', {selected: true});
    expect(selected).toHaveTextContent('BO-007');
    expect(selected).toHaveTextContent('Strong');
    expect(selected).toHaveTextContent('checked after outside lookups');
    expect(within(list).getByRole('option', {name: /BO-008/})).toHaveTextContent('○ pending');

    // The indicator page.
    const page = await screen.findByRole('region', {name: 'Indicator BO-007'});
    expect(within(page).getByRole('heading', {level: 2, name: "Mass-registration address, or 'company factory'"})).toBeInTheDocument();
    expect(page).toHaveTextContent('✓ Verified');
    expect(page).toHaveTextContent('In this case: BO-007 fires on Harbour Nominees.');
    const ladder = within(page).getByRole('list', {name: 'Levels'});
    const steps = within(ladder).getAllByRole('listitem');
    expect(steps[0]).toHaveAccessibleName('Faint, 1 of 3, not set');
    expect(steps[0]).toHaveTextContent('No published number yet. Shown as “not set”, never guessed.');
    expect(steps[1]).toHaveAccessibleName('Strong, 2 of 3, More than 100 companies at one address, this case meets it');
    expect(steps[1]).toHaveTextContent('This case');
    expect(within(page).getByRole('region', {name: 'Could be innocent'})).toHaveTextContent('Accountants host many registered offices');
    expect(within(page).getByRole('region', {name: 'Signs: what it looks like'})).toHaveTextContent('Over 208,000 UK companies');
    expect(page).toHaveTextContent('Outside lookups: OpenCorporates.');
    expect(page).toHaveTextContent('✓ quote confirmed');
    expect(page).toHaveTextContent('○ Alleged in reporting');
    // No rule computes BO-007: the check is disabled and says why, in words.
    expect(within(page).getByRole('button', {name: 'Check this in my case'})).toBeDisabled();
    expect(within(page).getByRole('button', {name: 'Check this in my case'})).toHaveAccessibleDescription('No rule checks this on records yet: it is checked after outside lookups.');
    // All sources: the unconfirmed quote is dashed words, not an error.
    await userEvent.setup().click(within(page).getByRole('button', {name: '2 sources'}));
    expect(within(page).getByText('○ not yet confirmed')).toHaveClass('kc-dashed');

    expect(tails.at(-1)).toEqual([{label: 'Learn', href: '/learn'}, {label: 'Red Flags catalogue', href: '/learn'}, {label: 'Hidden ownership'}, {label: 'BO-007'}]);
    await waitFor(() => expect(useWorkbenchStore.getState().investigationName).toBe('Harbour land'));
    window.removeEventListener(TRAIL_TAIL_EVENT, listen);
  });

  it('steps through areas with the arrow keys, draws the choice into the address, and filters with an empty state', async () => {
    mockApi(routes);
    render(<LearnPage/>);
    const mapBox = await screen.findByRole('listbox', {name: 'Areas, in families'});
    await within(mapBox).findByRole('option', {name: /Hidden ownership.*1 fire/, selected: true});
    // In family order ML comes before BO.
    fireEvent.keyDown(mapBox, {key: 'ArrowLeft'});
    expect(await within(mapBox).findByRole('option', {name: /^Money laundering/, selected: true})).toBeInTheDocument();
    await screen.findByRole('listbox', {name: 'Indicators in Money laundering'});
    // The strongest flag in the newly chosen area opens.
    await waitFor(() => expect(window.location.search).toContain('area=ML'));
    await waitFor(() => expect(window.location.search).toContain('indicator=ML-021'));
    await userEvent.setup().click(screen.getByRole('button', {name: '◉ Person 0'}));
    expect(screen.getByText(/No indicator in Money laundering is checked only by a person/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Clear'}));
    expect(screen.getByRole('button', {name: 'All 2'})).toHaveAttribute('aria-pressed', 'true');
  });

  it('runs the rule again for an indicator a rule computes', async () => {
    window.history.replaceState(null, '', '/learn?inv=inv-1&indicator=BO-001');
    const api = mockApi(routes);
    render(<LearnPage/>);
    const page = await screen.findByRole('region', {name: 'Indicator BO-001'});
    expect(await within(page).findByText(/the rule ran on the case’s records and did not fire/)).toBeInTheDocument();
    const before = api.calls('GET /api/investigations/inv-1/red-flags').length;
    await userEvent.setup().click(within(page).getByRole('button', {name: 'Check this in my case'}));
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-1/red-flags').length).toBe(before + 1));
    expect(await within(page).findByText('Checked just now on this case’s records.')).toBeInTheDocument();
  });

  it('previews a row after a dwell without changing the choice; J / K move it', async () => {
    mockApi(routes);
    render(<LearnPage/>);
    const list = await screen.findByRole('listbox', {name: 'Indicators in Hidden ownership and shell companies'});
    await screen.findByRole('region', {name: 'Indicator BO-007'});
    fireEvent.pointerEnter(within(list).getByRole('option', {name: /BO-001/}));
    const preview = await screen.findByRole('region', {name: 'Indicator BO-001'});
    await waitFor(() => expect(preview).toHaveTextContent('Preview · BO-001'));
    expect(within(list).getByRole('option', {selected: true})).toHaveTextContent('BO-007');
    fireEvent.pointerLeave(list);
    expect(await screen.findByRole('region', {name: 'Indicator BO-007'})).toBeInTheDocument();
    within(list).getByRole('option', {selected: true}).focus();
    fireEvent.keyDown(list, {key: 'j'});
    await waitFor(() => expect(within(list).getByRole('option', {selected: true})).toHaveTextContent('BO-008'));
    // Focus follows the choice while the list has the keyboard.
    expect(document.activeElement).toBe(within(list).getByRole('option', {selected: true}));
    const pending = await screen.findByRole('region', {name: 'Indicator BO-008'});
    await waitFor(() => expect(pending).toHaveTextContent('Pending checks: not used for Red Flags yet.'));
  });

  it('shows the catalogue as a table by family, and as cards that turn', async () => {
    mockApi(routes);
    render(<LearnPage/>);
    const user = userEvent.setup();
    await screen.findByRole('listbox', {name: 'Areas, in families'});
    await user.click(screen.getByRole('button', {name: 'Table'}));
    const table = await screen.findByRole('region', {name: 'The catalogue as a table'});
    const money = within(table).getByRole('region', {name: 'Money & companies'});
    expect(within(money).getByRole('rowheader', {name: /BO Hidden ownership/})).toBeInTheDocument();
    expect(within(table).getByRole('region', {name: 'Your safety'})).toBeInTheDocument();
    await user.click(within(money).getByRole('button', {name: /ML Money laundering/}));
    await user.click(await within(money).findByRole('button', {name: /ML-023/}));
    expect(await screen.findByRole('region', {name: 'Indicator ML-023'})).toBeInTheDocument();
    expect(window.location.search).toContain('view=table');

    await user.click(screen.getByRole('button', {name: 'Cards'}));
    const cards = await screen.findByRole('region', {name: 'Cards'});
    expect(screen.queryByRole('region', {name: /^Indicator /})).toBeNull();
    const turn = within(cards).getByRole('button', {name: 'The sign. Space turns the card.'});
    await within(cards).findByText('The definition of Circular payments.');
    act(() => { fireEvent.keyDown(turn, {key: ' '}); });
    expect(within(cards).getByRole('button', {name: /ML-023 Circular payments: the answer side/})).toBeInTheDocument();
    fireEvent.keyDown(within(cards).getByRole('button', {name: /the answer side/}), {key: 'ArrowLeft'});
    await waitFor(() => expect(cards).toHaveTextContent('card 1 of 2'));
  });

  it('finds indicators from the search box and opens them', async () => {
    mockApi(routes);
    render(<LearnPage/>);
    const user = userEvent.setup();
    await screen.findByRole('listbox', {name: 'Areas, in families'});
    expect(await screen.findByPlaceholderText('Search 6 indicators and 2,116 terms')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search indicators and terms'), 'threats');
    await user.click(await screen.findByRole('button', {name: /SA-001 Threats to the reporter/}));
    expect(await screen.findByRole('region', {name: 'Indicator SA-001'})).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toContain('area=SA'));
  });

  it('moves from the search box through the results with the arrow keys', async () => {
    mockApi(routes);
    render(<LearnPage/>);
    const user = userEvent.setup();
    await screen.findByRole('listbox', {name: 'Areas, in families'});
    await user.type(screen.getByLabelText('Search indicators and terms'), 'threats');
    const result = await screen.findByRole('button', {name: /SA-001 Threats to the reporter/});
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(result);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByLabelText('Search indicators and terms'));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(await screen.findByRole('region', {name: 'Indicator SA-001'})).toBeInTheDocument();
  });
});
