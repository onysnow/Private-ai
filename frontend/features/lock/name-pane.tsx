'use client';
// Settings › Your name (ADR-0016): the name that goes on your decisions. Past decisions keep the name they were signed with.
import {useEffect, useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {useLockStore} from '../../lib/app-lock';
import {setName} from '../../lib/generated/sdk.gen';
import {initials} from './first-open';

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
  return <form className="lk-panel" onSubmit={save} style={{maxWidth: 640}}>
    <p className="lk-eyebrow">Your name, as it goes on your work</p>
    <div className="lk-field">
      <input className="lk-input" style={{all: 'unset', flex: 1, font: '400 30px/1.1 var(--font-display)'}} value={name} onChange={e => setValue(e.target.value)}
        placeholder="The name on your byline" aria-label="Your name" maxLength={120} autoComplete="name"/>
      <span className={`lk-initials${name.trim() ? ' on' : ''}`} aria-hidden="true">{initials(name)}</span>
    </div>
    <p className="lk-muted" style={{marginTop: 10}}>It goes on every decision you make from now on. Past decisions keep the name they were signed with, and
      ones made before names were kept stay “a person”.</p>
    <button type="submit" className="ap-btn p" style={{marginTop: 10}} disabled={!name.trim() || name.trim() === state?.name}>Keep this name</button>
    {note && <p className="lk-muted" role="status" style={{marginTop: 8}}>{note}</p>}
  </form>;
}
