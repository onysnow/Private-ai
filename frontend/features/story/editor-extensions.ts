// The write-up's own TipTap pieces (ADR-0011), kept apart from the editor so they can be tested without a page:
// the citation chip (the server's "citation" node), the AI-draft mark on paragraphs, citing a claim at a place in
// the text (⌘⇧C, the picker, or a claim dragged from the story tree), and what the text holds (cited claims, words,
// paragraphs drafted with AI).
//
// An AI-draft paragraph carries `aiDraft` (the day it was drafted, YYYY-MM-DD) and stays marked plum, with its
// "AI draft · 10 Oct" tag and Keep · Undo, until a person keeps it (`aiKept`); kept, it loses the mark but is still
// counted as drafted with AI, for the AI-use note. Nothing in the app inserts AI text into the story's write-up yet:
// AI drafts are promoted into write-ups of their own (app/services/presentation.py); this is the mark they will carry.
import {Extension, Node, mergeAttributes} from '@tiptap/core';
import type {Node as PMNode} from '@tiptap/pm/model';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import type {EditorView} from '@tiptap/pm/view';

/** The drag type a claim of the story tree carries (its id). */
export const CLAIM_DRAG = 'application/x-story-claim';

export type CitablePassage = {id: string; stance: string; label: string; locator?: string | null; quote?: string | null;
  /** Marked superseded by a newer record: shown struck, never the passage a citation quotes first. */
  superseded?: {by_label?: string | null; reason: string} | null};
export type CitableClaim = {id: string; n: number; text: string; state: 'shown' | 'unshown' | 'disputed' | 'ruled_out'; evidence?: CitablePassage[]};

/** The citation chip: an inline atom with the attributes the server reads (app/services/writeups.py). */
export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      recordType: {default: 'claim', parseHTML: el => el.getAttribute('data-record-type'), renderHTML: a => ({'data-record-type': a.recordType})},
      recordId: {default: null, parseHTML: el => el.getAttribute('data-record-id'), renderHTML: a => ({'data-record-id': a.recordId})},
      label: {default: '', parseHTML: el => el.getAttribute('data-label'), renderHTML: a => ({'data-label': a.label})},
    };
  },
  parseHTML() { return [{tag: 'span[data-citation]'}]; },
  renderHTML({node, HTMLAttributes}) {
    return ['span', mergeAttributes(HTMLAttributes, {'data-citation': '', class: 'cite-chip', role: 'link', tabindex: '0',
      'aria-label': `Citation ${node.attrs.label}`}), String(node.attrs.label || '•')];
  },
  renderText({node}) { return `[${node.attrs.label}]`; },
});

const AI_KEY = new PluginKey<DecorationSet>('ai-drafts');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-10" → "10 Oct". */
export function draftDay(on: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(on);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`.trim() : on;
}

/** Keep (the person accepts the AI's paragraph) or Undo (the paragraph goes) for the paragraph whose text starts at `at`. */
export function decideAiParagraph(view: EditorView, at: number, keep: boolean): boolean {
  const pos = at - 1;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'paragraph' || !node.attrs.aiDraft) return false;
  view.dispatch(keep ? view.state.tr.setNodeMarkup(pos, undefined, {...node.attrs, aiKept: true}) : view.state.tr.delete(pos, pos + node.nodeSize));
  return true;
}

function aiDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    if (node.attrs.aiDraft && !node.attrs.aiKept) {
      const on = String(node.attrs.aiDraft);
      decos.push(Decoration.node(pos, pos + node.nodeSize, {class: 'ai-para'}));
      decos.push(Decoration.widget(pos + 1, (view, getPos) => {
        const bar = document.createElement('span');
        bar.className = 'ai-bar';
        bar.contentEditable = 'false';
        const tag = document.createElement('span');
        tag.className = 'ai-tag';
        tag.textContent = `AI draft · ${draftDay(on)}`;
        const note = document.createElement('span');
        note.className = 'ai-bar-note';
        note.textContent = 'not yet kept by you';
        bar.append(tag, note);
        if (view.editable) {
          const act = (label: string, aria: string, keep: boolean) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.setAttribute('aria-label', aria);
            b.addEventListener('mousedown', e => e.preventDefault());
            b.addEventListener('click', e => { e.preventDefault(); const at = getPos(); if (typeof at === 'number') decideAiParagraph(view, at, keep); });
            return b;
          };
          bar.append(' · ', act('Keep', 'Keep the AI draft: it becomes your text', true), ' · ', act('Undo', 'Undo the AI draft: remove this paragraph', false));
        }
        return bar;
      }, {side: -1, ignoreSelection: true, stopEvent: () => true, key: `ai-${pos}-${on}`}));
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** The AI-draft attributes on paragraphs, and the plum mark with Keep · Undo on those not yet kept. */
export const AiDraft = Extension.create({
  name: 'aiDraft',
  addGlobalAttributes() {
    return [{types: ['paragraph'], attributes: {
      aiDraft: {default: null, keepOnSplit: false, parseHTML: el => el.getAttribute('data-ai-draft'),
        renderHTML: a => (a.aiDraft ? {'data-ai-draft': a.aiDraft} : {})},
      aiKept: {default: false, keepOnSplit: false, parseHTML: el => el.getAttribute('data-ai-kept') === 'true',
        renderHTML: a => (a.aiKept ? {'data-ai-kept': 'true'} : {})},
    }}];
  },
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: AI_KEY,
      state: {init: (_, {doc}) => aiDecorations(doc), apply: (tr, old) => (tr.docChanged ? aiDecorations(tr.doc) : old)},
      props: {decorations: state => AI_KEY.getState(state)},
    })];
  },
});

/** Put a claim's citation chip at `pos` (or at the cursor). */
export function citeAt(view: EditorView, claim: CitableClaim, pos?: number): void {
  const type = view.state.schema.nodes.citation;
  const at = Math.max(0, Math.min(pos ?? view.state.selection.from, view.state.doc.content.size));
  const node = type.create({recordType: 'claim', recordId: claim.id, label: String(claim.n)});
  // A drop between blocks lands inside the nearest paragraph.
  const $at = view.state.doc.resolve(at);
  const target = $at.parent.inlineContent ? at : findInline(view.state.doc, at);
  if (target == null) return;
  view.dispatch(view.state.tr.insert(target, node).scrollIntoView());
}

function findInline(doc: PMNode, at: number): number | null {
  let best: number | null = null;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const end = pos + node.nodeSize - 1;
    if (best == null || Math.abs(end - at) < Math.abs(best - at)) best = end;
    return false;
  });
  return best;
}

/** A claim dropped on the text: its chip goes where it was dropped. Returns true when the drop was a claim. */
export function dropClaim(view: EditorView, event: DragEvent, claims: CitableClaim[]): boolean {
  const id = event.dataTransfer?.getData(CLAIM_DRAG);
  if (!id) return false;
  event.preventDefault();
  const claim = claims.find(c => c.id === id);
  if (!claim) return true;
  let pos: number | undefined;
  try { pos = view.posAtCoords({left: event.clientX, top: event.clientY})?.pos; } catch { pos = undefined; }
  citeAt(view, claim, pos);
  view.focus();
  return true;
}

export type DocInfo = {cited: string[]; words: number; paragraphs: number; aiDrafted: number; aiOpen: number};

/** What the text holds: the claims it cites (in order of first citation), its words, and its AI-drafted paragraphs. */
export function docInfo(doc: PMNode): DocInfo {
  const cited: string[] = [];
  let paragraphs = 0; let aiDrafted = 0; let aiOpen = 0;
  doc.descendants(n => {
    if (n.type.name === 'citation' && n.attrs.recordId && !cited.includes(String(n.attrs.recordId))) cited.push(String(n.attrs.recordId));
    if (n.type.name === 'paragraph' && n.textContent.trim()) {
      paragraphs += 1;
      if (n.attrs.aiDraft) { aiDrafted += 1; if (!n.attrs.aiKept) aiOpen += 1; }
    }
    return true;
  });
  return {cited, words: doc.textContent.trim().split(/\s+/).filter(Boolean).length, paragraphs, aiDrafted, aiOpen};
}
