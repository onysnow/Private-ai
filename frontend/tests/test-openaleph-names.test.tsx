// @vitest-environment jsdom
// Names, emails and phone numbers OpenAleph found (ADR-0006, Wave A):
// "Find names again" on a document, the question "what kind of entity is
// this name?" for a name OpenAleph recorded without a kind, and "which
// entity does this belong to?" before an email or phone proposal can be
// accepted -- in the documents panel and in the review queue.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DocumentsPanel} from '../features/documents/documents-panel';
import {IdentifierOwner} from '../features/documents/identifier-owner';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {dropBody} from '../test-support/library';
import {corpusStatusBody, documentFormatsBody, emptyGraph, entityFixture} from '../test-support/page-routes';

const {searchParamsRef, mockPush} = vi.hoisted(() => ({searchParamsRef: {current: new URLSearchParams()}, mockPush: vi.fn()}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => searchParamsRef.current,
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mockPush.mockClear(); });

const DOCUMENTS = 'GET /api/investigations/inv-1/documents';
const CANDIDATES = 'GET /api/documents/doc-1/candidates';
const TARGETS = 'GET /api/extraction-candidates/cand-email/identifier-targets';
const REVIEW_EMAIL = 'POST /api/extraction-candidates/cand-email/review';

function docFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1', investigation_id: 'inv-1', filename: 'memo.txt', source_id: 'src-1', mime_type: 'text/plain', sha256: 'abc',
    extraction_status: 'complete', extraction_error: null, extraction_issues: [], created_at: '2026-10-02T00:00:00',
    chunk_count: 3, candidate_counts: {entity: 2, identifier: 1}, openaleph_document_id: '1.abc', ...overrides,
  };
}

function candidate(id: string, type: string, payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id, investigation_id: 'inv-1', document_id: 'doc-1', chunk_id: 'chunk-1', candidate_type: type, payload,
    confidence: 0.85, review_status: 'proposed', accepted_record_type: null, accepted_record_id: null, reviewer_note: null,
    created_at: '2026-10-02T00:00:00', reviewed_at: null, ...overrides,
  };
}

const emailProposal = candidate('cand-email', 'identifier', {kind: 'email', value: 'jane.doe@meridian.example', caption: 'Jane.Doe@Meridian.example'}, {confidence: 1});
const unknownName = candidate('cand-name', 'entity', {caption: 'Audit Desk', suggested_schema: 'LegalEntity', schema_question: true,
  schema_choices: ['Person', 'Company', 'Organization', 'LegalEntity']}, {confidence: 0.5});

function targets(overrides: Record<string, unknown> = {}) {
  return {
    candidate_id: 'cand-email', kind: 'email', property: 'email', value: 'jane.doe@meridian.example',
    document_entities: [{entity_id: 'ent-jane', caption: 'Jane Doe', schema: 'Person'}],
    document_proposals: [{candidate_id: 'cand-meridian', caption: 'Meridian Holdings Ltd', suggested_schema: 'Company', schema_question: false},
      {candidate_id: 'cand-name', caption: 'Audit Desk', suggested_schema: 'LegalEntity', schema_question: true}],
    other_entities: [{entity_id: 'ent-other', caption: 'Aaron Other', schema: 'Person'}],
    ...overrides,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-a', kind: 'openaleph_analyze', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'doc-1',
    status: 'queued', finished: false, progress: null, message: 'Waiting to start', error: null, attempts: 0, runner: 'procrastinate',
    result: null, created_at: '2026-10-02T00:00:00', started_at: null, finished_at: null, updated_at: '2026-10-02T00:00:00', ...overrides,
  };
}

const accepted = (id: string, type: string) => ({candidate: candidate(id, type, {}, {review_status: 'accepted'}), record: {id: 'rec-1'}});

describe('Which entity does this belong to?', () => {
  it('offers this document\'s entities first and accepts onto the one chosen', async () => {
    const api = mockApi({[TARGETS]: targets(), [REVIEW_EMAIL]: accepted('cand-email', 'identifier')});
    const onReviewed = vi.fn();
    wrap(<IdentifierOwner candidateId="cand-email" kind="email" note="checked" onReviewed={onReviewed}/>);
    const box = await screen.findByTestId('owner-cand-email');
    await within(box).findByText('From this document:');
    expect(within(box).getByText('Which entity does this email address belong to?')).toBeInTheDocument();
    const accept = within(box).getByRole('button', {name: 'Accept'});
    expect(accept).toBeDisabled();
    // A name OpenAleph recorded without a kind is answered in its own proposal first.
    expect(within(box).getByText('say what kind of entity it is in its own proposal first')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(box).getByRole('button', {name: 'Jane Doe · Person'}));
    await user.click(accept);
    expect(api.lastBody(REVIEW_EMAIL)).toEqual({decision: 'accept', note: 'checked', target_entity_id: 'ent-jane'});
    expect(onReviewed).toHaveBeenCalledWith('accept', expect.objectContaining({record: {id: 'rec-1'}}));
    expect(api.unmatched()).toEqual([]);
  });

  it('marks its Accept and Reject buttons so the A and R keys of the review queue press them', async () => {
    mockApi({[TARGETS]: targets()});
    wrap(<IdentifierOwner candidateId="cand-email" kind="email" note="checked" onReviewed={vi.fn()}/>);
    const box = await screen.findByTestId('owner-cand-email');
    await within(box).findByText('From this document:');
    expect(within(box).getByRole('button', {name: 'Accept'})).toHaveAttribute('data-action', 'accept');
    expect(within(box).getByRole('button', {name: 'Reject'})).toHaveAttribute('data-action', 'reject');
  });

  it('accepts a waiting entity proposal first, then chooses it', async () => {
    const acceptMeridian = 'POST /api/extraction-candidates/cand-meridian/review';
    const api = mockApi({
      [TARGETS]: targets(),
      [acceptMeridian]: {candidate: candidate('cand-meridian', 'entity', {}, {review_status: 'accepted'}), record: {id: 'ent-meridian'}},
    });
    const onEntityAccepted = vi.fn();
    wrap(<IdentifierOwner candidateId="cand-email" kind="email" note="checked" onReviewed={vi.fn()} onEntityAccepted={onEntityAccepted}/>);
    const user = userEvent.setup();
    const acceptFirst = await screen.findByRole('button', {name: 'Accept “Meridian Holdings Ltd” first'});
    // Once Meridian is accepted, the server lists it among this document's entities.
    api.add({[TARGETS]: targets({document_entities: [{entity_id: 'ent-jane', caption: 'Jane Doe', schema: 'Person'},
      {entity_id: 'ent-meridian', caption: 'Meridian Holdings Ltd', schema: 'Company'}], document_proposals: []})});
    await user.click(acceptFirst);

    await screen.findByText('“Meridian Holdings Ltd” accepted; it is chosen as the owner.');
    expect(api.lastBody(acceptMeridian)).toEqual({decision: 'accept', note: 'checked', caption: 'Meridian Holdings Ltd', entity_schema: 'Company'});
    expect(onEntityAccepted).toHaveBeenCalledWith('cand-meridian', expect.anything());
    expect(await screen.findByRole('button', {name: 'Meridian Holdings Ltd · Company'})).toHaveClass('bg-primary');
    expect(screen.getByRole('button', {name: 'Accept'})).toBeEnabled();
    expect(api.calls(TARGETS)).toHaveLength(2);
  });

  it('says why a waiting proposal could not be accepted from here', async () => {
    const acceptMeridian = 'POST /api/extraction-candidates/cand-meridian/review';
    mockApi({[TARGETS]: targets(), [acceptMeridian]: {status: 400, body: {detail: 'A likely canonical entity match exists; review identity before accepting this proposal'}}});
    wrap(<IdentifierOwner candidateId="cand-email" kind="email" note="checked" onReviewed={vi.fn()}/>);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Accept “Meridian Holdings Ltd” first'}));
    await screen.findByText(/Review “Meridian Holdings Ltd” in its own proposal first: A likely canonical entity match exists/);
    expect(screen.getByRole('button', {name: 'Accept'})).toBeDisabled();
  });

  it('chooses another entity of the investigation, rejects, and says when nothing can hold it', async () => {
    const api = mockApi({[TARGETS]: targets({document_entities: [], document_proposals: []}), [REVIEW_EMAIL]: accepted('cand-email', 'identifier')});
    const onReviewed = vi.fn();
    wrap(<IdentifierOwner candidateId="cand-email" kind="phone" note="checked" onReviewed={onReviewed}/>);
    await screen.findByText('Which entity does this phone number belong to?');
    const user = userEvent.setup();
    // Opened from the keyboard, as tests/test-security.test.tsx opens its Select.
    (await screen.findByRole('combobox')).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Aaron Other · Person'}));
    await user.click(screen.getByRole('button', {name: 'Accept'}));
    expect(api.lastBody(REVIEW_EMAIL)).toEqual({decision: 'accept', note: 'checked', target_entity_id: 'ent-other'});

    cleanup();
    api.add({[TARGETS]: targets({document_entities: [], document_proposals: [], other_entities: []}), [REVIEW_EMAIL]: {status: 409, body: {detail: 'Candidate has already been reviewed'}}});
    wrap(<IdentifierOwner candidateId="cand-email" kind="email" note="checked" onReviewed={onReviewed}/>);
    await screen.findByText('No person, company or organisation can hold it yet: accept one from this document, or add one, first.');
    await user.click(screen.getByRole('button', {name: 'Reject'}));
    await screen.findByText(/Candidate has already been reviewed/);
    expect(api.lastBody(REVIEW_EMAIL)).toEqual({decision: 'reject', note: 'checked'});
  });

  it('says when the choices cannot be loaded', async () => {
    mockApi({[TARGETS]: {status: 400, body: {detail: 'This proposal is not an email address or phone number'}}});
    wrap(<IdentifierOwner candidateId="cand-email" kind="email" note="checked" onReviewed={vi.fn()}/>);
    await screen.findByText(/This proposal is not an email address or phone number/);
  });
});

describe('DocumentsPanel and OpenAleph\'s names', () => {
  async function renderPanel(documents: unknown[] = [docFixture()]) {
    const api = mockApi({[DOCUMENTS]: documents, 'GET /api/investigations/inv-1/entities': [entityFixture('ent-jane', 'Jane Doe', 'Person')],
      'GET /api/investigations/inv-1/graph': emptyGraph(), 'GET /api/investigations/inv-1/corpus/status': corpusStatusBody('inv-1'), 'GET /api/document-formats': documentFormatsBody(),
      'GET /api/investigations/inv-1/drop': dropBody('inv-1')});
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    await screen.findByTestId('document-doc-1');
    return api;
  }
  /** The OpenAleph actions the chosen file's menu offers, the menu left open. */
  async function openAlephMenu(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
    await user.click(within(screen.getByTestId('library-pane')).getByRole('button', {name: /^OpenAleph/}));
    return screen.getAllByRole('menuitem').map(item => item.textContent ?? '');
  }

  it('finds names again for a document OpenAleph holds, following the job, then shows the new proposals', async () => {
    const api = await renderPanel([docFixture(), docFixture({id: 'doc-2', filename: 'local.txt', openaleph_document_id: null})]);
    const user = userEvent.setup();
    // Only a document OpenAleph holds offers it, in its pane's OpenAleph menu.
    await user.click(screen.getByRole('button', {name: 'local.txt'}));
    expect(await openAlephMenu(user)).not.toContain('Find names again');
    await user.click(screen.getByRole('button', {name: 'memo.txt'}));
    expect(await openAlephMenu(user)).toContain('Find names again');
    const analyze = 'POST /api/documents/doc-1/openaleph/analyze';
    let polls = 0;
    api.add({
      [analyze]: {status: 202, body: job()},
      'GET /api/jobs/job-a': () => (++polls === 1 ? job({status: 'running', progress: 40, message: 'OpenAleph is finding names'})
        : job({status: 'succeeded', finished: true, progress: 100, message: '1 name(s) from OpenAleph'})),
      [CANDIDATES]: [candidate('cand-new', 'entity', {caption: 'Angela Merkel', suggested_schema: 'Person'})],
    });
    await user.click(screen.getByRole('menuitem', {name: 'Find names again'}));
    await screen.findByText('Angela Merkel');
    expect(api.calls(analyze)).toHaveLength(1);
    expect(api.calls('GET /api/jobs/job-a')).toHaveLength(2);
    expect(api.calls(DOCUMENTS)).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('says why OpenAleph could not find names again', async () => {
    const api = await renderPanel();
    api.add({'POST /api/documents/doc-1/openaleph/analyze': job({status: 'failed', finished: true, error: "OpenAleph's name-finding is switched off on this OpenAleph"})});
    const user = userEvent.setup();
    await openAlephMenu(user);
    await user.click(screen.getByRole('menuitem', {name: 'Find names again'}));
    await screen.findByText("memo.txt: Failed: OpenAleph's name-finding is switched off on this OpenAleph");
    api.add({'POST /api/documents/doc-1/openaleph/analyze': {status: 409, body: {detail: 'This document is not in OpenAleph, so OpenAleph cannot look for names in it'}}});
    await openAlephMenu(user);
    await user.click(screen.getByRole('menuitem', {name: 'Find names again'}));
    await screen.findByText(/This document is not in OpenAleph/);
  });

  it('asks what kind of entity a name is before accepting it, and whose an email is', async () => {
    const api = await renderPanel();
    const reviewName = 'POST /api/extraction-candidates/cand-name/review';
    api.add({[CANDIDATES]: [unknownName, emailProposal], [TARGETS]: targets(), [reviewName]: accepted('cand-name', 'entity'),
      [REVIEW_EMAIL]: accepted('cand-email', 'identifier')});
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Review proposals'}));
    const question = await screen.findByTestId('clarify-cand-name');
    expect(question).toHaveTextContent('What kind of entity is "Audit Desk"? OpenAleph found the name but not what it is.');
    expect(within(question).queryByText(/suggested/)).not.toBeInTheDocument();
    const [acceptName] = screen.getAllByRole('button', {name: 'Accept'});
    expect(acceptName).toBeDisabled();
    await user.click(within(question).getByRole('button', {name: 'Organization'}));
    expect(acceptName).toBeEnabled();
    await user.click(acceptName);
    expect(api.lastBody(reviewName)).toEqual({decision: 'accept', note: 'Reviewed in Next.js workbench', caption: 'Audit Desk', entity_schema: 'Organization'});
    await screen.findByText('entity proposal accepted. Its document/chunk/review lineage is retained for provenance tracing.');

    const owner = await screen.findByTestId('owner-cand-email');
    await user.click(await within(owner).findByRole('button', {name: 'Jane Doe · Person'}));
    await user.click(within(owner).getByRole('button', {name: 'Accept'}));
    await screen.findByText('identifier proposal accepted. Its document/chunk/review lineage is retained for provenance tracing.');
    expect(api.lastBody(REVIEW_EMAIL)).toEqual({decision: 'accept', note: 'Reviewed in Next.js workbench', target_entity_id: 'ent-jane'});
    expect(screen.queryByTestId('owner-cand-email')).not.toBeInTheDocument();
  });
});

describe('Review queue and OpenAleph\'s names', () => {
  async function importReviewPage(): Promise<() => ReactElement> {
    vi.resetModules();
    const mod = await import('../app/review/page');
    return mod.default;
  }

  it('asks the open kind question and whose an email is, and counts both decisions', async () => {
    searchParamsRef.current = new URLSearchParams('inv=inv-1&docs=doc-1');
    const reviewName = 'POST /api/extraction-candidates/cand-name/review';
    const acceptMeridian = 'POST /api/extraction-candidates/cand-meridian/review';
    const meridian = candidate('cand-meridian', 'entity', {caption: 'Meridian Holdings Ltd', suggested_schema: 'Company'});
    const api = mockApi({
      'GET /api/documents/doc-1': {...docFixture(), chunks: []},   // the document's detail carries its chunks
      [CANDIDATES]: [unknownName, meridian, emailProposal],
      [TARGETS]: targets(),
      [reviewName]: accepted('cand-name', 'entity'),
      [acceptMeridian]: {candidate: candidate('cand-meridian', 'entity', {}, {review_status: 'accepted'}), record: {id: 'ent-meridian'}},
      [REVIEW_EMAIL]: accepted('cand-email', 'identifier'),
    });
    const ReviewPage = await importReviewPage();
    render(<ReviewPage/>);
    const card = await screen.findByTestId('candidate-cand-name');
    const user = userEvent.setup();
    expect(within(card).getByRole('button', {name: 'Accept'})).toBeDisabled();
    await user.click(within(card).getByRole('button', {name: 'Not sure (LegalEntity)'}));
    await user.click(within(card).getByRole('button', {name: 'Accept'}));
    expect(api.lastBody(reviewName)).toMatchObject({decision: 'accept', caption: 'Audit Desk', entity_schema: 'LegalEntity'});

    // Accepting Meridian from the email's owner choice also takes it off the queue.
    const owner = await screen.findByTestId('owner-cand-email');
    await user.click(await within(owner).findByRole('button', {name: 'Accept “Meridian Holdings Ltd” first'}));
    await screen.findByText('“Meridian Holdings Ltd” accepted; it is chosen as the owner.');
    expect(screen.queryByTestId('candidate-cand-meridian')).not.toBeInTheDocument();
    await user.click(within(owner).getByRole('button', {name: 'Accept'}));
    expect(api.lastBody(REVIEW_EMAIL)).toMatchObject({decision: 'accept', target_entity_id: 'ent-meridian'});
    await screen.findByText('Nothing left to review in this document.');
    expect(screen.getByText(/3 accepted · 0 rejected this session/)).toBeInTheDocument();
  });
});
