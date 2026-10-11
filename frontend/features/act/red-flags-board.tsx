'use client';
// Act · Red Flags as one screen (redesign board 3, "A section page: Red
// Flags"): the flags on the left, the chosen one in full on the right, so
// reading a flag never leaves the list. Flags of one kind are one row with a
// count ("Payments with no purpose found · 31"), stepped through on the right:
// on the 1MDB case one kind fired 31 times and buried the rest. J and K move
// down and up the list, [ and ] step within a kind.
import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import type {RedFlagOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {GlossaryText} from '../glossary/glossary-text';
import {FlagDetail, InvestigationType, LEVEL, LEVEL_ORDER, flagsByArea, useRedFlags} from '../red-flags/red-flags-panel';

type Show = 'all' | 'textbook' | 'strong' | 'faint' | 'aside';
type Kind = {key: string; name: string; level: string; flags: RedFlagOut[]; weight: number};

/** The level as a shape and a word, never colour alone: ▮▮▮ Textbook, ▮▮ Strong, ▮ Faint. */
export function LevelMark({level}: {level: string}): ReactElement {
  const bars = level === 'textbook' ? 3 : level === 'strong' ? 2 : 1;
  return <span className={`rb-level rb-level-${level}`}><i aria-hidden="true">{'▮'.repeat(bars)}</i>{LEVEL[level]?.name ?? level}</span>;
}

const isAside = (f: RedFlagOut) => f.status === 'dismissed';

/** One row per kind of flag, Textbook first, then by the heaviest flag of the kind. */
export function groupFlags(flags: RedFlagOut[]): Kind[] {
  const kinds = new Map<string, Kind>();
  for (const f of flags) {
    const key = `${f.indicator_id}:${f.level}`;
    const kind = kinds.get(key) ?? {key, name: f.indicator?.name ?? f.indicator_id, level: f.level, flags: [], weight: -Infinity};
    kind.flags.push(f);
    kind.weight = Math.max(kind.weight, f.weight);
    kinds.set(key, kind);
  }
  return [...kinds.values()].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || b.weight - a.weight || a.name.localeCompare(b.name));
}

export function RedFlagsBoard({investigationId}: {investigationId: string}): ReactElement {
  const {query, problem, actionsFor, setAreas} = useRedFlags(investigationId);
  const [show, setShow] = useState<Show>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const flags = useMemo(() => query.data?.flags ?? [], [query.data]);
  const live = flags.filter(f => !isAside(f));
  const count = (level: string) => live.filter(f => f.level === level).length;
  const chips: [Show, string, number][] = [['all', 'All', live.length], ['textbook', 'Textbook', count('textbook')], ['strong', 'Strong', count('strong')],
    ['faint', 'Faint', count('faint')], ['aside', 'Set aside', flags.length - live.length]];
  const kinds = useMemo(() => groupFlags(flags.filter(f => (show === 'aside' ? isAside(f) : !isAside(f) && (show === 'all' || f.level === show)))), [flags, show]);
  const kind = kinds.find(k => k.key === picked) ?? kinds[0];
  const flag = kind ? kind.flags[Math.min(step, kind.flags.length - 1)] : undefined;

  // An item in To check asks for its flag: show it.
  const askedFlag = useWorkbenchStore(state => state.flag);
  const answered = useRef(0);
  useEffect(() => {
    if (!askedFlag || askedFlag.serial === answered.current || !flags.length) return;
    answered.current = askedFlag.serial;
    const target = flags.find(f => f.id === askedFlag.flagId);
    if (!target) return;
    setShow(isAside(target) ? 'aside' : 'all');
    const key = `${target.indicator_id}:${target.level}`;
    setPicked(key);
    setStep(Math.max(0, flags.filter(f => `${f.indicator_id}:${f.level}` === key && isAside(f) === isAside(target)).findIndex(f => f.id === target.id)));
  }, [askedFlag, flags]);

  const pick = (key: string) => { setPicked(key); setStep(0); };
  const move = (by: number) => {
    if (!kinds.length) return;
    const at = Math.max(0, kinds.findIndex(k => k.key === kind?.key));
    const next = kinds[Math.min(kinds.length - 1, Math.max(0, at + by))];
    pick(next.key);
    listRef.current?.querySelector<HTMLElement>(`[data-kind="${CSS.escape(next.key)}"]`)?.scrollIntoView({block: 'nearest'});
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'j') { e.preventDefault(); move(1); }
    if (e.key === 'k') { e.preventDefault(); move(-1); }
    if (e.key === ']' && kind) { e.preventDefault(); setStep(s => Math.min(kind.flags.length - 1, s + 1)); }
    if (e.key === '[') { e.preventDefault(); setStep(s => Math.max(0, s - 1)); }
  };

  const rules = query.data?.rules ?? [];
  const cannot = query.data?.cannot_run ?? [];
  const gone = query.data?.gone ?? [];
  const type = query.data?.investigation_type;

  return <div className="rb" onKeyDown={onKey} id="red-flags">
    <div className="rb-list-col">
      <div className="rb-head">
        <h2>Red Flags</h2>
        <p className="rb-sub">Patterns from published cases, found in this case&apos;s records. A lead, not a finding.{' '}
          {rules.length > 0 && <span title={rules.map(r => r.name).join('\n')}>{rules.length - cannot.length} of {rules.length} checks ran.</span>}</p>
        {type && <InvestigationType kind={type} flagsByArea={flagsByArea(live)} onSet={setAreas}/>}
      </div>
      <div className="rb-chips" role="group" aria-label="Show">
        {chips.map(([key, label, n]) => (key === 'aside' && !n ? null : <button key={key} type="button" aria-pressed={show === key}
          className={show === key ? 'on' : ''} onClick={() => { setShow(key); setPicked(null); setStep(0); }}>{label} {n}</button>))}
      </div>
      {query.isError && <p role="alert" className="rb-quiet">{errorMessage(query.error, 'Could not run the rules')}</p>}
      {problem && <p role="alert" className="rb-quiet">{problem}</p>}
      <div className="rb-list" ref={listRef} role="list" aria-label="Red Flags, by kind">
        {query.isPending && investigationId ? <div className="ch-skeleton" aria-busy="true" aria-label="Running the rules"/>
          : !kinds.length ? <p className="rb-quiet">{show === 'all' ? 'No pattern fires on these records.' : 'None at this level.'}</p>
          : kinds.map((k, i) => {
            const first = k.flags[0];
            return <button key={k.key} type="button" role="listitem" data-kind={k.key} className={`rb-row level-${k.level}${k.key === kind?.key ? ' on' : ''}`}
              aria-current={k.key === kind?.key ? 'true' : undefined} onClick={() => pick(k.key)} style={{animationDelay: `${Math.min(i, 12) * 40}ms`}}>
              <span className="rb-row-top"><LevelMark level={k.level}/>{k.flags.length > 1 && <span className="rb-count">{k.flags.length} found</span>}</span>
              <span className="rb-name">{k.name}</span>
              <span className="rb-short">{first.parties.slice(0, 2).map(p => p.name).join(' → ')}{k.flags.length > 1 ? ` and ${k.flags.length - 1} more like it` : ''}</span>
            </button>;
          })}
        {cannot.length > 0 && show === 'all' && <details className="rb-fold"><summary>{cannot.length} checks could not run on these records</summary>
          <ul>{cannot.map(c => <li key={c.indicator_id}><b>{c.name}</b>: {c.reason}</li>)}</ul></details>}
        {gone.length > 0 && show === 'all' && <details className="rb-fold"><summary>No longer fire ({gone.length})</summary>
          <ul>{gone.map(f => <li key={f.id}><b>{f.indicator?.name ?? f.indicator_id}</b>: <GlossaryText text={f.summary}/></li>)}</ul></details>}
      </div>
      <p className="rb-keys" aria-hidden="true"><kbd>J</kbd><kbd>K</kbd> move · <kbd>[</kbd><kbd>]</kbd> step within a kind</p>
    </div>

    <aside className={`rb-detail level-${flag?.level ?? 'none'}`} aria-label="The chosen Red Flag" aria-live="polite">
      {flag && kind ? <>
        {kind.flags.length > 1 && <div className="rb-step" role="group" aria-label="Flags of this kind">
          <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous of this kind">‹</button>
          <span><b>{Math.min(step, kind.flags.length - 1) + 1}</b> of {kind.flags.length} of this kind</span>
          <button type="button" onClick={() => setStep(s => Math.min(kind.flags.length - 1, s + 1))} disabled={step >= kind.flags.length - 1} aria-label="Next of this kind">›</button>
        </div>}
        <div className="rb-detail-body" key={flag.id}><FlagDetail flag={flag} {...actionsFor(flag)}/></div>
      </> : <p className="rb-quiet">{query.isPending ? '' : 'Choose a flag to read it in full.'}</p>}
    </aside>
  </div>;
}
