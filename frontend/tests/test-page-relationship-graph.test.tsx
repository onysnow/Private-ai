// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 10: the "FollowTheMoney relationship graph"
// flow on app/page.tsx (createRelationship, the schema-filter checkboxes,
// openGraphEdge, attachEvidenceToRelationship, reviewRelationshipEvidence).
// Like cycles 4/6/7, these all need `inv` set, so an investigation is opened
// by loadAppBootstrap()'s auto-select, which starts every per-investigation
// load (test-support/page-routes.ts lists the routes; replies are keyed by
// route, not by call order -- ADR-0005, line 15). The entities and graph
// edges are the two records this section's tests actually vary.
//
// One thing this section's own loadEntities() does that no earlier cycle's
// target function did: whenever the loaded entities list doesn't already
// contain the current relSource/relTarget, it auto-fills them to
// entities[0]/entities[1] (see app/page.tsx's loadEntities). Seeding the
// entities route with two (or, for the disabled-guard test, one) canonical
// entities therefore pre-selects the relationship form's source/target
// selects without any user interaction -- no need to drive the <select>
// elements by hand.
//
// The <Graph> component now renders the vis-network <EntityGraph> (issue
// #39 wiring). vis-network needs a real canvas 2D context, which jsdom does
// not have, so <EntityGraph> is replaced below with a DOM stub that renders
// one button per node and edge and calls the same onNodeClick/onEdgeClick
// props -- matching the convention in tests/test-entity-graph.test.tsx of
// asserting what the page passes down rather than third-party rendering.
// Most tests still open edges through the always-visible `.relEdge` span in
// the relationshipList, which fires the exact same openGraphEdge handler.
// The list is awaited: the graph is read through the shared data cache now
// (features/relationship-graph), whose results reach the screen a tick
// after the case's name does.
//
// Also because of that same loadEntities() auto-fill, `entityId` is
// non-empty by the time attachEvidenceToRelationship/reviewRelationshipEvidence
// succeed, so their trailing `if(entityId)void loadDossier(entityId)`
// fire-and-forget call actually fires. No dossier route is configured here,
// so the stub answers it 404 and loadDossier's own try/catch reports that
// (a console error and a toast) -- it doesn't affect any assertion below,
// and api.unmatched() is deliberately not checked in those two tests.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {emptyGraph, entityFixture, pageRoutes, relationshipFixture} from '../test-support/page-routes';

const {sankeySpy} = vi.hoisted(() => ({sankeySpy: vi.fn()}));
vi.mock('../components/charts/financial-flow-sankey', () => ({
  FinancialFlowSankey: (props: Record<string, unknown>) => {
    sankeySpy(props);
    return <div data-testid="sankey-stub" />;
  },
}));

vi.mock('../components/entity-graph', () => ({
  EntityGraph: ({nodes, edges, onNodeClick, onEdgeClick}: {
    nodes: Array<{id: string; label: string; schema?: string}>;
    edges: Array<{id: string; from: string; to: string; label?: string}>;
    onNodeClick?: (id: string) => void;
    onEdgeClick?: (id: string) => void;
  }) => (
    <div data-testid="entity-graph-stub">
      {nodes.map(n => <button key={n.id} type="button" data-testid={`graph-node-${n.id}`} onClick={() => onNodeClick?.(n.id)}>{`${n.label} (${n.schema ?? ''})`}</button>)}
      {edges.map(e => <button key={e.id} type="button" data-testid={`graph-edge-${e.id}`} onClick={() => onEdgeClick?.(e.id)}>{`${e.from}->${e.to}:${e.label ?? ''}`}</button>)}
    </div>
  ),
}));

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

const entityA = entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company');
const entityB = entityFixture('ent-2', 'Jane Doe', 'Person');

const ENTITIES = 'GET /api/investigations/inv-1/entities';
const GRAPH = 'GET /api/investigations/inv-1/graph';
const RELATIONSHIPS = 'POST /api/relationships';
const EVIDENCE_REVIEWS = 'GET /api/relationships/rel-1/evidence-reviews';

// The evidence pool is read through the generated client now, which checks
// the reply's full shape (lib/generated/types.gen.ts).
function evidencePoolRow() {
  return {
    evidence: {id: 'ev-1', source_id: 'src-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', notes: null},
    source: {id: 'src-1', investigation_id: 'inv-1', title: 'Board minutes', url: null, source_type: 'document', metadata_json: {}, created_at: '2026-10-01T00:00:00'},
  };
}

async function bootstrap(
  entities: unknown[],
  edges: unknown[] = [],
  evidence: unknown[] = [],
): Promise<MockApi> {
  const api = mockApi(pageRoutes({investigations: [investigation], entities, graph: emptyGraph(edges), evidence}));

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');
  return api;
}

describe('Home FollowTheMoney relationship graph', () => {
  it('pre-selects source/target from the loaded entities and creates a relationship', async () => {
    const api = await bootstrap([entityA, entityB]);

    // loadEntities() auto-fills relSource/relTarget to entities[0]/[1] when
    // neither is already in the list -- no <select> interaction needed, and
    // the "Add relationship" button should already be enabled.
    const addButton = await screen.findByRole('button', {name: 'Add relationship'});
    expect(addButton).not.toBeDisabled();

    api.add({
      [RELATIONSHIPS]: relationshipFixture(),
      [GRAPH]: emptyGraph([relationshipFixture()]), // the graph the reload finds
    });

    await userEvent.setup().click(addButton);

    // createRelationship() doesn't open the edge detail panel (that's
    // openGraphEdge's job, tested separately below) -- it just reloads the
    // relationships list and entities, so the new edge's endpoints show up
    // as separate .relNode buttons in the relationshipList row.
    await screen.findByRole('button', {name: 'Kestrelwood Holdings Ltd'});
    expect(screen.getByRole('button', {name: 'Jane Doe'})).toBeInTheDocument();
    expect(screen.queryByText('No canonical relationships yet.')).not.toBeInTheDocument();

    expect(api.calls(RELATIONSHIPS)).toHaveLength(1);
    expect(api.lastBody(RELATIONSHIPS)).toMatchObject({
      investigation_id: 'inv-1',
      schema: 'Ownership',
      source_entity_id: 'ent-1',
      target_entity_id: 'ent-2',
      properties: {},
      dataset: 'reporter',
      evidence_id: null,
    });
    expect(api.calls(GRAPH)).toHaveLength(2);
    expect(api.calls(ENTITIES)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('disables Add relationship when only one entity exists (source and target fall back to the same one)', async () => {
    await bootstrap([entityA]);

    expect(await screen.findByRole('button', {name: 'Add relationship'})).toBeDisabled();
  });

  it("opens a relationship edge and loads its evidence review history", async () => {
    const api = await bootstrap([entityA, entityB], [relationshipFixture()]);

    api.add({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}});

    await userEvent.setup().click(await screen.findByText('Ownership', {selector: '.relEdge'}));

    await screen.findByText('Kestrelwood Holdings Ltd → Jane Doe');
    // The base fixture has no evidence attachments yet, so the
    // assessment-history block (gated on evidence_attachments.length>0)
    // doesn't render at all -- what should render unconditionally for a
    // non-duplicate edge is the "attach evidence" form.
    expect(screen.getByText('Attach exact evidence')).toBeInTheDocument();

    expect(api.calls(EVIDENCE_REVIEWS)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('attaches evidence from the investigation pool to an opened relationship', async () => {
    const api = await bootstrap([entityA, entityB], [relationshipFixture()], [evidencePoolRow()]);
    const attach = 'POST /api/relationships/rel-1/evidence';

    api.add({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}});
    await userEvent.setup().click(await screen.findByText('Ownership', {selector: '.relEdge'}));
    await screen.findByText('Attach exact evidence');

    const attachButton = screen.getByRole('button', {name: 'Attach evidence'});
    expect(attachButton).toBeDisabled();

    const user = userEvent.setup();
    // Opened via focus + ArrowDown rather than a click on the trigger: this
    // file's earlier test also renders and interacts with this page, and a
    // plain userEvent.click(trigger) here reliably fails to register the
    // opening pointerdown when run after it (passes standalone) -- the same
    // cross-test userEvent pointer-state issue documented for the
    // reasoning-module select's test file. See MIGRATION_NOTES.md.
    const attachTrigger = screen.getAllByRole('combobox').find(el => el.textContent === 'Choose investigation evidence…')!;
    attachTrigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Board minutes: p.4'}));
    expect(attachButton).not.toBeDisabled();

    const attached = relationshipFixture({
      provenance: {
        statement_count: 0,
        sources: [],
        evidence_review_history: [],
        evidence_attachments: [
          {
            attachment_id: 'att-1',
            attached_by: 'reporter',
            note: null,
            created_at: '2026-09-01T00:00:00Z',
            evidence: {id: 'ev-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', source: {id: 'src-1', title: 'Board minutes'}},
            latest_review: null,
          },
        ],
      },
    });
    api.add({[attach]: attached});

    await user.click(attachButton);

    await screen.findByText('Evidence attached. Review its support state below.');
    // The quote renders alongside a "Exact evidence:" <b> label in the same
    // div, so its own text node isn't the element's whole textContent --
    // match on substring instead of the full leaf text.
    expect(screen.getByText('Approved 3/3, signed by CFO.', {exact: false})).toBeInTheDocument();

    expect(api.calls(attach)).toHaveLength(1);
    expect(api.lastBody(attach)).toMatchObject({evidence_id: 'ev-1', note: null});
  });

  it('requires a rationale before recording a relationship-evidence assessment', async () => {
    const attachedFixture = relationshipFixture({
      provenance: {
        statement_count: 0,
        sources: [],
        evidence_review_history: [],
        evidence_attachments: [
          {
            attachment_id: 'att-1',
            attached_by: 'reporter',
            note: null,
            created_at: '2026-09-01T00:00:00Z',
            evidence: {id: 'ev-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', source: {id: 'src-1', title: 'Board minutes'}},
            latest_review: null,
          },
        ],
      },
    });
    const api = await bootstrap([entityA, entityB], [attachedFixture], [evidencePoolRow()]);
    const review = 'POST /api/relationships/rel-1/evidence/ev-1/reviews';

    api.add({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}});
    await userEvent.setup().click(await screen.findByText('Ownership', {selector: '.relEdge'}));
    await screen.findByText('Approved 3/3, signed by CFO.', {exact: false});

    const supportsButton = screen.getByRole('button', {name: 'Supports'});
    expect(supportsButton).toBeDisabled();

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Required rationale before recording an evidence assessment'),
      'Board minutes directly confirm the ownership stake.',
    );
    expect(supportsButton).not.toBeDisabled();

    api.add({
      [review]: attachedFixture,
      // The history the reload finds now holds the assessment.
      [EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: [{id: 'rev-1', relationship_edge_id: 'rel-1', evidence_id: 'ev-1', stance: 'supports', rationale: 'Board minutes directly confirm the ownership stake.', created_at: '2026-09-23T00:00:00Z'}]},
    });

    await user.click(supportsButton);

    await screen.findByText('Recorded supports assessment. Canonical relationship preserved.');
    expect(screen.getByText('Board minutes directly confirm the ownership stake.', {selector: 'div'})).toBeInTheDocument();

    expect(api.calls(review)).toHaveLength(1);
    expect(api.lastBody(review)).toMatchObject({
      stance: 'supports',
      rationale: 'Board minutes directly confirm the ownership stake.',
    });
    expect(api.calls(EVIDENCE_REVIEWS)).toHaveLength(2);
  });

  it('passes the shown relationships to the entity graph and opens an edge from it', async () => {
    const api = await bootstrap([entityA, entityB], [relationshipFixture()]);

    expect(await screen.findByTestId('graph-node-ent-1')).toHaveTextContent('Kestrelwood Holdings Ltd (Company)');
    expect(screen.getByTestId('graph-node-ent-2')).toHaveTextContent('Jane Doe (Person)');
    expect(screen.getByTestId('graph-edge-rel-1')).toHaveTextContent('ent-1->ent-2:Ownership');

    api.add({[EVIDENCE_REVIEWS]: {relationship_id: 'rel-1', reviews: []}});
    await userEvent.setup().click(screen.getByTestId('graph-edge-rel-1'));

    await screen.findByText('Kestrelwood Holdings Ltd → Jane Doe');
    expect(api.calls(EVIDENCE_REVIEWS)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('creates an entity from the manual entity form and reloads entities', async () => {
    const api = await bootstrap([entityA, entityB]);
    const created = entityFixture('ent-3', 'Harbor Trust', 'Company');
    api.add({
      'POST /api/entities': created,
      [ENTITIES]: [entityA, entityB, created], // the list the reload finds
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Add an entity manually'));
    await user.type(await screen.findByLabelText('Caption'), 'Harbor Trust');
    await user.type(screen.getByLabelText('FollowTheMoney schema'), 'Company');
    await user.click(screen.getByRole('button', {name: /create entity/i}));

    await waitFor(() => expect(api.calls(ENTITIES)).toHaveLength(2));
    expect(api.calls('POST /api/entities')).toHaveLength(1);
    expect(api.lastBody('POST /api/entities')).toEqual({
      investigation_id: 'inv-1', schema: 'Company', caption: 'Harbor Trust', properties: {},
    });
    expect(api.unmatched()).toEqual([]);
  });

  it('creates a Payment relationship with amount, currency, date and purpose', async () => {
    const api = await bootstrap([entityA, entityB]);
    api.add({[RELATIONSHIPS]: relationshipFixture({id: 'rel-2', schema: 'Payment'})});

    const user = userEvent.setup();
    // Opened via focus + ArrowDown rather than a click on the trigger: this
    // file's tests each render the same page sharing one jsdom document,
    // and a plain click on a Select trigger has twice now (converting
    // relationshipEvidenceAttachId and the reasoning-module select)
    // reliably failed to open when run after earlier tests in the file --
    // see MIGRATION_NOTES.md. Using the same workaround directly here
    // rather than risk rediscovering it.
    const relSchemaTrigger = screen.getAllByRole('combobox').find(el => el.textContent === 'Ownership')!;
    relSchemaTrigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Payment'}));
    await user.type(screen.getByLabelText('Payment amount'), '1250.50');
    await user.type(screen.getByLabelText('Payment currency'), 'USD');
    await user.type(screen.getByLabelText('Payment date'), '2024-03-02');
    await user.type(screen.getByLabelText('Payment purpose'), 'consulting');
    await user.click(screen.getByRole('button', {name: 'Add relationship'}));

    // Saving reloads the graph and the entities.
    await waitFor(() => {
      expect(api.calls(GRAPH)).toHaveLength(2);
      expect(api.calls(ENTITIES)).toHaveLength(2);
    });
    expect(api.calls(RELATIONSHIPS)).toHaveLength(1);
    expect(api.lastBody(RELATIONSHIPS)).toMatchObject({
      schema: 'Payment',
      properties: {amount: ['1250.50'], currency: ['USD'], date: ['2024-03-02'], purpose: ['consulting']},
    });
    expect(api.unmatched()).toEqual([]);
  });

  it('loads the money-flow ledger on demand and charts complete payments only', async () => {
    const api = await bootstrap([entityA, entityB]);
    const ledger = 'GET /api/investigations/inv-1/financial-flows';
    const row = {
      id: 'rel-9', relationship_id: 'rel-9', dateTime: '2024-03-02', from: 'Kestrelwood Holdings Ltd', to: 'Jane Doe',
      from_entity_id: 'ent-1', to_entity_id: 'ent-2', amount: 1250.5, currency: 'USD', statedPurpose: 'consulting',
      transactionNumber: null, evidence: 'p.2 [supports]', evidence_count: 1, supporting_evidence_count: 1,
      status: 'no_claim_dependency', flowType: 'direct',
    };
    api.add({
      [ledger]: {
        investigation_id: 'inv-1', transactions: [row],
        incomplete: [{...row, id: 'rel-10', relationship_id: 'rel-10', amount: null, flowType: 'inferred', problems: ['amount missing']}],
        currencies: ['USD'], flow_type_rule: 'direct = supporting reviewed evidence', duplicate_rule: 'reviewed duplicates once',
      },
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load money flows'}));

    const panel = await screen.findByTestId('money-flows');
    expect(api.calls(ledger)).toHaveLength(1);
    expect(panel).toHaveTextContent('1,250.5 USD');
    expect(panel).toHaveTextContent('p.2 [supports]');
    expect(panel).toHaveTextContent('Not charted (1)');
    expect(panel).toHaveTextContent('amount missing');
    await screen.findByTestId('sankey-stub');
    const props = sankeySpy.mock.calls.at(-1)?.[0] as {transactions: Array<{id: string; amount: number; flowType: string}>};
    expect(props.transactions).toEqual([expect.objectContaining({id: 'rel-9', amount: 1250.5, currency: 'USD', flowType: 'direct'})]);
    expect(screen.getByRole('button', {name: 'Reload money flows'})).toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });
});
