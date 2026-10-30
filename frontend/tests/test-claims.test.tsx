// @vitest-environment jsdom
// The claim verification workspace, moved out of app/page.tsx onto the
// generated client (Foundation Fixes fixes 2 and 3): the claim list, a
// claim's workspace (evidence, dependent relationships, review history),
// attaching pool evidence, recording a review, and opening a claim on
// another panel's request through the shared store.
import {claimDoneFixture} from '../test-support/page-routes';
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
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
  return {claim, evidence: [], dependent_relationships: [], review_history: [], stance_counts: {supports: 0, contradicts: 0, context: 0}, done: claimDoneFixture(), ...overrides};
}

const relationships = [{id: 'rel-1', schema: 'Directorship', source: {caption: 'Jane Doe'}, target: {caption: 'Kestrelwood Holdings'}}];

async function renderPanel(routes: Record<string, unknown> = {}, onInspectRelationship = vi.fn()) {
  const api = mockApi({[CLAIMS]: [claimFixture()], [EVIDENCE]: [poolRow], 'GET /api/investigations/inv-1/watches': [], ...routes});
  wrap(<ClaimsPanel investigationId="inv-1" relationships={relationships} onInspectRelationship={onInspectRelationship}/>);
  await screen.findByText('The contract was approved on March 3.');
  return api;
}

describe('ClaimsPanel', () => {
  it('grades a claim on the IPCC grid in a review, both halves or neither, and shows the grade and its history', async () => {
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture(), {source_count: 2})});
    const user = userEvent.setup();
    await user.click(screen.getByText('The contract was approved on March 3.'));
    expect(await screen.findByRole('img', {name: 'From 2 sources'})).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Required rationale for this review'), 'Two independent filings agree.');
    // One half alone is refused before anything is sent.
    screen.getByRole('combobox', {name: 'Evidence'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Evidence: robust'}));
    await user.click(screen.getByRole('button', {name: 'Record review'}));
    expect(await screen.findByText('A confidence grade gives both the evidence and the agreement.')).toBeInTheDocument();
    expect(api.calls('POST /api/claims/claim-1/reviews')).toHaveLength(0);

    const graded = claimFixture({status: 'unverified', evidence_grade: 'robust', agreement_grade: 'high'});
    api.add({'POST /api/claims/claim-1/reviews': {claim: graded, review: {id: 'r1', claim_id: 'claim-1', from_status: 'unverified', to_status: 'unverified',
      from_confidence: 0.4, to_confidence: 0.4, from_evidence_grade: null, to_evidence_grade: 'robust', from_agreement_grade: null, to_agreement_grade: 'high',
      rationale: 'Two independent filings agree.', created_at: '2026-10-03T00:00:00'},
    workspace: workspace(graded, {source_count: 2, review_history: [{id: 'r1', claim_id: 'claim-1', from_status: 'unverified', to_status: 'unverified',
      from_confidence: 0.4, to_confidence: 0.4, from_evidence_grade: null, to_evidence_grade: 'robust', from_agreement_grade: null, to_agreement_grade: 'high',
      rationale: 'Two independent filings agree.', created_at: '2026-10-03T00:00:00'}]})}});
    screen.getByRole('combobox', {name: 'Agreement'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Agreement: high'}));
    await user.click(screen.getByRole('button', {name: 'Record review'}));
    expect(await screen.findByText(/robust evidence, high agreement\.$/)).toBeInTheDocument();
    expect(api.lastBody('POST /api/claims/claim-1/reviews')).toEqual({status: 'unverified', confidence: 0.4, rationale: 'Two independent filings agree.',
      evidence_grade: 'robust', agreement_grade: 'high'});
    // The row shows the confidence as a number; its words and the grade are revealed (in the page for screen readers).
    expect(screen.getByText('40% confidence · robust evidence, high agreement').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText(/not graded → robust evidence, high agreement/)).toBeInTheDocument();
  });

  it('shows every status in the list by its colour, with its shape and word in the chip for the other settings and screen readers', async () => {
    await renderPanel({[CLAIMS]: [
      claimFixture(),
      claimFixture({id: 'claim-2', text: 'The vendor was paid twice.', status: 'disputed'}),
      claimFixture({id: 'claim-3', text: 'The board met in May.', status: 'confirmed'}),
      claimFixture({id: 'claim-4', text: 'The CFO signed alone.', status: 'rejected'}),
      claimFixture({id: 'claim-5', text: 'Who approved the transfer?', status: 'lead'}),
    ], 'GET /api/claims/claim-2/review-workspace': workspace(claimFixture({id: 'claim-2', text: 'The vendor was paid twice.', status: 'disputed'}))});
    const expected: [string, string, string, string][] = [
      ['The contract was approved on March 3.', 'Unverified', 'unshown', '○'],
      ['The vendor was paid twice.', 'Disputed', 'disputed', '✕'],
      ['The board met in May.', 'Confirmed', 'supported', '✓'],
      ['The CFO signed alone.', 'Rejected', 'ruled_out', '–'],
      ['Who approved the transfer?', 'Lead', 'unshown', '○'],
    ];
    for (const [text, word, shape, mark] of expected) {
      const row = screen.getByText(text).closest('button')!;
      // The row's left edge takes the shape (solid, dashed, double, dotted); its chip carries the mark and the word
      // (shown by Settings › Appearance › Status marks, read by screen readers, named on hover).
      expect(row).toHaveClass(`cl-${shape}`);
      const chip = within(row).getByText(word).closest('.st')!;
      expect(chip).toHaveClass('st', `st-${shape}`);
      expect(chip.querySelector('[aria-hidden="true"]')?.textContent).toBe(mark);
    }
    // The open claim is marked as the current one in the list.
    const row = (name: RegExp) => screen.getByRole('button', {name});
    await userEvent.setup().click(row(/The vendor was paid twice\./));
    await waitFor(() => expect(row(/The vendor was paid twice\./)).toHaveAttribute('aria-current', 'true'));
    expect(row(/The contract was approved on March 3\./)).not.toHaveAttribute('aria-current');
    // The open claim's heading carries the same chip.
    expect(await screen.findByRole('heading', {name: 'The vendor was paid twice.'})).toBeInTheDocument();
  });

  it('lists the claims and disables Add unverified claim until text is entered', async () => {
    await renderPanel();
    expect(screen.getByText('40%')).toBeVisible();
    expect(screen.getByText('40% confidence').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('Choose a claim to inspect its evidence and verification state.')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add unverified claim'})).toBeDisabled();
  });

  it('draws no empty section: one quiet line says what is empty; the status is a radio group in its colours', async () => {
    await renderPanel({[WORKSPACE]: workspace(claimFixture())});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('No evidence is linked to this claim yet.');
    expect(screen.getByText('No review recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing rests on it.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: /Linked evidence|Review history|Relationships resting on it/})).toBeNull();
    // A zero figure is quiet; each figure is named on reveal.
    expect(screen.getByRole('img', {name: '0 supporting · 0 contradicting · 0 context'}).querySelectorAll('.cw-num.zero')).toHaveLength(3);
    const status = screen.getByRole('radiogroup', {name: 'Status'});
    expect(within(status).getAllByRole('radio')).toHaveLength(6);
    expect(within(status).getByRole('radio', {name: 'Unverified'})).toHaveAttribute('aria-checked', 'true');
    within(status).getByRole('radio', {name: 'Unverified'}).focus();
    await user.keyboard('{ArrowRight}');
    expect(within(status).getByRole('radio', {name: 'Supported'})).toHaveAttribute('aria-checked', 'true');
    expect(within(status).getByRole('radio', {name: 'Supported'})).toHaveClass('t-supported');
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
    expect(screen.getByText('No review recorded yet.')).toBeInTheDocument();
    expect(screen.getByRole('img', {name: '0 supporting · 0 contradicting · 0 context'})).toBeInTheDocument();
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
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0.4');
    expect(screen.getByRole('radio', {name: 'Unverified'})).toHaveAttribute('aria-checked', 'true');
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
    await user.click(screen.getByRole('radio', {name: 'Confirmed'}));
    await user.type(screen.getByPlaceholderText('Required rationale for this review'), 'Board minutes confirm the date directly.');
    await user.click(screen.getByRole('button', {name: 'Record review'}));

    await screen.findByText('Recorded immutable review: confirmed at 90% confidence.');
    expect(api.lastBody('POST /api/claims/claim-1/reviews')).toEqual({status: 'confirmed', confidence: 0.4, rationale: 'Board minutes confirm the date directly.'});
    // The reply is what the screen shows now: the list, the history, and no further request.
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getAllByText('Confirmed')[0].closest('.st')).toHaveClass('st-supported');
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
    // The case's evidence pool is one click away, not a wall of text under the claim.
    expect(screen.queryByText('Approved 3/3, signed by CFO.')).toBeNull();
    await user.click(screen.getByRole('button', {name: 'Attach evidence'}));
    expect(screen.getByText('Approved 3/3, signed by CFO.')).toBeInTheDocument();

    api.add({
      'POST /api/claims/claim-1/evidence': {id: 'link-1', claim_id: 'claim-1', evidence_id: 'ev-1', stance: 'supports', note: 'Signed copy', created_at: '2026-10-02T00:00:00'},
      [WORKSPACE]: workspace(claimFixture(), {
        evidence: [{id: 'link-1', stance: 'supports', evidence, source, note: 'Signed copy', created_at: '2026-10-02T00:00:00'}],
        stance_counts: {supports: 1, contradicts: 0, context: 0}, done: claimDoneFixture(),
      }),
    });
    await user.type(screen.getByPlaceholderText('Optional reporter note for the next evidence link'), 'Signed copy');
    await user.click(screen.getByRole('button', {name: 'Supports'}));

    await screen.findByText('Linked evidence as supports.');
    expect(api.lastBody('POST /api/claims/claim-1/evidence')).toEqual({evidence_id: 'ev-1', stance: 'supports', note: 'Signed copy'});
    expect(api.calls(WORKSPACE)).toHaveLength(2);
    expect(screen.getByRole('img', {name: '1 supporting · 0 contradicting · 0 context'})).toBeInTheDocument();
    expect(screen.getByText('Reporter note: Signed copy').closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('img', {name: 'Supports'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Supports ✓'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Contradicts'})).toBeEnabled();
    expect(screen.getByPlaceholderText('Optional reporter note for the next evidence link')).toHaveValue('');
    expect(api.unmatched()).toEqual([]);
  });

  it('marks evidence superseded by a newer record: struck, its reason and replacement on hover, not counted, and undone', async () => {
    const later = {id: 'ev-2', source_id: 'src-2', quote: 'Approved 4/3 after correction.', locator: 'p.2', notes: null};
    const judgment = {...source, id: 'src-2', title: 'Corrected minutes', url: null};
    const rows = [
      {id: 'link-1', stance: 'supports', evidence, source, note: null, created_at: '2026-10-02T00:00:00'},
      {id: 'link-2', stance: 'supports', evidence: later, source: judgment, note: null, created_at: '2026-10-03T00:00:00'},
    ];
    const mark = {at: '2026-10-04T00:00:00', by_evidence_id: 'ev-2', by_label: 'Corrected minutes', by_locator: 'p.2', reason: 'The minutes were corrected',
      decided_by_id: 'local-owner', decided_by_name: 'Ony'};
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture(), {evidence: rows, stance_counts: {supports: 2, contradicts: 0, context: 0}})});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('Approved 3/3, signed by CFO.');
    await user.click(screen.getAllByRole('button', {name: 'Mark superseded'})[0]);
    const form = screen.getByRole('form', {name: 'Mark superseded'});
    // The claim's own other evidence is offered first as what replaces it; nothing is sent without a reason.
    expect(within(form).getByRole('option', {name: /Corrected minutes · Approved 4\/3/})).toBeInTheDocument();
    expect(within(form).getByRole('button', {name: 'Mark superseded'})).toBeDisabled();
    await user.selectOptions(within(form).getByRole('combobox'), 'ev-2');
    await user.type(within(form).getByRole('textbox'), 'The minutes were corrected');
    api.add({'POST /api/claims/claim-1/evidence/link-1/supersede': workspace(claimFixture(), {
      evidence: [{...rows[0], superseded: mark}, rows[1]], stance_counts: {supports: 1, contradicts: 0, context: 0}, superseded_count: 1})});
    await user.click(within(form).getByRole('button', {name: 'Mark superseded'}));
    await screen.findByText('Marked superseded: shown, no longer counted toward the claim.');
    expect(api.lastBody('POST /api/claims/claim-1/evidence/link-1/supersede')).toEqual({reason: 'The minutes were corrected', by_evidence_id: 'ev-2'});
    // Still listed, struck; what replaced it, why and who are revealed (in the page for screen readers).
    const struck = screen.getByText('Approved 3/3, signed by CFO.');
    expect(struck.tagName).toBe('S');
    expect(struck.closest('li')).toHaveClass('cl-ev-gone');
    expect(screen.getByText('Superseded by Corrected minutes, p.2').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('Marked by Ony · ' + new Date('2026-10-04T00:00:00Z').toLocaleDateString())).toBeInTheDocument();
    expect(screen.getByRole('img', {name: '1 supporting · 0 contradicting · 0 context'})).toBeInTheDocument();
    // Pointing at it lights the record that replaced it.
    await user.hover(struck.closest('li')!);
    expect(screen.getByText('Approved 4/3 after correction.').closest('li')).toHaveClass('cl-ev-replacer');

    api.add({'DELETE /api/claims/claim-1/evidence/link-1/supersede': workspace(claimFixture(), {evidence: rows, stance_counts: {supports: 2, contradicts: 0, context: 0}})});
    await user.click(screen.getByRole('button', {name: 'Undo superseded'}));
    await screen.findByText('Counted again: the superseded mark is undone.');
    expect(screen.getByText('Approved 3/3, signed by CFO.').tagName).not.toBe('S');
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
      stance_counts: {supports: 1, contradicts: 0, context: 0}, done: claimDoneFixture(),
    })}, onInspect);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('Jane Doe → Kestrelwood Holdings');
    expect(screen.getByText('Directorship · 1 linked evidence record(s)').closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('img', {name: 'Directorship: Directs, works for or belongs to'})).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', {name: 'Attach evidence'}));
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
    await user.click(screen.getByRole('button', {name: 'Attach evidence'}));
    await user.click(screen.getByRole('button', {name: 'Context'}));
    await screen.findByText(/Claim and evidence must belong to the same investigation/);

    api.add({'GET /api/investigations/inv-2/claims': [], 'GET /api/investigations/inv-2/evidence': []});
    cleanup();
    wrap(<ClaimsPanel investigationId="inv-2" relationships={[]} onInspectRelationship={vi.fn()}/>);
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-2/claims')).toHaveLength(1));
    expect(screen.getByText('No claims yet.')).toBeInTheDocument();
  });

  it('filters the list by status from the tally and by the words typed, and ranks the pool by the open claim\'s words', async () => {
    const other = {evidence: {id: 'ev-2', source_id: 'src-1', quote: 'The weather was mild in spring.', locator: null, notes: null}, source};
    const fitting = {evidence: {id: 'ev-3', source_id: 'src-1', quote: 'The contract was approved by the board.', locator: null, notes: null}, source};
    await renderPanel({[CLAIMS]: [claimFixture(), claimFixture({id: 'claim-2', text: 'The vendor was paid twice.', status: 'disputed'})],
      [EVIDENCE]: [other, fitting], [WORKSPACE]: workspace(claimFixture())});
    const user = userEvent.setup();
    // The tally shows each status's count; a click shows only those claims.
    await user.click(screen.getByRole('button', {name: 'Disputed: 1'}));
    expect(screen.queryByText('The contract was approved on March 3.')).toBeNull();
    expect(screen.getByText('The vendor was paid twice.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Clear'}));
    await user.type(screen.getByRole('searchbox', {name: 'Find a claim'}), 'contract');
    expect(screen.queryByText('The vendor was paid twice.')).toBeNull();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await user.click(await screen.findByRole('button', {name: 'Attach evidence'}));
    const quotes = [...document.querySelectorAll('.cw-pool-quote')].map(el => el.textContent);
    expect(quotes).toEqual(['The contract was approved by the board.', 'The weather was mild in spring.']);
  });

  it('holds Supported to the Done rules: names what is left, and records it anyway only with a reason', async () => {
    const api = await renderPanel({[WORKSPACE]: workspace(claimFixture(), {done: claimDoneFixture('claim-1', false)})});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText("No canonical relationship currently depends on this claim's linked evidence.");
    await user.click(screen.getByRole('radio', {name: 'Supported'}));
    const done = await screen.findByTestId('claim-done');
    expect(done).toHaveTextContent('Supported means');
    // A publication gate: the rules stay on screen; each rule's state is its shape, named (with its detail) on reveal.
    expect(within(done).getByText('At least one supporting item is linked')).toBeVisible();
    expect(within(done).getByRole('img', {name: 'Not met'})).toHaveTextContent('✕');
    expect(within(done).getByRole('img', {name: 'Cannot be checked here'})).toHaveAccessibleDescription(/No supporting item has a stored file\./);
    expect(within(done).getByText('No supporting item has a stored file.').closest('[hidden]')).not.toBeNull();
    await user.type(screen.getByPlaceholderText('Required rationale for this review'), 'Two editors read it.');
    expect(screen.getByRole('button', {name: 'Supported — 1 check left'})).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/Some true facts have one source/), 'The registry is the only record.');
    const updated = claimFixture({status: 'supported'});
    const review = {id: 'rev-9', claim_id: 'claim-1', from_status: 'unverified', to_status: 'supported', from_confidence: 0.4, to_confidence: 0.4,
      rationale: 'Two editors read it.', override_reason: 'The registry is the only record.', unmet_rules: ['supporting'], created_at: '2026-10-11T00:00:00'};
    api.add({'POST /api/claims/claim-1/reviews': {claim: updated, review, workspace: workspace(updated, {review_history: [review]})}});
    await user.click(screen.getByRole('button', {name: 'Mark supported anyway'}));
    await screen.findByText('Marked without: supporting. Reason: The registry is the only record.');
    expect(api.lastBody('POST /api/claims/claim-1/reviews')).toMatchObject({status: 'supported', override_reason: 'The registry is the only record.'});
  });
});
