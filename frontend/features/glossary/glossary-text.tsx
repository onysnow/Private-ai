'use client';
// Hover cards for glossary terms (docs/discovery/indicators.md, "The glossary page"; research Knowledge §2).
// <GlossaryText text=…/> finds the catalogue's terms in a piece of text and marks the first time each appears.
// The card follows WCAG 1.4.13: it opens after a short dwell of the pointer (a pointer passing by does not open
// it) or at once on keyboard focus; the pointer can move into it and it stays open while the pointer is on the
// term or the card; Esc closes it. There is one card on the page at a time, re-filled per term; it flips above the
// term when there is no room below. The term itself opens its entry in Learn › Glossary (↵).
import {useQuery} from '@tanstack/react-query';
import {useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {createPortal} from 'react-dom';

import {listTermHintsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {GlossaryHintOut} from '../../lib/generated/types.gen';

type Name = {hint: GlossaryHintOut; text: string; exact: boolean};
export type TermIndex = {pattern: RegExp; byLower: Map<string, Name[]>};

export const OPEN_DWELL_MS = 300;
export const CLOSE_GRACE_MS = 200;
const CARD_W = 360;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One pattern for every name, longest first, matched only as whole words, also with a plural s. */
export function buildTermIndex(hints: GlossaryHintOut[]): TermIndex | null {
  const byLower = new Map<string, Name[]>();
  for (const hint of hints) for (const n of hint.names) {
    const key = n.text.toLowerCase();
    byLower.set(key, [...(byLower.get(key) ?? []), {hint, text: n.text, exact: n.exact}]);
  }
  if (!byLower.size) return null;
  const alternatives = Array.from(byLower.keys()).sort((a, b) => b.length - a.length).map(escape).join('|');
  return {pattern: new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives})s?(?![\\p{L}\\p{N}])`, 'giu'), byLower};
}

/** The text cut into plain runs and terms; each term marked once, never `skip`. */
export function findTerms(index: TermIndex, text: string, skip?: string): (string | {hint: GlossaryHintOut; text: string})[] {
  const out: (string | {hint: GlossaryHintOut; text: string})[] = [];
  const seen = new Set<string>(skip ? [skip] : []);
  let at = 0;
  for (const match of text.matchAll(index.pattern)) {
    const [found, base] = match;
    const name = (index.byLower.get(base.toLowerCase()) ?? []).find(n => !n.exact || n.text === base);
    if (!name || seen.has(name.hint.term)) continue;
    seen.add(name.hint.term);
    if (match.index > at) out.push(text.slice(at, match.index));
    out.push({hint: name.hint, text: found});
    at = match.index + found.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

export function useTermIndex(): TermIndex | null {
  const query = useQuery({...listTermHintsOptions(), staleTime: Infinity, gcTime: Infinity});
  return useMemo(() => (query.data ? buildTermIndex(query.data) : null), [query.data]);
}

export const glossaryHref = (term: string): string => `/glossary?q=${encodeURIComponent(term)}`;

// The one open card, shared by every marked term on the page.
type OpenCard = {hint: GlossaryHintOut; anchor: HTMLElement; owner: string} | null;
let openCard: OpenCard = null;
let openTimer: number | null = null;
let closeTimer: number | null = null;
const listeners = new Set<() => void>();
function setOpenCard(next: OpenCard): void { openCard = next; listeners.forEach(l => l()); }
function subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
function clearTimers(): void {
  if (openTimer !== null) { window.clearTimeout(openTimer); openTimer = null; }
  if (closeTimer !== null) { window.clearTimeout(closeTimer); closeTimer = null; }
}
function closeSoon(): void {
  if (openTimer !== null) { window.clearTimeout(openTimer); openTimer = null; }
  if (closeTimer === null) closeTimer = window.setTimeout(() => { closeTimer = null; setOpenCard(null); }, CLOSE_GRACE_MS);
}
function keepOpen(): void { if (closeTimer !== null) { window.clearTimeout(closeTimer); closeTimer = null; } }

/** A term with its hover card. */
export function TermHint({hint, children}: {hint: GlossaryHintOut; children: ReactNode}): ReactElement {
  const id = useId();
  const ref = useRef<HTMLAnchorElement>(null);
  const card = useSyncExternalStore(subscribe, () => openCard, () => null);
  const open = useCallback((now: boolean) => {
    const anchor = ref.current;
    if (!anchor) return;
    clearTimers();
    if (now) setOpenCard({hint, anchor, owner: id});
    else openTimer = window.setTimeout(() => { openTimer = null; setOpenCard({hint, anchor, owner: id}); }, OPEN_DWELL_MS);
  }, [hint, id]);
  useEffect(() => () => { if (openCard?.owner === id) { clearTimers(); setOpenCard(null); } }, [id]);
  const mine = card?.owner === id;
  return <>
    <a ref={ref} className="gt-term" href={glossaryHref(hint.term)} aria-describedby={`${id}-def`}
      onMouseEnter={() => (mine ? keepOpen() : open(false))} onMouseLeave={closeSoon} onFocus={() => open(true)}
      onBlur={e => { if (!(e.relatedTarget instanceof Node && document.getElementById('gt-card')?.contains(e.relatedTarget))) closeSoon(); }}>{children}</a>
    {/* What a screen reader reads with the term; the visible card is the one shared element below. */}
    <span id={`${id}-def`} hidden>{hint.definition}</span>
    {mine && typeof document !== 'undefined' && createPortal(<TermCard card={card!}/>, document.body)}
  </>;
}

function TermCard({card}: {card: NonNullable<OpenCard>}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{left: number; top: number; above: boolean} | null>(null);
  useLayoutEffect(() => {
    const box = card.anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 0;
    const above = box.bottom + 6 + h > window.innerHeight && box.top - 6 - h > 0;
    setAt({left: Math.max(8, Math.min(box.left, window.innerWidth - CARD_W - 8)), top: above ? box.top - 6 - h : box.bottom + 6, above});
  }, [card]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inside = ref.current?.contains(document.activeElement);
      clearTimers();
      setOpenCard(null);
      if (inside) card.anchor.focus({preventScroll: true});
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [card]);
  const {hint} = card;
  return <div ref={ref} id="gt-card" role="tooltip" className={`gt-card${at?.above ? ' above' : ''}`}
    style={at ? {left: at.left, top: at.top} : {left: -9999, top: 0}} onMouseEnter={keepOpen} onMouseLeave={closeSoon}>
    <b>{hint.term}</b>{hint.areas.length > 0 && <span className="gt-areas"> · {hint.areas.join(' · ')}</span>}
    <span className="gt-def">{hint.definition}</span>
    {hint.definitions > 1 && <span className="gt-more">Defined in {hint.definitions} areas</span>}
    <span className="gt-foot">{hint.related.length > 0 && <span>Related: {hint.related.slice(0, 3).join(' · ')}</span>}
      <a href={glossaryHref(hint.term)}>↵ open</a> · Esc</span>
  </div>;
}

/** Text with the catalogue's terms marked. Plain text until the terms have loaded. */
export function GlossaryText({text, skip}: {text: string; skip?: string}): ReactElement {
  const index = useTermIndex();
  const parts = useMemo(() => (index && text ? findTerms(index, text, skip) : [text]), [index, text, skip]);
  return <>{parts.map((p, i) => typeof p === 'string' ? p : <TermHint key={i} hint={p.hint}>{p.text}</TermHint>)}</>;
}
