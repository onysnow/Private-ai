'use client';
import type {ReactElement} from 'react';
import {Suspense, useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {api} from '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {isDocItem, isExtractionCandidate} from '../../lib/api-validate';
import type {DocItem, ExtractionCandidate} from '../../lib/api-types';
import {ExtractionExplanationView} from '../../components/extraction-explanation';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';

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
// confirming it is a single click, but nothing accepts silently.
const CLARIFY_CONFIDENCE_THRESHOLD = 0.5;

function needsClarification(c: ExtractionCandidate): boolean {
  return c.candidate_type === 'entity' && (c.confidence ?? 0) < CLARIFY_CONFIDENCE_THRESHOLD;
}

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

  const [docIds, setDocIds] = useState<string[] | null>(explicitDocs.length ? explicitDocs : null);
  const [resolvingQueue, setResolvingQueue] = useState(explicitDocs.length === 0);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<DocState | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [totals, setTotals] = useState({accepted: 0, rejected: 0});
  const [queueError, setQueueError] = useState('');

  // Fallback mode: no explicit ?docs= list (e.g. the reporter came here
  // directly from "Open review queue"). Find every document in this
  // investigation that still has at least one proposed candidate.
  useEffect(() => {
    if (docIds !== null || !invId) return;
    let cancelled = false;
    (async () => {
      setResolvingQueue(true);
      try {
        const docs = await api.array(`/api/investigations/${invId}/documents`, 'documents', isDocItem);
        const withPending = await Promise.all(docs.map(async d => {
          try {
            const proposed = await api.array(`/api/documents/${d.id}/candidates?status=proposed`, 'candidates', isExtractionCandidate);
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
  }, [docIds, invId]);

  const loadDoc = useCallback(async (id: string) => {
    setLoading(true); setAnswers({}); setStatus('');
    try {
      const [doc, candidates] = await Promise.all([
        api.object(`/api/documents/${id}`, 'document', isDocItem),
        api.array(`/api/documents/${id}/candidates?status=proposed&explain=true`, 'candidates', isExtractionCandidate),
      ]);
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

  const decide = async (candidate: ExtractionCandidate, decision: 'accept' | 'reject') => {
    if (!current) return;
    const body: {decision: 'accept' | 'reject', note: string, caption?: string, entity_schema?: string} = {
      decision, note: 'Reviewed in bulk-import review queue',
    };
    if (decision === 'accept' && candidate.candidate_type === 'entity') {
      body.caption = candidate.payload.caption;
      body.entity_schema = answers[candidate.id] || candidate.payload.suggested_schema || 'Thing';
    }
    try {
      await api.unknown(`/api/extraction-candidates/${candidate.id}/review`, {method: 'POST', body});
      setCurrent(cur => cur ? {
        ...cur,
        candidates: cur.candidates.filter(c => c.id !== candidate.id),
        accepted: cur.accepted + (decision === 'accept' ? 1 : 0),
        rejected: cur.rejected + (decision === 'reject' ? 1 : 0),
      } : cur);
      setTotals(t => ({accepted: t.accepted + (decision === 'accept' ? 1 : 0), rejected: t.rejected + (decision === 'reject' ? 1 : 0)}));
    } catch (error) {
      setStatus(errorMessage(error, 'Review action failed'));
    }
  };

  const goNext = () => setIndex(i => i + 1);
  const goPrev = () => setIndex(i => Math.max(0, i - 1));

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
    <main className="p-6 space-y-4 max-w-3xl mx-auto" data-testid="review-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Document review queue</h1>
        <span className="text-sm muted" data-testid="review-position">Document {index + 1} of {docIds.length}</span>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && current && (
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

            {current.candidates.map(c => {
              const clarify = needsClarification(c);
              const suggested = c.payload.suggested_schema || 'Person';
              const answered = answers[c.id];
              const acceptBlocked = clarify && !answered;
              return (
                <div className="candidate" key={c.id} data-testid={`candidate-${c.id}`}>
                  <b>{c.candidate_type} proposal</b> <small>· {typeof c.confidence === 'number' ? `${Math.round(c.confidence * 100)}% confidence` : ''}</small>
                  <div>{c.payload.caption || c.payload.text || c.payload.quote || ''}</div>
                  {c.payload.locator && <small>{c.payload.locator}</small>}
                  {c.explanation && <ExtractionExplanationView explanation={c.explanation} />}
                  {clarify && (
                    <div className="rounded border border-accent/40 bg-accent/10 p-2 text-sm" data-testid={`clarify-${c.id}`}>
                      <b>Clarifying question:</b> Is &quot;{c.payload.caption}&quot; a Person or an Organization?
                      <div className="flex gap-2 mt-1">
                        {(['Person', 'Organization'] as const).map(choice => (
                          <Button key={choice} size="sm" variant={answered === choice ? 'default' : 'outline'}
                            onClick={() => setAnswers(a => ({...a, [c.id]: choice}))}>
                            {choice}{choice === suggested ? ' (suggested)' : ''}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    <Button size="sm" onClick={() => decide(c, 'accept')} disabled={acceptBlocked}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(c, 'reject')}>Reject</Button>
                  </div>
                </div>
              );
            })}

            {status && <p className="muted">{status}</p>}
          </CardContent>
        </Card>
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
  return (
    <Suspense fallback={<main className="p-6"><p className="muted">Loading…</p></main>}>
      <ReviewPageInner />
    </Suspense>
  );
}
