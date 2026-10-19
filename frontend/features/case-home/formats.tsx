'use client';
// The Case home's formats (research §03 D1 "Format (layout recipe)" and §04.11 "Format"): "A format re-arranges the
// same components; it does not change what exists." Board is the Case home's own grid (case-home.tsx); here are the
// other three. Each takes the same parts (Next up with what changed, Bring in, Check, See, Act), drawn by the
// same components, and lays them out its own way. The top band (case title, ⌘K, the standing numbers) and the
// bottom (year rail, Pointing at) stay where they are in every format (research §03 D2: "Fixed positions of the
// case title and ⌘K search across every format").
// - Editorial: "the case home as a list-as navigation of huge words separated by rules, hovering a word previews
//   that section behind it".
// - Desk: "the case as a dense corkboard of evidence cut-outs with date labels at uneven heights; selected items
//   open as one calm card".
// - Story: "chapter-by-chapter, each chapter a tint of the ground, with a '% through' readout".
// Keys stay the Board's: 1–4 bring a module forward and focus it, J / K step in it, Enter opens it whole-screen.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactElement, ReactNode} from 'react';

import {caseHref} from '../../lib/case-href';
import {
  getDecisionsOptions, getRedFlagsOptions, getStandingOptions, listClaimsOptions, listDocumentsOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {currentAppearance, onAppearanceChange, type Format} from '../../lib/theme';
import {FrostStill} from '../effects/frost-panel';
import {WheelSteps} from './wheel-step';
import '../../styles/formats.css';
import {apiTime} from '../../lib/timestamps';

export type PartKey = 'next' | 'bring' | 'check' | 'see' | 'act';

/** One part of the Case home, as every format lays it out. */
export type Part = {
  key: PartKey;
  /** Its data-module name: '01'–'04', or 'next'. */
  module: string;
  /** Its name in big words (Editorial), on its cut-out (Desk) and as a chapter (Story). */
  word: string;
  /** Where Enter or a click on its word takes it: its feature, whole-screen. */
  href: string;
  /** The part itself; `shown` says whether it is on screen to work with (keys such as S / D / U listen only then). */
  render: (shown: boolean) => ReactNode;
};

/** Brings a module forward (by its data-module name) and focuses it: set by the format on screen. */
export type Reveal = MutableRefObject<((module: string) => void) | null>;

/** The format on screen, kept up to date when it changes anywhere. The first render is Board, as on the server. */
export function useFormat(): Format {
  const [format, setFormat] = useState<Format>('board');
  useEffect(() => {
    const read = () => setFormat(currentAppearance().format);
    read();
    return onAppearanceChange(read);
  }, []);
  return format;
}

/** Calm motion or the computer's reduce-motion setting: scrolls jump instead of gliding. */
function calm(): boolean {
  if (currentAppearance().motion === 'calm') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Focuses the module a format has just brought forward, once it is on screen. */
function useFocusModule(): [MutableRefObject<HTMLDivElement | null>, (module: string) => void] {
  const root = useRef<HTMLDivElement | null>(null);
  const [want, setWant] = useState<{module: string; n: number} | null>(null);
  useEffect(() => {
    if (!want || !root.current) return;
    const panel = Array.from(root.current.querySelectorAll<HTMLElement>(`[data-module="${want.module}"]`)).find(el => !el.closest('[inert]'));
    panel?.focus();
  }, [want]);
  return [root, useCallback((module: string) => setWant(w => ({module, n: (w?.n ?? 0) + 1})), [])];
}

const count = (n: number | undefined, one: string, many: string): string => (n === undefined ? '' : `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`);

/** The small count beside each big word, from the case's standing numbers. */
function useWordCounts(investigationId: string): Record<PartKey, string> {
  const s = useQuery({...getStandingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  return {
    next: count(s?.to_decide, 'to decide', 'to decide'),
    bring: s ? `${count(s.documents.total, 'document', 'documents')}${s.documents.unread ? ` · ${s.documents.unread} unread` : ''}` : '',
    check: count(s?.claims.total, 'claim', 'claims'),
    see: count(s?.network.parties, 'party linked', 'parties linked'),
    act: count(s?.flags.open, 'Red Flag open', 'Red Flags open'),
  };
}

/** Editorial: the parts as huge words between rules; pointing at a word (or focusing it) previews its part behind
 *  the list; a click or Enter opens its feature whole-screen. ↑ ↓ move between the words. */
export function EditorialHome({parts, investigationId, reveal}: {parts: Part[]; investigationId: string; reveal: Reveal}): ReactElement {
  const [shown, setShown] = useState<PartKey>(parts[0].key);
  const counts = useWordCounts(investigationId);
  const [root, focusModule] = useFocusModule();
  useEffect(() => {
    reveal.current = module => {
      const part = parts.find(p => p.module === module);
      if (!part) return;
      setShown(part.key);
      focusModule(module);
    };
    return () => { reveal.current = null; };
  }, [reveal, parts, focusModule]);
  const part = parts.find(p => p.key === shown) ?? parts[0];
  const onKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const words = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('.fm-word'));
    const at = words.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    event.preventDefault();
    words[(at + step + words.length) % words.length].focus();
  };
  return <div className="fm-editorial" ref={root}>
    <nav className="fm-words" aria-label="Case home: point at a word to preview it, Enter opens it" onKeyDown={onKey}>
      <ul>{parts.map(p => <li key={p.key}>
        <Link href={caseHref(p.href, investigationId)} className={`fm-word${p.key === shown ? ' on' : ''}`} aria-current={p.key === shown ? 'true' : undefined}
          onMouseEnter={() => setShown(p.key)} onFocus={() => setShown(p.key)}>
          <span className="fm-word-n" aria-hidden="true">{p.module === 'next' ? '→' : p.module}</span>
          <span className="fm-word-name">{p.word}</span>
          {counts[p.key] && <small className="fm-word-count">{counts[p.key]}</small>}
        </Link>
      </li>)}</ul>
    </nav>
    <div className="fm-stage" key={part.key} aria-label={`${part.word}, previewed`} role="region">{part.render(true)}</div>
  </div>;
}

const day = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = apiTime(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
};
const newest = (dates: (string | null | undefined)[]): string | null => dates.filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
const oldest = (dates: (string | null | undefined)[]): string | null => dates.filter((d): d is string => Boolean(d)).sort()[0] ?? null;

/** The date label on each cut-out: the date of what the part holds (data the parts already read). */
function useDeskDates(investigationId: string): Record<PartKey, string> {
  const on = Boolean(investigationId);
  const path = {investigation_id: investigationId};
  const docs = useQuery({...listDocumentsOptions({path}), enabled: on}).data;
  const claims = useQuery({...listClaimsOptions({path}), enabled: on}).data;
  const flags = useQuery({...getRedFlagsOptions({path}), enabled: on}).data;
  const decisions = useQuery({...getDecisionsOptions({path, query: {order: 'consequence'}}), enabled: on}).data;
  const standing = useQuery({...getStandingOptions({path}), enabled: on}).data;
  return useMemo(() => {
    const lastDoc = day(newest((docs ?? []).map(d => d.created_at)));
    const lastClaim = day(newest((claims ?? []).map(c => c.created_at)));
    const lastFlag = day(newest((flags?.flags ?? []).filter(f => f.status === 'open' && !f.gone_at).map(f => f.first_seen_at)));
    const firstWaiting = day(oldest((decisions?.items ?? []).map(i => i.created_at)));
    const t = standing?.timeline;
    return {
      next: firstWaiting ? `waiting since ${firstWaiting}` : '',
      bring: lastDoc ? `brought in ${lastDoc}` : '',
      check: lastClaim ? `claim added ${lastClaim}` : '',
      see: t?.from ? `records ${t.from === t.to ? t.from : `${t.from}–${t.to}`}` : '',
      act: lastFlag ? `flag seen ${lastFlag}` : '',
    };
  }, [docs, claims, flags, decisions, standing]);
}

/** Desk: the parts pinned as cut-outs at uneven heights, each with its date label. Choosing one (click, Enter, or
 *  1–4) opens it as one calm card over the desk; Esc or "Back to the desk" puts it back. */
export function DeskHome({parts, investigationId, reveal}: {parts: Part[]; investigationId: string; reveal: Reveal}): ReactElement {
  const [open, setOpen] = useState<PartKey | null>(null);
  const dates = useDeskDates(investigationId);
  const [root, focusModule] = useFocusModule();
  const back = useRef<PartKey | null>(null);
  const openPart = useCallback((key: PartKey) => {
    const part = parts.find(p => p.key === key);
    if (!part) return;
    setOpen(key);
    focusModule(part.module);
  }, [parts, focusModule]);
  useEffect(() => {
    reveal.current = module => { const part = parts.find(p => p.module === module); if (part) openPart(part.key); };
    return () => { reveal.current = null; };
  }, [reveal, parts, openPart]);
  const close = useCallback(() => {
    back.current = open;
    setOpen(null);
  }, [open]);
  // Closing gives focus back to the cut-out it opened from.
  useEffect(() => {
    if (open || !back.current || !root.current) return;
    root.current.querySelector<HTMLButtonElement>(`[data-part="${back.current}"] .fm-cut-open`)?.focus();
    back.current = null;
  }, [open, root]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const t = event.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  const card = parts.find(p => p.key === open);
  return <div className={`fm-desk${open ? ' has-open' : ''}`} ref={root}>
    <div className="fm-cuts" inert={open ? true : undefined}>
      {parts.map(p => <div key={p.key} className={`fm-cut${open === p.key ? ' lifted' : ''}`} data-part={p.key}>
        {dates[p.key] && <span className="fm-date">{dates[p.key]}</span>}
        <div className="fm-cut-paper">
          {open === p.key ? <p className="fm-cut-away">Open on the desk</p>
            : <div className="fm-cut-body" inert><FrostStill.Provider value={true}>{p.render(false)}</FrostStill.Provider></div>}
          <button type="button" className="fm-cut-open" onClick={() => openPart(p.key)}
            aria-label={`Open ${p.word} as a card${dates[p.key] ? `, ${dates[p.key]}` : ''}`}/>
        </div>
      </div>)}
    </div>
    {card && <>
      <div className="fm-scrim" aria-hidden="true" onClick={close}/>
      <div className="fm-card" role="region" aria-label={`${card.word}, open on the desk`}>
        <header className="fm-card-head">
          {dates[card.key] && <span className="fm-date">{dates[card.key]}</span>}
          <button type="button" className="fm-card-back" onClick={close}>Back to the desk <kbd>Esc</kbd></button>
        </header>
        <FrostStill.Provider value={true}><div className="fm-card-body">{card.render(true)}</div></FrostStill.Provider>
      </div>
    </>}
  </div>;
}

/** Story: the parts one after another as chapters, each on its own tint of the ground, with how far through you are.
 *  The wheel, the page keys and the scroll bar move between chapters; 1–4 jump to one. */
export function StoryHome({parts, reveal}: {parts: Part[]; reveal: Reveal}): ReactElement {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [through, setThrough] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [root, focusModule] = useFocusModule();
  const read = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const room = el.scrollHeight - el.clientHeight;
    setThrough(room > 0 ? Math.round((100 * el.scrollTop) / room) : 0);
    setChapter(Math.min(parts.length - 1, Math.max(0, Math.round(el.scrollTop / Math.max(1, el.clientHeight)))));
  }, [parts.length]);
  useEffect(read, [read]);
  useEffect(() => {
    reveal.current = module => {
      const at = parts.findIndex(p => p.module === module);
      const section = scroller.current?.children[at] as HTMLElement | undefined;
      if (!section) return;
      section.scrollIntoView({behavior: calm() ? 'auto' : 'smooth', block: 'start'});
      focusModule(module);
    };
    return () => { reveal.current = null; };
  }, [reveal, parts, focusModule]);
  const part = parts[chapter];
  return <div className="fm-story" ref={root}>
    <WheelSteps.Provider value={false}>
      <div className="fm-chapters" ref={scroller} onScroll={read} tabIndex={0} aria-label="Case home, chapter by chapter">
        {parts.map((p, i) => <section key={p.key} className="fm-chapter" data-chapter={i} aria-label={`Chapter ${i + 1} of ${parts.length}: ${p.word}`}>
          <p className="fm-chapter-n"><span>Chapter {i + 1} of {parts.length}</span><b>{p.word}</b></p>
          <div className="fm-chapter-body">{p.render(i === chapter)}</div>
        </section>)}
      </div>
    </WheelSteps.Provider>
    <p className="fm-through">
      <span className="fm-through-bar" role="progressbar" aria-label="How far through the case home" aria-valuemin={0} aria-valuemax={100} aria-valuenow={through}>
        <i style={{width: `${through}%`}}/></span>
      <b>{through}% through</b><span>· {chapter + 1} of {parts.length} · {part?.word}</span>
    </p>
  </div>;
}
