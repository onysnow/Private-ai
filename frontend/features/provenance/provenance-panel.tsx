'use client';
// Provenance trace: one place to follow a record back through source,
// document, exact chunk, extraction proposal, reporter decision, accepted
// record, supporting evidence and review history. Any panel asks for a
// trace through the shared store (lib/workbench-store.ts); only this panel
// loads one. Moved out of app/page.tsx (Foundation Fixes fix 3); the calls
// and their reply checks are generated from the API schema (fix 2).
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {FamilyMark, StanceMark} from '../../components/network/marks';
import {StatusChip, type ClaimStatus} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {listSourcesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {
  findExtractionLineageEndpoint, getExtractionCandidateLineage, getRecordProvenanceTrace, listEntityStatementHistory, listSourceEvidenceEndpoint,
} from '../../lib/generated/sdk.gen';
import type {EvidenceOut, ExtractionLineageOut, ProvenanceTraceOut, SourceOut, StatementHistoryRowOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import type {ProvenanceRequest} from '../../lib/workbench-store';
import {timeWords} from '../../lib/timestamps';

type Props = {investigationId: string};

/** The source a trace starts from, whether it came from the investigation's
 * source list or from a document's extraction trail. */
export type TraceSource = {id: string; title: string; url?: string | null; source_type: string};

export type TraceResult = {
  source: TraceSource | null;
  url: string;
  locator: string;
  trace: ProvenanceTraceOut | null;
  lineage: ExtractionLineageOut | null;
  evidence: EvidenceOut[];
  history: StatementHistoryRowOut[];
  /** True when the request named something that can be followed. */
  resolvable: boolean;
};

function sourceByRef(sources: SourceOut[], ref?: string): SourceOut | null {
  if (!ref) return null;
  return sources.find(source => source.id === ref || source.url === ref || source.title === ref) || null;
}

const trace = (record_type: string, record_id: string) =>
  getRecordProvenanceTrace({query: {record_type, record_id}, throwOnError: true}).then(r => r.data);

/** Runs every lookup the request calls for, all at once. Which lookups run
 * depends on what the request names: a source gives its evidence; an entity
 * gives its statement history; an accepted record or a proposal gives the
 * document trail; and each of those also gives the connected trace. */
export async function loadTrace(request: ProvenanceRequest, sources: SourceOut[]): Promise<TraceResult> {
  const source = sourceByRef(sources, request.sourceId) || sourceByRef(sources, request.sourceUrl);
  const result: TraceResult = {
    source, url: request.sourceUrl || source?.url || '', locator: request.locator || '', trace: null, lineage: null,
    evidence: [], history: [],
    resolvable: Boolean(source || request.sourceUrl || request.entityId || request.extractionCandidateId || request.acceptedRecordId || request.documentId || request.traceRecordType),
  };
  const jobs: Promise<void>[] = [];
  const useLineage = (lineage: ExtractionLineageOut | null | undefined) => {
    if (!lineage) return;
    result.lineage = lineage;
    if (lineage.source) result.source = lineage.source;
    if (lineage.chunk && !request.locator) result.locator = lineage.chunk.locator;
  };
  if (source) {
    jobs.push(listSourceEvidenceEndpoint({path: {source_id: source.id}, throwOnError: true}).then(r => { result.evidence = r.data; }));
    if (!request.entityId && !request.extractionCandidateId && !request.acceptedRecordId && !request.documentId) {
      jobs.push(trace('source', source.id).then(t => { result.trace = t; }));
    }
  }
  if (request.traceRecordType && request.acceptedRecordId) {
    jobs.push(trace(request.traceRecordType, request.acceptedRecordId).then(t => { result.trace = t; }));
  }
  if (request.documentId) {
    jobs.push(trace('document', request.documentId).then(t => { result.trace = t; }));
  }
  if (request.entityId) {
    jobs.push(listEntityStatementHistory({path: {entity_id: request.entityId}, throwOnError: true}).then(r => { result.history = r.data; }));
    jobs.push(trace('entity', request.entityId).then(t => { result.trace = t; }));
  }
  if (request.extractionCandidateId) {
    jobs.push(getExtractionCandidateLineage({path: {candidate_id: request.extractionCandidateId}, throwOnError: true}).then(r => useLineage(r.data)));
  } else if (request.acceptedRecordType && request.acceptedRecordId) {
    const query = {record_type: request.acceptedRecordType, record_id: request.acceptedRecordId};
    jobs.push(findExtractionLineageEndpoint({query, throwOnError: true}).then(r => useLineage(r.data.lineage)));
    jobs.push(trace(query.record_type, query.record_id).then(t => { result.trace = t; }));
  }
  await Promise.all(jobs);
  return result;
}

export function ProvenancePanel({investigationId}: Props): ReactElement {
  const asked = useWorkbenchStore(state => state.provenance);
  const sources = useQuery({...listSourcesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const result = useQuery({
    queryKey: ['provenance-trace', asked?.serial ?? 0, asked?.request ?? null, sources.dataUpdatedAt],
    queryFn: () => loadTrace(asked!.request, sources.data ?? []),
    enabled: asked !== null && (!investigationId || sources.isFetched),
  });
  const request = asked?.request;
  const loaded = result.data;
  const status = !request ? '' : result.isPending ? 'Tracing provenance…' : result.isError ? errorMessage(result.error, 'Could not load provenance trace')
    : loaded?.resolvable ? 'Trace loaded.' : 'No resolvable source/history reference is attached to this record.';

  return <Card className="card">
    <CardHeader className="pb-3">
      {/* Ony, 29 Oct: the drawer's explanation is revealed on its title. */}
      <CardTitle><Reveal detail="One place to follow a record back through source, document, exact chunk/page, extraction proposal, reporter decision, accepted record, supporting evidence, and entity review/promotion history without changing canonical status.">
        Chain of Custody</Reveal></CardTitle>
    </CardHeader>
    <CardContent>
      {!request ? <p className="muted">Use “Trace provenance” from search, timeline, claims, dossiers, graph statements, or the evidence pool.</p> : <div className="candidate">
        <b><Reveal detail={request.kind}>{request.title}</Reveal></b>
        {request.detail && <div>{request.detail}</div>}
        {loaded?.source && <div><b>Source:</b> <Reveal detail={loaded.source.source_type}>{loaded.source.title}</Reveal></div>}
        {loaded?.locator && <div><b>Exact locator:</b> {loaded.locator}</div>}
        {loaded?.url && <div><a href={loaded.url} target="_blank" rel="noreferrer">Open originating source</a></div>}
        {status && <p className="muted">{status}</p>}
        {loaded?.trace && <ConnectedTrace trace={loaded.trace}/>}
        {loaded?.lineage && <Lineage lineage={loaded.lineage}/>}
        {loaded && loaded.evidence.length > 0 && <div>
          <h4>Evidence from this source</h4>
          {loaded.evidence.map(e => <div key={e.id} className="statement">
            {e.locator ? <Reveal detail={`Locator: ${e.locator}`}><div>{e.quote || e.notes || 'Evidence record'}</div></Reveal> : <div>{e.quote || e.notes || 'Evidence record'}</div>}
          </div>)}
        </div>}
        {loaded && loaded.history.length > 0 && <div>
          <h4>Review / promotion history</h4>
          {loaded.history.map(row => <div className="ledgerRow" key={`${row.prop}::${row.value}`}>
            {/* Counts and a canonical mark show; the words, providers and datasets are revealed. */}
            <div><b>{row.prop}</b><div>{row.value}</div>
              <Reveal detail={`${row.canonical ? 'Canonical' : 'External only'} · ${row.support_count} support · ${row.conflict_count} conflict${row.latest_status ? ` · latest ${row.latest_status}` : ''}`}>
                <small><span aria-hidden="true">{row.canonical ? '◆' : '◇'} ✓ {row.support_count} ✕ {row.conflict_count}</span></small></Reveal></div>
            <div>{row.external_assessments.map(a => <div key={a.assessment_id}>
              <Reveal detail={`${a.status} · ${a.provider || 'external'}${a.dataset ? ` · ${a.dataset}` : ''}${a.promoted ? ' · promoted' : ''}`}><small>{a.status}{a.promoted ? ' ↑' : ''}</small></Reveal>
            </div>)}</div>
          </div>)}
        </div>}
      </div>}
    </CardContent>
  </Card>;
}

const CLAIM_SHAPE: Record<string, ClaimStatus> = {supported: 'supported', confirmed: 'supported', disputed: 'disputed', rejected: 'ruled_out'};
const word = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

function ConnectedTrace({trace}: {trace: ProvenanceTraceOut}): ReactElement {
  return <div className="candidate">
    {/* The counts are revealed on the section title; a link's stance is its line, a claim's status its chip, a
        relationship's family its line, each named on reveal; locators and notes are revealed on the quote. */}
    <h4><Reveal detail={`${trace.record_type} · ${trace.evidence_links.length} evidence link(s) · ${trace.claim_links.length} claim link(s) · ${trace.relationships.length} relationship(s) · ${trace.lead_links.length} lead link(s)`}>
      Connected investigative trace</Reveal></h4>
    {trace.evidence_links.map((x, i) => <div className="statement" key={`e-${x.link_id || i}`}>
      <div><StanceMark stance={x.stance}/>
        {x.evidence && <Reveal detail={[x.evidence.locator, x.note && `Reporter note: ${x.note}`].filter(Boolean).join(' · ') || 'No locator'}>
          <div>{x.evidence.quote || x.evidence.notes || 'Evidence record'}</div></Reveal>}
        {x.source && <small>{x.source.title}{x.source.url && <> · <a href={x.source.url} target="_blank" rel="noreferrer">source</a></>}</small>}
      </div>
    </div>)}
    {trace.claim_links.map(x => <div className="statement" key={x.link_id}>
      <div><StanceMark stance={x.stance}/>{x.claim && <div><StatusChip status={CLAIM_SHAPE[x.claim.status] ?? 'unshown'} label={word(x.claim.status)} focusable/> {x.claim.text}</div>}
        {x.note && <Reveal detail={`Reporter note: ${x.note}`}><small>note</small></Reveal>}</div>
    </div>)}
    {trace.relationships.map(r => <div className="statement" key={r.id}>
      <div><FamilyMark schema={r.schema}/> {r.source?.caption ?? '?'} → {r.target?.caption ?? '?'}</div>
    </div>)}
    {trace.lead_links.map(x => <div className="statement" key={x.link_id}>
      <div><b>Lead:</b> {x.lead.title} <small>· {x.lead.status}{x.lead.provider ? ` · ${x.lead.provider}` : ''}</small>
        {x.note && <div><small>Link note: {x.note}</small></div>}
      </div>
    </div>)}
  </div>;
}

function Lineage({lineage}: {lineage: ExtractionLineageOut}): ReactElement {
  const payload = lineage.candidate.payload as Record<string, unknown>;
  const shown = [payload.caption, payload.text, payload.quote].find(value => typeof value === 'string') as string | undefined;
  return <div className="candidate">
    <h4>Document extraction lineage</h4>
    {/* The fingerprint, the extraction's status and method, times and ids are revealed on the marks and names. */}
    {lineage.document && <div><b>Document:</b> <Reveal detail={lineage.document.extraction_status}>{lineage.document.filename}</Reveal>{' '}
      <Reveal label="SHA-256 fingerprint" detail={<span className="rv-mono">SHA-256: {lineage.document.sha256}</span>}><span aria-hidden="true">#</span></Reveal></div>}
    {lineage.chunk && <div><b>Exact chunk:</b> {lineage.chunk.locator}{lineage.chunk.page_number != null && <span> · page {lineage.chunk.page_number}</span>}{' '}
      {lineage.chunk.extraction_method === 'ocr' ? <Reveal detail="OCR-derived text: the words were read from a picture of the page."><small>OCR</small></Reveal>
        : <Reveal detail="native extraction"><small aria-hidden="true">✓</small></Reveal>}
      <div>{lineage.chunk.text}</div></div>}
    <div><b>Extraction proposal:</b> {lineage.candidate.candidate_type} · {Math.round(lineage.candidate.confidence * 100)}%
      <div>{shown || ''}</div></div>
    <div><b>Reporter review:</b> {lineage.candidate.reviewed_at ? <Reveal detail={timeWords(lineage.candidate.reviewed_at)}>{lineage.candidate.review_status}</Reveal> : lineage.candidate.review_status}
      {lineage.candidate.reviewer_note && <div><small>{lineage.candidate.reviewer_note}</small></div>}</div>
    {lineage.candidate.accepted_record_type && lineage.candidate.accepted_record_id && <div><b>Accepted record:</b> <Reveal detail={<span className="rv-mono">{lineage.candidate.accepted_record_id}</span>}>{lineage.candidate.accepted_record_type}</Reveal></div>}
  </div>;
}
