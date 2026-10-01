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
import {buildCitationLookup, displayDate, fitSize, formatValue} from '../components/presentation/slide-canvas';
import {ApiClient} from '../lib/api-client';
import type {CitationDetail, DeckSlide, JsonObject} from '../lib/api-types';

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
