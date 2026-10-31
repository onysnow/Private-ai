'use client';
// The one notice that interrupts (research §8; Settings › Notifications, "Interrupt"): a
// row routed there shows once, in the alarm colour, rising once and never repeating; it stays
// in Needs you. It docks in the bottom-right corner, clear of every screen's header and tabs,
// and after a few seconds (not while pointed at or focused) folds to its mark there: a click
// on the mark opens it again. With "Quiet while reading" it waits while a calm zone
// (the reader, Chain of Custody, Decide: anything marked data-calm-zone) is on screen.
// With "Desktop notification" on and the app in the background, the computer is told too,
// with the kind only: no names, no text.
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {caseHref} from '../../lib/case-href';
import type {InboxRowOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useInbox, useSnoozed} from './inbox';

const SHOWN_KEY = 'pai:interrupted';
/** How long the notice stays open before it folds to its mark. */
export const FOLD_MS = 8000;

function readShown(): string[] {
  try { return JSON.parse(window.localStorage.getItem(SHOWN_KEY) ?? '[]') as string[]; } catch { return []; }
}

function markShown(keys: string[]): void {
  try { window.localStorage.setItem(SHOWN_KEY, JSON.stringify([...new Set([...readShown(), ...keys])].slice(-500))); } catch { /* private window */ }
}

// Only a calm zone on screen holds the notice: a screen kept mounted behind a hidden wrapper (Decide after you leave it) does not.
const inCalmZone = (): boolean => typeof document !== 'undefined'
  && [...document.querySelectorAll('[data-calm-zone]')].some(el => !el.closest('[hidden], [aria-hidden="true"], [inert]'));

function tellTheComputer(rows: InboxRowOut[]): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    new Notification(rows.length > 1 ? `${rows.length} Textbook Red Flags` : 'A Textbook Red Flag', {body: 'Open the Workbench to see it.', tag: 'pai-interrupt'});
  } catch { /* some browsers allow notifications only from a service worker */ }
}

export function InterruptNotice(): ReactElement | null {
  const inv = useWorkbenchStore(state => state.investigationId);
  const {data} = useInbox();
  const [snoozed] = useSnoozed();
  // The rows on show belong to the case they were raised in; switching case drops them.
  const [shownFor, setShownFor] = useState<{inv: string; rows: InboxRowOut[]}>({inv: '', rows: []});
  const showing = shownFor.inv === inv ? shownFor.rows : [];
  const setShowing = (rows: InboxRowOut[]) => setShownFor({inv, rows});
  const [calm, setCalm] = useState(false);
  const waiting = (data?.interrupt ?? []).filter(r => !snoozed[r.key]);
  const pendingKeys = waiting.map(r => r.key).join(' ');

  // Watch for a calm zone coming and going only while something is waiting to be said.
  useEffect(() => {
    if (!pendingKeys || !data?.quiet_while_reading) { setCalm(false); return undefined; }
    setCalm(inCalmZone());
    const timer = window.setInterval(() => setCalm(inCalmZone()), 2000);
    return () => window.clearInterval(timer);
  }, [pendingKeys, data?.quiet_while_reading]);

  useEffect(() => {
    // Checked here as well as by the timer: on the first render the timer has not looked yet.
    if (!pendingKeys || calm || (data?.quiet_while_reading && inCalmZone())) return;
    const shown = new Set(readShown());
    const fresh = waiting.filter(r => !shown.has(r.key));
    if (!fresh.length) return;
    markShown(fresh.map(r => r.key));
    setShowing(fresh);
    if (data?.desktop) tellTheComputer(fresh);
    // waiting is derived from pendingKeys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKeys, calm, data?.desktop, data?.quiet_while_reading]);

  if (!showing.length || !inv) return null;
  return <Notice key={showing.map(r => r.key).join(' ')} rows={showing} inv={inv} onClose={() => setShowing([])}/>;
}

function Notice({rows, inv, onClose}: {rows: InboxRowOut[]; inv: string; onClose: () => void}): ReactElement {
  const [folded, setFolded] = useState(false);
  // Announced once, when it rises; opened again from its mark it is a plain region.
  const [announced, setAnnounced] = useState(false);
  const [held, setHeld] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLButtonElement>(null);
  const open = useRef<HTMLAnchorElement>(null);
  // Folded or opened by hand, the focus follows to what replaced the control that was pressed.
  const [byHand, setByHand] = useState(false);
  useEffect(() => {
    if (!byHand) return;
    (folded ? mark.current : open.current)?.focus();
    setByHand(false);
  }, [folded, byHand]);
  useEffect(() => {
    if (folded || held) return undefined;
    const timer = window.setTimeout(() => {
      // Folding never takes the focus away: a focused notice stays open.
      if (box.current?.contains(document.activeElement)) return;
      setFolded(true); setAnnounced(true);
    }, FOLD_MS);
    return () => window.clearTimeout(timer);
  }, [folded, held]);
  const first = rows[0];
  const title = rows.length > 1 ? `${first.title}, and ${rows.length - 1} more` : first.title;
  if (folded) return <button ref={mark} type="button" className="fr-alarm-mark" aria-expanded="false" aria-label={`${title}. Show the notice`}
    title={title} onClick={() => { setFolded(false); setHeld(true); setByHand(true); }}>
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M3.5 14.5V2M3.5 2.5h8.5l-2 3 2 3H3.5" fill="currentColor" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
    {rows.length > 1 && <b aria-hidden="true">{rows.length}</b>}
  </button>;
  return <div ref={box} className="fr-alarm" role={announced ? 'region' : 'alert'} aria-label={announced ? 'Textbook Red Flag notice' : undefined}
    onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}>
    <span className="fr-alarm-mark-in" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M3.5 14.5V2M3.5 2.5h8.5l-2 3 2 3H3.5" fill="currentColor" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg></span>
    <span className="fr-alarm-words">
      <b>{first.title}</b>
      {first.reason && <span>{first.reason}</span>}
      {rows.length > 1 && <span>and {rows.length - 1} more in Needs you</span>}
    </span>
    <span className="fr-alarm-acts">
      <Link ref={open} href={caseHref(first.href, inv)} onClick={onClose}>Open</Link>
      <button type="button" onClick={onClose}>Dismiss</button>
      <button type="button" className="fr-alarm-fold" aria-label="Fold to its mark" onClick={() => { setFolded(true); setAnnounced(true); setHeld(false); setByHand(true); }}>
        <span aria-hidden="true">–</span></button>
    </span>
  </div>;
}
