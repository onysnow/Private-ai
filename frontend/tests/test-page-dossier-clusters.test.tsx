// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 13 (third and final entity-dossier
// sub-cycle): single-provider enrich(), multi-provider enrichAll(), and
// decideCluster() on the cross-provider candidates it produces. See cycle
// 11's docstring for why the dossier area is split across cycles.
//
// Unlike the rest of the dossier (identity history, property conflicts,
// canonical duplicates, reconciliation), the "Cross-provider candidates"
// block that decideCluster acts on is a SIBLING of the `dossier &&` block
// in app/page.tsx, not nested inside it -- it renders whenever `clusters`
// is non-empty, independent of whether a dossier has been opened. So none
// of these tests need to click "Open dossier" at all; they only need
// `entityId` set, which loadEntities() (cycle 10's finding) already
// auto-fills to the first loaded entity. The stub answers by route
// (test-support/page-routes.ts lists what opening a case requests), not by
// call order -- ADR-0005, line 15.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};
const entityA = {id: 'ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company', properties: {}};

const FINDINGS = 'GET /api/investigations/inv-1/connector-findings';
const ENRICH_ALL = 'POST /api/entities/ent-1/enrich';
const CLUSTERS = 'GET /api/enrichment-sessions/session-1/clusters';
const CLUSTER_DECISION = 'POST /api/enrichment-sessions/session-1/clusters/decision';

function clusterFixture(overrides: Record<string, unknown> = {}) {
  return {
    cluster_key: 'cluster-1',
    score: 0.82,
    finding_ids: ['find-1', 'find-2'],
    findings: [
      {id: 'find-1', provider: 'aleph', caption: 'Kestrelwood Holdings Ltd'},
      {id: 'find-2', provider: 'opensanctions', caption: 'Kestrelwood Holdings'},
    ],
    pairs: [{reasons: [{kind: 'name_match', detail: 'Normalized names match exactly.'}]}],
    ...overrides,
  };
}

async function bootstrap(): Promise<MockApi> {
  const api = mockApi(pageRoutes({investigations: [investigation], entities: [entityA]}));

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');

  // loadEntities() auto-fills entityId to entities[0], so the enrich
  // buttons are already enabled with no <select> interaction needed.
  await screen.findByRole('button', {name: 'Enrich all providers'});
  return api;
}

describe('Home entity dossier: enrichment & cross-provider clusters', () => {
  it('runs a single-provider enrich and reloads connector findings', async () => {
    const api = await bootstrap();

    api.add({
      'POST /api/entities/ent-1/enrich/aleph': [
        {id: 'find-3', provider: 'aleph', caption: 'Kestrelwood Holdings', properties: {}, review_status: 'unreviewed'},
        {id: 'find-4', provider: 'aleph', caption: 'Kestrelwood Trading Ltd', properties: {}, review_status: 'unreviewed'},
      ],
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich with aleph'}));

    await screen.findByText('aleph: 2 finding(s)');

    expect(api.calls('POST /api/entities/ent-1/enrich/aleph')).toHaveLength(1);
    expect(api.calls(FINDINGS)).toHaveLength(2); // bootstrap, then the reload
    expect(api.unmatched()).toEqual([]);
  });

  it('runs enrichAll and renders the resulting cross-provider cluster', async () => {
    const api = await bootstrap();

    api.add({
      [ENRICH_ALL]: {
        id: 'session-1',
        status: 'completed',
        runs: [
          {provider: 'aleph', status: 'ok', result_count: 3},
          {provider: 'opensanctions', status: 'ok', result_count: 1},
        ],
      },
      [CLUSTERS]: [clusterFixture()],
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich all providers'}));

    await screen.findByText('completed · aleph: ok (3) · opensanctions: ok (1)');
    expect(screen.getByText('Cross-provider candidates')).toBeInTheDocument();
    expect(screen.getByText('82% possible same outside entity')).toBeInTheDocument();
    expect(screen.getByText('aleph: Kestrelwood Holdings Ltd')).toBeInTheDocument();
    expect(screen.getByText('opensanctions: Kestrelwood Holdings')).toBeInTheDocument();
    expect(screen.getByText('name_match: Normalized names match exactly.')).toBeInTheDocument();

    expect(api.calls(ENRICH_ALL)).toHaveLength(1);
    expect(api.lastBody(ENRICH_ALL)).toMatchObject({providers: ['aleph']});
    // The clusters can only be asked for once the session's id has come back.
    expect(api.calls(CLUSTERS)).toHaveLength(1);
    expect(api.calls(FINDINGS)).toHaveLength(2); // bootstrap, then the reload
    expect(api.unmatched()).toEqual([]);
  });

  it('records a cluster decision and reloads the cluster list', async () => {
    const api = await bootstrap();

    api.add({
      [ENRICH_ALL]: {id: 'session-1', status: 'completed', runs: [{provider: 'aleph', status: 'ok'}]},
      [CLUSTERS]: [clusterFixture()],
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Enrich all providers'}));
    await screen.findByText('Cross-provider candidates');

    api.add({
      [CLUSTER_DECISION]: {},
      [CLUSTERS]: [clusterFixture({decision: {decision: 'positive'}})], // what the reload finds
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Same external entity'}));

    await screen.findByText('Latest decision: positive');

    expect(api.calls(CLUSTER_DECISION)).toHaveLength(1);
    expect(api.lastBody(CLUSTER_DECISION)).toMatchObject({
      finding_ids: ['find-1', 'find-2'],
      decision: 'positive',
      confidence: 0.9,
    });
    expect(api.calls(CLUSTERS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });
});
