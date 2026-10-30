'use client';
// The investigation's copy in OpenAleph (ADR-0006, Wave B): the "Corpus
// sync" line -- last push, what is still to send, the last cross-referencing
// run, recent failures -- with "Sync now", and the cross-references
// OpenAleph's cross-referencing found for the investigation's confirmed
// entities, each decided "Same entity", "Different" or "Not sure" with a note.
//
// A panel of its own rather than a section of the review queue: the queue is
// built around connector findings (inspect a finding, resolve it to a record,
// assess its statements), while a cross-reference is a pair -- one of our
// records and an entity in another collection -- decided in one step, with
// the decision sent back to OpenAleph as a match judgement.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {RefreshCw} from 'lucide-react';

import {Input} from '@/components/ui/input';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {
  getCorpusSyncOptions, getCorpusSyncQueryKey, listInvestigationCrossReferencesOptions, listInvestigationCrossReferencesQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import {decideInvestigationCrossReference, syncCorpusNow} from '../../lib/generated/sdk.gen';
import type {CorpusSyncOut, CrossReferenceOut} from '../../lib/generated/types.gen';
import {compactDay, timeWords} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {PartyMark} from '../the-drop/kind-marks';
import {CorpusInsights} from './corpus-insights';
import {EntitySets} from './entity-sets';
import {Watchlist} from './watchlist';

type Props = {investigationId: string};
type Decision = 'same' | 'different' | 'unsure';

const DECISIONS: {value: Decision; label: string}[] = [
  {value: 'same', label: 'Same entity'}, {value: 'different', label: 'Different'}, {value: 'unsure', label: 'Not sure'},
];
const DECISION_LABEL: Record<string, string> = {same: 'Same entity', different: 'Different', unsure: 'Not sure'};

function when(value: string | null): string {
  return value ? timeWords(value) : 'never';
}

/** The "Corpus sync" line in plain words. */
export function corpusSyncSummary(sync: CorpusSyncOut): string[] {
  if (!sync.enabled) return [sync.pending.cannot_send[0] ?? 'OpenAleph integration is disabled on this deployment.'];
  const push = sync.push;
  const lines = [
    `Last push: ${push.status === 'never' ? 'never' : `${push.status}, ${when(push.finished_at ?? push.started_at)}`}${push.message ? ` — ${push.message}` : ''}`,
    `Pending: ${sync.pending.to_send} to send · ${sync.pending.to_remove} to remove · ${sync.pending.judgements} judgement(s) · ${sync.pushed_records} record(s) in ${sync.collection_label ?? 'no collection yet'}`,
  ];
  const xref = sync.cross_reference;
  lines.push(`Last cross-reference run: ${xref.status === 'never' ? 'never' : `${xref.status}, ${when(xref.finished_at ?? xref.requested_at)}`}`
    + (xref.status === 'succeeded' ? ` — ${xref.results} match(es), ${xref.new} new, ${xref.duplicates} possible duplicate(s)` : '')
    + ` · ${xref.open} waiting for review`);
  if (sync.consecutive_failures > 0 || sync.failures.length > 0) {
    lines.push(`Failures: ${sync.consecutive_failures} in a row${sync.failures[0] ? ` — latest ${sync.failures[0].operation}: ${sync.failures[0].error}` : ''}`);
  }
  return lines;
}

/** The sync's health in the app's status grammar (components/status.tsx): colour by default, Settings › Appearance ›
 *  Status marks adds the shape or the word; the word is always in the reveal. */
function syncHealth(sync: CorpusSyncOut): {glyph: string; word: string; tone: string} {
  if (!sync.enabled) return {glyph: '–', word: 'Not set up', tone: 'st-ruled_out'};
  if (sync.consecutive_failures > 0 || sync.push.status === 'failed') return {glyph: '✕', word: 'Failing', tone: 'st-disputed'};
  if (sync.push.status === 'never') return {glyph: '○', word: 'Never sent', tone: 'st-unshown'};
  if (sync.push.status === 'succeeded') return {glyph: '✓', word: 'Works', tone: 'st-supported'};
  return {glyph: '○', word: sync.push.status, tone: 'st-unshown'};
}

const ABOUT = 'Confirmed entities and relationships are copied to the investigation’s OpenAleph collection, which cross-references them with everything OpenAleph holds. A match is only a proposal until a reporter decides.';
/** When it last went, short: a time today, else the day; the full time is on hover. */
function sentWhen(sync: CorpusSyncOut): string {
  const at = sync.push.finished_at ?? sync.push.started_at;
  if (!at || sync.push.status === 'never') return 'never sent';
  const day = compactDay(at);
  const words = timeWords(at);
  return day === compactDay(new Date().toISOString()) ? words.slice(words.lastIndexOf(',') + 2) : day;
}

export function CorpusPanel({investigationId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);

  const path = {investigation_id: investigationId};
  const syncQuery = useQuery({...getCorpusSyncOptions({path}), enabled: Boolean(investigationId)});
  const xrefQuery = useQuery({...listInvestigationCrossReferencesOptions({path}), enabled: Boolean(investigationId)});
  const sync = syncQuery.data;
  const crossReferences: CrossReferenceOut[] = xrefQuery.data ?? [];

  const syncNow = async () => {
    setSyncing(true);
    setStatus('');
    try {
      const reply = (await syncCorpusNow({path, throwOnError: true})).data;
      queryClient.setQueryData(getCorpusSyncQueryKey({path}), reply.sync);
      await queryClient.invalidateQueries({queryKey: listInvestigationCrossReferencesQueryKey({path})});
      setStatus(reply.queued ? 'Sync queued: the background worker sends the changes now.' : 'Synced.');
    } catch (error) {
      setStatus(errorMessage(error, 'Could not sync with OpenAleph'));
    } finally {
      setSyncing(false);
    }
  };

  const decide = async (row: CrossReferenceOut, decision: Decision) => {
    try {
      await decideInvestigationCrossReference({path: {cross_reference_id: row.id}, body: {decision, note: notes[row.id]?.trim() || null}, throwOnError: true});
      setNotes(current => ({...current, [row.id]: ''}));
      setStatus(`Recorded “${DECISION_LABEL[decision]}” for ${row.entity.caption} and ${row.match.caption}.`);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: listInvestigationCrossReferencesQueryKey({path})}),
        queryClient.invalidateQueries({queryKey: getCorpusSyncQueryKey({path})}),
      ]);
    } catch (error) {
      setStatus(errorMessage(error, 'Could not record the decision'));
    }
  };

  const lines = sync ? corpusSyncSummary(sync) : [];
  const h = sync ? syncHealth(sync) : null;
  const syncButton = <button type="button" className="co-sync-btn" onClick={() => void syncNow()} disabled={!sync?.enabled || syncing}>
    <RefreshCw size={14} aria-hidden="true" className={syncing ? 'wl-spin' : undefined}/>{syncing ? 'Syncing…' : 'Sync now'}</button>;

  // No title of its own: the tab says "OpenAleph corpus". One strip says how the sync stands (a colour, when it last
  // went, what waits); what the corpus is and every line of the sync are on hover. Failures and errors stay (alerts).
  return <section className="co" id="corpus" aria-label="OpenAleph corpus">
    <header className="co-strip">
      {syncQuery.isError && <p className="co-alert">{errorMessage(syncQuery.error, 'Could not load the corpus sync line')}</p>}
      {sync && h && <Reveal className="co-sync" detail={<><b>{h.word}</b><span className="rv-row">{ABOUT}</span>
        {lines.filter(l => !l.startsWith('Failures:')).map(line => <span className="rv-row" key={line}>{line}</span>)}</>}>
        <span className={`st ${h.tone}`}><span className="st-mark" aria-hidden="true">{h.glyph}</span><span className="st-word">{h.word}</span></span>
        <span className="co-when">{sync.enabled ? sentWhen(sync) : 'not sent'}</span>
        {sync.enabled && <><span className="co-n"><b>{sync.pending.to_send}</b> to send</span>
          {sync.cross_reference.open > 0 && <span className="co-n"><b>{sync.cross_reference.open}</b> to review</span>}</>}
      </Reveal>}
      {sync && !sync.background && sync.enabled
        ? <Reveal tabbable={false} detail="No background worker runs here: changes reach OpenAleph on “Sync now”.">{syncButton}</Reveal> : syncButton}
      {lines.filter(l => l.startsWith('Failures:')).map(line => <p className="co-alert" key={line}>{line}</p>)}
      {sync?.push.error && <p className="co-alert">Last error: {sync.push.error}</p>}
      {sync?.cross_reference.error && <p className="co-alert">Cross-referencing error: {sync.cross_reference.error}</p>}
      {status && <p className="co-status" role="status">{status}</p>}
    </header>
    <div className="co-main"><Watchlist investigationId={investigationId}/></div>
    <aside className="co-rail" aria-label="What OpenAleph holds">
      <CorpusInsights investigationId={investigationId}/>
      <section className="co-box" aria-label="Cross-references to review">
        <h4 className="co-cap">Cross-references to review{crossReferences.length > 0 && <span className="co-count">{crossReferences.length}</span>}</h4>
        {xrefQuery.isError && <p className="co-alert">{errorMessage(xrefQuery.error, 'Could not load the cross-references')}</p>}
        {crossReferences.length === 0 ? <p className="co-quiet">No cross-reference waits for review.</p> : crossReferences.map(row => <div className="co-xref" key={row.id}>
          {/* Each side's kind is its party icon; where the match lives, the method and each property's score are on hover. */}
          <div className="co-pair"><PartyMark schema={row.entity.schema}/> <b>{row.entity.caption}</b> <span aria-hidden="true">↔</span> <PartyMark schema={row.match.schema}/>{' '}
            <Reveal detail={`(${row.match.schema}) in ${row.match.collection_label ?? 'another collection'}`}><b>{row.match.caption}</b></Reveal></div>
          <div><Reveal detail={<><span className="rv-row">{`Score ${Math.round(row.score * 100)}%${row.method ? ` · ${row.method}` : ''}`}</span>
            {row.matched_properties.map(p => <span className="rv-row" key={p.property_type}>{`${p.label} (${Math.round(p.score * 100)}%): ${p.ours.join(', ')} ↔ ${p.theirs.join(', ')}`}</span>)}</>}>
            <span className="co-score"><i style={{width: `${Math.round(row.score * 100)}%`}}/></span> <b>{Math.round(row.score * 100)}%</b></Reveal></div>
          <div className="co-links"><a href={row.match.url} target="_blank" rel="noreferrer">Open in OpenAleph</a>
            <button type="button" className="co-link" onClick={() => openDossier(row.entity.id)}>Open dossier</button></div>
          <Input aria-label={`Note on ${row.match.caption}`} value={notes[row.id] ?? ''} placeholder="Note (optional)"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNotes(current => ({...current, [row.id]: e.target.value}))}/>
          <div className="co-acts">
            {DECISIONS.map(d => <button type="button" key={d.value} className="wl-btn" onClick={() => void decide(row, d.value)}>{d.label}</button>)}
          </div>
        </div>)}
      </section>
      <EntitySets investigationId={investigationId}/>
    </aside>
  </section>;
}
