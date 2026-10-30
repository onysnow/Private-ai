'use client';
// Redact before sharing (mockup MEDIA_3; media research §2.3, §5): a PDF copy for an editor, a lawyer or publication,
// with the text under each box removed from the file, not covered. Boxes a person draws, and boxes the machine proposes
// (a phone number or email address found by pattern, a person named in this case) that a person accepts or rejects;
// each box needs its reason, kept in the trail. The hidden data to take out of the copy, PDF/A for archiving, and the
// new file's name. The case's PDF is never written: PdfCraft works on a copy and refuses to save over what it opened.
// Converted to the 29 Oct rule: reasons, why a box was proposed, clauses, fingerprints and how-to lines are on hover;
// that the original stays as it is, the counts, what is still in a copy and the reason asked for each box stay on screen.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {compareRedactedOptions, getRedactionOptions, listDerivedOptions, listDerivedQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {makeRedactedCopy} from '../../lib/generated/sdk.gen';
import type {DerivedFileOut, DocumentDetailOut, RedactProposalOut} from '../../lib/generated/types.gen';
import {FingerprintMark} from '../the-drop/kind-marks';
import {useBlobUrl} from './photo-room';

type Kind = 'drawn' | 'phone' | 'email' | 'person';
export type Mark = {key: string; page: number; rect: number[]; reason: string; kind: Kind; label: string};
type Tab = 'redact' | 'hidden' | 'compare' | 'archive';
type MadeFor = 'editor' | 'lawyer' | 'publication';

export const REASONS = ['source protection', 'a private person', 'personal contact details', 'not in the story'];
const MADE_FOR: Record<MadeFor, string> = {editor: 'the editor', lawyer: 'a lawyer', publication: 'publication'};
const KIND_WORDS: Record<Kind, string> = {drawn: 'Area', phone: 'Phone number', email: 'Email address', person: 'Name'};

/** The new file's name as the server makes it: "<name>-redacted-for-<who>-<dd-Mon>.pdf". */
export function newFileName(filename: string, madeFor: MadeFor, today: Date): string {
  const stem = filename.replace(/\.pdf$/i, '');
  const day = `${String(today.getDate()).padStart(2, '0')}-${today.toLocaleString('en-GB', {month: 'short'})}`;
  return `${stem}-redacted-for-${madeFor}-${day}.pdf`.replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** The words a proposal covers, as a person reads them: line breaks and runs of spaces as one space. */
const plain = (text: string) => text.replace(/\s+/g, ' ').trim();

export type ProposalGroup = {key: string; kind: Kind; text: string; items: RedactProposalOut[]; pages: number[]};
export type KindGroup = {kind: Kind; items: RedactProposalOut[]; pages: number[]; texts: ProposalGroup[]};
const pagesOf = (items: RedactProposalOut[]) => [...new Set(items.map(i => i.page))].sort((a, b) => a - b);

/** The proposals grouped as the list shows them: the same words of the same kind once across the whole file, with how
 *  many times and on which pages, most frequent first. */
export function groupProposals(proposals: RedactProposalOut[]): ProposalGroup[] {
  const groups = new Map<string, RedactProposalOut[]>();
  for (const p of proposals) {
    const key = `${p.kind}|${plain(p.text).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([key, items]) => ({key, kind: items[0].kind as Kind, text: plain(items[0].text), items, pages: pagesOf(items)}))
    .sort((a, b) => b.items.length - a.items.length || a.pages[0] - b.pages[0]);
}

/** The groups by kind (names, phone numbers, email addresses), so a whole kind is decided in one move. */
export function groupByKind(proposals: RedactProposalOut[]): KindGroup[] {
  const order: Kind[] = ['person', 'phone', 'email', 'drawn'];
  const texts = groupProposals(proposals);
  return order.map(kind => {
    const mine = texts.filter(g => g.kind === kind);
    const items = mine.flatMap(g => g.items);
    return {kind, items, pages: pagesOf(items), texts: mine};
  }).filter(k => k.items.length > 0);
}

const KIND_PLURAL: Record<Kind, string> = {drawn: 'Areas', phone: 'Phone numbers', email: 'Email addresses', person: 'Names'};
const KIND_MARK: Record<Kind, string> = {drawn: '▭', phone: '#', email: '@', person: 'A'};
const times = (n: number) => (n > 1 ? ` × ${n}` : '');
const onPages = (pages: number[]) => (pages.length === 1 ? `p.${pages[0]}` : `${pages.length} pages`);
const textLabel = (g: ProposalGroup) => `${g.kind === 'person' ? `“${g.text}”` : g.text}${times(g.items.length)}, ${onPages(g.pages)}`;

async function openCopy(row: DerivedFileOut): Promise<void> {
  const href = URL.createObjectURL(await api.blob(`/api/derived-files/${row.id}/file`));
  window.open(href, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

type Props = {doc: DocumentDetailOut; caseName: string; onClose: () => void};

export function RedactRoom({doc, caseName, onClose}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {document_id: doc.id};
  const view = useQuery({...getRedactionOptions({path}), retry: false});
  const trail = useQuery({...listDerivedOptions({path})});
  const copies = useMemo(() => (trail.data ?? []).filter(r => r.operation === 'redacted'), [trail.data]);
  const [tab, setTab] = useState<Tab>('redact');
  const [page, setPage] = useState(1);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [settled, setSettled] = useState<Record<string, 'kept' | 'rejected'>>({});
  const [pending, setPending] = useState<{page: number; rect: number[]; kind: Kind; label: string; keys: string[]} | null>(null);
  const [reason, setReason] = useState('');
  const [remove, setRemove] = useState<string[] | null>(null);
  const [pdfa, setPdfa] = useState(false);
  const [madeFor, setMadeFor] = useState<MadeFor>('editor');
  const [made, setMade] = useState<DerivedFileOut | null>(null);
  const [message, setMessage] = useState('');
  const [drag, setDrag] = useState<{x0: number; y0: number; x1: number; y1: number} | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const centre = useRef<HTMLElement>(null);

  const v = view.data;
  const size = v?.pages.find(p => p.page === page);
  const hiddenFound = (v?.hidden ?? []).filter(h => h.count > 0);
  const removing = remove ?? hiddenFound.map(h => h.category);
  const open = useMemo(() => (v?.proposals ?? []).filter(p => !settled[p.id]), [v, settled]);
  const kinds = useMemo(() => groupByKind(open), [open]);
  const doneGroups = useMemo(() => {
    const byLabel = new Map<string, Mark[]>();
    for (const m of marks) byLabel.set(`${m.label}|${m.reason}`, [...(byLabel.get(`${m.label}|${m.reason}`) ?? []), m]);
    return [...byLabel.entries()].map(([key, items]) => ({key, items}));
  }, [marks]);
  // A kind with only a few kinds of words opens on its words; a long one stays one row until it is opened.
  const [openKinds, setOpenKinds] = useState<Record<string, boolean>>({});
  const [openTexts, setOpenTexts] = useState<Record<string, boolean>>({});
  const kindOpen = (k: KindGroup) => openKinds[k.kind] ?? k.texts.length <= 6;
  const pageImage = useBlobUrl(`pdfpage:${doc.id}:${page}`, `/api/documents/${doc.id}/page-image?page=${page}&width=1100`);

  useEffect(() => { centre.current?.scrollTo?.({top: 0}); }, [page]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
      if (ev.key === 'Escape') { if (pending) setPending(null); else onClose(); }
      if ((ev.key === 'PageDown' || ev.key === 'ArrowRight') && v) setPage(n => Math.min(v.pages.length, n + 1));
      if ((ev.key === 'PageUp' || ev.key === 'ArrowLeft')) setPage(n => Math.max(1, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending, v]);

  const make = useMutation({
    mutationFn: async () => (await makeRedactedCopy({path, throwOnError: true, body: {
      boxes: marks.map(m => ({page: m.page, rect: m.rect as [number, number, number, number], reason: m.reason, kind: m.kind})), remove: removing as never, pdfa, made_for: madeFor}})).data,
    onSuccess: async row => {
      setMade(row);
      setMessage(`Made ${row.filename}: the text under ${marks.length === 1 ? 'the box' : `${marks.length} boxes`} is gone from the file, checked after saving.`);
      await queryClient.invalidateQueries({queryKey: listDerivedQueryKey({path})});
    },
    onError: error => setMessage(errorMessage(error, 'Could not make the redacted copy')),
  });

  const keep = (items: RedactProposalOut[], label?: string) => {
    const first = [...items].sort((a, b) => (a.page === page ? -1 : 0) - (b.page === page ? -1 : 0) || a.page - b.page)[0];
    if (!first) return;
    setPage(first.page);
    setReason('');
    setPending({page: first.page, rect: first.rect, kind: first.kind as Kind, keys: items.map(i => i.id),
      label: label ?? `${first.kind === 'person' ? `“${plain(first.text)}”` : KIND_WORDS[first.kind as Kind]}${times(items.length)}, ${onPages(pagesOf(items))}`});
  };
  const reject = (items: RedactProposalOut[]) => setSettled(s => ({...s, ...Object.fromEntries(items.map(i => [i.id, 'rejected' as const]))}));
  const confirm = () => {
    if (!pending || !reason.trim()) return;
    const proposals = (v?.proposals ?? []).filter(p => pending.keys.includes(p.id));
    const fresh: Mark[] = proposals.length
      ? proposals.map(p => ({key: p.id, page: p.page, rect: p.rect, reason: reason.trim(), kind: p.kind as Kind, label: pending.label}))
      : [{key: `drawn-${Date.now()}`, page: pending.page, rect: pending.rect, reason: reason.trim(), kind: 'drawn', label: pending.label}];
    setMarks(m => [...m, ...fresh]);
    setSettled(s => ({...s, ...Object.fromEntries(pending.keys.map(k => [k, 'kept' as const]))}));
    setPending(null); setReason(''); setMade(null);
  };
  const unmark = (...keys: string[]) => {
    setMarks(m => m.filter(x => !keys.includes(x.key)));
    setSettled(s => { const next = {...s}; for (const key of keys) delete next[key]; return next; });
    setMade(null);
  };

  const at = (ev: {clientX: number; clientY: number}) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r || !size) return {x: 0, y: 0};
    return {x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * size.width, y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) * size.height};
  };
  const onDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 || !size || (ev.target as HTMLElement).closest('button, form')) return;
    const a = at(ev);
    let last = {x0: a.x, y0: a.y, x1: a.x, y1: a.y};
    setDrag(last);
    const move = (m: PointerEvent) => { const b = at(m); last = {x0: a.x, y0: a.y, x1: b.x, y1: b.y}; setDrag(last); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setDrag(null);
      const rect = [Math.min(last.x0, last.x1), Math.min(last.y0, last.y1), Math.max(last.x0, last.x1), Math.max(last.y0, last.y1)];
      if (rect[2] - rect[0] < 4 || rect[3] - rect[1] < 4) return;
      setReason('');
      setPending({page, rect: rect.map(n => Math.round(n * 100) / 100), kind: 'drawn', label: `Area you drew, p.${page}`, keys: []});
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const place = (rect: number[]) => size ? {left: `${rect[0] / size.width * 100}%`, top: `${rect[1] / size.height * 100}%`,
    width: `${(rect[2] - rect[0]) / size.width * 100}%`, height: `${(rect[3] - rect[1]) / size.height * 100}%`} : {};

  // The reason is asked beside the box: under it, or above it near the foot of the page.
  const whyPlace = (rect: number[]) => size ? (rect[3] / size.height > 0.7
    ? {bottom: `${(1 - rect[1] / size.height) * 100}%`, marginBottom: 8} : {top: `${rect[3] / size.height * 100}%`, marginTop: 8}) : {};
  const onPage = (n: number) => ({marked: marks.filter(m => m.page === n).length, proposed: (v?.proposals ?? []).filter(p => p.page === n && !settled[p.id]).length});
  const pageWords = (n: number) => {
    const {marked, proposed} = onPage(n);
    if (!marked && !proposed) return 'nothing marked';
    return [marked ? `${marked} redacted` : '', proposed ? `${proposed} proposed` : ''].filter(Boolean).join(' · ');
  };
  const proposedLeft = open.length;
  const hereOpen = open.filter(p => p.page === page);
  const name = newFileName(doc.filename, madeFor, new Date());

  return <div className="ph rd" data-calm-zone="" role="dialog" aria-modal="true" aria-label={`Redact before sharing: ${doc.filename}`}>
    <header className="ph-top">
      <nav className="rr-crumbs" aria-label="Where"><span>{caseName}</span><span>Reading room</span><b>{doc.filename}</b></nav>
      <div className="tl2-views" role="tablist" aria-label="This PDF">
        <button role="tab" aria-selected={tab === 'redact'} onClick={() => setTab('redact')}>Redact</button>
        <button role="tab" aria-selected={tab === 'hidden'} onClick={() => setTab('hidden')}>Hidden data · {hiddenFound.reduce((n, h) => n + h.count, 0)}</button>
        <button role="tab" aria-selected={tab === 'compare'} onClick={() => setTab('compare')}>Compare · {copies.length}</button>
        <button role="tab" aria-selected={tab === 'archive'} onClick={() => setTab('archive')}>Archive (PDF/A)</button>
      </div>
      <p className="tl2-status">{v ? `${v.pages.length} ${v.pages.length === 1 ? 'page' : 'pages'} · ` : ''}kept as uploaded {doc.sha256 && <FingerprintMark hash={doc.sha256}/>}</p>
      <button className="tl2-plain" onClick={onClose}>Back to reading</button>
    </header>
    <div className="tl2-head"><Reveal detail="For an editor, a lawyer or publication. The case keeps the original; you get a new file with the text truly gone, not covered.">
      <h2>Redact before sharing</h2></Reveal></div>
    {message && <p className="tl2-msg" role="status">{message}</p>}
    {view.isError && <p className="lr-note">{errorMessage(view.error, 'Could not read the PDF')}</p>}

    {tab === 'hidden' ? <HiddenData hidden={v?.hidden ?? []} removing={removing} setRemove={setRemove}/>
      : tab === 'compare' ? <CompareCopies doc={doc} copies={copies} pages={v?.pages.length ?? 1}/>
      : tab === 'archive' ? <Archive v={v} pdfa={pdfa} setPdfa={setPdfa}/>
      : <div className="rd-body">
        <nav className="rd-pages" aria-label="Pages">
          <p className="tl2-cap">Pages</p>
          {(v?.pages ?? []).map(p => <button key={p.page} aria-current={p.page === page ? 'page' : undefined} onClick={() => setPage(p.page)}>
            <span className="rd-thumb" aria-hidden>{onPage(p.page).marked > 0 && <i/>}</span>
            <b>Page {p.page}</b>{pageWords(p.page) !== 'nothing marked' && <small>{pageWords(p.page)}</small>}</button>)}
        </nav>

        <section ref={centre} className="rd-centre">
          {hereOpen.length > 0 && <div className="rd-here" role="group" aria-label={`Proposed on page ${page}`}>
            <span><b>{hereOpen.length}</b> proposed on page {page}</span>
            <button className="tl2-plain" onClick={() => keep(hereOpen, `Everything proposed on p.${page}${times(hereOpen.length)}`)}>Redact all on this page</button>
            <button className="tl2-plain" onClick={() => reject(hereOpen)}>Keep all</button>
          </div>}
          <div ref={stage} className="rd-stage" onPointerDown={onDown} style={size ? {aspectRatio: `${size.width} / ${size.height}`} : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of a page of a case file, drawn by this app */}
            {pageImage ? <img src={pageImage} alt={`Page ${page} of ${doc.filename}`} draggable={false}/> : <p className="tl2-none">Drawing page {page}…</p>}
            {/* A box's reason is on hover (its button already says it to screen readers). */}
            {marks.filter(m => m.page === page).map(m => <Reveal key={m.key} tabbable={false} describe={false} detail={<><b>{m.label}</b><span className="rv-row">reason: {m.reason}</span></>}>
              <button className="rd-box done" style={place(m.rect)} onClick={() => unmark(m.key)}
              aria-label={`Redacted: ${m.label}, ${m.reason}. Press to take the box off`}/></Reveal>)}
            {(v?.proposals ?? []).filter(p => p.page === page && !settled[p.id]).map(p => <button key={p.id} className="rd-box proposed" style={place(p.rect)}
              onClick={() => keep(open.filter(q => q.kind === p.kind && plain(q.text).toLowerCase() === plain(p.text).toLowerCase()))}
              aria-label={`Proposed: ${p.text}, ${p.why}. Press to redact it`}/>)}
            {pending?.page === page && <span className="rd-box pending" style={place(pending.rect)}/>}
            {pending?.page === page && size && <form className="rd-why" style={whyPlace(pending.rect)} onSubmit={ev => { ev.preventDefault(); confirm(); }}>
              <p><b>{pending.label}</b> <Reveal detail="The reason is kept in the trail; the words under the box are not.">Why is it redacted?</Reveal></p>
              <div className="rd-chips">{REASONS.map(r => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
              <input aria-label="The reason" autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="or say it in your words" maxLength={300}/>
              <button type="submit" className="tl2-play" disabled={!reason.trim()}>Redact it</button>
              <button type="button" className="tl2-plain" onClick={() => setPending(null)}>Cancel</button>
            </form>}
            {drag && <span className="rd-box pending" style={place([Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.max(drag.x0, drag.x1), Math.max(drag.y0, drag.y1)])}/>}
          </div>
          {/* The marks' key stays; how to use them is on hover (keys are listed behind ?). */}
          <p className="rd-legend"><Reveal detail="Drag a box over the page to redact an area."><span><i className="done"/>redacted</span></Reveal>
            <Reveal detail="Press a proposed box to redact it, or reject it in the list."><span><i className="proposed"/>proposed</span></Reveal></p>
        </section>

        <aside className="rd-side">
          <section className="rd-panel" aria-label="This redaction">
            <p className="tl2-cap">This redaction · {marks.length} done, {proposedLeft} proposed</p>
            <ul className="rd-list">
              {doneGroups.map(({key, items}) => { const m = items[0];
                return <li key={key}><i className="done" aria-hidden>■</i><p><Reveal detail={`reason: ${m.reason}`}>{m.label}</Reveal></p>
                  <button className="tl2-plain" onClick={() => unmark(...items.map(x => x.key))} aria-label={`Take off the box: ${m.label}`}>×</button></li>; })}
              {/* Proposals by kind across the file: a whole kind in one move, then the same words everywhere, then each place. */}
              {kinds.map(k => <li key={k.kind} className="rd-kind">
                <i className="proposed" aria-hidden>{KIND_MARK[k.kind]}</i>
                <button className="rd-open" aria-expanded={kindOpen(k)} onClick={() => setOpenKinds(o => ({...o, [k.kind]: !kindOpen(k)}))}>
                  <b>{KIND_PLURAL[k.kind]}</b> <span className="rd-n">{k.items.length}</span>
                  <small>{k.texts.length > 1 ? `${k.texts.length} different · ` : ''}{onPages(k.pages)}</small></button>
                <span className="ph-yn"><button aria-label={`Yes: redact every ${KIND_WORDS[k.kind].toLowerCase()} (${k.items.length})`}
                  onClick={() => keep(k.items, `${KIND_PLURAL[k.kind]}${times(k.items.length)}, ${onPages(k.pages)}`)}>Y</button>
                  <button aria-label={`No: keep every ${KIND_WORDS[k.kind].toLowerCase()} (${k.items.length})`} onClick={() => reject(k.items)}>X</button></span>
                {kindOpen(k) && <ul className="rd-texts">{k.texts.map(g => <li key={g.key}>
                  <button className="rd-open" aria-expanded={Boolean(openTexts[g.key])} onClick={() => setOpenTexts(o => ({...o, [g.key]: !o[g.key]}))}>
                    <Reveal detail={g.items[0].why}><span>{g.kind === 'person' ? `“${g.text}”` : g.text}</span></Reveal>
                    <small>{g.items.length > 1 ? `×${g.items.length} · ` : ''}{onPages(g.pages)}</small></button>
                  <span className="ph-yn"><button aria-label={`Yes: redact ${g.text}`} onClick={() => keep(g.items, textLabel(g))}>Y</button>
                    <button aria-label={`No: keep ${g.text}`} onClick={() => reject(g.items)}>X</button></span>
                  {openTexts[g.key] && <p className="rd-where">{g.pages.map(n => { const here = g.items.filter(i => i.page === n).length;
                    return <button key={n} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>p.{n}{here > 1 ? ` ×${here}` : ''}</button>; })}</p>}
                </li>)}</ul>}
              </li>)}
              {!marks.length && !kinds.length && <li className="rd-empty"><Reveal detail="Drag a box over the page, or accept a proposal.">Nothing marked yet.</Reveal></li>}
            </ul>
          </section>
          <section className="rd-panel" aria-label="Also remove from the copy">
            <p className="tl2-cap">Also remove from the copy</p>
            <ul className="rd-list">
              {hiddenFound.map(h => <li key={h.category}><label><input type="checkbox" checked={removing.includes(h.category)}
                onChange={e => setRemove(e.target.checked ? [...removing, h.category] : removing.filter(c => c !== h.category))}/>{h.label}</label><small className="rd-count">{h.count}</small></li>)}
              {v && !hiddenFound.length && <li className="rd-empty">No hidden data found in this PDF.</li>}
              <li><label><input type="checkbox" checked={pdfa} onChange={e => setPdfa(e.target.checked)}/>Make it PDF/A for archiving</label><small className="rd-count">{pdfa ? 'on' : 'off'}</small></li>
            </ul>
          </section>
          <section className="rd-panel" aria-label="The new file">
            {/* A safety statement: it stays on screen; which file and its fingerprint are on hover. */}
            <Reveal detail={<><span className="rv-row">{doc.filename} is in the case and cannot be written by these tools.</span>
              <span className="rv-row rv-mono">SHA-256 {doc.sha256}</span></>}><p className="rd-safe">✓ <b>The original stays as it is.</b></p></Reveal>
            <p className="tl2-cap"><Reveal detail={`Text under each box is removed from the page, not hidden; the copy is opened again afterwards and checked for it. Its edit-trail row names you, the ${marks.length} ${marks.length === 1 ? 'box' : 'boxes'} and their reasons.`}>The new file</Reveal></p>
            <label className="rd-for">For <select value={madeFor} onChange={e => setMadeFor(e.target.value as MadeFor)}>
              {(Object.keys(MADE_FOR) as MadeFor[]).map(k => <option key={k} value={k}>{MADE_FOR[k]}</option>)}</select></label>
            <code className="rd-name">{made?.filename ?? name}</code>
            {made ? <button className="tl2-play rd-make" onClick={() => void openCopy(made)}>Open the redacted copy</button>
              : <button className="tl2-play rd-make" onClick={() => make.mutate()} disabled={!marks.length || make.isPending || !v}>{make.isPending ? 'Redacting and checking…' : 'Make the redacted copy'}</button>}
            {made && <button className="tl2-plain" onClick={() => setTab('compare')}>Compare it with the original</button>}
          </section>
        </aside>
      </div>}
  </div>;
}

function HiddenData({hidden, removing, setRemove}: {hidden: Array<{category: string; label: string; count: number}>; removing: string[]; setRemove: (c: string[]) => void}): ReactElement {
  return <section className="rd-panel rd-wide" aria-label="Hidden data">
    <p className="tl2-cap"><Reveal detail={<><span className="rv-row">Found by PdfCraft; ticked ones are taken out of the copy, never the original.</span>
      <span className="rv-row">Metadata names the author, the software and the dates; comments and hidden layers can hold drafts; embedded files are whole documents of their own.
      Form fields are flattened, so what was typed stays visible.</span></>}>What the file carries besides its pages</Reveal></p>
    <ul className="rd-list">
      {hidden.map(h => <li key={h.category} className={h.count ? '' : 'none'}><label><input type="checkbox" disabled={!h.count} checked={removing.includes(h.category)}
        onChange={e => setRemove(e.target.checked ? [...removing, h.category] : removing.filter(c => c !== h.category))}/>{h.label}</label><small className="rd-count">{h.count || 'none'}</small></li>)}
    </ul>
  </section>;
}

function CompareCopies({doc, copies, pages}: {doc: DocumentDetailOut; copies: DerivedFileOut[]; pages: number}): ReactElement {
  const [picked, setPicked] = useState<string | null>(null);
  const copy = copies.find(c => c.id === picked) ?? copies[copies.length - 1] ?? null;
  const [chosenPage, setPage] = useState<number | null>(null);
  const diff = useQuery({...compareRedactedOptions({path: {document_id: doc.id}, query: {copy_id: copy?.id ?? ''}}), enabled: Boolean(copy), retry: false});
  // Opens on the first page the copy changed.
  const page = chosenPage ?? diff.data?.pages_changed[0] ?? 1;
  const original = useBlobUrl(`pdfpage:${doc.id}:${page}:cmp`, `/api/documents/${doc.id}/page-image?page=${page}&width=700`);
  const theirs = useBlobUrl(`copypage:${copy?.id ?? ''}:${page}`, copy ? `/api/derived-files/${copy.id}/page.png?page=${page}&width=700` : null);
  if (!copy) return <section className="rd-panel rd-wide"><p className="lr-note">No redacted copy yet. Make one on Redact, then compare it here with the original.</p></section>;
  const left = (diff.data?.hidden_left ?? []).filter(h => h.count > 0);
  return <section className="rd-panel rd-wide" aria-label="Compare">
    <div className="rd-cmp-head">
      <label>Copy <select aria-label="The copy to compare" value={copy.id} onChange={e => setPicked(e.target.value)}>{copies.map(c => <option key={c.id} value={c.id}>{c.filename}</option>)}</select></label>
      <label>Page <select aria-label="The page to compare" value={page} onChange={e => setPage(Number(e.target.value))}>{Array.from({length: pages}, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
      {diff.data && <p>{diff.data.old_words - diff.data.new_words} {diff.data.old_words - diff.data.new_words === 1 ? 'word' : 'words'} gone
        {diff.data.pages_changed.length ? ` · changed on ${diff.data.pages_changed.length === 1 ? 'page' : 'pages'} ${diff.data.pages_changed.join(', ')}` : ''}
        {' · '}{left.length ? `still in the copy: ${left.map(h => `${h.label.toLowerCase()} (${h.count})`).join(', ')}` : 'no hidden data left'}</p>}
    </div>
    <div className="rd-cmp">
      <figure><figcaption>Original · in the case</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL drawn by this app */}
        {original ? <img src={original} alt={`Page ${page} of the original`}/> : <p className="tl2-none">Drawing…</p>}</figure>
      <figure><figcaption>{copy.filename}</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL drawn by this app */}
        {theirs ? <img src={theirs} alt={`Page ${page} of the redacted copy`}/> : <p className="tl2-none">Drawing…</p>}</figure>
    </div>
    <ul className="rd-list">{((copy.params?.boxes ?? []) as Array<{page: number; reason: string; kind: string}>).map((b, i) =>
      <li key={i}><i className="done" aria-hidden>■</i><p><Reveal detail={`reason: ${b.reason}`}>{KIND_WORDS[(b.kind as Kind) ?? 'drawn'] ?? 'Area'}, p.{b.page}</Reveal></p></li>)}</ul>
  </section>;
}

function Archive({v, pdfa, setPdfa}: {v: {pdfa: {compliant: boolean; declared?: string | null; issues: Array<{clause?: string | null; message?: string | null; fixable: boolean}>}} | undefined; pdfa: boolean; setPdfa: (b: boolean) => void}): ReactElement {
  if (!v) return <section className="rd-panel rd-wide"><p className="tl2-none">Reading the PDF…</p></section>;
  const fixable = v.pdfa.issues.filter(i => i.fixable).length;
  return <section className="rd-panel rd-wide" aria-label="Archive">
    <p className="tl2-cap"><Reveal detail="Checked by PdfCraft against ISO 19005.">PDF/A-2b, the archiving standard</Reveal></p>
    <p>{v.pdfa.compliant ? 'The original already meets PDF/A-2b.' : `The original breaks ${v.pdfa.issues.length} ${v.pdfa.issues.length === 1 ? 'rule' : 'rules'}; ${fixable} can be fixed in the copy${
        fixable < v.pdfa.issues.length ? `, so a PDF/A copy would still break ${v.pdfa.issues.length - fixable}` : ''}.`}
      {v.pdfa.declared ? ` It declares ${v.pdfa.declared}.` : ''}</p>
    <ul className="rd-list">{v.pdfa.issues.map((i, n) => <li key={n}><i className={i.fixable ? 'proposed' : 'done'} aria-hidden>{i.fixable ? '✓' : '!'}</i>
      <p><Reveal detail={`clause ${i.clause ?? '—'} · ${i.fixable ? 'fixed in the copy' : 'cannot be fixed here'}`}>{i.message}</Reveal></p></li>)}</ul>
    <label className="rd-for"><input type="checkbox" checked={pdfa} onChange={e => setPdfa(e.target.checked)}/> Make the redacted copy PDF/A-2b</label>
  </section>;
}
