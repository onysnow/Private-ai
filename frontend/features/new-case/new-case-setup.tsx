'use client';
// Starting a case (mockup HOME_2, "New-case setup"): its name and the question it
// answers, what kind of case it is (the Red Flag catalogue's areas; the app picks them
// itself from what you bring in when you skip this), and what you have so far, which
// decides where you land: documents and spreadsheets go to Bring in, names to Search.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import type {ReactElement} from 'react';
import {z} from 'zod';


import {FileText, MessageCircleQuestion, Search, Table} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

import {Reveal} from '../../components/ui/reveal';
import {Form, FormControl, FormField, FormItemBare, FormMessage, FormRootError} from '@/components/ui/form';
import {caseHref} from '../../lib/case-href';
import {submitWith, useZodForm} from '../../lib/forms';
import {listAreasOptions, listInvestigationsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createInvestigation, setInvestigationType} from '../../lib/generated/sdk.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

export const HAVE: {key: string; label: string; line: string; href: string; icon: LucideIcon}[] = [
  {key: 'documents', label: 'Documents', line: 'PDFs, scans, e-mails, pictures', href: '/bring-in#document-ingestion', icon: FileText},
  {key: 'table', label: 'A spreadsheet', line: 'Payments, registers, lists of records', href: '/bring-in#document-ingestion', icon: Table},
  {key: 'names', label: 'Names to look up', line: 'People or companies to find in the records', href: '/bring-in#investigation-search', icon: Search},
  {key: 'nothing', label: 'Nothing yet', line: 'A tip or a question to start from', href: '/', icon: MessageCircleQuestion},
];

// The case's name and question, as the backend takes them (InvestigationCreate; the name as InvestigationUpdate allows it, 1–255).
const caseSchema = z.object({
  name: z.string().trim().min(1, 'Give the case a name.').max(255, 'Keep the name under 255 characters.'),
  question: z.string().trim().max(500, 'Keep the question under 500 characters.'),
});
type CaseValues = z.infer<typeof caseSchema>;

export function NewCaseSetup({onCreated}: {onCreated?: (id: string) => void}): ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const areas = useQuery(listAreasOptions()).data ?? [];
  const form = useZodForm<CaseValues>(caseSchema, {defaultValues: {name: '', question: ''}});
  const [kinds, setKinds] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [have, setHave] = useState('documents');
  const busy = form.formState.isSubmitting;
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = areas.filter(a => kinds.includes(a.key) || words.every(w => `${a.name} ${a.summary}`.toLowerCase().includes(w)));
  const toggle = (key: string) => setKinds(k => (k.includes(key) ? k.filter(x => x !== key) : [...k, key]));

  // A case with no name is refused under the field; a refused save stays in the form, with what was typed.
  const start = submitWith(form, async ({name, question}) => {
    const created = (await createInvestigation({body: {name, question: question || null}, throwOnError: true})).data;
    if (kinds.length) await setInvestigationType({path: {investigation_id: created.id}, body: {areas: kinds}, throwOnError: true});
    await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
    useWorkbenchStore.getState().setInvestigationId(created.id);
    onCreated?.(created.id);
    router.push(caseHref(HAVE.find(h => h.key === have)?.href ?? '/', created.id));
  }, 'Could not start the case');

  return <Form {...form}><form className="nc" aria-label="Start a case" onSubmit={start} noValidate>
    <fieldset>
      <legend><span>1</span>The case</legend>
      <FormField control={form.control} name="name" render={({field}) => <FormItemBare>
        <label>Name<FormControl><input {...field} placeholder="Kestrel harbour land" required maxLength={255}/></FormControl></label>
        <FormMessage className="field-msg"/></FormItemBare>}/>
      <FormField control={form.control} name="question" render={({field}) => <FormItemBare>
        <label><Reveal detail="You can write it later.">The question it answers</Reveal>
          <FormControl><input {...field} placeholder="Who really owns the harbour land?" maxLength={500}/></FormControl></label>
        <FormMessage className="field-msg"/></FormItemBare>}/>
    </fieldset>
    <fieldset>
      <legend><span>2</span><Reveal detail="Optional: skip it and the app suggests kinds from what you bring in.">What kind of case</Reveal></legend>
      <input type="search" aria-label="Find a kind of case" placeholder="Find a kind: money laundering, trafficking…" value={filter} onChange={e => setFilter(e.target.value)}/>
      <div className="nc-kinds" role="group" aria-label="Kinds of case">
        {shown.map(a => <Reveal key={a.key} tabbable={false} detail={a.summary}><button type="button" aria-pressed={kinds.includes(a.key)} className={kinds.includes(a.key) ? 'on' : ''}
          onClick={() => toggle(a.key)}>{a.name}</button></Reveal>)}
        {!shown.length && <p className="nc-quiet">{areas.length ? 'No kind matches.' : 'Reading the catalogue…'}</p>}
      </div>
    </fieldset>
    <fieldset>
      <legend><span>3</span>What do you have so far</legend>
      <div className="nc-have" role="radiogroup" aria-label="What you have so far">
        {/* Each option is its icon and its name; what it covers is on hover or focus (Ony, 29 Oct). */}
        {HAVE.map(h => <Reveal key={h.key} tabbable={false} describe={false} className="nc-have-rv" detail={h.line}><label className={have === h.key ? 'on' : ''}>
          <input type="radio" name="nc-have" checked={have === h.key} onChange={() => setHave(h.key)}/><h.icon className="nc-have-icon" size={20} strokeWidth={1.8} aria-hidden="true"/>
          <b>{h.label}</b><small className="sr-only">{h.line}</small></label></Reveal>)}
      </div>
    </fieldset>
    <FormRootError className="field-msg"/>
    <button type="submit" className="nc-go" disabled={busy}>{busy ? 'Starting…' : 'Start the case'}</button>
  </form></Form>;
}
