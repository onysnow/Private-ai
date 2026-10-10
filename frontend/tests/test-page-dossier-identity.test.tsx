// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 11 (first of the entity-dossier sub-cycles):
// the dossier's identity/merge history block and property-conflict
// decisions (decidePropertyConflict). The dossier is the largest single
// section in app/page.tsx -- identity history, property conflicts,
// relationships/claims/leads/tasks/timeline/external-finding sub-lists,
// post-merge reconciliation, canonical-duplicate merge, and cross-provider
// clusters -- so it's being split across several cycles rather than one
// pass; this cycle covers only the first two pieces.
//
// loadDossier() is reached by clicking "Open dossier", which needs
// `entityId` set -- but loadEntities() (see cycle 10's docstring) already
// auto-fills entityId to the first loaded entity once entities load, so no
// <select> interaction is needed, same shortcut used there. The stub
// answers by route (test-support/page-routes.ts lists what opening a case
// requests; the dossier adds its own three routes), not by call order --
// ADR-0005, line 15.
//
// decidePropertyConflict() opens a confirmation dialog that asks for a
// rationale before making its POST; each test types one there.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {dossierFixture as baseDossier, emptyOwnershipChain, emptyReconciliation, entityFixture, pageRoutes} from '../test-support/page-routes';

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
  vi.restoreAllMocks();
});

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};
const entityA = entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company');

const DOSSIER = 'GET /api/entities/ent-1/dossier';
const DUPLICATES = 'GET /api/entities/ent-1/duplicate-candidates';
const RECONCILIATION = 'GET /api/entities/ent-1/post-merge-reconciliation';

// The dossier in the generated EntityDossierOut shape, with one merged alias
// and the decision and audit that merged it.
function dossierFixture(overrides: Record<string, unknown> = {}) {
  return baseDossier(entityA, {
    summary: {...baseDossier(entityA).summary, statement_count: 5, identity_alias_count: 1, identity_decision_count: 1},
    identity_history: {
      canonical_entity_id: 'ent-1',
      aliases: [{id: 'alias-1', caption: 'Kestrelwood Holdings LLC', schema: 'Company', merged_into_entity_id: 'ent-1'}],
      canonical_decisions: [
        {
          id: 'dec-1',
          decision: 'same',
          confidence: 0.95,
          rationale: 'Matched registration number.',
          created_at: '2026-09-23T00:00:00',
          other_entity: {id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company'},
        },
      ],
      merge_audits: [
        {id: 'merge-1', source_entity_id: 'ent-2', target_entity_id: 'ent-1', resolution_decision_id: 'dec-1', rationale: 'Confirmed duplicate filing.', moved_counts: {statements: 3}, created_at: '2026-09-23T00:00:00'},
      ],
      unresolved_decision_count: 0,
    },
    ...overrides,
  });
}

function propertyConflict(overrides: Record<string, unknown> = {}) {
  return {
    prop: 'incorporation_date',
    status: 'unresolved',
    preferred_value: null,
    reason: 'multiple_canonical_values',
    latest_decision: null,
    decision_history: [],
    values: [
      {value: '2015-03-01', canonical: true, support_count: 2, conflict_count: 0, canonical_statements: [], external_assessments: []},
      {value: '2016-07-14', canonical: false, support_count: 1, conflict_count: 1, canonical_statements: [], external_assessments: []},
    ],
    ...overrides,
  };
}

async function bootstrapAndOpenDossier(dossier: unknown): Promise<MockApi> {
  const api = mockApi({
    ...pageRoutes({investigations: [investigation], entities: [entityA]}),
    [DOSSIER]: dossier,
    [DUPLICATES]: [],
    [RECONCILIATION]: emptyReconciliation(),
    'GET /api/entities/ent-1/ownership-chain': emptyOwnershipChain('ent-1'),
  });

  const Home = await importHome();
  render(<Home />);
  await screen.findByRole('heading', {level: 1, name: 'Kestrelwood filings'});

  // loadEntities() auto-fills entityId to entities[0], so "Open dossier" is
  // already enabled without touching the entity <select>.
  await userEvent.setup().click(screen.getByRole('button', {name: 'Open dossier'}));
  await screen.findByText('Kestrelwood Holdings Ltd dossier');

  return api;
}

describe('Home entity dossier: identity history & property conflicts', () => {
  it("renders the dossier's identity/merge history", async () => {
    const api = await bootstrapAndOpenDossier(dossierFixture());

    expect(screen.getByText('Identity / merge history')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === ' · 1 merged alias(es) · 1 reporter identity decision(s)', {selector: 'small'}),
    ).toBeInTheDocument();
    expect(screen.getByText('Alias: Kestrelwood Holdings LLC', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('same: Kestrelwood Holdings LLC', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('Merge audit: ent-2 → ent-1', {exact: false})).toBeInTheDocument();

    // Opening the dossier asks for it, its duplicate candidates and its
    // post-merge reconciliation, once each.
    expect(api.calls(DOSSIER)).toHaveLength(1);
    expect(api.calls(DUPLICATES)).toHaveLength(1);
    expect(api.calls(RECONCILIATION)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('records a property-conflict decision with a rationale entered in the confirmation dialog', async () => {
    const api = await bootstrapAndOpenDossier(dossierFixture({property_conflicts: [propertyConflict()]}));
    const decision = 'POST /api/entities/ent-1/property-conflicts/incorporation_date/decisions';

    expect(screen.queryByText('No unresolved multi-value property conflicts detected.')).not.toBeInTheDocument();

    api.add({
      [decision]: {status: 204},
      // The dossier the reload finds carries the resolved conflict.
      [DOSSIER]: dossierFixture({
        property_conflicts: [
          propertyConflict({
            status: 'resolved',
            latest_decision: {id: 'pcd-1', decision: 'temporal_change', values: ['2015-03-01', '2016-07-14'], preferred_value: null, rationale: 'Confirmed via updated filing.', temporal_intervals: [], created_at: '2026-09-23T00:00:00Z'},
          }),
        ],
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Temporal change'}));

    const rationaleInput = await screen.findByRole('textbox', {name: 'Property conflict rationale'});
    await user.type(rationaleInput, 'Confirmed via updated filing.');
    await user.click(screen.getByRole('button', {name: 'Confirm'}));

    await screen.findByText('Reporter rationale: Confirmed via updated filing.', {exact: false});

    expect(api.calls(decision)).toHaveLength(1);
    expect(api.lastBody(decision)).toMatchObject({
      decision: 'temporal_change',
      values: ['2015-03-01', '2016-07-14'],
      rationale: 'Confirmed via updated filing.',
    });

    // The decision reloads the whole dossier: all three of its routes again.
    expect(api.calls(DOSSIER)).toHaveLength(2);
    expect(api.calls(DUPLICATES)).toHaveLength(2);
    expect(api.calls(RECONCILIATION)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('URL-encodes the property name and sends preferred_value for a "Prefer <value>" decision', async () => {
    const spacedConflict = propertyConflict({prop: 'registered address', values: [{value: '1 Main St', canonical: true, support_count: 1, conflict_count: 1, canonical_statements: [], external_assessments: []}, {value: '2 Main St', canonical: false, support_count: 1, conflict_count: 1, canonical_statements: [], external_assessments: []}]});
    const api = await bootstrapAndOpenDossier(dossierFixture({property_conflicts: [spacedConflict]}));
    // The route the stub matches is the encoded path the page must request.
    const decision = 'POST /api/entities/ent-1/property-conflicts/registered%20address/decisions';

    api.add({[decision]: {status: 204}});

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Prefer 1 Main St'}));

    const rationaleInput = await screen.findByRole('textbox', {name: 'Property conflict rationale'});
    await user.type(rationaleInput, 'Confirmed by the latest filing.');
    await user.click(screen.getByRole('button', {name: 'Confirm'}));

    await waitFor(() => expect(api.calls(decision)).toHaveLength(1));
    expect(api.lastUrl(decision).pathname).toBe('/api/entities/ent-1/property-conflicts/registered%20address/decisions');
    expect(api.lastBody(decision)).toMatchObject({
      decision: 'preferred',
      preferred_value: '1 Main St',
      values: ['1 Main St', '2 Main St'],
    });
    await waitFor(() => expect(api.calls(DOSSIER)).toHaveLength(2));
    expect(api.unmatched()).toEqual([]);
  });
});
