'use client';
// Settings › Your safety (ADR-0016, mockup ACCOUNT_4): the passphrase, when the app locks, the quick PIN, and cases
// locked on their own. The lock screen preview beside it shows what someone looking over your shoulder would see.
import {useState} from 'react';
import type {FormEvent, ReactElement, ReactNode} from 'react';

import {HIDE_SCREEN_EVENT} from '../../components/frame/app-frame';
import {errorMessage} from '../../lib/api-client';
import {lockNow, useLockStore} from '../../lib/app-lock';
import type {LockStateOut} from '../../lib/generated/types.gen';
import {
  changePassphrase, closeCase, listInvestigations, locking, lockCase, me, newRecoveryKey, openCase, removeCaseLock, setPin, turnOff, turnOn,
} from '../../lib/generated/sdk.gen';
import {DiskLine} from './disk-line';
import {STRENGTH_WORD, useStrength} from './passphrase-strength';
import {RecoveryWords} from './recovery-words';

const IDLE = [[5, '5 min'], [10, '10 min'], [30, '30 min'], [0, 'never']] as const;

function dayOf(at: string | null | undefined): string {
  return at ? new Date(at).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}) : '';
}

/** A small form asking for one or two secrets, in place of the button that opened it. */
function Ask({fields, submit, label, onCancel, children}: {
  fields: {name: string; label: string; kind?: 'pin' | 'new'}[]; label: string; children?: ReactNode;
  submit: (values: Record<string, string>) => Promise<void>; onCancel: () => void;
}): ReactElement {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fresh = fields.find(f => f.kind === 'new');
  const strength = useStrength(fresh ? values[fresh.name] ?? '' : '');
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await submit(values); } catch (err) { setError(errorMessage(err, 'That did not work.')); } finally { setBusy(false); }
  };
  return <form className="lk-form" onSubmit={go} style={{marginTop: 10}}>
    {children}
    {fields.map((f, i) => <input key={f.name} className="lk-input" aria-label={f.label} placeholder={f.label} autoFocus={i === 0}
      type="password" inputMode={f.kind === 'pin' ? 'numeric' : undefined} autoComplete={f.kind === 'new' ? 'new-password' : 'current-password'}
      value={values[f.name] ?? ''} onChange={e => setValues(v => ({...v, [f.name]: e.target.value}))}/>)}
    {strength && <p className="lk-muted">{STRENGTH_WORD[strength.score]}: about {strength.bits} bits. Four or more unrelated words are best.</p>}
    {error && <p className="lk-err" role="alert">{error}</p>}
    <span className="lk-acts"><button type="submit" className="ap-btn p" disabled={busy}>{label}</button>
      <button type="button" className="ap-btn" onClick={onCancel}>Cancel</button></span>
  </form>;
}

export function LockingPane(): ReactElement {
  const state = useLockStore(s => s.state);
  const set = useLockStore(s => s.set);
  const [asking, setAsking] = useState<string>('');
  const [words, setWords] = useState<string[] | null>(null);
  const [cases, setCases] = useState<{id: string; name: string}[] | null>(null);
  const [error, setError] = useState('');
  if (!state) return <p className="lk-muted">The lock settings could not be reached.</p>;
  const on = state.protection === 'passphrase';
  const keep = (next: LockStateOut) => { set(next); setAsking(''); };
  const put = async (body: Parameters<typeof locking>[0]['body']) => {
    setError('');
    try { set((await locking({body, throwOnError: true})).data); } catch (err) { setError(errorMessage(err, 'Not saved.')); }
  };
  const lockedIds = new Set((state.locked_cases ?? []).map(c => c.id));
  const showCases = async () => {
    setAsking('pick-case');
    try { setCases((await listInvestigations({throwOnError: true})).data.map(c => ({id: c.id, name: c.name}))); } catch { setCases([]); }
  };

  if (words) {
    return <RecoveryWords words={words} onDone={() => setWords(null)}/>;
  }

  return <div className="lk-settings">
    <div style={{display: 'grid', gap: 14}}>
      <div className="lk-panel">
        <div className="lk-status">
          <span style={{fontSize: 20, color: on ? 'var(--accent-2)' : 'var(--text-muted)'}} aria-hidden="true">{on ? '■' : '○'}</span>
          <span className="lk-big">{on ? 'Protected with a passphrase' : 'Nothing to unlock'}</span>
          <span className="lk-muted">{on
            ? `Passphrase set ${dayOf(state.passphrase_set_at)} · recovery words ${dayOf(state.recovery_set_at)} · backups encrypted`
            : 'Anyone at this computer can open the app and acts as you.'}</span>
        </div>
        {!asking && <div className="lk-acts" style={{marginTop: 12}}>
          {on ? <>
            <button type="button" className="ap-btn" onClick={() => setAsking('change')}>Change passphrase</button>
            <button type="button" className="ap-btn" onClick={() => setAsking('words')}>New recovery words</button>
            <button type="button" className="ap-btn" onClick={() => void lockNow('button')}>Lock now</button>
            <button type="button" className="ap-btn" onClick={() => setAsking('off')}>Turn it off</button>
          </> : <button type="button" className="ap-btn p" onClick={() => setAsking('on')}>Protect with a passphrase</button>}
        </div>}
        {asking === 'on' && <Ask label="Protect now" onCancel={() => setAsking('')}
          fields={[{name: 'p', label: 'Passphrase, 12 characters or more', kind: 'new'}, {name: 'a', label: 'Again'}]}
          submit={async v => {
            if (v.p !== v.a) throw new Error('The two passphrases are not the same.');
            setWords((await turnOn({body: {passphrase: v.p}, throwOnError: true})).data.words);
            setAsking('');
            set((await me({throwOnError: true})).data);
          }}/>}
        {asking === 'change' && <Ask label="Change it" onCancel={() => setAsking('')}
          fields={[{name: 'old', label: 'The passphrase now'}, {name: 'new', label: 'The new passphrase', kind: 'new'}, {name: 'a', label: 'The new one again'}]}
          submit={async v => {
            if (v.new !== v.a) throw new Error('The two new passphrases are not the same.');
            keep((await changePassphrase({body: {old: v.old ?? '', new: v.new ?? ''}, throwOnError: true})).data);
          }}>
          <p className="lk-muted">Backups already made still open with the old passphrase, or with the recovery words.</p>
        </Ask>}
        {asking === 'words' && <Ask label="Make new words" onCancel={() => setAsking('')} fields={[{name: 'p', label: 'Passphrase'}]}
          submit={async v => { setWords((await newRecoveryKey({body: {passphrase: v.p ?? ''}, throwOnError: true})).data.words); setAsking(''); }}>
          <p className="lk-muted">The old words stop opening the app. Backups made before still open with them.</p>
        </Ask>}
        {asking === 'off' && <Ask label="Turn it off" onCancel={() => setAsking('')} fields={[{name: 'p', label: 'Passphrase'}]}
          submit={async v => keep((await turnOff({body: {passphrase: v.p ?? ''}, throwOnError: true})).data)}>
          <p className="lk-muted">The app opens straight away again and new backups are not encrypted. Cases locked on their own stay locked.</p>
        </Ask>}
        <DiskLine disk={state.disk}/>
      </div>

      {on && <div className="lk-panel">
        <p className="lk-eyebrow">When the app locks</p>
        <div className="lk-row">
          <span>When I walk away<small>No key or click for this long. Unsaved writing is kept.</small></span>
          <span className="ap-seg" role="radiogroup" aria-label="Lock after">
            {IDLE.map(([m, label]) => <button key={m} type="button" role="radio" aria-checked={(state.idle_minutes ?? 10) === m}
              className={(state.idle_minutes ?? 10) === m ? 'on' : ''} onClick={() => void put({idle_minutes: m})}>{label}</button>)}
          </span>
        </div>
        <label className="ap-switch lk-row"><span>When I press Hide screen<small>The cover comes down and the app locks behind it.</small></span>
          <input type="checkbox" role="switch" checked={Boolean(state.lock_on_hide)} onChange={e => void put({lock_on_hide: e.target.checked})}/><i aria-hidden="true"/></label>
        <label className="ap-switch lk-row"><span>When the laptop sleeps or the lid closes<small>Only while the app is open in this browser.</small></span>
          <input type="checkbox" role="switch" checked={Boolean(state.lock_on_sleep)} onChange={e => void put({lock_on_sleep: e.target.checked})}/><i aria-hidden="true"/></label>
      </div>}

      {on && <div className="lk-panel">
        <p className="lk-eyebrow">Reopening after a lock</p>
        <label className="ap-switch lk-row"><span>Quick PIN<small>Reopens after an idle lock or Hide screen in the same session. After a restart the passphrase is
          needed. 3 wrong tries and only the passphrase works.</small></span>
          <input type="checkbox" role="switch" checked={Boolean(state.quick_pin)} disabled={!state.pin_set && !state.quick_pin}
            onChange={e => void put({quick_pin: e.target.checked})}/><i aria-hidden="true"/></label>
        {asking !== 'pin' && <button type="button" className="ap-btn" onClick={() => setAsking('pin')}>{state.pin_set ? 'Change the PIN' : 'Set a PIN'}</button>}
        {asking === 'pin' && <Ask label="Keep this PIN" onCancel={() => setAsking('')} fields={[{name: 'p', label: 'PIN, 4 to 8 digits', kind: 'pin'}]}
          submit={async v => {
            await setPin({body: {pin: v.p ?? ''}, throwOnError: true});
            keep((await locking({body: {quick_pin: true}, throwOnError: true})).data);
          }}/>}
        <p className="lk-muted" style={{marginTop: 8}}>The PIN is a convenience: it does not protect backups or a stolen laptop. The passphrase and the disk encryption do.</p>
      </div>}

      <div className="lk-panel">
        <p className="lk-eyebrow">Cases locked on their own</p>
        <p className="lk-muted" style={{marginTop: 6}}>A locked case is absent from every list, search and count until you open it with its own passphrase; opening the app does not open it.
          Its documents on disk are protected by the disk encryption, not by this.</p>
        {(state.locked_cases ?? []).map(c => <div key={c.id} className="lk-case">
          <span className={`lk-icon${c.open ? '' : ' on'}`} aria-hidden="true">{c.open ? '◌' : '■'}</span>
          <span><b>{c.name}</b><small className="lk-muted" style={{display: 'block'}}>{c.open ? 'open in this browser until the app locks' : 'own passphrase · its name shows here only to you'}</small></span>
          <span className="lk-acts">
            {c.open
              ? <button type="button" className="ap-btn" onClick={async () => set((await closeCase({path: {investigation_id: c.id}, throwOnError: true})).data)}>Close it</button>
              : <button type="button" className="ap-btn" onClick={() => setAsking(`open:${c.id}`)}>Open…</button>}
            <button type="button" className="ap-btn" onClick={() => setAsking(`change:${c.id}`)}>Change</button>
            <button type="button" className="ap-btn" onClick={() => setAsking(`remove:${c.id}`)}>Remove the lock</button>
          </span>
          {asking === `open:${c.id}` && <div style={{gridColumn: '1 / -1'}}><Ask label="Open" onCancel={() => setAsking('')} fields={[{name: 'p', label: 'This case’s passphrase'}]}
            submit={async v => keep((await openCase({path: {investigation_id: c.id}, body: {passphrase: v.p ?? ''}, throwOnError: true})).data)}/></div>}
          {asking === `change:${c.id}` && <div style={{gridColumn: '1 / -1'}}><Ask label="Change it" onCancel={() => setAsking('')}
            fields={[{name: 'old', label: 'Its passphrase now'}, {name: 'new', label: 'Its new passphrase', kind: 'new'}]}
            submit={async v => keep((await lockCase({path: {investigation_id: c.id}, body: {passphrase: v.new ?? '', old: v.old ?? ''}, throwOnError: true})).data)}/></div>}
          {asking === `remove:${c.id}` && <div style={{gridColumn: '1 / -1'}}><Ask label="Remove the lock" onCancel={() => setAsking('')} fields={[{name: 'p', label: 'This case’s passphrase'}]}
            submit={async v => keep((await removeCaseLock({path: {investigation_id: c.id}, body: {passphrase: v.p ?? ''}, throwOnError: true})).data)}>
            <p className="lk-muted">The case opens with the app again.</p></Ask></div>}
        </div>)}
        {asking !== 'pick-case' && !asking.startsWith('lock:') && <button type="button" className="ap-btn" style={{marginTop: 10}} onClick={() => void showCases()}>Lock a case…</button>}
        {asking === 'pick-case' && <div className="lk-form" style={{marginTop: 10}}>
          {cases === null ? <p className="lk-muted">Loading the cases…</p> : cases.filter(c => !lockedIds.has(c.id)).map(c =>
            <button key={c.id} type="button" className="lk-case" style={{width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit'}}
              onClick={() => setAsking(`lock:${c.id}`)}>
              <span className="lk-icon" aria-hidden="true">◌</span><span><b>{c.name}</b><small className="lk-muted" style={{display: 'block'}}>opens with the app</small></span>
              <span className="lk-muted">Lock this case…</span>
            </button>)}
          <span><button type="button" className="ap-btn" onClick={() => setAsking('')}>Cancel</button></span>
        </div>}
        {asking.startsWith('lock:') && <Ask label="Lock it" onCancel={() => setAsking('')}
          fields={[{name: 'p', label: 'Its own passphrase, 12 characters or more', kind: 'new'}, {name: 'a', label: 'Again'}]}
          submit={async v => {
            if (v.p !== v.a) throw new Error('The two passphrases are not the same.');
            keep((await lockCase({path: {investigation_id: asking.slice(5)}, body: {passphrase: v.p ?? ''}, throwOnError: true})).data);
          }}>
          <p className="lk-muted"><b>{cases?.find(c => c.id === asking.slice(5))?.name}</b>: write its passphrase down. Without it the case cannot be opened, and the app’s
            recovery words do not open it.</p>
        </Ask>}
      </div>
      {error && <p className="lk-err" role="alert">{error}</p>}
      <div className="lk-panel">
        <p className="text-sm">Hide screen covers everything at once with a plain page, for when someone walks up. ⌘⇧H from anywhere, or the button on Case home;
          your place is kept until you ask for it back.{on && state.lock_on_hide ? ' The app locks behind it.' : ''}</p>
        <button type="button" className="ap-btn mt-4" onClick={() => window.dispatchEvent(new Event(HIDE_SCREEN_EVENT))}>Hide the screen now</button>
      </div>
    </div>

    <div className="lk-panel lk-preview" aria-label="What the lock looks like">
      <div className="lk-mini" aria-hidden="true">
        <div style={{display: 'grid', gap: 8, justifyItems: 'center'}}>
          <div className="lk-sym">◆</div>
          <div style={{font: '300 22px var(--font-display)'}}>Locked</div>
          <div className="lk-muted">after {state.idle_minutes || 10} min away · your writing is kept</div>
          {state.quick_pin && <div className="lk-dots"><i/><i/><i/><i/></div>}
          <div className="lk-muted">{state.quick_pin ? 'Quick PIN · use the passphrase instead' : 'Passphrase'}</div>
        </div>
      </div>
      <div style={{padding: '14px 18px'}}>
        <p className="lk-eyebrow">What the lock looks like</p>
        <p className="lk-muted" style={{marginTop: 6}}>No case name, no names of people, no counts: someone looking over your shoulder sees only that the app is locked.</p>
      </div>
    </div>
  </div>;
}
