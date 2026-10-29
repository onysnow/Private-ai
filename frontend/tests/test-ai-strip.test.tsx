// @vitest-environment jsdom
// The case home's AI strip (research AI §3–4 "Front and centre"): AI off, drafts waiting and the last run's tallies,
// and while a run is live, the miniature pipeline with its problem count.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AiStrip} from '../features/ai/ai-strip';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({useRouter: () => ({push, replace: vi.fn(), prefetch: vi.fn()})}));

const RUN = {run_id: 'run-1', status: 'succeeded', finished: true, module: 'case_synthesis', question: 'Who?', working_theory: null,
  created_at: '2026-10-10T14:02:00Z', started_at: '2026-10-10T14:02:00Z', finished_at: '2026-10-10T14:03:12Z', candidate_id: 'cand-1',
  review_status: 'proposed', events: 3, problems: 1, message: null, error: null, route: {system: 'tas', row: 2, node: 'tas/08', title: 'Case synthesis', modules_in_system: 13, final_audit: {node: 'tas/10', file: '10_FINAL_ACCURACY_AUDIT.md'}}};
const ev = (n: number, o: Record<string, unknown>) => ({n, at: '2026-10-10T14:02:05Z', system: 'app', rule: null, status: 'good', verdict: null, refs: [],
  parent: null, self_reported: false, detail: null, kind: 'CHECK', node: 'run', text: 'x', ...o});
const caps = (on: boolean) => ({product: 'Journalism Workbench', mode: 'core_preview', ai_features_enabled: on,
  core: {investigations: true, documents: true, sources: true, evidence: true, claims: true, relationships: true, search: true, dossiers: true,
    timeline: true, leads_and_tasks: true, provenance: true, connectors: true, backup_restore: true},
  platforms: {openaleph: {enabled: false, role: 'local_corpus_search_ingestion_platform'}}, note: 'AI is optional.'});

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); push.mockReset(); });
afterEach(() => cleanup());

describe('AiStrip', () => {
  it('says AI off when AI is turned off', async () => {
    mockApi({'GET /api/capabilities': caps(false)});
    render(<QueryProvider><AiStrip investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText('AI off')).toBeInTheDocument();
  });

  it('counts drafts waiting, shows the last run and its tallies, and opens it', async () => {
    mockApi({
      'GET /api/capabilities': caps(true),
      'GET /api/investigations/inv-1/ai-runs': {runs: [RUN]},
      'GET /api/investigations/inv-1/ai-analysis-candidates': {candidates: [{id: 'cand-1', investigation_id: 'inv-1', module: 'case_synthesis', review_status: 'proposed', confidence: 0.5,
        created_at: '2026-10-10T14:03:12Z', request: {}, rejection_reason: null, reviewed_at: null, reviewer_note: null,
        accepted_record_id: null, accepted_record_type: null, checked_citation_count: 0}]},
      'GET /api/investigations/inv-1/ai-runs/run-1/events': {run: RUN, events: [
        ev(1, {kind: 'RULE', node: 'tas/class', self_reported: true, status: 'good'}), ev(2, {node: 'gate:citation', parent: 1, status: 'good'}),
        ev(3, {kind: 'RULE', node: 'tas/class', self_reported: true, status: 'partial'}), ev(4, {node: 'gate:citation', parent: 3, status: 'bad'})]},
    });
    render(<QueryProvider><AiStrip investigationId="inv-1"/></QueryProvider>);
    // "AI · 1 waiting" shows; the drafts and the last run's time are revealed on it.
    const strip = await screen.findByRole('button', {name: /^AI · 1 waiting/});
    expect(strip).toHaveAccessibleDescription(/^1 AI draft waiting for review · last run \d\d:\d\d/);
    expect(await screen.findByLabelText('last run: 1 verified, 0 in between, 1 stopped, 0 findings')).toBeInTheDocument();
    await userEvent.setup().click(strip);
    expect(useWorkbenchStore.getState().aiRun?.runId).toBe('run-1');
    expect(push).toHaveBeenCalledWith('/act?inv=inv-1#ai-runs');
  });

  it('asks the case from the case home: the question opens step 1 of Ask the case', async () => {
    mockApi({
      'GET /api/capabilities': caps(true),
      'GET /api/investigations/inv-1/ai-runs': {runs: []},
      'GET /api/investigations/inv-1/ai-analysis-candidates': {candidates: []},
    });
    render(<QueryProvider><AiStrip investigationId="inv-1"/></QueryProvider>);
    const field = await screen.findByRole('textbox', {name: 'Ask the case a question'});
    const user = userEvent.setup();
    await user.type(field, 'Who controlled Fernhill Ltd?{Enter}');
    expect(useWorkbenchStore.getState().askCase?.question).toBe('Who controlled Fernhill Ltd?');
    expect(push).toHaveBeenCalledWith('/act?inv=inv-1#ai-runs');
  });

  it('draws the miniature pipeline while a run is live', async () => {
    const live = {...RUN, status: 'running', finished: false, problems: 2};
    mockApi({
      'GET /api/capabilities': caps(true),
      'GET /api/investigations/inv-1/ai-runs': {runs: [live]},
      'GET /api/investigations/inv-1/ai-analysis-candidates': {candidates: []},
      'GET /api/investigations/inv-1/ai-runs/run-1/events': {run: live, events: [
        ev(1, {kind: 'ROUTE', node: 'router', system: 'tas'}), ev(2, {node: 'model', verdict: 'STARTED', status: 'neutral'})]},
    });
    render(<QueryProvider><AiStrip investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByRole('button', {name: 'AI run live: TAS routed, the model is writing, 2 problems. Open it'})).toBeInTheDocument();
    expect(document.querySelectorAll('.ai-strip circle.on')).toHaveLength(1);
    expect(document.querySelector('.ai-strip circle.ring.writing')).not.toBeNull();
    expect(screen.queryByRole('textbox', {name: 'Ask the case a question'})).toBeNull();
  });
});
