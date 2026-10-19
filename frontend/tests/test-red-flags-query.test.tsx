// @vitest-environment jsdom
// Reading the Red Flags never runs the rules (features/red-flags/use-red-flags-query.ts): every screen that shows
// flags reads them; the first to see them stale runs the rules once, and every screen gets the fresh answer.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {useQuery} from '@tanstack/react-query';

import {useRedFlagsQuery} from '../features/red-flags/use-red-flags-query';
import {getChecksOptions, getDecisionsOptions, getWireOptions} from '../lib/generated/@tanstack/react-query.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const body = (n: number, extra: Record<string, unknown> = {}) => ({investigation_id: 'inv-1', rules: [], cannot_run: [], gone: [],
  investigation_type: {set_by: 'app', areas: [], suggested: []}, ran_at: '2026-10-10T00:00:00', stale: false,
  flags: Array.from({length: n}, (_, i) => ({id: `f${i}`, indicator_id: 'BO-001', rule_version: 1, level: 'faint', status: 'open', dismissed_reason: null, lead_id: null,
    weight: 1, weight_parts: [], parties: [], links: [], facts: {}, summary: '', not_shown: [], first_seen_at: '2026-10-09T00:00:00',
    last_seen_at: '2026-10-09T00:00:00', gone_at: null, indicator: null})), ...extra});

function Count({name}: {name: string}): ReactElement {
  const {query, waiting} = useRedFlagsQuery('inv-1');
  return <p data-testid={name}>{waiting ? 'waiting' : `${query.data?.flags.length ?? 0} flags`}</p>;
}

const item = {id: 'c-1', indicator_id: 'BO-002', indicator_name: 'Layered ownership', kind: 'checklist', question: 'whether there is a business reason for the layers',
  status: 'open', note: null, decided_at: null, parties: [], flag_id: 'f0', related_flags: [], document: null, locator: null, excerpt: null, terms: [],
  first_seen_at: '2026-10-10T00:00:00', gone_at: null};

// A screen that reads To check, the decisions and the Wire, as they read them: the stored rows, never a run.
function Reads(): ReactElement {
  const path = {investigation_id: 'inv-1'};
  useRedFlagsQuery('inv-1');
  const checks = useQuery(getChecksOptions({path})).data;
  const decisions = useQuery(getDecisionsOptions({path, query: {limit: 200}})).data;
  const wire = useQuery(getWireOptions({path})).data;
  return <p data-testid="reads">{`${checks?.items.length ?? '-'} checks, ${decisions?.total ?? '-'} decisions, ${wire?.events.length ?? '-'} events`}</p>;
}

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => cleanup());

describe('useRedFlagsQuery', () => {
  it('runs stale flags once for every screen showing them, and each screen shows the fresh answer', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/red-flags': body(0, {ran_at: null, stale: true}),
      'POST /api/investigations/inv-1/red-flags/run': body(3), 'GET /api/investigations/inv-1/standing': {}});
    render(<QueryProvider><Count name="home"/><Count name="money"/></QueryProvider>);
    expect(screen.getByTestId('home')).toHaveTextContent('waiting');
    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('3 flags'));
    expect(screen.getByTestId('money')).toHaveTextContent('3 flags');
    expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(1);
  });

  it('only reads when the flags are up to date', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/red-flags': body(2)});
    render(<QueryProvider><Count name="home"/></QueryProvider>);
    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('2 flags'));
    expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(0);
  });

  it('refetches To check, the decisions and the Wire once a run brings them up to date', async () => {
    let ran = false;
    const api = mockApi({
      'GET /api/investigations/inv-1/red-flags': () => body(ran ? 1 : 0, ran ? {} : {stale: true}),
      'POST /api/investigations/inv-1/red-flags/run': () => { ran = true; return body(1); },
      'GET /api/investigations/inv-1/standing': {},
      'GET /api/investigations/inv-1/checks': () => ({investigation_id: 'inv-1', items: ran ? [item] : [], gone: [], missing: []}),
      'GET /api/investigations/inv-1/decisions': () => ({investigation_id: 'inv-1', counts: {}, total: ran ? 2 : 0, offset: 0, items: []}),
      'GET /api/investigations/inv-1/wire': () => ({investigation_id: 'inv-1', entities: [], links: [], events: ran ? [{date: '2011-05-23', title: 'Payment', entity: null}] : []}),
    });
    render(<QueryProvider><Reads/></QueryProvider>);
    await waitFor(() => expect(screen.getByTestId('reads')).toHaveTextContent('1 checks, 2 decisions, 1 events'));
    expect(api.calls('POST /api/investigations/inv-1/red-flags/run')).toHaveLength(1);
    for (const route of ['checks', 'decisions', 'wire']) expect(api.calls(`GET /api/investigations/inv-1/${route}`).length).toBeGreaterThanOrEqual(2);
  });
});
