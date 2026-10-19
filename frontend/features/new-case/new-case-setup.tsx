'use client';
// Starting a case (mockup HOME_2, "New-case setup"): its name and the question it
// answers, what kind of case it is (the Red Flag catalogue's areas; the app picks them
// itself from what you bring in when you skip this), and what you have so far, which
// decides where you land: documents and spreadsheets go to Bring in, names to Search.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {listAreasOptions, listInvestigationsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createInvestigation, setInvestigationType} from '../../lib/generated/sdk.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

export const HAVE: {key: string; label: string; line: string; href: string}[] = [
  {key: 'documents', label: 'Documents', line: 'PDFs, scans, e-mails, pictures', href: '/bring-in#document-ingestion'},
  {key: 'table', label: 'A spreadsheet', line: 'Payments, registers, lists of records', href: '/bring-in#document-ingestion'},
  {key: 'names', label: 'Names to look up', line: 'People or companies to find in the records', href: '/bring-in#investigation-search'},
  {key: 'nothing', label: 'Nothing yet', line: 'A tip or a question to start from', href: '/'},
];

export function NewCaseSetup({onCreated}: {onCreated?: (id: string) => void}): ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const areas = useQuery(listAreasOptions()).data ?? [];
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [have, setHave] = useState('documents');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = areas.filter(a => kinds.includes(a.key) || words.every(w => `${a.name} ${a.summary}`.toLowerCase().includes(w)));
  const toggle = (key: string) => setKinds(k => (k.includes(key) ? k.filter(x => x !== key) : [...k, key]));

  const start = async () => {
    setBusy(true); setProblem('');
    try {
      const created = (await createInvestigation({body: {name: name.trim(), question: question.trim() || null}, throwOnError: true})).data;
      if (kinds.length) await setInvestigationType({path: {investigation_id: created.id}, body: {areas: kinds}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
      useWorkbenchStore.getState().setInvestigationId(created.id);
      onCreated?.(created.id);
      router.push(caseHref(HAVE.find(h => h.key === have)?.href ?? '/', created.id));
    } catch (error) { setProblem(errorMessage(error, 'Could not start the case')); } finally { setBusy(false); }
  };

  return <form className="nc" aria-label="Start a case" onSubmit={e => { e.preventDefault(); if (name.trim()) void start(); }}>
    <fieldset>
      <legend><span>1</span>The case</legend>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Kestrel harbour land" required maxLength={255}/></label>
      <label>The question it answers <small>(you can write it later)</small>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Who really owns the harbour land?" maxLength={500}/></label>
    </fieldset>
    <fieldset>
      <legend><span>2</span>What kind of case <small>(optional: skip it and the app suggests kinds from what you bring in)</small></legend>
      <input type="search" aria-label="Find a kind of case" placeholder="Find a kind: money laundering, trafficking…" value={filter} onChange={e => setFilter(e.target.value)}/>
      <div className="nc-kinds" role="group" aria-label="Kinds of case">
        {shown.map(a => <button key={a.key} type="button" aria-pressed={kinds.includes(a.key)} className={kinds.includes(a.key) ? 'on' : ''}
          title={a.summary} onClick={() => toggle(a.key)}>{a.name}</button>)}
        {!shown.length && <p className="nc-quiet">{areas.length ? 'No kind matches.' : 'Reading the catalogue…'}</p>}
      </div>
    </fieldset>
    <fieldset>
      <legend><span>3</span>What do you have so far</legend>
      <div className="nc-have" role="radiogroup" aria-label="What you have so far">
        {HAVE.map(h => <label key={h.key} className={have === h.key ? 'on' : ''}>
          <input type="radio" name="nc-have" checked={have === h.key} onChange={() => setHave(h.key)}/><b>{h.label}</b><small>{h.line}</small></label>)}
      </div>
    </fieldset>
    <button type="submit" className="nc-go" disabled={!name.trim() || busy}>{busy ? 'Starting…' : 'Start the case'}</button>
    {problem && <p role="alert">{problem}</p>}
  </form>;
}
