'use client';
// What opens beside the write-up on Act › Story (mockup ACT_2; research Act §8 and §11): a citation's passage, the
// write-up's version history (named, automatic and before-restore snapshots; one read-only; restore with
// confirmation), the story's own notes (the Notes tab), and the Export sheet with its format cards and checks.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useEffect, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {StatusChip} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {
  addNoteMutation, getNotesOptions, getNotesQueryKey, getStoryQueryKey, getStoryVersionOptions, getWriteupEndpointQueryKey,
  listStoryVersionsOptions, listStoryVersionsQueryKey, nameStoryVersionMutation, removeNoteMutation, restoreStoryVersionMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {NoteOut, StoryOut, WriteupVersionOut} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';
import type {CitableClaim, DocInfo} from './editor-extensions';

// TipTap loads only when a version is read (as the editor itself does).
const VersionText = dynamic(() => import('./version-text').then(m => m.VersionText), {ssr: false, loading: () => <p className="sy-quiet">Reading…</p>});

const STATE_CHIP = {shown: 'supported', disputed: 'disputed', unshown: 'unshown', ruled_out: 'ruled_out'} as const;
const when = (iso: string) => apiTime(iso).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

function Pane({title, onClose, children, label}: {title: ReactNode; onClose: () => void; children: ReactNode; label: string}): ReactElement {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, [label]);
  return <aside className="sy-pane" aria-label={label} ref={ref} tabIndex={-1}>
    <header><b>{title}</b><button type="button" className="sy-x" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}>×</button></header>
    {children}
    <small className="sy-pane-esc"><kbd>Esc</kbd> closes</small>
  </aside>;
}

/** A citation's claim with every passage it rests on, beside the text. */
export function PassagePane({claim, onClose}: {claim: CitableClaim | undefined; onClose: () => void}): ReactElement {
  return <Pane label="The passage" title={claim ? `Citation ${claim.n}` : 'Citation'} onClose={onClose}>
    {!claim ? <p className="sy-quiet">This citation’s claim is no longer in the story.</p> : <>
      <p className="sy-pane-claim"><StatusChip status={STATE_CHIP[claim.state]}/> {claim.text}</p>
      {(claim.evidence ?? []).length ? <ol className="sy-passages">
        {(claim.evidence ?? []).map(e => <li key={e.id} className={e.stance === 'contradicts' ? 'against' : ''}>
          <small>{e.stance === 'contradicts' ? '✕ against · ' : e.stance === 'supports' ? '✓ supports · ' : 'context · '}{e.label}{e.locator ? ` · ${e.locator}` : ''}</small>
          {e.quote ? <blockquote>{e.quote}</blockquote> : <p className="sy-quiet">No words quoted from this passage yet.</p>}
        </li>)}
      </ol> : <p className="sy-quiet">No passage linked to this claim yet.</p>}
    </>}
  </Pane>;
}

const KIND_WORD: Record<WriteupVersionOut['kind'], string> = {named: 'named', auto: 'automatic', before_restore: 'kept before a restore'};

/** The write-up's versions: name the text as it stands, read one, restore one (asked first; the text it replaces is kept). */
export function VersionsPane({investigationId, writeupId, onClose, onRestored}: {
  investigationId: string; writeupId: string; onClose: () => void; onRestored: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const list = useQuery({...listStoryVersionsOptions({path})});
  const [viewing, setViewing] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState('');
  const one = useQuery({...getStoryVersionOptions({path: {...path, version_id: viewing ?? ''}}), enabled: Boolean(viewing)});
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({queryKey: listStoryVersionsQueryKey({path})}),
    queryClient.invalidateQueries({queryKey: getStoryQueryKey({path})}),
  ]);
  const nameM = useMutation({...nameStoryVersionMutation(), onSuccess: () => { setName(''); void refresh(); }});
  const restoreM = useMutation({...restoreStoryVersionMutation(), onSuccess: data => {
    queryClient.setQueryData(getWriteupEndpointQueryKey({path: {writeup_id: writeupId}}), data);
    setAsking(false); setViewing(null);
    void refresh();
    onRestored();
  }});
  const versions = list.data?.versions ?? [];
  const current = versions.find(v => v.id === viewing);
  const label = (v: WriteupVersionOut) => v.name ?? `Automatic · ${when(v.created_at)}`;

  if (viewing) {
    return <Pane label="Version history" title={current ? label(current) : 'Version'} onClose={onClose}>
      <button type="button" className="sy-link" onClick={() => { setViewing(null); setAsking(false); }}>← All versions</button>
      {current && <p className="sy-quiet">{KIND_WORD[current.kind]} · {when(current.created_at)} · {current.word_count} words · read-only</p>}
      {one.isError && <p role="alert" className="sy-quiet">{errorMessage(one.error, 'Could not read this version')}</p>}
      {one.data ? <div className="sy-version-text"><VersionText content={one.data.content_json}/></div> : !one.isError && <p className="sy-quiet">Reading…</p>}
      {asking ? <div className="sy-confirm" role="group" aria-label="Restore this version?">
        <p>Put this version’s text back? The text there now is kept first, as a version of its own, so this can be undone.</p>
        <button type="button" className="primary" disabled={restoreM.isPending} onClick={() => restoreM.mutate({path: {...path, version_id: viewing}})}>Restore</button>
        <button type="button" onClick={() => setAsking(false)}>Cancel</button>
      </div> : <button type="button" className="sy-pane-btn" disabled={!one.data} onClick={() => setAsking(true)}>Restore this version…</button>}
      {restoreM.isError && <p role="alert" className="sy-quiet">{errorMessage(restoreM.error, 'Could not restore it')}</p>}
    </Pane>;
  }
  return <Pane label="Version history" title="Version history" onClose={onClose}>
    <form className="sy-name" onSubmit={e => { e.preventDefault(); if (name.trim()) nameM.mutate({path, body: {name: name.trim()}}); }}>
      <label htmlFor="sy-version-name">Name the text as it stands</label>
      <span><input id="sy-version-name" value={name} maxLength={200} onChange={e => setName(e.target.value)} placeholder="e.g. Before legal read"/>
        <button type="submit" disabled={!name.trim() || nameM.isPending}>Keep</button></span>
    </form>
    {nameM.isError && <p role="alert" className="sy-quiet">{errorMessage(nameM.error, 'Could not keep that version')}</p>}
    {list.isError && <p role="alert" className="sy-quiet">{errorMessage(list.error, 'Could not read the versions')}</p>}
    <p className="sy-quiet">Kept on their own while you write, at most one every ten minutes; named ones stay.</p>
    <ol className="sy-versions" aria-label="Versions, newest first">
      {versions.length ? versions.map(v => <li key={v.id} className={`v-${v.kind}`}>
        <button type="button" onClick={() => setViewing(v.id)} aria-label={`Read ${label(v)}`}>
          <span className="v-mark" aria-hidden="true">{v.kind === 'named' ? '◆' : v.kind === 'auto' ? '◇' : '↶'}</span>
          <span><b>{label(v)}</b><small>{KIND_WORD[v.kind]} · {when(v.created_at)} · {v.word_count} words</small></span>
        </button></li>) : list.data && <li className="sy-quiet">No versions yet.</li>}
    </ol>
  </Pane>;
}

/** The story's own notes, newest first (notes on the record type "story"). */
export function NotesTab({investigationId, storyId}: {investigationId: string; storyId: string}): ReactElement {
  const queryClient = useQueryClient();
  const options = {path: {investigation_id: investigationId}, query: {record_type: 'story' as const, record_id: storyId}};
  const notes = useQuery({...getNotesOptions(options)});
  const reload = () => queryClient.invalidateQueries({queryKey: getNotesQueryKey(options)});
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const addM = useMutation({...addNoteMutation(), onSuccess: () => { setText(''); void reload(); }});
  const removeM = useMutation({...removeNoteMutation(), onSuccess: () => { setDeleting(null); void reload(); }});
  const problem = notes.error ?? addM.error ?? removeM.error;
  return <div className="sy-notes">
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) addM.mutate({path: options.path, body: {text: text.trim(), record_type: 'story', record_id: storyId}}); }}>
      <label htmlFor="sy-note">A note on the story</label>
      <textarea id="sy-note" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="What to ask, what to check, what the editor said"/>
      <button type="submit" disabled={!text.trim() || addM.isPending}>Add note</button>
    </form>
    {problem && <p role="alert" className="sy-quiet">{errorMessage(problem, 'Could not change the notes')}</p>}
    <ol className="sy-note-list" aria-label="Notes on the story">
      {(notes.data?.notes ?? []).map((n: NoteOut) => <li key={n.id}>
        <p>{n.text}</p>
        <small>{when(n.created_at)}{n.lead_id ? ' · made a lead' : ''}</small>
        {deleting === n.id ? <span className="sy-confirm-inline">Delete this note? <button type="button" onClick={() => removeM.mutate({path: {note_id: n.id}})}>Delete</button>
          <button type="button" onClick={() => setDeleting(null)}>Keep</button></span>
          : <button type="button" className="sy-link" onClick={() => setDeleting(n.id)} aria-label={`Delete the note “${n.text.slice(0, 40)}”`}>Delete</button>}
      </li>)}
      {notes.data && !notes.data.notes.length && <li className="sy-quiet">No notes on the story yet.</li>}
    </ol>
  </div>;
}

async function save(blob: Blob, name: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The Export sheet: what each format holds, which ones are not ready and why, and the checks before an outward export. */
export function ExportSheet({story, doc, onClose, onExportDocx}: {
  story: StoryOut; doc: DocInfo | null; onClose: () => void; onExportDocx: () => Promise<void>;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const s = story.sentences;
  const docxReason = !story.writeup_id ? 'Start the write-up first' : s.total === 0 ? 'Nothing written yet'
    : s.uncited ? `${s.uncited} sentence${s.uncited === 1 ? ' needs' : 's need'} a source` : null;
  const gate = (key: string) => story.gates.find(g => g.key === key);
  const checks: {ok: boolean; text: string}[] = [
    {ok: s.total > 0 && s.uncited === 0, text: s.total === 0 ? 'Nothing written yet' : s.uncited ? `${s.uncited} sentence${s.uncited === 1 ? '' : 's'} without a source` : 'Every sentence has a source'},
    {ok: gate('single')?.state === 'passed', text: gate('single')?.state === 'passed' ? 'No statement rests on one record' : `Single-source: ${gate('single')?.detail ?? ''}`},
    {ok: !doc?.aiOpen, text: doc?.aiOpen ? `${doc.aiOpen} AI-drafted paragraph${doc.aiOpen === 1 ? '' : 's'} not yet kept by you` : 'No AI-drafted paragraph waiting'},
    {ok: gate('innocent')?.state === 'passed', text: gate('innocent')?.state === 'passed' ? 'Innocent explanations addressed' : `Innocent explanations: ${gate('innocent')?.detail ?? ''}`},
    {ok: gate('right_of_reply')?.state === 'passed', text: `Right of reply: ${gate('right_of_reply')?.detail ?? ''}`},
    {ok: gate('legal_read')?.state === 'passed', text: `Legal read: ${gate('legal_read')?.detail ?? ''}`},
  ];
  const backup = async () => {
    setStatus('Preparing the backup…');
    try {
      await save(await api.blob(`/api/investigations/${story.investigation_id}/export?include_documents=true`), `investigation-${story.investigation_id}.jwbackup.zip`);
      setStatus('Backup downloaded.');
    } catch (error) { setStatus(errorMessage(error, 'The backup did not download')); }
  };
  const docx = async () => {
    try { await onExportDocx(); setStatus('Write-up downloaded.'); } catch (error) { setStatus(errorMessage(error, 'The write-up did not download')); }
  };
  return <div className="sy-sheet-back" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sy-sheet" role="dialog" aria-modal="true" aria-label="Export" ref={ref}>
      <header><b>Export</b><button type="button" className="sy-x" aria-label="Close the Export sheet" onClick={onClose}>×</button></header>
      <ul className="sy-formats">
        <li><b>Write-up for publication <small>.docx</small></b><span>The text with numbered citations and a Sources list naming each record.</span>
          <button type="button" disabled={Boolean(docxReason)} onClick={() => void docx()}>Export the .docx</button>
          {docxReason && <small className="sy-why">○ {docxReason}</small>}</li>
        <li className="off"><b>Write-up for reading <small>PDF</small></b><span>The paper version of the current theme.</span>
          <button type="button" disabled>Export as PDF</button><small className="sy-why">○ Not built yet</small></li>
        <li className="off"><b>Evidence pack <small>.zip</small></b><span>The write-up, an exhibits list from its citations, each cited passage with its file’s fingerprint, and the readiness record.</span>
          <button type="button" disabled>Export the pack</button><small className="sy-why">○ Not built yet</small></li>
        <li><b>Backup <small>.jwbackup.zip</small></b><span>The whole case, for restoring on this or another computer; not for sharing.</span>
          <button type="button" onClick={() => void backup()}>Download the backup</button></li>
      </ul>
      <section aria-label="Before it leaves this computer">
        <p className="sy-eyebrow">Before it leaves this computer</p>
        <ul className="sy-checks">{checks.map(c => <li key={c.text} className={c.ok ? 'ok' : 'open'}><span aria-hidden="true">{c.ok ? '✓' : '○'}</span>{c.text}</li>)}</ul>
        <p className="sy-quiet">{doc ? `AI use: ${doc.aiDrafted} of ${doc.paragraphs} paragraph${doc.paragraphs === 1 ? '' : 's'} drafted with AI.` : ''}</p>
      </section>
      <p className="sy-quiet" aria-live="polite">{status}</p>
    </div>
  </div>;
}
