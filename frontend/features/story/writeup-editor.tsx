'use client';
// The write-up (mockup ACT_2, right half; research Act §8; ADR-0011): a calm reading-face editor on a plain surface.
// Citations are inline chips (the server's own "citation" node: recordType, recordId, label): hover or focus one for
// its passage's own words, click it (or Enter) to open the passage beside the text. Each sentence is marked from what
// it cites, never stored in the text: no citation = dashed underline and ○ in the margin; cites a disputed claim = ! ;
// cites a claim not yet shown = dotted underline. A paragraph an AI drafted stays plum until a person keeps it.
// Saves on its own a moment after typing stops ("Saved 10:42"). ⌘⇧C cites a claim of the story at the cursor; a claim
// dragged from the story tree drops its chip where it lands.
import {Extension} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import type {Node as PMNode} from '@tiptap/pm/model';
import {EditorContent, useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {FocusEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {
  getStoryQueryKey, getWriteupEndpointOptions, getWriteupEndpointQueryKey, listStoryVersionsQueryKey, updateWriteupEndpointMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import {AiDraft, CLAIM_DRAG, Citation, citeAt, docInfo, dropClaim} from './editor-extensions';
import type {CitableClaim, CitablePassage, DocInfo} from './editor-extensions';
import {sentencesOf, type Piece} from './sentences';

export {Citation} from './editor-extensions';
export type {CitableClaim, DocInfo} from './editor-extensions';

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

/** The passage a citation's hover card quotes: the claim's first supporting passage with words, else its first. */
export function passageOf(claim: CitableClaim | undefined): CitablePassage | undefined {
  const ev = claim?.evidence ?? [];
  return ev.find(e => e.stance === 'supports' && e.quote) ?? ev.find(e => e.quote) ?? ev[0];
}

type Hover = {id: string; x: number; y: number};

export function WriteupEditor({investigationId, writeupId, claims, onDoc, onOpenPassage, reloadKey = 0}: {
  investigationId: string; writeupId: string; claims: CitableClaim[];
  /** Tells the screen what the text holds (the Cited tab, the AI-use note, the Export sheet's checks). */
  onDoc?: (info: DocInfo) => void;
  /** A citation was clicked: open its claim's passage beside the text. */
  onOpenPassage?: (claimId: string) => void;
  /** Bumped after a version is restored: the stored text is loaded again. */
  reloadKey?: number;
}): ReactElement {
  const queryClient = useQueryClient();
  const q = useQuery({...getWriteupEndpointOptions({path: {writeup_id: writeupId}})});
  const save = useMutation({...updateWriteupEndpointMutation(), onSuccess: data => {
    queryClient.setQueryData(getWriteupEndpointQueryKey({path: {writeup_id: writeupId}}), data);
    void queryClient.invalidateQueries({queryKey: getStoryQueryKey({path: {investigation_id: investigationId}})});
    void queryClient.invalidateQueries({queryKey: listStoryVersionsQueryKey({path: {investigation_id: investigationId}})});
    setSaved(new Date());
  }});
  const [saved, setSaved] = useState<Date | null>(null);
  const [picking, setPicking] = useState(false);
  const [words, setWords] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const states = useRef<Record<string, CitableClaim['state']>>({});
  states.current = Object.fromEntries(claims.map(c => [c.id, c.state]));
  const claimsRef = useRef(claims);
  claimsRef.current = claims;
  const timer = useRef<number | undefined>(undefined);
  const marks = useMemo(() => SentenceMarks(states), []);
  const report = (doc: PMNode) => {
    const info = docInfo(doc);
    onDoc?.(info);
    setWords(info.words);
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Citation, AiDraft, marks],
    editorProps: {attributes: {class: 'wu-text', 'aria-label': 'The write-up', 'aria-multiline': 'true'},
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') { setPicking(true); return true; }
        return false;
      },
      handleDrop: (view, event) => { setDragOver(false); return dropClaim(view, event as DragEvent, claimsRef.current); },
      handleDOMEvents: {
        dragover: (_view, event) => {
          if (!event.dataTransfer?.types.includes(CLAIM_DRAG)) return false;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
          return false;
        },
        dragleave: () => { setDragOver(false); return false; },
      }},
    onUpdate: ({editor: e}) => {
      report(e.state.doc);
      window.clearTimeout(timer.current);
      const json = e.getJSON();
      timer.current = window.setTimeout(() => save.mutate({path: {writeup_id: writeupId}, body: {content_json: json as Record<string, unknown>}}), 900);
    },
  }, [writeupId]);
  // The stored text, once it arrives, and again after a version is restored.
  const loaded = useRef('');
  useEffect(() => {
    const at = `${writeupId}:${reloadKey}`;
    if (!editor || !q.data || loaded.current === at) return;
    loaded.current = at;
    window.clearTimeout(timer.current); // a restored text is not overwritten by a save of the text it replaced
    editor.commands.setContent(q.data.content_json as Record<string, unknown>, {emitUpdate: false});
    report(editor.state.doc);
  }, [editor, q.data, writeupId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // A claim's status changed: redraw the marks.
  const key = claims.map(c => `${c.id}:${c.state}`).join(',');
  useEffect(() => { if (editor) editor.view.dispatch(editor.state.tr.setMeta(KEY, true)); }, [editor, key]);
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(hideTimer.current); }, []);
  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHover(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hover]);

  const cite = (c: CitableClaim) => {
    if (!editor) return;
    editor.commands.focus();
    citeAt(editor.view, c);
    setPicking(false);
  };

  // Citation hover card: on hover or focus of a chip; it stays while the pointer is on the card.
  const chipOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('.cite-chip') : null);
  const showFor = (chip: HTMLElement) => {
    const id = chip.getAttribute('data-record-id');
    const host = box.current?.getBoundingClientRect();
    if (!id || !host) return;
    window.clearTimeout(hideTimer.current);
    const r = chip.getBoundingClientRect();
    const width = Math.min(340, host.width * 0.92); // the card's width (.wu-hover): kept inside the write-up
    setHover({id, x: Math.max(0, Math.min(r.left - host.left - 12, host.width - width)), y: r.bottom - host.top + 6});
  };
  const hideSoon = () => { window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(() => setHover(null), 250); };
  const onOver = (e: ReactMouseEvent) => { const chip = chipOf(e.target); if (chip) showFor(chip); };
  const onOut = (e: ReactMouseEvent) => { if (chipOf(e.target) && !chipOf(e.relatedTarget)) hideSoon(); };
  const onFocusIn = (e: FocusEvent) => { const chip = chipOf(e.target); if (chip) showFor(chip); };
  const open = (id: string) => { setHover(null); onOpenPassage?.(id); };
  const onClick = (e: ReactMouseEvent) => { const chip = chipOf(e.target); const id = chip?.getAttribute('data-record-id'); if (id) open(id); };
  const onKey = (e: ReactKeyboardEvent) => {
    const chip = chipOf(e.target);
    const id = chip?.getAttribute('data-record-id');
    if (id && e.key === 'Enter') { e.preventDefault(); open(id); }
  };
  const hovered = hover ? claims.find(c => c.id === hover.id) : undefined;
  const passage = passageOf(hovered);

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
    {/* Pointer and key events bubble here from the chips inside the editor; the chips themselves are focusable links. */}
    <div ref={box} className={`wu-body${dragOver ? ' drop' : ''}`} onMouseOver={onOver} onMouseOut={onOut} onFocus={onFocusIn} onClick={onClick} onKeyDown={onKey}>
      <EditorContent editor={editor}/>
      {hover && <div className="wu-hover" role="tooltip" style={{left: hover.x, top: hover.y}}
        onMouseEnter={() => window.clearTimeout(hideTimer.current)} onMouseLeave={hideSoon}>
        <small>Citation {hovered?.n ?? '?'}{passage ? ` · ${passage.label}${passage.locator ? ` · ${passage.locator}` : ''}` : ''}</small>
        {!hovered ? <p className="wu-hover-none">This citation’s claim is no longer in the story.</p>
          : passage?.quote ? <q>{passage.quote}</q>
          : <p className="wu-hover-none">{passage ? 'No words quoted from this passage yet.' : 'No passage linked to this claim yet.'}</p>}
        {hovered && <button type="button" onClick={() => open(hovered.id)}>Open the passage beside the text →</button>}
      </div>}
    </div>
  </div>;
}
