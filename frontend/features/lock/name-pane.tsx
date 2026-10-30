'use client';
// Settings › Your name (ADR-0016): the name that goes on your decisions. Past decisions keep the name they were signed with.
import {useEffect, useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {useLockStore} from '../../lib/app-lock';
import {setName} from '../../lib/generated/sdk.gen';
import {HowItReads, initials} from './first-open';

export function NamePane(): ReactElement {
  const state = useLockStore(s => s.state);
  const set = useLockStore(s => s.set);
  const [name, setValue] = useState(state?.name ?? '');
  const [note, setNote] = useState('');
  useEffect(() => { setValue(state?.name ?? ''); }, [state?.name]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try { set((await setName({body: {name}, throwOnError: true})).data); setNote('Kept. Decisions from now on carry it.'); }
    catch (err) { setNote(errorMessage(err, 'Not saved.')); }
  };
  const before = state?.unsigned_decisions ?? 0;
  // As on first open (mockup ACCOUNT_1): the name, how it will read as you type, and the count of decisions that stay
  // "a person". What happens to past decisions is revealed on the heading.
  return <div className="lk-namepane">
    <form className="lk-panel" onSubmit={save}>
      <p className="lk-eyebrow"><Reveal detail="It goes on every decision you make from now on. Past decisions keep the name they were signed with, and ones made before names were kept stay “a person”.">
        <span>Your name, as it goes on your work</span></Reveal></p>
      <div className="lk-field">
        <input className="lk-input" style={{all: 'unset', flex: 1, font: '400 30px/1.1 var(--font-display)'}} value={name} onChange={e => setValue(e.target.value)}
          placeholder="The name on your byline" aria-label="Your name" maxLength={120} autoComplete="name"/>
        <span className={`lk-initials${name.trim() ? ' on' : ''}`} aria-hidden="true">{initials(name)}</span>
      </div>
      <HowItReads name={name}/>
      <div className="lk-acts" style={{marginTop: 14}}>
        <button type="submit" className="ap-btn p" disabled={!name.trim() || name.trim() === state?.name}>Keep this name</button>
        {note && <span className="lk-muted" role="status">{note}</span>}
      </div>
    </form>
    {before > 0 && <div className="lk-panel lk-before">
      <span className="lk-count">{before}</span>
      <span className="lk-muted" style={{fontSize: 13}}>decisions made before stay as they are: <b>a person</b>, from when names weren’t kept yet.
        Nobody’s name is put on them afterwards.</span>
    </div>}
  </div>;
}
