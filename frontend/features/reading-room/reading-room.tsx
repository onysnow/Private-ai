'use client';
// The reading room (Bring in; mockup INTAKE_2): one document read calmly, its pages in a
// strip with marks where something was found, the text in a narrow serif column, and in
// the margin each proposal beside the words it came from. Select words to keep them:
// E evidence, C a claim, N a name, X something to check, T a tag. A proposal is answered
// with 1 (keep), 2 (not useful) or 3 (later). Evidence kept here shows its clip: the
// quote with 32 characters either side, the file's fingerprint and where it is, checked
// against the stored text.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {
  getDocumentOptions, getExtractionCandidateExplanationOptions, getTagsOptions, listDocumentCandidatesEndpointOptions, listDocumentsOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {
  createClaimEndpoint, createEntity, createEvidenceEndpoint, createLeadEndpoint, linkClaimEvidenceEndpoint, reviewExtractionCandidate, tagARecord,
} from '../../lib/generated/sdk.gen';
import type {DocumentChunkOut, DocumentDetailOut, ExtractionCandidateOut} from '../../lib/generated/types.gen';
import {singleKeysOn} from '../../lib/shortcuts';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {DocumentTranslation} from '../documents/document-translation';

type Tab = 'text' | 'original' | 'translation' | 'details';
type Span = {start: number; end: number; id: string; kind: string; status: string; primary: boolean};
type Picked = {chunk: DocumentChunkOut; start: number; end: number; quote: string};
export type Clip = {quote: string; before: string; after: string; fingerprint: string; anchor: string; checked: boolean};

const CLIP_CONTEXT = 32;
const KIND_WORD: Record<string, string> = {entity: 'Name', claim: 'Claim', evidence: 'Evidence', relationship: 'Link', event: 'Date', identifier: 'Identifier'};

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

function spanOf(payload: Record<string, unknown>): {start: number; end: number} | null {
  const span = payload.span as {start_char?: number; end_char?: number} | undefined;
  return span && typeof span.start_char === 'number' && typeof span.end_char === 'number' ? {start: span.start_char, end: span.end_char} : null;
}

/** What a proposal says, in a line. */
export function proposalText(c: ExtractionCandidateOut): string {
  const p = c.payload as Record<string, unknown>;
  return String(p.caption ?? p.text ?? p.quote ?? p.value ?? p.title ?? c.candidate_type);
}

/** The words kept as evidence, with their surroundings, checked against the stored text. */
export function clipOf(chunk: {text: string; locator: string}, start: number, end: number, quote: string, fingerprint: string): Clip {
  return {quote, before: chunk.text.slice(Math.max(0, start - CLIP_CONTEXT), start), after: chunk.text.slice(end, end + CLIP_CONTEXT),
    fingerprint, anchor: `${chunk.locator} · characters ${start + 1}–${end}`, checked: chunk.text.slice(start, end) === quote};
}

/** A chunk's text with its proposals and find matches marked. */
function Marked({text, spans, find, focus, onFocus}: {text: string; spans: Span[]; find: string; focus: string | null; onFocus: (id: string) => void}): ReactElement {
  const cuts = new Set([0, text.length]);
  for (const s of spans) { cuts.add(Math.max(0, s.start)); cuts.add(Math.min(text.length, s.end)); }
  const lower = text.toLowerCase();
  const needle = find.trim().toLowerCase();
  const found: {start: number; end: number}[] = [];
  if (needle.length > 1) for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + needle.length)) { found.push({start: i, end: i + needle.length}); cuts.add(i); cuts.add(i + needle.length); }
  const points = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, b] = [points[i], points[i + 1]];
    let piece: ReactNode = text.slice(a, b);
    if (found.some(f => f.start <= a && f.end >= b)) piece = <mark className="rr-find">{piece}</mark>;
    // The innermost proposal marks the words (a name inside a claim is the name); every
    // proposal that starts here still gets its anchor, for its margin card.
    const s = spans.filter(x => x.start <= a && x.end >= b).sort((x, y) => (x.end - x.start) - (y.end - y.start))[0];
    if (s) {
      piece = <span className={`rr-span rr-${s.kind} rr-${s.status}${focus === s.id ? ' on' : ''}`} onClick={() => onFocus(s.id)}>{piece}</span>;
    }
    out.push(<span key={a}>{spans.filter(x => x.start === a && x.primary).map(x => <span key={x.id} id={`rr-anchor-${x.id}`} className="rr-anchor"/>)}{piece}</span>);
  }
  return <>{out}</>;
}

function OriginalPage({documentId, page}: {documentId: string; page: number}): ReactElement {
  const image = useQuery({queryKey: ['page-image', documentId, page, ''], queryFn: () => api.blob(`/api/documents/${documentId}/page-image?page=${page}&width=900`),
    staleTime: Infinity, retry: false});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image.data) return undefined;
    const made = URL.createObjectURL(image.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image.data]);
  if (image.isError) return <p className="rr-quiet">{errorMessage(image.error, 'This document has no pages to show as they look')}</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="rr-original" src={url} alt={`Page ${page} as it looks`}/> : <div className="rr-original rr-wait" aria-busy="true"/>;
}

function Why({candidateId}: {candidateId: string}): ReactElement {
  const why = useQuery({...getExtractionCandidateExplanationOptions({path: {candidate_id: candidateId}})});
  if (why.isPending) return <p className="rr-quiet">Reading why…</p>;
  if (why.isError) return <p className="rr-quiet">{errorMessage(why.error, 'Could not say why')}</p>;
  return <div className="rr-why"><p>{why.data.summary}</p>{why.data.parts.slice(0, 3).map(p => <p key={p.id}><b>{p.label}:</b> {p.reasoning.join(" ")}</p>)}</div>;
}

function Card({c, focus, top, onFocus, onAnswer}: {c: ExtractionCandidateOut; focus: boolean; top: number | null; onFocus: () => void;
  onAnswer: (decision: 'accept' | 'reject') => void}): ReactElement {
  const [why, setWhy] = useState(false);
  const open = c.review_status === 'proposed';
  return <article className={`rr-card rr-${c.candidate_type}${focus ? ' on' : ''}${open ? '' : ' done'}`} style={top === null ? undefined : {top}}
    aria-label={`${KIND_WORD[c.candidate_type] ?? c.candidate_type}: ${proposalText(c)}`} onClick={onFocus}>
    <header><b>{KIND_WORD[c.candidate_type] ?? c.candidate_type}</b><small>{open ? `${Math.round(c.confidence * 100)}%` : c.review_status}</small></header>
    <p className="rr-card-text">{proposalText(c)}</p>
    {open ? <div className="rr-answers" role="group" aria-label="Your answer">
      <button type="button" onClick={e => { e.stopPropagation(); onAnswer('accept'); }} aria-keyshortcuts={focus ? '1' : undefined}>Keep <kbd>1</kbd></button>
      <button type="button" onClick={e => { e.stopPropagation(); onAnswer('reject'); }} aria-keyshortcuts={focus ? '2' : undefined}>Not useful <kbd>2</kbd></button>
      <button type="button" className="rr-why-btn" onClick={e => { e.stopPropagation(); setWhy(w => !w); }} aria-expanded={why}>Why?</button>
    </div> : null}
    {why && <Why candidateId={c.id}/>}
  </article>;
}

function Room({investigationId, documentId, startPage, onClose}: {investigationId: string; documentId: string; startPage: number | null; onClose: () => void}): ReactElement {
  const queryClient = useQueryClient();
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const detail = useQuery({...getDocumentOptions({path: {document_id: documentId}})});
  const candidatesKey = listDocumentCandidatesEndpointOptions({path: {document_id: documentId}});
  const candidates = useQuery(candidatesKey);
  const docs = useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data ?? [];
  const tags = useQuery({...getTagsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const [tab, setTab] = useState<Tab>('text');
  const [find, setFind] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [status, setStatus] = useState('');
  const [tagMenu, setTagMenu] = useState(false);
  const [page, setPage] = useState<number | null>(startPage);
  const column = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<string, number>>({});
  const doc: DocumentDetailOut | undefined = detail.data;
  const chunks = useMemo(() => doc?.chunks ?? [], [doc]);
  const all = useMemo(() => candidates.data ?? [], [candidates.data]);
  const byChunk = useMemo(() => {
    const map = new Map<string, Span[]>();
    for (const c of all) {
      if (c.candidate_type === 'evidence' || !c.chunk_id) continue;
      const span = spanOf(c.payload as Record<string, unknown>);
      if (!span) continue;
      map.set(c.chunk_id, [...(map.get(c.chunk_id) ?? []), {...span, id: c.id, kind: c.candidate_type, status: c.review_status, primary: true}]);
      // A name found again further on is marked there too (its card stays beside the first).
      for (const m of ((c.payload as {mentions?: {chunk_id?: string; span?: Record<string, unknown>}[]}).mentions ?? []).slice(1)) {
        const at = m.span ? spanOf({span: m.span}) : null;
        if (m.chunk_id && at) map.set(m.chunk_id, [...(map.get(m.chunk_id) ?? []), {...at, id: c.id, kind: c.candidate_type, status: c.review_status, primary: false}]);
      }
    }
    return map;
  }, [all]);
  const order = useMemo(() => new Map(chunks.map(ch => [ch.id, ch.ordinal])), [chunks]);
  const cards = useMemo(() => all.filter(c => c.candidate_type !== 'evidence' && c.chunk_id && byChunk.get(c.chunk_id)?.some(s => s.id === c.id))
    .sort((a, b) => (order.get(a.chunk_id!) ?? 0) - (order.get(b.chunk_id!) ?? 0)), [all, byChunk, order]);
  const pages = useMemo(() => {
    const seen = new Map<number, {page: number; marks: number}>();
    for (const ch of chunks) {
      const p = ch.page_number ?? 0;
      const entry = seen.get(p) ?? {page: p, marks: 0};
      entry.marks += (byChunk.get(ch.id) ?? []).filter(s => s.status === 'proposed' && s.primary).length;
      seen.set(p, entry);
    }
    return [...seen.values()].filter(p => p.page > 0).sort((a, b) => a.page - b.page);
  }, [chunks, byChunk]);
  const counts = useMemo(() => {
    const c = {accepted: 0, rejected: 0, waiting: 0};
    for (const x of all) { if (x.review_status === 'accepted') c.accepted += 1; else if (x.review_status === 'rejected') c.rejected += 1; else if (x.review_status === 'proposed') c.waiting += 1; }
    return c;
  }, [all]);
  const tops0 = docs.filter(d => !d.parent_document_id);
  const index = tops0.findIndex(d => d.id === documentId);

  // Margin cards sit beside the words they came from; a later card never overlaps an earlier one.
  useLayoutEffect(() => {
    if (tab !== 'text' || !column.current) return undefined;
    const measure = () => {
      const next: Record<string, number> = {};
      let floor = 0;
      for (const c of cards) {
        const el = document.getElementById(`rr-anchor-${c.id}`);
        const top = Math.max(el ? el.offsetTop - 4 : floor, floor);
        next[c.id] = top;
        floor = top + (c.id === focus ? 150 : 112);
      }
      setTops(next);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [cards, tab, find, focus]);

  useEffect(() => {
    if (page === null || tab !== 'text') return;
    document.getElementById(`rr-page-${page}`)?.scrollIntoView({block: 'start'});
  }, [page, tab, chunks.length]);

  const answer = useCallback(async (c: ExtractionCandidateOut, decision: 'accept' | 'reject') => {
    const p = c.payload as Record<string, unknown>;
    try {
      await reviewExtractionCandidate({path: {candidate_id: c.id}, body: {decision, ...(c.candidate_type === 'entity' && decision === 'accept'
        ? {entity_schema: String(p.suggested_schema ?? 'LegalEntity')} : {})}, throwOnError: true});
      setStatus(decision === 'accept' ? `Kept: ${proposalText(c)}` : `Set aside: ${proposalText(c)}`);
      const next = cards.find(x => x.review_status === 'proposed' && x.id !== c.id);
      setFocus(next?.id ?? null);
      await queryClient.invalidateQueries({queryKey: candidatesKey.queryKey});
    } catch (error) { setStatus(errorMessage(error, 'Could not answer it here; open it in the Library to decide')); }
  }, [cards, candidatesKey.queryKey, queryClient]);

  const readSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { setPicked(null); return; }
    const range = sel.getRangeAt(0);
    const host = (range.startContainer.parentElement)?.closest('[data-chunk]') as HTMLElement | null;
    const end = (range.endContainer.parentElement)?.closest('[data-chunk]') as HTMLElement | null;
    const chunk = chunks.find(ch => ch.id === host?.dataset.chunk);
    if (!host || host !== end || !chunk) { setPicked(null); setStatus('Select words within one passage.'); return; }
    const before = document.createRange();
    before.setStart(host, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const quote = range.toString();
    if (!quote.trim()) { setPicked(null); return; }
    setPicked({chunk, start, end: start + quote.length, quote});
  };

  const keep = async (what: 'evidence' | 'claim' | 'name' | 'check') => {
    if (!picked || !doc) return;
    const {chunk, start, end, quote} = picked;
    try {
      if (what === 'evidence' || what === 'claim') {
        const ev = (await createEvidenceEndpoint({body: {source_id: doc.source_id, quote, locator: chunk.locator, document_id: doc.id}, throwOnError: true})).data;
        setClip(clipOf(chunk, start, end, quote, doc.sha256));
        if (what === 'claim') {
          const claim = (await createClaimEndpoint({body: {investigation_id: investigationId, text: quote, status: 'unverified', confidence: 0.5}, throwOnError: true})).data;
          await linkClaimEvidenceEndpoint({path: {claim_id: claim.id}, body: {evidence_id: ev.id, stance: 'supports'}, throwOnError: true});
          setStatus('Kept as a claim, with these words as its evidence.');
        } else setStatus('Kept as evidence.');
      } else if (what === 'name') {
        await createEntity({body: {investigation_id: investigationId, schema: 'LegalEntity', caption: quote.trim(), properties: {name: [quote.trim()]}}, throwOnError: true});
        setStatus(`Kept as a name: ${quote.trim()}.`);
      } else {
        await createLeadEndpoint({body: {investigation_id: investigationId, title: `Check: ${quote.trim().slice(0, 140)}`,
          detail: `${doc.filename}, ${chunk.locator}: “${quote.trim()}”`}, throwOnError: true});
        setStatus('Kept as something to check (a lead).');
      }
      window.getSelection()?.removeAllRanges();
      setPicked(null);
      await queryClient.invalidateQueries();
    } catch (error) { setStatus(errorMessage(error, 'Could not keep it')); }
  };
  const tag = async (tagId: string) => {
    setTagMenu(false);
    try {
      await tagARecord({path: {investigation_id: investigationId}, body: {tag_id: tagId, record_type: 'document', record_id: documentId}, throwOnError: true});
      setStatus('Tagged the document.');
    } catch (error) { setStatus(errorMessage(error, 'Could not tag it')); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (picked) setPicked(null); else onClose(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || !singleKeysOn()) return;
      const k = e.key.toLowerCase();
      if (picked && ['e', 'c', 'n', 'x', 't'].includes(k)) {
        e.preventDefault();
        if (k === 't') setTagMenu(true);
        else void keep(k === 'e' ? 'evidence' : k === 'c' ? 'claim' : k === 'n' ? 'name' : 'check');
        return;
      }
      const card = cards.find(c => c.id === focus);
      if (card && card.review_status === 'proposed' && (k === '1' || k === '2')) { e.preventDefault(); void answer(card, k === '1' ? 'accept' : 'reject'); }
      if (card && k === '3') { e.preventDefault(); const at = cards.indexOf(card); setFocus(cards.slice(at + 1).find(c => c.review_status === 'proposed')?.id ?? null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });  // eslint-disable-line react-hooks/exhaustive-deps -- reads the latest state on each key

  const findCount = useMemo(() => {
    const n = find.trim().toLowerCase();
    if (n.length < 2) return 0;
    return chunks.reduce((sum, ch) => sum + (ch.text.toLowerCase().split(n).length - 1), 0);
  }, [chunks, find]);

  let lastPage: number | null = null;
  return <div className="rr" role="dialog" aria-modal="true" aria-label={`Reading room: ${doc?.filename ?? 'document'}`}>
    <header className="rr-top">
      <div className="rr-title"><p className="rr-eyebrow">Reading room</p><h2>{doc?.filename ?? 'Opening…'}</h2></div>
      <div role="tablist" aria-label="How to read it" className="rr-tabs">
        {(['text', 'original', 'translation', 'details'] as Tab[]).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
          {t === 'text' ? 'Text' : t === 'original' ? 'Original' : t === 'translation' ? 'Translation' : 'Details'}</button>)}
      </div>
      <input type="search" className="rr-find-input" aria-label="Find in this document" placeholder="Find in this document" value={find} onChange={e => setFind(e.target.value)}/>
      {find.trim().length > 1 && <small className="rr-quiet">{findCount} found</small>}
      <button type="button" className="rr-close" onClick={onClose} aria-label="Close the reading room">×</button>
    </header>

    <nav className="rr-pages" aria-label="Pages">
      {pages.map(p => <button key={p.page} type="button" aria-current={page === p.page ? 'true' : undefined} onClick={() => { setPage(p.page); if (tab === 'details' || tab === 'translation') setTab('text'); }}
        title={p.marks ? `Page ${p.page}: ${p.marks} waiting` : `Page ${p.page}`}><span>{p.page}</span>{p.marks > 0 && <i aria-label={`${p.marks} waiting`}>{p.marks}</i>}</button>)}
    </nav>

    <div className="rr-body">
      {detail.isError ? <p role="alert">{errorMessage(detail.error, 'Could not open the document')}</p>
        : tab === 'text' ? <div className="rr-read">
          <div ref={column} className="rr-column" onMouseUp={readSelection} onKeyUp={e => { if (e.shiftKey) readSelection(); }}>
            {chunks.map(ch => {
              const head = ch.page_number !== null && ch.page_number !== undefined && ch.page_number !== lastPage;
              if (head) lastPage = ch.page_number ?? null;
              return <div key={ch.id}>
                {head && <p className="rr-page-head" id={`rr-page-${ch.page_number}`}>Page {ch.page_number}</p>}
                <p className="rr-passage" data-chunk={ch.id} title={ch.locator}>
                  <Marked text={ch.text} spans={byChunk.get(ch.id) ?? []} find={find} focus={focus} onFocus={setFocus}/></p>
              </div>;
            })}
            {!chunks.length && <p className="rr-quiet">{doc ? 'No text was read from this document.' : 'Opening…'}</p>}
            <div className="rr-margin" aria-label="What was found here">
              {cards.map(c => <Card key={c.id} c={c} focus={focus === c.id} top={tops[c.id] ?? null} onFocus={() => setFocus(c.id)} onAnswer={d => void answer(c, d)}/>)}
            </div>
          </div>
        </div>
        : tab === 'original' ? <div className="rr-orig-wrap">{pages.length
          ? <OriginalPage documentId={documentId} page={page ?? pages[0].page}/> : <p className="rr-quiet">Only a PDF has pages to show as they look.</p>}</div>
        : tab === 'translation' ? <div className="rr-orig-wrap"><DocumentTranslation documentId={documentId}/></div>
        : <dl className="rr-details">
          <div><dt>File</dt><dd>{doc?.filename}</dd></div>
          <div><dt>Fingerprint</dt><dd><code>{doc?.sha256}</code></dd></div>
          <div><dt>Read</dt><dd>{doc?.extraction_status}{doc?.extraction_error ? ` · ${doc.extraction_error}` : ''}</dd></div>
          <div><dt>Passages</dt><dd>{chunks.length}</dd></div>
          {(doc?.extraction_issues ?? []).map(i => <div key={i}><dt>Note</dt><dd>{i}</dd></div>)}
        </dl>}
    </div>

    {picked && <div className="rr-selbar" role="toolbar" aria-label="Keep the selected words">
      <span className="rr-selquote">“{picked.quote.length > 60 ? `${picked.quote.slice(0, 60)}…` : picked.quote}”</span>
      <button type="button" onClick={() => void keep('evidence')}>Evidence <kbd>E</kbd></button>
      <button type="button" onClick={() => void keep('claim')}>Claim <kbd>C</kbd></button>
      <button type="button" onClick={() => void keep('name')}>Name <kbd>N</kbd></button>
      <button type="button" onClick={() => void keep('check')}>To check <kbd>X</kbd></button>
      <button type="button" onClick={() => setTagMenu(m => !m)} aria-expanded={tagMenu}>Tag <kbd>T</kbd></button>
      {tagMenu && <span className="rr-tags">{(tags?.tags ?? []).length ? (tags?.tags ?? []).map(t => <button key={t.id} type="button" onClick={() => void tag(t.id)}>{t.name}</button>)
        : <small>No tags yet; make them in Keep.</small>}</span>}
    </div>}

    {clip && <aside className="rr-clip" aria-label="Evidence clip">
      <p className="rr-eyebrow">Evidence clip {clip.checked ? <span className="rr-ok">✓ the words are in the stored text</span> : <span className="rr-bad">✕ the words differ from the stored text</span>}</p>
      <blockquote><span className="rr-ctx">…{clip.before}</span><mark>{clip.quote}</mark><span className="rr-ctx">{clip.after}…</span></blockquote>
      <p className="rr-quiet"><code title={clip.fingerprint}>{clip.fingerprint.slice(0, 12)}…</code> · {clip.anchor}</p>
      <button type="button" onClick={() => setClip(null)}>Close</button>
    </aside>}

    <footer className="rr-foot">
      <span><b>{counts.accepted}</b> kept · <b>{counts.rejected}</b> set aside · <b>{counts.waiting}</b> waiting</span>
      <span className="rr-keys">Select words: <kbd>E</kbd> <kbd>C</kbd> <kbd>N</kbd> <kbd>X</kbd> <kbd>T</kbd> · A proposal: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> · <kbd>Esc</kbd> close</span>
      <span aria-live="polite" className="rr-status">{status}</span>
      {index >= 0 && <span className="rr-nav">
        <button type="button" disabled={index <= 0} onClick={() => openDocument(tops0[index - 1].id)} aria-label="Previous document">‹</button>
        Document {index + 1} of {tops0.length}
        <button type="button" disabled={index >= tops0.length - 1} onClick={() => openDocument(tops0[index + 1].id)} aria-label="Next document">›</button>
      </span>}
    </footer>
  </div>;
}

/** The reading room, open while a document is asked for (the workbench store's document). */
export function ReadingRoom({investigationId}: {investigationId: string}): ReactElement | null {
  const request = useWorkbenchStore(state => state.document);
  const close = useWorkbenchStore(state => state.closeDocument);
  if (!request || !investigationId) return null;
  return <Room key={`${request.documentId}:${request.serial}`} investigationId={investigationId} documentId={request.documentId} startPage={request.pageNumber} onClose={close}/>;
}
