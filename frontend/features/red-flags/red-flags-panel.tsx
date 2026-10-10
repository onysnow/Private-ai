'use client';
// Red Flags (docs/discovery/indicators.md; backend app/patterns/): patterns
// from the indicator catalogue found in this investigation's records. A flag
// is a lead, not a finding: each card says what the pattern is, the
// innocent explanations first, then why it matters with its source, how it
// ranks and why, and what it may also point to. The reporter makes it a
// lead or sets it aside with a reason; pointing at a party lights it in
// every chart.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {
  dismissRedFlagMutation, getRedFlagsOptions, getRedFlagsQueryKey, listLeadsQueryKey, makeLeadFromRedFlagMutation, reopenRedFlagMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {RedFlagOut} from '../../lib/generated/types.gen';
import {PARTY, partyKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';

export const LEVEL: Record<string, {name: string; meaning: string}> = {
  faint: {name: 'Faint', meaning: 'the pattern appears'},
  strong: {name: 'Strong', meaning: 'it looks serious'},
  textbook: {name: 'Textbook', meaning: 'it meets the published definition or threshold'},
};

function FlagCard({flag, rank, onLead, onDismiss, onReopen}: {flag: RedFlagOut; rank: number; onLead: () => Promise<void>;
  onDismiss: (reason: string) => Promise<void>; onReopen: () => Promise<void>}): ReactElement {
  const setPointed = useWorkbenchStore(state => state.setPointedParty);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const ind = flag.indicator;
  const source = ind?.sources[0];
  const max = Math.max(1.5, flag.weight);
  // The whole card rises with the level (Ony, 10 Oct 2026): Faint is a quiet card;
  // Strong gets a thicker edge and a tinted band; Textbook a brick frame on every side,
  // a red band saying it meets the published definition, and more room.
  return <article className={`rf-card level-${flag.level}${flag.status !== 'open' ? ' decided' : ''}`} aria-label={`Red Flag: ${ind?.name ?? flag.indicator_id}`}>
    {flag.level !== 'faint' && <div className="rf-band">{LEVEL[flag.level].name} · {LEVEL[flag.level].meaning}</div>}
    <header className="rf-head">
      <span className="rf-rank">{rank}</span>
      <div>
        <h4>{ind?.name ?? flag.indicator_id}</h4>
        <small>{flag.level === 'faint' ? `Faint · ${LEVEL.faint.meaning} · ` : ''}{flag.indicator_id}{ind ? ` · ${ind.area_name}` : ''}</small>
      </div>
    </header>
    <div className="rf-who">{flag.parties.map(p => <button type="button" key={p.id} className="sv-pd rf-party"
      onMouseEnter={() => setPointed(p.id)} onMouseLeave={() => setPointed(null)} onFocus={() => setPointed(p.id)} onBlur={() => setPointed(null)}>
      <i style={{borderColor: PARTY[partyKind(p.schema)].ring}}/>{p.name}</button>)}</div>
    <p className="rf-summary">{flag.summary}</p>
    {ind && <>
      <div className="rf-row"><b>Could be innocent.</b> {ind.innocent_explanations.map(t => t.replace(/[.;]\s*$/, '')).join('; ')}.</div>
      <div className="rf-row"><b>The pattern.</b> {ind.definition}</div>
      {source && <div className="rf-row"><b>Documented in.</b> <a href={source.url} target="_blank" rel="noreferrer">{source.publisher}, {source.title}</a>
        {source.locator ? `, ${source.locator}` : ''}: “{source.quote}”</div>}
      <div className="rf-row"><b>This level.</b> {LEVEL[flag.level].name}: {ind.levels[flag.level as 'faint' | 'strong' | 'textbook']}</div>
      {ind.cross_hints.length > 0 && <div className="rf-row"><b>This may also point to.</b> {ind.cross_hints.map((h, i) => <span key={i}>
        {i > 0 && ' '}<a href={h.source_url} target="_blank" rel="noreferrer">{h.target_area}</a>: {h.reason}</span>)}</div>}
    </>}
    <div className="rf-weight" aria-label={`Weight ${flag.weight}`}>
      <span>weight</span>
      <span className="rf-track"><i style={{width: `${Math.max(4, 100 * Math.max(0, flag.weight) / max)}%`}}/></span>
      <span>{flag.weight} · {flag.weight_parts.map(p => `${p.value > 0 ? '+' : ''}${p.value} ${p.why}`).join(' · ')}</span>
    </div>
    {flag.status === 'dismissed' && <p className="rf-row"><b>Set aside.</b> {flag.dismissed_reason}</p>}
    <div className="rf-actions">
      {flag.status === 'made_lead' ? <span className="sv-muted">Made a lead</span>
        : <button type="button" className="sv-btn p" onClick={onLead}>Make it a lead</button>}
      {flag.status === 'open' && !asking && <button type="button" className="sv-btn" onClick={() => setAsking(true)}>Not relevant</button>}
      {flag.status === 'dismissed' && <button type="button" className="sv-btn" onClick={onReopen}>Open it again</button>}
    </div>
    {asking && <form className="sv-new" onSubmit={e => { e.preventDefault(); if (reason.trim()) void onDismiss(reason.trim()).then(() => setAsking(false)); }}>
      <input aria-label="Why it is not relevant" placeholder="Why it is not relevant" value={reason}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}/>
      <button type="submit" className="sv-btn" disabled={!reason.trim()}>Set aside</button>
      <button type="button" className="sv-btn" onClick={() => setAsking(false)}>Cancel</button>
    </form>}
  </article>;
}

const LEVEL_ORDER = ['textbook', 'strong', 'faint'];
/** Textbook flags first, then Strong, then Faint; by weight within a level (the server's order). */
const byLevel = (a: RedFlagOut, b: RedFlagOut): number => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);

export function RedFlagsPanel({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const query = useQuery({...getRedFlagsOptions({path}), enabled: Boolean(investigationId)});
  const dismiss = useMutation({...dismissRedFlagMutation()});
  const reopen = useMutation({...reopenRedFlagMutation()});
  const lead = useMutation({...makeLeadFromRedFlagMutation()});
  const [problem, setProblem] = useState('');
  const key = getRedFlagsQueryKey({path});
  const attempt = async (work: () => Promise<unknown>, failed: string) => {
    try { await work(); setProblem(''); } catch (error) { setProblem(errorMessage(error, failed)); }
  };

  const flags = query.data?.flags ?? [];
  const gone = query.data?.gone ?? [];
  const rules = query.data?.rules ?? [];
  // Grouped by the indicator's area; the investigation's own type is not set yet, so no area comes first.
  const areas = Array.from(new Set(flags.map(f => f.indicator?.area_name ?? 'Other')));
  let rank = 0;

  return <section className="card rf" id="red-flags" aria-labelledby="red-flags-title">
    <h3 id="red-flags-title">Red Flags</h3>
    <p className="sv-psub">Patterns from published cases found in this investigation&apos;s records. Each is a lead, not a finding: it says why it matters,
      where it was documented, and the innocent explanations. {rules.length} rules run now: {rules.map(r => r.name).join('; ')}.</p>
    {query.isError && <p className="sv-error">{errorMessage(query.error, 'Could not run the rules')}</p>}
    {problem && <p className="sv-error" role="alert">{problem}</p>}
    {query.data && !flags.length && <p className="sv-muted">No pattern fires on these records.</p>}
    {areas.map(area => <div key={area} className="rf-group">
      <h4 className="rf-area">{area}</h4>
      {flags.filter(f => (f.indicator?.area_name ?? 'Other') === area).sort(byLevel).map(f => { rank += 1; return <FlagCard key={f.id} flag={f} rank={rank}
        onLead={() => attempt(async () => { await lead.mutateAsync({path: {flag_id: f.id}}); await Promise.all([
          queryClient.invalidateQueries({queryKey: key}), queryClient.invalidateQueries({queryKey: listLeadsQueryKey({path})})]); }, 'Could not make the lead')}
        onDismiss={reason => attempt(async () => { queryClient.setQueryData(key, await dismiss.mutateAsync({path: {flag_id: f.id}, body: {reason}})); }, 'Could not set it aside')}
        onReopen={() => attempt(async () => { queryClient.setQueryData(key, await reopen.mutateAsync({path: {flag_id: f.id}})); }, 'Could not open it again')}/>; })}
    </div>)}
    {gone.length > 0 && <details className="rf-gone"><summary>No longer fire ({gone.length})</summary>
      <ul>{gone.map(f => <li key={f.id}><b>{f.indicator?.name ?? f.indicator_id}</b>: {f.summary} <small>The records changed so the pattern no longer holds.</small></li>)}</ul>
    </details>}
  </section>;
}
