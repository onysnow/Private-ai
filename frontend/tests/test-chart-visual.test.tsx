// @vitest-environment jsdom
// Checked charts in the presentation preview (visuals pass 2): the stored
// chart is parsed from the draft, drawn from the exact option the checker
// passed (in the app's chart wrapper, without the app's dark theme), scaled
// to fit, and shown with the words rule 13 asks for -- description, source
// line, and a data table that names each value's records (rules 15, 16, 20).
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Suspense, lazy} from 'react';
import type {ComponentType, ReactElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const reactEChartsCoreSpy = vi.hoisted(() => vi.fn());
vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: Record<string, unknown>) => { reactEChartsCoreSpy(props); return <canvas data-testid="echarts-canvas"/>; },
}));
// next/dynamic resolves the import as React.lazy would, so the tests see the
// real component once it has loaded.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Lazy = lazy(() => loader().then(component => ({default: component})));
    return (props: Record<string, unknown>) => <Suspense fallback={null}><Lazy {...props}/></Suspense>;
  },
}));

import {ChartFigure, fitScale, tableCells} from '../components/presentation/chart-visual';
import {DraftPreview, asDraft} from '../components/presentation/draft-preview';
import {SlideCanvas, SlideStyleProvider, DEFAULT_THEME, buildCitationLookup, visualRefs} from '../components/presentation/slide-canvas';
import type {ChartVisual, DeckSlide, JsonObject} from '../lib/api-types';
import kinds from '../test-support/chart-kinds.json';

afterEach(() => { cleanup(); reactEChartsCoreSpy.mockClear(); });

const option = {animation: false, title: [{text: 'Bellcastle received most of the money'}], xAxis: {type: 'value'}, yAxis: {type: 'category', data: ['Bellcastle', 'Orrin']}, series: [{type: 'bar', data: [2400000, 285000]}]};
const storedChart: JsonObject = {
  type: 'chart',
  spec: {kind: 'bar', title: 'Bellcastle received most of the money', query: {name: 'payments_by_party', params: {direction: 'received'}}},
  data: {query: 'payments_by_party', unit: 'USD', currency: 'USD', rows: [
    {label: 'Bellcastle', value: 2400000, record_count: 2, record_refs: [{record_type: 'relationship', record_id: 'pay-1'}, {record_type: 'relationship', record_id: 'pay-2'}]},
    {label: 'Orrin', value: 285000, record_count: 1, record_refs: [{record_type: 'relationship', record_id: 'pay-3'}]},
  ]},
  report: {ok: true, errors: [], warnings: []},
  text: {alt_text: 'Bar chart: Bellcastle received most of the money', description: 'Two recipients; Bellcastle received $2.4M.', source_line: 'Source: 3 payment records in this investigation',
    data_table: {columns: ['Label', 'Value (USD)', 'Records'], rows: [
      {label: 'Bellcastle', value: 2400000, formatted: '$2.4M', record_count: 2, record_refs: [{record_type: 'relationship', record_id: 'pay-1'}, {record_type: 'relationship', record_id: 'pay-2'}]},
      {label: 'Orrin', value: 285000, formatted: '$285K', record_count: 1, record_refs: [{record_type: 'relationship', record_id: 'pay-3'}]},
    ]}},
  option, width: 960, height: 540,
};

const payload: JsonObject = {
  title: 'Where the money went', executive_takeaway: 'Bellcastle received most of it.',
  sections: [{heading: 'Who got paid', body: 'Payments went mostly to Bellcastle.', key_points: ['Bellcastle got $2.4M'], evidence: [{record_type: 'evidence', record_id: 'ev-1'}], visual: storedChart}],
  open_questions: [],
};

describe('a stored chart in a draft', () => {
  it('is read as a chart visual, and an incomplete one is dropped', () => {
    const draft = asDraft(payload);
    const visual = draft.sections[0].visual;
    expect(visual?.type).toBe('chart');
    expect((visual as ChartVisual).data.rows.map(r => r.label)).toEqual(['Bellcastle', 'Orrin']);
    const withoutOption = {...payload, sections: [{...(payload.sections as JsonObject[])[0], visual: {...storedChart, option: null}}]};
    expect(asDraft(withoutOption).sections[0].visual).toBeNull();
  });

  it('cites every record behind its rows, after the section evidence', () => {
    const visual = asDraft(payload).sections[0].visual!;
    expect(visualRefs(visual).map(r => r.record_id)).toEqual(['pay-1', 'pay-2', 'pay-3']);
    const slide: DeckSlide = {kind: 'content', heading: 'Who got paid', bullets: ['Bellcastle got $2.4M'], evidence: [{record_type: 'evidence', record_id: 'ev-1'}], visual};
    const lookup = buildCitationLookup([slide]);
    expect([...lookup.numbers.keys()]).toEqual(['evidence:ev-1', 'relationship:pay-1', 'relationship:pay-2', 'relationship:pay-3']);
  });
});

describe('ChartFigure', () => {
  it('draws the checked option without the app theme, and gives the words and the data table', async () => {
    const visual = asDraft(payload).sections[0].visual as ChartVisual;
    render(<ChartFigure visual={visual} renderCitations={refs => <span>{refs.length} record(s)</span>}/>);
    expect(screen.getByRole('img', {name: 'Bar chart: Bellcastle received most of the money'})).toBeInTheDocument();
    const props = reactEChartsCoreSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(props.option).toEqual(option);
    expect(props.theme).toBeUndefined();
    expect(screen.getByText('Source: 3 payment records in this investigation')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText('Description and data table'));
    expect(screen.getByText('Two recipients; Bellcastle received $2.4M.')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('$2.4M')).toBeInTheDocument();
    expect(within(table).getByText('Sources')).toBeInTheDocument();
    // A value that rests on one record is flagged (rule 20); the other is not.
    expect(within(table).getByTitle('Rests on a single record')).toBeInTheDocument();
    expect(within(table).getAllByTitle('Rests on a single record')).toHaveLength(1);
    expect(within(table).getByText('2 record(s)')).toBeInTheDocument();
  });

  it('scales the design to fit the space without ever enlarging it', () => {
    expect(fitScale({width: 960, height: 540}, {width: 480})).toBe(0.5);
    expect(fitScale({width: 960, height: 540}, {width: 480, height: 135})).toBe(0.25);
    expect(fitScale({width: 960, height: 540}, {width: 1920})).toBe(1);
    expect(fitScale({width: 960, height: 540}, {width: 0})).toBe(1);
  });
});

describe('every chart kind in the preview (visuals pass 3)', () => {
  // The backend's own stored charts, one per kind (test-support/chart-kinds.json).
  const stored = (kind: string): JsonObject => {
    const fixture = (kinds as unknown as Record<string, JsonObject>)[kind];
    return {type: 'chart', spec: fixture.spec, data: fixture.data, report: {ok: true, errors: [], warnings: []}, text: fixture.text,
      option: fixture.option, width: fixture.width, height: fixture.height};
  };
  const draftWith = (visual: JsonObject): JsonObject => ({...payload, sections: [{...(payload.sections as JsonObject[])[0], visual}]});

  it.each(['line', 'area', 'stacked_bar_100', 'donut', 'treemap', 'histogram', 'scatter'])('draws a stored %s from its checked option', async kind => {
    const visual = asDraft(draftWith(stored(kind))).sections[0].visual as ChartVisual;
    expect(visual?.type).toBe('chart');
    render(<ChartFigure visual={visual}/>);
    const props = reactEChartsCoreSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(props.option).toEqual(stored(kind).option);   // exactly what passed the check
    expect(props.theme).toBeUndefined();
    expect(screen.getByRole('img', {name: visual.text.alt_text})).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Description and data table'));
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(visual.text.data_table.columns);
    expect(within(table).getAllByRole('row')).toHaveLength(visual.text.data_table.rows.length + 1);
  });

  it('writes a part\'s share and a scatter plot\'s second number in the data table', async () => {
    const donut = asDraft(draftWith(stored('donut'))).sections[0].visual as ChartVisual;
    render(<ChartFigure visual={donut}/>);
    await userEvent.setup().click(screen.getByText('Description and data table'));
    const firstRow = within(screen.getByRole('table')).getAllByRole('row')[1];
    // 2,400,000 of 2,707,000 is 88.66%: one decimal, as on the chart.
    expect(within(firstRow).getAllByRole('cell').map(c => c.textContent)).toEqual(['Meridian Holdings Ltd †', '$2.4M', '88.7%', '1']);
    cleanup();

    const scatter = asDraft(draftWith(stored('scatter'))).sections[0].visual as ChartVisual;
    render(<ChartFigure visual={scatter}/>);
    await userEvent.setup().click(screen.getByText('Description and data table'));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent));
    expect(rows).toContainEqual(['Alaric Voss', '2', '$295K', '2']);
    expect(tableCells(scatter.text.data_table.rows, scatter.text.data_table.rows[0]).map(c => c.key)).toEqual(['x', 'value', 'records']);
    cleanup();

    // A timeline: each event with when it happened and how far it is verified, and no single-record mark (an event is one record).
    const timeline = asDraft(draftWith(stored('timeline'))).sections[0].visual as ChartVisual;
    render(<ChartFigure visual={timeline}/>);
    await userEvent.setup().click(screen.getByText('Description and data table'));
    const events = within(screen.getByRole('table')).getAllByRole('row').map(r => within(r).queryAllByRole('cell').map(c => c.textContent));
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Event', 'When', 'Status', 'Records']);
    expect(events).toContainEqual(['Alaric Voss appointed director', '11 Jun 2019', 'verified', '1']);
    expect(events).toContainEqual(['Bellcastle becomes sole owner', 'Feb 2021 (month only)', 'verified', '1']);
  });

  it('shows each kind on its slide', async () => {
    const visual = asDraft(draftWith(stored('treemap'))).sections[0].visual!;
    const slides: DeckSlide[] = [{kind: 'content', heading: 'Who got paid', bullets: [], evidence: [], visual}];
    render(<SlideStyleProvider theme={DEFAULT_THEME}><SlideCanvas slide={slides[0]} page={1} contentIndex={1} contentTotal={1} deckTitle="Money" lookup={buildCitationLookup(slides)} sourceCount={5}/></SlideStyleProvider>);
    expect(await screen.findByTestId('slide-chart')).toBeInTheDocument();
    expect(await screen.findByTestId('echarts-canvas')).toBeInTheDocument();
    expect((reactEChartsCoreSpy.mock.calls[0][0] as {option: unknown}).option).toEqual(stored('treemap').option);
  });
});

describe('a treemap slide shows what the deck export will (slide_drawing)', () => {
  const treemap = (): JsonObject => {
    const fixture = (kinds as unknown as Record<string, JsonObject>).treemap;
    return {type: 'chart', spec: fixture.spec, data: fixture.data, report: {ok: true, errors: [], warnings: []}, text: fixture.text,
      option: fixture.option, width: fixture.width, height: fixture.height};
  };
  const slideWith = (visual: JsonObject): ReactElement => {
    const chart = asDraft({...payload, sections: [{...(payload.sections as JsonObject[])[0], visual}]}).sections[0].visual!;
    const slides: DeckSlide[] = [{kind: 'content', heading: 'Who got paid', bullets: [], evidence: [], visual: chart}];
    return <SlideStyleProvider theme={DEFAULT_THEME}><SlideCanvas slide={slides[0]} page={1} contentIndex={1} contentTotal={1} deckTitle="Money" lookup={buildCitationLookup(slides)} sourceCount={5}/></SlideStyleProvider>;
  };
  const drawnOption = () => (reactEChartsCoreSpy.mock.calls.at(-1)![0] as {option: unknown}).option;

  it('draws the slide-scale drawing the deck stored', async () => {
    const slideOption = {series: [{type: 'treemap', data: []}], title: [{text: 'At slide scale'}]};
    render(slideWith({...treemap(), slide_drawing: {option: slideOption, width: 880, height: 351}}));
    expect((await screen.findByTestId('slide-chart')).dataset.drawing).toBe('slide');
    await screen.findByTestId('echarts-canvas');
    expect(drawnOption()).toEqual(slideOption);
  });

  it('shows the bars and the reason when the parts cannot be named at that size', async () => {
    const bars = {series: [{type: 'bar', data: [1, 2]}]};
    const note = "Treemap not drawn at this size (rule 12: 'Harborline Civic Trust' is too small in a treemap to show its name). The same parts are shown as bars.";
    render(slideWith({...treemap(), slide_drawing: {option: bars, width: 880, height: 351, note}}));
    expect((await screen.findByTestId('slide-chart')).dataset.drawing).toBe('bars');
    expect(screen.getByText(note)).toBeInTheDocument();
    await screen.findByTestId('echarts-canvas');
    expect(drawnOption()).toEqual(bars);
  });

  it('lists a timeline\'s events when the slide is too small to draw them', async () => {
    const fixture = (kinds as unknown as Record<string, JsonObject>).timeline;
    const visual = {type: 'chart', spec: fixture.spec, data: fixture.data, report: {ok: true, errors: [], warnings: []}, text: fixture.text,
      option: fixture.option, width: fixture.width, height: fixture.height,
      slide_drawing: {option: null, width: 400, height: 140, note: 'Timeline not drawn at this size (rule 14). The events are listed instead.'}};
    render(slideWith(visual));
    const slide = await screen.findByTestId('slide-chart');
    expect(slide.dataset.drawing).toBe('events');
    const rows = within(slide).getAllByRole('row').map(r => r.textContent);
    expect(rows[0]).toBe('EventWhenStatus');
    expect(rows).toContain('Consulting contract runs1 Mar 2022 – 31 Aug 2023asserted');
    expect(screen.queryByTestId('echarts-canvas')).toBeNull();
  });

  it('draws the checked option when the deck stored no slide drawing (native kinds, older decks)', async () => {
    render(slideWith(treemap()));
    expect((await screen.findByTestId('slide-chart')).dataset.drawing).toBe('design');
    await screen.findByTestId('echarts-canvas');
    expect(drawnOption()).toEqual(treemap().option);
  });
});

describe('the preview with a chart section', () => {
  it('shows the chart on its slide and in the brief', async () => {
    const draft = asDraft(payload);
    const slides: DeckSlide[] = [{kind: 'content', heading: 'Who got paid', bullets: ['Bellcastle got $2.4M'], evidence: [{record_type: 'evidence', record_id: 'ev-1'}], visual: draft.sections[0].visual}];
    const renderSlide = (): ReactElement => <SlideStyleProvider theme={DEFAULT_THEME}><SlideCanvas slide={slides[0]} page={1} contentIndex={1} contentTotal={1} deckTitle="Where the money went" lookup={buildCitationLookup(slides)} sourceCount={4}/></SlideStyleProvider>;
    render(renderSlide());
    expect(await screen.findByTestId('slide-chart')).toBeInTheDocument();
    expect(await screen.findByTestId('echarts-canvas')).toBeInTheDocument();
    cleanup();

    render(<DraftPreview payload={payload} slides={slides} citationDetails={[]}/>);
    await userEvent.setup().click(screen.getByRole('tab', {name: 'Brief'}));
    expect(await screen.findByTestId('chart-visual')).toBeInTheDocument();
  });
});
