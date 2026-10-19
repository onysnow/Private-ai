'use client';
// The inbox behind the bell (mockup HOME_2, "Notifications inbox"): what needs you
// (the decisions only a person can make, most consequential first) apart from
// everything else that happened this week. Any row can be snoozed on this computer
// for a day or a week; a snoozed row comes back by itself.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {AiTag, LevelChip} from '../../components/status';
import {caseHref} from '../../lib/case-href';
import {getDecisionsOptions, getSinceOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';

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
export function useSnoozed(): [Record<string, number>, (id: string, ms: number) => void] {
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  useEffect(() => { setSnoozed(readSnoozed()); }, []);
  const snooze = useCallback((id: string, ms: number) => {
    const next = {...readSnoozed(), [id]: Date.now() + ms};
    try { window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* private window */ }
    setSnoozed(next);
  }, []);
  return [snoozed, snooze];
}

/** A week ago, to the day, so the question stays the same all day. */
function weekAgo(): string {
  const d = new Date(Date.now() - 7 * DAY_MS);
  return `${d.toISOString().slice(0, 10)}T00:00:00`;
}

/** How many need you, leaving out what is snoozed here. */
export function useNeedsYouCount(): number {
  const inv = useWorkbenchStore(state => state.investigationId);
  const [snoozed] = useSnoozed();
  const data = useQuery({...getDecisionsOptions({path: {investigation_id: inv}, query: {limit: 200}}), enabled: Boolean(inv)}).data;
  // The decisions are read as the rules last left them; when the records have changed since, this runs them once.
  useRedFlagsQuery(inv, Boolean(inv));
  return data ? Math.max(0, data.total - data.items.filter(i => snoozed[`d:${i.kind}:${i.id}`]).length) : 0;
}

function Snooze({onSnooze}: {onSnooze: (ms: number) => void}): ReactElement {
  return <span className="ib-snooze">
    <button type="button" onClick={() => onSnooze(DAY_MS)}>Snooze a day</button>
    <button type="button" onClick={() => onSnooze(7 * DAY_MS)}>a week</button>
  </span>;
}

export function Inbox({open, onClose}: {open: boolean; onClose: () => void}): ReactElement | null {
  const inv = useWorkbenchStore(state => state.investigationId);
  const [snoozed, snooze] = useSnoozed();
  const after = useMemo(weekAgo, []);
  const decisions = useQuery({...getDecisionsOptions({path: {investigation_id: inv}, query: {limit: 200}}), enabled: Boolean(inv && open)});
  useRedFlagsQuery(inv, Boolean(inv && open));
  const since = useQuery({...getSinceOptions({path: {investigation_id: inv}, query: {after}}), enabled: Boolean(inv && open)});
  const [tab, setTab] = useState<'needs' | 'else'>('needs');
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const needs = (decisions.data?.items ?? []).filter(i => !snoozed[`d:${i.kind}:${i.id}`]);
  const changes = (since.data?.changes ?? []).filter(c => !snoozed[`c:${c.key}:${c.count}`]);
  const hidden = Object.keys(snoozed).length;
  return <section className="ib" role="dialog" aria-label="Inbox">
    <header>
      <div role="tablist" aria-label="Inbox">
        <button type="button" role="tab" aria-selected={tab === 'needs'} onClick={() => setTab('needs')}>Needs you <b>{needs.length}</b></button>
        <button type="button" role="tab" aria-selected={tab === 'else'} onClick={() => setTab('else')}>Everything else <b>{changes.length}</b></button>
      </div>
      <button type="button" className="ib-x" aria-label="Close the inbox" onClick={onClose}>×</button>
    </header>
    {!inv ? <p className="ib-quiet">Open a case to see what waits in it.</p>
      : tab === 'needs' ? <ul className="ib-list" role="tabpanel" aria-label="Needs you">
        {decisions.isPending ? <li className="ib-quiet">Looking…</li> : !needs.length ? <li className="ib-quiet">Nothing needs you.</li>
          : needs.slice(0, 30).map(i => <li key={`${i.kind}:${i.id}`}>
            <Link href={caseHref(`/decide?kind=${i.kind}`, inv)} onClick={onClose} className="ib-row">
              <span className="ib-why">{i.actor_kind === 'ai' ? <AiTag/> : <small>{i.actor}</small>}{i.level && <LevelChip level={i.level}/>}</span>
              <b>{i.question}</b>
            </Link>
            <Snooze onSnooze={ms => snooze(`d:${i.kind}:${i.id}`, ms)}/>
          </li>)}
      </ul>
      : <ul className="ib-list" role="tabpanel" aria-label="Everything else">
        {since.isPending ? <li className="ib-quiet">Looking…</li> : !changes.length ? <li className="ib-quiet">Nothing else this week.</li>
          : changes.map(c => <li key={c.key}>
            <Link href={caseHref(c.href, inv)} onClick={onClose} className="ib-row">
              <span className="ib-why">{c.actor_kind === 'ai' ? <AiTag/> : null}<small>this week</small></span>
              <b>{c.count} {c.label}</b>
            </Link>
            <Snooze onSnooze={ms => snooze(`c:${c.key}:${c.count}`, ms)}/>
          </li>)}
      </ul>}
    {hidden > 0 && <footer className="ib-quiet">{hidden} snoozed on this computer; each comes back by itself.</footer>}
  </section>;
}
