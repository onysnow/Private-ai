'use client';
// Following (Bring in; mockup FOLLOW_1, ADR-0022): the app watches, a person captures. Three columns as the mockup
// draws them. Left: the sources the case follows, each with whether it works today, its schedule and route, and
// how many new items wait; the chosen source below, with its last check, how often it is asked, Direct or Tor, and
// in words what leaves this computer. Middle: how many items wait for a person, Capture all (only with a reason, kept
// in the custody log), and the queue, most at risk first, each with Capture and Skip (Record removal for something
// captured that is now gone). Right: the versions of a followed page and what changed, copies of one story counted
// once, and what leaves this computer for every source together. No account logins anywhere: a closed platform is a
// row with no monitor.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {getFollowingOptions, getFollowingQueryKey, getVersionsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {captureAll, captureItem, checkMonitor, createMonitor, deleteMonitor, recordRemoval, skipItem, undoItem, updateMonitor} from '../../lib/generated/sdk.gen';
import type {FollowingOut, MonitorItemOut, MonitorOut, PageVersionOut} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';

const TAG: Record<MonitorOut['kind'], string> = {feed: 'FEED', sitemap: 'MAP', page: 'PAGE', podcast: 'POD', account: 'OPEN', closed: 'LINK'};
const EVERY: [number, string][] = [[15, '15 min'], [30, '30 min'], [60, 'hourly'], [1440, 'daily'], [10080, 'weekly']];
const everyWord = (m: number) => EVERY.find(([n]) => n === m)?.[1] ?? `${m} min`;
const BULK_REASONS = ['Account is deleting posts', 'Page is being edited now', 'Too many in the same hour'];
const MARK = {ok: '✓', warn: '!', bad: '✕', wait: '·'} as const;
type Tab = 'sources' | 'risk' | 'changes' | 'history';

const hhmm = (iso?: string | null) => (iso ? apiTime(iso).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '');
function when(iso?: string | null): string {
  if (!iso) return '';
  const d = apiTime(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? `${hhmm(iso)} today`
    : d.toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
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
  const [tone, words] = health(m);  // tone: g works, b broken, y other
  const route = m.kind === 'closed' ? 'files you supply' : `${everyWord(m.every_minutes)} · ${m.route}`;
  const badge = m.kind === 'closed' ? <span className="fl-badge z">none</span>
    : m.health === 'broken' || m.health === 'moved' ? <span className="fl-badge bd">fix</span>
      : <span className={`fl-badge${m.waiting ? '' : ' z'}`}>{m.waiting ? `${m.waiting} new` : '0'}</span>;
  return <button type="button" role="option" aria-selected={picked} className="fl-mon" onClick={onPick}>
    <span className={`fl-tag ${m.kind}`}>{TAG[m.kind]}</span>
    <span className="fl-mon-text"><span className="fl-t">{m.name}</span>
      <span className="fl-s"><span className={tone}>{tone === 'g' ? '✓ ' : tone === 'b' ? '✕ ' : '• '}{words}</span> · {route}</span></span>
    {badge}
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
    <p className="fl-cap">Selected source<span className="r"><span className="fl-chip dash">No monitor</span></span></p>
    <h3 className="fl-h3">{m.name}</h3>
    <p className="fl-body">Closed platforms cannot be followed here. The app does not sign in to any account, so it can only capture what a logged-out visitor sees.</p>
    <dl className="fl-kv"><dt>You can</dt><dd>Paste a link: the page is captured logged out. A login wall is recorded as <b>not seen</b>.</dd>
      <dt>Or</dt><dd>Drop files, exports or screenshots you saved. They are kept as files you supplied, with you as the source.</dd></dl>
    <div className="fl-row"><Link className="fl-btn pri sm" href={caseHref('/bring-in#the-drop', investigationId)}>Paste a link</Link>
      <Link className="fl-btn sm" href={caseHref('/bring-in#the-drop', investigationId)}>Drop a file</Link>
      <button type="button" className="fl-btn sm quiet" disabled={Boolean(busy)} onClick={() => void act('stop', () => deleteMonitor({path: {monitor_id: m.id}, throwOnError: true}))}>Remove</button></div>
    {error && <p role="alert" className="fl-error">{error}</p>}
  </section>;
  const works = m.health === 'works';
  return <section className="fl-panel" aria-label="Selected source">
    <p className="fl-cap">Selected source<span className="r">{works ? <span className="fl-chip ok">Works today</span>
      : m.health === 'unchecked' ? <span className="fl-chip dash">Not checked yet</span> : <span className="fl-chip bad">Does not work today</span>}</span></p>
    <h3 className="fl-h3">{m.name}</h3>
    <p className="fl-addr">{m.platform === 'bluesky' ? 'Open protocol · public posts only · no login'
      : m.platform === 'telegram' ? `Public channel · web preview, the latest posts · no login · ${m.url.replace('https://t.me/s/', 't.me/')}` : m.url}</p>
    <ul className="fl-checks">{m.checks.map((c, i) => <li key={i}><span className={`fl-ico ${c.state}`} aria-hidden="true">{MARK[c.state]}</span>{c.text}</li>)}</ul>
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
        <button key={r} type="button" role="radio" aria-checked={m.route === r} disabled={Boolean(busy)} title={r === 'tor' ? 'Through a Tor you run on this computer; the app ships none' : undefined}
          onClick={() => void act('route', () => updateMonitor({path: {monitor_id: m.id}, body: {route: r}, throwOnError: true}))}>{r === 'direct' ? 'Direct' : 'Neutral route'}</button>)}</span>
    </div>
    <div className="fl-egress"><b>Leaves this computer:</b> {m.leaves}</div>
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
  const tag = q.state === 'gone' || q.state === 'removal_recorded' ? 'GONE' : TAG[q.kind as MonitorOut['kind']] ?? q.kind.toUpperCase();
  const audio = q.extra?.audio as {bytes?: number | null} | undefined;
  const meta = [q.source, q.kind === 'page' ? `seen ${hhmm(q.first_seen_at)}` : q.published_at ? `posted ${when(q.published_at)}` : `first seen ${when(q.first_seen_at)}`,
    ...(audio?.bytes ? [`audio file ${Math.round(audio.bytes / (1024 * 1024))} MB`] : []),
    ...(q.decision?.by && q.state !== 'waiting' && q.state !== 'gone' ? [`${q.state === 'skipped' ? 'skipped' : 'by'} ${q.decision.by}`] : [])];
  let acts: ReactElement;
  if (q.state === 'waiting' || q.state === 'gone') acts = <>
    <button type="button" className="fl-btn pri sm" onClick={() => onDo(q, q.state === 'gone' ? 'removal' : 'capture')}>{q.state === 'gone' ? 'Record removal' : 'Capture'}</button>
    <button type="button" className="fl-btn sm" onClick={() => onDo(q, 'skip')}>Skip</button></>;
  else if (q.state === 'capturing') acts = <span className="fl-chip teal">Capturing…</span>;
  else if (q.state === 'saved') acts = <><span className="fl-chip ok">Saved</span>
    <Link className="fl-btn sm" href={caseHref('/bring-in#the-drop', investigationId)}>Receipt</Link></>;
  else if (q.state === 'not_saved') acts = <span className="fl-chip bad">Not kept</span>;
  else if (q.state === 'removal_recorded') acts = <span className="fl-chip ok">Recorded as gone</span>;
  else acts = <><span className="fl-chip dash">Skipped</span><button type="button" className="fl-btn sm" onClick={() => onDo(q, 'undo')}>Undo</button></>;
  return <li className={`fl-qi${q.state === 'skipped' ? ' skip' : ''}${['saved', 'removal_recorded'].includes(q.state) ? ' done' : ''}`}>
    <div className="fl-qi-text"><p className="fl-qt">{q.title}</p><p className="fl-qs"><span className="fl-faint">{tag}</span> · {meta.join(' · ')}</p></div>
    <div className="fl-acts">{acts}</div>
    <div className="fl-why">{q.risks.map(r => <span key={r.text} className={`fl-chip ${r.tone}`}>{r.text}</span>)}
      {typeof q.decision?.reason === 'string' && <span className="fl-note">{q.decision.reason}</span>}</div>
  </li>;
}

function Versions({monitor}: {monitor: MonitorOut | undefined}): ReactElement {
  const versions = useQuery({...getVersionsOptions({path: {monitor_id: monitor?.id ?? ''}}), enabled: Boolean(monitor)});
  const [open, setOpen] = useState(false);
  if (!monitor) return <section className="fl-panel" aria-label="Changes and versions">
    <p className="fl-cap">Changes &amp; versions</p>
    <p className="fl-note">Follow a page to keep every version of its main text and see what changed.</p></section>;
  const rows: PageVersionOut[] = versions.data ?? [];
  const latest = rows[0];
  return <section className="fl-panel" aria-label="Changes and versions">
    <p className="fl-cap">Changes &amp; versions<span className="r">{monitor.name.split(' · ')[0]}</span></p>
    {!rows.length ? <p className="fl-note">{versions.isPending ? 'Reading the versions…' : 'Not read yet.'}</p> : <ol className="fl-vers">{rows.map(v => {
      const lines = v.diff.filter(d => d.startsWith('-')).map(d => d.slice(1)).slice(0, 2);
      return <li key={v.id} className={v.captured ? 'cap' : v.number === 1 ? 'seen' : 'new'}>
        <span className="fl-vdot" aria-hidden="true"/>
        <p className="fl-mono fl-faint">{when(v.seen_at)} · {v.captured ? 'captured' : 'seen, not captured'}</p>
        {v.number === 1 ? <p><b>Version 1</b> <span className="fl-mono">SHA-256 {v.sha256.slice(0, 4)} {v.sha256.slice(4, 8)} …{v.sha256.slice(-4)}</span></p>
          : <p><b>Text changed: {v.lines_changed} line{v.lines_changed === 1 ? '' : 's'}.</b>{lines.length ? ` Gone: “${lines.join(' ')}”` : ''}</p>}
        {v.layout_changes.length > 0 && <p className="fl-note">Layout changed {v.layout_changes.length} time{v.layout_changes.length === 1 ? '' : 's'} since, text the same. No new capture needed.</p>}
      </li>;
    })}</ol>}
    {latest && latest.number > 1 && <div className="fl-row">
      <button type="button" className="fl-btn sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>See what changed</button>
      <span className="fl-note">Compares the page&apos;s main text. Every version you capture is kept.</span></div>}
    {open && latest && <pre className="fl-diff" aria-label="What changed">{latest.diff.map((d, i) =>
      <span key={i} className={d.startsWith('-') ? 'del' : 'add'}>{d}{'\n'}</span>)}</pre>}
  </section>;
}

function FollowForm({investigationId, onDone}: {investigationId: string; onDone: (m: MonitorOut | null) => void}): ReactElement {
  const [target, setTarget] = useState('');
  const [route, setRoute] = useState<'direct' | 'tor'>('direct');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    setBusy(true); setError('');
    try {
      const made = (await createMonitor({path: {investigation_id: investigationId}, body: {target: target.trim(), route}, throwOnError: true})).data;
      onDone(made);
    } catch (err) { setError(errorMessage(err, 'That could not be followed')); } finally { setBusy(false); }
  };
  return <form className="fl-panel fl-follow" onSubmit={e => void submit(e)} aria-label="Follow something">
    <p className="fl-cap">Follow something</p>
    <label className="fl-note" htmlFor="fl-target">A web address (a news feed, sitemap, podcast or page), a Bluesky handle (@name.bsky.social), a Mastodon account (@name@server) or a public Telegram channel (t.me/name)</label>
    <input id="fl-target" className="fl-input" value={target} onChange={e => setTarget(e.target.value)} placeholder="https://…, @handle or t.me/channel" autoFocus/>
    <div className="fl-row wrap"><span className="fl-note">Route</span>
      <span className="fl-rad" role="radiogroup" aria-label="Route">{(['direct', 'tor'] as const).map(r =>
        <button key={r} type="button" role="radio" aria-checked={route === r} onClick={() => setRoute(r)}>{r === 'direct' ? 'Direct' : 'Neutral route'}</button>)}</span></div>
    <p className="fl-note">The address is asked once to see what it is. Closed platforms (X, Instagram, Facebook, TikTok, LinkedIn, Telegram groups and private channels…) get a row with no monitor: the app never signs in.</p>
    <div className="fl-row"><button type="submit" className="fl-btn pri sm" disabled={busy || !target.trim()}>{busy ? 'Asking…' : 'Follow'}</button>
      <button type="button" className="fl-btn sm" onClick={() => onDone(null)}>Cancel</button></div>
    {error && <p role="alert" className="fl-error">{error}</p>}
  </form>;
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
      {([['sources', 'Sources'], ['risk', 'At risk'], ['changes', 'Changes'], ['history', 'History']] as [Tab, string][]).map(([t, label]) =>
        <button key={t} type="button" className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{label}</button>)}
      <span className="fl-live"><i aria-hidden="true"/>{data.working} of {data.followed} working today</span>
    </nav>
    <header className="fl-title"><h1>Following</h1><p>The app watches. A person captures. No account logins anywhere.</p>
      <button type="button" className="fl-btn" aria-expanded={adding} onClick={() => setAdding(a => !a)}>+ Follow something</button></header>

    <div className="fl-left">
      {adding && <FollowForm investigationId={investigationId} onDone={m => { setAdding(false); if (m) { setPicked(m.id); void refresh(); } }}/>}
      <section className="fl-panel" aria-label="Sources followed">
        <p className="fl-cap">Sources followed<span className="r">{monitors.length}{monitors.some(m => m.last_checked_at) ? ` · health checked ${hhmm(monitors.map(m => m.last_checked_at ?? '').sort().at(-1))}` : ''}</span></p>
        {!monitors.length ? <p className="fl-note">Nothing is followed yet. Follow a news feed, a sitemap, a page, a podcast or a public account; what they publish waits here for you.</p>
          : <div role="listbox" aria-label="Sources" className="fl-mons">{monitors.map(m =>
            <SourceRow key={m.id} m={m} picked={m.id === selected?.id} onPick={() => setPicked(m.id)}/>)}</div>}
      </section>
      {selected && <SelectedSource m={selected} investigationId={investigationId} onChanged={refresh}/>}
    </div>

    <div className="fl-mid">
      {tab === 'changes' ? <Versions monitor={page}/> : <>
        <section className="fl-panel fl-risk" aria-label="At risk, capture first">
          <p className="fl-cap">At risk · capture first</p>
          <div className="fl-risk-body"><span className="fl-big" aria-label={`${waitingAll} waiting`}>{waitingAll}</span>
            <div><h3 className="fl-h3">{waitingAll ? 'New items waiting for a person' : 'Nothing waits'}</h3>
              <p className="fl-body">Following never saves anything by itself. Capture one by one: that is the default. Several at once needs a reason, which goes in the custody log.</p></div>
            <button type="button" className="fl-btn" aria-expanded={bulk} disabled={!waitingAll} onClick={() => setBulk(b => !b)}>Capture all…</button></div>
          {bulk && <div className="fl-bulk">
            <label htmlFor="fl-why" className="fl-body">Capture {waitingAll} item{waitingAll === 1 ? '' : 's'} at once. Why not one by one?</label>
            <div className="fl-row wrap">{BULK_REASONS.map(r => <button key={r} type="button" className="fl-btn sm" onClick={() => setWhy(r)}>{r}</button>)}</div>
            <textarea id="fl-why" className="fl-input" rows={2} value={why} onChange={ev => setWhy(ev.target.value)}/>
            <div className="fl-row"><button type="button" className="fl-btn sm" onClick={() => setBulk(false)}>Cancel</button>
              <button type="button" className="fl-btn pri sm" disabled={why.trim().length < 8} onClick={() => void doBulk()}>Capture all</button></div>
          </div>}
        </section>
        <section className="fl-panel fl-queue" aria-label={tab === 'history' ? 'What was decided' : 'Most at risk first'}>
          <p className="fl-cap">{tab === 'history' ? 'Decided this week' : 'Most at risk first'}<span className="r">Captured: {data.captured} · Skipped: {data.skipped}</span></p>
          {notice && <p role="status" className="fl-note">{notice}</p>}
          {!queue.length ? <p className="fl-note">{tab === 'history' ? 'Nothing decided this week.' : tab === 'risk' ? 'Nothing at risk waits.' : 'Nothing waits for you.'}</p>
            : <ul className="fl-qlist">{queue.map(q => <QueueItem key={q.id} q={q} investigationId={investigationId} onDo={(i, a) => void onDo(i, a)}/>)}</ul>}
        </section>
      </>}
    </div>

    <div className="fl-right">
      {tab !== 'changes' && <Versions monitor={page}/>}
      {data.copies.slice(0, 2).map(g => <section key={g.id} className="fl-panel" aria-label="Same story, copies">
        <p className="fl-cap">Same story, {g.count} copies<span className="r">counted once</span></p>
        <p className="fl-h4">“{g.title}”</p>
        <ul className="fl-copies">{g.members.map(mem => <li key={mem.id}>
          <span className="fl-copy-name"><b>{mem.source.split(' · ')[0]}</b>{mem.original && <span className="fl-chip teal">first seen {hhmm(mem.first_seen_at)}</span>}</span>
          <span className="fl-faint">{mem.original ? 'original' : `${Math.round((mem.similarity ?? 0) * 100)}% same`}</span>
          {!mem.original && <span className="fl-bar" aria-hidden="true"><i style={{width: `${Math.round((mem.similarity ?? 0) * 100)}%`}}/></span>}
        </li>)}</ul>
        <p className="fl-note">Copies restate one text. They do not support each other. Only the earliest is offered for capture.</p>
      </section>)}
      <section className="fl-panel" aria-label="What leaves this computer">
        <p className="fl-cap">What leaves this computer<span className="r">all {e.sources}</span></p>
        <p className="fl-safe"><b>✓ {e.third_party} third-party services.</b> {e.direct} source{e.direct === 1 ? ' is' : 's are'} asked directly
          {e.tor ? `, ${e.tor} through Tor` : ''}{e.public_server ? `, ${e.public_server} read${e.public_server === 1 ? 's' : ''} a public server` : ''}
          {e.no_monitor ? `, ${e.no_monitor} ha${e.no_monitor === 1 ? 's' : 've'} no monitor` : ''}.</p>
        <p className="fl-note">Each site sees a visit from this computer&apos;s address, unless its route is Tor. The list of what you follow is never sent. Every request is in the outbound log.</p>
      </section>
    </div>
  </section>;
}
