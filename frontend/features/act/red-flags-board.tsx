'use client';
// Act › Red Flags as one screen (mockup ACT_1, research Act §1–3). Top: the investigation type, how much of the
// catalogue ran, and the filters (levels, set aside, no longer fire, area, party, new since your last visit) with
// "6 of 8 flags · Reset". Left: one ranking (level, then weight); a kind that fired many times is one row with a
// count (on the 1MDB case one kind fired 31 times and buried the rest), each row with its parties, a new dot and
// the "rests on an unshown link" mark; under it the parties carrying flags. Centre: the open flag, with a picture
// of what it rests on, the level ladder (met / not set / needs facts) and the actions. Right: "Before you call it":
// the innocent explanations as a checklist kept on the flag, what the records can't show, and the sources.
// Keys: J / K move, [ / ] step within a kind, A add to leads, X set aside (asks why in place). Pointing at a row
// previews its flag in the centre without losing the one chosen. Reading the flags never runs the rules: the board
// runs them when the records have changed since they last ran, and "Run the rules" runs them on demand. What is new
// or no longer fires since your last visit plays back once as a short replay. Scrolling over the payments steps
// through them (one notch, one payment), the one in focus lit and named.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {caseHref} from '../../lib/case-href';
import {errorMessage} from '../../lib/api-client';
import {getInvestigationFinancialFlowsOptions, getRedFlagsQueryKey, markRedFlagInnocentMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {FinancialTransactionOut, FlagInnocentOut, RedFlagOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useWheelStep} from '../case-home/wheel-step';
import {GlossaryText} from '../glossary/glossary-text';
import {InvestigationType, LEVEL, LEVEL_ORDER, flagsByArea, useRedFlags} from '../red-flags/red-flags-panel';

type Kind = {key: string; name: string; level: string; flags: RedFlagOut[]; weight: number};
type Levels = Record<'textbook' | 'strong' | 'faint', boolean>;

/** The level as a shape and a word, never colour alone: ▮▮▮ Textbook, ▮▮▯ Strong, ▮▯▯ Faint. */
export function LevelMark({level}: {level: string}): ReactElement {
  const bars = level === 'textbook' ? '▮▮▮' : level === 'strong' ? '▮▮▯' : '▮▯▯';
  return <span className={`rb-level rb-level-${level}`}><i aria-hidden="true">{bars}</i>{LEVEL[level]?.name ?? level}</span>;
}

const isAside = (f: RedFlagOut) => f.status === 'dismissed';
const unshown = (f: RedFlagOut) => ((f.facts as {unreviewed_links?: string[]})?.unreviewed_links ?? []).length;
const UNSET = /to be set/i;

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

/** Each rung of the ladder: met, next (with the catalogue's wording), not set, or needing facts only a person can give. */
export type Rung = {level: 'textbook' | 'strong' | 'faint'; state: 'met' | 'next' | 'not_set' | 'needs'; text: string; needs: string[]};
export function ladder(flag: RedFlagOut): Rung[] {
  const at = LEVEL_ORDER.indexOf(flag.level);
  const lv = flag.indicator?.levels;
  const band = (flag.facts as {band_reason?: string})?.band_reason;
  return (['textbook', 'strong', 'faint'] as const).map(level => {
    const text = (lv?.[level] ?? '') as string;
    const reached = LEVEL_ORDER.indexOf(level) >= at;
    if (reached) return {level, state: 'met', text: level === flag.level && band ? band : UNSET.test(text) ? 'Reached' : text, needs: []};
    if (UNSET.test(text) || !text) return {level, state: 'not_set', text: 'No published threshold for this rung yet.', needs: []};
    if (level === 'textbook' && flag.not_shown.length) return {level, state: 'needs', text, needs: flag.not_shown};
    return {level, state: 'next', text, needs: []};
  });
}

function lastVisitKey(inv: string): string { return `pai:flags-visit:${inv}`; }

/** The server sends UTC times without an offset; read them as UTC wherever the browser is. */
export function utcTime(at: string): number { return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : `${at}Z`).getTime(); }

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function agoText(at: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - utcTime(at)) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** One change since the last visit: a flag first seen after it, or one that stopped firing after it. */
export type Change = {kind: 'new' | 'gone'; flag: RedFlagOut; at: string};
export function changesSince(flags: RedFlagOut[], gone: RedFlagOut[], since: string | null): Change[] {
  if (since === null) return [];
  const after = utcTime(since);
  const out: Change[] = [
    ...flags.filter(f => utcTime(f.first_seen_at) > after).map(f => ({kind: 'new' as const, flag: f, at: f.first_seen_at})),
    ...gone.filter(f => f.gone_at && utcTime(f.gone_at) > after).map(f => ({kind: 'gone' as const, flag: f, at: f.gone_at!})),
  ];
  return out.sort((a, b) => utcTime(a.at) - utcTime(b.at) || a.flag.id.localeCompare(b.flag.id));
}

const REPLAY_MS = 1600;
const REPLAY_MAX = 6;
function calm(): boolean {
  if (typeof window === 'undefined') return true;
  try { return document.documentElement.dataset.motion === 'calm' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

/** What changed since the last visit, played back once, one change at a time (a new flag's row lights in the list).
 * Calm motion: no timed playback; every change is listed at once and the reporter steps with the arrows. */
function WhatChanged({changes, since, ready, onLight}: {changes: Change[]; since: string; ready: boolean; onLight: (c: Change | null) => void}): ReactElement | null {
  // A kind that changed many times is one step with its count, as in the ranked list.
  const steps = useMemo(() => {
    const m = new Map<string, Change & {n: number}>();
    for (const c of changes) {
      const key = `${c.kind}:${c.flag.indicator_id}:${c.flag.level}`;
      const step = m.get(key);
      if (step) step.n += 1; else m.set(key, {...c, n: 1});
    }
    return [...m.values()];
  }, [changes]);
  const shown = steps.slice(0, REPLAY_MAX);
  const [at, setAt] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const played = useRef(false);
  const still = calm();
  useEffect(() => {
    if (!ready || played.current || !shown.length || still) return;
    played.current = true; setAt(0); setPlaying(true);
  }, [ready, shown.length, still]);
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => { if (at + 1 < shown.length) setAt(at + 1); else { setPlaying(false); setAt(-1); } }, REPLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, at, shown.length]);
  const current = at >= 0 ? shown[at] : undefined;
  useEffect(() => { onLight(current ?? null); }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!changes.length) return null;
  const fresh = changes.filter(c => c.kind === 'new').length;
  const stopped = changes.length - fresh;
  const day = new Date(utcTime(since));
  const line = (c: Change & {n: number}) => <><b className={`rb-change-word ch-${c.kind}`}>{c.kind === 'new' ? '✚ New' : '− No longer fires'}</b>{' '}
    <span className="rb-id">{c.flag.indicator_id}</span> {c.flag.indicator?.name ?? c.flag.indicator_id}{c.n > 1 && <span className="rb-mono"> ×{c.n}</span>}</>;
  return <div className={`rb-changed${current ? ' playing' : ''}`} role="group" aria-label="What changed since your last visit">
    <span className="rb-changed-head">Since your last visit · {day.getUTCDate()} {day.toLocaleString('en-GB', {month: 'short', timeZone: 'UTC'})}:
      {' '}{fresh > 0 && <>{fresh} new</>}{fresh > 0 && stopped > 0 && ' · '}{stopped > 0 && <>{stopped} no longer fire{stopped === 1 ? 's' : ''}</>}</span>
    {current ? <span className="rb-changed-now" aria-live="polite"><span className="rb-mono">{at + 1} of {shown.length}</span> {line(current)}</span>
      : still ? <ul className="rb-changed-all">{shown.map(c => <li key={`${c.kind}-${c.flag.id}`}>{line(c)}</li>)}</ul> : null}
    <span className="rb-changed-acts">
      {current ? <button type="button" onClick={() => { setPlaying(false); setAt(-1); }}>Stop</button>
        : <button type="button" onClick={() => { setAt(0); setPlaying(!still); }}>Replay</button>}
      {still && current && <><button type="button" aria-label="Previous change" onClick={() => setAt(i => Math.max(0, i - 1))}>‹</button>
        <button type="button" aria-label="Next change" onClick={() => setAt(i => Math.min(shown.length - 1, i + 1))}>›</button></>}
      {steps.length > shown.length && <small>+{steps.length - shown.length} more</small>}
    </span>
  </div>;
}

export function RedFlagsBoard({investigationId}: {investigationId: string}): ReactElement {
  const {query, run, running, waiting, problem, actionsFor, setAreas} = useRedFlags(investigationId);
  const [hover, setHover] = useState<string | null>(null);
  const [lit, setLit] = useState<Change | null>(null);
  const [levels, setLevels] = useState<Levels>({textbook: true, strong: true, faint: true});
  const [aside, setAside] = useState(false);
  const [goneOpen, setGoneOpen] = useState(false);
  const [area, setArea] = useState('');
  const [party, setParty] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [since, setSince] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // New since your last visit (on this computer): read the last visit after mounting, then this visit becomes it.
  useEffect(() => {
    if (!investigationId) return;
    try {
      setSince(window.localStorage.getItem(lastVisitKey(investigationId)));
      return () => { try { window.localStorage.setItem(lastVisitKey(investigationId), new Date().toISOString()); } catch { /* best effort */ } };
    } catch { return undefined; }
  }, [investigationId]);
  const isNew = (f: RedFlagOut) => since !== null && utcTime(f.first_seen_at) > utcTime(since);

  const flags = useMemo(() => query.data?.flags ?? [], [query.data]);
  const live = flags.filter(f => !isAside(f));
  const pool = aside ? flags.filter(isAside) : live;
  const shown = pool.filter(f => (aside || levels[f.level as keyof Levels]) && (!area || f.indicator?.area === area)
    && (!party || f.parties.some(p => p.id === party)) && (!onlyNew || isNew(f)));
  const kinds = useMemo(() => groupFlags(shown), [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const kind = kinds.find(k => k.key === picked) ?? kinds[0];
  const flag = kind ? kind.flags[Math.min(step, kind.flags.length - 1)] : undefined;
  // Pointing at a row previews its flag in the centre; the chosen one comes back when the pointer leaves the list.
  const previewKind = hover && hover !== kind?.key ? kinds.find(k => k.key === hover) : undefined;
  const openFlag = previewKind ? previewKind.flags[0] : flag;
  const filtered = !levels.textbook || !levels.strong || !levels.faint || aside || area || party || onlyNew;
  const reset = () => { setLevels({textbook: true, strong: true, faint: true}); setAside(false); setArea(''); setParty(''); setOnlyNew(false); setPicked(null); setStep(0); };

  // An item in To check asks for its flag: show it.
  const askedFlag = useWorkbenchStore(state => state.flag);
  const answered = useRef(0);
  useEffect(() => {
    if (!askedFlag || askedFlag.serial === answered.current || !flags.length) return;
    answered.current = askedFlag.serial;
    const target = flags.find(f => f.id === askedFlag.flagId);
    if (!target) return;
    reset();
    setAside(isAside(target));
    const key = `${target.indicator_id}:${target.level}`;
    setPicked(key);
    setStep(Math.max(0, flags.filter(f => `${f.indicator_id}:${f.level}` === key && isAside(f) === isAside(target)).findIndex(f => f.id === target.id)));
  }, [askedFlag, flags]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (key: string) => { setPicked(key); setStep(0); };
  const move = (by: number) => {
    if (!kinds.length) return;
    const at = Math.max(0, kinds.findIndex(k => k.key === kind?.key));
    const next = kinds[Math.min(kinds.length - 1, Math.max(0, at + by))];
    pick(next.key);
    listRef.current?.querySelector<HTMLElement>(`[data-kind="${next.key}"]`)?.scrollIntoView?.({block: 'nearest'});
  };
  const [asking, setAsking] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'j') { e.preventDefault(); setHover(null); move(1); }
    else if (e.key === 'k') { e.preventDefault(); setHover(null); move(-1); }
    else if (e.key === ']' && kind) { e.preventDefault(); setStep(s => Math.min(kind.flags.length - 1, s + 1)); }
    else if (e.key === '[') { e.preventDefault(); setStep(s => Math.max(0, s - 1)); }
    else if ((e.key === 'a' || e.key === 'A') && flag && flag.status === 'open') { e.preventDefault(); void actionsFor(flag).onLead(); }
    else if ((e.key === 'x' || e.key === 'X') && flag && flag.status === 'open') { e.preventDefault(); setAsking(true); }
  };

  const rules = query.data?.rules ?? [];
  const cannot = query.data?.cannot_run ?? [];
  const gone = useMemo(() => query.data?.gone ?? [], [query.data]);
  const type = query.data?.investigation_type;
  const count = (level: string) => live.filter(f => f.level === level).length;
  const areas = [...new Map(live.filter(f => f.indicator).map(f => [f.indicator!.area, f.indicator!.area_name])).entries()];
  const carriers = useMemo(() => {
    const m = new Map<string, {id: string; name: string; n: number; top: string}>();
    for (const f of live) for (const p of f.parties) {
      const c = m.get(p.id) ?? {id: p.id, name: p.name, n: 0, top: 'faint'};
      c.n += 1;
      if (LEVEL_ORDER.indexOf(f.level) < LEVEL_ORDER.indexOf(c.top)) c.top = f.level;
      m.set(p.id, c);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 6);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const newCount = live.filter(isNew).length;
  const changes = useMemo(() => changesSince(flags, gone, since), [flags, gone, since]);
  const onLight = useCallback((c: Change | null) => setLit(c), []);
  const litKey = lit?.kind === 'new' ? `${lit.flag.indicator_id}:${lit.flag.level}` : null;
  const ranAt = query.data?.ran_at ?? null;
  const runNow = () => run.mutate({path: {investigation_id: investigationId}});

  return <div className="rb" onKeyDown={onKey} id="red-flags">
    <header className="rb-top">
      {type && <InvestigationType kind={type} flagsByArea={flagsByArea(live)} onSet={setAreas}/>}
      <div className="rb-runline">
        {rules.length > 0 && ranAt && <p className="rb-coverage" title={rules.map(r => r.name).join('\n')}>
          <b>{rules.length - cannot.length} of {rules.length}</b> record rules ran{cannot.length > 0 && <> · <span className="rb-warn">{cannot.length} need data</span></>}</p>}
        <span className="rb-run">
          <button type="button" onClick={runNow} disabled={running || !investigationId} aria-busy={running}>{running ? 'Running the rules…' : 'Run the rules'}</button>
          <small>{ranAt ? <>ran <time dateTime={ranAt} title={new Date(utcTime(ranAt)).toLocaleString('en-GB')}>{agoText(ranAt)}</time>{query.data?.stale && !running && ' · the records changed since'}</> : running ? 'first run' : 'not run yet'}</small>
          {run.isError && <small role="alert" className="rb-warn">{errorMessage(run.error, 'Could not run the rules')}</small>}
        </span>
      </div>
      <div className="rb-filters" role="group" aria-label="Show">
        {(['textbook', 'strong', 'faint'] as const).map(l => <button key={l} type="button" aria-pressed={!aside && levels[l]} className={`rb-chip rk-${l}${!aside && levels[l] ? ' on' : ''}`}
          onClick={() => { setAside(false); setLevels(v => ({...v, [l]: !v[l]})); setPicked(null); }}><LevelMark level={l}/> {count(l)}</button>)}
        <button type="button" aria-pressed={aside} className={`rb-chip${aside ? ' on' : ''}`} onClick={() => { setAside(a => !a); setPicked(null); }}>Set aside {flags.length - live.length}</button>
        <button type="button" aria-pressed={goneOpen} className={`rb-chip${goneOpen ? ' on' : ''}`} onClick={() => setGoneOpen(v => !v)} disabled={!gone.length}>No longer fire {gone.length}</button>
        <label className="rb-select"><span>Area:</span><select value={area} onChange={e => setArea(e.target.value)} aria-label="Area">
          <option value="">all</option>{areas.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="rb-select"><span>Party:</span><select value={party} onChange={e => setParty(e.target.value)} aria-label="Party">
          <option value="">all</option>{carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button type="button" aria-pressed={onlyNew} className={`rb-chip${onlyNew ? ' on' : ''}`} onClick={() => setOnlyNew(v => !v)} disabled={since === null}
          title={since === null ? 'First visit to Red Flags on this computer' : undefined}>New since last visit {newCount}</button>
        <span className="rb-count-reset"><b>{shown.length} of {live.length + (aside ? flags.length - live.length : 0)}</b> flags{filtered && <> · <button type="button" onClick={reset}>Reset</button></>}</span>
      </div>
      {since !== null && <WhatChanged changes={changes} since={since} ready={!running && !waiting} onLight={onLight}/>}
      {goneOpen && gone.length > 0 && <ul className="rb-gone" aria-label="No longer fire">{gone.map(f => <li key={f.id}><b>{f.indicator?.name ?? f.indicator_id}</b>: <GlossaryText text={f.summary}/></li>)}</ul>}
      {cannot.length > 0 && <details className="rb-fold"><summary>{cannot.length} rule{cannot.length === 1 ? '' : 's'} could not run on these records</summary>
        <ul>{cannot.map(c => <li key={c.indicator_id}><b>{c.name}</b>: {c.reason}</li>)}</ul></details>}
    </header>

    <div className="rb-cols">
      <div className="rb-list-col">
        <p className="rb-eyebrow">Ranked · level, then weight <span aria-hidden="true">J / K</span></p>
        {query.isError && <p role="alert" className="rb-quiet">{errorMessage(query.error, 'Could not read the Red Flags')}</p>}
        {problem && <p role="alert" className="rb-quiet">{problem}</p>}
        <div className="rb-list" ref={listRef} role="listbox" aria-label="Red Flags, ranked" aria-activedescendant={kind ? `rb-${kind.key}` : undefined}
          onMouseLeave={() => setHover(null)}>
          {waiting && investigationId ? <div className="ch-skeleton" aria-busy="true" aria-label="Running the rules"/>
            : !kinds.length ? <p className="rb-quiet">{filtered ? 'No flag matches these filters.' : `No pattern fires on these records. ${rules.length - cannot.length} rules ran.`}</p>
            : kinds.map((k, i) => {
              const first = k.flags[0];
              const unshownLinks = Math.max(...k.flags.map(unshown));
              const fresh = k.flags.some(isNew);
              return <button key={k.key} id={`rb-${k.key}`} type="button" role="option" aria-selected={k.key === kind?.key} data-kind={k.key}
                className={`rb-row level-${k.level}${k.key === kind?.key ? ' on' : ''}${k.key === previewKind?.key ? ' peek' : ''}${k.key === litKey ? ' lit' : ''}`}
                onClick={() => { setHover(null); pick(k.key); }} onMouseEnter={() => setHover(k.key)}
                aria-label={`Rank ${i + 1}, ${LEVEL[k.level]?.name ?? k.level}, ${k.name}${k.flags.length > 1 ? `, ${k.flags.length} found` : ''}, ${first.parties.slice(0, 2).map(p => p.name).join(' and ')}${first.parties.length > 2 ? ` and ${first.parties.length - 2} more` : ''}`}>
                <span className="rb-rank">{i + 1}</span>
                <span className="rb-row-body">
                  <span className="rb-row-top"><LevelMark level={k.level}/><span className="rb-id">{first.indicator_id}</span>{fresh && <i className="rb-new" title="New since your last visit"/>}
                    {k.flags.length > 1 && <span className="rb-count">{k.flags.length} found</span>}</span>
                  <span className="rb-name">{k.name}</span>
                  <span className="rb-parties">{first.parties.slice(0, 2).map(p => <span key={p.id} className="rb-party">{p.name}</span>)}
                    {first.parties.length > 2 && <span className="rb-more">+{first.parties.length - 2}</span>}</span>
                  {unshownLinks > 0 && <span className="rb-rests">○ rests on {unshownLinks} link{unshownLinks === 1 ? '' : 's'} not yet shown</span>}
                </span>
              </button>;
            })}
        </div>
        {carriers.length > 0 && <section className="rb-carriers" aria-label="Parties carrying flags">
          <p className="rb-eyebrow">Parties carrying flags</p>
          <div>{carriers.map(c => <button key={c.id} type="button" className={`rb-carrier rk-${c.top}${party === c.id ? ' on' : ''}`} aria-pressed={party === c.id}
            onClick={() => setParty(p => (p === c.id ? '' : c.id))} aria-label={`${c.name}: ${c.n} flag${c.n === 1 ? '' : 's'}`}>
            <span className="rb-ring">{c.n}</span><small>{c.name}</small></button>)}</div>
        </section>}
      </div>

      <section className={`rb-open level-${openFlag?.level ?? 'none'}${previewKind ? ' preview' : ''}`} aria-label={previewKind ? 'Preview of a Red Flag' : 'The open Red Flag'}
        aria-live={previewKind ? 'off' : 'polite'}>
        {previewKind && openFlag ? <OpenFlag key={`peek-${openFlag.id}`} flag={openFlag} kind={previewKind} step={0} setStep={() => undefined} investigationId={investigationId}
          asking={false} setAsking={() => undefined} preview {...actionsFor(openFlag)}/>
          : flag && kind ? <OpenFlag key={flag.id} flag={flag} kind={kind} step={step} setStep={setStep} investigationId={investigationId}
          asking={asking} setAsking={setAsking} {...actionsFor(flag)}/> : <p className="rb-quiet">{waiting ? '' : 'Choose a flag to read it in full.'}</p>}
      </section>

      <aside className="rb-before" aria-label="Before you call it">
        {flag ? <BeforeYouCallIt flag={flag} investigationId={investigationId} ranAt={ranAt}/> : null}
      </aside>
    </div>
  </div>;
}

function OpenFlag({flag, kind, step, setStep, investigationId, asking, setAsking, preview = false, onLead, onDismiss, onReopen}: {
  flag: RedFlagOut; kind: Kind; step: number; setStep: (f: (s: number) => number) => void; investigationId: string;
  asking: boolean; setAsking: (v: boolean) => void; preview?: boolean;
  onLead: () => Promise<void> | void; onDismiss: (reason: string) => Promise<void> | void; onReopen: () => Promise<void> | void;
}): ReactElement {
  const ind = flag.indicator;
  const [reason, setReason] = useState('');
  const first = new Date(flag.first_seen_at);
  const payments = flag.links.length > 0 && (flag.facts as {family?: string})?.family === 'count_in_band';
  const moneyFlag = flag.indicator_id.startsWith('ML') || payments;
  return <>
    {preview && <p className="rb-peek-note">Preview · click the row to open it; move off the list to go back</p>}
    <div className="rb-open-head">
      <span><LevelMark level={flag.level}/> <span className="rb-mono">{flag.indicator_id} · {ind?.area_name ?? ''} · rule v{flag.rule_version} · first seen {first.getDate()} {first.toLocaleString('en-GB', {month: 'short'})}</span></span>
      {kind.flags.length > 1 && !preview && <span className="rb-step" role="group" aria-label="Flags of this kind">
        <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous of this kind">‹</button>
        <span><b>{Math.min(step, kind.flags.length - 1) + 1}</b> of {kind.flags.length}</span>
        <button type="button" onClick={() => setStep(s => Math.min(kind.flags.length - 1, s + 1))} disabled={step >= kind.flags.length - 1} aria-label="Next of this kind">›</button>
      </span>}
    </div>
    <h3>{ind?.name ?? flag.indicator_id}</h3>
    <p className="rb-summary"><GlossaryText text={flag.summary}/></p>
    <Picture flag={flag} investigationId={investigationId}/>
    <div className="rb-ladder-row">
      <section className="rb-ladder" aria-label="Level ladder: what would raise it">
        <p className="rb-eyebrow">Level ladder · what would raise it</p>
        <ol>{ladder(flag).map(r => <li key={r.level} className={`rung rung-${r.state} rk-${r.level}`}>
          <span className="rung-head"><LevelMark level={r.level}/>
            <b>{r.state === 'met' ? '✓ Met' : r.state === 'not_set' ? 'Not set' : r.state === 'needs' ? `Needs ${r.needs.length} fact${r.needs.length === 1 ? '' : 's'}` : 'Next'}</b></span>
          <span className="rung-text">{r.text}</span>
          {r.needs.length > 0 && <><ul>{r.needs.map(n => <li key={n}>○ {n}</li>)}</ul>
            <small>Only a person can decide these · <Link href={caseHref('/check#to-check', investigationId)}>open them in To check</Link></small></>}
        </li>)}</ol>
      </section>
      <div className="rb-side">
        {ind?.levels.threshold_note && <p className="rb-about"><b>About the numbers.</b> {ind.levels.threshold_note}</p>}
        <div className="rb-acts">
          {flag.status === 'open' ? <>
            <button type="button" className="primary" onClick={() => void onLead()}>Add to leads <kbd>A</kbd></button>
            {asking ? <form className="rb-why" onSubmit={e => { e.preventDefault(); if (reason.trim()) { void onDismiss(reason.trim()); setAsking(false); setReason(''); } }}>
              <label htmlFor={`why-${flag.id}`}>Why set it aside?</label>
              <input id={`why-${flag.id}`} autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. the payments are rent, seen in the lease"/>
              <span><button type="submit" disabled={!reason.trim()}>Set aside</button><button type="button" onClick={() => setAsking(false)}>Cancel</button></span>
            </form> : <button type="button" onClick={() => setAsking(true)}>Set aside with a reason <kbd>X</kbd></button>}
          </> : flag.status === 'dismissed' ? <>
            <p className="rb-quiet">Set aside: {flag.dismissed_reason}</p>
            <button type="button" onClick={() => void onReopen()}>Open it again</button>
          </> : <p className="rb-quiet">Made a lead.</p>}
          {moneyFlag && <Link className="rb-link-btn" href={caseHref('/see#money-flows', investigationId)}>Show in money flows</Link>}
          <button type="button" disabled title={flag.level === 'faint' ? 'Faint flags can’t headline a share card.' : 'Sharing is not built yet.'}>Share</button>
          <small>{flag.level === 'faint' ? 'Faint flags can’t headline a share card.' : 'Share cards are not built yet.'}</small>
        </div>
      </div>
    </div>
  </>;
}

/** A small picture of what the flag rests on: the payments for a band rule, the loop for a cycle, the chain otherwise. */
function Picture({flag, investigationId}: {flag: RedFlagOut; investigationId: string}): ReactElement {
  const family = (flag.facts as {family?: string})?.family;
  const ledger = useQuery({...getInvestigationFinancialFlowsOptions({path: {investigation_id: investigationId}}), enabled: family === 'count_in_band'});
  if (family === 'count_in_band') {
    const ids = new Set(flag.links);
    const pays = (ledger.data?.transactions ?? []).filter(t => ids.has(t.id) && t.dateTime).sort((a, b) => (a.dateTime! < b.dateTime! ? -1 : 1));
    if (!pays.length) return <p className="rb-quiet">{ledger.isPending ? 'Reading the payments…' : 'The payments it rests on have no dates to draw.'}</p>;
    return <Payments pays={pays}/>;
  }
  const names = flag.parties.map(p => p.name);
  if (family === 'cycle') return <figure className="rb-picture rb-loop" aria-label={`A loop: ${names.join(' → ')} → ${names[0]}`}>
    <figcaption><span>The loop it rests on</span></figcaption>
    <p>{names.map((n, i) => <span key={i}><b>{n}</b> → </span>)}<b>{names[0]}</b> ↺</p>
  </figure>;
  return <figure className="rb-picture rb-chain" aria-label={`The parties it rests on: ${names.join(', ')}`}>
    <figcaption><span>The parties it rests on</span>{unshown(flag) > 0 && <small>○ {unshown(flag)} link{unshown(flag) === 1 ? '' : 's'} not yet shown</small>}</figcaption>
    <p>{names.map((n, i) => <span key={i}>{i > 0 && <i aria-hidden="true"> → </i>}<b>{n}</b></span>)}</p>
  </figure>;
}

const CERTAINTY_WORD: Record<FinancialTransactionOut['certainty'], string> = {shown: '✓ Shown', not_yet_shown: '○ Not yet shown', disputed: '✕ Disputed'};

/** The payments in the band, by date. Scrolling over the picture steps through them (one notch, one payment; the
 * arrow keys do the same when it has focus); the payment in focus is ringed and named under the picture. */
function Payments({pays}: {pays: FinancialTransactionOut[]}): ReactElement {
  const [focus, setFocus] = useState(0);
  const at = Math.min(focus, pays.length - 1);
  const wheel = useWheelStep(pays.length, at, setFocus);
  const ref = useRef<HTMLElement>(null);
  // The wheel moves inside the picture, never the column under it (React's own wheel listener cannot stop that).
  useEffect(() => {
    const el = ref.current;
    if (!el || pays.length < 2) return;
    const stop = (e: globalThis.WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, {passive: false});
    return () => el.removeEventListener('wheel', stop);
  }, [pays.length]);
  const currency = pays[0].currency; const sign = ({EUR: '€', USD: '$', GBP: '£'} as Record<string, string>)[currency] ?? '';
  const W = 560; const H = 150; const lo = 8800; const hi = 10200;
  const ts = pays.map(p => new Date(`${p.dateTime}T00:00:00Z`).getTime());
  const t0 = Math.min(...ts) - 864e5 * 10; const t1 = Math.max(...ts) + 864e5 * 10;
  const x = (t: number) => 40 + ((t - t0) / (t1 - t0)) * (W - 60);
  const y = (a: number) => 20 + (1 - (Math.min(hi, Math.max(lo, a)) - lo) / (hi - lo)) * (H - 50);
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
  const cur = pays[at];
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setFocus(Math.min(pays.length - 1, at + 1)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setFocus(Math.max(0, at - 1)); }
  };
  return <figure className="rb-picture rb-payments" ref={ref} tabIndex={pays.length > 1 ? 0 : undefined} onKeyDown={pays.length > 1 ? onKey : undefined}
    aria-label={pays.length > 1 ? 'The payments it rests on: scroll over, or use the arrow keys, to step through them' : undefined} {...wheel}>
    <figcaption><span>The payments it rests on</span><small>{pays.length > 1 ? <>scroll over to step through · <b>{at + 1}</b> of {pays.length} shown</> : `${pays.length} shown`}</small></figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${pays.length} payments between ${sign}9,000 and ${sign}10,000, by date`}>
      <rect x={40} y={y(10000)} width={W - 60} height={y(9000) - y(10000)} className="rb-band"/>
      <text x={44} y={y(10000) + 12} className="rb-band-label">{sign}9,000–{sign}10,000 band</text>
      <line x1={40} x2={W - 20} y1={y(10000)} y2={y(10000)} className="rb-threshold"/>
      <text x={W - 20} y={y(10000) - 5} textAnchor="end" className="rb-threshold-label">{sign}10,000 reporting line</text>
      {pays.map((p, i) => <g key={p.id} className={`rb-pay c-${p.certainty}${i === at ? ' focus' : ''}`}>
        {i === at && <circle cx={x(ts[i])} cy={y(p.amount)} r={12} className="rb-pay-ring"/>}
        <circle cx={x(ts[i])} cy={y(p.amount)} r={7}/>
        <text x={x(ts[i])} y={y(p.amount) + 4} textAnchor="middle" className="rb-pay-mark">{p.certainty === 'shown' ? '✓' : p.certainty === 'disputed' ? '✕' : '○'}</text>
        <text x={x(ts[i]) > W - 120 ? x(ts[i]) - 13 : x(ts[i]) + 13} y={y(p.amount) - 9} textAnchor={x(ts[i]) > W - 120 ? 'end' : 'start'} className="rb-pay-label">{sign}{p.amount.toLocaleString('en-GB')} · {p.dateTime!.slice(5)}</text>
      </g>)}
    </svg>
    <p className="rb-pay-focus" aria-live="polite"><b>{sign}{cur.amount.toLocaleString('en-GB')}{sign ? '' : ` ${currency}`}</b> on {day(cur.dateTime!)} · {cur.from} → {cur.to}
      {' '}<span className={`rb-pay-word c-${cur.certainty}`}>{CERTAINTY_WORD[cur.certainty]}</span>{cur.evidence ? <i> · {cur.evidence}</i> : null}</p>
  </figure>;
}

const INNOCENT_WORD: Record<FlagInnocentOut['state'], string> = {not_looked_at: 'Not looked at', ruled_out: 'Ruled out', could_apply: 'Could apply'};

function BeforeYouCallIt({flag, investigationId, ranAt}: {flag: RedFlagOut; investigationId: string; ranAt: string | null}): ReactElement {
  const queryClient = useQueryClient();
  const mark = useMutation({...markRedFlagInnocentMutation(), onSuccess: data => queryClient.setQueryData(getRedFlagsQueryKey({path: {investigation_id: investigationId}}), data)});
  const [ruling, setRuling] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const items = flag.innocent ?? [];
  const checked = items.filter(i => i.state !== 'not_looked_at').length;
  const set = (text: string, state: FlagInnocentOut['state'], why?: string) => mark.mutate({path: {flag_id: flag.id}, body: {text, state, note: why ?? null}});
  const sources = flag.indicator?.sources ?? [];
  const checks = flag.checks ?? [];
  return <>
    <h3>Before you call it</h3>
    <section aria-label="Could be innocent">
      <p className="rb-eyebrow">Could be innocent · {checked} of {items.length} checked</p>
      <ul className="rb-innocent">{items.map(i => <li key={i.text} className={`inn-${i.state}`}>
        <span className="inn-mark" aria-hidden="true">{i.state === 'ruled_out' ? '✓' : i.state === 'could_apply' ? '!' : '○'}</span>
        <span className="inn-body">
          <span>{i.text}</span>
          {i.state === 'ruled_out' && i.note && <small><i>Ruled out: {i.note}</i></small>}
          {i.state === 'could_apply' && <small>Could apply{i.note ? `: ${i.note}` : ''}</small>}
          {ruling === i.text ? <form className="inn-why" onSubmit={e => { e.preventDefault(); if (note.trim()) { set(i.text, 'ruled_out', note.trim()); setRuling(null); setNote(''); } }}>
            <input aria-label={`What ruled out: ${i.text}`} autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="What ruled it out"/>
            <button type="submit" disabled={!note.trim()}>Rule out</button><button type="button" onClick={() => setRuling(null)}>Cancel</button>
          </form> : <span className="inn-acts" role="group" aria-label={`${i.text}: ${INNOCENT_WORD[i.state]}`}>
            {i.state !== 'ruled_out' && <button type="button" onClick={() => { setRuling(i.text); setNote(''); }}>Rule out…</button>}
            {i.state !== 'could_apply' && <button type="button" onClick={() => set(i.text, 'could_apply')}>Could apply</button>}
            {i.state !== 'not_looked_at' && <button type="button" onClick={() => set(i.text, 'not_looked_at')}>Not looked at</button>}
          </span>}
        </span>
      </li>)}</ul>
      {mark.isError && <p role="alert" className="rb-quiet">{errorMessage(mark.error, 'Could not save that')}</p>}
    </section>
    {(checks.length > 0 || flag.not_shown.length > 0) && <section aria-label="The records can't show">
      <p className="rb-eyebrow">The records can’t show</p>
      <ul className="rb-cant">{checks.length ? checks.map(c => <li key={c.id}><span>{c.question}</span>
        <span className={`rb-state st-${c.status}`}>{c.status === 'open' ? '○ Open' : c.status === 'shows' ? '✓ Shows it' : c.status === 'does_not' ? '✕ Does not' : '? Unclear'}</span></li>)
        : flag.not_shown.map(n => <li key={n}><span>{n}</span><span className="rb-state st-open">○ Open</span></li>)}</ul>
    </section>}
    {sources.length > 0 && <section aria-label="Documented in">
      <p className="rb-eyebrow">Documented in · {sources.length} source{sources.length === 1 ? '' : 's'}</p>
      {sources.map((s, i) => <blockquote key={i} className="rb-quote"><p>“{s.quote}”</p>
        <footer>{s.publisher}, {s.title}{s.locator ? `, ${s.locator}` : ''} {s.url && <a href={s.url} target="_blank" rel="noreferrer">↗</a>}</footer></blockquote>)}
    </section>}
    <p className="rb-foot">A flag is a lead, not a finding. Verify before any publication.{ranAt && <> · Rules ran {agoText(ranAt)}</>}</p>
  </>;
}
