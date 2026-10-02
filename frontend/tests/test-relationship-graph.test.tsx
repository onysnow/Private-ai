// @vitest-environment jsdom
// The FollowTheMoney relationship graph, moved out of app/page.tsx onto the
// generated client (Foundation Fixes fixes 2 and 3): the relationship form
// (endpoints pre-selected from the entity list, Payment properties), the
// manual entity form, the schema filter, the duplicate-edge toggle, the
// drawing (vis-network replaced by a DOM stub, as in test-entity-graph),
// one opened relationship with its evidence attached and assessed, the
// relationship list, the money flows, and the requests other panels make
// through the shared store.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RelationshipGraphPanel} from '../features/relationship-graph/relationship-graph-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall, Routes} from '../test-support/mock-api';
import {emptyGraph, entityFixture, leadQueueBody, relationshipFixture} from '../test-support/page-routes';

const {sankeySpy} = vi.hoisted(() => ({sankeySpy: vi.fn()}));
vi.mock('../components/charts/financial-flow-sankey', () => ({
  FinancialFlowSankey: (props: Record<string, unknown>) => { sankeySpy(props); return <div data-testid="sankey-stub"/>; },
}));
vi.mock('../components/entity-graph', () => ({
  EntityGraph: ({nodes, edges, onNodeClick, onEdgeClick}: {
    nodes: Array<{id: string; label: string; schema?: string}>;
    edges: Array<{id: string; from: string; to: string; label?: string}>;
    onNodeClick?: (id: string) => void;
    onEdgeClick?: (id: string) => void;
  }) => <div data-testid="entity-graph-stub">
    {nodes.map(n => <button key={n.id} type="button" data-testid={`graph-node-${n.id}`} onClick={() => onNodeClick?.(n.id)}>{`${n.label} (${n.schema ?? ''})`}</button>)}
    {edges.map(e => <button key={e.id} type="button" data-testid={`graph-edge-${e.id}`} onClick={() => onEdgeClick?.(e.id)}>{`${e.from}->${e.to}:${e.label ?? ''}`}</button>)}
  </div>,
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', entityId: '', provenance: null, claim: null, dossier: null, relationship: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ENTITIES = 'GET /api/investigations/inv-1/entities';
const GRAPH = 'GET /api/investigations/inv-1/graph';
const EVIDENCE = 'GET /api/investigations/inv-1/evidence';
const RELATIONSHIPS = 'POST /api/relationships';
const EVIDENCE_REVIEWS = 'GET /api/relationships/rel-1/evidence-reviews';
const entityA = entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company');
const entityB = entityFixture('ent-2', 'Jane Doe', 'Person');
const poolRow = {
  evidence: {id: 'ev-1', source_id: 'src-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', notes: null},
  source: {id: 'src-1', investigation_id: 'inv-1', title: 'Board minutes', url: null, source_type: 'document', metadata_json: {}, created_at: '2026-10-01T00:00:00'},
};
const attachment = {
  attachment_id: 'att-1', attached_by: 'reporter', note: null, created_at: '2026-09-01T00:00:00',
  evidence: {id: 'ev-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', notes: null, source: {id: 'src-1', title: 'Board minutes', url: null, source_type: 'document'}},
  latest_review: null,
};
const attached = () => relationshipFixture({provenance: {statement_count: 0, sources: [], evidence_review_history: [], evidence_attachments: [attachment]}});

async function renderPanel(routes: Routes = {}, {entities = [entityA, entityB], edges = [] as unknown[], evidence = [] as unknown[]} = {}) {
  const api = mockApi({[ENTITIES]: entities, [GRAPH]: emptyGraph(edges), [EVIDENCE]: evidence, ...routes});
  wrap(<RelationshipGraphPanel investigationId="inv-1"/>);
  await waitFor(() => expect(api.calls(GRAPH)).toHaveLength(1));
  return api;
}

describe('RelationshipGraphPanel', () => {
  it('pre-selects the endpoints from the entity list and creates a relationship, then reads the graph and entities again', async () => {
    const api = await renderPanel();
    const addButton = await screen.findByRole('button', {name: 'Add relationship'});
    await waitFor(() => expect(addButton).toBeEnabled());
    expect(screen.getByText('No canonical relationships yet.')).toBeInTheDocument();

    api.add({[RELATIONSHIPS]: relationshipFixture(), [GRAPH]: emptyGraph([relationshipFixture()])});
    await userEvent.setup().click(addButton);

    await screen.findByText('Ownership', {selector: '.relEdge'});
    expect(screen.getByRole('button', {name: 'Kestrelwood Holdings Ltd'})).toBeInTheDocument();
    expect(api.lastBody(RELATIONSHIPS)).toEqual({investigation_id: 'inv-1', schema: 'Ownership', source_entity_id: 'ent-1', target_entity_id: 'ent-2', properties: {}, dataset: 'reporter', evidence_id: null});
    expect(api.calls(GRAPH)).toHaveLength(2);
    expect(api.calls(ENTITIES)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('disables Add relationship when only one entity exists', async () => {
    await renderPanel({}, {entities: [entityA]});
    await waitFor(() => expect(screen.getAllByRole('combobox').filter(el => el.textContent === 'Kestrelwood Holdings Ltd')).toHaveLength(2));
    expect(screen.getByRole('button', {name: 'Add relationship'})).toBeDisabled();
  });

  it('sends the Payment properties and the chosen evidence, and marks the money flows stale', async () => {
    const api = await renderPanel({[RELATIONSHIPS]: relationshipFixture({id: 'rel-2', schema: 'Payment'})}, {evidence: [poolRow]});
    await waitFor(() => expect(screen.getByRole('button', {name: 'Add relationship'})).toBeEnabled());
    const user = userEvent.setup();
    const schemaTrigger = screen.getAllByRole('combobox').find(el => el.textContent === 'Ownership')!;
    schemaTrigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Payment'}));
    await user.type(screen.getByLabelText('Payment amount'), '1250.50');
    await user.type(screen.getByLabelText('Payment currency'), 'USD');
    await user.type(screen.getByLabelText('Payment date'), '2024-03-02');
    await user.type(screen.getByLabelText('Payment purpose'), 'consulting');
    await user.type(screen.getByPlaceholderText('Role (optional)'), 'payer');
    const evidenceSelect = document.querySelector('select');
    if (!evidenceSelect) throw new Error('evidence select not found');
    await user.selectOptions(evidenceSelect, 'ev-1');
    await user.click(screen.getByRole('button', {name: 'Add relationship'}));

    await waitFor(() => expect(api.calls(RELATIONSHIPS)).toHaveLength(1));
    expect(api.lastBody(RELATIONSHIPS)).toMatchObject({schema: 'Payment', evidence_id: 'ev-1', properties: {role: ['payer'], amount: ['1250.50'], currency: ['USD'], date: ['2024-03-02'], purpose: ['consulting']}});
    // The form's text fields are cleared for the next one.
    await waitFor(() => expect(screen.getByLabelText('Payment amount')).toHaveValue(''));
    expect(screen.getByPlaceholderText('Role (optional)')).toHaveValue('');
    expect(api.calls(GRAPH)).toHaveLength(2);
  });

  it('shows the server\'s reason when a relationship is refused', async () => {
    const api = await renderPanel({[RELATIONSHIPS]: {status: 400, body: {detail: 'Payment amount must be a number'}}});
    await waitFor(() => expect(screen.getByRole('button', {name: 'Add relationship'})).toBeEnabled());
    await userEvent.setup().click(screen.getByRole('button', {name: 'Add relationship'}));
    await waitFor(() => expect(api.calls(RELATIONSHIPS)).toHaveLength(1));
    // The failure is reported as a toast; the graph is not read again.
    expect(api.calls(GRAPH)).toHaveLength(1);
  });

  it('draws the shown relationships, filters them by schema, and opens an edge from the drawing', async () => {
    const api = await renderPanel({}, {edges: [relationshipFixture(), relationshipFixture({id: 'rel-2', schema: 'Directorship', source: {id: 'ent-2', ftm_id: 'f2', caption: 'Jane Doe', schema: 'Person'}, target: {id: 'ent-1', ftm_id: 'f1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company'}})]});
    expect(await screen.findByTestId('graph-node-ent-1')).toHaveTextContent('Kestrelwood Holdings Ltd (Company)');
    expect(screen.getByTestId('graph-edge-rel-1')).toHaveTextContent('ent-1->ent-2:Ownership');
    expect(screen.getByTestId('graph-edge-rel-2')).toHaveTextContent('ent-2->ent-1:Directorship');

    // Unticking a schema takes its edges out of the drawing, not out of the list.
    await userEvent.setup().click(screen.getByRole('checkbox', {name: 'Directorship'}));
    expect(screen.queryByTestId('graph-edge-rel-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-edge-rel-1')).toBeInTheDocument();
    expect(screen.getByText('Directorship', {selector: '.relEdge'})).toBeInTheDocument();

    api.add({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}});
    await userEvent.setup().click(screen.getByTestId('graph-edge-rel-1'));
    await screen.findByText('Kestrelwood Holdings Ltd → Jane Doe');
    expect(screen.getByText('Attach exact evidence')).toBeInTheDocument();
    expect(api.calls(EVIDENCE_REVIEWS)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('draws another investigation with its own schemas, not the last one\'s filter', async () => {
    const api = mockApi({
      [ENTITIES]: [entityA, entityB], [GRAPH]: emptyGraph([relationshipFixture()]), [EVIDENCE]: [],
      'GET /api/investigations/inv-2/entities': [entityFixture('ent-3', 'Harbor Trust', 'Company', {investigation_id: 'inv-2'}), entityFixture('ent-4', 'John Roe', 'Person', {investigation_id: 'inv-2'})],
      'GET /api/investigations/inv-2/graph': emptyGraph([relationshipFixture({id: 'rel-9', investigation_id: 'inv-2', schema: 'Directorship',
        source: {id: 'ent-4', ftm_id: 'f4', caption: 'John Roe', schema: 'Person'}, target: {id: 'ent-3', ftm_id: 'f3', caption: 'Harbor Trust', schema: 'Company'}})]),
      'GET /api/investigations/inv-2/evidence': [],
    });
    const view = wrap(<RelationshipGraphPanel investigationId="inv-1"/>);
    expect(await screen.findByTestId('graph-edge-rel-1')).toBeInTheDocument();

    view.rerender(<QueryProvider><RelationshipGraphPanel investigationId="inv-2"/></QueryProvider>);

    // The first case had only Ownership; the filter used to stay at that and hide this Directorship.
    expect(await screen.findByTestId('graph-edge-rel-9')).toHaveTextContent('ent-4->ent-3:Directorship');
    expect(screen.getByRole('checkbox', {name: 'Directorship'})).toBeChecked();
    expect(api.unmatched()).toEqual([]);
  });

  it('asks for a dossier when a node or a listed endpoint is clicked', async () => {
    await renderPanel({}, {edges: [relationshipFixture()]});
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('graph-node-ent-2'));
    expect(useWorkbenchStore.getState().dossier).toMatchObject({entityId: 'ent-2'});
    expect(useWorkbenchStore.getState().entityId).toBe('ent-2');
    await user.click(screen.getByRole('button', {name: 'Kestrelwood Holdings Ltd'}));
    expect(useWorkbenchStore.getState().dossier).toMatchObject({entityId: 'ent-1'});
  });

  it('opens a relationship on another panel\'s request: by id from its own edges, or the record it was handed', async () => {
    const api = await renderPanel({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}, 'GET /api/relationships/rel-7/evidence-reviews': {relationship_id: 'rel-7', reviews: []}}, {edges: [relationshipFixture()]});
    await screen.findByText('Ownership', {selector: '.relEdge'});
    useWorkbenchStore.getState().openRelationship({relationshipId: 'rel-1'});
    await screen.findByText('Kestrelwood Holdings Ltd → Jane Doe');

    // A dossier's relationship the graph does not hold comes with its record.
    const fromDossier = relationshipFixture({id: 'rel-7', schema: 'Directorship', target: {id: 'ent-3', ftm_id: 'f3', caption: 'Harbor Trust', schema: 'Organization'}});
    useWorkbenchStore.getState().openRelationship({relationshipId: 'rel-7', record: fromDossier as never});
    await screen.findByText('Kestrelwood Holdings Ltd → Harbor Trust');
    expect(api.calls('GET /api/relationships/rel-7/evidence-reviews')).toHaveLength(1);

    // An id nobody holds is left alone.
    useWorkbenchStore.getState().openRelationship({relationshipId: 'rel-99'});
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.getByText('Kestrelwood Holdings Ltd → Harbor Trust')).toBeInTheDocument();
  });

  it('attaches pool evidence to the opened relationship and keeps the graph\'s copy of the edge in step', async () => {
    const attach = 'POST /api/relationships/rel-1/evidence';
    const api = await renderPanel({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}}, {edges: [relationshipFixture()], evidence: [poolRow]});
    await userEvent.setup().click(await screen.findByText('Ownership', {selector: '.relEdge'}));
    await screen.findByText('Attach exact evidence');
    const attachButton = screen.getByRole('button', {name: 'Attach evidence'});
    expect(attachButton).toBeDisabled();

    const user = userEvent.setup();
    const trigger = screen.getAllByRole('combobox').find(el => el.textContent === 'Choose investigation evidence…')!;
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Board minutes: p.4'}));
    await user.type(screen.getByPlaceholderText('Attachment note (optional)'), 'signed copy');
    api.add({[attach]: attached()});
    await user.click(attachButton);

    await screen.findByText('Evidence attached. Review its support state below.');
    expect(api.lastBody(attach)).toEqual({evidence_id: 'ev-1', note: 'signed copy'});
    expect(screen.getByText('Approved 3/3, signed by CFO.', {exact: false})).toBeInTheDocument();
    // The attach form is cleared; the graph's copy of the edge was updated from the reply, not read again.
    expect(screen.getAllByRole('combobox').find(el => el.textContent === 'Choose investigation evidence…')).toBeTruthy();
    expect(screen.getByPlaceholderText('Attachment note (optional)')).toHaveValue('');
    expect(api.calls(GRAPH)).toHaveLength(1);
  });

  it('requires a rationale before an evidence assessment, then records it and reads the history again', async () => {
    const review = 'POST /api/relationships/rel-1/evidence/ev-1/reviews';
    const api = await renderPanel({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}}, {edges: [attached()], evidence: [poolRow]});
    await userEvent.setup().click(await screen.findByText('Ownership', {selector: '.relEdge'}));
    await screen.findByText('Approved 3/3, signed by CFO.', {exact: false});
    expect(screen.getByText('No relationship-evidence assessments recorded yet.')).toBeInTheDocument();
    const supports = screen.getByRole('button', {name: 'Supports'});
    expect(supports).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Required rationale before recording an evidence assessment'), 'Board minutes directly confirm the ownership stake.');
    expect(supports).toBeEnabled();
    const recorded = {id: 'rev-1', relationship_edge_id: 'rel-1', evidence_id: 'ev-1', stance: 'supports', rationale: 'Board minutes directly confirm the ownership stake.', created_at: '2026-09-23T00:00:00'};
    api.add({
      [review]: relationshipFixture({provenance: {statement_count: 0, sources: [], evidence_review_history: [recorded], evidence_attachments: [{...attachment, latest_review: recorded}]}}),
      [EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: [recorded]},
    });
    await user.click(supports);

    await screen.findByText('Recorded supports assessment. Canonical relationship preserved.');
    expect(api.lastBody(review)).toEqual({stance: 'supports', rationale: 'Board minutes directly confirm the ownership stake.'});
    expect(screen.getByText('Latest assessment: supports · Board minutes directly confirm the ownership stake.')).toBeInTheDocument();
    expect(screen.getByText('Board minutes directly confirm the ownership stake.', {selector: 'div'})).toBeInTheDocument();
    expect(api.calls(EVIDENCE_REVIEWS)).toHaveLength(2);
    expect(screen.getByPlaceholderText('Required rationale before recording an evidence assessment')).toHaveValue('');
  });

  it('shows a compact edge\'s duplicate inventory instead of the attachment form, and traces its evidence', async () => {
    const compact = relationshipFixture({
      reconciliation: {decision_id: 'rd-1', decision: 'duplicate', preferred_record_id: 'rel-1', secondary_record_id: 'rel-2', rationale: null, is_preferred: true, suppressed_duplicate: false, suppressed_duplicate_ids: ['rel-2'], suppressed_duplicate_count: 1},
      aggregate_provenance: {presentation_only: true, underlying_relationship_ids: ['rel-1', 'rel-2'], underlying_relationship_count: 2, statement_count: 4, statement_sources: ['filing-a|'], evidence_count: 1, evidence: [attachment.evidence]},
      advisory: {needs_review: false, support_state: 'independent_support', has_independent_support: true, healthy_supporting_evidence_count: 1, challenged_supporting_evidence_count: 0, disputed_claim_count: 0, rejected_claim_count: 0, claim_dependencies: [], presentation_aggregate: true},
    });
    await renderPanel({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}}, {edges: [compact]});
    expect(await screen.findByText('Ownership · preferred (+1 duplicate)', {selector: '.relEdge'})).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Ownership · preferred (+1 duplicate)', {selector: '.relEdge'}));
    await screen.findByText('Reviewed duplicate provenance inventory:');
    expect(screen.getByText('2 preserved relationship records · 1 exact evidence records · presentation only; no records were merged.', {exact: false})).toBeInTheDocument();
    expect(screen.queryByText('Attach exact evidence')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Trace exact evidence'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({
      title: 'Kestrelwood Holdings Ltd → Jane Doe', kind: 'reviewed duplicate relationship evidence', sourceId: 'src-1', sourceUrl: undefined, locator: 'p.4',
      detail: 'Approved 3/3, signed by CFO.', acceptedRecordType: 'evidence', acceptedRecordId: 'ev-1',
    });
  });

  it('shows every duplicate copy when asked, reading the expanded graph', async () => {
    const api = await renderPanel({}, {edges: [relationshipFixture()]});
    await screen.findByText('Ownership', {selector: '.relEdge'});
    api.add({[GRAPH]: ({url}: RouteCall) => (url.searchParams.get('include_reconciled_duplicates') === 'true'
      ? emptyGraph([relationshipFixture(), relationshipFixture({id: 'rel-2', reconciliation: {decision_id: 'rd-1', decision: 'duplicate', preferred_record_id: 'rel-1', secondary_record_id: 'rel-2', rationale: null, is_preferred: false, suppressed_duplicate: true, suppressed_duplicate_ids: [], suppressed_duplicate_count: 0}})])
      : emptyGraph([relationshipFixture()]))});
    await userEvent.setup().click(screen.getByRole('checkbox', {name: 'Show reviewed duplicate edge copies'}));

    await screen.findByText('Ownership · duplicate copy', {selector: '.relEdge'});
    expect(api.calls(GRAPH)).toHaveLength(2);
    expect(api.lastUrl(GRAPH).searchParams.get('include_reconciled_duplicates')).toBe('true');
  });

  it('creates an entity from the manual form and reads the entities again', async () => {
    const api = await renderPanel({'POST /api/entities': entityFixture('ent-3', 'Harbor Trust', 'Company')});
    const user = userEvent.setup();
    await user.click(screen.getByText('Add an entity manually'));
    await user.type(await screen.findByLabelText('Caption'), 'Harbor Trust');
    await user.type(screen.getByLabelText('FollowTheMoney schema'), 'Company');
    await user.click(screen.getByRole('button', {name: /create entity/i}));

    await waitFor(() => expect(api.calls(ENTITIES)).toHaveLength(2));
    expect(api.lastBody('POST /api/entities')).toEqual({investigation_id: 'inv-1', schema: 'Company', caption: 'Harbor Trust', properties: {}});
  });

  it('makes a lead from the opened relationship and marks the queue stale', async () => {
    const leadRoute = 'POST /api/relationships/rel-1/lead-from-context';
    const api = await renderPanel({
      [EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []},
      [leadRoute]: {id: 'lead-2', investigation_id: 'inv-1', title: 'Kestrelwood Holdings Ltd → Jane Doe', detail: null, provider: null, provider_record_id: null, kind: 'question', status: 'unreviewed', priority: 'normal', owner: null, next_action: null, created_at: '2026-10-01T00:00:00', links: [], tasks: [], history: [], triage: {needs_attention: false, attention_score: 0, stance_counts: {supports: 0, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0, relationship_evidence_review_counts: {}, reasons: []}},
      'GET /api/investigations/inv-1/leads/queue': leadQueueBody('inv-1'),
    }, {edges: [relationshipFixture()]});
    await userEvent.setup().click(await screen.findByText('Ownership', {selector: '.relEdge'}));
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Create reporting lead from relationship'}));
    await waitFor(() => expect(api.calls(leadRoute)).toHaveLength(1));
    expect(api.unmatched()).toEqual([]);
  });

  it('loads the money-flow ledger on demand, charts complete payments only, and reloads on request', async () => {
    const ledger = 'GET /api/investigations/inv-1/financial-flows';
    const row = {
      id: 'rel-9', relationship_id: 'rel-9', dateTime: '2024-03-02', from: 'Kestrelwood Holdings Ltd', to: 'Jane Doe', from_entity_id: 'ent-1', to_entity_id: 'ent-2',
      amount: 1250.5, currency: 'USD', statedPurpose: 'consulting', transactionNumber: null, evidence: 'p.2 [supports]', evidence_count: 1, supporting_evidence_count: 1,
      status: 'no_claim_dependency', flowType: 'direct',
    };
    const api = await renderPanel({[ledger]: {
      investigation_id: 'inv-1', transactions: [row], incomplete: [{...row, id: 'rel-10', relationship_id: 'rel-10', amount: null, flowType: 'inferred', problems: ['amount missing']}],
      currencies: ['USD'], flow_type_rule: 'direct = supporting reviewed evidence', duplicate_rule: 'reviewed duplicates once',
    }});
    expect(api.calls(ledger)).toHaveLength(0);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Load money flows'}));

    const panel = await screen.findByTestId('money-flows');
    expect(panel).toHaveTextContent('1,250.5 USD');
    expect(panel).toHaveTextContent('Not charted (1)');
    expect(panel).toHaveTextContent('amount missing');
    await screen.findByTestId('sankey-stub');
    const props = sankeySpy.mock.calls.at(-1)?.[0] as {transactions: Array<{id: string}>};
    expect(props.transactions).toEqual([expect.objectContaining({id: 'rel-9', amount: 1250.5, currency: 'USD', flowType: 'direct'})]);

    await userEvent.setup().click(screen.getByRole('button', {name: 'Reload money flows'}));
    await waitFor(() => expect(api.calls(ledger)).toHaveLength(2));
  });

  it('shows the reason when the ledger cannot be loaded', async () => {
    await renderPanel({'GET /api/investigations/inv-1/financial-flows': {status: 500, body: {detail: 'ledger unavailable'}}});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Load money flows'}));
    await screen.findByText(/ledger unavailable/);
  });

  it('closes the opened relationship and forgets the ledger when the case changes', async () => {
    const api = await renderPanel({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}, 'GET /api/investigations/inv-2/entities': [], 'GET /api/investigations/inv-2/graph': emptyGraph(), 'GET /api/investigations/inv-2/evidence': []}, {edges: [relationshipFixture()]});
    await userEvent.setup().click(await screen.findByText('Ownership', {selector: '.relEdge'}));
    await screen.findByText('Kestrelwood Holdings Ltd → Jane Doe');

    cleanup();
    wrap(<RelationshipGraphPanel investigationId="inv-2"/>);
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-2/graph')).toHaveLength(1));
    expect(screen.queryByText('Kestrelwood Holdings Ltd → Jane Doe')).not.toBeInTheDocument();
    expect(screen.getByText('No canonical relationships yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Load money flows'})).toBeInTheDocument();
  });
});
