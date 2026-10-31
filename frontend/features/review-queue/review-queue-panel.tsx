'use client';
// Check › Connector findings: what connectors found, waiting for a reporter. The findings are a dense list on the
// left (kind as a mark, the caption, the provider, the review state as a colour); the picked one fills the right. A
// finding that describes an entity is matched to canonical entities (an identity decision: the best match and its
// score in large type), and each value it asserts is assessed on its own; an accepted value can then be promoted
// into the canonical graph with its provenance. A finding that describes a relationship gets its two ends matched, a
// review, and (when supported) a promotion to a canonical edge. The evidence ledger shows every value of the matched
// entity with its canonical statements and outside assessments. The calls and their reply checks are generated from
// the API schema; the findings and everything about the inspected one are queries; a decision marks what it changed
// stale. With no findings the screen says what they are and where connectors are run (Bring in › Connectors).
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowRight, ExternalLink, Radar, Search, X} from 'lucide-react';
import Link from 'next/link';
import {useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {FamilyGlyph, FamilyMark, PartyMark} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import {caseHref} from '../../lib/case-href';
import {
  externalRelationshipCandidatesOptions, findingCandidatesOptions, getEntityDossierQueryKey, getInvestigationGraphQueryKey, listAssessmentsOptions,
  listAssessmentsQueryKey, listConnectorFindingsOptions, listConnectorFindingsQueryKey, listEntitiesQueryKey, listEntityStatementHistoryOptions,
  listEntityStatementHistoryQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {assessStatement, promoteExternalRelationship, promoteStatementAssessment, resolveFinding, reviewExternalRelationship} from '../../lib/generated/sdk.gen';
import type {ConnectorFindingOut, ExternalRelationshipReviewOut, StatementAssessmentOut} from '../../lib/generated/types.gen';
import {reportPayloadError} from '../../lib/report-error';
import './review-queue.css';

type Props = {investigationId: string};

const RELATIONSHIP_SCHEMAS = new Set(['Ownership', 'Directorship', 'Membership', 'Employment', 'Payment', 'UnknownLink']);
const isRelationshipFinding = (f: ConnectorFindingOut): boolean => RELATIONSHIP_SCHEMAS.has(f.schema || '');

/** A finding's review state as a colour (and, with Settings › Appearance › Status marks, a shape); the word on reveal. */
const REVIEW: Record<string, {mark: string; tone: string; word: string}> = {
  unreviewed: {mark: '○', tone: 'unshown', word: 'Not reviewed'}, accepted: {mark: '✓', tone: 'supported', word: 'Accepted'},
  rejected: {mark: '✕', tone: 'disputed', word: 'Rejected'}, needs_followup: {mark: '?', tone: 'followup', word: 'To follow up'},
};
const REVIEW_ORDER = ['unreviewed', 'needs_followup', 'accepted', 'rejected'];
const reviewOf = (status: string) => REVIEW[status] ?? REVIEW.unreviewed;
function ReviewMark({status}: {status: string}): ReactElement {
  const r = reviewOf(status);
  const word = status.replace(/_/g, ' ');
  return <Reveal label={word} detail={<b>{word}</b>}><span aria-hidden="true" className={`rq-state t-${r.tone}`}><i>{r.mark}</i></span></Reveal>;
}

/** What kind of record a finding is: a party's icon, or a link's line (components/network/marks.tsx). */
function FindingKind({schema, size}: {schema?: string | null; size?: number}): ReactElement {
  if (schema && RELATIONSHIP_SCHEMAS.has(schema)) return <FamilyMark schema={schema}/>;
  return <PartyMark schema={schema || 'lead'} kind={schema ? undefined : 'other'} size={size}/>;
}

/** The values a finding asserts, as the provider sent them: each property's list of values. */
function propertyValues(properties: Record<string, unknown>): [string, string[]][] {
  return Object.entries(properties).map(([prop, values]) => [prop, Array.isArray(values) ? values.map(String) : []]);
}

const ASSESS: [string, string][] = [['accepted', 'Accept'], ['conflicting', 'Conflict'], ['outdated', 'Outdated'], ['unresolved', 'Unresolved']];

export function ReviewQueuePanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ConnectorFindingOut | null>(null);
  const [externalRelReview, setExternalRelReview] = useState<ExternalRelationshipReviewOut | null>(null);
  const [states, setStates] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState('');
  const [typed, setTyped] = useState('');
  const q = useDeferredValue(typed.trim().toLowerCase());

  const path = {investigation_id: investigationId};
  const findingsQuery = useQuery({...listConnectorFindingsOptions({path}), enabled: Boolean(investigationId)});
  const findings = useMemo(() => findingsQuery.data ?? [], [findingsQuery.data]);
  // The inspected finding is read from the list, so a decision's new review state shows on it at once.
  const current = selected ? findings.find(f => f.id === selected.id) ?? selected : null;
  const relationshipFinding = current !== null && isRelationshipFinding(current);
  const findingPath = {finding_id: current?.id ?? ''};
  const externalRelQuery = useQuery({...externalRelationshipCandidatesOptions({path: findingPath}), enabled: relationshipFinding});
  const candidatesQuery = useQuery({...findingCandidatesOptions({path: findingPath}), enabled: current !== null && !relationshipFinding});
  const assessmentsQuery = useQuery({...listAssessmentsOptions({path: findingPath}), enabled: current !== null && !relationshipFinding});
  const externalRel = relationshipFinding ? externalRelQuery.data ?? null : null;
  const cands = current && !relationshipFinding ? candidatesQuery.data ?? [] : [];
  const assessments = current && !relationshipFinding ? assessmentsQuery.data ?? [] : [];
  // The ledger follows the best canonical match of the inspected finding.
  const matchedEntityId = cands[0]?.entity_id ?? '';
  const historyQuery = useQuery({...listEntityStatementHistoryOptions({path: {entity_id: matchedEntityId}}), enabled: Boolean(matchedEntityId)});
  const history = matchedEntityId ? historyQuery.data ?? [] : [];

  // A new case starts with nothing inspected and nothing filtered.
  useEffect(() => { setSelected(null); setExternalRelReview(null); setStates(new Set()); setProvider(''); setTyped(''); }, [investigationId]);

  // A failed load is reported the way the page reported it, once per failure.
  const reported = useRef<unknown>(null);
  useEffect(() => {
    const error = findingsQuery.error ?? externalRelQuery.error ?? candidatesQuery.error ?? assessmentsQuery.error ?? historyQuery.error;
    if (error && reported.current !== error) { reported.current = error; reportPayloadError(error); }
  }, [findingsQuery.error, externalRelQuery.error, candidatesQuery.error, assessmentsQuery.error, historyQuery.error]);

  const inspect = (f: ConnectorFindingOut) => { setSelected(f); setExternalRelReview(null); };

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of findings) { const k = REVIEW[f.review_status] ? f.review_status : 'unreviewed'; out[k] = (out[k] ?? 0) + 1; }
    return out;
  }, [findings]);
  const providers = useMemo(() => [...new Set(findings.map(f => f.provider))].sort(), [findings]);
  const shown = useMemo(() => findings.filter(f => (!states.size || states.has(REVIEW[f.review_status] ? f.review_status : 'unreviewed'))
    && (!provider || f.provider === provider) && (!q || f.caption.toLowerCase().includes(q))), [findings, states, provider, q]);
  const filtering = Boolean(states.size || provider || q);
  const clearFilters = (): void => { setStates(new Set()); setProvider(''); setTyped(''); };
  const toggleState = (k: string): void => setStates(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const reviewExternalRel = async (decision: string) => {
    if (!current || !externalRel) return;
    const source_entity_id = externalRel.source_candidates[0]?.entity_id || null;
    const target_entity_id = externalRel.target_candidates[0]?.entity_id || null;
    try {
      setExternalRelReview((await reviewExternalRelationship({path: {finding_id: current.id}, body: {source_entity_id, target_entity_id, decision}, throwOnError: true})).data);
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
    if (!current) return;
    try {
      await resolveFinding({path: {finding_id: current.id}, body: {decision, entity_id: entity_id || null, confidence: decision === 'positive' ? 0.9 : 0.5}, throwOnError: true});
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
    if (!current) return;
    try {
      await assessStatement({path: {finding_id: current.id}, body: {entity_id: cands[0]?.entity_id || null, prop, value, status}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: listAssessmentsQueryKey({path: {finding_id: current.id}})});
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
  // The last assessment of a value, shown as the value's colour.
  const assessedAs = (p: string, v: string) => [...assessments].reverse().find(a => a.prop === p && a.value === v)?.status;
  const bestMatch = cands[0];

  if (findingsQuery.isError) return <div className="rq rq-empty"><p className="rq-muted">The connector findings could not be loaded. Reload the page to try again.</p></div>;
  if (!findingsQuery.isPending && findings.length === 0) return <EmptyQueue investigationId={investigationId}/>;

  return <div className="rq">
    <header className="rq-head">
      <h2 className="rq-count"><b>{findingsQuery.isPending ? '…' : findings.length}</b> <span>findings</span></h2>
      {/* The tally is also the filter: each review state's colour and count; its word on reveal. */}
      <div className="rq-tally" role="group" aria-label="Show findings by review state">{REVIEW_ORDER.filter(k => counts[k]).map(k =>
        <Reveal key={k} tabbable={false} describe={false} detail={<><b>{REVIEW[k].word}</b><span className="rv-row">{counts[k]} finding{counts[k] === 1 ? '' : 's'} · click to show only these</span></>}>
          <button type="button" className={`rq-tally-n t-${REVIEW[k].tone}${states.has(k) ? ' on' : ''}`} aria-pressed={states.has(k)} aria-label={`${REVIEW[k].word}: ${counts[k]}`}
            onClick={() => toggleState(k)}><i aria-hidden="true"/>{counts[k]}</button></Reveal>)}</div>
      {providers.length > 1 && <div className="rq-seg" role="radiogroup" aria-label="Provider">
        {['', ...providers].map(p => <button key={p || 'all'} type="button" role="radio" aria-checked={provider === p} className={provider === p ? 'on' : ''}
          onClick={() => setProvider(p)}>{p || 'All'}</button>)}</div>}
      <label className="rq-search">
        <Search size={16} aria-hidden="true"/>
        <input type="search" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Find a finding…" aria-label="Find a finding"/>
        {typed && <button type="button" aria-label="Clear the search" onClick={() => setTyped('')}><X size={14} aria-hidden="true"/></button>}
      </label>
    </header>

    <div className="rq-body">
      <aside className="rq-left" aria-label="Findings">
        {filtering && <p className="rq-showing"><b>{shown.length}</b> of {findings.length} <button type="button" className="rq-link" onClick={clearFilters}>Clear</button></p>}
        <ul className="rq-list">
          {findingsQuery.isPending && <li className="rq-muted">Loading the findings…</li>}
          {!findingsQuery.isPending && shown.length === 0 && <li className="rq-muted">Nothing matches. <button type="button" className="rq-link" onClick={clearFilters}>Clear the filters</button></li>}
          {/* The kind is the icon or line, the review state its colour; both named on reveal. */}
          {shown.map(f => <li key={f.id} className={`rq-row${f.id === current?.id ? ' on' : ''}${f.review_status === 'rejected' ? ' done' : ''}`}>
            <FindingKind schema={f.schema}/>
            <button type="button" className="rq-pick" onClick={() => inspect(f)} aria-current={f.id === current?.id ? 'true' : undefined}>
              <strong>{f.caption}</strong><span className="rq-prov">{f.provider}</span></button>
            <ReviewMark status={f.review_status}/>
          </li>)}
        </ul>
      </aside>

      <section className="rq-right" aria-label="Evidence review">
        {!current ? <div className="rq-pickone">
          <p className="rq-ask">Choose a finding.</p>
          <p className="rq-muted">Each one is a record a connector brought back. Match it to the case&apos;s own entity, then accept, dispute or promote what it says.</p>
        </div> : <>
          <header className="rq-detail-head">
            <span className="rq-detail-kind">{relationshipFinding ? <FamilyMark schema={current.schema}/> : <FindingKind schema={current.schema} size={26}/>}</span>
            <div>
              <Reveal tabbable={false} describe={false} detail={<><b>{current.provider}</b><span className="rv-row rv-mono">{current.provider_record_id}</span>{current.schema && <span className="rv-row">{current.schema}</span>}</>}>
                <h2>{current.caption}</h2></Reveal>
              <p className="rq-detail-sub"><span className="rq-prov">{current.provider}</span><ReviewMark status={current.review_status}/></p>
            </div>
            {current.source_url && <a className="rq-btn" href={current.source_url} target="_blank" rel="noreferrer noopener"><ExternalLink size={15} aria-hidden="true"/> At the provider</a>}
          </header>

          {relationshipFinding ? (externalRel ? <section className="rq-sec">
            <h3 className="rq-sec-h">
              {/* The outside records' raw ids are revealed on the relationship's title. */}
              <Reveal detail={<span className="rv-mono">{externalRel.source_prop}: {externalRel.source_external_id} → {externalRel.target_prop}: {externalRel.target_external_id}</span>}>
                {externalRel.schema} relationship</Reveal></h3>
            <div className="rq-ends">
              <span className={externalRel.source_candidates[0] ? '' : 'none'}>{externalRel.source_candidates[0]?.caption || 'No canonical source match'}</span>
              <FamilyGlyph schema={externalRel.schema}/>
              <span className={externalRel.target_candidates[0] ? '' : 'none'}>{externalRel.target_candidates[0]?.caption || 'No canonical target match'}</span>
            </div>
            <span className="rq-sr">{externalRel.source_candidates[0]?.caption || 'No canonical source match'} → {externalRel.target_candidates[0]?.caption || 'No canonical target match'}</span>
            {externalRel.source_candidates[0] && externalRel.target_candidates[0] ? <div className="rq-acts">
              <button type="button" className="rq-btn" onClick={() => reviewExternalRel('supported')}>Supported</button>
              <button type="button" className="rq-btn" onClick={() => reviewExternalRel('conflicting')}>Conflict</button>
              <button type="button" className="rq-btn" onClick={() => reviewExternalRel('unresolved')}>Unresolved</button>
              {externalRelReview?.decision === 'supported' && <button type="button" className="rq-btn pri" onClick={promoteExternalRel}>Promote relationship</button>}
            </div> : <p className="rq-muted">Canonicalize both endpoints before promotion.</p>}
          </section> : <p className="rq-muted">Loading the relationship…</p>) : <>
            <section className="rq-sec">
              <h3 className="rq-sec-h">Same as</h3>
              {candidatesQuery.isPending ? <p className="rq-muted">Looking for a match…</p> : !bestMatch ? <p className="rq-muted">No entity in the case matches it.</p> : <div className="rq-match">
                <span className="rq-sr">Best entity match: </span>
                <Reveal tabbable={false} describe={false} detail={cands.length > 1 ? <><b>Other candidates</b>{cands.slice(1, 6).map(c => <span key={c.entity_id} className="rv-row">{c.caption} · {Math.round(c.score * 100)}%</span>)}</> : 'The only candidate'}>
                  <b className="rq-match-name">{bestMatch.caption}</b></Reveal>
                <span className="rq-score"><b>{Math.round(bestMatch.score * 100)}<small>%</small></b><span className="rq-sr"> ({Math.round(bestMatch.score * 100)}%)</span>
                  <span className="rq-bar" aria-hidden="true"><i style={{width: `${Math.round(bestMatch.score * 100)}%`}}/></span></span>
                <span className="rq-acts">
                  <button type="button" className="rq-btn pri" onClick={() => decide('positive', bestMatch.entity_id)}>Same entity</button>
                  <button type="button" className="rq-btn" onClick={() => decide('negative', bestMatch.entity_id)}>Different</button>
                  <button type="button" className="rq-btn" onClick={() => decide('unsure', bestMatch.entity_id)}>Unsure</button>
                </span>
              </div>}
            </section>
            <section className="rq-sec">
              <h3 className="rq-sec-h">What it says</h3>
              {propertyValues(current.properties).length === 0 ? <p className="rq-muted">It asserts no values.</p> : <ul className="rq-vals">
                {propertyValues(current.properties).flatMap(([p, vals]) => vals.map(v => {
                  const promotion = promotionFor(p, v);
                  const as = assessedAs(p, v);
                  return <li className={`rq-val${as ? ` a-${as}` : ''}`} key={p + v}>
                    <b className="rq-prop">{p}</b><span className="rq-v">{v}</span>
                    <span className="rq-assess" role="group" aria-label={`Assess ${p}`}>
                      {ASSESS.map(([status, word]) => <button type="button" key={status} className={as === status ? 'on' : ''} aria-pressed={as === status}
                        onClick={() => assess(p, v, status)}>{word}</button>)}
                      {promotion && <button type="button" className="rq-promote" onClick={() => promote(promotion)}>Promote</button>}
                    </span>
                  </li>;
                }))}</ul>}
            </section>
          </>}

          <section className="rq-sec">
            <h3 className="rq-sec-h ledgerTitle">Evidence ledger{bestMatch && history.length > 0 && <span className="rq-sec-n">{history.length}</span>}</h3>
            {!bestMatch ? <p className="rq-muted">Choose a matched canonical entity to inspect provenance.</p> : history.length === 0 ? <p className="rq-muted">No statements or reviewed external evidence yet.</p> : <ul className="rq-ledger">
              {history.map(row => <li className="rq-led" key={row.prop + '::' + row.value}>
                <b className="rq-prop">{row.prop}</b>
                <div className="rq-v">{row.value}</div>
                {/* Counts and a canonical mark show; the words, datasets and providers are revealed. */}
                <Reveal detail={`${row.canonical ? 'Canonical' : 'External only'} · ${row.support_count} support · ${row.conflict_count} conflict${row.latest_status ? ` · latest ${row.latest_status}` : ''}`}>
                  <small className="rq-led-n"><span aria-hidden="true" style={{color: row.canonical ? 'var(--status-supported)' : 'var(--text-muted)'}}>{row.canonical ? '◆' : '◇'}</span>
                    <span aria-hidden="true">✓ {row.support_count}</span><span aria-hidden="true" style={{color: row.conflict_count ? 'var(--status-disputed)' : undefined}}>✕ {row.conflict_count}</span></small></Reveal>
                <span className="rq-led-src">
                  {row.canonical_statements.map(s => <Reveal key={s.id} detail={`canonical · ${s.dataset}${s.origin ? ' · source linked' : ''}`}>
                    <small><span aria-hidden="true" style={{color: 'var(--status-supported)'}}>◆</span> canonical</small></Reveal>)}
                  {row.external_assessments.map(a => <span key={a.assessment_id}>
                    <Reveal detail={`${a.status} · ${a.provider || 'external'}${a.dataset ? ` · ${a.dataset}` : ''}${a.promoted ? ' · promoted' : ''}`}>
                      <small>{a.status}{a.promoted ? ' ↑' : ''}</small></Reveal>
                    {a.source_url && <> <a href={a.source_url} target="_blank" rel="noreferrer">source</a></>}
                  </span>)}
                </span>
              </li>)}
            </ul>}
          </section>
        </>}
      </section>
    </div>
  </div>;
}

/** No findings: one calm line and where a connector is run; what findings are is revealed on the line. */
function EmptyQueue({investigationId}: {investigationId: string}): ReactElement {
  return <div className="rq rq-empty">
    <div className="rq-empty-card rq-empty-calm">
      <span className="rq-empty-mark" aria-hidden="true"><Radar size={64} strokeWidth={1.25}/></span>
      <h2><Reveal detail="When a connector searches an outside source (OpenAleph, OpenSanctions, the web), what it brings back waits here for you: match each record to the case's own entity, then accept, dispute or promote what it says.">No connector findings yet</Reveal></h2>
      <Link className="rq-btn pri" href={caseHref('/bring-in#connectors', investigationId)}>Run a connector <ArrowRight size={15} aria-hidden="true"/></Link>
    </div>
  </div>;
}
