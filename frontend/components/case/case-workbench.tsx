'use client';
// The case's screens (Workbench-redesign-2026.pdf, "Formats": the hybrid): Case
// home is one screen; each stage opens whole-screen at its own address
// (/bring-in, /check, /see, /act, /keep) and Decide at /decide. The panels are
// the existing ones, laid out per stage until each stage is redesigned.
//
// The workbench lives in the (case) layout, so it stays mounted while the
// reporter moves between these addresses: a stage's panels mount the first
// time it is opened and then keep their state. A request one panel makes of
// another (open this claim, this dossier, this relationship, this document)
// opens the stage that holds it.
//
// view="all" lays every stage out on one page, as the workbench used to be:
// the page tests use it (components/case/workbench-all.tsx).
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Toaster} from '@/components/ui/sonner';
import {AiReasoningPanel} from '../ai-reasoning-panel';
import {PanelErrorBoundary} from '../panel-error-boundary';
import {ApiAccessPanel} from '../../features/api-access/api-access-panel';
import {useApiAccess} from '../../features/api-access/use-api-access';
import {BackupPanel} from '../../features/backups/backup-panel';
import {CaseHome} from '../../features/case-home/case-home';
import {DecideScreen} from '../../features/case-home/decide-screen';
import {ChartBuilderPanel} from '../../features/charts/chart-builder-panel';
import {ClaimsPanel} from '../../features/claims/claims-panel';
import {ConnectorsPanel} from '../../features/connectors/connectors-panel';
import {CorpusPanel} from '../../features/corpus/corpus-panel';
import {DeletionPanel} from '../../features/deletion/deletion-panel';
import {DocumentsPanel} from '../../features/documents/documents-panel';
import {LeadsPanel} from '../../features/leads/leads-panel';
import {PlacesPanel} from '../../features/places/places-panel';
import {ProvenancePanel} from '../../features/provenance/provenance-panel';
import {withEnds} from '../../features/relationship-graph/graph';
import {StageRail, StageSection, StandingTiles, useStanding} from '../layout/workbench-page';
import {RedFlagsBoard} from '../../features/act/red-flags-board';
import {SectionScreen} from './section-screen';
import type {Section} from './section-screen';
import {YearSlider} from '../charts/year-slider';
import {RedFlagsPanel} from '../../features/red-flags/red-flags-panel';
import {ToCheckPanel} from '../../features/to-check/to-check-panel';
import {RelationshipGraphPanel} from '../../features/relationship-graph/relationship-graph-panel';
import {ReviewQueuePanel} from '../../features/review-queue/review-queue-panel';
import {SearchPanel} from '../../features/search/search-panel';
import {SecurityPanel} from '../../features/security/security-panel';
import {SourceCapturePanel} from '../../features/source-capture/source-capture-panel';
import {TimelinePanel} from '../../features/timeline/timeline-panel';
import {api} from '../../lib/api-instance';
import type {CitationDetail} from '../../lib/api-types';
import {ApiPayloadError} from '../../lib/api-validate';
import {filterHiddenDemo} from '../../lib/demo-preference';
import {
  connectorsOptions, getInvestigationGraphOptions, listInvestigationEvidenceOptions, listInvestigationsOptions, listInvestigationsQueryKey, listSourcesOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {InvestigationOut} from '../../lib/generated/types.gen';
import {caseHref} from '../../lib/case-href';
import {reportPayloadError} from '../../lib/report-error';
import {STAGES} from '../../lib/stages';
import type {StageKey} from '../../lib/stages';
import {useWorkbenchStore} from '../../lib/workbench-store';

const NO_INVESTIGATIONS: InvestigationOut[] = [];
const DEFAULT_PROVIDERS = ['aleph'];

export type CaseView = 'home' | 'decide' | StageKey | 'all';

/** The view an address shows ("/check/" and "/check" alike). */
export function viewOfPath(pathname: string | null): CaseView {
  const path = (pathname ?? '/').replace(/\/+$/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/decide') return 'decide';
  return STAGES.find(s => s.route === path)?.key ?? 'home';
}

// The selected investigation is shared state (lib/workbench-store.ts) and
// lives in the address bar as ?inv=, so a reload or a shared link opens the
// same case (Foundation Fixes fix 3). window.history, not the Next router:
// it changes only the address, without a navigation.
export function rememberInvestigation(id: string): void {
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

export {caseHref};

/** Which stage holds what a request asks for. */
const STAGE_OF_REQUEST: Record<'claim' | 'dossier' | 'relationship' | 'document' | 'flag' | 'check', StageKey> = {
  claim: 'verify', check: 'verify', dossier: 'collect', document: 'collect', relationship: 'map', flag: 'report',
};

export function CaseWorkbench({view: fixedView}: {view?: CaseView}): ReactElement {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const view: CaseView = fixedView ?? viewOfPath(pathname);
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

  const investigationsQuery = useQuery({...listInvestigationsOptions(), enabled: access.ready, select: filterHiddenDemo});
  const connectorsQuery = useQuery({...connectorsOptions(), enabled: access.ready});
  const investigations = investigationsQuery.data ?? NO_INVESTIGATIONS;
  const providers = connectorsQuery.data?.providers ?? DEFAULT_PROVIDERS;

  const rows = investigationsQuery.data;
  useEffect(() => {
    if (!rows) return;
    if (!rows.some(r => r.id === useWorkbenchStore.getState().investigationId)) rememberInvestigation(investigationToOpen(rows));
  }, [rows]);

  // A stage's panels mount the first time it is shown, then stay.
  const [opened, setOpened] = useState<Set<CaseView>>(() => new Set([view]));
  useEffect(() => { setOpened(prev => (prev.has(view) ? prev : new Set(prev).add(view))); }, [view]);
  const shown = (key: CaseView) => view === 'all' || view === key;
  const mounted = (key: CaseView) => view === 'all' || opened.has(key);

  // A request for a record another stage holds opens that stage.
  const seen = useRef<Record<string, number>>({});
  useEffect(() => {
    if (fixedView) return undefined;
    return useWorkbenchStore.subscribe(state => {
      for (const key of Object.keys(STAGE_OF_REQUEST) as (keyof typeof STAGE_OF_REQUEST)[]) {
        const req = state[key];
        if (!req || seen.current[key] === req.serial) continue;
        seen.current[key] = req.serial;
        const stage = STAGES.find(s => s.key === STAGE_OF_REQUEST[key]);
        if (stage && viewOfPath(window.location.pathname) !== stage.key) router.push(caseHref(stage.route, state.investigationId));
      }
    });
  }, [fixedView, router]);

  // After the view changes, the part named in the address is scrolled to (it was hidden when the browser looked).
  useEffect(() => {
    if (view === 'all' || view === 'home' || view === 'decide') return undefined;
    const timer = window.setTimeout(() => {
      const anchor = window.location.hash.replace('#', '');
      if (anchor) document.getElementById(anchor)?.scrollIntoView({block: 'start'});
    }, 60);
    return () => window.clearTimeout(timer);
  }, [view, pathname]);

  const path = {investigation_id: inv};
  const sourcesQuery = useQuery({...listSourcesOptions({path}), enabled: Boolean(inv) && mounted('collect')});
  const evidenceQuery = useQuery({...listInvestigationEvidenceOptions({path}), enabled: Boolean(inv) && mounted('collect')});
  const graphQuery = useQuery({...getInvestigationGraphOptions({path}), enabled: Boolean(inv) && mounted('verify')});
  const relationships = (graphQuery.data?.edges ?? []).filter(withEnds);

  const afterInvestigationRestored = async (id: string) => {
    rememberInvestigation(id);
    await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
  };
  const afterInvestigationDeleted = async () => { await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()}); };
  const clearApiSession = async () => { useWorkbenchStore.getState().setInvestigationId(''); await access.clearApiSession(); };

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
    <SelectTrigger className="w-auto" aria-label="Switch case"><SelectValue/></SelectTrigger>
    <SelectContent>{investigations.map(i => <SelectItem value={i.id} key={i.id}>{i.name}</SelectItem>)}</SelectContent>
  </Select>;

  const investigation = investigations.find(i => i.id === inv);
  const investigationName = investigation?.name ?? '';
  useEffect(() => { useWorkbenchStore.getState().setInvestigationName(investigationName); }, [investigationName]);
  const provenance = useWorkbenchStore(state => state.provenance);
  const clearProvenance = useWorkbenchStore(state => state.clearProvenance);
  const accessLabel = access.state === 'authenticated' ? 'API: session active' : access.state === 'local' ? 'API: local access' : access.state === 'needs_token' ? 'API: token needed'
    : access.state === 'remote_disabled' ? 'API: remote disabled' : access.state === 'error' ? 'API: connection error' : 'API: checking…';
  const accessProblem = access.state === 'needs_token' || access.state === 'error';

  const stage = (key: StageKey, children: ReactNode) => mounted(key) && <div className={view === 'all' ? undefined : 'cv-stage'} hidden={!shown(key)} data-view={key}>
    {view !== 'all' && <StageHeader stageKey={key} investigationName={investigationName}/>}
    <StageSection stage={key}>{children}</StageSection>
  </div>;

  /** A stage's own page: its sections as tabs, one filling the screen (components/case/section-screen.tsx). */
  const screen = (key: StageKey, sections: Section[]) => mounted(key) && <div className="cv-screen" hidden={!shown(key)} data-view={key}>
    <SectionScreen stage={key} investigationName={investigationName} sections={sections} active={view === key}/>
  </div>;

  const body = <>
    {accessProblem && <PanelErrorBoundary name="API access"><ApiAccessPanel message={access.message} onConnect={access.connectWithToken}/></PanelErrorBoundary>}
    {view !== 'all' && mounted('home') && <div hidden={!shown('home')} className="cv-home-wrap">
      <PanelErrorBoundary name="Case home"><CaseHome investigation={investigation ?? null} investigations={investigations} onSwitch={rememberInvestigation}
        loading={!rows && !investigationsQuery.isError} active={view === 'home'}/></PanelErrorBoundary>
    </div>}
    {view !== 'all' && mounted('decide') && <div hidden={!shown('decide')} className="cv-home-wrap">
      <PanelErrorBoundary name="Decide"><DecideScreen investigationId={inv} investigationName={investigationName} active={view === 'decide'}/></PanelErrorBoundary>
    </div>}

    {view === 'all' ? <>
      {stage('collect', <>
        <PanelErrorBoundary name="Investigation search"><SearchPanel investigationId={inv}/></PanelErrorBoundary>
        <div className="wb-row">
          <div><PanelErrorBoundary name="The Drop"><DocumentsPanel investigationId={inv}/></PanelErrorBoundary></div>
          <div id="source-capture"><PanelErrorBoundary name="Source & exact evidence capture"><SourceCapturePanel investigationId={inv} sourceCount={sourcesQuery.data?.length ?? 0} evidenceCount={evidenceQuery.data?.length ?? 0}/></PanelErrorBoundary></div>
        </div>
        <div id="connectors"><PanelErrorBoundary name="External connectors"><ConnectorsPanel investigationId={inv} providers={providers} picker={picker}/></PanelErrorBoundary></div>
        <PanelErrorBoundary name="OpenAleph corpus"><CorpusPanel investigationId={inv}/></PanelErrorBoundary>
      </>)}

      {stage('verify', <>
        <PanelErrorBoundary name="Claim verification workspace"><ClaimsPanel investigationId={inv} relationships={relationships} onInspectRelationship={id => openRelationship({relationshipId: id})}/></PanelErrorBoundary>
        <PanelErrorBoundary name="To check"><ToCheckPanel investigationId={inv}/></PanelErrorBoundary>
        <div id="review-queue"><PanelErrorBoundary name="Review queue"><ReviewQueuePanel investigationId={inv}/></PanelErrorBoundary></div>
      </>)}

      {stage('map', <>
        <YearSlider investigationId={inv}/>
        <PanelErrorBoundary name="FollowTheMoney relationship graph"><RelationshipGraphPanel investigationId={inv}/></PanelErrorBoundary>
        <div id="timeline"><PanelErrorBoundary name="Investigation timeline"><TimelinePanel investigationId={inv}/></PanelErrorBoundary></div>
        <div id="places"><PanelErrorBoundary name="Places"><PlacesPanel investigationId={inv}/></PanelErrorBoundary></div>
      </>)}

      {stage('report', <>
        <PanelErrorBoundary name="Red Flags"><RedFlagsPanel investigationId={inv}/></PanelErrorBoundary>
        <PanelErrorBoundary name="Questions & reporting leads"><LeadsPanel investigationId={inv}/></PanelErrorBoundary>
        <div id="chart-builder"><PanelErrorBoundary name="Chart builder"><ChartBuilderPanel key={inv} investigationId={inv}/></PanelErrorBoundary></div>
        <AiReasoningPanel api={api} investigationId={inv} status={access.settingsStatus?.ai} onTraceRecord={traceCitation}/>
      </>)}

      {stage('keep', <>
        <div className="wb-row">
          <PanelErrorBoundary name="Portable backup & restore"><BackupPanel investigationId={inv} onRestored={afterInvestigationRestored}/></PanelErrorBoundary>
          <div id="deletion"><PanelErrorBoundary name="Local investigation deletion"><DeletionPanel investigationId={inv} onDeleted={afterInvestigationDeleted}/></PanelErrorBoundary></div>
        </div>
        {access.settingsStatus && <div id="access"><PanelErrorBoundary name="Local security/settings status"><SecurityPanel settingsStatus={access.settingsStatus} providers={providers}/></PanelErrorBoundary></div>}
      </>)}
    </> : <>
      {screen('collect', [
        {anchor: 'investigation-search', label: 'Search', render: () => <PanelErrorBoundary name="Investigation search"><SearchPanel investigationId={inv}/></PanelErrorBoundary>},
        {anchor: 'document-ingestion', label: 'Documents', render: () => <PanelErrorBoundary name="The Drop"><DocumentsPanel investigationId={inv}/></PanelErrorBoundary>},
        {anchor: 'source-capture', label: 'Sources & evidence', render: () => <PanelErrorBoundary name="Source & exact evidence capture">
          <SourceCapturePanel investigationId={inv} sourceCount={sourcesQuery.data?.length ?? 0} evidenceCount={evidenceQuery.data?.length ?? 0}/></PanelErrorBoundary>},
        {anchor: 'connectors', label: 'Connectors', render: () => <PanelErrorBoundary name="External connectors"><ConnectorsPanel investigationId={inv} providers={providers} picker={picker}/></PanelErrorBoundary>},
        {anchor: 'corpus', label: 'OpenAleph corpus', render: () => <PanelErrorBoundary name="OpenAleph corpus"><CorpusPanel investigationId={inv}/></PanelErrorBoundary>},
      ])}
      {screen('verify', [
        {anchor: 'claim-verification', label: 'Claims', render: () => <PanelErrorBoundary name="Claim verification workspace">
          <ClaimsPanel investigationId={inv} relationships={relationships} onInspectRelationship={id => openRelationship({relationshipId: id})}/></PanelErrorBoundary>},
        {anchor: 'to-check', label: 'To check', render: () => <PanelErrorBoundary name="To check"><ToCheckPanel investigationId={inv}/></PanelErrorBoundary>},
        {anchor: 'review-queue', label: 'Connector findings', render: () => <PanelErrorBoundary name="Review queue"><ReviewQueuePanel investigationId={inv}/></PanelErrorBoundary>},
      ])}
      {screen('map', [
        {anchor: 'relationship-graph', label: 'Relationships', render: () => <><YearSlider investigationId={inv}/>
          <PanelErrorBoundary name="FollowTheMoney relationship graph"><RelationshipGraphPanel investigationId={inv}/></PanelErrorBoundary></>},
        {anchor: 'timeline', label: 'Timeline', render: () => <PanelErrorBoundary name="Investigation timeline"><TimelinePanel investigationId={inv}/></PanelErrorBoundary>},
        {anchor: 'places', label: 'Places', render: () => <PanelErrorBoundary name="Places"><PlacesPanel investigationId={inv}/></PanelErrorBoundary>},
      ])}
      {screen('report', [
        {anchor: 'red-flags', label: 'Red Flags', fill: true, render: () => <PanelErrorBoundary name="Red Flags"><RedFlagsBoard investigationId={inv}/></PanelErrorBoundary>},
        {anchor: 'leads', label: 'Leads', render: () => <PanelErrorBoundary name="Questions & reporting leads"><LeadsPanel investigationId={inv}/></PanelErrorBoundary>},
        {anchor: 'chart-builder', label: 'Charts', render: () => <PanelErrorBoundary name="Chart builder"><ChartBuilderPanel key={inv} investigationId={inv}/></PanelErrorBoundary>},
        {anchor: 'ai-reasoning-panel', label: 'AI drafts', render: () => <AiReasoningPanel api={api} investigationId={inv} status={access.settingsStatus?.ai} onTraceRecord={traceCitation}/>},
      ])}
      {screen('keep', [
        {anchor: 'backup-restore', label: 'Backup & restore', render: () => <PanelErrorBoundary name="Portable backup & restore"><BackupPanel investigationId={inv} onRestored={afterInvestigationRestored}/></PanelErrorBoundary>},
        {anchor: 'deletion', label: 'Delete', render: () => <PanelErrorBoundary name="Local investigation deletion"><DeletionPanel investigationId={inv} onDeleted={afterInvestigationDeleted}/></PanelErrorBoundary>},
        ...(access.settingsStatus ? [{anchor: 'access', label: 'Access', render: () => <PanelErrorBoundary name="Local security/settings status">
          <SecurityPanel settingsStatus={access.settingsStatus!} providers={providers}/></PanelErrorBoundary>}] : []),
      ])}
    </>}
  </>;

  const drawer = <aside className="wb-drawer" hidden={!provenance} aria-label="Chain of Custody">
    <button type="button" className="wb-drawer-close" onClick={clearProvenance} aria-label="Close Chain of Custody">×</button>
    <PanelErrorBoundary name="Chain of Custody"><ProvenancePanel investigationId={inv}/></PanelErrorBoundary>
  </aside>;

  if (view === 'all') return <AllStages investigationName={investigationName} picker={investigations.length > 0 ? picker : null}
    accessLabel={accessLabel} accessMessage={access.message} onClear={access.state === 'authenticated' ? clearApiSession : null} drawer={drawer}>{body}</AllStages>;

  return <div className="cv" data-view={view}>
    {body}
    {drawer}
    <Toaster/>
  </div>;
}

/** A stage's whole-screen page: its name, what it is for, and its parts. */
function StageHeader({stageKey, investigationName}: {stageKey: StageKey; investigationName: string}): ReactElement {
  const s = STAGES.find(x => x.key === stageKey)!;
  const inv = useWorkbenchStore(state => state.investigationId);
  return <header className="cv-stage-head" style={{['--stage' as string]: s.colour}}>
    <div>
      <p className="cv-eyebrow">{investigationName || 'No case open'} · step {s.n} of 5</p>
      <h1>{s.name}</h1>
      <p className="cv-line">{s.line}</p>
    </div>
    <nav aria-label={`Parts of ${s.name}`} className="cv-parts">
      {s.parts.map(p => <a key={p.anchor} href={caseHref(`${s.route}#${p.anchor}`, inv)}
        onClick={event => { const el = document.getElementById(p.anchor); if (el) { event.preventDefault(); el.scrollIntoView({behavior: 'smooth', block: 'start'}); window.history.replaceState(window.history.state, '', `#${p.anchor}`); } }}>{p.label}</a>)}
    </nav>
  </header>;
}

/** Every stage on one page, as the workbench used to be (the page tests use it). */
function AllStages({investigationName, picker, accessLabel, accessMessage, onClear, drawer, children}: {
  investigationName: string; picker: ReactNode; accessLabel: string; accessMessage: string; onClear: (() => void) | null; drawer: ReactNode; children: ReactNode;
}): ReactElement {
  const inv = useWorkbenchStore(state => state.investigationId);
  const standing = useStanding(inv);
  const focusSearch = () => {
    document.getElementById('investigation-search')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    document.querySelector<HTMLInputElement>('#investigation-search input')?.focus();
  };
  return <div className="wb-page">
    <StageRail investigationName={investigationName} standing={standing}/>
    <main className="wb-main">
      <header className="wb-head">
        <div>
          <p className="wb-eyebrow">The case</p>
          <h1>{investigationName || 'Journalism Workbench'}</h1>
          <p className="wb-tagline">Outside data stays evidence until a reporter decides what it means.</p>
        </div>
        <div className="wb-actions">
          {picker}
          <Button variant="outline" onClick={focusSearch}>Search records ⌘K</Button>
          <Button asChild><a href="#document-ingestion">Add a document</a></Button>
          <Badge variant="outline" className="badge" title={accessMessage} data-testid="api-access-badge">{accessLabel}</Badge>
          {onClear && <Button size="sm" variant="outline" onClick={onClear}>Clear session token</Button>}
        </div>
      </header>
      <StandingTiles standing={standing}/>
      {children}
    </main>
    {drawer}
    <Toaster/>
  </div>;
}
