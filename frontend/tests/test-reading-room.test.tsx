// @vitest-environment jsdom
// The reading room: the text with what was found marked, margin cards answered with 1/2,
// selected words kept as evidence with a self-checking clip, pages and find.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ReadingRoom, clipOf, proposalText} from '../features/reading-room/reading-room';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import type {ExtractionCandidateOut} from '../lib/generated/types.gen';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/bring-in', useSearchParams: () => new URLSearchParams()}));

const TEXT = 'The parcel was bought on behalf of Fernhill Ltd by the board.';
const doc = {
  id: 'd1', investigation_id: 'inv-1', filename: 'minutes.pdf', source_id: 'src-1', mime_type: 'application/pdf', sha256: 'ab'.repeat(32), extraction_status: 'complete',
  extraction_error: null, extraction_issues: [], created_at: '2026-10-12T00:00:00', chunk_count: 1, candidate_counts: {entity: 1}, parent_document_id: null,
  chunks: [{id: 'c1', document_id: 'd1', locator: 'page 4', page_number: 4, ordinal: 1, text: TEXT, created_at: '2026-10-12T00:00:00'}],
};
const start = TEXT.indexOf('Fernhill Ltd');
const name = {id: 'x1', investigation_id: 'inv-1', document_id: 'd1', chunk_id: 'c1', candidate_type: 'entity', confidence: 0.9, review_status: 'proposed',
  payload: {caption: 'Fernhill Ltd', suggested_schema: 'Company', span: {start_char: start, end_char: start + 12}, rationale: {rule: 'capitalized_name_sequence'}}, created_at: '2026-10-12T00:00:00'};

function routes(extra = {}) {
  return mockApi({
    'GET /api/documents/d1': doc,
    'GET /api/documents/d1/candidates': [name],
    'GET /api/investigations/inv-1/documents': [doc],
    'GET /api/investigations/inv-1/tags': {investigation_id: 'inv-1', colours: [], tags: []},
    'GET /api/investigations': [],
    'GET /api/extraction-candidates/x1/entity-matches': {candidate_id: 'x1', caption: 'Fernhill Ltd', schema: 'Company', matches: [], strong_match: null,
      provider_lead: null, identity_rule: 'same name'},
    ...extra,
  });
}

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1'});
  act(() => useWorkbenchStore.getState().openDocument('d1', 4));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); act(() => useWorkbenchStore.getState().closeDocument()); });

describe('reading room helpers', () => {
  it('clips a quote with its surroundings and checks it against the stored text', () => {
    const clip = clipOf({text: TEXT, locator: 'page 4'}, start, start + 12, 'Fernhill Ltd', 'ab'.repeat(32));
    expect(clip.before).toBe(TEXT.slice(start - 32, start));
    expect(clip.after).toBe(' by the board.');
    expect(clip.anchor).toBe(`page 4 · characters ${start + 1}–${start + 12}`);
    expect(clip.checked).toBe(true);
    expect(clipOf({text: TEXT, locator: 'p'}, 0, 3, 'XYZ', 'f').checked).toBe(false);
    expect(proposalText(name as unknown as ExtractionCandidateOut)).toBe('Fernhill Ltd');
  });
});

describe('ReadingRoom', () => {
  it('marks what was found, accepts a proposal with A after a moment to undo it, and sends it on closing', async () => {
    const api = routes({'POST /api/extraction-candidates/x1/review': {candidate: {...name, review_status: 'accepted'}, record: null}});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const room = await screen.findByRole('dialog', {name: 'Reading room: minutes.pdf'});
    expect(await within(room).findByText('Fernhill Ltd', {selector: '.rr-span'})).toBeInTheDocument();
    expect(within(room).getByRole('button', {name: /^Page 4/})).toHaveAttribute('aria-current', 'true');
    const card = within(room).getByRole('article', {name: 'Name: Fernhill Ltd'});
    expect(within(card).getByText('Name-finder (rules) · p.4 ¶1')).toBeInTheDocument();
    expect(within(card).getByText('High')).toBeInTheDocument();
    await waitFor(() => expect(within(card).getByRole('button', {name: /Accept/})).toBeEnabled());
    await userEvent.setup().click(card);
    fireEvent.keyDown(window, {key: 'a'});
    expect(await within(card).findByText(/saved in a moment/)).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'u'});
    expect(within(card).getByRole('button', {name: /Accept/})).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'a'});
    expect(api.calls('POST /api/extraction-candidates/x1/review')).toHaveLength(0);
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(api.calls('POST /api/extraction-candidates/x1/review')).toHaveLength(1));
    expect(api.lastBody('POST /api/extraction-candidates/x1/review')).toEqual({decision: 'accept', entity_schema: 'Company'});
  });

  it('waits for the answer to its question before a name can be accepted', async () => {
    const unsure = {...name, confidence: 0.4, payload: {...name.payload, schema_choices: ['Person', 'Organization', 'Company']}};
    const api = routes({'GET /api/documents/d1/candidates': [unsure], 'POST /api/extraction-candidates/x1/review': {candidate: {...unsure, review_status: 'accepted'}, record: null}});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const card = await screen.findByRole('article', {name: 'Name: Fernhill Ltd'});
    expect(within(card).getByText('Low')).toBeInTheDocument();
    expect(within(card).getByRole('button', {name: /Accept/})).toBeDisabled();
    expect(within(card).getByText('Answer the question first')).toBeInTheDocument();
    await userEvent.setup().click(card);
    fireEvent.keyDown(window, {key: '3'});
    expect(within(card).getByRole('button', {name: /Company/})).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(within(card).getByRole('button', {name: /Accept/})).toBeEnabled());
    fireEvent.keyDown(window, {key: 'a'});
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(api.lastBody('POST /api/extraction-candidates/x1/review')).toMatchObject({decision: 'accept', entity_schema: 'Company'}));
  });

  it('keeps selected words as evidence and shows the clip', async () => {
    const api = routes({'POST /api/evidence': {id: 'ev-1', source_id: 'src-1', quote: 'bought on behalf', locator: 'page 4', document_id: 'd1'}});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const passage = (await screen.findByTitle('page 4')) as HTMLElement;
    const first = passage.querySelector('span')!.firstChild!;  // the first run of text
    const node = (first.nodeType === Node.TEXT_NODE ? first : first.firstChild)!;
    const range = document.createRange();
    const at = TEXT.indexOf('bought on behalf');
    range.setStart(node, at);
    range.setEnd(node, at + 'bought on behalf'.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(passage);
    expect(await screen.findByRole('toolbar', {name: 'Keep the selected words'})).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'e'});
    const clip = await screen.findByRole('region', {name: 'Evidence clip'});
    expect(within(clip).getByText('bought on behalf', {selector: 'mark'})).toBeInTheDocument();
    expect(within(clip).getByText(/the words are in the stored text/)).toBeInTheDocument();
    expect(api.lastBody('POST /api/evidence')).toEqual({source_id: 'src-1', quote: 'bought on behalf', locator: 'page 4', document_id: 'd1'});
  });

  it('finds words in the document and closes with Escape', async () => {
    routes();
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    await screen.findByTitle('page 4');
    await userEvent.setup().type(screen.getByRole('searchbox', {name: 'Find in this document'}), 'board');
    expect(screen.getByText('1 found')).toBeInTheDocument();
    expect(screen.getByText('board', {selector: 'mark'})).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(useWorkbenchStore.getState().document).toBeNull();
  });
});
