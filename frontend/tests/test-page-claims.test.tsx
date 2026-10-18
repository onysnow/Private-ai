// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 6: the "Claim verification workspace" flow on
// app/page.tsx. Like leads (cycle 4), every handler here needs `inv` set, so
// the fixture lets loadAppBootstrap() open the one investigation, which
// starts every per-investigation load (see test-support/page-routes.ts for
// the routes; replies are keyed by route, not by call order -- ADR-0005,
// line 15). The claims and evidence routes are seeded with one row each so
// createClaim/openClaim, saveClaimReview, and attachEvidenceToClaim are all
// reachable without a second bootstrap.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {pageRoutes, claimDoneFixture} from '../test-support/page-routes';

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
const CLAIMS = 'GET /api/investigations/inv-1/claims';
const WORKSPACE = 'GET /api/claims/claim-1/review-workspace';

// Replies carry the full shape the API declares (lib/generated/types.gen.ts):
// the panel's generated client checks each one.
function claimFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    investigation_id: 'inv-1',
    text: 'The contract was approved on March 3.',
    status: 'unverified',
    confidence: 0.4,
    created_at: '2026-10-01T00:00:00',
    ...overrides,
  };
}

function evidencePoolRow() {
  return {
    evidence: {id: 'ev-1', source_id: 'src-1', quote: 'Approved 3/3, signed by CFO.', locator: 'p.4', notes: null},
    source: {id: 'src-1', investigation_id: 'inv-1', title: 'Board minutes', url: null, source_type: 'document', metadata_json: {}, created_at: '2026-10-01T00:00:00'},
  };
}

function emptyWorkspace(claim: ReturnType<typeof claimFixture>) {
  return {
    claim,
    evidence: [],
    dependent_relationships: [],
    review_history: [],
    stance_counts: {supports: 0, contradicts: 0, context: 0}, done: claimDoneFixture(),
  };
}

async function bootstrapWithClaimAndEvidence(): Promise<MockApi> {
  const api = mockApi(pageRoutes({investigations: [investigation], claims: [claimFixture()], evidence: [evidencePoolRow()]}));

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('The contract was approved on March 3.');
  return api;
}

describe('Home claim verification workspace', () => {
  it('disables Add unverified claim until text is entered', async () => {
    await bootstrapWithClaimAndEvidence();
    expect(screen.getByRole('button', {name: 'Add unverified claim'})).toBeDisabled();
  });

  it('creates a claim, reloads the list, and opens its review workspace', async () => {
    const api = await bootstrapWithClaimAndEvidence();
    const created = claimFixture({id: 'claim-2', text: 'The vendor was paid twice.'});

    api.add({
      'POST /api/claims': created,
      [CLAIMS]: [claimFixture(), created], // the list the reload finds
      'GET /api/claims/claim-2/review-workspace': emptyWorkspace(created),
    });

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('Write a testable factual claim…'),
      'The vendor was paid twice.',
    );
    await user.click(screen.getByRole('button', {name: 'Add unverified claim'}));

    await screen.findByRole('heading', {name: 'The vendor was paid twice.', level: 4});
    expect(screen.getByText('No evidence is linked to this claim yet.')).toBeInTheDocument();

    expect(api.calls('POST /api/claims')).toHaveLength(1);
    expect(api.lastBody('POST /api/claims')).toMatchObject({
      investigation_id: 'inv-1',
      text: 'The vendor was paid twice.',
      status: 'unverified',
    });
    expect(api.calls(CLAIMS)).toHaveLength(2);
    expect(api.calls('GET /api/claims/claim-2/review-workspace')).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('requires a rationale before Record review is enabled, then saves the review', async () => {
    const api = await bootstrapWithClaimAndEvidence();

    api.add({[WORKSPACE]: emptyWorkspace(claimFixture())});
    await userEvent.setup().click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText("No canonical relationship currently depends on this claim's linked evidence.");
    expect(screen.getByRole('button', {name: 'Record review'})).toBeDisabled();

    const updated = claimFixture({status: 'confirmed', confidence: 0.9});
    const review = {id: 'rev-1', claim_id: 'claim-1', from_status: 'unverified', to_status: 'confirmed', from_confidence: 0.4, to_confidence: 0.9, rationale: 'Board minutes confirm the date directly.', created_at: '2026-10-02T00:00:00'};
    api.add({'POST /api/claims/claim-1/reviews': {claim: updated, review, workspace: {...emptyWorkspace(updated), review_history: [review]}}});

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('combobox').find(el => el.textContent === 'unverified')!);
    await user.click(await screen.findByRole('option', {name: 'confirmed'}));
    await user.type(
      screen.getByPlaceholderText('Required rationale for this review'),
      'Board minutes confirm the date directly.',
    );
    await user.click(screen.getByRole('button', {name: 'Record review'}));

    await screen.findByText('Recorded immutable review: confirmed at 90% confidence.');

    expect(api.calls('POST /api/claims/claim-1/reviews')).toHaveLength(1);
    expect(api.lastBody('POST /api/claims/claim-1/reviews')).toMatchObject({
      status: 'confirmed',
      rationale: 'Board minutes confirm the date directly.',
    });
    expect(api.unmatched()).toEqual([]);
  });

  it('attaches pool evidence to the open claim as supporting', async () => {
    const api = await bootstrapWithClaimAndEvidence();

    api.add({[WORKSPACE]: emptyWorkspace(claimFixture())});
    await userEvent.setup().click(screen.getByRole('button', {name: /The contract was approved/}));
    await screen.findByText('No evidence is linked to this claim yet.');

    api.add({
      'POST /api/claims/claim-1/evidence': {id: 'link-1', claim_id: 'claim-1', evidence_id: 'ev-1', stance: 'supports', note: null, created_at: '2026-10-02T00:00:00'},
      // The workspace, fetched again afterwards, now carries the link.
      [WORKSPACE]: {
        ...emptyWorkspace(claimFixture()),
        evidence: [
          {id: 'link-1', stance: 'supports', evidence: evidencePoolRow().evidence, source: evidencePoolRow().source, note: null, created_at: '2026-10-02T00:00:00'},
        ],
        stance_counts: {supports: 1, contradicts: 0, context: 0}, done: claimDoneFixture(),
      },
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Supports'}));

    await waitFor(() => expect(screen.getByText('Linked evidence as supports.')).toBeInTheDocument());
    expect(api.calls('POST /api/claims/claim-1/evidence')).toHaveLength(1);
    expect(api.lastBody('POST /api/claims/claim-1/evidence')).toMatchObject({
      evidence_id: 'ev-1',
      stance: 'supports',
    });
    expect(api.calls(WORKSPACE)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });
});
