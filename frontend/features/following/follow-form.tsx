'use client';
// Following something: the form (an address or account, or a newsletter mailbox) and the screen a case shows before it
// follows anything. The empty screen is the form, large: paste a link and Follow. The kinds of source that can be
// followed are their marks; a mark names itself on hover and, chosen, shows an example address in the field (the
// mailbox mark switches to the mailbox form). How following works is three marks, its sentence on hover.
import {useState} from 'react';
import type {FormEvent, ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {createMailboxMonitor, createMonitor} from '../../lib/generated/sdk.gen';
import type {MonitorOut} from '../../lib/generated/types.gen';
import {KIND_NAME, KindIcon} from './marks';
import type {SourceKind} from './marks';

/** What to paste for each kind, shown in the field when its mark is chosen. */
export const EXAMPLE: Record<SourceKind, string> = {
  feed: 'https://outlet.example/feed.xml',
  sitemap: 'https://outlet.example/sitemap.xml',
  page: 'https://registry.example/company/1234',
  podcast: 'https://show.example/podcast.rss',
  account: '@name.bsky.social, @name@server or t.me/channel',
  closed: 'https://x.com/… (captured logged out, no monitor)',
  mailbox: '',
};
const ORDER: SourceKind[] = ['feed', 'page', 'sitemap', 'podcast', 'account', 'mailbox', 'closed'];

export function FollowForm({investigationId, onDone, hero = false, kind}: {investigationId: string; onDone: (m: MonitorOut | null) => void;
  hero?: boolean; kind?: SourceKind}): ReactElement {
  const [target, setTarget] = useState('');
  const [route, setRoute] = useState<'direct' | 'tor'>('direct');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mail, setMail] = useState<null | {host: string; user: string; password: string; sender: string}>(
    kind === 'mailbox' ? {host: '', user: '', password: '', sender: ''} : null);
  const mailReady = Boolean(mail && mail.host.trim() && mail.user.trim() && mail.password && mail.sender.trim());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mail ? !mailReady : !target.trim()) return;
    setBusy(true); setError('');
    try {
      const made = mail
        ? (await createMailboxMonitor({path: {investigation_id: investigationId}, throwOnError: true,
          body: {host: mail.host.trim(), user: mail.user.trim(), password: mail.password, sender: mail.sender.trim()}})).data
        : (await createMonitor({path: {investigation_id: investigationId}, body: {target: target.trim(), route}, throwOnError: true})).data;
      onDone(made);
    } catch (err) { setError(errorMessage(err, 'That could not be followed')); } finally { setBusy(false); }
  };
  const field = (key: 'host' | 'user' | 'password' | 'sender', label: string, hint: string) => mail &&
    <label className="fl-note fl-mail">{label}<input className="fl-input" type={key === 'password' ? 'password' : 'text'} autoComplete="off"
      value={mail[key]} placeholder={hint} onChange={e => setMail({...mail, [key]: e.target.value})}/></label>;
  const follow = <button type="submit" className={`fl-btn pri${hero ? '' : ' sm'}`} disabled={busy || (mail ? !mailReady : !target.trim())}>{busy ? 'Asking…' : 'Follow'}</button>;
  return <form className={hero ? 'fl-follow fl-hero' : 'fl-panel fl-follow'} onSubmit={e => void submit(e)} aria-label="Follow something">
    {!hero && <p className="fl-cap">Follow something</p>}
    {!hero && <span className="fl-rad" role="radiogroup" aria-label="What to follow">
      <button type="button" role="radio" aria-checked={!mail} onClick={() => setMail(null)}>An address or account</button>
      <button type="button" role="radio" aria-checked={Boolean(mail)} onClick={() => setMail(m => m ?? {host: '', user: '', password: '', sender: ''})}>A newsletter mailbox</button>
    </span>}
    {mail ? <>
      {/* Why a mailbox kept for newsletters, and what the app does and never does with it, are on hover. */}
      <p className="fl-note"><Reveal detail={<>Subscribe with a mailbox kept for newsletters, never your own: the sender learns that address. The app reads it over IMAP with TLS,
        never marks a message read and never loads the images in it, so tracking pixels learn nothing. The password stays in a file on this computer, not in the case or a backup.</>}>
        A mailbox kept for newsletters, never your own</Reveal></p>
      <div className={hero ? 'fl-mail-grid' : undefined}>
        {field('host', 'Mail server', 'imap.example.net')}
        {field('user', 'User name', 'newsletters@example.net')}
        {field('password', 'Password (an app password where the provider has them)', '')}
        {field('sender', 'The sender to follow', 'news@outlet.example or @outlet.example')}
      </div>
    </> : <>
    <label className={hero ? 'st-sr' : 'fl-note'} htmlFor="fl-target"><Reveal tabbable={false} detail="A web address (a news feed, sitemap, podcast or page), a Bluesky handle (@name.bsky.social), a Mastodon account (@name@server) or a public Telegram channel (t.me/name).">
      A web address or a public account</Reveal></label>
    <div className={hero ? 'fl-paste' : undefined}>
      <input id="fl-target" className="fl-input" value={target} onChange={e => setTarget(e.target.value)}
        placeholder={kind && EXAMPLE[kind] ? EXAMPLE[kind] : 'Paste a link: https://…, @handle or t.me/channel'} autoFocus={!hero}/>
      {hero && follow}
    </div>
    <div className="fl-row wrap"><span className="fl-note">Route</span>
      <span className="fl-rad" role="radiogroup" aria-label="Route">{(['direct', 'tor'] as const).map(r =>
        <button key={r} type="button" role="radio" aria-checked={route === r} onClick={() => setRoute(r)}>{r === 'direct' ? 'Direct' : 'Neutral route'}</button>)}</span>
      {/* What leaves this computer stays as one line; the sentence is on hover. */}
      <Reveal className="fl-egress" detail="The address is asked once to see what it is. Closed platforms (X, Instagram, Facebook, TikTok, LinkedIn, Telegram groups and private channels…) get a row with no monitor: the app never signs in.">
        <span>↗ asked once · no login</span></Reveal>
    </div>
    </>}
    {(!hero || mail) && <div className="fl-row">{follow}{!hero && <button type="button" className="fl-btn sm" onClick={() => onDone(null)}>Cancel</button>}</div>}
    {error && <p role="alert" className="fl-error">{error}</p>}
  </form>;
}

const STEP_PATHS: Record<'watch' | 'wait' | 'capture', ReactNode> = {
  watch: <><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" fill="none"/><circle cx="8" cy="8" r="2"/></>,
  wait: <><path d="M1.5 9.5l2-6h9l2 6v4h-13z" fill="none"/><path d="M1.5 9.5h4l1 1.5h3l1-1.5h4" fill="none"/></>,
  capture: <><rect x="1.5" y="4" width="13" height="9.5" rx="1.5" fill="none"/><circle cx="8" cy="8.7" r="2.6" fill="none"/><path d="M5.5 4l1-2h3l1 2" fill="none"/></>,
};
const STEPS: ['watch' | 'wait' | 'capture', string, string][] = [
  ['watch', 'It watches', 'On a schedule you choose, the app asks each source “anything new since my last visit?”, politely, honouring robots.txt, every request in the outbound log.'],
  ['wait', 'New items wait', 'What it finds waits here, most at risk first: an account deleting posts, an article edited since it was seen, a page changed since you captured it.'],
  ['capture', 'You capture', 'Nothing is kept by itself. You capture one by one; several at once needs a reason, which goes in the custody log.'],
];

/** The screen of a case that follows nothing yet: paste a link, the kinds that can be followed, how it works. */
export function EmptyFollowing({investigationId, onDone, atRest}: {investigationId: string; onDone: (m: MonitorOut | null) => void;
  atRest?: ReactNode}): ReactElement {
  const [kind, setKind] = useState<SourceKind | undefined>(undefined);
  return <section className="fl-empty" aria-label="Follow a first source">
    <div className="fl-empty-main">
      <p className="fl-cap">Follow a source</p>
      <h2 className="fl-empty-h"><Reveal detail="The app watches. A person captures. No account logins anywhere.">Paste a link. The app watches it for you.</Reveal></h2>
      <FollowForm key={kind === 'mailbox' ? 'mail' : 'web'} investigationId={investigationId} onDone={onDone} hero kind={kind}/>
      <p className="fl-cap fl-kinds-cap">What can be followed</p>
      <div className="fl-kinds" role="radiogroup" aria-label="What can be followed">
        {ORDER.map(k => <Reveal key={k} tabbable={false} detail={<><b>{KIND_NAME[k][0]}</b><span className="rv-row">{KIND_NAME[k][1]}</span></>}>
          <button type="button" role="radio" aria-checked={kind === k} aria-label={KIND_NAME[k][0]} className={`fl-kind-tile${k === 'closed' ? ' closed' : ''}`}
            onClick={() => setKind(c => (c === k ? undefined : k))}><KindIcon kind={k}/></button></Reveal>)}
      </div>
      {atRest}
    </div>
    <ol className="fl-steps" aria-label="How following works">
      {STEPS.map(([key, title, words], i) => <li key={key}>
        <svg className="fl-step-ico" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="1.1">{STEP_PATHS[key]}</svg>
        <span className="fl-step-n" aria-hidden="true">{i + 1}</span>
        <Reveal detail={words}><span className="fl-step-t">{title}</span></Reveal>
      </li>)}
    </ol>
  </section>;
}
