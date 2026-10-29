// @vitest-environment jsdom
// All links inside The Wire (features/the-wire/all-links.tsx; DECISIONS_LOG 12, call 13): what the old Relationships
// panel did besides drawing. Every link as a list, a party opening its dossier, finding a link, the reviewed duplicate
// copies on request, one opened relationship with its evidence attached and assessed, a lead made from it, the requests
// other panels make through the shared store, and the way to add a party or link (See › Add by hand).
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AllLinks, linkLabel} from '../features/the-wire/all-links';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall, Routes} from '../test-support/mock-api';
import {emptyGraph, leadQueueBody, relationshipFixture} from '../test-support/page-routes';

const push = vi.fn();
vi.mock('next/navigation', () => ({useRouter: () => ({push}), usePathname: () => '/see', useSearchParams: () => new URLSearchParams()}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', entityId: '', provenance: null, claim: null, dossier: null, relationship: null});
  push.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const GRAPH = 'GET /api/investigations/inv-1/graph';
const EVIDENCE = 'GET /api/investigations/inv-1/evidence';
const EVIDENCE_REVIEWS = 'GET /api/relationships/rel-1/evidence-reviews';
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

async function renderPanel(routes: Routes = {}, {edges = [] as unknown[], evidence = [] as unknown[]} = {}) {
  const api = mockApi({[GRAPH]: emptyGraph(edges), [EVIDENCE]: evidence, ...routes});
  wrap(<AllLinks investigationId="inv-1" onClose={() => undefined}/>);
  await waitFor(() => expect(api.calls(GRAPH)).toHaveLength(1));
  return api;
}

describe('All links', () => {
  it('lists every link, opens a party’s dossier, finds a link, and sends adding to Add by hand', async () => {
    await renderPanel({}, {edges: [relationshipFixture(), relationshipFixture({id: 'rel-2', schema: 'Directorship', source: {id: 'ent-3', ftm_id: 'f3', caption: 'Harbor Trust', schema: 'Company'}})]});
    expect(await screen.findByText('All links · 2')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', {name: 'Jane Doe'})[0]);
    expect(useWorkbenchStore.getState().dossier).toMatchObject({entityId: 'ent-2'});
    await user.type(screen.getByRole('searchbox', {name: 'Find a link'}), 'harbor');
    expect(screen.queryByRole('button', {name: 'Kestrelwood Holdings Ltd'})).toBeNull();
    expect(screen.getByRole('button', {name: 'Directorship →'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Add a party or a link'}));
    expect(push).toHaveBeenCalledWith('/see?inv=inv-1#add-by-hand');
  });

  it('words a link with its kind, role and duplicate place', () => {
    expect(linkLabel(relationshipFixture({properties: {role: ['shareholder']}}) as never)).toBe('Ownership · shareholder');
  });

  it('opens a relationship on another panel\'s request: by id from its own edges, or the record it was handed', async () => {
    const api = await renderPanel({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}, 'GET /api/relationships/rel-7/evidence-reviews': {relationship_id: 'rel-7', reviews: []}}, {edges: [relationshipFixture()]});
    await screen.findByText('Ownership →', {selector: '.edge'});
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
    await userEvent.setup().click(await screen.findByText('Ownership →', {selector: '.edge'}));
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
    await userEvent.setup().click(await screen.findByText('Ownership →', {selector: '.edge'}));
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
    expect(await screen.findByText('Ownership · preferred (+1 duplicate) →', {selector: '.edge'})).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Ownership · preferred (+1 duplicate) →', {selector: '.edge'}));
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
    await screen.findByText('Ownership →', {selector: '.edge'});
    api.add({[GRAPH]: ({url}: RouteCall) => (url.searchParams.get('include_reconciled_duplicates') === 'true'
      ? emptyGraph([relationshipFixture(), relationshipFixture({id: 'rel-2', reconciliation: {decision_id: 'rd-1', decision: 'duplicate', preferred_record_id: 'rel-1', secondary_record_id: 'rel-2', rationale: null, is_preferred: false, suppressed_duplicate: true, suppressed_duplicate_ids: [], suppressed_duplicate_count: 0}})])
      : emptyGraph([relationshipFixture()]))});
    await userEvent.setup().click(screen.getByRole('checkbox', {name: 'Reviewed duplicate copies'}));

    await screen.findByText('Ownership · duplicate copy →', {selector: '.edge'});
    expect(api.calls(GRAPH)).toHaveLength(2);
    expect(api.lastUrl(GRAPH).searchParams.get('include_reconciled_duplicates')).toBe('true');
  });

  it('makes a lead from the opened relationship and marks the queue stale', async () => {
    const leadRoute = 'POST /api/relationships/rel-1/lead-from-context';
    const api = await renderPanel({
      [EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []},
      [leadRoute]: {id: 'lead-2', investigation_id: 'inv-1', title: 'Kestrelwood Holdings Ltd → Jane Doe', detail: null, provider: null, provider_record_id: null, kind: 'question', status: 'unreviewed', priority: 'normal', owner: null, next_action: null, created_at: '2026-10-01T00:00:00', links: [], tasks: [], history: [], triage: {needs_attention: false, attention_score: 0, stance_counts: {supports: 0, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0, relationship_evidence_review_counts: {}, reasons: []}},
      'GET /api/investigations/inv-1/leads/queue': leadQueueBody('inv-1'),
    }, {edges: [relationshipFixture()]});
    await userEvent.setup().click(await screen.findByText('Ownership →', {selector: '.edge'}));
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Create reporting lead from relationship'}));
    await waitFor(() => expect(api.calls(leadRoute)).toHaveLength(1));
    expect(api.unmatched()).toEqual([]);
  });

});
