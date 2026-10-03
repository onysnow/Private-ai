// @vitest-environment jsdom
// "Is this name already a record?" beside a name awaiting review
// (features/documents/entity-identity.tsx): the investigation's own close
// matches and OpenAleph's /match results, a same/new choice that the review
// request carries, and Accept held while the server sees a strong match.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {EntityIdentity, identityFields, sameAsOptions} from '../features/documents/entity-identity';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const LOCAL = 'GET /api/extraction-candidates/cand-1/entity-matches';
const REMOTE = 'GET /api/extraction-candidates/cand-1/openaleph-matches';

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const record = (entity_id: string, caption: string, score: number, schema = 'Company') => ({entity_id, caption, schema, score});
const localReply = (matches: ReturnType<typeof record>[], strong: ReturnType<typeof record> | null = null) => ({
  candidate_id: 'cand-1', caption: 'Meridian Holdings Ltd', schema: 'Company', matches, strong_match: strong,
  provider_lead: {provider: null, provider_entity_id: null, provider_resolved_entity_id: null}, identity_rule: 'Reporter decides.'});
const hit = (openaleph_id: string, caption: string, overrides: Record<string, unknown> = {}) => ({
  openaleph_id, caption, schema: 'Company', properties: {name: [caption]}, score: 12.5, collection_id: '50', collection_label: 'UK companies register',
  investigation_id: null, in_this_investigation: false, workbench_entity_id: null, url: `http://openaleph-ui.test/entities/${openaleph_id}`, ...overrides});
const remoteReply = (results: ReturnType<typeof hit>[], overrides: Record<string, unknown> = {}) => ({
  candidate_id: 'cand-1', schema: 'Company', state: 'ok', detail: null, hidden: 0, results, ...overrides});

function show(onAccept = vi.fn(), schemaBlocked = false) {
  wrap(<EntityIdentity candidateId="cand-1" caption="Meridian Holdings Ltd" schemaBlocked={schemaBlocked} onAccept={onAccept} onReject={vi.fn()}/>);
  return {onAccept, user: userEvent.setup()};
}

describe('EntityIdentity', () => {
  it('holds Accept on a strong match until the reporter says same or new, and sends the answer', async () => {
    const strong = record('ent-1', 'Meridian Holdings Ltd', 1);
    const api = mockApi({[LOCAL]: localReply([strong, record('ent-2', 'Meridian Shipping', 0.2)], strong), [REMOTE]: remoteReply([])});
    const {onAccept, user} = show();

    const group = within(await screen.findByRole('group', {name: 'Is "Meridian Holdings Ltd" already a record?'}));
    expect(screen.getByText(/closely matches "Meridian Holdings Ltd": say whether it is the same/)).toBeInTheDocument();
    // Only records sharing most of their words are offered.
    expect(group.getAllByRole('button').map(b => b.textContent)).toEqual([
      'Same as "Meridian Holdings Ltd" (Company)', 'A new record, not "Meridian Holdings Ltd"']);
    const accept = screen.getByRole('button', {name: 'Accept'});
    expect(accept).toBeDisabled();

    await user.click(group.getByRole('button', {name: 'Same as "Meridian Holdings Ltd" (Company)'}));
    expect(accept).toBeEnabled();
    await user.click(accept);
    expect(onAccept).toHaveBeenLastCalledWith({entity_identity_decision: 'same', matched_entity_id: 'ent-1'});

    await user.click(group.getByRole('button', {name: 'A new record, not "Meridian Holdings Ltd"'}));
    await user.click(accept);
    expect(onAccept).toHaveBeenLastCalledWith({entity_identity_decision: 'different', matched_entity_id: 'ent-1'});
    expect(api.unmatched()).toEqual([]);
  });

  it('offers a record OpenAleph matched in this investigation, and lists the rest to follow up', async () => {
    mockApi({
      [LOCAL]: localReply([]),
      [REMOTE]: remoteReply([
        hit('ours.sig', 'MHL (UK)', {collection_id: '3', collection_label: 'Harbour contracts', investigation_id: 'inv-1', in_this_investigation: true, workbench_entity_id: 'ent-9'}),
        hit('public.sig', 'MERIDIAN HOLDINGS LTD'),
      ], {hidden: 2}),
    });
    const {onAccept, user} = show();

    await user.click(await screen.findByRole('button', {name: 'Same as "MHL (UK)" (Company)'}));
    expect(screen.getByRole('button', {name: 'Same as "MHL (UK)" (Company)'})).toHaveAttribute('title', 'OpenAleph matched it');
    const elsewhere = within(screen.getByRole('list', {name: 'Also in OpenAleph'}));
    expect(elsewhere.getByRole('link', {name: 'MERIDIAN HOLDINGS LTD'})).toHaveAttribute('href', 'http://openaleph-ui.test/entities/public.sig');
    expect(elsewhere.getByText(/UK companies register/)).toBeInTheDocument();
    expect(screen.getByText('2 more in investigations you cannot open.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Accept'}));
    expect(onAccept).toHaveBeenLastCalledWith({entity_identity_decision: 'same', matched_entity_id: 'ent-9'});
  });

  it('accepts a name with no close record as a new one, and says when OpenAleph cannot be asked', async () => {
    mockApi({[LOCAL]: localReply([]), [REMOTE]: remoteReply([], {state: 'unavailable', detail: 'OpenAleph could not be asked (ConnectError).'})});
    const {onAccept, user} = show();
    expect(await screen.findByText('OpenAleph could not be asked (ConnectError).')).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Accept'}));
    expect(onAccept).toHaveBeenLastCalledWith({});
  });

  it('keeps Accept held while the kind of entity is unanswered', async () => {
    mockApi({[LOCAL]: localReply([]), [REMOTE]: remoteReply([])});
    show(vi.fn(), true);
    await screen.findByText(/Asking OpenAleph|Accept/);
    expect(screen.getByRole('button', {name: 'Accept'})).toBeDisabled();
  });
});

describe('identity helpers', () => {
  it('turns a choice into the review fields', () => {
    expect(identityFields({kind: 'same', entityId: 'e1'}, 'e2')).toEqual({entity_identity_decision: 'same', matched_entity_id: 'e1'});
    expect(identityFields({kind: 'new'}, 'e2')).toEqual({entity_identity_decision: 'different', matched_entity_id: 'e2'});
    expect(identityFields({kind: 'new'}, null)).toEqual({});
    expect(identityFields(undefined, null)).toEqual({});
  });

  it('merges a record found both ways into one option', () => {
    const options = sameAsOptions([record('e1', 'Meridian Holdings Ltd', 0.95)],
      [hit('ours.sig', 'Meridian Holdings Ltd', {workbench_entity_id: 'e1', in_this_investigation: true})] as never, 'e1');
    expect(options).toEqual([{entityId: 'e1', caption: 'Meridian Holdings Ltd', schema: 'Company', why: 'strong name match; OpenAleph also matched it'}]);
  });
});
