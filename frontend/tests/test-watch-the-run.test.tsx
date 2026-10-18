// @vitest-environment jsdom
// Act › AI runs › Watch the run (mockup AI_1): the run record drawn as a map, the one-line header, the lanes on a real
// time axis, the trace drawer for one thought, streams for crowds of thoughts, and the review that applies to the answer.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {parseSse} from '../features/ai/run-stream';
import {WatchTheRun} from '../features/ai/watch-the-run';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const EV = '/api/investigations/inv-1/ai-runs/run-1/events';
const RUN = {run_id: 'run-1', status: 'succeeded', finished: true, module: 'case_synthesis', question: 'Who controlled Fernhill Ltd between 2016 and 2023?',
  working_theory: null, created_at: '2026-10-10T14:02:00Z', started_at: '2026-10-10T14:02:00Z', finished_at: '2026-10-10T14:03:12Z', candidate_id: 'cand-1',
  review_status: 'proposed', events: 0, problems: 1, message: null, error: null};

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
  {claim_id: 'CLM-0001', claim: 'Kestrel SA controlled Fernhill Ltd.', classification: 'SOURCE_STATEMENT', confidence_term: 'LIKELY', confidence: 'MEDIUM'}]},
  rejection_reason: null, request: {}, reviewed_at: null, reviewer_note: null, trace: null, accepted_record_id: null, accepted_record_type: null,
  checked_citation_count: 0, checked_citation_ids: []};

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
  it('draws the header in one line, the key, the systems not triggered and the three ledgers', async () => {
    open();
    const map = await screen.findByRole('group', {name: /The run as a map/});
    await waitFor(() => expect(screen.getByRole('heading', {level: 2}).textContent).toMatch(/Act · AI runs · Case synthesis · 10 Oct 1[0-9]:\d\d/));
    expect(screen.getByRole('button', {name: /Events: summary/})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /^2 problems/})).toBeInTheDocument();
    expect(within(map as unknown as HTMLElement).getAllByText('not triggered').length).toBe(4);
    expect(within(screen.getByRole('list', {name: 'Key'})).getAllByRole('listitem')).toHaveLength(6);
    await waitFor(() => expect(screen.getByText('Run record').parentElement?.textContent).toMatch(/\d+/));
    expect(screen.getByText('Judgement ledger')).toBeInTheDocument();
    expect(screen.getByText(/tas\/10 not run here/)).toBeInTheDocument();
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
    expect(within(drawer).getByText(/Accept and reject apply to the whole answer/)).toBeInTheDocument();
    expect(within(drawer).getByRole('button', {name: /To check/})).toBeDisabled();
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
  });

  it('says why a stopped run stopped', async () => {
    const events = record(1);
    mockApi({[`GET ${EV}`]: {run: {...RUN, status: 'failed', candidate_id: null, review_status: null, message: 'Stopped by the app’s checks: a cited record is not in the packet', events: events.length}, events}});
    render(<QueryProvider><WatchTheRun investigationId="inv-1" runId="run-1"/></QueryProvider>);
    expect(await screen.findByText(/Stopped · 10 Oct/)).toBeInTheDocument();
    expect(screen.getByText(/a cited record is not in the packet/)).toBeInTheDocument();
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
