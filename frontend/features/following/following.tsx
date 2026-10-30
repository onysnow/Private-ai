'use client';
// Following (Bring in; mockup FOLLOW_1, ADR-0022): the app watches, a person captures. Three columns as the mockup
// draws them. Left: the sources the case follows, each with whether it works today, its schedule and route, and
// how many new items wait; the chosen source below, with its last check, how often it is asked, Direct or Tor, and
// in words what leaves this computer. Middle: how many items wait for a person, Capture all (only with a reason, kept
// in the custody log), and the queue, most at risk first, each with Capture and Skip (Record removal for something
// captured that is now gone). Right: the versions of a followed page and what changed, copies of one story counted
// once, and what leaves this computer for every source together. No account logins anywhere: a closed platform is a
// row with no monitor.
// Converted to the 29 Oct rule: a source's kind is its icon and its health a shape and colour (marks.tsx), named on
// hover; schedules, times, addresses, check results and explanations are on hover too. What leaves this computer is
// the "↗ 1 request · 30 min · direct" line, its sentence on hover; alerts, risks, counts and the closed-platform
// "no monitor" stay on screen.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {useLockStore} from '../../lib/app-lock';
import {caseHref} from '../../lib/case-href';
import {getFollowingOptions, getFollowingQueryKey, getVersionsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {captureAll, captureItem, checkMonitor, deleteMonitor, recordRemoval, skipItem, undoItem, updateMonitor} from '../../lib/generated/sdk.gen';
import type {FollowingOut, MonitorItemOut, MonitorOut, PageVersionOut} from '../../lib/generated/types.gen';
import {apiTime, timeWords} from '../../lib/timestamps';
import {FingerprintMark} from '../the-drop/kind-marks';
import {EmptyFollowing, FollowForm} from './follow-form';
import {HealthMark, KIND_NAME, KindIcon, KindMark} from './marks';
import type {SourceKind} from './marks';
import {WorksToday} from './works-today';

const isKind = (k: string): k is SourceKind => k in KIND_NAME;
const EVERY: [number, string][] = [[15, '15 min'], [30, '30 min'], [60, 'hourly'], [1440, 'daily'], [10080, 'weekly']];
const everyWord = (m: number) => EVERY.find(([n]) => n === m)?.[1] ?? `${m} min`;
const ROUTE_WORDS = {direct: 'The site sees a visit from this computer’s address.',
  tor: 'Through a Tor you run on this computer; the app ships none. The site sees a Tor exit address.'} as const;
const BULK_REASONS = ['Account is deleting posts', 'Page is being edited now', 'Too many in the same hour'];
const MARK = {ok: '✓', warn: '!', bad: '✕', wait: '·'} as const;
/** A risk's short alert word: the words before a colon ("At risk", "Removed"), or its first word ("Changed",
 *  "Deleted"). */
export const riskWord = (text: string): string => (text.includes(':') ? text.split(':')[0] : text.split(/\s/)[0]).trim();
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
type Tab = 'sources' | 'risk' | 'changes' | 'history' | 'works';

const hhmm = (iso?: string | null) => (iso ? apiTime(iso).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '');
function when(iso?: string | null): string {
  if (!iso) return '';
  const d = apiTime(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? `${hhmm(iso)} today`
    : timeWords(iso);
}

function health(m: MonitorOut): [string, string] {
  if (m.kind === 'closed') return ['y', 'link capture only'];
  if (m.health === 'works') return ['g', `works today ${hhmm(m.last_ok_at)}`.trim()];
  if (m.health === 'moved') return ['b', 'broken: moved'];
  if (m.health === 'broken') return ['b', `broken: ${(m.health_detail ?? '').split(':')[0] || 'not read'}`];
  if (m.health === 'paused') return ['y', 'paused'];
  return ['y', 'not checked yet'];
}

function SourceRow({m, picked, onPick}: {m: MonitorOut; picked: boolean; onPick: () => void}): ReactElement {
  const [, words] = health(m);
  const route = m.kind === 'closed' ? 'files you supply' : `${everyWord(m.every_minutes)} · ${m.route}`;
  // The count is the number alone, "new" on hover; a closed platform's "no monitor" is a dashed empty ring. A broken
  // source keeps its alert word, since it asks for action.
  const badge = m.kind === 'closed' ? <Reveal tabbable={false} describe={false} detail="No monitor: link capture only"><span className="fl-badge z none" aria-hidden="true"/></Reveal>
    : m.health === 'broken' || m.health === 'moved' ? <span className="fl-badge bd">fix</span>
      : <Reveal tabbable={false} describe={false} detail={m.waiting ? `${m.waiting} new, waiting for a person` : 'Nothing new waits'}>
        <span className={`fl-badge${m.waiting ? '' : ' z'}`}>{m.waiting}</span></Reveal>;
  return <button type="button" role="option" aria-selected={picked} className="fl-mon" onClick={onPick}>
    {/* The kind is its icon and the health its shape and colour; their words, the schedule and the route are on hover
        (and in the row for screen readers). */}
    <span className="fl-tag"><KindMark kind={m.kind}/></span>
    <span className="fl-mon-text"><span className="fl-t">{m.name}</span>
      <span className="st-sr">{KIND_NAME[m.kind][0]} · {words} · {route}{m.kind === 'closed' ? ' · no monitor' : m.waiting ? ` · ${m.waiting} new` : ''}</span></span>
    <span className="fl-mon-end"><HealthMark health={m.health} detail={<span className="rv-row">{words} · {route}</span>}/>{badge}</span>
  </button>;
}

function SelectedSource({m, investigationId, onChanged}: {m: MonitorOut; investigationId: string; onChanged: () => Promise<void>}): ReactElement {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const act = async (what: string, run: () => Promise<unknown>) => {
    setBusy(what); setError('');
    try { await run(); await onChanged(); } catch (e) { setError(errorMessage(e, 'That did not work')); } finally { setBusy(''); }
  };
  if (m.kind === 'closed') return <section className="fl-panel" aria-label="Selected source">
    <p className="fl-cap">Selected source<span className="r"><Reveal detail="Closed platforms cannot be followed here. The app does not sign in to any account, so it can only capture what a logged-out visitor sees.">
      <span className="fl-chip dash">No monitor</span></Reveal></span></p>
    <h3 className="fl-h3"><KindMark kind={m.kind} tabbable/> {m.name}</h3>
    <div className="fl-row"><Reveal tabbable={false} detail={<>The page is captured logged out. A login wall is recorded as <b>not seen</b>.</>}>
      <Link className="fl-btn pri sm" href={caseHref('/bring-in#the-drop', investigationId)}>Paste a link</Link></Reveal>
      <Reveal tabbable={false} detail="Files, exports or screenshots you saved are kept as files you supplied, with you as the source.">
        <Link className="fl-btn sm" href={caseHref('/bring-in#the-drop', investigationId)}>Drop a file</Link></Reveal>
      <button type="button" className="fl-btn sm quiet" disabled={Boolean(busy)} onClick={() => void act('stop', () => deleteMonitor({path: {monitor_id: m.id}, throwOnError: true}))}>Remove</button></div>
    {error && <p role="alert" className="fl-error">{error}</p>}
  </section>;
  const works = m.health === 'works';
  return <section className="fl-panel" aria-label="Selected source">
    {/* Health is its mark; the word, the last check and what each check found are on hover. A check that warns or
        failed stays on screen. */}
    <p className="fl-cap">Selected source<span className="r"><HealthMark health={m.health} tabbable detail={<>
      <span className="rv-row">{works ? 'Works today' : m.health === 'unchecked' ? 'Not checked yet' : 'Does not work today'}{m.last_checked_at ? ` · checked ${when(m.last_checked_at)}` : ''}</span>
      {m.checks.filter(c => c.state === 'ok' || c.state === 'wait').map((c, i) => <span key={i} className="rv-row">{MARK[c.state]} {c.text}</span>)}</>}/></span></p>
    <h3 className="fl-h3"><KindMark kind={m.kind} tabbable/> {m.name}</h3>
    <p className="fl-addr">{m.platform === 'bluesky' ? 'Open protocol · public posts only · no login'
      : m.platform === 'telegram' ? `Public channel · web preview, the latest posts · no login · ${m.url.replace('https://t.me/s/', 't.me/')}`
      : <Reveal detail={<span className="rv-mono">{m.url}</span>}>{host(m.url)}</Reveal>}</p>
    {m.checks.some(c => c.state === 'warn' || c.state === 'bad') && <ul className="fl-checks">{m.checks.filter(c => c.state === 'warn' || c.state === 'bad').map((c, i) =>
      <li key={i}><span className={`fl-ico ${c.state}`} aria-hidden="true">{MARK[c.state]}</span>{c.text}</li>)}</ul>}
    {m.health === 'moved' && m.moved_to && <div className="fl-moved">
      <p>The old address points to <span className="fl-mono">{m.moved_to}</span>. A moved source is never followed by itself.</p>
      <button type="button" className="fl-btn pri sm" disabled={Boolean(busy)}
        onClick={() => void act('move', () => updateMonitor({path: {monitor_id: m.id}, body: {accept_move: true}, throwOnError: true}))}>Follow the new address</button>
    </div>}
    <div className="fl-row wrap">
      <span className="fl-note">Look every</span>
      <span className="fl-rad" role="radiogroup" aria-label="Look every">{EVERY.map(([n, label]) =>
        <button key={n} type="button" role="radio" aria-checked={m.every_minutes === n} disabled={Boolean(busy)}
          onClick={() => void act('every', () => updateMonitor({path: {monitor_id: m.id}, body: {every_minutes: n as 15 | 30 | 60 | 1440 | 10080}, throwOnError: true}))}>{label}</button>)}</span>
      <span className="fl-note">Route</span>
      <span className="fl-rad" role="radiogroup" aria-label="Route">{(['direct', 'tor'] as const).map(r =>
        <Reveal key={r} tabbable={false} detail={ROUTE_WORDS[r]}>
          <button type="button" role="radio" aria-checked={m.route === r} disabled={Boolean(busy)}
          onClick={() => void act('route', () => updateMonitor({path: {monitor_id: m.id}, body: {route: r}, throwOnError: true}))}>{r === 'direct' ? 'Direct' : 'Neutral route'}</button></Reveal>)}</span>
    </div>
    {/* What leaves this computer stays on screen as one line; the sentence is on hover. */}
    <Reveal className="fl-egress" detail={<><b>Leaves this computer:</b> {m.leaves}</>}>
      <span>↗ 1 request · {everyWord(m.every_minutes)} · {m.route === 'tor' ? 'Tor' : 'direct'}</span></Reveal>
    <div className="fl-row">
      <button type="button" className="fl-btn sm" disabled={Boolean(busy) || m.health === 'moved'}
        onClick={() => void act('check', () => checkMonitor({path: {monitor_id: m.id}, throwOnError: true}))}>{busy === 'check' ? 'Checking…' : 'Check now'}</button>
      <button type="button" className="fl-btn sm" disabled={Boolean(busy)}
        onClick={() => void act('pause', () => updateMonitor({path: {monitor_id: m.id}, body: {paused: m.health !== 'paused'}, throwOnError: true}))}>{m.health === 'paused' ? 'Resume' : 'Pause'}</button>
      <button type="button" className="fl-btn sm quiet" disabled={Boolean(busy)}
        onClick={() => void act('stop', () => deleteMonitor({path: {monitor_id: m.id}, throwOnError: true}))}>Stop following</button>
    </div>
    {error && <p role="alert" className="fl-error">{error}</p>}
  </section>;
}

function QueueItem({q, investigationId, onDo}: {q: MonitorItemOut; investigationId: string; onDo: (q: MonitorItemOut, a: 'capture' | 'skip' | 'undo' | 'removal') => void}): ReactElement {
  const audio = q.extra?.audio as {bytes?: number | null} | undefined;
  const meta = [q.source, q.kind === 'page' ? `seen ${hhmm(q.first_seen_at)}` : q.published_at ? `posted ${when(q.published_at)}` : `first seen ${when(q.first_seen_at)}`,
    ...(audio?.bytes ? [`audio file ${Math.round(audio.bytes / (1024 * 1024))} MB`] : []),
    ...(q.decision?.by && q.state !== 'waiting' && q.state !== 'gone' ? [`${q.state === 'skipped' ? 'skipped' : 'by'} ${q.decision.by}`] : [])];
  const alerts = q.risks.filter(r => r.tone === 'bad' || r.tone === 'amber');
  const calm = q.risks.filter(r => r.tone !== 'bad' && r.tone !== 'amber');
  let acts: ReactElement;
  if (q.state === 'waiting' || q.state === 'gone') acts = <>
    {q.state === 'gone' ? <Reveal tabbable={false} detail="Records that the site removed this page: your capture is the copy that remains.">
      <button type="button" className="fl-btn pri sm" onClick={() => onDo(q, 'removal')}>Record removal</button></Reveal>
      : <button type="button" className="fl-btn pri sm" onClick={() => onDo(q, 'capture')}>Capture</button>}
    <button type="button" className="fl-btn sm" onClick={() => onDo(q, 'skip')}>Skip</button></>;
  else if (q.state === 'capturing') acts = <span className="fl-chip teal">Capturing…</span>;
  else if (q.state === 'saved') acts = <><span className="fl-chip ok">Saved</span>
    <Link className="fl-btn sm" href={caseHref('/bring-in#the-drop', investigationId)}>Receipt</Link></>;
  else if (q.state === 'not_saved') acts = <span className="fl-chip bad">Not kept</span>;
  else if (q.state === 'removal_recorded') acts = <span className="fl-chip ok">Recorded as gone</span>;
  else acts = <><span className="fl-chip dash">Skipped</span><button type="button" className="fl-btn sm" onClick={() => onDo(q, 'undo')}>Undo</button></>;
  return <li className={`fl-qi${q.state === 'skipped' ? ' skip' : ''}${['saved', 'removal_recorded'].includes(q.state) ? ' done' : ''}`}>
    {/* The kind is its icon; where it came from, when, and who decided are on hover of the title. Risks stay. */}
    <div className="fl-qi-text"><p className="fl-qt">{isKind(q.kind) && <><KindMark kind={q.kind}/> </>}<Reveal detail={<>
      {meta.map(line => <span key={line} className="rv-row">{line}</span>)}
      <span className="rv-row rv-mono">{q.url}</span>
      {typeof q.decision?.reason === 'string' && <span className="rv-row">Reason: {q.decision.reason}</span>}</>}>{q.title}</Reveal>
      {/* Statuses that ask nothing of you (a wire copy, a transcript offered, no sign of risk) are a coloured dot,
          their words on hover. */}
      {calm.map(r => <Reveal key={r.text} label={r.text} detail={r.text}><i className={`fl-dot ${r.tone || 'quiet'}`} aria-hidden="true"/></Reveal>)}</p></div>
    <div className="fl-acts">{acts}</div>
    {/* A risk asks for action: it keeps a short alert word in its colour; the whole sentence is on hover. */}
    {alerts.length > 0 && <div className="fl-why">{alerts.map(r => <Reveal key={r.text} detail={r.text}>
      <span className={`fl-chip ${r.tone}`} aria-hidden="true">{riskWord(r.text)}</span></Reveal>)}</div>}
  </li>;
}

function Versions({monitor}: {monitor: MonitorOut | undefined}): ReactElement {
  const versions = useQuery({...getVersionsOptions({path: {monitor_id: monitor?.id ?? ''}}), enabled: Boolean(monitor)});
  const [open, setOpen] = useState(false);
  if (!monitor) return <section className="fl-panel" aria-label="Changes and versions">
    <p className="fl-cap"><Reveal detail="Follow a page to keep every version of its main text and see what changed.">Changes &amp; versions</Reveal></p>
    <p className="fl-note">No page followed.</p></section>;
  const rows: PageVersionOut[] = versions.data ?? [];
  const latest = rows[0];
  return <section className="fl-panel" aria-label="Changes and versions">
    <p className="fl-cap">Changes &amp; versions<span className="r"><Reveal label={monitor.name} detail={<><b>{monitor.name}</b><span className="rv-row">{KIND_NAME[monitor.kind][0]}</span></>}>
      <KindIcon kind={monitor.kind}/></Reveal></span></p>
    {!rows.length ? <p className="fl-note">{versions.isPending ? 'Reading the versions…' : 'Not read yet.'}</p> : <ol className="fl-vers">{rows.map(v => {
      const lines = v.diff.filter(d => d.startsWith('-')).map(d => d.slice(1)).slice(0, 2);
      return <li key={v.id} className={v.captured ? 'cap' : v.number === 1 ? 'seen' : 'new'}>
        <span className="fl-vdot" aria-hidden="true"/>
        {/* When it was seen and whether it was captured are on hover (the dot's colour says captured); the change shows. */}
        {v.number === 1 ? <p><Reveal detail={`${when(v.seen_at)} · ${v.captured ? 'captured' : 'seen, not captured'}`}><b>Version 1</b></Reveal> <FingerprintMark hash={v.sha256}/></p>
          : <p><Reveal detail={`${when(v.seen_at)} · ${v.captured ? 'captured' : 'seen, not captured'}`}><b>Text changed: {v.lines_changed} line{v.lines_changed === 1 ? '' : 's'}.</b></Reveal>{lines.length ? ` Gone: “${lines.join(' ')}”` : ''}</p>}
        {v.layout_changes.length > 0 && <Reveal detail={`Layout changed ${v.layout_changes.length} time${v.layout_changes.length === 1 ? '' : 's'} since, text the same. No new capture needed.`}>
          <span className="fl-chip dash">layout ×{v.layout_changes.length}</span></Reveal>}
      </li>;
    })}</ol>}
    {latest && latest.number > 1 && <div className="fl-row">
      <Reveal tabbable={false} detail="Compares the page’s main text. Every version you capture is kept.">
        <button type="button" className="fl-btn sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>See what changed</button></Reveal></div>}
    {open && latest && <pre className="fl-diff" aria-label="What changed">{latest.diff.map((d, i) =>
      <span key={i} className={d.startsWith('-') ? 'del' : 'add'}>{d}{'\n'}</span>)}</pre>}
  </section>;
}

export function Following({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const queryClient = useQueryClient();
  const key = getFollowingQueryKey({path: {investigation_id: investigationId}});
  const query = useQuery({...getFollowingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId),
    refetchInterval: (q) => (active && (q.state.data as FollowingOut | undefined)?.queue.some(i => i.state === 'capturing') ? 2000 : active ? 60000 : false)});
  const data = query.data;
  const [tab, setTab] = useState<Tab>('sources');
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [why, setWhy] = useState('');
  const [notice, setNotice] = useState('');
  const monitors = useMemo(() => data?.monitors ?? [], [data]);
  useEffect(() => { if (!picked && monitors.length) setPicked(monitors[0].id); }, [monitors, picked]);
  const selected = monitors.find(m => m.id === picked) ?? monitors[0];
  const page = selected?.kind === 'page' ? selected : monitors.find(m => m.kind === 'page');
  const refresh = async () => { await queryClient.invalidateQueries({queryKey: key}); };
  const set = (next: FollowingOut) => queryClient.setQueryData(key, next);

  const onDo = async (q: MonitorItemOut, a: 'capture' | 'skip' | 'undo' | 'removal') => {
    setNotice('');
    const path = {monitor_item_id: q.id};
    try {
      const run = a === 'capture' ? captureItem : a === 'skip' ? skipItem : a === 'undo' ? undoItem : recordRemoval;
      set((await run({path, throwOnError: true})).data);
      if (a === 'capture') setNotice(`Capturing “${q.title}”`);
    } catch (e) { setNotice(errorMessage(e, 'That did not work')); }
  };
  const doBulk = async () => {
    try {
      set((await captureAll({path: {investigation_id: investigationId}, body: {reason: why.trim()}, throwOnError: true})).data);
      setBulk(false); setNotice(`Captured everything waiting · reason kept: ${why.trim()}`);
    } catch (e) { setNotice(errorMessage(e, 'Capture all did not work')); }
  };

  if (query.isPending) return <section className="fl" aria-busy="true" aria-label="Following"><p className="fl-note">Reading what this case follows…</p></section>;
  if (query.isError || !data) return <section className="fl" aria-label="Following"><p role="alert">{errorMessage(query.error, 'Could not read what this case follows')}</p></section>;

  const queue = data.queue.filter(q => tab === 'risk' ? (q.state === 'waiting' || q.state === 'gone') && q.rank >= 2
    : tab === 'history' ? !['waiting', 'gone'].includes(q.state) : true);
  const waitingAll = data.queue.filter(q => q.state === 'waiting').length;
  const e = data.egress;
  return <section className="fl" aria-label="Following">
    <nav className="fl-tabs" aria-label="Following">
      {([['sources', 'Sources'], ['risk', 'At risk'], ['changes', 'Changes'], ['history', 'History'], ['works', 'Works today']] as [Tab, string][]).map(([t, label]) =>
        <button key={t} type="button" className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{label}</button>)}
      {data.followed > 0 && <span className="fl-live"><i aria-hidden="true"/>{data.working} of {data.followed} working today</span>}
    </nav>
    {tab === 'works' ? <div className="fl-works"><WorksToday/></div> : !monitors.length ? <>
    {/* Nothing followed yet: the screen is the way to follow a first source. */}
    <header className="fl-title"><h1>Following</h1></header>
    <EmptyFollowing investigationId={investigationId} atRest={<ListAtRest/>}
      onDone={m => { if (m) { setPicked(m.id); void refresh(); } }}/>
    </> : <>
    <header className="fl-title"><Reveal detail="The app watches. A person captures. No account logins anywhere."><h1>Following</h1></Reveal>
      <button type="button" className="fl-btn" aria-expanded={adding} onClick={() => setAdding(a => !a)}>+ Follow something</button></header>

    <div className="fl-left">
      {adding && <FollowForm investigationId={investigationId} onDone={m => { setAdding(false); if (m) { setPicked(m.id); void refresh(); } }}/>}
      <section className="fl-panel" aria-label="Sources followed">
        <p className="fl-cap">Sources followed<ListAtRest/><span className="r">{monitors.some(m => m.last_checked_at)
          ? <Reveal detail={`Health checked ${hhmm(monitors.map(m => m.last_checked_at ?? '').sort().at(-1))}`}>{monitors.length}</Reveal> : monitors.length}</span></p>
        <div role="listbox" aria-label="Sources" className="fl-mons">{monitors.map(m =>
          <SourceRow key={m.id} m={m} picked={m.id === selected?.id} onPick={() => setPicked(m.id)}/>)}</div>
      </section>
      {selected && <SelectedSource m={selected} investigationId={investigationId} onChanged={refresh}/>}
    </div>

    <div className="fl-mid">
      {tab === 'changes' ? <Versions monitor={page}/> : <>
        <section className="fl-panel fl-risk" aria-label="At risk, capture first">
          <p className="fl-cap">At risk · capture first</p>
          <div className="fl-risk-body"><span className="fl-big" aria-label={`${waitingAll} waiting`}>{waitingAll}</span>
            <div><Reveal detail="Following never saves anything by itself. Capture one by one: that is the default."><h3 className="fl-h3">{waitingAll ? 'New items waiting for a person' : 'Nothing waits'}</h3></Reveal></div>
            <Reveal tabbable={false} detail="Several at once needs a reason, which goes in the custody log.">
              <button type="button" className="fl-btn" aria-expanded={bulk} disabled={!waitingAll} onClick={() => setBulk(b => !b)}>Capture all…</button></Reveal></div>
          {bulk && <div className="fl-bulk">
            <label htmlFor="fl-why" className="fl-body">Capture {waitingAll} item{waitingAll === 1 ? '' : 's'} at once. Why not one by one?</label>
            <div className="fl-row wrap">{BULK_REASONS.map(r => <button key={r} type="button" className="fl-btn sm" onClick={() => setWhy(r)}>{r}</button>)}</div>
            <textarea id="fl-why" className="fl-input" rows={2} value={why} onChange={ev => setWhy(ev.target.value)}/>
            <div className="fl-row"><button type="button" className="fl-btn sm" onClick={() => setBulk(false)}>Cancel</button>
              <button type="button" className="fl-btn pri sm" disabled={why.trim().length < 8} onClick={() => void doBulk()}>Capture all</button></div>
          </div>}
        </section>
        <section className="fl-panel fl-queue" aria-label={tab === 'history' ? 'What was decided' : 'Most at risk first'}>
          <p className="fl-cap">{tab === 'history' ? 'Decided this week' : 'Most at risk first'}<span className="r"><Reveal label="Decided this week" detail={`Captured: ${data.captured} · Skipped: ${data.skipped}`}><span aria-hidden="true">ⓘ</span></Reveal></span></p>
          {notice && <p role="status" className="fl-note">{notice}</p>}
          {!queue.length ? <p className="fl-note">{tab === 'history' ? 'Nothing decided this week.' : tab === 'risk' ? 'Nothing at risk waits.' : 'Nothing waits for you.'}</p>
            : <ul className="fl-qlist">{queue.map(q => <QueueItem key={q.id} q={q} investigationId={investigationId} onDo={(i, a) => void onDo(i, a)}/>)}</ul>}
        </section>
      </>}
    </div>

    <div className="fl-right">
      {tab !== 'changes' && <Versions monitor={page}/>}
      {data.copies.slice(0, 2).map(g => <section key={g.id} className="fl-panel" aria-label="Same story, copies">
        <p className="fl-cap"><Reveal detail="Counted once. Copies restate one text. They do not support each other. Only the earliest is offered for capture.">Same story, {g.count} copies</Reveal></p>
        <p className="fl-h4">“{g.title}”</p>
        <ul className="fl-copies">{g.members.map(mem => <li key={mem.id}>
          <span className="fl-copy-name"><b>{mem.source.split(' · ')[0]}</b>{mem.original && <Reveal detail={`The original · first seen ${hhmm(mem.first_seen_at)}`}><span className="fl-chip teal">first</span></Reveal>}</span>
          <span className="fl-faint">{mem.original ? '' : `${Math.round((mem.similarity ?? 0) * 100)}% same`}</span>
          {!mem.original && <span className="fl-bar" aria-hidden="true"><i style={{width: `${Math.round((mem.similarity ?? 0) * 100)}%`}}/></span>}
        </li>)}</ul>
      </section>)}
      <section className="fl-panel fl-leaves" aria-label="What leaves this computer">
        <p className="fl-cap">What leaves this computer<span className="r">all {e.sources}</span></p>
        {/* The counts stay, big enough to fill the column; how each site sees it is on hover. */}
        <Reveal className="fl-safe-rv" detail="Each site sees a visit from this computer’s address, unless its route is Tor. The list of what you follow is never sent. Every request is in the outbound log.">
          <p className={`fl-safe${e.third_party ? ' some' : ''}`}><span className="fl-safe-n">{e.third_party ? e.third_party : '✓ 0'}</span> third-party services</p></Reveal>
        <ul className="fl-routes">
          <li><span>Asked directly</span><b>{e.direct}</b></li>
          {e.tor > 0 && <li><span>Through Tor</span><b>{e.tor}</b></li>}
          {e.public_server > 0 && <li><span>Read a public server</span><b>{e.public_server}</b></li>}
          {e.no_monitor > 0 && <li><span>No monitor</span><b>{e.no_monitor}</b></li>}
        </ul>
      </section>
    </div>
    </>}
  </section>;
}

/** Who you follow says what the story is about (source intake research, source protection). The list is in the case
 *  database, protected at rest by the disk's encryption as ADR-0016 decides; backups are sealed once a passphrase is set
 *  (DECISIONS_LOG 10). A lock mark beside the list's count says which of those holds, the sentence on hover. Only an
 *  unencrypted disk, where the list sits readable on this computer and the person must act, stays on screen as an alert. */
export function ListAtRest(): ReactElement | null {
  const state = useLockStore(s => s.state);
  if (!state) return null;
  const disk = state.disk?.state;
  const diskWords = disk === 'encrypted' || disk === 'encrypting' ? 'the disk is encrypted' : disk === 'not_encrypted' ? 'the disk is not encrypted'
    : 'the app cannot tell whether the disk is encrypted';
  const sealed = state.protection === 'passphrase';
  const words = `This list says what the story is about. On this computer ${diskWords}; backups ${sealed ? 'are encrypted with your passphrase' : 'are not encrypted until you set a passphrase (Settings › Your safety)'}.`;
  if (disk === 'not_encrypted') return <Reveal detail={<>{words} Turn on the disk’s encryption (FileVault, BitLocker or LUKS) to protect it.</>}>
    <span className="fl-atrest warn" role="alert">List not encrypted</span></Reveal>;
  const whole = (disk === 'encrypted' || disk === 'encrypting') && sealed;
  return <Reveal label={whole ? 'Protected at rest' : 'Partly protected at rest'} detail={words}>
    <svg className={`fl-atrest-mark${whole ? ' ok' : ' part'}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg></Reveal>;
}
