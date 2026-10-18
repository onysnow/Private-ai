// @vitest-environment jsdom
// The redesigned search (features/search/search-panel.tsx): facets narrow the
// search, a chosen result can be tagged, noted and collected in the side panel
// (features/marks/marks-panel.tsx), and arrows move the choice.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SearchPanel} from '../features/search/search-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {corpusSearchBody, tagsBody} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const party = {
  type: 'entity', group: 'canonical', id: 'ent-1', investigation_id: 'inv-1', title: 'Jane Quarry', snippet: 'name Jane Quarry',
  score: 9, provenance: {trace_record_type: 'entity', trace_record_id: 'ent-1'}, metadata: {schema: 'Person'},
  kind: 'party', record_type: 'entity', parties: [{id: 'ent-1', name: 'Jane Quarry', schema: 'Person'}], sure: null, date: null,
  matched_fields: ['name'], tags: [], note_count: 0,
};
const claim = {
  type: 'claim', group: 'reporting', id: 'c-1', investigation_id: 'inv-1', title: 'Claim', snippet: 'Jane Quarry controls Quarry Holdings.',
  score: 5, provenance: {trace_record_type: 'claim', trace_record_id: 'c-1'}, metadata: {status: 'disputed'},
  kind: 'claim_event', record_type: 'claim', parties: [], sure: 'disputed', date: null, matched_fields: ['claim'], tags: [], note_count: 2,
};
const body = (results: unknown[]) => ({
  query: 'Quarry', investigation_id: 'inv-1', total: results.length, returned: results.length, counts: {}, group_counts: {},
  facets: {kind: {party: 1, claim_event: 1}, party_kind: {person: 1}, sure: {disputed: 1}, tag: {}}, results,
});
const marks = (tags: unknown[] = [], notes: unknown[] = []) => ({record_type: 'entity', record_id: 'ent-1', caption: 'Jane Quarry', tags, notes, collections: []});
const tag = {id: 't-1', name: 'Owner', colour: '#314d65', count: 0};

describe('Search with facets and marks', () => {
  it('narrows by a facet, shows how sure and note counts, and tags and notes a chosen result', async () => {
    const api = mockApi({
      'GET /api/search': body([party, claim]),
      'GET /api/investigations/inv-1/corpus/search': corpusSearchBody('inv-1'),
      'GET /api/investigations/inv-1/tags': tagsBody('inv-1', [tag]),
      'GET /api/investigations/inv-1/collections': {investigation_id: 'inv-1', collections: []},
      'GET /api/investigations/inv-1/notes': {investigation_id: 'inv-1', notes: []},
      'GET /api/investigations/inv-1/marks': marks(),
      'POST /api/investigations/inv-1/record-tags': marks([tag]),
      'POST /api/investigations/inv-1/notes': {id: 'n-1', record_type: 'entity', record_id: 'ent-1', caption: 'Jane Quarry', chart_ref: null,
        text: 'Check her other companies.', lead_id: null, created_at: '2026-10-09T10:00:00', updated_at: '2026-10-09T10:00:00'},
    });
    wrap(<SearchPanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search this investigation…'), 'Quarry{Enter}');
    const card = await screen.findByRole('option', {name: /^Jane Quarry/});
    expect(screen.getByText('! Disputed')).toBeInTheDocument();
    expect(screen.getByText('2 notes')).toBeInTheDocument();
    expect(within(card).getByText('Matched on name')).toBeInTheDocument();

    // A facet narrows the search on the server; pressing it again clears it.
    await user.click(screen.getByRole('button', {name: /Person/, pressed: false}));
    await waitFor(() => expect(api.lastUrl('GET /api/search').searchParams.get('party_kind')).toBe('person'));

    // Choose the party: the side panel offers tags, notes and collections.
    await user.click(card);
    const pick = await screen.findByRole('button', {name: 'Owner', pressed: false});
    await user.click(pick);
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/record-tags')).toEqual({tag_id: 't-1', record_type: 'entity', record_id: 'ent-1'}));

    await user.type(screen.getByLabelText('New note'), 'Check her other companies.');
    await user.click(screen.getByRole('button', {name: 'Add note'}));
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/notes')).toEqual({text: 'Check her other companies.', record_type: 'entity', record_id: 'ent-1'}));
  });

  it('moves the choice with the arrow keys and traces it with Enter', async () => {
    mockApi({
      'GET /api/search': body([party, claim]),
      'GET /api/investigations/inv-1/corpus/search': corpusSearchBody('inv-1'),
      'GET /api/investigations/inv-1/tags': tagsBody('inv-1'),
      'GET /api/investigations/inv-1/collections': {investigation_id: 'inv-1', collections: []},
      'GET /api/investigations/inv-1/notes': {investigation_id: 'inv-1', notes: []},
      'GET /api/investigations/inv-1/marks': marks(),
    });
    wrap(<SearchPanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search this investigation…'), 'Quarry{Enter}');
    const list = await screen.findByRole('listbox', {name: 'Results'});
    list.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', {selected: true})).toHaveTextContent('Jane Quarry controls Quarry Holdings.');
    await user.keyboard('{Enter}');
    expect(useWorkbenchStore.getState().provenance?.request).toMatchObject({acceptedRecordType: 'claim', acceptedRecordId: 'c-1'});
  });
});
