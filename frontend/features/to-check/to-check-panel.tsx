'use client';
// To check (docs/discovery/detection-design.md, "Decided" 4; backend
// app/patterns/checks.py): the work a person does that the records cannot do.
// A checklist item is a part of an indicator a flag's records cannot show; a
// passage is a part of a document that holds an indicator's words. The app
// never decides an item. A slim card shows the question, who it is about and,
// for a passage, the words in place; the decision and an optional note are on
// the card. Each item names its indicator and links to its Red Flag. A money
// check a person kept from See › Money carries the check's numbers as they were.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement, ReactNode} from 'react';

import {PartyGlyph} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {decideCheckMutation, getChecksOptions, getChecksQueryKey, getRedFlagsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {ToCheckItemOut} from '../../lib/generated/types.gen';
import {PARTY, partyKind} from '../../lib/viz-tokens';
import './to-check.css';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';

type Status = ToCheckItemOut['status'];

export const DECISION: Record<Status, string> = {
  open: 'Not checked yet',
  shows: 'Shows it',
  does_not: 'Does not show it',
  unclear: 'Unclear',
};

/** A decision as its shape (Red Flags' "records can't show" marks); the word is revealed. */
const DECISION_MARK: Record<Status, string> = {open: '○', shows: '✓', does_not: '✕', unclear: '?'};

/** What kind of item it is, as an icon (quote marks, a coin, a checkbox); the word is revealed. */
const KIND_WORD: Record<ToCheckItemOut['kind'], string> = {passage: 'Passage', money: 'Money check', checklist: 'Checklist'};
function KindIcon({kind}: {kind: ToCheckItemOut['kind']}): ReactElement {
  return <svg className="tc-icon" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    {kind === 'passage' ? <><path d="M3 9.5c0-3 1-4.5 3-5.5M3 9.5h3v3.5H3zM9 9.5c0-3 1-4.5 3-5.5M9 9.5h3v3.5H9z"/></>
      : kind === 'money' ? <><circle cx="8" cy="8" r="6"/><path d="M9.8 5.6A2.4 2.4 0 0 0 6 7c0 2 4 1 4 3a2.4 2.4 0 0 1-4 1.2M8 3.8v1.4M8 10.8v1.4"/></>
      : <><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5 8.2l2 2 4-4.4"/></>}
  </svg>;
}

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
  // Each party carries its kind's icon (the network's vocabulary); the kind is named on reveal.
  return <div className="rf-who">{shown.map(p => <Reveal key={p.id} tabbable={false} detail={PARTY[partyKind(p.schema)].name}>
    <button type="button" className="sv-pd rf-party"
      onMouseEnter={() => setPointed(p.id)} onMouseLeave={() => setPointed(null)} onFocus={() => setPointed(p.id)} onBlur={() => setPointed(null)}>
      <PartyGlyph kind={partyKind(p.schema)} size={14}/>{p.name}</button></Reveal>)}
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
    {/* The kind is the icon; it and where the item comes from (the indicator, or See › Money) are revealed on it. */}
    <header className="tc-head">
      <Reveal label={KIND_WORD[item.kind]} detail={<><b>{KIND_WORD[item.kind]}</b>
        <span className="rv-row">{item.kind === 'money' ? <>Kept from See › Money · {item.locator}</> : <>{item.indicator_name} · {item.indicator_id}</>}</span></>}>
        <KindIcon kind={item.kind}/></Reveal>
      <h4>{sentence(item.question)}</h4>
    </header>
    {(item.flag_id || item.related_flags.length > 0) && <p className="tc-from">
      {item.flag_id && <button type="button" className="tc-link" onClick={() => goToFlag(item.flag_id!)}>Its Red Flag</button>}
      {item.related_flags.length > 0 && <Reveal detail={`${item.related_flags.length} other flag${item.related_flags.length > 1 ? 's' : ''} on these parties`}>
        <span className="tc-more">+{item.related_flags.length} flag{item.related_flags.length > 1 ? 's' : ''}</span></Reveal>}
    </p>}
    <Parties parties={item.parties}/>
    {/* The file and the place in it are revealed on the passage; Open the file stays. */}
    {item.kind === 'passage' && item.excerpt && (item.document
      ? <Reveal detail={<span className="rv-mono">{item.document.filename}{item.locator ? `, ${item.locator}` : ''}</span>}>
        <blockquote className="tc-excerpt">{marked(item.excerpt, item.terms)}</blockquote></Reveal>
      : <blockquote className="tc-excerpt">{marked(item.excerpt, item.terms)}</blockquote>)}
    {item.kind === 'money' && item.excerpt && <p className="tc-excerpt">{item.excerpt}</p>}
    {item.document && <p className="tc-from"><Reveal tabbable={false} detail={<span className="rv-mono">{item.document.filename}{item.locator ? `, ${item.locator}` : ''}</span>}>
      <button type="button" className="tc-link" onClick={() => {
        openDocument(item.document!.id); document.getElementById('document-ingestion')?.scrollIntoView({behavior: 'smooth', block: 'start'}); }}>
        Open the file</button></Reveal></p>}
    {item.status !== 'open' && <p className="rf-line tc-decided">
      <Reveal label={DECISION[item.status]} detail={<b>{DECISION[item.status]}</b>}>
        <span className={`tc-mark tc-mark-${item.status}`} aria-hidden="true">{DECISION_MARK[item.status]}</span></Reveal>
      {item.note && <span>{item.note}</span>}</p>}
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
  // Reading To check never brings it up to date: when it is behind the records, this runs the rules once and the
  // run refetches the items.
  useRedFlagsQuery(investigationId);
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
    {/* The explanation is revealed on the title; the counts show. */}
    <h3 id="to-check-title"><Reveal detail="What the records cannot show. A person decides each one; the app never does.">To check</Reveal></h3>
    {query.data && <p className="sv-psub"><span className="tc-count">{open.length} open · {decided.length} decided</span></p>}
    {query.isError && <p className="sv-error">{errorMessage(query.error, 'Could not load what to check')}</p>}
    {problem && <p className="sv-error" role="alert">{problem}</p>}
    {query.data && !items.length && <p className="sv-muted">Nothing to check yet. Items appear when a Red Flag&apos;s records cannot show part of its pattern.</p>}
    {open.map(card)}
    {decided.length > 0 && <details className="rf-gone"><summary>Decided ({decided.length})</summary>{decided.map(card)}</details>}
    {/* Why an item is no longer called for, and its indicator, are revealed on its question; the decision kept shows. */}
    {gone.length > 0 && <details className="rf-gone"><summary>No longer called for ({gone.length})</summary>
      <ul>{gone.map(i => <li key={i.id}><Reveal detail={<><b>{i.indicator_name}</b><span className="rv-row">The records changed, or its flag was set aside; the decision is kept.</span></>}>
        <b>{sentence(i.question)}</b></Reveal>{i.status !== 'open' ? `: ${DECISION[i.status]}` : ''}</li>)}</ul>
    </details>}
  </section>;
}
