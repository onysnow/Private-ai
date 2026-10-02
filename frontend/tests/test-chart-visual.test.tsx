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

import {ChartFigure, fitScale} from '../components/presentation/chart-visual';
import {DraftPreview, asDraft} from '../components/presentation/draft-preview';
import {SlideCanvas, SlideStyleProvider, DEFAULT_THEME, buildCitationLookup, visualRefs} from '../components/presentation/slide-canvas';
import type {ChartVisual, DeckSlide, JsonObject} from '../lib/api-types';

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
