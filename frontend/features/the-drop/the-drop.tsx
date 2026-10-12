'use client';
// The Drop (Bring in; mockup INTAKE_1): bring files in, and watch each one go through
// seven stages (backend app/services/drop.py): Received, Checked, Read, Split into
// passages, Files inside, Names & facts, Ready for you. One lane per file; an archive
// or mailbox is one lane with its files counted inside. Choose a lane for its read
// receipt. F shows only problems and files still in progress.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, DragEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {getDropOptions, getDropQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {cancelJobEndpoint} from '../../lib/generated/sdk.gen';
import type {DropLaneOut, DropStageOut} from '../../lib/generated/types.gen';
import {singleKeysOn} from '../../lib/shortcuts';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {upload} from '../documents/documents-panel';

const MARK: Record<DropStageOut['state'], string> = {done: '✓', active: '◐', waiting: '·', stopped: '✕', needs_you: '!', skipped: '–'};
const WORD: Record<DropStageOut['state'], string> = {done: 'done', active: 'in progress', waiting: 'waiting', stopped: 'stopped', needs_you: 'needs you', skipped: 'not needed'};
const KIND: Record<string, [string, string]> = {entity: ['name', 'names'], claim: ['claim', 'claims'], evidence: ['passage as evidence', 'passages as evidence'],
  relationship: ['link', 'links'], event: ['date', 'dates'], identifier: ['identifier', 'identifiers']};
const kindWord = (k: string, n: number) => (KIND[k] ? KIND[k][n === 1 ? 0 : 1] : k);

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

function Lane({lane, on, onPick}: {lane: DropLaneOut; on: boolean; onPick: () => void}): ReactElement {
  return <li className={`dp-lane${on ? ' on' : ''}${lane.problem ? ' problem' : ''}`}>
    <button type="button" onClick={onPick} aria-pressed={on} aria-label={`${lane.filename}: ${lane.stages.map(s => `${s.label} ${WORD[s.state]}`).join(', ')}`}>
      <span className="dp-file" title={lane.filename}>{lane.filename}</span>
      {lane.stages.map(s => <span key={s.key} className={`dp-stage dp-${s.state}`} title={`${s.label}: ${WORD[s.state]}${s.detail ? ` · ${s.detail}` : ''}`}>
        <i aria-hidden="true">{MARK[s.state]}</i><small>{s.detail}</small></span>)}
    </button>
  </li>;
}

function Receipt({lane, investigationId}: {lane: DropLaneOut; investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const [stopping, setStopping] = useState('');
  const reading = lane.stages.some(s => s.key === 'read' && (s.state === 'active' || s.state === 'waiting'));
  const stop = async () => {
    if (!lane.job_id) return;
    setStopping('Stopping…');
    try {
      await cancelJobEndpoint({path: {job_id: lane.job_id}, throwOnError: true});
      setStopping('It stops at the next page; nothing half-read is kept.');
      await queryClient.invalidateQueries({queryKey: getDropQueryKey({path: {investigation_id: investigationId}})});
    } catch (error) { setStopping(errorMessage(error, 'Could not stop it')); }
  };
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const r = lane.receipt;
  const found = Object.entries(r.proposals).map(([k, n]) => `${n} ${kindWord(k, n)}`).join(' · ');
  const waiting = Object.values(r.waiting).reduce((a, b) => a + b, 0);
  return <aside className="dp-receipt" aria-label={`Read receipt: ${lane.filename}`}>
    <p className="dp-eyebrow">Read receipt</p>
    <h3>{lane.filename}</h3>
    <dl>
      <div><dt>Fingerprint</dt><dd><code title={r.fingerprint}>{r.fingerprint.slice(0, 16)}…</code></dd></div>
      {r.pages !== null && r.pages !== undefined && <div><dt>Pages</dt><dd>{r.pages}</dd></div>}
      <div><dt>How it was read</dt><dd>{r.how_read ?? (lane.problem ? 'Not read' : 'Not yet')}</dd></div>
      <div><dt>Passages</dt><dd>{r.passages}</dd></div>
      {r.files_inside > 0 && <div><dt>Files inside</dt><dd>{r.files_inside}</dd></div>}
      <div><dt>Found</dt><dd>{found || 'Nothing yet'}{waiting ? <> · <b>{waiting} wait for you</b></> : null}</dd></div>
      <div><dt>Watchlist</dt><dd>{r.watchlist_hits ? `${r.watchlist_hits} name${r.watchlist_hits === 1 ? '' : 's'} you watch` : 'No watched names'}</dd></div>
      {r.flags_fed.length > 0 && <div><dt>Red Flags it fed</dt><dd>{r.flags_fed.join(', ')}</dd></div>}
    </dl>
    {lane.issues.length > 0 && <ul className="dp-issues">{lane.issues.map(i => <li key={i}>{i}</li>)}</ul>}
    <div className="dp-actions">
      <button type="button" onClick={() => openDocument(lane.document_id)}>Open in reading room</button>
      <button type="button" onClick={() => openProvenance({title: lane.filename, kind: 'document', documentId: lane.document_id})}>Trace</button>
      {reading && lane.job_id && <button type="button" className="dp-stop" onClick={() => void stop()}>Stop reading</button>}
      {waiting > 0 && <Link href={caseHref('/decide?kind=proposal', investigationId)}>Review what it found →</Link>}
    </div>
    {stopping && <p role="status" className="dp-quiet">{stopping}</p>}
  </aside>;
}

export function TheDrop({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const queryClient = useQueryClient();
  const [busyNow, setBusyNow] = useState(false);
  const query = useQuery({...getDropOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId),
    refetchInterval: q => (busyNow || q.state.data?.lanes.some(l => l.in_progress) ? 2000 : false)});
  const data = query.data;
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && singleKeysOn()) { e.preventDefault(); setOnly(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const send = async (list: File[]) => {
    if (!list.length || !investigationId) return;
    setBusyNow(true);
    let done = 0;
    for (const file of list) {
      setStatus(`Saving ${file.name} (${done + 1} of ${list.length})…`);
      try { await upload(investigationId, file.name.replace(/\.[^./]+$/, ''), file); done += 1; }
      catch (error) { setStatus(`${file.name}: ${errorMessage(error, 'not saved')}`); setBusyNow(false); return; }
    }
    setStatus(`${done} file${done === 1 ? '' : 's'} saved. Reading starts now; nothing leaves this computer.`);
    setBusyNow(false);
    await queryClient.invalidateQueries();
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void send(Array.from(e.dataTransfer.files)); };
  const onPaste = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    void send([new File([clean], `Pasted text ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.txt`, {type: 'text/plain'})]);
  };
  const choose = (e: ChangeEvent<HTMLInputElement>) => { void send(Array.from(e.target.files ?? [])); e.target.value = ''; };

  const lanes = useMemo(() => (data?.lanes ?? []).filter(l => !only || l.problem || l.in_progress)
    .sort((a, b) => Number(b.problem) - Number(a.problem)), [data, only]);
  const lane = data?.lanes.find(l => l.document_id === picked) ?? lanes[0];
  const empty = Boolean(data && !data.lanes.length);
  const t = data?.totals;

  return <section className={`dp${empty ? ' dp-empty' : ''}`} aria-label="The Drop">
    <div className={`dp-field${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      onPaste={e => { const text = e.clipboardData.getData('text'); if (text && !e.clipboardData.files.length) { e.preventDefault(); onPaste(text); } }} tabIndex={0}
      aria-label="Drop files here, or paste text">
      <p><b>Drop files or a folder here</b>, or paste text. {empty ? 'Each one is read on this computer: nothing leaves it.' : ''}</p>
      <span className="dp-pick">
        <button type="button" onClick={() => files.current?.click()}>Choose files</button>
        <button type="button" onClick={() => folder.current?.click()}>Choose a folder</button>
      </span>
      <input ref={files} type="file" multiple hidden onChange={choose}/>
      {/* @ts-expect-error webkitdirectory is a browser attribute React does not type */}
      <input ref={folder} type="file" multiple hidden webkitdirectory="" onChange={choose}/>
      {status && <p role="status" className="dp-status">{status}</p>}
    </div>

    {t && t.files > 0 && <>
      <div className="dp-card" aria-label="This drop">
        <span><b>{t.files}</b> file{t.files === 1 ? '' : 's'}{t.files_inside ? ` · ${t.files_inside} inside them` : ''}</span>
        <span><b>{t.read}</b> read · <b>{t.unread}</b> still to read</span>
        <span><b>{t.passages}</b> passages</span>
        <span className={t.problems ? 'bad' : ''}><b>{t.problems}</b> problem{t.problems === 1 ? '' : 's'}</span>
        <span className="dp-local">Nothing leaves this computer</span>
        <button type="button" className={`dp-filter${only ? ' on' : ''}`} aria-pressed={only} onClick={() => setOnly(o => !o)}>Problems & in progress <kbd>F</kbd></button>
      </div>

      <div className="dp-body">
        <div className="dp-line" role="region" aria-label="Digestion line">
          <div className="dp-head" aria-hidden="true"><span>File</span>{data!.stages.map(s => <span key={s.key}>{s.label}</span>)}</div>
          <ul>{lanes.map(l => <Lane key={l.document_id} lane={l} on={lane?.document_id === l.document_id} onPick={() => setPicked(l.document_id)}/>)}</ul>
          {!lanes.length && <p className="dp-quiet">No problems, and nothing still being read.</p>}
        </div>
        <div className="dp-side">
          {lane && <Receipt lane={lane} investigationId={investigationId}/>}
          <section className="dp-ready" aria-label="Ready for you">
            <p className="dp-eyebrow">Ready for you</p>
            {Object.keys(data!.ready_for_you).length ? <ul>{Object.entries(data!.ready_for_you).map(([k, n]) => <li key={k}>
              <Link href={caseHref('/decide?kind=proposal', investigationId)}><b>{n}</b> {kindWord(k, n)}</Link></li>)}</ul>
              : <p className="dp-quiet">Nothing found waits for you.</p>}
          </section>
        </div>
      </div>
    </>}
    {query.isError && <p role="alert">{errorMessage(query.error, 'Could not see what was brought in')}</p>}
  </section>;
}
