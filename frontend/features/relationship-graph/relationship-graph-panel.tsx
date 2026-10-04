'use client';
// The FollowTheMoney relationship graph: every edge is a canonical FtM
// interstitial entity between two canonical entities. The card adds an
// entity by hand, adds a relationship (with the Payment properties the
// money-flow ledger reads), filters the drawing by schema, shows reviewed
// duplicate edges collapsed to the reporter-preferred record (or expanded),
// opens one relationship's evidence and assessments, lists every edge, and
// holds the money flows. Moved out of app/page.tsx (Foundation Fixes fix
// 3); the calls and their reply checks are generated from the API schema
// (fix 2). The graph, the entities and the evidence pool are queries keyed
// by the investigation; saving a relationship or an entity marks the
// related ones stale. Any panel asks for a relationship to be opened
// through the shared store (lib/workbench-store.ts); this panel answers.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Table, TableBody, TableCell, TableRow} from '@/components/ui/table';
import type {EntityFormSubmitPayload} from '../../components/entity-form';
import {
  getInvestigationFinancialFlowsQueryKey, getInvestigationGraphOptions, getInvestigationGraphQueryKey, listEntitiesOptions, listEntitiesQueryKey,
  listInvestigationEvidenceOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {createCanonicalRelationship, createEntity} from '../../lib/generated/sdk.gen';
import type {EntityOut, GraphOut} from '../../lib/generated/types.gen';
import {reportPayloadError} from '../../lib/report-error';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {Graph, withEnds} from './graph';
import type {GraphEdge} from './graph';
import {MoneyFlows} from './money-flows';
import {RelationshipDetail} from './relationship-detail';

// The entity form is loaded on demand so it stays out of the page's first load.
const EntityForm = dynamic(() => import('../../components/entity-form').then(m => m.EntityForm), {ssr: false, loading: () => <p className="muted">Loading form…</p>});

type Props = {investigationId: string};

const RELATIONSHIP_SCHEMAS = ['Ownership', 'Directorship', 'Membership', 'Employment', 'Payment', 'UnknownLink'];
const NO_ENTITIES: EntityOut[] = [];
const NO_RECONCILIATION: GraphOut['reconciliation'] = {collapsed_by_default: true, suppressed_duplicate_count: 0, underlying_edge_count: 0, visible_edge_count: 0};

/** The graph query of a case: collapsed to preferred edges, or with every reviewed duplicate copy. */
function graphOptions(investigationId: string, includeDuplicates: boolean): ReturnType<typeof getInvestigationGraphOptions> {
  return getInvestigationGraphOptions({path: {investigation_id: investigationId}, ...(includeDuplicates ? {query: {include_reconciled_duplicates: true}} : {})});
}

export function RelationshipGraphPanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const asked = useWorkbenchStore(state => state.relationship);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [edge, setEdge] = useState<GraphEdge | null>(null);
  // Counts how often a relationship was opened, so opening one starts its detail afresh.
  const [opened, setOpened] = useState(0);
  const [relSchema, setRelSchema] = useState('Ownership');
  const [relSource, setRelSource] = useState('');
  const [relTarget, setRelTarget] = useState('');
  const [relRole, setRelRole] = useState('');
  const [relEvidence, setRelEvidence] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payPurpose, setPayPurpose] = useState('');
  const [ledgerWanted, setLedgerWanted] = useState(false);

  const enabled = Boolean(investigationId);
  const path = {investigation_id: investigationId};
  const entitiesQuery = useQuery({...listEntitiesOptions({path}), enabled});
  const graphQuery = useQuery({...graphOptions(investigationId, includeDuplicates), enabled});
  const evidenceQuery = useQuery({...listInvestigationEvidenceOptions({path}), enabled});
  const entities = entitiesQuery.data ?? NO_ENTITIES;
  const graph = graphQuery.data;
  const relationships: GraphEdge[] = useMemo(() => (graph?.edges ?? []).filter(withEnds), [graph]);
  const reconciliation = graph?.reconciliation ?? NO_RECONCILIATION;
  const evidencePool = evidenceQuery.data ?? [];

  // A new case starts with nothing opened, no ledger asked for, and its own
  // schema filter (set from its graph below; it used to keep the last case's,
  // which could hide every relationship of the new one).
  useEffect(() => { setEdge(null); setLedgerWanted(false); }, [investigationId]);

  // The form's endpoints follow the entity list: the first two entities
  // unless the chosen ones are still listed.
  useEffect(() => {
    const rows = entitiesQuery.data;
    if (!rows) return;
    setRelSource(current => (rows.some(x => x.id === current) ? current : rows[0]?.id || ''));
    setRelTarget(current => (rows.some(x => x.id === current) ? current : rows[1]?.id || rows[0]?.id || ''));
  }, [entitiesQuery.data]);

  // A failed graph load is reported the way the page reported it, once per failure.
  const reported = useRef<unknown>(null);
  useEffect(() => {
    const error = graphQuery.error ?? entitiesQuery.error;
    if (error && reported.current !== error) { reported.current = error; reportPayloadError(error); }
  }, [graphQuery.error, entitiesQuery.error]);

  const openEdge = (r: GraphEdge) => { setEdge(r); setOpened(n => n + 1); };

  // Each request to open a relationship is answered once: with the record
  // the asker passed, or with this panel's copy of the edge.
  const answered = useRef(0);
  useEffect(() => {
    if (!asked || asked.serial === answered.current) return;
    const record = asked.request.record ?? relationships.find(r => r.id === asked.request.relationshipId);
    if (!record || !withEnds(record)) return;
    answered.current = asked.serial;
    openEdge(record);
  }, [asked, relationships]);

  const reloadGraph = () => queryClient.invalidateQueries({queryKey: getInvestigationGraphQueryKey({path})});
  const reloadEntities = () => queryClient.invalidateQueries({queryKey: listEntitiesQueryKey({path})});

  const createEntityManually = async (payload: EntityFormSubmitPayload): Promise<void> => {
    if (!investigationId) throw new Error('Choose an investigation first.');
    await createEntity({body: {investigation_id: investigationId, schema: payload.schema, caption: payload.caption, properties: payload.properties}, throwOnError: true});
    await reloadEntities();
  };

  // A new relationship changes the graph and, if it is a payment, the money flows.
  const createRelationship = async () => {
    if (!investigationId || !relSource || !relTarget || relSource === relTarget) return;
    const properties: Record<string, string[]> = {};
    if (relRole.trim()) properties.role = [relRole.trim()];
    if (relSchema === 'Payment') {
      if (payAmount.trim()) properties.amount = [payAmount.trim()];
      if (payCurrency.trim()) properties.currency = [payCurrency.trim()];
      if (payDate.trim()) properties.date = [payDate.trim()];
      if (payPurpose.trim()) properties.purpose = [payPurpose.trim()];
    }
    try {
      await createCanonicalRelationship({
        body: {investigation_id: investigationId, schema: relSchema, source_entity_id: relSource, target_entity_id: relTarget, properties, dataset: 'reporter', evidence_id: relEvidence || null},
        throwOnError: true,
      });
      setRelRole(''); setPayAmount(''); setPayCurrency(''); setPayDate(''); setPayPurpose('');
      await reloadGraph();
      await reloadEntities();
      if (relSchema === 'Payment') await queryClient.invalidateQueries({queryKey: getInvestigationFinancialFlowsQueryKey({path})});
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const toggleDuplicates = (checked: boolean) => { setIncludeDuplicates(checked); setEdge(null); };

  // One row of the relationship list: schema, role, the review advisory, and how the duplicate view places the edge.
  const edgeLabel = (r: GraphEdge) => `${r.schema}${r.properties.role?.[0] ? ` · ${r.properties.role[0]}` : ''}`
    + (r.advisory.needs_review ? ` · ⚠ challenged claim${r.advisory.has_independent_support ? ' · independent support remains' : ''}` : '')
    + (r.reconciliation?.is_preferred && r.reconciliation.suppressed_duplicate_count > 0 ? ` · preferred (+${r.reconciliation.suppressed_duplicate_count} duplicate)` : r.reconciliation?.suppressed_duplicate ? ' · duplicate copy' : '');

  return <section className="card graphCard" id="relationship-graph">
    <h3>Relationships</h3>
    <p className="muted">Every link is a FollowTheMoney relationship record. Reviewed duplicates are folded into the preferred record unless you show them; the originals stay traceable.</p>
    <Graph key={investigationId} relationships={relationships} entities={entities} onNode={openDossier} onEdge={openEdge}
      extraTools={<label className="cf-chip" style={{cursor: 'pointer'}}><Checkbox checked={includeDuplicates}
        onCheckedChange={(checked: boolean | 'indeterminate') => toggleDuplicates(checked === true)}/> Reviewed duplicate copies</label>}
      footnote={reconciliation.suppressed_duplicate_count > 0 ? `${reconciliation.visible_edge_count} links shown from ${reconciliation.underlying_edge_count} records; ${reconciliation.suppressed_duplicate_count} reviewed duplicate${reconciliation.suppressed_duplicate_count === 1 ? '' : 's'} folded into the preferred record.` : undefined}/>
    {edge && <RelationshipDetail key={opened} investigationId={investigationId} edge={edge} evidencePool={evidencePool} onUpdated={setEdge}/>}
    <details className="candidate">
      <summary>Add to the network: a party or a relationship</summary>
      <h4>A party</h4>
      <p className="muted">Creates a reporter-entered canonical entity in this investigation (dataset: reporter).</p>
      <EntityForm onSubmit={createEntityManually}/>
      <h4>A relationship</h4>
    <div className="relationshipForm">
      <Select value={relSchema} onValueChange={setRelSchema}>
        <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
        <SelectContent>{RELATIONSHIP_SCHEMAS.map(x => <SelectItem value={x} key={x}>{x}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={relSource} onValueChange={setRelSource}>
        <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
        <SelectContent>{entities.map(e => <SelectItem value={e.id} key={e.id}>{e.caption}</SelectItem>)}</SelectContent>
      </Select>
      <span>→</span>
      <Select value={relTarget} onValueChange={setRelTarget}>
        <SelectTrigger className="w-auto"><SelectValue/></SelectTrigger>
        <SelectContent>{entities.map(e => <SelectItem value={e.id} key={e.id}>{e.caption}</SelectItem>)}</SelectContent>
      </Select>
      <input value={relRole} onChange={(e: ChangeEvent<HTMLInputElement>) => setRelRole(e.target.value)} placeholder="Role (optional)"/>
      {relSchema === 'Payment' && <>
        <input value={payAmount} onChange={(e: ChangeEvent<HTMLInputElement>) => setPayAmount(e.target.value)} placeholder="Amount" aria-label="Payment amount"/>
        <input value={payCurrency} onChange={(e: ChangeEvent<HTMLInputElement>) => setPayCurrency(e.target.value)} placeholder="Currency (e.g. USD)" aria-label="Payment currency" maxLength={3}/>
        <input value={payDate} onChange={(e: ChangeEvent<HTMLInputElement>) => setPayDate(e.target.value)} placeholder="Date (YYYY-MM-DD)" aria-label="Payment date"/>
        <input value={payPurpose} onChange={(e: ChangeEvent<HTMLInputElement>) => setPayPurpose(e.target.value)} placeholder="Stated purpose (optional)" aria-label="Payment purpose"/>
      </>}
      <select value={relEvidence} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRelEvidence(e.target.value)}>
        <option value="">Evidence (optional)</option>
        {evidencePool.map(x => <option value={x.evidence.id} key={x.evidence.id}>{x.source.title}: {(x.evidence.locator || x.evidence.quote || x.evidence.notes || x.evidence.id).slice(0, 80)}</option>)}
      </select>
      <Button onClick={createRelationship} disabled={!relSource || !relTarget || relSource === relTarget}>Add relationship</Button>
    </div>
    </details>
    <div className="relationshipList">
      {relationships.length === 0 ? <p className="muted">No canonical relationships yet.</p> : <Table><TableBody>
        {relationships.map(r => <TableRow className="relationshipRow" key={r.id}>
          <TableCell><Button className="relNode" onClick={() => openDossier(r.source.id)}>{r.source.caption}</Button></TableCell>
          <TableCell><span className="relEdge" onClick={() => openEdge(r)}>{edgeLabel(r)}</span></TableCell>
          <TableCell><Button className="relNode" onClick={() => openDossier(r.target.id)}>{r.target.caption}</Button></TableCell>
        </TableRow>)}
      </TableBody></Table>}
    </div>
    <MoneyFlows investigationId={investigationId} wanted={ledgerWanted} onLoad={() => setLedgerWanted(true)}/>
  </section>;
}
