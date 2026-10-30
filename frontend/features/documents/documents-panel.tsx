'use client';
// The Library (Bring in › Library; The Drop's "Library" tab leads here). Every document of the case in one dense list
// beside the chosen file's pane (Ony's ask, BACKLOG "Bring in › Documents"): each file's kind is its mark, where it is in
// its reading is its colour (could not be read, stuck, being read, waiting for you, done), and its pages, passages and
// proposals waiting are numbers in columns. Problems and stuck reads say why under the name. Files found inside an
// archive or email sit under it and fold. Search by name, filter by kind and state, sort by any column; J and K (or the
// arrow keys) move, Enter opens the file in the reading room, / searches. The pane holds the read receipt, one action
// that names the next step, the file's tools (email, translation, similar, columns, picture) and the OpenAleph actions
// collected in one menu (research §4–5, "Document list" and "Per-document actions"). Where each file is in its reading
// comes from The Drop's line (GET /api/investigations/{id}/drop), the same record The Drop draws.
//
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
import {Archive, ChevronDown, ChevronRight, File as FileIcon, FileText, FileType, Film, Globe, Image as ImageIcon, Mail, Plus, Route, Search, Sheet} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {ExtractionExplanationView} from '../../components/extraction-explanation';
import {Reveal} from '../../components/ui/reveal';
import {ApiHttpError, errorMessage, isAbortError} from '../../lib/api-client';
import {checkedReply} from '../../lib/api-generated';
import {api} from '../../lib/api-instance';
import {
  getCorpusStatusQueryKey, getDocumentFormatsOptions, getDropOptions, getDropQueryKey, getInvestigationGraphQueryKey, listClaimsQueryKey, listDocumentsOptions, listDocumentsQueryKey, listEntitiesOptions,
  listEntitiesQueryKey, listInvestigationEvidenceQueryKey, listSourcesQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {
  analyzeOpenalephDocument, createExtractedRelationshipProposal, createIngestionBatch, findOpenalephChildren, getDocument, getOpenalephDocumentReviewStatus, listDocumentCandidatesEndpoint,
  listJobsEndpoint, refreshOpenalephDocumentReview, retryJobEndpoint, reviewExtractionCandidate, syncOpenalephDocument,
} from '../../lib/generated/sdk.gen';
import type {
  DocumentOut, DocumentUploadOut, DropLaneOut, ExtractionCandidateOut, ExtractionCandidateReviewRequest, OpenAlephReviewStatusOut,
} from '../../lib/generated/types.gen';
import {zDocumentUploadOut} from '../../lib/generated/zod.gen';
import type {BackgroundJob} from '../../lib/api-types';
import {describeJob, waitForJob} from '../../lib/jobs';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {CorpusStatus} from './corpus-status';
import {CONTAINER_SCHEMATA} from './document-tree';
import {EmailView} from './email-view';
import {SimilarDocuments} from './similar-documents';
import {isTable, TableMapper} from './table-mapper';
import {isPicture, PictureEvidence} from './picture-evidence';
import {DocumentTranslation} from './document-translation';
import {IdentifierOwner} from './identifier-owner';
import {SchemaQuestion} from './schema-question';
import {FingerprintMark, ProposalKindMark, proposalKindName} from '../the-drop/kind-marks';
import {PagePicture} from '../case-home/decision-card';
import {apiTime} from '../../lib/timestamps';
import {
  fileKind as libraryKind, fileState, isFiltered, KINDS, lanesById, libraryRows, sharedOpenings, STATE_ORDER, STATES, tally, titleOf, waitingIn,
} from './library-model';
import type {DocKindFilter, FileKind, FileState, LibraryRow, Sort, SortKey} from './library-model';
import {DocumentAbout} from './document-about';
import {DOC_KIND_ORDER, DOC_KINDS, setByWords} from './document-kinds';

/** Each kind of file as its mark (Ony, 29 Oct: a type is a mark, named on hover). */
const KIND_ICON: Record<FileKind, LucideIcon> = {pdf: FileText, email: Mail, web: Globe, picture: ImageIcon, table: Sheet,
  text: FileType, media: Film, archive: Archive, other: FileIcon};
/** The seven stages of The Drop's line, as the tiny strip a file in flight shows. */
const STAGE_STATE: Record<string, string> = {done: 'done', active: 'active', waiting: 'wait', stopped: 'stop', needs_you: 'you', skipped: 'skip'};
/** A container with more files than this starts folded. */
const FOLD_OVER = 8;
const SORTS: {key: SortKey; label: string}[] = [{key: 'pages', label: 'Pages'}, {key: 'passages', label: 'Passages'}, {key: 'waiting', label: 'Waiting'},
  {key: 'added', label: 'Added'}];
type Tool = 'email' | 'translation' | 'similar' | 'map' | 'picture';
const shortDay = (iso: string) => apiTime(iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});

type Props = {investigationId: string};

// What the Workbench's own reader reads; the pickers offer it until the
// server says what uploads accept now (GET /api/document-formats).
const WORKBENCH_FILES = '.csv,.docx,.htm,.html,.md,.pdf,.txt';
const REVIEW_NOTE = 'Reviewed in Next.js workbench';

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** What a proposal says, for its heading and its trace. */
function shownText(c: ExtractionCandidateOut): string | undefined {
  return text(c.payload.caption) || text(c.payload.text) || text(c.payload.quote);
}

type UploadOptions = {batchId?: string, allowDuplicate?: boolean};

function uploadForm(investigationId: string, title: string, file: File, options: UploadOptions = {}): FormData {
  const fd = new FormData();
  fd.append('investigation_id', investigationId);
  fd.append('title', title);
  fd.append('file', file);
  if (options.batchId) fd.append('batch_id', options.batchId);
  if (options.allowDuplicate) fd.append('allow_duplicate', 'true');
  return fd;
}

export const upload = (investigationId: string, title: string, file: File, options: UploadOptions = {}): Promise<DocumentUploadOut> =>
  api.parsed('/api/documents/upload', checkedReply(zDocumentUploadOut), {method: 'POST', rawBody: uploadForm(investigationId, title, file, options)});

/** The same bytes are already a document of this investigation (409 from the upload). */
const isDuplicate = (error: unknown): boolean => error instanceof ApiHttpError && error.status === 409;

/** A name for a bulk import: its first file, and how many more. */
export function batchLabel(files: File[]): string {
  if (files.length === 0) return 'Bulk import';
  return files.length === 1 ? files[0].name : `${files[0].name} and ${files.length - 1} more`;
}

export function DocumentsPanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const router = useRouter();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  // A document another panel asked to open (a corpus search hit, a similar document).
  const documentRequest = useWorkbenchStore(state => state.document);
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docStatus, setDocStatus] = useState('');
  const [duplicateOf, setDuplicateOf] = useState('');
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
  // The file chosen in the list, whose pane shows; the document the loaded proposals belong to; the pane's open tool.
  const [picked, setPicked] = useState<string | null>(null);
  const [candidatesFor, setCandidatesFor] = useState<string | null>(null);
  // The pane's open tool, for the file it was opened on: choosing another file closes it.
  const [openTool, setOpenTool] = useState<{documentId: string; tool: Tool} | null>(null);
  const [oaMenuFor, setOaMenuFor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<ReadonlySet<FileKind>>(new Set());
  // What documents are (a court filing, an article…), the filter the kind marks offer.
  const [docKinds, setDocKinds] = useState<ReadonlySet<DocKindFilter>>(new Set());
  const [states, setStates] = useState<ReadonlySet<FileState>>(new Set());
  const [sort, setSort] = useState<Sort>({key: 'added', descending: false});
  // Containers folded or unfolded by hand; the rest follow FOLD_OVER.
  const [foldedByHand, setFoldedByHand] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Set while this panel itself asks the reading room to open a file, so its own request only picks the row.
  const ownOpen = useRef(false);

  // Proposals belong to the case they were loaded for: a late reply for
  // another case is dropped, and a new case starts with none.
  const activeInvestigation = useRef(investigationId);
  const candidatesRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    activeInvestigation.current = investigationId;
    candidatesRequest.current?.abort();
    setCandidates([]);
    setCandidatesFor(null);
    setOpenAleph({});
    setPicked(null);
  }, [investigationId]);

  const path = {investigation_id: investigationId};
  const documentsQuery = useQuery({...listDocumentsOptions({path}), enabled: Boolean(investigationId)});
  // The canonical entities a staged relationship can join, from the shared cache.
  const entitiesQuery = useQuery({...listEntitiesOptions({path}), enabled: Boolean(investigationId)});
  const entities = entitiesQuery.data ?? [];
  // The same list the upload route checks against (ADR-0006, Wave A).
  const formats = useQuery({...getDocumentFormatsOptions(), enabled: Boolean(investigationId)}).data;
  const accept = formats?.accept ?? WORKBENCH_FILES;
  const documents: DocumentOut[] = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  // Where each file is in its reading: The Drop's line, followed every few seconds while something is being read.
  const dropQuery = useQuery({...getDropOptions({path}), enabled: Boolean(investigationId),
    refetchInterval: q => ((q.state.data?.totals.unread ?? 0) > 0 ? 3000 : false)});
  const lanes = useMemo(() => lanesById(dropQuery.data?.lanes), [dropQuery.data]);
  const reloadDocuments = () => Promise.all([queryClient.invalidateQueries({queryKey: listDocumentsQueryKey({path})}),
    queryClient.invalidateQueries({queryKey: getDropQueryKey({path})})]);
  // OpenAleph's progress is shown while a file is being read; asking for it
  // again after an action starts the watch when OpenAleph has work.
  const filesBeingRead = documents.some(d => d.extraction_status === 'queued' || d.extraction_status === 'extracting');
  const recheckCorpus = () => queryClient.invalidateQueries({queryKey: getCorpusStatusQueryKey({path})});

  // `kept` is a status line to keep once the proposals are in (an upload's
  // "Extracted ..."): it stays, and a failure is added to it, not put in its place.
  const loadCandidates = async (documentId: string, status: 'proposed' | 'all' = 'proposed', kept = '') => {
    candidatesRequest.current?.abort();
    const controller = new AbortController();
    candidatesRequest.current = controller;
    const forInvestigation = investigationId;
    const query = status === 'all' ? {explain: true} : {status: 'proposed', explain: true};
    try {
      const rows = (await listDocumentCandidatesEndpoint({path: {document_id: documentId}, query, signal: controller.signal, throwOnError: true})).data;
      if (!controller.signal.aborted && activeInvestigation.current === forInvestigation) {
        setCandidates(rows);
        setCandidatesFor(documentId);
        setPicked(documentId);
        setDocStatus(status === 'all' ? `Loaded ${rows.length} extraction proposal/review record(s).` : kept);
      }
    } catch (error) {
      if (!isAbortError(error)) setDocStatus([kept, errorMessage(error, 'Could not load extraction proposals')].filter(Boolean).join(' '));
    }
  };

  // The API saves the file and reads it as a background job (ADR-0004). In the
  // product the upload answers before the read is done, so follow the job;
  // in developer mode the answer already carries the finished job.
  // A file whose bytes are already a document here is named, not saved again,
  // unless the reporter asks for a second copy.
  const uploadDocument = async (allowDuplicate = false) => {
    if (!investigationId || !docFile) return;
    setDuplicateOf('');
    try {
      const uploaded = await upload(investigationId, docTitle, docFile, {allowDuplicate});
      setPicked(uploaded.id);
      void recheckCorpus();
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
        setDocStatus(`Saved, but reading it stopped: ${describeJob(job)}. Use “Try reading again” on the document.`);
        return;
      }
      const note = job && job.message && job.message !== 'Document read' ? ` ${job.message}.` : '';
      const extracted = `Extracted ${saved.chunk_count} chunk(s).${note} Review proposals before canonicalizing.`;
      setDocStatus(extracted);
      await loadCandidates(saved.id, 'proposed', extracted);
    } catch (error) {
      if (isDuplicate(error)) setDuplicateOf(docFile.name);
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
      if (job.status === 'failed' || job.status === 'cancelled') {
        job = (await retryJobEndpoint({path: {job_id: job.id}, throwOnError: true})).data;
        void recheckCorpus();
      }
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
    let batchId: string;
    try {
      batchId = (await createIngestionBatch({path: {investigation_id: investigationId}, body: {label: batchLabel(bulkFiles)}, throwOnError: true})).data.id;
    } catch (error) {
      setBulkImporting(false);
      setBulkStatus(errorMessage(error, 'Could not start the import'));
      return;
    }
    const ids: string[] = [];
    const failed: string[] = [];
    const duplicates: string[] = [];
    const reading: {name: string, jobId: string}[] = [];
    for (let i = 0; i < bulkFiles.length; i++) {
      const file = bulkFiles[i];
      setBulkProgress({done: i, total: bulkFiles.length, currentName: file.name});
      try {
        const d = await upload(investigationId, file.name.replace(/\.[^./]+$/, ''), file, {batchId});
        ids.push(d.id);
        if (d.job && !d.job.finished) reading.push({name: file.name, jobId: d.job.id});
      } catch (error) {
        if (isDuplicate(error)) duplicates.push(file.name);
        else failed.push(`${file.name}: ${errorMessage(error, 'upload failed')}`);
      }
    }
    if (ids.length) void recheckCorpus();
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
    const already = duplicates.length ? ` ${duplicates.length} already in this investigation: ${duplicates.join(', ')}.` : '';
    if (ids.length === 0) {
      setBulkStatus(failed.length ? `No file was imported. ${failed.join(' · ')}${already}` : `No file was imported.${already}`);
      return;
    }
    setBulkStatus(failed.length
      ? `Imported ${ids.length} of ${bulkFiles.length} file(s). ${failed.length} failed and were skipped: ${failed.join(' · ')}.${already}`
      : `Imported ${ids.length} file(s).${already} Opening batch triage...`);
    router.push(`/review/batch?inv=${encodeURIComponent(investigationId)}&batch=${encodeURIComponent(batchId)}`);
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
      void recheckCorpus();
      if (!job.finished) job = await waitForJob(api, job.id, j => setDocStatus(`${d.filename}: ${describeJob(j)}`));
      setDocStatus(`${d.filename}: ${describeJob(job)}`);
      await reloadDocuments();
      if (job.status === 'succeeded') await loadCandidates(d.id);
    } catch (error) {
      setDocStatus(errorMessage(error, 'Could not ask OpenAleph to find names again'));
    }
  };

  // "Look for files inside again" (ADR-0006, Wave A): OpenAleph lists an
  // archive's or email's files once more; those not held yet become documents.
  const findChildrenAgain = async (d: DocumentOut) => {
    setDocStatus(`${d.filename}: looking for the files inside again…`);
    try {
      let job: BackgroundJob = (await findOpenalephChildren({path: {document_id: d.id}, throwOnError: true})).data;
      if (!job.finished) job = await waitForJob(api, job.id, j => setDocStatus(`${d.filename}: ${describeJob(j)}`));
      setDocStatus(`${d.filename}: ${describeJob(job)}`);
      await reloadDocuments();
    } catch (error) {
      setDocStatus(errorMessage(error, 'Could not look for the files inside again'));
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

  // Open a document asked for elsewhere: its proposals, scrolled into view,
  // with the page that matched named (ADR-0006, Wave A).
  const answeredRequest = useRef(0);
  const openRequested = (request: {serial: number; documentId: string; pageNumber: number | null}) => {
    if (request.serial === answeredRequest.current) return;
    answeredRequest.current = request.serial;
    const {documentId, pageNumber} = request;
    setPicked(documentId);
    document.getElementById(`document-${documentId}`)?.scrollIntoView?.({block: 'nearest'});
    // The panel's own "Open in reading room": the reading room answers it; here the row is only chosen.
    if (ownOpen.current) { ownOpen.current = false; return; }
    const name = documents.find(d => d.id === documentId)?.filename ?? 'The document';
    void loadCandidates(documentId).then(() => setDocStatus(`${name} opened${pageNumber ? ` at page ${pageNumber}` : ''}: its proposals are in its pane.`));
  };
  // The newest handler, so the effect below runs only when a request arrives.
  const latestOpenRequested = useRef(openRequested);
  useEffect(() => { latestOpenRequested.current = openRequested; });
  useEffect(() => { if (documentRequest) latestOpenRequested.current(documentRequest); }, [documentRequest]);
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const openInReadingRoom = (documentId: string) => { ownOpen.current = true; openDocument(documentId); };

  const entityCaption = (id: unknown, fallback: string) => entities.find(e => e.id === id)?.caption || text(id) || fallback;

  // The list: filtered, sorted, containers folded.
  const filter = {query, kinds, states, docKinds};
  const filtering = isFiltered(filter);
  const folded = useMemo(() => {
    const out = new Set<string>();
    const count = new Map<string, number>();
    for (const d of documents) if (d.parent_document_id) count.set(d.parent_document_id, (count.get(d.parent_document_id) ?? 0) + 1);
    for (const d of documents) {
      const byHand = foldedByHand[d.id];
      if (byHand ?? (count.get(d.id) ?? 0) > FOLD_OVER) out.add(d.id);
    }
    return out;
  }, [documents, foldedByHand]);
  const rows = libraryRows(documents, lanes, filter, sort, folded);
  const openings = sharedOpenings(rows.map(r => titleOf(r.document)));
  const openingOf = new Map(rows.map((r, i) => [r.document.id, openings[i]]));
  const counts = useMemo(() => tally(documents, lanes), [documents, lanes]);
  const waitingTotal = dropQuery.data?.totals.waiting;
  // The chosen file: the one picked, else the first in the list, so the pane is never empty while there are files.
  const current = documents.find(d => d.id === picked) ?? rows[0]?.document ?? null;
  const currentId = current?.id ?? null;
  const tool = openTool && openTool.documentId === currentId ? openTool.tool : null;
  // The OpenAleph menu is open on one file; choosing another closes it.
  const oaMenu = oaMenuFor !== null && oaMenuFor === currentId;
  const setOaMenu = (open: boolean) => setOaMenuFor(open ? currentId : null);

  const toggle = <T,>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  };
  const sortBy = (key: SortKey) => setSort(cur => (cur.key === key ? {key, descending: !cur.descending} : {key, descending: key !== 'added' && key !== 'name'}));

  // J / K or the arrow keys move along the list, Enter opens the chosen file in the reading room, / searches.
  const move = (step: number) => {
    if (!rows.length) return;
    const at = Math.max(0, rows.findIndex(r => r.document.id === currentId));
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + step))].document.id;
    setPicked(next);
    const el = document.getElementById(`lib-pick-${next}`);
    el?.focus();
    el?.scrollIntoView?.({block: 'nearest'});
  };
  const onListKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && currentId && current?.extraction_status !== 'failed') { e.preventDefault(); openInReadingRoom(currentId); }
  };
  const onPanelKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) { e.preventDefault(); searchRef.current?.focus(); }
  };

  const addPanel = <details className="lib-add">
    {/* How the reader works is on hover or focus of "Add files" (Ony, 29 Oct: sub-text on reveal). */}
    <summary><Plus size={15} aria-hidden="true"/><Reveal tabbable={false} detail={`${formats?.reader === 'openaleph'
      ? `OpenAleph reads every upload: PDFs and office documents, email, archives, spreadsheets, images and more (${formats.extensions.length} kinds of file). The Workbench's own reader takes over for PDF, DOCX, text, Markdown, CSV and HTML when OpenAleph cannot. `
      : 'PDF, DOCX, text, Markdown, CSV and HTML are extracted into locator-preserving chunks. '}All entity/claim/evidence suggestions remain proposals until you accept them.`}><span>Add files</span></Reveal></summary>
    <div className="lib-add-body">
      <p className="lib-eyebrow">One file</p>
      <div className="lib-add-row">
        <Input value={docTitle} onChange={(e: ChangeEvent<HTMLInputElement>) => setDocTitle(e.target.value)} placeholder="Document title"/>
        <Input type="file" accept={accept} onChange={(e: ChangeEvent<HTMLInputElement>) => { setDocFile(e.target.files?.[0] || null); setDuplicateOf(''); }}/>
        <Button onClick={() => uploadDocument()} disabled={!docFile}>Upload & extract</Button>
      </div>
      {duplicateOf && docFile && <Button size="sm" variant="outline" onClick={() => uploadDocument(true)}>Keep a second copy of {duplicateOf}</Button>}
      <p className="lib-eyebrow"><Reveal detail="Select several files to import them one at a time with visible progress, then review every proposal, issue, and question document by document before anything is accepted.">Several files</Reveal></p>
      <div className="lib-add-row">
        <Input type="file" accept={accept} multiple onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkFiles(Array.from(e.target.files || []))} disabled={bulkImporting}/>
        <Button onClick={uploadBulk} disabled={bulkFiles.length === 0 || bulkImporting}>{bulkImporting ? 'Importing…' : `Import ${bulkFiles.length} document(s)`}</Button>
      </div>
      {bulkImporting && bulkProgress && <p className="lib-quiet">Importing {Math.min(bulkProgress.done + 1, bulkProgress.total)} of {bulkProgress.total}: {bulkProgress.currentName}</p>}
      <p className="lib-quiet">Dropping files on The Drop does the same and shows each one’s reading.</p>
    </div>
  </details>;

  const kindMark = (kind: FileKind, size = 16) => {
    const Icon = KIND_ICON[kind];
    return <span className={`lib-kind lib-k-${kind}`} aria-hidden="true"><Icon size={size} strokeWidth={1.9}/></span>;
  };
  // A row's mark: what the document is when known (a court filing, an article…); else its kind of file, faint.
  const docMark = (r: Pick<LibraryRow, 'kind' | 'docKind'>, size = 16) => {
    if (!r.docKind) return <span className="lib-kind-unset">{kindMark(r.kind, size)}</span>;
    const Icon = DOC_KINDS[r.docKind].icon;
    return <span className={`lib-kind lib-d-${r.docKind}`} aria-hidden="true"><Icon size={size} strokeWidth={1.9}/></span>;
  };
  const clearFilters = () => { setQuery(''); setKinds(new Set()); setStates(new Set()); setDocKinds(new Set()); };

  const row = (r: LibraryRow): ReactElement => {
    const d = r.document;
    const on = d.id === currentId;
    const waiting = waitingIn(r.lane);
    const alert = r.state === 'problem' ? (r.lane?.note || d.extraction_error || 'Could not be read')
      : r.state === 'stuck' ? r.lane?.note : r.state === 'reading' ? (r.lane?.note || 'Waiting its turn') : null;
    const isFolded = folded.has(d.id) && !filtering;
    const pick = () => setPicked(d.id);
    return <li key={d.id} id={`document-${d.id}`} data-testid={`document-${d.id}`} aria-current={on ? 'true' : undefined}
      className={`lib-row lib-s-${r.state}${on ? ' on' : ''}${r.context ? ' ctx' : ''}`} style={{'--depth': r.depth} as CSSProperties}
      onClick={pick}>
      <span className="lib-fold">{r.children > 0
        ? <button type="button" tabIndex={-1} aria-expanded={!isFolded} aria-label={`${isFolded ? 'Show' : 'Hide'} the ${r.children} file${r.children === 1 ? '' : 's'} inside`}
          onClick={e => { e.stopPropagation(); setFoldedByHand(cur => ({...cur, [d.id]: !isFolded})); }}>{isFolded ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button>
        : r.parent ? <Reveal label={`Inside ${r.parent.filename}`} detail={`Inside ${r.parent.filename}`}><span className="lib-in" aria-hidden="true">↳</span></Reveal> : null}</span>
      <Reveal label={r.docKind ? DOC_KINDS[r.docKind].name : KINDS[r.kind].name} detail={<>
        <b>{r.docKind ? DOC_KINDS[r.docKind].name : KINDS[r.kind].name}</b>
        <span className="rv-row">{r.docKind ? `${KINDS[r.kind].name} · ${d.kind ? setByWords(d.kind_set_by, d.kind_by) : setByWords('reader', null)}` : 'Kind not set: set it in the pane'}</span>
        {d.language && <span className="rv-row">{d.language_name ?? d.language.toUpperCase()} · {setByWords(d.language_set_by, d.language_by, d.language_confidence)}</span>}
        <span className="rv-row">{STATES[r.state].word} · {STATES[r.state].meaning}</span></>}>
        {docMark(r)}</Reveal>
      <span className="lib-name">
        <button type="button" id={`lib-pick-${d.id}`} className="lib-title" tabIndex={on || (!currentId && r === rows[0]) ? 0 : -1}
          onClick={e => { e.stopPropagation(); pick(); }} onDoubleClick={() => d.extraction_status !== 'failed' && openInReadingRoom(d.id)}>
          {(() => {
            const title = titleOf(d);
            const cut = openingOf.get(d.id) ?? 0;
            return cut ? <><span className="lib-pre">{title.slice(0, cut)}</span><span className="lib-tail">{title.slice(cut)}</span></> : <span className="lib-tail">{title}</span>;
          })()}{r.children > 0 && <small className="lib-count"> · {r.children}</small>}</button>
        {alert && <span className="lib-note">{r.state === 'reading' && r.lane && <span className="lib-strip" aria-hidden="true">{r.lane.stages.map(st =>
          <i key={st.key} className={STAGE_STATE[st.state] ?? ''}/>)}</span>}{alert}</span>}
      </span>
      <span className="lib-num lib-pages">{r.lane?.receipt.pages ?? <i>–</i>}</span>
      <span className="lib-num">{(r.lane ? r.lane.receipt.passages : d.chunk_count) || <i>–</i>}</span>
      <span className="lib-num lib-wait">{waiting ? <b>{waiting}</b> : <i>–</i>}</span>
      <span className="lib-num lib-day">{shortDay(d.created_at)}</span>
    </li>;
  };

  return <section className="lib" id="document-ingestion" aria-label="Library" onKeyDown={onPanelKey}>
    <header className="lib-bar">
      <label className="lib-search"><Search size={15} aria-hidden="true"/>
        <input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a file by name" aria-label="Find a file by name"
          onKeyDown={e => { if (e.key === 'Escape') setQuery(''); if (e.key === 'ArrowDown') { e.preventDefault(); move(0); } }}/>
        <kbd aria-hidden="true">/</kbd></label>
      <div className="lib-chips" role="group" aria-label="What the documents are">
        {([...DOC_KIND_ORDER, 'unset'] as DocKindFilter[]).filter(k => counts.docKinds.get(k)).map(k => <Reveal key={k} tabbable={false}
          detail={<><b>{k === 'unset' ? 'Kind not set' : DOC_KINDS[k].plural}</b> · {counts.docKinds.get(k)}</>}>
          <button type="button" className={`lib-chip${docKinds.has(k) ? ' on' : ''}`} aria-pressed={docKinds.has(k)} aria-label={k === 'unset' ? 'Kind not set' : DOC_KINDS[k].plural}
            onClick={() => setDocKinds(cur => toggle(cur, k))}>{k === 'unset' ? <span className="lib-kind-unset">{kindMark('other', 14)}</span> : docMark({kind: 'other', docKind: k}, 14)}
            <b>{counts.docKinds.get(k)}</b></button></Reveal>)}
      </div>
      <div className="lib-chips" role="group" aria-label="Where each file is">
        {STATE_ORDER.filter(st => counts.states.get(st)).map(st => <Reveal key={st} tabbable={false} detail={<><b>{STATES[st].word}</b> · {STATES[st].meaning}</>}>
          <button type="button" className={`lib-chip lib-st${states.has(st) ? ' on' : ''}`} aria-pressed={states.has(st)} aria-label={STATES[st].word}
            onClick={() => setStates(cur => toggle(cur, st))}><i className={`lib-dot lib-s-${st}`} aria-hidden="true"/><b>{counts.states.get(st)}</b></button></Reveal>)}
      </div>
      {filtering && <button type="button" className="lib-clear" onClick={clearFilters}>Clear</button>}
      <span className="lib-grow"/>
      {investigationId && <Reveal tabbable={false} detail="Every document here that still has proposals waiting, one at a time, not only a just-imported batch.">
        <Link className="lib-queue" href={`/review?inv=${encodeURIComponent(investigationId)}`}>Review queue{waitingTotal ? <b> {waitingTotal}</b> : null}</Link></Reveal>}
      {addPanel}
    </header>
    {(docStatus || bulkStatus || documentsQuery.isError) && <div className="lib-status" role="status">
      {docStatus && <p>{docStatus}</p>}
      {bulkStatus && <p>{bulkStatus}</p>}
      {documentsQuery.isError && <p>{errorMessage(documentsQuery.error, 'Could not load the documents')}</p>}
    </div>}
    {investigationId && <div className="lib-corpus"><CorpusStatus investigationId={investigationId} watch={filesBeingRead} onIdle={reloadDocuments}/></div>}

    <div className="lib-list" role="region" aria-label="Files">
      <div className="lib-head" aria-hidden="true">
        <span/><span/>
        <button type="button" tabIndex={-1} className={sort.key === 'name' ? 'on' : ''} onClick={() => sortBy('name')}>
          {rows.length === documents.length ? `${documents.length} files` : `${rows.filter(r => !r.context).length} of ${documents.length} files`}{sort.key === 'name' ? (sort.descending ? ' ↓' : ' ↑') : ''}</button>
        {SORTS.map(c => <button type="button" tabIndex={-1} key={c.key} className={`lib-num${c.key === 'pages' ? ' lib-pages' : c.key === 'added' ? ' lib-day' : ''}${sort.key === c.key ? ' on' : ''}`} onClick={() => sortBy(c.key)}>
          {c.label}{sort.key === c.key ? (sort.descending ? ' ↓' : ' ↑') : ''}</button>)}
      </div>
      {/* Sorting is also offered to keyboard and screen-reader users here, since the header is a picture of the columns. */}
      <label className="sr-only">Sort by <select value={`${sort.key}:${sort.descending ? 'd' : 'a'}`} onChange={e => { const [key, dir] = e.target.value.split(':'); setSort({key: key as SortKey, descending: dir === 'd'}); }}>
        {[{key: 'name', label: 'Name'}, ...SORTS].map(c => [<option key={`${c.key}a`} value={`${c.key}:a`}>{c.label}, ascending</option>, <option key={`${c.key}d`} value={`${c.key}:d`}>{c.label}, descending</option>])}
      </select></label>
      <ul ref={listRef} className="lib-rows" onKeyDown={onListKey} aria-label="Documents">{rows.map(row)}</ul>
      {documents.length > 0 && rows.length === 0 && <p className="lib-quiet lib-none">No file matches. <button type="button" className="lib-link"
        onClick={clearFilters}>Show every file</button></p>}
      {documentsQuery.isSuccess && documents.length === 0 && <p className="lib-quiet lib-none">No documents yet. Drop files on The Drop, or use Add files.</p>}
    </div>

    {current ? pane(current) : <aside className="lib-pane lib-pane-empty" aria-label="The chosen file"><p className="lib-quiet">Choose a file to see its receipt.</p></aside>}
  </section>;

  function pane(d: DocumentOut): ReactElement {
    const lane: DropLaneOut | undefined = lanes.get(d.id);
    const state = fileState(d, lane);
    const kind = fileKindOf(d);
    const oa = openAleph[d.id];
    const container = Boolean(d.openaleph_schema && CONTAINER_SCHEMATA.includes(d.openaleph_schema));
    const parent = d.parent_document_id ? documents.find(x => x.id === d.parent_document_id) : undefined;
    const waiting = waitingIn(lane);
    const found = lane ? lane.receipt.proposals : d.candidate_counts;
    const foundTotal = Object.values(found ?? {}).reduce((a, b) => a + b, 0);
    const reading = state === 'reading' || state === 'stuck';
    const shown = candidatesFor === d.id;
    const tools: {key: Tool; label: string; on: boolean}[] = [
      {key: 'email', label: 'Headers & thread', on: d.openaleph_schema === 'Email'},
      {key: 'translation', label: 'Translation', on: Boolean(d.openaleph_document_id)},
      {key: 'similar', label: 'Similar documents', on: Boolean(d.openaleph_document_id)},
      {key: 'map', label: 'Map columns to entities', on: isTable(d.filename)},
      {key: 'picture', label: 'Picture evidence', on: isPicture(d.filename) && d.extraction_status === 'complete'},
    ];
    const oaItems: {label: string; run: () => void; disabled?: boolean; on?: boolean}[] = [
      {label: 'OpenAleph status', run: () => void loadOpenAlephStatus(d.id)},
      {label: 'Sync to OpenAleph', run: () => void syncOpenAleph(d.id)},
      {label: 'Refresh OpenAleph review', run: () => void refreshOpenAleph(d.id), disabled: Boolean(oa && !oa.ready_for_import)},
      {label: 'Find names again', run: () => void findNamesAgain(d), on: Boolean(d.openaleph_document_id && d.extraction_status === 'complete')},
      {label: 'Look for files inside again', run: () => void findChildrenAgain(d), on: container && d.extraction_status === 'complete'},
    ];
    const pages = lane?.receipt.pages;
    return <aside className={`lib-pane lib-s-${state}`} aria-label={`About ${titleOf(d)}`} data-testid="library-pane">
      <div className="lib-pane-top">
        <span className="lib-thumb"><Thumb d={d} kind={kind} passages={lane?.receipt.passages ?? 0}/></span>
        <div className="lib-pane-name">
          <p className="lib-pane-kind"><Reveal label={KINDS[kind].name} detail={KINDS[kind].name}>{kindMark(kind, 14)}</Reveal>
            <Reveal label={STATES[state].word} detail={<><b>{STATES[state].word}</b> · {STATES[state].meaning}</>}><i className={`lib-dot lib-s-${state}`} aria-hidden="true"/></Reveal>
            <span className="lib-quiet">{shortDay(d.created_at)}</span></p>
          <h3><Reveal tabbable={false} detail={<><b>{titleOf(d)}</b><code className="rv-row rv-mono">{d.filename}</code></>}><span>{titleOf(d)}</span></Reveal></h3>
          {d.title && d.title !== d.filename && <p className="lib-file">{d.filename}</p>}
          {parent && <p className="lib-quiet">Inside <button type="button" className="lib-link" onClick={() => setPicked(parent.id)}>{titleOf(parent)}</button></p>}
        </div>
      </div>

      {/* What it is and its language: chips a person presses to correct them; how each was set is on hover. */}
      <DocumentAbout key={d.id} document={d} file={kind}/>

      {/* Why a file could not be read, or that its read has not moved, is an alert: it stays on screen. */}
      {state === 'problem' && <p className="lib-alert bad" role="note"><i aria-hidden="true">✕</i>{lane?.note || d.extraction_error || 'Could not be read'}</p>}
      {state === 'stuck' && <p className="lib-alert warn" role="note"><i aria-hidden="true">⧗</i>{lane?.note}</p>}
      {state === 'reading' && lane && <p className="lib-alert run" role="note"><span className="lib-strip" aria-hidden="true">{lane.stages.map(st =>
        <i key={st.key} className={STAGE_STATE[st.state] ?? ''}/>)}</span>{lane.note || 'Being read'}</p>}
      {(lane?.issues ?? d.extraction_issues).length > 0 && state !== 'problem' && <ul className="lib-issues">{(lane?.issues ?? d.extraction_issues).map(i => <li key={i}>{i}</li>)}</ul>}

      <dl className="lib-nums">
        <div><dt>Pages</dt><dd>{pages ?? '–'}</dd></div>
        <div><dt>Passages</dt><dd>{lane?.receipt.passages ?? d.chunk_count}</dd></div>
        <div><dt>Found</dt><dd><Reveal tabbable={false} detail={foundTotal ? <span className="km-icons">{Object.entries(found).map(([k, n]) => <span key={k}>{proposalKindName(k, n !== 1)}: {n}</span>)}</span> : 'Nothing found yet'}>
          <span>{foundTotal}</span></Reveal></dd></div>
        <div className={waiting ? 'you' : undefined}><dt>Waiting</dt><dd>{waiting ?? '–'}</dd></div>
      </dl>
      {foundTotal > 0 && <p className="km-icons lib-found">{Object.entries(found).map(([k, n]) => <span key={k} className="rv"><ProposalKindMark kind={k} plural={n !== 1}
        detail={`${n} found${lane?.receipt.waiting[k] ? ` · ${lane.receipt.waiting[k]} wait` : ''}`}/><b>{n}</b></span>)}</p>}

      <div className="lib-acts">
        {state === 'problem' && d.extraction_status === 'failed'
          ? <button type="button" className="p" onClick={() => void retryDocumentRead(d)}>Try reading again</button>
          : reading ? <button type="button" className="p" onClick={() => void retryDocumentRead(d)}>Check reading progress</button>
            : <button type="button" className="p" onClick={() => openInReadingRoom(d.id)}>Open in reading room</button>}
        {foundTotal > 0 && <>
          <button type="button" onClick={() => void loadCandidates(d.id)}>Review proposals{waiting ? <b aria-hidden="true"> {waiting}</b> : null}</button>
          <button type="button" onClick={() => void loadCandidates(d.id, 'all')}>Review history</button>
        </>}
        <Reveal tabbable={false} detail="Trace: where this document came from and what was made from it">
          <button type="button" className="lib-icon" aria-label="Trace document" onClick={() => openProvenance({title: d.filename, kind: 'document', sourceId: d.source_id, documentId: d.id})}>
            <Route size={15}/></button></Reveal>
        <button type="button" aria-haspopup="menu" aria-expanded={oaMenu} onClick={() => setOaMenu(!oaMenu)}>OpenAleph <ChevronDown size={13} aria-hidden="true"/></button>
      </div>
      {/* OpenAleph's actions, collected in one menu (Ony: no wall of buttons on every row). */}
      {oaMenu && <div role="menu" aria-label="OpenAleph" className="lib-menu-list" onKeyDown={e => { if (e.key === 'Escape') setOaMenu(false); }}>
        {oaItems.filter(i => i.on !== false).map(i => <button type="button" role="menuitem" key={i.label} disabled={i.disabled}
          onClick={() => { setOaMenu(false); i.run(); }}>{i.label}</button>)}
      </div>}
      {tools.some(t => t.on) && <div className="lib-tools" role="group" aria-label="This file's tools">
        {tools.filter(t => t.on).map(t => <button type="button" key={t.key} aria-expanded={tool === t.key} className={tool === t.key ? 'on' : undefined}
          onClick={() => setOpenTool(tool === t.key ? null : {documentId: d.id, tool: t.key})}>{t.label}</button>)}
      </div>}
      {oa && <p className="lib-oa"><Reveal label="OpenAleph" detail={<span className="rv-row">OpenAleph: {oa.sync?.status || 'not synchronized'}{oa.sync?.provider_record_id ? ` · provider document ${oa.sync.provider_record_id}` : ''} · {oa.provider_candidate_pending_review} awaiting review · {oa.provider_candidate_accepted} accepted · {oa.provider_candidate_rejected} rejected</span>}>
        <span className="km-more" aria-hidden="true">OA {oa.sync?.status || 'not synchronized'}{oa.provider_candidate_pending_review ? ` · ${oa.provider_candidate_pending_review} wait` : ''}</span></Reveal>
        {oa.sync?.error && <small className="lib-bad"> {oa.sync.error}</small>}</p>}
      {tool === 'similar' && <SimilarDocuments documentId={d.id}/>}
      {tool === 'translation' && <DocumentTranslation documentId={d.id}/>}
      {tool === 'map' && <TableMapper documentId={d.id} onProposed={() => loadCandidates(d.id)}/>}
      {tool === 'picture' && <PictureEvidence investigationId={investigationId} documentId={d.id} sourceId={d.source_id} filename={d.filename}/>}
      {tool === 'email' && <EmailView documentId={d.id} onOpenDocument={documentId => loadCandidates(documentId)}/>}

      {shown && <section className="lib-props" aria-label="Proposals">
      {candidates.map(c => <div className="candidate" key={c.id}>
          {/* The proposal's kind is its icon; its status is a mark (dashed while proposed); its confidence and locator are on hover. */}
          <ProposalKindMark kind={c.candidate_type} detail={<><b>{c.candidate_type} proposal</b> · {c.review_status} · {Math.round(c.confidence * 100)}%
            {text(c.payload.locator) && <span className="rv-row">{text(c.payload.locator)}</span>}</>}/>
          {c.review_status !== 'proposed' && <Reveal label={c.review_status} detail={c.review_status}><b aria-hidden="true">{c.review_status === 'accepted' ? ' ✓' : c.review_status === 'rejected' ? ' ✕' : ' ·'}</b></Reveal>}
          <div className={c.review_status === 'proposed' ? 'lib-proposed' : undefined}>{shownText(c) || ''}</div>
          {c.explanation && <ExtractionExplanationView explanation={c.explanation}/>}
          {c.candidate_type === 'relationship' && (c.payload.source_candidate_id
            ? <div><Reveal detail={`From a column mapping, ${text(c.payload.locator) ?? ''} · accepted after both its ends · Canonical relationship: ${c.review_status === 'accepted' ? 'yes' : 'no'}`}>
              <small aria-hidden="true">⊞ column mapping</small></Reveal></div>
            : <div>
              <Reveal detail={`Machine suggestion: no · Reporter staged: yes · Canonical relationship: ${c.review_status === 'accepted' ? 'yes' : 'no'}`}>
                {String(c.payload.schema || 'Relationship')}: {entityCaption(c.payload.source_entity_id, 'source')} → {entityCaption(c.payload.target_entity_id, 'target')}</Reveal>
            </div>)}
          {c.reviewer_note && <div><Reveal label="Reporter note" detail={`Reporter note: ${c.reviewer_note}`}><span aria-hidden="true">✎</span></Reveal></div>}
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
          <h4><Reveal detail={<><span className="rv-row">The claim and its exact evidence are already reporter-reviewed. Selecting endpoints here only creates a relationship proposal; a second acceptance is required before a canonical graph edge exists.</span>
            <span className="rv-row">State: reviewed evidence → unverified/reporter-controlled claim → staged relationship proposal → separate canonicalization.</span></>}>Stage relationship from reviewed claim</Reveal></h4>
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
        </div>}
      </section>}

      <dl className="lib-receipt">
        {lane?.receipt.how_read && <div><dt>Read</dt><dd>{lane.seconds !== null && lane.seconds !== undefined
          ? <Reveal detail={`${lane.receipt.how_read} · ${lane.seconds} s`}>{lane.receipt.how_read}</Reveal> : lane.receipt.how_read}</dd></div>}
        {(lane?.receipt.files_inside ?? 0) > 0 && <div><dt>Files inside</dt><dd>{lane!.receipt.files_inside}</dd></div>}
        {(lane?.receipt.watchlist_hits ?? 0) > 0 && <div><dt>Watchlist</dt><dd><i aria-hidden="true">◉ </i>{lane!.receipt.watchlist_hits}</dd></div>}
        {(lane?.receipt.flags_fed.length ?? 0) > 0 && <div><dt>Feeds</dt><dd><Reveal detail={<>Feeds the Red Flag indicator{lane!.receipt.flags_fed.length === 1 ? '' : 's'} <span className="rv-mono">{lane!.receipt.flags_fed.join(', ')}</span></>}>
          <span>⚑ {lane!.receipt.flags_fed.length}</span></Reveal></dd></div>}
        <div><dt>Fingerprint</dt><dd><FingerprintMark hash={d.sha256} of={d.filename}/></dd></div>
      </dl>
    </aside>;
  }
}

const fileKindOf = (d: DocumentOut): FileKind => libraryKind(d);

/** The chosen file's first page (a PDF that was read) or the picture itself; any other file is its kind's mark, large. */
function Thumb({d, kind, passages}: {d: DocumentOut; kind: FileKind; passages: number}): ReactElement {
  const Icon = KIND_ICON[kind];
  if (kind === 'pdf' && passages > 0) return <PagePicture documentId={d.id} page={1} width={240} alt={`First page of ${d.filename}`}/>;
  if (kind === 'picture' && d.extraction_status === 'complete') return <PictureThumb d={d}/>;
  return <span className={`lib-thumb-kind lib-k-${kind}`} aria-hidden="true"><Icon size={34} strokeWidth={1.5}/>
    <small>{(/\.([a-z0-9]{1,5})$/i.exec(d.filename)?.[1] ?? '').toUpperCase()}</small></span>;
}

function PictureThumb({d}: {d: DocumentOut}): ReactElement | null {
  const picture = useQuery({queryKey: ['document-picture', d.id], queryFn: () => api.blob(`/api/documents/${d.id}/picture`), staleTime: Infinity, retry: false});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!picture.data) return undefined;
    const made = URL.createObjectURL(picture.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [picture.data]);
  // A blob the API sent, so next/image has nothing to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={d.filename}/> : <span className="ch-page-wait" aria-busy="true"/>;
}
