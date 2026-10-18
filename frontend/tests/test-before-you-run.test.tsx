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
  events: 0, problems: 0, message: null, error: null};

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
    expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
    await user.type(screen.getByLabelText('Why this case runs with these settings'), 'Named people');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    await waitFor(() => expect(api.lastBody(`PUT ${BASE}/profile`)).toMatchObject({reason: 'Named people', source_tier_floor: 'D', premises: []}));
  });
});
