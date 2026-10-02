// @vitest-environment jsdom
// The claim verification workspace, moved out of app/page.tsx onto the
// generated client (Foundation Fixes fixes 2 and 3): the claim list, a
// claim's workspace (evidence, dependent relationships, review history),
// attaching pool evidence, recording a review, and opening a claim on
// another panel's request through the shared store.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ClaimsPanel} from '../features/claims/claims-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null, claim: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CLAIMS = 'GET /api/investigations/inv-1/claims';
const EVIDENCE = 'GET /api/investigations/inv-1/evidence';
const WORKSPACE = 'GET /api/claims/claim-1/review-workspace';

function claimFixture(overrides: Record<string, unknown> = {}) {
  return {id: 'claim-1', investigation_id: 'inv-1', text: 'The contract was approved on March 3.', status: 'unverified', confidence: 0.4, created_at: '2026-10-01T00:00:00', ...overrides};
}

const source = {id: 'src-1', investigation_id: 'inv-1', title: 'Board minutes', url: 'https://example.test/minutes', source_type: 'document', metadata_json: {}, created_at: '2026-10-01T00:00:00'};
const evidence = {id: 'ev-1', source_id: 'src-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', notes: null};
const poolRow = {evidence, source};

function workspace(claim: ReturnType<typeof claimFixture>, overrides: Record<string, unknown> = {}) {
  return {claim, evidence: [], dependent_relationships: [], review_history: [], stance_counts: {supports: 0, contradicts: 0, context: 0}, ...overrides};
}

const relationships = [{id: 'rel-1', schema: 'Directorship', source: {caption: 'Jane Doe'}, target: {caption: 'Kestrelwood Holdings'}}];

async function renderPanel(routes: Record<string, unknown> = {}, onInspectRelationship = vi.fn()) {
  const api = mockApi({[CLAIMS]: [claimFixture()], [EVIDENCE]: [poolRow], ...routes});
  wrap(<ClaimsPanel investigationId="inv-1" relationships={relationships} onInspectRelationship={onInspectRelationship}/>);
  await screen.findByText('The contract was approved on March 3.');
  return api;
}

describe('ClaimsPanel', () => {
  it('lists the claims and disables Add unverified claim until text is entered', async () => {
    await renderPanel();
    expect(screen.getByText('unverified · 40% confidence')).toBeInTheDocument();
    expect(screen.getByText('Choose a claim to inspect its evidence and verification state.')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add unverified claim'})).toBeDisabled();
  });

  it('creates a claim, reloads the list, and opens its review workspace', async () => {
    const api = await renderPanel();
    const created = claimFixture({id: 'claim-2', text: 'The vendor was paid twice.'});
    api.add({
      'POST /api/claims': created,
      [CLAIMS]: [claimFixture(), created],
      'GET /api/claims/claim-2/review-workspace': workspace(created),
    });
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Write a testable factual claim…'), 'The vendor was paid twice.{Enter}');

    await screen.findByRole('heading', {name: 'The vendor was paid twice.', level: 4});
    expect(screen.getByText('No evidence is linked to this claim yet.')).toBeInTheDocument();
    expect(screen.getByText('No reporter review has been recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('0 supporting · 0 contradicting · 0 context')).toBeInTheDocument();
    expect(api.lastBody('POST /api/claims')).toEqual({investigation_id: 'inv-1', text: 'The vendor was paid twice.', status: 'unverified', confidence: 0});
    expect(api.calls(CLAIMS)).toHaveLength(2);
    expect(api.calls('GET /api/claims/claim-2/review-workspace')).toHaveLength(1);
    expect(screen.getByPlaceholderText('Write a testable factual claim…')).toHaveValue('');
    expect(api.unmatched()).toEqual([]);
  });

  it('opens a claim on request from another panel, and starts the review form from the claim', async () => {
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture())});
    useWorkbenchStore.getState().openClaim('claim-1');
    await screen.findByRole('heading', {name: 'The contract was approved on March 3.', level: 4});
    expect(screen.getByText('Confidence 40%')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').find(el => el.textContent === 'unverified')).toBeTruthy();
    expect(api.calls(WORKSPACE)).toHaveLength(1);

    // A claim the panel does not hold is not opened.
    useWorkbenchStore.getState().openClaim('claim-99');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByRole('heading', {name: 'The contract was approved on March 3.', level: 4})).toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });

  it('requires a rationale before a review is recorded, then records it from the reply', async () => {
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture())});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText("No canonical relationship currently depends on this claim's linked evidence.");
    expect(screen.getByRole('button', {name: 'Record review'})).toBeDisabled();

    const updated = claimFixture({status: 'confirmed', confidence: 0.9});
    const review = {id: 'rev-1', claim_id: 'claim-1', from_status: 'unverified', to_status: 'confirmed', from_confidence: 0.4, to_confidence: 0.9, rationale: 'Board minutes confirm the date directly.', created_at: '2026-10-02T00:00:00'};
    api.add({'POST /api/claims/claim-1/reviews': {claim: updated, review, workspace: workspace(updated, {review_history: [review]})}});
    await user.click(screen.getAllByRole('combobox').find(el => el.textContent === 'unverified')!);
    await user.click(await screen.findByRole('option', {name: 'confirmed'}));
    await user.type(screen.getByPlaceholderText('Required rationale for this review'), 'Board minutes confirm the date directly.');
    await user.click(screen.getByRole('button', {name: 'Record review'}));

    await screen.findByText('Recorded immutable review: confirmed at 90% confidence.');
    expect(api.lastBody('POST /api/claims/claim-1/reviews')).toEqual({status: 'confirmed', confidence: 0.4, rationale: 'Board minutes confirm the date directly.'});
    // The reply is what the screen shows now: the list, the history, and no further request.
    expect(screen.getByText('confirmed · 90% confidence')).toBeInTheDocument();
    expect(screen.getByText('unverified → confirmed')).toBeInTheDocument();
    expect(screen.getByText('Board minutes confirm the date directly.')).toBeInTheDocument();
    expect(api.calls(CLAIMS)).toHaveLength(1);
    expect(api.calls(WORKSPACE)).toHaveLength(1);
    expect(screen.getByPlaceholderText('Required rationale for this review')).toHaveValue('');
    expect(api.unmatched()).toEqual([]);
  });

  it('attaches pool evidence to the open claim as supporting and refreshes the workspace', async () => {
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture())});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('No evidence is linked to this claim yet.');
    expect(screen.getByText('Approved 3/3, signed by CFO.')).toBeInTheDocument();

    api.add({
      'POST /api/claims/claim-1/evidence': {id: 'link-1', claim_id: 'claim-1', evidence_id: 'ev-1', stance: 'supports', note: 'Signed copy', created_at: '2026-10-02T00:00:00'},
      [WORKSPACE]: workspace(claimFixture(), {
        evidence: [{id: 'link-1', stance: 'supports', evidence, source, note: 'Signed copy', created_at: '2026-10-02T00:00:00'}],
        stance_counts: {supports: 1, contradicts: 0, context: 0},
      }),
    });
    await user.type(screen.getByPlaceholderText('Optional reporter note for the next evidence link'), 'Signed copy');
    await user.click(screen.getByRole('button', {name: 'Supports'}));

    await screen.findByText('Linked evidence as supports.');
    expect(api.lastBody('POST /api/claims/claim-1/evidence')).toEqual({evidence_id: 'ev-1', stance: 'supports', note: 'Signed copy'});
    expect(api.calls(WORKSPACE)).toHaveLength(2);
    expect(screen.getByText('1 supporting · 0 contradicting · 0 context')).toBeInTheDocument();
    expect(screen.getByText('Reporter note: Signed copy')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Supports ✓'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Contradicts'})).toBeEnabled();
    expect(screen.getByPlaceholderText('Optional reporter note for the next evidence link')).toHaveValue('');
    expect(api.unmatched()).toEqual([]);
  });

  it('names a dependent relationship the page holds, inspects it there, and traces the rest', async () => {
    const onInspect = vi.fn();
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture(), {
      evidence: [{id: 'link-1', stance: 'supports', evidence, source, note: null, created_at: '2026-10-02T00:00:00'}],
      dependent_relationships: [
        {id: 'rel-1', relationship_entity_id: 'rel-ent-1', source_entity_id: 'ent-2', target_entity_id: 'ent-1', evidence_ids: ['ev-1']},
        {id: 'rel-9', relationship_entity_id: null, source_entity_id: 'ent-3', target_entity_id: 'ent-4', evidence_ids: ['ev-1', 'ev-2']},
      ],
      stance_counts: {supports: 1, contradicts: 0, context: 0},
    })}, onInspect);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('Jane Doe → Kestrelwood Holdings');
    expect(screen.getByText('Directorship · 1 linked evidence record(s)')).toBeInTheDocument();
    expect(screen.getByText('Relationship rel-9')).toBeInTheDocument();
    expect(screen.getByText('FollowTheMoney relationship · 2 linked evidence record(s)')).toBeInTheDocument();

    const [inspectKnown, inspectUnknown] = screen.getAllByRole('button', {name: 'Inspect relationship'});
    await user.click(inspectKnown);
    expect(onInspect).toHaveBeenCalledWith('rel-1');
    await user.click(inspectUnknown);
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({title: 'The contract was approved on March 3.', kind: 'claim-dependent relationship', traceRecordType: 'relationship', acceptedRecordId: 'rel-9'});

    await user.click(screen.getAllByRole('button', {name: 'Trace provenance'})[0]);
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({
      title: 'The contract was approved on March 3.', kind: 'claim evidence: supports', sourceId: 'src-1', sourceUrl: 'https://example.test/minutes',
      locator: 'p.4', detail: 'Approved 3/3, signed by CFO.', acceptedRecordType: 'evidence', acceptedRecordId: 'ev-1',
    });
    await user.click(screen.getAllByRole('button', {name: 'Trace provenance'})[1]);
    expect(useWorkbenchStore.getState().provenance?.request).toMatchObject({title: 'Board minutes', kind: 'evidence pool', sourceId: 'src-1', acceptedRecordId: 'ev-1'});
    expect(api.unmatched()).toEqual([]);
  });

  it('shows the server\'s reason when a claim or a link is refused, and forgets the open claim with the case', async () => {
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture()), 'POST /api/claims': {status: 400, body: {detail: 'Claim text is required'}}});
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Write a testable factual claim…'), 'x{Enter}');
    await screen.findByText(/Claim text is required/);
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('No evidence is linked to this claim yet.');
    api.add({'POST /api/claims/claim-1/evidence': {status: 400, body: {detail: 'Claim and evidence must belong to the same investigation'}}});
    await user.click(screen.getByRole('button', {name: 'Context'}));
    await screen.findByText(/Claim and evidence must belong to the same investigation/);

    api.add({'GET /api/investigations/inv-2/claims': [], 'GET /api/investigations/inv-2/evidence': []});
    cleanup();
    wrap(<ClaimsPanel investigationId="inv-2" relationships={[]} onInspectRelationship={vi.fn()}/>);
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-2/claims')).toHaveLength(1));
    expect(screen.getByText('No claims yet.')).toBeInTheDocument();
  });
});
