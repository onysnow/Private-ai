// @vitest-environment jsdom
// The entity dossier, moved out of app/page.tsx onto the generated client
// (Foundation Fixes fixes 2 and 3): opened on another panel's request
// through the shared store; its identity history, property conflicts,
// relationships, claims, leads, tasks, timeline, external findings and
// evidence; a property-conflict decision confirmed with a rationale; the
// duplicate review, a previewed merge and the post-merge reconciliation; a
// lead from a relationship's context; an entity edit; a merged alias that
// answers with its surviving record.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DossierPanel} from '../features/dossier/dossier-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {Routes} from '../test-support/mock-api';
import {dossierFixture, dossierRoutes, emptyOwnershipChain, emptyReconciliation, entityFixture, findingFixture, leadQueueBody, relationshipFixture} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', entityId: '', provenance: null, claim: null, dossier: null, relationship: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const DOSSIER = 'GET /api/entities/ent-1/dossier';
const DUPLICATES = 'GET /api/entities/ent-1/duplicate-candidates';
const RECONCILIATION = 'GET /api/entities/ent-1/post-merge-reconciliation';
const entityA = entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company', {properties: {name: ['Kestrelwood Holdings Ltd'], jurisdiction: ['gb']}});
const entityB = entityFixture('ent-2', 'Kestrelwood Holdings LLC', 'Company');

const claim = {id: 'claim-1', investigation_id: 'inv-1', text: 'Kestrelwood owns the vessel.', status: 'supported', confidence: 0.8, created_at: '2026-10-01T00:00:00'};
const source = {id: 'src-1', investigation_id: 'inv-1', title: 'Registry filing', url: 'https://example.test/filing', source_type: 'document', metadata_json: {}, created_at: '2026-10-01T00:00:00'};
const evidence = {id: 'ev-1', source_id: 'src-1', quote: 'Owner: Kestrelwood Holdings Ltd', locator: 'p.2', notes: null};
const lead = {id: 'lead-1', investigation_id: 'inv-1', title: 'Ask the registry', detail: null, provider: 'aleph', provider_record_id: null, status: 'active', created_at: '2026-10-01T00:00:00'};
const task = {
  id: 'task-1', investigation_id: 'inv-1', lead_id: 'lead-1', title: 'File the request', detail: null, status: 'todo', priority: 'high', owner: 'AJ', due_date: null,
  created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00', history: [], task_context: null,
};
const event = {
  id: 'ev-t-1', kind: 'reporter_event', investigation_id: 'inv-1', title: 'Vessel registered', description: null, date_start: '2024-03-02', date_end: null, precision: 'day',
  verification_status: 'verified', synthetic: false, refs: {entity_id: 'ent-1'}, provenance: {}, context: null, sort_key: '2024-03-02',
};
const relationship = relationshipFixture({direction: 'outgoing', source: {id: 'ent-1', ftm_id: 'f1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company'}, target: {id: 'ent-3', ftm_id: 'f3', caption: 'MV Fair Tern', schema: 'Asset'}});

/** A dossier with one of everything. */
function fullDossier() {
  return dossierFixture(entityA, {
    summary: {...dossierFixture(entityA).summary, statement_count: 5, relationship_count: 1, claim_count: 1, evidence_count: 1, lead_count: 1, task_count: 1, external_finding_count: 1, unresolved_external_count: 1},
    identity_history: {
      canonical_entity_id: 'ent-1',
      aliases: [{id: 'alias-1', caption: 'Kestrelwood Holdings LLC', schema: 'Company', merged_into_entity_id: 'ent-1'}],
      canonical_decisions: [{id: 'dec-1', decision: 'same', confidence: 0.95, rationale: 'Matched registration number.', created_at: '2026-09-23T00:00:00', other_entity: {id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company'}}],
      merge_audits: [{id: 'merge-1', source_entity_id: 'ent-2', target_entity_id: 'ent-1', resolution_decision_id: 'dec-1', rationale: 'Confirmed duplicate filing.', moved_counts: {}, created_at: '2026-09-23T00:00:00'}],
      unresolved_decision_count: 1,
    },
    relationships: [relationship],
    claims: [{claim, match_basis: {type: 'explicit_graph_context'}}],
    evidence: [{evidence, source, match_basis: {type: 'relationship_evidence'}, claim_links: []}],
    leads: [{lead, match_basis: {type: 'text_mention', terms: ['Kestrelwood']}}],
    tasks: [task],
    timeline: [event],
    external: {...dossierFixture(entityA).external, findings: [findingFixture({review_status: 'needs_followup'})]},
  });
}

async function renderOpen(routes: Routes = {}, dossier: unknown = fullDossier()) {
  const api = mockApi({...dossierRoutes('ent-1', dossier), ...routes});
  wrap(<DossierPanel investigationId="inv-1"/>);
  useWorkbenchStore.getState().openDossier('ent-1');
  await screen.findByText('Kestrelwood Holdings Ltd dossier');
  return api;
}

describe('DossierPanel', () => {
  it('opens on request with the dossier, its duplicate candidates and its reconciliation, and shows every part', async () => {
    const api = await renderOpen();
    expect(screen.getByText('Company · 5 statements · 1 relationships · 1 claims · 1 evidence · 1 leads · 1 external findings').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('Merge audit: ent-2 → ent-1', {exact: false}).closest('[hidden]')).not.toBeNull();  // raw IDs only on hover
    expect(screen.getByText((_, node) => node?.textContent === ' · 1 merged alias(es) · 1 reporter identity decision(s) · 1 unresolved', {selector: 'small'})).toBeInTheDocument();
    expect(screen.getByText('Alias: Kestrelwood Holdings LLC', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('same: Kestrelwood Holdings LLC', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('Merge audit: ent-2 → ent-1', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('1 external finding(s) need review.')).toBeInTheDocument();
    expect(screen.getByText('No unresolved multi-value property conflicts detected.')).toBeInTheDocument();
    expect(screen.getByText('Ownership: Kestrelwood Holdings Ltd → MV Fair Tern', {exact: false})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Supported Kestrelwood owns the vessel.'})).toBeInTheDocument();
    // A status is its shape; its word is the mark's name and on hover (Ony, 29 Oct).
    expect(screen.getByRole('img', {name: 'active'}).parentElement).toHaveTextContent('Ask the registry');
    expect(screen.getByRole('img', {name: 'todo'}).parentElement).toHaveTextContent('File the request');
    expect(screen.getByText('2024-03-02: Vessel registered', {exact: false})).toBeInTheDocument();
    expect(screen.getByRole('img', {name: 'verified'})).toBeInTheDocument();
    expect(screen.getByRole('img', {name: 'needs_followup'}).parentElement).toHaveTextContent('Kestrelwood Holdings');
    expect(screen.getByText('Registry filing: Owner: Kestrelwood Holdings Ltd (p.2)', {exact: false})).toBeInTheDocument();
    expect(useWorkbenchStore.getState().entityId).toBe('ent-1');
    expect(api.calls(DOSSIER)).toHaveLength(1);
    expect(api.calls(DUPLICATES)).toHaveLength(1);
    expect(api.calls(RECONCILIATION)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('asks the other panels for what it cannot show itself: a claim, a relationship, a trace', async () => {
    await renderOpen();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Supported Kestrelwood owns the vessel.'}));
    expect(useWorkbenchStore.getState().claim).toMatchObject({claimId: 'claim-1'});

    await user.click(screen.getByRole('button', {name: 'Review relationship evidence'}));
    expect(useWorkbenchStore.getState().relationship?.request).toEqual({relationshipId: 'rel-1', record: relationship});

    await user.click(screen.getByRole('button', {name: 'Trace relationship'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({title: 'Kestrelwood Holdings Ltd → MV Fair Tern', kind: 'dossier relationship', traceRecordType: 'relationship', acceptedRecordId: 'rel-1'});

    await user.click(screen.getByRole('button', {name: 'Trace provenance'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({
      title: 'Kestrelwood Holdings Ltd', kind: 'dossier evidence', sourceId: 'src-1', sourceUrl: 'https://example.test/filing', locator: 'p.2',
      detail: 'Owner: Kestrelwood Holdings Ltd', entityId: 'ent-1', acceptedRecordType: 'evidence', acceptedRecordId: 'ev-1',
    });
  });

  it('makes a lead from a relationship\'s context, marks the queue stale and reads the dossier again', async () => {
    const leadRoute = 'POST /api/relationships/rel-1/lead-from-context';
    const api = await renderOpen({[leadRoute]: {...lead, id: 'lead-2', kind: 'connector', priority: 'normal', owner: null, next_action: null, links: [], tasks: [], history: [], triage: {needs_attention: false, attention_score: 0, stance_counts: {supports: 0, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0, relationship_evidence_review_counts: {}, reasons: []}}, 'GET /api/investigations/inv-1/leads/queue': leadQueueBody('inv-1')});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Create question / lead with exact context'}));
    await waitFor(() => expect(api.calls(DOSSIER)).toHaveLength(2));
    expect(api.calls(leadRoute)).toHaveLength(1);
    expect(api.calls(DUPLICATES)).toHaveLength(2);
    expect(api.calls(RECONCILIATION)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('records a property-conflict decision with the rationale from the dialog and reads the dossier again', async () => {
    const decision = 'POST /api/entities/ent-1/property-conflicts/jurisdiction/decisions';
    const conflict = {
      prop: 'jurisdiction', status: 'unresolved', preferred_value: null, reason: 'multiple_canonical_values', latest_decision: null, decision_history: [],
      values: [
        {value: 'gb', canonical: true, support_count: 1, conflict_count: 0, latest_status: null, canonical_statements: [{id: 'st-1', dataset: 'reporter', origin: null, original_value: 'gb', first_seen: null, last_seen: null}], external_assessments: []},
        {value: 'je', canonical: true, support_count: 0, conflict_count: 1, latest_status: null, canonical_statements: [], external_assessments: []},
      ],
    };
    const api = await renderOpen({}, dossierFixture(entityA, {property_conflicts: [conflict]}));
    expect(screen.getByText('gb', {exact: false, selector: 'div'})).toBeInTheDocument();
    api.add({
      [decision]: {id: 'pcd-1', investigation_id: 'inv-1', entity_id: 'ent-1', prop: 'jurisdiction', decision: 'preferred', values_json: ['gb', 'je'], preferred_value: 'gb', rationale: 'The newer filing.', temporal_intervals_json: [], created_at: '2026-10-01T00:00:00'},
      [DOSSIER]: dossierFixture(entityA, {property_conflicts: [{...conflict, status: 'preferred', preferred_value: 'gb', latest_decision: {id: 'pcd-1', decision: 'preferred', values: ['gb', 'je'], preferred_value: 'gb', rationale: 'The newer filing.', temporal_intervals: [], created_at: '2026-10-01T00:00:00'}}]}),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Prefer gb'}));
    await user.type(await screen.findByRole('textbox', {name: 'Property conflict rationale'}), 'The newer filing.');
    await user.click(screen.getByRole('button', {name: 'Confirm'}));

    await screen.findByText('Reporter rationale: The newer filing.', {exact: false});
    expect(screen.getByText('· preferred · preferred: gb', {exact: false})).toBeInTheDocument();
    expect(api.lastBody(decision)).toEqual({decision: 'preferred', values: ['gb', 'je'], preferred_value: 'gb', rationale: 'The newer filing.'});
    expect(api.calls(DOSSIER)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('reviews a duplicate, previews the merge once the pair is "same", executes it and opens the surviving record', async () => {
    const candidate = {entity_id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company', score: 0.87, latest_decision: null};
    const api = await renderOpen({[DUPLICATES]: [candidate]}, dossierFixture(entityA));
    await screen.findByText('Possible canonical duplicates');
    expect(screen.getByRole('button', {name: 'Preview merge into this record'})).toBeDisabled();

    const same = {id: 'dec-1', decision: 'same', confidence: 0.9, rationale: null, created_at: '2026-10-01T00:00:00'};
    api.add({
      'POST /api/entities/ent-1/canonical-resolution': {id: 'dec-1', investigation_id: 'inv-1', entity_a_id: 'ent-1', entity_b_id: 'ent-2', decision: 'same', confidence: 0.9, rationale: null, created_at: '2026-10-01T00:00:00'},
      [DUPLICATES]: [{...candidate, latest_decision: same}],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Same entity'}));
    await screen.findByText('Latest review: same · 90%', {selector: 'small'});
    expect(api.lastBody('POST /api/entities/ent-1/canonical-resolution')).toEqual({other_entity_id: 'ent-2', decision: 'same', confidence: 0.9, rationale: 'Reporter-reviewed canonical duplicate decision'});
    expect(api.calls(DOSSIER)).toHaveLength(2);

    api.add({'GET /api/entities/ent-1/merge-preview': {
      source: {id: 'ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company'}, target: {id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company'},
      resolution: {id: 'dec-1', decision: 'same', confidence: 0.9, rationale: null}, references: {statements: {count: 12, record_ids: []}}, total_references: 12, blockers: [], can_execute: true, preview_digest: 'digest-abc',
    }});
    await user.click(screen.getByRole('button', {name: 'Preview merge into this record'}));
    await screen.findByText('12 reference(s) would move · 0 blocker(s)');
    expect(api.lastUrl('GET /api/entities/ent-1/merge-preview').searchParams.get('target_entity_id')).toBe('ent-2');

    api.add({
      'POST /api/entities/ent-1/merge': {audit: {id: 'merge-1', investigation_id: 'inv-1', source_entity_id: 'ent-1', target_entity_id: 'ent-2', resolution_decision_id: 'dec-1', preview_digest: 'digest-abc', preview_json: {}, moved_counts_json: {}, rationale: null, created_at: '2026-10-01T00:00:00'}, source_entity_id: 'ent-1', target_entity_id: 'ent-2'},
      ...dossierRoutes('ent-2', dossierFixture(entityB)),
    });
    await user.click(screen.getByRole('button', {name: 'Execute previewed merge'}));

    await screen.findByText('Kestrelwood Holdings LLC dossier');
    expect(api.lastBody('POST /api/entities/ent-1/merge')).toEqual({target_entity_id: 'ent-2', preview_digest: 'digest-abc', rationale: 'Reporter executed previewed canonical merge.'});
    expect(useWorkbenchStore.getState().entityId).toBe('ent-2');
    expect(useWorkbenchStore.getState().dossier).toMatchObject({entityId: 'ent-2'});
    // The folded record is not asked for again; the surviving one is read fresh.
    expect(api.calls(DOSSIER)).toHaveLength(2);
    expect(api.calls('GET /api/entities/ent-2/dossier')).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('records a reconciliation decision: a statement pair reloads only the reconciliation, a relationship pair the dossier too', async () => {
    const decision = 'POST /api/entities/ent-1/post-merge-reconciliation';
    const statementPair = {
      record_type: 'statement', same_assertion: true, provenance_differs: true, latest_decision: null,
      record_a: {id: 'st-1', prop: 'name', value: 'Kestrelwood Holdings', dataset: 'aleph', origin: 'https://aleph.example/1', original_value: null, first_seen: null, last_seen: null},
      record_b: {id: 'st-2', prop: 'name', value: 'Kestrelwood Holdings', dataset: 'reporter', origin: null, original_value: null, first_seen: null, last_seen: null},
    };
    const relationshipPair = {record_type: 'relationship', same_assertion: true, provenance_differs: false, latest_decision: null, record_a: relationshipFixture(), record_b: relationshipFixture({id: 'rel-2'})};
    const reconciliation = {entity_id: 'ent-1', statement_duplicates: [statementPair], relationship_duplicates: [relationshipPair], summary: {statement_pairs: 1, relationship_pairs: 1, unresolved_pairs: 2}};
    const api = await renderOpen({[RECONCILIATION]: reconciliation, 'GET /api/investigations/inv-1/graph': {status: 404}}, dossierFixture(entityA));
    await screen.findByText('1 statement pair(s) · 1 relationship pair(s) · 2 unresolved');
    expect(screen.getByText('aleph · https://aleph.example/1 ↔ reporter', {exact: false})).toBeInTheDocument();

    const recorded = (type: string, a: string, b: string, preferred: string | null) => ({id: 'rd-1', investigation_id: 'inv-1', entity_id: 'ent-1', record_type: type, record_a_id: a, record_b_id: b, decision: preferred ? 'duplicate' : 'keep_separate', rationale: null, preferred_record_id: preferred, created_at: '2026-10-01T00:00:00'});
    api.add({[decision]: recorded('statement', 'st-1', 'st-2', 'st-2'), [RECONCILIATION]: {...reconciliation, summary: {...reconciliation.summary, unresolved_pairs: 1}}});
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', {name: 'Duplicate · prefer second'})[0]);
    await screen.findByText('1 statement pair(s) · 1 relationship pair(s) · 1 unresolved');
    expect(api.lastBody(decision)).toEqual({record_type: 'statement', record_a_id: 'st-1', record_b_id: 'st-2', decision: 'duplicate', rationale: 'Reporter-reviewed post-merge duplicate reconciliation.', preferred_record_id: 'st-2'});
    expect(api.calls(RECONCILIATION)).toHaveLength(2);
    expect(api.calls(DOSSIER)).toHaveLength(1);

    api.add({[decision]: recorded('relationship', 'rel-1', 'rel-2', null), [RECONCILIATION]: {...reconciliation, summary: {...reconciliation.summary, unresolved_pairs: 0}}});
    await user.click(screen.getAllByRole('button', {name: 'Keep separate'})[1]);
    await screen.findByText('1 statement pair(s) · 1 relationship pair(s) · 0 unresolved');
    expect(api.lastBody(decision)).toMatchObject({record_type: 'relationship', record_a_id: 'rel-1', record_b_id: 'rel-2', decision: 'keep_separate'});
    expect(api.calls(RECONCILIATION)).toHaveLength(3);
    // A relationship decision changes which edges the dossier shows.
    await waitFor(() => expect(api.calls(DOSSIER)).toHaveLength(2));
    // The graph and the ledger are marked stale, but nothing on screen shows them.
    expect(api.calls('GET /api/investigations/inv-1/graph')).toHaveLength(0);
  });

  it('edits the entity: sends only the caption change and the added values, then reads the dossier and the entities again', async () => {
    const update = 'PATCH /api/entities/ent-1';
    const api = await renderOpen({[update]: entityFixture('ent-1', 'Kestrelwood Holdings plc', 'Company'), 'GET /api/investigations/inv-1/entities': [entityA]}, dossierFixture(entityA));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Edit entity'}));
    const caption = await screen.findByLabelText('Caption');
    await user.clear(caption);
    await user.type(caption, 'Kestrelwood Holdings plc');
    await user.click(screen.getByRole('button', {name: /save changes/i}));

    await waitFor(() => expect(api.calls(update)).toHaveLength(1));
    expect(api.lastBody(update)).toEqual({caption: 'Kestrelwood Holdings plc'});
    await waitFor(() => expect(api.calls(DOSSIER)).toHaveLength(2));
    expect(screen.queryByLabelText('Caption')).not.toBeInTheDocument();
  });

  it('answers a request for a merged alias with the surviving record, and moves the selected entity to it', async () => {
    const alias = entityFixture('ent-9', 'Kestrelwood Holdings LLC', 'Company', {merged_into_entity_id: 'ent-1'});
    const resolved = dossierFixture(entityA, {alias_resolution: {requested_entity_id: 'ent-9', requested_caption: 'Kestrelwood Holdings LLC', active_entity_id: 'ent-1', active_caption: 'Kestrelwood Holdings Ltd', alias_chain: [{id: 'ent-9', caption: 'Kestrelwood Holdings LLC', merged_into_entity_id: 'ent-1'}]}});
    const api = mockApi({'GET /api/entities/ent-9/dossier': resolved, [DUPLICATES]: [], [RECONCILIATION]: emptyReconciliation('ent-1'),
      'GET /api/entities/ent-1/ownership-chain': emptyOwnershipChain('ent-1')});
    wrap(<DossierPanel investigationId="inv-1"/>);
    useWorkbenchStore.getState().openDossier(alias.id);
    await screen.findByText('Kestrelwood Holdings Ltd dossier');
    expect(screen.getByText('Kestrelwood Holdings LLC now resolves to this canonical entity. Historical merge records are preserved.', {exact: false})).toBeInTheDocument();
    expect(useWorkbenchStore.getState().entityId).toBe('ent-1');
    expect(api.calls(DUPLICATES)).toHaveLength(1);
    expect(api.calls(RECONCILIATION)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('shows nothing until asked, closes with the case, and answers the next request in the new case', async () => {
    const api = await renderOpen();
    const harbor = entityFixture('ent-7', 'Harbor Trust', 'Company', {investigation_id: 'inv-2'});
    api.add(dossierRoutes('ent-7', dossierFixture(harbor)));
    useWorkbenchStore.getState().setInvestigationId('inv-2');
    cleanup();
    wrap(<DossierPanel investigationId="inv-2"/>);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText('Kestrelwood Holdings Ltd dossier')).not.toBeInTheDocument();
    expect(api.calls(DOSSIER)).toHaveLength(1);

    // The new case's first request is not mistaken for the old case's answered one.
    useWorkbenchStore.getState().openDossier('ent-7');
    await screen.findByText('Harbor Trust dossier');
  });
});
