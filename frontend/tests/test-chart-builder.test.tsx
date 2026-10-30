// @vitest-environment jsdom
// The chart builder (features/charts/chart-builder-panel.tsx): a reporter
// makes a checked chart without the AI, question first. The catalogue is
// asked for only when the builder opens; the data offered is only what
// answers the question, the kinds only those that answer it and can draw
// the data; the preview draws the backend's checked option (ECharts mocked,
// as in test-chart-visual.test.tsx) and lists every failed rule by number.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Suspense, lazy} from 'react';
import type {ComponentType, ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const reactEChartsCoreSpy = vi.hoisted(() => vi.fn());
vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: Record<string, unknown>) => { reactEChartsCoreSpy(props); return <canvas data-testid="echarts-canvas"/>; },
}));
// next/dynamic resolves the import as React.lazy would, so the tests see the real component once it has loaded.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Lazy = lazy(() => loader().then(component => ({default: component})));
    return (props: Record<string, unknown>) => <Suspense fallback={null}><Lazy {...props}/></Suspense>;
  },
}));

import {ChartBuilderPanel, chartSummary, queriesFor, suggestedKinds, traceRequest} from '../features/charts/chart-builder-panel';
import {parseDestination} from '../features/charts/keep-chart';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {JsonObject} from '../lib/api-types';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import kinds from '../test-support/chart-kinds.json';
import {mockApi} from '../test-support/mock-api';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); reactEChartsCoreSpy.mockClear(); });

const CATALOG = 'GET /api/investigations/inv-1/visuals/catalog';
const PREVIEW = 'POST /api/investigations/inv-1/visuals/preview';
const DECKS = 'GET /api/investigations/inv-1/decks';
const WRITEUPS = 'GET /api/investigations/inv-1/writeups';

const when = '2026-10-03T01:00:00';
const deck = (overrides: Record<string, unknown> = {}) => ({id: 'dk-1', investigation_id: 'inv-1', title: 'Where the money went', slides: [], slide_count: 3,
  style: {theme: 'paper', fonts: 'editorial'}, source_ai_candidate_id: null, created_by: null, created_at: when, updated_at: when, ...overrides});
const writeup = (overrides: Record<string, unknown> = {}) => ({id: 'wu-1', investigation_id: 'inv-1', title: 'The consulting fee', status: 'draft',
  cited_record_refs: [], source_ai_candidate_id: null, created_by: null, created_at: when, updated_at: when, word_count: 120, ...overrides});
const lists = {[DECKS]: {decks: [deck()]}, [WRITEUPS]: {writeups: [{...writeup(), preview: 'The fee was paid in two parts.'}]}};

const direction = {description: 'Rank who received the money, or who paid it.', choices: ['received', 'paid'], default: 'received'};
const currency = {description: 'ISO 4217 currency code.', choices: null, default: null};
function query(name: string, label: string, overrides: Record<string, unknown> = {}) {
  return {name, label, description: `${label} from the records.`, params: {}, series_kind: 'category', unit_kind: 'amount', record_noun: 'payments',
    has_data: true, record_count: 5, row_count: 3, currencies: ['USD'], kinds: [], questions: [], ...overrides};
}
const catalog = {
  investigation_id: 'inv-1',
  queries: [
    query('payments_by_party', 'Payments by party', {params: {direction, currency}, kinds: ['bar', 'column', 'stacked_bar_100', 'donut', 'treemap'], questions: ['ranking', 'part_of_whole']}),
    query('payments_over_time', 'Payments over time', {series_kind: 'time', kinds: ['line', 'column', 'area', 'bar'], questions: ['change_over_time']}),
    query('documents_by_status', 'Documents by status', {unit_kind: 'count', record_noun: 'documents', has_data: false, record_count: 0, currencies: [],
      kinds: ['bar', 'column', 'stacked_bar_100', 'donut', 'treemap'], questions: ['ranking', 'part_of_whole']}),
    query('payment_amounts', 'Payment amounts', {series_kind: 'distribution', kinds: ['histogram', 'bar', 'column'], questions: ['ranking', 'distribution']}),
    query('payments_count_and_total_by_party', 'Number and total of payments by party', {series_kind: 'pairs', kinds: ['scatter'], questions: ['correlation']}),
  ],
  questions: [
    {id: 'ranking', label: 'Ranking', description: 'Where an item sits in an ordered list.', kinds: ['bar', 'column'], drawn_kinds: ['bar', 'column'],
      queries: ['payments_by_party', 'documents_by_status', 'payment_amounts']},
    {id: 'change_over_time', label: 'Change over time', description: 'How a value rises and falls across periods.', kinds: ['line', 'column', 'area'],
      drawn_kinds: ['line', 'column', 'area'], queries: ['payments_over_time']},
    {id: 'part_of_whole', label: 'Part of a whole', description: 'How a total splits into parts.', kinds: ['stacked_bar_100', 'donut', 'treemap'],
      drawn_kinds: ['stacked_bar_100', 'donut', 'treemap'], queries: ['payments_by_party', 'documents_by_status']},
    {id: 'distribution', label: 'Distribution', description: 'How the values are spread.', kinds: ['histogram'], drawn_kinds: ['histogram'], queries: ['payment_amounts']},
    {id: 'correlation', label: 'Correlation', description: 'How two numbers move together.', kinds: ['scatter'], drawn_kinds: ['scatter'],
      queries: ['payments_count_and_total_by_party']},
    {id: 'flow', label: 'Flow', description: 'Where money moves from and to.', kinds: ['sankey'], drawn_kinds: [], queries: []},
  ],
  kinds: ['bar', 'column', 'line', 'area', 'stacked_bar_100', 'donut', 'treemap', 'histogram', 'scatter', 'timeline', 'sankey'],
  drawn_kinds: ['area', 'bar', 'column', 'donut', 'histogram', 'line', 'scatter', 'stacked_bar_100', 'treemap'],
};

// The backend's own checked donut (test-support/chart-kinds.json) as the preview route answers it.
const donut = (kinds as unknown as Record<string, JsonObject>).donut;
const donutText = donut.text as JsonObject;
function previewReply(report: Record<string, unknown> = {}) {
  return {spec: donut.spec, data: donut.data, option: donut.option, width: donut.width, height: donut.height,
    alt_text: donutText.alt_text, description: donutText.description, source_line: donutText.source_line, data_table: donutText.data_table,
    report: {ok: true, errors: [], warnings: [{rule: 20, message: 'these values rest on one record each: Meridian Holdings Ltd'}],
      checked_rules: [0, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20], not_checked: {}, not_applicable: {}, ...report}};
}

async function openBuilder(routes: Record<string, unknown> = {}) {
  const api = mockApi({[CATALOG]: catalog, ...routes});
  wrap(<ChartBuilderPanel investigationId="inv-1"/>);
  const user = userEvent.setup();
  return {api, user};
}

describe('ChartBuilderPanel', () => {
  it('asks for the catalogue only when the builder is opened, and offers the questions', async () => {
    const {api, user} = await openBuilder();
    expect(screen.getByRole('button', {name: 'Build a chart'})).toBeInTheDocument();
    expect(api.calls(CATALOG)).toHaveLength(0);
    // Until it is opened the screen says what it makes.
    expect(screen.getByRole('heading', {name: /A checked chart from the case/})).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    const questions = within(await screen.findByRole('group', {name: 'Question'}));
    expect(questions.getAllByRole('button').map(b => b.textContent)).toEqual(['Ranking', 'Change over time', 'Part of a whole', 'Distribution', 'Correlation', 'Flow']);
    expect(questions.getByRole('button', {name: 'Flow'})).toBeDisabled();   // drawn in the money-flow pass
    expect(api.calls(CATALOG)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('offers only the data that answers the question and the kinds that can draw it', async () => {
    const {user} = await openBuilder();
    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    await user.click(await screen.findByRole('button', {name: 'Part of a whole'}));
    // The data are cards with their record counts; the first with records is chosen.
    expect(screen.getByRole('radio', {name: 'Payments by party · 5 payments'})).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', {name: 'Payments by party · 5 payments'})).toHaveTextContent('5payments');
    const chartKinds = within(screen.getByRole('group', {name: 'Chart kind'}));
    expect(chartKinds.getAllByRole('button').map(b => b.textContent)).toEqual(['100% bar (suggested) ★', 'Donut', 'Treemap']);
    expect(chartKinds.getByRole('button', {name: /^100% bar\s*\(suggested\)/})).toHaveAttribute('aria-pressed', 'true');

    // Data with no records yet is listed but cannot be chosen.
    expect(screen.getByRole('radio', {name: 'Documents by status · no records yet'})).toBeDisabled();

    await user.click(screen.getByRole('button', {name: 'Distribution'}));
    expect(screen.getByRole('radio', {name: /^Payment amounts/})).toHaveAttribute('aria-checked', 'true');
    expect(within(screen.getByRole('group', {name: 'Chart kind'})).getAllByRole('button').map(b => b.textContent)).toEqual(['Histogram (suggested) ★']);
  });

  it('previews the chart with its check report, and each value traces to its records', async () => {
    const {api, user} = await openBuilder({[PREVIEW]: previewReply(), ...lists});
    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    await user.click(await screen.findByRole('button', {name: 'Part of a whole'}));
    await user.click(screen.getByRole('button', {name: 'Donut'}));
    const preview = screen.getByRole('button', {name: 'Preview chart'});
    expect(preview).toBeDisabled();   // a title that states the finding comes first
    await user.type(screen.getByRole('textbox', {name: 'Title'}), 'Meridian received most of the money');
    await user.click(preview);

    expect(await screen.findByText('Passes the design checks')).toBeInTheDocument();
    expect(api.lastBody(PREVIEW)).toEqual({kind: 'donut', question: 'part_of_whole', title: 'Meridian received most of the money',
      query: {name: 'payments_by_party', params: {direction: 'received'}}});
    expect(screen.getByText(/13 rules were checked for this donut/)).toBeInTheDocument();
    expect(screen.getByRole('list', {name: 'Warnings'})).toHaveTextContent('Rule 20 (warning) · A value that rests on one record is flagged: these values rest on one record each');
    // The drawing is the backend's checked option, with no app theme over it.
    await screen.findByTestId('echarts-canvas');
    const props = reactEChartsCoreSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(props.option).toEqual(donut.option);
    expect(props.theme).toBeUndefined();
    // The frame says what the chart shows in one line; the full description waits under its own heading.
    const rule = screen.getByTestId('chart-rule');
    expect(rule.textContent).toBe(`What it shows: ${chartSummary(String(donutText.alt_text), 'Meridian received most of the money')}`);
    expect(rule.textContent!.length).toBeLessThan(String(donutText.description).length);

    await user.click(screen.getByText('Description and data table'));
    const firstRow = within(screen.getByRole('table')).getAllByRole('row')[1];
    await user.click(within(firstRow).getByRole('button', {name: '1'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({title: 'Meridian received most of the money: record 1', kind: 'relationship',
      traceRecordType: 'relationship', acceptedRecordId: 'r1'});
    expect(api.unmatched()).toEqual([]);
  });

  it('shows every failed rule by its number, in plain words', async () => {
    const failing = previewReply({ok: false, warnings: [], errors: [
      {rule: 12, message: "'Harborline Civic Trust' is too small in a treemap to show its name, so only its colour tells it apart"},
      {rule: 13, message: "the title 'Payments' names the data; it must state the finding in a sentence (at least 3 words)"},
    ]});
    const {user} = await openBuilder({[PREVIEW]: failing});
    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    await user.click(await screen.findByRole('button', {name: 'Part of a whole'}));
    await user.click(screen.getByRole('button', {name: 'Treemap'}));
    await user.type(screen.getByRole('textbox', {name: 'Title'}), 'Payments');
    await user.click(screen.getByRole('button', {name: 'Preview chart'}));

    expect(await screen.findByText('Fails 2 design rules')).toBeInTheDocument();
    expect(screen.queryByText('4. Keep this chart')).not.toBeInTheDocument();   // only a chart that passes is kept
    const failed = within(screen.getByRole('list', {name: 'Failed rules'})).getAllByRole('listitem').map(li => li.textContent);
    expect(failed).toEqual([
      "Rule 12 · Never rely on colour alone: 'Harborline Civic Trust' is too small in a treemap to show its name, so only its colour tells it apart",
      "Rule 13 · A title that states the finding, alt text, a description and a data table: the title 'Payments' names the data; it must state the finding in a sentence (at least 3 words)",
    ]);
  });

  it('keeps a chart that passes in a deck, sending only the order slip', async () => {
    const DECK_CHARTS = 'POST /api/decks/dk-1/charts';
    const {api, user} = await openBuilder({[PREVIEW]: previewReply(), ...lists, [DECK_CHARTS]: deck({slide_count: 4})});
    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    await user.click(await screen.findByRole('button', {name: 'Part of a whole'}));
    await user.click(screen.getByRole('button', {name: 'Donut'}));
    await user.type(screen.getByRole('textbox', {name: 'Title'}), 'Meridian received most of the money');
    await user.click(screen.getByRole('button', {name: 'Preview chart'}));
    expect(await screen.findByText('4. Keep this chart')).toBeInTheDocument();

    const keep = screen.getByRole('button', {name: 'Keep chart'});
    expect(keep).toBeDisabled();
    screen.getByRole('combobox', {name: 'Keep in'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Deck: Where the money went'}));
    await user.type(screen.getByRole('textbox', {name: 'Slide heading'}), 'Who got paid');
    await user.click(keep);

    expect(await screen.findByText('Added to deck “Where the money went” as slide 4.')).toBeInTheDocument();
    expect(api.lastBody(DECK_CHARTS)).toEqual({heading: 'Who got paid', spec: {kind: 'donut', question: 'part_of_whole',
      title: 'Meridian received most of the money', query: {name: 'payments_by_party', params: {direction: 'received'}}}});
    expect(api.calls(DECKS).length).toBeGreaterThan(1);   // the deck list is read again
    expect(api.unmatched()).toEqual([]);
  });

  it('starts a new write-up with the chart, titled by the finding', async () => {
    const NEW = 'POST /api/writeups';
    const CHARTS = 'POST /api/writeups/wu-2/charts';
    const title = 'Meridian received most of the money';
    const {api, user} = await openBuilder({[PREVIEW]: previewReply(), ...lists,
      [NEW]: writeup({id: 'wu-2', title, content_json: {type: 'doc', content: []}}),
      [CHARTS]: writeup({id: 'wu-2', title, content_json: {type: 'doc', content: []}})});
    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    await user.click(await screen.findByRole('button', {name: 'Part of a whole'}));
    await user.click(screen.getByRole('button', {name: 'Donut'}));
    await user.type(screen.getByRole('textbox', {name: 'Title'}), title);
    await user.click(screen.getByRole('button', {name: 'Preview chart'}));
    await screen.findByText('4. Keep this chart');
    screen.getByRole('combobox', {name: 'Keep in'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'A new write-up'}));
    expect(screen.queryByRole('textbox', {name: 'Slide heading'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Keep chart'}));

    expect(await screen.findByText(`Started write-up “${title}” with this chart.`)).toBeInTheDocument();
    expect(api.lastBody(NEW)).toEqual({investigation_id: 'inv-1', title});
    expect((api.lastBody(CHARTS) as {spec: {title: string}}).spec.title).toBe(title);
    expect(api.unmatched()).toEqual([]);
  });

  it('says why the server would not keep a chart', async () => {
    const DECK_CHARTS = 'POST /api/decks/dk-1/charts';
    const {user} = await openBuilder({[PREVIEW]: previewReply(), ...lists,
      [DECK_CHARTS]: {status: 422, body: {detail: "the chart failed the design checks: rule 4: the parts share records"}}});
    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    await user.click(await screen.findByRole('button', {name: 'Part of a whole'}));
    await user.click(screen.getByRole('button', {name: 'Donut'}));
    await user.type(screen.getByRole('textbox', {name: 'Title'}), 'Meridian received most of the money');
    await user.click(screen.getByRole('button', {name: 'Preview chart'}));
    await screen.findByText('4. Keep this chart');
    screen.getByRole('combobox', {name: 'Keep in'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Deck: Where the money went'}));
    await user.click(screen.getByRole('button', {name: 'Keep chart'}));
    expect(await screen.findByText(/the chart failed the design checks: rule 4: the parts share records/)).toBeInTheDocument();
  });

  it('says in plain words why a kind cannot draw the data', async () => {
    const {user} = await openBuilder({[PREVIEW]: {status: 422, body: {detail: "the question 'distribution' needs one value per record"}}});
    await user.click(screen.getByRole('button', {name: 'Build a chart'}));
    await user.click(await screen.findByRole('button', {name: 'Distribution'}));
    await user.type(screen.getByRole('textbox', {name: 'Title'}), 'Most payments were small');
    await user.click(screen.getByRole('button', {name: 'Preview chart'}));
    expect(await screen.findByRole('alert')).toHaveTextContent("the question 'distribution' needs one value per record");
  });
});

describe('the builder\'s choices', () => {
  it('says what a chart shows without repeating its kind and title', () => {
    expect(chartSummary('Donut: Meridian received most. 3 parts of $9.8 m. Largest: Meridian at 60%.', 'Meridian received most'))
      .toBe('3 parts of $9.8 m. Largest: Meridian at 60%.');
    expect(chartSummary('Bar: Who paid. No data.', 'Who paid')).toBe('No data.');
    expect(chartSummary('Some other words.', 'Who paid')).toBe('Some other words.');
  });
  it('suggests the question\'s kinds that can draw the data, best first', () => {
    const [ranking, , partOfWhole, distribution] = catalog.questions;
    const [byParty, , , amounts] = catalog.queries;
    expect(suggestedKinds(partOfWhole, byParty)).toEqual(['stacked_bar_100', 'donut', 'treemap']);
    expect(suggestedKinds(ranking, amounts)).toEqual(['bar', 'column']);
    expect(suggestedKinds(distribution, byParty)).toEqual([]);
    expect(queriesFor(catalog, distribution).map(q => q.name)).toEqual(['payment_amounts']);
  });

  it('traces each kind of record the queries cite', () => {
    expect(traceRequest({record_type: 'claim', record_id: 'c1'}, 'x')).toEqual({title: 'x', kind: 'claim', acceptedRecordType: 'claim', acceptedRecordId: 'c1'});
    expect(traceRequest({record_type: 'entity', record_id: 'e1'}, 'x')).toEqual({title: 'x', kind: 'entity', entityId: 'e1'});
    expect(traceRequest({record_type: 'document', record_id: 'd1'}, 'x')).toEqual({title: 'x', kind: 'document', documentId: 'd1'});
    expect(traceRequest({record_type: 'timeline_event', record_id: 't1'}, 'x')).toBeNull();
  });

  it('reads the place to keep a chart from the picker', () => {
    expect(parseDestination('deck:dk-1')).toEqual({kind: 'deck', id: 'dk-1'});
    expect(parseDestination('writeup:a:b')).toEqual({kind: 'writeup', id: 'a:b'});
    expect(parseDestination('new-writeup')).toEqual({kind: 'new-writeup'});
    expect(parseDestination('')).toBeNull();
    expect(parseDestination('deck:')).toBeNull();
    expect(parseDestination('slide:1')).toBeNull();
  });
});
