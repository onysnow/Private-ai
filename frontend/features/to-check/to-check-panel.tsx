'use client';
// To check (docs/discovery/detection-design.md, "Decided" 4; backend
// app/patterns/checks.py): the work a person does that the records cannot do.
// A checklist item is a part of an indicator a flag's records cannot show; a
// passage is a part of a document that holds an indicator's words. The app
// never decides an item. A slim card shows the question, who it is about and,
// for a passage, the words in place; the decision and an optional note are on
// the card. Each item names its indicator and links to its Red Flag.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement, ReactNode} from 'react';

import {errorMessage} from '../../lib/api-client';
import {decideCheckMutation, getChecksOptions, getChecksQueryKey, getRedFlagsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {ToCheckItemOut} from '../../lib/generated/types.gen';
import {PARTY, partyKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Status = ToCheckItemOut['status'];

export const DECISION: Record<Status, string> = {
  open: 'Not checked yet',
  shows: 'Shows it',
  does_not: 'Does not show it',
  unclear: 'Unclear',
};

const PARTIES_SHOWN = 4;
const sentence = (t: string) => t ? t[0].toUpperCase() + t.slice(1) : t;

/** The excerpt with the indicator's words marked, matched as the backend matches them: whole words, any case. */
export function marked(text: string, terms: string[]): ReactNode[] {
  if (!terms.length) return [text];
  const escaped = terms.map(t => t.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
  const re = new RegExp(`(?<!\\w)(${escaped.join('|')})(?!\\w)`, 'gi');
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<mark key={at}>{m[0]}</mark>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Parties({parties}: {parties: ToCheckItemOut['parties']}): ReactElement | null {
  const setPointed = useWorkbenchStore(state => state.setPointedParty);
  if (!parties.length) return null;
  const shown = parties.slice(0, PARTIES_SHOWN);
  return <div className="rf-who">{shown.map(p => <button type="button" key={p.id} className="sv-pd rf-party"
    onMouseEnter={() => setPointed(p.id)} onMouseLeave={() => setPointed(null)} onFocus={() => setPointed(p.id)} onBlur={() => setPointed(null)}>
    <i style={{borderColor: PARTY[partyKind(p.schema)].ring}}/>{p.name}</button>)}
    {shown.length < parties.length && <span className="sv-muted">+{parties.length - shown.length} more</span>}</div>;
}

function CheckCard({item, highlighted, onDecide}: {item: ToCheckItemOut; highlighted: boolean;
  onDecide: (status: Status, note: string | null) => Promise<void>}): ReactElement {
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(item.note ?? '');
  const goToFlag = (id: string) => { openFlag(id); document.getElementById('red-flags')?.scrollIntoView({behavior: 'smooth', block: 'start'}); };
  const decide = (status: Status) => void onDecide(status, noting ? note.trim() || null : item.note ?? null).then(() => setNoting(false));
  return <article id={`check-${item.id}`} className={`tc-card status-${item.status}${highlighted ? ' open' : ''}`}
    aria-label={`To check: ${sentence(item.question)}`}>
    <header className="tc-head">
      <span className="tc-kind">{item.kind === 'passage' ? 'Passage' : 'Checklist'}</span>
      <h4>{sentence(item.question)}</h4>
    </header>
    <p className="tc-from">{item.indicator_name} · {item.indicator_id}
      {item.flag_id && <> · <button type="button" className="tc-link" onClick={() => goToFlag(item.flag_id!)}>Its Red Flag</button></>}
      {item.related_flags.length > 0 && <> · {item.related_flags.length} other flag{item.related_flags.length > 1 ? 's' : ''} on these parties</>}
    </p>
    <Parties parties={item.parties}/>
    {item.kind === 'passage' && item.excerpt && <blockquote className="tc-excerpt">{marked(item.excerpt, item.terms)}</blockquote>}
    {item.document && <p className="tc-from"><button type="button" className="tc-link" onClick={() => {
      openDocument(item.document!.id); document.getElementById('document-ingestion')?.scrollIntoView({behavior: 'smooth', block: 'start'}); }}>
      {item.document.filename}</button>{item.locator ? `, ${item.locator}` : ''}</p>}
    {item.status !== 'open' && <p className="rf-line"><b>{DECISION[item.status]}</b>{item.note ? `: ${item.note}` : ''}</p>}
    {noting && <textarea className="tc-note" aria-label="What you saw" placeholder="What you saw (stays with the item)" value={note}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}/>}
    <div className="tc-decide" role="group" aria-label="Your decision">
      {(['shows', 'does_not', 'unclear'] as const).map(s => <button type="button" key={s} aria-pressed={item.status === s}
        className={`sv-btn tc-${s}${item.status === s ? ' on' : ''}`} onClick={() => decide(s)}>{DECISION[s]}</button>)}
      {item.status !== 'open' && <button type="button" className="sv-btn" onClick={() => decide('open')}>Undo</button>}
      {noting ? <button type="button" className="sv-btn" onClick={() => decide(item.status)}>Save note</button>
        : <button type="button" className="sv-btn" onClick={() => setNoting(true)}>{item.note ? 'Edit note' : 'Add a note'}</button>}
    </div>
  </article>;
}

export function ToCheckPanel({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const query = useQuery({...getChecksOptions({path}), enabled: Boolean(investigationId)});
  const decide = useMutation({...decideCheckMutation()});
  const key = getChecksQueryKey({path});
  const [problem, setProblem] = useState('');
  const asked = useWorkbenchStore(state => state.check);
  const answered = useRef(0);
  const [highlight, setHighlight] = useState<string | null>(null);

  // A flag's "records can't show" part asks for its item: show it, open the fold it is in, and bring it into view.
  useEffect(() => {
    if (!asked || asked.serial === answered.current) return;
    answered.current = asked.serial;
    setHighlight(asked.checkId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`check-${asked.checkId}`);
      el?.closest('details')?.setAttribute('open', '');
      el?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  }, [asked]);

  const onDecide = (item: ToCheckItemOut) => async (status: Status, note: string | null) => {
    try {
      queryClient.setQueryData(key, await decide.mutateAsync({path: {check_id: item.id}, body: {status, note}}));
      await queryClient.invalidateQueries({queryKey: getRedFlagsQueryKey({path})});
      setProblem('');
    } catch (error) { setProblem(errorMessage(error, 'Could not keep the decision')); }
  };

  const items = query.data?.items ?? [];
  const open = items.filter(i => i.status === 'open');
  const decided = items.filter(i => i.status !== 'open');
  const gone = query.data?.gone ?? [];
  const card = (i: ToCheckItemOut) => <CheckCard key={i.id} item={i} highlighted={highlight === i.id} onDecide={onDecide(i)}/>;

  return <section className="card tc" id="to-check" aria-labelledby="to-check-title">
    <h3 id="to-check-title">To check</h3>
    <p className="sv-psub">What the records cannot show. A person decides each one; the app never does.
      {query.data && <> <span className="tc-count">{open.length} open · {decided.length} decided</span></>}</p>
    {query.isError && <p className="sv-error">{errorMessage(query.error, 'Could not load what to check')}</p>}
    {problem && <p className="sv-error" role="alert">{problem}</p>}
    {query.data && !items.length && <p className="sv-muted">Nothing to check yet. Items appear when a Red Flag&apos;s records cannot show part of its pattern.</p>}
    {open.map(card)}
    {decided.length > 0 && <details className="rf-gone"><summary>Decided ({decided.length})</summary>{decided.map(card)}</details>}
    {gone.length > 0 && <details className="rf-gone"><summary>No longer called for ({gone.length})</summary>
      <ul>{gone.map(i => <li key={i.id}><b>{sentence(i.question)}</b> ({i.indicator_name}){i.status !== 'open' ? `: ${DECISION[i.status]}` : ''}{' '}
        <small>The records changed, or its flag was set aside; the decision is kept.</small></li>)}</ul>
    </details>}
  </section>;
}
