// @vitest-environment jsdom
// Act › AI runs (mockup AI_2): the operating instructions from the server's table, every change echoed, an
// instruction inside the evidence flagged, what leaves the computer, and a run that carries the settings with it.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BeforeYouRun} from '../features/ai/before-you-run';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {PLAN} from '../test-support/run-plan-fixture';

const BASE = '/api/investigations/inv-1/assistant';
const job = {id: 'job-1', kind: 'ai_reasoning', investigation_id: 'inv-1', subject_type: 'ai_run', subject_id: null, status: 'succeeded', finished: true,
  progress: 100, message: 'Proposed for review', error: null, attempts: 1, runner: 'inline', result: null,
  created_at: '2026-10-12T10:00:00Z', updated_at: '2026-10-12T10:01:00Z', started_at: '2026-10-12T10:00:00Z', finished_at: '2026-10-12T10:01:00Z'};

const RUN = {run_id: 'job-1', status: 'succeeded', finished: true, module: 'case_synthesis', question: 'Who controlled Fernhill Ltd?', working_theory: null,
  created_at: '2026-10-12T10:00:00Z', started_at: '2026-10-12T10:00:00Z', finished_at: '2026-10-12T10:01:00Z', candidate_id: 'cand-1', review_status: 'proposed',
  events: 0, problems: 0, message: null, error: null, route: {system: 'tas', row: 2, node: 'tas/08', title: 'Case synthesis', modules_in_system: 13, final_audit: {node: 'tas/10', file: '10_FINAL_ACCURACY_AUDIT.md'}}};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => cleanup());

describe('BeforeYouRun', () => {
  it('shows the plan, echoes each change, flags an instruction in the evidence, and runs with the settings', async () => {
    const api = mockApi({
      [`GET ${BASE}/profile`]: PLAN.profile,
      [`POST ${BASE}/plan`]: ({body}: {body: unknown}) => {
        const b = body as {options: Record<string, string>};
        return b.options.devils_advocate === 'ON'
          ? {...PLAN, steps: [...PLAN.steps.slice(0, 2), {key: 'devils_advocate', n: 3, who: 'MODEL', title: 'Devil’s advocate on the lead theory', detail: 'x', changed: true, system: 'TAS'}, ...PLAN.steps.slice(2)]}
          : PLAN;
      },
      [`POST ${BASE}/case-synthesis`]: {candidate_id: 'cand-1', job, review_status: 'proposed', payload: {}},
      'GET /api/investigations/inv-1/ai-runs/job-1/events': {run: RUN, events: []},
    });
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your question'), 'Who controlled Fernhill Ltd?');
    await user.click(screen.getByRole('button', {name: 'Next: instructions and plan'}));

    const plan = await screen.findByRole('region', {name: 'The plan'});
    expect(await within(plan).findByText('3 records go in')).toBeInTheDocument();
    expect(within(plan).getByText(/Ignored an instruction inside the evidence/)).toBeInTheDocument();
    const where = screen.getByRole('region', {name: 'Where it runs, what it costs'});
    expect(within(where).getByText(/Nothing, for this run/)).toBeInTheDocument();
    expect(within(where).getByText(/evidence:ev-58 · material · ignored/)).toBeInTheDocument();

    await user.click(screen.getByRole('switch', {name: /^Devil’s advocate, off/}));
    expect(screen.getByRole('switch', {name: 'Devil’s advocate, on, changed from off'})).toBeInTheDocument();
    await user.click(within(screen.getByRole('radiogroup', {name: /^Research depth/})).getByRole('radio', {name: /Exhaustive/}));
    expect(within(where).getByText(/devils_advocate off → on/)).toBeInTheDocument();
    expect(screen.getByText('2 changed')).toBeInTheDocument();
    expect(await within(plan).findByText('Devil’s advocate on the lead theory')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Something to take as given'), 'Harbour Nominees is a nominee service.');
    await user.click(screen.getByRole('button', {name: 'Add'}));

    await user.click(screen.getByRole('button', {name: /Run and watch/}));
    await waitFor(() => expect(api.lastBody(`POST ${BASE}/case-synthesis`)).toMatchObject({
      question: 'Who controlled Fernhill Ltd?', source_tier_floor: 'D',
      options: {devils_advocate: 'ON', research_depth: 'EXHAUSTIVE'}, premises: ['Harbour Nominees is a nominee service.'],
    }));
    const sent = api.lastBody(`POST ${BASE}/case-synthesis`) as {changes: Array<{kind: string; text: string}>};
    expect(sent.changes.map(c => c.text)).toEqual(['evidence:ev-58 · material · ignored', 'devils_advocate off → on', 'research_depth normal → exhaustive', 'premise + USER_STIPULATED']);
    expect(await screen.findByRole('region', {name: 'Watch the run'})).toBeInTheDocument();
    expect(await screen.findByText('Run record')).toBeInTheDocument();
  });

  it('saves this case’s default only with a reason', async () => {
    const api = mockApi({[`GET ${BASE}/profile`]: PLAN.profile, [`POST ${BASE}/plan`]: PLAN,
      [`PUT ${BASE}/profile`]: {...PLAN.profile, saved: true, reason: 'Named people', saved_at: '2026-10-12T10:00:00Z'}});
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your question'), 'Who?');
    await user.click(screen.getByRole('button', {name: 'Next: instructions and plan'}));
    await user.click(await screen.findByRole('button', {name: 'Save as this case’s default'}));
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(await screen.findByText('Write why first.')).toBeInTheDocument();
    expect(screen.getByLabelText('Why this case runs with these settings')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls(`PUT ${BASE}/profile`)).toHaveLength(0);
    await user.type(screen.getByLabelText('Why this case runs with these settings'), 'Named people');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    await waitFor(() => expect(api.lastBody(`PUT ${BASE}/profile`)).toMatchObject({reason: 'Named people', source_tier_floor: 'D', premises: []}));
  });

  it('offers a sample run when the case has none yet', async () => {
    mockApi({'GET /api/investigations/inv-1/ai-runs': {runs: []}, [`GET ${BASE}/profile`]: PLAN.profile});
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Watch a sample run'}));
    expect(await screen.findByText('sample — not a real run')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Ask the case'}));
    expect(await screen.findByLabelText('Your question')).toBeInTheDocument();
  });

  it('runs again from a step with the same packet and the instructions set in the plan', async () => {
    const ev = (n: number, o: Record<string, unknown>) => ({n, at: '2026-10-12T10:00:05Z', system: 'app', rule: null, status: 'good', verdict: null, refs: [],
      parent: n > 1 ? 1 : null, self_reported: false, detail: null, kind: 'CHECK', node: 'retrieval', text: 'x', ...o});
    const events = [ev(1, {kind: 'TURN', node: 'run', status: 'neutral', text: 'Case synthesis asked'}),
      ev(2, {node: 'retrieval', text: 'Packet built: 3 records', refs: [{record_type: 'evidence', record_id: 'ev-58'}]})];
    window.history.replaceState(null, '', '/act?inv=inv-1&run=job-1&step=2');
    const api = mockApi({
      [`GET ${BASE}/profile`]: PLAN.profile,
      [`POST ${BASE}/plan`]: PLAN,
      [`POST ${BASE}/case-synthesis`]: {candidate_id: 'cand-1', job, review_status: 'proposed', payload: {}},
      'GET /api/investigations/inv-1/ai-runs/job-1/events': {run: {...RUN, events: 2}, events},
      'GET /api/investigations/inv-1/ai-runs': {runs: [RUN]},
      'GET /api/ai-analysis-candidates/cand-1': {id: 'cand-1', investigation_id: 'inv-1', module: 'case_synthesis', review_status: 'proposed', confidence: 0.5,
        created_at: '2026-10-12T10:01:00Z', payload: {}, rejection_reason: null, request: {}, reviewed_at: null, reviewer_note: null, trace: null,
        accepted_record_id: null, accepted_record_type: null, checked_citation_count: 0, checked_citation_ids: [], claim_reviews: {}},
    });
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Run again from this step…'}));
    expect(await screen.findByText('Same packet as run job-1')).toBeInTheDocument();
    const go = await screen.findByRole('button', {name: /Run and watch/});
    await waitFor(() => expect(go).toBeEnabled());
    await user.click(go);
    await waitFor(() => expect(api.lastBody(`POST ${BASE}/case-synthesis`)).toMatchObject({question: RUN.question, packet_from: {run_id: 'job-1', step: 2}}));
    window.history.replaceState(null, '', '/');
  });

  it('edits what the plan is made of: the packet, the outside leads and the steps a setting adds', async () => {
    const withDevil = {...PLAN, steps: [...PLAN.steps.slice(0, 2), {key: 'devils_advocate', n: 3, who: 'MODEL', title: 'Devil’s advocate on the lead theory', detail: 'x', changed: true, system: 'TAS'}, ...PLAN.steps.slice(2)]};
    const api = mockApi({
      [`GET ${BASE}/profile`]: PLAN.profile,
      [`POST ${BASE}/plan`]: ({body}: {body: unknown}) => ((body as {options: Record<string, string>}).options.devils_advocate === 'ON' ? withDevil : PLAN),
      [`POST ${BASE}/case-synthesis`]: {candidate_id: 'cand-1', job, review_status: 'proposed', payload: {}},
      'GET /api/investigations/inv-1/ai-runs/job-1/events': {run: RUN, events: []},
    });
    render(<QueryProvider><BeforeYouRun investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your question'), 'Who controlled Fernhill Ltd?');
    await user.click(screen.getByRole('button', {name: 'Next: instructions and plan'}));
    const plan = await screen.findByRole('region', {name: 'The plan'});
    await within(plan).findByText('3 records go in');
    await user.click(within(plan).getByRole('button', {name: 'Edit plan'}));

    // The packet's size and the outside leads go to the plan, and are echoed as changes.
    const size = within(plan).getByRole('spinbutton', {name: 'Records in the packet, at most'});
    await user.clear(size);
    await user.type(size, '50{Enter}');
    await user.click(within(plan).getByRole('checkbox', {name: /Bring outside leads saved in the case/}));
    await waitFor(() => expect(api.lastBody(`POST ${BASE}/plan`)).toMatchObject({max_results: 50, include_external_leads: false}));
    const where = screen.getByRole('region', {name: 'Where it runs, what it costs'});
    expect(within(where).getByText(/packet up to 30 → 50 records/)).toBeInTheDocument();
    expect(within(where).getByText(/outside leads in the packet on → off/)).toBeInTheDocument();

    // Fixed steps always run; a step a setting adds can be added and removed here.
    expect(within(plan).getAllByTitle('This step always runs')).toHaveLength(4);
    await user.click(within(plan).getByRole('button', {name: '+ Devil’s advocate'}));
    expect(screen.getByRole('switch', {name: 'Devil’s advocate, on, changed from off'})).toBeInTheDocument();
    await user.click(await within(plan).findByRole('button', {name: 'Remove the step: Devil’s advocate on the lead theory'}));
    expect(screen.getByRole('switch', {name: /^Devil’s advocate, off/})).toBeInTheDocument();
    expect(within(plan).getByRole('button', {name: '+ Research depth · Exhaustive'})).toBeInTheDocument();

    // The question can be changed here too, and the run carries all of it.
    const q = within(plan).getByRole('textbox', {name: 'The question'});
    await user.clear(q);
    await user.type(q, 'Who owned Fernhill Ltd in 2018?');
    await user.click(within(plan).getByRole('button', {name: 'Done'}));
    expect(within(plan).getByText('Who owned Fernhill Ltd in 2018?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: /Run and watch/}));
    await waitFor(() => expect(api.lastBody(`POST ${BASE}/case-synthesis`)).toMatchObject({
      question: 'Who owned Fernhill Ltd in 2018?', max_results: 50, include_external_leads: false, options: {devils_advocate: 'OFF'}}));
  });

  it('runs on Ctrl+Enter only while its tab shows, and never from a field elsewhere', async () => {
    const api = mockApi({
      [`GET ${BASE}/profile`]: PLAN.profile,
      [`POST ${BASE}/plan`]: PLAN,
      [`POST ${BASE}/case-synthesis`]: {candidate_id: 'cand-1', job, review_status: 'proposed', payload: {}},
      'GET /api/investigations/inv-1/ai-runs': {runs: []},
    });
    const {rerender} = render(<QueryProvider><div><BeforeYouRun investigationId="inv-1"/></div><textarea aria-label="The write-up"/></QueryProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your question'), 'Who controlled Fernhill Ltd?');
    await user.click(screen.getByRole('button', {name: 'Next: instructions and plan'}));
    await waitFor(() => expect(screen.getByRole('button', {name: /Run and watch/})).toBeEnabled());
    // Ctrl+Enter typed into another screen's editor is a line break there, not a run.
    await user.click(screen.getByLabelText('The write-up'));
    await user.keyboard('{Control>}{Enter}{/Control}');
    // The same keys while the AI runs tab is hidden (another tab of the stage showing) do nothing either.
    rerender(<QueryProvider><div hidden><BeforeYouRun investigationId="inv-1"/></div><textarea aria-label="The write-up"/></QueryProvider>);
    document.body.focus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(api.calls(`POST ${BASE}/case-synthesis`)).toHaveLength(0);
    // Shown again, with focus on the page, the keys run the plan.
    rerender(<QueryProvider><div><BeforeYouRun investigationId="inv-1"/></div><textarea aria-label="The write-up"/></QueryProvider>);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(api.calls(`POST ${BASE}/case-synthesis`)).toHaveLength(1));
  });
});
