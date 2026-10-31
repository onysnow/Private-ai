'use client';
// The party's dossier: everything the workbench holds about one canonical entity, with the reporter's identity work
// on it -- property-conflict decisions, duplicate review, a previewed merge, and the duplicate pairs a merge leaves to
// reconcile. Shown in the inspector slot over every screen (DECISIONS_LOG 35), ~520 px wide or a phone's bottom sheet.
// The calls and their reply checks are generated from the API schema. Any panel asks for a dossier through the shared
// store (lib/workbench-store.ts); this panel answers. The dossier, its duplicate candidates and its reconciliation are
// three queries: the first is keyed by the entity asked for, the other two by the record that answered (a merged
// alias resolves to the surviving record).
//
// How it reads (DECISIONS_LOG 46; Ony's rule "show only what matters; the rest on hover or click"): at rest, who or
// what the party is (its kind as a mark, its name, country and key identifiers), what is waiting on a person, and the
// important numbers as figures -- links, claims by status, flags by level, sources, money in and out -- each of which
// takes you to its section. A section with nothing in it is not drawn. A row's actions are small icon buttons that
// show on hover or focus, named on hover and to screen readers; the history, OpenAleph and every recorded value are
// folded under "More". Every fact is one click from where it comes from: a row traces, opens its claim, flag, link or
// source, or opens the other party's dossier beside this one.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, Coins, ExternalLink, FileSearch, FileText, Flag, Globe, Link2, ListTodo, MessageSquarePlus, Pencil, Route,
  Scale, TriangleAlert, X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import {useEffect, useId, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, ComponentType, ReactElement, ReactNode} from 'react';

import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import type {EntityFormSubmitPayload} from '../../components/entity-form';
import {LevelChip, StatusChip} from '../../components/status';
import type {ClaimStatus} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {caseHref} from '../../lib/case-href';
import {LINK, LINK_ORDER, linkFamily} from '../../lib/viz-tokens';
import type {LinkFamily} from '../../lib/viz-tokens';
import {entityPropertyAdditions} from '../../lib/entity-schema';
import {dateWords} from '../../lib/dates';
import {timeDayWords} from '../../lib/timestamps';
import {
  entityDuplicateCandidatesOptions, entityDuplicateCandidatesQueryKey, entityPostMergeReconciliationOptions, entityPostMergeReconciliationQueryKey,
  getEntityDossierOptions, getEntityDossierQueryKey, getInvestigationFinancialFlowsOptions, getInvestigationFinancialFlowsQueryKey,
  getInvestigationGraphQueryKey, getOwnershipChainOptions, listEntitiesQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {
  canonicalEntityResolution, createLeadFromRelationshipContext, decideEntityPostMergeReconciliation, decidePropertyConflict, entityMergeExecute,
  entityMergePreview, updateEntity,
} from '../../lib/generated/sdk.gen';
import type {CanonicalMergePreviewOut, EntityRelationshipOut, FinancialTransactionOut, RedFlagOut} from '../../lib/generated/types.gen';
import {invalidateInvestigationData} from '../../lib/investigation-queries';
import {reportPayloadError} from '../../lib/report-error';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {leadQueueKey} from '../leads/leads-panel';
import {amountText} from '../money/money-layout';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';
import {PartyMark} from '../the-drop/kind-marks';
import {CorpusExpand} from './corpus-expand';
import {DuplicateCandidates} from './duplicate-candidates';
import type {DuplicateDecision} from './duplicate-candidates';
import {IconAct, IconLink, Section, StateMark, countryName, propWords} from './dossier-parts';
import {OwnershipChain} from './ownership-chain';
import {PropertyConflicts} from './property-conflicts';
import type {PendingConflict} from './property-conflicts';
import {ReconciliationReview} from './reconciliation-review';
import type {ReconciliationDecision, ReconciliationRecordType} from './reconciliation-review';

// The entity form is loaded on demand so it stays out of the page's first load.
const EntityForm = dynamic(() => import('../../components/entity-form').then(m => m.EntityForm), {ssr: false, loading: () => <p className="muted">Loading form…</p>});

/** `entityId`: the dossier to show, as the inspector slot's trail names it; without it, the latest request is answered. */
type Props = {investigationId: string; entityId?: string};

/** A claim's status in the app's one grammar (components/status.tsx). */
const CLAIM_STATUS: Record<string, ClaimStatus> = {
  supported: 'supported', confirmed: 'supported', verified: 'supported', disputed: 'disputed', rejected: 'ruled_out', lead: 'unshown', unverified: 'unshown',
};
const CLAIM_ORDER: ClaimStatus[] = ['supported', 'disputed', 'unshown', 'ruled_out'];
const CLAIM_WORD: Record<ClaimStatus, string> = {supported: 'supported', disputed: 'disputed', unshown: 'not yet shown', ruled_out: 'ruled out'};
const LEVELS = ['textbook', 'strong', 'faint'] as const;

/** Where a party is: the properties that name a country. */
const COUNTRY_PROPS = ['country', 'jurisdiction', 'nationality', 'citizenship', 'mainCountry'];
/** The identifiers a reporter looks for first, in this order; the rest are under More. */
const KEY_PROPS = ['registrationNumber', 'leiCode', 'taxNumber', 'vatCode', 'idNumber', 'passportNumber', 'imoNumber', 'mmsi', 'swiftBic', 'innCode',
  'ogrnCode', 'incorporationDate', 'birthDate', 'dissolutionDate'];
const DATE_PROPS = new Set(['incorporationDate', 'birthDate', 'dissolutionDate', 'deathDate']);

/** How a relationship's attached evidence was reviewed, as ✓2 ✕1 ◌1; a compact graph edge carries an aggregate advisory without these counts. */
function evidenceReviewCounts(r: EntityRelationshipOut): {words: string; marks: string} | null {
  if (r.advisory.presentation_aggregate) return null;
  const counts = Object.entries(r.advisory.relationship_evidence_review_counts).filter(([, count]) => Number(count) > 0);
  if (!counts.length) return null;
  const words = counts.map(([stance, count]) => `${stance} ${count}`).join(' · ');
  return {words, marks: words.replace(/supports? /g, '✓').replace(/contradicts? /g, '✕').replace(/context /g, '◌').replace(/ · /g, ' ')};
}

/** Money as a short figure: €1.2m, €71k, €950. */
function shortAmount(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (abs < 1000) return amountText(amount, currency);
  const [n, unit] = abs >= 1e9 ? [amount / 1e9, 'bn'] : abs >= 1e6 ? [amount / 1e6, 'm'] : [amount / 1e3, 'k'];
  const short = n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '');
  const full = amountText(1, currency);
  return full.endsWith(currency) ? `${short}${unit} ${currency}` : `${full.slice(0, -1)}${short}${unit}`;
}

/** A party's payments in and out, by currency, the largest currency first. */
type MoneySide = {currency: string; amount: number};
function moneyTotals(rows: FinancialTransactionOut[], ids: Set<string>): {incoming: MoneySide[]; outgoing: MoneySide[]} {
  const add = (m: Map<string, number>, t: FinancialTransactionOut) => m.set(t.currency, (m.get(t.currency) ?? 0) + t.amount);
  const inn = new Map<string, number>(), out = new Map<string, number>();
  for (const t of rows) { if (ids.has(t.to_entity_id)) add(inn, t); if (ids.has(t.from_entity_id)) add(out, t); }
  const sorted = (m: Map<string, number>) => [...m.entries()].map(([currency, amount]) => ({currency, amount})).sort((a, b) => b.amount - a.amount);
  return {incoming: sorted(inn), outgoing: sorted(out)};
}

/** One of the figures at the top: a number (and its small picture) that takes you to its section; a zero is quiet. */
function Figure({icon: Icon, value, unit, words, detail, target, onJump, children}: {
  icon: ComponentType<{size?: number; 'aria-hidden'?: boolean | 'true' | 'false'}>; value: ReactNode; unit: string; words: string; detail: ReactNode;
  target: string | null; onJump: (id: string) => void; children?: ReactNode;
}): ReactElement {
  const body = <><span className="dsr-fig-top"><Icon size={14} aria-hidden="true"/><b>{value}</b></span>
    <span className="dsr-fig-unit">{unit}</span>{children}</>;
  if (!target) return <li><Reveal label={words} detail={detail}><span className="dsr-fig zero" aria-hidden="true">{body}</span></Reveal></li>;
  return <li><Reveal tabbable={false} detail={detail}>
    <button type="button" className="dsr-fig" aria-label={`${words}. Go to ${unit}`} onClick={() => onJump(target)}>{body}</button></Reveal></li>;
}

export function DossierPanel({investigationId, entityId: shownId}: Props): ReactElement | null {
  const queryClient = useQueryClient();
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const openClaim = useWorkbenchStore(state => state.openClaim);
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const openRelationship = useWorkbenchStore(state => state.openRelationship);
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const setEntityId = useWorkbenchStore(state => state.setEntityId);
  const asked = useWorkbenchStore(state => state.dossier);
  const uid = useId().replace(/:/g, '');
  // The entity whose dossier is shown (as asked for; a merged alias answers with its surviving record).
  const [openId, setOpenId] = useState(shownId ?? '');
  const [editingEntity, setEditingEntity] = useState(false);
  const [mergePreviews, setMergePreviews] = useState<Record<string, CanonicalMergePreviewOut>>({});
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const [conflictRationale, setConflictRationale] = useState('');
  const [arrived, setArrived] = useState('');

  const dossierQuery = useQuery({...getEntityDossierOptions({path: {entity_id: openId}}), enabled: Boolean(openId)});
  const dossier = openId ? dossierQuery.data ?? null : null;
  const activeId = dossier?.entity.id ?? '';
  const duplicatesQuery = useQuery({...entityDuplicateCandidatesOptions({path: {entity_id: activeId}}), enabled: Boolean(activeId)});
  const reconciliationQuery = useQuery({...entityPostMergeReconciliationOptions({path: {entity_id: activeId}}), enabled: Boolean(activeId)});
  // The case's flags and payments (shared with Red Flags and Money): this party's share of them is worked out here.
  const flagsQuery = useRedFlagsQuery(investigationId, Boolean(activeId)).query;
  const ledgerQuery = useQuery({...getInvestigationFinancialFlowsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(activeId && investigationId)});
  const chainQuery = useQuery({...getOwnershipChainOptions({path: {entity_id: activeId}}), enabled: Boolean(activeId)});

  // A new case starts with no dossier open.
  useEffect(() => { setOpenId(shownId ?? ''); setMergePreviews({}); setEditingEntity(false); }, [investigationId, shownId]);

  // Each request to open a dossier is answered once.
  const answered = useRef(0);
  useEffect(() => {
    if (shownId !== undefined || !asked || asked.serial === answered.current) return;
    answered.current = asked.serial;
    setMergePreviews({});
    setEditingEntity(false);
    setOpenId(asked.entityId);
  }, [asked, shownId]);

  // A dossier asked for by a merged alias answers with the surviving record:
  // the selected entity follows it.
  useEffect(() => { if (activeId) setEntityId(activeId); }, [activeId, setEntityId]);

  // A failed load is reported the way the page reported it, once per failure.
  const reported = useRef<unknown>(null);
  useEffect(() => {
    const error = dossierQuery.error ?? duplicatesQuery.error ?? reconciliationQuery.error;
    if (error && reported.current !== error) { reported.current = error; reportPayloadError(error); }
  }, [dossierQuery.error, duplicatesQuery.error, reconciliationQuery.error]);

  // The party's records include its merged aliases: a flag or payment may name either.
  const ids = useMemo(() => new Set([activeId, ...(dossier?.identity_history.aliases ?? []).map(a => a.id)].filter(Boolean)), [activeId, dossier]);
  const flags = useMemo<RedFlagOut[]>(() => (flagsQuery.data?.flags ?? []).filter(f => f.status !== 'dismissed' && f.parties.some(p => ids.has(p.id)))
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || b.weight - a.weight), [flagsQuery.data, ids]);
  const payments = useMemo(() => (ledgerQuery.data?.transactions ?? []).filter(t => ids.has(t.from_entity_id) || ids.has(t.to_entity_id))
    .sort((a, b) => b.amount - a.amount), [ledgerQuery.data, ids]);
  const owed = useMemo(() => (ledgerQuery.data?.owed ?? []).filter(t => ids.has(t.from_entity_id) || ids.has(t.to_entity_id)), [ledgerQuery.data, ids]);

  /** Reads the open dossier again: it, its duplicate candidates and its reconciliation. */
  const reloadDossier = async () => {
    setMergePreviews({});
    await Promise.all([
      queryClient.invalidateQueries({queryKey: getEntityDossierQueryKey({path: {entity_id: openId}})}),
      queryClient.invalidateQueries({queryKey: entityDuplicateCandidatesQueryKey({path: {entity_id: activeId}})}),
      queryClient.invalidateQueries({queryKey: entityPostMergeReconciliationQueryKey({path: {entity_id: activeId}})}),
    ]);
  };

  const confirmPropertyConflict = async () => {
    if (!dossier || !pendingConflict) return;
    const {prop, values, decision, preferred_value} = pendingConflict;
    const rationale = conflictRationale.trim() || undefined;
    setPendingConflict(null);
    try {
      await decidePropertyConflict({path: {entity_id: dossier.entity.id, prop}, body: {decision, values, preferred_value, rationale}, throwOnError: true});
      await reloadDossier();
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const decideCanonicalDuplicate = async (otherId: string, decision: DuplicateDecision) => {
    if (!dossier) return;
    try {
      await canonicalEntityResolution({
        path: {entity_id: dossier.entity.id},
        body: {other_entity_id: otherId, decision, confidence: decision === 'unsure' ? 0.5 : 0.9, rationale: 'Reporter-reviewed canonical duplicate decision'},
        throwOnError: true,
      });
      await reloadDossier();
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const previewCanonicalMerge = async (otherId: string) => {
    if (!dossier) return;
    try {
      const value = (await entityMergePreview({path: {entity_id: dossier.entity.id}, query: {target_entity_id: otherId}, throwOnError: true})).data;
      setMergePreviews(prev => ({...prev, [otherId]: value}));
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A merge changes the case everywhere: every list is read again, and the
  // surviving record's dossier opens fresh. The folded record's own queries
  // are only marked stale -- nothing should ask for it again.
  const executeCanonicalMerge = async (otherId: string) => {
    if (!dossier) return;
    const preview = mergePreviews[otherId];
    if (!preview?.can_execute) return;
    const merged = dossier.entity.id;
    try {
      await entityMergeExecute({
        path: {entity_id: merged},
        body: {target_entity_id: otherId, preview_digest: preview.preview_digest, rationale: 'Reporter executed previewed canonical merge.'},
        throwOnError: true,
      });
      await invalidateInvestigationData(queryClient, merged);
      openDossier(otherId);
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A statement decision changes only the reconciliation view; a relationship
  // decision also changes which edges the graph, the ledger and this dossier show.
  const decideReconciliation = async (recordType: ReconciliationRecordType, a: string, b: string, decision: ReconciliationDecision, preferredRecordId?: string) => {
    if (!dossier) return;
    try {
      await decideEntityPostMergeReconciliation({
        path: {entity_id: dossier.entity.id},
        body: {record_type: recordType, record_a_id: a, record_b_id: b, decision, rationale: 'Reporter-reviewed post-merge duplicate reconciliation.', preferred_record_id: preferredRecordId},
        throwOnError: true,
      });
      await queryClient.invalidateQueries({queryKey: entityPostMergeReconciliationQueryKey({path: {entity_id: dossier.entity.id}})});
      if (recordType === 'relationship') {
        await Promise.all([
          queryClient.invalidateQueries({queryKey: getInvestigationGraphQueryKey({path: {investigation_id: investigationId}})}),
          queryClient.invalidateQueries({queryKey: getInvestigationFinancialFlowsQueryKey({path: {investigation_id: investigationId}})}),
          queryClient.invalidateQueries({queryKey: getEntityDossierQueryKey({path: {entity_id: openId}})}),
        ]);
      }
    } catch (error) {
      reportPayloadError(error);
    }
  };

  // A lead made here lands in the leads panel's queue, which is marked stale.
  const createLeadFromRelationship = async (r: EntityRelationshipOut) => {
    if (!investigationId) return;
    try {
      await createLeadFromRelationshipContext({path: {relationship_id: r.id}, throwOnError: true});
      await queryClient.invalidateQueries({queryKey: leadQueueKey(investigationId)});
      await reloadDossier();
    } catch (error) {
      reportPayloadError(error);
    }
  };

  const updateEntityManually = async (payload: EntityFormSubmitPayload): Promise<void> => {
    if (!dossier) throw new Error('No entity is open.');
    const body: {caption?: string; properties?: Record<string, string[]>} = {};
    if (payload.caption !== dossier.entity.caption) body.caption = payload.caption;
    const additions = entityPropertyAdditions(dossier.entity.properties, payload.properties);
    if (Object.keys(additions).length > 0) body.properties = additions;
    if (!body.caption && !body.properties) { setEditingEntity(false); return; }
    await updateEntity({path: {entity_id: dossier.entity.id}, body, throwOnError: true});
    setEditingEntity(false);
    await reloadDossier();
    if (investigationId) await queryClient.invalidateQueries({queryKey: listEntitiesQueryKey({path: {investigation_id: investigationId}})});
  };

  const duplicateCandidates = duplicatesQuery.data;
  const reconciliation = reconciliationQuery.data;
  // The dossier shows once all three of its parts are in, as it did before.
  if (!dossier || !duplicateCandidates || !reconciliation) return null;
  const entity = dossier.entity;
  const summary = dossier.summary;
  const identity = dossier.identity_history;
  const sid = (key: string) => `dsr-${uid}-${key}`;

  /** A figure's way into its section: scrolled to, its title focused, and lit for a moment. */
  const jump = (key: string) => {
    const section = document.getElementById(sid(key));
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section?.scrollIntoView?.({block: 'start', behavior: reduce ? 'auto' : 'smooth'});
    document.getElementById(`${sid(key)}-h`)?.focus({preventScroll: true});
    setArrived(key);
    window.setTimeout(() => setArrived(current => (current === key ? '' : current)), 1200);
  };

  const traceEntity = (what: string, value?: string) => openProvenance({
    title: what === entity.caption ? entity.caption : `${entity.caption}: ${what}`, kind: 'entity', entityId: entity.id, acceptedRecordType: 'entity',
    acceptedRecordId: entity.id, detail: value,
  });
  const traceRelationship = (r: EntityRelationshipOut) => openProvenance({title: `${r.source?.caption} → ${r.target?.caption}`, kind: 'dossier relationship', traceRecordType: 'relationship', acceptedRecordId: r.id});
  const tracePayment = (t: FinancialTransactionOut) => openProvenance({title: `${t.from} → ${t.to}`, kind: 'payment', traceRecordType: 'relationship', acceptedRecordId: t.relationship_id});
  /** Where a value of a property comes from, for its hover. */
  const originsOf = (prop: string, value: string): ReactNode => {
    const row = dossier.statement_history.find(h => h.prop === prop && h.value === value);
    if (!row) return null;
    return row.canonical_statements.map(st => <span className="rv-row" key={st.id}>{st.dataset}{st.origin ? ` · ${st.origin}` : ''}</span>);
  };

  // Who or what it is: country and the key identifiers.
  const props = entity.properties ?? {};
  const countries = COUNTRY_PROPS.flatMap(p => (props[p] ?? []).map(value => ({prop: p, value})))
    .filter((c, i, all) => all.findIndex(o => o.value.toLowerCase() === c.value.toLowerCase()) === i);
  const keys = KEY_PROPS.flatMap(p => (props[p] ?? []).map(value => ({prop: p, value})));
  const shownKeys = keys.slice(0, 3);
  const valueText = (prop: string, value: string) => (DATE_PROPS.has(prop) ? dateWords(value) : value);

  // Figures.
  const claimCounts = CLAIM_ORDER.map(status => ({status, n: dossier.claims.filter(x => (CLAIM_STATUS[x.claim.status] ?? 'unshown') === status).length})).filter(c => c.n > 0);
  const levelCounts = LEVELS.map(level => ({level, n: flags.filter(f => f.level === level).length})).filter(l => l.n > 0);
  const sources = new Map(dossier.evidence.filter(x => x.source).map(x => [x.source!.id, x.source!]));
  const money = moneyTotals(payments, ids);
  const moneyLine = (sides: MoneySide[]) => sides.length ? shortAmount(sides[0].amount, sides[0].currency) + (sides.length > 1 ? '+' : '') : '0';
  const moneyWords = (sides: MoneySide[]) => sides.length ? sides.map(s => amountText(s.amount, s.currency)).join(', ') : 'nothing';
  const work = [...dossier.leads.map(x => ({kind: 'lead' as const, lead: x.lead})), ...dossier.tasks.map(t => ({kind: 'task' as const, task: t}))];

  // What waits on a person here: values that disagree, possible duplicates not yet decided, pairs left by a merge,
  // links whose evidence needs review, outside findings to review.
  const toDecide = dossier.property_conflicts.filter(c => c.status === 'unresolved').length
    + duplicateCandidates.filter(c => !c.latest_decision).length + reconciliation.summary.unresolved_pairs;
  const hasDecide = dossier.property_conflicts.length > 0 || duplicateCandidates.length > 0 || reconciliation.summary.statement_pairs + reconciliation.summary.relationship_pairs > 0;

  // Links, grouped by what kind of link each is (owns, directs, paid, family, other).
  const byFamily = LINK_ORDER.map(family => ({family, rows: dossier.relationships.filter(r => linkFamily(r.schema) === family)})).filter(g => g.rows.length);
  const otherEnd = (r: EntityRelationshipOut) => {
    const outgoing = r.direction === 'outgoing' || (r.source?.id && ids.has(r.source.id));
    return {party: outgoing ? r.target : r.source, arrow: outgoing ? '→' : '←'};
  };
  const linkRow = (r: EntityRelationshipOut) => {
    const counts = evidenceReviewCounts(r);
    const {party, arrow} = otherEnd(r);
    return <li className="dsr-row" key={r.id}>
      <div className="dsr-line">
        <Reveal detail={`${r.schema}: ${r.source?.caption ?? ''} → ${r.target?.caption ?? ''}`} label={`${r.schema} ${arrow === '→' ? 'to' : 'from'}`}>
          <span className="dsr-arrow" aria-hidden="true">{arrow}</span></Reveal>
        {party?.id && !ids.has(party.id)
          ? <button type="button" className="dsr-party" onClick={() => openDossier(party.id)} aria-label={`Open ${party.caption}`}>{party.caption}</button>
          : <span className="dsr-text">{party?.caption}</span>}
        {r.advisory.needs_review && <Reveal label="Review needed" detail={<><b>Its evidence needs review</b>{r.advisory.has_independent_support && <span className="rv-row">Independent support remains.</span>}</>}>
          <span className="dsr-warn" aria-hidden="true"><TriangleAlert size={13}/></span></Reveal>}
        {counts && <Reveal detail={`evidence: ${counts.words}`}><span className="dsr-evid">{counts.marks}</span></Reveal>}
        {r.reconciliation?.is_preferred && r.reconciliation.suppressed_duplicate_count > 0 && <Reveal detail={`Shown for ${r.reconciliation.suppressed_duplicate_count} reviewed duplicate link(s)`}>
          <small className="ds-dup">+{r.reconciliation.suppressed_duplicate_count}</small></Reveal>}
        <span className="dsr-acts">
          <IconAct icon={FileSearch} label="Review relationship evidence" onClick={() => openRelationship({relationshipId: r.id, record: r})}/>
          <IconAct icon={Route} label="Trace relationship" onClick={() => traceRelationship(r)}/>
          <IconAct icon={MessageSquarePlus} label="Create question / lead with exact context" onClick={() => void createLeadFromRelationship(r)}/>
        </span>
      </div>
    </li>;
  };

  const noWork = dossier.claims.length === 0 && dossier.leads.length === 0 && dossier.tasks.length === 0;
  const chainHasLinks = (chainQuery.data?.links.length ?? 0) > 0;
  const lit = (key: string) => (arrived === key ? ' arrived' : '');

  return <div className="dsr">
    <header className="dsr-id">
      <PartyMark schema={entity.schema}/>
      <div className="dsr-who">
        <h2 className="dsr-name"><span aria-hidden="true">{entity.caption}</span><span className="st-sr">{`${entity.caption} dossier`}</span>
          {dossier.alias_resolution && <> <Reveal label="Merged alias" detail={<><b>Merged alias:</b> {dossier.alias_resolution.requested_caption} now resolves to this canonical entity. Historical merge records are preserved.</>}>
            <span className="ds-state" aria-hidden="true">⇢</span></Reveal></>}</h2>
        {(countries.length > 0 || shownKeys.length > 0) && <p className="dsr-keys">
          {countries.slice(0, 2).map(c => <Reveal key={`${c.prop}:${c.value}`} tabbable={false} detail={<><b>{countryName(c.value)}</b><span className="rv-row">{propWords(c.prop)}</span>{originsOf(c.prop, c.value)}</>}>
            <button type="button" className="dsr-key country" aria-label={`${propWords(c.prop)}: ${countryName(c.value)}. Where it comes from`} onClick={() => traceEntity(propWords(c.prop), c.value)}>
              <Globe size={12} aria-hidden="true"/>{c.value.toUpperCase()}</button></Reveal>)}
          {shownKeys.map(k => <Reveal key={`${k.prop}:${k.value}`} tabbable={false} detail={<><b>{propWords(k.prop)}</b>{originsOf(k.prop, k.value)}</>}>
            <button type="button" className="dsr-key" aria-label={`${propWords(k.prop)}: ${valueText(k.prop, k.value)}. Where it comes from`} onClick={() => traceEntity(propWords(k.prop), k.value)}>
              {valueText(k.prop, k.value)}</button></Reveal>)}
          {keys.length > shownKeys.length && <Reveal detail={keys.slice(3).map(k => <span className="rv-row" key={`${k.prop}:${k.value}`}>{propWords(k.prop)}: {valueText(k.prop, k.value)}</span>)}>
            <span className="dsr-key more">+{keys.length - shownKeys.length}</span></Reveal>}
        </p>}
      </div>
      <span className="dsr-acts shown">
        <IconAct icon={Route} label="Where this record comes from" onClick={() => traceEntity(entity.caption)}/>
        <Reveal tabbable={false} describe={false} detail={editingEntity ? 'Cancel edit' : <><b>Edit entity</b><span className="rv-row">The name can be changed freely. A new property value is added alongside any value already there, never in place of it; settle disagreements between values under To decide.</span></>}>
          <button type="button" className="dsr-act" aria-label={editingEntity ? 'Cancel edit' : 'Edit entity'} aria-pressed={editingEntity} onClick={() => setEditingEntity(v => !v)}>
            {editingEntity ? <X size={15} aria-hidden="true"/> : <Pencil size={15} aria-hidden="true"/>}</button></Reveal>
      </span>
    </header>
    {editingEntity && <div className="dsr-edit">
      <EntityForm entity={entity} onSubmit={updateEntityManually} onCancel={() => setEditingEntity(false)}/>
    </div>}

    {(toDecide > 0 || summary.unresolved_external_count > 0) && <p className="dsr-alerts">
      {toDecide > 0 && <button type="button" className="dsr-pri" onClick={() => jump('decide')}><Scale size={14} aria-hidden="true"/> {toDecide} to decide</button>}
      {summary.unresolved_external_count > 0 && <button type="button" className="dsr-chip-alert" onClick={() => jump('outside')}>
        {summary.unresolved_external_count} external finding(s) need review.</button>}
    </p>}

    <ul className="dsr-figs" aria-label="What the case holds on this party">
      <Figure icon={Link2} value={summary.relationship_count} unit="Links" words={`${summary.relationship_count} link${summary.relationship_count === 1 ? '' : 's'}`}
        detail={summary.relationship_count ? <>{Object.entries(summary.relationship_schemas).map(([schema, n]) => <span className="rv-row" key={schema}>{schema}: {n}</span>)}
          {summary.relationship_suppressed_duplicate_count > 0 && <span className="rv-row">{summary.relationship_suppressed_duplicate_count} reviewed duplicate link(s) folded into the ones shown</span>}</> : 'No links recorded'}
        target={dossier.relationships.length ? 'links' : null} onJump={jump}>
        {byFamily.length > 0 && <span className="dsr-fig-bar" aria-hidden="true">{byFamily.map(g => <i key={g.family} style={{flexGrow: g.rows.length, background: LINK[g.family].colour}}/>)}</span>}
      </Figure>
      <Figure icon={FileText} value={dossier.claims.length} unit="Claims" words={`${dossier.claims.length} claim${dossier.claims.length === 1 ? '' : 's'}: ${claimCounts.map(c => `${c.n} ${CLAIM_WORD[c.status]}`).join(', ') || 'none'}`}
        detail={claimCounts.length ? claimCounts.map(c => <span className="rv-row" key={c.status}>{c.n} {CLAIM_WORD[c.status]}</span>) : 'No claims about this party yet'}
        target={dossier.claims.length ? 'claims' : null} onJump={jump}>
        {claimCounts.length > 0 && <span className="dsr-fig-bar" aria-hidden="true">{claimCounts.map(c => <i key={c.status} className={`st-${c.status}`} style={{flexGrow: c.n}}/>)}</span>}
      </Figure>
      <Figure icon={Flag} value={flags.length} unit="Flags" words={`${flags.length} red flag${flags.length === 1 ? '' : 's'}: ${levelCounts.map(l => `${l.n} ${l.level}`).join(', ') || 'none'}`}
        detail={flags.length ? <>{levelCounts.map(l => <span className="rv-row" key={l.level}>{l.n} {l.level}</span>)}<span className="rv-row">A flag is a pattern worth a look, never a finding.</span></> : 'No Red Flag names this party'}
        target={flags.length ? 'flags' : null} onJump={jump}>
        {levelCounts.length > 0 && <span className="dsr-fig-bar" aria-hidden="true">{levelCounts.map(l => <i key={l.level} className={`lvb-${l.level}`} style={{flexGrow: l.n}}/>)}</span>}
      </Figure>
      <Figure icon={FileSearch} value={sources.size} unit="Sources" words={`${sources.size} source${sources.size === 1 ? '' : 's'}, ${dossier.evidence.length} quote${dossier.evidence.length === 1 ? '' : 's'}`}
        detail={sources.size ? `${dossier.evidence.length} piece(s) of evidence from ${sources.size} source(s)` : 'No evidence names this party yet'}
        target={dossier.evidence.length ? 'sources' : null} onJump={jump}/>
      <Figure icon={Coins} value={<span className="dsr-money"><ArrowDownLeft size={12} aria-hidden="true"/>{moneyLine(money.incoming)}<ArrowUpRight size={12} aria-hidden="true"/>{moneyLine(money.outgoing)}</span>}
        unit="Money" words={`Money in: ${moneyWords(money.incoming)}; out: ${moneyWords(money.outgoing)}`}
        detail={payments.length ? <><span className="rv-row">In: {moneyWords(money.incoming)}</span><span className="rv-row">Out: {moneyWords(money.outgoing)}</span>
          <span className="rv-row">{payments.length} payment(s){owed.length ? ` · ${owed.length} owed, not paid` : ''}</span></> : 'No payments to or from this party'}
        target={payments.length ? 'money' : null} onJump={jump}/>
      {work.length > 0 && <Figure icon={ListTodo} value={work.length} unit="Leads" words={`${dossier.leads.length} lead(s), ${dossier.tasks.length} task(s)`}
        detail={`${dossier.leads.length} lead(s) · ${dossier.tasks.length} reporting task(s)`} target="work" onJump={jump}/>}
      {dossier.timeline.length > 0 && <Figure icon={CalendarDays} value={dossier.timeline.length} unit="Dates" words={`${dossier.timeline.length} dated event(s)`}
        detail={`${dossier.timeline.length} dated event(s)`} target="dates" onJump={jump}/>}
    </ul>

    {noWork && <p className="dsr-quiet">No claims, leads or tasks yet</p>}

    {hasDecide && <Section id={sid('decide')} icon={Scale} title="To decide" count={toDecide} items={[]}
      about="Identity work on this party: values that disagree, records that may be the same party, and pairs a merge left to review. Each decision is a reporter's judgement, kept on record.">
      <div className={lit('decide')}>
        <PropertyConflicts conflicts={dossier.property_conflicts} onDecide={pending => { setPendingConflict(pending); setConflictRationale(''); }}/>
        <DuplicateCandidates candidates={duplicateCandidates} previews={mergePreviews} onOpen={openDossier}
          onDecide={(otherId, decision) => void decideCanonicalDuplicate(otherId, decision)}
          onPreviewMerge={otherId => void previewCanonicalMerge(otherId)}
          onExecuteMerge={otherId => void executeCanonicalMerge(otherId)}/>
        <ReconciliationReview reconciliation={reconciliation} onDecide={(recordType, a, b, decision, preferred) => void decideReconciliation(recordType, a, b, decision, preferred)}/>
      </div>
    </Section>}

    <div className={lit('flags')}><Section id={sid('flags')} icon={Flag} title="Red Flags" count={flags.length} items={flags}
      about="Patterns in the records worth a look, never a finding. Each opens on Act › Red Flags with what it rests on and its innocent explanations."
      row={f => <li className="dsr-row" key={f.id}>
        <Reveal tabbable={false} detail={f.summary || f.indicator?.name || f.indicator_id}>
          <button type="button" className="dsr-open" onClick={() => openFlag(f.id)}><LevelChip level={f.level}/> <span className="dsr-text">{f.indicator?.name ?? f.indicator_id}</span></button>
        </Reveal>
      </li>}/></div>

    <div className={lit('claims')}><Section id={sid('claims')} icon={FileText} title="Claims" count={dossier.claims.length} items={dossier.claims}
      row={x => <li className="dsr-row" key={x.claim.id}>
        <button type="button" className="dsr-open" onClick={() => openClaim(x.claim.id)}>
          {CLAIM_STATUS[x.claim.status] ? <StatusChip status={CLAIM_STATUS[x.claim.status]}/> : `${x.claim.status}:`} {x.claim.text}</button>
      </li>}/></div>

    <div className={lit('links')}><Section id={sid('links')} icon={Link2} title="Links" count={summary.relationship_count} items={byFamily}
      about={summary.relationship_suppressed_duplicate_count > 0 ? `${summary.relationship_count} preferred link(s) shown; ${summary.relationship_suppressed_duplicate_count} reviewed duplicate link(s) folded into them. Expand them in the relationship graph.` : undefined}
      row={g => <li className="dsr-fam" key={g.family}>
        <span className="dsr-fam-name"><i className="ds-line" style={{background: LINK[g.family as LinkFamily].colour}} aria-hidden="true"/> {LINK[g.family as LinkFamily].name}</span>
        <ul className="dsr-rows">{g.rows.map(linkRow)}</ul>
      </li>}/></div>

    <div className={lit('money')}><Section id={sid('money')} icon={Coins} title="Money" count={payments.length} items={payments}
      tools={<IconLink icon={ExternalLink} label="Open in See › Money" href={caseHref('/see#money-flows', investigationId)}/>}
      row={t => {
        const incoming = ids.has(t.to_entity_id);
        const other = incoming ? {id: t.from_entity_id, name: t.from} : {id: t.to_entity_id, name: t.to};
        const when = t.dateTime ?? t.dateEnd;
        return <li className="dsr-row" key={t.id}>
          <div className="dsr-line">
            <Reveal label={incoming ? 'Paid to this party' : 'Paid by this party'} detail={`${incoming ? 'In' : 'Out'}${t.certainty !== 'shown' ? ` · ${t.certainty.replace(/_/g, ' ')}` : ''}${t.statedPurpose ? ` · ${t.statedPurpose}` : ''}`}>
              <span className={`dsr-dir ${incoming ? 'in' : 'out'}`} aria-hidden="true">{incoming ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>}</span></Reveal>
            <button type="button" className="dsr-party" onClick={() => openDossier(other.id)} aria-label={`Open ${other.name}`}>{other.name}</button>
            <span className="dsr-amt">{amountText(t.amount, t.currency)}</span>
            {when && <span className="dsr-when">{dateWords(when.slice(0, 10))}</span>}
            <span className="dsr-acts"><IconAct icon={Route} label="Trace payment" onClick={() => tracePayment(t)}/></span>
          </div>
        </li>;
      }}/></div>

    {chainHasLinks && <section className="dsr-sec" aria-label="Ownership and control"><OwnershipChain key={`chain-${entity.id}`} entityId={entity.id} onParty={openDossier}/></section>}

    <div className={lit('sources')}><Section id={sid('sources')} icon={FileSearch} title="Sources" count={dossier.evidence.length} items={dossier.evidence}
      row={x => <li className="dsr-row" key={x.evidence.id}>
        <div className="dsr-line top">
          <div className="dsr-grow">
            <b className="dsr-src">{x.source?.title ?? 'Source'}</b>{x.evidence.locator && <span className="dsr-loc"> · {x.evidence.locator}</span>}
            {(x.evidence.quote || x.evidence.notes) && <q className="dsr-quote">{x.evidence.quote || x.evidence.notes}</q>}
          </div>
          <span className="dsr-acts">
            <IconAct icon={Route} label="Trace provenance" onClick={() => openProvenance({
              title: entity.caption, kind: 'dossier evidence', sourceId: x.source?.id, sourceUrl: x.source?.url ?? undefined, locator: x.evidence.locator ?? undefined,
              detail: x.evidence.quote || x.evidence.notes || undefined, entityId: entity.id, acceptedRecordType: 'evidence', acceptedRecordId: x.evidence.id,
            })}/>
            {x.source?.url && <IconLink icon={ExternalLink} label="Open the source" href={x.source.url} external/>}
          </span>
        </div>
      </li>}/></div>

    <div className={lit('work')}><Section id={sid('work')} icon={ListTodo} title="Leads and tasks" count={work.length} items={work}
      row={w => w.kind === 'lead'
        ? <li className="dsr-row" key={`lead-${w.lead.id}`}><div className="dsr-line">
          <StateMark state={w.lead.status}/>
          {w.lead.provider ? <Reveal className="dsr-grow" detail={`Lead · ${w.lead.provider}`}><span className="dsr-text">{w.lead.title}</span></Reveal>
            : <span className="dsr-text dsr-grow">{w.lead.title}</span>}
          <span className="dsr-acts"><IconAct icon={Route} label="Trace lead" onClick={() => openProvenance({title: w.lead.title, kind: 'lead', traceRecordType: 'lead', acceptedRecordId: w.lead.id})}/></span>
        </div></li>
        : <li className="dsr-row" key={`task-${w.task.id}`}><div className="dsr-line">
          <StateMark state={w.task.status}/>
          <span className="dsr-text dsr-grow">{w.task.title}</span>
          {(w.task.priority || w.task.owner) && <Reveal detail={[w.task.priority, w.task.owner].filter(Boolean).join(' · ')}><small className="dsr-owner" aria-hidden="true">{w.task.owner ?? w.task.priority}</small></Reveal>}
          <span className="dsr-acts"><IconAct icon={Route} label="Trace task" onClick={() => openProvenance({title: w.task.title, kind: 'reporting task', traceRecordType: 'task', acceptedRecordId: w.task.id})}/></span>
        </div></li>}/></div>

    <div className={lit('dates')}><Section id={sid('dates')} icon={CalendarDays} title="Dates" count={dossier.timeline.length} items={dossier.timeline}
      row={e => <li className="dsr-row" key={e.id}><div className="dsr-line">
        <span className="dsr-when lead">{dateWords(e.date_start, e.precision ?? undefined)}</span>
        <span className="dsr-text dsr-grow">{e.title}</span>
        <StateMark state={e.verification_status}/>
      </div></li>}/></div>

    <div className={lit('outside')}><Section id={sid('outside')} icon={Globe} title="Outside findings" count={dossier.external.findings.length} items={dossier.external.findings}
      about="What connectors found about this party outside the case. Each waits for review; nothing here is a record yet."
      row={f => <li className="dsr-row" key={f.id}><div className="dsr-line">
        <StateMark state={f.review_status || 'unreviewed'}/>
        <Reveal className="dsr-grow" detail={`${f.provider}${f.schema ? ` · ${f.schema}` : ''}`}><span className="dsr-text">{f.caption || f.id}</span></Reveal>
        {f.source_url && <span className="dsr-acts"><IconLink icon={ExternalLink} label={`Open at ${f.provider}`} href={f.source_url} external/></span>}
      </div></li>}/></div>

    <details className="dsr-fold">
      <summary>More <span className="dsr-fold-what">history · OpenAleph · every recorded value</span></summary>
      <div className="dsr-group">
        <Reveal detail="Identity decisions are reporter-reviewed judgements, not facts inferred by connectors. Merge audits and alias records are kept.">
          <h4 className="dsr-group-title">Identity / merge history</h4></Reveal>
        {identity.aliases.length + identity.canonical_decisions.length + identity.merge_audits.length === 0
          ? <p className="dsr-quiet">No merges or identity decisions yet</p>
          : <ul className="dsr-rows">
            {identity.aliases.map(a => <li className="dsr-row" key={a.id}><div className="dsr-line">
              <Reveal detail={<>{a.schema || 'entity'} · preserved record <span className="rv-mono">{a.id}</span></>}><span className="dsr-text">Alias: {a.caption}</span></Reveal></div></li>)}
            {identity.canonical_decisions.slice(0, 8).map(d => <li className="dsr-row" key={d.id}><div className="dsr-line">
              <Reveal detail={<>{Math.round(d.confidence * 100)}% reporter confidence{d.rationale ? ` · ${d.rationale}` : ''} · {timeDayWords(d.created_at)}</>}>
                <span className="dsr-text">{d.decision}: {d.other_entity?.caption || 'unknown entity'}</span></Reveal>
              {d.other_entity?.id && <span className="dsr-acts"><IconAct icon={ExternalLink} label={`Open ${d.other_entity.caption}`} onClick={() => openDossier(d.other_entity!.id)}/></span>}
            </div></li>)}
            {identity.merge_audits.slice(0, 8).map(m => {
              const folded = identity.aliases.find(a => a.id === m.source_entity_id)?.caption;
              return <li className="dsr-row" key={m.id}><div className="dsr-line">
                <Reveal detail={<span className="rv-mono">Merge audit: {m.source_entity_id} → {m.target_entity_id}</span>}>
                  <span className="dsr-text">Merged {folded ?? 'a record'} into this one · {timeDayWords(m.created_at)}{m.rationale ? `, because: ${m.rationale}` : ''}</span></Reveal>
              </div></li>;
            })}
          </ul>}
        {identity.unresolved_decision_count > 0 && <p className="dsr-quiet">{identity.unresolved_decision_count} identity decision(s) unresolved</p>}
      </div>
      <CorpusExpand key={entity.id} entityId={entity.id}/>
      <div className="dsr-group">
        <Reveal detail={`${summary.statement_count} statement(s) recorded about this party. Each value's origin is on its hover; a click traces it.`}>
          <h4 className="dsr-group-title">Every recorded value</h4></Reveal>
        <dl className="dsr-props">
          {Object.entries(props).filter(([, values]) => values.length).map(([prop, values]) => <div key={prop}>
            <dt>{propWords(prop)}</dt>
            <dd>{values.map(v => <Reveal key={v} tabbable={false} detail={originsOf(prop, v) ?? 'Where it comes from'}>
              <button type="button" className="dsr-key" onClick={() => traceEntity(propWords(prop), v)}>{valueText(prop, v)}</button></Reveal>)}</dd>
          </div>)}
        </dl>
      </div>
    </details>

    <Dialog open={!!pendingConflict} onOpenChange={(open: boolean) => { if (!open) setPendingConflict(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reporter rationale for {pendingConflict?.decision}</DialogTitle>
          <DialogDescription>Optional context for this property-conflict decision.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Property conflict rationale" value={conflictRationale} onChange={(e: ChangeEvent<HTMLInputElement>) => setConflictRationale(e.target.value)} placeholder="Rationale (optional)"/>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingConflict(null)}>Cancel</Button>
          <Button onClick={() => void confirmPropertyConflict()}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
