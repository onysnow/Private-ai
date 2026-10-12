'use client';
// One decision as the same five-part card everywhere (FEATURE_CHECK §2):
// question, proposal with who proposed it, evidence, choices, what happens.
// Three tall answers, each a shape, a word and a key; No offers reason chips.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {AiTag, LevelChip} from '../../components/status';
import {singleKeysOn} from '../../lib/shortcuts';
import {api} from '../../lib/api-instance';
import type {DecisionChoiceOut, DecisionItemOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {caseHref} from '../../lib/case-href';
import {NO_REASONS, markTerms} from './use-decisions';

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

export function PartyChips({parties}: {parties: DecisionItemOut['parties']}): ReactElement | null {
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const point = useWorkbenchStore(state => state.setPointedParty);
  if (!parties.length) return null;
  return <ul className="ch-parties" aria-label="Parties">
    {parties.map(p => <li key={p.id}>
      <button type="button" className={`ch-party${pointed === p.id ? ' on' : ''}`} onMouseEnter={() => point(p.id)}
        onFocus={() => point(p.id)} onClick={() => point(pointed === p.id ? null : p.id)} aria-pressed={pointed === p.id}>
        <span aria-hidden="true" className="ch-party-kind">{(p.schema || 'T')[0]}</span>{p.name}
      </button>
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
function PageThumb({documentId, page, passage}: {documentId: string; page: number; passage: string}): ReactElement | null {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const query = new URLSearchParams({page: String(page), width: '320', highlight: passage.slice(0, 1500)});
  const image = useQuery({queryKey: ['page-image', documentId, page, passage], queryFn: () => api.blob(`/api/documents/${documentId}/page-image?${query}`),
    staleTime: Infinity, retry: false});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image.data) return undefined;
    const made = URL.createObjectURL(image.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image.data]);
  if (image.isError) return null;
  return <figure className="ch-page">
    {/* A blob of the page the API drew, so next/image has nothing to optimise. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url ? <img src={url} alt={`Page ${page}, the passage marked`}/> : <span className="ch-page-wait" aria-busy="true"/>}
    <button type="button" onClick={() => openDocument(documentId, page)}>View full page <span aria-hidden="true">↗</span></button>
  </figure>;
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
      onDecide(choice, note);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, item, keyOf, note, onDecide]);

  const ev = item.evidence;
  const inv = useWorkbenchStore(state => state.investigationId);
  return <article className={`ch-card ch-kind-${item.kind}`} aria-label={`${item.question} (${position} of ${total})`} data-testid="decision-card">
    <p className="ch-why">
      {item.actor_kind === 'ai' ? <AiTag/> : <span className="ch-actor">{item.actor}</span>}
      {item.level && <LevelChip level={item.level}/>}
      <span>{item.reason}</span>
    </p>
    <h3 className="ch-question">{item.question}</h3>
    <div className="ch-card-body">
    {ev?.rows?.length ? <RowCells rows={ev.rows} compact/>
      : ev?.excerpt ? <div className="ch-passage">
        <blockquote className="ch-excerpt"><Excerpt text={`“${ev.excerpt.trim()}”`} terms={ev.terms}/></blockquote>
        {ev.document_id && /\.pdf$/i.test(ev.filename ?? '') && pageOf(ev.locator) !== null
          && <PageThumb documentId={ev.document_id} page={pageOf(ev.locator)!} passage={ev.excerpt.trim()}/>}
      </div>
      : <p className="ch-proposal">{item.proposal}</p>}
    {ev && <p className="ch-locator">{[ev.filename, ev.locator].filter(Boolean).join(' · ')}</p>}
    <PartyChips parties={item.parties}/>
    {item.known && item.known.length > 0 && <ul className="ch-known" aria-label="Already in the case">{item.known.map(k => <li key={k}>{k}</li>)}</ul>}
    {showWhatHappens && item.consequences.length > 0 && <div className="ch-happens">
      <p className="ch-eyebrow">If you answer</p>
      <ul>{item.consequences.map(c => <li key={c}>{c}</li>)}</ul>
    </div>}
    </div>
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
