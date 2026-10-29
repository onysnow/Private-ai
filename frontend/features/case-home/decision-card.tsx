'use client';
// One decision as the same five-part card everywhere (FEATURE_CHECK §2):
// question, proposal with who proposed it, evidence, choices, what happens.
// Three tall answers, each a shape, a word and a key; No offers reason chips.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {PartyGlyph} from '../../components/network/marks';
import {AiTag, LevelChip} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {PARTY, partyKind} from '../../lib/viz-tokens';
import {singleKeysOn} from '../../lib/shortcuts';
import {api} from '../../lib/api-instance';
import type {DecisionChoiceOut, DecisionItemOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {caseHref} from '../../lib/case-href';
import {KIND_ICON, KIND_LABEL, KIND_MEANING, NO_REASONS, markTerms} from './use-decisions';
import type {DecisionKind} from './use-decisions';

const MARK: Record<DecisionChoiceOut['key'], string> = {yes: '✓', no: '✕', unsure: '○'};
export const KEYS = {home: {yes: 's', no: 'd', unsure: 'u'}, decide: {yes: '1', no: '2', unsure: '3'}} as const;

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

export function Excerpt({text, terms}: {text: string; terms: string[]}): ReactElement {
  return <>{markTerms(text, terms).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}</>;
}

/** The table rows a proposal was read from: one row a line, its cells under their column names. */
export function RowCells({rows, compact = false}: {rows: NonNullable<NonNullable<DecisionItemOut['evidence']>['rows']>; compact?: boolean}): ReactElement | null {
  if (!rows.length) return null;
  const columns = [...new Set(rows.flatMap(r => Object.keys(r.cells)))];
  return <div className={`ch-cells${compact ? ' ch-cells-compact' : ''}`}>
    <table>
      <thead><tr><th scope="col">Row</th>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.number}><th scope="row">{r.number}</th>{columns.map(c => <td key={c}>{r.cells[c] ?? ''}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

/** A decision's kind as its mark (Decide's vocabulary), named on hover, focus or click. `bare` draws the mark alone,
 *  for a control that names the kind itself and wears the reveal. */
export function KindMark({kind, tabbable = true, bare = false, extra}: {kind: DecisionKind; tabbable?: boolean; bare?: boolean; extra?: ReactNode}): ReactElement {
  const glyph = <span className={`dc-kind dc-kind-${kind}`} aria-hidden="true">{KIND_ICON[kind]}</span>;
  if (bare) return glyph;
  return <Reveal tabbable={tabbable} label={KIND_LABEL[kind]} detail={<><b>{KIND_LABEL[kind]}</b><span className="rv-row">{KIND_MEANING[kind]}</span>{extra}</>}>{glyph}</Reveal>;
}

export function PartyChips({parties}: {parties: DecisionItemOut['parties']}): ReactElement | null {
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const point = useWorkbenchStore(state => state.setPointedParty);
  // Pointing (hover or focus) already lights a party; the click that follows keeps it lit
  // rather than turning it off again. A second click turns it off (as the Home mini-network does).
  const pointedByHover = useRef<string | null>(null);
  const reach = (id: string) => {
    if (pointed === id) return;
    pointedByHover.current = id;
    point(id);
  };
  const press = (id: string) => {
    if (pointedByHover.current === id) { pointedByHover.current = null; return; }
    pointedByHover.current = null;
    point(pointed === id ? null : id);
  };
  if (!parties.length) return null;
  return <ul className="ch-parties" aria-label="Parties">
    {parties.map(p => <li key={p.id}>
      {/* The party's kind is its icon, named on hover or focus (Ony, 29 Oct). */}
      <Reveal tabbable={false} detail={<><b>{PARTY[partyKind(p.schema)].name}</b>{p.schema ? <span className="rv-row rv-mono">{p.schema}</span> : null}</>}>
        <button type="button" className={`ch-party${pointed === p.id ? ' on' : ''}`} onMouseEnter={() => reach(p.id)}
          onFocus={() => reach(p.id)} onClick={() => press(p.id)} aria-pressed={pointed === p.id}>
          <PartyGlyph kind={partyKind(p.schema)} size={14}/>{p.name}
        </button></Reveal>
    </li>)}
  </ul>;
}

/** The page number a locator names: "p. 4", "page 12", "pp. 3–4". */
export function pageOf(locator?: string | null): number | null {
  const m = /\bp(?:age|p)?\.?\s*(\d+)/i.exec(locator ?? '');
  return m ? Number(m[1]) : null;
}

/** The page the passage is on, drawn with the passage marked (backend
 *  GET /api/documents/{id}/page-image); "View full page" opens the reader there. */
/** A page of a PDF drawn by the API (GET /api/documents/{id}/page-image), the passage marked when given; with
 * `crop`, only the band of the page around the passage. */
export function PagePicture({documentId, page, passage = '', width = 320, crop = false, alt}: {documentId: string; page: number; passage?: string; width?: number; crop?: boolean; alt: string}): ReactElement | null {
  const query = new URLSearchParams({page: String(page), width: String(width), highlight: passage.slice(0, 1500), ...(crop ? {crop: 'true'} : {})});
  const image = useQuery({queryKey: ['page-image', documentId, page, passage, width, crop], queryFn: () => api.blob(`/api/documents/${documentId}/page-image?${query}`),
    staleTime: Infinity, retry: false});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image.data) return undefined;
    const made = URL.createObjectURL(image.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image.data]);
  if (image.isError) return null;
  // A blob of the page the API drew, so next/image has nothing to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="ch-page-img" src={url} alt={alt}/> : <span className="ch-page-wait" aria-busy="true"/>;
}

function PageThumb({documentId, page, passage}: {documentId: string; page: number; passage: string}): ReactElement | null {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  return <figure className="ch-page">
    <PagePicture documentId={documentId} page={page} passage={passage} alt={`Page ${page}, the passage marked`}/>
    <button type="button" onClick={() => openDocument(documentId, page)}>View full page <span aria-hidden="true">↗</span></button>
  </figure>;
}

/** "What happens" (CHECK_1): what each answer does, as the server words it from the endpoint the answer posts
 *  to, then what holds whichever way you answer. */
export function WhatHappens({item}: {item: DecisionItemOut}): ReactElement | null {
  const answers = item.choices.filter(c => c.happens);
  if (!answers.length && !item.consequences.length) return null;
  return <div className="ch-happens" aria-label="What happens">
    <p className="ch-eyebrow">What happens</p>
    {answers.length > 0 && <dl>{answers.map(c => <div key={c.key} className={`ch-happens-${c.key}`}>
      <dt><span aria-hidden="true">{MARK[c.key]}</span> {c.label}</dt><dd>{c.happens}</dd>
    </div>)}</dl>}
    {item.consequences.length > 0 && <ul>{item.consequences.map(c => <li key={c}>{c}</li>)}</ul>}
  </div>;
}

export function DecisionCard({item, position, total, keys, active, onDecide, showWhatHappens = true}: {
  item: DecisionItemOut; position: number; total: number; keys: 'home' | 'decide'; active: boolean;
  onDecide: (choice: DecisionChoiceOut, note: string) => void; showWhatHappens?: boolean;
}): ReactElement {
  const [noOpen, setNoOpen] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { setNoOpen(false); setNote(''); }, [item.id]);
  const keyOf = KEYS[keys];

  useEffect(() => {
    if (!active) return undefined;
    const handle = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || !singleKeysOn()) return;
      const choice = item.choices.find(c => keyOf[c.key] === event.key.toLowerCase());
      if (!choice) return;
      event.preventDefault();
      // The key for No opens the reasons first, as a click does; pressing it again answers No without one.
      if (choice.key === 'no' && !noOpen && NO_REASONS[item.kind].length) { setNoOpen(true); return; }
      onDecide(choice, note);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, item, keyOf, note, noOpen, onDecide]);

  const ev = item.evidence;
  const inv = useWorkbenchStore(state => state.investigationId);
  // On Case home the page sits beside the question (mockup HOME_1); Decide shows it in its own pane.
  const page = keys === 'home' && ev?.document_id && /\.pdf$/i.test(ev.filename ?? '') && ev.excerpt ? pageOf(ev.locator) : null;
  // Where the passage sits (file · page · scanned) is sub-text: on the passage, on hover or focus (Ony, 29 Oct).
  const locator = ev ? [ev.filename, ev.locator, /OCR/i.test(ev.locator ?? '') ? 'scanned, OCR' : null].filter(Boolean).join(' · ') : '';
  // Why it is asked is sub-text too: on the question. Who proposed it stays as its mark (the AI mark), the level as its bars.
  const question = <h3 className="ch-question">{item.reason
    ? <Reveal detail={<>{item.actor_kind !== 'ai' && item.actor ? <b>{item.actor}</b> : null}<span className="rv-row">{item.reason}</span></>}>{item.question}</Reveal>
    : item.question}</h3>;
  const words = <>
    {ev?.rows?.length ? <RowCells rows={ev.rows} compact/>
      : ev?.excerpt ? <blockquote className="ch-excerpt">{locator
        ? <Reveal detail={<span className="rv-mono">{locator}</span>}><Excerpt text={`“${ev.excerpt.trim()}”`} terms={ev.terms}/></Reveal>
        : <Excerpt text={`“${ev.excerpt.trim()}”`} terms={ev.terms}/>}</blockquote>
      : <p className="ch-proposal">{item.proposal}</p>}
    {/* No passage to show here (an AI draft, a missing record): the thing itself is one click away. */}
    {keys === 'home' && !ev && item.choices.length > 0 && <Link className="ch-source-link" href={caseHref(item.open.href, inv)}>{item.open.label} <span aria-hidden="true">↗</span></Link>}
    {ev && !ev.excerpt && locator && <p className="ch-locator"><Reveal detail={<span className="rv-mono">{locator}</span>}><span>{ev.filename || 'Source'}</span></Reveal></p>}
    <PartyChips parties={item.parties}/>
  </>;
  const extras = <>
    {item.known && item.known.length > 0 && <ul className="ch-known" aria-label="Already in the case">{item.known.map(k => <li key={k}>{k}</li>)}</ul>}
    {showWhatHappens && <WhatHappens item={item}/>}
  </>;
  return <article className={`ch-card ch-kind-${item.kind}`} aria-label={`${item.question} (${position} of ${total})`} data-testid="decision-card">
    {(item.actor_kind === 'ai' || (keys === 'decide' && item.level)) && <p className="ch-why">
      {item.actor_kind === 'ai' && <AiTag/>}
      {keys === 'decide' && item.level && <LevelChip level={item.level} focusable/>}
    </p>}
    {page !== null && ev?.document_id ? <div className="ch-card-body ch-split">
      <PageThumb documentId={ev.document_id} page={page} passage={ev.excerpt!.trim()}/>
      <div className="ch-split-words">{question}{words}{extras}</div>
    </div> : <>
      {question}
      <div className="ch-card-body">{words}{extras}</div>
    </>}
    {item.choices.length > 0 ? <>
      <div className="ch-choices" role="group" aria-label="Your answer">
        {item.choices.map(c => <button key={c.key} type="button" className={`ch-choice ch-${c.key}`} aria-keyshortcuts={keyOf[c.key].toUpperCase()}
          onClick={() => (c.key === 'no' && !noOpen && NO_REASONS[item.kind].length ? setNoOpen(true) : onDecide(c, note))}>
          <span aria-hidden="true">{MARK[c.key]}</span>{c.label}<kbd>{keyOf[c.key].toUpperCase()}</kbd>
        </button>)}
      </div>
      {noOpen && <div className="ch-reasons" role="group" aria-label="Why not">
        {NO_REASONS[item.kind].map(r => <button key={r} type="button" className="ch-chip" onClick={() => {
          const no = item.choices.find(c => c.key === 'no');
          if (no) onDecide(no, [r, note].filter(Boolean).join(' — '));
        }}>{r}</button>)}
        <input aria-label="Note" placeholder="Or write why…" value={note} onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { const no = item.choices.find(c => c.key === 'no'); if (no) onDecide(no, note); } }}/>
      </div>}
    </> : <p className="ch-elsewhere">This one is answered where it lives: <Link href={caseHref(item.open.href, inv)}>{item.open.label}</Link>.</p>}
  </article>;
}
