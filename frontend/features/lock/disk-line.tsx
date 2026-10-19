'use client';
// Whether the disk is encrypted (ADR-0016): that is the operating system's job (BitLocker, Device encryption,
// FileVault, LUKS). The app says what it can see, and where it cannot tell it asks, rather than guess.
import type {ReactElement} from 'react';

import {useLockStore} from '../../lib/app-lock';
import type {DiskStatusOut} from '../../lib/generated/types.gen';
import {diskAnswer} from '../../lib/generated/sdk.gen';

const SAYS: Record<DiskStatusOut['state'], string> = {
  encrypted: 'This computer’s disk is encrypted', encrypting: 'This computer’s disk is being encrypted',
  paused: 'Encrypting this computer’s disk is paused', decrypting: 'This computer’s disk is being decrypted',
  not_encrypted: 'This computer’s disk is not encrypted', unknown: 'The app cannot tell whether this computer’s disk is encrypted',
};

export function DiskLine({disk}: {disk: DiskStatusOut | null | undefined}): ReactElement | null {
  const set = useLockStore(s => s.set);
  if (!disk) return null;
  const ok = disk.state === 'encrypted' || disk.state === 'encrypting';
  const answer = async (value: 'encrypted' | 'not_encrypted' | null) => {
    try { set((await diskAnswer({body: {answer: value}, throwOnError: true})).data); } catch { /* keep what it said */ }
  };
  return <div className={`lk-disk ${ok ? 'ok' : disk.state === 'unknown' ? '' : 'no'}`}>
    <span className="lk-shape" aria-hidden="true">{ok ? '■' : disk.state === 'unknown' ? '○' : '◆'}</span>
    <div>
      <b>{SAYS[disk.state]}</b>{disk.system ? ` · ${disk.system}` : ''}{disk.answered ? ' · as you said' : ''}
      <div className="lk-muted" style={{marginTop: 4}}>
        Encrypting the files on disk is the operating system’s job: if the laptop is taken, that is what keeps them unreadable.
        {disk.why ? ` ${disk.why}` : ''}
      </div>
      {!ok && disk.how_to && <div className="lk-muted" style={{marginTop: 4}}>{disk.how_to}</div>}
      {disk.state === 'unknown' && !disk.answered && <div className="lk-acts" style={{marginTop: 8}}>
        <button type="button" className="ap-btn" onClick={() => void answer('encrypted')}>It is encrypted</button>
        <button type="button" className="ap-btn" onClick={() => void answer('not_encrypted')}>It is not</button>
      </div>}
      {disk.answered && <button type="button" className="lk-link" style={{marginTop: 6}} onClick={() => void answer(null)}>Let the app check again</button>}
    </div>
  </div>;
}
