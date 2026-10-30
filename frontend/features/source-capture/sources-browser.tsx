'use client';
// Bring in › Sources & evidence: every source the case holds, and the evidence each one gives (BACKLOG: "It is only a
// capture form. Add a way to look through all the sources and evidence"; REDESIGN_RESEARCH "Sources list": each source
// a row with its type icon, title, evidence count and the claims it backs). The list is on the left, the picked
// source's evidence on the right; the capture form is one click away ("Add a source").
//
// Shown by default: the title, the kind as a mark, the evidence count, the claims each piece backs as status colours.
// On hover or focus: the kind's name, publisher and dates, a claim's words and the stance the evidence takes.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowLeft, BookOpen, ExternalLink, Plus, Route, Search, X} from 'lucide-react';
import {useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import type {ClaimStatus} from '../../components/status';
import {
  listClaimsOptions, listDocumentsOptions, listInvestigationEvidenceClaimLinksOptions, listInvestigationEvidenceOptions,
  listInvestigationEvidenceQueryKey, listSourcesOptions, listSourcesQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {ClaimOut, DocumentOut, EvidenceOut, SourceOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {pageOf} from '../case-home/decision-card';
import {SourceCapturePanel} from './source-capture-panel';
import {ORIGIN, ORIGINS, originOf} from './source-kinds';
import type {SourceOrigin} from './source-kinds';

const CLAIM_STATUS: Record<string, ClaimStatus> = {
  supported: 'supported', confirmed: 'supported', disputed: 'disputed', rejected: 'ruled_out', lead: 'unshown', unverified: 'unshown',
};
const STATUS_WORD: Record<ClaimStatus, string> = {supported: 'Supported', disputed: 'Disputed', unshown: 'Not yet shown', ruled_out: 'Ruled out'};
const STATUS_ORDER: Record<ClaimStatus, number> = {disputed: 0, unshown: 1, supported: 2, ruled_out: 3};
/** The stance a piece of evidence takes on a claim, as a mark: + backs it, − cuts against it, · context. */
const STANCE: Record<string, {mark: string; word: string}> = {
  supports: {mark: '+', word: 'Backs it'}, contradicts: {mark: '−', word: 'Cuts against it'}, context: {mark: '·', word: 'Context'},
};
const PAGE = 120;

type Use = 'all' | 'used' | 'unused';
type Link = {claim: ClaimOut; stance: string};
type Row = {
  source: SourceOut; origin: SourceOrigin; document?: DocumentOut; evidence: EvidenceOut[];
  claims: ClaimOut[]; disputed: boolean; matches: EvidenceOut[] | null;
};

const statusOf = (c: ClaimOut): ClaimStatus => CLAIM_STATUS[c.status] ?? 'unshown';
const meta = (s: SourceOut, key: string): string => {
  const v = (s.metadata_json ?? {})[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
};
const hostOf = (url?: string | null): string => {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
};
const hits = (ev: EvidenceOut, q: string): boolean =>
  [ev.quote, ev.locator, ev.notes].some(t => (t ?? '').toLowerCase().includes(q));

/** The words with the searched-for text marked (an underline, not a highlighter: BACKLOG, watchlist hits). */
function Marked({text, q}: {text: string; q: string}): ReactElement {
  if (!q) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(q); i >= 0 && parts.length < 40; i = lower.indexOf(q, at)) {
    if (i > at) parts.push(text.slice(at, i));
    parts.push(<mark key={i} className="sb-hit">{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

export function SourcesBrowser({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const enabled = Boolean(investigationId);
  const sourcesQuery = useQuery({...listSourcesOptions({path}), enabled});
  const evidenceQuery = useQuery({...listInvestigationEvidenceOptions({path}), enabled});
  const linksQuery = useQuery({...listInvestigationEvidenceClaimLinksOptions({path}), enabled, retry: false});
  const claimsQuery = useQuery({...listClaimsOptions({path}), enabled});
  const documentsQuery = useQuery({...listDocumentsOptions({path}), enabled});
  const openClaim = useWorkbenchStore(s => s.openClaim);
  const openDocument = useWorkbenchStore(s => s.openDocument);
  const openProvenance = useWorkbenchStore(s => s.openProvenance);

  const [kinds, setKinds] = useState<Set<SourceOrigin>>(new Set());
  const [use, setUse] = useState<Use>('all');
  const [disputedOnly, setDisputedOnly] = useState(false);
  const [typed, setTyped] = useState('');
  const q = useDeferredValue(typed.trim().toLowerCase());
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [peek, setPeek] = useState<Row | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A new case starts afresh.
  useEffect(() => { setChosen(null); setAdding(false); setTyped(''); setKinds(new Set()); setUse('all'); setDisputedOnly(false); }, [investigationId]);
  useEffect(() => { setShown(PAGE); }, [chosen, q]);

  const sources = sourcesQuery.data;
  const evidence = evidenceQuery.data;

  const linksByEvidence = useMemo(() => {
    const claimById = new Map((claimsQuery.data ?? []).map(c => [c.id, c]));
    const out = new Map<string, Link[]>();
    for (const l of linksQuery.data ?? []) {
      const claim = claimById.get(l.claim_id);
      if (!claim) continue;
      const list = out.get(l.evidence_id) ?? [];
      list.push({claim, stance: l.stance});
      out.set(l.evidence_id, list);
    }
    for (const list of out.values()) list.sort((a, b) => STATUS_ORDER[statusOf(a.claim)] - STATUS_ORDER[statusOf(b.claim)]);
    return out;
  }, [linksQuery.data, claimsQuery.data]);

  const rows = useMemo<Row[]>(() => {
    const bySource = new Map<string, EvidenceOut[]>();
    for (const r of evidence ?? []) {
      const list = bySource.get(r.source.id) ?? [];
      list.push(r.evidence);
      bySource.set(r.source.id, list);
    }
    const docBySource = new Map((documentsQuery.data ?? []).map(d => [d.source_id, d]));
    return (sources ?? []).map(source => {
      const ev = bySource.get(source.id) ?? [];
      const claims = new Map<string, ClaimOut>();
      for (const e of ev) for (const l of linksByEvidence.get(e.id) ?? []) claims.set(l.claim.id, l.claim);
      const list = [...claims.values()].sort((a, b) => STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)]);
      const document = docBySource.get(source.id);
      return {source, origin: originOf(source, document), document, evidence: ev, claims: list,
        disputed: list.some(c => statusOf(c) === 'disputed'), matches: null};
    }).sort((a, b) => b.claims.length - a.claims.length || b.evidence.length - a.evidence.length || a.source.title.localeCompare(b.source.title));
  }, [sources, evidence, documentsQuery.data, linksByEvidence]);

  const present = useMemo(() => new Set(rows.map(r => r.origin)), [rows]);

  const filtered = useMemo<Row[]>(() => rows.flatMap(r => {
    if (kinds.size && !kinds.has(r.origin)) return [];
    if (use === 'used' && !r.claims.length) return [];
    if (use === 'unused' && r.claims.length) return [];
    if (disputedOnly && !r.disputed) return [];
    if (!q) return [r];
    const matches = r.evidence.filter(e => hits(e, q));
    if (matches.length) return [{...r, matches}];
    return r.source.title.toLowerCase().includes(q) ? [{...r, matches: []}] : [];
  }), [rows, kinds, use, disputedOnly, q]);

  const current = filtered.find(r => r.source.id === chosen) ?? filtered[0] ?? null;
  const pieces = filtered.reduce((n, r) => n + (r.matches?.length || r.evidence.length), 0);
  const total = Math.max(1, filtered.reduce((n, r) => n + Math.max(1, r.evidence.length), 0));

  const pick = (id: string): void => { setChosen(id); setAdding(false); };
  const onListKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const at = filtered.findIndex(r => r.source.id === current?.source.id);
    const next = filtered[Math.min(filtered.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    pick(next.source.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-source="${next.source.id}"]`)?.focus();
  };
  const toggleKind = (k: SourceOrigin): void => setKinds(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const afterSaved = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey: listSourcesQueryKey({path})}),
      queryClient.invalidateQueries({queryKey: listInvestigationEvidenceQueryKey({path})}),
    ]);
  };

  const loading = !sources || !evidence;
  const failed = sourcesQuery.isError || evidenceQuery.isError;
  const filtering = Boolean(kinds.size || use !== 'all' || disputedOnly || q);
  const capture = <SourceCapturePanel investigationId={investigationId} sourceCount={sources?.length ?? 0} evidenceCount={evidence?.length ?? 0} onSaved={afterSaved}/>;

  if (failed) return <div className="sb sb-empty"><p>The sources could not be loaded. Reload the page to try again.</p></div>;
  if (!loading && !rows.length) return <div className="sb sb-empty"><h2>No sources yet</h2>{capture}</div>;

  return <div className="sb">
    <header className="sb-head">
      <h2 className="sb-count"><b>{loading ? '…' : rows.length}</b> <span>sources</span> <b>{loading ? '…' : evidence.length}</b> <span>pieces of evidence</span></h2>
      <label className="sb-search">
        <Search size={16} aria-hidden="true"/>
        <input type="search" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Search the quotes…" aria-label="Search the quotes, locators and notes"/>
        {typed && <button type="button" aria-label="Clear the search" onClick={() => setTyped('')}><X size={14} aria-hidden="true"/></button>}
      </label>
      <button type="button" className="sb-btn pri" onClick={() => setAdding(true)} aria-pressed={adding}><Plus size={15} aria-hidden="true"/> Add a source</button>
    </header>

    <div className="sb-filters" role="group" aria-label="Show">
      <div className="sb-kinds" role="group" aria-label="Kind of source">{ORIGINS.filter(o => present.has(o.key)).map(({key, label, Icon}) =>
        <Reveal key={key} tabbable={false} describe={false} detail={<><b>{label}</b><span className="rv-row">{rows.filter(r => r.origin === key).length} sources · click to show only these</span></>}>
          <button type="button" className={`sb-kind${kinds.has(key) ? ' on' : ''}`} aria-pressed={kinds.has(key)} aria-label={label} onClick={() => toggleKind(key)}>
            <Icon size={17} aria-hidden="true"/><span>{rows.filter(r => r.origin === key).length}</span></button></Reveal>)}</div>
      <div className="sb-seg" role="radiogroup" aria-label="Used in claims">{([['all', 'All'], ['used', 'Backing claims'], ['unused', 'Not used yet']] as [Use, string][]).map(([key, label]) =>
        <button key={key} type="button" role="radio" aria-checked={use === key} className={use === key ? 'on' : ''} onClick={() => setUse(key)}>{label}</button>)}</div>
      <Reveal tabbable={false} describe={false} detail="Only sources whose evidence is linked to a disputed claim">
        <button type="button" className={`sb-disp${disputedOnly ? ' on' : ''}`} aria-pressed={disputedOnly} onClick={() => setDisputedOnly(v => !v)}>
          <i aria-hidden="true"/> On a disputed claim</button></Reveal>
      {filtering && <span className="sb-showing"><b>{filtered.length}</b> sources · <b>{pieces}</b> {q ? 'matching pieces' : 'pieces'}
        <button type="button" className="sb-link" onClick={() => { setKinds(new Set()); setUse('all'); setDisputedOnly(false); setTyped(''); }}>Clear</button></span>}
    </div>

    <div className="sb-body">
      <aside className="sb-left" aria-label="Sources">
        {/* The shelf: every source shown, as wide as the evidence it holds; its colour says whether it backs claims. */}
        <div className="sb-shelf" onMouseLeave={() => setPeek(null)} aria-hidden="true">
          {filtered.map(r => <span key={r.source.id} style={{flexGrow: Math.max(1, r.evidence.length) / total * 1000}}
            className={`sb-shelf-seg${r.disputed ? ' disp' : r.claims.length ? ' used' : ''}${r.source.id === current?.source.id ? ' on' : ''}`}
            onMouseEnter={() => setPeek(r)} onClick={() => pick(r.source.id)}/>)}
        </div>
        <p className="sb-shelf-read">{peek ? <><b>{peek.source.title}</b> · {peek.evidence.length} pieces · {peek.claims.length} claims</> : <>&nbsp;</>}</p>
        <div className="sb-list" ref={listRef} onKeyDown={onListKey}>
          {loading && <p className="sb-muted">Loading the sources…</p>}
          {!loading && !filtered.length && <p className="sb-muted">Nothing matches. <button type="button" className="sb-link" onClick={() => { setKinds(new Set()); setUse('all'); setDisputedOnly(false); setTyped(''); }}>Clear the filters</button></p>}
          {filtered.map(r => <SourceRow key={r.source.id} row={r} on={r.source.id === current?.source.id && !adding} searching={Boolean(q)} onPick={() => pick(r.source.id)}/>)}
        </div>
      </aside>

      <section className="sb-right" aria-label={adding ? 'Add a source' : current ? `Evidence from ${current.source.title}` : 'Evidence'}>
        {adding ? <div className="sb-add">
          <button type="button" className="sb-btn quiet" onClick={() => setAdding(false)}><ArrowLeft size={15} aria-hidden="true"/> Back to the sources</button>
          {capture}
        </div> : current ? <SourceDetail row={current} q={q} shown={shown} onMore={() => setShown(n => n + PAGE)} linksByEvidence={linksByEvidence}
          linksMissing={linksQuery.isError} onClaim={openClaim}
          onRead={(docId, page) => openDocument(docId, page)}
          onTrace={(ev) => openProvenance(ev ? {title: current.source.title, kind: 'evidence', sourceId: current.source.id, sourceUrl: current.source.url ?? undefined,
            locator: ev.locator ?? undefined, detail: ev.quote || ev.notes || undefined, acceptedRecordType: 'evidence', acceptedRecordId: ev.id,
            documentId: ev.document_id ?? current.document?.id}
            : {title: current.source.title, kind: 'source', sourceId: current.source.id, sourceUrl: current.source.url ?? undefined, documentId: current.document?.id})}/>
          : <p className="sb-muted">Pick a source to see its evidence.</p>}
      </section>
    </div>
  </div>;
}

function ClaimDots({claims, max = 8}: {claims: ClaimOut[]; max?: number}): ReactElement | null {
  if (!claims.length) return null;
  return <span className="sb-dots" aria-hidden="true">{claims.slice(0, max).map(c => <i key={c.id} className={`sb-dot st-${statusOf(c)}`}/>)}
    {claims.length > max && <span className="sb-more">+{claims.length - max}</span>}</span>;
}

function SourceRow({row, on, searching, onPick}: {row: Row; on: boolean; searching: boolean; onPick: () => void}): ReactElement {
  const {Icon, label} = ORIGIN[row.origin];
  const count = searching && row.matches ? row.matches.length : row.evidence.length;
  const disputed = row.claims.filter(c => statusOf(c) === 'disputed').length;
  const name = `${row.source.title}. ${label}. ${count} ${searching ? 'matching ' : ''}pieces of evidence. ${row.claims.length
    ? `Backs ${row.claims.length} claim${row.claims.length === 1 ? '' : 's'}${disputed ? `, ${disputed} disputed` : ''}.` : 'Not used in a claim yet.'}`;
  return <button type="button" data-source={row.source.id} className={`sb-src${on ? ' on' : ''}${row.claims.length ? '' : ' unused'}`}
    aria-current={on ? 'true' : undefined} aria-label={name} onClick={onPick}>
    <span className={`sb-src-kind k-${row.origin}`}><Icon size={18} aria-hidden="true"/></span>
    <span className="sb-src-title">{row.source.title}</span>
    <ClaimDots claims={row.claims} max={6}/>
    <span className={`sb-src-n${searching ? ' hit' : ''}`}>{count}</span>
  </button>;
}

type DetailProps = {
  row: Row; q: string; shown: number; onMore: () => void; linksByEvidence: Map<string, Link[]>; linksMissing: boolean;
  onClaim: (id: string) => void; onRead: (documentId: string, page: number | null) => void; onTrace: (ev?: EvidenceOut) => void;
};

function SourceDetail({row, q, shown, onMore, linksByEvidence, linksMissing, onClaim, onRead, onTrace}: DetailProps): ReactElement {
  const {source, document} = row;
  const {Icon, label} = ORIGIN[row.origin];
  // The pieces that back claims first (a disputed claim's first), then in page order.
  const list = useMemo(() => {
    const rank = (ev: EvidenceOut): number => {
      const links = linksByEvidence.get(ev.id);
      return links?.length ? STATUS_ORDER[statusOf(links[0].claim)] : 9;
    };
    return [...(q && row.matches?.length ? row.matches : row.evidence)].sort((a, b) => rank(a) - rank(b)
      || (pageOf(a.locator) ?? 1e9) - (pageOf(b.locator) ?? 1e9) || (a.locator ?? '').localeCompare(b.locator ?? ''));
  }, [row, q, linksByEvidence]);
  const publisher = meta(source, 'publisher') || source.issuer_or_author || hostOf(source.url);
  const date = meta(source, 'date');
  const linkOnly = meta(source, 'link_only');
  const counts = {supported: 0, disputed: 0, unshown: 0, ruled_out: 0} as Record<ClaimStatus, number>;
  for (const c of row.claims) counts[statusOf(c)] += 1;

  return <>
    <header className="sb-detail-head">
      <Reveal tabbable={false} describe={false} detail={<b>{label}</b>}><span className={`sb-detail-kind k-${row.origin}`} aria-label={label} role="img"><Icon size={26} aria-hidden="true"/></span></Reveal>
      <div className="sb-detail-title">
        <Reveal detail={<>
          {publisher && <span className="rv-row"><b>{publisher}</b>{date ? ` · ${date}` : ''}</span>}
          {source.url && <span className="rv-row rv-mono">{source.url}</span>}
          {linkOnly && <span className="rv-row">{linkOnly}</span>}
          {source.source_tier && <span className="rv-row">Source tier {source.source_tier}</span>}
          {document && <span className="rv-row rv-mono">{document.filename}</span>}
        </>}><h3>{source.title}</h3></Reveal>
        <p className="sb-detail-nums"><b>{row.evidence.length}</b> pieces · <b>{row.claims.length}</b> claims
          {row.claims.length > 0 && <span className="sb-tally">{(['disputed', 'unshown', 'supported', 'ruled_out'] as ClaimStatus[]).filter(s => counts[s]).map(s =>
            <Reveal key={s} tabbable={false} describe={false} detail={<><b>{STATUS_WORD[s]}</b> · {counts[s]} claim{counts[s] === 1 ? '' : 's'}</>}>
              <span className={`sb-tally-n st-${s}`}><i aria-hidden="true"/>{counts[s]}<span className="st-sr"> {STATUS_WORD[s]}</span></span></Reveal>)}</span>}
        </p>
      </div>
      <div className="sb-detail-acts">
        {document && <button type="button" className="sb-btn" onClick={() => onRead(document.id, null)}><BookOpen size={15} aria-hidden="true"/> Reading room</button>}
        {source.url && <a className="sb-btn" href={source.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={15} aria-hidden="true"/> Open the page</a>}
        <button type="button" className="sb-btn" onClick={() => onTrace()}><Route size={15} aria-hidden="true"/> Chain of custody</button>
      </div>
    </header>
    {linksMissing && <p className="sb-muted sb-note">The claims each piece backs could not be loaded.</p>}
    <ol className="sb-evs">
      {list.slice(0, shown).map(ev => <EvidenceCard key={ev.id} ev={ev} q={q} links={linksByEvidence.get(ev.id) ?? []} documentId={ev.document_id ?? document?.id ?? null}
        onClaim={onClaim} onRead={onRead} onTrace={() => onTrace(ev)}/>)}
      {!list.length && <li className="sb-muted">This source holds no evidence yet.</li>}
    </ol>
    {list.length > shown && <button type="button" className="sb-btn sb-more-btn" onClick={onMore}>Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}</button>}
  </>;
}

function EvidenceCard({ev, q, links, documentId, onClaim, onRead, onTrace}: {ev: EvidenceOut; q: string; links: Link[]; documentId: string | null;
  onClaim: (id: string) => void; onRead: (documentId: string, page: number | null) => void; onTrace: () => void}): ReactElement {
  const dates = [['Made', ev.created_on], ['Event', ev.event_on], ['Published', ev.published_on], ['Retrieved', ev.retrieved_on], ['Taken', ev.captured_on]]
    .filter(([, v]) => v) as [string, string][];
  const extra = ev.notes || dates.length || ev.issuer_or_author || ev.limitations?.length;
  const locator = ev.locator ? <span className="sb-loc"><Marked text={ev.locator} q={q}/></span> : <span className="sb-loc none">no locator</span>;
  return <li className={`sb-ev${links.length ? '' : ' unused'}`}>
    <div className="sb-ev-side">
      {extra ? <Reveal detail={<>
        {ev.issuer_or_author && <span className="rv-row"><b>{ev.issuer_or_author}</b></span>}
        {dates.map(([k, v]) => <span key={k} className="rv-row">{k} {v}</span>)}
        {ev.notes && <span className="rv-row">{ev.notes}</span>}
        {ev.limitations?.map(l => <span key={l} className="rv-row">Limit: {l}</span>)}
      </>}>{locator}</Reveal> : locator}
    </div>
    {ev.quote ? <blockquote className="sb-quote"><Marked text={ev.quote} q={q}/></blockquote>
      : <p className="sb-quote none">{ev.notes ? <Marked text={ev.notes} q={q}/> : 'No quote kept'}</p>}
    <div className="sb-ev-end">
      {links.length > 0 ? <span className="sb-claims" role="list" aria-label="Claims it is linked to">{links.map(l => {
        const st = statusOf(l.claim);
        const stance = STANCE[l.stance] ?? STANCE.context;
        return <span role="listitem" key={`${l.claim.id}-${l.stance}`}><Reveal tabbable={false} describe={false} detail={<>
          <b>{STATUS_WORD[st]}</b> · {stance.word}<span className="rv-row">{l.claim.text}</span></>}>
          <button type="button" className={`sb-claim st-${st} s-${l.stance}`} onClick={() => onClaim(l.claim.id)}
            aria-label={`${stance.word}: ${l.claim.text} (${STATUS_WORD[st]}). Open the claim`}><span aria-hidden="true">{stance.mark}</span></button></Reveal></span>;
      })}</span> : null}
      <span className="sb-ev-acts">
        {documentId && <Reveal tabbable={false} describe={false} detail="Open it in the reading room">
          <button type="button" className="sb-act" aria-label="Open it in the reading room" onClick={() => onRead(documentId, pageOf(ev.locator))}><BookOpen size={15} aria-hidden="true"/></button></Reveal>}
        <Reveal tabbable={false} describe={false} detail="Its chain of custody">
          <button type="button" className="sb-act" aria-label="Its chain of custody" onClick={onTrace}><Route size={15} aria-hidden="true"/></button></Reveal>
      </span>
    </div>
  </li>;
}
