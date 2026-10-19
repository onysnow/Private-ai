'use client';
// Decide (Workbench-redesign-2026.pdf, Check §3.1; mockup CHECK_1): every decision
// only a person can make, on one whole screen. Queue on the left, grouped by where
// it comes from; the evidence in the middle, still; the card on the right. Keys:
// J/K move, 1/2/3 answer, H later, Z undo, O open the source. An answer waits a few seconds before it is sent.
// "By what it unlocks" orders the queue by what answering Yes would change (backend decision_unlocks.py), and H
// puts a decision off until it changes (decision_snoozes.py).
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {LevelChip} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {getDecisionsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {singleKeysOn} from '../../lib/shortcuts';
import {apiTime} from '../../lib/timestamps';
import type {DecisionChoiceOut, DecisionItemOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {caseHref} from '../../lib/case-href';
import {DecisionCard, Excerpt, PartyChips, RowCells, pageOf} from './decision-card';
import {HOLD_MS, KIND_LABEL, acceptsInBulk, undoBlocked, useDecisions, wakesWhen} from './use-decisions';
import type {DecisionKind, DecisionOrder} from './use-decisions';
import './decide.css';

const KIND_ICON: Record<DecisionKind, string> = {to_check: '?', missing: '∅', proposal: '◇', match: '⇄', outside: '◎', ai: 'AI', watchlist: '◉'};
const SHAPE: Record<DecisionChoiceOut['key'], string> = {yes: '✓', no: '✕', unsure: '○'};

function age(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - apiTime(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
}

/** The words for a list that would not load: the browser's "Failed to fetch" means the server did not answer. */
export function loadError(error: unknown): string {
  const message = errorMessage(error, '');
  return !message || /failed to fetch|networkerror|load failed/i.test(message) ? 'The server did not answer.' : message;
}

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

/** What answering Yes would unlock (research Check §3.1, Innovation 1), with the Red Flag meters moving. */
function Unlocks({item}: {item: DecisionItemOut}): ReactElement | null {
  const u = item.unlocks;
  if (!u) return null;
  if (!u.counted) return <p className="dc-unlocks dc-unlocks-uncounted">unlocks: not worked out here (more proposals than one look tries)</p>;
  if (!u.score) return null;
  return <div className="dc-unlocks" role="note" aria-label={u.words}>
    <p><span className="dc-unlocks-mark" aria-hidden="true">⇡</span><b>{u.words}</b></p>
    <ul>{u.lines.map(line => <li key={line}>{line}</li>)}</ul>
  </div>;
}

/** Later (H): put the decision off until it changes, or until a time (and sooner if it changes). */
function Later({onLater}: {onLater: (until: string | null) => void}): ReactElement {
  const at = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(8, 0, 0, 0);
    return d.toISOString();
  };
  return <div className="dc-later" role="group" aria-label="Later">
    <button type="button" aria-keyshortcuts="H" onClick={() => onLater(null)}><kbd>H</kbd> Later: until it changes</button>
    <button type="button" onClick={() => onLater(at(1))}>until tomorrow</button>
    <button type="button" onClick={() => onLater(at(7))}>for a week</button>
  </div>;
}

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

export function DecideScreen({investigationId, investigationName, active = true, unreachable = null}: {
  investigationId: string; investigationName: string; active?: boolean;
  /** The case frame could not reach the server (no case is known yet): shown as this screen's error state. */
  unreachable?: {error: unknown; retry: () => void} | null;
}): ReactElement {
  const [kind, setKind] = useState<DecisionKind | undefined>(undefined);
  const [order, setOrder] = useState<DecisionOrder>('source');
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('kind') as DecisionKind | null;
    if (wanted && wanted in KIND_LABEL) setKind(wanted);
  }, []);
  const all = useDecisions(investigationId, {order});
  const items = useMemo(() => (kind ? all.items.filter(i => i.kind === kind) : all.items), [all.items, kind]);
  // The chips count what still waits: an answer held (or being sent) leaves its kind's count at once, not only after
  // the server's list reloads (the server's counts already leave out what it has saved).
  const counts = useMemo(() => {
    const left: Record<string, number> = {...all.counts};
    const shown = new Set(all.items.map(i => i.id));
    for (const i of all.query.data?.items ?? []) if (!shown.has(i.id) && left[i.kind]) left[i.kind] -= 1;
    return left;
  }, [all.counts, all.items, all.query.data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSnoozed, setShowSnoozed] = useState(false);
  // The decisions put off and still asleep, read when the list is opened.
  const asleep = useQuery({...getDecisionsOptions({path: {investigation_id: investigationId}, query: {snoozed: true, order: 'oldest'}}),
    enabled: showSnoozed && Boolean(investigationId)});
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const index = Math.max(0, items.findIndex(i => i.id === selected));
  const item = items[index];
  const total = Object.values(counts).reduce((n, v) => n + v, 0);

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

  const onLater = useCallback((until: string | null) => {
    if (!item) return;
    const next = items[index + 1] ?? items[index - 1];
    all.snooze(item, until);
    setSelected(next?.id ?? null);
  }, [all, index, item, items]);

  // Keys act only while this screen is on show (the case layout keeps it mounted when hidden).
  const goPending = useRef(0);
  useEffect(() => {
    if (!active) return undefined;
    const handle = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || !singleKeysOn()) return;
      const key = event.key.toLowerCase();
      // G then H is the frame's "go to the case home": that H puts nothing off.
      if (key === 'g') { goPending.current = Date.now(); return; }
      if (key === 'h') { if (Date.now() - goPending.current >= 1000 && item) { event.preventDefault(); onLater(null); } goPending.current = 0; return; }
      if (key === 'j') { event.preventDefault(); move(1); } else if (key === 'k') { event.preventDefault(); move(-1); } else if (key === 'z') { event.preventDefault(); all.undo(); }
      // O opens the source in its own reader (research §3.1 keyboard), at the evidence's page.
      else if (key === 'o' && item?.evidence?.document_id) { event.preventDefault(); openDocument(item.evidence.document_id, pageOf(item.evidence.locator)); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, all, item, move, onLater, openDocument]);

  const groups = useMemo(() => {
    const out: {key: string; group: DecisionItemOut['group']; label: string; items: DecisionItemOut[]}[] = [];
    for (const i of items) {
      const last = out[out.length - 1];
      if (order === 'source' && last && last.group.key === i.group.key) last.items.push(i);
      else out.push({key: `${i.group.key}:${out.length}`, group: i.group, label: order === 'source' ? i.group.label : '', items: [i]});
    }
    return out;
  }, [items, order]);

  // "Accept all n high" (CHECK_1, very large state): same-shaped proposals from one source, confirmed by count first.
  const [bulk, setBulk] = useState<string | null>(null);
  useEffect(() => { setBulk(null); }, [order, kind, investigationId]);
  const acceptGroup = (chosen: DecisionItemOut[]) => {
    if (item && chosen.some(c => c.id === item.id)) setSelected(items.find(i => !chosen.includes(i))?.id ?? null);
    all.acceptAll(chosen);
    setBulk(null);
  };

  const loading = all.query.isPending && Boolean(investigationId);
  const failure = items.length ? null
    : unreachable ?? (all.query.isError ? {error: all.query.error, retry: () => { void all.query.refetch(); }} : null);
  const session = {yes: 0, no: 0, unsure: 0};
  for (const d of all.decided) session[d.choice.key] += 1;
  const failed = all.decided.find(d => d.state === 'failed');
  const putOff = all.snoozed.find(s => s.state === 'saved');
  const batch = all.held?.batch ? all.decided.filter(d => d.batch === all.held?.batch && d.state === 'held') : [];
  const kinds = Object.keys(KIND_LABEL) as DecisionKind[];

  return <div className="dc" aria-label="Decide">
    <aside className="dc-queue" aria-label="To decide">
      <h1>To decide</h1>
      <p className="ch-quiet">{investigationName ? `${investigationName} · ` : ''}only you can decide these</p>
      <div className="dc-chips" role="group" aria-label="Show">
        <button type="button" className={!kind ? 'on' : ''} aria-pressed={!kind} onClick={() => setKind(undefined)}>All {loading || failure ? '…' : total}</button>
        {kinds.filter(k => counts[k]).map(k => <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k}
          onClick={() => setKind(kind === k ? undefined : k)}>{KIND_LABEL[k]} {counts[k]}</button>)}
      </div>
      <label className="dc-order">Order
        <select value={order} onChange={e => setOrder(e.target.value as DecisionOrder)}>
          <option value="source">by source (read once, decide all)</option>
          <option value="consequence">by what it unlocks (most first)</option>
          <option value="oldest">oldest first</option>
        </select>
      </label>
      {(all.snoozedCount > 0 || showSnoozed) && <div className="dc-snoozed">
        <button type="button" className="dc-snoozed-toggle" aria-expanded={showSnoozed} onClick={() => setShowSnoozed(v => !v)}>
          <span aria-hidden="true">◌</span> {all.snoozedCount} snoozed {showSnoozed ? '▴' : '▾'}</button>
        {showSnoozed && <div className="dc-snoozed-list" role="group" aria-label="Put off">
          {asleep.isPending ? <p className="ch-quiet">Reading what you put off…</p>
            : asleep.isError ? <p className="ch-quiet">Could not read them: {loadError(asleep.error)}</p>
            : !asleep.data?.items.length ? <p className="ch-quiet">Nothing is put off.</p>
            : <ul>{asleep.data.items.map(i => <li key={i.id}>
              <span className="dc-row-text"><span>{i.question}</span>
                <small>{KIND_LABEL[i.kind]} · {wakesWhen(i.snooze?.until, i.snooze?.wake_on_activity)}</small></span>
              <button type="button" onClick={() => { all.wake(i.kind, i.id); setSelected(i.id); }}>Restore</button>
            </li>)}</ul>}
        </div>}
      </div>}
      {(all.query.data?.total ?? 0) > (all.query.data?.items.length ?? 0) && <p className="ch-quiet">Showing the first {all.query.data?.items.length} of {all.query.data?.total}; each one you decide makes room for the next.</p>}
      <div className="dc-list">
        {loading && <p className="dc-loading" aria-busy="true">Gathering what waits for you…</p>}
        {all.query.isError && items.length > 0 && <p className="dc-stale" role="alert">Could not refresh: {loadError(all.query.error)} <button type="button" onClick={() => { void all.query.refetch(); }}>Retry</button></p>}
        {groups.map(g => {
          const high = g.label ? g.items.filter(acceptsInBulk) : [];
          return <div key={g.key} className="dc-group">
          {g.label && <div className="dc-group-head">
            <p className="dc-group-name"><span className="dc-group-label">{g.label}</span><span>{g.items.length} left</span></p>
            {(g.group.pages ?? 0) > 0 && <p className="dc-pages" title="Pages of this document with something to decide, and how many have nothing left">
              <span className="dc-pages-bar" aria-hidden="true">{Array.from({length: Math.min(g.group.pages ?? 0, 24)}, (_, n) => <i key={n} className={n < (g.group.pages_read ?? 0) ? 'read' : ''}/>)}</span>
              pages read: {g.group.pages_read ?? 0} of {g.group.pages}</p>}
            {high.length >= 2 && bulk !== g.key && <button type="button" className="dc-bulk" onClick={() => setBulk(g.key)}>✓ Accept all {high.length} high</button>}
          </div>}
          {bulk === g.key && <div className="dc-bulk-confirm" role="group" aria-label={`Accept all ${high.length} high`}>
            <p>Accept all <b>{high.length}</b> proposals rated high in {g.label}? Each waits {HOLD_MS / 1000} s, and Undo takes back all {high.length}.</p>
            <ol>{high.map(i => <li key={i.id}>{i.question}</li>)}</ol>
            <div><button type="button" className="dc-bulk-go" onClick={() => acceptGroup(high)}>Accept {high.length}</button>
              <button type="button" onClick={() => setBulk(null)}>Cancel</button></div>
          </div>}
          <ul>{g.items.map(i => <li key={i.id}>
            <button type="button" className={`dc-row${item?.id === i.id ? ' on' : ''}`} aria-current={item?.id === i.id ? 'true' : undefined} onClick={() => setSelected(i.id)}>
              <span className={`dc-kind dc-kind-${i.kind}`} aria-hidden="true" title={KIND_LABEL[i.kind]}>{KIND_ICON[i.kind]}</span>
              <span className="dc-row-text"><span>{i.question}</span>
                <small>{i.actor_kind === 'ai' ? 'AI draft' : i.actor}{i.kind === 'ai' ? '' : ` · ${KIND_LABEL[i.kind].toLowerCase()}`} · {age(i.created_at)}{i.level ? ' · ' : ''}{i.level && <LevelChip level={i.level}/>}</small>
                {i.unlocks?.score ? <small className="dc-row-unlocks"><span aria-hidden="true">⇡</span> {i.unlocks.words}</small> : null}
                {i.snooze?.state === 'woke' && <small className="dc-row-woke"><span aria-hidden="true">◌</span> back: {i.snooze.why?.replace(/\.$/, '').toLowerCase()}</small>}</span>
            </button>
          </li>)}</ul>
        </div>;
        })}
      </div>
    </aside>

    {item ? <>
      <EvidencePane item={item}/>
      <section className="dc-card" aria-label="Your decision">
        {/* The card's own line names an AI proposer with its AI draft tag; the eyebrow does not repeat it. */}
        <p className="ch-eyebrow">{KIND_LABEL[item.kind]} · {index + 1} of {items.length}</p>
        <Unlocks item={item}/>
        <DecisionCard item={item} position={index + 1} total={items.length} keys="decide" active={active} onDecide={onDecide}/>
        {item.choices.length === 0 && <Link className="dc-elsewhere" href={caseHref(item.open.href, investigationId)}>{item.open.label} ↗</Link>}
        <Later onLater={onLater}/>
      </section>
    </> : <section className="dc-empty">
      {/* A list that did not load says so alone: "Nothing waits for you" would claim the queue is empty. */}
      {failure ? <div className="dc-failed" role="alert">
          <h2><span aria-hidden="true">✕ </span>Could not load what waits for you.</h2>
          <p>{loadError(failure.error)} Nothing was lost; your decisions are kept on the server.</p>
          <button type="button" onClick={failure.retry} disabled={all.query.isFetching}>{all.query.isFetching ? 'Trying again…' : 'Retry'}</button>
        </div>
        : loading ? <div className="ch-skeleton dc-skeleton" aria-busy="true" aria-label="Gathering what waits for you"/> : <>
        <h2>Nothing waits for you{kind ? ` in ${KIND_LABEL[kind]}` : ''}.</h2>
        <p>{all.decided.length ? `${all.decided.length} decided in this session.` : 'New proposals, checks and missing values arrive here as the case grows.'}</p>
        <Link href={caseHref('/bring-in#document-ingestion', investigationId)}>Drop documents</Link>
      </>}
    </section>}

    <footer className="dc-bar">
      <span><b>{items.length ? index + 1 : 0}</b> of {items.length}</span>
      <span className="dc-session" aria-label="This session">✓ {session.yes} · ✕ {session.no} · ○ {session.unsure}</span>
      <span className="dc-last" role="group" aria-label="Last 10">LAST 10 {all.decided.slice(0, 10).map(d => {
        // Each of the last ten answers can be taken back where that is possible; the others say why not.
        const blocked = undoBlocked(d);
        const words = `${d.choice.label}: ${d.item.question}`;
        return <button key={d.item.id} type="button" className={`dc-last-${d.choice.key} dc-${d.state}`} aria-disabled={blocked ? 'true' : undefined}
          aria-label={blocked ? `${words} — ${blocked}` : `Undo ${words}`} title={blocked ? `${words}\n${blocked}` : `${words}\nClick to undo`}
          onClick={() => { if (!blocked && all.undo(d.item.id)) setSelected(d.item.id); }}>{SHAPE[d.choice.key]}</button>;
      })}</span>
      <span className="dc-keys" aria-hidden="true"><kbd>J</kbd><kbd>K</kbd> move <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> decide <kbd>H</kbd> later <kbd>Z</kbd> undo <kbd>O</kbd> open the source</span>
      <span className="dc-toast" aria-live="polite">
        {failed ? <>Could not save “{failed.choice.label}”: {failed.error}. Your choice is kept. <button type="button" onClick={() => all.retry(failed.item.id)}>Retry</button> <button type="button" onClick={() => all.undo(failed.item.id)}>Drop it</button></>
          : all.undoError ? all.undoError
          : all.last === 'snooze' && putOff ? <><b>◌ Put off</b> · {putOff.item.question.slice(0, 60)} · {wakesWhen(putOff.until)} <button type="button" onClick={() => all.undo()}>Undo <kbd>Z</kbd></button></>
          : batch.length ? <><b>✓ Accepted {batch.length}</b> · {batch[0].item.group.label} <button type="button" onClick={() => all.undoBatch(batch[0].batch!)}>Undo all {batch.length} <kbd>Z</kbd></button></>
          : all.held ? <><b>{SHAPE[all.held.choice.key]} {all.held.choice.label}</b> · {all.held.item.question.slice(0, 60)} <button type="button" onClick={() => all.undo()}>Undo <kbd>Z</kbd></button></>
          : `Each answer waits ${HOLD_MS / 1000} s, so you can undo it.`}
      </span>
    </footer>
  </div>;
}
