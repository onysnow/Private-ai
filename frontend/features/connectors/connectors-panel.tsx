'use client';
// External connectors: search a provider for people, companies and
// identifiers, enrich one canonical entity with one provider or with every
// configured provider in one auditable session, and review the
// cross-provider clusters a session produces. What a connector finds stays
// a finding until a reporter decides what it means (the review queue). The
// card also holds the open entity's dossier (features/dossier). Moved out
// of app/page.tsx (Foundation Fixes fix 3); the calls and their reply
// checks are generated from the API schema (fix 2). The selected entity
// is shared state (lib/workbench-store.ts): the graph and the dossier move it.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement, ReactNode} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {
  enrichmentSessionClustersOptions, enrichmentSessionClustersQueryKey, listConnectorFindingsQueryKey, listEntitiesOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {connectorSearch, decideCrossProviderCluster, enrichEntity, enrichEntityMulti} from '../../lib/generated/sdk.gen';
import type {EnrichmentClusterOut, EntityOut} from '../../lib/generated/types.gen';
import {reportPayloadError} from '../../lib/report-error';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Props = {
  investigationId: string;
  /** The connector names the server reported. */
  providers: string[];
  /** The page's investigation picker, shown beside the provider picker. */
  picker?: ReactNode;
};

// One empty list while the entities load, so the effect below sees the same value.
const NO_ENTITIES: EntityOut[] = [];

export function ConnectorsPanel({investigationId, providers, picker}: Props): ReactElement {
  const queryClient = useQueryClient();
  const entityId = useWorkbenchStore(state => state.entityId);
  const setEntityId = useWorkbenchStore(state => state.setEntityId);
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const [provider, setProvider] = useState('aleph');
  const [q, setQ] = useState('');
  const [enrichStatus, setEnrichStatus] = useState('');
  // The session whose clusters are shown; its clusters are a query keyed by it.
  const [clusterSession, setClusterSession] = useState('');

  const entitiesQuery = useQuery({...listEntitiesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const entities = entitiesQuery.data ?? NO_ENTITIES;
  const clustersQuery = useQuery({...enrichmentSessionClustersOptions({path: {session_id: clusterSession}}), enabled: Boolean(clusterSession)});
  const clusters: EnrichmentClusterOut[] = clusterSession ? clustersQuery.data ?? [] : [];

  // The selected entity follows the list: the first one when none is selected
  // or the selected one is gone.
  useEffect(() => {
    if (!entitiesQuery.data) return;
    const rows = entitiesQuery.data;
    const current = useWorkbenchStore.getState().entityId;
    if (!rows.some(x => x.id === current)) setEntityId(rows[0]?.id || '');
  }, [entitiesQuery.data, setEntityId]);

  // A new case starts without a running enrichment or its clusters.
  const enrichmentSerial = useRef(0);
  useEffect(() => { enrichmentSerial.current += 1; setEnrichStatus(''); setClusterSession(''); }, [investigationId]);

  const reloadFindings = () => queryClient.invalidateQueries({queryKey: listConnectorFindingsQueryKey({path: {investigation_id: investigationId}})});

  const search = async () => {
    if (!investigationId || !q) return;
    try {
      await connectorSearch({path: {provider}, body: {investigation_id: investigationId, query: q}, throwOnError: true});
      await reloadFindings();
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const enrich = async () => {
    if (!entityId) return;
    setEnrichStatus(`Running ${provider}…`);
    try {
      const rows = (await enrichEntity({path: {entity_id: entityId, provider}, throwOnError: true})).data;
      setEnrichStatus(`${provider}: ${rows.length} finding(s)`);
      await reloadFindings();
    } catch (error) {
      setEnrichStatus('');
      reportPayloadError(error);
    }
  };

  // Every provider in one session. A result that arrives after another run
  // started, or after the case changed, is dropped.
  const enrichAll = async () => {
    if (!entityId) return;
    const serial = ++enrichmentSerial.current;
    const current = () => enrichmentSerial.current === serial;
    setEnrichStatus('Running all configured connectors…');
    setClusterSession('');
    try {
      const session = (await enrichEntityMulti({path: {entity_id: entityId}, body: {providers}, throwOnError: true})).data;
      if (!current()) return;
      const summary = session.runs.map(x => `${x.provider}: ${x.status}${x.result_count ? ` (${x.result_count})` : ''}`).join(' · ');
      // The clusters are read into the shared cache before the session is shown, so both appear together.
      await queryClient.fetchQuery(enrichmentSessionClustersOptions({path: {session_id: session.id}}));
      if (!current()) return;
      setEnrichStatus(`${session.status} · ${summary}`);
      setClusterSession(session.id);
      await reloadFindings();
    } catch (error) {
      if (!current()) return;
      setEnrichStatus('');
      reportPayloadError(error);
    }
  };

  const decideCluster = async (c: EnrichmentClusterOut, decision: string) => {
    try {
      await decideCrossProviderCluster({path: {session_id: clusterSession}, body: {finding_ids: c.finding_ids, decision, confidence: decision === 'positive' ? 0.9 : 0.5}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: enrichmentSessionClustersQueryKey({path: {session_id: clusterSession}})});
    } catch (error) {
      reportPayloadError(error);
    }
  };

  return <Card className="card">
    <CardHeader className="pb-3"><CardTitle>External connectors</CardTitle></CardHeader>
    <CardContent>
      <div className="searchrow">
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
          <SelectContent>{providers.map(p => <SelectItem value={p} key={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        {picker}
      </div>
      <div className="searchrow">
        <Input value={q} onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="Search people, companies, identifiers..."/>
        <Button onClick={search}>Search</Button>
      </div>
      <h4>Enrich a canonical entity</h4>
      <div className="searchrow">
        <Select value={entityId} onValueChange={setEntityId}>
          <SelectTrigger className="w-auto"><SelectValue placeholder="Choose entity"/></SelectTrigger>
          <SelectContent>{entities.map(e => <SelectItem value={e.id} key={e.id}>{e.caption} · {e.schema}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => openDossier(entityId)} disabled={!entityId}>Open dossier</Button>
        <Button onClick={enrich} disabled={!entityId}>Enrich with {provider}</Button>
        <Button onClick={enrichAll} disabled={!entityId}>Enrich all providers</Button>
      </div>
      {enrichStatus && <p className="muted">{enrichStatus}</p>}
      <p className="muted">Multi-provider enrichment keeps one auditable session while each provider gets its own run, status, error, and result count. Successful providers are preserved if another provider fails.</p>
      {clusters.length > 0 && <div>
        <h4>Cross-provider candidates</h4>
        {clusters.map(c => <div className="candidate" key={c.cluster_key}>
          <b>{Math.round(c.score * 100)}% possible same outside entity</b>
          <div>{c.findings.map(f => <div key={f.id}>{f.provider}: {f.caption}</div>)}</div>
          <small>{(c.pairs[0]?.reasons ?? []).map(r => `${r.kind}: ${r.detail}`).join(' · ')}</small>
          <div>
            <Button onClick={() => decideCluster(c, 'positive')}>Same external entity</Button>
            <Button onClick={() => decideCluster(c, 'negative')}>Different</Button>
            <Button onClick={() => decideCluster(c, 'unsure')}>Unsure</Button>
          </div>
          {c.decision && <small>Latest decision: {c.decision.decision}</small>}
        </div>)}
      </div>}
    </CardContent>
  </Card>;
}
