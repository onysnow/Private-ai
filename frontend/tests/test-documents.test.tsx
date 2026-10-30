// @vitest-environment jsdom
// The document ingestion & extraction panel, moved out of app/page.tsx onto
// the generated client (Foundation Fixes fixes 2 and 3): upload and follow
// the read job, retry a failed read, import a batch, review proposals with
// their reasoning, stage a relationship from a reviewed claim, and the
// OpenAleph corpus actions.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DocumentsPanel} from '../features/documents/documents-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall} from '../test-support/mock-api';
import {dropBody, dropLane} from '../test-support/library';
import {corpusStatusBody, documentFormatsBody, emptyGraph, entityFixture} from '../test-support/page-routes';

// Bulk import navigates to the batch triage screen with useRouter().push().
const {mockPush} = vi.hoisted(() => ({mockPush: vi.fn()}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null, document: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mockPush.mockClear(); });

const DOCUMENTS = 'GET /api/investigations/inv-1/documents';
const ENTITIES = 'GET /api/investigations/inv-1/entities';
const UPLOAD = 'POST /api/documents/upload';
const CANDIDATES = 'GET /api/documents/doc-1/candidates';
const CORPUS_STATUS = 'GET /api/investigations/inv-1/corpus/status';
const DROP = 'GET /api/investigations/inv-1/drop';
const list = () => screen.getByRole('region', {name: 'Files'});
const pane = () => screen.getByTestId('library-pane');
/** Opens the chosen file's OpenAleph menu and presses one of its actions. */
async function openAleph(user: ReturnType<typeof userEvent.setup>, action: string) {
  await user.click(within(pane()).getByRole('button', {name: /^OpenAleph/}));
  await user.click(within(pane()).getByRole('menuitem', {name: action}));
}
// The canonical entities a staged relationship can join, read from the shared cache.
const entities = [entityFixture('ent-1', 'Kestrelwood Holdings', 'Company'), entityFixture('ent-2', 'Jane Doe', 'Person')];

function docFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1', investigation_id: 'inv-1', filename: 'board-minutes.pdf', source_id: 'src-1', mime_type: 'application/pdf', sha256: 'abc123',
    extraction_status: 'extracted', extraction_error: null, extraction_issues: [], created_at: '2026-10-01T00:00:00',
    chunk_count: 12, candidate_counts: {entity: 2}, ...overrides,
  };
}

function candidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cand-1', investigation_id: 'inv-1', document_id: 'doc-1', chunk_id: 'chunk-1', candidate_type: 'entity',
    payload: {caption: 'Kestrelwood Holdings Ltd', suggested_schema: 'Company'}, review_status: 'proposed', confidence: 0.82,
    accepted_record_type: null, accepted_record_id: null, reviewer_note: null, created_at: '2026-10-01T00:00:00', reviewed_at: null,
    ...overrides,
  };
}

function jobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'doc-2',
    status: 'queued', finished: false, progress: null, message: 'Waiting to start', error: null, attempts: 0, runner: 'procrastinate',
    result: null, created_at: '2026-10-01T00:00:00', started_at: null, finished_at: null, updated_at: '2026-10-01T00:00:00', ...overrides,
  };
}

const uploadForm = (call: RouteCall) => call.body as FormData;

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]:not([multiple])');
  if (!input) throw new Error('document file input not found');
  return input as HTMLInputElement;
}

function bulkFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"][multiple]');
  if (!input) throw new Error('bulk import file input not found');
  return input as HTMLInputElement;
}

async function renderWithDocuments(documents: unknown[] = [docFixture()]) {
  const api = mockApi({[DOCUMENTS]: documents, [ENTITIES]: entities, 'GET /api/investigations/inv-1/graph': emptyGraph(), [CORPUS_STATUS]: corpusStatusBody('inv-1'),
    'GET /api/document-formats': documentFormatsBody(), [DROP]: dropBody('inv-1')});
  wrap(<DocumentsPanel investigationId="inv-1"/>);
  await screen.findByTestId(`document-${String((documents[0] as {id: string}).id)}`);
  return api;
}

describe('DocumentsPanel upload and review', () => {
  it('lists the documents with their numbers, the chosen one in its pane, and disables Upload & extract until a file is chosen', async () => {
    await renderWithDocuments();
    const row = screen.getByTestId('document-doc-1');
    expect(within(row).getByText('12')).toBeInTheDocument();   // its passages, a number in its column
    expect(row).toHaveAttribute('aria-current', 'true');       // the first file is chosen: its pane shows
    expect(within(pane()).getByRole('heading', {name: 'board-minutes.pdf'})).toBeInTheDocument();
    // Its kind is a mark, named on hover (Ony, 29 Oct).
    expect(within(row).getByRole('img', {name: 'PDF'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Upload & extract'})).toBeDisabled();
    expect(screen.getByRole('link', {name: 'Review queue'})).toHaveAttribute('href', '/review?inv=inv-1');
  });

  it('shows where each file is in its reading, why one stopped, and filters by kind, state and name', async () => {
    const api = mockApi({
      [DOCUMENTS]: [docFixture(), docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'failed', chunk_count: 0}),
        docFixture({id: 'doc-3', filename: 'transfer.eml', title: 'Transfer to Meridian', mime_type: 'message/rfc822'})],
      [ENTITIES]: entities, [CORPUS_STATUS]: corpusStatusBody('inv-1'), 'GET /api/document-formats': documentFormatsBody(),
      [DROP]: dropBody('inv-1', [
        dropLane('doc-1', 'board-minutes.pdf', {waiting: 3}, {pages: 7, passages: 12, proposals: {entity: 5}, waiting: {entity: 3}}),
        dropLane('doc-2', 'scan.pdf', {problem: true, note: 'Needs OCR · not on this computer'}),
        dropLane('doc-3', 'transfer.eml', {}, {passages: 2}),
      ]),
      // The chosen PDF's first page, drawn by the API, is its picture in the pane.
      'GET /api/documents/doc-1/page-image': new Blob(['png'], {type: 'image/png'}),
    });
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    const minutes = await screen.findByTestId('document-doc-1');
    await waitFor(() => expect(within(minutes).getByText('7')).toBeInTheDocument());   // pages
    expect(within(minutes).getByText('3')).toBeInTheDocument();                         // proposals waiting
    // A file that could not be read says why on its row; it is an alert, not sub-text.
    expect(within(screen.getByTestId('document-doc-2')).getByText('Needs OCR · not on this computer')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Could not be read'}));
    expect(within(list()).queryByTestId('document-doc-1')).not.toBeInTheDocument();
    expect(within(pane()).getByRole('button', {name: 'Try reading again'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Clear'}));
    await user.click(screen.getByRole('button', {name: 'Emails'}));
    expect(screen.getAllByTestId(/^document-/).map(row => row.dataset.testid)).toEqual(['document-doc-3']);
    await user.click(screen.getByRole('button', {name: 'Emails'}));
    await user.type(screen.getByRole('searchbox', {name: 'Find a file by name'}), 'meridian');
    expect(screen.getAllByTestId(/^document-/).map(row => row.dataset.testid)).toEqual(['document-doc-3']);
    expect(api.unmatched()).toEqual([]);
  });

  it('marks each document by what it is, filters by it, and lets a person set its kind and language in the pane', async () => {
    const judgment = docFixture({kind: 'judgment', kind_set_by: 'source', language: 'fr', language_name: 'French', language_set_by: 'detected',
      language_by: 'py3langid', language_confidence: 0.99});
    const api = await renderWithDocuments([judgment, docFixture({id: 'doc-2', filename: 'ledger.pdf'})]);
    // The kind is the row's mark, named on hover; a document whose kind is not known shows its file's kind, faint.
    expect(within(screen.getByTestId('document-doc-1')).getByRole('img', {name: 'Judgment or order'})).toBeInTheDocument();
    expect(within(screen.getByTestId('document-doc-2')).getByRole('img', {name: 'PDF'})).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Kind not set'}));
    expect(screen.getAllByTestId(/^document-/).map(row => row.dataset.testid)).toEqual(['document-doc-2']);
    await user.click(screen.getByRole('button', {name: 'Kind not set'}));
    await user.click(screen.getByRole('button', {name: 'Judgments and orders'}));
    expect(screen.getAllByTestId(/^document-/).map(row => row.dataset.testid)).toEqual(['document-doc-1']);
    // The pane: its kind and language as chips; how each was set is on hover.
    expect(within(pane()).getByText('Detected by py3langid · 99% sure').closest('[hidden]')).not.toBeNull();
    api.add({'PATCH /api/documents/doc-1/about': {...judgment, kind: 'court_filing', kind_set_by: 'person', kind_by: 'Ony'}});
    await user.click(within(pane()).getByRole('button', {name: 'Kind: Judgment or order. Change it'}));
    await user.click(within(pane()).getByRole('radio', {name: 'Court filing'}));
    await waitFor(() => expect(api.calls('PATCH /api/documents/doc-1/about')).toHaveLength(1));
    expect(api.lastBody('PATCH /api/documents/doc-1/about')).toEqual({kind: 'court_filing'});
    api.add({'PATCH /api/documents/doc-1/about': {...judgment, language: 'ms', language_name: 'Malay', language_set_by: 'person'}});
    await user.click(within(pane()).getByRole('button', {name: 'Language: French. Change it'}));
    const field = within(pane()).getByRole('combobox', {name: 'Language, as a code or a name'});
    await user.clear(field);
    await user.type(field, 'Malay');
    await user.click(within(pane()).getByRole('button', {name: 'Save'}));
    await waitFor(() => expect(api.calls('PATCH /api/documents/doc-1/about')).toHaveLength(2));
    expect(api.lastBody('PATCH /api/documents/doc-1/about')).toEqual({language: 'ms'});
  });

  it('moves along the list with J and K and opens the chosen file in the reading room with Enter', async () => {
    await renderWithDocuments([docFixture(), docFixture({id: 'doc-2', filename: 'ledger.pdf'})]);
    const user = userEvent.setup();
    screen.getByRole('button', {name: 'board-minutes.pdf'}).focus();
    await user.keyboard('j');
    expect(screen.getByTestId('document-doc-2')).toHaveAttribute('aria-current', 'true');
    expect(within(pane()).getByRole('heading', {name: 'ledger.pdf'})).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'doc-2'});
    await user.keyboard('k');
    expect(screen.getByTestId('document-doc-1')).toHaveAttribute('aria-current', 'true');
  });

  it('names a document by the title given on upload, with its file name beside it', async () => {
    await renderWithDocuments([docFixture({title: 'Board minutes, March', filename: 'scan_0042.pdf'}), docFixture({id: 'doc-3', filename: 'notes.txt', title: 'notes.txt'})]);
    expect(within(list()).getByText('Board minutes, March')).toBeInTheDocument();
    // The chosen file's pane names its file beside its title; a file named by its file name is not named twice.
    expect(within(pane()).getByText('scan_0042.pdf', {selector: '.lib-file'})).toBeInTheDocument();
    expect(within(list()).getAllByText('notes.txt')).toHaveLength(1);
  });

  it('uploads a document, reloads the list, and loads its proposals', async () => {
    const api = await renderWithDocuments();
    const uploaded = {...docFixture({id: 'doc-2', filename: 'contract.pdf', chunk_count: 4, candidate_counts: {}}), job: null, openaleph_sync: null};
    api.add({
      [UPLOAD]: uploaded,
      [DOCUMENTS]: [docFixture(), uploaded],
      'GET /api/documents/doc-2/candidates': [candidateFixture({id: 'cand-2', document_id: 'doc-2'})],
    });
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Document title'), 'Signed contract');
    await user.upload(fileInput(), new File(['pdf-bytes'], 'contract.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));

    await screen.findByTestId('document-doc-2');
    await screen.findByText('Kestrelwood Holdings Ltd');
    expect(screen.getByText('entity proposal')).toBeInTheDocument();
    expect(screen.getByText('· proposed · 82%')).toBeInTheDocument();
    const body = uploadForm(api.calls(UPLOAD)[0]);
    expect(body.get('investigation_id')).toBe('inv-1');
    expect(body.get('title')).toBe('Signed contract');
    expect((body.get('file') as File).name).toBe('contract.pdf');
    expect(api.calls(DOCUMENTS)).toHaveLength(2);
    expect(screen.getByTestId('document-doc-2')).toHaveAttribute('aria-current', 'true');   // the new file is chosen
    const url = api.lastUrl('GET /api/documents/doc-2/candidates');
    expect(url.searchParams.get('status')).toBe('proposed');
    expect(url.searchParams.get('explain')).toBe('true');
    expect(screen.getByPlaceholderText('Document title')).toHaveValue('');
    // The upload's line stays once the proposals are in (it used to be cleared by them).
    expect(screen.getByText('Extracted 4 chunk(s). Review proposals before canonicalizing.')).toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });

  it('keeps the upload\'s line and adds why its proposals could not be loaded', async () => {
    const api = await renderWithDocuments();
    const uploaded = {...docFixture({id: 'doc-2', filename: 'contract.pdf', chunk_count: 4, candidate_counts: {}}), job: null, openaleph_sync: null};
    api.add({
      [UPLOAD]: uploaded,
      [DOCUMENTS]: [docFixture(), uploaded],
      'GET /api/documents/doc-2/candidates': {status: 500, body: {detail: 'Proposals unavailable'}},
    });
    const user = userEvent.setup();
    await user.upload(fileInput(), new File(['pdf-bytes'], 'contract.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));

    await screen.findByText(/^Extracted 4 chunk\(s\)\. Review proposals before canonicalizing\. Proposals unavailable/);
  });

  it('names the document a file already is, and keeps a second copy only when asked', async () => {
    const api = await renderWithDocuments();
    const uploaded = {...docFixture({id: 'doc-2', filename: 'memo.txt', chunk_count: 1, candidate_counts: {}}), job: null, openaleph_sync: null};
    api.add({
      [UPLOAD]: (call: RouteCall) => uploadForm(call).get('allow_duplicate') === 'true'
        ? uploaded
        : {status: 409, body: {detail: {message: 'Already in this investigation as “memo.txt”', document: docFixture()}}},
      [DOCUMENTS]: [docFixture(), uploaded],
      'GET /api/documents/doc-2/candidates': [],
    });
    const user = userEvent.setup();
    await user.upload(fileInput(), new File(['same bytes'], 'memo.txt', {type: 'text/plain'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));
    await screen.findByText(/^Already in this investigation as “memo\.txt”/);
    expect(uploadForm(api.calls(UPLOAD)[0]).get('allow_duplicate')).toBeNull();

    await user.click(screen.getByRole('button', {name: 'Keep a second copy of memo.txt'}));
    await screen.findByText('Extracted 1 chunk(s). Review proposals before canonicalizing.');
    expect(uploadForm(api.calls(UPLOAD)[1]).get('allow_duplicate')).toBe('true');
    expect(screen.queryByRole('button', {name: /Keep a second copy/})).not.toBeInTheDocument();
  });

  it('shows the server\'s reason when an upload is refused', async () => {
    const api = await renderWithDocuments();
    api.add({[UPLOAD]: {status: 400, body: {detail: 'Document is empty'}}});
    const user = userEvent.setup();
    await user.upload(fileInput(), new File([''], 'empty.txt', {type: 'text/plain'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));
    await screen.findByText(/Document is empty/);
  });

  it('accepts an entity proposal, reloads the documents and marks the entities stale', async () => {
    const api = await renderWithDocuments([docFixture()]);
    const review = 'POST /api/extraction-candidates/cand-1/review';
    api.add({[CANDIDATES]: [candidateFixture()]});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Review proposals'}));
    await screen.findByText('Kestrelwood Holdings Ltd');

    api.add({
      [review]: {candidate: candidateFixture({review_status: 'accepted', accepted_record_type: 'entity', accepted_record_id: 'ent-9'}), record: {id: 'ent-9'}},
      [DOCUMENTS]: [docFixture({candidate_counts: {}})],
    });
    await userEvent.setup().click(screen.getByRole('button', {name: 'Accept'}));
    await screen.findByText('entity proposal accepted. Its document/chunk/review lineage is retained for provenance tracing.');
    expect(screen.queryByText('Kestrelwood Holdings Ltd')).not.toBeInTheDocument();
    expect(api.lastBody(review)).toEqual({decision: 'accept', note: 'Reviewed in Next.js workbench', caption: 'Kestrelwood Holdings Ltd', entity_schema: 'Company'});
    expect(api.calls(DOCUMENTS)).toHaveLength(2);
    // The entities (which an accepted entity proposal may have grown) are read again too.
    expect(api.calls(ENTITIES)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('rejects a proposal and shows why a review failed', async () => {
    const api = await renderWithDocuments();
    const review = 'POST /api/extraction-candidates/cand-1/review';
    api.add({[CANDIDATES]: [candidateFixture(), candidateFixture({id: 'cand-2', payload: {quote: 'The board met.'}, candidate_type: 'evidence'})]});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Review proposals'}));
    await screen.findByText('The board met.');

    api.add({[review]: {status: 400, body: {detail: 'Candidate has already been reviewed'}}});
    await userEvent.setup().click(screen.getAllByRole('button', {name: 'Reject'})[0]);
    await screen.findByText(/Candidate has already been reviewed/);
    expect(screen.getByText('Kestrelwood Holdings Ltd')).toBeInTheDocument();

    api.add({[review]: {candidate: candidateFixture({review_status: 'rejected'}), record: null}});
    await userEvent.setup().click(screen.getAllByRole('button', {name: 'Reject'})[0]);
    await screen.findByText('entity proposal rejected. Its document/chunk/review lineage is retained for provenance tracing.');
    expect(screen.queryByText('Kestrelwood Holdings Ltd')).not.toBeInTheDocument();
    expect(screen.getByText('The board met.')).toBeInTheDocument();
    expect(api.lastBody(review)).toEqual({decision: 'reject', note: 'Reviewed in Next.js workbench'});
  });

  it('shows each proposal\'s reasoning (#190) and the review history on request', async () => {
    const api = await renderWithDocuments();
    const explanation = {
      candidate_id: 'cand-1', candidate_type: 'entity', review_status: 'proposed',
      summary: 'Company named “Kestrelwood Holdings Ltd”',
      method: {id: 'openaleph_ftm_analyze', label: 'OpenAleph ftm-analyze mention', description: 'Detected by OpenAleph.', automated: true},
      rationale_basis: 'provider', confidence: {value: 1, basis: 'Fixed value of 1.0 set on import.'},
      parts: [{id: 'caption', label: 'Name', value: 'Kestrelwood Holdings Ltd', reasoning: ['OpenAleph returned this name as a mention.'], sources: []}],
      sources: [{kind: 'provider', id: 'm1', label: 'openaleph Mention', provider: 'openaleph', collection_id: '7', provider_document_id: null, provider_entity_id: 'm1'}],
      caveats: [], review_rule: 'Nothing in this proposal is in the investigation until a reporter accepts it.',
    };
    api.add({[CANDIDATES]: [candidateFixture({explanation})]});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Review proposals'}));
    await screen.findByText(/Why this was proposed: OpenAleph ftm-analyze mention/);
    expect(screen.getByText('OpenAleph returned this name as a mention.')).toBeInTheDocument();

    api.add({[CANDIDATES]: [candidateFixture({explanation}), candidateFixture({id: 'cand-0', review_status: 'rejected', reviewer_note: 'Not a name', payload: {caption: 'Minutes Of'}})]});
    await user.click(screen.getByRole('button', {name: 'Review history'}));
    await screen.findByText('Loaded 2 extraction proposal/review record(s).');
    expect(screen.getByText('Reporter note: Not a name').closest('[hidden]')).not.toBeNull();  // sub-text: on hover, still read with its mark
    const url = api.lastUrl(CANDIDATES);
    expect(url.searchParams.get('status')).toBeNull();
    expect(url.searchParams.get('explain')).toBe('true');
  });

  it('asks for a trace of a document and of a proposal through the shared store', async () => {
    const api = await renderWithDocuments();
    api.add({[CANDIDATES]: [candidateFixture({payload: {quote: 'The board met.', locator: 'p. 4'}, candidate_type: 'evidence'})]});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Trace document'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({title: 'board-minutes.pdf', kind: 'document', sourceId: 'src-1', documentId: 'doc-1'});

    await user.click(screen.getByRole('button', {name: 'Review proposals'}));
    await user.click(await screen.findByRole('button', {name: 'Trace extraction'}));
    expect(useWorkbenchStore.getState().provenance?.request).toEqual({
      title: 'The board met.', kind: 'document extraction: proposed', locator: 'p. 4', detail: 'The board met.', extractionCandidateId: 'cand-1',
    });
  });

  it('stages a relationship from an accepted claim as a new proposal', async () => {
    const api = await renderWithDocuments();
    const stage = 'POST /api/claims/claim-7/relationship-proposals';
    api.add({[CANDIDATES]: [candidateFixture({candidate_type: 'claim', review_status: 'accepted', accepted_record_type: 'claim', accepted_record_id: 'claim-7', payload: {text: 'Jane Doe directs Kestrelwood.'}})]});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Review history'}));
    await user.click(await screen.findByRole('button', {name: 'Stage relationship from this claim'}));
    expect(screen.getByText('Stage relationship from reviewed claim')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Stage proposal'})).toBeDisabled();

    const staging = screen.getByText('Stage relationship from reviewed claim').closest('.candidate') as HTMLElement;
    const [sourceSelect, targetSelect] = within(staging).getAllByRole('combobox');
    await user.click(sourceSelect);
    await user.click(await screen.findByRole('option', {name: 'Jane Doe · Person'}));
    await user.click(targetSelect);
    await user.click(await screen.findByRole('option', {name: 'Kestrelwood Holdings · Company'}));
    api.add({[stage]: candidateFixture({id: 'cand-rel', candidate_type: 'relationship', payload: {schema: 'Directorship', source_entity_id: 'ent-2', target_entity_id: 'ent-1'}, confidence: 0})});
    await user.click(screen.getByRole('button', {name: 'Stage proposal'}));

    await screen.findByText('Relationship staged as a proposal. It is not canonical until separately accepted.');
    expect(api.lastBody(stage)).toEqual({schema: 'Directorship', source_entity_id: 'ent-2', target_entity_id: 'ent-1', note: 'Reporter staged from reviewed document claim in Next.js workbench'});
    expect(screen.getByText('Directorship: Jane Doe → Kestrelwood Holdings')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Accept canonical relationship'})).toBeInTheDocument();
    expect(screen.queryByText('Stage relationship from reviewed claim')).not.toBeInTheDocument();
  });

  it('forgets the loaded proposals when the case changes', async () => {
    const api = mockApi({
      [DOCUMENTS]: [docFixture()], [ENTITIES]: entities, 'GET /api/investigations/inv-2/documents': [docFixture({id: 'doc-9', filename: 'harbor.pdf'})],
      'GET /api/investigations/inv-2/entities': [], [CANDIDATES]: [candidateFixture()],
      [CORPUS_STATUS]: corpusStatusBody('inv-1'), 'GET /api/document-formats': documentFormatsBody(), 'GET /api/investigations/inv-2/corpus/status': corpusStatusBody('inv-2'),
      [DROP]: dropBody('inv-1'), 'GET /api/investigations/inv-2/drop': dropBody('inv-2'),
    });
    const view = wrap(<DocumentsPanel investigationId="inv-1"/>);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Review proposals'}));
    await screen.findByText('Kestrelwood Holdings Ltd');

    view.rerender(<QueryProvider><DocumentsPanel investigationId="inv-2"/></QueryProvider>);
    await screen.findByTestId('document-doc-9');
    expect(screen.queryByText('Kestrelwood Holdings Ltd')).not.toBeInTheDocument();
    expect(api.calls('GET /api/investigations/inv-2/documents')).toHaveLength(1);
  });
});

describe('DocumentsPanel reading as a background job (ADR-0004)', () => {
  it('follows a queued read until it finishes, then loads the proposals', async () => {
    const api = await renderWithDocuments();
    const queued = {...docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'queued', chunk_count: 0, candidate_counts: {}}), job: jobFixture(), openaleph_sync: null};
    const read = docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'complete', chunk_count: 3, candidate_counts: {entity: 1}});
    let polls = 0;
    api.add({
      [UPLOAD]: {status: 202, body: queued},
      [DOCUMENTS]: () => [docFixture(), polls < 2 ? queued : read],
      'GET /api/jobs/job-1': () => (++polls === 1
        ? jobFixture({status: 'running', progress: 5, message: 'Reading the document'})
        : jobFixture({status: 'succeeded', finished: true, progress: 100, message: 'Document read', attempts: 1})),
      'GET /api/documents/doc-2': {...read, chunks: []},
      'GET /api/documents/doc-2/candidates': [candidateFixture({id: 'cand-2', document_id: 'doc-2'})],
    });
    const user = userEvent.setup();
    await user.upload(fileInput(), new File(['pdf-bytes'], 'scan.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));

    await screen.findByText('Saved. Reading the document: Reading the document (5%)');
    expect(screen.getByRole('button', {name: 'Check reading progress'})).toBeInTheDocument();
    // The "Extracted N chunk(s)" line is replaced at once by loading the
    // proposals, which clears the status on success (as the page always did).
    await screen.findByText('Kestrelwood Holdings Ltd', {}, {timeout: 4000});
    expect(api.calls('GET /api/jobs/job-1')).toHaveLength(2);
    expect(api.calls('GET /api/documents/doc-2')).toHaveLength(1);
    expect(api.calls(DOCUMENTS)).toHaveLength(3);
    expect(api.unmatched()).toEqual([]);
  });

  it('says when the read stopped and retries it from the document row', async () => {
    const failedDoc = docFixture({id: 'doc-9', filename: 'broken.pdf', extraction_status: 'failed', chunk_count: 0, candidate_counts: {}});
    const api = await renderWithDocuments([failedDoc]);
    const failedJob = jobFixture({id: 'job-9', subject_id: 'doc-9', status: 'failed', finished: true, error: 'scan unreadable', attempts: 1});
    const retry = 'POST /api/jobs/job-9/retry';
    api.add({
      'GET /api/jobs': [failedJob],
      [retry]: jobFixture({id: 'job-9', subject_id: 'doc-9', status: 'succeeded', finished: true, message: 'Document read', attempts: 2}),
      [DOCUMENTS]: [docFixture({id: 'doc-9', filename: 'broken.pdf', extraction_status: 'complete'})],
    });
    await userEvent.setup().click(screen.getByRole('button', {name: 'Try reading again'}));
    await screen.findByText('broken.pdf: Document read');
    expect(screen.queryByRole('button', {name: 'Try reading again'})).not.toBeInTheDocument();
    expect(api.lastUrl('GET /api/jobs').searchParams.get('subject_id')).toBe('doc-9');
    expect(api.calls(retry)).toHaveLength(1);
    expect(api.calls(DOCUMENTS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('says so when a stopped read has no job to retry', async () => {
    const api = await renderWithDocuments([docFixture({id: 'doc-9', filename: 'broken.pdf', extraction_status: 'failed'})]);
    api.add({'GET /api/jobs': []});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Try reading again'}));
    await screen.findByText('broken.pdf: no reading job found.');
    expect(api.calls(DOCUMENTS)).toHaveLength(1);
  });

  it('reports a read that failed after the upload was saved', async () => {
    const api = await renderWithDocuments();
    const queued = {...docFixture({id: 'doc-2', filename: 'scan.pdf', extraction_status: 'queued', chunk_count: 0, candidate_counts: {}}), job: jobFixture(), openaleph_sync: null};
    api.add({
      [UPLOAD]: {status: 202, body: queued},
      [DOCUMENTS]: [docFixture(), queued],
      'GET /api/jobs/job-1': jobFixture({status: 'failed', finished: true, error: 'scan unreadable', attempts: 1}),
      'GET /api/documents/doc-2': {...queued, chunks: []},
    });
    const user = userEvent.setup();
    await user.upload(fileInput(), new File(['pdf-bytes'], 'scan.pdf', {type: 'application/pdf'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));
    await screen.findByText('Saved, but reading it stopped: Failed: scan unreadable. Use “Try reading again” on the document.');
    expect(api.calls('GET /api/documents/doc-2/candidates')).toHaveLength(0);
  });
});

const BATCHES = 'POST /api/investigations/inv-1/ingestion-batches';
const batchFixture = (overrides: Record<string, unknown> = {}) => ({id: 'batch-1', investigation_id: 'inv-1', label: 'Bulk import', created_by: 'local-owner',
  created_at: '2026-10-03T01:00:00', items: [], documents: [], review_order: [], ...overrides});

describe('DocumentsPanel bulk import', () => {
  it('imports the files as one batch, in turn, names duplicates, tolerates a failure, and opens its triage', async () => {
    const api = await renderWithDocuments();
    api.add({
      [BATCHES]: batchFixture(),
      [UPLOAD]: (call: RouteCall) => {
        const name = (uploadForm(call).get('file') as File).name;
        if (name === 'memo-b.txt') return {status: 400, body: {detail: 'Document is empty'}};
        if (name === 'memo-d.txt') return {status: 409, body: {detail: {message: 'Already in this investigation as “memo-a.txt”', document: docFixture({id: 'doc-a'})}}};
        return {...docFixture({id: name === 'memo-a.txt' ? 'doc-a' : 'doc-c', filename: name}), job: null, openaleph_sync: null};
      },
      [DOCUMENTS]: [docFixture(), docFixture({id: 'doc-a'}), docFixture({id: 'doc-c'})],
    });
    const user = userEvent.setup();
    expect(screen.getByRole('button', {name: 'Import 0 document(s)'})).toBeDisabled();
    await user.upload(bulkFileInput(), ['a', 'b', 'c', 'd'].map(x => new File([x], `memo-${x}.txt`, {type: 'text/plain'})));
    await user.click(screen.getByRole('button', {name: 'Import 4 document(s)'}));

    const summary = await screen.findByText(/^Imported 2 of 4 file\(s\)\. 1 failed and were skipped: memo-b\.txt: Document is empty/);
    expect(summary).toHaveTextContent(/1 already in this investigation: memo-d\.txt\.$/);
    expect(mockPush).toHaveBeenCalledWith('/review/batch?inv=inv-1&batch=batch-1');
    expect(api.lastBody(BATCHES)).toEqual({label: 'memo-a.txt and 3 more'});
    const uploads = api.calls(UPLOAD);
    expect(uploads.map(call => (uploadForm(call).get('file') as File).name)).toEqual(['memo-a.txt', 'memo-b.txt', 'memo-c.txt', 'memo-d.txt']);
    expect(uploads.map(call => uploadForm(call).get('title'))).toEqual(['memo-a', 'memo-b', 'memo-c', 'memo-d']);
    expect(uploads.map(call => uploadForm(call).get('batch_id'))).toEqual(['batch-1', 'batch-1', 'batch-1', 'batch-1']);
    expect(uploads.map(call => uploadForm(call).get('investigation_id'))).toEqual(['inv-1', 'inv-1', 'inv-1', 'inv-1']);
    await waitFor(() => expect(api.calls(DOCUMENTS)).toHaveLength(2));
    expect(api.unmatched()).toEqual([]);
  });

  it('waits for every queued read before opening triage, and stays put when every file failed', async () => {
    const api = await renderWithDocuments();
    api.add({
      [BATCHES]: batchFixture(),
      [UPLOAD]: (call: RouteCall) => ({...docFixture({id: 'doc-q', filename: (uploadForm(call).get('file') as File).name, extraction_status: 'queued'}), job: jobFixture({id: 'job-q', subject_id: 'doc-q'}), openaleph_sync: null}),
      'GET /api/jobs/job-q': jobFixture({id: 'job-q', status: 'succeeded', finished: true, message: 'Document read'}),
      [DOCUMENTS]: [docFixture(), docFixture({id: 'doc-q', filename: 'queued.txt'})],
    });
    const user = userEvent.setup();
    await user.upload(bulkFileInput(), [new File(['q'], 'queued.txt', {type: 'text/plain'})]);
    await user.click(screen.getByRole('button', {name: 'Import 1 document(s)'}));
    await screen.findByText('Imported 1 file(s). Opening batch triage...');
    expect(api.calls('GET /api/jobs/job-q')).toHaveLength(1);
    expect(mockPush).toHaveBeenCalledWith('/review/batch?inv=inv-1&batch=batch-1');

    mockPush.mockClear();
    api.add({[UPLOAD]: {status: 400, body: {detail: 'Document is empty'}}});
    await user.upload(bulkFileInput(), [new File([''], 'blank.txt', {type: 'text/plain'})]);
    await user.click(screen.getByRole('button', {name: 'Import 1 document(s)'}));
    await screen.findByText(/^No file was imported\. blank\.txt: Document is empty/);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('DocumentsPanel OpenAleph corpus actions', () => {
  const sync = {
    id: 'sync-1', document_id: 'doc-1', investigation_id: 'inv-1', provider: 'openaleph', collection_id: 'oa-1', provider_record_id: 'oa-doc-1',
    status: 'synced', error: null, response_json: {}, synced_at: '2026-10-01T00:00:00', created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00',
  };
  const reviewStatus = (overrides: Record<string, unknown> = {}) => ({
    document_id: 'doc-1', investigation_id: 'inv-1', provider: 'openaleph', document_extraction_status: 'extracted', binding: null, sync: null,
    ready_for_import: false, candidate_counts: {}, provider_candidate_total: 0, provider_candidate_pending_review: 0,
    provider_candidate_accepted: 0, provider_candidate_rejected: 0, ...overrides,
  });
  const STATUS = 'GET /api/documents/doc-1/corpus/openaleph/review-status';

  it('shows the sync state, synchronizes, and refreshes the provider review queue', async () => {
    const api = await renderWithDocuments();
    api.add({[STATUS]: reviewStatus()});
    const user = userEvent.setup();
    // OpenAleph's actions are one menu in the chosen file's pane, not a wall of buttons on every row.
    expect(screen.queryByRole('menuitem', {name: 'OpenAleph status'})).not.toBeInTheDocument();
    await openAleph(user, 'OpenAleph status');
    await screen.findByText('OpenAleph: not synchronized · 0 awaiting review · 0 accepted · 0 rejected');
    await user.click(within(pane()).getByRole('button', {name: /^OpenAleph/}));
    expect(screen.getByRole('menuitem', {name: 'Refresh OpenAleph review'})).toBeDisabled();
    await user.click(within(pane()).getByRole('button', {name: /^OpenAleph/}));

    api.add({
      'POST /api/documents/doc-1/corpus/openaleph/sync': {sync},
      [STATUS]: reviewStatus({sync, ready_for_import: true, provider_candidate_total: 2, provider_candidate_pending_review: 2}),
    });
    await openAleph(user, 'Sync to OpenAleph');
    await screen.findByText('OpenAleph synchronization complete. Provider extraction can now be refreshed.');
    expect(screen.getByText('OpenAleph: synced · provider document oa-doc-1 · 2 awaiting review · 0 accepted · 0 rejected')).toBeInTheDocument();
    await user.click(within(pane()).getByRole('button', {name: /^OpenAleph/}));
    expect(screen.getByRole('menuitem', {name: 'Refresh OpenAleph review'})).toBeEnabled();
    await user.click(within(pane()).getByRole('button', {name: /^OpenAleph/}));

    const imported = {document_id: 'doc-1', collection_id: 'oa-1', provider_document_id: 'oa-doc-1', provider: 'openaleph', retrieved: 1, created_candidates: 1, skipped: 0, review_required: true};
    api.add({
      'POST /api/documents/doc-1/corpus/openaleph/refresh-review': {
        document_id: 'doc-1', provider: 'openaleph', evidence: {...imported, created_chunks: 1}, entities: {...imported, automatic_resolution: false},
        status: reviewStatus({sync, ready_for_import: true, provider_candidate_total: 2, provider_candidate_pending_review: 2}),
      },
      [CANDIDATES]: [candidateFixture({payload: {quote: 'Provider page text.'}, candidate_type: 'evidence'})],
    });
    await openAleph(user, 'Refresh OpenAleph review');
    await screen.findByText('OpenAleph review refreshed: 2 provider candidate(s) awaiting reporter review.');
    expect(screen.getByText('Provider page text.')).toBeInTheDocument();
    expect(api.lastUrl(CANDIDATES).searchParams.get('status')).toBe('proposed');
    expect(api.unmatched()).toEqual([]);
  });

  it('shows the server\'s reason when a sync is refused', async () => {
    const api = await renderWithDocuments();
    api.add({'POST /api/documents/doc-1/corpus/openaleph/sync': {status: 503, body: {detail: 'openaleph-client is not installed'}}});
    await openAleph(userEvent.setup(), 'Sync to OpenAleph');
    await screen.findByText(/openaleph-client is not installed/);
  });
});
