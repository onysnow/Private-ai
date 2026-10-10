// @vitest-environment jsdom
// Component test for the TAS reasoning review panel (issue #36 follow-up).
// Rendered on its own with a fresh ApiClient and a stubbed fetch, so the
// run -> queue -> open -> accept flow is exercised end to end without the
// rest of app/page.tsx, and without any real model call.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AiReasoningPanel, WritingReport, describeAiStatus} from '../components/ai-reasoning-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {AiReasoningStatus} from '../lib/api-types';

// The panel's plain calls are generated ones (lib/generated), sent through the app's API client.
beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const readyStatus: AiReasoningStatus = {
  enabled: true,
  provider: 'anthropic',
  provider_key_configured: true,
  endpoints_callable: true,
  authority_suite: {
    present: true,
    source: 'onysnow/Authority-System-Suite@b1c71e8',
    tas_version: '1.12',
    modules: {
      case_synthesis: {spec_file: 'PROMPT_MODULES/08_CASE_SYNTHESIS.md', available: true},
      hypothesis_test: {spec_file: 'PROMPT_MODULES/06_HYPOTHESIS_AND_CONTRADICTION_TESTING.md', available: true},
    },
  },
};

const summary = (overrides: Record<string, unknown> = {}) => ({
  id: 'cand-1',
  investigation_id: 'inv-1',
  module: 'case_synthesis',
  request: {question: 'What did Ada North sign?', working_theory: null, max_results: 30, include_external_leads: true},
  review_status: 'proposed',
  confidence: 0,
  reviewer_note: null,
  accepted_record_type: null,
  accepted_record_id: null,
  created_at: '2026-09-21T22:00:00',
  reviewed_at: null,
  checked_citation_count: 1,
  rejection_reason: null,
  ...overrides,
});

const fullCandidate = (overrides: Record<string, unknown> = {}) => ({
  ...summary(),
  payload: {
    executive_summary: 'Ada North signed an agreement, per one directly cited filing.',
    claims: [{
      claim_id: 'CLM-0001',
      claim: 'Ada North signed the agreement.',
      classification: 'CORROBORATED_FACT',
      supporting_evidence: [{record_type: 'evidence', record_id: 'ev-1'}],
      contradicting_evidence: [],
      warrant: 'The filing directly quotes the signature.',
      confidence: 'HIGH',
      confidence_term: 'VERY_LIKELY',
      confidence_basis: 'single direct primary source',
      limitations: [],
    }],
    most_likely_failure: 'The filing could be a draft that was never executed.',
    right_of_reply_needed: [{subject: 'Ada North', claim_ids: ['CLM-0001'], what_will_be_said: 'That she signed the agreement.', draft_questions: ['Did you sign it on 4 March?']}],
    investigative_gaps: [{gap_id: 'GAP-0001', unresolved_question: 'Is there an independent corroborating source?', bears_on: ['CLM-0001'], needed_record_or_testimony: 'the executed copy'}],
  },
  checked_citation_ids: [{record_type: 'evidence', record_id: 'ev-1'}],
  trace: {system_prompt: 'You are operating under the Topic Authority System', user_prompt: 'RETRIEVAL PACKET (quoted)', response: {model: 'claude-test', truncated: false}},
  ...overrides,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

const requestUrl = (call: unknown[]): string => String(call[0]);
// A request's JSON body: text from a hand-written call, bytes from a generated one (ApiClient.fetchForGenerated passes them on).
async function sentBody(call: unknown[]): Promise<unknown> {
  const body = (call[1] as RequestInit | undefined)?.body;
  return JSON.parse(body instanceof Blob || (typeof body === 'object' && body !== null && 'text' in body) ? await (body as Blob).text() : String(body));
}
const requestMethod = (call: unknown[]): string => ((call[1] as RequestInit | undefined)?.method ?? 'GET');

describe('describeAiStatus', () => {
  it('explains each reason the endpoints are not callable, and says ready otherwise', () => {
    expect(describeAiStatus(undefined)).toMatch(/unavailable/);
    expect(describeAiStatus({...readyStatus, enabled: false})).toMatch(/disabled/);
    expect(describeAiStatus({...readyStatus, provider: null})).toMatch(/no provider/);
    expect(describeAiStatus({...readyStatus, provider_key_configured: false})).toMatch(/API key/);
    expect(describeAiStatus({...readyStatus, authority_suite: {...readyStatus.authority_suite, present: false}})).toMatch(/Authority System Suite copy .* is missing/);
    expect(describeAiStatus({...readyStatus, authority_suite: {...readyStatus.authority_suite, modules: {...readyStatus.authority_suite.modules, hypothesis_test: {spec_file: 'x', available: false}}}})).toMatch(/hypothesis_test/);
    expect(describeAiStatus(readyStatus)).toMatch(/Ready: provider anthropic, Authority System Suite \(TAS v1.12\)/);
    expect(describeAiStatus({...readyStatus, provider: 'ollama', model: 'llama3.2', runs_on_this_computer: true}))
      .toMatch(/Ready: provider ollama, model llama3.2 \(runs on this computer\), Authority System Suite \(TAS v1.12\)/);
    expect(describeAiStatus({...readyStatus, model: 'claude-x', runs_on_this_computer: false})).toMatch(/runs on the provider's servers/);
    expect(describeAiStatus({...readyStatus, provider: 'ollama', provider_key_configured: false})).toMatch(/no model is chosen/);
  });
});

describe('WritingReport', () => {
  it('lists what the writing check found, each with its practice, where it is, and the sentence', () => {
    render(<WritingReport report={{checked: ['likelihood'], findings: [
      {practice: 'likelihood', where: 'section 1 (\'The payment\')', sentence: 'It was probably a loan.', message: "'probably' is on ICD 203's second row"},
      {practice: 'single_source', where: 'section 1 (\'The payment\')', sentence: '$2.4M paid', message: 'rests on one record'},
    ]}}/>);
    const report = screen.getByTestId('writing-report');
    expect(report).toHaveTextContent('Writing check · 2 things to look at before accepting');
    expect(report).toHaveTextContent("Likelihood words (ICD 203) · section 1 ('The payment'): 'probably' is on ICD 203's second row");
    expect(report).toHaveTextContent('“It was probably a loan.”');
    expect(report).toHaveTextContent('Rests on one record');
  });

  it('says so when there is nothing to look at, and shows nothing for a run without the check', () => {
    const {container} = render(<WritingReport report={null}/>);
    expect(container).toBeEmptyDOMElement();
    render(<WritingReport report={{checked: [], findings: []}}/>);
    expect(screen.getByTestId('writing-report')).toHaveTextContent('nothing to look at');
  });
});

describe('AiReasoningPanel', () => {
  it('disables the run controls when AI is off, but still lists the existing queue', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({candidates: [summary({review_status: 'rejected', reviewer_note: 'Auto-rejected: invented citation'})]}));
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={{...readyStatus, enabled: false, endpoints_callable: false}} />);

    expect(screen.getByTestId('ai-status')).toHaveTextContent(/disabled/);
    expect(screen.getByRole('button', {name: 'Run module'})).toBeDisabled();
    expect(screen.getByLabelText('Question')).toBeDisabled();
    await screen.findByText('Auto-rejected: invented citation');
    expect(requestUrl(fetchMock.mock.calls[0])).toBe('http://api.test/api/investigations/inv-1/ai-analysis-candidates');
  });

  it('asks for an investigation before doing anything', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="" status={readyStatus} />);
    expect(screen.getByText('Select an investigation to run or review AI analysis.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs case synthesis, shows the proposed candidate with its citations, and records an accept', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({candidates: []})) // initial queue
      .mockResolvedValueOnce(jsonResponse({candidate_id: 'cand-1', review_status: 'proposed', payload: {}})) // POST case-synthesis
      .mockResolvedValueOnce(jsonResponse({candidates: [summary()]})) // queue reload
      .mockResolvedValueOnce(jsonResponse(fullCandidate())) // GET candidate
      .mockResolvedValueOnce(jsonResponse({id: 'cand-1', module: 'case_synthesis', review_status: 'accepted', reviewer_note: 'Looks right.', reviewed_at: '2026-09-21T22:05:00'})) // POST review
      .mockResolvedValueOnce(jsonResponse({candidates: [summary({review_status: 'accepted', reviewer_note: 'Looks right.'})]})) // queue reload
      .mockResolvedValueOnce(jsonResponse(fullCandidate({review_status: 'accepted', reviewer_note: 'Looks right.', reviewed_at: '2026-09-21T22:05:00'}))); // GET candidate
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} />);

    await screen.findByText('No AI analysis candidates yet for this investigation.');
    const runButton = screen.getByRole('button', {name: 'Run module'});
    expect(runButton).toBeDisabled(); // no question yet
    await user.type(screen.getByLabelText('Question'), 'What did Ada North sign?');
    await user.click(runButton);

    const detail = await screen.findByTestId('ai-candidate-detail');
    expect(screen.getByTestId('ai-run-status')).toHaveTextContent('Proposed for review (candidate cand-1). Nothing has been written to the investigation.');
    expect(within(detail).getByText('CLM-0001')).toBeInTheDocument();
    expect(within(detail).getByText(/Supports: evidence:ev-1/)).toBeInTheDocument();
    expect(within(detail).getByText('GAP-0001 · Is there an independent corroborating source? — needs the executed copy (bears on CLM-0001)')).toBeInTheDocument();
    expect(within(detail).getByText('Corroborated fact · Very likely · confidence High')).toBeInTheDocument();
    expect(within(detail).getByText('Most likely way this is wrong:').parentElement).toHaveTextContent('could be a draft that was never executed');
    expect(within(detail).getByTestId('right-of-reply')).toHaveTextContent('Ada North · on CLM-0001: That she signed the agreement.');
    expect(within(detail).getByTestId('right-of-reply')).toHaveTextContent('the AI never does');
    expect(within(detail).getByTestId('ai-trace')).toHaveTextContent('What the model was sent · claude-test');
    expect(within(detail).getByText(/Topic Authority System/)).toBeInTheDocument();

    const runCall = fetchMock.mock.calls[1];
    expect(requestUrl(runCall)).toBe('http://api.test/api/investigations/inv-1/assistant/case-synthesis');
    expect(requestMethod(runCall)).toBe('POST');
    expect(await sentBody(runCall)).toEqual({question: 'What did Ada North sign?', max_results: 30, include_external_leads: true});

    await user.type(screen.getByLabelText('Reviewer note'), 'Looks right.');
    await user.click(screen.getByRole('button', {name: 'Accept as trusted analysis'}));

    await waitFor(() => expect(screen.getByTestId('ai-review-status')).toHaveTextContent('Recorded: accepted.'));
    const reviewCall = fetchMock.mock.calls[4];
    expect(requestUrl(reviewCall)).toBe('http://api.test/api/ai-analysis-candidates/cand-1/review');
    expect(await sentBody(reviewCall)).toEqual({decision: 'accept', note: 'Looks right.'});
    // Once reviewed, the accept/reject controls are gone.
    expect(screen.queryByRole('button', {name: 'Accept as trusted analysis'})).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('follows a queued run in the background and opens its candidate when the job finishes', async () => {
    const user = userEvent.setup();
    const job = {id: 'job-7', kind: 'ai_reasoning', investigation_id: 'inv-1', subject_type: 'ai_run', subject_id: null,
      status: 'queued', finished: false, progress: null, message: 'Waiting for the model', error: null, attempts: 0, runner: 'procrastinate', result: null};
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({candidates: []})) // initial queue
      .mockResolvedValueOnce(jsonResponse({candidate_id: null, job}, 202)) // POST case-synthesis: queued
      .mockResolvedValueOnce(jsonResponse({...job, status: 'succeeded', finished: true, progress: 100, message: 'Proposed for review',
        result: {candidate_id: 'cand-1', review_status: 'proposed', payload: {}}})) // GET job
      .mockResolvedValueOnce(jsonResponse({candidates: [summary()]})) // queue reload
      .mockResolvedValueOnce(jsonResponse(fullCandidate())); // GET candidate
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} />);

    await screen.findByText('No AI analysis candidates yet for this investigation.');
    await user.type(screen.getByLabelText('Question'), 'What did Ada North sign?');
    await user.click(screen.getByRole('button', {name: 'Run module'}));

    await screen.findByTestId('ai-candidate-detail');
    expect(screen.getByTestId('ai-run-status')).toHaveTextContent('Proposed for review (candidate cand-1).');
    expect(requestUrl(fetchMock.mock.calls[2])).toBe('http://api.test/api/jobs/job-7');
  });

  it('shows the error a queued run finished with', async () => {
    const user = userEvent.setup();
    const job = {id: 'job-8', kind: 'ai_reasoning', investigation_id: 'inv-1', subject_type: 'ai_run', subject_id: null,
      status: 'failed', finished: true, progress: 0, message: 'Stopped with an error', error: 'Model output rejected', attempts: 1, runner: 'procrastinate',
      result: {status_code: 422, detail: {message: 'Model output rejected: none of its quotes could be found in the records it cites.', removed: []}}};
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({candidates: []}))
      .mockResolvedValueOnce(jsonResponse({candidate_id: null, job: {...job, status: 'queued', finished: false, result: null}}, 202))
      .mockResolvedValueOnce(jsonResponse(job))
      .mockResolvedValueOnce(jsonResponse({candidates: []}));
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} />);

    await screen.findByText('No AI analysis candidates yet for this investigation.');
    await user.type(screen.getByLabelText('Question'), 'Who signed?');
    await user.click(screen.getByRole('button', {name: 'Run module'}));
    await waitFor(() => expect(screen.getByTestId('ai-run-status')).toHaveTextContent(/none of its quotes could be found.*422/));
  });

  it('surfaces a citation rejection from the backend instead of a proposed candidate', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({candidates: []}))
      .mockResolvedValueOnce(jsonResponse({detail: {message: 'Model output rejected: referenced evidence not present in the retrieval packet.', invalid_citations: [{record_type: 'evidence', record_id: 'INVENTED'}]}}, 422))
      .mockResolvedValueOnce(jsonResponse({candidates: [summary({review_status: 'rejected', reviewer_note: 'Auto-rejected: model referenced 1 citation(s) absent from the retrieval packet'})]}));
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} />);

    await screen.findByText('No AI analysis candidates yet for this investigation.');
    await user.type(screen.getByLabelText('Question'), 'Who else signed?');
    await user.click(screen.getByRole('button', {name: 'Run module'}));

    await waitFor(() => expect(screen.getByTestId('ai-run-status')).toHaveTextContent(/422/));
    await screen.findByText(/Auto-rejected: model referenced 1 citation/);
    expect(screen.queryByTestId('ai-candidate-detail')).not.toBeInTheDocument();
  });

  it('requires a working theory for a hypothesis test and sends it when present', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({candidates: []}))
      .mockResolvedValueOnce(jsonResponse({candidate_id: 'cand-2', review_status: 'proposed', payload: {}}))
      .mockResolvedValueOnce(jsonResponse({candidates: [summary({id: 'cand-2', module: 'hypothesis_test', request: {question: 'Did Ada act alone?', working_theory: 'Ada acted alone.'}})]}))
      .mockResolvedValueOnce(jsonResponse(fullCandidate({id: 'cand-2', module: 'hypothesis_test', request: {question: 'Did Ada act alone?', working_theory: 'Ada acted alone.'}, payload: {
        working_theory: 'Ada acted alone.',
        hypothesis_matrix: [{hypothesis_id: 'HYP-0001', hypothesis: 'Ada acted alone.', supporting_evidence: [{record_type: 'evidence', record_id: 'ev-1'}], contradicting_evidence: [], kind: 'WORKING_THEORY', viable: true, ambiguous_evidence: [], non_diagnostic_evidence: [{record_type: 'evidence', record_id: 'ev-2'}], assumptions: [], falsifiers: ['A co-signature on the filing'], missing_records: [], assessment: 'Viable but untested.', limitations: []}],
        contradiction_log: [{conflict_id: 'CFLT-0001', statement_a: {statement: 'Signed 4 March', evidence: [{record_type: 'evidence', record_id: 'ev-1'}]}, statement_b: {statement: 'Signed 5 March', evidence: [{record_type: 'evidence', record_id: 'ev-3'}]}, same_proposition: true, same_proposition_basis: 'Same agreement, same signature.', conflict_type: 'DIRECT CONTRADICTION', resolution: null, resolving_evidence: [], limitations: []}],
        conclusion: 'HYP-0001 remains viable; no contradicting record located.',
      }})));
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} />);

    await screen.findByText('No AI analysis candidates yet for this investigation.');
    // Opened via focus + ArrowDown rather than a click on the trigger: this
    // suite's earlier tests each mount/unmount an AiReasoningPanel sharing
    // one jsdom document, and userEvent.click(trigger) reliably fails to
    // register a Radix Select's opening pointerdown when run after them
    // (reproduced in isolation -- a plain fireEvent.pointerDown does open
    // it, so the trigger and component are not at fault; something in
    // userEvent's own pointer/hover bookkeeping is left in a state that
    // only affects this file's later tests). Keyboard-triggered opening
    // sidesteps that pointer-state dependency entirely and is itself a
    // real, accessible way to operate this control.
    const moduleTrigger = screen.getByLabelText('Reasoning module');
    moduleTrigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Hypothesis test'}));
    await user.type(screen.getByLabelText('Question'), 'Did Ada act alone?');
    await user.click(screen.getByRole('button', {name: 'Run module'}));
    expect(screen.getByTestId('ai-run-status')).toHaveTextContent('A working theory is required for a hypothesis test.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Working theory'), 'Ada acted alone.');
    await user.click(screen.getByRole('button', {name: 'Run module'}));
    const detail = await screen.findByTestId('ai-candidate-detail');
    const runCall = fetchMock.mock.calls[1];
    expect(requestUrl(runCall)).toBe('http://api.test/api/investigations/inv-1/assistant/hypothesis-test');
    expect(await sentBody(runCall)).toEqual({question: 'Did Ada act alone?', max_results: 30, include_external_leads: true, working_theory: 'Ada acted alone.'});
    expect(within(detail).getByText('HYP-0001')).toBeInTheDocument();
    expect(within(detail).getByText('Working theory · still viable')).toBeInTheDocument();
    expect(within(detail).getByText(/Fits every hypothesis \(not counted\): evidence:ev-2/)).toBeInTheDocument();
    expect(within(detail).getByText('Direct contradiction · open')).toBeInTheDocument();
    expect(within(detail).getByText('A: Signed 4 March [evidence:ev-1]')).toBeInTheDocument();
    expect(within(detail).getAllByText(/A co-signature on the filing/).length).toBeGreaterThan(0); // rendered falsifier (+ the raw-payload <pre>)
    expect(within(detail).getAllByText(/HYP-0001 remains viable/).length).toBeGreaterThan(0);
  });

  it('requires a goal and at least one picked record before a presentation draft can run', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({candidates: []}));
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} />);
    await screen.findByText('No AI analysis candidates yet for this investigation.');

    const moduleTrigger = screen.getByLabelText('Reasoning module');
    moduleTrigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Presentation draft'}));

    expect(screen.queryByLabelText('Question')).not.toBeInTheDocument();
    const runButton = screen.getByRole('button', {name: 'Run module'});
    expect(runButton).toBeDisabled();
    await user.type(screen.getByLabelText('Goal'), 'Summarize the Bellcastle payment.');
    expect(runButton).toBeDisabled(); // goal alone isn't enough -- no evidence picked yet
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial queue load; nothing ran
  });

  const theme = (id: string, label: string) => ({id, label, description: '', cover_bg: '111111', cover_line: '333333', cover_text: 'FFFFFF', cover_muted: 'BDBDBD', cover_accent: 'FF5A6E', accent: 'C8102E', accent_text: 'A30D25', alert: '8B0A1E', page: 'FFFFFF', panel: 'F2F2F2', rule: 'D6D6D6', text: '111111', muted: '5E5E5E', bar_muted: 'C9C9C9', heading_font: 'Source Serif 4', body_font: 'Source Sans 3',
    // The Okabe-Ito colours every theme carries for parts of a whole (backend CATEGORICAL_PALETTE).
    palette: ['0072B2', 'D55E00', '009E73', 'CC79A7', '56B4E9', 'E69F00', 'F0E442']});
  const styleCatalog = {
    defaults: {theme: 'dark_academia', fonts: 'theme'},
    themes: [theme('dark_academia', 'Dark Academia'), theme('newsprint', 'Newsprint')],
    font_pairs: [{id: 'theme', label: 'Theme default', heading: '', body: ''}, {id: 'modern', label: 'Modern newsroom', heading: 'Newsreader', body: 'Inter'}],
    visual_presets: {
      bar: [{id: 'horizontal', label: 'Horizontal', description: '', layout: {orientation: 'horizontal'}, options: {}}],
      timeline: [{id: 'track', label: 'Horizontal track', description: '', layout: {direction: 'horizontal'}, options: {}}],
      figures: [
        {id: 'cards', label: 'Cards', description: '', layout: {arrangement: 'stack'}, options: {card_fill: true, accent_edge: true, value_color: 'alert'}},
        {id: 'row', label: 'Row of stats', description: '', layout: {arrangement: 'row'}, options: {card_fill: true, accent_edge: false, value_color: 'alert'}},
      ],
    },
    visual_options: {bar: {}, timeline: {}, figures: {card_fill: {type: 'bool', label: 'Card background'}}},
    // Checked charts' families, presets and options: this draft has no chart to restyle.
    chart_families: {}, chart_presets: {}, chart_options: {},
  };

  it('runs a presentation draft from picked evidence, previews it as slides and a brief, accepts it, and promotes it to a write-up and a deck', async () => {
    const user = userEvent.setup();
    const traced: string[] = [];
    const draftPayload = {
      title: 'The Bellcastle consulting fee',
      goal_restated: 'Summarize what the selected evidence shows about the Bellcastle payment.',
      executive_takeaway: 'Meridian paid Bellcastle $2.4M in November 2023.',
      sections: [{
        heading: 'The payment',
        body: 'Meridian paid Bellcastle Holdings a $2.4M consulting fee in November 2023.',
        key_points: ['$2.4M paid to Bellcastle', 'Dated November 2023'],
        evidence: [{record_type: 'claim', record_id: 'claim-1'}],
        visual: {type: 'figures', items: [{value: '$2.4M', label: 'wired 14 Nov 2023', evidence: [{record_type: 'claim', record_id: 'claim-1'}]}]},
      }],
      open_questions: ['Whether the fee was disclosed to the board.'],
    };
    const deckPreview = [
      {kind: 'title', heading: 'The Bellcastle consulting fee', bullets: [draftPayload.goal_restated], evidence: [], notes: '', visual: null},
      {kind: 'statement', heading: 'The takeaway', bullets: [draftPayload.executive_takeaway], evidence: [], notes: '', visual: null},
      {kind: 'content', heading: 'The payment', bullets: draftPayload.sections[0].key_points, evidence: draftPayload.sections[0].evidence, notes: draftPayload.sections[0].body, visual: draftPayload.sections[0].visual},
      {kind: 'questions', heading: "What the record doesn't yet show", bullets: draftPayload.open_questions, evidence: [], notes: '', visual: null},
    ];
    const citationDetails = [{record_type: 'claim', record_id: 'claim-1', trace_record_type: 'claim', type_label: 'Claim', label: 'Meridian paid Bellcastle $2.4M', quote: null, locator: null, source_title: null, source_url: null, detail: 'Claim · supported', missing: false}];
    const draftSummary = (overrides: Record<string, unknown> = {}) => summary({
      id: 'cand-9', module: 'presentation_draft',
      request: {question: 'Summarize the Bellcastle payment.', record_refs: [{record_type: 'claim', record_id: 'claim-1'}]},
      ...overrides,
    });
    const draftDetail = (overrides: Record<string, unknown> = {}) => ({...fullCandidate(), ...draftSummary(overrides), payload: draftPayload, deck_preview: deckPreview, citation_details: citationDetails});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({candidates: []})) // initial queue
      .mockResolvedValueOnce(jsonResponse({ // GET /api/search
        results: [{type: 'claim', group: 'reporting', id: 'claim-1', investigation_id: 'inv-1', title: 'Claim', snippet: 'Meridian paid Bellcastle $2.4M', score: 1, provenance: {}, metadata: {}, kind: 'claim_event'}],
        query: 'Bellcastle', investigation_id: 'inv-1', total: 1, returned: 1, counts: {claim: 1}, group_counts: {reporting: 1},
      }))
      .mockResolvedValueOnce(jsonResponse({candidate_id: 'cand-9', review_status: 'proposed', payload: {}})) // POST presentation-draft
      .mockResolvedValueOnce(jsonResponse({candidates: [draftSummary()]})) // queue reload
      .mockResolvedValueOnce(jsonResponse(draftDetail())) // GET candidate
      .mockResolvedValueOnce(jsonResponse(styleCatalog)) // GET /api/presentation-styles (once, on the first open draft)
      .mockResolvedValueOnce(jsonResponse({id: 'cand-9', module: 'presentation_draft', review_status: 'accepted', reviewer_note: null, reviewed_at: '2026-09-30T12:00:00'})) // POST review
      .mockResolvedValueOnce(jsonResponse({candidates: [draftSummary({review_status: 'accepted'})]})) // queue reload
      .mockResolvedValueOnce(jsonResponse(draftDetail({review_status: 'accepted', reviewed_at: '2026-09-30T12:00:00'}))) // GET candidate
      .mockResolvedValueOnce(jsonResponse({id: 'wu-1', investigation_id: 'inv-1', title: 'The Bellcastle consulting fee', status: 'draft', cited_record_refs: [{record_type: 'claim', record_id: 'claim-1'}], created_at: '2026-09-30T12:01:00', updated_at: '2026-09-30T12:01:00', word_count: 42,
        source_ai_candidate_id: 'cand-9', created_by: null, content_json: {type: 'doc', content: []}})) // POST promote-to-writeup
      .mockResolvedValueOnce(jsonResponse({id: 'dk-1', investigation_id: 'inv-1', title: 'The Bellcastle consulting fee', slides: deckPreview, slide_count: 4, created_at: '2026-09-30T12:02:00', updated_at: '2026-09-30T12:02:00',
        style: {theme: 'newsprint', fonts: 'theme'}, source_ai_candidate_id: 'cand-9', created_by: null})); // POST promote-to-deck
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} onTraceRecord={d => traced.push(`${d.trace_record_type}:${d.record_id}`)} />);
    await screen.findByText('No AI analysis candidates yet for this investigation.');

    const moduleTrigger = screen.getByLabelText('Reasoning module');
    moduleTrigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Presentation draft'}));
    await user.type(screen.getByLabelText('Goal'), 'Summarize the Bellcastle payment.');

    await user.type(screen.getByLabelText('Search records to add'), 'Bellcastle');
    await user.click(within(screen.getByTestId('presentation-record-picker')).getByRole('button', {name: 'Search'}));
    // A claim hit is labelled by its own text, not search's generic "Claim" title.
    await user.click(await screen.findByRole('button', {name: 'Add Claim: Meridian paid Bellcastle $2.4M'}));
    expect(screen.getByTestId('selected-count')).toHaveTextContent('Selected evidence · 1');

    const runButton = screen.getByRole('button', {name: 'Run module'});
    expect(runButton).not.toBeDisabled();
    await user.click(runButton);

    await screen.findByTestId('draft-preview');
    const runCall = fetchMock.mock.calls[2];
    expect(requestUrl(runCall)).toBe('http://api.test/api/investigations/inv-1/assistant/presentation-draft');
    expect(await sentBody(runCall)).toEqual({goal: 'Summarize the Bellcastle payment.', record_refs: [{record_type: 'claim', record_id: 'claim-1'}]});

    // Slides: title + takeaway + 1 content + questions + sources = 5 frames.
    expect(screen.getByTestId('slide-position')).toHaveTextContent('1 / 5');
    await user.click(screen.getByRole('button', {name: 'Next slide'}));
    await user.click(screen.getByRole('button', {name: 'Next slide'}));
    const contentSlide = screen.getAllByRole('img', {name: 'Slide 3: The payment'})[0];
    expect(within(contentSlide).getByText('$2.4M paid to Bellcastle')).toBeInTheDocument();
    expect(within(contentSlide).getAllByText('$2.4M').length).toBeGreaterThan(0); // figure card
    expect(screen.getByText('Speaker notes')).toBeInTheDocument();

    // Style panel: switch the theme, then the figures' layout preset on this slide.
    const panel = await screen.findByTestId('style-panel');
    await user.selectOptions(within(panel).getByLabelText('Theme'), 'newsprint');
    expect(screen.getAllByRole('img', {name: 'Slide 3: The payment'})[0]).toHaveAttribute('data-theme', 'newsprint');
    await user.click(within(panel).getByRole('radio', {name: 'Row of stats'}));
    expect(within(screen.getAllByRole('img', {name: 'Slide 3: The payment'})[0]).getByTestId('slide-figures')).toHaveAttribute('data-preset', 'row');

    // Sources tab: the readable label, and clicking it traces the record.
    await user.click(screen.getByRole('tab', {name: 'Sources · 1'}));
    const chip = await screen.findByTestId('evidence-chip');
    expect(chip).toHaveTextContent('Meridian paid Bellcastle $2.4M');
    expect(chip).not.toHaveTextContent('claim-1');
    await user.click(chip);
    expect(traced).toEqual(['claim:claim-1']);

    expect(screen.queryByTestId('promote-panel')).not.toBeInTheDocument(); // not accepted yet
    await user.click(screen.getByRole('button', {name: 'Accept as trusted analysis'}));
    await waitFor(() => expect(screen.getByTestId('ai-review-status')).toHaveTextContent('Recorded: accepted.'));

    const promotePanel = await screen.findByTestId('promote-panel');
    await user.click(within(promotePanel).getByRole('button', {name: 'Promote to write-up'}));
    await waitFor(() => expect(within(promotePanel).getByTestId('promote-status')).toHaveTextContent('Promoted to write-up "The Bellcastle consulting fee" (42 word(s), status draft).'));
    expect(within(promotePanel).getByRole('link', {name: 'Download .docx'})).toHaveAttribute('href', 'http://api.test/api/writeups/wu-1/export.docx');
    const writeupCall = fetchMock.mock.calls[9];
    expect(requestUrl(writeupCall)).toBe('http://api.test/api/ai-analysis-candidates/cand-9/promote-to-writeup');
    expect(await sentBody(writeupCall)).toEqual({});

    await user.click(within(promotePanel).getByRole('button', {name: 'Promote to deck'}));
    await waitFor(() => expect(within(promotePanel).getByTestId('promote-status')).toHaveTextContent('Promoted to deck "The Bellcastle consulting fee" (4 slide(s)).'));
    expect(within(promotePanel).getByRole('link', {name: 'Download .pptx'})).toHaveAttribute('href', 'http://api.test/api/decks/dk-1/export.pptx');
    // The deck goes out in the look picked in the style panel.
    const deckCall = fetchMock.mock.calls[10];
    expect(requestUrl(deckCall)).toBe('http://api.test/api/ai-analysis-candidates/cand-9/promote-to-deck');
    expect(await sentBody(deckCall)).toEqual({style: {theme: 'newsprint', fonts: 'theme'}, visual_styles: {'0': {preset: 'row', options: {}}}, deck_kind: 'presenting'});
  });

  it('lets presentation drafts run when the TAS spec is missing, and starts on that module', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({candidates: []}));
    vi.stubGlobal('fetch', fetchMock);
    const noTas: AiReasoningStatus = {
      ...readyStatus, endpoints_callable: false,
      authority_suite: {present: false, tas_version: null, modules: {
        case_synthesis: {spec_file: 'x', available: false}, hypothesis_test: {spec_file: 'y', available: false},
        presentation_draft: {spec_file: 'presentation_modules/PRESENTATION_DRAFT.md', available: true},
      }},
    };
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={noTas} />);
    await screen.findByText('No AI analysis candidates yet for this investigation.');
    expect(screen.getByTestId('ai-status')).toHaveTextContent(/Presentation drafts do not use it and are available/);
    expect(screen.getByLabelText('Goal')).not.toBeDisabled();
    expect(screen.getByLabelText('Search records to add')).not.toBeDisabled();
    expect(screen.queryByLabelText('Question')).not.toBeInTheDocument();
  });
});
