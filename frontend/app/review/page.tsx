'use client';
import type {ReactElement} from 'react';
import {Suspense, useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {errorMessage} from '../../lib/api-client';
import {isDocItem, isExtractionCandidate} from '../../lib/api-validate';
import type {DocItem, DocumentChunk, ExtractionCandidate} from '../../lib/api-types';
import {ExtractionExplanationView} from '../../components/extraction-explanation';
import {confidenceBand, confidenceLabel} from '../../features/documents/confidence';
import type {ConfidenceBand} from '../../features/documents/confidence';
import {EntityIdentity, identityFields} from '../../features/documents/entity-identity';
import {IdentifierOwner} from '../../features/documents/identifier-owner';
import {reviewKey} from '../../features/documents/review-keys';
import {reviewOrderFrom} from '../../features/documents/ingestion-batch';
import {getDocument, getIngestionBatch, listDocumentCandidatesEndpoint, listDocuments, reviewExtractionCandidate} from '../../lib/generated/sdk.gen';
import {narrowed, narrowedList} from '../../lib/narrow';
import {SchemaQuestion, needsSchemaAnswer} from '../../features/documents/schema-question';
import {QueryProvider} from '../../lib/query-client';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';

// Split-pane source highlighting (design doc Phase 1). Every extraction
// candidate already carries chunk_id + payload.span (exact character
// offsets into that chunk's text) from the backend -- confirmed by direct
// API inspection, not assumed -- so no backend change was needed here.
// Only ONE candidate's span is ever highlighted at a time: an evidence
// candidate's span can cover an entire chunk while an entity candidate's
// span covers a few words inside the same chunk, so highlighting every
// candidate in a chunk at once would just paint overlapping blocks.
// Hovering or focusing a candidate card is what selects which one lights up.
function renderChunkBody(chunk: DocumentChunk, active: {chunk_id?: string, payload: {span?: {start_char: number, end_char: number}}} | null): ReactElement {
  const span = active && active.chunk_id === chunk.id ? active.payload.span : undefined;
  if (!span || typeof span.start_char !== 'number' || typeof span.end_char !== 'number' || span.start_char < 0 || span.end_char > chunk.text.length || span.start_char >= span.end_char) {
    return <>{chunk.text}</>;
  }
  return (
    <>
      {chunk.text.slice(0, span.start_char)}
      <mark className="bg-accent/60 rounded px-0.5" data-testid="source-highlight">{chunk.text.slice(span.start_char, span.end_char)}</mark>
      {chunk.text.slice(span.end_char)}
    </>
  );
}

// One-document-at-a-time review queue for bulk-imported (or any pending)
// documents. Feature request (2026-09-30): after a bulk import, the reporter
// wants to sit through every document's recommended entries, parse issues,
// and ambiguous calls one document at a time, with full context, before
// anything is accepted into the database. This page is additive -- it does
// not replace the inline "Review proposals" flow already on the workbench
// page, which still works the same way it always has.
//
// Clarifying questions are rule-based only (no AI provider call): today the
// local rule-based entity extractor always proposes a schema guess (Person
// vs Organization) at a flat, genuinely uncertain confidence. Below that
// threshold, Accept is gated on the reporter explicitly confirming or
// overriding the guess -- the suggested answer is pre-highlighted so
// confirming it is a single click, but nothing accepts silently. A name
// OpenAleph found without saying what it is asks the same question, with
// nothing suggested (features/documents/schema-question.tsx, ADR-0006).
// An email or phone proposal asks whose it is (identifier-owner.tsx).

const REVIEW_NOTE = 'Reviewed in bulk-import review queue';

// Low waits for an answer (red); medium is proposed but marked (brass).
const BAND_CLASS: Record<ConfidenceBand, string> = {high: '', medium: 'text-primary', low: 'text-destructive'};

type DocState = {
  doc: DocItem;
  candidates: ExtractionCandidate[];
  accepted: number;
  rejected: number;
};

function ReviewPageInner(): ReactElement {
  const params = useSearchParams();
  const invId = params.get('inv') || '';
  const explicitDocs = (params.get('docs') || '').split(',').map(s => s.trim()).filter(Boolean);
  // A bulk import (design doc Phase 2): its own review order, from the document the reporter chose.
  const batchId = params.get('batch') || '';
  const start = params.get('start');

  const [docIds, setDocIds] = useState<string[] | null>(explicitDocs.length ? explicitDocs : null);
  const [resolvingQueue, setResolvingQueue] = useState(explicitDocs.length === 0);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<DocState | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [totals, setTotals] = useState({accepted: 0, rejected: 0});
  const [queueError, setQueueError] = useState('');
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Fallback mode: no explicit ?docs= list (e.g. the reporter came here
  // directly from "Open review queue"). Find every document in this
  // investigation that still has at least one proposed candidate.
  useEffect(() => {
    if (!batchId || docIds !== null) return;
    let cancelled = false;
    (async () => {
      setResolvingQueue(true);
      try {
        const batch = (await getIngestionBatch({path: {batch_id: batchId}, throwOnError: true})).data;
        if (!cancelled) setDocIds(reviewOrderFrom(batch.review_order, start));
      } catch (error) {
        if (!cancelled) setQueueError(errorMessage(error, 'Could not load this import'));
      } finally {
        if (!cancelled) setResolvingQueue(false);
      }
    })();
    return () => { cancelled = true };
  }, [batchId, docIds, start]);

  useEffect(() => {
    if (docIds !== null || !invId || batchId) return;
    let cancelled = false;
    (async () => {
      setResolvingQueue(true);
      try {
        const docs = (await listDocuments({path: {investigation_id: invId}, throwOnError: true})).data;
        const withPending = await Promise.all(docs.map(async d => {
          try {
            const proposed = (await listDocumentCandidatesEndpoint({path: {document_id: d.id}, query: {status: 'proposed'}, throwOnError: true})).data;
            return proposed.length > 0 ? d.id : null;
          } catch { return null }
        }));
        if (!cancelled) setDocIds(withPending.filter((x): x is string => x !== null));
      } catch (error) {
        if (!cancelled) setQueueError(errorMessage(error, 'Could not load this investigation\'s documents'));
      } finally {
        if (!cancelled) setResolvingQueue(false);
      }
    })();
    return () => { cancelled = true };
  }, [batchId, docIds, invId]);

  const loadDoc = useCallback(async (id: string) => {
    setLoading(true); setAnswers({}); setStatus(''); setActiveCandidateId(null);
    try {
      const [detail, proposed] = await Promise.all([
        getDocument({path: {document_id: id}, throwOnError: true}),
        listDocumentCandidatesEndpoint({path: {document_id: id}, query: {status: 'proposed', explain: true}, throwOnError: true}),
      ]);
      const doc = narrowed(detail.data, isDocItem, '/api/documents/{document_id}', 'document');
      const candidates = narrowedList(proposed.data, isExtractionCandidate, '/api/documents/{document_id}/candidates', 'candidates');
      setCurrent({doc, candidates, accepted: 0, rejected: 0});
    } catch (error) {
      setStatus(errorMessage(error, 'Could not load this document'));
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (docIds && docIds.length > 0 && index < docIds.length) void loadDoc(docIds[index]);
  }, [docIds, index, loadDoc]);

  // A decision the server has recorded: the proposal leaves the queue and
  // the session's counts move.
  const recorded = (candidateId: string, decision: 'accept' | 'reject') => {
    setCurrent(cur => cur ? {
      ...cur,
      candidates: cur.candidates.filter(c => c.id !== candidateId),
      accepted: cur.accepted + (decision === 'accept' ? 1 : 0),
      rejected: cur.rejected + (decision === 'reject' ? 1 : 0),
    } : cur);
    setTotals(t => ({accepted: t.accepted + (decision === 'accept' ? 1 : 0), rejected: t.rejected + (decision === 'reject' ? 1 : 0)}));
  };

  const decide = async (candidate: ExtractionCandidate, decision: 'accept' | 'reject', identity: ReturnType<typeof identityFields> = {}) => {
    if (!current) return;
    const body: {decision: 'accept' | 'reject', note: string, caption?: string, entity_schema?: string} & ReturnType<typeof identityFields> = {
      decision, note: REVIEW_NOTE,
    };
    if (decision === 'accept' && candidate.candidate_type === 'entity') {
      body.caption = candidate.payload.caption;
      body.entity_schema = answers[candidate.id] || candidate.payload.suggested_schema || 'Thing';
      Object.assign(body, identity);
    }
    try {
      await reviewExtractionCandidate({path: {candidate_id: candidate.id}, body, throwOnError: true});
      recorded(candidate.id, decision);
    } catch (error) {
      setStatus(errorMessage(error, 'Review action failed'));
    }
  };

  const goNext = () => setIndex(i => i + 1);
  const goPrev = () => setIndex(i => Math.max(0, i - 1));

  const activeCandidate = activeCandidateId ? current?.candidates.find(c => c.id === activeCandidateId) || null : null;

  // Scroll the chunk holding the focused/hovered candidate's source span into
  // view in the left pane, so a long document doesn't leave the reporter
  // hunting for which paragraph a proposal came from.
  useEffect(() => {
    if (!activeCandidate?.chunk_id) return;
    chunkRefs.current[activeCandidate.chunk_id]?.scrollIntoView({block: 'nearest'});
  }, [activeCandidate]);

  if (resolvingQueue) return <main className="p-6"><p className="muted">Finding documents with unreviewed proposals…</p></main>;
  if (queueError) return <main className="p-6"><p className="muted">{queueError}</p></main>;
  if (!docIds || docIds.length === 0) {
    return (
      <main className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Document review queue</h1>
        <p className="muted">Nothing here needs review right now -- every document in this investigation has been fully reviewed, or none were imported yet.</p>
        <Link href="/"><Button variant="outline">Back to workbench</Button></Link>
      </main>
    );
  }

  const done = index >= docIds.length;
  if (done) {
    return (
      <main className="p-6 space-y-4" data-testid="review-summary">
        <h1 className="text-xl font-semibold">Batch reviewed</h1>
        <p>{docIds.length} document(s) reviewed this session -- {totals.accepted} entry/entries accepted, {totals.rejected} rejected.</p>
        <Link href="/"><Button>Back to workbench</Button></Link>
      </main>
    );
  }

  const hasIssues = Boolean(current?.doc.extraction_error) || Boolean(current?.doc.extraction_issues?.length);

  return (
    <main className="p-6 space-y-4 max-w-5xl mx-auto" data-testid="review-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Document review queue</h1>
        <span className="text-sm muted" data-testid="review-position">Document {index + 1} of {docIds.length}</span>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && current && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="card lg:sticky lg:top-4 lg:max-h-[80vh] lg:overflow-y-auto" data-testid="source-pane">
          <CardHeader className="pb-3">
            <CardTitle>Source text</CardTitle>
            <CardDescription>
              {activeCandidate ? 'Highlighted span matches the proposal you are focused on.' : 'Hover or focus a proposal on the right to see its exact source span here.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(current.doc.chunks || []).length === 0 && <p className="muted">No extracted source text is available for this document.</p>}
            {(current.doc.chunks || []).map(chunk => (
              <div
                key={chunk.id}
                ref={el => { chunkRefs.current[chunk.id] = el }}
                data-testid={`chunk-${chunk.id}`}
                className={`rounded border p-2 whitespace-pre-wrap ${activeCandidate?.chunk_id === chunk.id ? 'border-accent' : 'border-transparent'}`}
              >
                <div className="text-xs muted mb-1">{chunk.locator}</div>
                {renderChunkBody(chunk, activeCandidate)}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card">
          <CardHeader className="pb-3">
            <CardTitle>{current.doc.filename}</CardTitle>
            <CardDescription>{current.doc.extraction_status} · {current.doc.chunk_count} chunk(s) · {current.accepted} accepted · {current.rejected} rejected this session</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasIssues && (
              <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="issue-banner">
                <b>Could not fully parse this document:</b>
                <ul className="list-disc pl-5">
                  {current.doc.extraction_error && <li>{current.doc.extraction_error}</li>}
                  {(current.doc.extraction_issues || []).map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            )}

            {current.candidates.length === 0 && !hasIssues && <p className="muted">Nothing left to review in this document.</p>}
            {current.candidates.length === 0 && hasIssues && <p className="muted">No proposals were generated from what could be parsed.</p>}

            {current.candidates.length > 0 && <p className="muted text-xs" data-testid="review-keys">
              Keys: ↑ ↓ (or J K) move between proposals · A accepts · R rejects</p>}
            {current.candidates.map(c => {
              const clarify = needsSchemaAnswer(c);
              const answered = answers[c.id];
              const acceptBlocked = clarify && !answered;
              const identifier = c.candidate_type === 'identifier';
              const isActive = activeCandidateId === c.id;
              return (
                <div
                  className={`candidate ${isActive ? 'ring-1 ring-accent' : ''}`}
                  key={c.id}
                  data-testid={`candidate-${c.id}`}
                  data-candidate
                  tabIndex={0}
                  role="group"
                  aria-label={`${c.candidate_type} proposal: ${c.payload.caption || c.payload.text || c.payload.quote || ''}`.slice(0, 120)}
                  onMouseEnter={() => setActiveCandidateId(c.id)}
                  onMouseLeave={() => setActiveCandidateId(cur => (cur === c.id ? null : cur))}
                  onKeyDown={reviewKey}
                  onFocus={() => setActiveCandidateId(c.id)}
                  onBlur={() => setActiveCandidateId(cur => (cur === c.id ? null : cur))}
                >
                  <b>{c.candidate_type} proposal</b> <small data-band={confidenceBand(c.confidence) ?? undefined}
                    className={BAND_CLASS[confidenceBand(c.confidence) ?? 'high']}>· {confidenceLabel(c.confidence)}</small>
                  <div>{c.payload.caption || c.payload.text || c.payload.quote || ''}</div>
                  {c.payload.locator && <small>{c.payload.locator}</small>}
                  {c.explanation && <ExtractionExplanationView explanation={c.explanation} />}
                  {clarify && <SchemaQuestion candidate={c} answer={answered} onAnswer={choice => setAnswers(a => ({...a, [c.id]: choice}))}/>}
                  {identifier
                    ? <IdentifierOwner candidateId={c.id} kind={String(c.payload.kind || 'email')} note={REVIEW_NOTE}
                        onReviewed={decision => recorded(c.id, decision)}
                        onEntityAccepted={entityCandidateId => recorded(entityCandidateId, 'accept')}/>
                    : c.candidate_type === 'entity'
                    ? <EntityIdentity candidateId={c.id} caption={String(c.payload.caption || '')} schemaBlocked={acceptBlocked}
                        onAccept={identity => decide(c, 'accept', identity)} onReject={() => decide(c, 'reject')}/>
                    : <div className="flex gap-2 mt-1">
                      <Button size="sm" data-action="accept" onClick={() => decide(c, 'accept')} disabled={acceptBlocked}>Accept</Button>
                      <Button size="sm" data-action="reject" variant="outline" onClick={() => decide(c, 'reject')}>Reject</Button>
                    </div>}
                </div>
              );
            })}

            {status && <p className="muted">{status}</p>}
          </CardContent>
        </Card>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={goPrev} disabled={index === 0}>Previous</Button>
        <Link href="/"><Button variant="outline">Exit to workbench</Button></Link>
        <Button onClick={goNext}>{index === docIds.length - 1 ? 'Finish' : 'Next document'}</Button>
      </div>
    </main>
  );
}

export default function ReviewPage(): ReactElement {
  // The email/phone owner choice and a name's possible matches read through TanStack Query.
  return (
    <QueryProvider>
      <Suspense fallback={<main className="p-6"><p className="muted">Loading…</p></main>}>
        <ReviewPageInner />
      </Suspense>
    </QueryProvider>
  );
}
