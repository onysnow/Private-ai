'use client';
// What a document is and its language, and a person's correction of either (the Library pane, the reading room's
// Details). Each shows as a chip: the kind's mark and name, the language's code and name; how it was set (by you, from
// its source's record, from the file, detected and how sure) is on hover. Pressing a chip opens its chooser in place:
// the kinds as marks, or a language typed as a code or a name. Saving sends PATCH /documents/{id}/about; what a person
// sets the machine never replaces (backend app/services/document_facts.py).
import {useQueryClient} from '@tanstack/react-query';
import {FileQuestion} from 'lucide-react';
import {useId, useState} from 'react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {getDocumentQueryKey, listDocumentsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {updateDocumentAbout} from '../../lib/generated/sdk.gen';
import type {DocumentOut} from '../../lib/generated/types.gen';
import {COMMON_LANGUAGES, DOC_KIND_ORDER, DOC_KINDS, docKind, languageName, setByWords} from './document-kinds';
import type {DocKind} from './document-kinds';
import type {FileKind} from './library-model';

type About = Pick<DocumentOut, 'id' | 'investigation_id' | 'kind' | 'kind_set_by' | 'kind_by' | 'language' | 'language_name' | 'language_set_by'
  | 'language_by' | 'language_confidence'>;
type Props = {document: About; file: FileKind; onSaved?: (d: DocumentOut) => void};

/** A language as typed (a code, a BCP-47 tag or an English name) as the code to send; the text itself when unknown. */
export function typedLanguage(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const byName = [...COMMON_LANGUAGES].find(code => languageName(code).toLowerCase() === t.toLowerCase());
  return byName ?? t;
}

export function DocumentAbout({document: d, file, onSaved}: Props): ReactElement {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState<'kind' | 'language' | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const kind = docKind(d, file);
  // A kind the file type gives, shown before the API kept kinds, reads as from the file.
  const kindBy = d.kind ? setByWords(d.kind_set_by, d.kind_by) : kind ? setByWords('reader', null) : setByWords(d.kind_set_by, d.kind_by);

  const save = async (body: {kind?: DocKind | null; language?: string | null}) => {
    setSaving(true);
    setError('');
    try {
      const saved = (await updateDocumentAbout({path: {document_id: d.id}, body, throwOnError: true})).data;
      setOpen(null);
      onSaved?.(saved);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: listDocumentsQueryKey({path: {investigation_id: d.investigation_id}})}),
        queryClient.invalidateQueries({queryKey: getDocumentQueryKey({path: {document_id: d.id}})}),
      ]);
    } catch (e) {
      setError(errorMessage(e, 'Could not save it'));
    } finally {
      setSaving(false);
    }
  };

  const KindIcon = kind ? DOC_KINDS[kind].icon : FileQuestion;
  const langName = d.language ? languageName(d.language, d.language_name) : null;
  return <div className="da" role="group" aria-label="What it is">
    <p className="da-chips">
      <Reveal tabbable={false} detail={<><b>{kind ? DOC_KINDS[kind].name : 'Kind not set'}</b><span className="rv-row">{kindBy}</span>
        <span className="rv-row">Press to change it.</span></>}>
        <button type="button" className={`da-chip${kind ? '' : ' unset'}`} aria-expanded={open === 'kind'} aria-controls={`${id}-kind`}
          aria-label={`Kind: ${kind ? DOC_KINDS[kind].name : 'not set'}. Change it`} onClick={() => { setOpen(o => (o === 'kind' ? null : 'kind')); setError(''); }}>
          <KindIcon size={14} aria-hidden="true"/><span>{kind ? DOC_KINDS[kind].name : 'Kind?'}</span></button></Reveal>
      <Reveal tabbable={false} detail={<><b>{langName ?? 'Language not known'}</b><span className="rv-row">{setByWords(d.language_set_by, d.language_by, d.language_confidence)}</span>
        <span className="rv-row">Press to change it.</span></>}>
        <button type="button" className={`da-chip${d.language ? '' : ' unset'}`} aria-expanded={open === 'language'} aria-controls={`${id}-lang`}
          aria-label={`Language: ${langName ?? 'not known'}. Change it`}
          onClick={() => { setOpen(o => (o === 'language' ? null : 'language')); setTyped(d.language ?? ''); setError(''); }}>
          <b className="da-code">{d.language ? d.language.toUpperCase() : '–'}</b><span>{langName ?? 'Language?'}</span></button></Reveal>
    </p>
    {open === 'kind' && <div id={`${id}-kind`} className="da-kinds" role="radiogroup" aria-label="What this document is">
      {DOC_KIND_ORDER.map(k => {
        const Icon = DOC_KINDS[k].icon;
        return <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={saving} className={kind === k ? 'on' : undefined}
          onClick={() => void save({kind: k})}><Icon size={16} aria-hidden="true"/><span>{DOC_KINDS[k].name}</span></button>;
      })}
      {kind && <button type="button" role="radio" aria-checked={false} disabled={saving} className="da-clear" onClick={() => void save({kind: null})}>
        <FileQuestion size={16} aria-hidden="true"/><span>Not known</span></button>}
    </div>}
    {open === 'language' && <form id={`${id}-lang`} className="da-lang" onSubmit={e => { e.preventDefault(); void save({language: typedLanguage(typed) || null}); }}>
      <input list={`${id}-langs`} value={typed} onChange={e => setTyped(e.target.value)} aria-label="Language, as a code or a name" placeholder="en, fr, Malay…" autoFocus/>
      <datalist id={`${id}-langs`}>{COMMON_LANGUAGES.map(code => <option key={code} value={code}>{languageName(code)}</option>)}</datalist>
      <button type="submit" className="p" disabled={saving || !typed.trim()}>Save</button>
      {d.language && <button type="button" disabled={saving} onClick={() => void save({language: null})}>Not known</button>}
      <button type="button" onClick={() => setOpen(null)}>Cancel</button>
    </form>}
    {error && <p className="da-error" role="alert">{error}</p>}
  </div>;
}
