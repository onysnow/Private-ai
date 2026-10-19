'use client';
// The lock screen (ADR-0016, mockup ACCOUNT_4): no case name, no names of people, no counts, so someone looking over
// your shoulder sees only that the app is locked. A quick PIN when the server allows it (after the passphrase, in
// this server run, under 3 wrong tries), the passphrase otherwise, the recovery words when it is forgotten.
import {useEffect, useRef, useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {recoverWithWords, unlockWithPassphrase, unlockWithPin, useLockStore} from '../../lib/app-lock';

type Mode = 'pin' | 'passphrase' | 'recover';

const WHY: Record<string, string> = {idle: 'after time away', hide: 'behind Hide screen', sleep: 'after the computer slept', button: 'by you'};

export function LockScreen({reason}: {reason: string | null}): ReactElement {
  const pinAllowed = useLockStore(s => Boolean(s.state?.pin));
  const [mode, setMode] = useState<Mode>(pinAllowed ? 'pin' : 'passphrase');
  const [value, setValue] = useState('');
  const [words, setWords] = useState('');
  const [fresh, setFresh] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!pinAllowed && mode === 'pin') setMode('passphrase'); }, [pinAllowed, mode]);
  useEffect(() => { input.current?.focus(); setValue(''); setError(''); }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'pin') await unlockWithPin(value);
      else if (mode === 'passphrase') await unlockWithPassphrase(value);
      else {
        if (fresh !== again) { setError('The two new passphrases are not the same.'); return; }
        await recoverWithWords(words, fresh);
      }
    } catch (err) {
      setError(errorMessage(err, 'That did not open it.'));
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  return <div className="lk-cover" role="dialog" aria-modal="true" aria-label="The app is locked">
    <form className="lk-card" onSubmit={submit}>
      <div className="lk-sym" aria-hidden="true">◆</div>
      <h1>Locked</h1>
      <p className="lk-muted">{reason && WHY[reason] ? `${WHY[reason]} · ` : ''}your writing is kept</p>
      {mode === 'pin' && <>
        <div className="lk-dots" aria-hidden="true">{Array.from({length: Math.max(4, value.length)}, (_, i) => <i key={i} className={i < value.length ? 'f' : ''}/>)}</div>
        <input ref={input} className="lk-input" type="password" inputMode="numeric" autoComplete="off" aria-label="Quick PIN" value={value}
          onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 8))} style={{textAlign: 'center', letterSpacing: '.4em'}}/>
        <p className="lk-muted">Quick PIN · <button type="button" className="lk-link" onClick={() => setMode('passphrase')}>use the passphrase instead</button></p>
      </>}
      {mode === 'passphrase' && <div className="lk-form">
        <input ref={input} className="lk-input" type="password" autoComplete="current-password" aria-label="Passphrase" placeholder="Passphrase"
          value={value} onChange={e => setValue(e.target.value)}/>
        <button type="submit" className="ap-btn p" disabled={busy || !value} style={{justifyContent: 'center'}}>Unlock</button>
        <button type="button" className="lk-link" onClick={() => setMode('recover')}>Forgot it? Use the recovery words</button>
      </div>}
      {mode === 'recover' && <div className="lk-form">
        <textarea className="lk-input lk-words" aria-label="Recovery words" placeholder="The 12 recovery words, in order" value={words}
          onChange={e => setWords(e.target.value)} autoComplete="off" spellCheck={false}/>
        <input className="lk-input" type="password" autoComplete="new-password" aria-label="New passphrase" placeholder="New passphrase"
          value={fresh} onChange={e => setFresh(e.target.value)}/>
        <input className="lk-input" type="password" autoComplete="new-password" aria-label="New passphrase again" placeholder="New passphrase again"
          value={again} onChange={e => setAgain(e.target.value)}/>
        <button type="submit" className="ap-btn p" disabled={busy || !words || !fresh} style={{justifyContent: 'center'}}>Open and set the new passphrase</button>
        <button type="button" className="lk-link" onClick={() => setMode('passphrase')}>Back to the passphrase</button>
      </div>}
      {mode === 'pin' && <button type="submit" className="ap-btn p" disabled={busy || value.length < 4} style={{justifyContent: 'center', width: '100%'}}>Unlock</button>}
      {error && <p className="lk-err" role="alert">{error}</p>}
    </form>
  </div>;
}
