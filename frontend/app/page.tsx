'use client';
// The workbench page: layout and wiring only (Foundation Fixes fix 3). The
// page checks API access, lists the investigations and the connectors,
// opens a case, and lays the panels out; each panel under features/ loads
// its own data through the shared cache and asks the others for what it
// needs through the shared store (lib/workbench-store.ts).
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect} from 'react';
import type {ReactElement} from 'react';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Toaster} from '@/components/ui/sonner';
import {AiReasoningPanel} from '../components/ai-reasoning-panel';
import {PanelErrorBoundary} from '../components/panel-error-boundary';
import {ApiAccessPanel} from '../features/api-access/api-access-panel';
import {useApiAccess} from '../features/api-access/use-api-access';
import {BackupPanel} from '../features/backups/backup-panel';
import {ClaimsPanel} from '../features/claims/claims-panel';
import {ConnectorsPanel} from '../features/connectors/connectors-panel';
import {DeletionPanel} from '../features/deletion/deletion-panel';
import {DocumentsPanel} from '../features/documents/documents-panel';
import {LeadsPanel} from '../features/leads/leads-panel';
import {ProvenancePanel} from '../features/provenance/provenance-panel';
import {withEnds} from '../features/relationship-graph/graph';
import {RelationshipGraphPanel} from '../features/relationship-graph/relationship-graph-panel';
import {ReviewQueuePanel} from '../features/review-queue/review-queue-panel';
import {SearchPanel} from '../features/search/search-panel';
import {SecurityPanel} from '../features/security/security-panel';
import {SourceCapturePanel} from '../features/source-capture/source-capture-panel';
import {TimelinePanel} from '../features/timeline/timeline-panel';
import {api} from '../lib/api-instance';
import type {CitationDetail} from '../lib/api-types';
import {ApiPayloadError} from '../lib/api-validate';
import {filterHiddenDemo} from '../lib/demo-preference';
import {
  connectorsOptions, getInvestigationGraphOptions, listInvestigationEvidenceOptions, listInvestigationsOptions, listInvestigationsQueryKey, listSourcesOptions,
} from '../lib/generated/@tanstack/react-query.gen';
import type {InvestigationOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {reportPayloadError} from '../lib/report-error';
import {useWorkbenchStore} from '../lib/workbench-store';

const NO_INVESTIGATIONS: InvestigationOut[] = [];
const DEFAULT_PROVIDERS = ['aleph'];

// The selected investigation is shared state (lib/workbench-store.ts) and
// lives in the address bar as ?inv=, so a reload or a shared link opens the
// same case (Foundation Fixes fix 3). window.history, not the Next router:
// it changes only the address, without a navigation.
function rememberInvestigation(id: string): void {
  useWorkbenchStore.getState().setInvestigationId(id);
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('inv', id); else url.searchParams.delete('inv');
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
}

function investigationToOpen(rows: InvestigationOut[]): string {
  const wanted = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('inv');
  return (rows.find(r => r.id === wanted) || rows[0])?.id || '';
}

// The page provides the shared data cache its panels use (Foundation Fixes fix 3).
export default function Home(): ReactElement {
  return <QueryProvider><Workbench/></QueryProvider>;
}

function Workbench(): ReactElement {
  const queryClient = useQueryClient();
  const access = useApiAccess();
  const inv = useWorkbenchStore(state => state.investigationId);
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const openRelationship = useWorkbenchStore(state => state.openRelationship);

  // A reply of the wrong shape that no panel caught is reported as a toast.
  useEffect(() => {
    const handle = (event: PromiseRejectionEvent) => { if (event.reason instanceof ApiPayloadError) { event.preventDefault(); reportPayloadError(event.reason); } };
    window.addEventListener('unhandledrejection', handle);
    return () => window.removeEventListener('unhandledrejection', handle);
  }, []);

  // The investigation list and the connector names are asked for once the
  // access check has passed.
  const investigationsQuery = useQuery({...listInvestigationsOptions(), enabled: access.ready, select: filterHiddenDemo});
  const connectorsQuery = useQuery({...connectorsOptions(), enabled: access.ready});
  const investigations = investigationsQuery.data ?? NO_INVESTIGATIONS;
  const providers = connectorsQuery.data?.providers ?? DEFAULT_PROVIDERS;

  // When the list arrives (on load, after a restore, after a deletion) and
  // the open case is not in it, the case named in ?inv= opens, or the first listed.
  const rows = investigationsQuery.data;
  useEffect(() => {
    if (!rows) return;
    if (!rows.some(r => r.id === useWorkbenchStore.getState().investigationId)) rememberInvestigation(investigationToOpen(rows));
  }, [rows]);

  // What the page reads from the case for its wiring: the sources and
  // evidence (counts for the capture panel) and the graph (names for the
  // claims panel), from the same cache entries the panels use.
  const path = {investigation_id: inv};
  const sourcesQuery = useQuery({...listSourcesOptions({path}), enabled: Boolean(inv)});
  const evidenceQuery = useQuery({...listInvestigationEvidenceOptions({path}), enabled: Boolean(inv)});
  const graphQuery = useQuery({...getInvestigationGraphOptions({path}), enabled: Boolean(inv)});
  const relationships = (graphQuery.data?.edges ?? []).filter(withEnds);

  // After BackupPanel restores an archive: open it, and list it.
  const afterInvestigationRestored = async (id: string) => {
    rememberInvestigation(id);
    await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
  };
  // After DeletionPanel deletes an investigation: the list is read again, and the first one left opens.
  const afterInvestigationDeleted = async () => { await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()}); };
  // The case closes with the session; the address keeps ?inv=, so the recheck reopens it.
  const clearApiSession = async () => { useWorkbenchStore.getState().setInvestigationId(''); await access.clearApiSession(); };

  // A cited record in a presentation draft's preview -> the same provenance drawer every other trace link opens.
  const traceCitation = (d: CitationDetail) => {
    const base = {title: d.label, kind: d.type_label.toLowerCase(), detail: d.quote || d.detail || undefined, locator: d.locator || undefined, sourceUrl: d.source_url || undefined};
    const t = d.trace_record_type;
    if (t === 'entity') openProvenance({...base, entityId: d.record_id});
    else if (t === 'claim' || t === 'evidence') openProvenance({...base, acceptedRecordType: t, acceptedRecordId: d.record_id});
    else if (t === 'relationship' || t === 'lead' || t === 'task') openProvenance({...base, traceRecordType: t, acceptedRecordId: d.record_id});
    else if (t === 'source') openProvenance({...base, sourceId: d.record_id});
    else if (t === 'document') openProvenance({...base, documentId: d.record_id});
  };

  const picker = <Select value={inv} onValueChange={rememberInvestigation}>
    <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
    <SelectContent>{investigations.map(i => <SelectItem value={i.id} key={i.id}>{i.name}</SelectItem>)}</SelectContent>
  </Select>;

  return <main className="shell">
    <div className="top">
      <strong>JOURNALISM WORKBENCH</strong>
      <span>
        <a className="badge" href="/console/" style={{marginRight: 8}}>backend console</a>
        <Badge variant="outline" className="badge">DEV 1.18</Badge>
        <Badge variant="outline" className="badge" title={access.message} data-testid="api-access-badge">
          {access.state === 'authenticated' ? 'API: session active' : access.state === 'local' ? 'API: local access' : access.state === 'needs_token' ? 'API: token needed'
            : access.state === 'remote_disabled' ? 'API: remote disabled' : access.state === 'error' ? 'API: connection error' : 'API: checking…'}
        </Badge>
        {access.state === 'authenticated' && <Button size="sm" variant="outline" onClick={clearApiSession}>Clear session token</Button>}
      </span>
    </div>
    {(access.state === 'needs_token' || access.state === 'error') && <PanelErrorBoundary name="API access"><ApiAccessPanel message={access.message} onConnect={access.connectWithToken}/></PanelErrorBoundary>}

    <section className="hero"><span className="accent">FollowTheMoney-centered review</span><h1>External data stays evidence until a reporter decides what it means.</h1><p>Search Aleph or OpenSanctions, preserve raw findings and provenance, resolve identity separately, then assess individual statements. Accepted values can be explicitly promoted into the canonical graph with provider and source provenance.</p></section>
    <div className="section-group"><h4 className="group-label">Search &amp; discovery</h4><div className="page-grid-2">
      <PanelErrorBoundary name="Investigation search"><SearchPanel investigationId={inv}/></PanelErrorBoundary>
      <PanelErrorBoundary name="Provenance trace"><ProvenancePanel investigationId={inv}/></PanelErrorBoundary>
    </div></div>

    <div className="section-group"><h4 className="group-label">Data portability &amp; timeline</h4><div className="section-stack">
      <PanelErrorBoundary name="Portable backup & restore"><BackupPanel investigationId={inv} onRestored={afterInvestigationRestored}>
        {access.settingsStatus && <PanelErrorBoundary name="Local security/settings status"><SecurityPanel settingsStatus={access.settingsStatus} providers={providers}/></PanelErrorBoundary>}
      </BackupPanel></PanelErrorBoundary>
      <PanelErrorBoundary name="Investigation timeline"><TimelinePanel investigationId={inv}/></PanelErrorBoundary>
    </div></div>

    <div className="section-group"><h4 className="group-label">Document workflow</h4><div className="section-stack">
      <PanelErrorBoundary name="Document ingestion & extraction"><DocumentsPanel investigationId={inv}/></PanelErrorBoundary>
      <PanelErrorBoundary name="Questions & reporting leads"><LeadsPanel investigationId={inv}/></PanelErrorBoundary>
    </div></div>
    <AiReasoningPanel api={api} investigationId={inv} status={access.settingsStatus?.ai} onTraceRecord={traceCitation}/>
    <div className="section-group"><h4 className="group-label">Investigation maintenance</h4><div className="page-grid-2">
      <PanelErrorBoundary name="Local investigation deletion"><DeletionPanel investigationId={inv} onDeleted={afterInvestigationDeleted}/></PanelErrorBoundary>
      <PanelErrorBoundary name="Source & exact evidence capture"><SourceCapturePanel investigationId={inv} sourceCount={sourcesQuery.data?.length ?? 0} evidenceCount={evidenceQuery.data?.length ?? 0}/></PanelErrorBoundary>
    </div></div>
    <PanelErrorBoundary name="Claim verification workspace"><ClaimsPanel investigationId={inv} relationships={relationships} onInspectRelationship={id => openRelationship({relationshipId: id})}/></PanelErrorBoundary>
    <PanelErrorBoundary name="External connectors"><ConnectorsPanel investigationId={inv} providers={providers} picker={picker}/></PanelErrorBoundary>
    <PanelErrorBoundary name="FollowTheMoney relationship graph"><RelationshipGraphPanel investigationId={inv}/></PanelErrorBoundary>
    <PanelErrorBoundary name="Review queue"><ReviewQueuePanel investigationId={inv}/></PanelErrorBoundary>
    <Toaster />
  </main>;
}
