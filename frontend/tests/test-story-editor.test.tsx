// @vitest-environment jsdom
// The write-up's own pieces (features/story/editor-extensions.ts, writeup-editor.tsx; mockup ACT_2): a claim cited at
// a place in the text or dropped there from the story tree, the AI-draft mark with Keep · Undo, what the text holds,
// and a citation's hover card with its passage and "Open the passage beside the text".
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AiDraft, CLAIM_DRAG, Citation, citeAt, docInfo, draftDay, dropClaim} from '../features/story/editor-extensions';
import type {CitableClaim} from '../features/story/editor-extensions';
import {WriteupEditor, passageOf} from '../features/story/writeup-editor';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const CLAIMS: CitableClaim[] = [
  {id: 'c1', n: 1, text: 'Fernhill Ltd bought the harbour land', state: 'shown',
    evidence: [{id: 'e0', stance: 'context', label: 'Council minutes', locator: 'p.6', quote: null},
      {id: 'e1', stance: 'supports', label: 'Fernhill Ltd ledger 2020', locator: 'row 214', quote: '14/02/2020 · M ROSS · 120,000.00 · ref: —'}]},
  {id: 'c2', n: 2, text: 'The sale was not put out to tender', state: 'unshown', evidence: []},
];
const para = (text: string, attrs?: Record<string, unknown>) => ({type: 'paragraph', ...(attrs ? {attrs} : {}), content: [{type: 'text', text}]});

let editors: Editor[] = [];
function makeEditor(content: Record<string, unknown>): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({element, extensions: [StarterKit, Citation, AiDraft], content});
  editors.push(editor);
  return editor;
}

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { editors.forEach(e => e.destroy()); editors = []; cleanup(); document.body.innerHTML = ''; });

describe('citing a claim', () => {
  it('puts the chip at the place given, or inside the nearest paragraph when the place is between blocks', () => {
    const editor = makeEditor({type: 'doc', content: [para('Every share is held by Harbour Nominees.')]});
    citeAt(editor.view, CLAIMS[0], 1 + 'Every share is held by Harbour Nominees'.length);
    const inline = editor.getJSON().content![0].content!;
    expect(inline[1]).toEqual({type: 'citation', attrs: {recordType: 'claim', recordId: 'c1', label: '1'}});
    expect(inline[2]).toEqual({type: 'text', text: '.'});
    citeAt(editor.view, CLAIMS[1], 0); // before the paragraph: lands in it
    expect(docInfo(editor.state.doc).cited).toEqual(['c1', 'c2']);
  });

  it('drops a claim dragged from the story tree where it lands, and leaves other drops to the editor', () => {
    const editor = makeEditor({type: 'doc', content: [para('The sale was not put out to open tender.')]});
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({pos: 5, inside: -1});
    const drag = (data: Record<string, string>) => ({clientX: 10, clientY: 10, preventDefault: vi.fn(),
      dataTransfer: {getData: (t: string) => data[t] ?? ''}}) as unknown as DragEvent;
    const plain = drag({'text/plain': 'words'});
    expect(dropClaim(editor.view, plain, CLAIMS)).toBe(false);
    const claim = drag({[CLAIM_DRAG]: 'c2'});
    expect(dropClaim(editor.view, claim, CLAIMS)).toBe(true);
    expect(claim.preventDefault).toHaveBeenCalled();
    const inline = editor.getJSON().content![0].content!;
    expect(inline[0]).toEqual({type: 'text', text: 'The '});
    expect(inline[1]).toEqual({type: 'citation', attrs: {recordType: 'claim', recordId: 'c2', label: '2'}});
    // A claim no longer in the story is swallowed, not inserted.
    expect(dropClaim(editor.view, drag({[CLAIM_DRAG]: 'gone'}), CLAIMS)).toBe(true);
    expect(docInfo(editor.state.doc).cited).toEqual(['c2']);
  });
});

describe('AI-draft paragraphs', () => {
  it('marks a paragraph an AI drafted until a person keeps it, and Undo takes it out', () => {
    const editor = makeEditor({type: 'doc', content: [
      para('In November 2017 the council sold the land.'),
      para('Between March and June 2019 four sums were paid.', {aiDraft: '2026-10-10'}),
      para('Each was just under the threshold.', {aiDraft: '2026-10-10'}),
    ]});
    expect(draftDay('2026-10-10')).toBe('10 Oct 2026');
    expect(docInfo(editor.state.doc)).toMatchObject({paragraphs: 3, aiDrafted: 2, aiOpen: 2});
    const marked = editor.view.dom.querySelectorAll('p.ai-para');
    expect(marked).toHaveLength(2);
    expect(marked[0].querySelector('.ai-tag')?.textContent).toBe('AI draft · 10 Oct 2026');
    expect(marked[0].querySelector('.ai-bar')?.textContent).toContain('not yet kept by you');

    fireEvent.click(marked[0].querySelector('button[aria-label^="Keep"]')!);
    expect(editor.getJSON().content![1].attrs).toMatchObject({aiDraft: '2026-10-10', aiKept: true});
    expect(docInfo(editor.state.doc)).toMatchObject({aiDrafted: 2, aiOpen: 1}); // kept, still counted as drafted with AI
    expect(editor.view.dom.querySelectorAll('p.ai-para')).toHaveLength(1);

    fireEvent.click(editor.view.dom.querySelector('p.ai-para button[aria-label^="Undo"]')!);
    expect(editor.getJSON().content!.map(p => (p.content?.[0] as {text?: string} | undefined)?.text)).toEqual([
      'In November 2017 the council sold the land.', 'Between March and June 2019 four sums were paid.']);
    expect(docInfo(editor.state.doc)).toMatchObject({paragraphs: 2, aiDrafted: 1, aiOpen: 0});
  });

  it('does not carry the mark into a new paragraph split from an AI one', () => {
    const editor = makeEditor({type: 'doc', content: [para('Drafted by the model.', {aiDraft: '2026-10-10'})]});
    editor.chain().setTextSelection(editor.state.doc.content.size - 1).splitBlock().insertContent('Mine.').run();
    expect(editor.getJSON().content!.map(p => p.attrs?.aiDraft ?? null)).toEqual(['2026-10-10', null]);
  });
});

describe('a citation’s hover card', () => {
  it('quotes the supporting passage and opens it beside the text', async () => {
    expect(passageOf(CLAIMS[0])?.id).toBe('e1');
    const doc = {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'M. Ross received $120,000 '},
      {type: 'citation', attrs: {recordType: 'claim', recordId: 'c1', label: '1'}}, {type: 'text', text: '.'}]}]};
    mockApi({'GET /api/writeups/w1': {id: 'w1', investigation_id: 'inv-1', title: 'Who bought the harbour?', status: 'draft', cited_record_refs: [],
      source_ai_candidate_id: null, created_by: null, created_at: '2026-10-10T10:00:00', updated_at: '2026-10-10T10:42:00', word_count: 5, content_json: doc}});
    const onOpen = vi.fn();
    const onDoc = vi.fn();
    render(<QueryProvider><WriteupEditor investigationId="inv-1" writeupId="w1" claims={CLAIMS} onOpenPassage={onOpen} onDoc={onDoc}/></QueryProvider>);
    const chip = await waitFor(() => { const c = document.querySelector('.cite-chip'); if (!c) throw new Error('no chip yet'); return c as HTMLElement; });
    expect(onDoc).toHaveBeenLastCalledWith(expect.objectContaining({cited: ['c1'], paragraphs: 1}));
    act(() => { fireEvent.mouseOver(chip); });
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('Citation 1 · Fernhill Ltd ledger 2020 · row 214');
    expect(card).toHaveTextContent('14/02/2020 · M ROSS · 120,000.00 · ref: —');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Open the passage beside the text →'}));
    expect(onOpen).toHaveBeenCalledWith('c1');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // Esc closes the card; clicking the chip itself opens the passage too.
    act(() => { fireEvent.mouseOver(chip); });
    act(() => { fireEvent.keyDown(window, {key: 'Escape'}); });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
