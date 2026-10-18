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
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {DragEvent, ReactElement, ReactNode} from 'react';

import {LevelChip, StatusChip} from '../../components/status';
import type {ClaimStatus} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {
  getClaimSourcesOptions, getInvestigationGraphOptions, getPartyYearsOptions, listJobsEndpointOptions, getRedFlagsOptions, getSinceOptions, getStandingOptions, listClaimsOptions, listDocumentsOptions,
  listInvestigationsQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {patchInvestigation, seedDemo} from '../../lib/generated/sdk.gen';
import type {DecisionChoiceOut, DecisionItemOut, InvestigationOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {HIDE_SCREEN_EVENT, OPEN_INBOX_EVENT, OPEN_PALETTE_EVENT, SWITCH_CASE_EVENT} from '../../components/frame/app-frame';
import {useNeedsYouCount} from '../inbox/inbox';
import {caseHref} from '../../lib/case-href';
import {upload} from '../documents/documents-panel';
import {OneMdbLoader} from '../demo/one-mdb-loader';
import {NewCaseSetup} from '../new-case/new-case-setup';
import {DecisionCard} from './decision-card';
import {RainPane} from '../effects/rain-pane';
import {MiniNetwork} from './mini-network';
import {PagePicture} from './decision-card';
import {HOLD_MS, useDecisions} from './use-decisions';
import {useWheelStep} from './wheel-step';
import {AiStrip} from '../ai/ai-strip';

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

/** Years in a line: [2015, 2017, 2018] → "2015, 2017–18". */
export function yearSpan(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const y of sorted) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]);
  }
  return runs.map(([a, b]) => a === b ? String(a)
    : `${a}–${Math.floor(a / 100) === Math.floor(b / 100) ? String(b).slice(2) : b}`).join(', ');
}

/** The years the party pointed at touches, for lighting them everywhere. */
function usePointedYears(): {party: string | null; years: number[]} {
  const party = useWorkbenchStore(state => state.pointedParty);
  const years = useQuery({...getPartyYearsOptions({path: {entity_id: party ?? ''}}), enabled: Boolean(party)}).data?.years ?? [];
  return {party, years: party ? years : []};
}

// The last visit as it stood when this page load first opened the case: marking the
// visit (on leaving, or a minute in) must not move what this load shows as "since".
const visitAtOpen = new Map<string, string | null>();
function readVisit(id: string): string | null {
  if (!visitAtOpen.has(id)) {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(VISIT_KEY(id)); } catch { /* private window */ }
    visitAtOpen.set(id, stored);
  }
  return visitAtOpen.get(id) ?? null;
}
function writeVisit(id: string): void {
  try { window.localStorage.setItem(VISIT_KEY(id), new Date().toISOString()); } catch { /* private window */ }
}

function Module({n, name, href, extra, children, className = '', label, openLabel = 'Open'}: {
  n: string; name: string; href?: string; extra?: ReactNode; children: ReactNode; className?: string; label?: string; openLabel?: string;
}): ReactElement {
  const inv = useWorkbenchStore(state => state.investigationId);
  return <section className={`ch-mod ${className}`} aria-label={label ?? name}>
    <header className="ch-mod-head">
      <h2><span className="ch-n">{n}</span>{name}</h2>
      {extra}
      {href && <Link className="ch-open" href={caseHref(href, inv)}>{openLabel} <span aria-hidden="true">↗</span></Link>}
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
    <small className="ch-step-hint" aria-hidden="true">· scroll</small>
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

/** "4 names and 2 dates proposed so far", from a document's proposal counts. */
export function proposedLine(doc: {candidate_counts?: Record<string, number> | null}): string {
  const c = doc.candidate_counts ?? {};
  const parts: string[] = [];
  const add = (n: number | undefined, one: string, many: string) => { if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
  add(c.entity, 'name', 'names'); add(c.event, 'date', 'dates'); add(c.claim, 'claim', 'claims'); add(c.relationship, 'link', 'links');
  if (!parts.length) return '';
  return `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]} proposed so far`;
}

function BringIn({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const docs = useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data ?? [];
  const standing = useQuery({...getStandingOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const [over, setOver] = useState(false);
  const [dropped, setDropped] = useState('');
  const reading = docs.find(d => d.extraction_status === 'extracting') ?? docs.find(d => UNREAD.has(d.extraction_status));
  const openDocument = useWorkbenchStore(state => state.openDocument);
  // The card shows the file being read, else the last one brought in (mockup HOME_1).
  const shown = reading ?? [...docs].filter(d => !d.parent_document_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const unread = docs.filter(d => UNREAD.has(d.extraction_status)).length;
  const kinds = standing?.to_decide_by_kind ?? {};
  // The reading job says where it is ("Reading with OCR · page 6 of 11"; backend app/jobs/handlers.py).
  const job = useQuery({...listJobsEndpointOptions({query: {investigation_id: investigationId, subject_id: reading?.id ?? '', limit: 1}}),
    enabled: Boolean(investigationId && reading), refetchInterval: reading?.extraction_status === 'extracting' ? 1500 : false}).data?.[0];
  const busy = reading?.extraction_status === 'extracting';
  const progress = busy && job?.status === 'running' && typeof job.progress === 'number' ? job.progress : null;
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
    {shown ? <button type="button" className="ch-reading" onClick={() => openDocument(shown.id)} aria-label={`Open ${shown.filename} in the reading room`}>
      <span className="ch-thumb">{/\.pdf$/i.test(shown.filename) && shown.chunk_count > 0
        ? <PagePicture documentId={shown.id} page={1} width={120} alt=""/> : <span className="ch-thumb-lines" aria-hidden="true"><i/><i/><i/><i/></span>}</span>
      <span className="ch-reading-words"><b>{shown.filename}</b>
        <span>{shown === reading ? (busy ? (job?.status === 'running' && job.message ? job.message : 'Reading now') : 'Waiting to be read')
          : shown.extraction_status === 'failed' ? 'Could not be read' : `Read · ${shown.chunk_count} passage${shown.chunk_count === 1 ? '' : 's'}`}</span>
        {shown === reading && <span className="ch-progress" role={progress === null ? undefined : 'progressbar'} aria-label={progress === null ? undefined : 'Reading'}
          aria-valuenow={progress ?? undefined} aria-valuemin={progress === null ? undefined : 0} aria-valuemax={progress === null ? undefined : 100} aria-hidden={progress === null}>
          <i className={busy && progress === null ? 'busy' : ''} style={progress === null ? undefined : {width: `${progress}%`}}/></span>}
        {proposedLine(shown) && <small className="ch-proposed">{proposedLine(shown)}</small>}
      </span>
    </button> : <p className="ch-quiet">Nothing brought in yet.</p>}
    <ul className="ch-rows">
      {row(unread, `document${unread === 1 ? '' : 's'} not read yet`, '/bring-in#document-ingestion', 'Read')}
      {row(kinds.outside ?? 0, 'outside findings to review', '/decide?kind=outside', 'Review')}
      {row(kinds.watchlist ?? 0, `watchlist hit${(kinds.watchlist ?? 0) === 1 ? '' : 's'}`, '/decide?kind=watchlist', 'See')}
    </ul>
    <div className={`ch-drop${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => void onDrop(e)}>
      {dropped ? <span role="status">{dropped}</span> : <Link href={caseHref('/bring-in#the-drop', investigationId)}>+ Drop documents anywhere</Link>}
    </div>
  </Module>;
}

/** "1 source for · 2 against · Harbour Gazette, land register", or "No passage yet · 1 lead open" (mockup HOME_1). */
export function sourceLine(line?: {sources_for?: number; sources_against?: number; names?: string[]; leads_open?: number; count?: number}): string {
  if (!line || !line.count) {
    const leads = line?.leads_open ?? 0;
    return ['No passage yet', leads ? `${leads} lead${leads === 1 ? '' : 's'} open` : ''].filter(Boolean).join(' · ');
  }
  const parts = [`${line.sources_for ?? 0} source${line.sources_for === 1 ? '' : 's'} for`];
  if (line.sources_against) parts.push(`${line.sources_against} against`);
  if (line.names?.length) parts.push(line.names.join(', '));
  if (line.leads_open) parts.push(`${line.leads_open} lead${line.leads_open === 1 ? '' : 's'} open`);
  return parts.join(' · ');
}

function SourceLine({line}: {line?: Parameters<typeof sourceLine>[0]}): ReactElement {
  return <span className="ch-claim-src">{sourceLine(line)}</span>;
}

function CheckModule({investigationId}: {investigationId: string}): ReactElement {
  const claimsData = useQuery({...listClaimsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const claims = useMemo(() => claimsData ?? [], [claimsData]);
  const openClaim = useWorkbenchStore(state => state.openClaim);
  const sourcesData = useQuery({...getClaimSourcesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const sources = useMemo(() => new Map((sourcesData ?? []).map(x => [x.claim_id, x])), [sourcesData]);
  const [index, setIndex] = useState(0);
  const ordered = useMemo(() => [...claims].sort((a, b) => CLAIM_ORDER[CLAIM_STATUS[a.status] ?? 'unshown'] - CLAIM_ORDER[CLAIM_STATUS[b.status] ?? 'unshown']), [claims]);
  const counts = {supported: 0, disputed: 0, unshown: 0, ruled_out: 0} as Record<ClaimStatus, number>;
  for (const c of claims) counts[CLAIM_STATUS[c.status] ?? 'unshown'] += 1;
  const wheel = useWheelStep(ordered.length, index, setIndex);
  const at = Math.min(index, Math.max(0, ordered.length - 2));
  const shown = ordered.slice(at, at + 2);
  return <Module n="02" name="Check" extra={<Stepper index={index} count={ordered.length} onStep={setIndex} label="Claims"/>}>
    <div className="ch-bar" role="img" aria-label={`${counts.supported} supported, ${counts.disputed} disputed, ${counts.unshown} not yet shown`}>
      {(['supported', 'disputed', 'unshown'] as ClaimStatus[]).map(k => counts[k] ? <i key={k} className={`ch-bar-${k}`} style={{flexGrow: counts[k]}}/> : null)}
    </div>
    <div className="ch-list" {...wheel}>
      {shown.length ? shown.map(c => <button key={c.id} type="button" className={`ch-claim ch-claim-${CLAIM_STATUS[c.status] ?? 'unshown'}`}
        onClick={() => openClaim(c.id)}>
        <StatusChip status={CLAIM_STATUS[c.status] ?? 'unshown'}/>
        <span className="ch-claim-text">{c.text}</span>
        <SourceLine line={sources.get(c.id)}/>
      </button>) : <p className="ch-quiet">No claims yet. A claim is a sentence you may publish; add one in Check.</p>}
    </div>
  </Module>;
}

/** A Red Flag's parties as a chain; an ownership loop ends "→ back" (mockup HOME_1). */
export function flagChain(parties: {name: string}[], loop: boolean): string {
  return [...parties.map(p => p.name), ...(loop && parties.length > 1 ? ['back'] : [])].join(' → ');
}

function ActModule({investigationId}: {investigationId: string}): ReactElement {
  const flagsQuery = useQuery({...getRedFlagsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const flags = flagsQuery.data;
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const [index, setIndex] = useState(0);
  const open = useMemo(() => (flags?.flags ?? []).filter(f => f.status === 'open' && !f.gone_at)
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) || b.weight - a.weight), [flags]);
  // Textbook and strong flags as cards; faint ones each on one line beneath.
  const cards = open.filter(f => f.level !== 'faint');
  const faint = open.filter(f => f.level === 'faint');
  const visit = investigationId ? readVisit(investigationId) : null;
  const wheel = useWheelStep(cards.length, index, setIndex);
  const at = Math.min(index, Math.max(0, cards.length - 2));
  const leadsOf = (f: (typeof open)[number]) => (f.checks ?? []).filter(c => c.status === 'open').length;
  return <Module n="04" name="Act · Red Flags" extra={<Stepper index={index} count={cards.length} onStep={setIndex} label="Red Flags"/>}>
    <div className="ch-list" {...wheel}>
      {flagsQuery.isPending ? <div className="ch-skeleton" aria-busy="true" aria-label="Looking for Red Flags"/> : flagsQuery.isError ? <p role="alert" className="ch-quiet">{errorMessage(flagsQuery.error, 'Could not look for Red Flags')} <button type="button" onClick={() => void flagsQuery.refetch()}>Retry</button></p> : open.length ? <>
        {cards.slice(at, at + 2).map(f => {
          const innocent = f.indicator?.innocent_explanations ?? [];
          const fresh = Boolean(visit && f.first_seen_at > visit.slice(0, 19));
          const when = f.years?.length ? `lights ${yearSpan(f.years)}` : '';
          return <button key={f.id} type="button" className={`ch-flag ch-flag-${f.level}`} onClick={() => openFlag(f.id)}>
            <span className="ch-flag-top"><LevelChip level={f.level}/><span className="ch-since">{[fresh ? 'new' : '', when].filter(Boolean).join(' · ')}</span></span>
            <b>{f.indicator?.name ?? f.indicator_id}</b>
            <span className="ch-flag-parties">{f.summary && f.level !== 'textbook' ? f.summary : flagChain(f.parties, /circular|loop/i.test(f.indicator?.name ?? ''))}</span>
            {innocent.length > 0 && f.level === 'textbook' && <span className="ch-innocent"><em>Could be innocent</em>{innocent[0]}
              {innocent.length > 1 && <span className="ch-more"> {innocent.length - 1} more ›</span>}</span>}
          </button>;
        })}
        {faint.slice(0, 2).map(f => <button key={f.id} type="button" className="ch-faint-row" onClick={() => openFlag(f.id)}>
          <LevelChip level="faint"/><span>{f.indicator?.name ?? f.indicator_id}{leadsOf(f) ? ` · ${leadsOf(f)} to check` : ''}</span></button>)}
        {faint.length > 2 && <Link className="ch-faint-more" href={caseHref('/act#red-flags', investigationId)}>{faint.length - 2} more faint ›</Link>}
      </> : <p className="ch-quiet">No Red Flags. A flag is a pattern in the records worth a look, never a finding.</p>}
    </div>
  </Module>;
}

const ACTOR: Record<string, string> = {person: 'by a person', app: 'found by the app', ai: 'drafted, to review', connector: 'from outside records'};

function SinceStrip({investigationId, markVisit = true}: {investigationId: string; markVisit?: boolean}): ReactElement {
  const [after, setAfter] = useState<string | null>(null);
  useEffect(() => {
    if (!investigationId) return undefined;
    setAfter(readVisit(investigationId));
    if (!markVisit) return undefined;
    const mark = () => writeVisit(investigationId);
    const timer = window.setTimeout(mark, 60_000);
    window.addEventListener('pagehide', mark);
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', mark); mark(); };
  }, [investigationId, markVisit]);
  const since = useQuery({...getSinceOptions({path: {investigation_id: investigationId}, query: {after: after ?? ''}}), enabled: Boolean(investigationId && after)}).data;
  const when = after ? new Date(after).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'}) : '';
  const [all, setAll] = useState(false);
  const changes = since?.changes ?? [];
  return <section className="ch-since-strip" aria-label="What changed while you were away">
    <header><p className="ch-eyebrow">{after ? `Since ${when}` : 'First visit on this computer'}</p><h2>What changed while you were away</h2>
      {changes.length > 4 && <button type="button" className="ch-show-all" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show all'}</button>}</header>
    {!after ? <p className="ch-quiet">Next time you open this case, what moved in between shows here: who did it, and where.</p>
      : !changes.length ? <p className="ch-quiet">Nothing has changed since then.</p>
      : <ul>{(all ? changes : changes.slice(0, 4)).map(c => <li key={c.key}><Link href={caseHref(c.href, investigationId)} className={`ch-change ch-actor-${c.actor_kind}`}
        title={ACTOR[c.actor_kind]}>
        <b>{c.count}</b><span>{c.label}</span>
        {c.actor_kind === 'ai' && <span className="ai-tag">AI</span>}
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
      : item ? <DecisionCard item={item} position={index + 1} total={items.length} keys="home" active={active} onDecide={onDecide} showWhatHappens={false}/>
      : <div className="ch-clear"><p>Nothing waits for you.</p><Link href={caseHref('/bring-in#document-ingestion', inv)}>Drop documents</Link></div>}
    <footer className="ch-next-foot">
      <span className="ch-dots" aria-hidden="true">{items.slice(0, 9).map((d, i) => <i key={d.id} className={i === index ? 'on' : ''}/>)}</span>
      <span aria-live="polite" title={item?.consequences.join(' ')}>{held ? <>Saved in a moment: <b>{held.choice.label}</b>. <button type="button" className="ch-undo" onClick={() => undo()}>Undo <kbd>Z</kbd></button></>
        : item?.consequences.length ? `${item.consequences.join(' ').replace(/\.$/, '')}; Undo for ${HOLD_MS / 1000} s.`
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
  const pointed = usePointedYears();
  const lit = new Set(pointed.years);
  if (standingQuery.isPending && investigationId) return <div className="ch-years" aria-busy="true"/>;
  if (!years.length) return <div className="ch-years ch-quiet">Dated events place the case in time here.</div>;
  return <nav className="ch-years" aria-label="Years in the case">
    {years.slice(-10).map(y => {
      const on = asOf === Number(y.year);
      const flags = y.flags ?? 0;
      const cls = [on && 'on', flags && 'flagged', lit.has(Number(y.year)) && 'lit'].filter(Boolean).join(' ');
      return <button key={y.year} type="button" className={cls} aria-pressed={on} onClick={() => setAsOf(on ? null : Number(y.year))}
        title={on ? 'Show all years again' : `Show the case as of ${y.year}`}>
        <b>{y.year}</b><small aria-label={`${y.events} event${y.events === 1 ? '' : 's'}${flags ? `, ${flags} Red Flag${flags === 1 ? '' : 's'}` : ''}`}>
          {y.events}{flags ? <> · <span className="ch-year-flags">flag</span></> : null}</small>
        <i style={{width: `${(100 * y.events) / most}%`}}/>
      </button>;
    })}
  </nav>;
}

function PointingAt({investigationId}: {investigationId: string}): ReactElement {
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const point = useWorkbenchStore(state => state.setPointedParty);
  const asOf = useWorkbenchStore(state => state.asOf);
  const graph = useQuery({...getInvestigationGraphOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const node = graph?.nodes.find(n => n.id === pointed);
  const name = node?.caption;
  const {years} = usePointedYears();
  return <div className="ch-pointing" aria-live="polite">
    <p className="ch-eyebrow">Pointing at</p>
    {pointed ? <><span className="ch-party on"><span aria-hidden="true" className="ch-party-kind">{(node?.schema || 'T')[0]}</span>{name ?? 'a party'}</span>
      <span>{years.length ? `lights ${yearSpan(years)} everywhere` : 'lit in every part'}{asOf ? ` · as of ${asOf}` : ''}</span>
      <button type="button" onClick={() => point(null)}>Clear ×</button></>
      : <span className="ch-quiet">Nothing. Point at a party to light it everywhere{asOf ? ` · showing ${asOf}` : ''}.</span>}
  </div>;
}

/** The case home's own tools (mockup HOME_1): search, the bell, settings, Hide screen. */
function HomeTools(): ReactElement {
  const waiting = useNeedsYouCount();
  const fire = (name: string) => () => window.dispatchEvent(new Event(name));
  return <>
    <button type="button" className="ch-search" onClick={fire(OPEN_PALETTE_EVENT)}>
      <span aria-hidden="true" className="ch-search-icon">⌕</span><span>Search the case, or type a command…</span><kbd>⌘K</kbd></button>
    <div className="ch-tools">
      <button type="button" className="ch-tool ch-bell" onClick={fire(OPEN_INBOX_EVENT)} aria-label={`Inbox: ${waiting} need${waiting === 1 ? 's' : ''} you`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.6-2.2V10a4.4 4.4 0 0 0-8.8 0v4.8z M10 19.5a2 2 0 0 0 4 0"/></svg>
        {waiting > 0 && <b className="ch-count">{waiting > 99 ? '99+' : waiting}</b>}</button>
      <Link href="/settings" className="ch-tool" aria-label="Settings" title="Settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg></Link>
      <button type="button" className="ch-tool ch-hide" onClick={fire(HIDE_SCREEN_EVENT)} title="Cover the screen at once">Hide screen <kbd>⌘⇧H</kbd></button>
    </div>
  </>;
}

/** No case yet: start one (name, question, kind, what you have), or open a sample (FEATURE_HOME §1 "Empty case"). */
function FirstCase({onSwitch}: {onSwitch: (id: string) => void}): ReactElement {
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
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
    <NewCaseSetup onCreated={onSwitch}/>
    <button type="button" className="ch-sample" onClick={() => void sample()} disabled={busy}>Or open the sample case to look around</button>
    <OneMdbLoader onOpen={onSwitch}/>
    {problem && <p role="alert">{problem}</p>}
  </div>;
}

export function CaseHome({investigation, investigations: _cases, onSwitch, loading, active = true, preview = false}: {
  investigation: InvestigationOut | null; investigations: InvestigationOut[]; onSwitch: (id: string) => void; loading: boolean; active?: boolean;
  /** A picture of the page (Appearance's before/after): it never marks the case as visited. */
  preview?: boolean;
}): ReactElement {
  const id = investigation?.id ?? '';
  if (!investigation) return loading ? <div className="ch-home ch-loading" aria-busy="true"><div className="ch-skeleton"/></div> : <div className="ch-home"><FirstCase onSwitch={onSwitch}/></div>;
  return <div className="ch-home" data-testid="case-home">
    <RainPane as="header" className="ch-top" still={preview}>
      <div className="ch-name">
        <h1>{investigation.name}</h1>
        <button type="button" className="ch-switch" onClick={() => window.dispatchEvent(new Event(SWITCH_CASE_EVENT))}>
          Switch case <kbd>⌘O</kbd></button>
        {!preview && <AiStrip investigationId={id}/>}
      </div>
      {!preview && <HomeTools/>}
      <CaseQuestion investigation={investigation}/>
      <StandingStrip investigationId={id}/>
    </RainPane>
    <div className="ch-grid">
      <div className="ch-col"><BringIn investigationId={id}/><CheckModule investigationId={id}/></div>
      <div className="ch-col ch-centre"><NextUp investigationId={id} active={active}/><SinceStrip investigationId={id} markVisit={!preview}/></div>
      <div className="ch-col"><ActModule investigationId={id}/>
        <Module n="03" name="See · who is linked" href="/see#the-wire" openLabel="Open network"><MiniNetwork investigationId={id}/></Module></div>
    </div>
    <footer className="ch-bottom"><YearRail investigationId={id}/><PointingAt investigationId={id}/></footer>
  </div>;
}
