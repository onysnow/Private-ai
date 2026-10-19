'use client';
// Settings › Notifications (Settings panes mockup, board 1): where each kind goes (the top
// band, Needs you, Everything else, or nowhere), last week replayed with the routes on
// screen, when it tells you, the facts you watch, and what the app never sends outside.
// A route is saved as soon as it is chosen; it is yours alone (GET/PUT /settings/notifications).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {
  deleteWatchMutation, getInboxOptions, getInboxQueryKey, getNotificationPrefsOptions, getNotificationPrefsQueryKey,
  listWatchesOptions, listWatchesQueryKey, putNotificationPrefsMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {NotificationPrefsOut} from '../../lib/generated/types.gen';

import {OutsideChannels} from './outside-channels';

type Route = 'interrupt' | 'needs' | 'else' | 'off';
const ROUTE_WORDS: Record<Route, string> = {interrupt: 'Interrupt', needs: 'Needs you', else: 'Everything else', off: 'Off'};
const BACKUP_DAYS: {days: 7 | 14 | 30 | 0; words: string}[] = [
  {days: 7, words: 'A week'}, {days: 14, words: 'Two weeks'}, {days: 30, words: 'A month'}, {days: 0, words: 'Never'},
];
const BINS: {route: Route; words: string}[] = [
  {route: 'interrupt', words: 'would have interrupted you'}, {route: 'needs', words: 'in Needs you'},
  {route: 'else', words: 'in Everything else'}, {route: 'off', words: 'not shown'},
];

/** The browser's own permission, asked only when the switch is turned on. */
async function allowDesktop(): Promise<string | null> {
  if (typeof Notification === 'undefined') return 'This browser cannot show notifications.';
  if (Notification.permission === 'granted') return null;
  if (Notification.permission === 'denied') return 'This browser blocks notifications for the Workbench. Allow them in the browser’s site settings first.';
  return (await Notification.requestPermission()) === 'granted' ? null : 'The browser was not allowed to show notifications, so this stays off.';
}

export function NotificationsPane({investigationId, caseName}: {investigationId: string; caseName: string}): ReactElement {
  const queryClient = useQueryClient();
  const prefs = useQuery(getNotificationPrefsOptions());
  const inbox = useQuery({...getInboxOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const watches = useQuery({...listWatchesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const [problem, setProblem] = useState('');
  const save = useMutation({
    ...putNotificationPrefsMutation(),
    onMutate: async ({body}) => {
      const key = getNotificationPrefsQueryKey();
      const before = queryClient.getQueryData<NotificationPrefsOut>(key);
      if (before) queryClient.setQueryData<NotificationPrefsOut>(key, {...before, ...body, routes: {...before.routes, ...body.routes}, backup_days: body.backup_days ?? before.backup_days});
      return {before};
    },
    onError: (error, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(getNotificationPrefsQueryKey(), ctx.before);
      setProblem(errorMessage(error, 'Could not save that. Nothing changed.'));
    },
    onSuccess: data => {
      setProblem('');
      queryClient.setQueryData(getNotificationPrefsQueryKey(), data);
      if (investigationId) void queryClient.invalidateQueries({queryKey: getInboxQueryKey({path: {investigation_id: investigationId}})});
    },
  });
  const stop = useMutation({...deleteWatchMutation(),
    onSuccess: () => queryClient.invalidateQueries({queryKey: listWatchesQueryKey({path: {investigation_id: investigationId}})})});

  if (prefs.isPending) return <p className="st-wait">Reading your notifications…</p>;
  if (prefs.isError) return <p className="st-problem" role="alert">{errorMessage(prefs.error, 'Could not read your notifications.')}</p>;
  const p = prefs.data;
  const put = (change: Partial<{routes: Record<string, Route>; quiet_while_reading: boolean; desktop: boolean; backup_days: 7 | 14 | 30 | 0}>) =>
    save.mutate({body: {routes: change.routes ?? {}, quiet_while_reading: change.quiet_while_reading ?? p.quiet_while_reading, desktop: change.desktop ?? p.desktop,
      ...(change.backup_days !== undefined ? {backup_days: change.backup_days} : {})}});
  const week = inbox.data?.week;
  const bins = Object.fromEntries(BINS.map(b => [b.route, 0])) as Record<Route, number>;
  if (week) for (const k of p.kinds) bins[(p.routes[k.key] ?? k.default) as Route] += week[k.key] ?? 0;

  return <div className="ap-two">
    <section className="ap-pane" aria-labelledby="nt-routes">
      <div className="ap-pane-head"><h2 id="nt-routes">Where each kind goes</h2><span>the bell’s two tabs, the top band, or nowhere</span>
        <button type="button" className="st-link" onClick={() => put({routes: Object.fromEntries(p.kinds.map(k => [k.key, k.default as Route]))})}>Reset to defaults</button></div>
      {p.kinds.map(k => {
        const routes: Route[] = k.can_interrupt ? ['interrupt', 'needs', 'else', 'off'] : ['needs', 'else', 'off'];
        const current = (p.routes[k.key] ?? k.default) as Route;
        return <div key={k.key} className="st-route">
          <span className="st-route-what"><b>{k.label}</b>{week && <small>{week[k.key] ?? 0} last week</small>}</span>
          <span className="ap-seg" role="radiogroup" aria-label={k.label}>
            {routes.map(r => <button key={r} type="button" role="radio" aria-checked={current === r} className={current === r ? 'on' : ''}
              onClick={() => current !== r && put({routes: {[k.key]: r}})}>{ROUTE_WORDS[r]}{r === k.default && <em className="st-default">default</em>}</button>)}
          </span>
        </div>;
      })}
      {problem && <p className="st-problem" role="alert">{problem}</p>}
      <p className="st-hint">Interrupt is one notice in the top band, in the alarm colour, shown once and never repeated. Only a Textbook Red Flag may interrupt.</p>
    </section>

    <div className="st-col">
      <section className="ap-pane" aria-labelledby="nt-week">
        <div className="ap-pane-head"><h2 id="nt-week">Last week, with these choices</h2><span>{caseName}</span></div>
        {!investigationId ? <p className="st-hint">Open a case to replay its week.</p>
          : !week ? <p className="st-wait">Counting…</p>
          : <div className="st-bins">{BINS.map(b => <div key={b.route} className={`st-bin st-bin-${b.route}`}><b>{bins[b.route]}</b><span>{b.words}</span></div>)}</div>}
        <p className="st-hint">Counted from what this case raised in the last seven days. Change a route and the numbers move, so you see what you would have been told before you choose.</p>
      </section>

      <section className="ap-pane" aria-labelledby="nt-when">
        <div className="ap-pane-head"><h2 id="nt-when">When it tells you</h2></div>
        <label className="ap-switch"><span><b>Quiet while reading</b><small>In the reader, Chain of Custody and Decide, an interrupt waits until you leave. The bell still counts.</small></span>
          <input type="checkbox" role="switch" checked={p.quiet_while_reading} onChange={e => put({quiet_while_reading: e.target.checked})}/><i aria-hidden="true"/></label>
        <label className="ap-switch"><span><b>Desktop notification</b><small>When the Workbench is in the background, an interrupt also tells this computer: the kind only, no names and no text.</small></span>
          <input type="checkbox" role="switch" checked={p.desktop} onChange={async e => {
            const on = e.target.checked;
            if (on) { const why = await allowDesktop(); if (why) { setProblem(why); return; } }
            put({desktop: on});
          }}/><i aria-hidden="true"/></label>
        <div className="st-route">
          <span className="st-route-what"><b>Remind me to back up</b><small>When a case has new material and no full backup for this long. Only a backup with the files counts.</small></span>
          <span className="ap-seg" role="radiogroup" aria-label="Remind me to back up">
            {BACKUP_DAYS.map(b => <button key={b.days} type="button" role="radio" aria-checked={p.backup_days === b.days} className={p.backup_days === b.days ? 'on' : ''}
              onClick={() => p.backup_days !== b.days && put({backup_days: b.days})}>{b.words}</button>)}
          </span>
        </div>
      </section>

      <OutsideChannels prefs={p}/>

      <section className="ap-pane" aria-labelledby="nt-watch">
        <div className="ap-pane-head"><h2 id="nt-watch">Watches on facts</h2><span>told when a fact changes</span></div>
        {!investigationId ? <p className="st-hint">Open a case to see what you watch in it.</p>
          : watches.isPending ? <p className="st-wait">Looking…</p>
          : !watches.data?.length ? <p className="st-hint">Nothing watched in this case. Watch a claim from its card, or a Red Flag from its page.</p>
          : <ul className="st-list">{watches.data.map(w => <li key={w.id} className="st-route">
            <span className="st-route-what"><b>{w.label}</b>
              <small>{w.record_type === 'claim' ? 'Claim' : 'Red Flag'} · {w.changed ? `${w.baseline_words} → ${w.value_words}` : `now ${w.value_words}`}</small></span>
            <button type="button" className="ap-btn" disabled={stop.isPending} onClick={() => stop.mutate({path: {fact_watch_id: w.id}})}>Stop</button>
          </li>)}</ul>}
      </section>
    </div>
  </div>;
}
