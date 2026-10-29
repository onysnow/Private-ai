// @vitest-environment jsdom
// The review queue, moved out of app/page.tsx onto the generated client
// (Foundation Fixes fixes 2 and 3): the findings a case's connectors
// produced; an entity finding's canonical candidates, identity decision,
// per-value assessments and promotion; the matched entity's evidence
// ledger; a relationship finding's endpoint candidates, review and
// promotion.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ReviewQueuePanel} from '../features/review-queue/review-queue-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {Routes} from '../test-support/mock-api';
import {emptyGraph, entityFixture, findingFixture} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', entityId: '', provenance: null, claim: null, dossier: null, relationship: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const FINDINGS = 'GET /api/investigations/inv-1/connector-findings';
const CANDIDATES = 'GET /api/connector-findings/find-1/candidates';
const ASSESSMENTS = 'GET /api/connector-findings/find-1/assessments';
const HISTORY = 'GET /api/entities/ent-1/statement-history';
const REL_CANDIDATES = 'GET /api/connector-findings/find-2/relationship-candidates';

const companyFinding = findingFixture({properties: {jurisdiction: ['us-in'], address: ['123 Main St']}, source_url: 'https://aleph.example/aleph-1'});
const ownershipFinding = findingFixture({id: 'find-2', provider_record_id: 'aleph-2', caption: 'Jane Doe owns Kestrelwood', schema: 'Ownership', properties: {owner: ['aleph-3'], asset: ['aleph-1']}});
const candidate = {entity_id: 'ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company', score: 0.92};
const assessment = (overrides: Record<string, unknown> = {}) => ({
  id: 'as-1', investigation_id: 'inv-1', finding_id: 'find-1', entity_id: 'ent-1', prop: 'jurisdiction', value: 'us-in', status: 'accepted', note: null, created_at: '2026-10-01T00:00:00', ...overrides,
});
const historyRow = {
  prop: 'jurisdiction', value: 'us-in', canonical: false, support_count: 1, conflict_count: 0, latest_status: 'accepted',
  canonical_statements: [], external_assessments: [{assessment_id: 'as-1', status: 'accepted', note: null, created_at: null, finding_id: 'find-1', provider: 'aleph', dataset: 'registry', source_url: 'https://aleph.example/aleph-1', provider_record_id: 'aleph-1', finding_caption: 'Kestrelwood Holdings', promoted: false, promotion_id: null, promoted_at: null, reviewer_note: null}],
};

async function renderPanel(routes: Routes = {}, findings: unknown[] = [companyFinding, ownershipFinding]) {
  const api = mockApi({[FINDINGS]: findings, ...routes});
  wrap(<ReviewQueuePanel investigationId="inv-1"/>);
  await screen.findByText('Kestrelwood Holdings', {selector: 'strong'});
  return api;
}

async function inspectCompany(api: ReturnType<typeof mockApi>) {
  api.add({[CANDIDATES]: [candidate], [ASSESSMENTS]: [], [HISTORY]: [historyRow]});
  await userEvent.setup().click(screen.getAllByRole('button', {name: 'Inspect'})[0]);
  await screen.findByText('Best entity match:', {exact: false});
}

describe('ReviewQueuePanel', () => {
  it('lists the findings with their provider and status, and asks for one to be chosen', async () => {
    await renderPanel();
    // Ony's rule of 29 Oct: a finding's kind is its party icon or link line, its review state a shape; each is named on reveal.
    expect(screen.getByRole('img', {name: 'Company'})).toBeInTheDocument();
    expect(screen.getByRole('img', {name: 'Ownership: Owns'})).toBeInTheDocument();
    expect(screen.getAllByRole('img', {name: 'unreviewed'})).toHaveLength(2);
    expect(screen.getByText('Choose a finding.')).toBeInTheDocument();
    expect(screen.getByText('Choose a matched canonical entity to inspect provenance.')).toBeInTheDocument();
  });

  it('inspects an entity finding: its best match, its values, and the matched entity\'s ledger', async () => {
    const api = await renderPanel();
    await inspectCompany(api);
    expect(screen.getByRole('heading', {name: 'Kestrelwood Holdings', level: 2})).toBeInTheDocument();
    expect(screen.getByText('Kestrelwood Holdings Ltd', {selector: 'b'})).toBeInTheDocument();
    expect(screen.getByText('(92%)', {exact: false})).toBeInTheDocument();
    // Each value the finding asserts, with its own assessment buttons; the ledger shows the value again below.
    expect(screen.getByText('us-in', {selector: 'span'})).toBeInTheDocument();
    expect(screen.getByText('123 Main St', {selector: 'span'})).toBeInTheDocument();
    expect(screen.getAllByRole('button', {name: 'Accept'})).toHaveLength(2);
    expect((await screen.findByText('External only · 1 support · 0 conflict · latest accepted')).closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('accepted · aleph · registry').closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('link', {name: 'source'})).toHaveAttribute('href', 'https://aleph.example/aleph-1');
    expect(api.calls(CANDIDATES)).toHaveLength(1);
    expect(api.calls(ASSESSMENTS)).toHaveLength(1);
    expect(api.calls(HISTORY)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('records an identity decision and reads the findings again', async () => {
    const resolution = 'POST /api/connector-findings/find-1/resolution';
    const api = await renderPanel({
      [resolution]: {id: 'rd-1', investigation_id: 'inv-1', finding_id: 'find-1', entity_id: 'ent-1', decision: 'positive', confidence: 0.9, rationale: null, created_at: '2026-10-01T00:00:00'},
      'GET /api/investigations/inv-1/entities': [entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company')], 'GET /api/investigations/inv-1/graph': emptyGraph(),
    });
    await inspectCompany(api);
    api.add({[FINDINGS]: [findingFixture({review_status: 'accepted'}), ownershipFinding]});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Same entity'}));

    await screen.findByRole('img', {name: 'accepted'});
    expect(api.lastBody(resolution)).toEqual({decision: 'positive', entity_id: 'ent-1', confidence: 0.9});
    expect(api.calls(FINDINGS)).toHaveLength(2);
    // The entities and the graph are marked stale too; nothing on screen shows them.
    expect(api.calls('GET /api/investigations/inv-1/entities')).toHaveLength(0);
  });

  it('assesses a value, offers to promote it once accepted, and promotes it into the ledger', async () => {
    const assess = 'POST /api/connector-findings/find-1/assessments';
    const promote = 'POST /api/statement-assessments/as-1/promote';
    const api = await renderPanel({[assess]: assessment()});
    await inspectCompany(api);
    expect(screen.queryByRole('button', {name: 'Promote'})).not.toBeInTheDocument();

    api.add({[ASSESSMENTS]: [assessment()]});
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', {name: 'Accept'})[0]);
    await screen.findByRole('button', {name: 'Promote'});
    expect(api.lastBody(assess)).toEqual({entity_id: 'ent-1', prop: 'jurisdiction', value: 'us-in', status: 'accepted'});
    expect(api.calls(ASSESSMENTS)).toHaveLength(2);

    api.add({
      [promote]: {id: 'prom-1', investigation_id: 'inv-1', finding_id: 'find-1', assessment_id: 'as-1', entity_id: 'ent-1', statement_id: 'st-9', provider: 'aleph', dataset: 'registry', source_url: null, original_value: 'us-in', reviewer_note: null, promoted_at: '2026-10-01T00:00:00'},
      [HISTORY]: [{...historyRow, canonical: true, canonical_statements: [{id: 'st-9', dataset: 'registry', origin: 'https://aleph.example/aleph-1', original_value: 'us-in', first_seen: null, last_seen: null}], external_assessments: [{...historyRow.external_assessments[0], promoted: true}]}],
      'GET /api/investigations/inv-1/entities': [], 'GET /api/entities/ent-1/dossier': {status: 404},
    });
    await user.click(screen.getByRole('button', {name: 'Promote'}));

    await screen.findByText('Canonical · 1 support · 0 conflict · latest accepted');
    expect(screen.getByText('canonical · registry · source linked')).toBeInTheDocument();
    expect(screen.getByText('accepted · aleph · registry · promoted')).toBeInTheDocument();
    expect(api.lastBody(promote)).toEqual({note: null});
    expect(api.calls(HISTORY)).toHaveLength(2);
    // Only what is on screen is read again: the entity list and its dossier are marked stale, not fetched.
    expect(api.calls('GET /api/investigations/inv-1/entities')).toHaveLength(0);
    expect(api.calls('GET /api/entities/ent-1/dossier')).toHaveLength(0);
  });

  it('inspects a relationship finding, reviews it as supported, and promotes it to a canonical edge', async () => {
    const review = 'POST /api/connector-findings/find-2/relationship-reviews';
    const promote = 'POST /api/external-relationship-reviews/err-1/promote';
    const api = await renderPanel({
      [REL_CANDIDATES]: {
        schema: 'Ownership', source_prop: 'owner', target_prop: 'asset', source_external_id: 'aleph-3', target_external_id: 'aleph-1',
        source_candidates: [{entity_id: 'ent-2', caption: 'Jane Doe', schema: 'Person', score: 1}], target_candidates: [candidate],
        source_external_finding: {id: 'find-3', caption: 'Jane Doe', schema: 'Person', provider_record_id: 'aleph-3', source_url: null},
      },
      [review]: {id: 'err-1', investigation_id: 'inv-1', finding_id: 'find-2', schema: 'Ownership', source_entity_id: 'ent-2', target_entity_id: 'ent-1', decision: 'supported', note: null, created_at: '2026-10-01T00:00:00'},
      [promote]: {id: 'erp-1', investigation_id: 'inv-1', finding_id: 'find-2', review_id: 'err-1', relationship_edge_id: 'rel-5', relationship_entity_id: 'rel-ent-5', provider: 'aleph', source_url: null, promoted_at: '2026-10-01T00:00:00'},
      'GET /api/investigations/inv-1/graph': emptyGraph(),
    });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', {name: 'Inspect'})[1]);
    await screen.findByText('Ownership relationship');
    expect(screen.getByText('owner: aleph-3 → asset: aleph-1').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('Jane Doe → Kestrelwood Holdings Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Promote relationship'})).not.toBeInTheDocument();
    // A relationship finding has no entity ledger.
    expect(screen.getByText('Choose a matched canonical entity to inspect provenance.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Supported'}));
    await screen.findByRole('button', {name: 'Promote relationship'});
    expect(api.lastBody(review)).toEqual({source_entity_id: 'ent-2', target_entity_id: 'ent-1', decision: 'supported'});

    await user.click(screen.getByRole('button', {name: 'Promote relationship'}));
    await waitFor(() => expect(api.calls(promote)).toHaveLength(1));
    expect(api.unmatched()).toEqual([]);
  });

  it('asks for both ends to be canonical before a relationship can be reviewed', async () => {
    const api = await renderPanel({[REL_CANDIDATES]: {
      schema: 'Ownership', source_prop: 'owner', target_prop: 'asset', source_external_id: 'aleph-3', target_external_id: 'aleph-1', source_candidates: [], target_candidates: [candidate],
    }});
    await userEvent.setup().click(screen.getAllByRole('button', {name: 'Inspect'})[1]);
    await screen.findByText('Canonicalize both endpoints before promotion.');
    expect(screen.getByText('No canonical source match → Kestrelwood Holdings Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Supported'})).not.toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });

  it('forgets the inspected finding when the case changes', async () => {
    const api = await renderPanel({'GET /api/investigations/inv-2/connector-findings': []});
    await inspectCompany(api);
    cleanup();
    wrap(<ReviewQueuePanel investigationId="inv-2"/>);
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-2/connector-findings')).toHaveLength(1));
    expect(screen.getByText('Choose a finding.')).toBeInTheDocument();
    expect(screen.queryByText('Best entity match:', {exact: false})).not.toBeInTheDocument();
  });
});
