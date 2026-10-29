'use client';
// Following (Bring in › Following; mockup FOLLOW_1, ADR-0021): the addresses the case follows, what they found waiting
// for a person, and how a watched page changed. The app watches; a person captures.
//
// Built to Ony's rule of 29 Oct: titles, alerts, numbers and icons show; sub-text is revealed on hover or click. A
// source's kind is its icon and its health a shape and colour, each named on hover or focus; the explanations, times
// and the poll's details are in reveals. The risk on an item (edited, changed, gone) is an alert and always shows.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useMemo, useState} from 'react';
import type {FormEvent, ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {getCapturesQueryKey, getDropQueryKey, getFollowingOptions, getFollowingQueryKey, getVersionsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {captureAll, captureItem, createMonitor, deleteMonitor, pollMonitor, recordRemoval, skipItem, updateMonitor} from '../../lib/generated/sdk.gen';
import type {MonitorItemOut, MonitorOut, MonitorVersionOut, SameStoryOut} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';

type Kind = MonitorOut['kind'];
type Health = MonitorOut['health'];

export const KIND_NAME: Record<Kind, [string, string]> = {
  feed: ['News feed', 'An RSS or Atom feed: each new entry waits here.'],
  sitemap: ['Sitemap', 'The site’s list of its pages: each new address waits here.'],
  page: ['Watched page', 'One page whose text is compared at each look; every version is kept.'],
  podcast: ['Podcast', 'A podcast’s feed: each new episode waits here, with its transcript when the publisher offers one.'],
  youtube: ['YouTube channel', 'A channel’s public feed: each new video waits here. Nothing is downloaded until you capture it.'],
};

export const HEALTH: Record<Health, {word: string; glyph: string; tone: string}> = {
  ok: {word: 'Works', glyph: '●', tone: 'ok'},
  waiting: {word: 'Not looked at yet', glyph: '○', tone: 'quiet'},
  moved: {word: 'Moved', glyph: '↪', tone: 'amber'},
  broken: {word: 'Not working', glyph: '✕', tone: 'bad'},
  blocked: {word: 'Not followed', glyph: '⊘', tone: 'amber'},
  paused: {word: 'Paused', glyph: '‖', tone: 'quiet'},
};

const EVERY: [number, string][] = [[15, '15 min'], [30, '30 min'], [60, 'hourly'], [1440, 'daily']];

const time = (iso?: string | null): string => iso ? apiTime(iso).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '–';
const everyWords = (m: number): string => EVERY.find(([n]) => n === m)?.[1] ?? `${m} min`;
export const sourceName = (m: MonitorOut): string => m.title || m.host;

/** The alerts an item carries, in words short enough to stay on screen. */
export function itemAlerts(item: MonitorItemOut): {word: string; tone: string}[] {
  const out: {word: string; tone: string}[] = [];
  if (item.flags.includes('gone')) out.push({word: `Gone · ${(item.displayed as {http_status?: number}).http_status ?? 404}`, tone: 'bad'});
  if (item.flags.includes('edited')) out.push({word: item.edits > 1 ? `Edited ${item.edits}×` : 'Edited', tone: 'amber'});
  if (item.flags.includes('changed')) {
    const d = item.displayed as {lines_added?: number; lines_removed?: number};
    out.push({word: `Changed +${d.lines_added ?? 0} −${d.lines_removed ?? 0}`, tone: 'amber'});
  }
  return out;
}

export function KindIcon({kind}: {kind: Kind}): ReactElement {
  const paths: Record<Kind, ReactNode> = {
    feed: <><circle cx="4" cy="12" r="1.6"/><path d="M3 7a6 6 0 0 1 6 6M3 3a10 10 0 0 1 10 10" fill="none"/></>,
    sitemap: <><rect x="6" y="2" width="4" height="3"/><rect x="1.5" y="11" width="4" height="3"/><rect x="10.5" y="11" width="4" height="3"/><path d="M8 5v3M3.5 11V8h9v3" fill="none"/></>,
    page: <><path d="M3.5 1.5h6l3 3v10h-9z" fill="none"/><path d="M5.5 7.5h5M5.5 10h5M5.5 12.5h3" fill="none"/></>,
    podcast: <><rect x="6" y="1.5" width="4" height="8" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" fill="none"/></>,
    youtube: <><rect x="1.5" y="3.5" width="13" height="9" rx="2.5" fill="none"/><path d="M6.5 6v4l3.5-2z"/></>,
  };
  return <svg className="fl-kind" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="1.2">{paths[kind]}</svg>;
}

function KindMark({kind, tabbable = false}: {kind: Kind; tabbable?: boolean}): ReactElement {
  const [name, meaning] = KIND_NAME[kind];
  return <Reveal tabbable={tabbable} label={name} detail={<><b>{name}</b><span className="rv-row">{meaning}</span></>}><KindIcon kind={kind}/></Reveal>;
}

function HealthMark({m, tabbable = false}: {m: MonitorOut; tabbable?: boolean}): ReactElement {
  const h = HEALTH[m.health];
  return <Reveal tabbable={tabbable} label={h.word} detail={<>
    <b>{h.word}</b>
    {m.health_reason && <span className="rv-row">{m.health_reason}</span>}
    <span className="rv-row">Last look {time(m.last_checked_at)}{m.http_status ? ` · answered ${m.http_status}` : ''}</span>
    {m.next_check_at && <span className="rv-row">Next look {time(m.next_check_at)} · {everyWords(m.interval_minutes)} · {m.route === 'tor' ? 'through Tor' : 'direct'}</span>}
  </>}><span className={`fl-health ${h.tone}`} aria-hidden="true">{h.glyph}</span></Reveal>;
}

function FollowForm({investigationId, onDone}: {investigationId: string; onDone: (id?: string) => void}): ReactElement {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [every, setEvery] = useState(30);
  const [route, setRoute] = useState<'direct' | 'tor'>('direct');
  const [status, setStatus] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('Looking at it once…');
    try {
      const made = (await createMonitor({path: {investigation_id: investigationId}, body: {url: url.trim(), interval_minutes: every, route, poll: true}, throwOnError: true})).data;
      await queryClient.invalidateQueries({queryKey: getFollowingQueryKey({path: {investigation_id: investigationId}})});
      setUrl('');
      setStatus('');
      onDone(made.id);
    } catch (error) { setStatus(errorMessage(error, 'Could not follow that address')); }
  };
  return <form className="fl-card fl-form" onSubmit={e => void submit(e)} aria-label="Follow something">
    <input type="url" inputMode="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… a feed, sitemap, podcast, channel or page" aria-label="Address to follow"/>
    <div className="fl-chips" role="group" aria-label="Look every">
      {EVERY.map(([n, w]) => <button key={n} type="button" aria-pressed={every === n} className={every === n ? 'on' : ''} onClick={() => setEvery(n)}>{w}</button>)}
    </div>
    <div className="fl-chips" role="group" aria-label="Route">
      <Route value={route} onChange={setRoute}/>
    </div>
    <div className="fl-acts"><button type="submit" className="p">Follow</button><button type="button" onClick={() => onDone()}>Cancel</button></div>
    {status && <p role="status" className="fl-status">{status}</p>}
  </form>;
}

function Route({value, onChange}: {value: 'direct' | 'tor'; onChange: (v: 'direct' | 'tor') => void}): ReactElement {
  return <>{(['direct', 'tor'] as const).map(r => <Reveal key={r} tabbable={false} detail={r === 'direct'
    ? 'The site sees a visit from this computer’s address.'
    : 'Sent through the Tor running on this computer (the app ships none). The site sees a Tor exit address.'}>
    <button type="button" aria-pressed={value === r} className={value === r ? 'on' : ''} onClick={() => onChange(r)}>{r === 'direct' ? 'Direct' : 'Tor'}</button>
  </Reveal>)}</>;
}

function Selected({m, investigationId, onGone}: {m: MonitorOut; investigationId: string; onGone: () => void}): ReactElement {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const refresh = () => queryClient.invalidateQueries({queryKey: getFollowingQueryKey({path: {investigation_id: investigationId}})});
  const act = async (what: string, run: () => Promise<unknown>) => {
    setStatus(what);
    try { await run(); await refresh(); setStatus(''); } catch (error) { setStatus(errorMessage(error, 'That did not work')); }
  };
  const change = (body: Parameters<typeof updateMonitor>[0]['body']) =>
    act('Saving…', () => updateMonitor({path: {monitor_id: m.id}, body, throwOnError: true}));
  const poll = m.last_poll;
  return <section className="fl-card fl-selected" aria-label={`Selected source: ${sourceName(m)}`}>
    <p className="fl-eyebrow"><span>Selected source</span><HealthMark m={m} tabbable/></p>
    <h3><KindMark kind={m.kind} tabbable/> {sourceName(m)}</h3>
    <Reveal detail={<span className="rv-mono">{m.url}</span>}><code className="fl-host">{m.host}</code></Reveal>
    {m.health === 'moved' && m.moved_to && <div className="fl-alert amber" role="status">
      <b>Moved</b> <span className="fl-host">{new URL(m.moved_to).host}</span>
      <button type="button" className="p" onClick={() => void change({url: m.moved_to!})}>Use the new address</button></div>}
    {(m.health === 'broken' || m.health === 'blocked') && m.health_reason && <p className={`fl-alert ${HEALTH[m.health].tone}`} role="status">{m.health_reason}</p>}
    {poll.at && <Reveal detail={<>
      <span className="rv-row">Looked {time(poll.at)}{poll.seconds != null ? ` · ${poll.seconds} s` : ''}</span>
      <span className="rv-row">{poll.not_modified ? 'Nothing new since the visit before (the site said so)' : `Read ${poll.items_seen} · ${poll.items_new} new`}</span>
    </>}><span className="fl-nums"><b>{m.new_items}</b> waiting{m.kind === 'page' && <> · <b>{m.versions}</b> versions</>}</span></Reveal>}
    <div className="fl-chips" role="group" aria-label="Look every">
      {EVERY.map(([n, w]) => <button key={n} type="button" aria-pressed={m.interval_minutes === n} className={m.interval_minutes === n ? 'on' : ''}
        onClick={() => void change({interval_minutes: n})}>{w}</button>)}
    </div>
    <div className="fl-chips" role="group" aria-label="Route"><Route value={m.route} onChange={route => void change({route})}/></div>
    <div className="fl-acts">
      <button type="button" onClick={() => void act('Looking…', () => pollMonitor({path: {monitor_id: m.id}, throwOnError: true}))} disabled={!m.active}>Look now</button>
      <button type="button" onClick={() => void change({active: !m.active})}>{m.active ? 'Pause' : 'Resume'}</button>
      <button type="button" className="danger" onClick={() => void act('Stopping…', async () => { await deleteMonitor({path: {monitor_id: m.id}, throwOnError: true}); onGone(); })}>Stop following</button>
    </div>
    <Reveal className="fl-egress" detail={m.egress}><span>↗ 1 request · {everyWords(m.interval_minutes)} · {m.route === 'tor' ? 'Tor' : 'direct'}</span></Reveal>
    {status && <p role="status" className="fl-status">{status}</p>}
  </section>;
}

function Item({item, kind, investigationId}: {item: MonitorItemOut; kind?: Kind; investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const d = item.displayed as Record<string, string | number | undefined>;
  const copies = item.copies ?? 0;
  const run = async (what: string, call: () => Promise<unknown>) => {
    setStatus(what);
    try {
      await call();
      await Promise.all([queryClient.invalidateQueries({queryKey: getFollowingQueryKey({path: {investigation_id: investigationId}})}),
        queryClient.invalidateQueries({queryKey: getCapturesQueryKey({path: {investigation_id: investigationId}})}),
        queryClient.invalidateQueries({queryKey: getDropQueryKey({path: {investigation_id: investigationId}})})]);
    } catch (error) { setStatus(errorMessage(error, 'That did not work')); }
  };
  return <li className="fl-item">
    <div className="fl-item-main">
      <p className="fl-item-title">
        {kind && <KindMark kind={kind}/>}
        <Reveal detail={<>
          <b>{item.monitor_title}</b>
          <span className="rv-row rv-mono">{item.url}</span>
          {d.published && <span className="rv-row">Posted {String(d.published)} (as the site displays it)</span>}
          <span className="rv-row">First seen {time(item.first_seen_at)}</span>
          {d.audio && <span className="rv-row">Audio file{d.audio_bytes ? ` · ${Math.round(Number(d.audio_bytes) / 1e6)} MB` : ''}</span>}
          {d.transcript && <span className="rv-row">The publisher offers a transcript</span>}
          {d.summary && <span className="rv-row">{String(d.summary).slice(0, 240)}</span>}
          {item.flags.includes('gone') && d.captured_at && <span className="rv-row">You captured it {time(String(d.captured_at))}</span>}
        </>}><span>{item.title || item.url}</span></Reveal>
      </p>
      {(itemAlerts(item).length > 0 || copies > 0) && <p className="fl-alerts">
        {itemAlerts(item).map(a => <span key={a.word} className={`fl-flag ${a.tone}`}>{a.word}</span>)}
        {copies > 0 && <Reveal detail={`${copies} later ${copies === 1 ? 'entry repeats' : 'entries repeat'} this text. They are counted once, with this one, and are listed under Same story.`}>
          <span className="fl-flag teal">+{copies} {copies === 1 ? 'copy' : 'copies'}</span></Reveal>}
      </p>}
      {status && <p role="status" className="fl-status">{status}</p>}
    </div>
    <div className="fl-acts">
      {item.flags.includes('gone')
        ? <Reveal tabbable={false} detail="Records that the site removed this page: your capture is the copy that remains.">
          <button type="button" className="p" onClick={() => void run('Recording…', () => recordRemoval({path: {monitor_item_id: item.id}, body: {}, throwOnError: true}))}>Record removal</button></Reveal>
        : item.capture_blocked
        ? <Reveal tabbable={false} detail={item.capture_blocked}><button type="button" className="p" aria-disabled="true">Capture</button></Reveal>
        : <button type="button" className="p" onClick={() => void run('Capturing…', () => captureItem({path: {monitor_item_id: item.id}, throwOnError: true}))}>Capture</button>}
      <button type="button" onClick={() => void run('Skipping…', () => skipItem({path: {monitor_item_id: item.id}, body: {}, throwOnError: true}))}>Skip</button>
    </div>
  </li>;
}

function CaptureAll({investigationId, count}: {investigationId: string; count: number}): ReactElement {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('Capturing one after another…');
    try {
      const done = (await captureAll({path: {investigation_id: investigationId}, body: {reason: reason.trim()}, throwOnError: true})).data;
      await Promise.all([queryClient.invalidateQueries({queryKey: getFollowingQueryKey({path: {investigation_id: investigationId}})}),
        queryClient.invalidateQueries({queryKey: getCapturesQueryKey({path: {investigation_id: investigationId}})})]);
      setStatus(`${done.captured.length} captured${done.left ? ` · ${done.left} left` : ''}`);
      setOpen(false);
      setReason('');
    } catch (error) { setStatus(errorMessage(error, 'Could not capture them')); }
  };
  if (!open) return <><Reveal tabbable={false} detail="Several at once needs a reason, which goes on each capture in the custody log.">
    <button type="button" onClick={() => setOpen(true)} disabled={!count}>Capture all…</button></Reveal>
    {status && <span role="status" className="fl-status">{status}</span>}</>;
  return <form className="fl-all" onSubmit={e => void submit(e)}>
    <input required minLength={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why all of them" aria-label="Why capture all of them"/>
    <button type="submit" className="p">Capture {Math.min(count, 50)}</button><button type="button" onClick={() => setOpen(false)}>Cancel</button>
    {status && <span role="status" className="fl-status">{status}</span>}
  </form>;
}

function Versions({m}: {m: MonitorOut}): ReactElement {
  const query = useQuery({...getVersionsOptions({path: {monitor_id: m.id}}), enabled: m.kind === 'page', refetchInterval: 30_000});
  const [shown, setShown] = useState<string | null>(null);
  const versions: MonitorVersionOut[] = query.data ?? [];
  if (m.kind !== 'page') return <Reveal detail={`Only a watched page has versions. A ${KIND_NAME[m.kind][0].toLowerCase()}’s entries are in the queue.`}>
    <span className="fl-quiet">–</span></Reveal>;
  if (!versions.length) return <p className="fl-quiet">{query.isPending ? 'Looking…' : 'No version yet'}</p>;
  return <ol className="fl-versions">{versions.map(v => <li key={v.id}>
    <Reveal tabbable={false} detail={<><span className="rv-row">Seen {time(v.seen_at)}</span><span className="rv-row rv-mono">SHA-256 {v.text_sha256.slice(0, 12)}…</span>
      <span className="rv-row">{v.capture_saved ? 'Captured' : v.capture_id ? 'Capture asked for, not saved yet' : 'Seen, not captured'}</span></>}>
      <button type="button" className={`fl-version${shown === v.id ? ' on' : ''}`} aria-expanded={shown === v.id} onClick={() => setShown(shown === v.id ? null : v.id)}>
        <span className={`fl-dot${v.capture_saved ? ' kept' : ''}`} aria-hidden="true"/>
        <b>v{v.number}</b>{v.number > 1 && <span className="fl-delta">+{v.lines_added} −{v.lines_removed}</span>}
      </button>
    </Reveal>
    {shown === v.id && v.changes && <div className="fl-diff">
      {v.changes.removed.map((l, i) => <p key={`r${i}`} className="del">− {l}</p>)}
      {v.changes.added.map((l, i) => <p key={`a${i}`} className="add">+ {l}</p>)}
      {v.number === 1 && <p className="fl-quiet">The first version.</p>}
      {v.changes.more > 0 && <p className="fl-quiet">and {v.changes.more} more lines</p>}
    </div>}
  </li>)}</ol>;
}

function SameStory({stories, names}: {stories: SameStoryOut[]; names: Map<string, string>}): ReactElement | null {
  if (!stories.length) return null;
  return <section className="fl-card" aria-label="Same story">
    <p className="fl-eyebrow"><Reveal detail="Copies restate one text. They do not support each other. Only the earliest is offered for capture.">
      <span>Same story</span></Reveal><b>{stories.length}</b></p>
    <ul className="fl-stories">{stories.slice(0, 3).map(s => <li key={s.original.id}>
      <p className="fl-story-title">{s.original.title || s.original.url}</p>
      <p className="fl-copy first"><span className="fl-name">{names.get(s.original.monitor_id) ?? s.original.monitor_title}</span>
        <Reveal detail={`First seen ${time(s.original.first_seen_at)}`}><span className="fl-flag teal">first</span></Reveal></p>
      {s.copies.map(c => <p key={c.id} className="fl-copy">
        <span className="fl-name">{names.get(c.monitor_id) ?? c.monitor_title}</span>
        <Reveal detail={`${Math.round((c.similarity ?? 0) * 100)}% of the wording is the same · seen ${time(c.first_seen_at)}`}>
          <span className="fl-same"><span className="fl-bar" style={{width: `${Math.round((c.similarity ?? 0) * 100)}%`}}/><b>{Math.round((c.similarity ?? 0) * 100)}%</b></span></Reveal>
      </p>)}
    </li>)}</ul>
  </section>;
}

export function FollowingScreen({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const query = useQuery({...getFollowingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId) && active,
    refetchInterval: active ? 30_000 : false});
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const data = query.data;
  const monitors = useMemo(() => data?.monitors ?? [], [data]);
  const kinds = useMemo(() => new Map(monitors.map(m => [m.id, m.kind])), [monitors]);
  const chosen = monitors.find(m => m.id === picked) ?? monitors[0];
  const counts = data?.counts;
  return <div className="fl">
    <header className="fl-head">
      <h2 className="fl-title">Following</h2>
      {counts && counts.monitors > 0 && <Reveal detail="Works: the source answered at its last look.">
        <span className="fl-count"><b>{counts.working}</b> of <b>{counts.monitors}</b> working</span></Reveal>}
      <Reveal label="About Following" detail="The app watches open sources and lists what is new. It never captures by itself: a person captures, one by one. No account logins anywhere; each site’s robots.txt is obeyed.">
        <span className="fl-info" aria-hidden="true">ⓘ</span></Reveal>
      <button type="button" className="fl-add" onClick={() => setAdding(a => !a)} aria-expanded={adding}>+ Follow something</button>
    </header>
    {query.isError && <p role="alert">{errorMessage(query.error, 'Could not read what this case follows')}</p>}
    <div className="fl-grid">
      <div className="fl-col">
        {adding && <FollowForm investigationId={investigationId} onDone={id => { setAdding(false); if (id) setPicked(id); }}/>}
        <section className="fl-card" aria-label="Sources followed">
          <p className="fl-eyebrow"><span>Sources followed</span><b>{monitors.length}</b></p>
          {monitors.length ? <ul className="fl-sources">{monitors.map(m => <li key={m.id}>
            <button type="button" aria-pressed={m.id === chosen?.id} className={m.id === chosen?.id ? 'on' : ''} onClick={() => setPicked(m.id)}>
              <KindMark kind={m.kind}/><span className="fl-name">{sourceName(m)}</span><HealthMark m={m}/>
              {m.new_items > 0 && <span className="fl-badge" aria-label={`${m.new_items} new`}>{m.new_items}</span>}
            </button></li>)}</ul>
            : <p className="fl-quiet">{query.isPending ? 'Looking…' : 'Nothing followed yet'}</p>}
        </section>
        {chosen && <Selected key={chosen.id} m={chosen} investigationId={investigationId} onGone={() => setPicked(null)}/>}
      </div>

      <div className="fl-col fl-mid">
        <section className="fl-card fl-risk" aria-label="At risk: capture first">
          <Reveal detail="New items waiting for a person, the most at risk first: one a site edited or removed comes before one that is only new.">
            <span className="fl-big"><b>{counts?.waiting ?? 0}</b><span>waiting</span></span></Reveal>
          <CaptureAll investigationId={investigationId} count={counts?.waiting ?? 0}/>
        </section>
        <section className="fl-card fl-queue" aria-label="Most at risk first">
          {data && data.at_risk.length ? <ul className="fl-items">{data.at_risk.map(i =>
            <Item key={i.id} item={i} kind={kinds.get(i.monitor_id)} investigationId={investigationId}/>)}</ul>
            : <p className="fl-quiet">{query.isPending ? 'Looking…' : 'Nothing waiting'}</p>}
        </section>
      </div>

      <div className="fl-col">
        <section className="fl-card" aria-label="Changes and versions">
          <p className="fl-eyebrow"><span>Changes &amp; versions</span>{chosen && <span className="fl-small">{sourceName(chosen)}</span>}</p>
          {chosen ? <Versions m={chosen}/> : <p className="fl-quiet">Nothing chosen</p>}
        </section>
        <SameStory stories={data?.same_story ?? []} names={new Map(monitors.map(m => [m.id, sourceName(m)]))}/>
        {counts && <section className="fl-card" aria-label="What leaves this computer">
          <p className="fl-eyebrow"><span>What leaves this computer</span></p>
          <Reveal detail="Each site is asked directly or through your own Tor; no third-party service is used. The list of what you follow stays on this computer and is never sent. Every look is in Safety & data’s outbound log.">
            <span className="fl-out"><span><b>0</b> third-party services</span><span><b>{counts.direct}</b> direct</span><span><b>{counts.tor}</b> Tor</span></span>
          </Reveal>
        </section>}
      </div>
    </div>
  </div>;
}
