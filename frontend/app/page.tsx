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
import {ChartBuilderPanel} from '../features/charts/chart-builder-panel';
import {ClaimsPanel} from '../features/claims/claims-panel';
import {ConnectorsPanel} from '../features/connectors/connectors-panel';
import {CorpusPanel} from '../features/corpus/corpus-panel';
import {DeletionPanel} from '../features/deletion/deletion-panel';
import {DocumentsPanel} from '../features/documents/documents-panel';
import {LeadsPanel} from '../features/leads/leads-panel';
import {PlacesPanel} from '../features/places/places-panel';
import {ProvenancePanel} from '../features/provenance/provenance-panel';
import {withEnds} from '../features/relationship-graph/graph';
import {StageRail, StageSection, StandingTiles, useStanding} from '../components/layout/workbench-page';
import {YearSlider} from '../components/charts/year-slider';
import {RedFlagsPanel} from '../features/red-flags/red-flags-panel';
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

  const standing = useStanding(inv);
  const investigationName = investigations.find(i => i.id === inv)?.name ?? '';
  const provenance = useWorkbenchStore(state => state.provenance);
  const clearProvenance = useWorkbenchStore(state => state.clearProvenance);
  // "Search records" in the header: the search box, as ⌘K does.
  const focusSearch = () => {
    document.getElementById('investigation-search')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    document.querySelector<HTMLInputElement>('#investigation-search input')?.focus();
  };
  const accessLabel = access.state === 'authenticated' ? 'API: session active' : access.state === 'local' ? 'API: local access' : access.state === 'needs_token' ? 'API: token needed'
    : access.state === 'remote_disabled' ? 'API: remote disabled' : access.state === 'error' ? 'API: connection error' : 'API: checking…';

  // The five-stage page (docs/discovery/README.md, page-by-page audit; the
  // approved page mockup): the rail of stages stays on screen; the header
  // says what is open and where things stand; one numbered section per stage.
  return <div className="wb-page">
    <StageRail investigationName={investigationName} standing={standing}/>
    <main className="wb-main">
      <header className="wb-head">
        <div>
          <p className="wb-eyebrow">FollowTheMoney-centred review</p>
          <h1>{investigationName || 'Journalism Workbench'}</h1>
          <p className="wb-tagline">External data stays evidence until a reporter decides what it means.</p>
        </div>
        <div className="wb-actions">
          {investigations.length > 0 && picker}
          <Button variant="outline" onClick={focusSearch}>Search records ⌘K</Button>
          <Button asChild><a href="#document-ingestion">Add a document</a></Button>
          <Badge variant="outline" className="badge" title={access.message} data-testid="api-access-badge">{accessLabel}</Badge>
          {access.state === 'authenticated' && <Button size="sm" variant="outline" onClick={clearApiSession}>Clear session token</Button>}
        </div>
      </header>
      {(access.state === 'needs_token' || access.state === 'error') && <PanelErrorBoundary name="API access"><ApiAccessPanel message={access.message} onConnect={access.connectWithToken}/></PanelErrorBoundary>}
      <StandingTiles standing={standing}/>

      <StageSection stage="collect">
        <PanelErrorBoundary name="Investigation search"><SearchPanel investigationId={inv}/></PanelErrorBoundary>
        <div className="wb-row">
          <div><PanelErrorBoundary name="The Drop"><DocumentsPanel investigationId={inv}/></PanelErrorBoundary></div>
          <div id="source-capture"><PanelErrorBoundary name="Source & exact evidence capture"><SourceCapturePanel investigationId={inv} sourceCount={sourcesQuery.data?.length ?? 0} evidenceCount={evidenceQuery.data?.length ?? 0}/></PanelErrorBoundary></div>
        </div>
        <div id="connectors"><PanelErrorBoundary name="External connectors"><ConnectorsPanel investigationId={inv} providers={providers} picker={picker}/></PanelErrorBoundary></div>
        <PanelErrorBoundary name="OpenAleph corpus"><CorpusPanel investigationId={inv}/></PanelErrorBoundary>
      </StageSection>

      <StageSection stage="verify">
        <PanelErrorBoundary name="Claim verification workspace"><ClaimsPanel investigationId={inv} relationships={relationships} onInspectRelationship={id => openRelationship({relationshipId: id})}/></PanelErrorBoundary>
        <div id="review-queue"><PanelErrorBoundary name="Review queue"><ReviewQueuePanel investigationId={inv}/></PanelErrorBoundary></div>
      </StageSection>

      <StageSection stage="map">
        <YearSlider investigationId={inv}/>
        <PanelErrorBoundary name="FollowTheMoney relationship graph"><RelationshipGraphPanel investigationId={inv}/></PanelErrorBoundary>
        <div id="timeline"><PanelErrorBoundary name="Investigation timeline"><TimelinePanel investigationId={inv}/></PanelErrorBoundary></div>
        <div id="places"><PanelErrorBoundary name="Places"><PlacesPanel investigationId={inv}/></PanelErrorBoundary></div>
      </StageSection>

      <StageSection stage="report">
        <PanelErrorBoundary name="Red Flags"><RedFlagsPanel investigationId={inv}/></PanelErrorBoundary>
        <PanelErrorBoundary name="Questions & reporting leads"><LeadsPanel investigationId={inv}/></PanelErrorBoundary>
        {/* A chart from the records without the AI; keyed by case, so a new case starts a new chart. */}
        <div id="chart-builder"><PanelErrorBoundary name="Chart builder"><ChartBuilderPanel key={inv} investigationId={inv}/></PanelErrorBoundary></div>
        <AiReasoningPanel api={api} investigationId={inv} status={access.settingsStatus?.ai} onTraceRecord={traceCitation}/>
      </StageSection>

      <StageSection stage="keep">
        <div className="wb-row">
          <PanelErrorBoundary name="Portable backup & restore"><BackupPanel investigationId={inv} onRestored={afterInvestigationRestored}/></PanelErrorBoundary>
          <div id="deletion"><PanelErrorBoundary name="Local investigation deletion"><DeletionPanel investigationId={inv} onDeleted={afterInvestigationDeleted}/></PanelErrorBoundary></div>
        </div>
        {access.settingsStatus && <div id="access"><PanelErrorBoundary name="Local security/settings status"><SecurityPanel settingsStatus={access.settingsStatus} providers={providers}/></PanelErrorBoundary></div>}
      </StageSection>
    </main>
    {/* Chain of Custody: the trace opens beside the page from any "Trace" button (README, page-by-page audit). */}
    <aside className="wb-drawer" hidden={!provenance} aria-label="Chain of Custody">
      <button type="button" className="wb-drawer-close" onClick={clearProvenance} aria-label="Close Chain of Custody">×</button>
      <PanelErrorBoundary name="Chain of Custody"><ProvenancePanel investigationId={inv}/></PanelErrorBoundary>
    </aside>
    <Toaster />
  </div>;
}
