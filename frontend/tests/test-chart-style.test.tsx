// @vitest-environment jsdom
// A checked chart's style (visuals pass 3, item 5). The style panel offers
// the presets of the chart's family that the backend says the chart can
// take and the options of its kind, never a control the design refuses;
// every pick is drawn and checked again by POST
// /api/investigations/{id}/visuals/restyle, whose drawing the slide shows
// and whose check report and warnings the panel shows; promotion sends the
// style with the deck. The charts are the backend's own
// (test-support/chart-kinds.json); ECharts is mocked as in
// test-chart-builder.test.tsx.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Suspense, lazy} from 'react';
import type {ComponentType} from 'react';
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

import {AiReasoningPanel} from '../components/ai-reasoning-panel';
import {asChart} from '../components/presentation/chart-data';
import {applyVisualStyles} from '../components/presentation/draft-preview';
import {DEFAULT_THEME} from '../components/presentation/slide-canvas';
import {StylePanel} from '../components/presentation/style-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {AiReasoningStatus, ChartVisual, DeckSlide, JsonObject, PresentationStyleCatalog} from '../lib/api-types';
import type {ChartRestyleOut} from '../lib/generated/types.gen';
import {zChartRestyleOut} from '../lib/generated/zod.gen';
import kinds from '../test-support/chart-kinds.json';
import {mockApi} from '../test-support/mock-api';

// The panel's plain calls are generated ones (lib/generated), sent through the app's API client.
beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); reactEChartsCoreSpy.mockClear(); });

const stored = kinds as unknown as Record<string, JsonObject>;

/** One of the backend's stored charts, as a draft or a deck keeps it. */
function chart(kind: string): ChartVisual {
  const drawn = asChart({type: 'chart', ...stored[kind]});
  if (!drawn) throw new Error(`test-support/chart-kinds.json has no stored ${kind}`);
  return drawn;
}

/** The restyle route's reply for one stored chart, checked against the generated schema. */
function look(kind: string, extra: Record<string, unknown> = {}): ChartRestyleOut {
  const fixture = stored[kind];
  const text = fixture.text as JsonObject;
  return zChartRestyleOut.parse({
    spec: fixture.spec, data: fixture.data, option: fixture.option, width: fixture.width, height: fixture.height,
    alt_text: text.alt_text, description: text.description, source_line: text.source_line, data_table: text.data_table,
    report: {ok: true, errors: [], warnings: [], checked_rules: [0, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20], not_checked: {}, not_applicable: {}},
    style: {preset: '', options: {}}, presets: ['bar_100', 'donut'], default_preset: 'bar_100',
    options: {sort: 'as_ordered', other_after: 'all', thickness: 'regular', highlight: []}, warnings: [],
    ...extra,
  });
}

const DONUT_STYLE = {preset: 'donut', options: {}};
const donutLook = (extra: Record<string, unknown> = {}) => look('donut', {
  style: DONUT_STYLE, options: {sort: 'as_ordered', other_after: '3', centre_total: true, highlight: []}, ...extra,
});

// The parts-of-a-whole family as GET /api/presentation-styles lists it
// (backend app/services/presentation_style.py CHART_PRESETS, CHART_OPTIONS).
// The Okabe-Ito colours every theme carries for parts of a whole (backend CATEGORICAL_PALETTE); the page does not read them.
const OKABE_ITO = {palette: ['0072B2', 'D55E00', '009E73', 'CC79A7', '56B4E9', 'E69F00', 'F0E442']};
const catalog: PresentationStyleCatalog = {
  defaults: {theme: 'dark_academia', fonts: 'theme'},
  themes: [{...DEFAULT_THEME, ...OKABE_ITO}],
  font_pairs: [{id: 'theme', label: 'Theme default', heading: '', body: ''}],
  visual_presets: {bar: [], timeline: [], figures: []},
  visual_options: {bar: {}, timeline: {}, figures: {}},
  chart_families: {bar: 'bars', column: 'bars', stacked_bar_100: 'parts', donut: 'parts', treemap: 'parts'},
  chart_presets: {parts: [
    {id: 'bar_100', label: '100% bar', description: 'One bar that adds up to the whole, every part named.', kind: 'stacked_bar_100', options: {}},
    {id: 'donut', label: 'Donut with centre total', description: 'Four slices at most.', kind: 'donut', options: {other_after: '3', centre_total: true}},
    {id: 'treemap', label: 'Treemap', description: 'Rectangles sized by value.', kind: 'treemap', options: {}},
  ]},
  chart_options: {parts: {
    sort: {type: 'choice', label: 'Sort', values: ['as_ordered', 'value_desc', 'value_asc', 'label'], series: ['category', 'distribution']},
    other_after: {type: 'choice', label: 'Fold into Other after', values: ['all', '1', '2', '3', '4', '5', '6', '7'], series: ['category', 'distribution']},
    thickness: {type: 'choice', label: 'Bar thickness', values: ['thin', 'regular', 'thick'], kinds: ['stacked_bar_100']},
    centre_total: {type: 'bool', label: 'Total in the centre', kinds: ['donut']},
    highlight: {type: 'labels', label: 'Highlight (the others turn grey)'},
  }},
};

/** Every select and checkbox in the panel, by its label. */
const controls = () => [...screen.queryAllByRole('combobox'), ...screen.queryAllByRole('checkbox')].map(c => c.getAttribute('aria-label'));

describe('the style panel for a checked chart', () => {
  it('offers the presets the chart can take and the options of its kind, and nothing the design refuses', async () => {
    const user = userEvent.setup();
    const onVisual = vi.fn();
    render(<StylePanel catalog={catalog} deckStyle={catalog.defaults} onDeckStyle={vi.fn()} visual={chart('stacked_bar_100')} onVisualStyle={onVisual}
      chartLook={look('stacked_bar_100')}/>);

    const presets = within(screen.getByRole('radiogroup', {name: 'Chart preset'}));
    // The reply leaves the treemap out, so it is not offered.
    expect(presets.getAllByRole('radio').map(r => r.textContent)).toEqual(['100% bar', 'Donut with centre total']);
    expect(presets.getByRole('radio', {name: '100% bar'})).toHaveAttribute('aria-checked', 'true');
    // A 100% bar's options only: no centre total, and no control for an axis
    // above zero, 3D, a second value axis or a pulled-out slice.
    expect(controls()).toEqual(['Theme', 'Font pairing', 'Sort', 'Fold into Other after', 'Bar thickness']);
    expect(screen.getByLabelText('Fold into Other after')).toHaveValue('all');
    expect(screen.getByRole('group', {name: 'Highlight (the others turn grey)'})).toBeInTheDocument();
    expect(within(screen.getByRole('region', {name: 'Check report'})).getByText('Passes the design checks')).toBeInTheDocument();

    await user.click(presets.getByRole('radio', {name: 'Donut with centre total'}));
    expect(onVisual).toHaveBeenLastCalledWith({preset: 'donut', options: {}});
    await user.selectOptions(screen.getByLabelText('Sort'), 'value_desc');
    expect(onVisual).toHaveBeenLastCalledWith({options: {sort: 'value_desc'}});
    await user.click(screen.getByRole('button', {name: 'Alaric Voss'}));
    expect(onVisual).toHaveBeenLastCalledWith({options: {highlight: ['Alaric Voss']}});
    await user.click(screen.getByRole('button', {name: 'Reset chart style'}));
    expect(onVisual).toHaveBeenLastCalledWith({});
  });

  it('shows a warning beside its control, every failed rule by number, and why a style cannot be drawn', () => {
    const fiveSlices = donutLook({
      style: {preset: 'donut', options: {other_after: 'all'}}, options: {sort: 'as_ordered', other_after: 'all', centre_total: true, highlight: []},
      warnings: [{option: 'other_after', message: 'A donut reads best with four slices at most; this one has 5, and the check refuses it (rule 5).'}],
      report: {ok: false, errors: [{rule: 5, message: 'a donut has at most 4 slices; this one has 5'}], warnings: [], checked_rules: [5], not_checked: {}, not_applicable: {}},
    });
    render(<StylePanel catalog={catalog} deckStyle={catalog.defaults} onDeckStyle={vi.fn()} visual={chart('donut')} onVisualStyle={vi.fn()}
      chartLook={fiveSlices} chartProblem="the chart cannot be drawn this way"/>);

    expect(screen.getByRole('radio', {name: 'Donut with centre total'})).toHaveAttribute('aria-checked', 'true');
    expect(controls()).toEqual(['Theme', 'Font pairing', 'Sort', 'Fold into Other after', 'Total in the centre']);
    expect(screen.getByLabelText('Total in the centre')).toBeChecked();
    const fold = screen.getByLabelText('Fold into Other after').closest('div');
    expect(fold).toHaveTextContent('A donut reads best with four slices at most');
    expect(screen.getByText('Fails 1 design rule')).toBeInTheDocument();
    expect(within(screen.getByRole('list', {name: 'Failed rules'})).getByRole('listitem'))
      .toHaveTextContent('Rule 5 · A donut has four slices at most, adding to 100%: a donut has at most 4 slices; this one has 5');
    expect(screen.getByRole('alert')).toHaveTextContent('the chart cannot be drawn this way');
  });

  it('waits for the backend before offering a chart\'s options', () => {
    render(<StylePanel catalog={catalog} deckStyle={catalog.defaults} onDeckStyle={vi.fn()} visual={chart('stacked_bar_100')} onVisualStyle={vi.fn()}/>);
    expect(screen.getByText("Loading this chart's options…")).toBeInTheDocument();
    expect(controls()).toEqual(['Theme', 'Font pairing']);
  });
});

describe('a restyled chart on its slide', () => {
  it('replaces the section\'s chart with the drawing the backend checked, and leaves the other slides alone', () => {
    const figures = {type: 'figures' as const, items: [{value: '$2.4M', label: 'paid', evidence: []}]};
    const slides: DeckSlide[] = [
      {kind: 'title', heading: 'Deck', bullets: [], evidence: []},
      {kind: 'content', heading: 'Who received the money', bullets: [], evidence: [], visual: chart('stacked_bar_100')},
      {kind: 'content', heading: 'The fee', bullets: [], evidence: [], visual: figures},
    ];
    const styled = applyVisualStyles(slides, {'1': {preset: 'row'}}, {'0': donutLook()});
    const restyled = styled[1].visual as ChartVisual;
    expect(restyled.option).toEqual(stored.donut.option);
    expect(restyled.spec.kind).toBe('donut');
    expect(restyled.style).toEqual(DONUT_STYLE);
    // The rows, and so the sources, are the ones the draft cited.
    expect(restyled.data.rows).toEqual(chart('stacked_bar_100').data.rows);
    expect(styled[2].visual).toEqual({...figures, style: {preset: 'row'}});
    // Without a reply yet, the slide keeps the chart as it was drawn.
    expect(applyVisualStyles(slides, {}, {})[1]).toBe(slides[1]);
  });
});

describe('restyling a chart in a presentation draft', () => {
  const readyStatus: AiReasoningStatus = {
    enabled: true, provider: 'anthropic', provider_key_configured: true, endpoints_callable: true,
    tas_spec: {present: true, version: '1.8', modules: {presentation_draft: {spec_file: 'presentation_modules/PRESENTATION_DRAFT.md', available: true}}},
  };
  // A chart as a stored draft carries it: the checker's report is always kept with it.
  const visual = {type: 'chart', ...stored.stacked_bar_100, report: {ok: true, errors: [], warnings: []}};
  const payload = {
    title: 'Where the money went', goal_restated: 'Show who received the payments.', executive_takeaway: '',
    sections: [{heading: 'Who received the money', body: 'Meridian received most of it.', key_points: ['Meridian received most of the money'], evidence: [], visual}],
    open_questions: [],
  };
  const summary = {
    id: 'cand-7', investigation_id: 'inv-1', module: 'presentation_draft', request: {question: 'Show who received the payments.'},
    review_status: 'accepted', confidence: 0, reviewer_note: null, accepted_record_type: null, accepted_record_id: null,
    created_at: '2026-10-01T09:00:00', reviewed_at: '2026-10-01T09:05:00', checked_citation_count: 0, rejection_reason: null,
  };
  const detail = {
    ...summary, payload, checked_citation_ids: [], citation_details: [], trace: null,
    deck_preview: [
      {kind: 'title', heading: payload.title, bullets: [payload.goal_restated], evidence: [], notes: '', visual: null},
      {kind: 'content', heading: 'Who received the money', bullets: payload.sections[0].key_points, evidence: [], notes: payload.sections[0].body, visual},
    ],
  };
  const RESTYLE = 'POST /api/investigations/inv-1/visuals/restyle';
  const DECK = 'POST /api/ai-analysis-candidates/cand-7/promote-to-deck';

  it('draws the chart again in the preset picked, with its check report, and sends the style with the deck', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /api/investigations/inv-1/ai-analysis-candidates': {candidates: [summary]},
      'GET /api/ai-analysis-candidates/cand-7': detail,
      'GET /api/presentation-styles': catalog,
      [RESTYLE]: ({body}: {body: unknown}) => ((body as {style?: {preset?: string} | null}).style?.preset === 'donut' ? donutLook() : look('stacked_bar_100')),
      [DECK]: {id: 'dk-1', investigation_id: 'inv-1', title: payload.title, slides: detail.deck_preview, slide_count: 2, created_at: '2026-10-01T09:10:00',
        updated_at: '2026-10-01T09:10:00', style: {theme: 'dark_academia', fonts: 'theme'}, source_ai_candidate_id: 'cand-7', created_by: null},
    });
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus}/>);
    await user.click(await screen.findByRole('button', {name: 'Open'}));
    await screen.findByTestId('draft-preview');

    // Once the deck's look is known, the chart is drawn again in it, as it was ordered.
    await waitFor(() => expect(api.calls(RESTYLE)).toHaveLength(1));
    expect(api.lastBody(RESTYLE)).toEqual({chart: visual, style: null, deck_style: {theme: 'dark_academia', fonts: 'theme'}});

    await user.click(screen.getByRole('button', {name: 'Next slide'}));
    const panel = within(screen.getByTestId('style-panel'));
    await user.click(await panel.findByRole('radio', {name: 'Donut with centre total'}));
    await waitFor(() => expect(api.lastBody(RESTYLE)).toEqual({chart: visual, style: DONUT_STYLE, deck_style: {theme: 'dark_academia', fonts: 'theme'}}));

    // The slide draws the backend's checked donut, and the panel its options and report.
    await waitFor(() => expect(reactEChartsCoreSpy.mock.lastCall?.[0]).toMatchObject({option: stored.donut.option}));
    expect(await panel.findByLabelText('Total in the centre')).toBeChecked();
    expect(panel.getByRole('radio', {name: 'Donut with centre total'})).toHaveAttribute('aria-checked', 'true');
    expect(panel.getByText(/13 rules were checked for this donut/)).toBeInTheDocument();

    // A pick the backend cannot draw says why, and the slide keeps the last drawing.
    api.add({[RESTYLE]: {status: 422, body: {detail: 'the chart cannot be drawn this way'}}});
    await user.click(panel.getByLabelText('Total in the centre'));
    expect(await panel.findByRole('alert')).toHaveTextContent('the chart cannot be drawn this way');
    expect(api.lastBody(RESTYLE)).toEqual({chart: visual, style: {preset: 'donut', options: {centre_total: false}}, deck_style: {theme: 'dark_academia', fonts: 'theme'}});
    expect(reactEChartsCoreSpy.mock.lastCall?.[0]).toMatchObject({option: stored.donut.option});

    // Promotion sends the style; the deck draws and checks its charts once more itself.
    await user.click(screen.getByRole('button', {name: 'Promote to deck'}));
    await waitFor(() => expect(api.calls(DECK)).toHaveLength(1));
    expect(api.lastBody(DECK)).toEqual({style: {theme: 'dark_academia', fonts: 'theme'}, visual_styles: {'0': {preset: 'donut', options: {centre_total: false}}},
      deck_kind: 'presenting'});
    expect(api.unmatched()).toEqual([]);
  });
});
