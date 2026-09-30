'use client';
import type {ReactElement} from 'react';
import {Suspense, useCallback, useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {useRouter, useSearchParams} from 'next/navigation';
import {api} from '../../../lib/api-instance';
import {errorMessage} from '../../../lib/api-client';
import {isDocItem} from '../../../lib/api-validate';
import type {DocItem} from '../../../lib/api-types';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Checkbox} from '@/components/ui/checkbox';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';

// Batch triage table (design doc "Document Ingestion & Review System
// Design", Phase 1). Shown right after a bulk import, before the existing
// one-document-at-a-time review queue (../page.tsx): gives the reporter a
// single glance at every document in the batch -- what parsed cleanly, what
// didn't, and how many proposals each produced -- with a "problems only"
// filter, before committing to reviewing them one at a time. Purely a new
// frontend screen: every field it needs (extraction_status, extraction_error,
// extraction_issues, candidate_counts) is already returned by the existing
// GET /api/documents/{id} endpoint, so no backend change was needed.

function hasIssues(d: DocItem): boolean {
  return Boolean(d.extraction_error) || Boolean(d.extraction_issues?.length);
}

function candidateTotal(d: DocItem): number {
  return Object.values(d.candidate_counts || {}).reduce((sum, n) => sum + n, 0);
}

// Reorders the full batch so `firstId` (the row the reporter chose to start
// from) leads the queue, preserving every other document's relative order --
// the one-document review page below still walks the *whole* batch via
// Next/Previous, it just starts wherever the reporter pointed at.
function reorderStartingAt(ids: string[], firstId: string): string[] {
  return [firstId, ...ids.filter(id => id !== firstId)];
}

function BatchTriagePageInner(): ReactElement {
  const params = useSearchParams();
  const router = useRouter();
  const invId = params.get('inv') || '';
  const docIds = useMemo(() => (params.get('docs') || '').split(',').map(s => s.trim()).filter(Boolean), [params]);

  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);

  const load = useCallback(async () => {
    if (docIds.length === 0) { setDocs([]); setLoading(false); return }
    setLoading(true); setStatus('');
    try {
      const rows = await Promise.all(docIds.map(id => api.object(`/api/documents/${id}`, 'document', isDocItem)));
      setDocs(rows);
    } catch (error) {
      setStatus(errorMessage(error, 'Could not load this batch'));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [docIds]);

  useEffect(() => { void load() }, [load]);

  const startReviewAt = (id: string) => {
    router.push(`/review?inv=${encodeURIComponent(invId)}&docs=${reorderStartingAt(docIds, id).map(encodeURIComponent).join(',')}`);
  };

  if (loading) return <main className="p-6"><p className="muted">Loading batch…</p></main>;

  const rows = docs || [];
  const flagged = rows.filter(hasIssues);
  const visibleRows = problemsOnly ? flagged : rows;
  const firstToReview = flagged[0]?.id || rows[0]?.id;

  return (
    <main className="p-6 space-y-4 max-w-4xl mx-auto" data-testid="batch-triage-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Batch import triage</h1>
        <span className="text-sm muted" data-testid="triage-summary">
          {rows.length} document(s) imported · {flagged.length} with problems
        </span>
      </div>

      {status && <p className="muted">{status}</p>}

      {rows.length === 0 && !status && (
        <Card className="card"><CardContent className="pt-4"><p className="muted">Nothing was imported in this batch.</p></CardContent></Card>
      )}

      {rows.length > 0 && (
        <Card className="card">
          <CardHeader className="pb-3">
            <CardTitle>Documents in this batch</CardTitle>
            <CardDescription>Review every document one at a time with full context, or jump straight to the ones that need attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="problems-only" checked={problemsOnly} onCheckedChange={v => setProblemsOnly(v === true)} data-testid="problems-only-toggle" />
              <label htmlFor="problems-only" className="text-sm cursor-pointer">Show only rows with problems</label>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Candidates</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="muted">No rows with problems -- every document in this batch parsed cleanly.</TableCell></TableRow>
                )}
                {visibleRows.map(d => {
                  const issues = hasIssues(d);
                  return (
                    <TableRow key={d.id} data-testid={`triage-row-${d.id}`}>
                      <TableCell>{d.filename}</TableCell>
                      <TableCell>
                        <span className={issues ? 'text-destructive' : ''}>{d.extraction_status}</span>
                      </TableCell>
                      <TableCell>
                        {issues ? (
                          <span className="text-destructive text-sm">
                            {d.extraction_error ? '1 error' : ''}
                            {d.extraction_error && d.extraction_issues?.length ? ' · ' : ''}
                            {d.extraction_issues?.length ? `${d.extraction_issues.length} issue(s)` : ''}
                          </span>
                        ) : <span className="muted text-sm">none</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {candidateTotal(d) === 0 ? <span className="muted">none</span> :
                          Object.entries(d.candidate_counts || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => startReviewAt(d.id)}>Review</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Link href="/"><Button variant="outline">Back to workbench</Button></Link>
        {firstToReview && (
          <Button data-testid="start-review-button" onClick={() => startReviewAt(firstToReview)}>
            {flagged.length > 0 ? 'Start review (problems first)' : 'Start review'}
          </Button>
        )}
      </div>
    </main>
  );
}

export default function BatchTriagePage(): ReactElement {
  return (
    <Suspense fallback={<main className="p-6"><p className="muted">Loading…</p></main>}>
      <BatchTriagePageInner />
    </Suspense>
  );
}
