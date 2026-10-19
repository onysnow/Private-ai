// @vitest-environment jsdom
// Act › AI runs › Watch the run (mockup AI_1): the run record drawn as a map, the one-line header, the lanes on a real
// time axis, the trace drawer for one thought, streams for crowds of thoughts, and the review that applies to the answer.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {parseSse} from '../features/ai/run-stream';
import {ReviewSheet} from '../features/ai/claim-review-view';
import {WatchTheRun} from '../features/ai/watch-the-run';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const EV = '/api/investigations/inv-1/ai-runs/run-1/events';
const RUN = {run_id: 'run-1', status: 'succeeded', finished: true, module: 'case_synthesis', question: 'Who controlled Fernhill Ltd between 2016 and 2023?',
  working_theory: null, created_at: '2026-10-10T14:02:00Z', started_at: '2026-10-10T14:02:00Z', finished_at: '2026-10-10T14:03:12Z', candidate_id: 'cand-1',
  review_status: 'proposed', events: 0, problems: 1, message: null, error: null, route: {system: 'tas', row: 2, node: 'tas/08', title: 'Case synthesis', modules_in_system: 13, final_audit: {node: 'tas/10', file: '10_FINAL_ACCURACY_AUDIT.md'}}};

let n = 0;
const ev = (o: Partial<Record<string, unknown>> & {kind: string; node: string; text: string}) => ({
  n: ++n, at: '2026-10-10T14:02:05Z', system: 'app', rule: null, status: 'neutral', verdict: null, refs: [], parent: null, self_reported: false, detail: null, ...o,
});
function record(claims: number) {
  n = 0;
  const out = [
    ev({kind: 'TURN', node: 'run', text: 'Case synthesis asked'}),
    ev({kind: 'SETTING', node: 'controls', system: 'umbrella', rule: 'source_tier_floor', verdict: 'D', text: 'source_tier_floor = d', parent: 1}),
    ev({kind: 'SETTING', node: 'controls', system: 'umbrella', rule: 'devils_advocate', verdict: 'ON', text: 'devils_advocate = on (default off)', parent: 1}),
    ev({kind: 'ROUTE', node: 'router', system: 'tas', status: 'good', text: 'TAS: facts about real people', parent: 1}),
    ev({kind: 'LOAD', node: 'tas/08', system: 'tas', status: 'good', text: 'Loaded 08_CASE_SYNTHESIS.md', parent: 4}),
    ev({kind: 'CHECK', node: 'retrieval', text: 'Packet built: 8 records', status: 'good', parent: 4, refs: [{record_type: 'document', record_id: 'doc-41-register'}]}),
    ev({kind: 'CHECK', node: 'model', text: 'Model call: ollama qwen2.5', verdict: 'STARTED', parent: 6, at: '2026-10-10T14:02:06Z'}),
    ev({kind: 'CHECK', node: 'model', text: 'The model answered after 41 s', status: 'good', verdict: 'ANSWERED', parent: 7, at: '2026-10-10T14:02:47Z', detail: {model: 'qwen2.5', seconds: 41}}),
    ev({kind: 'CHECK', node: 'gate:schema', text: 'Shape matches', status: 'good', verdict: 'PASS', parent: 8, at: '2026-10-10T14:02:48Z'}),
    ev({kind: 'CHECK', node: 'gate:citation', text: 'Every citation is in the packet', status: 'good', verdict: 'PASS', parent: 9, at: '2026-10-10T14:02:48Z'}),
  ];
  const gate = out[out.length - 1].n;
  for (let i = 1; i <= claims; i += 1) {
    const claimN = n + 1;
    out.push(ev({kind: 'RULE', node: 'tas/class', system: 'tas', rule: 'TAS Standard §4', status: i === 1 ? 'partial' : 'good', verdict: 'SOURCE_STATEMENT', parent: gate, self_reported: true,
      text: `Claim number ${i}`, at: '2026-10-10T14:02:49Z', refs: [{record_type: 'document', record_id: 'doc-41-register'}], detail: {thought: `CLM-${String(i).padStart(4, '0')}`}}));
    if (i === 1) out.push(ev({kind: 'FLAG', node: 'tas/corroboration', system: 'tas', status: 'partial', text: 'Called corroborated on one record', parent: claimN, at: '2026-10-10T14:02:49Z', detail: {thought: 'CLM-0001'}}));
  }
  out.push(ev({kind: 'BLOCK', node: 'gate:citation', status: 'bad', verdict: 'NOT_IN_PACKET', text: 'Not in the packet: evidence:x', parent: gate, at: '2026-10-10T14:02:50Z'}));
  out.push(ev({kind: 'WRITE', node: 'candidate', status: 'good', verdict: 'PROPOSED', text: 'Saved as cand-1', parent: gate, at: '2026-10-10T14:03:12Z'}));
  return out;
}
const CAND = {id: 'cand-1', investigation_id: 'inv-1', module: 'case_synthesis', review_status: 'proposed', confidence: 0.5, created_at: '2026-10-10T14:03:12Z', payload: {claims: [
  {claim_id: 'CLM-0001', claim: 'Kestrel SA controlled Fernhill Ltd.', classification: 'SOURCE_STATEMENT', confidence_term: 'LIKELY', confidence: 'MEDIUM',
    supporting_evidence: [{record_type: 'document', record_id: 'doc-41-register'}]},
  {claim_id: 'CLM-0002', claim: 'Harbour Nominees acted for Kestrel SA.', classification: 'INFERENCE', confidence_term: 'ROUGHLY_EVEN', confidence: 'LOW', supporting_evidence: []}]},
  rejection_reason: null, request: {}, reviewed_at: null, reviewer_note: null, trace: null, accepted_record_id: null, accepted_record_type: null,
  checked_citation_count: 1, checked_citation_ids: [{record_type: 'document', record_id: 'doc-41-register'}], claim_reviews: {}};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => cleanup());

function open(claims = 2, extra: Record<string, unknown> = {}) {
  const events = record(claims);
  const api = mockApi({
    [`GET ${EV}`]: {run: {...RUN, events: events.length}, events},
    'GET /api/ai-analysis-candidates/cand-1': CAND,
    'POST /api/ai-analysis-candidates/cand-1/review': {...CAND, review_status: 'accepted'},
    ...extra,
  });
  render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-1"/></QueryProvider>);
  return api;
}

describe('WatchTheRun', () => {
  it('draws the header in one line, the key, the systems not in this run and the three ledgers', async () => {
    open();
    const map = await screen.findByRole('group', {name: /The run as a map/});
    await waitFor(() => expect(screen.getByRole('heading', {level: 2}).textContent).toMatch(/Act · AI runs · Case synthesis · TAS · 10 Oct 1[0-9]:\d\d/));
    expect(screen.getByRole('button', {name: /Events: summary/})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /^2 problems/})).toBeInTheDocument();
    expect(within(map as unknown as HTMLElement).getAllByText('not in this run').length).toBe(4);
    expect(within(map as unknown as HTMLElement).getByText('1 of 7 routed')).toBeInTheDocument();
    expect(within(map as unknown as HTMLElement).getByText('+ 12 modules')).toBeInTheDocument();
    expect(within(screen.getByRole('list', {name: 'Key'})).getAllByRole('listitem')).toHaveLength(6);
    await waitFor(() => expect(screen.getByText('Run record').parentElement?.textContent).toMatch(/\d+/));
    expect(screen.getByText('Judgement ledger')).toBeInTheDocument();
    expect(screen.getByText(/tas\/10 runs apart, never inside the run/)).toBeInTheDocument();
  });

  it('draws a run of another system on its own route: its pill or column, the hand-over it started from, its final audit', async () => {
    n = 0;
    const events = [
      ev({kind: 'TURN', node: 'run', text: 'Evidence plan asked'}),
      ev({kind: 'ROUTE', node: 'router', system: 'egs', status: 'good', rule: 'AGENTS.md trigger table row 6', text: 'EGS: the answer plans how to obtain evidence', parent: 1}),
      ev({kind: 'LOAD', node: 'egs/01', system: 'egs', status: 'good', text: 'Loaded 01_EVIDENCE_PLAN.md', parent: 2}),
      ev({kind: 'CHECK', node: 'interop', system: 'umbrella', status: 'good', rule: 'INTEROP.md', text: 'Started from your accepted Case synthesis: 2 record(s) handed over', parent: 2}),
      ev({kind: 'BLOCK', node: 'interop', system: 'umbrella', status: 'partial', verdict: 'HELD', text: 'TAS record_existence held back from EGS', parent: 4}),
      ev({kind: 'BLOCK', node: 'interop', system: 'umbrella', status: 'partial', verdict: 'HELD', text: 'TAS classification held back from EGS', parent: 4}),
      ev({kind: 'CHECK', node: 'retrieval', text: 'Packet of the handed-over run: 8 records', status: 'good', parent: 2}),
      ev({kind: 'CHECK', node: 'gate:schema', text: 'Shape matches', status: 'good', verdict: 'PASS', parent: 7}),
      ev({kind: 'CHECK', node: 'gate:egs', system: 'egs', text: 'The suite\u2019s rules hold', status: 'good', verdict: 'PASS', parent: 8}),
      ev({kind: 'RULE', node: 'egs/01', system: 'egs', status: 'neutral', verdict: 'RECORDS_REQUEST', self_reported: true, text: 'who received the last transfer',
        parent: 9, detail: {thought: 'GPLN-0001'}}),
      ev({kind: 'WRITE', node: 'candidate', status: 'good', verdict: 'PROPOSED', text: 'Saved as cand-2', parent: 9}),
    ];
    const run = {...RUN, run_id: 'run-2', module: 'evidence_plan', candidate_id: 'cand-2', events: events.length, handoff_from: 'cand-1',
      route: {system: 'egs', row: 6, node: 'egs/01', title: 'Evidence plan', modules_in_system: 5, final_audit: {node: 'egs/05', file: '05_GATHERING_LOG_AND_FINAL_GATHERING_CHECK.md'}}};
    mockApi({
      'GET /api/investigations/inv-1/ai-runs/run-2/events': {run, events},
      'GET /api/ai-analysis-candidates/cand-2': {...CAND, id: 'cand-2', module: 'evidence_plan', payload: {plan_items: [], order_of_work: []}},
    });
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-2"/></QueryProvider>);
    const map = await screen.findByRole('group', {name: /The run as a map/}) as unknown as HTMLElement;
    await waitFor(() => expect(screen.getByRole('heading', {level: 2}).textContent).toMatch(/Evidence plan · EGS/));
    expect(within(map).getByRole('button', {name: /^EGS 01 \(Evidence plan/})).toBeInTheDocument();
    expect(within(map).getByRole('button', {name: /^EHS ethics \(not in this run/})).toBeInTheDocument();
    expect(within(map).getAllByText('not in this run').length).toBe(5);
    expect(within(map).getByText('1 of 7 routed')).toBeInTheDocument();
    expect(within(map).getByRole('button', {name: /^Hand-over · 2 held \(INTEROP boundaries\)/})).toBeInTheDocument();
    expect(within(map).getByRole('button', {name: /^Controls, 0 overrides/}).textContent).not.toMatch(/\d$/);
    expect(screen.getByText(/egs\/05 runs apart, never inside the run/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('The run, one lane per part')).getByText('EGS')).toBeInTheDocument();
    // Counts are words ("1 finding"), and a run shorter than ten seconds counts seconds on its axis, never one clock time twice.
    expect(within(map).getByText('1 finding')).toBeInTheDocument();
    const ticks = [...document.querySelectorAll('.wr-axis i')].map(i => i.textContent);
    expect(ticks.slice(1)).toEqual(['+0.25 s', '+0.50 s', '+0.75 s', '+1.0 s']);
  });

  it('says whether the answer was stopped by the checks or rejected by you', async () => {
    open(2, {'GET /api/ai-analysis-candidates/cand-1': {...CAND, review_status: 'rejected', rejection_reason: 'reviewer'}});
    expect(await screen.findByText('you rejected it')).toBeInTheDocument();
    cleanup();
    open(2, {'GET /api/ai-analysis-candidates/cand-1': {...CAND, review_status: 'rejected', rejection_reason: 'citation'}});
    expect(await screen.findByText('stopped by the checks')).toBeInTheDocument();
  });

  it('a replay shows the answer and your review only once it reaches them', async () => {
    open(2, {'GET /api/ai-analysis-candidates/cand-1': {...CAND, review_status: 'rejected', rejection_reason: 'reviewer'}});
    expect(await screen.findByText('you rejected it')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Replay'}));
    expect(await screen.findByText('not reached yet')).toBeInTheDocument();
    expect(screen.queryByText('you rejected it')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Live'}));
    expect(await screen.findByText('you rejected it')).toBeInTheDocument();
  });

  it('puts the lanes on a clock axis and says how many events are shown', async () => {
    open();
    await screen.findByLabelText('The run, one lane per part');
    expect(await screen.findByText(/Event \d+ of \d+/)).toBeInTheDocument();
    const lanes = screen.getByLabelText('The run, one lane per part');
    for (const lane of ['Router', 'Model', 'Checks', 'TAS', 'LAS', 'DAS', 'Write', 'You']) expect(within(lanes).getByText(lane)).toBeInTheDocument();
    expect(lanes.querySelectorAll('.wr-axis i').length).toBe(5);
  });

  it('opens the trace for one thought: input chips, the steps, the output, and the whole-answer review', async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    const drawer = screen.getByRole('dialog', {name: 'One thought, input to output'});
    expect(within(drawer).getByText(/one thought, input to output/i)).toBeInTheDocument();
    expect(within(drawer).getByText('AI · CLM-0001')).toBeInTheDocument();
    for (const chip of ['tier floor D', "devil's advocate on"]) expect(within(drawer).getByText(chip)).toBeInTheDocument();
    expect(within(drawer).getByText('model says')).toBeInTheDocument();
    expect(within(drawer).getByText(/model: likely/)).toBeInTheDocument();
    expect(within(drawer).queryByText(/capped/)).toBeNull();
    expect(within(drawer).getByText(/Accept and reject apply to the whole answer; Keep, Correct and Reject above decide this claim; To check marks this thought only/)).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', {name: 'Close the trace'}));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('N jumps to the next problem and Accept sends the review for the answer', async () => {
    const api = open();
    const user = userEvent.setup();
    await screen.findByRole('group', {name: /The run as a map/});
    await user.keyboard('n');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: '✓ Accept'}));
    await waitFor(() => expect(api.calls('POST /api/ai-analysis-candidates/cand-1/review')).toHaveLength(1));
    expect(api.lastBody('POST /api/ai-analysis-candidates/cand-1/review')).toEqual({decision: 'accept', note: null});
  });

  it('ignores its keys while hidden behind another tab', async () => {
    const events = record(2);
    mockApi({[`GET ${EV}`]: {run: {...RUN, events: events.length}, events}, 'GET /api/ai-analysis-candidates/cand-1': CAND});
    const {rerender} = render(<QueryProvider><div hidden><WatchTheRun investigationId="inv-1" runId="run-1"/></div></QueryProvider>);
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector('.wr-map')).not.toBeNull());
    await user.keyboard('nl');
    expect(document.querySelector('.wr-drawer')).toBeNull();
    expect(document.querySelector('.wr-log')).toBeNull();
    rerender(<QueryProvider><div><WatchTheRun investigationId="inv-1" runId="run-1"/></div></QueryProvider>);
    await user.keyboard('n');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('swaps the map for the plain log with L', async () => {
    open();
    const user = userEvent.setup();
    await screen.findByRole('group', {name: /The run as a map/});
    await user.keyboard('l');
    const log = await screen.findByRole('list', {name: 'The run, step by step'});
    expect(within(log).getAllByRole('listitem').length).toBeGreaterThan(5);
    await user.keyboard('l');
    expect(await screen.findByRole('group', {name: /The run as a map/})).toBeInTheDocument();
  });

  it('merges more than twelve thoughts on one wire into one band with a count', async () => {
    open(14);
    await waitFor(() => expect(screen.getByText('14 claims')).toBeInTheDocument());
  });

  it('draws no travelling lights in Calm', async () => {
    open();
    await screen.findByRole('group', {name: /The run as a map/});
    expect(document.querySelectorAll('.wr-light')).toHaveLength(0);
  });

  it('searches the steps of a thought and shows them on a time axis', async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    const drawer = screen.getByRole('dialog');
    const all = within(drawer).getAllByRole('button', {name: /^Step \d+/}).length;
    await user.type(within(drawer).getByLabelText('Search the steps by kind, number or rule'), 'gate');
    const some = within(drawer).getAllByRole('button', {name: /^Step \d+/}).length;
    expect(some).toBeLessThan(all);
    await user.clear(within(drawer).getByLabelText('Search the steps by kind, number or rule'));
    await user.click(within(drawer).getByRole('radio', {name: 'timeline'}));
    expect(drawer.querySelectorAll('.wr-steptime i').length).toBe(all);
  });

  it('names the weakest link and copies a citation that links back to the trace', async () => {
    open();
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {value: {writeText: write}, configurable: true});
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText(/weakest: step #\d+: Called corroborated on one record/)).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', {name: 'Copy cite'}));
    expect(write.mock.calls[0][0]).toMatch(/^“Kestrel SA controlled Fernhill Ltd\.” \[CLM-0001; document:doc-41-register; AI run run-1\] .*\?inv=inv-1&run=run-1&step=\d+#ai-runs$/);
  });

  it('moves along the pipeline with the arrow keys', async () => {
    open();
    const user = userEvent.setup();
    const router = await screen.findByRole('button', {name: /^Router/});
    router.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement?.getAttribute('data-k')).toBe('model');
  });

  it('offers a sample run when there is none, labelled as not real', async () => {
    mockApi({'GET /api/investigations/inv-1/ai-runs': {runs: []}});
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId={null}/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Play a sample run'}));
    expect(await screen.findByText('sample — not a real run')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '✓ Accept'})).toBeNull();
    // The sample carries the crosswalk split and the precedence stop the app draws when a record holds them.
    expect(await screen.findByRole('button', {name: 'B4 crosswalk, TAS to LAS, Verified and Unverified'}, {timeout: 8000})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'B6 precedence, before DAS, stopped: An attributed claim cannot carry a recommendation'})).toBeInTheDocument();
    expect(document.querySelector('.wr-membrane.bad')).not.toBeNull();
    expect(screen.getByRole('button', {name: /^LAS 03 Soundness|^03 Soundness/})).toBeInTheDocument();
    expect(document.querySelector('.wr-bloom')).toBeNull();
  }, 15000);

  it('says why a stopped run stopped', async () => {
    const events = record(1);
    mockApi({[`GET ${EV}`]: {run: {...RUN, status: 'failed', candidate_id: null, review_status: null, message: 'Stopped by the app’s checks: a cited record is not in the packet', events: events.length}, events}});
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-1"/></QueryProvider>);
    expect(await screen.findByText(/Stopped · 10 Oct/)).toBeInTheDocument();
    expect(screen.getByText(/a cited record is not in the packet/)).toBeInTheDocument();
  });
});

describe('WatchTheRun, your marks and other runs', () => {
  it('marks one thought to check, and reads the mark back from the run record', async () => {
    const events = record(2);
    const markEvent = {...events[events.length - 1], n: events.length + 1, kind: 'CHECK', node: 'review', status: 'neutral', verdict: 'TO_CHECK',
      text: 'You marked CLM-0001 to check', parent: 11, self_reported: false, detail: {thought: 'CLM-0001', mark: 'to_check', reason: null}};
    let marked = false;
    const api = mockApi({
      [`GET ${EV}`]: () => ({run: {...RUN, events: events.length}, events: marked ? [...events, markEvent] : events}),
      'GET /api/ai-analysis-candidates/cand-1': CAND,
      'POST /api/investigations/inv-1/ai-runs/run-1/thoughts/CLM-0001/mark': () => { marked = true; return markEvent; },
    });
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: '○ To check'}));
    expect(api.lastBody('POST /api/investigations/inv-1/ai-runs/run-1/thoughts/CLM-0001/mark')).toEqual({mark: 'to_check', reason: null});
    expect(await within(screen.getByRole('dialog')).findByRole('button', {name: '◉ To check'})).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('dialog')).getByText('CLM-0001 to check · you')).toBeInTheDocument();
  });

  it('compares with an earlier run of the same question and names what changed', async () => {
    const now = record(2);
    const before = record(2).map(e => (e.node === 'tas/corroboration' ? {...e, status: 'good'} : e));
    mockApi({
      [`GET ${EV}`]: {run: {...RUN, events: now.length}, events: now},
      'GET /api/investigations/inv-1/ai-runs/run-0/events': {run: {...RUN, run_id: 'run-0', created_at: '2026-10-09T09:00:00Z', events: before.length}, events: before},
      'GET /api/investigations/inv-1/ai-runs': {runs: [RUN, {...RUN, run_id: 'run-0', created_at: '2026-10-09T09:00:00Z', problems: 1},
        {...RUN, run_id: 'run-9', module: 'research_vetting', created_at: '2026-10-09T08:00:00Z'}]},
      'GET /api/ai-analysis-candidates/cand-1': CAND,
    });
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-1"/></QueryProvider>);
    const user = userEvent.setup();
    const compare = await screen.findByRole('combobox', {name: 'Compare with another run of this question'});
    // Only a run of the same module compares: another system draws another route.
    expect(within(compare).getAllByRole('option').map(o => o.textContent)).toEqual(['Compare…', expect.stringMatching(/^with 9 Oct \d\d:\d\d · 1 problem$/)]);
    await user.selectOptions(compare, 'run-0');
    expect(await screen.findByText(/Compared with the run of 9 Oct .* 1 part changed/)).toBeInTheDocument();
    expect(screen.getByText(/corroboration: verified → in between/)).toBeInTheDocument();
    expect(document.querySelectorAll('.wr-node.changed')).toHaveLength(1);
  });

  it('runs again from a step: back to the plan with the same question and packet', async () => {
    const again = vi.fn();
    const events = record(2);
    mockApi({[`GET ${EV}`]: {run: {...RUN, events: events.length}, events}, 'GET /api/ai-analysis-candidates/cand-1': CAND});
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-1" onRunAgain={again}/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    await user.click(screen.getByRole('button', {name: 'Run again from this step…'}));
    expect(again).toHaveBeenCalledWith({question: RUN.question, module: 'case_synthesis', theory: null, from: {run_id: 'run-1', step: expect.any(Number)}});
  });
});

describe('WatchTheRun, deciding one claim', () => {
  it('underlines a grounded claim, and Keep, Correct and Reject decide that claim only', async () => {
    const kept = {...CAND, claim_reviews: {'CLM-0001': {decision: 'keep', text: null, reason: null, reviewed_at: '2026-10-10T15:00:00Z'}}};
    const api = open(2, {'POST /api/ai-analysis-candidates/cand-1/claim-review': kept});
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    const drawer = screen.getByRole('dialog');
    const words = await within(drawer).findByText('Kestrel SA controlled Fernhill Ltd.', {selector: '.cr-text'});
    expect(words).toHaveClass('grounded', 'ai');
    expect(words.getAttribute('title')).toMatch(/Rests on document:doc-41-r, in the packet/);
    expect(within(drawer).getByLabelText('Key for the claim underlines')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', {name: '✓ Keep'}));
    await waitFor(() => expect(api.lastBody('POST /api/ai-analysis-candidates/cand-1/claim-review')).toEqual({claim_id: 'CLM-0001', decision: 'keep', text: null, reason: null}));
    // Kept by a person: no longer plum, and the ledger says so.
    await waitFor(() => expect(within(drawer).getByText('Kestrel SA controlled Fernhill Ltd.', {selector: '.cr-text'})).not.toHaveClass('ai'));
    expect(within(drawer).getByText('CLM-0001 kept · you')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', {name: 'Undo'})).toBeInTheDocument();
  });

  it('a correction needs new words and a rejection needs a reason', async () => {
    const api = open(2, {'POST /api/ai-analysis-candidates/cand-1/claim-review': CAND});
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    const drawer = screen.getByRole('dialog');
    await user.click(await within(drawer).findByRole('button', {name: '◆ Correct'}));
    const save = within(drawer).getByRole('button', {name: 'Save correction'});
    expect(save).toBeDisabled();
    await user.clear(within(drawer).getByRole('textbox', {name: /How it should read/}));
    await user.type(within(drawer).getByRole('textbox', {name: /How it should read/}), 'Kestrel SA held 62% of Fernhill Ltd.');
    await user.click(save);
    await waitFor(() => expect(api.lastBody('POST /api/ai-analysis-candidates/cand-1/claim-review')).toEqual({
      claim_id: 'CLM-0001', decision: 'correct', text: 'Kestrel SA held 62% of Fernhill Ltd.', reason: null}));

    await user.click(within(drawer).getByRole('button', {name: '✕ Reject'}));
    expect(within(drawer).getByRole('button', {name: 'Reject the claim'})).toBeDisabled();
    await user.click(within(drawer).getByRole('button', {name: 'overstated'}));
    await user.click(within(drawer).getByRole('button', {name: 'Reject the claim'}));
    await waitFor(() => expect(api.lastBody('POST /api/ai-analysis-candidates/cand-1/claim-review')).toEqual({
      claim_id: 'CLM-0001', decision: 'reject', text: null, reason: 'overstated'}));
  });

  it('shows the model’s words struck beside a correction, and nothing to decide once the answer is reviewed', async () => {
    const corrected = {...CAND, review_status: 'accepted', claim_reviews: {'CLM-0001': {decision: 'correct', text: 'Kestrel SA held 62%.', reason: null, reviewed_at: '2026-10-10T15:00:00Z'}}};
    open(2, {'GET /api/ai-analysis-candidates/cand-1': corrected});
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^Corroboration/}));
    const drawer = screen.getByRole('dialog');
    expect(await within(drawer).findByText('Kestrel SA held 62%.')).toHaveClass('mine');
    expect(within(drawer).getByText('Kestrel SA controlled Fernhill Ltd.').tagName).toBe('S');
    expect(within(drawer).queryByRole('button', {name: '✓ Keep'})).toBeNull();
    expect(within(drawer).getByText(/corrected · you/, {selector: '.cr-decide'})).toBeInTheDocument();
  });

  it('opens the review step and the instructions drawer from its header', async () => {
    const events = record(2);
    mockApi({[`GET ${EV}`]: {run: {...RUN, events: events.length}, events}, 'GET /api/ai-analysis-candidates/cand-1': CAND});
    const review = vi.fn();
    const plan = vi.fn();
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-1" onReview={review} onPlan={plan} planDrawer={<p>The plan panel</p>}/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Review · 2 wait'}));
    expect(review).toHaveBeenCalledWith('cand-1');
    expect(screen.getByRole('region', {name: 'Instructions and plan'})).toHaveTextContent('The plan panel');
    await user.click(screen.getByRole('button', {name: 'Instructions & plan'}));
    expect(plan).toHaveBeenCalledWith({question: RUN.question, module: 'case_synthesis', theory: null});
  });
});

describe('ReviewSheet, a suite answer', () => {
  it('names a logic check’s parts as arguments and asks no likelihood of them', async () => {
    mockApi({'GET /api/ai-analysis-candidates/cand-3': {...CAND, id: 'cand-3', module: 'las_argument_check',
      payload: {arguments: [{arg_id: 'ARG-0001', conclusion: 'The payments were routed to hide their source.'}]}}});
    render(<QueryProvider><ReviewSheet candidateId="cand-3" header={<h2>Review</h2>} onBack={() => {}}/></QueryProvider>);
    expect(await screen.findByText('1 argument')).toBeInTheDocument();
    const detail = screen.getByRole('region', {name: 'ARG-0001 in full'});
    expect(within(detail).queryByText('Likelihood')).toBeNull();
    expect(within(detail).queryByText(/unclassified/)).toBeNull();
  });
});

describe('parseSse', () => {
  it('splits whole messages and keeps the rest for the next bytes', () => {
    const {messages, rest} = parseSse('id: 3\nevent: step\ndata: {"n":3}\n\nid: 4\nevent: st');
    expect(messages).toEqual([{id: '3', event: 'step', data: '{"n":3}'}]);
    expect(rest).toBe('id: 4\nevent: st');
    expect(parseSse('event: end\ndata: {}\n\n').messages[0].event).toBe('end');
  });
});
