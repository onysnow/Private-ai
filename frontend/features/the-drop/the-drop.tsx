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
// The line is a keyboard grid (role="grid", research §2): Tab enters it, the arrow keys move
// cell by cell (Home / End along a row, Page Up / Down ten files), Enter on a file shows its
// receipt and on a button presses it. While files are read the line follows one event stream
// per file (drop-stream.ts, ADR-0014) and polls only when the stream cannot connect. A read
// that has not moved for six minutes says so ("No progress for 6 min") with Check. A file
// already in the case is not saved again: it is named with "Open that one" and "Keep a second
// copy". History lists every drop with what it produced; a drop can be shown alone on the line.
// Motion (research §2): a file that arrives slides into its lane, each box's mark steps when its stage
// changes (a ✓ presses, a stop notches, never a shake); pointing at a file lifts it and shows its receipt.
// Calm motion and reduced motion make these instant (styles/themes.css), and a log under the line says
// what was read or could not be, which a screen reader also hears.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, DragEvent, FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactElement} from 'react';

import {ApiHttpError, errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {getCapturesQueryKey, getDropHistoryOptions, getDropHistoryQueryKey, getDropOptions, getDropQueryKey, listDocumentsOptions, listInvestigationsOptions, settingsStatusOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {cancelJobEndpoint, createCapture, createIngestionBatch, retryJobEndpoint} from '../../lib/generated/sdk.gen';
import type {DropHistoryEntryOut, DropLaneOut, DropOut, DropProposerOut, DropStageOut} from '../../lib/generated/types.gen';
import {singleKeysOn} from '../../lib/shortcuts';
import {apiTime} from '../../lib/timestamps';
import {proposerName} from '../reading-room/proposers';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {PagePicture} from '../case-home/decision-card';
import {batchLabel, upload} from '../documents/documents-panel';
import {useDropStream} from './drop-stream';
import {CaptureLinkField, Captures, isWebAddress, sameLink, useCaptures} from './captures';

const MARK: Record<DropStageOut['state'], string> = {done: '✓', active: '◐', waiting: '·', stopped: '✕', needs_you: '!', skipped: '–'};
const WORD: Record<DropStageOut['state'], string> = {done: 'done', active: 'working', waiting: 'waiting', stopped: 'stopped', needs_you: 'needs you', skipped: 'not needed'};
/** A read that has not moved: its own shape (an hourglass that does not turn) and word. */
const STALLED_MARK = '⧗';
const STALLED_WORD = 'no progress';
const isStalled = (lane: DropLaneOut, s: DropStageOut) => s.key === 'read' && lane.stalled_minutes !== null && lane.stalled_minutes !== undefined;
const KIND: Record<string, [string, string]> = {entity: ['name', 'names'], claim: ['claim', 'claims'], evidence: ['quote', 'quotes'],
  relationship: ['link', 'links'], event: ['date', 'dates'], identifier: ['email or phone', 'emails & phones']};
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
  // A stopped box shows only its ✕ (mockup INTAKE_1); the reason is in its title, its name and the line under the file.
  if (stage.state === 'stopped' && stage.key !== 'inside') return '';
  const n = /^(\d+)( of \d+)?/.exec(stage.detail);
  if (n && ['passages', 'names', 'ready', 'inside'].includes(stage.key)) return n[2] ? `${n[1]}${n[2].replace(' of ', '/')}` : n[1];
  return stage.detail;
}

/** Every lane, the files inside each after it, in the order they are drawn. */
export function flatLanes(lanes: DropLaneOut[]): DropLaneOut[] {
  return lanes.flatMap(l => [l, ...flatLanes(l.children ?? [])]);
}

const stalledLane = (l: DropLaneOut) => l.stalled_minutes !== null && l.stalled_minutes !== undefined;

/** Problems first: files that could not be read, then reads that stopped moving, then files read with something to say. */
export function problemsFirst(lanes: DropLaneOut[]): DropLaneOut[] {
  const all = flatLanes(lanes);
  return [...all.filter(l => l.problem), ...all.filter(l => !l.problem && stalledLane(l)), ...all.filter(l => !l.problem && !stalledLane(l) && l.issues.length)];
}

const isPdf = (name: string) => /\.pdf$/i.test(name);
const ext = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? 'file').toUpperCase();

function Thumb({lane, width}: {lane: DropLaneOut; width: number}): ReactElement {
  return isPdf(lane.filename) && lane.receipt.passages
    ? <PagePicture documentId={lane.document_id} page={1} width={Math.max(120, width * 2)} alt={`First page of ${lane.filename}`}/>
    : <span className="dp-thumb-kind" aria-hidden="true">{ext(lane.filename)}</span>;
}

type Actions = {retry: (lane: DropLaneOut) => void; pick: (id: string) => void; hover: (id: string | null) => void};

/** A box's mark. Keyed by its stage's state, so a change of state makes a new mark, which steps in when step was true
 *  as it was made (research §2: a ✓ presses, a stop notches); the first marks of a file do not. */
function Mark({step, children}: {step: boolean; children: string}): ReactElement {
  const [moved] = useState(step);
  return <i aria-hidden="true" className={moved ? 'dp-step' : undefined}>{children}</i>;
}
/** Which cell of the grid Tab lands on: 0 for that one cell, -1 for every other (a roving tab stop). */
type TabStop = (row: string, col: number) => 0 | -1;

// Buttons inside the grid's cells are pressed with Enter on their cell, so Tab does not stop on each of them.
function WaitingCell({lane, actions}: {lane: DropLaneOut; actions: Actions}): ReactElement {
  if (lane.same_as) return <button type="button" tabIndex={-1} className="dp-act" onClick={e => { e.stopPropagation(); actions.pick(lane.same_as!); }}>Open that one</button>;
  if (lane.retry_job_id) return <button type="button" tabIndex={-1} className="dp-act" onClick={e => { e.stopPropagation(); actions.retry(lane); }}>Try again</button>;
  if (lane.stalled_minutes !== null && lane.stalled_minutes !== undefined) return <button type="button" tabIndex={-1} className="dp-act dp-check"
    onClick={e => { e.stopPropagation(); actions.pick(lane.document_id); }}>Check</button>;
  if (lane.waiting) return <span className="dp-wait"><b>{lane.waiting}</b><span className="dp-chip">Proposed</span></span>;
  if (lane.in_progress) return <span className="dp-soon">{lane.stages.some(s => s.state === 'active') ? 'reading' : 'soon'}</span>;
  return <span className="dp-soon" aria-label="Nothing waits">–</span>;
}

/** A box's accessible name, as research §3 words it: "Fernhill board minutes, Read: working, OCR, page 12 of 40". */
export function boxName(lane: DropLaneOut, s: DropStageOut): string {
  const word = isStalled(lane, s) ? STALLED_WORD : WORD[s.state];
  return `${lane.filename}, ${s.label}: ${word}${s.detail ? `, ${s.detail}` : ''}`;
}

function Lane({lane, on, onPick, actions, tab, fresh, depth = 0}: {lane: DropLaneOut; on: string; onPick: (id: string) => void; actions: Actions; tab: TabStop;
  fresh: (id: string) => boolean; depth?: number}): ReactElement {
  const [all, setAll] = useState(false);
  // A file that arrives after the line was first drawn slides into place, once.
  const [arrived] = useState(() => fresh(lane.document_id));
  const drawn = useRef(false);
  useEffect(() => { drawn.current = true; }, []);
  const kids = lane.children ?? [];
  const folded = kids.length > FOLD_OVER && !all;
  const read = kids.filter(k => k.stages.find(s => s.key === 'read')?.state === 'done').length;
  const reading = kids.filter(k => k.stages.find(s => s.key === 'read')?.state === 'active').length;
  const id = lane.document_id;
  return <>
    <div role="row" data-row={id} aria-selected={on === id} onClick={() => onPick(id)} onMouseEnter={() => actions.hover(id)}
      className={`dp-lane${on === id ? ' on' : ''}${lane.problem ? ' problem' : ''}${depth ? ' inside' : ''}${arrived ? ' dp-arrive' : ''}`}>
      <span role="rowheader" tabIndex={tab(id, 0)} className="dp-file" title={lane.filename}><b>{depth ? <span aria-hidden="true">↳ </span> : null}{lane.filename}</b>
        <small className={lane.problem ? 'bad' : lane.issues.length || lane.stalled_minutes ? 'warn' : ''}>
          {lane.problem ? '✕ ' : lane.stalled_minutes ? `${STALLED_MARK} ` : lane.issues.length ? '⚠ ' : ''}{lane.note}</small></span>
      {lane.stages.map((s, i) => {
        const stalled = isStalled(lane, s);
        return <span key={s.key} role="gridcell" tabIndex={tab(id, i + 1)} aria-label={boxName(lane, s)} title={`${s.label}: ${stalled ? STALLED_WORD : WORD[s.state]}${s.detail ? ` · ${s.detail}` : ''}`}
          className={`dp-stage dp-${s.state}${stalled ? ' dp-stalled' : ''}`}>
          <Mark key={stalled ? 'stalled' : s.state} step={drawn.current}>{stalled ? STALLED_MARK : MARK[s.state]}</Mark><small aria-hidden="true">{stalled ? `${lane.stalled_minutes} min` : boxDetail(s)}</small></span>;
      })}
      <span role="gridcell" tabIndex={tab(id, 8)} className="dp-waiting-cell"><WaitingCell lane={lane} actions={actions}/></span>
    </div>
    {folded ? <div role="row" data-row={`fold:${id}`} className="dp-fold">
      <span role="gridcell" aria-colspan={9} tabIndex={tab(`fold:${id}`, 0)}>
        <span><b>{read} of {kids.length} read</b>{reading ? ` · ${reading} reading` : ''}{kids.length - read - reading ? ` · ${kids.length - read - reading} waiting` : ''}</span>
        <i className="dp-fold-bar" aria-hidden="true"><i style={{width: `${(100 * read) / kids.length}%`}}/></i>
        <button type="button" tabIndex={-1} onClick={() => setAll(true)}>Show all {kids.length}</button>
      </span>
    </div> : kids.map(k => <Lane key={k.document_id} lane={k} on={on} onPick={onPick} actions={actions} tab={tab} fresh={fresh} depth={depth + 1}/>)}
    {kids.length > FOLD_OVER && all && <div role="row" data-row={`unfold:${id}`} className="dp-fold">
      <span role="gridcell" aria-colspan={9} tabIndex={tab(`unfold:${id}`, 0)}>
        <button type="button" tabIndex={-1} onClick={() => setAll(false)}>Fold the {kids.length} files inside {lane.filename}</button></span></div>}
  </>;
}

/** Arrow keys over the grid's cells (WAI-ARIA grid): the cell to move to for a key, or null for a key the grid leaves alone. */
export function gridMove(key: string, ctrl: boolean, at: {row: number; col: number}, rows: number[]): {row: number; col: number} | null {
  let {row, col} = at;
  if (key === 'ArrowRight') col += 1;
  else if (key === 'ArrowLeft') col -= 1;
  else if (key === 'ArrowDown') row += 1;
  else if (key === 'ArrowUp') row -= 1;
  else if (key === 'PageDown') row += 10;
  else if (key === 'PageUp') row -= 10;
  else if (key === 'Home') { col = 0; if (ctrl) row = 0; }
  else if (key === 'End') { col = Number.MAX_SAFE_INTEGER; if (ctrl) row = rows.length - 1; }
  else return null;
  row = Math.min(rows.length - 1, Math.max(0, row));
  return {row, col: Math.min(rows[row] - 1, Math.max(0, col))};
}

const CELL = '[role="gridcell"],[role="rowheader"],[role="columnheader"]';

function DropHistory({investigationId, onShow}: {investigationId: string; onShow: (entry: DropHistoryEntryOut) => void}): ReactElement {
  const history = useQuery({...getDropHistoryOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  if (history.isPending) return <p className="dp-quiet">Reading the history…</p>;
  if (history.isError) return <p role="alert">{errorMessage(history.error, 'Could not read the history')}</p>;
  const drops = history.data.drops;
  if (!drops.length) return <p className="dp-quiet">Nothing has been brought in yet.</p>;
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  return <ol className="dp-history" aria-label="Every drop, newest first">{drops.map(d => {
    const found = Object.entries(d.proposals).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c} ${kindWord(k, c)}`).join(', ');
    return <li key={d.id}>
      <header><b>{d.label}</b><time dateTime={String(d.created_at)}>{apiTime(d.created_at).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</time>
        {d.one_at_a_time && <span className="dp-chip">One at a time</span>}</header>
      <p className="dp-quiet">{[n(d.files, 'file saved', 'files saved'), d.files_inside ? `${d.files_inside} inside them` : '', d.duplicates ? `${d.duplicates} already in the case` : '',
        d.refused ? `${d.refused} not taken` : ''].filter(Boolean).join(' · ')}</p>
      <ul className="dp-produced" aria-label="What it produced">
        <li><i className="dp-stage dp-done" aria-hidden="true">✓</i>{d.read} read</li>
        {d.problems > 0 && <li><i className="dp-stage dp-stopped" aria-hidden="true">✕</i>{d.problems} could not be read</li>}
        {d.in_progress > 0 && <li><i className="dp-stage dp-waiting" aria-hidden="true">·</i>{d.in_progress} still to read</li>}
        <li>{n(d.passages, 'passage')}</li>
        <li>{found ? `${found} found` : 'No names or facts found'}</li>
        {d.accepted > 0 && <li>{d.accepted} accepted</li>}
        {d.waiting > 0 && <li><i className="dp-stage dp-needs_you" aria-hidden="true">!</i>{d.waiting} wait{d.waiting === 1 ? 's' : ''} for you</li>}
      </ul>
      {d.document_ids.length > 0 && <button type="button" className="dp-act" onClick={() => onShow(d)}>Show it on the line</button>}
    </li>;
  })}</ol>;
}

type Duplicate = {file: File; existingId: string; existingName: string};

/** The document an upload's 409 names (the same bytes already in the case). */
function duplicateOf(error: unknown): {id: string; filename: string} | null {
  if (!(error instanceof ApiHttpError) || error.status !== 409) return null;
  const doc = error.body?.document as {id?: unknown; filename?: unknown} | undefined;
  return doc && typeof doc.id === 'string' ? {id: doc.id, filename: typeof doc.filename === 'string' ? doc.filename : ''} : null;
}

/** An upload whose file was saved but could not be read (422 with the document): it is on the line, stopped at Read. */
function savedUnread(error: unknown): {filename: string; reason: string} | null {
  if (!(error instanceof ApiHttpError) || error.status !== 422) return null;
  const doc = error.body?.document as {filename?: unknown} | undefined;
  if (!doc) return null;
  const reason = typeof error.body?.error === 'string' && error.body.error ? error.body.error : 'it could not be read';
  return {filename: typeof doc.filename === 'string' ? doc.filename : '', reason};
}

/** An upload's failure in words, without the address it was sent to. */
const notSaved = (error: unknown) => (error instanceof ApiHttpError ? error.detail : errorMessage(error, 'not saved'));

/** What the log under the line says when a file finishes or stops (research §2: summaries and failures, never every stage). */
export function laneNews(lane: DropLaneOut): string {
  if (lane.problem) return `${lane.filename} could not be read: ${lane.note}`;
  const found = Object.values(lane.receipt.proposals).reduce((a, b) => a + b, 0);
  return `${lane.filename} read: ${lane.receipt.passages} passage${lane.receipt.passages === 1 ? '' : 's'}, ${found} proposal${found === 1 ? '' : 's'}`;
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
  const proposers = byProposer(r.by_proposer ?? []);
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
      {proposers.length > 0 && <div title="An accept you corrected first counts as accepted: corrections are not recorded apart.">
        <dt>By proposer</dt><dd><ul className="dp-proposers" aria-label="What each proposer's proposals came to">{proposers.map(p => <li key={p.name}>
          {p.name}: {p.accepted} of {p.accepted + p.rejected} accepted{p.waiting ? ` · ${p.waiting} wait${p.waiting === 1 ? 's' : ''}` : ''}</li>)}</ul></dd></div>}
      <div><dt>Watchlist</dt><dd>{r.watchlist_hits ? `${r.watchlist_hits} hit${r.watchlist_hits === 1 ? '' : 's'}` : 'No watched names'}</dd></div>
      {r.flags_fed.length > 0 && <div><dt>Feeds</dt><dd>{r.flags_fed.join(', ')}</dd></div>}
    </dl>
    {lane.issues.length > 0 && <ul className="dp-issues">{lane.issues.map(i => <li key={i}>{i}</li>)}</ul>}
    {lane.stalled_minutes !== null && lane.stalled_minutes !== undefined && <p className="dp-stall" role="note"><i aria-hidden="true">{STALLED_MARK}</i>
      {lane.stages.find(s => s.key === 'read')?.detail}. {lane.job_id ? 'Stop reading, then read it again with Try again.' : 'Nothing else is being read; the reader may not be running.'}</p>}
    <div className="dp-actions">
      <button type="button" className="p" onClick={() => openDocument(lane.document_id)}>Open in reading room</button>
      <button type="button" onClick={() => openProvenance({title: lane.filename, kind: 'document', documentId: lane.document_id})}>Trace</button>
      {reading && lane.job_id && <button type="button" className="dp-stop" onClick={() => void stop()}>Stop reading</button>}
    </div>
    {stopping && <p role="status" className="dp-quiet">{stopping}</p>}
  </section>;
}

/** What each proposer's answered proposals came to on a receipt (research §05 "revision rate": "Name-finder: 31 of 40
 *  accepted"), proposers with the same name together, most answered first. One with nothing answered yet is left out. */
export function byProposer(rows: DropProposerOut[]): {name: string; accepted: number; rejected: number; waiting: number}[] {
  const by = new Map<string, {name: string; accepted: number; rejected: number; waiting: number}>();
  for (const row of rows) {
    const name = proposerName(row.rule);
    const one = by.get(name) ?? {name, accepted: 0, rejected: 0, waiting: 0};
    one.accepted += row.accepted; one.rejected += row.rejected; one.waiting += row.waiting;
    by.set(name, one);
  }
  return [...by.values()].filter(p => p.accepted + p.rejected > 0)
    .sort((a, b) => b.accepted + b.rejected - (a.accepted + a.rejected) || a.name.localeCompare(b.name));
}

function Totals({data, tab}: {data: DropOut; tab: TabStop}): ReactElement {
  const by = data.totals.by_stage ?? {};
  const most = Math.max(1, data.totals.files);
  const clean = data.lanes.filter(l => !l.problem && !l.issues.length && !l.in_progress).length;
  return <div role="row" data-row="totals" className="dp-totals" aria-label="All files, stage by stage">
    <span role="rowheader" tabIndex={tab('totals', 0)} className="dp-file"><b>All {data.totals.files} files</b><small>{clean} read cleanly</small></span>
    {data.stages.map((s, i) => <span key={s.key} role="gridcell" tabIndex={tab('totals', i + 1)} className="dp-total" aria-label={`${s.label}: ${by[s.key] ?? 0} of ${data.totals.files}`}
      title={`${s.label}: ${by[s.key] ?? 0} of ${data.totals.files}`}>
      <i style={{height: `${Math.max(3, (22 * (by[s.key] ?? 0)) / most)}px`}}/><small>{by[s.key] ?? 0}</small></span>)}
    <span role="gridcell" tabIndex={tab('totals', 8)}/>
  </div>;
}

/** The empty Drop's way to the sample case (research §2 "Empty"), offered only when that case has
 * documents to bring in: the sample (POST /api/demo/seed) holds sources and evidence but no files,
 * and a link to an empty case teaches nothing. */
function SampleCaseLink({investigationId}: {investigationId: string}): ReactElement | null {
  const sample = useQuery({...listInvestigationsOptions()}).data?.find(c => c.is_demo && c.id !== investigationId);
  const files = useQuery({...listDocumentsOptions({path: {investigation_id: sample?.id ?? ''}, query: {limit: 1}}), enabled: Boolean(sample)}).data;
  if (!sample || !files?.length) return null;
  return <p className="dp-quiet"><Link className="dp-link" href={caseHref('/bring-in', sample.id)}>Try with the sample case</Link> (teaching case)</p>;
}

export function TheDrop({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const queryClient = useQueryClient();
  const [busyNow, setBusyNow] = useState(false);
  // While the per-file stream is connected nothing polls; without it (not yet open, or it failed three times), every 2 s.
  const streaming = useRef(false);
  const query = useQuery({...getDropOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId),
    refetchInterval: q => ((busyNow || q.state.data?.lanes.some(l => l.in_progress)) && !streaming.current ? 2000 : false)});
  const reading = Boolean(query.data?.lanes.some(l => l.in_progress));
  const stream = useDropStream(investigationId, reading);
  streaming.current = stream === 'live';
  const wasReading = useRef(false);
  useEffect(() => {
    // When the last file is read, the history's counts change too.
    if (wasReading.current && !reading) void queryClient.invalidateQueries({queryKey: getDropHistoryQueryKey({path: {investigation_id: investigationId}})});
    wasReading.current = reading;
  }, [reading, investigationId, queryClient]);
  const settings = useQuery({...settingsStatusOptions()}).data;
  const data = query.data;
  const [tab, setTab] = useState<'line' | 'links' | 'history'>('line');
  const captures = useCaptures(investigationId).data ?? [];
  // A capture that finishes adds its page to the case as a document: the line and the Library count follow.
  const capturing = captures.filter(c => c.status === 'queued' || c.status === 'capturing').length;
  const wasCapturing = useRef(capturing);
  useEffect(() => {
    if (capturing < wasCapturing.current) void queryClient.invalidateQueries({queryKey: getDropQueryKey({path: {investigation_id: investigationId}})});
    wasCapturing.current = capturing;
  }, [capturing, investigationId, queryClient]);
  const [pickedCapture, setPickedCapture] = useState<string | null>(null);
  const [shown, setShown] = useState<{label: string; ids: string[]} | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const batchRef = useRef<string | undefined>(undefined);
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState(false);
  const [showClean, setShowClean] = useState(false);
  const many = (query.data?.lanes.length ?? 0) > MANY;
  const startedMany = useRef(false);
  useEffect(() => { if (many && !startedMany.current) { startedMany.current = true; setOnly(true); } }, [many]);
  const [picked, setPicked] = useState<string | null>(null);
  // Pointing at a file shows its receipt while the pointer stays on the line (research §2); a click keeps it.
  const [hovered, setHovered] = useState<string | null>(null);
  const files = useRef<HTMLInputElement>(null);
  // Files on the line when it was first drawn, and every one since: a file not among them has just arrived.
  const seen = useRef<Set<string> | null>(null);
  const fresh = useCallback((id: string) => seen.current !== null && !seen.current.has(id), []);
  useEffect(() => {
    if (!data) return;
    const ids = flatLanes(data.lanes).map(l => l.document_id);
    if (seen.current === null) seen.current = new Set(ids); else ids.forEach(id => seen.current!.add(id));
  }, [data]);
  // What finished or stopped since the line was drawn, newest first: announced politely, and shown under Calm motion.
  const [news, setNews] = useState<{key: string; text: string}[]>([]);
  const lastState = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const now = new Map(flatLanes(data.lanes).map(l => [l.document_id, l.problem ? 'problem' : l.in_progress ? 'reading' : 'read'] as const));
    const before = lastState.current;
    lastState.current = now;
    if (!before) return;
    const told = flatLanes(data.lanes).filter(l => now.get(l.document_id) !== 'reading' && before.get(l.document_id) !== now.get(l.document_id)
      && (before.get(l.document_id) === 'reading' || !before.has(l.document_id)));
    if (told.length) setNews(n => [...told.map(l => ({key: `${l.document_id}:${now.get(l.document_id)}:${Date.now()}`, text: laneNews(l)})), ...n].slice(0, 8));
  }, [data]);
  const folder = useRef<HTMLInputElement>(null);

  const lanes = useMemo(() => (data?.lanes ?? []).filter(l => !shown || shown.ids.includes(l.document_id))
    .filter(l => !only || l.problem || l.in_progress || flatLanes(l.children ?? []).some(k => k.problem || k.in_progress))
    .sort((a, b) => Number(b.problem) - Number(a.problem)), [data, only, shown]);
  const every = useMemo(() => flatLanes(data?.lanes ?? []), [data]);
  const lane = every.find(l => l.document_id === picked) ?? lanes[0];
  const shownLane = every.find(l => l.document_id === hovered) ?? lane;
  const problems = useMemo(() => problemsFirst(data?.lanes ?? []), [data]);
  // The strip runs in the line's order (problems first), so "n / N" counts along the line.
  const strip = useMemo(() => [...(data?.lanes ?? [])].sort((a, b) => Number(b.problem) - Number(a.problem)), [data]);
  const at = Math.max(0, strip.findIndex(l => l.document_id === lane?.document_id || flatLanes(l.children ?? []).some(k => k.document_id === lane?.document_id)));
  const firstToRead = problems.find(l => !l.problem && !stalledLane(l)) ?? every.find(l => l.waiting) ?? lane;

  const move = useCallback((step: number) => {
    const order = flatLanes(lanes);
    if (!order.length) return;
    const i = order.findIndex(l => l.document_id === lane?.document_id);
    setPicked(order[Math.min(order.length - 1, Math.max(0, i + step))].document_id);
  }, [lanes, lane]);

  useEffect(() => {
    // The line's keys are the line's: the Links tab has its own buttons.
    if (!active || tab === 'links') return undefined;
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
  }, [active, move, lane, openDocument, tab]);

  // The grid's one tab stop: the cell last focused, else the first file's name.
  const gridRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{row: string; col: number} | null>(null);
  const visible = many && !showClean ? lanes.filter(l => l.problem || l.in_progress || l.issues.length || l.waiting) : lanes;
  const firstRow = visible[0]?.document_id ?? 'totals';
  // A row that left the line (filtered, folded, read) gives the tab stop back to the first file.
  useEffect(() => {
    if (cursor && gridRef.current && ![...gridRef.current.querySelectorAll<HTMLElement>('[data-row]')].some(r => r.dataset.row === cursor.row)) setCursor(null);
  }, [cursor, data, only, shown, showClean, tab]);
  const tabStop: TabStop = (row, col) => ((cursor ? cursor.row === row && cursor.col === col : row === firstRow && col === 0) ? 0 : -1);
  const cellAt = (target: EventTarget | null) => {
    const cell = (target as HTMLElement | null)?.closest?.<HTMLElement>(CELL);
    const row = cell?.closest<HTMLElement>('[role="row"]');
    return cell && row && gridRef.current?.contains(row) ? {cell, row, col: [...row.querySelectorAll(CELL)].indexOf(cell)} : null;
  };
  const onGridFocus = (e: ReactFocusEvent) => { const at = cellAt(e.target); if (at?.row.dataset.row) setCursor({row: at.row.dataset.row, col: at.col}); };
  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const at = cellAt(e.target);
    if (!at || e.altKey || e.metaKey) return;
    if (e.key === 'Enter' || e.key === ' ') {
      // A cell with a button presses it; any other cell of a file shows its receipt.
      e.preventDefault();
      e.stopPropagation();
      const button = at.cell.querySelector<HTMLButtonElement>('button');
      if (button) button.click(); else at.row.click();
      return;
    }
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="row"]')];
    const next = gridMove(e.key, e.ctrlKey, {row: rows.indexOf(at.row), col: at.col}, rows.map(r => r.querySelectorAll(CELL).length));
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    const cell = rows[next.row].querySelectorAll<HTMLElement>(CELL)[next.col];
    setCursor({row: rows[next.row].dataset.row ?? '', col: next.col});
    cell?.focus();
  };

  const dropKey = getDropQueryKey({path: {investigation_id: investigationId}});
  const historyKey = getDropHistoryQueryKey({path: {investigation_id: investigationId}});
  // Every drop is one batch (research §22 step 2), so History can say what it brought in. One file that cannot be
  // saved does not stop the rest; a file already in the case is not saved again but named, with a choice.
  const send = async (list: File[]) => {
    if (!list.length || !investigationId) return;
    setBusyNow(true);
    let batchId: string | undefined;
    try { batchId = (await createIngestionBatch({path: {investigation_id: investigationId}, body: {label: batchLabel(list)}, throwOnError: true})).data.id; }
    catch { batchId = undefined; /* the files are still saved, only without a drop of their own in History */ }
    batchRef.current = batchId;
    let done = 0;
    const already: Duplicate[] = [];
    const unread: string[] = [];
    const failed: string[] = [];
    for (const [i, file] of list.entries()) {
      setStatus(`Saving ${file.name} (${i + 1} of ${list.length})…`);
      try {
        await upload(investigationId, file.name.replace(/\.[^./]+$/, ''), file, {batchId});
        done += 1;
        void queryClient.invalidateQueries({queryKey: dropKey});
      } catch (error) {
        const same = duplicateOf(error);
        const saved = same ? null : savedUnread(error);
        if (same) already.push({file, existingId: same.id, existingName: same.filename});
        else if (saved) { done += 1; unread.push(`${saved.filename || file.name} was saved but could not be read: ${saved.reason}.`); }
        else failed.push(`${file.name} was not saved: ${notSaved(error)}.`);
      }
    }
    setDuplicates(d => [...already, ...d]);
    setStatus([`${done} file${done === 1 ? '' : 's'} saved.${done > unread.length ? ' Reading starts now; nothing leaves this computer.' : ''}`,
      already.length ? `${already.length} already in the case.` : '', ...unread, ...failed].filter(Boolean).join(' '));
    setBusyNow(false);
    await queryClient.invalidateQueries();
  };
  const keepSecondCopy = async (dup: Duplicate) => {
    setStatus(`Keeping a second copy of ${dup.file.name}…`);
    try {
      await upload(investigationId, dup.file.name.replace(/\.[^./]+$/, ''), dup.file, {batchId: batchRef.current, allowDuplicate: true});
      setDuplicates(d => d.filter(x => x !== dup));
      setStatus(`${dup.file.name} kept as a second copy; it is read like any other file.`);
      await Promise.all([queryClient.invalidateQueries({queryKey: dropKey}), queryClient.invalidateQueries({queryKey: historyKey})]);
    } catch (error) { setStatus(errorMessage(error, 'Could not keep a second copy')); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void send(Array.from(e.dataTransfer.files)); };
  const onPaste = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    // A link is captured, not saved as text (ADR-0018): its page is kept as it was, with proof.
    if (isWebAddress(clean)) { void captureLink(clean); return; }
    void send([new File([clean], `Pasted text ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.txt`, {type: 'text/plain'})]);
  };
  const captureLink = async (url: string) => {
    const earlier = captures.find(c => c.outcome === 'saved' && sameLink(c.url) === sameLink(url));
    if (earlier) {
      setPickedCapture(earlier.id);
      setTab('links');
      setStatus('That page is already in the case: here is the capture made earlier. Capture it again from Paste a link.');
      return;
    }
    setStatus('Capturing the link…');
    try {
      const made = (await createCapture({path: {investigation_id: investigationId}, body: {url}, throwOnError: true})).data;
      setPickedCapture(made.id);
      setTab('links');
      setStatus('');
      await Promise.all([queryClient.invalidateQueries({queryKey: getCapturesQueryKey({path: {investigation_id: investigationId}})}),
        queryClient.invalidateQueries({queryKey: dropKey})]);
    } catch (error) { setStatus(errorMessage(error, 'Could not capture that link')); }
  };
  const choose = (e: ChangeEvent<HTMLInputElement>) => { void send(Array.from(e.target.files ?? [])); e.target.value = ''; };
  const actions: Actions = {
    pick: id => { setPicked(id); setHovered(null); },
    hover: setHovered,
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

  // The file pickers sit in the drop field; the Links tab, which has no field, keeps its own pair.
  const pickers = <>
    <input ref={files} type="file" multiple hidden onChange={choose}/>
    {/* @ts-expect-error webkitdirectory is a browser attribute React does not type */}
    <input ref={folder} type="file" multiple hidden webkitdirectory="" onChange={choose}/>
  </>;
  const field = <div className={`dp-field${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
    onPaste={e => { const text = e.clipboardData.getData('text'); if (text && !e.clipboardData.files.length) { e.preventDefault(); onPaste(text); } }} tabIndex={0}
    onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); files.current?.click(); } }}
    aria-label="Drop files here, or paste text. Enter chooses files">
    <span className="dp-arrow" aria-hidden="true">↓</span>
    <p><b>Drop files, a folder, or paste text or a link</b></p>
    <p className="dp-quiet">or press <kbd>O</kbd> to <button type="button" className="dp-link" onClick={() => files.current?.click()}>choose files</button>
      {' · '}<button type="button" className="dp-link" onClick={() => folder.current?.click()}>a folder</button></p>
    {pickers}
    {status && <p role="status" className="dp-status">{status}</p>}
  </div>;

  if (!data && query.isPending) return <section className="dp dp-empty" aria-label="The Drop" aria-busy="true">
    <div className="dp-skeleton" aria-hidden="true">{[0, 1, 2, 3].map(i => <i key={i}/>)}</div>
    <p className="dp-quiet">Looking at what was brought in…</p>
  </section>;

  if (!data || (empty && !captures.length && tab !== 'links')) return <section className="dp dp-empty" aria-label="The Drop">
    {field}
    {empty && <CaptureLinkField investigationId={investigationId} captures={captures} onCaptured={id => { setPickedCapture(id); setTab('links'); }}/>}
    {empty && <p className="dp-quiet">Each file is read on this computer: nothing leaves it. A link is visited once, from this computer.</p>}
    {empty && <SampleCaseLink investigationId={investigationId}/>}
    {query.isError && <p role="alert">{errorMessage(query.error, 'Could not see what was brought in')}</p>}
  </section>;

  return <section className="dp" aria-label="The Drop">
    <nav className="dp-tabs" aria-label="The Drop">
      <button type="button" className={tab === 'line' ? 'on' : ''} aria-current={tab === 'line' ? 'page' : undefined} onClick={() => setTab('line')}>Digestion line</button>
      <button type="button" className={tab === 'links' ? 'on' : ''} aria-current={tab === 'links' ? 'page' : undefined} onClick={() => setTab('links')}>Links &amp; captures <small>{captures.length}</small></button>
      <Link href={caseHref('/bring-in#document-ingestion', investigationId)}>Library <small>{every.length}</small></Link>
      <button type="button" className={tab === 'history' ? 'on' : ''} aria-current={tab === 'history' ? 'page' : undefined} onClick={() => setTab('history')}>History</button>
      {t!.unread > 0 && <span className="dp-live"><i aria-hidden="true"/>Reading · {t!.unread} file{t!.unread === 1 ? '' : 's'}
        {stream === 'reconnecting' ? <small> · reconnecting</small> : stream === 'polling' ? <small> · checking every 2 s</small> : null}</span>}
    </nav>

    {tab === 'links' ? <>{pickers}<Captures investigationId={investigationId} picked={pickedCapture} onPick={id => { setPickedCapture(id); setStatus(''); }} onAddFile={() => files.current?.click()} notice={status}/></> : <>
    <div className="dp-left">
      {field}
      {duplicates.length > 0 && <section className="dp-card dp-dupes" aria-label="Already in the case">
        <p className="dp-eyebrow">Already in the case</p>
        <ul>{duplicates.map(d => <li key={`${d.file.name}:${d.existingId}`}>
          <p><i className="dp-stage dp-same" aria-hidden="true">=</i><b>{d.file.name}</b></p>
          <p className="dp-quiet">Already in the case as {d.existingName || 'a document'} · same fingerprint</p>
          <div className="dp-actions">
            <button type="button" className="p" onClick={() => { setTab('line'); setShown(null); setPicked(d.existingId); }}>Open that one</button>
            <button type="button" onClick={() => void keepSecondCopy(d)}>Keep a second copy</button>
            <button type="button" className="dp-link" onClick={() => setDuplicates(x => x.filter(y => y !== d))}>Leave it</button>
          </div>
        </li>)}</ul>
      </section>}
      <section className="dp-card" aria-label="This drop">
        <p className="dp-eyebrow">This drop</p>
        {t!.started_at && <p className="dp-quiet">Since {apiTime(t!.started_at).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</p>}
        <dl>
          <div><dt>Files</dt><dd>{t!.files} dropped{t!.files_inside ? ` · ${t!.files_inside} inside` : ''}</dd></div>
          {ocr && <div><dt>OCR language</dt><dd>{ocr.pdf_ocr_enabled ? language : 'OCR off'}</dd></div>}
        </dl>
        <p className="dp-local">Nothing leaves this computer{byOpenAleph ? ': OpenAleph runs here.' : ': every file is read here.'}</p>
      </section>
      {shownLane && <Receipt key={shownLane.document_id} lane={shownLane} investigationId={investigationId}/>}
      <section className="dp-card" aria-label="What happens next">
        <p className="dp-eyebrow">What happens next</p>
        <p className="dp-quiet">Accepted names and claims join the case. Nothing is added until you accept it.</p>
      </section>
    </div>

    {tab === 'history' ? <div className="dp-line" role="region" aria-label="History">
      <header className="dp-line-head"><h2>History</h2><span className="dp-quiet">Every drop, newest first, and what it brought in.</span></header>
      <DropHistory investigationId={investigationId} onShow={d => { setShown({label: d.label, ids: d.document_ids}); setOnly(false); setTab('line'); }}/>
    </div> : <div className="dp-line" role="region" aria-label="Digestion line">
      <header className="dp-line-head">
        <h2>Digestion line</h2><span className="dp-quiet">Each file, step by step. Arrows move through the line; J and K through files.</span>
        {shown ? <span className="dp-all dp-shown">One drop: {shown.label} <button type="button" className="dp-link" onClick={() => setShown(null)}>Show all {t!.files}</button></span>
          : <span className="dp-all">All {t!.files}</span>}
        <button type="button" className={`dp-filter${only ? ' on' : ''}`} aria-pressed={only} onClick={() => setOnly(o => !o)}>Problems & in progress <kbd>F</kbd></button>
      </header>
      <div ref={gridRef} role="grid" aria-label="Files, stage by stage" aria-colcount={9} className="dp-grid" onKeyDown={onGridKey} onFocus={onGridFocus}
        onMouseLeave={() => setHovered(null)}>
        <div role="row" data-row="head" className="dp-head">
          {['File', ...data.stages.map(s => s.label), 'Waiting'].map((label, i) => <span key={label} role="columnheader" tabIndex={tabStop('head', i)}>{label}</span>)}
        </div>
        {visible.map(l => <Lane key={l.document_id} lane={l} on={lane?.document_id ?? ''} onPick={id => { setPicked(id); setHovered(null); }} actions={actions} tab={tabStop} fresh={fresh}/>)}
        {many && !only && <div role="row" data-row="fold:clean" className="dp-fold"><span role="gridcell" aria-colspan={9} tabIndex={tabStop('fold:clean', 0)}>
          <span><b>{lanes.filter(l => !(l.problem || l.in_progress || l.issues.length || l.waiting)).length} read cleanly</b>, nothing waits</span>
          <button type="button" tabIndex={-1} onClick={() => setShowClean(c => !c)}>{showClean ? 'Fold them' : 'Show them'}</button></span></div>}
        {!lanes.length && <div role="row" data-row="none" className="dp-quiet"><span role="gridcell" aria-colspan={9} tabIndex={tabStop('none', 0)}>No problems, and nothing still being read.</span></div>}
        <Totals data={data} tab={tabStop}/>
      </div>
      <footer className="dp-legend">
        {(['done', 'active', 'waiting', 'needs_you', 'stopped'] as const).map(s => <span key={s}><i className={`dp-stage dp-${s}`} aria-hidden="true">{MARK[s]}</i>{WORD[s]}</span>)}
        <span><i className="dp-stage dp-stalled" aria-hidden="true">{STALLED_MARK}</i>{STALLED_WORD}</span>
        <span className="dp-by">Proposed by: {byOpenAleph ? 'OpenAleph' : 'the Workbench’s name-finder (rules)'} · <span className="ai-tag">AI</span> none in a drop</span>
      </footer>
      <ol className="dp-log" aria-live="polite" aria-label="What changed on the line">{news.map(n => <li key={n.key}>{n.text}</li>)}</ol>
    </div>}

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
          <span className="dp-n">{i + 1}</span><i className={`dp-stage ${p.problem ? 'dp-stopped' : stalledLane(p) ? 'dp-stalled' : 'dp-needs_you'}`} aria-hidden="true">{p.problem ? '✕' : stalledLane(p) ? STALLED_MARK : '!'}</i>
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
    </>}
    {query.isError && <p role="alert">{errorMessage(query.error, 'Could not see what was brought in')}</p>}
  </section>;
}
