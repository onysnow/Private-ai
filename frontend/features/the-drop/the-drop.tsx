'use client';
// The Drop (Bring in; mockup INTAKE_1): bring files in, and watch each one go through
// seven stages (backend app/services/drop.py): Received, Checked, Read, Split into
// passages, Files inside, Names & facts, Ready for you. Three columns as the mockup draws
// them: the drop field, this drop and the chosen file's read receipt on the left; the
// digestion line in the middle, one lane per file (an e-mail's files beneath it, a big
// archive folded to one line), with what each waits for and a totals row; on the right
// what is ready for you, problems first, and the way into the reading room. A strip of
// the files runs along the bottom. J and K move between files, Enter opens the chosen one
// in the reading room, F shows only problems and files still in progress, O chooses files.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, DragEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {getDropOptions, getDropQueryKey, settingsStatusOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {cancelJobEndpoint, retryJobEndpoint} from '../../lib/generated/sdk.gen';
import type {DropLaneOut, DropOut, DropStageOut} from '../../lib/generated/types.gen';
import {singleKeysOn} from '../../lib/shortcuts';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {PagePicture} from '../case-home/decision-card';
import {upload} from '../documents/documents-panel';

const MARK: Record<DropStageOut['state'], string> = {done: '✓', active: '◐', waiting: '·', stopped: '✕', needs_you: '!', skipped: '–'};
const WORD: Record<DropStageOut['state'], string> = {done: 'done', active: 'working', waiting: 'waiting', stopped: 'stopped', needs_you: 'needs you', skipped: 'not needed'};
const KIND: Record<string, [string, string]> = {entity: ['name', 'names'], claim: ['claim', 'claims'], evidence: ['quote', 'quotes'],
  relationship: ['link', 'links'], event: ['date', 'dates'], identifier: ['identifier', 'identifiers']};
const kindWord = (k: string, n: number) => (KIND[k] ? KIND[k][n === 1 ? 0 : 1] : k);
const KindTitle = (k: string) => { const w = kindWord(k, 2); return w.charAt(0).toUpperCase() + w.slice(1); };
const LANGUAGES: Record<string, string> = {eng: 'English', fra: 'French', deu: 'German', spa: 'Spanish', ita: 'Italian', por: 'Portuguese', nld: 'Dutch', rus: 'Russian', ara: 'Arabic', chi_sim: 'Chinese'};
/** An archive with more files than this is folded to one line until you ask for all of them. */
const FOLD_OVER = 5;
/** Above this many files the line starts on problems and files in progress, and clean files fold to one line. */
const MANY = 40;

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

/** A stage's detail as the box shows it (mockup INTAKE_1: "✓ 214", "✓ 37"); the full words stay in its title. */
export function boxDetail(stage: DropStageOut): string {
  if (stage.key === 'received' || (stage.key === 'checked' && stage.detail !== '= same')) return '';
  if (stage.key === 'inside' && stage.state === 'skipped') return 'none';
  const n = /^(\d+)( of \d+)?/.exec(stage.detail);
  if (n && ['passages', 'names', 'ready', 'inside'].includes(stage.key)) return n[2] ? `${n[1]}${n[2].replace(' of ', '/')}` : n[1];
  return stage.detail;
}

/** Every lane, the files inside each after it, in the order they are drawn. */
export function flatLanes(lanes: DropLaneOut[]): DropLaneOut[] {
  return lanes.flatMap(l => [l, ...flatLanes(l.children ?? [])]);
}

/** Problems first: files that could not be read, then files read with something to say. */
export function problemsFirst(lanes: DropLaneOut[]): DropLaneOut[] {
  const all = flatLanes(lanes);
  return [...all.filter(l => l.problem), ...all.filter(l => !l.problem && l.issues.length)];
}

const isPdf = (name: string) => /\.pdf$/i.test(name);
const ext = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? 'file').toUpperCase();

function Thumb({lane, width}: {lane: DropLaneOut; width: number}): ReactElement {
  return isPdf(lane.filename) && lane.receipt.passages
    ? <PagePicture documentId={lane.document_id} page={1} width={width * 2} alt={`First page of ${lane.filename}`}/>
    : <span className="dp-thumb-kind" aria-hidden="true">{ext(lane.filename)}</span>;
}

type Actions = {retry: (lane: DropLaneOut) => void; pick: (id: string) => void};

function WaitingCell({lane, actions}: {lane: DropLaneOut; actions: Actions}): ReactElement {
  if (lane.same_as) return <button type="button" className="dp-act" onClick={e => { e.stopPropagation(); actions.pick(lane.same_as!); }}>Open that one</button>;
  if (lane.retry_job_id) return <button type="button" className="dp-act" onClick={e => { e.stopPropagation(); actions.retry(lane); }}>Try again</button>;
  if (lane.waiting) return <span className="dp-wait"><b>{lane.waiting}</b><span className="dp-chip">Proposed</span></span>;
  if (lane.in_progress) return <span className="dp-soon">{lane.stages.some(s => s.state === 'active') ? 'reading' : 'soon'}</span>;
  return <span className="dp-soon" aria-label="Nothing waits">–</span>;
}

function Lane({lane, on, onPick, actions, depth = 0}: {lane: DropLaneOut; on: string; onPick: (id: string) => void; actions: Actions; depth?: number}): ReactElement {
  const [all, setAll] = useState(false);
  const kids = lane.children ?? [];
  const folded = kids.length > FOLD_OVER && !all;
  const read = kids.filter(k => k.stages.find(s => s.key === 'read')?.state === 'done').length;
  const reading = kids.filter(k => k.stages.find(s => s.key === 'read')?.state === 'active').length;
  return <>
    <li className={`dp-lane${on === lane.document_id ? ' on' : ''}${lane.problem ? ' problem' : ''}${depth ? ' inside' : ''}`}>
      <button type="button" onClick={() => onPick(lane.document_id)} aria-pressed={on === lane.document_id}
        aria-label={`${lane.filename}: ${lane.note}. ${lane.stages.map(s => `${s.label} ${WORD[s.state]}`).join(', ')}`}>
        <span className="dp-file" title={lane.filename}><b>{depth ? <span aria-hidden="true">↳ </span> : null}{lane.filename}</b>
          <small className={lane.problem ? 'bad' : lane.issues.length ? 'warn' : ''}>{lane.problem ? '✕ ' : lane.issues.length ? '⚠ ' : ''}{lane.note}</small></span>
        {lane.stages.map(s => <span key={s.key} className={`dp-stage dp-${s.state}`} title={`${s.label}: ${WORD[s.state]}${s.detail ? ` · ${s.detail}` : ''}`}>
          <i aria-hidden="true">{MARK[s.state]}</i><small>{boxDetail(s)}</small></span>)}
      </button>
      <span className="dp-waiting-cell"><WaitingCell lane={lane} actions={actions}/></span>
    </li>
    {folded ? <li className="dp-fold">
      <span><b>{read} of {kids.length} read</b>{reading ? ` · ${reading} reading` : ''}{kids.length - read - reading ? ` · ${kids.length - read - reading} waiting` : ''}</span>
      <i className="dp-fold-bar" aria-hidden="true"><i style={{width: `${(100 * read) / kids.length}%`}}/></i>
      <button type="button" onClick={() => setAll(true)}>Show all {kids.length}</button>
    </li> : kids.map(k => <Lane key={k.document_id} lane={k} on={on} onPick={onPick} actions={actions} depth={depth + 1}/>)}
    {kids.length > FOLD_OVER && all && <li className="dp-fold"><button type="button" onClick={() => setAll(false)}>Fold the {kids.length} files inside {lane.filename}</button></li>}
  </>;
}

function Receipt({lane, investigationId}: {lane: DropLaneOut; investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const [stopping, setStopping] = useState('');
  const [copied, setCopied] = useState(false);
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
  const verdict = lane.problem ? ['Not read', 'bad'] : reading ? ['Reading', ''] : lane.issues.length ? ['Read, with notes', 'warn'] : ['Read cleanly', 'good'];
  const copy = () => { void navigator.clipboard?.writeText(r.fingerprint).then(() => setCopied(true)); };
  return <section className="dp-card dp-receipt" aria-label={`Read receipt: ${lane.filename}`}>
    <p className="dp-eyebrow">Read receipt</p>
    <div className="dp-receipt-top">
      <span className="dp-receipt-thumb"><Thumb lane={lane} width={60}/></span>
      <span><h3>{lane.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')}</h3><code>{lane.filename}</code>
        <span className={`dp-verdict ${verdict[1]}`}>{verdict[1] === 'good' ? '✓ ' : verdict[1] === 'bad' ? '✕ ' : ''}{verdict[0]}</span></span>
    </div>
    <dl>
      <div><dt>Fingerprint</dt><dd><code title={r.fingerprint}>SHA-256 {r.fingerprint.slice(0, 6)}…{r.fingerprint.slice(-4)}</code>
        <button type="button" className="dp-copy" onClick={copy} aria-label="Copy the fingerprint">{copied ? '✓' : '⧉'}</button></dd></div>
      {r.pages !== null && r.pages !== undefined && <div><dt>Pages</dt><dd>{r.pages}{r.how_read ? ` · ${r.how_read}` : ''}</dd></div>}
      <div><dt>Read</dt><dd>{r.how_read ? `${r.how_read}${lane.seconds !== null && lane.seconds !== undefined ? ` · ${lane.seconds} s` : ''}` : lane.problem ? 'Not read' : 'Not yet'}</dd></div>
      <div><dt>Passages</dt><dd>{r.passages}</dd></div>
      {r.files_inside > 0 && <div><dt>Files inside</dt><dd>{r.files_inside}</dd></div>}
      <div><dt>Proposals</dt><dd>{found || 'Nothing yet'}{waiting ? <> · <b>{waiting} wait</b></> : null}</dd></div>
      <div><dt>Watchlist</dt><dd>{r.watchlist_hits ? `${r.watchlist_hits} hit${r.watchlist_hits === 1 ? '' : 's'}` : 'No watched names'}</dd></div>
      {r.flags_fed.length > 0 && <div><dt>Feeds</dt><dd>{r.flags_fed.join(', ')}</dd></div>}
    </dl>
    {lane.issues.length > 0 && <ul className="dp-issues">{lane.issues.map(i => <li key={i}>{i}</li>)}</ul>}
    <div className="dp-actions">
      <button type="button" className="p" onClick={() => openDocument(lane.document_id)}>Open in reading room</button>
      <button type="button" onClick={() => openProvenance({title: lane.filename, kind: 'document', documentId: lane.document_id})}>Trace</button>
      {reading && lane.job_id && <button type="button" className="dp-stop" onClick={() => void stop()}>Stop reading</button>}
    </div>
    {stopping && <p role="status" className="dp-quiet">{stopping}</p>}
  </section>;
}

function Totals({data}: {data: DropOut}): ReactElement {
  const by = data.totals.by_stage ?? {};
  const most = Math.max(1, data.totals.files);
  const clean = data.lanes.filter(l => !l.problem && !l.issues.length && !l.in_progress).length;
  return <li className="dp-totals" aria-label="All files, stage by stage">
    <span className="dp-file"><b>All {data.totals.files} files</b><small>{clean} read cleanly</small></span>
    {data.stages.map(s => <span key={s.key} className="dp-total" title={`${s.label}: ${by[s.key] ?? 0} of ${data.totals.files}`}>
      <i style={{height: `${Math.max(3, (22 * (by[s.key] ?? 0)) / most)}px`}}/><small>{by[s.key] ?? 0}</small></span>)}
    <span/>
  </li>;
}

export function TheDrop({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const queryClient = useQueryClient();
  const [busyNow, setBusyNow] = useState(false);
  const query = useQuery({...getDropOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId),
    refetchInterval: q => (busyNow || q.state.data?.lanes.some(l => l.in_progress) ? 2000 : false)});
  const settings = useQuery({...settingsStatusOptions()}).data;
  const data = query.data;
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState(false);
  const [showClean, setShowClean] = useState(false);
  const many = (query.data?.lanes.length ?? 0) > MANY;
  const startedMany = useRef(false);
  useEffect(() => { if (many && !startedMany.current) { startedMany.current = true; setOnly(true); } }, [many]);
  const [picked, setPicked] = useState<string | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  const lanes = useMemo(() => (data?.lanes ?? []).filter(l => !only || l.problem || l.in_progress || flatLanes(l.children ?? []).some(k => k.problem || k.in_progress))
    .sort((a, b) => Number(b.problem) - Number(a.problem)), [data, only]);
  const every = useMemo(() => flatLanes(data?.lanes ?? []), [data]);
  const lane = every.find(l => l.document_id === picked) ?? lanes[0];
  const problems = useMemo(() => problemsFirst(data?.lanes ?? []), [data]);
  const strip = data?.lanes ?? [];
  const at = Math.max(0, strip.findIndex(l => l.document_id === lane?.document_id || flatLanes(l.children ?? []).some(k => k.document_id === lane?.document_id)));
  const firstToRead = problems.find(l => !l.problem) ?? every.find(l => l.waiting) ?? lane;

  const move = useCallback((step: number) => {
    const order = flatLanes(lanes);
    if (!order.length) return;
    const i = order.findIndex(l => l.document_id === lane?.document_id);
    setPicked(order[Math.min(order.length - 1, Math.max(0, i + step))].document_id);
  }, [lanes, lane]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || !singleKeysOn()) return;
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); setOnly(o => !o); }
      else if (k === 'j') { e.preventDefault(); move(1); }
      else if (k === 'k') { e.preventDefault(); move(-1); }
      else if (k === 'o') { e.preventDefault(); files.current?.click(); }
      else if (e.key === 'Enter' && lane && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) { e.preventDefault(); openDocument(lane.document_id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, move, lane, openDocument]);

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
  const actions: Actions = {
    pick: setPicked,
    retry: l => {
      if (!l.retry_job_id) return;
      setStatus(`Reading ${l.filename} again…`);
      retryJobEndpoint({path: {job_id: l.retry_job_id}, throwOnError: true})
        .then(() => queryClient.invalidateQueries({queryKey: getDropQueryKey({path: {investigation_id: investigationId}})}))
        .then(() => setStatus(`${l.filename} is being read again.`))
        .catch(error => setStatus(errorMessage(error, 'Could not start it again')));
    },
  };

  const empty = Boolean(data && !data.lanes.length);
  const t = data?.totals;
  const ready = data ? Object.values(data.ready_for_you).reduce((a, b) => a + b, 0) : 0;
  const ocr = settings?.document_extraction;
  const language = ocr ? ocr.pdf_ocr_language.split('+').map(c => LANGUAGES[c] ?? c).join(' + ') : '';
  const byOpenAleph = settings?.document_extraction.entity_extraction_owner === 'openaleph_ftm_analyze';

  const field = <div className={`dp-field${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
    onPaste={e => { const text = e.clipboardData.getData('text'); if (text && !e.clipboardData.files.length) { e.preventDefault(); onPaste(text); } }} tabIndex={0}
    aria-label="Drop files here, or paste text">
    <span className="dp-arrow" aria-hidden="true">↓</span>
    <p><b>Drop files, a folder, or paste text</b></p>
    <p className="dp-quiet">or press <kbd>O</kbd> to <button type="button" className="dp-link" onClick={() => files.current?.click()}>choose files</button>
      {' · '}<button type="button" className="dp-link" onClick={() => folder.current?.click()}>a folder</button></p>
    <input ref={files} type="file" multiple hidden onChange={choose}/>
    {/* @ts-expect-error webkitdirectory is a browser attribute React does not type */}
    <input ref={folder} type="file" multiple hidden webkitdirectory="" onChange={choose}/>
    {status && <p role="status" className="dp-status">{status}</p>}
  </div>;

  if (!data || empty) return <section className="dp dp-empty" aria-label="The Drop">
    {field}
    {empty && <p className="dp-quiet">Each file is read on this computer: nothing leaves it.</p>}
    {query.isError && <p role="alert">{errorMessage(query.error, 'Could not see what was brought in')}</p>}
  </section>;

  return <section className="dp" aria-label="The Drop">
    <nav className="dp-tabs" aria-label="The Drop">
      <span className="on" aria-current="page">Digestion line</span>
      <Link href={caseHref('/bring-in#document-ingestion', investigationId)}>Library <small>{every.length}</small></Link>
      <span className="off" title="Not built yet: every drop, with what it brought in">History</span>
      {t!.unread > 0 && <span className="dp-live"><i aria-hidden="true"/>Reading · {t!.unread} file{t!.unread === 1 ? '' : 's'}</span>}
    </nav>

    <div className="dp-left">
      {field}
      <section className="dp-card" aria-label="This drop">
        <p className="dp-eyebrow">This drop</p>
        {t!.started_at && <p className="dp-quiet">Since {new Date(t!.started_at).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</p>}
        <dl>
          <div><dt>Files</dt><dd>{t!.files} dropped{t!.files_inside ? ` · ${t!.files_inside} inside` : ''}</dd></div>
          {ocr && <div><dt>OCR language</dt><dd>{ocr.pdf_ocr_enabled ? language : 'OCR off'}</dd></div>}
        </dl>
        <p className="dp-local">Nothing leaves this computer{byOpenAleph ? ': OpenAleph runs here.' : ': every file is read here.'}</p>
      </section>
      {lane && <Receipt lane={lane} investigationId={investigationId}/>}
      <section className="dp-card" aria-label="What happens next">
        <p className="dp-eyebrow">What happens next</p>
        <p className="dp-quiet">Accepted names and claims join the case. Nothing is added until you accept it.</p>
      </section>
    </div>

    <div className="dp-line" role="region" aria-label="Digestion line">
      <header className="dp-line-head">
        <h2>Digestion line</h2><span className="dp-quiet">Each file, step by step. J and K move through files.</span>
        <span className="dp-all">All {t!.files}</span>
        <button type="button" className={`dp-filter${only ? ' on' : ''}`} aria-pressed={only} onClick={() => setOnly(o => !o)}>Problems & in progress <kbd>F</kbd></button>
      </header>
      <div className="dp-head" aria-hidden="true"><span>File</span>{data.stages.map(s => <span key={s.key}>{s.label}</span>)}<span>Waiting</span></div>
      <ul>
        {(many && !showClean ? lanes.filter(l => l.problem || l.in_progress || l.issues.length || l.waiting) : lanes)
          .map(l => <Lane key={l.document_id} lane={l} on={lane?.document_id ?? ''} onPick={setPicked} actions={actions}/>)}
        {many && !only && <li className="dp-fold"><span><b>{lanes.filter(l => !(l.problem || l.in_progress || l.issues.length || l.waiting)).length} read cleanly</b>, nothing waits</span>
          <button type="button" onClick={() => setShowClean(c => !c)}>{showClean ? 'Fold them' : 'Show them'}</button></li>}
        {!lanes.length && <li className="dp-quiet">No problems, and nothing still being read.</li>}
        <Totals data={data}/>
      </ul>
      <footer className="dp-legend">
        {(['done', 'active', 'waiting', 'needs_you', 'stopped'] as const).map(s => <span key={s}><i className={`dp-stage dp-${s}`} aria-hidden="true">{MARK[s]}</i>{WORD[s]}</span>)}
        <span className="dp-by">Proposed by: {byOpenAleph ? 'OpenAleph' : 'the Workbench’s name-finder (rules)'} · <span className="ai-tag">AI</span> none in a drop</span>
      </footer>
    </div>

    <div className="dp-right">
      <section className="dp-card dp-ready" aria-label="Ready for you">
        <p className="dp-eyebrow">Ready for you</p>
        <p className="dp-big">{ready}</p>
        <p className="dp-quiet">proposal{ready === 1 ? '' : 's'} waiting{data.ready_from ? `, from ${data.ready_from} document${data.ready_from === 1 ? '' : 's'}` : ''}</p>
        {ready > 0 && <ul>{Object.entries(data.ready_for_you).sort((a, b) => b[1] - a[1]).map(([k, n]) => <li key={k}>
          <Link href={caseHref('/decide?kind=proposal', investigationId)} aria-label={`${n} ${kindWord(k, n)} proposed`}><span className="dp-chip">Proposed</span><span>{KindTitle(k)}</span><b>{n}</b></Link></li>)}</ul>}
        {(data.ready_unsure ?? 0) > 0 && <p className="dp-unsure">{data.ready_unsure} {data.ready_unsure === 1 ? 'is' : 'are'} medium or low and ask{data.ready_unsure === 1 ? 's' : ''} a question</p>}
      </section>
      <section className="dp-card" aria-label="Problems first">
        <p className="dp-eyebrow">Problems first</p>
        {problems.length ? <ol className="dp-problems">{problems.slice(0, 6).map((p, i) => <li key={p.document_id}>
          <span className="dp-n">{i + 1}</span><i className={`dp-stage ${p.problem ? 'dp-stopped' : 'dp-needs_you'}`} aria-hidden="true">{p.problem ? '✕' : '!'}</i>
          <button type="button" onClick={() => setPicked(p.document_id)}><b>{p.filename}</b><small>{p.note}</small></button></li>)}</ol>
          : <p className="dp-quiet">No problems in this drop.</p>}
      </section>
      {data.watchlist && data.watchlist.hits > 0 && <p className="dp-watch"><i aria-hidden="true">◉</i><b>{data.watchlist.hits} watchlist hit{data.watchlist.hits === 1 ? '' : 's'}</b> · {data.watchlist.names.slice(0, 3).join(', ')}</p>}
      {firstToRead && <button type="button" className="dp-cta" onClick={() => openDocument(firstToRead.document_id)}>
        Open the reading room{problems.length ? ' — problems first' : ''}<kbd aria-hidden="true">⏎</kbd></button>}
      <p className="dp-keys"><kbd>J</kbd><kbd>K</kbd> move · <kbd>⏎</kbd> open in reading room · <kbd>F</kbd> problems only · <kbd>O</kbd> choose files · <kbd>?</kbd> all keys</p>
    </div>

    <nav className="dp-strip" aria-label="Files in this drop">
      <ol>{strip.map(l => <li key={l.document_id}><button type="button" className={strip[at]?.document_id === l.document_id ? 'on' : ''} title={l.filename}
        aria-label={l.filename} onClick={() => setPicked(l.document_id)}><Thumb lane={l} width={44}/></button></li>)}</ol>
      <span className="dp-count">{at + 1} / {strip.length}</span>
    </nav>
    {query.isError && <p role="alert">{errorMessage(query.error, 'Could not see what was brought in')}</p>}
  </section>;
}
