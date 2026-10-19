// @vitest-environment jsdom
// Reading the Red Flags never runs the rules (features/red-flags/use-red-flags-query.ts): every screen that shows
// flags reads them; the first to see them stale runs the rules once, and every screen gets the fresh answer.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {useRedFlagsQuery} from '../features/red-flags/use-red-flags-query';
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
});
