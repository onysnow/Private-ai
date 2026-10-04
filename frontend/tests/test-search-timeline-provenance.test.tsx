// @vitest-environment jsdom
// The second group of panels moved out of app/page.tsx onto the generated
// API client (Foundation Fixes fixes 2 and 3): investigation search, the
// timeline, and the provenance trace that every panel can ask for through
// the shared store.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ProvenancePanel} from '../features/provenance/provenance-panel';
import {SearchPanel, provenanceRequestForHit} from '../features/search/search-panel';
import {TimelinePanel} from '../features/timeline/timeline-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {corpusSearchBody} from '../test-support/page-routes';

vi.mock('next/dynamic', () => ({
  // The timeline chart needs a canvas; the panel's own list is what these tests check.
  default: () => () => <div data-testid="timeline-chart"/>,
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const canonicalHit = {
  type: 'entity', group: 'canonical', id: 'ent-1', investigation_id: 'inv-1', title: 'Kestrelwood Holdings',
  snippet: 'A shell entity mentioned in filing 12.', score: 3.5,
  provenance: {trace_record_type: 'entity', trace_record_id: 'ent-1', source_id: 'src-1', locator: 'p. 4'}, metadata: {},
};
const externalLeadHit = {
  type: 'connector_finding', group: 'external_lead', id: 'find-1', investigation_id: 'inv-1', title: 'Aleph result for Kestrelwood',
  snippet: 'An unreviewed external lead.', score: 1.2, provenance: {}, metadata: {},
};
const searchBody = (results: unknown[]) => ({query: 'x', investigation_id: 'inv-1', total: results.length, returned: results.length, counts: {entity: results.length}, group_counts: {canonical: 1}, results});

describe('SearchPanel', () => {
  it('searches on click and on Enter, keeps groups apart, and asks for a trace', async () => {
    const api = mockApi({'GET /api/search': searchBody([canonicalHit, externalLeadHit]), 'GET /api/investigations/inv-1/corpus/search': corpusSearchBody('inv-1')});
    wrap(<SearchPanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search this investigation…'), 'Kestrelwood');
    await user.click(screen.getByRole('button', {name: 'Search records'}));

    await screen.findByText('Kestrelwood Holdings');
    expect(screen.getByText('External leads — review required')).toBeInTheDocument();
    expect(screen.getByText('External connector result; treat as a lead until reviewed and promoted.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', {name: 'Trace provenance'})).toHaveLength(1);
    const url = api.lastUrl('GET /api/search');
    expect(url.searchParams.get('q')).toBe('Kestrelwood');
    expect(url.searchParams.get('limit')).toBe('75');
    expect(url.searchParams.get('investigation_id')).toBe('inv-1');
    expect(url.searchParams.get('include_reconciled_duplicates')).toBeNull();

    await user.click(screen.getByLabelText('Include reviewed duplicate copies'));
    await user.type(screen.getByPlaceholderText('Search this investigation…'), '{Enter}');
    await waitFor(() => expect(api.calls('GET /api/search')).toHaveLength(2));
    expect(api.lastUrl('GET /api/search').searchParams.get('include_reconciled_duplicates')).toBe('true');

    await user.click(screen.getByRole('button', {name: 'Trace provenance'}));
    expect(useWorkbenchStore.getState().provenance?.request).toMatchObject({title: 'Kestrelwood Holdings', kind: 'search:entity', entityId: 'ent-1', sourceId: 'src-1', locator: 'p. 4'});
  });

  it('does not search on an empty query and searches every case when none is selected', async () => {
    const api = mockApi({'GET /api/search': searchBody([])});
    wrap(<SearchPanel investigationId=""/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Search records'}));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.calls('GET /api/search')).toHaveLength(0);

    await user.type(screen.getByPlaceholderText('Search this investigation…'), 'anything{Enter}');
    await waitFor(() => expect(api.calls('GET /api/search')).toHaveLength(1));
    expect(api.lastUrl('GET /api/search').searchParams.has('investigation_id')).toBe(false);
  });

  it('maps a hit to the trace the provenance panel should run', () => {
    expect(provenanceRequestForHit({...canonicalHit, provenance: {trace_record_type: 'claim', trace_record_id: 'c-1'}}))
      .toMatchObject({acceptedRecordType: 'claim', acceptedRecordId: 'c-1', entityId: undefined, traceRecordType: undefined});
    expect(provenanceRequestForHit({...canonicalHit, provenance: {trace_record_type: 'lead', trace_record_id: 'l-1'}}))
      .toMatchObject({traceRecordType: 'lead', acceptedRecordId: 'l-1', acceptedRecordType: undefined});
    expect(provenanceRequestForHit({...canonicalHit, provenance: {trace_record_type: 'document', trace_record_id: 'd-1'}}))
      .toMatchObject({documentId: 'd-1', acceptedRecordId: undefined});
  });
});

const event = {
  id: 'ev-1', kind: 'reporter_event', investigation_id: 'inv-1', title: 'Board meeting', description: 'Minutes filed',
  date_start: '2024-04-01', date_end: null, precision: 'day', verification_status: 'asserted', synthetic: false,
  refs: {source_id: 'src-1'}, provenance: {origin: 'minutes', source_url: 'https://example.test/minutes'},
  context: {source: null, evidence: null, claim: {id: 'c-1', text: 'Jane was appointed', status: 'disputed', confidence: 0.45, evidence_stances: [{stance: 'supports', note: null}]},
    claim_advisory: {needs_review: true, status: 'disputed', message: 'review'}, relationship_advisory: null},
  sort_key: '2024-04-01',
};
const timelineBody = (events: unknown[]) => ({investigation_id: 'inv-1', events, counts: {reporter_event: events.length}, verification_counts: {asserted: events.length}, total: events.length, returned: events.length, offset: 0});

describe('TimelinePanel', () => {
  it('loads the timeline, shows what each event links to, adds an event, and asks for a trace', async () => {
    const stored = {id: 'ev-2', investigation_id: 'inv-1', title: 'Filing', description: null, date_start: '2024-03', date_end: null,
      precision: 'month', verification_status: 'verified', entity_id: null, relationship_entity_id: null, source_id: null, evidence_id: null,
      claim_id: null, lead_id: null, dataset: 'reporter', origin: null, created_at: '2026-10-02T00:00:00'};
    let events: unknown[] = [event];
    const api = mockApi({
      'GET /api/investigations/inv-1/timeline': () => timelineBody(events),
      'POST /api/timeline-events': () => { events = [...events, {...event, ...stored, kind: 'reporter_event', synthetic: false, refs: {}, provenance: {}, context: null, sort_key: '2024-03-01'}]; return {status: 201, body: stored}; },
    });
    wrap(<TimelinePanel investigationId="inv-1"/>);
    await screen.findByText('Board meeting', {selector: 'b'});
    expect(screen.getByText('1 Apr 2024')).toBeInTheDocument();
    expect(screen.getByText('asserted, not yet verified').parentElement).toHaveTextContent('1 asserted, not yet verified');
    expect(screen.getByText('Claim: disputed · confidence 45%')).toBeInTheDocument();
    expect(screen.getByText('Linked claim needs review; this event is kept.')).toBeInTheDocument();
    expect(screen.getByText('Evidence stance: supports')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-chart')).toBeInTheDocument();

    const user = userEvent.setup();
    expect(screen.getByRole('button', {name: 'Add event'})).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Event title'), 'Filing');
    await user.type(screen.getByPlaceholderText('YYYY-MM-DD, YYYY-MM, or YYYY'), '2024-03');
    await user.click(screen.getByRole('button', {name: 'Add event'}));
    await screen.findByText('Filing', {selector: 'b'});
    expect(screen.getByText('Mar 2024')).toBeInTheDocument();
    expect(api.lastBody('POST /api/timeline-events')).toEqual({investigation_id: 'inv-1', title: 'Filing', date_start: '2024-03', precision: 'day', verification_status: 'asserted'});
    expect(api.calls('GET /api/investigations/inv-1/timeline')).toHaveLength(2);
    expect(screen.getByPlaceholderText('Event title')).toHaveValue('');

    await user.click(screen.getAllByRole('button', {name: 'Trace provenance'})[0]);
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({title: 'Board meeting', kind: 'timeline', sourceId: 'src-1', sourceUrl: 'https://example.test/minutes', locator: undefined, detail: 'Minutes filed'});
  });

  it('shows the server\'s reason when an event is refused', async () => {
    mockApi({
      'GET /api/investigations/inv-1/timeline': timelineBody([]),
      'POST /api/timeline-events': {status: 400, body: {detail: 'date_start must be ISO year, month, or date'}},
    });
    wrap(<TimelinePanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Event title'), 'Filing');
    await user.type(screen.getByPlaceholderText('YYYY-MM-DD, YYYY-MM, or YYYY'), 'last spring');
    await user.click(screen.getByRole('button', {name: 'Add event'}));
    await screen.findByText(/date_start must be ISO year, month, or date/);
  });
});

const source = {id: 'src-1', investigation_id: 'inv-1', title: 'Board minutes', url: 'https://example.test/minutes', source_type: 'document', metadata_json: {}, created_at: '2026-10-01T00:00:00'};
const lineage = {
  candidate: {id: 'cand-1', investigation_id: 'inv-1', document_id: 'doc-1', chunk_id: 'chunk-1', candidate_type: 'evidence', payload: {quote: 'appointed Jane'},
    confidence: 0.8, review_status: 'accepted', accepted_record_type: 'evidence', accepted_record_id: 'evi-1', reviewer_note: 'checked', created_at: '2026-10-01T00:00:00', reviewed_at: '2026-10-01T01:00:00'},
  document: {id: 'doc-1', investigation_id: 'inv-1', source_id: 'src-1', filename: 'minutes.pdf', mime_type: 'application/pdf', sha256: 'abc', extraction_status: 'done', created_at: '2026-10-01T00:00:00'},
  source: {id: 'src-1', investigation_id: 'inv-1', title: 'Board minutes', url: 'https://example.test/minutes', source_type: 'document', metadata_json: {}},
  chunk: {id: 'chunk-1', document_id: 'doc-1', ordinal: 3, locator: 'page 7', page_number: 7, text: 'The board appointed Jane.', extraction_method: 'ocr', candidate_span: null},
};
const trace = {
  record_type: 'evidence', record_id: 'evi-1', investigation_id: 'inv-1', root: {id: 'evi-1', type: 'evidence'}, extraction_lineage: null,
  evidence_links: [{link_id: 'l-1', stance: 'supports', note: 'Reporter checked', evidence: {id: 'evi-1', quote: 'appointed Jane', locator: 'page 7', notes: null}, source: {id: 'src-1', title: 'Board minutes', url: 'https://example.test/minutes', source_type: 'document'}, extraction_lineage: null}],
  claim_links: [{link_id: 'cl-1', stance: 'supports', note: null, claim: {id: 'c-1', text: 'Jane was appointed', status: 'disputed', confidence: 0.45}}],
  relationships: [], lead_links: [{link_id: 'll-1', note: 'from a tip', lead: {id: 'lead-1', title: 'Check the minutes', detail: null, status: 'open', provider: null}}],
  reconciliation: null,
};

describe('ProvenancePanel', () => {
  it('waits for a request, then follows an accepted record through its trail, trace and source evidence', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/sources': [source],
      'GET /api/sources/src-1/evidence': [{id: 'evi-1', source_id: 'src-1', quote: 'appointed Jane', locator: 'page 7', notes: null}],
      'GET /api/provenance/extraction-lineage': {found: true, lineage},
      'GET /api/provenance/trace': trace,
    });
    wrap(<ProvenancePanel investigationId="inv-1"/>);
    expect(screen.getByText(/Use “Trace provenance” from search/)).toBeInTheDocument();

    useWorkbenchStore.getState().openProvenance({title: 'Jane appointed', kind: 'claim evidence', sourceId: 'src-1', acceptedRecordType: 'evidence', acceptedRecordId: 'evi-1'});
    await screen.findByText('Trace loaded.');
    expect(screen.getByText('Board minutes')).toBeInTheDocument();
    expect(screen.getAllByText('page 7').length).toBeGreaterThan(0);
    expect(screen.getByText('Connected investigative trace')).toBeInTheDocument();
    expect(screen.getByText('evidence · 1 evidence link(s) · 1 claim link(s) · 0 relationship(s) · 1 lead link(s)')).toBeInTheDocument();
    expect(screen.getByText('disputed: Jane was appointed')).toBeInTheDocument();
    expect(screen.getByText('Check the minutes')).toBeInTheDocument();
    expect(screen.getByText('Document extraction lineage')).toBeInTheDocument();
    expect(screen.getByText(/OCR-derived text/)).toBeInTheDocument();
    expect(screen.getByText('Evidence from this source')).toBeInTheDocument();
    expect(api.lastUrl('GET /api/provenance/trace').searchParams.get('record_id')).toBe('evi-1');
    expect(api.lastUrl('GET /api/provenance/extraction-lineage').searchParams.get('record_type')).toBe('evidence');
    expect(api.unmatched()).toEqual([]);
  });

  it('says when a record has nothing to follow, and loads an entity\'s history', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/sources': [],
      'GET /api/entities/ent-1/statement-history': [{prop: 'name', value: 'Kestrelwood', canonical: true, canonical_statements: [], external_assessments: [{assessment_id: 'a-1', status: 'accepted', note: null, created_at: null, finding_id: 'f-1', provider: 'aleph', dataset: null, source_url: null, provider_record_id: null, finding_caption: null, promoted: true, promotion_id: 'p-1', promoted_at: null, reviewer_note: null}], support_count: 1, conflict_count: 0, latest_status: 'accepted'}],
      'GET /api/provenance/trace': {...trace, record_type: 'entity', record_id: 'ent-1'},
    });
    wrap(<ProvenancePanel investigationId="inv-1"/>);
    useWorkbenchStore.getState().openProvenance({title: 'Unlinked note', kind: 'note'});
    await screen.findByText('No resolvable source/history reference is attached to this record.');
    expect(api.calls('GET /api/provenance/trace')).toHaveLength(0);

    useWorkbenchStore.getState().openProvenance({title: 'Kestrelwood', kind: 'entity', entityId: 'ent-1'});
    await screen.findByText('Review / promotion history');
    expect(screen.getByText('Canonical · 1 support · 0 conflict · latest accepted')).toBeInTheDocument();
    expect(screen.getByText('accepted · aleph · promoted')).toBeInTheDocument();
  });

  it('shows the failure when a trace cannot be loaded', async () => {
    mockApi({'GET /api/investigations/inv-1/sources': [], 'GET /api/entities/ent-9/statement-history': [], 'GET /api/provenance/trace': {status: 404, body: {detail: 'Entity not found'}}});
    wrap(<ProvenancePanel investigationId="inv-1"/>);
    useWorkbenchStore.getState().openProvenance({title: 'Gone', kind: 'entity', entityId: 'ent-9'});
    await screen.findByText(/Entity not found/);
  });
});
