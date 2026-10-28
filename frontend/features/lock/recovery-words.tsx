'use client';
// The 12 recovery words (ADR-0016, mockup ACCOUNT_3), shown once: the app keeps no copy. Print them or save them as a
// file, then type one back to show you have them.
import {useMemo, useState} from 'react';
import type {ReactElement} from 'react';

function saveFile(words: string[]): void {
  const text = `Journalism Workbench recovery words\n\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n\n`
    + 'They open the app and its encrypted backups if the passphrase is forgotten. Keep them away from this computer.\n';
  const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
  const a = Object.assign(document.createElement('a'), {href: url, download: 'workbench-recovery-words.txt'});
  a.click();
  URL.revokeObjectURL(url);
}

function printWords(words: string[]): void {
  const w = window.open('', '_blank', 'width=600,height=500');
  if (!w) return;
  const doc = w.document;
  doc.title = 'Recovery words';
  const h = doc.createElement('h1');
  h.textContent = 'Journalism Workbench recovery words';
  const ol = doc.createElement('ol');
  for (const word of words) ol.appendChild(Object.assign(doc.createElement('li'), {textContent: word}));
  const p = doc.createElement('p');
  p.textContent = 'They open the app and its encrypted backups if the passphrase is forgotten. Keep them away from this computer.';
  doc.body.append(h, ol, p);
  doc.body.style.font = '16px monospace';
  w.print();
}

export function RecoveryWords({words, onDone, doneLabel = 'Done'}: {words: string[]; onDone: () => void; doneLabel?: string}): ReactElement {
  const ask = useMemo(() => Math.floor(Math.random() * words.length), [words]);
  const [typed, setTyped] = useState('');
  const right = typed.trim().toLowerCase() === words[ask];
  return <div className="lk-panel" aria-label="Recovery words">
    <p className="lk-eyebrow">Recovery words · shown once</p>
    <p className="lk-muted" style={{fontSize: 13.5, marginTop: 8}}>If you forget the passphrase, these are the only way back in, and they open your encrypted
      backups on any computer. The app keeps no copy and nobody, including the people who made the app, can reset it.</p>
    <div className="lk-wordgrid">{words.map((w, i) => <span key={i}>{w}</span>)}</div>
    <div className="lk-acts">
      <button type="button" className="ap-btn" onClick={() => printWords(words)}>Print them</button>
      <button type="button" className="ap-btn" onClick={() => saveFile(words)}>Save as a file…</button>
    </div>
    <p className="lk-muted" style={{marginTop: 8}}>Keep them away from this computer: a drawer, a safe, a trusted person.</p>
    <label className="lk-row" style={{borderTop: '1px solid var(--line)', marginTop: 12}}>
      <span>Check you have them<small>Type word {ask + 1}</small></span>
      <span style={{display: 'flex', gap: 8, alignItems: 'center'}}>
        <input className="lk-input lk-mono" style={{width: 150}} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off"
          spellCheck={false} aria-label={`Word ${ask + 1}`}/>
        {right && <span style={{color: 'var(--accent-2)'}}>✓ right</span>}
      </span>
    </label>
    <div className="lk-warn">Lose both the passphrase and these words and the app and its backups cannot be opened again, by anyone.</div>
    <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 14}}>
      <button type="button" className="ap-btn p" disabled={!right} onClick={onDone}>{doneLabel}</button>
    </div>
  </div>;
}
