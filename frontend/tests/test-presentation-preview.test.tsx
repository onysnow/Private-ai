// @vitest-environment jsdom
// The presentation_draft preview pieces on their own: the export-mirroring
// helpers (fit, dates, values), the slide/brief rendering of every visual
// type, and the record picker's search -> record_ref mapping.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {DraftPreview, asDraft} from '../components/presentation/draft-preview';
import {RecordPicker, toRecordType} from '../components/presentation/record-picker';
import type {SelectedRef} from '../components/presentation/record-picker';
import {DEFAULT_THEME, SlideCanvas, SlideStyleProvider, buildCitationLookup, displayDate, fitSize, fontStack, formatValue, resolveTheme, resolveVisualStyle, sortBarItems} from '../components/presentation/slide-canvas';
import {StylePanel} from '../components/presentation/style-panel';
import {ApiClient} from '../lib/api-client';
import type {CitationDetail, DeckSlide, JsonObject, PresentationVisual} from '../lib/api-types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const EV = {record_type: 'evidence', record_id: 'ev-1'};
const detail = (overrides: Partial<CitationDetail> = {}): CitationDetail => ({
  record_type: 'evidence', record_id: 'ev-1', trace_record_type: 'evidence', type_label: 'Evidence', label: 'Ex. 14, p. 3',
  quote: '$2,400,000.00 WIRE OUT BELLCASTLE', locator: 'Ex. 14, p. 3', source_title: 'Chancery filing', source_url: null, detail: null, missing: false, ...overrides,
});

describe('export-mirroring helpers', () => {
  it('formats dates without adding precision, and values compactly with currency', () => {
    expect(displayDate('2023-11-14')).toBe('14 Nov 2023');
    expect(displayDate('2023-11')).toBe('Nov 2023');
    expect(displayDate('Q4 2023')).toBe('Q4 2023');
    expect(formatValue(2400000, 'USD')).toBe('$2.4M');
    expect(formatValue(285000, 'USD')).toBe('$285K');
    expect(formatValue(12, 'shipments')).toBe('12 shipments');
  });

  it('shrinks the font until long text fits, like the .pptx export', () => {
    expect(fitSize(['Short'], 10, 1, [40, 30, 20])).toBe(40);
    expect(fitSize(['x'.repeat(600)], 10, 1, [40, 30, 20])).toBe(20);
  });

  it('numbers citations in first-appearance order across slide evidence and visual items', () => {
    const slides: DeckSlide[] = [
      {kind: 'content', heading: 'A', bullets: [], evidence: [{record_type: 'claim', record_id: 'c-1'}], visual: {type: 'figures', items: [{value: '1', label: 'x', evidence: [EV]}]}},
      {kind: 'content', heading: 'B', bullets: [], evidence: [EV, {record_type: 'entity', record_id: 'e-1'}]},
    ];
    const lookup = buildCitationLookup(slides, [detail()]);
    expect(Array.from(lookup.numbers.entries())).toEqual([['claim:c-1', 1], ['evidence:ev-1', 2], ['entity:e-1', 3]]);
  });
});

describe('DraftPreview', () => {
  const payload: JsonObject = {
    title: 'The fee', goal_restated: 'Explain the fee.', executive_takeaway: 'It was paid.',
    sections: [
      {heading: 'Sequence', body: 'First para.\n\nSecond para.', key_points: ['Agreement then wire'], evidence: [EV],
        visual: {type: 'timeline', items: [{date: '2023-11-03', label: 'Signed', evidence: [EV]}, {date: '2023-11-14', label: 'Wired', evidence: [EV]}]}},
      {heading: 'Compared', body: 'Bigger.', key_points: ['Largest'], evidence: [EV],
        visual: {type: 'bar', title: 'Fees', unit: 'USD', items: [{label: 'Bellcastle', value: 2400000, evidence: [EV]}, {label: 'Arden', value: 285000, evidence: [EV]}]}},
    ],
    open_questions: ['Who owns Bellcastle?'],
  };
  const draft = asDraft(payload);
  const slides: DeckSlide[] = [
    {kind: 'title', heading: 'The fee', bullets: ['Explain the fee.'], evidence: []},
    ...draft.sections.map(s => ({kind: 'content' as const, heading: s.heading, bullets: s.key_points, evidence: s.evidence, notes: s.body, visual: s.visual})),
  ];

  it('renders timeline and bar visuals on slides with human dates and compact values', async () => {
    const user = userEvent.setup();
    render(<DraftPreview payload={payload} slides={slides} citationDetails={[detail()]}/>);
    await user.click(screen.getByRole('tab', {name: 'Go to slide 2'}));
    const timeline = screen.getAllByTestId('slide-timeline')[0];
    expect(within(timeline).getByText('3 Nov 2023')).toBeInTheDocument();
    expect(within(timeline).getByText('14 Nov 2023')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Next slide'}));
    const chart = screen.getAllByTestId('slide-bar-chart')[0];
    expect(within(chart).getByText('$2.4M')).toBeInTheDocument();
    expect(within(chart).getByText('$285K')).toBeInTheDocument();
  });

  it('renders the brief with the takeaway, every paragraph, citations, and open questions', async () => {
    const user = userEvent.setup();
    render(<DraftPreview payload={payload} slides={slides} citationDetails={[detail()]}/>);
    await user.click(screen.getByRole('tab', {name: 'Brief'}));
    const brief = screen.getByTestId('brief-preview');
    expect(within(brief).getByText('It was paid.')).toBeInTheDocument();
    expect(within(brief).getByText('First para.')).toBeInTheDocument();
    expect(within(brief).getByText(/Second para\./)).toBeInTheDocument();
    expect(within(brief).getByText('Who owns Bellcastle?')).toBeInTheDocument();
    expect(within(brief).getAllByTitle('Evidence: Ex. 14, p. 3').length).toBeGreaterThan(0);
  });

  it('shows a slidedoc\'s prose on its slides in place of the bullets', async () => {
    const user = userEvent.setup();
    render(<DraftPreview payload={payload} slides={slides} citationDetails={[detail()]} deckKind="slidedoc"/>);
    await user.click(screen.getByRole('tab', {name: 'Go to slide 2'}));
    const prose = screen.getAllByTestId('slide-prose')[0];
    expect(within(prose).getByText('First para.')).toBeInTheDocument();
    expect(within(prose).getByText('Second para.')).toBeInTheDocument();
    expect(within(prose).queryByText('Agreement then wire')).toBeNull();
  });

  it('marks a section resting on one record and closes with how we know and the limits', async () => {
    const user = userEvent.setup();
    const limited: JsonObject = {...payload, limits: ['The ledger is the payer\'s own account.']};
    render(<DraftPreview payload={limited} slides={slides} citationDetails={[detail()]} howWeKnow="This rests on 1 record in the investigation: 1 evidence record. † marks a statement that rests on one record."/>);
    await user.click(screen.getByRole('tab', {name: 'Brief'}));
    const brief = screen.getByTestId('brief-preview');
    // Each section here cites one evidence record, so each carries the mark.
    expect(within(brief).getAllByTitle('Rests on one record')).toHaveLength(2);
    const limits = within(screen.getByTestId('brief-limits'));
    expect(limits.getByText(/^This rests on 1 record/)).toBeInTheDocument();
    expect(limits.getByText('The ledger is the payer\'s own account.')).toBeInTheDocument();
  });

  it('lists each key point with the words the quote check found in its record', async () => {
    const user = userEvent.setup();
    const checked: JsonObject = {...payload, sections: [{...(payload.sections as JsonObject[])[0],
      key_point_evidence: [[{...EV, quote: '$2,400,000.00 WIRE OUT', matched_text: '$2,400,000.00 WIRE OUT', locator: 'p. 3', start_char: 0, end_char: 22}]]}]};
    render(<DraftPreview payload={checked} slides={slides} citationDetails={[detail()]}/>);
    await user.click(screen.getByRole('tab', {name: 'Brief'}));
    const quotes = screen.getByTestId('checked-quotes');
    expect(quotes).toHaveTextContent('Quotes found in the records (1 key point)');
    expect(quotes).toHaveTextContent('Agreement then wire');
    expect(within(quotes).getByText('“$2,400,000.00 WIRE OUT”').tagName).toBe('MARK');
    expect(quotes).toHaveTextContent('— Ex. 14, p. 3, p. 3');
  });

  it('marks a deleted record instead of tracing it', async () => {
    const user = userEvent.setup();
    const onTrace = vi.fn();
    render(<DraftPreview payload={payload} slides={slides} citationDetails={[detail({missing: true, label: 'Record no longer available'})]} onTrace={onTrace}/>);
    await user.click(screen.getByRole('tab', {name: 'Sources · 1'}));
    const chip = screen.getByTestId('evidence-chip');
    expect(chip).toHaveTextContent('Record no longer available');
    expect(chip).toBeDisabled();
  });
});

describe('RecordPicker', () => {
  it('maps search hits to record_refs, using "task" for a reporting task and skipping unselectable types', async () => {
    const user = userEvent.setup();
    expect(toRecordType('reporting_task')).toBe('task');
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      results: [
        {type: 'reporting_task', group: 'workflow', id: 't-1', investigation_id: 'inv-1', title: 'Request registry extract', snippet: '', score: 1, provenance: {}, metadata: {}},
        {type: 'connector_finding', group: 'external_lead', id: 'f-1', investigation_id: 'inv-1', title: 'Aleph hit', snippet: '', score: 1, provenance: {}, metadata: {}},
      ],
      counts: {}, group_counts: {},
    }), {status: 200, headers: {'content-type': 'application/json'}}));
    vi.stubGlobal('fetch', fetchMock);
    let selected: SelectedRef[] = [];
    const onChange = vi.fn((next: SelectedRef[]) => { selected = next; });
    render(<RecordPicker api={new ApiClient('http://api.test')} investigationId="inv-1" selected={selected} onChange={onChange}/>);
    await user.type(screen.getByLabelText('Search records to add'), 'registry{Enter}');
    await user.click(await screen.findByRole('button', {name: 'Add Task: Request registry extract'}));
    expect(onChange).toHaveBeenLastCalledWith([{record_type: 'task', record_id: 't-1', label: 'Request registry extract'}]);
    expect(screen.queryByText('Aleph hit')).not.toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/search?q=registry&investigation_id=inv-1');
  });
});

describe('styles: themes, presets and options', () => {
  const ev = [EV];
  const bar = {type: 'bar' as const, title: 'Fees', unit: 'USD', items: [
    {label: 'Arden', value: 285000, evidence: ev}, {label: 'Bellcastle', value: 2400000, evidence: ev}, {label: 'Corvo', value: 900000, evidence: ev},
  ]};
  const catalog = {
    defaults: {theme: 'dark_academia', fonts: 'theme'},
    themes: [{...DEFAULT_THEME}, {...DEFAULT_THEME, id: 'ledger', label: 'Ledger', page: 'FBFCFD', accent: '13837A', bar_muted: 'C3CFDA', heading_font: 'IBM Plex Serif', body_font: 'IBM Plex Sans'}],
    font_pairs: [{id: 'theme', label: 'Theme default', heading: '', body: ''}, {id: 'modern', label: 'Modern', heading: 'Newsreader', body: 'Inter'}],
    visual_presets: {
      bar: [
        {id: 'horizontal', label: 'Horizontal', description: '', layout: {orientation: 'horizontal', axis_line: true}, options: {sort: 'as_given', value_labels: true, gridlines: false, thickness: 'regular', highlight: []}},
        {id: 'ranked', label: 'Ranked', description: '', layout: {orientation: 'horizontal', axis_line: true}, options: {sort: 'desc', value_labels: true, gridlines: false, thickness: 'regular', highlight: []}},
        {id: 'column', label: 'Column', description: '', layout: {orientation: 'vertical', axis_line: true}, options: {sort: 'as_given', value_labels: true, gridlines: false, thickness: 'regular', highlight: []}},
      ],
      timeline: [
        {id: 'track', label: 'Horizontal track', description: '', layout: {direction: 'horizontal', compact: false}, options: {marker: 'ring', show_line: true}},
        {id: 'list', label: 'Vertical list', description: '', layout: {direction: 'vertical', compact: false}, options: {marker: 'dot', show_line: true}},
      ],
      figures: [{id: 'cards', label: 'Cards', description: '', layout: {arrangement: 'stack'}, options: {card_fill: true, accent_edge: true, value_color: 'alert'}}],
    },
    visual_options: {
      bar: {sort: {type: 'choice' as const, label: 'Sort', values: ['as_given', 'desc', 'asc']}, value_labels: {type: 'bool' as const, label: 'Value labels'}, highlight: {type: 'labels' as const, label: 'Highlight bars (others turn grey)'}},
      timeline: {marker: {type: 'choice' as const, label: 'Marker', values: ['ring', 'dot']}},
      figures: {},
    },
  };

  it('resolves themes with font pairings, and presets with option overrides', () => {
    const theme = resolveTheme(catalog, {theme: 'ledger', fonts: 'modern'});
    expect(theme.page).toBe('FBFCFD');
    expect([theme.heading_font, theme.body_font]).toEqual(['Newsreader', 'Inter']);
    expect(resolveTheme(null, {theme: 'ledger', fonts: 'theme'}).id).toBe('dark_academia');
    const style = resolveVisualStyle({...bar, style: {preset: 'ranked', options: {value_labels: false}}}, catalog.visual_presets);
    expect(style.preset).toBe('ranked');
    expect(style.options).toMatchObject({sort: 'desc', value_labels: false});
    expect(resolveVisualStyle({...bar, style: {preset: 'nope'}}, catalog.visual_presets).preset).toBe('horizontal');
    expect(sortBarItems(bar.items, 'desc').map(i => i.label)).toEqual(['Bellcastle', 'Corvo', 'Arden']);
    expect(fontStack('Inter', 'body')).toContain("'Inter Variable'");
  });

  const slideWith = (visual: PresentationVisual): DeckSlide => ({kind: 'content', heading: 'Compared', bullets: ['Largest fee'], evidence: ev, visual});
  const renderSlide = (visual: PresentationVisual, themeId = 'dark_academia') => render(
    <SlideStyleProvider theme={resolveTheme(catalog, {theme: themeId, fonts: 'theme'})} presets={catalog.visual_presets}>
      <SlideCanvas slide={slideWith(visual)} page={3} contentIndex={1} contentTotal={1} deckTitle="Deck" lookup={buildCitationLookup([slideWith(visual)], [detail()])} sourceCount={1}/>
    </SlideStyleProvider>,
  );

  it('ranks, highlights and keeps every value when the bar preset changes', () => {
    renderSlide({...bar, style: {preset: 'ranked', options: {highlight: ['Bellcastle']}}}, 'ledger');
    const chart = screen.getByTestId('slide-bar-chart');
    expect(chart).toHaveAttribute('data-preset', 'ranked');
    const bars = Array.from(chart.querySelectorAll('[data-bar]')) as HTMLElement[];
    expect(bars.map(b => b.dataset.bar)).toEqual(['Bellcastle', 'Corvo', 'Arden']);
    expect(bars.map(b => b.style.background)).toEqual(['rgb(19, 131, 122)', 'rgb(195, 207, 218)', 'rgb(195, 207, 218)']);
    for (const value of ['$2.4M', '$900K', '$285K']) expect(within(chart).getByText(value)).toBeInTheDocument();
  });

  it('shows a value axis whenever value labels are turned off', () => {
    renderSlide({...bar, style: {preset: 'column', options: {value_labels: false}}});
    const chart = screen.getByTestId('slide-bar-chart');
    expect(chart).toHaveAttribute('data-preset', 'column');
    expect(within(chart).getByText('$0')).toBeInTheDocument();  // the axis starts at zero
    expect(within(chart).getByText('$2.4M')).toBeInTheDocument();  // its top tick is the largest value
    expect(within(chart).queryByText('$285K')).not.toBeInTheDocument();  // no per-bar labels
  });

  it('draws a timeline as a vertical list without changing its dates', () => {
    renderSlide({type: 'timeline', items: [{date: '2023-11-03', label: 'Signed', evidence: ev}, {date: '2023-11', label: 'Wired', evidence: ev}], style: {preset: 'list'}});
    const timeline = screen.getByTestId('slide-timeline');
    expect(timeline).toHaveAttribute('data-preset', 'list');
    expect(within(timeline).getByText('3 Nov 2023')).toBeInTheDocument();
    expect(within(timeline).getByText('Nov 2023')).toBeInTheDocument();
  });

  it('style panel: theme, preset, option and highlight changes call back with the new style', async () => {
    const user = userEvent.setup();
    const onDeck = vi.fn();
    const onVisual = vi.fn();
    render(<StylePanel catalog={catalog} deckStyle={{theme: 'dark_academia', fonts: 'theme'}} onDeckStyle={onDeck} visual={{...bar, style: {preset: 'horizontal'}}} onVisualStyle={onVisual}/>);
    await user.selectOptions(screen.getByLabelText('Theme'), 'ledger');
    expect(onDeck).toHaveBeenLastCalledWith({theme: 'ledger', fonts: 'theme'});
    await user.selectOptions(screen.getByLabelText('Font pairing'), 'modern');
    expect(onDeck).toHaveBeenLastCalledWith({theme: 'dark_academia', fonts: 'modern'});
    await user.click(screen.getByRole('radio', {name: 'Column'}));
    expect(onVisual).toHaveBeenLastCalledWith({preset: 'column', options: {}});
    await user.click(screen.getByLabelText('Value labels'));
    expect(onVisual).toHaveBeenLastCalledWith({preset: 'horizontal', options: {value_labels: false}});
    await user.click(screen.getByRole('button', {name: 'Corvo'}));
    expect(onVisual).toHaveBeenLastCalledWith({preset: 'horizontal', options: {highlight: ['Corvo']}});
    expect(screen.queryByText(/axis min|3D|dual/i)).not.toBeInTheDocument();
  });
});
