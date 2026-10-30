'use client';
// To check (docs/discovery/detection-design.md, "Decided" 4; backend
// app/patterns/checks.py): the work a person does that the records cannot do.
// A checklist item is a part of an indicator a flag's records cannot show; a
// passage is a part of a document that holds an indicator's words. The app
// never decides an item. A slim card shows the question, who it is about and,
// for a passage, the words in place; the decision and an optional note are on
// the card. Each item names its indicator and links to its Red Flag. A money
// check a person kept from See › Money carries the check's numbers as they were.
//
// The answers are Case home's Next-up answers (features/case-home/decision-card.tsx): three tall buttons, each a shape,
// a word and a key (S shows it, D does not, U unclear), answering the card in hand: the one pointed at or focused, else
// the first open one. The counts are figures with their marks, named on reveal; the cards share the screen's height.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {NotebookPen, Undo2} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement, ReactNode} from 'react';

import {PartyGlyph} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {onScreen, typingInto} from '../../lib/on-screen';
import {singleKeysOn} from '../../lib/shortcuts';
import {decideCheckMutation, getChecksOptions, getChecksQueryKey, getRedFlagsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {RedFlagOut, ToCheckItemOut} from '../../lib/generated/types.gen';
import {PARTY, partyKind} from '../../lib/viz-tokens';
import './to-check.css';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';
import {DemoMark, demoRule, isDemoDecided, useUndoPreDecided} from '../demo/pre-decided';

type Status = ToCheckItemOut['status'];

export const DECISION: Record<Status, string> = {
  open: 'Not checked yet',
  shows: 'Shows it',
  does_not: 'Does not show it',
  unclear: 'Unclear',
};

/** A decision as its shape (Red Flags' "records can't show" marks); the word is revealed. */
const DECISION_MARK: Record<Status, string> = {open: '○', shows: '✓', does_not: '✕', unclear: '?'};
/** The three answers as Case home's Next-up card draws them: its class, the short word on the button, its key. */
const ANSWERS = [
  {status: 'shows', cls: 'ch-yes', word: 'Shows it', key: 's'},
  {status: 'does_not', cls: 'ch-no', word: 'Does not', key: 'd'},
  {status: 'unclear', cls: 'ch-unsure', word: 'Unclear', key: 'u'},
] as const;

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

/** What tells one card from another (Ony's card rule: who, what, how much, when, and why it is there). One indicator
 *  fires on several groups and asks each the same question ("whether there was a business reason for the payments"),
 *  so the title is what the item's Red Flag found, as its summary words it ("3 payments between Tanore Finance and
 *  Granton Property"), with the years it covers; why it is there follows (what the summary adds after its first
 *  clause), then the question itself. An item with no flag keeps its question as the title. */
export function checkTitle(item: Pick<ToCheckItemOut, 'question'>, flag?: Pick<RedFlagOut, 'summary' | 'years'> | null): {head: string; when: string | null; why: string | null; ask: string | null} {
  const question = sentence(item.question);
  const summary = flag?.summary?.trim() ?? '';
  const years = [...new Set(flag?.years ?? [])].sort((a, b) => a - b);
  const when = years.length ? (years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`) : null;
  if (!summary) return {head: question, when, why: null, ask: null};
  const at = summary.indexOf('; ');
  const head = (at < 0 ? summary : summary.slice(0, at)).replace(/\.$/, '');
  const why = at < 0 ? null : sentence(summary.slice(at + 2).trim());
  return {head: sentence(head), when, why, ask: question};
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

function CheckCard({item, flag, highlighted, inHand, onHand, onDecide, onUndoDemo}: {item: ToCheckItemOut; flag?: RedFlagOut; highlighted: boolean; inHand: boolean;
  onHand: () => void; onDecide: (status: Status, note: string | null) => Promise<void>;
  /** Undo a decision the demo made ahead (back to not checked, its note gone with it). */
  onUndoDemo: () => Promise<void>}): ReactElement {
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState(item.note ?? '');
  const goToFlag = (id: string) => { openFlag(id); document.getElementById('red-flags')?.scrollIntoView({behavior: 'smooth', block: 'start'}); };
  const decide = (status: Status) => void onDecide(status, noting ? note.trim() || null : item.note ?? null).then(() => setNoting(false));
  // A decision the demo made ahead carries its mark; its rule is on hover, not written on the card.
  const demo = item.status !== 'open' && isDemoDecided(item);
  const undo = () => (demo ? void onUndoDemo() : decide('open'));
  // The keys answer the card in hand (the panel decides which); a note being typed keeps its keys.
  useEffect(() => {
    if (!inHand) return undefined;
    const handle = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typingInto(e.target) || !singleKeysOn()) return;
      const answer = ANSWERS.find(a => a.key === e.key.toLowerCase());
      if (!answer || !onScreen(document.getElementById(`check-${item.id}`))) return;
      e.preventDefault();
      decide(answer.status);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });
  const title = checkTitle(item, flag);
  return <article id={`check-${item.id}`} className={`tc-card status-${item.status}${highlighted ? ' open' : ''}${inHand ? ' in-hand' : ''}`}
    aria-label={`To check: ${title.head}`} onPointerEnter={onHand} onFocus={onHand}>
    <div className="tc-body">
    {/* The kind is the icon; it and where the item comes from (the indicator, or See › Money) are revealed on it. */}
    <header className="tc-head">
      <Reveal label={KIND_WORD[item.kind]} detail={<><b>{KIND_WORD[item.kind]}</b>
        <span className="rv-row">{item.kind === 'money' ? <>Kept from See › Money · {item.locator}</> : <>{item.indicator_name} · {item.indicator_id}</>}</span></>}>
        <KindIcon kind={item.kind}/></Reveal>
      <h4>{title.head}</h4>
      {title.when && <span className="tc-when">{title.when}</span>}
    </header>
    {(title.ask || title.why) && <p className="tc-ask">{title.ask && <b>{title.ask}</b>}{title.why && <span>{title.why}</span>}</p>}
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
      {demo ? <DemoMark rule={demoRule(item.note)}/> : item.note && <span>{item.note}</span>}</p>}
    {noting && <textarea className="tc-note" aria-label="What you saw" placeholder="What you saw (stays with the item)" value={note}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}/>}
    </div>
    <div className="tc-decide">
      <div className="ch-choices" role="group" aria-label="Your decision">
        {ANSWERS.map(a => <button type="button" key={a.status} aria-pressed={item.status === a.status} aria-label={DECISION[a.status]}
          aria-keyshortcuts={inHand ? a.key.toUpperCase() : undefined}
          className={`ch-choice ${a.cls}${item.status === a.status ? ' on' : ''}`} onClick={() => decide(a.status)}>
          <span aria-hidden="true">{DECISION_MARK[a.status]}</span>{a.word}</button>)}
      </div>
      {/* Undo and the note are icons; their words on reveal. */}
      <span className="tc-tools">
        {item.status !== 'open' && <Reveal tabbable={false} describe={false} detail={demo ? 'Undo the demo’s decision: back to not checked' : 'Undo: back to not checked'}>
          <button type="button" className="tc-icon-btn" aria-label="Undo" onClick={undo}><Undo2 size={17} aria-hidden="true"/></button></Reveal>}
        {noting ? <button type="button" className="sv-btn" onClick={() => decide(item.status)}>Save note</button>
          : <Reveal tabbable={false} describe={false} detail={item.note ? 'Edit the note' : 'Add a note: what you saw'}>
            <button type="button" className="tc-icon-btn" aria-label={item.note ? 'Edit note' : 'Add a note'} onClick={() => setNoting(true)}>
              <NotebookPen size={17} aria-hidden="true"/></button></Reveal>}
      </span>
    </div>
  </article>;
}

export function ToCheckPanel({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const query = useQuery({...getChecksOptions({path}), enabled: Boolean(investigationId)});
  // Reading To check never brings it up to date: when it is behind the records, this runs the rules once and the
  // run refetches the items.
  const flags = useRedFlagsQuery(investigationId).query.data;
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

  const undoDemo = useUndoPreDecided(investigationId);
  const onUndoDemo = (item: ToCheckItemOut) => async () => {
    try { await undoDemo.run({kind: 'check', id: item.id}); setProblem(''); } catch (error) { setProblem(errorMessage(error, 'Could not undo the demo’s decision')); }
  };

  const items = query.data?.items ?? [];
  const open = items.filter(i => i.status === 'open');
  const decided = items.filter(i => i.status !== 'open');
  const gone = query.data?.gone ?? [];
  // The card the keys answer: the one last pointed at or focused while it is still open, else the first open one.
  const [hand, setHand] = useState<string | null>(null);
  const inHand = open.some(i => i.id === hand) ? hand : open[0]?.id ?? null;
  const flagOf = new Map([...(flags?.flags ?? []), ...(flags?.gone ?? [])].map(f => [f.id, f]));
  const card = (i: ToCheckItemOut) => <CheckCard key={i.id} item={i} flag={i.flag_id ? flagOf.get(i.flag_id) : undefined} highlighted={highlight === i.id} inHand={inHand === i.id}
    onHand={() => setHand(i.id)} onDecide={onDecide(i)} onUndoDemo={onUndoDemo(i)}/>;
  const figure = (n: number, mark: string, cls: string, word: string) => <Reveal label={`${n} ${word}`} describe={false} detail={<b>{n} {word}</b>}>
    <span className={`tc-fig ${cls}${n ? '' : ' zero'}`} aria-hidden="true"><i>{mark}</i><b>{n}</b></span></Reveal>;

  return <section className="tc" id="to-check" aria-labelledby="to-check-title">
    {/* The explanation is revealed on the title; the counts show, as figures. */}
    <header className="tc-top">
      <h3 id="to-check-title"><Reveal detail="What the records cannot show. A person decides each one; the app never does.">To check</Reveal></h3>
      {query.data && <p className="tc-figs">{figure(open.length, '○', 'f-open', 'open')}{figure(decided.length, '✓', 'f-decided', 'decided')}</p>}
      {/* The keys answer the card in hand (the one pointed at or focused, else the first open one); they are behind ?. */}
      {open.length > 0 && <Reveal label="Keys" detail={<><b>Keys</b><span className="rv-row"><kbd>S</kbd> Shows it · <kbd>D</kbd> Does not · <kbd>U</kbd> Unclear</span>
        <span className="rv-row">They answer the card you point at, else the first open one.</span></>}><span className="tc-keys" aria-hidden="true">?</span></Reveal>}
    </header>
    {query.isError && <p className="sv-error">{errorMessage(query.error, 'Could not load what to check')}</p>}
    {problem && <p className="sv-error" role="alert">{problem}</p>}
    <div className="tc-list">
      {query.data && !items.length && <p className="tc-none"><Reveal detail="Items appear when a Red Flag's records cannot show part of its pattern.">Nothing to check yet.</Reveal></p>}
      {open.map(card)}
      {decided.length > 0 && <details className="rf-gone"><summary>Decided ({decided.length})</summary>{decided.map(card)}</details>}
      {/* Why an item is no longer called for, and its indicator, are revealed on its question; the decision kept shows. */}
      {gone.length > 0 && <details className="rf-gone"><summary>No longer called for ({gone.length})</summary>
        <ul>{gone.map(i => <li key={i.id}><Reveal detail={<><b>{i.indicator_name}</b><span className="rv-row">The records changed, or its flag was set aside; the decision is kept.</span></>}>
          <b>{sentence(i.question)}</b></Reveal>{i.status !== 'open' ? `: ${DECISION[i.status]}` : ''}</li>)}</ul>
      </details>}
    </div>
  </section>;
}
