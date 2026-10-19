'use client';
// Tags, notes and collections for one record (docs/discovery/README.md,
// "Tags, notes and collections"). With no record chosen it lists the
// investigation's collections and its own notes. Marks stay on this machine:
// nothing here is sent to an outside source.
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';
import {z} from 'zod';

import {Form, FormControl, FormField, FormItemBare, FormMessage, FormRootError} from '@/components/ui/form';
import {errorMessage} from '../../lib/api-client';
import {submitWith, useZodForm} from '../../lib/forms';
import {getNotesOptions, getRecordMarksOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {NoteOut} from '../../lib/generated/types.gen';
import {TAG_SWATCHES} from '../../lib/record-kinds';
import {useMarks} from './use-marks';
import type {MarkTarget} from './use-marks';

// The three boxes, as the backend takes them (TagCreate name 1–80, NoteCreate text 1–20000, CollectionCreate name 1–200).
const tagSchema = z.object({name: z.string().trim().min(1, 'Give the tag a name.').max(80, 'Keep the tag name under 80 characters.')});
const noteSchema = z.object({text: z.string().trim().min(1, 'Write the note first.').max(20000, 'Keep the note under 20,000 characters.')});
const collectionSchema = z.object({name: z.string().trim().min(1, 'Give the collection a name.').max(200, 'Keep the name under 200 characters.')});
type NameValues = {name: string};
type NoteValues = {text: string};
const MESSAGE = 'field-msg next-line';

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
  const [swatch, setSwatch] = useState<string>(TAG_SWATCHES[0]);
  const [status, setStatus] = useState('');
  const tagForm = useZodForm<NameValues>(tagSchema, {defaultValues: {name: ''}, mode: 'onSubmit'});
  const noteForm = useZodForm<NoteValues>(noteSchema, {defaultValues: {text: ''}, mode: 'onSubmit'});
  const collectionForm = useZodForm<NameValues>(collectionSchema, {defaultValues: {name: ''}, mode: 'onSubmit'});

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
      <Form {...tagForm}><form className="sv-new" noValidate onSubmit={submitWith(tagForm, async ({name}) => {
        const id = await marks.createTag(name, swatch);
        if (id) await marks.toggleTag(target, id, true);
        tagForm.reset(); setStatus('');
      }, 'Could not add the tag')}>
        <FormField control={tagForm.control} name="name" render={({field}) => <FormItemBare>
          <FormControl><input {...field} aria-label="New tag name" placeholder="New tag"/></FormControl>
          <FormMessage className={MESSAGE}/></FormItemBare>}/>
        <span className="sv-swatches" role="radiogroup" aria-label="Tag colour">
          {TAG_SWATCHES.map(c => <button type="button" key={c} role="radio" aria-checked={swatch === c} aria-label={`Colour ${c}`}
            className={swatch === c ? 'on' : ''} style={{background: c}} onClick={() => setSwatch(c)}/>)}
        </span>
        <FormRootError className={MESSAGE}/>
        <button type="submit" className="sv-btn">Add tag</button>
      </form></Form>
    </>}

    <div className="sv-sec">Notes</div>
    <Form {...noteForm}><form className="sv-new col" noValidate onSubmit={submitWith(noteForm, async ({text}) => {
      await marks.addNote(target, text);
      noteForm.reset(); setStatus('');
    }, 'Could not save the note')}>
      <FormField control={noteForm.control} name="text" render={({field}) => <FormItemBare>
        <FormControl><textarea {...field} aria-label="New note" placeholder={target ? 'A note on this record' : 'A note on the investigation'}/></FormControl>
        <FormMessage className="field-msg"/></FormItemBare>}/>
      <FormRootError className="field-msg"/>
      <button type="submit" className="sv-btn">Add note</button>
    </form></Form>
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
    <Form {...collectionForm}><form className="sv-new" noValidate onSubmit={submitWith(collectionForm, async ({name}) => {
      const id = await marks.createCollection(name);
      if (target) await marks.setInCollection(target, id, true);
      collectionForm.reset(); setStatus('');
    }, 'Could not add the collection')}>
      <FormField control={collectionForm.control} name="name" render={({field}) => <FormItemBare>
        <FormControl><input {...field} aria-label="New collection name" placeholder="New collection"/></FormControl>
        <FormMessage className={MESSAGE}/></FormItemBare>}/>
      <FormRootError className={MESSAGE}/>
      <button type="submit" className="sv-btn">{target ? 'Add and put it in' : 'Add collection'}</button>
    </form></Form>
  </div>;
}
