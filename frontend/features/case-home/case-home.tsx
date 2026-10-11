'use client';
// Case home (Workbench-redesign-2026.pdf, "The case home"; mockup HOME_1): one
// screen, no page scroll. In five seconds: what the case asks, where it stands,
// what changed, and the one thing that needs you, with its evidence beside it.
//
// Left: Bring in above Check. Centre, the only lifted panel: Next up, then what
// changed since your last visit. Right: Act · Red Flags above See · who is linked.
// Bottom: the year rail and what is pointed at. Scrolling over a module steps
// inside it; every step also has a click and a key.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {DragEvent, ReactElement, ReactNode} from 'react';

import {LevelChip, StatusChip} from '../../components/status';
import type {ClaimStatus} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {
  getInvestigationGraphOptions, getRedFlagsOptions, getSinceOptions, getStandingOptions, listClaimsOptions, listDocumentsOptions,
  listInvestigationsQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {createInvestigation, patchInvestigation, seedDemo} from '../../lib/generated/sdk.gen';
import type {DecisionChoiceOut, DecisionItemOut, InvestigationOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {caseHref} from '../../lib/case-href';
import {upload} from '../documents/documents-panel';
import {OneMdbLoader} from '../demo/one-mdb-loader';
import {DecisionCard} from './decision-card';
import {MiniNetwork} from './mini-network';
import {HOLD_MS, useDecisions} from './use-decisions';
import {useWheelStep} from './wheel-step';

const CLAIM_STATUS: Record<string, ClaimStatus> = {
  supported: 'supported', confirmed: 'supported', disputed: 'disputed', rejected: 'ruled_out', lead: 'unshown', unverified: 'unshown',
};
const CLAIM_ORDER: Record<ClaimStatus, number> = {disputed: 0, unshown: 1, supported: 2, ruled_out: 3};
const LEVEL_ORDER: Record<string, number> = {textbook: 0, strong: 1, faint: 2};
const UNREAD = new Set(['queued', 'pending', 'extracting']);
const VISIT_KEY = (id: string) => `pai:last-visit:${id}`;

export function money(amount: number, currency: string | null): string {
  if (!currency) return '—';
  // Large sums are shortened ($5.82bn); the exact figure is in the ledger.
  const compact = Math.abs(amount) >= 1_000_000;
  try {
    return new Intl.NumberFormat('en-US', {style: 'currency', currency, currencyDisplay: 'narrowSymbol', notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 2 : 0}).format(amount);
  } catch { return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`; }
}

function readVisit(id: string): string | null {
  try { return window.localStorage.getItem(VISIT_KEY(id)); } catch { return null; }
}
function writeVisit(id: string): void {
  try { window.localStorage.setItem(VISIT_KEY(id), new Date().toISOString()); } catch { /* private window */ }
}

function Module({n, name, href, extra, children, className = '', label}: {
  n: string; name: string; href?: string; extra?: ReactNode; children: ReactNode; className?: string; label?: string;
}): ReactElement {
  const inv = useWorkbenchStore(state => state.investigationId);
  return <section className={`ch-mod ${className}`} aria-label={label ?? name}>
    <header className="ch-mod-head">
      <h2><span className="ch-n">{n}</span>{name}</h2>
      {extra}
      {href && <Link className="ch-open" href={caseHref(href, inv)}>Open <span aria-hidden="true">↗</span></Link>}
    </header>
    {children}
  </section>;
}

function Stepper({index, count, total, onStep, label}: {index: number; count: number; total?: number; onStep: (i: number) => void; label: string}): ReactElement | null {
  const all = Math.max(count, total ?? 0);
  if (count < 2) return count === 1 ? <span className="ch-step">1 of {all.toLocaleString('en-GB')}</span> : null;
  return <span className="ch-step" aria-label={`${label}: ${index + 1} of ${all}`}>
    <button type="button" aria-label="Previous" onClick={() => onStep(Math.max(0, index - 1))} disabled={index === 0}>‹</button>
    {index + 1} of {all.toLocaleString('en-GB')}
    <button type="button" aria-label="Next" onClick={() => onStep(Math.min(count - 1, index + 1))} disabled={index >= count - 1}>›</button>
  </span>;
}

/** The case's own question, written in place. */
function CaseQuestion({investigation}: {investigation: InvestigationOut}): ReactElement {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(investigation.question ?? '');
  const [problem, setProblem] = useState('');
  useEffect(() => { setDraft(investigation.question ?? ''); }, [investigation.question]);
  const save = async () => {
    try {
      await patchInvestigation({path: {investigation_id: investigation.id}, body: {question: draft}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
      setEditing(false); setProblem('');
    } catch (error) { setProblem(errorMessage(error, 'Could not save the question')); }
  };
  if (editing) return <form className="ch-q-edit" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label htmlFor="ch-q">The question</label>
    <input id="ch-q" autoFocus value={draft} maxLength={500} onChange={e => setDraft(e.target.value)} placeholder="Who really owns the harbour land?"
      onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}/>
    <button type="submit">Save</button>
    {problem && <span role="alert">{problem}</span>}
  </form>;
  return <div className="ch-q">
    <p className="ch-eyebrow">The question</p>
    {investigation.question
      ? <button type="button" className={`ch-q-text${investigation.question.length > 110 ? ' long' : ''}`} onClick={() => setEditing(true)} title={`${investigation.question} (click to change)`}>{investigation.question}</button>
      : <button type="button" className="ch-q-empty" onClick={() => setEditing(true)}>Write the question this case answers</button>}
  </div>;
}

function StandingStrip({investigationId}: {investigationId: string}): ReactElement {
  const standing = useQuery({...getStandingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const s = standing.data;
  const cell = (key: string, big: ReactNode, small: string, href: string, mark?: string, tone = '') =>
    <li key={key}><Link className={`ch-num ${tone}`} href={caseHref(href, investigationId)}>
      <b>{mark && <span aria-hidden="true" className="ch-num-mark">{mark}</span>}{big}</b><small>{small}</small>
    </Link></li>;
  if (standing.isError) return <p className="ch-strip-error" role="alert">{errorMessage(standing.error, 'Could not count the case')} <button type="button" onClick={() => void standing.refetch()}>Retry</button></p>;
  return <ul className="ch-strip" aria-label="Where the case stands" aria-busy={!s}>
    {cell('sup', s?.claims.supported ?? '·', 'claims supported', '/check#claim-verification', '✓', 'ok')}
    {cell('dis', s?.claims.disputed ?? '·', 'claims disputed', '/check#claim-verification', '✕', 'bad')}
    {cell('uns', s?.claims.unshown ?? '·', 'not yet shown', '/check#claim-verification', '○')}
    {cell('dec', s?.to_decide ?? '·', 'to decide · need a person', '/decide', undefined, 'need')}
    {cell('mon', s ? money(s.money.amount, s.money.currency) : '·', s ? `money traced from ${s.money.from_sources ?? 0} source${s.money.from_sources === 1 ? '' : 's'} · ${s.money.payments} payment${s.money.payments === 1 ? '' : 's'}` : 'money traced', '/see#money-flows')}
    {cell('yrs', s?.timeline.from ? (s.timeline.from === s.timeline.to ? s.timeline.from : `${s.timeline.from}–${s.timeline.to?.slice(2)}`) : '—',
      s ? `${s.timeline.events} events · ${s.timeline.years.length} years` : 'events', '/see#timeline')}
    {cell('doc', s?.documents.total ?? '·', s ? `documents · ${s.documents.unread} unread` : 'documents', '/bring-in#document-ingestion')}
  </ul>;
}

function BringIn({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const docs = useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data ?? [];
  const standing = useQuery({...getStandingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const [over, setOver] = useState(false);
  const [dropped, setDropped] = useState('');
  const reading = docs.find(d => d.extraction_status === 'extracting') ?? docs.find(d => UNREAD.has(d.extraction_status));
  const unread = docs.filter(d => UNREAD.has(d.extraction_status)).length;
  const kinds = standing?.to_decide_by_kind ?? {};
  const onDrop = async (event: DragEvent) => {
    event.preventDefault(); setOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length || !investigationId) return;
    let done = 0;
    for (const file of files) {
      setDropped(`Saving ${file.name} (${done + 1} of ${files.length})…`);
      try { await upload(investigationId, file.name.replace(/\.[^./]+$/, ''), file); done += 1; } catch (error) { setDropped(`${file.name}: ${errorMessage(error, 'not saved')}`); return; }
    }
    setDropped(`${done} document${done === 1 ? '' : 's'} saved. Reading starts now.`);
    await queryClient.invalidateQueries();
  };
  const row = (count: number, label: string, href: string, verb: string) =>
    <li><b>{count}</b><span>{label}</span><Link href={caseHref(href, investigationId)}>{verb} →</Link></li>;
  return <Module n="01" name="Bring in" href="/bring-in">
    {reading ? <div className="ch-reading">
      <div className="ch-thumb" aria-hidden="true"><i/><i/><i/><i/></div>
      <div><b>{reading.filename}</b><span>{reading.extraction_status === 'extracting' ? 'Reading now' : 'Waiting to be read'}</span>
        <span className="ch-progress" aria-hidden="true"><i className={reading.extraction_status === 'extracting' ? 'busy' : ''}/></span></div>
    </div> : <p className="ch-quiet">Nothing is being read now.</p>}
    <ul className="ch-rows">
      {row(unread, `document${unread === 1 ? '' : 's'} not read yet`, '/bring-in#document-ingestion', 'Read')}
      {row(kinds.outside ?? 0, 'outside findings to review', '/decide?kind=outside', 'Review')}
      {row(kinds.watchlist ?? 0, `watchlist hit${(kinds.watchlist ?? 0) === 1 ? '' : 's'}`, '/decide?kind=watchlist', 'See')}
    </ul>
    <div className={`ch-drop${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => void onDrop(e)}>
      {dropped ? <span role="status">{dropped}</span> : <Link href={caseHref('/bring-in#document-ingestion', investigationId)}>+ Drop documents here</Link>}
    </div>
  </Module>;
}

function CheckModule({investigationId}: {investigationId: string}): ReactElement {
  const claimsData = useQuery({...listClaimsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const claims = useMemo(() => claimsData ?? [], [claimsData]);
  const openClaim = useWorkbenchStore(state => state.openClaim);
  const [index, setIndex] = useState(0);
  const ordered = useMemo(() => [...claims].sort((a, b) => CLAIM_ORDER[CLAIM_STATUS[a.status] ?? 'unshown'] - CLAIM_ORDER[CLAIM_STATUS[b.status] ?? 'unshown']), [claims]);
  const counts = {supported: 0, disputed: 0, unshown: 0, ruled_out: 0} as Record<ClaimStatus, number>;
  for (const c of claims) counts[CLAIM_STATUS[c.status] ?? 'unshown'] += 1;
  const wheel = useWheelStep(ordered.length, index, setIndex);
  const at = Math.min(index, Math.max(0, ordered.length - 2));
  const shown = ordered.slice(at, at + 2);
  return <Module n="02" name="Check" href="/check" extra={<Stepper index={index} count={ordered.length} onStep={setIndex} label="Claims"/>}>
    <div className="ch-bar" role="img" aria-label={`${counts.supported} supported, ${counts.disputed} disputed, ${counts.unshown} not yet shown`}>
      {(['supported', 'disputed', 'unshown'] as ClaimStatus[]).map(k => counts[k] ? <i key={k} className={`ch-bar-${k}`} style={{flexGrow: counts[k]}}/> : null)}
    </div>
    <div className="ch-list" {...wheel}>
      {shown.length ? shown.map(c => <button key={c.id} type="button" className={`ch-claim ch-claim-${CLAIM_STATUS[c.status] ?? 'unshown'}`}
        onClick={() => openClaim(c.id)}>
        <StatusChip status={CLAIM_STATUS[c.status] ?? 'unshown'}/>
        <span className="ch-claim-text">{c.text}</span>
      </button>) : <p className="ch-quiet">No claims yet. A claim is a sentence you may publish; add one in Check.</p>}
    </div>
  </Module>;
}

function ActModule({investigationId}: {investigationId: string}): ReactElement {
  const flagsQuery = useQuery({...getRedFlagsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const flags = flagsQuery.data;
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const [index, setIndex] = useState(0);
  const open = useMemo(() => (flags?.flags ?? []).filter(f => f.status === 'open' && !f.gone_at)
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) || b.weight - a.weight), [flags]);
  const wheel = useWheelStep(open.length, index, setIndex);
  const at = Math.min(index, Math.max(0, open.length - 2));
  return <Module n="04" name="Act · Red Flags" href="/act#red-flags" extra={<Stepper index={index} count={open.length} onStep={setIndex} label="Red Flags"/>}>
    <div className="ch-list" {...wheel}>
      {flagsQuery.isPending ? <div className="ch-skeleton" aria-busy="true" aria-label="Looking for Red Flags"/> : flagsQuery.isError ? <p role="alert" className="ch-quiet">{errorMessage(flagsQuery.error, 'Could not look for Red Flags')} <button type="button" onClick={() => void flagsQuery.refetch()}>Retry</button></p> : open.length ? open.slice(at, at + 2).map(f => {
        const innocent = f.indicator?.innocent_explanations?.[0];
        return <button key={f.id} type="button" className={`ch-flag ch-flag-${f.level}`} onClick={() => openFlag(f.id)}>
          <span className="ch-flag-top"><LevelChip level={f.level}/><span className="ch-since">flagged {new Date(`${f.first_seen_at.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})}</span></span>
          <b>{f.indicator?.name ?? f.indicator_id}</b>
          <span className="ch-flag-parties">{f.parties.map(p => p.name).join(' → ')}</span>
          {innocent && <span className="ch-innocent"><em>Could be innocent</em>{innocent}</span>}
        </button>;
      }) : <p className="ch-quiet">No Red Flags. A flag is a pattern in the records worth a look, never a finding.</p>}
    </div>
  </Module>;
}

function SinceStrip({investigationId}: {investigationId: string}): ReactElement {
  const [after, setAfter] = useState<string | null>(null);
  useEffect(() => {
    if (!investigationId) return undefined;
    setAfter(readVisit(investigationId));
    const mark = () => writeVisit(investigationId);
    const timer = window.setTimeout(mark, 60_000);
    window.addEventListener('pagehide', mark);
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', mark); mark(); };
  }, [investigationId]);
  const since = useQuery({...getSinceOptions({path: {investigation_id: investigationId}, query: {after: after ?? ''}}), enabled: Boolean(investigationId && after)}).data;
  const when = after ? new Date(after).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'}) : '';
  return <section className="ch-since-strip" aria-label="What changed while you were away">
    <header><p className="ch-eyebrow">{after ? `Since ${when}` : 'First visit on this computer'}</p><h2>What changed while you were away</h2></header>
    {!after ? <p className="ch-quiet">Next time you open this case, what moved in between shows here: who did it, and where.</p>
      : !since?.changes.length ? <p className="ch-quiet">Nothing has changed since then.</p>
      : <ul>{since.changes.map(c => <li key={c.key}><Link href={caseHref(c.href, investigationId)} className={`ch-change ch-actor-${c.actor_kind}`}>
        <b>{c.count}</b><span>{c.label}</span>{c.actor_kind === 'ai' && <span className="ai-tag">AI</span>}
      </Link></li>)}</ul>}
  </section>;
}

function NextUp({investigationId, active}: {investigationId: string; active: boolean}): ReactElement {
  const {items, counts, decide, undo, held, query} = useDecisions(investigationId, {enabled: Boolean(investigationId)});
  const [index, setIndex] = useState(0);
  useEffect(() => { if (index > 0 && index >= items.length) setIndex(Math.max(0, items.length - 1)); }, [index, items.length]);
  const wheel = useWheelStep(items.length, index, setIndex);
  const item: DecisionItemOut | undefined = items[index];
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  const onDecide = useCallback((choice: DecisionChoiceOut, note: string) => { if (item) decide(item, choice, note); }, [decide, item]);
  const inv = investigationId;
  useEffect(() => {
    if (!active) return undefined;
    const handle = (event: KeyboardEvent) => { if ((event.key === 'z' || event.key === 'Z') && !event.metaKey && !event.ctrlKey && held) { event.preventDefault(); undo(); } };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [active, held, undo]);
  return <section className="ch-mod ch-next" aria-label="Next up" {...wheel}>
    <header className="ch-mod-head">
      <h2><span className="ch-eyebrow">Next up</span>{item?.kind === 'to_check' ? 'One thing only you can check' : 'One thing only you can decide'}</h2>
      <Stepper index={index} count={items.length} total={query.data?.total} onStep={setIndex} label="Decisions"/>
    </header>
    {query.isError ? <p role="alert">{errorMessage(query.error, 'Could not load what waits for you')} <button type="button" onClick={() => void query.refetch()}>Retry</button></p>
      : query.isPending && investigationId ? <div className="ch-skeleton" aria-busy="true"/>
      : item ? <DecisionCard item={item} position={index + 1} total={items.length} keys="home" active={active} onDecide={onDecide} showWhatHappens={!item.evidence?.excerpt}/>
      : <div className="ch-clear"><p>Nothing waits for you.</p><Link href={caseHref('/bring-in#document-ingestion', inv)}>Drop documents</Link></div>}
    <footer className="ch-next-foot">
      <span className="ch-dots" aria-hidden="true">{items.slice(0, 9).map((d, i) => <i key={d.id} className={i === index ? 'on' : ''}/>)}</span>
      <span aria-live="polite">{held ? <>Saved in a moment: <b>{held.choice.label}</b>. <button type="button" className="ch-undo" onClick={() => undo()}>Undo <kbd>Z</kbd></button></>
        : `${total} to decide in this case. Your answer waits ${HOLD_MS / 1000} s before it is sent, so you can undo it.`}</span>
      <Link href={caseHref('/decide', inv)}>Open Decide <span aria-hidden="true">↗</span></Link>
    </footer>
  </section>;
}

function YearRail({investigationId}: {investigationId: string}): ReactElement {
  const standingQuery = useQuery({...getStandingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const standing = standingQuery.data;
  const asOf = useWorkbenchStore(state => state.asOf);
  const setAsOf = useWorkbenchStore(state => state.setAsOf);
  const years = standing?.timeline.years ?? [];
  const most = Math.max(1, ...years.map(y => y.events));
  if (standingQuery.isPending && investigationId) return <div className="ch-years" aria-busy="true"/>;
  if (!years.length) return <div className="ch-years ch-quiet">Dated events place the case in time here.</div>;
  return <nav className="ch-years" aria-label="Years in the case">
    {years.slice(-10).map(y => {
      const on = asOf === Number(y.year);
      return <button key={y.year} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => setAsOf(on ? null : Number(y.year))}
        title={on ? 'Show all years again' : `Show the case as of ${y.year}`}>
        <b>{y.year}</b><small>{y.events} event{y.events === 1 ? '' : 's'}</small><i style={{width: `${(100 * y.events) / most}%`}}/>
      </button>;
    })}
  </nav>;
}

function PointingAt({investigationId}: {investigationId: string}): ReactElement {
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const point = useWorkbenchStore(state => state.setPointedParty);
  const asOf = useWorkbenchStore(state => state.asOf);
  const graph = useQuery({...getInvestigationGraphOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const name = graph?.nodes.find(n => n.id === pointed)?.caption;
  return <div className="ch-pointing" aria-live="polite">
    <p className="ch-eyebrow">Pointing at</p>
    {pointed ? <><span className="ch-party on">{name ?? 'a party'}</span>
      <span>lit in every part{asOf ? ` · as of ${asOf}` : ''}</span>
      <button type="button" onClick={() => point(null)}>Clear ×</button></>
      : <span className="ch-quiet">Nothing. Point at a party to light it everywhere{asOf ? ` · showing ${asOf}` : ''}.</span>}
  </div>;
}

/** No case yet: four first actions, each one line (FEATURE_HOME §1 "Empty case"). */
function FirstCase({onSwitch}: {onSwitch: (id: string) => void}): ReactElement {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const created = (await createInvestigation({body: {name: name.trim(), question: question.trim() || null}, throwOnError: true})).data;
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
      onSwitch(created.id);
    } catch (error) { setProblem(errorMessage(error, 'Could not start the case')); } finally { setBusy(false); }
  };
  const sample = async () => {
    setBusy(true);
    try {
      await seedDemo({throwOnError: true});
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
    } catch (error) { setProblem(errorMessage(error, 'Could not open the sample case')); } finally { setBusy(false); }
  };
  return <div className="ch-first">
    <h1>Start a case</h1>
    <p>A case holds what you bring in, what you check, and what you can show. Nothing leaves this computer unless you send it.</p>
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) void start(); }} className="ch-first-form">
      <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Kestrel harbour land" required/></label>
      <label>The question it answers <small>(you can write it later)</small><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Who really owns the harbour land?"/></label>
      <button type="submit" disabled={!name.trim() || busy}>Start the case</button>
    </form>
    <button type="button" className="ch-sample" onClick={() => void sample()} disabled={busy}>Or open the sample case to look around</button>
    <OneMdbLoader onOpen={onSwitch}/>
    {problem && <p role="alert">{problem}</p>}
  </div>;
}

export function CaseHome({investigation, investigations, onSwitch, loading, active = true}: {
  investigation: InvestigationOut | null; investigations: InvestigationOut[]; onSwitch: (id: string) => void; loading: boolean; active?: boolean;
}): ReactElement {
  const id = investigation?.id ?? '';
  const switcher = useRef<HTMLSelectElement>(null);
  if (!investigation) return loading ? <div className="ch-home ch-loading" aria-busy="true"><div className="ch-skeleton"/></div> : <div className="ch-home"><FirstCase onSwitch={onSwitch}/></div>;
  return <div className="ch-home" data-testid="case-home">
    <header className="ch-top">
      <div className="ch-name">
        <h1>{investigation.name}</h1>
        {investigations.length > 1 && <label className="ch-switch">
          <span>Switch case</span>
          <select ref={switcher} value={id} onChange={e => onSwitch(e.target.value)}>{investigations.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        </label>}
      </div>
      <CaseQuestion investigation={investigation}/>
      <StandingStrip investigationId={id}/>
    </header>
    <div className="ch-grid">
      <div className="ch-col"><BringIn investigationId={id}/><CheckModule investigationId={id}/></div>
      <div className="ch-col ch-centre"><NextUp investigationId={id} active={active}/><SinceStrip investigationId={id}/></div>
      <div className="ch-col"><ActModule investigationId={id}/>
        <Module n="03" name="See · who is linked" href="/see#relationship-graph"><MiniNetwork investigationId={id}/></Module></div>
    </div>
    <footer className="ch-bottom"><YearRail investigationId={id}/><PointingAt investigationId={id}/></footer>
  </div>;
}
