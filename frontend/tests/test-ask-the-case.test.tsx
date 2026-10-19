// @vitest-environment jsdom
// "Ask the case" in four steps (research AI §1–2, §6; mockups AI_1 and AI_2): opened from elsewhere with a question,
// the instructions and plan as a drawer inside the live view, and step 4, the answer reviewed claim by claim with
// grounded and guessed underlines.
import {act, cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BeforeYouRun} from '../features/ai/before-you-run';
import {acceptedByAPerson, reviewItems} from '../features/ai/claim-review';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {PLAN} from '../test-support/run-plan-fixture';

const BASE = '/api/investigations/inv-1/assistant';
const RUN = {run_id: 'run-1', status: 'succeeded', finished: true, module: 'case_synthesis', question: 'Who controlled Fernhill Ltd?', working_theory: null,
  created_at: '2026-10-12T10:00:00Z', started_at: '2026-10-12T10:00:00Z', finished_at: '2026-10-12T10:01:00Z', candidate_id: 'cand-1', review_status: 'proposed',
  events: 0, problems: 0, message: null, error: null,
  route: {system: 'tas', row: 2, node: 'tas/08', title: 'Case synthesis', modules_in_system: 13, final_audit: {node: 'tas/10', file: '10_FINAL_ACCURACY_AUDIT.md'}}};
const job = {id: 'job-2', kind: 'ai_reasoning', investigation_id: 'inv-1', subject_type: 'ai_run', subject_id: null, status: 'succeeded', finished: true,
  progress: 100, message: 'Proposed for review', error: null, attempts: 1, runner: 'inline', result: null,
  created_at: '2026-10-12T10:00:00Z', updated_at: '2026-10-12T10:01:00Z', started_at: '2026-10-12T10:00:00Z', finished_at: '2026-10-12T10:01:00Z'};
const claim = (id: string, text: string, refs: Array<{record_type: string; record_id: string}>, cls = 'SOURCE_STATEMENT') => ({
  claim_id: id, claim: text, classification: cls, confidence_term: 'LIKELY', confidence: 'MEDIUM', supporting_evidence: refs, contradicting_evidence: []});
const CAND = {id: 'cand-1', investigation_id: 'inv-1', module: 'case_synthesis', review_status: 'proposed', confidence: 0.5, created_at: '2026-10-12T10:01:00Z',
  payload: {claims: [claim('CLM-0001', 'Harbour Nominees held 62% of Fernhill Ltd.', [{record_type: 'document', record_id: 'doc-41-register'}]),
    claim('CLM-0002', 'Kestrel SA controlled those shares.', [], 'INFERENCE')]},
  rejection_reason: null, request: {}, reviewed_at: null, reviewer_note: null, trace: null, accepted_record_id: null, accepted_record_type: null,
  checked_citation_count: 1, checked_citation_ids: [{record_type: 'document', record_id: 'doc-41-register'}], claim_reviews: {}};

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({aiRun: null, askCase: null});
  window.history.replaceState(null, '', '/');
});
afterEach(() => cleanup());

describe('reviewItems', () => {
  it('reads claims and hypotheses, what they cite, which of it is in the packet, and your decision', () => {
    const items = reviewItems({...CAND, claim_reviews: {'CLM-0002': {decision: 'reject', text: null, reason: 'overstated', reviewed_at: 'x'}}});
    expect(items.map(i => [i.id, i.grounded.length, i.decision?.decision ?? null])).toEqual([['CLM-0001', 1, null], ['CLM-0002', 0, 'reject']]);
    expect(acceptedByAPerson(items[0], 'proposed')).toBe(false);
    expect(acceptedByAPerson(items[0], 'accepted')).toBe(true);
    expect(acceptedByAPerson(items[1], 'accepted')).toBe(false);
    const hyp = reviewItems({module: 'hypothesis_test', checked_citation_ids: [], claim_reviews: {}, payload: {hypothesis_matrix: [
      {hypothesis_id: 'HYP-0001', hypothesis: 'Acted alone', kind: 'LEAD', supporting_evidence: [{record_type: 'evidence', record_id: 'e1'}], contradicting_evidence: []}]}});
    expect(hyp).toEqual([expect.objectContaining({id: 'HYP-0001', text: 'Acted alone', classification: 'LEAD', grounded: []})]);
    expect(reviewItems({module: 'presentation_draft', payload: {sections: []}, checked_citation_ids: [], claim_reviews: {}})).toEqual([]);
  });
});

describe('Ask the case from elsewhere', () => {
  it('opens on step 1, Ask, with the question typed in the palette or on the case home', async () => {
    mockApi({[`GET ${BASE}/profile`]: PLAN.profile, 'GET /api/investigations/inv-1/ai-runs': {runs: [RUN]}});
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    await screen.findByText('Earlier runs');
    act(() => useWorkbenchStore.getState().openAskCase('Who owns Fernhill Ltd?'));
    expect(await screen.findByLabelText('Your question')).toHaveValue('Who owns Fernhill Ltd?');
    expect(screen.getByRole('list', {name: 'Steps'}).querySelector('[aria-current="step"]')).toHaveTextContent('1 Ask');
  });

  it('a later "watch this run" wins over an earlier ask, and the other way round', async () => {
    mockApi({[`GET ${BASE}/profile`]: PLAN.profile, 'GET /api/investigations/inv-1/ai-runs': {runs: [RUN]},
      'GET /api/investigations/inv-1/ai-runs/run-1/events': {run: RUN, events: []}, 'GET /api/ai-analysis-candidates/cand-1': CAND});
    act(() => { useWorkbenchStore.getState().openAskCase('Old question'); useWorkbenchStore.getState().openAiRun('run-1'); });
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByRole('region', {name: 'Watch the run'})).toBeInTheDocument();
    act(() => useWorkbenchStore.getState().openAskCase('New question'));
    expect(await screen.findByLabelText('Your question')).toHaveValue('New question');
  });
});

describe('the live view: instructions and plan as a drawer, and step 4', () => {
  function watching() {
    useWorkbenchStore.getState().openAiRun('run-1');
    return mockApi({
      [`GET ${BASE}/profile`]: PLAN.profile,
      [`POST ${BASE}/plan`]: PLAN,
      [`POST ${BASE}/case-synthesis`]: {candidate_id: 'cand-2', job, review_status: 'proposed', payload: {}},
      'GET /api/investigations/inv-1/ai-runs': {runs: [RUN]},
      'GET /api/investigations/inv-1/ai-runs/run-1/events': {run: RUN, events: []},
      'GET /api/investigations/inv-1/ai-runs/job-2/events': {run: {...RUN, run_id: 'job-2'}, events: []},
      'GET /api/ai-analysis-candidates/cand-1': CAND,
      'POST /api/ai-analysis-candidates/cand-1/claim-review': ({body}: {body: unknown}) => {
        const b = body as {claim_id: string; decision: string; reason: string | null};
        return {...CAND, claim_reviews: {[b.claim_id]: {decision: b.decision, text: null, reason: b.reason, reviewed_at: '2026-10-12T11:00:00Z'}}};
      },
      'POST /api/ai-analysis-candidates/cand-1/review': {id: 'cand-1', module: 'case_synthesis', review_status: 'accepted', reviewer_note: null, reviewed_at: '2026-10-12T11:00:00Z'},
    });
  }

  it('opens the same instructions and plan at the left edge, for a new run of the question watched', async () => {
    const api = watching();
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Instructions & plan'}));
    const drawer = screen.getByRole('region', {name: 'Instructions and plan'});
    expect(within(drawer).getByRole('region', {name: 'The plan'})).toBeInTheDocument();
    expect(within(drawer).getByRole('region', {name: 'Operating instructions'})).toBeInTheDocument();
    expect(await within(drawer).findByText('3 records go in')).toBeInTheDocument();
    expect(within(drawer).getByText(RUN.question)).toBeInTheDocument();
    await waitFor(() => expect(api.lastBody(`POST ${BASE}/plan`)).toMatchObject({question: RUN.question}));
    const go = within(drawer).getByRole('button', {name: 'Run and watch'});
    await waitFor(() => expect(go).toBeEnabled());
    await user.click(go);
    await waitFor(() => expect(api.lastBody(`POST ${BASE}/case-synthesis`)).toMatchObject({question: RUN.question}));
    expect(screen.queryByRole('region', {name: 'Instructions and plan'})).toBeNull();
  });

  it('reviews the answer claim by claim: underlines, the keys, a reason to reject, then the whole answer', async () => {
    const api = watching();
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Review · 2 wait'}));
    const sheet = await screen.findByRole('region', {name: 'Review the answer'});
    expect(within(screen.getByRole('list', {name: 'Steps'})).getByText('Review').closest('li')).toHaveAttribute('aria-current', 'step');
    const list = within(sheet).getByRole('list', {name: 'The answer’s claims'});
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Harbour Nominees held 62% of Fernhill Ltd.')).toHaveClass('grounded', 'ai');
    expect(within(list).getByText('Kestrel SA controlled those shares.')).toHaveClass('guessed', 'ai');
    expect(within(sheet).getByText(/0 kept · 0 corrected · 0 rejected/)).toBeInTheDocument();

    // J moves to the second claim; R opens the reasons.
    await user.keyboard('j');
    const detail = within(sheet).getByRole('region', {name: 'CLM-0002 in full'});
    expect(within(detail).getByText('no record: the model’s own words')).toBeInTheDocument();
    await user.keyboard('r');
    await user.click(within(detail).getByRole('button', {name: 'source does not say it'}));
    await user.click(within(detail).getByRole('button', {name: 'Reject the claim'}));
    await waitFor(() => expect(api.lastBody('POST /api/ai-analysis-candidates/cand-1/claim-review')).toEqual({
      claim_id: 'CLM-0002', decision: 'reject', text: null, reason: 'source does not say it'}));
    expect(await within(sheet).findByText(/0 kept · 0 corrected · 1 rejected/)).toBeInTheDocument();
    expect(within(list).getByText('Kestrel SA controlled those shares.').closest('del')).not.toBeNull();

    await user.click(within(sheet).getByRole('button', {name: '✓ Accept the answer'}));
    await waitFor(() => expect(api.lastBody('POST /api/ai-analysis-candidates/cand-1/review')).toEqual({decision: 'accept', note: null}));
    await user.click(within(sheet).getByRole('button', {name: 'Back to the run'}));
    expect(await screen.findByRole('region', {name: 'Watch the run'})).toBeInTheDocument();
  });
});
