'use client';
// Hover cards for glossary terms (docs/discovery/indicators.md, "The glossary
// page": "a term written anywhere in the app shows a hover card with its
// definition and a link to the full entry"). <GlossaryText text=…/> finds the
// catalogue's terms in a piece of text and marks the first time each appears;
// pointing at one, or tabbing to it, shows its definition, and the term itself
// opens its entry on the glossary page.
import {useQuery} from '@tanstack/react-query';
import {useId, useMemo, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {createPortal} from 'react-dom';

import {listTermHintsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {GlossaryHintOut} from '../../lib/generated/types.gen';

type Name = {hint: GlossaryHintOut; text: string; exact: boolean};
export type TermIndex = {pattern: RegExp; byLower: Map<string, Name[]>};

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

/** A term with its hover card. The card sits above everything (a portal), so no panel clips it. */
export function TermHint({hint, children}: {hint: GlossaryHintOut; children: ReactNode}): ReactElement {
  const id = useId();
  const ref = useRef<HTMLAnchorElement>(null);
  const [at, setAt] = useState<{left: number; top: number} | null>(null);
  const show = () => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setAt({left: Math.max(8, Math.min(box.left, window.innerWidth - 336)), top: box.bottom + 6});
  };
  return <>
    <a ref={ref} className="gt-term" href={glossaryHref(hint.term)} aria-describedby={id}
      onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)}>{children}</a>
    {/* Always in the page so screen readers read the definition; shown only while pointed at. */}
    {typeof document !== 'undefined' && createPortal(<span role="tooltip" id={id} className="gt-card" hidden={!at} style={at ?? undefined}>
      <b>{hint.term}</b> {hint.definition} <small>Open it for the full entry.</small>
    </span>, document.body)}
  </>;
}

/** Text with the catalogue's terms marked. Plain text until the terms have loaded. */
export function GlossaryText({text, skip}: {text: string; skip?: string}): ReactElement {
  const index = useTermIndex();
  const parts = useMemo(() => (index && text ? findTerms(index, text, skip) : [text]), [index, text, skip]);
  return <>{parts.map((p, i) => typeof p === 'string' ? p : <TermHint key={i} hint={p.hint}>{p.text}</TermHint>)}</>;
}
