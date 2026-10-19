'use client';
// Passphrase-protected backups (ADR-0015; research Keep §8 "a choice 'Protect with a passphrase'", on by default as
// Ony decided). The server seals the archive; this part asks for the passphrase twice, says plainly that a lost one
// cannot be recovered, and makes saving without one a choice the reporter makes on purpose. The passphrase lives
// only in this component's state and the one request that uses it.
import {useId, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import '../../styles/backups.css';

export const LOST_PASSPHRASE = 'If you lose this passphrase, nobody can open this backup — not even you.';

/** The first bytes of a protected backup (app/services/backup_crypto.py MAGIC). */
const SEALED_MAGIC = 'JWBACKUP-SEALED\n';

/** Whether a chosen backup file is protected with a passphrase: read from its first bytes, not its name. */
export async function isProtectedBackup(file: Blob): Promise<boolean> {
  const head = file.slice(0, SEALED_MAGIC.length);
  const buffer = typeof head.arrayBuffer === 'function' ? await head.arrayBuffer() : await new Response(head).arrayBuffer();
  return new TextDecoder().decode(buffer) === SEALED_MAGIC;
}

export type PassphraseChoice = {
  /** Protect with a passphrase (the default). */
  protect: boolean;
  passphrase: string;
  /** Ready to save: protected with two matching, non-empty passphrases, or saving without one on purpose. */
  ready: boolean;
  /** What the server is sent: the passphrase, or null to save without one. */
  value: string | null;
};

export function usePassphraseChoice(): [PassphraseChoice, {setProtect: (v: boolean) => void; setPassphrase: (v: string) => void; setRepeat: (v: string) => void; repeat: string; reset: () => void}] {
  const [protect, setProtect] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const filled = passphrase.trim().length > 0;
  const ready = protect ? filled && passphrase === repeat : true;
  return [
    {protect, passphrase, ready, value: protect ? passphrase : null},
    {setProtect, setPassphrase, setRepeat, repeat, reset: () => { setPassphrase(''); setRepeat(''); }},
  ];
}

export function PassphraseFields({choice, controls}: {choice: PassphraseChoice; controls: ReturnType<typeof usePassphraseChoice>[1]}): ReactElement {
  const id = useId();
  const mismatch = choice.protect && controls.repeat.length > 0 && controls.repeat !== choice.passphrase;
  return <fieldset className="bk-pass">
    <legend className="bk-pass-legend">Passphrase</legend>
    <label className="bk-pass-check">
      <input type="checkbox" checked={choice.protect} onChange={(e: ChangeEvent<HTMLInputElement>) => controls.setProtect(e.target.checked)}/>
      <span>Protect with a passphrase</span>
    </label>
    {choice.protect ? <>
      <label className="bk-pass-field"><span>Passphrase</span>
        <input type="password" value={choice.passphrase} autoComplete="new-password" spellCheck={false}
          onChange={(e: ChangeEvent<HTMLInputElement>) => controls.setPassphrase(e.target.value)} aria-describedby={`${id}-lost`}/></label>
      <label className="bk-pass-field"><span>Repeat the passphrase</span>
        <input type="password" value={controls.repeat} autoComplete="new-password" spellCheck={false} aria-invalid={mismatch || undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => controls.setRepeat(e.target.value)} aria-describedby={mismatch ? `${id}-mismatch` : undefined}/></label>
      {mismatch && <p className="bk-pass-mismatch" id={`${id}-mismatch`} role="status"><span aria-hidden="true">✕</span> The two passphrases are not the same.</p>}
      <p className="bk-pass-lost" id={`${id}-lost`}><span aria-hidden="true">▲</span> {LOST_PASSPHRASE}</p>
    </> : <p className="bk-pass-lost" role="status"><span aria-hidden="true">○</span> Saving without a passphrase: anyone who has the file can open the case.</p>}
  </fieldset>;
}

/** The passphrase asked for when restoring a protected backup. */
export function RestorePassphrase({value, onChange}: {value: string; onChange: (v: string) => void}): ReactElement {
  return <label className="bk-pass-field"><span>This backup is protected. Passphrase</span>
    <input type="password" value={value} autoComplete="off" spellCheck={false} data-autofocus
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}/></label>;
}
