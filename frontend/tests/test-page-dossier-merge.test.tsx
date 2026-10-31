// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 12 (second entity-dossier sub-cycle): the
// dossier's canonical-duplicate merge workflow (decideCanonicalDuplicate,
// previewCanonicalMerge, executeCanonicalMerge) and post-merge
// reconciliation (decideReconciliation). See cycle 11's docstring for why
// the dossier is split across multiple cycles, and cycle 10's finding
// about loadEntities() auto-filling entityId (used here the same way to
// reach "Open dossier" with no <select> interaction). The stub answers by
// route (test-support/page-routes.ts lists what opening a case requests;
// each dossier adds its own three routes), not by call order -- ADR-0005,
// line 15.
//
// Each test below keeps only the fixture data relevant to what it's
// exercising: a duplicate-candidate test carries an empty reconciliation
// (0 pairs, so that panel doesn't render), and the reconciliation test
// carries an empty duplicateCandidates list -- both panels have their own
// "Unsure" button, so keeping them mutually exclusive per test avoids an
// ambiguous query rather than needing extra disambiguation.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {dossierFixture as baseDossier, dossierRoutes, emptyReconciliation, entityFixture, pageRoutes} from '../test-support/page-routes';

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

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};
const entityA = entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company');
const entityB = entityFixture('ent-2', 'Kestrelwood Holdings LLC', 'Company');

const ENTITIES = 'GET /api/investigations/inv-1/entities';
const dossierRoute = (entityId: string) => `GET /api/entities/${entityId}/dossier`;
const duplicatesRoute = (entityId: string) => `GET /api/entities/${entityId}/duplicate-candidates`;
const reconciliationRoute = (entityId: string) => `GET /api/entities/${entityId}/post-merge-reconciliation`;

function dossierFixture(entity: ReturnType<typeof entityFixture>, overrides: Record<string, unknown> = {}) {
  return baseDossier(entity, {summary: {...baseDossier(entity).summary, statement_count: 5}, ...overrides});
}

function duplicateCandidate(overrides: Record<string, unknown> = {}) {
  return {
    entity_id: 'ent-2',
    caption: 'Kestrelwood Holdings LLC',
    schema: 'Company',
    score: 0.87,
    latest_decision: null,
    ...overrides,
  };
}

const sameDecision = {id: 'dec-1', decision: 'same', confidence: 0.9, rationale: null, created_at: '2026-09-23T00:00:00'};

async function bootstrapAndOpenDossier(
  dossier: unknown,
  duplicates: unknown[],
  reconciliation: unknown,
): Promise<MockApi> {
  const api = mockApi({
    ...pageRoutes({investigations: [investigation], entities: [entityA, entityB]}),
    ...dossierRoutes('ent-1', dossier, duplicates, reconciliation),
  });

  const Home = await importHome();
  render(<Home />);
  await screen.findByRole('heading', {level: 1, name: 'Kestrelwood filings'});

  // loadEntities() auto-fills entityId to entities[0].
  await userEvent.setup().click(await screen.findByRole('button', {name: 'Open dossier'}));
  await screen.findByText('Kestrelwood Holdings Ltd dossier');

  return api;
}

describe('Home entity dossier: canonical duplicates & merge', () => {
  it('records a "same entity" duplicate decision and reloads the dossier', async () => {
    const api = await bootstrapAndOpenDossier(dossierFixture(entityA), [duplicateCandidate()], emptyReconciliation());
    const decision = 'POST /api/entities/ent-1/canonical-resolution';

    await screen.findByText('Same party?');
    expect(screen.getByRole('button', {name: 'Preview merge into this record'})).toBeDisabled();

    api.add({
      [decision]: {id: 'dec-1', investigation_id: 'inv-1', entity_a_id: 'ent-1', entity_b_id: 'ent-2', decision: 'same', confidence: 0.9, rationale: 'Reporter-reviewed canonical duplicate decision', created_at: '2026-09-23T00:00:00'},
      // The duplicate list the reload finds carries the decision.
      [duplicatesRoute('ent-1')]: [duplicateCandidate({latest_decision: sameDecision})],
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Same entity'}));

    // The latest review is a mark; its words are on hover.
    await screen.findByText('Latest review: same · 90%');
    expect(screen.getByRole('button', {name: 'Preview merge into this record'})).not.toBeDisabled();

    expect(api.calls(decision)).toHaveLength(1);
    expect(api.lastBody(decision)).toMatchObject({
      other_entity_id: 'ent-2',
      decision: 'same',
      confidence: 0.9,
    });
    // The decision reloads the whole dossier: all three of its routes again.
    expect(api.calls(dossierRoute('ent-1'))).toHaveLength(2);
    expect(api.calls(duplicatesRoute('ent-1'))).toHaveLength(2);
    expect(api.calls(reconciliationRoute('ent-1'))).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('previews a canonical merge once the duplicate is marked "same" and executes it', async () => {
    const api = await bootstrapAndOpenDossier(
      dossierFixture(entityA),
      [duplicateCandidate({latest_decision: sameDecision})],
      emptyReconciliation(),
    );
    const preview = 'GET /api/entities/ent-1/merge-preview';
    const merge = 'POST /api/entities/ent-1/merge';

    const previewButton = await screen.findByRole('button', {name: 'Preview merge into this record'});
    expect(previewButton).not.toBeDisabled();

    api.add({
      [preview]: {
        source: {id: 'ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company'},
        target: {id: 'ent-2', caption: 'Kestrelwood Holdings LLC', schema: 'Company'},
        references: {},
        total_references: 12,
        blockers: [],
        can_execute: true,
        preview_digest: 'digest-abc',
      },
    });

    await userEvent.setup().click(previewButton);

    await screen.findByText('12 reference(s) would move · 0 blocker(s)');
    const executeButton = screen.getByRole('button', {name: 'Execute previewed merge'});
    expect(executeButton).not.toBeDisabled();

    expect(api.calls(preview)).toHaveLength(1);
    expect(api.lastUrl(preview).searchParams.get('target_entity_id')).toBe('ent-2');

    // After the merge the page reloads the entities and opens the surviving
    // record's dossier.
    api.add({
      [merge]: {
        audit: {id: 'merge-1', investigation_id: 'inv-1', source_entity_id: 'ent-1', target_entity_id: 'ent-2', resolution_decision_id: 'dec-1', preview_digest: 'digest-abc', preview_json: {}, moved_counts_json: {statements: 5}, rationale: 'Reporter executed previewed canonical merge.', created_at: '2026-09-23T00:00:00'},
        source_entity_id: 'ent-1', target_entity_id: 'ent-2',
      },
      ...dossierRoutes('ent-2', dossierFixture(entityB), [], emptyReconciliation('ent-2')),
    });

    await userEvent.setup().click(executeButton);

    await screen.findByText('Kestrelwood Holdings LLC dossier');

    expect(api.calls(merge)).toHaveLength(1);
    expect(api.lastBody(merge)).toMatchObject({
      target_entity_id: 'ent-2',
      preview_digest: 'digest-abc',
    });
    expect(api.calls(ENTITIES)).toHaveLength(2); // bootstrap, then the reload
    expect(api.calls(dossierRoute('ent-2'))).toHaveLength(1);
    expect(api.calls(duplicatesRoute('ent-2'))).toHaveLength(1);
    expect(api.calls(reconciliationRoute('ent-2'))).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('records a post-merge reconciliation decision on a duplicate statement pair', async () => {
    const statementPair = {
      record_type: 'statement',
      same_assertion: true,
      provenance_differs: false,
      latest_decision: null,
      record_a: {id: 'st-1', prop: 'name', value: 'Kestrelwood Holdings', dataset: 'aleph'},
      record_b: {id: 'st-2', prop: 'name', value: 'Kestrelwood Holdings Ltd', dataset: 'reporter'},
    };
    const reconciliationWithPair = {
      entity_id: 'ent-1',
      statement_duplicates: [statementPair],
      relationship_duplicates: [],
      summary: {statement_pairs: 1, relationship_pairs: 0, unresolved_pairs: 1},
    };
    const api = await bootstrapAndOpenDossier(dossierFixture(entityA), [], reconciliationWithPair);
    const decision = 'POST /api/entities/ent-1/post-merge-reconciliation';

    await screen.findByText('Repeated after the merge', {exact: false});
    expect(screen.getByText('1 statement pair(s) · 0 relationship pair(s) · 1 unresolved')).toBeInTheDocument();

    const recorded = {id: 'rd-1', investigation_id: 'inv-1', entity_id: 'ent-1', record_type: 'statement', record_a_id: 'st-1', record_b_id: 'st-2', decision: 'duplicate', rationale: null, preferred_record_id: 'st-1', created_at: '2026-09-23T00:00:00'};
    api.add({
      [decision]: recorded,
      // What the reload finds: the pair now decided.
      [reconciliationRoute('ent-1')]: {
        ...reconciliationWithPair,
        statement_duplicates: [{...statementPair, latest_decision: recorded}],
        summary: {statement_pairs: 1, relationship_pairs: 0, unresolved_pairs: 0},
      },
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Duplicate · prefer first'}));

    await screen.findByText('1 statement pair(s) · 0 relationship pair(s) · 0 unresolved');

    expect(api.calls(decision)).toHaveLength(1);
    expect(api.lastBody(decision)).toMatchObject({
      record_type: 'statement',
      record_a_id: 'st-1',
      record_b_id: 'st-2',
      decision: 'duplicate',
      preferred_record_id: 'st-1',
    });
    // Only the reconciliation is reloaded, not the whole dossier.
    expect(api.calls(reconciliationRoute('ent-1'))).toHaveLength(2);
    expect(api.calls(dossierRoute('ent-1'))).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });
});
