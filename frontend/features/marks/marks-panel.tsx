'use client';
// Tags, notes and collections for one record (docs/discovery/README.md,
// "Tags, notes and collections"). With no record chosen it lists the
// investigation's collections and its own notes. Marks stay on this machine:
// nothing here is sent to an outside source.
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getNotesOptions, getRecordMarksOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {NoteOut} from '../../lib/generated/types.gen';
import {TAG_SWATCHES} from '../../lib/record-kinds';
import {useMarks} from './use-marks';
import type {MarkTarget} from './use-marks';

export function TagChip({name, colour}: {name: string; colour: string}): ReactElement {
  return <span className="sv-tag" style={{background: colour}}>{name}</span>;
}

function NoteItem({note, onSave, onDelete, onLead}: {note: NoteOut; onSave: (text: string) => Promise<void>;
  onDelete: () => Promise<void>; onLead: () => Promise<void>}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  return <div className="sv-note">
    {editing
      ? <>
        <textarea aria-label="Edit note" value={text} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}/>
        <div className="sv-row">
          <button type="button" className="sv-btn p" onClick={async () => { await onSave(text); setEditing(false); }} disabled={!text.trim()}>Save</button>
          <button type="button" className="sv-btn" onClick={() => { setText(note.text); setEditing(false); }}>Cancel</button>
        </div>
      </>
      : <>
        <p>{note.text}</p>
        {note.caption && <small>On {note.caption}</small>}
        <div className="sv-row">
          <button type="button" className="sv-btn" onClick={() => setEditing(true)}>Edit</button>
          {note.lead_id ? <small>In leads</small> : <button type="button" className="sv-btn" onClick={onLead}>Add to leads</button>}
          <button type="button" className="sv-btn danger" onClick={onDelete}>Delete</button>
        </div>
      </>}
  </div>;
}

type Props = {investigationId: string; target: MarkTarget | null};

export function MarksPanel({investigationId, target}: Props): ReactElement {
  const marks = useMarks(investigationId);
  const path = {investigation_id: investigationId};
  const recordMarks = useQuery({...getRecordMarksOptions({path, query: target ? {record_type: target.record_type, record_id: target.record_id} : {record_type: 'entity', record_id: ''}}),
    enabled: Boolean(investigationId && target)});
  // Without a record: the notes written on the investigation itself.
  const allNotes = useQuery({...getNotesOptions({path}), enabled: Boolean(investigationId && !target)});
  const [newTag, setNewTag] = useState('');
  const [swatch, setSwatch] = useState<string>(TAG_SWATCHES[0]);
  const [noteText, setNoteText] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const [status, setStatus] = useState('');

  const attempt = async (work: () => Promise<unknown>, failed: string) => {
    try { await work(); setStatus(''); } catch (error) { setStatus(errorMessage(error, failed)); }
  };

  const onRecord = recordMarks.data;
  const tagOn = new Set((onRecord?.tags ?? []).map(t => t.id));
  const inCollection = new Set((onRecord?.collections ?? []).map(c => c.id));
  const notes = target ? onRecord?.notes ?? [] : (allNotes.data?.notes ?? []).filter(n => !n.record_type);

  return <div className="sv-marks" aria-label="Tags, notes and collections">
    <p className="sv-ph">{target ? target.caption : 'Collections and notes'}</p>
    <p className="sv-psub">{target ? 'Your tags, notes and collections for this record. They stay on this machine.'
      : 'Choose a result to tag it, write a note on it or add it to a collection. Notes written here are on the investigation.'}</p>
    {status && <p className="sv-error" role="alert">{status}</p>}

    {target && <>
      <div className="sv-sec">Tags</div>
      <div className="sv-tagpick">
        {marks.tags.map(t => <button type="button" key={t.id} className={tagOn.has(t.id) ? 'on' : ''} style={{background: t.colour}}
          aria-pressed={tagOn.has(t.id)} onClick={() => attempt(() => marks.toggleTag(target, t.id, !tagOn.has(t.id)), 'Could not change the tag')}>{t.name}</button>)}
        {!marks.tags.length && <small className="sv-muted">No tags yet.</small>}
      </div>
      <form className="sv-new" onSubmit={e => { e.preventDefault(); const name = newTag.trim(); if (!name) return;
        void attempt(async () => { const id = await marks.createTag(name, swatch); if (id) await marks.toggleTag(target, id, true); setNewTag(''); }, 'Could not add the tag'); }}>
        <input aria-label="New tag name" placeholder="New tag" value={newTag} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTag(e.target.value)}/>
        <span className="sv-swatches" role="radiogroup" aria-label="Tag colour">
          {TAG_SWATCHES.map(c => <button type="button" key={c} role="radio" aria-checked={swatch === c} aria-label={`Colour ${c}`}
            className={swatch === c ? 'on' : ''} style={{background: c}} onClick={() => setSwatch(c)}/>)}
        </span>
        <button type="submit" className="sv-btn" disabled={!newTag.trim()}>Add tag</button>
      </form>
    </>}

    <div className="sv-sec">Notes</div>
    <form className="sv-new col" onSubmit={e => { e.preventDefault(); const text = noteText.trim(); if (!text) return;
      void attempt(async () => { await marks.addNote(target, text); setNoteText(''); }, 'Could not save the note'); }}>
      <textarea aria-label="New note" placeholder={target ? 'A note on this record' : 'A note on the investigation'} value={noteText}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNoteText(e.target.value)}/>
      <button type="submit" className="sv-btn" disabled={!noteText.trim()}>Add note</button>
    </form>
    {notes.map(n => <NoteItem key={n.id} note={n}
      onSave={text => attempt(() => marks.editNote(target, n.id, text), 'Could not save the note')}
      onDelete={() => attempt(() => marks.deleteNote(target, n.id), 'Could not delete the note')}
      onLead={() => attempt(() => marks.noteToLead(target, n.id), 'Could not make the lead')}/>)}

    <div className="sv-sec">Collections</div>
    {marks.collections.map(c => <label key={c.id} className="sv-ci">
      {target && <input type="checkbox" checked={inCollection.has(c.id)}
        onChange={(e: ChangeEvent<HTMLInputElement>) => attempt(() => marks.setInCollection(target, c.id, e.target.checked), 'Could not change the collection')}/>}
      <b>{c.name}</b><span>{c.item_count} {c.item_count === 1 ? 'record' : 'records'}</span>
    </label>)}
    {!marks.collections.length && <small className="sv-muted">No collections yet.</small>}
    <form className="sv-new" onSubmit={e => { e.preventDefault(); const name = newCollection.trim(); if (!name) return;
      void attempt(async () => { const id = await marks.createCollection(name); if (target) await marks.setInCollection(target, id, true); setNewCollection(''); }, 'Could not add the collection'); }}>
      <input aria-label="New collection name" placeholder="New collection" value={newCollection} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewCollection(e.target.value)}/>
      <button type="submit" className="sv-btn" disabled={!newCollection.trim()}>{target ? 'Add and put it in' : 'Add collection'}</button>
    </form>
  </div>;
}
