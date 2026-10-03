'use client';
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';
import {Suspense, useCallback, useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {useRouter, useSearchParams} from 'next/navigation';
import {errorMessage} from '../../../lib/api-client';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Checkbox} from '@/components/ui/checkbox';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {nestDocuments} from '../../../features/documents/document-tree';
import {getIngestionBatchOptions, listDocumentsOptions} from '../../../lib/generated/@tanstack/react-query.gen';
import {getDocument, retryJobEndpoint} from '../../../lib/generated/sdk.gen';
import type {DocumentDetailOut, DocumentOut, IngestionBatchDocumentOut} from '../../../lib/generated/types.gen';
import {stillReading} from '../../../features/documents/ingestion-batch';
import {QueryProvider} from '../../../lib/query-client';

// Batch triage table (design doc "Document Ingestion & Review System
// Design", Phase 1). Shown right after a bulk import, before the existing
// one-document-at-a-time review queue (../page.tsx): gives the reporter a
// single glance at every document in the batch -- what parsed cleanly, what
// didn't, and how many proposals each produced -- with a "problems only"
// filter, before committing to reviewing them one at a time. Purely a new
// frontend screen: every field it needs (extraction_status, extraction_error,
// extraction_issues, candidate_counts) is already returned by the existing
// GET /api/documents/{id} endpoint, so no backend change was needed.
// Files OpenAleph found inside an archive or attached to an email of the
// batch (ADR-0006, Wave A) are listed under it, from the investigation's
// document list, and the review walks them after their container.
//
// A bulk import is now one record (?batch=<id>, design doc Phase 2;
// GET /api/ingestion-batches/{id}): it brings every document to review with
// its live reading job, the files that were not imported and why (already in
// the investigation, or refused), and the review order. The page reads it
// again every few seconds while any file is still being read, and a read that
// failed can be retried here. The older ?docs=<ids> link still works.

type Row = Pick<DocumentOut, 'id' | 'filename' | 'extraction_status' | 'extraction_error' | 'extraction_issues' | 'candidate_counts'>;

/** The files found in the batch's documents, each after its container, at any depth. */
function withFilesInside(batch: DocumentDetailOut[], all: DocumentOut[]): {document: Row; depth: number; parent: Row | null}[] {
  const batchIds = new Set(batch.map(d => d.id));
  const inside = new Map<string, DocumentOut>();
  let grew = true;
  while (grew) {   // a file in an archive in an archive is in the batch too
    grew = false;
    for (const d of all) {
      const parentId = d.parent_document_id;
      if (parentId && !inside.has(d.id) && !batchIds.has(d.id) && (batchIds.has(parentId) || inside.has(parentId))) {
        inside.set(d.id, d);
        grew = true;
      }
    }
  }
  const rows: (Row & {parent_document_id?: string | null})[] = [...batch.map(d => ({...d, parent_document_id: null})), ...inside.values()];
  return nestDocuments(rows);
}

function hasIssues(d: Row): boolean {
  return Boolean(d.extraction_error) || Boolean(d.extraction_issues?.length);
}

function candidateTotal(d: Row): number {
  return Object.values(d.candidate_counts || {}).reduce((sum, n) => sum + n, 0);
}

// Reorders the full batch so `firstId` (the row the reporter chose to start
// from) leads the queue, preserving every other document's relative order --
// the one-document review page below still walks the *whole* batch via
// Next/Previous, it just starts wherever the reporter pointed at.
function reorderStartingAt(ids: string[], firstId: string): string[] {
  return [firstId, ...ids.filter(id => id !== firstId)];
}

const POLL_MS = 3000;

function BatchTriagePageInner(): ReactElement {
  const params = useSearchParams();
  const batchId = params.get('batch') || '';
  return batchId ? <BatchTriage batchId={batchId} invId={params.get('inv') || ''}/> : <DocsTriage/>;
}

function BatchTriage({batchId, invId}: {batchId: string, invId: string}): ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const batch = useQuery({...getIngestionBatchOptions({path: {batch_id: batchId}}),
    refetchInterval: query => stillReading(query.state.data) ? POLL_MS : false});

  if (batch.isPending) return <main className="p-6"><p className="muted">Loading batch…</p></main>;
  if (batch.isError) return <main className="p-6"><p className="muted">{errorMessage(batch.error, 'Could not load this batch')}</p></main>;
  const data = batch.data;
  const inv = invId || data.investigation_id;
  const startReviewAt = (id: string) =>
    router.push(`/review?inv=${encodeURIComponent(inv)}&batch=${encodeURIComponent(batchId)}&start=${encodeURIComponent(id)}`);
  const retry = async (d: IngestionBatchDocumentOut) => {
    if (!d.job) return;
    try {
      await retryJobEndpoint({path: {job_id: d.job.id}, throwOnError: true});
      setStatus(`Reading ${d.filename} again…`);
      await batch.refetch();
    } catch (error) {
      setStatus(errorMessage(error, 'Retry failed'));
    }
  };
  const notImported = data.items.filter(item => item.outcome !== 'saved');
  return <TriageTable title="Batch import triage" subtitle={data.label} rows={nestDocuments(data.documents)} status={status} reading={stillReading(data)}
    onReview={startReviewAt} onRetry={retry}
    notImported={notImported.map(item => ({key: String(item.position), filename: item.filename,
      reason: item.outcome === 'duplicate' ? `Already in this investigation as ${item.duplicate_of?.filename ?? 'an earlier document'}` : (item.error || 'Not imported')}))}/>;
}

function DocsTriage(): ReactElement {
  const params = useSearchParams();
  const router = useRouter();
  const invId = params.get('inv') || '';
  const docIds = useMemo(() => (params.get('docs') || '').split(',').map(s => s.trim()).filter(Boolean), [params]);

  const [docs, setDocs] = useState<DocumentDetailOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    if (docIds.length === 0) { setDocs([]); setLoading(false); return }
    setLoading(true); setStatus('');
    try {
      const rows = await Promise.all(docIds.map(async id => (await getDocument({path: {document_id: id}, throwOnError: true})).data));
      setDocs(rows);
    } catch (error) {
      setStatus(errorMessage(error, 'Could not load this batch'));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [docIds]);

  useEffect(() => { void load() }, [load]);
  // The investigation's documents, for the files found inside the batch's.
  const listed = useQuery({...listDocumentsOptions({path: {investigation_id: invId}}), enabled: Boolean(invId) && docIds.length > 0});

  const startReviewAt = (id: string) => {
    router.push(`/review?inv=${encodeURIComponent(invId)}&docs=${reorderStartingAt(reviewOrder, id).map(encodeURIComponent).join(',')}`);
  };

  if (loading) return <main className="p-6"><p className="muted">Loading batch…</p></main>;

  const nested = withFilesInside(docs || [], listed.data ?? []);
  const reviewOrder = nested.map(row => row.document.id);
  return <TriageTable title="Batch import triage" rows={nested} status={status} reading={false} onReview={startReviewAt}/>;
}

type Nested<T extends Row> = {document: T; depth: number; parent: Row | null};
type JobState = {job?: IngestionBatchDocumentOut['job']};

type TableProps<T extends Row & JobState> = {
  title: string;
  /** What the import holds (its label). */
  subtitle?: string;
  rows: Nested<T>[];
  status: string;
  /** Some files are still being read; the page refreshes until they are done. */
  reading: boolean;
  onReview: (id: string) => void;
  onRetry?: (document: T) => void;
  notImported?: {key: string, filename: string, reason: string}[];
};

function TriageTable<T extends Row & JobState>({title, subtitle, rows: nested, status, reading, onReview, onRetry, notImported = []}: TableProps<T>): ReactElement {
  const [problemsOnly, setProblemsOnly] = useState(false);
  const rows = nested.map(row => row.document);
  const filesInside = nested.filter(row => row.depth > 0).length;
  const failedRead = (d: T) => d.job?.status === 'failed';
  const problem = (d: T) => hasIssues(d) || failedRead(d);
  const flagged = rows.filter(problem);
  const visibleRows = problemsOnly ? nested.filter(row => problem(row.document)) : nested;
  const firstToReview = flagged[0]?.id || rows[0]?.id;

  return (
    <main className="p-6 space-y-4 max-w-4xl mx-auto" data-testid="batch-triage-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="muted text-sm">{subtitle}</p>}
        </div>
        <span className="text-sm muted" data-testid="triage-summary">
          {rows.length - filesInside} document(s) imported{filesInside > 0 ? ` · ${filesInside} file(s) found inside` : ''} · {flagged.length} with problems
          {notImported.length > 0 ? ` · ${notImported.length} not imported` : ''}
        </span>
      </div>

      {status && <p className="muted">{status}</p>}
      {reading && <p className="muted" role="status">Some files are still being read; this list updates by itself.</p>}

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
                {visibleRows.map(({document: d, depth, parent}) => {
                  const issues = problem(d);
                  return (
                    <TableRow key={d.id} data-testid={`triage-row-${d.id}`}>
                      <TableCell style={depth ? {paddingLeft: `${depth * 1.5}rem`} : undefined}>
                        {d.filename}
                        {parent && <div className="muted text-xs">Inside {parent.filename}</div>}
                      </TableCell>
                      <TableCell>
                        <span className={issues ? 'text-destructive' : ''}>{d.job && !d.job.finished ? (d.job.message || 'reading') : d.extraction_status}</span>
                      </TableCell>
                      <TableCell>
                        {issues ? (
                          <span className="text-destructive text-sm">
                            {failedRead(d) ? `Reading failed${d.job?.error ? `: ${d.job.error}` : ''}` : ''}
                            {!failedRead(d) && d.extraction_error ? '1 error' : ''}
                            {!failedRead(d) && d.extraction_error && d.extraction_issues?.length ? ' · ' : ''}
                            {!failedRead(d) && d.extraction_issues?.length ? `${d.extraction_issues.length} issue(s)` : ''}
                          </span>
                        ) : <span className="muted text-sm">none</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {candidateTotal(d) === 0 ? <span className="muted">none</span> :
                          Object.entries(d.candidate_counts || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </TableCell>
                      <TableCell className="space-x-1">
                        {failedRead(d) && onRetry ? <Button size="sm" variant="outline" onClick={() => onRetry(d)}>Retry</Button> : null}
                        <Button size="sm" onClick={() => onReview(d.id)}>Review</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {notImported.length > 0 && (
        <Card className="card">
          <CardHeader className="pb-3"><CardTitle>Not imported</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm" aria-label="Not imported">
              {notImported.map(item => <li key={item.key}><b>{item.filename}</b>: {item.reason}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Link href="/"><Button variant="outline">Back to workbench</Button></Link>
        {firstToReview && (
          <Button data-testid="start-review-button" onClick={() => onReview(firstToReview)}>
            {flagged.length > 0 ? 'Start review (problems first)' : 'Start review'}
          </Button>
        )}
      </div>
    </main>
  );
}

export default function BatchTriagePage(): ReactElement {
  return (
    <QueryProvider>
      <Suspense fallback={<main className="p-6"><p className="muted">Loading…</p></main>}>
        <BatchTriagePageInner />
      </Suspense>
    </QueryProvider>
  );
}
