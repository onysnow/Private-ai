'use client';
// Red Flags (docs/discovery/indicators.md; backend app/patterns/): patterns
// from the indicator catalogue found in this investigation's records. A flag
// is a lead, not a finding. A slim card in the list says what was found and
// the first innocent explanation; Details opens the rest in a drawer, innocent
// explanations first, then why it matters, the source and the ranking. The
// reporter adds it to leads or sets it aside with a reason; pointing at a
// party lights it in every chart.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {NeonTitle} from '../effects/board-effects';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';
import {z} from 'zod';

import {Form, FormControl, FormField, FormItemBare, FormMessage, FormRootError} from '@/components/ui/form';
import {errorMessage} from '../../lib/api-client';
import {submitWith, useZodForm} from '../../lib/forms';
import {
  dismissRedFlagMutation, getChecksQueryKey, getRedFlagsQueryKey, listAreasOptions, listLeadsQueryKey, makeLeadFromRedFlagMutation,
  reopenRedFlagMutation, setInvestigationTypeMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {InvestigationTypeOut, RedFlagOut} from '../../lib/generated/types.gen';
import {PARTY, partyKind} from '../../lib/viz-tokens';
import {GlossaryText} from '../glossary/glossary-text';
import {DECISION} from '../to-check/to-check-panel';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {useRedFlagsQuery} from './use-red-flags-query';
import type {RedFlagsRead} from './use-red-flags-query';

export const LEVEL: Record<string, {name: string; meaning: string}> = {
  faint: {name: 'Faint', meaning: 'the pattern appears'},
  strong: {name: 'Strong', meaning: 'it looks serious'},
  textbook: {name: 'Textbook', meaning: 'it meets the published definition or threshold'},
};

/** onDismiss is asked from a form (why it is set aside) and fails as a rejection, so the form shows why and keeps the reason. */
export type FlagActions = {onLead: () => Promise<void>; onDismiss: (reason: string) => Promise<void>; onReopen: () => Promise<void>};
/** Why a flag is set aside, as the backend takes it (FlagDismiss: reason 1–2000): on the card, the drawer and the Act board. */
export const dismissSchema = z.object({reason: z.string().trim().min(1, 'Write why first.').max(2000, 'Keep the reason under 2,000 characters.')});
export type DismissValues = z.infer<typeof dismissSchema>;
const PARTIES_SHOWN = 4;
const plain = (t: string) => t.replace(/[.;]\s*$/, '');

/** Add to leads, Not relevant (with a reason), Open it again: the same on the card and in the drawer. */
export function FlagActionsRow({flag, onLead, onDismiss, onReopen}: {flag: RedFlagOut} & FlagActions): ReactElement {
  const [asking, setAsking] = useState(false);
  const form = useZodForm<DismissValues>(dismissSchema, {defaultValues: {reason: ''}, mode: 'onSubmit'});
  return <>
    <div className="rf-actions">
      {flag.status === 'made_lead' ? <span className="sv-muted">In leads</span>
        : <button type="button" className="sv-btn p" onClick={onLead}>Add to leads</button>}
      {flag.status === 'open' && !asking && <button type="button" className="sv-btn" onClick={() => setAsking(true)}>Not relevant</button>}
      {flag.status === 'dismissed' && <button type="button" className="sv-btn" onClick={onReopen}>Open it again</button>}
    </div>
    {asking && <Form {...form}><form className="sv-new" noValidate onSubmit={submitWith(form, async ({reason}) => {
      await onDismiss(reason);
      setAsking(false); form.reset();
    }, 'Could not set it aside')}>
      <FormField control={form.control} name="reason" render={({field}) => <FormItemBare>
        <FormControl><input {...field} aria-label="Why it is not relevant" placeholder="Why it is not relevant"/></FormControl>
        <FormMessage className="field-msg next-line"/></FormItemBare>}/>
      <FormRootError className="field-msg next-line"/>
      <button type="submit" className="sv-btn">Set aside</button>
      <button type="button" className="sv-btn" onClick={() => setAsking(false)}>Cancel</button>
    </form></Form>}
  </>;
}

/** A flag's parties: pointing at one lights it everywhere; clicking one opens its dossier, as a party does in the network. */
export function PartyButtons({parties, limit}: {parties: RedFlagOut['parties']; limit?: number}): ReactElement {
  const setPointed = useWorkbenchStore(state => state.setPointedParty);
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const shown = limit ? parties.slice(0, limit) : parties;
  return <div className="rf-who">{shown.map(p => <button type="button" key={p.id} className="sv-pd rf-party" title={`Open ${p.name}'s dossier`}
    onMouseEnter={() => setPointed(p.id)} onMouseLeave={() => setPointed(null)} onFocus={() => setPointed(p.id)} onBlur={() => setPointed(null)}
    onClick={() => openDossier(p.id)}>
    <i style={{borderColor: PARTY[partyKind(p.schema)].ring}}/>{p.name}</button>)}
    {shown.length < parties.length && <span className="sv-muted">+{parties.length - shown.length} more</span>}</div>;
}

/** What the records can't show, each part a link to its item in To check (Verify), with the decision once made. */
export function NotShown({flag}: {flag: RedFlagOut}): ReactElement {
  const openCheck = useWorkbenchStore(state => state.openCheck);
  const go = (id: string) => { openCheck(id); document.getElementById('to-check')?.scrollIntoView({behavior: 'smooth', block: 'start'}); };
  return <>{flag.not_shown.map((part, i) => {
    const item = (flag.checks ?? []).find(c => c.question === part);
    return <span key={part}>{i > 0 && '; '}{item
      ? <button type="button" className="tc-link" onClick={() => go(item.id)} title="Open it in To check">{part}</button> : part}
      {item && item.status !== 'open' && <small> ({DECISION[item.status]})</small>}</span>;
  })}</>;
}

/** The card in the list: what is needed to decide whether to open it (Ony, 10 Oct 2026: "only the necessary text
 * before you click"). The level, the pattern, who, what was found, the first innocent explanation, what the records
 * can't show, and the actions. Everything else is in the drawer. The whole card rises with the level: Faint is quiet;
 * Strong a thicker edge and a tinted band; Textbook a brick frame and a red band. */
function FlagCard({flag, rank, open, onOpen, ...actions}: {flag: RedFlagOut; rank: number; open: boolean; onOpen: () => void} & FlagActions): ReactElement {
  const ind = flag.indicator;
  const innocent = ind?.innocent_explanations ?? [];
  const name = ind?.name ?? flag.indicator_id;
  return <article className={`rf-card level-${flag.level}${flag.status !== 'open' ? ' decided' : ''}${open ? ' open' : ''}`} aria-label={`Red Flag: ${name}`}>
    {flag.level !== 'faint' && <div className="rf-band"><GlossaryText text={`${LEVEL[flag.level].name} · ${LEVEL[flag.level].meaning}`}/></div>}
    <header className="rf-head">
      <span className="rf-rank">{rank}</span>
      <div>
        <h4><button type="button" className="rf-open" onClick={onOpen} aria-expanded={open} aria-controls="rf-drawer">{name}</button></h4>
        <small>{flag.level === 'faint' ? `Faint · ${LEVEL.faint.meaning} · ` : ''}{flag.indicator_id}</small>
      </div>
    </header>
    <PartyButtons parties={flag.parties} limit={PARTIES_SHOWN}/>
    <p className="rf-summary"><GlossaryText text={flag.summary}/></p>
    {innocent.length > 0 && <p className="rf-line"><b>Could be innocent:</b> {plain(innocent[0])}{innocent.length > 1 ? `, +${innocent.length - 1} more` : ''}</p>}
    {flag.not_shown.length > 0 && <p className="rf-line"><b>Records can&apos;t show:</b> <NotShown flag={flag}/></p>}
    {flag.status === 'dismissed' && <p className="rf-line"><b>Set aside:</b> {flag.dismissed_reason}</p>}
    <div className="rf-foot">
      <FlagActionsRow flag={flag} {...actions}/>
      <button type="button" className="sv-btn rf-more" onClick={onOpen} aria-label={`Details: ${name}`}>Details</button>
    </div>
  </article>;
}

function SourceItem({src}: {src: NonNullable<RedFlagOut['indicator']>['sources'][number]}): ReactElement {
  return <div className="rf-source">
    <a href={src.url} target="_blank" rel="noreferrer">{src.publisher}, {src.title}</a>{src.locator ? `, ${src.locator}` : ''}
    <blockquote>“{src.quote}”</blockquote></div>;
}

/** Everything about one flag, as sections (Ony, 10 Oct 2026: the drawer has room, so no tabs): innocent explanations first (indicators.md),
 * then why it matters, where it was documented, and how it ranks. Shown in the drawer, and beside the list on the Act screen. */
export function FlagDetail({flag, ...actions}: {flag: RedFlagOut} & FlagActions): ReactElement {
  const ind = flag.indicator;
  const max = Math.max(1.5, flag.weight);
  const name = ind?.name ?? flag.indicator_id;
  return <>
    <p className="rf-drawer-level">{LEVEL[flag.level].name} · {LEVEL[flag.level].meaning}</p>
    <h3>{flag.level === 'textbook' ? <NeonTitle text={name}/> : name}</h3>
    <p className="sv-muted">{flag.indicator_id}{ind ? ` · ${ind.area_name}` : ''}{ind && <> · <a href={`/learn?indicator=${encodeURIComponent(ind.id)}`}>Full entry in the catalogue</a></>}</p>
    <p className="rf-summary"><GlossaryText text={flag.summary}/></p>
    <PartyButtons parties={flag.parties}/>
    <section className="rf-sec" aria-labelledby="rf-sec-innocent">
      <h4 id="rf-sec-innocent">Could be innocent</h4>
      <ul className="rf-list">{(ind?.innocent_explanations ?? []).map(t => <li key={t}><GlossaryText text={t}/></li>)}</ul>
      {flag.not_shown.length > 0 && <div className="rf-row rf-unknown"><b>The records can&apos;t show.</b> <NotShown flag={flag}/>. A person decides that, in To check.</div>}
    </section>
    {ind && <section className="rf-sec" aria-labelledby="rf-sec-why">
      <h4 id="rf-sec-why">Why it matters</h4>
      <p><GlossaryText text={ind.definition}/></p>
      <h5>This level</h5><p><GlossaryText text={`${LEVEL[flag.level].name}: ${ind.levels[flag.level as 'faint' | 'strong' | 'textbook']}`}/></p>
      {ind.levels.threshold_note && <details className="rf-fold"><summary>About the numbers</summary><p className="rf-note-text">{ind.levels.threshold_note}</p></details>}
      {ind.cross_hints.length > 0 && <><h5>This may also point to</h5><ul className="rf-list">{ind.cross_hints.map((h, i) => <li key={i}>
        <a href={h.source_url} target="_blank" rel="noreferrer">{h.target_area}</a>: <GlossaryText text={h.reason}/></li>)}</ul></>}
    </section>}
    {ind && ind.sources.length > 0 && <section className="rf-sec" aria-labelledby="rf-sec-source">
      <h4 id="rf-sec-source">Source</h4>
      <SourceItem src={ind.sources[0]}/>
      {ind.sources.length > 1 && <details className="rf-fold"><summary>{ind.sources.length - 1} more source{ind.sources.length > 2 ? 's' : ''}</summary>
        {ind.sources.slice(1).map((src, i) => <SourceItem key={i} src={src}/>)}</details>}
    </section>}
    <section className="rf-sec" aria-labelledby="rf-sec-rank">
      <h4 id="rf-sec-rank">Ranking</h4>
      <div className="rf-weight" aria-label={`Weight ${flag.weight}`}>
        <span>weight {flag.weight}</span>
        <span className="rf-track"><i style={{width: `${Math.max(4, 100 * Math.max(0, flag.weight) / max)}%`}}/></span>
      </div>
      <ul className="rf-list">{flag.weight_parts.map(p => <li key={p.why}>{p.value > 0 ? '+' : ''}{p.value} {p.why}</li>)}</ul>
    </section>
    {flag.status === 'dismissed' && <p className="rf-row"><b>Set aside.</b> {flag.dismissed_reason}</p>}
    <FlagActionsRow flag={flag} {...actions}/>
  </>;
}

function FlagDrawer({flag, onClose, ...actions}: {flag: RedFlagOut; onClose: () => void} & FlagActions): ReactElement {
  const name = flag.indicator?.name ?? flag.indicator_id;
  return <aside id="rf-drawer" className={`wb-drawer rf-drawer level-${flag.level}`} aria-label={`Red Flag details: ${name}`}
    onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <button type="button" className="wb-drawer-close" onClick={onClose} aria-label="Close the details">×</button>
    <FlagDetail flag={flag} {...actions}/>
  </aside>;
}

/** The investigation's type: catalogue areas, chosen by the app with its reasons, or by the reporter (indicators.md).
 * Closed, it is one line of area names. Open, the app's suggestions come first with why, then every other area
 * as a card with a one-line summary, searchable. The safety area (SA) is the reporter's safety, not a type. */
export function InvestigationType({kind, flagsByArea, onSet}: {kind: InvestigationTypeOut; flagsByArea: Record<string, number>;
  onSet: (areas: string[] | null) => Promise<void>}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [find, setFind] = useState('');
  const all = (useQuery({...listAreasOptions(), enabled: editing}).data ?? []).filter(a => a.indicators > 0 && a.key !== 'SA');
  const byKey = Object.fromEntries(all.map(a => [a.key, a]));
  const suggestedKeys = kind.suggested.map(a => a.key);
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const others = all.filter(a => !suggestedKeys.includes(a.key))
    .filter(a => words.every(w => `${a.name} ${a.summary}`.toLowerCase().includes(w)))
    .sort((x, y) => x.name.localeCompare(y.name));
  const start = () => { setPicked(kind.areas.map(a => a.key)); setFind(''); setEditing(true); };
  const toggle = (key: string) => setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]));
  const flagLine = (key: string) => (flagsByArea[key] ? `${flagsByArea[key]} Red Flag${flagsByArea[key] === 1 ? '' : 's'} fired here` : null);

  if (!editing) {
    return <div className="rf-type" role="group" aria-label="Type of investigation">
      <span className="rf-type-label">Type</span>
      <span className="rf-type-names">{kind.areas.length ? kind.areas.map(a => a.name).join(' · ') : 'Not known yet'}</span>
      <span className="sv-muted">{kind.set_by === 'app' ? 'chosen by the app' : 'chosen by you'}</span>
      <button type="button" className="sv-btn" onClick={start}>Change</button>
    </div>;
  }
  return <div className="rf-type editing" role="group" aria-label="Type of investigation">
    <div className="tp-head"><span className="rf-type-label">Type of investigation</span>
      <span className="sv-muted">{kind.set_by === 'app' ? 'Chosen by the app' : 'Chosen by you'}</span></div>
    {kind.suggested.length > 0 && <section aria-label="Suggested">
      <h5 className="tp-sub">Suggested</h5>
      <div className="tp-grid wide">{kind.suggested.map(s => <button type="button" key={s.key} className="tp-card" aria-pressed={picked.includes(s.key)}
        onClick={() => toggle(s.key)}>
        <span className="tp-name">{s.name}</span>
        <ul className="tp-why">{s.reasons.map(r => <li key={r}>{r.replace(/^Red Flag: /, '')}</li>)}</ul>
        {byKey[s.key] && <span className="tp-meta">{byKey[s.key].indicators} indicators</span>}
      </button>)}</div>
    </section>}
    <section aria-label="Other areas">
      <div className="tp-subrow"><h5 className="tp-sub">{kind.suggested.length ? 'Add another area' : 'Areas'}</h5>
        <label className="sv-sbox tp-find"><input value={find} placeholder="Search areas…" aria-label="Search areas"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFind(e.target.value)}/></label></div>
      <div className="tp-grid">{others.map(a => <button type="button" key={a.key} className="tp-card" aria-pressed={picked.includes(a.key)} title={a.summary}
        onClick={() => toggle(a.key)}>
        <span className="tp-name">{a.name}</span>
        <span className="tp-sum">{a.summary}</span>
        <span className="tp-meta">{a.indicators} indicators{flagLine(a.key) ? ` · ${flagLine(a.key)}` : ''}</span>
      </button>)}
      {all.length > 0 && !others.length && <p className="sv-muted">No area matches.</p>}</div>
    </section>
    <div className="tp-actions">
      {kind.set_by === 'reporter' && <button type="button" className="sv-btn" onClick={() => void onSet(null).then(() => setEditing(false))}>Let the app choose</button>}
      <span className="tp-gap"/>
      {!picked.length && <span className="sv-muted">Pick at least one area, or let the app choose.</span>}
      <button type="button" className="sv-btn" onClick={() => setEditing(false)}>Cancel</button>
      <button type="button" className="sv-btn p" disabled={!picked.length} onClick={() => void onSet(picked).then(() => setEditing(false))}>Save</button>
    </div>
  </div>;
}

export const LEVEL_ORDER = ['textbook', 'strong', 'faint'];
/** Textbook flags first, then Strong, then Faint; by weight within a level (the server's order). */
export const byLevel = (a: RedFlagOut, b: RedFlagOut): number => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);

export type RedFlagsState = RedFlagsRead & {
  problem: string; actionsFor: (f: RedFlagOut) => FlagActions; setAreas: (areas: string[] | null) => Promise<void>;
};

/** The case's Red Flags and what a reporter can do with each: shared by the panel and the Act screen. */
export function useRedFlags(investigationId: string): RedFlagsState {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const read = useRedFlagsQuery(investigationId);
  const dismiss = useMutation({...dismissRedFlagMutation()});
  const reopen = useMutation({...reopenRedFlagMutation()});
  const lead = useMutation({...makeLeadFromRedFlagMutation()});
  const setType = useMutation({...setInvestigationTypeMutation()});
  const [problem, setProblem] = useState('');
  const key = getRedFlagsQueryKey({path});
  const checksKey = getChecksQueryKey({path});
  const attempt = async (work: () => Promise<unknown>, failed: string) => {
    try { await work(); setProblem(''); } catch (error) { setProblem(errorMessage(error, failed)); }
  };
  const actionsFor = (f: RedFlagOut): FlagActions => ({
    onLead: () => attempt(async () => { await lead.mutateAsync({path: {flag_id: f.id}}); await Promise.all([
      queryClient.invalidateQueries({queryKey: key}), queryClient.invalidateQueries({queryKey: listLeadsQueryKey({path})})]); }, 'Could not add it to leads'),
    // Not through attempt: the form asking why shows the failure itself, and keeps the reason typed.
    onDismiss: async reason => { queryClient.setQueryData(key, await dismiss.mutateAsync({path: {flag_id: f.id}, body: {reason}}));
      setProblem(''); await queryClient.invalidateQueries({queryKey: checksKey}); },
    onReopen: () => attempt(async () => { queryClient.setQueryData(key, await reopen.mutateAsync({path: {flag_id: f.id}}));
      await queryClient.invalidateQueries({queryKey: checksKey}); }, 'Could not open it again'),
  });
  const setAreas = (areas: string[] | null) => attempt(async () => {
    await setType.mutateAsync({path, body: {areas}}); await queryClient.invalidateQueries({queryKey: key}); }, 'Could not change the type');
  return {...read, problem, actionsFor, setAreas};
}

/** How many open flags fired in each catalogue area (for the type picker). */
export const flagsByArea = (flags: RedFlagOut[]): Record<string, number> => flags.reduce<Record<string, number>>((m, f) => {
  if (f.indicator) m[f.indicator.area] = (m[f.indicator.area] ?? 0) + 1; return m; }, {});

export function RedFlagsPanel({investigationId}: {investigationId: string}): ReactElement {
  const {query, waiting, problem, actionsFor, setAreas} = useRedFlags(investigationId);
  const [openId, setOpenId] = useState<string | null>(null);
  // An item in To check asks for its flag: open its details and bring the list into view.
  const askedFlag = useWorkbenchStore(state => state.flag);
  const answered = useRef(0);
  useEffect(() => {
    if (!askedFlag || askedFlag.serial === answered.current) return;
    answered.current = askedFlag.serial;
    setOpenId(askedFlag.flagId);
  }, [askedFlag]);

  const flags = query.data?.flags ?? [];
  const opened = flags.find(f => f.id === openId);
  const gone = query.data?.gone ?? [];
  const rules = query.data?.rules ?? [];
  const cannot = query.data?.cannot_run ?? [];
  // Grouped by the indicator's area: the investigation's own areas first, then
  // every other area under "This may also point to" (indicators.md).
  const kind = query.data?.investigation_type;
  const own = (kind?.areas ?? []).map(a => a.name);
  const found = Array.from(new Set(flags.map(f => f.indicator?.area_name ?? 'Other')));
  const ownFound = own.filter(a => found.includes(a));
  const others = found.filter(a => !own.includes(a));
  const areas = [...ownFound, ...others];
  let rank = 0;

  return <section className="card rf" id="red-flags" aria-labelledby="red-flags-title">
    <h3 id="red-flags-title">Red Flags</h3>
    <p className="sv-psub">Patterns from published cases found in this investigation&apos;s records. Each is a lead, not a finding.{' '}
      <span className="rf-rules" title={rules.map(r => r.name).join('\n')}>{rules.length - cannot.length} of {rules.length} checks ran</span>.</p>
    {cannot.length > 0 && <details className="rf-cannot"><summary>{cannot.length} could not run on these records</summary>
      <ul>{cannot.map(c => <li key={c.indicator_id}><b>{c.name}</b>: {c.reason}</li>)}</ul></details>}
    {kind && <InvestigationType kind={kind} flagsByArea={flagsByArea(flags)} onSet={setAreas}/>}
    {query.isError && <p className="sv-error">{errorMessage(query.error, 'Could not run the rules')}</p>}
    {problem && <p className="sv-error" role="alert">{problem}</p>}
    {query.data && !waiting && !flags.length && <p className="sv-muted">No pattern fires on these records.</p>}
    {areas.map(area => <div key={area} className="rf-group">
      {own.length > 0 && area === others[0] && <h3 className="rf-also">This may also point to</h3>}
      <h4 className="rf-area">{area}</h4>
      {flags.filter(f => (f.indicator?.area_name ?? 'Other') === area).sort(byLevel).map(f => { rank += 1; return <FlagCard key={f.id} flag={f} rank={rank}
        open={openId === f.id} onOpen={() => setOpenId(openId === f.id ? null : f.id)} {...actionsFor(f)}/>; })}
    </div>)}
    {opened && <FlagDrawer key={opened.id} flag={opened} onClose={() => setOpenId(null)} {...actionsFor(opened)}/>}
    {gone.length > 0 && <details className="rf-gone"><summary>No longer fire ({gone.length})</summary>
      <ul>{gone.map(f => <li key={f.id}><b>{f.indicator?.name ?? f.indicator_id}</b>: {f.summary} <small>The records changed so the pattern no longer holds.</small></li>)}</ul>
    </details>}
  </section>;
}
