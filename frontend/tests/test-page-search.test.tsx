// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 2: the "Investigation search" flow on
// app/page.tsx, now the SearchPanel (features/search/search-panel.tsx) the
// page renders. Like test-page-api-access.test.tsx, this targets one
// self-contained flow rather than the whole 60+-hook component: the search
// only needs a query (never `inv`) to run, and the per-investigation loads
// are avoided entirely by keeping the investigations list empty, exactly as
// the API-access bootstrap tests already do. The panel calls GET /api/search
// through the generated client, so the reply must be a full SearchOut
// (lib/generated/types.gen.ts) or its Zod check rejects it.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
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
  const mod = await import('../components/case/workbench-all');
  return mod.default;
}

const SEARCH = 'GET /api/search';

// Minimal fixtures satisfying SearchHitOut: type, group (one of the fixed
// literal set the panel groups by), id, investigation_id, title, snippet,
// score, provenance (object), metadata (object).
const canonicalHit = {
  type: 'entity',
  group: 'canonical',
  id: 'ent-1',
  investigation_id: 'inv-1',
  title: 'Kestrelwood Holdings',
  snippet: 'A shell entity mentioned in filing 12.',
  score: 3.5,
  provenance: {},
  metadata: {},
  kind: 'party',
  record_type: 'entity',
};

const externalLeadHit = {
  type: 'connector_finding',
  group: 'external_lead',
  id: 'find-1',
  investigation_id: 'inv-1',
  title: 'Aleph result for Kestrelwood',
  snippet: 'An unreviewed external lead.',
  score: 1.2,
  provenance: {},
  metadata: {},
  kind: 'outside',
  record_type: 'finding',
};

function searchBody(results: unknown[]) {
  return {
    query: 'Kestrelwood',
    investigation_id: null,
    total: results.length,
    returned: results.length,
    results,
    counts: {},
    group_counts: {},
  };
}

async function bootstrapAndFindSearchInput(results: unknown[]): Promise<{api: MockApi; input: HTMLElement}> {
  // No investigation: nothing but the three bootstrap routes and the search.
  const api = mockApi({...pageRoutes(), [SEARCH]: searchBody(results)});
  const Home = await importHome();
  render(<Home />);
  await screen.findByText(
    'API: local access',
  );
  return {api, input: screen.getByPlaceholderText('Search this investigation…')};
}

describe('Home investigation search', () => {
  it('runs a search on button click and renders grouped results', async () => {
    const {api, input} = await bootstrapAndFindSearchInput([canonicalHit, externalLeadHit]);
    const user = userEvent.setup();
    await user.type(input, 'Kestrelwood');
    await user.click(screen.getByRole('button', {name: 'Search records'}));

    await screen.findByRole('option', {name: /Kestrelwood Holdings/});
    expect(screen.getByRole('button', {name: /Outside findings/, expanded: true})).toBeInTheDocument();
    expect(screen.getByRole('option', {name: /Aleph result for Kestrelwood/})).toBeInTheDocument();
    // Canonical hits get a "Trace provenance" action; external leads instead
    // get a plain caution note and no trace action.
    expect(
      screen.getByRole('button', {name: 'Trace provenance'}),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'External connector result; treat as a lead until reviewed and promoted.',
      ),
    ).toBeInTheDocument();

    expect(api.calls(SEARCH)).toHaveLength(1);
    const searchUrl = api.lastUrl(SEARCH);
    expect(searchUrl.searchParams.get('q')).toBe('Kestrelwood');
    expect(searchUrl.searchParams.get('limit')).toBe('75');
    // No investigation is selected in this test, so the request must not
    // scope to one.
    expect(searchUrl.searchParams.has('investigation_id')).toBe(false);
    expect(searchUrl.searchParams.has('include_reconciled_duplicates')).toBe(false);
    expect(api.unmatched()).toEqual([]);
  });

  it('runs a search on Enter and includes include_reconciled_duplicates when checked', async () => {
    const {api, input} = await bootstrapAndFindSearchInput([canonicalHit]);
    const user = userEvent.setup();
    await user.click(
      screen.getByLabelText('Include reviewed duplicate copies'),
    );
    await user.type(input, 'Kestrelwood{Enter}');

    await screen.findByRole('option', {name: /Kestrelwood Holdings/});
    await waitFor(() => expect(api.calls(SEARCH)).toHaveLength(1));
    expect(api.lastUrl(SEARCH).searchParams.get('include_reconciled_duplicates')).toBe('true');
  });

  it('does not search on an empty query', async () => {
    const {api} = await bootstrapAndFindSearchInput([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Search records'}));

    // The panel ignores a blank query -- no search request should ever be
    // made.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.calls(SEARCH)).toHaveLength(0);
  });
});
