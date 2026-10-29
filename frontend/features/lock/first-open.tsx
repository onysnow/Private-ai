'use client';
// First open after the update (ADR-0016, mockups ACCOUNT_1 and ACCOUNT_3): your name, as it goes on your decisions, and
// how to protect what is on this computer. Nobody's name is filled in or offered; decisions made before stay "a person".
import {useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {useLockStore} from '../../lib/app-lock';
import type {LockStateOut} from '../../lib/generated/types.gen';
import {me, setName, turnOn} from '../../lib/generated/sdk.gen';
import {DiskLine} from './disk-line';
import {STRENGTH_WORD, useStrength} from './passphrase-strength';
import {RecoveryWords} from './recovery-words';

const MIN = 12;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '··';
}

function Signed({name}: {name: string}): ReactElement {
  return name.trim() ? <span className="lk-signed">{name.trim()}</span> : <span className="lk-slot">your name</span>;
}

type Step = 'name' | 'passphrase' | 'words';

export function FirstOpen({state}: {state: LockStateOut}): ReactElement {
  const set = useLockStore(s => s.set);
  const [step, setStep] = useState<Step>('name');
  const [name, setNameValue] = useState('');
  const [protect, setProtect] = useState<'none' | 'passphrase'>('none');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = useStrength(pass);
  const before = state.unsigned_decisions ?? 0;

  const saveName = async (): Promise<boolean> => {
    try {
      const saved = (await setName({body: {name}, throwOnError: true})).data;
      if (protect === 'none') set(saved);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'The name was not saved.'));
      return false;
    }
  };

  const next = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (step === 'name') {
        if (await saveName() && protect === 'passphrase') setStep('passphrase');
      } else if (step === 'passphrase') {
        setWords((await turnOn({body: {passphrase: pass}, throwOnError: true})).data.words);
        setStep('words');
      }
    } catch (err) {
      setError(errorMessage(err, 'That did not work.'));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    try { set((await me({throwOnError: true})).data); } catch { /* the gate asks again */ }
  };

  const passOk = pass.length >= MIN && pass === again;
  return <form className="lk-first" onSubmit={next} aria-label="First open">
    <div className="lk-first-in">
      <div className="lk-top">
        <span>{step === 'name' ? <Reveal detail="First open after the update."><b>Journalism Workbench</b></Reveal> : <b>Journalism Workbench</b>} · This computer{step === 'name' ? '' : ' · Protect with a passphrase'}</span>
        <span className="lk-chip ok">⌂ Nothing leaves this computer</span>
      </div>

      {step === 'name' && <div className="lk-wrap">
        <div>
          <p className="lk-eyebrow" style={{marginTop: 14}}>Who is working here</p>
          <h1>Sign your work</h1>
          <p className="lk-lede">From now on the app writes your name on every decision you make: what you accept, link, reject or set as
            Supported. Editors and lawyers read it in the Chain of Custody and the custody log.</p>
          <div className="lk-panel lk-name">
            <p className="lk-eyebrow">Your name, as it goes on your work</p>
            <div className="lk-field">
              <input value={name} onChange={e => setNameValue(e.target.value)} placeholder="The name on your byline" aria-label="Your name"
                maxLength={120} autoFocus autoComplete="name"/>
              <span className={`lk-initials${name.trim() ? ' on' : ''}`} aria-hidden="true">{initials(name)}</span>
            </div>
            <p className="lk-eyebrow" style={{marginTop: 16}}><Reveal detail="It fills in as you type."><span>How it will read</span></Reveal></p>
            {/* Where each line appears is revealed on it. */}
            <div className="lk-reads">
              <Reveal detail="In the custody log"><div className="lk-read"><span className="lk-mono">today · <Signed name={name}/> · Accepted the proposal</span></div></Reveal>
              <Reveal detail="On a decision card"><div className="lk-read"><span>✓ Accepted by <Signed name={name}/></span></div></Reveal>
              <Reveal detail="For a lawyer"><div className="lk-read"><span className="lk-mono">decided_by: <Signed name={name}/> (owner) · human</span></div></Reveal>
            </div>
          </div>
          {before > 0 && <div className="lk-panel lk-before">
            <span className="lk-count">{before}</span>
            <span className="lk-muted" style={{fontSize: 13}}>decisions made before stay as they are: <b>a person</b>, from when names weren’t kept yet.
              Nobody’s name is put on them afterwards.</span>
          </div>}
        </div>
        <div>
          <div className="lk-panel" role="radiogroup" aria-label="Protect what is on this computer">
            <p className="lk-eyebrow">Protect what’s on this computer · choose one</p>
            <button type="button" role="radio" aria-checked={protect === 'none'} className={`lk-opt${protect === 'none' ? ' on' : ''}`} onClick={() => setProtect('none')}>
              <span className="lk-radio"/>
              <span><b>Nothing to unlock</b>
                <span className="lk-pp"><span className="y">Opens straight away</span><span className="n">Anyone at this computer acts as you</span>
                  <span className="y">Nothing to forget</span><span className="n">Backups are not encrypted</span></span></span>
            </button>
            <button type="button" role="radio" aria-checked={protect === 'passphrase'} className={`lk-opt${protect === 'passphrase' ? ' on' : ''}`} onClick={() => setProtect('passphrase')}>
              <span className="lk-radio"/>
              <span><b>Protect with a passphrase</b><span className="lk-tag">for cases with sources</span>
                <span className="lk-pp"><span className="y">The app locks when you walk away</span><span className="n">Lose it and the recovery words: backups are gone</span>
                  <span className="y">Backups encrypted, open on any computer</span><span className="n">Asked every time the app starts</span>
                  <span className="y">A case can have its own passphrase</span></span></span>
            </button>
            {protect === 'passphrase' && <p className="lk-muted" style={{marginTop: 10}}>Next: set the passphrase and write down 12 recovery words, once.</p>}
            <DiskLine disk={state.disk}/>
            <p className="lk-muted" style={{marginTop: 12}}>Either way, later in Settings › Your safety: lock one case with its own passphrase, lock when idle,
              a quick PIN to reopen.</p>
          </div>
        </div>
      </div>}

      {(step === 'passphrase' || step === 'words') && <>
        <p className="lk-eyebrow" style={{marginTop: 14}}>✓ Name · {step === 'words' ? '✓' : '●'} Passphrase · {step === 'words' ? '●' : '○'} Recovery words</p>
        <h1>Lock the app with a passphrase</h1>
        <div className="lk-wrap">
          <div style={{display: 'grid', gap: 16, alignContent: 'start'}}>
            <div className="lk-panel">
              <p className="lk-eyebrow">Your passphrase{step === 'words' ? ' · ✓ set' : ''}</p>
              <div style={{display: 'flex', gap: 8, marginTop: 10}}>
                <input className="lk-input" type={show ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)} autoFocus
                  autoComplete="new-password" aria-label="Passphrase" aria-describedby="lk-strength" readOnly={step === 'words'}/>
                <button type="button" className="ap-btn" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? 'hide' : 'show'}</button>
              </div>
              <div className="lk-meter" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i} className={strength && strength.score > i ? 'f' : ''}/>)}</div>
              <p className="lk-muted" id="lk-strength" aria-live="polite">
                {strength ? `${STRENGTH_WORD[strength.score]}: ${strength.words} word${strength.words === 1 ? '' : 's'}, about ${strength.bits} bits. ` : ''}
                {pass && pass.length < MIN ? `At least ${MIN} characters. ` : ''}
                {strength?.warning ? `${strength.warning} ` : ''}Four or more unrelated words beat a short password with symbols.</p>
              {step === 'passphrase' && <div style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 10}}>
                <input className="lk-input" type={show ? 'text' : 'password'} value={again} onChange={e => setAgain(e.target.value)}
                  autoComplete="new-password" aria-label="Passphrase again" placeholder="Again"/>
                {again && <span style={{color: pass === again ? 'var(--accent-2)' : 'var(--text-muted)', whiteSpace: 'nowrap'}}>{pass === again ? '✓ matches' : 'not yet the same'}</span>}
              </div>}
            </div>
            <div className="lk-panel">
              <p className="lk-eyebrow">What it protects</p>
              <ul className="lk-list">
                <li><span style={{color: 'var(--accent-2)'}}>✓</span>The app: every case, record, claim, decision and note, until the passphrase is given</li>
                <li><span style={{color: 'var(--accent-2)'}}>✓</span>Locked cases: a case can have its own passphrase on top</li>
                <li><span style={{color: 'var(--accent-2)'}}>✓</span>Backups made from now on: encrypted, and they open on any computer with the passphrase or the recovery words</li>
                <li><span style={{color: 'var(--flag-textbook-edge, #d9705f)'}}>✕</span>The files on disk if the laptop is taken: that is the disk encryption below</li>
                <li><span style={{color: 'var(--flag-textbook-edge, #d9705f)'}}>✕</span>Copies saved elsewhere before today, and exports you send out</li>
              </ul>
              <DiskLine disk={state.disk}/>
            </div>
          </div>
          {step === 'words' && words
            ? <RecoveryWords words={words} onDone={() => void finish()} doneLabel="I have them · open the app"/>
            : <div className="lk-panel" style={{alignSelf: 'start'}}>
              <p className="lk-eyebrow">Recovery words · shown once</p>
              <p className="lk-muted" style={{fontSize: 13.5, marginTop: 8}}>After Protect now, 12 words appear here. They are the only way back in if you forget the
                passphrase, and they open your encrypted backups on any computer. Have paper or a printer ready.</p>
            </div>}
        </div>
      </>}

      {error && <p className="lk-err" role="alert">{error}</p>}
    </div>
    {step !== 'words' && <div className="lk-foot">
      <span>{step === 'name'
        ? 'Your name is stored in this computer’s database and travels in backups. You can change it; past decisions keep the name they were signed with.'
        : 'The app is locked from the next start, and after time away. Nothing is sent anywhere.'}</span>
      <span className="lk-acts">
        {step === 'passphrase' && <button type="button" className="ap-btn" onClick={() => { setStep('name'); setProtect('none'); }}>Back</button>}
        <button type="submit" className="ap-btn p" disabled={busy || (step === 'name' ? !name.trim() : !passOk)}>
          {step === 'name' ? (name.trim() ? 'Continue ⏎' : 'Type your name to continue') : 'Protect now'}</button>
      </span>
    </div>}
  </form>;
}
