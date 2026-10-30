'use client';
// Keep › Access (30 Oct; ADR-0016, mockups ACCOUNT_2 and KEEP's "Who can reach it"): who can reach this case and how.
// The people and their keys fill the left (the same People and access table as Settings, so a role or a key changes in
// either place); the right is the ways in, each a big word with its mark: the network (only this computer, or devices
// with a key), the app lock, the refusals of the last day, whether backups are sealed. Below them the server's setup as
// marks (each value revealed on its mark), the stray files as one quiet action (Safety & data's "Look at them" opens
// here), and the settings that change each of these. The page never scrolls; the people scroll inside their panel.
// Sweep 30 Oct: the server's setup moved under the people (that column was empty below them, and the right one ran off
// the screen); the ways in share the right column's height, each a bigger word.
import Link from 'next/link';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {useLockStore} from '../../lib/app-lock';
import type {SettingsStatusOut} from '../../lib/generated/types.gen';
import {PeoplePane} from '../lock/people-pane';
import {denialWords, ServerStatus, StrayFiles} from './security-panel';

type Props = {investigationId: string; caseName?: string; settingsStatus: SettingsStatusOut};

/** One way in: its mark, a big word, a reveal with the detail, and the setting that changes it. */
function Door({eyebrow, mark, word, detail, href, go, tone}: {eyebrow: string; mark: string; word: string; detail: string; href: string; go: string;
  tone?: 'open' | 'shut' | 'alert'}): ReactElement {
  return <li className={`ax-door${tone ? ` ax-${tone}` : ''}`}>
    <span className="ax-mark" aria-hidden="true">{mark}</span>
    <span className="ax-body">
      <span className="sd-eyebrow">{eyebrow}</span>
      <Reveal detail={detail}><strong className="ax-word">{word}</strong></Reveal>
    </span>
    <Link className="ax-go" href={href}>{go} ›</Link>
  </li>;
}

export function AccessScreen({investigationId, caseName, settingsStatus}: Props): ReactElement {
  const lock = useLockStore(s => s.state);
  const local = settingsStatus.access.mode === 'local_only';
  const sec = settingsStatus.security;
  const connectors = Object.values(settingsStatus.connectors);
  const keysSet = connectors.filter(c => c.configured).length;
  const passphrase = lock?.protection === 'passphrase';
  const lockDetail = !lock ? 'The lock state could not be read from the server.'
    : passphrase ? [`Opens with the passphrase${lock.pin ? ' (or the quick PIN)' : ''}`, lock.idle_minutes ? `locks after ${lock.idle_minutes} min away` : 'no idle lock',
      lock.lock_on_hide ? 'locks on Hide screen' : '', lock.lock_on_sleep ? 'locks when the computer sleeps' : '',
      lock.locked_cases?.length ? `${lock.locked_cases.length} case(s) with a lock of their own` : ''].filter(Boolean).join(' · ')
      : 'Anyone at this computer can open the app. Lock it with a passphrase in Settings › Your safety.';

  // The server's setup sits under the people (filling that column); the ways in fill the right column on their own.
  const setup = <div className="lk-panel ax-setup">
    <p className="sd-eyebrow">This server</p>
    <ServerStatus settingsStatus={settingsStatus} denials={false}/>
    <p className="sd-eyebrow ax-house">Housekeeping</p>
    <StrayFiles label="Look at stray files"/>
  </div>;

  return <div className="sd ax">
    <header className="sd-head">
      <h2 className="sd-title"><Reveal detail="Who can reach this case, by role and key; how the app is locked; and what the server is set up with. Nothing here leaves this computer.">
        <span>Who can reach <em>{caseName || 'this case'}</em>, and how</span></Reveal></h2>
      <span className={`sd-chip${local ? '' : ' sd-chip-out'}`}>{local ? '⌂ only this computer' : '↗ devices with a key'}</span>
    </header>

    <div className="ax-grid">
      <section className="ax-people" aria-label="People and access keys">
        {investigationId ? <PeoplePane investigationId={investigationId} caseName={caseName ?? ''} networkOn={!local}
          onAccess={() => { window.location.assign('/settings#access'); }} below={setup}/>
          : <><p className="sd-quiet">Open a case to see who can reach it.</p>{setup}</>}
      </section>

      <aside className="ax-side" aria-label="Ways in">
        <ul className="ax-doors">
          <Door eyebrow="Network" mark={local ? '⌂' : '↗'} word={local ? 'Only this computer' : 'Devices with a key'} tone={local ? 'shut' : 'open'}
            detail={`API access: ${local ? 'local only: no other device reaches the app' : 'shared: another device needs a person’s key or the bearer token'} · token configured: ${settingsStatus.access.token_configured ? 'yes' : 'no'}`}
            href="/settings#access" go="Access and token"/>
          <Door eyebrow="App lock" mark={passphrase ? '🔒' : '○'} word={!lock ? 'Unknown' : passphrase ? 'Passphrase' : 'Nothing to unlock'}
            tone={passphrase ? 'shut' : 'open'} detail={lockDetail} href="/settings#safety" go="Your safety"/>
          <Door eyebrow={`Refused · ${sec.window_hours} h`} mark={sec.needs_attention ? '⚠' : '✕'} word={String(sec.total_denials)} tone={sec.needs_attention ? 'alert' : undefined}
            detail={`${denialWords(settingsStatus)}${sec.needs_attention ? ' — worth a look at the audit log' : ''}`} href="/settings#log" go="Security log"/>
          <Door eyebrow="Backups" mark="⟲" word={lock?.backups_encrypted ? 'Sealed' : 'Not sealed'} tone={lock?.backups_encrypted ? 'shut' : 'open'}
            detail={lock?.backups_encrypted ? 'Backups made now are encrypted: they open with the passphrase or the 12 recovery words.'
              : 'Backups are not encrypted: anyone with the file can read it. A passphrase seals them.'} href="/settings#backups" go="Backups"/>
          <Door eyebrow="Connector keys" mark="⚿" word={`${keysSet} of ${connectors.length}`}
            detail="Keys for outside sources, stored on this computer and never shown again. They are not in a backup." href="/settings#keys" go="Connector keys"/>
        </ul>
        {sec.needs_attention && <p className="ax-alert" role="alert">⚠ {denialWords(settingsStatus)}</p>}
      </aside>
    </div>
  </div>;
}
