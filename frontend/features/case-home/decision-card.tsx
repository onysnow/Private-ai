'use client';
// One decision as the same five-part card everywhere (FEATURE_CHECK §2):
// question, proposal with who proposed it, evidence, choices, what happens.
// Three tall answers, each a shape, a word and a key; No offers reason chips.
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {AiTag, LevelChip} from '../../components/status';
import {singleKeysOn} from '../../lib/shortcuts';
import type {DecisionChoiceOut, DecisionItemOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {caseHref} from '../../lib/case-href';
import {NO_REASONS, markTerms} from './use-decisions';

const MARK: Record<DecisionChoiceOut['key'], string> = {yes: '✓', no: '✕', unsure: '○'};
export const KEYS = {home: {yes: 's', no: 'd', unsure: 'u'}, decide: {yes: '1', no: '2', unsure: '3'}} as const;

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

export function Excerpt({text, terms}: {text: string; terms: string[]}): ReactElement {
  return <>{markTerms(text, terms).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}</>;
}

export function PartyChips({parties}: {parties: DecisionItemOut['parties']}): ReactElement | null {
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const point = useWorkbenchStore(state => state.setPointedParty);
  if (!parties.length) return null;
  return <ul className="ch-parties" aria-label="Parties">
    {parties.map(p => <li key={p.id}>
      <button type="button" className={`ch-party${pointed === p.id ? ' on' : ''}`} onMouseEnter={() => point(p.id)}
        onFocus={() => point(p.id)} onClick={() => point(pointed === p.id ? null : p.id)} aria-pressed={pointed === p.id}>
        <span aria-hidden="true" className="ch-party-kind">{(p.schema || 'T')[0]}</span>{p.name}
      </button>
    </li>)}
  </ul>;
}

export function DecisionCard({item, position, total, keys, active, onDecide, showWhatHappens = true}: {
  item: DecisionItemOut; position: number; total: number; keys: 'home' | 'decide'; active: boolean;
  onDecide: (choice: DecisionChoiceOut, note: string) => void; showWhatHappens?: boolean;
}): ReactElement {
  const [noOpen, setNoOpen] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { setNoOpen(false); setNote(''); }, [item.id]);
  const keyOf = KEYS[keys];

  useEffect(() => {
    if (!active) return undefined;
    const handle = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || !singleKeysOn()) return;
      const choice = item.choices.find(c => keyOf[c.key] === event.key.toLowerCase());
      if (!choice) return;
      event.preventDefault();
      onDecide(choice, note);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, item, keyOf, note, onDecide]);

  const ev = item.evidence;
  const inv = useWorkbenchStore(state => state.investigationId);
  return <article className={`ch-card ch-kind-${item.kind}`} aria-label={`${item.question} (${position} of ${total})`} data-testid="decision-card">
    <p className="ch-why">
      {item.actor_kind === 'ai' ? <AiTag/> : <span className="ch-actor">{item.actor}</span>}
      {item.level && <LevelChip level={item.level}/>}
      <span>{item.reason}</span>
    </p>
    <h3 className="ch-question">{item.question}</h3>
    <div className="ch-card-body">
    {ev?.excerpt ? <blockquote className="ch-excerpt"><Excerpt text={`“${ev.excerpt.trim()}”`} terms={ev.terms}/></blockquote>
      : <p className="ch-proposal">{item.proposal}</p>}
    {ev && <p className="ch-locator">{[ev.filename, ev.locator].filter(Boolean).join(' · ')}</p>}
    <PartyChips parties={item.parties}/>
    {showWhatHappens && item.consequences.length > 0 && <div className="ch-happens">
      <p className="ch-eyebrow">If you answer</p>
      <ul>{item.consequences.map(c => <li key={c}>{c}</li>)}</ul>
    </div>}
    </div>
    {item.choices.length > 0 ? <>
      <div className="ch-choices" role="group" aria-label="Your answer">
        {item.choices.map(c => <button key={c.key} type="button" className={`ch-choice ch-${c.key}`} aria-keyshortcuts={keyOf[c.key].toUpperCase()}
          onClick={() => (c.key === 'no' && !noOpen && NO_REASONS[item.kind].length ? setNoOpen(true) : onDecide(c, note))}>
          <span aria-hidden="true">{MARK[c.key]}</span>{c.label}<kbd>{keyOf[c.key].toUpperCase()}</kbd>
        </button>)}
      </div>
      {noOpen && <div className="ch-reasons" role="group" aria-label="Why not">
        {NO_REASONS[item.kind].map(r => <button key={r} type="button" className="ch-chip" onClick={() => {
          const no = item.choices.find(c => c.key === 'no');
          if (no) onDecide(no, [r, note].filter(Boolean).join(' — '));
        }}>{r}</button>)}
        <input aria-label="Note" placeholder="Or write why…" value={note} onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { const no = item.choices.find(c => c.key === 'no'); if (no) onDecide(no, note); } }}/>
      </div>}
    </> : <p className="ch-elsewhere">This one is answered where it lives: <Link href={caseHref(item.open.href, inv)}>{item.open.label}</Link>.</p>}
  </article>;
}
