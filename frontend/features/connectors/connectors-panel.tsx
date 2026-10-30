'use client';
// Bring in › Connectors: look a party of the case up in the outside sources the server has connectors for. Converted to
// the 29 Oct rule (Ony: "Show only what matters; the rest on hover or click") and filling the screen:
//   left   the case's parties as a searchable picker (its kind a mark, its schema on hover); a typed name that is not a
//          party is searched outside with Enter or the row under the list;
//   right  the picked party with Open dossier and the two lookups (the chosen connector, or all of them in one auditable
//          session), then one card per connector with its state: the key (colour only, its word and line on hover, as
//          Settings › Connector keys says it; a refused key stays an alert), this case's mode, the last lookup's time
//          (what was sent on hover), and after a lookup its health and how many it found. What a connector finds stays
//          a finding until a reporter decides: the count of findings waiting links to Check › Connector findings.
//          Cross-provider candidates from an all-connector session are decided below the cards.
// The calls and their reply checks are generated from the API schema. The picked party is shared state
// (lib/workbench-store.ts): the graph and the dossier move it.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight, Search as SearchIcon} from 'lucide-react';
import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ChangeEvent, KeyboardEvent, ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {caseHref} from '../../lib/case-href';
import {
  enrichmentSessionClustersOptions, enrichmentSessionClustersQueryKey, getLookupSettingsOptions, listConnectorFindingsOptions,
  listConnectorFindingsQueryKey, listEntitiesOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {connectorSearch, decideCrossProviderCluster, enrichEntity, enrichEntityMulti} from '../../lib/generated/sdk.gen';
import type {EnrichmentClusterOut, EntityOut, LookupSourceOut} from '../../lib/generated/types.gen';
import {reportPayloadError} from '../../lib/report-error';
import {compactDay, timeWords} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {keyState} from '../settings/keys-pane';
import {PartyMark} from '../the-drop/kind-marks';

type Props = {
  investigationId: string;
  /** The connector names the server reported. */
  providers: string[];
  /** A case picker to show beside the parties (the all-in-one page); the stage screens use the frame's switcher. */
  picker?: ReactNode;
};

/** A provider run's health as Following's shapes (features/following/marks.tsx HEALTH): ● worked, ✕ failed, ○ anything
 *  else; the word on hover (Ony, 29 Oct). */
const runGlyph = (status: string): [string, string] => (['ok', 'completed', 'succeeded'].includes(status) ? ['●', 'ok'] : status === 'failed' ? ['✕', 'bad'] : ['○', 'quiet']);
type Run = {provider: string; status: string; result_count?: number | null};
const DECISION_MARK: Record<string, string> = {positive: '✓', negative: '✕', unsure: '○'};
const MODE_WORDS: Record<string, string> = {automatic: 'Automatic', ask: 'Ask first', off: 'Off'};
const MODE_DOES: Record<string, string> = {
  automatic: 'Each new party accepted into the case is looked up here once, in the background.',
  ask: 'Looked up only when you ask. You see the words before they go.',
  off: 'Never asked: a lookup to it is refused (Settings › Outside lookups).',
};
// The key's state in the app's status grammar (components/status.tsx): colour by default, Status marks add shape or word.
const KEY_STATUS: Record<string, string> = {ok: 'st-supported', saved: 'st-unshown', none: 'st-unshown', bad: 'st-disputed'};
const KEY_MARK: Record<string, string> = {ok: '✓', saved: '○', none: '○', bad: '✕'};

// One empty list while the entities load, so the effect below sees the same value.
const NO_ENTITIES: EntityOut[] = [];
const clock = (iso: string) => { const t = timeWords(iso); return t.slice(t.lastIndexOf(',') + 2); };
const shortWhen = (iso: string) => (compactDay(iso) === compactDay(new Date().toISOString()) ? clock(iso) : compactDay(iso));

export function ConnectorsPanel({investigationId, providers, picker}: Props): ReactElement {
  const queryClient = useQueryClient();
  const entityId = useWorkbenchStore(state => state.entityId);
  const setEntityId = useWorkbenchStore(state => state.setEntityId);
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const [provider, setProvider] = useState(providers[0] ?? 'aleph');
  const [q, setQ] = useState('');
  const [enrichStatus, setEnrichStatus] = useState('');
  const [busy, setBusy] = useState('');
  // Per connector: what its last lookup from this screen found (count), or its run's status in a session.
  const [found, setFound] = useState<Record<string, Run>>({});
  // The session whose clusters are shown; its clusters are a query keyed by it.
  const [clusterSession, setClusterSession] = useState('');

  const path = {investigation_id: investigationId};
  const entitiesQuery = useQuery({...listEntitiesOptions({path}), enabled: Boolean(investigationId)});
  const entities = entitiesQuery.data ?? NO_ENTITIES;
  const lookups = useQuery({...getLookupSettingsOptions({query: investigationId ? {investigation_id: investigationId} : {}})});
  const findingsQuery = useQuery({...listConnectorFindingsOptions({path}), enabled: Boolean(investigationId)});
  const waiting = (findingsQuery.data ?? []).filter(f => f.review_status === 'unreviewed').length;
  const clustersQuery = useQuery({...enrichmentSessionClustersOptions({path: {session_id: clusterSession}}), enabled: Boolean(clusterSession)});
  const clusters: EnrichmentClusterOut[] = clusterSession ? clustersQuery.data ?? [] : [];
  const sourceOf = (p: string): LookupSourceOut | undefined => lookups.data?.sources.find(s => s.key === p);
  const nameOf = (p: string) => sourceOf(p)?.label ?? p;
  const sent = (lookups.data?.week ?? []).filter(r => r.kind === 'lookup' && r.investigation_id === investigationId).slice(0, 30);

  useEffect(() => { if (!providers.includes(provider) && providers[0]) setProvider(providers[0]); }, [providers, provider]);

  // The picked party follows the list: the first one when none is picked or the picked one is gone.
  useEffect(() => {
    if (!entitiesQuery.data) return;
    const rows = entitiesQuery.data;
    const current = useWorkbenchStore.getState().entityId;
    if (!rows.some(x => x.id === current)) setEntityId(rows[0]?.id || '');
  }, [entitiesQuery.data, setEntityId]);

  // A new case starts without a running lookup, its results or its clusters.
  const enrichmentSerial = useRef(0);
  useEffect(() => { enrichmentSerial.current += 1; setEnrichStatus(''); setClusterSession(''); setFound({}); setBusy(''); }, [investigationId]);

  const reloadFindings = () => queryClient.invalidateQueries({queryKey: listConnectorFindingsQueryKey({path})});
  const entity = entities.find(e => e.id === entityId);
  const typed = q.trim().toLowerCase();
  const shown = useMemo(() => (typed ? entities.filter(e => e.caption.toLowerCase().includes(typed)) : entities), [entities, typed]);

  const search = async () => {
    if (!investigationId || !q.trim()) return;
    setBusy(provider);
    try {
      const rows = (await connectorSearch({path: {provider}, body: {investigation_id: investigationId, query: q.trim()}, throwOnError: true})).data;
      setFound(cur => ({...cur, [provider]: {provider, status: 'completed', result_count: rows.length}}));
      setEnrichStatus(`${nameOf(provider)}: ${rows.length} finding(s) for “${q.trim()}”`);
      await reloadFindings();
    } catch (error) {
      reportPayloadError(error);
    } finally {
      setBusy('');
    }
  };

  const enrich = async () => {
    if (!entityId) return;
    setBusy(provider);
    setEnrichStatus(`Running ${nameOf(provider)}…`);
    try {
      const rows = (await enrichEntity({path: {entity_id: entityId, provider}, throwOnError: true})).data;
      setFound(cur => ({...cur, [provider]: {provider, status: 'completed', result_count: rows.length}}));
      setEnrichStatus(`${provider}: ${rows.length} finding(s)`);
      await reloadFindings();
    } catch (error) {
      setEnrichStatus('');
      reportPayloadError(error);
    } finally {
      setBusy('');
    }
  };

  // Every provider in one session. A result that arrives after another run started, or after the case changed, is dropped.
  const enrichAll = async () => {
    if (!entityId) return;
    const serial = ++enrichmentSerial.current;
    const current = () => enrichmentSerial.current === serial;
    setBusy('*');
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
      setFound(Object.fromEntries(session.runs.map(r => [r.provider, r])));
      await reloadFindings();
    } catch (error) {
      if (!current()) return;
      setEnrichStatus('');
      reportPayloadError(error);
    } finally {
      if (current()) setBusy('');
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

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void search(); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length) {
      e.preventDefault();
      const at = shown.findIndex(x => x.id === entityId);
      const next = e.key === 'ArrowDown' ? Math.min(shown.length - 1, at + 1) : Math.max(0, at - 1);
      setEntityId(shown[next].id);
    }
  };

  return <section className="cn" aria-label="Connectors">
    <div className="cn-left">
      {picker && <div className="cn-picker">{picker}</div>}
      <label className="cn-find"><SearchIcon size={15} aria-hidden="true"/>
        <input value={q} onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Search people, companies, identifiers..." aria-label="Find a party, or a name to search outside"/></label>
      <div className="cn-parties" role="listbox" aria-label="Parties of the case">
        {shown.map(e => <div key={e.id} role="option" aria-selected={e.id === entityId} tabIndex={-1}
          className={`cn-party${e.id === entityId ? ' on' : ''}`} onClick={() => setEntityId(e.id)}>
          <PartyMark schema={e.schema} tabbable={false}/><span className="cn-party-name">{e.caption}</span></div>)}
        {entitiesQuery.data && !entities.length && <p className="cn-quiet">No party in this case yet.</p>}
        {entities.length > 0 && typed && !shown.length && <p className="cn-quiet">No party of the case is called that.</p>}
      </div>
      {q.trim() && <Reveal tabbable={false} describe={false} detail={<>Sends “{q.trim()}” to {sourceOf(provider)?.host || nameOf(provider)} from this computer (Enter).</>}>
        <button type="button" className="cn-out" aria-label="Search" onClick={() => void search()} disabled={Boolean(busy)}>
          <ArrowUpRight size={15} aria-hidden="true"/><span>Search {nameOf(provider)} for “{q.trim()}”</span></button></Reveal>}
    </div>

    <div className="cn-right">
      <header className="cn-head">
        {entity ? <>
          <PartyMark schema={entity.schema}/>
          <h2 className="cn-name">{entity.caption}</h2>
          <button type="button" className="cn-btn quiet" onClick={() => openDossier(entityId)}>Open dossier</button>
        </> : <h2 className="cn-name muted">{entitiesQuery.isPending ? 'Reading the parties…' : 'Pick a party'}</h2>}
        <span className="cn-acts">
          <button type="button" className="cn-btn" onClick={() => void enrich()} disabled={!entityId || Boolean(busy)}>Enrich with {provider}</button>
          <Reveal tabbable={false} detail="Every connector in one auditable session: each gets its own run, status, error and count, and a connector that answers is kept when another fails.">
            <button type="button" className="cn-btn pri" onClick={() => void enrichAll()} disabled={!entityId || Boolean(busy)}>Enrich all providers</button></Reveal>
        </span>
      </header>

      <div className="cn-cards" role="radiogroup" aria-label="Connectors">
        {providers.map(p => {
          const s = sourceOf(p);
          const st = s ? keyState(s) : null;
          const run = found[p];
          const mode = s ? (s.mode ?? s.default) : null;
          const [glyph, tone] = run ? runGlyph(run.status) : ['', ''];
          return <div key={p} role="radio" aria-checked={p === provider} tabIndex={0} className={`cn-card${p === provider ? ' on' : ''}${mode === 'off' ? ' off' : ''}`}
            onClick={() => setProvider(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setProvider(p); } }}>
            <div className="cn-card-top">
              <b className="cn-card-name">{nameOf(p)}</b>
              {st && (st.cls === 'bad'
                ? <span className="st st-always st-disputed">{st.words}</span>
                : <Reveal label={`Key: ${st.words}`} detail={<><b>Key: {st.words}</b><span className="rv-row">{st.line}</span></>}>
                  <span className={`st ${KEY_STATUS[st.cls]}`}><span className="st-mark" aria-hidden="true">{KEY_MARK[st.cls]}</span><span className="st-word">{st.words}</span></span></Reveal>)}
              {mode && <Reveal detail={`In this case: ${MODE_WORDS[mode] ?? mode}. ${MODE_DOES[mode] ?? ''}${s?.kind ? ` Unlocks ${s.kind}.` : ''}`}><span className={`cn-mode ${mode}`}>{MODE_WORDS[mode] ?? mode}</span></Reveal>}
            </div>
            <div className="cn-card-body">
              {busy === p || (busy === '*' && !run) ? <span className="cn-run quiet" role="status">asking…</span>
                : run ? <Reveal detail={`${run.status}${run.result_count != null ? ` · ${run.result_count} found` : ''}`}>
                  <span className={`cn-run ${tone}`}><i aria-hidden="true">{glyph}</i> <b>{run.result_count ?? 0}</b></span></Reveal>
                : null}
            </div>
            <div className="cn-card-foot">
              {s?.last ? <Reveal detail={<><span className="rv-row">Last lookup {timeWords(s.last.at)} · {s.last.case}</span><span className="rv-row rv-mono">“{s.last.sent}” · {s.last.results} found</span></>}>
                <span className="cn-last">{shortWhen(s.last.at)}</span></Reveal> : <span className="cn-last muted">never used</span>}
              {st && st.cls !== 'ok' && <Link className="cn-key" href="/settings#keys" onClick={e => e.stopPropagation()}>{st.cls === 'none' ? 'Add a key' : 'Key'}</Link>}
            </div>
          </div>;
        })}
      </div>

      {/* What left this computer from this case this week, one line per lookup: the words sent, to which connector,
          when (in full on hover); a refused or unanswered lookup says so. */}
      <section className="cn-sent" aria-label="Sent from this case">
        <h3 className="cn-cap">Sent from this case{sent.length > 0 && <span className="cn-sent-n">{sent.length}</span>}</h3>
        {sent.length ? <ul className="cn-sent-list">{sent.map(r => <li key={r.id}>
          <b className="cn-sent-what">“{r.sent}”</b>
          <span className="cn-sent-to">{nameOf(r.service)}</span>
          {r.outcome === 'refused' ? <span className="cn-sent-bad">refused</span> : r.outcome === 'failed' ? <span className="cn-sent-bad">no answer</span> : null}
          <Reveal detail={`${timeWords(r.at)} · ${r.destination}`}><span className="cn-sent-at">{shortWhen(r.at)}</span></Reveal>
        </li>)}</ul> : <p className="cn-quiet">Nothing looked up from this case this week.</p>}
      </section>

      {/* The session's line for screen readers; on screen each card carries its own result, its words on hover. */}
      <p className="st-sr" role="status">{enrichStatus}</p>

      {clusters.length > 0 && <section className="cn-clusters" aria-label="Cross-provider candidates">
        <h3 className="cn-cap">Cross-provider candidates</h3>
        {clusters.map(c => <div className="cn-cluster" key={c.cluster_key}>
          <Reveal detail={(c.pairs[0]?.reasons ?? []).map(r => `${r.kind}: ${r.detail}`).join(' · ') || 'No reasons recorded'}><b>{Math.round(c.score * 100)}% possible same outside entity</b></Reveal>
          <div className="cn-cluster-list">{c.findings.map(f => <div key={f.id}>{f.provider}: {f.caption}</div>)}</div>
          <div className="cn-cluster-acts">
            <button type="button" className="cn-btn" onClick={() => void decideCluster(c, 'positive')}>Same external entity</button>
            <button type="button" className="cn-btn" onClick={() => void decideCluster(c, 'negative')}>Different</button>
            <button type="button" className="cn-btn" onClick={() => void decideCluster(c, 'unsure')}>Unsure</button>
            {c.decision && <Reveal label={`Latest decision: ${c.decision.decision}`} detail={`Latest decision: ${c.decision.decision}`}>
              <b aria-hidden="true">{DECISION_MARK[c.decision.decision] ?? '·'}</b></Reveal>}
          </div>
        </div>)}
      </section>}

      <footer className="cn-foot">
        <Link className={`cn-findings${waiting ? '' : ' none'}`} href={caseHref('/check#review-queue', investigationId)}>
          <b>{waiting}</b><span>{waiting === 1 ? 'finding' : 'findings'} to review</span><ArrowUpRight size={15} aria-hidden="true"/></Link>
        <Reveal detail="What a connector finds stays a finding until a reporter decides what it means, in Check › Connector findings. Each lookup leaves a trace on that site: the name you asked about, from this computer’s address.">
          <span className="cn-why" aria-hidden="true">?</span></Reveal>
      </footer>
    </div>
  </section>;
}
