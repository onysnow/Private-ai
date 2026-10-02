'use client';
// Document ingestion & extraction: upload a document (the API saves it and
// reads it as a background job, ADR-0004), import a batch, review each
// extraction proposal with the reasoning behind it, and stage a relationship
// from a reviewed claim. Moved out of app/page.tsx (Foundation Fixes fix 3);
// the calls and their reply checks are generated from the API schema (fix 2).
// The upload itself sends a file, so it uses the app's own client with the
// generated Zod schema for the reply (checkedReply in lib/api-generated.ts).
import {useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {ExtractionExplanationView} from '../../components/extraction-explanation';
import {errorMessage, isAbortError} from '../../lib/api-client';
import {checkedReply} from '../../lib/api-generated';
import {api} from '../../lib/api-instance';
import {
  getInvestigationGraphQueryKey, listClaimsQueryKey, listDocumentsOptions, listDocumentsQueryKey, listEntitiesOptions, listEntitiesQueryKey,
  listInvestigationEvidenceQueryKey, listSourcesQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {
  analyzeOpenalephDocument, createExtractedRelationshipProposal, getDocument, getOpenalephDocumentReviewStatus, listDocumentCandidatesEndpoint,
  listJobsEndpoint, refreshOpenalephDocumentReview, retryJobEndpoint, reviewExtractionCandidate, syncOpenalephDocument,
} from '../../lib/generated/sdk.gen';
import type {
  DocumentOut, DocumentUploadOut, ExtractionCandidateOut, ExtractionCandidateReviewRequest, OpenAlephReviewStatusOut,
} from '../../lib/generated/types.gen';
import {zDocumentUploadOut} from '../../lib/generated/zod.gen';
import type {BackgroundJob} from '../../lib/api-types';
import {describeJob, waitForJob} from '../../lib/jobs';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {IdentifierOwner} from './identifier-owner';
import {SchemaQuestion} from './schema-question';

type Props = {investigationId: string};

const ACCEPTED_FILES = '.pdf,.docx,.txt,.md,.csv,.html,.htm';
const REVIEW_NOTE = 'Reviewed in Next.js workbench';

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** What a proposal says, for its heading and its trace. */
function shownText(c: ExtractionCandidateOut): string | undefined {
  return text(c.payload.caption) || text(c.payload.text) || text(c.payload.quote);
}

function uploadForm(investigationId: string, title: string, file: File): FormData {
  const fd = new FormData();
  fd.append('investigation_id', investigationId);
  fd.append('title', title);
  fd.append('file', file);
  return fd;
}

const upload = (investigationId: string, title: string, file: File): Promise<DocumentUploadOut> =>
  api.parsed('/api/documents/upload', checkedReply(zDocumentUploadOut), {method: 'POST', rawBody: uploadForm(investigationId, title, file)});

export function DocumentsPanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const router = useRouter();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docStatus, setDocStatus] = useState('');
  const [candidates, setCandidates] = useState<ExtractionCandidateOut[]>([]);
  // What kind of entity a name is, for proposals that ask (schema-question.tsx).
  const [schemaAnswers, setSchemaAnswers] = useState<Record<string, string>>({});
  const [openAleph, setOpenAleph] = useState<Record<string, OpenAlephReviewStatusOut>>({});
  const [relationshipClaimCandidate, setRelationshipClaimCandidate] = useState<ExtractionCandidateOut | null>(null);
  const [relSchema, setRelSchema] = useState('Directorship');
  const [relSource, setRelSource] = useState('');
  const [relTarget, setRelTarget] = useState('');
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{done: number, total: number, currentName: string} | null>(null);
  const [bulkStatus, setBulkStatus] = useState('');

  // Proposals belong to the case they were loaded for: a late reply for
  // another case is dropped, and a new case starts with none.
  const activeInvestigation = useRef(investigationId);
  const candidatesRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    activeInvestigation.current = investigationId;
    candidatesRequest.current?.abort();
    setCandidates([]);
    setOpenAleph({});
  }, [investigationId]);

  const path = {investigation_id: investigationId};
  const documentsQuery = useQuery({...listDocumentsOptions({path}), enabled: Boolean(investigationId)});
  // The canonical entities a staged relationship can join, from the shared cache.
  const entitiesQuery = useQuery({...listEntitiesOptions({path}), enabled: Boolean(investigationId)});
  const entities = entitiesQuery.data ?? [];
  const documents: DocumentOut[] = documentsQuery.data ?? [];
  const reloadDocuments = () => queryClient.invalidateQueries({queryKey: listDocumentsQueryKey({path})});

  const loadCandidates = async (documentId: string, status: 'proposed' | 'all' = 'proposed') => {
    candidatesRequest.current?.abort();
    const controller = new AbortController();
    candidatesRequest.current = controller;
    const forInvestigation = investigationId;
    const query = status === 'all' ? {explain: true} : {status: 'proposed', explain: true};
    try {
      const rows = (await listDocumentCandidatesEndpoint({path: {document_id: documentId}, query, signal: controller.signal, throwOnError: true})).data;
      if (!controller.signal.aborted && activeInvestigation.current === forInvestigation) {
        setCandidates(rows);
        setDocStatus(status === 'all' ? `Loaded ${rows.length} extraction proposal/review record(s).` : '');
      }
    } catch (error) {
      if (!isAbortError(error)) setDocStatus(errorMessage(error, 'Could not load extraction proposals'));
    }
  };

  // The API saves the file and reads it as a background job (ADR-0004). In the
  // product the upload answers before the read is done, so follow the job;
  // in developer mode the answer already carries the finished job.
  const uploadDocument = async () => {
    if (!investigationId || !docFile) return;
    try {
      const uploaded = await upload(investigationId, docTitle, docFile);
      setDocFile(null);
      setDocTitle('');
      let saved: DocumentOut = uploaded;
      let job: BackgroundJob | null = uploaded.job || null;
      if (job && !job.finished) {
        setDocStatus('Saved. Reading the document…');
        await reloadDocuments();
        job = await waitForJob(api, job.id, j => setDocStatus(`Saved. Reading the document: ${describeJob(j)}`));
        saved = (await getDocument({path: {document_id: saved.id}, throwOnError: true})).data;
      }
      await reloadDocuments();
      if (job && job.status !== 'succeeded') {
        setDocStatus(`Saved, but reading it stopped: ${describeJob(job)}. Use “Retry reading” on the document.`);
        return;
      }
      const note = job && job.message && job.message !== 'Document read' ? ` ${job.message}.` : '';
      setDocStatus(`Extracted ${saved.chunk_count} chunk(s).${note} Review proposals before canonicalizing.`);
      await loadCandidates(saved.id);
    } catch (error) {
      setDocStatus(errorMessage(error, 'Document upload failed'));
    }
  };

  const retryDocumentRead = async (d: DocumentOut) => {
    if (!investigationId) return;
    try {
      const jobs = (await listJobsEndpoint({query: {subject_id: d.id}, throwOnError: true})).data;
      let job: BackgroundJob | undefined = jobs[0];
      if (!job) {
        setDocStatus(`${d.filename}: no reading job found.`);
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') job = (await retryJobEndpoint({path: {job_id: job.id}, throwOnError: true})).data;
      if (!job.finished) job = await waitForJob(api, job.id, j => setDocStatus(`${d.filename}: ${describeJob(j)}`));
      setDocStatus(`${d.filename}: ${describeJob(job)}`);
      await reloadDocuments();
    } catch (error) {
      setDocStatus(errorMessage(error, 'Retry failed'));
    }
  };

  // Bulk import: uploads each selected file one at a time against the same
  // /api/documents/upload endpoint the single-file flow uses (title defaults
  // to the filename), so the reporter can watch real per-file progress rather
  // than firing everything at once. One bad file does not abort the batch --
  // its failure is recorded and the batch continues. Ends by handing the
  // whole batch's document ids to the batch triage table (Phase 1), which
  // shows a one-glance summary of every document before the reporter steps
  // into the one-document-at-a-time review page for any of them.
  const uploadBulk = async () => {
    if (!investigationId || bulkFiles.length === 0) return;
    setBulkImporting(true);
    setBulkStatus('');
    const ids: string[] = [];
    const failed: string[] = [];
    const reading: {name: string, jobId: string}[] = [];
    for (let i = 0; i < bulkFiles.length; i++) {
      const file = bulkFiles[i];
      setBulkProgress({done: i, total: bulkFiles.length, currentName: file.name});
      try {
        const d = await upload(investigationId, file.name.replace(/\.[^./]+$/, ''), file);
        ids.push(d.id);
        if (d.job && !d.job.finished) reading.push({name: file.name, jobId: d.job.id});
      } catch (error) {
        failed.push(`${file.name}: ${errorMessage(error, 'upload failed')}`);
      }
    }
    // Uploads answer once each file is saved; wait for the reads before triage.
    if (reading.length) {
      setBulkProgress(null);
      let done = 0;
      setBulkStatus(`Saved ${ids.length} file(s). Reading them: 0 of ${reading.length} finished…`);
      await Promise.all(reading.map(async r => {
        try {
          const job = await waitForJob(api, r.jobId, undefined, {intervalMs: 1500});
          if (job.status !== 'succeeded') failed.push(`${r.name}: ${describeJob(job)}`);
        } catch (error) {
          failed.push(`${r.name}: ${errorMessage(error, 'reading failed')}`);
        }
        done += 1;
        setBulkStatus(`Saved ${ids.length} file(s). Reading them: ${done} of ${reading.length} finished…`);
      }));
    }
    setBulkProgress({done: bulkFiles.length, total: bulkFiles.length, currentName: ''});
    setBulkImporting(false);
    setBulkFiles([]);
    await reloadDocuments();
    if (ids.length === 0) {
      setBulkStatus(`All ${failed.length} file(s) failed to import. ${failed.join(' · ')}`);
      return;
    }
    setBulkStatus(failed.length
      ? `Imported ${ids.length} of ${ids.length + failed.length} file(s). ${failed.length} failed and were skipped: ${failed.join(' · ')}`
      : `Imported ${ids.length} file(s). Opening batch triage...`);
    router.push(`/review/batch?inv=${encodeURIComponent(investigationId)}&docs=${ids.map(encodeURIComponent).join(',')}`);
  };

  const stageRelationship = async () => {
    const c = relationshipClaimCandidate;
    if (!c?.accepted_record_id || !relSource || !relTarget) return;
    if (relSource === relTarget) {
      setDocStatus('Relationship endpoints must be different canonical entities.');
      return;
    }
    try {
      const row = (await createExtractedRelationshipProposal({path: {claim_id: c.accepted_record_id}, body: {
        schema: relSchema, source_entity_id: relSource, target_entity_id: relTarget,
        note: 'Reporter staged from reviewed document claim in Next.js workbench',
      }, throwOnError: true})).data;
      setCandidates(cur => [...cur, row]);
      setRelationshipClaimCandidate(null);
      setRelSource('');
      setRelTarget('');
      setDocStatus('Relationship staged as a proposal. It is not canonical until separately accepted.');
    } catch (error) {
      setDocStatus(errorMessage(error, 'Could not stage relationship proposal'));
    }
  };

  // A decision the server has recorded. An accepted proposal may have made an
  // entity, a claim, evidence (with its source), a relationship or a
  // statement on an entity: every list that could show it is stale.
  const reviewed = async (c: Pick<ExtractionCandidateOut, 'id' | 'candidate_type'>, decision: 'accept' | 'reject') => {
    setCandidates(cur => cur.filter(x => x.id !== c.id));
    await Promise.all([
      reloadDocuments(),
      queryClient.invalidateQueries({queryKey: listClaimsQueryKey({path})}),
      queryClient.invalidateQueries({queryKey: listInvestigationEvidenceQueryKey({path})}),
      queryClient.invalidateQueries({queryKey: listSourcesQueryKey({path})}),
      queryClient.invalidateQueries({queryKey: listEntitiesQueryKey({path})}),
      queryClient.invalidateQueries({queryKey: getInvestigationGraphQueryKey({path})}),
    ]);
    setDocStatus(`${c.candidate_type} proposal ${decision === 'accept' ? 'accepted' : 'rejected'}. Its document/chunk/review lineage is retained for provenance tracing.`);
  };

  const reviewCandidate = async (c: ExtractionCandidateOut, decision: 'accept' | 'reject') => {
    const body: ExtractionCandidateReviewRequest = {decision, note: REVIEW_NOTE};
    if (decision === 'accept' && c.candidate_type === 'entity') {
      body.caption = text(c.payload.caption);
      body.entity_schema = schemaAnswers[c.id] || text(c.payload.suggested_schema) || 'Thing';
    }
    try {
      await reviewExtractionCandidate({path: {candidate_id: c.id}, body, throwOnError: true});
      await reviewed(c, decision);
    } catch (error) {
      setDocStatus(errorMessage(error, 'Extraction review failed'));
    }
  };

  // "Find names again" (ADR-0006): OpenAleph analyses the document again in
  // a background job, and what it finds joins the document's proposals.
  const findNamesAgain = async (d: DocumentOut) => {
    setDocStatus(`${d.filename}: asking OpenAleph to find names again…`);
    try {
      let job: BackgroundJob = (await analyzeOpenalephDocument({path: {document_id: d.id}, throwOnError: true})).data;
      if (!job.finished) job = await waitForJob(api, job.id, j => setDocStatus(`${d.filename}: ${describeJob(j)}`));
      setDocStatus(`${d.filename}: ${describeJob(job)}`);
      await reloadDocuments();
      if (job.status === 'succeeded') await loadCandidates(d.id);
    } catch (error) {
      setDocStatus(errorMessage(error, 'Could not ask OpenAleph to find names again'));
    }
  };

  const loadOpenAlephStatus = async (documentId: string): Promise<OpenAlephReviewStatusOut | null> => {
    try {
      const status = (await getOpenalephDocumentReviewStatus({path: {document_id: documentId}, throwOnError: true})).data;
      setOpenAleph(cur => ({...cur, [documentId]: status}));
      return status;
    } catch (error) {
      setDocStatus(errorMessage(error, 'Could not load OpenAleph review status'));
      return null;
    }
  };

  const syncOpenAleph = async (documentId: string) => {
    setDocStatus('Synchronizing document to OpenAleph…');
    try {
      await syncOpenalephDocument({path: {document_id: documentId}, throwOnError: true});
      const status = await loadOpenAlephStatus(documentId);
      setDocStatus(status?.ready_for_import
        ? 'OpenAleph synchronization complete. Provider extraction can now be refreshed.'
        : 'OpenAleph synchronization finished without an import-ready provider document ID.');
    } catch (error) {
      setDocStatus(errorMessage(error, 'OpenAleph synchronization failed'));
    }
  };

  const refreshOpenAleph = async (documentId: string) => {
    setDocStatus('Refreshing OpenAleph Page and Mention review candidates…');
    try {
      await refreshOpenalephDocumentReview({path: {document_id: documentId}, throwOnError: true});
      const [status] = await Promise.all([loadOpenAlephStatus(documentId), loadCandidates(documentId)]);
      setDocStatus(status
        ? `OpenAleph review refreshed: ${status.provider_candidate_pending_review} provider candidate(s) awaiting reporter review.`
        : 'OpenAleph review refresh completed.');
    } catch (error) {
      setDocStatus(errorMessage(error, 'OpenAleph review refresh failed'));
    }
  };

  const entityCaption = (id: unknown, fallback: string) => entities.find(e => e.id === id)?.caption || text(id) || fallback;

  return <Card className="card" id="document-ingestion">
    <CardHeader className="pb-3">
      <CardTitle>Document ingestion & extraction</CardTitle>
      <CardDescription>PDF, DOCX, text, Markdown, CSV and HTML are extracted into locator-preserving chunks. All entity/claim/evidence suggestions remain proposals until you accept them.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="searchrow">
        <Input value={docTitle} onChange={(e: ChangeEvent<HTMLInputElement>) => setDocTitle(e.target.value)} placeholder="Document title"/>
        <Input type="file" accept={ACCEPTED_FILES} onChange={(e: ChangeEvent<HTMLInputElement>) => setDocFile(e.target.files?.[0] || null)}/>
        <Button onClick={uploadDocument} disabled={!docFile}>Upload & extract</Button>
      </div>
      {docStatus && <p className="muted">{docStatus}</p>}
      {documentsQuery.isError && <p className="muted">{errorMessage(documentsQuery.error, 'Could not load the documents')}</p>}
      <hr/>
      <h4>Bulk import</h4>
      <p className="muted">Select several files to import them one at a time with visible progress, then review every proposal, issue, and question document by document before anything is accepted.</p>
      <div className="searchrow">
        <Input type="file" accept={ACCEPTED_FILES} multiple onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkFiles(Array.from(e.target.files || []))} disabled={bulkImporting}/>
        <Button onClick={uploadBulk} disabled={bulkFiles.length === 0 || bulkImporting}>{bulkImporting ? 'Importing…' : `Import ${bulkFiles.length} document(s)`}</Button>
      </div>
      {bulkImporting && bulkProgress && <p className="muted">Importing {Math.min(bulkProgress.done + 1, bulkProgress.total)} of {bulkProgress.total}: {bulkProgress.currentName}</p>}
      {bulkStatus && <p className="muted">{bulkStatus}</p>}
      {investigationId && <p className="muted"><Link href={`/review?inv=${encodeURIComponent(investigationId)}`}>Open review queue for this investigation</Link> -- resumes reviewing every document here that still has unreviewed proposals, not only a just-imported batch.</p>}
      {documents.map(d => {
        const oa = openAleph[d.id];
        return <div className="candidate" key={d.id}>
          <b>{d.filename}</b> <small>{d.extraction_status} · {d.chunk_count} chunks · {Object.entries(d.candidate_counts || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</small>
          {oa && <div>
            <small>OpenAleph: {oa.sync?.status || 'not synchronized'}{oa.sync?.provider_record_id ? ` · provider document ${oa.sync.provider_record_id}` : ''} · {oa.provider_candidate_pending_review} awaiting review · {oa.provider_candidate_accepted} accepted · {oa.provider_candidate_rejected} rejected</small>
            {oa.sync?.error && <div><small>{oa.sync.error}</small></div>}
          </div>}
          <div>
            <Button onClick={() => loadCandidates(d.id)}>Review proposals</Button>
            <Button onClick={() => loadCandidates(d.id, 'all')}>Review history</Button>
            <Button onClick={() => loadOpenAlephStatus(d.id)}>OpenAleph status</Button>
            <Button onClick={() => syncOpenAleph(d.id)}>Sync to OpenAleph</Button>
            <Button onClick={() => refreshOpenAleph(d.id)} disabled={Boolean(oa && !oa.ready_for_import)}>Refresh OpenAleph review</Button>
            {d.openaleph_document_id && d.extraction_status === 'complete' && <Button onClick={() => findNamesAgain(d)}>Find names again</Button>}
            <Button onClick={() => openProvenance({title: d.filename, kind: 'document', sourceId: d.source_id, documentId: d.id})}>Trace document</Button>
            {d.extraction_status === 'failed' && <Button onClick={() => retryDocumentRead(d)}>Retry reading</Button>}
            {(d.extraction_status === 'queued' || d.extraction_status === 'extracting') && <Button onClick={() => retryDocumentRead(d)}>Check reading progress</Button>}
          </div>
        </div>;
      })}
      {candidates.map(c => <div className="candidate" key={c.id}>
        <b>{c.candidate_type} proposal</b> <small>· {c.review_status} · {Math.round(c.confidence * 100)}%</small>
        <div>{shownText(c) || ''}</div>
        {text(c.payload.locator) && <small>{text(c.payload.locator)}</small>}
        {c.explanation && <ExtractionExplanationView explanation={c.explanation}/>}
        {c.candidate_type === 'relationship' && <div>
          <small>Machine suggestion: no · Reporter staged: yes · Canonical relationship: {c.review_status === 'accepted' ? 'yes' : 'no'}</small>
          <div>{String(c.payload.schema || 'Relationship')}: {entityCaption(c.payload.source_entity_id, 'source')} → {entityCaption(c.payload.target_entity_id, 'target')}</div>
        </div>}
        {c.reviewer_note && <div><small>Reporter note: {c.reviewer_note}</small></div>}
        {c.review_status === 'proposed' && c.payload.schema_question === true &&
          <SchemaQuestion candidate={c} answer={schemaAnswers[c.id]} onAnswer={choice => setSchemaAnswers(cur => ({...cur, [c.id]: choice}))}/>}
        {c.review_status === 'proposed' && c.candidate_type === 'identifier' &&
          <IdentifierOwner candidateId={c.id} kind={text(c.payload.kind) || 'email'} note={REVIEW_NOTE}
            onReviewed={decision => reviewed(c, decision)}
            onEntityAccepted={entityCandidateId => reviewed({id: entityCandidateId, candidate_type: 'entity'}, 'accept')}/>}
        <div>
          {c.review_status === 'proposed' && c.candidate_type !== 'identifier' && <>
            <Button onClick={() => reviewCandidate(c, 'accept')} disabled={c.payload.schema_question === true && !schemaAnswers[c.id]}>
              {c.candidate_type === 'relationship' ? 'Accept canonical relationship' : 'Accept'}
            </Button>
            <Button onClick={() => reviewCandidate(c, 'reject')}>Reject</Button>
          </>}
          {c.candidate_type === 'claim' && c.review_status === 'accepted' && c.accepted_record_id && <Button onClick={() => setRelationshipClaimCandidate(c)}>Stage relationship from this claim</Button>}
          <Button onClick={() => openProvenance({
            title: shownText(c) || `${c.candidate_type} extraction`, kind: `document extraction: ${c.review_status}`,
            locator: text(c.payload.locator), detail: shownText(c), extractionCandidateId: c.id,
          })}>Trace extraction</Button>
        </div>
      </div>)}
      {relationshipClaimCandidate && <div className="candidate">
        <h4>Stage relationship from reviewed claim</h4>
        <p className="muted">The claim and its exact evidence are already reporter-reviewed. Selecting endpoints here only creates a relationship proposal; a second acceptance is required before a canonical graph edge exists.</p>
        <div>{text(relationshipClaimCandidate.payload.text) || 'Reviewed extracted claim'}</div>
        <div className="searchrow">
          <Input value={relSchema} onChange={(e: ChangeEvent<HTMLInputElement>) => setRelSchema(e.target.value)} placeholder="FollowTheMoney relationship schema"/>
          <Select value={relSource} onValueChange={setRelSource}>
            <SelectTrigger className="w-auto"><SelectValue placeholder="Source entity…"/></SelectTrigger>
            <SelectContent>{entities.map(e => <SelectItem key={e.id} value={e.id}>{e.caption} · {e.schema}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={relTarget} onValueChange={setRelTarget}>
            <SelectTrigger className="w-auto"><SelectValue placeholder="Target entity…"/></SelectTrigger>
            <SelectContent>{entities.map(e => <SelectItem key={e.id} value={e.id}>{e.caption} · {e.schema}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={stageRelationship} disabled={!relSchema || !relSource || !relTarget}>Stage proposal</Button>
          <Button onClick={() => setRelationshipClaimCandidate(null)}>Cancel</Button>
        </div>
        <small>State: reviewed evidence → unverified/reporter-controlled claim → staged relationship proposal → separate canonicalization.</small>
      </div>}
    </CardContent>
  </Card>;
}
