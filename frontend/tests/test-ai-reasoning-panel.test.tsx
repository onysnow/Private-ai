// @vitest-environment jsdom
// Component test for the TAS reasoning review panel (issue #36 follow-up).
// Rendered on its own with a fresh ApiClient and a stubbed fetch, so the
// run -> queue -> open -> accept flow is exercised end to end without the
// rest of app/page.tsx, and without any real model call.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AiReasoningPanel, describeAiStatus} from '../components/ai-reasoning-panel';
import {ApiClient} from '../lib/api-client';
import type {AiReasoningStatus} from '../lib/api-types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const readyStatus: AiReasoningStatus = {
  enabled: true,
  provider: 'anthropic',
  provider_key_configured: true,
  endpoints_callable: true,
  tas_spec: {
    present: true,
    version: '1.8',
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
      confidence_basis: 'single direct primary source',
      limitations: [],
    }],
    investigative_gaps: ['No independent corroborating source located yet.'],
  },
  checked_citation_ids: [{record_type: 'evidence', record_id: 'ev-1'}],
  trace: {system_prompt: 'You are operating under the Topic Authority System', user_prompt: 'RETRIEVAL PACKET (quoted)', response: {model: 'claude-test', truncated: false}},
  ...overrides,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

const requestUrl = (call: unknown[]): string => String(call[0]);
const requestMethod = (call: unknown[]): string => ((call[1] as RequestInit | undefined)?.method ?? 'GET');

describe('describeAiStatus', () => {
  it('explains each reason the endpoints are not callable, and says ready otherwise', () => {
    expect(describeAiStatus(undefined)).toMatch(/unavailable/);
    expect(describeAiStatus({...readyStatus, enabled: false})).toMatch(/disabled/);
    expect(describeAiStatus({...readyStatus, provider: null})).toMatch(/no provider/);
    expect(describeAiStatus({...readyStatus, provider_key_configured: false})).toMatch(/API key/);
    expect(describeAiStatus({...readyStatus, tas_spec: {...readyStatus.tas_spec, present: false}})).toMatch(/not checked out/);
    expect(describeAiStatus({...readyStatus, tas_spec: {...readyStatus.tas_spec, modules: {...readyStatus.tas_spec.modules, hypothesis_test: {spec_file: 'x', available: false}}}})).toMatch(/hypothesis_test/);
    expect(describeAiStatus(readyStatus)).toMatch(/Ready: provider anthropic, TAS spec v1.8/);
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
    expect(within(detail).getByText('No independent corroborating source located yet.')).toBeInTheDocument();
    expect(within(detail).getByTestId('ai-trace')).toHaveTextContent('What the model was sent · claude-test');
    expect(within(detail).getByText(/Topic Authority System/)).toBeInTheDocument();

    const runCall = fetchMock.mock.calls[1];
    expect(requestUrl(runCall)).toBe('http://api.test/api/investigations/inv-1/assistant/case-synthesis');
    expect(requestMethod(runCall)).toBe('POST');
    expect(JSON.parse(String((runCall[1] as RequestInit).body))).toEqual({question: 'What did Ada North sign?', max_results: 30, include_external_leads: true});

    await user.type(screen.getByLabelText('Reviewer note'), 'Looks right.');
    await user.click(screen.getByRole('button', {name: 'Accept as trusted analysis'}));

    await waitFor(() => expect(screen.getByTestId('ai-review-status')).toHaveTextContent('Recorded: accepted.'));
    const reviewCall = fetchMock.mock.calls[4];
    expect(requestUrl(reviewCall)).toBe('http://api.test/api/ai-analysis-candidates/cand-1/review');
    expect(JSON.parse(String((reviewCall[1] as RequestInit).body))).toEqual({decision: 'accept', note: 'Looks right.'});
    // Once reviewed, the accept/reject controls are gone.
    expect(screen.queryByRole('button', {name: 'Accept as trusted analysis'})).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(7);
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
        hypothesis_matrix: [{hypothesis_id: 'HYP-0001', hypothesis: 'Ada acted alone.', supporting_evidence: [{record_type: 'evidence', record_id: 'ev-1'}], contradicting_evidence: [], diagnostic_value: 'non-diagnostic', assumptions: [], falsifiers: ['A co-signature on the filing'], missing_records: [], assessment: 'Viable but untested.'}],
        contradiction_log: [],
        conclusion: 'HYP-0001 remains viable; no contradicting record located.',
      }})));
    vi.stubGlobal('fetch', fetchMock);
    render(<AiReasoningPanel api={new ApiClient('http://api.test')} investigationId="inv-1" status={readyStatus} />);

    await screen.findByText('No AI analysis candidates yet for this investigation.');
    await user.selectOptions(screen.getByLabelText('Reasoning module'), 'hypothesis_test');
    await user.type(screen.getByLabelText('Question'), 'Did Ada act alone?');
    await user.click(screen.getByRole('button', {name: 'Run module'}));
    expect(screen.getByTestId('ai-run-status')).toHaveTextContent('A working theory is required for a hypothesis test.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Working theory'), 'Ada acted alone.');
    await user.click(screen.getByRole('button', {name: 'Run module'}));
    const detail = await screen.findByTestId('ai-candidate-detail');
    const runCall = fetchMock.mock.calls[1];
    expect(requestUrl(runCall)).toBe('http://api.test/api/investigations/inv-1/assistant/hypothesis-test');
    expect(JSON.parse(String((runCall[1] as RequestInit).body))).toEqual({question: 'Did Ada act alone?', max_results: 30, include_external_leads: true, working_theory: 'Ada acted alone.'});
    expect(within(detail).getByText('HYP-0001')).toBeInTheDocument();
    expect(within(detail).getAllByText(/A co-signature on the filing/).length).toBeGreaterThan(0); // rendered falsifier (+ the raw-payload <pre>)
    expect(within(detail).getAllByText(/HYP-0001 remains viable/).length).toBeGreaterThan(0);
  });
});
