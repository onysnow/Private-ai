// @vitest-environment jsdom
// Act › Story (mockup ACT_2): the sentences counted as the server counts them, the write-up's sentence marks, and the
// tree with its critical path, gates and Ready to run.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {sentencesOf} from '../features/story/sentences';
import {StoryScreen} from '../features/story/story-screen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/dynamic', () => ({default: () => (props: {claims: Array<{n: number; text: string}>}) =>
  <div data-testid="editor-stub">{props.claims.map(c => `${c.n}:${c.text}`).join('|')}</div>}));

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
});

const claim = (id: string, text: string, state: string, evidence: unknown[] = []) => ({id, text, status: state === 'shown' ? 'supported' : state === 'disputed' ? 'disputed' : 'unverified',
  state, evidence, single_source: evidence.length === 1 && state === 'shown'});
const gate = (key: string, label: string, state: string, detail: string) => ({key, label, state, detail});
const STORY = {
  id: 's1', investigation_id: 'inv-1', thesis: 'Kestrel SA ended up with the harbour land', writeup_id: null,
  sections: [
    {id: 'sec1', title: 'Who bought the land', position: 0, status: 'unshown', shown: 1, total: 2, claims: [
      claim('c1', 'Fernhill Ltd bought the harbour land in November 2017', 'shown', [{id: 'e1', stance: 'supports', label: 'Land registry', locator: 'title ML-2017'}]),
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
    expect(within(tree).getByRole('treeitem', {name: 'Claim, not yet shown, The sale was not put out to tender'})).toHaveTextContent('Critical path');
    expect(screen.getByText(/Blocked by: The sale was not put out to tender/)).toBeInTheDocument();
    expect(within(tree).getByText('Land registry · title ML-2017')).toBeInTheDocument();
    const gates = screen.getByRole('region', {name: 'Gates'});
    expect(within(gates).getByText('Gates · 0 of 5 passed')).toBeInTheDocument();
    expect(within(gates).getByRole('button', {name: 'Ready to run'})).toBeDisabled();
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
