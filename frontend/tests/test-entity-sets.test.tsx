// @vitest-environment jsdom
// Diagrams, timelines and lists in OpenAleph (features/corpus/entity-sets.tsx;
// backend app/services/openaleph_entitysets.py).
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {EntitySets, sentSummary} from '../features/corpus/entity-sets';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const SETS = 'GET /api/investigations/inv-1/corpus/entity-sets';
const SEND = 'POST /api/investigations/inv-1/corpus/entity-sets';
const ENTITIES = 'GET /api/investigations/inv-1/entities';
const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const set = (kind: string, label: string, overrides: Record<string, unknown> = {}) => ({
  id: `row-${kind}`, kind, label, openaleph_entityset_id: `set-${kind}`, url: `http://openaleph-ui.test/${kind}s/set-${kind}`,
  items: 3, created_by: null, created_at: '2026-10-03T09:00:00', sent_at: '2026-10-03T09:00:00', ...overrides});
const entity = (id: string, caption: string, schema = 'Company') => ({
  id, investigation_id: 'inv-1', ftm_id: `ftm-${id}`, schema, caption, properties: {}, merged_into_entity_id: null, created_at: '2026-10-03T08:00:00'});

describe('EntitySets', () => {
  it('sends the diagram and lists what was sent with its link', async () => {
    let sent: unknown[] = [];
    const api = mockApi({
      [SETS]: () => sent,
      [SEND]: () => {
        sent = [set('diagram', 'Harbour contracts: relationships')];
        return {entityset: sent[0], added: 3, removed: 0, waiting_for_sync: 1};
      },
    });
    wrap(<EntitySets investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Send the relationships as a diagram'}));
    expect(await screen.findByText('Diagram “Harbour contracts: relationships” is in OpenAleph: 3 added. 1 record(s) wait for the next sync and will show once it has run and this is sent again.')).toBeInTheDocument();
    expect(api.lastBody(SEND)).toEqual({kind: 'diagram'});
    const link = await within(await screen.findByRole('list', {name: 'Sent to OpenAleph'})).findByRole('link', {name: 'Diagram: Harbour contracts: relationships'});
    expect(link).toHaveAttribute('href', 'http://openaleph-ui.test/diagrams/set-diagram');
  });

  it('makes a list of the chosen entities', async () => {
    const api = mockApi({
      [SETS]: [], [ENTITIES]: [entity('e1', 'Meridian Holdings Ltd'), entity('e2', 'Jane Doe', 'Person'), entity('e3', 'Bellcastle')],
      [SEND]: {entityset: set('list', 'People to call', {items: 1}), added: 1, removed: 0, waiting_for_sync: 0},
    });
    wrap(<EntitySets investigationId="inv-1"/>);
    const user = userEvent.setup();
    expect(api.calls(ENTITIES)).toHaveLength(0);      // loaded only when a list is made
    await user.click(await screen.findByRole('button', {name: 'Make a list…'}));
    await user.type(screen.getByLabelText('List name'), 'People to call');
    await user.type(screen.getByLabelText('Find an entity'), 'jane');
    const choices = within(await screen.findByRole('list', {name: 'Entities for the list'}));
    await user.click(await choices.findByRole('checkbox'));
    expect(choices.queryByText('Meridian Holdings Ltd')).toBeNull();
    await user.click(screen.getByRole('button', {name: 'Send the list (1)'}));
    expect(await screen.findByText('List “People to call” is in OpenAleph: 1 added.')).toBeInTheDocument();
    expect(api.lastBody(SEND)).toEqual({kind: 'list', label: 'People to call', entity_ids: ['e2']});
    expect(api.lastUrl(ENTITIES).searchParams.get('limit')).toBe('500');
  });

  it('shows a refusal in the server’s words', async () => {
    mockApi({[SETS]: [], [SEND]: {status: 409, body: {detail: 'Nothing of this investigation is in OpenAleph yet; sync it first'}}});
    wrap(<EntitySets investigationId="inv-1"/>);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Send the dated records as a timeline'}));
    expect(await screen.findByText(/^Nothing of this investigation is in OpenAleph yet; sync it first/)).toBeInTheDocument();
  });

  it('says when nothing changed', () => {
    expect(sentSummary({entityset: set('timeline', 'T') as never, added: 0, removed: 2, waiting_for_sync: 0}))
      .toBe('Timeline “T” is in OpenAleph: 2 taken out.');
    expect(sentSummary({entityset: set('timeline', 'T') as never, added: 0, removed: 0, waiting_for_sync: 0}))
      .toBe('Timeline “T” is in OpenAleph: nothing changed.');
  });
});
