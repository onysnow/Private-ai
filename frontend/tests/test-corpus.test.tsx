// @vitest-environment jsdom
// The OpenAleph corpus (ADR-0006, Wave B): the "Corpus sync" line and "Sync
// now", reviewing cross-references ("Same entity" / "Different" / "Not
// sure" with a note), and "Expand in the corpus" on a dossier.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {CorpusPanel, corpusSyncSummary} from '../features/corpus/corpus-panel';
import {CorpusExpand} from '../features/dossier/corpus-expand';
import {DuplicateCandidates} from '../features/dossier/duplicate-candidates';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {CorpusSyncOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {corpusSyncBody, watchlistBody} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null, claim: null, dossier: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SYNC = 'GET /api/investigations/inv-1/corpus/sync';
const XREFS = 'GET /api/investigations/inv-1/cross-references';
const WATCHLIST = 'GET /api/investigations/inv-1/watchlist';
const SETS = 'GET /api/investigations/inv-1/corpus/entity-sets';

function syncLine(overrides: Record<string, unknown> = {}) {
  return corpusSyncBody('inv-1', {
    enabled: true, collection_id: '7', collection_label: 'Harbour contracts', pushed_records: 12,
    push: {status: 'succeeded', started_at: '2026-10-02T10:00:00', finished_at: '2026-10-02T10:00:05', message: 'Sent 3 record(s)', error: null,
      sent: 3, removed: 0, unchanged: 9, removals_waiting: 0, judgements_sent: 0, judgements_failed: 0},
    pending: {to_send: 1, to_remove: 0, judgements: 0, cannot_send: []},
    cross_reference: {status: 'succeeded', requested_at: '2026-10-02T10:00:10', finished_at: '2026-10-02T10:01:00', error: null,
      results: 4, new: 1, updated: 3, duplicates: 1, open: 1},
    ...overrides,
  });
}

function crossReference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'xr-1', investigation_id: 'inv-1', status: 'open',
    entity: {id: 'ent-1', caption: 'Meridian Holdings Ltd', schema: 'Company'},
    openaleph_entity_id: 'ours.sig',
    match: {openaleph_id: 'theirs.sig', collection_id: '9', collection_label: 'Port authority', investigation_id: 'inv-2', schema: 'Company',
      caption: 'Meridian Holdings Limited', properties: {registrationNumber: ['09876543']}, url: 'http://openaleph.test/entities/theirs.sig'},
    matched_properties: [{property_type: 'identifier', label: 'Identifier', score: 1, ours: ['09876543'], theirs: ['09876543']}],
    score: 0.976, method: 'regression-v1', decision: null, identity_finding_id: null,
    first_seen_at: '2026-10-02T10:01:00', last_seen_at: '2026-10-02T10:01:00',
    ...overrides,
  };
}

async function renderPanel(routes: Record<string, unknown> = {}) {
  const api = mockApi({[SYNC]: syncLine(), [XREFS]: [crossReference()], [WATCHLIST]: watchlistBody('inv-1'), [SETS]: [], ...routes});
  wrap(<CorpusPanel investigationId="inv-1"/>);
  await screen.findByText('Meridian Holdings Limited');
  return api;
}

describe('CorpusPanel', () => {
  it('shows the corpus sync line and the cross-references waiting for review', async () => {
    const api = await renderPanel();
    expect(screen.getByText(/Last push: succeeded, .* — Sent 3 record\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Pending: 1 to send · 0 to remove · 0 judgement(s) · 12 record(s) in Harbour contracts').closest('[hidden]')).not.toBeNull();  // on hover (Ony, 29 Oct)
    expect(screen.getByText(/Last cross-reference run: succeeded, .* — 4 match\(es\), 1 new, 1 possible duplicate\(s\) · 1 waiting for review/)).toBeInTheDocument();
    expect(screen.getByText('No background worker runs here: changes reach OpenAleph on “Sync now”.')).toBeInTheDocument();
    expect(screen.getByText('(Company) in Port authority').closest('[hidden]')).not.toBeNull();  // on hover (Ony, 29 Oct)
    expect(screen.getByText('Score 98% · regression-v1')).toBeInTheDocument();
    expect(screen.getByText('Identifier (100%): 09876543 ↔ 09876543').closest('[hidden]')).not.toBeNull();  // on hover (Ony, 29 Oct)
    expect(screen.getByRole('link', {name: 'Open in OpenAleph'})).toHaveAttribute('href', 'http://openaleph.test/entities/theirs.sig');
    expect(api.unmatched()).toEqual([]);
  });

  it('records a decision with its note and reads the list and the line again', async () => {
    const api = await renderPanel();
    const user = userEvent.setup();
    api.add({
      'POST /api/cross-references/xr-1/decision': crossReference({status: 'decided'}),
      [XREFS]: [],
      [SYNC]: syncLine({pending: {to_send: 0, to_remove: 0, judgements: 1, cannot_send: []}}),
    });
    await user.type(screen.getByRole('textbox', {name: 'Note on Meridian Holdings Limited'}), 'Same registration number');
    await user.click(screen.getByRole('button', {name: 'Same entity'}));

    await screen.findByText('Recorded “Same entity” for Meridian Holdings Ltd and Meridian Holdings Limited.');
    expect(api.lastBody('POST /api/cross-references/xr-1/decision')).toEqual({decision: 'same', note: 'Same registration number'});
    await screen.findByText('No cross-reference waits for review.');
    await screen.findByText(/1 judgement\(s\)/);
    expect(api.calls(XREFS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('sends "Different" and "Not sure" without a note, and shows a refusal', async () => {
    const api = await renderPanel({'POST /api/cross-references/xr-1/decision': {status: 409, body: {detail: 'This entity was merged into another record'}}});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Not sure'}));
    await screen.findByText(/This entity was merged into another record/);
    expect(api.lastBody('POST /api/cross-references/xr-1/decision')).toEqual({decision: 'unsure', note: null});
    api.add({'POST /api/cross-references/xr-1/decision': crossReference({status: 'decided'})});
    await user.click(screen.getByRole('button', {name: 'Different'}));
    await screen.findByText('Recorded “Different” for Meridian Holdings Ltd and Meridian Holdings Limited.');
    expect(api.lastBody('POST /api/cross-references/xr-1/decision')).toEqual({decision: 'different', note: null});
  });

  it('opens the dossier of the entity matched', async () => {
    await renderPanel();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Open dossier'}));
    expect(useWorkbenchStore.getState().dossier?.entityId).toBe('ent-1');
  });

  it('syncs now: in the request without a worker, queued with one', async () => {
    const api = await renderPanel();
    const user = userEvent.setup();
    const after = syncLine({pending: {to_send: 0, to_remove: 0, judgements: 0, cannot_send: []}});
    api.add({'POST /api/investigations/inv-1/corpus/sync': {queued: false, ran: true, sync: after}});
    await user.click(screen.getByRole('button', {name: 'Sync now'}));
    await screen.findByText('Synced.');
    expect(screen.getByText(/Pending: 0 to send/)).toBeInTheDocument();
    expect(api.calls(XREFS)).toHaveLength(2);

    api.add({'POST /api/investigations/inv-1/corpus/sync': {queued: true, ran: false, sync: syncLine({background: true})}});
    await user.click(screen.getByRole('button', {name: 'Sync now'}));
    await screen.findByText('Sync queued: the background worker sends the changes now.');
    expect(screen.queryByText(/No background worker runs here/)).not.toBeInTheDocument();

    api.add({'POST /api/investigations/inv-1/corpus/sync': {status: 409, body: {detail: 'OpenAleph integration is disabled on this deployment'}}});
    await user.click(screen.getByRole('button', {name: 'Sync now'}));
    await screen.findByText(/OpenAleph integration is disabled on this deployment/);
  });

  it('shows failures, and a disabled integration without a Sync now', async () => {
    const failing = syncLine({
      consecutive_failures: 2,
      push: {...(syncLine().push as Record<string, unknown>), status: 'failed', error: 'ConnectError: refused'},
      cross_reference: {...(syncLine().cross_reference as Record<string, unknown>), status: 'failed', error: 'CrossReferenceTimeout: still busy'},
      failures: [{id: 'f-1', investigation_id: 'inv-1', document_id: null, operation: 'corpus_push', error: 'ConnectError: refused', created_at: '2026-10-02T10:00:05'}],
    });
    mockApi({[SYNC]: failing, [XREFS]: [], [WATCHLIST]: watchlistBody('inv-1'), [SETS]: []});
    wrap(<CorpusPanel investigationId="inv-1"/>);
    await screen.findByText('Failures: 2 in a row — latest corpus_push: ConnectError: refused');
    expect(screen.getByText('Last error: ConnectError: refused')).toBeInTheDocument();
    expect(screen.getByText('Cross-referencing error: CrossReferenceTimeout: still busy')).toBeInTheDocument();

    cleanup();
    mockApi({[SYNC]: corpusSyncBody('inv-1'), [XREFS]: [], [WATCHLIST]: watchlistBody('inv-1'), [SETS]: []});
    wrap(<CorpusPanel investigationId="inv-1"/>);
    await screen.findByText('OpenAleph integration is disabled on this deployment.');
    expect(screen.getByRole('button', {name: 'Sync now'})).toBeDisabled();
  });

  it('says plainly what a line that never ran holds, and why the demo is not sent', () => {
    const never = corpusSyncBody('inv-1', {enabled: true}) as unknown as CorpusSyncOut;
    expect(corpusSyncSummary(never)).toEqual([
      'Last push: never',
      'Pending: 0 to send · 0 to remove · 0 judgement(s) · 0 record(s) in no collection yet',
      'Last cross-reference run: never · 0 waiting for review',
    ]);
    const demo = corpusSyncBody('inv-1', {pending: {to_send: 0, to_remove: 0, judgements: 0, cannot_send: ['The demo investigation is never sent to OpenAleph']}}) as unknown as CorpusSyncOut;
    expect(corpusSyncSummary(demo)).toEqual(['The demo investigation is never sent to OpenAleph']);
  });

  it('shows load errors', async () => {
    mockApi({[SYNC]: {status: 500, body: {detail: 'boom'}}, [XREFS]: {status: 500, body: {detail: 'bang'}}, [WATCHLIST]: watchlistBody('inv-1'), [SETS]: []});
    wrap(<CorpusPanel investigationId="inv-1"/>);
    await screen.findByText(/boom/);
    await screen.findByText(/bang/);
  });
});

describe('CorpusExpand', () => {
  const EXPAND = 'POST /api/entities/ent-1/corpus/expand';
  const expanded = {
    entity_id: 'ent-1', run_id: 'run-1', identities: ['ours.sig', 'theirs.sig'], relationships: 1, neighbours: 1, skipped_own: 2,
    findings: [
      {id: 'f-1', kind: 'entity', caption: 'Bob Smith', schema: 'Person', provider_record_id: 'bob.sig', source_url: 'http://openaleph.test/entities/bob.sig',
        review_status: 'unreviewed', collection_label: 'Port authority'},
      {id: 'f-2', kind: 'relationship', caption: 'director', schema: 'Directorship', provider_record_id: 'dir.sig', source_url: null,
        review_status: 'unreviewed', collection_label: null},
    ],
  };

  it('proposes what OpenAleph holds around the entity for review', async () => {
    const api = mockApi({[EXPAND]: expanded});
    wrap(<CorpusExpand entityId="ent-1"/>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Expand in the corpus'}));
    // The count shows; what was already held and where to review them are on its hover (Ony, 29 Oct).
    await screen.findByText('1 link(s) and 1 party proposed for review');
    expect(screen.getByText('2 already in this investigation. Review them in the review queue.').closest('[hidden]')).not.toBeNull();
    // Each finding is its name; its kind and collection on hover, its review state as a shape.
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('Party · Person · Port authority').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('director')).toBeInTheDocument();
    expect(screen.getByText('Link · Directorship').closest('[hidden]')).not.toBeNull();
    expect(screen.getAllByRole('img', {name: 'unreviewed'})).toHaveLength(2);
    expect(screen.getAllByRole('link', {name: 'Open in OpenAleph'})).toHaveLength(1);
    expect(api.calls(EXPAND)).toHaveLength(1);
  });

  it('says why an entity cannot be expanded', async () => {
    mockApi({[EXPAND]: {status: 409, body: {detail: 'This entity is not in OpenAleph yet: sync the corpus, or decide a cross-reference first'}}});
    wrap(<CorpusExpand entityId="ent-1"/>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Expand in the corpus'}));
    await screen.findByText(/This entity is not in OpenAleph yet/);
    await waitFor(() => expect(screen.getByRole('button', {name: 'Expand in the corpus'})).toBeEnabled());
  });

  it('counts a single neighbour and none already held', async () => {
    mockApi({[EXPAND]: {...expanded, relationships: 0, neighbours: 2, skipped_own: 0, findings: []}});
    wrap(<CorpusExpand entityId="ent-1"/>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Expand in the corpus'}));
    await screen.findByText('0 link(s) and 2 parties proposed for review');
    expect(screen.getByText('Review them in the review queue.').closest('[hidden]')).not.toBeNull();
  });
});

describe('DuplicateCandidates', () => {
  const candidate = {entity_id: 'ent-2', caption: 'MHL (UK)', schema: 'Organization', score: 0.8, latest_decision: null};
  const noop = () => undefined;

  it('says when OpenAleph cross-referencing found a possible duplicate', () => {
    render(<DuplicateCandidates candidates={[{...candidate, found_by: ['openaleph_xref']}, {...candidate, entity_id: 'ent-3', caption: 'Meridian Holdings', found_by: ['name_overlap', 'openaleph_xref']},
      {...candidate, entity_id: 'ent-4', caption: 'Meridian', found_by: ['name_overlap']}]} previews={{}} onDecide={noop} onPreviewMerge={noop} onExecuteMerge={noop}/>);
    // How a candidate was found is on its score's hover.
    expect(screen.getByText('Found by OpenAleph cross-referencing').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText('Found by OpenAleph cross-referencing and by name')).toBeInTheDocument();
    expect(screen.getAllByText(/Found by OpenAleph/)).toHaveLength(2);
    expect(screen.getByText('Found by name')).toBeInTheDocument();
  });
});
