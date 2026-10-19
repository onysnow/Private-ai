'use client';
// The standing numbers' lists (Workbench-redesign-2026.pdf, "Standing numbers": "Hover or focus previews
// the list"; "The case home": "Pointing at a standing number previews its list in a popover. Nothing is only
// on hover (UX §C1.4): a click … pins the selection"). Pointing at a number or focusing it shows the items
// behind it; a click (or Enter) pins the list open; Escape, or a click elsewhere, closes it. Each list is read
// from the endpoint its own screen reads, only while it is open, and ends with a link to that screen.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {createPortal} from 'react-dom';

import {StatusChip} from '../../components/status';
import type {ClaimStatus} from '../../components/status';
import {caseHref} from '../../lib/case-href';
import {errorMessage} from '../../lib/api-client';
import {
  getDecisionsOptions, getInvestigationFinancialFlowsOptions, getInvestigationTimelineOptions, listClaimsOptions, listDocumentsOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {CaseStandingOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {KIND_LABEL} from './use-decisions';
import type {DecisionKind} from './use-decisions';

export function money(amount: number, currency: string | null): string {
  if (!currency) return '—';
  // Large sums are shortened ($5.82bn); the exact figure is in the ledger.
  const compact = Math.abs(amount) >= 1_000_000;
  try {
    return new Intl.NumberFormat('en-US', {style: 'currency', currency, currencyDisplay: 'narrowSymbol', notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 2 : 0}).format(amount);
  } catch { return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`; }
}

export type StandingKey = 'sup' | 'dis' | 'uns' | 'dec' | 'mon' | 'yrs' | 'doc';
const SHOWN = 8;
const OPEN_DWELL_MS = 220;
const CLOSE_GRACE_MS = 220;

const CLAIM_STATUS: Record<string, ClaimStatus> = {
  supported: 'supported', confirmed: 'supported', disputed: 'disputed', rejected: 'ruled_out', lead: 'unshown', unverified: 'unshown',
};
const CLAIM_KEY: Partial<Record<StandingKey, ClaimStatus>> = {sup: 'supported', dis: 'disputed', uns: 'unshown'};
const UNREAD = new Set(['queued', 'pending', 'extracting']);
/** A document's reading state as a shape and a word (the status grammar: never colour alone). */
export function docState(status: string): {mark: string; word: string; order: number} {
  if (status === 'failed') return {mark: '✕', word: 'Could not be read', order: 0};
  if (status === 'extracting') return {mark: '◐', word: 'Reading now', order: 1};
  if (UNREAD.has(status)) return {mark: '○', word: 'Not read yet', order: 2};
  return {mark: '✓', word: 'Read', order: 3};
}
const CERTAINTY: Record<string, {status: ClaimStatus; word: string}> = {
  shown: {status: 'supported', word: 'Shown'}, not_yet_shown: {status: 'unshown', word: 'Not yet shown'}, disputed: {status: 'disputed', word: 'Disputed'},
};

/** Which number is open, and whether a click pinned it; one at a time. */
export type OpenNumber = {key: StandingKey; pinned: boolean} | null;

/** Hover, focus, click and Escape for the strip's numbers. */
export function useStandingPopover(): {
  open: OpenNumber; anchors: React.MutableRefObject<Map<StandingKey, HTMLElement>>; popover: React.RefObject<HTMLDivElement | null>;
  triggerProps: (key: StandingKey) => Record<string, unknown>; popoverProps: Record<string, unknown>; close: (refocus?: boolean) => void;
} {
  const [open, setOpen] = useState<OpenNumber>(null);
  const anchors = useRef(new Map<StandingKey, HTMLElement>());
  const popover = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);
  const openRef = useRef(open);
  openRef.current = open;
  // Focus given back to a number on Escape must not open its preview again.
  const quiet = useRef(false);
  const close = useCallback((refocus = false) => {
    clear();
    const was = openRef.current;
    setOpen(null);
    if (refocus && was) { quiet.current = true; anchors.current.get(was.key)?.focus(); quiet.current = false; }
  }, []);
  const preview = (key: StandingKey, now: boolean) => {
    if (openRef.current?.pinned) return;
    clear();
    if (now) setOpen({key, pinned: false});
    else timer.current = window.setTimeout(() => { timer.current = null; setOpen(o => (o?.pinned ? o : {key, pinned: false})); }, OPEN_DWELL_MS);
  };
  const closeSoon = () => {
    if (openRef.current?.pinned) return;
    clear();
    timer.current = window.setTimeout(() => { timer.current = null; setOpen(o => (o?.pinned ? o : null)); }, CLOSE_GRACE_MS);
  };
  const keep = () => { if (!openRef.current?.pinned) clear(); };
  const inside = (node: EventTarget | null): boolean => node instanceof Node && Boolean(popover.current?.contains(node)
    || [...anchors.current.values()].some(a => a.contains(node)));

  // Escape closes from the number or from inside the list; a click anywhere else closes a pinned list.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const fromInside = inside(document.activeElement);
      event.preventDefault(); event.stopPropagation();
      close(fromInside);
    };
    const onDown = (event: PointerEvent) => { if (!inside(event.target)) close(); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);

  // A list pinned from the keyboard takes the focus, so its links are the next Tab stops.
  const focusList = useRef(false);
  useEffect(() => {
    if (open?.pinned && focusList.current) { focusList.current = false; popover.current?.focus(); }
  }, [open]);

  const triggerProps = (key: StandingKey) => ({
    ref: (el: HTMLElement | null) => { if (el) anchors.current.set(key, el); else anchors.current.delete(key); },
    'aria-expanded': open?.key === key,
    'aria-controls': open?.key === key ? 'ch-pop' : undefined,
    onMouseEnter: () => (open?.key === key ? keep() : preview(key, false)),
    onMouseLeave: closeSoon,
    onFocus: () => { if (!quiet.current) preview(key, true); },
    onBlur: (event: React.FocusEvent) => { if (event.relatedTarget && !inside(event.relatedTarget)) close(); },
    onClick: (event: React.MouseEvent) => {
      // A click with a modifier still opens the full list (in a new tab or window).
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      clear();
      if (open?.key === key && open.pinned) { close(); return; }
      focusList.current = event.detail === 0;
      setOpen({key, pinned: true});
    },
  });
  const popoverProps = {
    onMouseEnter: keep,
    onMouseLeave: closeSoon,
    onBlur: (event: React.FocusEvent) => { if (event.relatedTarget && !inside(event.relatedTarget)) close(); },
  };
  return {open, anchors, popover, triggerProps, popoverProps, close};
}

/** The open number's list, placed under its number (above when there is no room), never off screen. */
export function StandingPopover({open, anchor, popover, popoverProps, standing, investigationId, onClose}: {
  open: NonNullable<OpenNumber>; anchor: HTMLElement | undefined; popover: React.RefObject<HTMLDivElement | null>; popoverProps: Record<string, unknown>;
  standing: CaseStandingOut; investigationId: string; onClose: () => void;
}): ReactElement | null {
  const [at, setAt] = useState<{left: number; top: number} | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return undefined;
    const place = () => {
      const box = anchor.getBoundingClientRect();
      const w = popover.current?.offsetWidth ?? 360;
      const h = popover.current?.offsetHeight ?? 0;
      const left = Math.max(8, Math.min(box.left, window.innerWidth - w - 8));
      const below = box.bottom + 6;
      const top = below + h > window.innerHeight - 8 && box.top - 6 - h > 8 ? box.top - 6 - h : below;
      setAt({left, top});
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (popover.current) watch?.observe(popover.current);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); watch?.disconnect(); };
  }, [anchor, popover, open.key]);
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={popover} id="ch-pop" className={`ch-pop${open.pinned ? ' pinned' : ''}`} role="dialog" aria-modal="false"
    aria-labelledby="ch-pop-title" tabIndex={-1} style={at ? {left: at.left, top: at.top} : {visibility: 'hidden'}} {...popoverProps}>
    <StandingList which={open.key} standing={standing} investigationId={investigationId} onPick={onClose}/>
    <p className="ch-pop-hint" aria-hidden="true">{open.pinned ? 'Pinned · Esc closes' : 'Click the number to pin · Esc closes'}</p>
  </div>, document.body);
}

function Frame({title, href, linkLabel, investigationId, onPick, children, more}: {
  title: string; href: string; linkLabel: string; investigationId: string; onPick: () => void; children: ReactNode; more?: string;
}): ReactElement {
  return <>
    <h3 id="ch-pop-title">{title}</h3>
    {children}
    {more && <p className="ch-pop-more">{more}</p>}
    <Link className="ch-pop-open" href={caseHref(href, investigationId)} onClick={onPick}>{linkLabel} <span aria-hidden="true">↗</span></Link>
  </>;
}

function Waiting({query}: {query: {isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown}}): ReactElement | null {
  if (query.isError) return <p className="ch-pop-quiet" role="alert">{errorMessage(query.error, 'Could not load the list')} <button type="button" onClick={() => void query.refetch()}>Retry</button></p>;
  if (query.isPending) return <p className="ch-pop-quiet" aria-busy="true">Loading the list…</p>;
  return null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const moreLine = (shown: number, total: number) => (total > shown ? `${(total - shown).toLocaleString('en-GB')} more in the full list` : undefined);

/** The items behind one standing number. */
export function StandingList({which, standing, investigationId, onPick}: {
  which: StandingKey; standing: CaseStandingOut; investigationId: string; onPick: () => void;
}): ReactElement {
  if (which === 'sup' || which === 'dis' || which === 'uns') return <ClaimList status={CLAIM_KEY[which]!} investigationId={investigationId} onPick={onPick}/>;
  if (which === 'dec') return <DecisionList standing={standing} investigationId={investigationId} onPick={onPick}/>;
  if (which === 'mon') return <MoneyList standing={standing} investigationId={investigationId} onPick={onPick}/>;
  if (which === 'yrs') return <EventList standing={standing} investigationId={investigationId} onPick={onPick}/>;
  return <DocumentList investigationId={investigationId} onPick={onPick}/>;
}

const CLAIM_TITLE: Record<ClaimStatus, [string, string]> = {
  supported: ['claim supported', 'claims supported'], disputed: ['claim disputed', 'claims disputed'],
  unshown: ['claim not yet shown', 'claims not yet shown'], ruled_out: ['claim ruled out', 'claims ruled out'],
};

function ClaimList({status, investigationId, onPick}: {status: ClaimStatus; investigationId: string; onPick: () => void}): ReactElement {
  const query = useQuery({...listClaimsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const openClaim = useWorkbenchStore(state => state.openClaim);
  const rows = (query.data ?? []).filter(c => (CLAIM_STATUS[c.status] ?? 'unshown') === status);
  const [one, many] = CLAIM_TITLE[status];
  return <Frame title={query.data ? plural(rows.length, one, many) : many[0].toUpperCase() + many.slice(1)} href="/check#claim-verification"
    linkLabel="Open the claims in Check" investigationId={investigationId} onPick={onPick} more={moreLine(Math.min(SHOWN, rows.length), rows.length)}>
    <Waiting query={query}/>
    {query.data && (rows.length ? <ul className="ch-pop-list">{rows.slice(0, SHOWN).map(c => <li key={c.id}>
      <button type="button" onClick={() => { openClaim(c.id); onPick(); }}><StatusChip status={status}/><span>{c.text}</span></button></li>)}</ul>
      : <p className="ch-pop-quiet">None yet.</p>)}
  </Frame>;
}

function DecisionList({standing, investigationId, onPick}: {standing: CaseStandingOut; investigationId: string; onPick: () => void}): ReactElement {
  const query = useQuery({...getDecisionsOptions({path: {investigation_id: investigationId}, query: {limit: SHOWN}}), enabled: Boolean(investigationId)});
  const kinds = Object.entries(standing.to_decide_by_kind ?? {}).filter(([, n]) => n > 0) as [DecisionKind, number][];
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? standing.to_decide;
  return <Frame title={`${plural(total, 'thing')} to decide · need a person`} href="/decide" linkLabel="Open Decide" investigationId={investigationId}
    onPick={onPick} more={moreLine(items.length, total)}>
    {kinds.length > 0 && <p className="ch-pop-kinds">{kinds.map(([k, n], i) => <span key={k}>{i > 0 && ' · '}
      <Link href={caseHref(`/decide?kind=${k}`, investigationId)} onClick={onPick}>{n} {KIND_LABEL[k] ?? k}</Link></span>)}</p>}
    <Waiting query={query}/>
    {query.data && (items.length ? <ul className="ch-pop-list">{items.map(item => <li key={`${item.kind}:${item.id}`}>
      <Link href={caseHref(`/decide?kind=${item.kind}`, investigationId)} onClick={onPick}>
        <span className="ch-pop-kind">{KIND_LABEL[item.kind] ?? item.kind}</span><span>{item.question}</span></Link></li>)}</ul>
      : <p className="ch-pop-quiet">Nothing waits for you.</p>)}
  </Frame>;
}

function MoneyList({standing, investigationId, onPick}: {standing: CaseStandingOut; investigationId: string; onPick: () => void}): ReactElement {
  const query = useQuery({...getInvestigationFinancialFlowsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const currency = standing.money.currency;
  const all = query.data?.transactions ?? [];
  // The figure counts each sum once, where it starts (backend case_home.standing): the payments whose payer received nothing.
  const paidTo = new Set(all.map(t => t.to_entity_id));
  const starts = all.filter(t => t.currency === currency && !paidTo.has(t.from_entity_id)).sort((a, b) => b.amount - a.amount);
  const others = all.filter(t => t.currency === currency).length - starts.length;
  return <Frame title={currency ? `${money(standing.money.amount, currency)} traced from ${plural(starts.length || (standing.money.from_sources ?? 0), 'source')}` : 'No money traced yet'}
    href="/see#money-flows" linkLabel="Open Money" investigationId={investigationId} onPick={onPick}
    more={[moreLine(Math.min(SHOWN, starts.length), starts.length), others > 0 ? `${plural(others, 'later payment')} passing the money on, not counted again` : '']
      .filter(Boolean).join(' · ') || undefined}>
    <Waiting query={query}/>
    {query.data && (starts.length ? <ul className="ch-pop-list">{starts.slice(0, SHOWN).map(t => {
      const sure = CERTAINTY[t.certainty] ?? CERTAINTY.not_yet_shown;
      return <li key={t.id} className="ch-pop-row"><StatusChip status={sure.status} label={sure.word}/>
        <span>{t.from} → {t.to}</span><b title={`${t.currency} ${t.amount.toLocaleString('en-GB', {minimumFractionDigits: 2})}`}>{money(t.amount, t.currency)}</b></li>;
    })}</ul> : <p className="ch-pop-quiet">No payment with an amount yet.</p>)}
    {standing.money.other_currencies?.length ? <p className="ch-pop-quiet">Also in {standing.money.other_currencies.join(', ')}, not added in.</p> : null}
  </Frame>;
}

function EventList({standing, investigationId, onPick}: {standing: CaseStandingOut; investigationId: string; onPick: () => void}): ReactElement {
  const query = useQuery({...getInvestigationTimelineOptions({path: {investigation_id: investigationId}, query: {limit: SHOWN}}), enabled: Boolean(investigationId)});
  const events = query.data?.events ?? [];
  const total = query.data?.total ?? standing.timeline.events;
  const span = standing.timeline.from ? (standing.timeline.from === standing.timeline.to ? standing.timeline.from : `${standing.timeline.from}–${standing.timeline.to}`) : '';
  return <Frame title={`${plural(total, 'dated event')}${span ? ` · ${span}` : ''}`} href="/see#timeline" linkLabel="Open the timeline" investigationId={investigationId}
    onPick={onPick} more={moreLine(events.length, total)}>
    <Waiting query={query}/>
    {query.data && (events.length ? <ul className="ch-pop-list">{events.map(e => <li key={e.id} className="ch-pop-row">
      <time className="ch-pop-date">{e.date_start}</time><span>{e.title}</span></li>)}</ul>
      : <p className="ch-pop-quiet">No dated events yet.</p>)}
  </Frame>;
}

function DocumentList({investigationId, onPick}: {investigationId: string; onPick: () => void}): ReactElement {
  const query = useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const openDocument = useWorkbenchStore(state => state.openDocument);
  // Those that need something first: could not be read, being read, waiting; then the newest.
  const docs = (query.data ?? []).filter(d => !d.parent_document_id)
    .sort((a, b) => docState(a.extraction_status).order - docState(b.extraction_status).order || b.created_at.localeCompare(a.created_at));
  const unread = docs.filter(d => UNREAD.has(d.extraction_status)).length;
  const failed = docs.filter(d => d.extraction_status === 'failed').length;
  return <Frame title={query.data ? [plural(docs.length, 'document'), `${unread} unread`, failed ? `${failed} could not be read` : ''].filter(Boolean).join(' · ') : 'Documents'}
    href="/bring-in#document-ingestion" linkLabel="Open the Library" investigationId={investigationId} onPick={onPick} more={moreLine(Math.min(SHOWN, docs.length), docs.length)}>
    <Waiting query={query}/>
    {query.data && (docs.length ? <ul className="ch-pop-list">{docs.slice(0, SHOWN).map(d => {
      const state = docState(d.extraction_status);
      return <li key={d.id}><button type="button" onClick={() => { openDocument(d.id); onPick(); }}>
        <span className={`ch-pop-doc ch-pop-doc-${d.extraction_status === 'failed' ? 'failed' : UNREAD.has(d.extraction_status) ? 'unread' : 'read'}`}>
          <span aria-hidden="true">{state.mark}</span>{state.word}</span><span>{d.filename}</span></button></li>;
    })}</ul> : <p className="ch-pop-quiet">Nothing brought in yet.</p>)}
  </Frame>;
}
