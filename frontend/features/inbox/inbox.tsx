'use client';
// The inbox behind the bell (mockup HOME_2, "Notifications inbox"): each row where the
// person sent its kind in Settings › Notifications (GET …/inbox applies the routes):
// Needs you apart from Everything else; a kind set to Off is not shown. Any row can be
// snoozed on this computer for a day or a week; a snoozed row comes back by itself. A
// watched fact that changed is marked seen here.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {AiTag, LevelChip} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {caseHref} from '../../lib/case-href';
import {getInboxOptions, getInboxQueryKey, seeWatchMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {InboxOut, InboxRowOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';
import {KindMark} from '../case-home/decision-card';
import {KIND_LABEL} from '../case-home/use-decisions';
import type {DecisionKind} from '../case-home/use-decisions';

const SNOOZE_KEY = 'pai:snoozed';
const DAY_MS = 86_400_000;

function readSnoozed(): Record<string, number> {
  try {
    const v = JSON.parse(window.localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(v).filter(([, until]) => typeof until === 'number' && until > now));
  } catch { return {}; }
}

/** Rows snoozed on this computer, and a way to snooze one more. */
const SNOOZE_EVENT = 'pai:snoozed';

/** Snoozes on this computer, shared by every place that reads them (the inbox, the bell, the interrupt notice):
 * a snooze in one is seen by the others at once, and by other tabs through the storage event. */
export function useSnoozed(): [Record<string, number>, (id: string, ms: number) => void] {
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  useEffect(() => {
    const read = () => setSnoozed(readSnoozed());
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === SNOOZE_KEY) read(); };
    window.addEventListener(SNOOZE_EVENT, read);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(SNOOZE_EVENT, read); window.removeEventListener('storage', onStorage); };
  }, []);
  const snooze = useCallback((id: string, ms: number) => {
    const next = {...readSnoozed(), [id]: Date.now() + ms};
    try { window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* private window */ }
    setSnoozed(next);
    window.dispatchEvent(new Event(SNOOZE_EVENT));
  }, []);
  return [snoozed, snooze];
}

/** The open case's inbox, checked again every minute so the bell and the top band keep up. */
export function useInbox(enabled = true): {data: InboxOut | undefined; isPending: boolean} {
  const inv = useWorkbenchStore(state => state.investigationId);
  const q = useQuery({...getInboxOptions({path: {investigation_id: inv}}), enabled: Boolean(inv) && enabled, refetchInterval: 60_000});
  // The inbox reads the stored flags and To check items; when the records have changed since the rules last ran,
  // this runs them once (and the run refreshes the inbox).
  useRedFlagsQuery(inv, Boolean(inv) && enabled);
  return {data: q.data, isPending: q.isPending};
}

/** How many need you, leaving out what is snoozed here. */
export function useNeedsYouCount(): number {
  const [snoozed] = useSnoozed();
  const {data} = useInbox();
  return data ? data.needs.filter(r => !snoozed[r.key]).length : 0;
}

function Snooze({onSnooze}: {onSnooze: (ms: number) => void}): ReactElement {
  return <span className="ib-snooze">
    <button type="button" onClick={() => onSnooze(DAY_MS)}>Snooze a day</button>
    <button type="button" onClick={() => onSnooze(7 * DAY_MS)}>a week</button>
  </span>;
}

function Row({r, inv, onClose, onSnooze}: {r: InboxRowOut; inv: string; onClose: () => void; onSnooze: (ms: number) => void}): ReactElement {
  const queryClient = useQueryClient();
  const seen = useMutation({...seeWatchMutation(),
    onSuccess: () => queryClient.invalidateQueries({queryKey: getInboxQueryKey({path: {investigation_id: inv}})})});
  const watchId = r.kind === 'watch' ? r.key.split(':')[1] : null;
  // A row is its title with its marks (Decide's kind mark, the AI mark, the level's bars); who sent it and why are on
  // hover or focus (Ony, 29 Oct). A watched fact's change is the news itself, so it stays on screen.
  const kind = r.kind in KIND_LABEL ? r.kind as DecisionKind : null;
  const reason = r.reason && r.reason !== r.actor ? r.reason : '';
  const keepReason = r.kind === 'watch' && reason;
  const detail = [r.actor_kind !== 'ai' ? r.actor : '', kind ? KIND_LABEL[kind] : '', keepReason ? '' : reason].filter(Boolean);
  const marks = r.actor_kind === 'ai' || kind || r.level;
  const row = <Link href={caseHref(r.href, inv)} onClick={onClose} className="ib-row">
    {marks && <span className="ib-why">{r.actor_kind === 'ai' ? <AiTag/> : kind ? <KindMark kind={kind} bare/> : null}
      {r.level && <LevelChip level={r.level as 'faint' | 'strong' | 'textbook'}/>}</span>}
    <b>{r.title}</b>
    {keepReason && <small className="ib-reason">{reason}</small>}
  </Link>;
  return <li>
    {detail.length ? <Reveal tabbable={false} detail={<>{detail.map((d, i) => i === 0 ? <b key={d}>{d}</b> : <span key={d} className="rv-row">{d}</span>)}</>}>{row}</Reveal> : row}
    <span className="ib-acts">
      {watchId && <button type="button" className="ib-seen" disabled={seen.isPending}
        onClick={() => seen.mutate({path: {fact_watch_id: watchId}})}>Seen</button>}
      <Snooze onSnooze={onSnooze}/>
    </span>
  </li>;
}

export function Inbox({open, onClose}: {open: boolean; onClose: () => void}): ReactElement | null {
  const inv = useWorkbenchStore(state => state.investigationId);
  const [snoozed, snooze] = useSnoozed();
  const {data, isPending} = useInbox(open);
  const [tab, setTab] = useState<'needs' | 'else'>('needs');
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const needs = (data?.needs ?? []).filter(r => !snoozed[r.key]);
  const rest = (data?.else ?? []).filter(r => !snoozed[r.key]);
  const hidden = Object.keys(snoozed).length;
  const list = tab === 'needs' ? needs : rest;
  return <section className="ib" role="dialog" aria-label="Inbox">
    <header>
      <div role="tablist" aria-label="Inbox">
        <button type="button" role="tab" aria-selected={tab === 'needs'} onClick={() => setTab('needs')}>Needs you <b>{needs.length}</b></button>
        <button type="button" role="tab" aria-selected={tab === 'else'} onClick={() => setTab('else')}>Everything else <b>{rest.length}</b></button>
      </div>
      <button type="button" className="ib-x" aria-label="Close the inbox" onClick={onClose}>×</button>
    </header>
    {!inv ? <p className="ib-quiet">Open a case to see what waits in it.</p>
      : <ul className="ib-list" role="tabpanel" aria-label={tab === 'needs' ? 'Needs you' : 'Everything else'}>
        {isPending ? <li className="ib-quiet">Looking…</li>
          : !list.length ? <li className="ib-quiet">{tab === 'needs' ? 'Nothing needs you.' : 'Nothing else this week.'}</li>
          : list.slice(0, 40).map(r => <Row key={r.key} r={r} inv={inv} onClose={onClose} onSnooze={ms => snooze(r.key, ms)}/>)}
      </ul>}
    <footer className="ib-quiet">
      {hidden > 0 && <><Reveal detail="Snoozed on this computer; each comes back by itself."><span>{hidden} snoozed</span></Reveal> · </>}
      <Link href="/settings#notifications" onClick={onClose}>Choose what goes where</Link>
    </footer>
  </section>;
}
