'use client';
// Investigation search, redesigned (docs/discovery/README.md, "Search"; the
// approved prototype docs/discovery/prototype.html): one card per record,
// grouped by kind of record with its colour; facets down the side with counts;
// a peek card on hover; tags, notes and collections for the chosen result in
// the side panel; ⌘K from anywhere, arrows to move, Enter to trace, T, N and C
// to tag, note or collect. Outside findings stay leads until reviewed. The
// call and its reply check are generated from the API schema.
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {Fragment, useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, KeyboardEvent, ReactElement, ReactNode} from 'react';

import {Checkbox} from '@/components/ui/checkbox';
import {errorMessage} from '../../lib/api-client';
import {peekAtRecordOptions, searchWorkbenchOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {SearchHitOut, SearchWorkbenchData} from '../../lib/generated/types.gen';
import {KIND, KIND_ORDER, SURE, SURE_ORDER, TYPE_LABEL} from '../../lib/record-kinds';
import type {RecordKind, Sure} from '../../lib/record-kinds';
import {PARTY, PARTY_ORDER, partyKind} from '../../lib/viz-tokens';
import type {PartyKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import type {ProvenanceRequest} from '../../lib/workbench-store';
import {MarksPanel, TagChip} from '../marks/marks-panel';
import {useMarks} from '../marks/use-marks';
import type {MarkRecordType, MarkTarget} from '../marks/use-marks';
import {CorpusResults} from './corpus-results';

type Props = {
  /** Empty means "search every investigation this session may see". */
  investigationId: string;
};

const RESULT_LIMIT = 75;
type Filters = {kind?: RecordKind; party_kind?: PartyKind; sure?: Sure; tag?: string};
type Query = NonNullable<SearchWorkbenchData['query']>;

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** What the provenance panel needs to follow a hit back to its sources. The
 * hit's provenance block names the record to trace; its type decides which
 * trace the panel runs. */
export function provenanceRequestForHit(hit: SearchHitOut): ProvenanceRequest {
  const traceType = text(hit.provenance.trace_record_type);
  const traceId = text(hit.provenance.trace_record_id);
  const accepted = traceType === 'claim' || traceType === 'evidence' ? traceType : undefined;
  const direct = traceType === 'relationship' || traceType === 'lead' || traceType === 'task' ? traceType : undefined;
  return {
    title: hit.title,
    kind: `search:${hit.type}`,
    sourceId: text(hit.provenance.source_id),
    sourceUrl: text(hit.provenance.source_url),
    locator: text(hit.provenance.locator),
    detail: hit.snippet,
    entityId: traceType === 'entity' ? traceId : undefined,
    acceptedRecordType: accepted,
    acceptedRecordId: accepted || direct ? traceId : undefined,
    documentId: traceType === 'document' ? traceId : undefined,
    traceRecordType: direct,
  };
}

/** The words of the search marked where they appear in a line. */
export function Highlight({value, words}: {value: string; words: string[]}): ReactElement {
  const parts = useMemo(() => {
    const clean = words.filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!clean.length) return [value];
    return value.split(new RegExp(`(${clean.join('|')})`, 'gi'));
  }, [value, words]);
  return <>{parts.map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>)}</>;
}

function SurePill({sure}: {sure: Sure}): ReactElement {
  const look = SURE[sure];
  return <span className="sv-pill" style={{background: look.fill, color: look.text}}>{look.mark} {look.name}</span>;
}

function FacetRow({colour, label, count, max, on, onClick}: {colour: string; label: ReactNode; count: number; max: number; on: boolean;
  onClick: () => void}): ReactElement {
  return <button type="button" className={`sv-fr${on ? ' on' : ''}${count ? '' : ' zero'}`} aria-pressed={on} onClick={onClick}>
    <span className="sw" style={{background: colour}}/>
    <span>{label}</span>
    <span className="n"><span className="bar" style={{width: max ? Math.max(4, Math.round(48 * count / max)) : 0, color: colour}}/>{count}</span>
  </button>;
}

function Facets({facets, filters, setFilters, tagNames}: {facets: {kind?: Record<string, number>; party_kind?: Record<string, number>;
  sure?: Record<string, number>; tag?: Record<string, number>}; filters: Filters; setFilters: (f: Filters) => void;
  tagNames: {id: string; name: string; colour: string}[]}): ReactElement {
  const kind = facets.kind ?? {};
  const party = facets.party_kind ?? {};
  const sure = facets.sure ?? {};
  const tags = facets.tag ?? {};
  const max = (counts: Record<string, number>) => Math.max(0, ...Object.values(counts));
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters({...filters, [key]: filters[key] === value ? undefined : value});
  return <nav className="sv-facets" aria-label="Narrow the results">
    <div className="sv-fg"><h4>Kind of record</h4>{KIND_ORDER.map(k => <FacetRow key={k} colour={KIND[k].edge} label={KIND[k].plural}
      count={kind[k] ?? 0} max={max(kind)} on={filters.kind === k} onClick={() => toggle('kind', k)}/>)}</div>
    <div className="sv-fg"><h4>Party involved</h4>{PARTY_ORDER.filter(p => party[p] || filters.party_kind === p).map(p => <FacetRow key={p}
      colour={PARTY[p].ring} label={PARTY[p].name} count={party[p] ?? 0} max={max(party)} on={filters.party_kind === p}
      onClick={() => toggle('party_kind', p)}/>)}{!Object.keys(party).length && <small className="sv-muted">No parties found.</small>}</div>
    <div className="sv-fg"><h4>How sure</h4>{SURE_ORDER.map(s => <FacetRow key={s} colour={SURE[s].fill} label={SURE[s].name}
      count={sure[s] ?? 0} max={max(sure)} on={filters.sure === s} onClick={() => toggle('sure', s)}/>)}</div>
    <div className="sv-fg"><h4>Your tags</h4>{tagNames.map(t => <FacetRow key={t.id} colour={t.colour} label={t.name}
      count={tags[t.id] ?? 0} max={max(tags)} on={filters.tag === t.id} onClick={() => toggle('tag', t.id)}/>)}
      {!tagNames.length && <small className="sv-muted">No tags yet.</small>}</div>
  </nav>;
}

/** The hover card: linked parties, evidence by stance, latest event. */
function Peek({investigationId, hit}: {investigationId: string; hit: SearchHitOut}): ReactElement | null {
  const recordType = hit.record_type as MarkRecordType | null | undefined;
  const peek = useQuery({...peekAtRecordOptions({path: {investigation_id: investigationId},
    query: {record_type: recordType ?? 'entity', record_id: hit.id}}), enabled: Boolean(investigationId && recordType)});
  if (!recordType || !peek.data) return null;
  const card = peek.data;
  const stances = Object.entries(card.evidence_by_stance);
  return <div className="sv-peek" role="tooltip">
    <b>{card.caption}</b>
    {card.neighbours.length > 0 && <div className="sv-pr"><span>Linked to</span><span>{card.link_count}</span></div>}
    {card.neighbours.map(n => <div key={`${n.id}:${n.link}`} className="sv-pn">
      <i style={{borderColor: PARTY[partyKind(n.schema)].ring, background: PARTY[partyKind(n.schema)].fill}}/>{n.outgoing ? '→' : '←'} {n.name} <small>{n.link}</small>
    </div>)}
    <div className="sv-pr"><span>Evidence</span><span>{stances.length ? stances.map(([s, n]) => `${n} ${s}`).join(' · ') : 'none attached'}</span></div>
    <div className="sv-pr"><span>Latest event</span><span>{card.latest_event ? `${card.latest_event.date ?? ''} ${card.latest_event.title}` : 'none dated'}</span></div>
  </div>;
}

function ResultCard({hit, words, selected, onSelect, onTrace, onMark, peek}: {hit: SearchHitOut; words: string[]; selected: boolean;
  onSelect: () => void; onTrace: () => void; onMark: (section: 'tags' | 'notes' | 'collections') => void; peek: ReactNode}): ReactElement {
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kind = KIND[hit.kind as RecordKind] ?? KIND.document;
  const outside = hit.kind === 'outside';
  const markable = Boolean(hit.record_type);
  return <div className={`sv-res${selected ? ' sel' : ''}${outside ? ' outside' : ''}`} style={{['--edge' as string]: kind.edge}}
    role="option" aria-selected={selected} tabIndex={-1} onClick={onSelect}
    onMouseEnter={() => { timer.current = setTimeout(() => setHover(true), 350); }}
    onMouseLeave={() => { if (timer.current) clearTimeout(timer.current); setHover(false); }}>
    <div className="sv-body">
      <div className="t"><Highlight value={hit.title} words={words}/></div>
      <div className="sv-meta">
        <span className="kl" style={{color: kind.edge}}>{TYPE_LABEL[hit.type] ?? hit.type}</span>
        {hit.sure && <SurePill sure={hit.sure}/>}
        {hit.date && <span>{hit.date}</span>}
        {hit.parties?.map(p => <span key={p.id} className="sv-pd"><i style={{borderColor: PARTY[partyKind(p.schema)].ring}}/>{p.name}</span>)}
      </div>
      {hit.snippet && hit.snippet !== hit.title && <div className="sv-sn"><Highlight value={hit.snippet} words={words}/></div>}
      {text(hit.provenance.locator) && <div className="sv-why">At {text(hit.provenance.locator)}</div>}
      {hit.matched_fields && hit.matched_fields.length > 0 && <div className="sv-why">Matched on {hit.matched_fields.slice(0, 3).join(', ')}</div>}
      {outside && <div className="sv-why">External connector result; treat as a lead until reviewed and promoted.</div>}
      {((hit.tags?.length ?? 0) > 0 || (hit.note_count ?? 0) > 0) && <div className="sv-tags">
        {hit.tags?.map(t => <TagChip key={t.id} name={t.name} colour={t.colour}/>)}
        {(hit.note_count ?? 0) > 0 && <span className="sv-notec">{hit.note_count} {hit.note_count === 1 ? 'note' : 'notes'}</span>}
      </div>}
    </div>
    <div className="sv-acts">
      {!outside && <button type="button" className="sv-btn" aria-label="Trace provenance" onClick={e => { e.stopPropagation(); onTrace(); }}>Trace</button>}
      {markable && <>
        <button type="button" className="sv-ab" aria-label="Tag" title="Tag (T)" onClick={e => { e.stopPropagation(); onMark('tags'); }}>T</button>
        <button type="button" className="sv-ab" aria-label="Add a note" title="Note (N)" onClick={e => { e.stopPropagation(); onMark('notes'); }}>N</button>
        <button type="button" className="sv-ab" aria-label="Add to a collection" title="Collect (C)" onClick={e => { e.stopPropagation(); onMark('collections'); }}>C</button>
      </>}
      {text(hit.provenance.source_url) && <a className="sv-ab" href={text(hit.provenance.source_url)} target="_blank" rel="noreferrer"
        aria-label="Open source" title="Open source" onClick={e => e.stopPropagation()}>↗</a>}
    </div>
    {hover && peek}
  </div>;
}

export function SearchPanel({investigationId}: Props): ReactElement {
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const marks = useMarks(investigationId);
  const [draft, setDraft] = useState('');
  const [includeReconciledDuplicates, setIncludeReconciledDuplicates] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const marksRef = useRef<HTMLDivElement>(null);
  // The query runs for the last submitted search, not for every keystroke.
  const [submitted, setSubmitted] = useState<{q: string; investigationId: string; includeReconciledDuplicates: boolean} | null>(null);

  const query: Query = {
    q: submitted?.q ?? '',
    limit: RESULT_LIMIT,
    investigation_id: submitted?.investigationId || undefined,
    include_reconciled_duplicates: submitted?.includeReconciledDuplicates || undefined,
    ...(filters.kind ? {kind: filters.kind} : {}),
    ...(filters.party_kind ? {party_kind: filters.party_kind} : {}),
    ...(filters.sure ? {sure: filters.sure} : {}),
    ...(filters.tag ? {tag: filters.tag} : {}),
  };
  // The last list stays up while a filter's search runs, so the page does not jump.
  const search = useQuery({...searchWorkbenchOptions({query}), enabled: submitted !== null, placeholderData: keepPreviousData});

  // Results belong to the case they were searched in.
  useEffect(() => { setSubmitted(null); setFilters({}); setSelected(null); }, [investigationId]);

  // ⌘K / Ctrl+K opens search from anywhere on the page.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = () => {
    const q = draft.trim();
    if (!q) return;
    setSubmitted({q, investigationId, includeReconciledDuplicates});
    setSelected(null);
  };

  const results = useMemo(() => search.data?.results ?? [], [search.data]);
  const words = useMemo(() => (submitted?.q ?? '').split(/\s+/).filter(w => w.length > 1), [submitted]);
  const visible = useMemo(() => results.filter(r => !folded.has(r.kind)), [results, folded]);
  const key = (r: SearchHitOut) => `${r.type}:${r.id}`;
  const chosen = results.find(r => key(r) === selected) ?? null;
  const target: MarkTarget | null = chosen?.record_type && investigationId
    ? {record_type: chosen.record_type as MarkRecordType, record_id: chosen.id, caption: chosen.title} : null;

  const focusMarks = (section: 'tags' | 'notes' | 'collections') => {
    window.setTimeout(() => {
      const field = marksRef.current?.querySelector<HTMLElement>(
        section === 'tags' ? '[aria-label="New tag name"]' : section === 'notes' ? '[aria-label="New note"]' : '[aria-label="New collection name"]');
      field?.focus();
    }, 0);
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!visible.length || (event.target as HTMLElement).closest('input, textarea')) return;
    const at = visible.findIndex(r => key(r) === selected);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(visible.length - 1, at + 1) : Math.max(0, at - 1);
      setSelected(key(visible[next]));
    } else if (event.key === 'Enter' && chosen && chosen.kind !== 'outside') {
      openProvenance(provenanceRequestForHit(chosen));
    } else if (chosen?.record_type && ['t', 'n', 'c'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      focusMarks(event.key.toLowerCase() === 't' ? 'tags' : event.key.toLowerCase() === 'n' ? 'notes' : 'collections');
    }
  };

  const total = search.data?.total ?? 0;
  const facets = search.data?.facets ?? {};
  const allFound = Object.values(facets.kind ?? {}).reduce((a, b) => a + b, 0);

  return <section className="card sv" id="investigation-search" aria-labelledby="search-title">
    <div className="sv-head">
      <h3 id="search-title">Search</h3>
      <label className="sv-sbox">
        <input ref={inputRef} value={draft} onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') submit(); }} placeholder="Search this investigation…"
          aria-label="Search this investigation"/>
        <kbd>⌘K</kbd>
      </label>
      <button type="button" className="sv-btn p" onClick={submit}>Search records</button>
      <label className="sv-check"><Checkbox checked={includeReconciledDuplicates}
        onCheckedChange={(checked: boolean | 'indeterminate') => setIncludeReconciledDuplicates(checked === true)}/> Include reviewed duplicate copies</label>
    </div>
    {search.isError && <p className="sv-error">{errorMessage(search.error, 'Search failed')}</p>}
    {submitted && search.data && <div className="sv-wrap">
      <Facets facets={facets} filters={filters} setFilters={f => { setFilters(f); setSelected(null); }} tagNames={marks.tags}/>
      <div className="sv-results" role="listbox" aria-label="Results" tabIndex={0} onKeyDown={onListKey}>
        <div className="sv-rhead"><h2>“{submitted.q}”</h2>
          <span>{total} {total === 1 ? 'result' : 'results'}{total !== allFound ? ` of ${allFound}, filtered` : ''} · one card per record</span></div>
        {!results.length && <p className="sv-muted">Nothing found{Object.values(filters).some(Boolean) ? ' with these filters' : ''}.</p>}
        {KIND_ORDER.map(kind => {
          const rows = results.filter(r => r.kind === kind);
          if (!rows.length) return null;
          const isFolded = folded.has(kind);
          return <div className="sv-grp" key={kind}>
            <button type="button" className="sv-gh" style={{borderColor: KIND[kind].edge, color: KIND[kind].edge}} aria-expanded={!isFolded}
              onClick={() => setFolded(prev => { const next = new Set(prev); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; })}>
              <b>{KIND[kind].plural}</b><span>{rows.length}</span><i>{isFolded ? 'show' : 'fold'}</i>
            </button>
            {!isFolded && rows.map(r => <ResultCard key={key(r)} hit={r} words={words} selected={selected === key(r)}
              onSelect={() => setSelected(key(r))} onTrace={() => openProvenance(provenanceRequestForHit(r))}
              onMark={section => { setSelected(key(r)); focusMarks(section); }}
              peek={investigationId ? <Peek investigationId={r.investigation_id} hit={r}/> : null}/>)}
          </div>;
        })}
      </div>
      <aside className="sv-panel" ref={marksRef}>
        {investigationId ? <MarksPanel investigationId={investigationId} target={target}/>
          : <p className="sv-muted">Choose an investigation to tag records, write notes and keep collections.</p>}
      </aside>
    </div>}
    {submitted?.investigationId && <CorpusResults investigationId={submitted.investigationId} q={submitted.q}/>}
  </section>;
}
