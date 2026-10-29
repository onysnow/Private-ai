// @vitest-environment jsdom
// The external connectors panel, moved out of app/page.tsx onto the
// generated client (Foundation Fixes fixes 2 and 3): a provider search, a
// single-provider and an all-provider enrichment of the selected entity,
// the cross-provider clusters a session produces, and the selected entity
// shared through the store. The review queue is rendered beside it where a
// test checks that the findings it changed are read again.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ConnectorsPanel} from '../features/connectors/connectors-panel';
import {ReviewQueuePanel} from '../features/review-queue/review-queue-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {Routes} from '../test-support/mock-api';
import {entityFixture, findingFixture} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', entityId: '', provenance: null, claim: null, dossier: null, relationship: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ENTITIES = 'GET /api/investigations/inv-1/entities';
const FINDINGS = 'GET /api/investigations/inv-1/connector-findings';
const ENRICH_ALL = 'POST /api/entities/ent-1/enrich';
const CLUSTERS = 'GET /api/enrichment-sessions/session-1/clusters';
const entityA = entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company');
const entityB = entityFixture('ent-2', 'Jane Doe', 'Person');

function clusterFixture(overrides: Record<string, unknown> = {}) {
  return {
    cluster_key: 'cluster-1', score: 0.82, providers: ['aleph', 'opensanctions'], finding_ids: ['find-1', 'find-2'],
    findings: [
      {id: 'find-1', provider: 'aleph', provider_record_id: 'aleph-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company', properties: {}, source_url: null},
      {id: 'find-2', provider: 'opensanctions', provider_record_id: 'os-1', caption: 'Kestrelwood Holdings', schema: 'Company', properties: {}, source_url: null},
    ],
    pairs: [{finding_ids: ['find-1', 'find-2'], score: 0.82, reasons: [{kind: 'name', detail: 'near-exact name', weight: 0.38}]}],
    decision: null, ...overrides,
  };
}

function sessionFixture(runs: {provider: string; status: string; result_count?: number; error?: string}[]) {
  return {
    id: 'session-1', entity_id: 'ent-1', investigation_id: 'inv-1', status: runs.some(r => r.error) ? 'partial' : 'completed', providers: runs.map(r => r.provider),
    total_results: runs.reduce((sum, r) => sum + (r.result_count ?? 0), 0), started_at: '2026-10-01T00:00:00', finished_at: '2026-10-01T00:00:01',
    runs: runs.map((r, i) => ({id: `session-run-${i + 1}`, session_id: 'session-1', run_id: `run-${i + 1}`, provider: r.provider, status: r.status,
      result_count: r.result_count ?? 0, error: r.error ?? null, started_at: '2026-10-01T00:00:00', finished_at: '2026-10-01T00:00:01'})),
  };
}

async function renderPanel(routes: Routes = {}, {withQueue = false, providers = ['aleph', 'opensanctions']} = {}) {
  const api = mockApi({[ENTITIES]: [entityA, entityB], [FINDINGS]: [], ...routes});
  wrap(<>
    <ConnectorsPanel investigationId="inv-1" providers={providers} picker={<span data-testid="picker">picker</span>}/>
    {withQueue && <ReviewQueuePanel investigationId="inv-1"/>}
  </>);
  // The first listed entity is selected once the list is in.
  await waitFor(() => expect(screen.getByRole('button', {name: 'Open dossier'})).toBeEnabled());
  return api;
}

describe('ConnectorsPanel', () => {
  it('lists the providers, shows the page\'s picker, and selects the first entity', async () => {
    await renderPanel();
    expect(screen.getByTestId('picker')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').find(el => el.textContent === 'aleph')).toBeTruthy();
    expect(screen.getAllByRole('combobox').find(el => el.textContent === 'Kestrelwood Holdings Ltd · Company')).toBeTruthy();
    expect(useWorkbenchStore.getState().entityId).toBe('ent-1');
    expect(screen.getByRole('button', {name: 'Enrich with aleph'})).toBeEnabled();
    expect(screen.getByRole('button', {name: 'Enrich all providers'})).toBeEnabled();
  });

  it('keeps the selected entity when the list still holds it, and moves to the first one when it does not', async () => {
    useWorkbenchStore.setState({entityId: 'ent-2'});
    await renderPanel();
    expect(useWorkbenchStore.getState().entityId).toBe('ent-2');
    cleanup();
    useWorkbenchStore.setState({entityId: 'ent-9'});
    await renderPanel();
    await waitFor(() => expect(useWorkbenchStore.getState().entityId).toBe('ent-1'));
  });

  it('searches the chosen provider and reads the findings again', async () => {
    const search = 'POST /api/connectors/aleph/search';
    const api = await renderPanel({[search]: [findingFixture()]}, {withQueue: true});
    await waitFor(() => expect(api.calls(FINDINGS)).toHaveLength(1));
    api.add({[FINDINGS]: [findingFixture()]});
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search people, companies, identifiers...'), 'Kestrelwood');
    await user.click(screen.getByRole('button', {name: 'Search'}));

    await screen.findByText('Kestrelwood Holdings', {selector: 'strong'});
    expect(api.lastBody(search)).toEqual({investigation_id: 'inv-1', query: 'Kestrelwood'});
    expect(api.calls(FINDINGS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('does not search without a query', async () => {
    const api = await renderPanel();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Search'}));
    expect(api.calls('POST /api/connectors/aleph/search')).toHaveLength(0);
  });

  it('enriches the selected entity with one provider and reports the count', async () => {
    const enrich = 'POST /api/entities/ent-1/enrich/aleph';
    const api = await renderPanel({[enrich]: [findingFixture(), findingFixture({id: 'find-2', provider_record_id: 'aleph-2'})]}, {withQueue: true});
    await waitFor(() => expect(api.calls(FINDINGS)).toHaveLength(1));
    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich with aleph'}));

    await screen.findByText('aleph: 2 finding(s)');
    expect(api.calls(enrich)).toHaveLength(1);
    expect(api.calls(FINDINGS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('runs every provider in one session, shows the clusters, and records a decision', async () => {
    const decision = 'POST /api/enrichment-sessions/session-1/clusters/decision';
    const api = await renderPanel({
      [ENRICH_ALL]: sessionFixture([{provider: 'aleph', status: 'completed', result_count: 3}, {provider: 'opensanctions', status: 'failed', error: 'provider unavailable'}]),
      [CLUSTERS]: [clusterFixture()],
    });
    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich all providers'}));

    await screen.findByText('partial · aleph: completed (3) · opensanctions: failed');
    expect(api.lastBody(ENRICH_ALL)).toEqual({providers: ['aleph', 'opensanctions']});
    expect(screen.getByText('Cross-provider candidates')).toBeInTheDocument();
    expect(screen.getByText('82% possible same outside entity')).toBeInTheDocument();
    expect(screen.getByText('aleph: Kestrelwood Holdings Ltd')).toBeInTheDocument();
    expect(screen.getByText('name: near-exact name')).toBeInTheDocument();
    expect(api.calls(CLUSTERS)).toHaveLength(1);

    const decided = {id: 'cpd-1', decision: 'negative', confidence: 0.5, rationale: null, created_at: '2026-10-01T00:00:02'};
    api.add({
      [decision]: {...decided, investigation_id: 'inv-1', entity_id: 'ent-1', session_id: 'session-1', cluster_key: 'cluster-1', finding_ids: ['find-1', 'find-2']},
      [CLUSTERS]: [clusterFixture({decision: decided})],
    });
    await userEvent.setup().click(screen.getByRole('button', {name: 'Different'}));

    await screen.findByText('Latest decision: negative');
    expect(api.lastBody(decision)).toEqual({finding_ids: ['find-1', 'find-2'], decision: 'negative', confidence: 0.5});
    expect(api.calls(CLUSTERS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('clears the status when an enrichment fails', async () => {
    const api = await renderPanel({[ENRICH_ALL]: {status: 502, body: {detail: 'aleph enrichment failed.'}}});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich all providers'}));
    await waitFor(() => expect(api.calls(ENRICH_ALL)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Running all configured connectors…')).not.toBeInTheDocument());
    expect(screen.queryByText('Cross-provider candidates')).not.toBeInTheDocument();
  });

  it('opens the selected entity\'s dossier in the inspector slot, through the shared store', async () => {
    const api = await renderPanel();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Open dossier'}));

    expect(useWorkbenchStore.getState().dossier).toMatchObject({entityId: 'ent-1'});
    expect(useWorkbenchStore.getState().inspector).toMatchObject([{kind: 'dossier', entityId: 'ent-1'}]);
    // The panel itself no longer draws the dossier: the slot does, wherever you are.
    expect(screen.queryByText('Kestrelwood Holdings Ltd dossier')).not.toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });

  it('forgets the session and its clusters when the case changes', async () => {
    const api = await renderPanel({[ENRICH_ALL]: sessionFixture([{provider: 'aleph', status: 'completed', result_count: 1}]), [CLUSTERS]: [clusterFixture()]});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich all providers'}));
    await screen.findByText('Cross-provider candidates');

    api.add({'GET /api/investigations/inv-2/entities': [entityFixture('ent-7', 'Harbor Trust', 'Company', {investigation_id: 'inv-2'})]});
    useWorkbenchStore.getState().setInvestigationId('inv-2');
    cleanup();
    wrap(<ConnectorsPanel investigationId="inv-2" providers={['aleph']}/>);
    await waitFor(() => expect(useWorkbenchStore.getState().entityId).toBe('ent-7'));
    expect(screen.queryByText('Cross-provider candidates')).not.toBeInTheDocument();
    expect(screen.queryByText(/completed · aleph/)).not.toBeInTheDocument();
  });
});
