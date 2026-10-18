'use client';
// Decide (Workbench-redesign-2026.pdf, Check §3.1; mockup CHECK_1): every decision
// only a person can make, on one whole screen. Queue on the left, grouped by where
// it comes from; the evidence in the middle, still; the card on the right. Keys:
// J/K move, 1/2/3 answer, Z undo. An answer waits a few seconds before it is sent.
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {AiTag, LevelChip} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {singleKeysOn} from '../../lib/shortcuts';
import type {DecisionChoiceOut, DecisionItemOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {caseHref} from '../../lib/case-href';
import {DecisionCard, Excerpt, PartyChips, RowCells, pageOf} from './decision-card';
import {HOLD_MS, KIND_LABEL, useDecisions} from './use-decisions';
import type {DecisionKind, DecisionOrder} from './use-decisions';

const KIND_ICON: Record<DecisionKind, string> = {to_check: '?', missing: '∅', proposal: '◇', match: '⇄', outside: '◎', ai: 'AI', watchlist: '◉'};
const SHAPE: Record<DecisionChoiceOut['key'], string> = {yes: '✓', no: '✕', unsure: '○'};

function age(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
}

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

function EvidencePane({item}: {item: DecisionItemOut}): ReactElement {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const inv = useWorkbenchStore(state => state.investigationId);
  const ev = item.evidence;
  return <section className="dc-evidence" aria-label="What it rests on">
    {ev ? <>
      <header className="dc-doc">
        <div className="dc-doc-icon" aria-hidden="true"><i/><i/><i/></div>
        <div><b>{ev.filename || 'Document'}</b><span>{ev.locator || 'no locator'}</span></div>
        {ev.document_id && <div className="dc-doc-actions">
          <button type="button" onClick={() => openProvenance({title: ev.filename || 'Document', kind: 'document', documentId: ev.document_id!, locator: ev.locator || undefined})}>Trace</button>
          <button type="button" onClick={() => openDocument(ev.document_id!, pageOf(ev.locator))}>Open the document</button>
        </div>}
      </header>
      <div className="dc-read">
        {ev.rows?.length ? <RowCells rows={ev.rows}/>
          : ev.excerpt ? <p><Excerpt text={ev.excerpt} terms={ev.terms}/></p> : <p className="ch-quiet">No passage is stored with this item.</p>}
        {ev.terms.length > 0 && <p className="dc-legend"><mark>words</mark> this rests on</p>}
      </div>
    </> : <div className="dc-read dc-noevidence">
      <p className="ch-eyebrow">{KIND_LABEL[item.kind]}</p>
      <p className="dc-proposal">{item.proposal}</p>
      <PartyChips parties={item.parties}/>
      {item.kind === 'missing'
        ? <p className="ch-quiet">{item.reason}. When the value is filled in where the record lives, this goes by itself. <Link href={caseHref(item.open.href, inv)}>{item.open.label} →</Link></p>
        : <p className="ch-quiet">This kind has no passage to show. <Link href={caseHref(item.open.href, inv)}>{item.open.label} →</Link></p>}
    </div>}
  </section>;
}

export function DecideScreen({investigationId, investigationName, active = true}: {investigationId: string; investigationName: string; active?: boolean}): ReactElement {
  const [kind, setKind] = useState<DecisionKind | undefined>(undefined);
  const [order, setOrder] = useState<DecisionOrder>('source');
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('kind') as DecisionKind | null;
    if (wanted && wanted in KIND_LABEL) setKind(wanted);
  }, []);
  const all = useDecisions(investigationId, {order});
  const items = useMemo(() => (kind ? all.items.filter(i => i.kind === kind) : all.items), [all.items, kind]);
  const [selected, setSelected] = useState<string | null>(null);
  const index = Math.max(0, items.findIndex(i => i.id === selected));
  const item = items[index];
  const total = Object.values(all.counts).reduce((n, v) => n + v, 0);

  const move = useCallback((step: number) => {
    const next = items[Math.min(items.length - 1, Math.max(0, index + step))];
    if (next) setSelected(next.id);
  }, [index, items]);

  const onDecide = useCallback((choice: DecisionChoiceOut, note: string) => {
    if (!item) return;
    const next = items[index + 1] ?? items[index - 1];
    all.decide(item, choice, note);
    setSelected(next?.id ?? null);
  }, [all, index, item, items]);

  // Keys act only while this screen is on show (the case layout keeps it mounted when hidden).
  useEffect(() => {
    if (!active) return undefined;
    const handle = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || !singleKeysOn()) return;
      const key = event.key.toLowerCase();
      if (key === 'j') { event.preventDefault(); move(1); } else if (key === 'k') { event.preventDefault(); move(-1); } else if (key === 'z') { event.preventDefault(); all.undo(); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, all, move]);

  const groups = useMemo(() => {
    const out: {key: string; group: string; label: string; items: DecisionItemOut[]}[] = [];
    for (const i of items) {
      const last = out[out.length - 1];
      if (order === 'source' && last && last.group === i.group.key) last.items.push(i);
      else out.push({key: `${i.group.key}:${out.length}`, group: i.group.key, label: order === 'source' ? i.group.label : '', items: [i]});
    }
    return out;
  }, [items, order]);

  const loading = all.query.isPending && Boolean(investigationId);
  const session = {yes: 0, no: 0, unsure: 0};
  for (const d of all.decided) session[d.choice.key] += 1;
  const failed = all.decided.find(d => d.state === 'failed');
  const kinds = Object.keys(KIND_LABEL) as DecisionKind[];

  return <div className="dc" aria-label="Decide">
    <aside className="dc-queue" aria-label="To decide">
      <h1>To decide</h1>
      <p className="ch-quiet">{investigationName ? `${investigationName} · ` : ''}only you can decide these</p>
      <div className="dc-chips" role="group" aria-label="Show">
        <button type="button" className={!kind ? 'on' : ''} aria-pressed={!kind} onClick={() => setKind(undefined)}>All {loading ? '…' : total}</button>
        {kinds.filter(k => all.counts[k]).map(k => <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k}
          onClick={() => setKind(kind === k ? undefined : k)}>{KIND_LABEL[k]} {all.counts[k]}</button>)}
      </div>
      <label className="dc-order">Order
        <select value={order} onChange={e => setOrder(e.target.value as DecisionOrder)}>
          <option value="source">by source (read once, decide all)</option>
          <option value="consequence">by what it changes most</option>
          <option value="oldest">oldest first</option>
        </select>
      </label>
      {(all.query.data?.total ?? 0) > (all.query.data?.items.length ?? 0) && <p className="ch-quiet">Showing the first {all.query.data?.items.length} of {all.query.data?.total}; each one you decide makes room for the next.</p>}
      <div className="dc-list">
        {loading && <p className="dc-loading" aria-busy="true">Gathering what waits for you…</p>}
        {all.query.isError && <p role="alert">{errorMessage(all.query.error, 'Could not load what waits for you')}</p>}
        {groups.map(g => <div key={g.key} className="dc-group">
          {g.label && <p className="dc-group-name">{g.label}<span>{g.items.length} left</span></p>}
          <ul>{g.items.map(i => <li key={i.id}>
            <button type="button" className={`dc-row${item?.id === i.id ? ' on' : ''}`} aria-current={item?.id === i.id ? 'true' : undefined} onClick={() => setSelected(i.id)}>
              <span className={`dc-kind dc-kind-${i.kind}`} aria-hidden="true" title={KIND_LABEL[i.kind]}>{KIND_ICON[i.kind]}</span>
              <span className="dc-row-text"><span>{i.question}</span>
                <small>{i.actor_kind === 'ai' ? 'AI draft' : i.actor} · {KIND_LABEL[i.kind].toLowerCase()} · {age(i.created_at)}{i.level ? ' · ' : ''}{i.level && <LevelChip level={i.level}/>}</small></span>
            </button>
          </li>)}</ul>
        </div>)}
      </div>
    </aside>

    {item ? <>
      <EvidencePane item={item}/>
      <section className="dc-card" aria-label="Your decision">
        <p className="ch-eyebrow">{KIND_LABEL[item.kind]} · {index + 1} of {items.length}{item.actor_kind === 'ai' && <> <AiTag/></>}</p>
        <DecisionCard item={item} position={index + 1} total={items.length} keys="decide" active={active} onDecide={onDecide}/>
        {item.choices.length === 0 && <Link className="dc-elsewhere" href={caseHref(item.open.href, investigationId)}>{item.open.label} ↗</Link>}
      </section>
    </> : <section className="dc-empty">
      {loading ? <div className="ch-skeleton dc-skeleton" aria-busy="true" aria-label="Gathering what waits for you"/> : <>
        <h2>Nothing waits for you{kind ? ` in ${KIND_LABEL[kind]}` : ''}.</h2>
        <p>{all.decided.length ? `${all.decided.length} decided in this session.` : 'New proposals, checks and missing values arrive here as the case grows.'}</p>
        <Link href={caseHref('/bring-in#document-ingestion', investigationId)}>Drop documents</Link>
      </>}
    </section>}

    <footer className="dc-bar">
      <span><b>{items.length ? index + 1 : 0}</b> of {items.length}</span>
      <span className="dc-session" aria-label="This session">✓ {session.yes} · ✕ {session.no} · ○ {session.unsure}</span>
      <span className="dc-last" aria-label="Last 10">LAST 10 {all.decided.slice(0, 10).map(d => <i key={d.item.id} className={`dc-last-${d.choice.key} dc-${d.state}`}
        title={`${d.item.question} — ${d.choice.label}`}>{SHAPE[d.choice.key]}</i>)}</span>
      <span className="dc-keys" aria-hidden="true"><kbd>J</kbd><kbd>K</kbd> move <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> decide <kbd>Z</kbd> undo</span>
      <span className="dc-toast" aria-live="polite">
        {failed ? <>Could not save “{failed.choice.label}”: {failed.error}. Your choice is kept. <button type="button" onClick={() => all.retry(failed.item.id)}>Retry</button> <button type="button" onClick={() => all.undo(failed.item.id)}>Drop it</button></>
          : all.held ? <><b>{SHAPE[all.held.choice.key]} {all.held.choice.label}</b> · {all.held.item.question.slice(0, 60)} <button type="button" onClick={() => all.undo()}>Undo <kbd>Z</kbd></button></>
          : `Each answer waits ${HOLD_MS / 1000} s, so you can undo it.`}
      </span>
    </footer>
  </div>;
}
