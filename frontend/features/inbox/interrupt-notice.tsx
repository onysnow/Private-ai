'use client';
// The one notice that interrupts (research §8; Settings › Notifications, "Interrupt"): a
// row routed there shows once in the top band, in the alarm colour, rising once and never
// repeating; it stays in Needs you. With "Quiet while reading" it waits while a calm zone
// (the reader, Chain of Custody, Decide: anything marked data-calm-zone) is on screen.
// With "Desktop notification" on and the app in the background, the computer is told too,
// with the kind only: no names, no text.
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {caseHref} from '../../lib/case-href';
import type {InboxRowOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useInbox, useSnoozed} from './inbox';

const SHOWN_KEY = 'pai:interrupted';

function readShown(): string[] {
  try { return JSON.parse(window.localStorage.getItem(SHOWN_KEY) ?? '[]') as string[]; } catch { return []; }
}

function markShown(keys: string[]): void {
  try { window.localStorage.setItem(SHOWN_KEY, JSON.stringify([...new Set([...readShown(), ...keys])].slice(-500))); } catch { /* private window */ }
}

const inCalmZone = (): boolean => typeof document !== 'undefined' && Boolean(document.querySelector('[data-calm-zone]'));

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
  const [showing, setShowing] = useState<InboxRowOut[]>([]);
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
  const first = showing[0];
  return <div className="fr-alarm" role="alert">
    <b>{first.title}</b>
    {first.reason && <span>{first.reason}</span>}
    {showing.length > 1 && <span>and {showing.length - 1} more in Needs you</span>}
    <Link href={caseHref(first.href, inv)} onClick={() => setShowing([])}>Open</Link>
    <button type="button" onClick={() => setShowing([])}>Dismiss</button>
  </div>;
}
