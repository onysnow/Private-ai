// @vitest-environment jsdom
// The reading room: the text with what was found marked, margin cards answered with 1/2,
// selected words kept as evidence with a self-checking clip, pages and find.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ReadingRoom, acceptImpact, clipOf, kindWord, proposalText, sameReason} from '../features/reading-room/reading-room';
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

  it('names an identifier by its value: email or phone number', () => {
    const id = (value: string) => ({...name, candidate_type: 'identifier', payload: {value}}) as unknown as ExtractionCandidateOut;
    expect(kindWord(id('ana@harbour.example'))).toBe('Email address');
    expect(kindWord(id('+44 20 7946 0000'))).toBe('Phone number');
    expect(kindWord(name as unknown as ExtractionCandidateOut)).toBe('Name');
  });

  it('says why a record may be the same, and what accepting adds', () => {
    expect(sameReason('Harbour Nominees Ltd', 'Harbour Nominees Limited', 'the same name')).toBe('Same name: “Ltd” and “Limited” read as one');
    expect(sameReason('Kestrel SA', 'Kestrel SA', 'the same name')).toBe('Same name, word for word');
    expect(sameReason('Kestrel', 'Kestrel Holdings', 'a similar name')).toBe('A similar name');
    const c = name as unknown as ExtractionCandidateOut;
    expect(acceptImpact(c, {}, {locator: 'p.4 ¶1', mentions: 1})).toEqual(['Adds “Fernhill Ltd” as a new record: Company', 'Traced to p.4 ¶1']);
    expect(acceptImpact(c, {identity: {kind: 'same', entityId: 'e1'}}, {locator: 'p.4 ¶1', mentions: 3, record: 'Fernhill Limited'})[0])
      .toBe('Adds the 3 places this document names it to Fernhill Limited; no new record');
    expect(acceptImpact(c, {schema: 'Person', identity: {kind: 'new'}}, {locator: 'p.4 ¶1', mentions: 1, strong: 'Fernhill Limited'}))
      .toEqual(['Adds “Fernhill Ltd” as a new record: Person', 'Traced to p.4 ¶1', 'Kept apart from Fernhill Limited: you said it is a different one']);
    const claim = {...c, candidate_type: 'claim', payload: {text: 'The board agreed.'}} as ExtractionCandidateOut;
    expect(acceptImpact(claim, {}, {locator: 'p.3 ¶3', mentions: 0})).toEqual(['Adds the claim to test, Not yet shown', 'Keeps these words, p.3 ¶3, as its supporting evidence']);
  });
});

describe('ReadingRoom', () => {
  it('says how legible an OCR page was and which languages OpenAleph detected, and says so when neither is known', async () => {
    const scanned = {...doc, languages: [{code: 'eng', name: 'English'}, {code: 'fra', name: 'French'}],
      chunks: [{...doc.chunks[0], locator: 'page 4 (OCR)', ocr_legibility: 91.4}]};
    routes({'GET /api/documents/d1': scanned});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const room = await screen.findByRole('dialog', {name: 'Reading room: minutes.pdf'});
    // The page shows a mark with its number and the language codes; the words are on hover (Ony, 29 Oct).
    expect(await within(room).findByText('91%')).toBeVisible();
    expect(within(room).getByText('EN · FR')).toBeVisible();
    expect(within(room).getByText('Read by OCR · 91% legible').closest('[hidden]')).not.toBeNull();
    expect(within(room).getByText('English · French').closest('[hidden]')).not.toBeNull();
    expect(within(room).getByText('Detected by OpenAleph when it read the document').closest('[hidden]')).not.toBeNull();
    cleanup();

    routes({'GET /api/documents/d1': {...doc, chunks: [{...doc.chunks[0], locator: 'page 4 (OCR)'}]}});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const again = await screen.findByRole('dialog', {name: 'Reading room: minutes.pdf'});
    expect((await within(again).findByText('Read by OCR · legibility not measured')).closest('[hidden]')).not.toBeNull();
    expect(within(again).getByText('Language not detected').closest('[hidden]')).not.toBeNull();
  });

  it('marks what was found, accepts a proposal with A after a moment to undo it, and sends it on closing', async () => {
    const api = routes({'POST /api/extraction-candidates/x1/review': {candidate: {...name, review_status: 'accepted'}, record: null}});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const room = await screen.findByRole('dialog', {name: 'Reading room: minutes.pdf'});
    expect(await within(room).findByText('Fernhill Ltd', {selector: '.rr-span'})).toBeInTheDocument();
    expect(within(room).getByRole('button', {name: /^Page 4/})).toHaveAttribute('aria-current', 'true');
    const card = within(room).getByRole('article', {name: 'Name: Fernhill Ltd'});
    expect(within(card).getByText('Name-finder (rules) · p.4 ¶1').closest('[hidden]')).not.toBeNull();  // on hover of the dots
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

  it('counts only what the margin shows, and points whole-passage quotes to Decide', async () => {
    const quote = (id: string, status: string) => ({...name, id, candidate_type: 'evidence', review_status: status,
      payload: {quote: TEXT, rationale: {rule: 'sentence_assertion'}}});
    routes({'GET /api/documents/d1/candidates': [name, quote('q1', 'proposed'), quote('q2', 'proposed'), quote('q3', 'accepted')]});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const room = await screen.findByRole('dialog', {name: 'Reading room: minutes.pdf'});
    await within(room).findByRole('article', {name: 'Name: Fernhill Ltd'});
    expect(room.querySelector('.rr-foot')).toHaveTextContent('0 accepted · 0 rejected · 1 waiting');
    expect(within(room).getByRole('link', {name: '2 whole-passage quotes wait in Decide'})).toHaveAttribute('href', '/decide?kind=proposal&inv=inv-1');
  });

  it('leaves out the pointer to Decide when no whole-passage quote waits', async () => {
    routes();
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const room = await screen.findByRole('dialog', {name: 'Reading room: minutes.pdf'});
    await within(room).findByRole('article', {name: 'Name: Fernhill Ltd'});
    expect(within(room).queryByRole('link', {name: /whole-passage/})).not.toBeInTheDocument();
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
    // Held 6 s with Undo, like a decision (mockup INTAKE_2: "saved just now · Undo"); U takes it back.
    let clip = await screen.findByRole('region', {name: 'Evidence clip'});
    expect(within(clip).getByText('saved in a moment')).toBeInTheDocument();
    expect(within(clip).getByText('bought on behalf', {selector: 'mark'})).toBeInTheDocument();
    expect(within(clip).getByText(/the words are in the stored text/)).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'u'});
    expect(screen.queryByRole('region', {name: 'Evidence clip'})).toBeNull();
    expect(api.calls('POST /api/evidence')).toHaveLength(0);
    // Kept again, it is saved after its moment (here: on closing the room).
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(passage);
    fireEvent.keyDown(window, {key: 'e'});
    clip = await screen.findByRole('region', {name: 'Evidence clip'});
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(api.calls('POST /api/evidence')).toHaveLength(1));
    // document_id is for pictures only: the backend answers 400 to it on a text document.
    expect(api.lastBody('POST /api/evidence')).toEqual({source_id: 'src-1', quote: 'bought on behalf', locator: 'page 4'});
  });

  it('lights a card and its words together, says what a name would be, and reads its status in words', async () => {
    routes();
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const card = await screen.findByRole('article', {name: 'Name: Fernhill Ltd'});
    expect(card).toHaveTextContent('Fernhill Ltd · Company');
    const words = await screen.findByText('Fernhill Ltd', {selector: '.rr-span'});
    fireEvent.mouseEnter(card);
    expect(words).toHaveClass('lit');
    fireEvent.mouseLeave(card);
    expect(words).not.toHaveClass('lit');
    fireEvent.mouseEnter(words);
    expect(card).toHaveClass('lit');
    await userEvent.setup().click(screen.getByRole('tab', {name: 'Details'}));
    expect(screen.getByText('Read', {selector: 'dd'})).toBeInTheDocument();
  });

  it('shows what accepting changes on the Accept button', async () => {
    routes();
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const card = await screen.findByRole('article', {name: 'Name: Fernhill Ltd'});
    const accept = within(card).getByRole('button', {name: /^Accept/});
    expect(accept).toHaveAccessibleDescription(/What changes if you accept.*Adds “Fernhill Ltd” as a new record: Company.*Traced to p\.4 ¶1/);
    expect(within(card).getByRole('tooltip')).toHaveTextContent('Nothing else in the case changes.');
  });

  const match = {entity_id: 'e1', caption: 'Fernhill Limited', schema: 'Company', score: 0.95, name_similarity: 0.95, basis: 'same_name', facts: 14};
  const sameRoutes = (extra = {}) => routes({
    'GET /api/extraction-candidates/x1/entity-matches': {candidate_id: 'x1', caption: 'Fernhill Ltd', schema: 'Company', matches: [match], strong_match: match,
      provider_lead: {provider: null, provider_entity_id: null, provider_resolved_entity_id: null}, identity_rule: 'same name'},
    'GET /api/extraction-candidates/x1/same-answer': {candidate_id: 'x1', caption: 'Fernhill Ltd', scope: 'drop', label: 'minutes.pdf and 2 more', candidates: [
      {candidate_id: 'y1', caption: 'Fernhill Limited', document_id: 'd2', filename: 'letter.eml', locator: 'body ¶2'},
      {candidate_id: 'y2', caption: 'FERNHILL LTD', document_id: 'd3', filename: 'ledger.xlsx', locator: null}]},
    'POST /api/extraction-candidates/y1/review': {candidate: {...name, id: 'y1', review_status: 'accepted'}, record: null},
    'POST /api/extraction-candidates/y2/review': {candidate: {...name, id: 'y2', review_status: 'accepted'}, record: null},
    ...extra,
  });

  it('shows the record already in the case, and offers the same answer to the other mentions in the drop', async () => {
    const api = sameRoutes();
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const card = await screen.findByRole('article', {name: 'Name: Fernhill Ltd'});
    const known = await within(card).findByLabelText('Already in the case: Fernhill Limited');
    expect(known).toHaveTextContent('Company · 14 facts in the case');
    expect(known).toHaveTextContent('✓ Same name: “Ltd” and “Limited” read as one');
    expect(within(card).getByRole('button', {name: /^Accept/})).toBeDisabled();
    await userEvent.setup().click(card);
    fireEvent.keyDown(window, {key: '1'});
    expect(within(card).getByRole('button', {name: /^Accept/})).toHaveAccessibleDescription(/Adds p\.4 ¶1 to Fernhill Limited; no new record/);
    const offer = await within(card).findByRole('group', {name: 'Same answer for the others'});
    expect(offer).toHaveTextContent('Same answer for 2 more mentions in this drop? Fernhill Ltd = Fernhill Limited');
    expect(offer).toHaveTextContent('“Fernhill Limited” · letter.eml, body ¶2');
    await userEvent.setup().click(within(offer).getByRole('button', {name: 'Apply to these 2'}));
    expect(screen.getByText(/2 more mentions go to Fernhill Limited in a moment/)).toBeInTheDocument();
    expect(api.calls('POST /api/extraction-candidates/y1/review')).toHaveLength(0);  // held 6 s, like every decision
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(api.calls('POST /api/extraction-candidates/y2/review')).toHaveLength(1));
    expect(api.lastBody('POST /api/extraction-candidates/y1/review')).toEqual({decision: 'accept', entity_schema: 'Company', entity_identity_decision: 'same', matched_entity_id: 'e1'});
  });

  it('takes the same answer back with U', async () => {
    const api = sameRoutes();
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const card = await screen.findByRole('article', {name: 'Name: Fernhill Ltd'});
    await within(card).findByLabelText('Already in the case: Fernhill Limited');
    await userEvent.setup().click(card);
    fireEvent.keyDown(window, {key: '1'});
    const offer = await within(card).findByRole('group', {name: 'Same answer for the others'});
    await userEvent.setup().click(within(offer).getByRole('button', {name: 'Apply to these 2'}));
    // Said in the card where the offer was, so it is seen.
    expect(within(card).getByRole('status')).toHaveTextContent('2 more mentions go to Fernhill Limited in a moment.');
    fireEvent.keyDown(window, {key: 'u'});
    expect(await screen.findByText('Undone: the 2 other mentions still wait.')).toBeInTheDocument();
    // The offer comes back, to be made again.
    expect(within(card).getByRole('group', {name: 'Same answer for the others'})).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(api.calls('POST /api/extraction-candidates/y1/review')).toHaveLength(0);
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
