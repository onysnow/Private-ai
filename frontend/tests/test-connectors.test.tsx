// @vitest-environment jsdom
// The external connectors panel, moved out of app/page.tsx onto the
// generated client (Foundation Fixes fixes 2 and 3): a provider search, a
// single-provider and an all-provider enrichment of the selected entity,
// the cross-provider clusters a session produces, and the selected entity
// shared through the store. The review queue is rendered beside it where a
// test checks that the findings it changed are read again.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ConnectorsPanel, PartyFacts} from '../features/connectors/connectors-panel';
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
const LOOKUPS = 'GET /api/settings/lookups';
const source = (key: string, label: string, extra: Record<string, unknown> = {}) => ({key, label, host: `${key}.test`, kind: 'records', default: 'ask', mode: 'ask',
  key_saved: false, key_check: null, last: null, cases_this_month: 0, ...extra});
const lookups = {can_change_defaults: true, cases: [], week: [], sources: [
  source('aleph', 'OpenAleph', {key_saved: true, last: {id: 'l-1', at: '2026-10-01T09:00:00', case: '1MDB', investigation_id: 'inv-1', is_party: true, provider: 'aleph',
    results: 4, sent: 'Kestrelwood', status: 'completed'}}),
  source('opensanctions', 'OpenSanctions', {key_saved: true, last: {id: 'l-2', at: '2026-10-01T09:00:00', case: '1MDB', investigation_id: 'inv-1', is_party: true,
    provider: 'opensanctions', results: 0, sent: 'Kestrelwood', status: 'refused'}}),
]};
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
  const api = mockApi({[ENTITIES]: [entityA, entityB], [FINDINGS]: [], [LOOKUPS]: lookups, ...routes});
  wrap(<>
    <ConnectorsPanel investigationId="inv-1" providers={providers} picker={<span data-testid="picker">picker</span>}/>
    {withQueue && <ReviewQueuePanel investigationId="inv-1"/>}
  </>);
  // The first listed entity is selected once the list is in.
  await waitFor(() => expect(screen.getByRole('button', {name: 'Open dossier'})).toBeEnabled());
  return api;
}

describe('ConnectorsPanel', () => {
  it('shows each connector as a card with its key and last lookup, the page\'s picker, and picks the first party', async () => {
    await renderPanel();
    expect(screen.getByTestId('picker')).toBeInTheDocument();
    const cards = screen.getAllByRole('radio');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('aria-checked', 'true');
    expect(cards[0]).toHaveTextContent('OpenAleph');
    // The key that works is a colour, its word on hover; a refused key stays an alert in words, with the way to fix it.
    await waitFor(() => expect(within(cards[0]).getByRole('img', {name: 'Key: works'})).toBeInTheDocument());
    expect(within(cards[1]).getByText('! refused')).toBeInTheDocument();
    expect(within(cards[1]).getByRole('link', {name: 'Key'})).toHaveAttribute('href', '/settings#keys');
    // What the last lookup sent is on hover.
    expect(within(cards[0]).getByText('“Kestrelwood” · 4 found').closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('option', {name: /Kestrelwood Holdings Ltd/})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', {name: 'Kestrelwood Holdings Ltd'})).toBeInTheDocument();
    expect(useWorkbenchStore.getState().entityId).toBe('ent-1');
    expect(screen.getByRole('button', {name: 'Enrich with aleph'})).toBeEnabled();
    expect(screen.getByRole('button', {name: 'Enrich all providers'})).toBeEnabled();
  });

  it('filters the parties as you type, picks one, and picks the connector from its card', async () => {
    await renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search people, companies, identifiers...'), 'jane');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.click(screen.getByRole('option', {name: /Jane Doe/}));
    expect(useWorkbenchStore.getState().entityId).toBe('ent-2');
    await user.click(screen.getAllByRole('radio')[1]);
    expect(screen.getByRole('button', {name: 'Enrich with opensanctions'})).toBeInTheDocument();
  });

  it('counts the findings waiting and links them to Check', async () => {
    await renderPanel({[FINDINGS]: [findingFixture(), findingFixture({id: 'find-2', review_status: 'accepted'})]});
    const link = await screen.findByRole('link', {name: /findings? to review/});
    await waitFor(() => expect(link).toHaveTextContent('1finding to review'));
    expect(link).toHaveAttribute('href', '/check?inv=inv-1#review-queue');
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
    expect(screen.queryByRole('button', {name: 'Search'})).not.toBeInTheDocument();
    await userEvent.setup().type(screen.getByPlaceholderText('Search people, companies, identifiers...'), '{Enter}');
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

    // The decision is its shape; its word is on hover (Ony, 29 Oct).
    expect((await screen.findByText('Latest decision: negative')).closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('img', {name: 'Latest decision: negative'})).toHaveTextContent('✕');
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

    api.add({'GET /api/investigations/inv-2/entities': [entityFixture('ent-7', 'Harbor Trust', 'Company', {investigation_id: 'inv-2'})],
      'GET /api/investigations/inv-2/connector-findings': []});
    useWorkbenchStore.getState().setInvestigationId('inv-2');
    cleanup();
    wrap(<ConnectorsPanel investigationId="inv-2" providers={['aleph']}/>);
    await waitFor(() => expect(useWorkbenchStore.getState().entityId).toBe('ent-7'));
    expect(screen.queryByText('Cross-provider candidates')).not.toBeInTheDocument();
    expect(screen.queryByText(/completed · aleph/)).not.toBeInTheDocument();
  });

  it('ends a long party name in an ellipsis with the whole name on hover, and shows the picked party\'s note and facts', async () => {
    const long = entityFixture('ent-9', '1MDB ENERGY HOLDINGS SDN. BHD. (Malaysia 1020481-D, a subsidiary of the state fund)', 'Company', {
      properties: {name: ['1MDB ENERGY HOLDINGS SDN. BHD.'], notes: ['Bought the Malaysian power plants.'], jurisdiction: ['my'],
        registrationNumber: ['1020481-D'], alias: ['1MDB Energy', 'Edra']}});
    await renderPanel({[ENTITIES]: [long, entityB]});
    const name = screen.getAllByText(long.caption as string, {selector: '.cn-party-name'})[0];
    expect(name.closest('.rv')).toHaveClass('cn-party-rv');
    const facts = within(screen.getByRole('region', {name: 'What a lookup can match on'}));
    expect(facts.getByText('Bought the Malaysian power plants.')).toBeInTheDocument();
    expect(facts.getByText('Also').nextSibling).toHaveTextContent('1MDB Energy · Edra');
    expect(facts.getByText('Registration').nextSibling).toHaveTextContent('1020481-D');
    // Nothing sent this week is one quiet line, not a panel.
    const sent = screen.getByRole('region', {name: 'Sent from this case'});
    expect(sent).toHaveClass('none');
    expect(within(sent).getByText('nothing this week')).toBeInTheDocument();
    expect(within(sent).queryByRole('list')).toBeNull();
  });

  it('says a party with only a name is searched by it', () => {
    wrap(<PartyFacts properties={{name: ['Jane Doe']}}/>);
    expect(screen.getByText('Only its name: a lookup searches by that.')).toBeInTheDocument();
  });
});
