'use client';
// The review queue: what connectors found, waiting for a reporter. A
// finding that describes an entity is matched to canonical entities (an
// identity decision), and each value it asserts is assessed on its own; an
// accepted value can then be promoted into the canonical graph with its
// provenance. A finding that describes a relationship gets its two ends
// matched, a review, and (when supported) a promotion to a canonical edge.
// The evidence ledger shows every value of the matched entity with its
// canonical statements and outside assessments. Moved out of app/page.tsx
// (Foundation Fixes fix 3); the calls and their reply checks are generated
// from the API schema (fix 2). The findings and everything about the
// inspected one are queries; a decision marks what it changed stale.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {FamilyMark, PartyMark} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import {
  externalRelationshipCandidatesOptions, findingCandidatesOptions, getEntityDossierQueryKey, getInvestigationGraphQueryKey, listAssessmentsOptions,
  listAssessmentsQueryKey, listConnectorFindingsOptions, listConnectorFindingsQueryKey, listEntitiesQueryKey, listEntityStatementHistoryOptions,
  listEntityStatementHistoryQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {assessStatement, promoteExternalRelationship, promoteStatementAssessment, resolveFinding, reviewExternalRelationship} from '../../lib/generated/sdk.gen';
import type {ConnectorFindingOut, ExternalRelationshipReviewOut, StatementAssessmentOut} from '../../lib/generated/types.gen';
import {reportPayloadError} from '../../lib/report-error';

type Props = {investigationId: string};

const RELATIONSHIP_SCHEMAS = new Set(['Ownership', 'Directorship', 'Membership', 'Employment', 'Payment', 'UnknownLink']);
const isRelationshipFinding = (f: ConnectorFindingOut): boolean => RELATIONSHIP_SCHEMAS.has(f.schema || '');

/** A finding's review state as a shape (○ not reviewed, ✓ accepted, ✕ rejected, ? to follow up); the word on reveal. */
const REVIEW: Record<string, {mark: string; tone: string}> = {
  unreviewed: {mark: '○', tone: 'unshown'}, accepted: {mark: '✓', tone: 'supported'}, rejected: {mark: '✕', tone: 'disputed'}, needs_followup: {mark: '?', tone: 'unshown'},
};
const TONE_COLOUR: Record<string, string> = {supported: 'var(--status-supported)', disputed: 'var(--status-disputed)', unshown: 'var(--status-unshown)'};
function ReviewMark({status}: {status: string}): ReactElement {
  const r = REVIEW[status] ?? {mark: '○', tone: 'unshown'};
  const word = status.replace(/_/g, ' ');
  return <Reveal label={word} detail={<b>{word}</b>}><span aria-hidden="true" style={{color: TONE_COLOUR[r.tone], fontWeight: 700, fontSize: 16}}>{r.mark}</span></Reveal>;
}

/** What kind of record a finding is: a party's icon, or a link's line (components/network/marks.tsx). */
function FindingKind({schema}: {schema?: string | null}): ReactElement {
  if (schema && RELATIONSHIP_SCHEMAS.has(schema)) return <FamilyMark schema={schema}/>;
  return <PartyMark schema={schema || 'lead'} kind={schema ? undefined : 'other'}/>;
}

/** The values a finding asserts, as the provider sent them: each property's list of values. */
function propertyValues(properties: Record<string, unknown>): [string, string[]][] {
  return Object.entries(properties).map(([prop, values]) => [prop, Array.isArray(values) ? values.map(String) : []]);
}

export function ReviewQueuePanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ConnectorFindingOut | null>(null);
  const [externalRelReview, setExternalRelReview] = useState<ExternalRelationshipReviewOut | null>(null);

  const path = {investigation_id: investigationId};
  const findingsQuery = useQuery({...listConnectorFindingsOptions({path}), enabled: Boolean(investigationId)});
  const findings = findingsQuery.data ?? [];
  const relationshipFinding = selected !== null && isRelationshipFinding(selected);
  const findingPath = {finding_id: selected?.id ?? ''};
  const externalRelQuery = useQuery({...externalRelationshipCandidatesOptions({path: findingPath}), enabled: relationshipFinding});
  const candidatesQuery = useQuery({...findingCandidatesOptions({path: findingPath}), enabled: selected !== null && !relationshipFinding});
  const assessmentsQuery = useQuery({...listAssessmentsOptions({path: findingPath}), enabled: selected !== null && !relationshipFinding});
  const externalRel = relationshipFinding ? externalRelQuery.data ?? null : null;
  const cands = selected && !relationshipFinding ? candidatesQuery.data ?? [] : [];
  const assessments = selected && !relationshipFinding ? assessmentsQuery.data ?? [] : [];
  // The ledger follows the best canonical match of the inspected finding.
  const matchedEntityId = cands[0]?.entity_id ?? '';
  const historyQuery = useQuery({...listEntityStatementHistoryOptions({path: {entity_id: matchedEntityId}}), enabled: Boolean(matchedEntityId)});
  const history = matchedEntityId ? historyQuery.data ?? [] : [];

  // A new case starts with nothing inspected.
  useEffect(() => { setSelected(null); setExternalRelReview(null); }, [investigationId]);

  // A failed load is reported the way the page reported it, once per failure.
  const reported = useRef<unknown>(null);
  useEffect(() => {
    const error = findingsQuery.error ?? externalRelQuery.error ?? candidatesQuery.error ?? assessmentsQuery.error ?? historyQuery.error;
    if (error && reported.current !== error) { reported.current = error; reportPayloadError(error); }
  }, [findingsQuery.error, externalRelQuery.error, candidatesQuery.error, assessmentsQuery.error, historyQuery.error]);

  const inspect = (f: ConnectorFindingOut) => { setSelected(f); setExternalRelReview(null); };

  const reviewExternalRel = async (decision: string) => {
    if (!selected || !externalRel) return;
    const source_entity_id = externalRel.source_candidates[0]?.entity_id || null;
    const target_entity_id = externalRel.target_candidates[0]?.entity_id || null;
    try {
      setExternalRelReview((await reviewExternalRelationship({path: {finding_id: selected.id}, body: {source_entity_id, target_entity_id, decision}, throwOnError: true})).data);
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A promoted relationship is a new canonical edge: the graph is read again.
  const promoteExternalRel = async () => {
    if (!externalRelReview) return;
    try {
      await promoteExternalRelationship({path: {review_id: externalRelReview.id}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: getInvestigationGraphQueryKey({path})});
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // An identity decision changes the finding's review status; an accepted
  // finding now belongs to a canonical entity, so the entities and the graph
  // are read again too.
  const decide = async (decision: string, entity_id?: string) => {
    if (!selected) return;
    try {
      await resolveFinding({path: {finding_id: selected.id}, body: {decision, entity_id: entity_id || null, confidence: decision === 'positive' ? 0.9 : 0.5}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: listConnectorFindingsQueryKey({path})});
      if (decision === 'positive') {
        await queryClient.invalidateQueries({queryKey: listEntitiesQueryKey({path})});
        await queryClient.invalidateQueries({queryKey: getInvestigationGraphQueryKey({path})});
      }
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const assess = async (prop: string, value: string, status: string) => {
    if (!selected) return;
    try {
      await assessStatement({path: {finding_id: selected.id}, body: {entity_id: cands[0]?.entity_id || null, prop, value, status}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: listAssessmentsQueryKey({path: {finding_id: selected.id}})});
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A promoted value is a new canonical statement: the entity's ledger, the
  // entity list and its dossier (if open) are read again.
  const promote = async (a: StatementAssessmentOut) => {
    try {
      await promoteStatementAssessment({path: {assessment_id: a.id}, body: {note: a.note || null}, throwOnError: true});
      if (a.entity_id) {
        await queryClient.invalidateQueries({queryKey: listEntityStatementHistoryQueryKey({path: {entity_id: a.entity_id}})});
        await queryClient.invalidateQueries({queryKey: getEntityDossierQueryKey({path: {entity_id: a.entity_id}})});
      }
      await queryClient.invalidateQueries({queryKey: listEntitiesQueryKey({path})});
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const promotionFor = (p: string, v: string) => assessments.find(a => a.prop === p && a.value === v && a.status === 'accepted');
  const bestMatch = cands[0];

  return <section className="twocol">
    <Card className="card">
      <CardHeader className="pb-3"><CardTitle>Review queue</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Finding</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {findings.map(f => <TableRow key={f.id}>
              <TableCell><strong>{f.caption}</strong></TableCell>
              <TableCell>{f.provider}</TableCell>
              {/* The kind is the icon or line, the review state its shape; both named on reveal. */}
              <TableCell><span className="inline-flex items-center gap-3"><FindingKind schema={f.schema}/><ReviewMark status={f.review_status}/></span></TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => inspect(f)}>Inspect</Button></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <div className="card">
      <h3>Evidence review</h3>
      {!selected ? <p className="muted">Choose a finding.</p> : externalRel ? <>
        <h2>{selected.caption}</h2>
        <div className="candidate">
          {/* The outside records' raw ids are revealed on the relationship's title. */}
          <b className="inline-flex items-center gap-2"><FamilyMark schema={externalRel.schema}/>
            <Reveal detail={<span className="rv-mono">{externalRel.source_prop}: {externalRel.source_external_id} → {externalRel.target_prop}: {externalRel.target_external_id}</span>}>
              {externalRel.schema} relationship</Reveal></b>
          <div>{externalRel.source_candidates[0]?.caption || 'No canonical source match'} → {externalRel.target_candidates[0]?.caption || 'No canonical target match'}</div>
          {externalRel.source_candidates[0] && externalRel.target_candidates[0] ? <div>
            <Button onClick={() => reviewExternalRel('supported')}>Supported</Button>
            <Button onClick={() => reviewExternalRel('conflicting')}>Conflict</Button>
            <Button onClick={() => reviewExternalRel('unresolved')}>Unresolved</Button>
          </div> : <small>Canonicalize both endpoints before promotion.</small>}
          {externalRelReview?.decision === 'supported' && <Button onClick={promoteExternalRel}>Promote relationship</Button>}
        </div>
      </> : <>
        <h2>{selected.caption}</h2>
        {bestMatch && <div className="candidate">
          Best entity match: <b>{bestMatch.caption}</b>{' '}
          <span className="inline-flex items-center gap-1"><span aria-hidden="true" style={{display: 'inline-block', width: 40, height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden'}}>
            <i style={{display: 'block', height: '100%', width: `${Math.round(bestMatch.score * 100)}%`, background: 'var(--accent-1)'}}/></span>({Math.round(bestMatch.score * 100)}%)</span> <Button onClick={() => decide('positive', bestMatch.entity_id)}>Same entity</Button><Button onClick={() => decide('negative', bestMatch.entity_id)}>Different</Button><Button onClick={() => decide('unsure', bestMatch.entity_id)}>Unsure</Button>
        </div>}
        {propertyValues(selected.properties).flatMap(([p, vals]) => vals.map(v => {
          const promotion = promotionFor(p, v);
          return <div className="statement" key={p + v}>
            <div><b>{p}</b><br/><span>{v}</span></div>
            <div className="actions">
              <Button onClick={() => assess(p, v, 'accepted')}>Accept</Button>
              <Button onClick={() => assess(p, v, 'conflicting')}>Conflict</Button>
              <Button onClick={() => assess(p, v, 'outdated')}>Outdated</Button>
              <Button onClick={() => assess(p, v, 'unresolved')}>Unresolved</Button>
              {promotion && <Button onClick={() => promote(promotion)}>Promote</Button>}
            </div>
          </div>;
        }))}
      </>}
      <h3 className="ledgerTitle">Evidence ledger</h3>
      {!bestMatch ? <p className="muted">Choose a matched canonical entity to inspect provenance.</p> : history.length === 0 ? <p className="muted">No statements or reviewed external evidence yet.</p> : <div className="ledger">
        {history.map(row => <div className="ledgerRow" key={row.prop + '::' + row.value}>
          <div>
            <b>{row.prop}</b>
            <div>{row.value}</div>
            {/* Counts and a canonical mark show; the words, datasets and providers are revealed. */}
            <Reveal detail={`${row.canonical ? 'Canonical' : 'External only'} · ${row.support_count} support · ${row.conflict_count} conflict${row.latest_status ? ` · latest ${row.latest_status}` : ''}`}>
              <small className="inline-flex items-center gap-2"><span aria-hidden="true" style={{color: row.canonical ? 'var(--status-supported)' : 'var(--text-muted)'}}>{row.canonical ? '◆' : '◇'}</span>
                <span aria-hidden="true">✓ {row.support_count}</span><span aria-hidden="true" style={{color: row.conflict_count ? 'var(--status-disputed)' : undefined}}>✕ {row.conflict_count}</span></small></Reveal>
          </div>
          <div>
            {row.canonical_statements.map(s => <div key={s.id}><Reveal detail={`canonical · ${s.dataset}${s.origin ? ' · source linked' : ''}`}>
              <small><span aria-hidden="true" style={{color: 'var(--status-supported)'}}>◆</span> canonical</small></Reveal></div>)}
            {row.external_assessments.map(a => <div key={a.assessment_id}>
              <Reveal detail={`${a.status} · ${a.provider || 'external'}${a.dataset ? ` · ${a.dataset}` : ''}${a.promoted ? ' · promoted' : ''}`}>
                <small>{a.status}{a.promoted ? ' ↑' : ''}</small></Reveal>
              {a.source_url && <div><a href={a.source_url} target="_blank" rel="noreferrer">source</a></div>}
            </div>)}
          </div>
        </div>)}
      </div>}
    </div>
  </section>;
}
