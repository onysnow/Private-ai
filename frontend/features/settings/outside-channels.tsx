'use client';
// Settings › Notifications › Outside the app (docs/project-notes/PLATFORM_NEEDS_PLAN.md, part 5):
// email, a phone through ntfy, and this browser through Web Push. Each says what it would send
// (the kind and how many, never a name, a case or text from the records), is off until it is
// set, and has a Test. Email needs the server's mail account (NOTIFY_MAIL_URL); Web Push needs
// NOTIFY_PUSH_SUBJECT: when the server has neither, the card says so instead of offering it.
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {
  addPushSubscriptionMutation, getNotificationPrefsQueryKey, putNotificationChannelMutation, removePushSubscriptionMutation,
  testNotificationChannelMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {NotificationPrefsOut} from '../../lib/generated/types.gen';

type Channel = 'email' | 'phone' | 'webpush';
type Mode = 'off' | 'interrupts' | 'daily';
const MODE_WORDS: Record<Mode, string> = {off: 'Off', interrupts: 'Textbook Red Flags', daily: 'Once a day'};

/** A VAPID public key (base64url) as the bytes pushManager.subscribe wants. */
export function keyBytes(key: string): Uint8Array {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function browserSubscription(key: string): Promise<PushSubscription> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser cannot receive Web Push.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('The browser was not allowed to show notifications, so this stays off.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  const existing = await registration.pushManager.getSubscription();
  return existing ?? registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource});
}

async function dropBrowserSubscription(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

export function OutsideChannels({prefs}: {prefs: NotificationPrefsOut}): ReactElement {
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<Partial<Record<Channel, string>>>({});
  const [tested, setTested] = useState<Partial<Record<Channel, string>>>({});
  const [address, setAddress] = useState(prefs.outside.email?.address ?? '');
  const [url, setUrl] = useState(prefs.outside.phone?.url ?? '');
  const [busy, setBusy] = useState<Channel | null>(null);
  const keep = (data: NotificationPrefsOut) => queryClient.setQueryData(getNotificationPrefsQueryKey(), data);
  const save = useMutation({...putNotificationChannelMutation(), onSuccess: keep});
  const test = useMutation(testNotificationChannelMutation());
  const addPush = useMutation({...addPushSubscriptionMutation(), onSuccess: keep});
  const removePush = useMutation({...removePushSubscriptionMutation(), onSuccess: keep});

  const say = (channel: Channel, words: string) => setProblem(p => ({...p, [channel]: words}));
  const mode = (channel: Channel): Mode => (prefs.outside[channel]?.mode ?? 'off') as Mode;

  async function choose(channel: Channel, next: Mode): Promise<void> {
    setBusy(channel);
    say(channel, '');
    setTested(t => ({...t, [channel]: ''}));
    try {
      if (channel === 'webpush') {
        if (next !== 'off') {
          const sub = (await browserSubscription(prefs.server.webpush_key ?? '')).toJSON();
          await addPush.mutateAsync({body: {endpoint: sub.endpoint ?? '', keys: {p256dh: sub.keys?.p256dh ?? '', auth: sub.keys?.auth ?? ''},
            label: navigator.platform || null}});
        } else {
          const endpoint = await dropBrowserSubscription();
          if (endpoint) await removePush.mutateAsync({body: {endpoint}});
        }
      }
      await save.mutateAsync({path: {channel}, body: {mode: next, address: channel === 'email' ? address.trim() : null, url: channel === 'phone' ? url.trim() : null}});
    } catch (error) {
      say(channel, errorMessage(error, 'Could not save that. Nothing changed.'));
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(channel: Channel): Promise<void> {
    setBusy(channel);
    say(channel, '');
    try {
      const out = await test.mutateAsync({path: {channel}});
      setTested(t => ({...t, [channel]: out.sent ? 'Sent. If it does not arrive in a minute, check the address.' : 'Nothing was sent: this way is off.'}));
    } catch (error) {
      say(channel, errorMessage(error, 'The test did not go out.'));
    } finally {
      setBusy(null);
    }
  }

  const seg = (channel: Channel, modes: Mode[], disabled: boolean) =>
    <span className="ap-seg" role="radiogroup" aria-label={`${channel === 'webpush' ? 'This browser' : channel === 'email' ? 'Email' : 'Phone'}: what it sends`}>
      {modes.map(m => <button key={m} type="button" role="radio" aria-checked={mode(channel) === m} className={mode(channel) === m ? 'on' : ''}
        disabled={disabled || busy === channel} onClick={() => mode(channel) !== m && void choose(channel, m)}>{MODE_WORDS[m]}</button>)}
    </span>;
  const foot = (channel: Channel) => <>
    {mode(channel) !== 'off' && <button type="button" className="st-link" disabled={busy === channel} onClick={() => void sendTest(channel)}>Send a test</button>}
    {tested[channel] && <p className="st-hint" role="status">{tested[channel]}</p>}
    {problem[channel] && <p className="st-problem" role="alert">{problem[channel]}</p>}
  </>;

  return <section className="ap-pane" aria-labelledby="nt-outside">
    <div className="ap-pane-head"><h2 id="nt-outside">Outside the app</h2><span>the kind and how many; never a name, a case or a quote</span></div>

    <div className="st-route st-channel">
      {/* What a channel sends is revealed on its name; a channel the server cannot use says so, written out. */}
      <span className="st-route-what">{prefs.server.email ? <Reveal detail="A Textbook Red Flag as it happens, or once a day what is waiting (after 07:00 UTC)."><b>Email</b></Reveal>
        : <><b>Email</b><small>This server has no mail account. Whoever runs it sets NOTIFY_MAIL_URL (a mailtos:// address) in its environment file.</small></>}</span>
      {prefs.server.email && <>
        <input aria-label="Your email address" type="email" className="st-input st-channel-input" placeholder="you@newsroom.org" autoComplete="email" value={address}
            onChange={e => setAddress(e.target.value)} disabled={busy === 'email'}/>
        {seg('email', ['off', 'interrupts', 'daily'], false)}
        {mode('email') !== 'off' && address.trim() !== (prefs.outside.email?.address ?? '') &&
          <button type="button" className="ap-btn" disabled={busy === 'email'} onClick={() => void choose('email', mode('email'))}>Save the address</button>}
      </>}
      {foot('email')}
    </div>

    <div className="st-route st-channel">
      <span className="st-route-what"><Reveal detail="A Textbook Red Flag as it happens, on the ntfy app. Use your newsroom’s ntfy server, or on ntfy.sh a long random topic: anyone who guesses it can read it.">
        <b>Phone, through ntfy</b></Reveal></span>
      <input aria-label="Your ntfy address" type="text" className="st-input st-mono st-channel-input" placeholder="ntfys://ntfy.sh/a-long-random-topic" spellCheck={false} value={url}
          onChange={e => setUrl(e.target.value)} disabled={busy === 'phone'}/>
      {seg('phone', ['off', 'interrupts'], false)}
      {mode('phone') !== 'off' && url.trim() !== (prefs.outside.phone?.url ?? '') &&
        <button type="button" className="ap-btn" disabled={busy === 'phone'} onClick={() => void choose('phone', mode('phone'))}>Save the address</button>}
      {foot('phone')}
    </div>

    <div className="st-route st-channel">
      <span className="st-route-what">{prefs.server.webpush ? <><Reveal detail="Web Push, through the browser maker’s push service."><b>This browser, even when the Workbench is closed</b></Reveal>
        <small>{prefs.push_devices ? `${prefs.push_devices} browser${prefs.push_devices === 1 ? '' : 's'} signed up` : 'No browser signed up yet'}</small></>
        : <><b>This browser, even when the Workbench is closed</b>
        <small>This server cannot send Web Push yet. Whoever runs it sets NOTIFY_PUSH_SUBJECT (mailto: or https:) in its environment file.</small></>}</span>
      {prefs.server.webpush && seg('webpush', ['off', 'interrupts'], !prefs.server.webpush_key)}
      {foot('webpush')}
    </div>
    <p className="st-hint">Each notice leaves this server for the service that carries it: your mail provider, the ntfy server, or the browser maker. They see that the Workbench told you something, and when.</p>
  </section>;
}
