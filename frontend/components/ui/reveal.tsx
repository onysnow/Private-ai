'use client';
// Reveal: what a screen keeps out of sight until asked (Ony, 29 Oct: titles, important data, alerts, numbers and icons
// show; sub-text and the name of a thing's type are revealed on hover or click). One card is open at a time across the
// page. Hover opens it after a short dwell and it stays while the pointer moves into it; focus opens it at once; a click
// on a mark that is not itself a control pins it open until a second click, Esc or a click elsewhere. Screen readers get
// the same words with the mark, through aria-describedby, so nothing is hidden from them.
import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {createPortal} from 'react-dom';

export const REVEAL_DWELL_MS = 300;
export const REVEAL_GRACE_MS = 200;
const CARD_W = 320;

type Open = {owner: string; anchor: HTMLElement; pinned: boolean} | null;
let open: Open = null;
let openTimer: number | null = null;
let closeTimer: number | null = null;
const listeners = new Set<() => void>();
const set = (next: Open): void => { open = next; listeners.forEach(l => l()); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const clearTimers = (): void => {
  if (openTimer !== null) { window.clearTimeout(openTimer); openTimer = null; }
  if (closeTimer !== null) { window.clearTimeout(closeTimer); closeTimer = null; }
};
const closeSoon = (): void => {
  if (openTimer !== null) { window.clearTimeout(openTimer); openTimer = null; }
  if (open?.pinned) return;
  if (closeTimer === null) closeTimer = window.setTimeout(() => { closeTimer = null; set(null); }, REVEAL_GRACE_MS);
};
const keepOpen = (): void => { if (closeTimer !== null) { window.clearTimeout(closeTimer); closeTimer = null; } };

type Props = {
  /** What is revealed: the sub-text, or the name of the thing's type and what it means. */
  detail: ReactNode;
  children: ReactNode;
  /** True (default) when the mark is not a control of its own: it takes focus, and a click pins the card open. False
   *  when it wraps a button or link, whose click keeps doing what it does; hover and focus still reveal. */
  tabbable?: boolean;
  className?: string;
  /** Spoken with the mark when it has no words of its own (an icon or a shape). */
  label?: string;
};

export function Reveal({detail, children, tabbable = true, className, label}: Props): ReactElement {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const card = useSyncExternalStore(subscribe, () => open, () => null);
  const mine = card?.owner === id;
  const show = useCallback((now: boolean, pinned = false) => {
    const anchor = ref.current;
    if (!anchor) return;
    clearTimers();
    if (now) set({owner: id, anchor, pinned});
    else openTimer = window.setTimeout(() => { openTimer = null; set({owner: id, anchor, pinned: false}); }, REVEAL_DWELL_MS);
  }, [id]);
  useEffect(() => () => { if (open?.owner === id) { clearTimers(); set(null); } }, [id]);
  return <>
    <span ref={ref} className={`rv${tabbable ? ' rv-mark' : ''}${mine ? ' rv-open' : ''}${className ? ` ${className}` : ''}`}
      tabIndex={tabbable ? 0 : undefined} role={tabbable && label ? 'img' : undefined} aria-label={tabbable ? label : undefined}
      aria-describedby={`${id}-detail`} aria-expanded={tabbable ? mine : undefined}
      onMouseEnter={() => (mine ? keepOpen() : show(false))} onMouseLeave={closeSoon}
      onFocus={() => { if (!mine) show(true); }}
      onBlur={e => { if (!(e.relatedTarget instanceof Node && document.getElementById('rv-card')?.contains(e.relatedTarget))) { if (!open?.pinned) closeSoon(); } }}
      onClick={tabbable ? () => (mine && card?.pinned ? set(null) : show(true, true)) : undefined}
      onKeyDown={tabbable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (mine && card?.pinned) set(null); else show(true, true); } } : undefined}>
      {children}
    </span>
    <span id={`${id}-detail`} hidden>{detail}</span>
    {mine && typeof document !== 'undefined' && createPortal(<Card anchor={card!.anchor} pinned={card!.pinned}>{detail}</Card>, document.body)}
  </>;
}

function Card({anchor, pinned, children}: {anchor: HTMLElement; pinned: boolean; children: ReactNode}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{left: number; top: number; above: boolean} | null>(null);
  useLayoutEffect(() => {
    const box = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 0;
    const above = box.bottom + 6 + h > window.innerHeight && box.top - 6 - h > 0;
    setAt({left: Math.max(8, Math.min(box.left, window.innerWidth - CARD_W - 8)), top: above ? box.top - 6 - h : box.bottom + 6, above});
  }, [anchor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inside = ref.current?.contains(document.activeElement);
      clearTimers();
      set(null);
      if (inside || pinned) anchor.focus({preventScroll: true});
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || ref.current?.contains(e.target) || anchor.contains(e.target)) return;
      clearTimers();
      set(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [anchor, pinned]);
  return <div ref={ref} id="rv-card" role="tooltip" className={`rv-card${at?.above ? ' above' : ''}${pinned ? ' pinned' : ''}`}
    style={at ? {left: at.left, top: at.top} : {left: -9999, top: 0}} onMouseEnter={keepOpen} onMouseLeave={closeSoon}>
    {children}
  </div>;
}
