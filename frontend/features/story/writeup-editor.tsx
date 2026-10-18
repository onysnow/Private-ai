'use client';
// The write-up (mockup ACT_2, right half; research Act §8; ADR-0011): a calm reading-face editor on a plain surface.
// Citations are inline chips (the server's own "citation" node: recordType, recordId, label), hover shows the claim.
// Each sentence is marked from what it cites, never stored in the text: no citation = dashed underline and ○ in the
// margin; cites a disputed claim = ! ; cites a claim not yet shown = dotted underline. Saves on its own a moment
// after typing stops ("Saved 10:42"). ⌘⇧C cites a claim of the story at the cursor.
import {Extension, Node, mergeAttributes} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import type {Node as PMNode} from '@tiptap/pm/model';
import {EditorContent, useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getStoryQueryKey, getWriteupEndpointOptions, getWriteupEndpointQueryKey, updateWriteupEndpointMutation} from '../../lib/generated/@tanstack/react-query.gen';
import {sentencesOf, type Piece} from './sentences';

export type CitableClaim = {id: string; n: number; text: string; state: 'shown' | 'unshown' | 'disputed' | 'ruled_out'};

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

const KEY = new PluginKey<DecorationSet>('sentence-marks');

/** Sentence marks from the claims each sentence cites: the states come from a ref, refreshed by a meta transaction. */
function SentenceMarks(states: {current: Record<string, CitableClaim['state']>}) {
  const build = (doc: PMNode) => {
    const decos: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      const pieces: Piece[] = [];
      node.forEach((child, offset) => {
        const at = pos + 1 + offset;
        if (child.isText) pieces.push({kind: 'text', text: child.text ?? '', pos: at});
        else if (child.type.name === 'citation') pieces.push({kind: 'cite', recordId: String(child.attrs.recordId ?? ''), pos: at});
      });
      for (const s of sentencesOf(pieces)) {
        const cited = s.claims.map(id => states.current[id]);
        const kind = !s.cited ? 'uncited' : cited.includes('disputed') ? 'disputed' : cited.includes('unshown') ? 'unshown' : null;
        if (!kind) continue;
        decos.push(Decoration.inline(s.from, s.to, {class: `sent-${kind}`}));
        decos.push(Decoration.widget(s.from, () => {
          const mark = document.createElement('span');
          mark.className = `sent-mark sent-mark-${kind}`;
          mark.textContent = kind === 'disputed' ? '!' : '○';
          mark.setAttribute('aria-label', kind === 'uncited' ? 'No source' : kind === 'disputed' ? 'Rests on a disputed claim' : 'Rests on a claim not yet shown');
          return mark;
        }, {side: -1, key: `${kind}-${s.from}`}));
      }
      return false;
    });
    return DecorationSet.create(doc, decos);
  };
  return Extension.create({
    name: 'sentenceMarks',
    addProseMirrorPlugins() {
      return [new Plugin<DecorationSet>({
        key: KEY,
        state: {init: (_, {doc}) => build(doc), apply: (tr, old) => (tr.docChanged || tr.getMeta(KEY) ? build(tr.doc) : old.map(tr.mapping, tr.doc))},
        props: {decorations: state => KEY.getState(state)},
      })];
    },
  });
}

const stamp = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function WriteupEditor({investigationId, writeupId, claims, onCite}: {
  investigationId: string; writeupId: string; claims: CitableClaim[];
  /** Tells the screen what the text cites (the Cited tab). */
  onCite?: (ids: string[]) => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const q = useQuery({...getWriteupEndpointOptions({path: {writeup_id: writeupId}})});
  const save = useMutation({...updateWriteupEndpointMutation(), onSuccess: data => {
    queryClient.setQueryData(getWriteupEndpointQueryKey({path: {writeup_id: writeupId}}), data);
    void queryClient.invalidateQueries({queryKey: getStoryQueryKey({path: {investigation_id: investigationId}})});
    setSaved(new Date());
  }});
  const [saved, setSaved] = useState<Date | null>(null);
  const [picking, setPicking] = useState(false);
  const [words, setWords] = useState(0);
  const states = useRef<Record<string, CitableClaim['state']>>({});
  states.current = Object.fromEntries(claims.map(c => [c.id, c.state]));
  const timer = useRef<number | undefined>(undefined);
  const marks = useMemo(() => SentenceMarks(states), []);
  const reportCited = (doc: PMNode) => {
    const ids: string[] = [];
    doc.descendants(n => { if (n.type.name === 'citation' && n.attrs.recordId) ids.push(String(n.attrs.recordId)); return true; });
    onCite?.([...new Set(ids)]);
    setWords(doc.textContent.trim().split(/\s+/).filter(Boolean).length);
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Citation, marks],
    editorProps: {attributes: {class: 'wu-text', 'aria-label': 'The write-up', 'aria-multiline': 'true'},
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') { setPicking(true); return true; }
        return false;
      }},
    onUpdate: ({editor: e}) => {
      reportCited(e.state.doc);
      window.clearTimeout(timer.current);
      const json = e.getJSON();
      timer.current = window.setTimeout(() => save.mutate({path: {writeup_id: writeupId}, body: {content_json: json as Record<string, unknown>}}), 900);
    },
  }, [writeupId]);
  // The stored text, once it arrives.
  const loaded = useRef('');
  useEffect(() => {
    if (!editor || !q.data || loaded.current === writeupId) return;
    loaded.current = writeupId;
    editor.commands.setContent(q.data.content_json as Record<string, unknown>, {emitUpdate: false});
    reportCited(editor.state.doc);
  }, [editor, q.data, writeupId]); // eslint-disable-line react-hooks/exhaustive-deps
  // A claim's status changed: redraw the marks.
  const key = claims.map(c => `${c.id}:${c.state}`).join(',');
  useEffect(() => { if (editor) editor.view.dispatch(editor.state.tr.setMeta(KEY, true)); }, [editor, key]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const cite = (c: CitableClaim) => {
    editor?.chain().focus().insertContent({type: 'citation', attrs: {recordType: 'claim', recordId: c.id, label: String(c.n)}}).run();
    setPicking(false);
  };

  return <div className="wu">
    <div className="wu-bar">
      <button type="button" className="wu-cite" onClick={() => setPicking(p => !p)} aria-expanded={picking}>Cite a claim <kbd>⌘⇧C</kbd></button>
      <span className="wu-status" aria-live="polite">{words} words · {save.isPending ? 'Saving…' : save.isError ? errorMessage(save.error, 'Not saved') : saved ? `saved ${stamp(saved)}` : q.data ? `saved ${stamp(new Date(q.data.updated_at))}` : ''}</span>
    </div>
    {picking && <ul className="wu-picker" aria-label="Cite a claim of the story">
      {claims.length ? claims.map(c => <li key={c.id}><button type="button" onClick={() => cite(c)}>
        <span className="wu-n">{c.n}</span><span>{c.text}</span><small className={`st-word st-${c.state}`}>{c.state === 'shown' ? '✓ shown' : c.state === 'disputed' ? '✕ disputed' : '○ not yet shown'}</small></button></li>)
        : <li className="wu-none">Put a claim under a section of the story first; then it can be cited here.</li>}
    </ul>}
    {q.isError && <p role="alert" className="wu-none">{errorMessage(q.error, 'Could not open the write-up')}</p>}
    <EditorContent editor={editor}/>
  </div>;
}
