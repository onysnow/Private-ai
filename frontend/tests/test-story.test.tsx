// @vitest-environment jsdom
// Act › Story (mockup ACT_2): the sentences counted as the server counts them, the write-up's sentence marks, and the
// tree with its critical path, gates and Ready to run.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {sentencesOf} from '../features/story/sentences';
import {StoryScreen} from '../features/story/story-screen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

// next/dynamic loads the editor and a version's read-only text; here each is a stub that shows what it was given and
// stands in for what the real one reports (a citation clicked, what the text holds).
type StubProps = {claims?: Array<{n: number; text: string}>; content?: unknown; onOpenPassage?: (id: string) => void; onDoc?: (info: unknown) => void};
vi.mock('next/dynamic', () => ({default: () => (props: StubProps) => props.content
  ? <div data-testid="version-stub">{JSON.stringify(props.content)}</div>
  : <div data-testid="editor-stub">{(props.claims ?? []).map(c => `${c.n}:${c.text}`).join('|')}
    <button type="button" onClick={() => props.onOpenPassage?.('c1')}>stub: click citation 1</button>
    <button type="button" onClick={() => props.onDoc?.({cited: ['c1'], words: 40, paragraphs: 4, aiDrafted: 1, aiOpen: 1})}>stub: text read</button></div>}));

describe('sentences', () => {
  it('counts a sentence without a citation, and gives a citation after the full stop to the sentence before it', () => {
    const s = sentencesOf([
      {kind: 'text', text: 'The council sold the land in 2017.', pos: 1},
      {kind: 'cite', recordId: 'c1', pos: 35},
      {kind: 'text', text: ' The sale was not put out to tender. Every share is held by Harbour Nominees ', pos: 36},
      {kind: 'cite', recordId: 'c2', pos: 113},
      {kind: 'text', text: '.', pos: 114},
    ]);
    expect(s.map(x => [x.cited, x.claims])).toEqual([[true, ['c1']], [false, []], [true, ['c2']]]);
    expect(s[1].from).toBe(37);
    expect(s[2].to).toBe(115);
  });
  it('does not end a sentence at an initial or a title (as the server counts them)', () => {
    const s = sentencesOf([
      {kind: 'text', text: 'M. Ross, named by Dr. Weber, was paid ', pos: 1},
      {kind: 'cite', recordId: 'c5', pos: 39},
      {kind: 'text', text: '. The money went on, e.g. to Kestrel SA.', pos: 40},
    ]);
    expect(s.map(x => [x.from, x.cited])).toEqual([[1, true], [42, false]]);
  });
  it('ends a sentence at a label after a capitalised word ("Schedule A."), so its missing source shows', () => {
    const s = sentencesOf([
      {kind: 'text', text: 'The filing was Schedule A. The owners were listed ', pos: 1},
      {kind: 'cite', recordId: 'c1', pos: 51},
    ]);
    expect(s.map(x => [x.from, x.cited])).toEqual([[1, false], [28, true]]);
    const initials = sentencesOf([{kind: 'text', text: 'The bank paid J. R. Weber and later M. Ross ', pos: 1}, {kind: 'cite', recordId: 'c2', pos: 45}]);
    expect(initials.map(x => x.cited)).toEqual([true]);
  });
  it('reads a title split by formatting as one word ("Dr" in bold, then ". Reed")', () => {
    const s = sentencesOf([
      {kind: 'text', text: 'Dr', pos: 1},
      {kind: 'text', text: '. Reed was paid ', pos: 3},
      {kind: 'cite', recordId: 'c3', pos: 19},
      {kind: 'text', text: '.', pos: 20},
    ]);
    expect(s.map(x => x.cited)).toEqual([true]);
  });
});

const claim = (id: string, text: string, state: string, evidence: unknown[] = []) => ({id, text, status: state === 'shown' ? 'supported' : state === 'disputed' ? 'disputed' : 'unverified',
  state, evidence, single_source: evidence.length === 1 && state === 'shown'});
const gate = (key: string, label: string, state: string, detail: string) => ({key, label, state, detail});
const STORY = {
  id: 's1', investigation_id: 'inv-1', thesis: 'Kestrel SA ended up with the harbour land', writeup_id: null,
  sections: [
    {id: 'sec1', title: 'Who bought the land', position: 0, status: 'unshown', shown: 1, total: 2, claims: [
      claim('c1', 'Fernhill Ltd bought the harbour land in November 2017', 'shown', [{id: 'e1', stance: 'supports', label: 'Land registry', locator: 'title ML-2017', quote: 'transferred to Fernhill Ltd'}]),
      claim('c2', 'The sale was not put out to tender', 'unshown')]},
    {id: 'sec2', title: 'Where the money went', position: 1, status: 'disputed', shown: 0, total: 1, claims: [
      claim('c3', 'M. Ross was a director of both companies', 'disputed', [{id: 'e2', stance: 'contradicts', label: 'Kestrel annual report', locator: 'p.11'}])]},
  ],
  counts: {claims: 3, shown: 1, disputed: 1, unshown: 1},
  critical: [{claim_id: 'c2', text: 'The sale was not put out to tender', section: 'Who bought the land'}],
  gates: [gate('sources', 'Every sentence has a source', 'pending', 'no write-up yet'), gate('innocent', 'Innocent explanations addressed', 'open', 'ML-021: 2 open'),
    gate('single', 'Single-source statements marked', 'warning', '1 claim rests on one record'), gate('right_of_reply', 'Right of reply sent', 'open', 'not recorded'),
    gate('legal_read', 'Legal read', 'open', 'no one assigned')],
  gates_passed: 0, sentences: {total: 0, uncited: 0}, ready: null, can_ready: false,
  unplaced: [{id: 'c4', text: 'Harbour Nominees paid Fernhill Ltd four times', status: 'unverified', state: 'unshown'}],
};
const PATH = '/api/investigations/inv-1/story';

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => cleanup());

describe('StoryScreen', () => {
  it('draws the thesis, sections and claims with the critical path, and keeps Ready to run until every gate passes', async () => {
    mockApi({[`GET ${PATH}`]: STORY});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByRole('heading', {name: 'Kestrel SA ended up with the harbour land'})).toBeInTheDocument();
    expect(screen.getByLabelText('Readiness')).toHaveTextContent('1 of 3 claims shown · 1 disputed · 1 not yet shown · 5 gates open');
    const tree = screen.getByRole('tree', {name: 'What the story needs'});
    expect(within(tree).getByRole('treeitem', {name: 'Section 1: Who bought the land, 1 of 2 shown'})).toBeInTheDocument();
    // The critical path is the claim's outline and a ▲ mark, named on reveal (and in the claim's name).
    const critical = within(tree).getByRole('treeitem', {name: 'Claim, not yet shown, The sale was not put out to tender, on the critical path'});
    expect(critical).toHaveClass('critical');
    expect(critical.querySelector('.sy-cp')).toHaveTextContent('▲');
    expect(screen.getByText(/Blocked by: The sale was not put out to tender/)).toBeInTheDocument();
    // The evidence chip shows its label; the locator waits in a reveal.
    expect(within(tree).getByText('Land registry')).toBeVisible();
    expect(within(tree).queryByText(/title ML-2017/)).toBeNull();
    const gates = screen.getByRole('region', {name: 'Gates'});
    expect(within(gates).getByText('Gates · 0 of 5 passed')).toBeInTheDocument();
    expect(within(gates).getByRole('button', {name: 'Ready to run'})).toBeDisabled();
    // The gates sit under the thesis (mockup ACT_2), beside the tree, not inside it.
    expect(gates.closest('.sy-col-thesis')).not.toBeNull();
    expect(tree.contains(gates)).toBe(false);
    expect(screen.getByRole('button', {name: 'Export for publication'})).toBeDisabled();
    expect(screen.getByText('Start the write-up first')).toBeInTheDocument();
  });

  it('puts a claim under a section, records a gate, and starts the write-up with the claims numbered for citing', async () => {
    const withWriteup = {...STORY, writeup_id: 'w1', sentences: {total: 4, uncited: 1}};
    const api = mockApi({[`GET ${PATH}`]: STORY, [`POST ${PATH}/sections/sec1/claims`]: STORY,
      [`PUT ${PATH}/gates`]: STORY, [`POST ${PATH}/writeup`]: withWriteup});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', {name: 'Put a claim under “Who bought the land”'}), 'c4');
    await waitFor(() => expect(api.lastBody(`POST ${PATH}/sections/sec1/claims`)).toEqual({claim_id: 'c4'}));
    const gates = screen.getByRole('region', {name: 'Gates'});
    const reply = within(gates).getByText('Right of reply sent').closest('li')!;
    await user.click(within(reply).getByRole('button', {name: 'Record'}));
    await user.type(within(reply).getByRole('textbox', {name: 'Sent to'}), 'Kestrel SA press office');
    await user.type(within(reply).getByLabelText('On'), '2026-10-11');
    await user.click(within(reply).getByRole('button', {name: 'Record'}));
    await waitFor(() => expect(api.lastBody(`PUT ${PATH}/gates`)).toEqual({gate: 'right_of_reply', who: 'Kestrel SA press office', on: '2026-10-11'}));
    await user.click(screen.getByRole('button', {name: 'Start the write-up'}));
    expect(await screen.findByTestId('editor-stub')).toHaveTextContent('1:Fernhill Ltd bought the harbour land in November 2017|2:The sale was not put out to tender|3:M. Ross was a director of both companies');
    expect(screen.getByText('1 sentence needs a source')).toBeInTheDocument();
  });

  it('asks for the thesis first when the story has none', async () => {
    const api = mockApi({[`GET ${PATH}`]: {...STORY, id: null, thesis: '', sections: [], critical: []}, [`PUT ${PATH}`]: STORY});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Write the one sentence this story says'), 'Kestrel SA ended up with the harbour land');
    await user.click(screen.getByRole('button', {name: 'Set the thesis'}));
    await waitFor(() => expect(api.lastBody(`PUT ${PATH}`)).toEqual({thesis: 'Kestrel SA ended up with the harbour land'}));
  });
});

const WRITTEN = {...STORY, writeup_id: 'w1', sentences: {total: 4, uncited: 2}, version: {id: 'v2', writeup_id: 'w1', name: 'Before legal read', kind: 'named', word_count: 214, created_at: '2026-10-10T09:00:00'}};
const VERSIONS = {writeup_id: 'w1', versions: [
  {id: 'v2', writeup_id: 'w1', name: 'Before legal read', kind: 'named', word_count: 214, created_at: '2026-10-10T09:00:00'},
  {id: 'v1', writeup_id: 'w1', name: null, kind: 'auto', word_count: 180, created_at: '2026-10-09T15:20:00'},
]};
const DOC = {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'An older text.'}]}]};
const WRITEUP = {id: 'w1', investigation_id: 'inv-1', title: 'Who bought the harbour?', status: 'draft', cited_record_refs: [], source_ai_candidate_id: null,
  created_by: null, created_at: '2026-10-09T10:00:00', updated_at: '2026-10-10T10:42:00', word_count: 3, content_json: DOC};
const note = (id: string, text: string) => ({id, record_type: 'story', record_id: 's1', caption: 'Kestrel SA ended up with the harbour land', chart_ref: null, text,
  lead_id: null, created_at: '2026-10-10T08:00:00', updated_at: '2026-10-10T08:00:00'});
const NOTES = 'GET /api/investigations/inv-1/notes';

describe('StoryScreen beside the write-up', () => {
  it('opens a citation’s passage beside the text and closes it with Esc', async () => {
    mockApi({[`GET ${PATH}`]: WRITTEN, [NOTES]: {investigation_id: 'inv-1', notes: []}});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'stub: click citation 1'}));
    const pane = screen.getByRole('complementary', {name: 'The passage'});
    expect(pane).toHaveTextContent('Citation 1');
    expect(pane).toHaveTextContent('Fernhill Ltd bought the harbour land in November 2017');
    // The stance is the ✓ mark, named on reveal; the label shows and the locator is on its reveal.
    expect(within(pane).getByRole('img', {name: 'Supports'})).toHaveTextContent('✓');
    expect(within(pane).getByText('Land registry').closest('.rv')).toHaveAccessibleDescription('title ML-2017');
    expect(within(pane).getByText('transferred to Fernhill Ltd')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', {name: 'The passage'})).not.toBeInTheDocument();
  });

  it('lets a claim of the tree be dragged into the write-up once it is started', async () => {
    mockApi({[`GET ${PATH}`]: WRITTEN, [NOTES]: {investigation_id: 'inv-1', notes: []}});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    const item = await screen.findByRole('treeitem', {name: 'Claim, not yet shown, The sale was not put out to tender, on the critical path'});
    expect(item).toHaveAttribute('draggable', 'true');
    const setData = vi.fn();
    fireEvent.dragStart(item, {dataTransfer: {setData, effectAllowed: 'all'}});
    expect(setData).toHaveBeenCalledWith('application/x-story-claim', 'c2');
  });

  it('keeps notes on the story: adds one and deletes one after asking', async () => {
    const api = mockApi({[`GET ${PATH}`]: WRITTEN, [NOTES]: {investigation_id: 'inv-1', notes: [note('n1', 'Ask the council for the tender file')]},
      'POST /api/investigations/inv-1/notes': note('n2', 'The editor wants the ledger row'),
      'DELETE /api/notes/n1': {investigation_id: 'inv-1', notes: []}});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Notes · 1'}));
    expect(api.lastUrl(NOTES).searchParams.get('record_type')).toBe('story');
    expect(api.lastUrl(NOTES).searchParams.get('record_id')).toBe('s1');
    const list = screen.getByRole('list', {name: 'Notes on the story'});
    expect(within(list).getByText('Ask the council for the tender file')).toBeInTheDocument();
    await user.type(screen.getByLabelText('A note on the story'), 'The editor wants the ledger row');
    await user.click(screen.getByRole('button', {name: 'Add note'}));
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/notes')).toEqual({text: 'The editor wants the ledger row', record_type: 'story', record_id: 's1'}));
    await user.click(within(list).getByRole('button', {name: 'Delete the note “Ask the council for the tender file”'}));
    expect(api.calls('DELETE /api/notes/n1')).toHaveLength(0); // asked first
    await user.click(within(list).getByRole('button', {name: 'Delete'}));
    await waitFor(() => expect(api.calls('DELETE /api/notes/n1')).toHaveLength(1));
  });

  it('lists the versions, names one, reads one read-only, and restores it only after asking', async () => {
    const api = mockApi({[`GET ${PATH}`]: WRITTEN, [NOTES]: {investigation_id: 'inv-1', notes: []},
      [`GET ${PATH}/versions`]: VERSIONS, [`POST ${PATH}/versions`]: VERSIONS.versions[0],
      [`GET ${PATH}/versions/v1`]: {...VERSIONS.versions[1], content_json: DOC},
      [`POST ${PATH}/versions/v1/restore`]: WRITEUP});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    // Which version the draft is waits in the reveal on Version history.
    expect(await screen.findByRole('button', {name: 'Version history'})).toHaveAccessibleDescription(/version “Before legal read”/);
    await user.click(screen.getByRole('button', {name: 'Version history'}));
    const pane = screen.getByRole('complementary', {name: 'Version history'});
    const list = await within(pane).findByRole('list', {name: 'Versions, newest first'});
    expect(within(list).getAllByRole('button').map(b => b.textContent)).toEqual([
      expect.stringContaining('Before legal read'), expect.stringMatching(/^◇Automatic · /)]);
    // Kind, time and words are revealed on the version.
    expect(within(list).getAllByRole('button')[1]).toHaveAccessibleDescription(/^automatic · .* · 180 words$/);
    await user.type(within(pane).getByLabelText('Name the text as it stands'), 'After the lawyer');
    await user.click(within(pane).getByRole('button', {name: 'Keep'}));
    await waitFor(() => expect(api.lastBody(`POST ${PATH}/versions`)).toEqual({name: 'After the lawyer'}));

    await user.click(within(list).getAllByRole('button')[1]);
    expect(await within(pane).findByTestId('version-stub')).toHaveTextContent('An older text.');
    expect(within(pane).getByText(/read-only/)).toBeInTheDocument();
    await user.click(within(pane).getByRole('button', {name: 'Restore this version…'}));
    const ask = within(pane).getByRole('group', {name: 'Restore this version?'});
    expect(ask).toHaveTextContent('The text there now is kept first');
    expect(api.calls(`POST ${PATH}/versions/v1/restore`)).toHaveLength(0);
    await user.click(within(ask).getByRole('button', {name: 'Restore'}));
    await waitFor(() => expect(api.calls(`POST ${PATH}/versions/v1/restore`)).toHaveLength(1));
    expect(await within(pane).findByRole('list', {name: 'Versions, newest first'})).toBeInTheDocument();
  });

  it('opens the Export sheet: publication stays disabled with its reason, and the checks list what is left', async () => {
    mockApi({[`GET ${PATH}`]: WRITTEN, [NOTES]: {investigation_id: 'inv-1', notes: []}});
    render(<QueryProvider><StoryScreen investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'stub: text read'}));
    expect(screen.getByText(/drafted with AI/).closest('span')).toHaveTextContent('AI use 1 of 4 paragraphs drafted with AI');
    expect(screen.getByText('2 sentences need a source')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Export for publication'}));
    const sheet = screen.getByRole('dialog', {name: 'Export'});
    expect(within(sheet).getByRole('button', {name: 'Export the .docx'})).toBeDisabled();
    expect(within(sheet).getByText('○ 2 sentences need a source')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', {name: 'Export the pack'})).toBeDisabled();
    expect(within(sheet).getByRole('button', {name: 'Download the backup'})).toBeEnabled();
    const checks = within(sheet).getByRole('region', {name: 'Before it leaves this computer'});
    expect(checks).toHaveTextContent('2 sentences without a source');
    expect(checks).toHaveTextContent('1 AI-drafted paragraph not yet kept by you');
    expect(checks).toHaveTextContent('Single-source: 1 claim rests on one record');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', {name: 'Export'})).not.toBeInTheDocument();
  });
});
