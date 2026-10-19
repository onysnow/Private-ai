'use client';
// Settings › Outside lookups (Settings panes mockup, board 2): one sentence, built from the
// settings, saying what leaves this computer; each source with what it is sent and where,
// its mode for new cases and for this case, its key and its last lookup; this case's own
// choice (with the reason it was made), cases that differ, and every lookup this week.
// Off is enforced by the server (a lookup to that source is refused from any screen);
// Automatic looks each new party up once, in the background (GET/PUT /settings/lookups).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';
import {z} from 'zod';

import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError} from '../../components/ui/form';
import {errorMessage} from '../../lib/api-client';
import {submitWith, useZodForm} from '../../lib/forms';
import {
  clearCaseLookupsMutation, getLookupSettingsOptions, getLookupSettingsQueryKey, putCaseLookupsMutation, putLookupDefaultsMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {LookupSettingsOut, LookupSourceOut} from '../../lib/generated/types.gen';
import {ConnectorsPanel} from '../connectors/connectors-panel';

type Mode = 'automatic' | 'ask' | 'off';
const MODES: Mode[] = ['automatic', 'ask', 'off'];
const MODE_WORDS: Record<Mode, string> = {automatic: 'Automatic', ask: 'Ask first', off: 'Off'};
const MODE_DOES: Record<Mode, string> = {
  automatic: 'Each new party accepted into the case is looked up here once, in the background. What comes back waits in Decide.',
  ask: 'Looked up only when you ask, on a record or below. You see the words before they go.',
  off: 'Never asked. A lookup to it is refused, from any screen.',
};
const when = (iso: string): string => new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString(undefined, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

/** "Nothing leaves this computer except: …", from each source's mode in this case. */
export function whatLeaves(sources: LookupSourceOut[]): string {
  const parts = sources.flatMap(s => {
    const mode = (s.mode ?? s.default) as Mode;
    if (mode === 'off') return [];
    return [`the name of ${mode === 'automatic' ? 'each new party' : 'a party you choose'} to ${s.label}${s.host ? ` (${s.host})` : ''}${mode === 'automatic' ? ', as it joins the case' : ', when you say so'}`];
  });
  return parts.length ? `Nothing leaves this computer for an outside lookup except: ${parts.join('; ')}.` : 'Nothing leaves this computer for an outside lookup.';
}

function Seg({label, value, onPick, disabled}: {label: string; value: Mode; onPick: (m: Mode) => void; disabled?: boolean}): ReactElement {
  return <span className="ap-seg" role="radiogroup" aria-label={label}>
    {MODES.map(m => <button key={m} type="button" role="radio" aria-checked={value === m} className={value === m ? 'on' : ''}
      disabled={disabled} onClick={() => value !== m && onPick(m)}>{MODE_WORDS[m]}</button>)}
  </span>;
}

const ownSchema = z.object({reason: z.string().trim().min(1, 'Say in one line why this case looks up differently.').max(300, 'Keep it to one line (300 characters).')});
type OwnValues = z.infer<typeof ownSchema>;

function ThisCase({inv, caseName, data}: {inv: string; caseName: string; data: LookupSettingsOut}): ReactElement {
  const queryClient = useQueryClient();
  const key = getLookupSettingsQueryKey({query: {investigation_id: inv}});
  const own = data.cases.find(c => c.investigation_id === inv);
  const [draft, setDraft] = useState<Record<string, Mode>>(() => Object.fromEntries(data.sources.map(s => [s.key, (s.mode ?? s.default) as Mode])));
  const [editing, setEditing] = useState(false);
  const saveOwn = useMutation({...putCaseLookupsMutation(), onSuccess: d => { queryClient.setQueryData(key, d); setEditing(false); }});
  const clear = useMutation({...clearCaseLookupsMutation(), onSuccess: d => queryClient.setQueryData(key, d)});
  const form = useZodForm<OwnValues>(ownSchema, {defaultValues: {reason: ''}});
  const differs = Object.fromEntries(data.sources.filter(s => draft[s.key] !== s.default).map(s => [s.key, draft[s.key]]));
  const onSubmit = submitWith(form, async v => { await saveOwn.mutateAsync({path: {investigation_id: inv}, body: {modes: differs, reason: v.reason}}); form.reset(); },
    'Could not save this case’s lookups.');

  return <section className="ap-pane" aria-labelledby="lk-case">
    <div className="ap-pane-head"><h2 id="lk-case">This case</h2><span>{caseName}</span></div>
    {own && !editing ? <>
      <p className="st-line">{Object.entries(own.modes).map(([p, m]) => `${data.sources.find(s => s.key === p)?.label ?? p}: ${MODE_WORDS[m as Mode]}`).join(' · ')}</p>
      {own.reason && <p className="st-hint">“{own.reason}” · {when(own.set_at)}</p>}
      <div className="st-acts">
        <button type="button" className="ap-btn" onClick={() => setEditing(true)}>Change</button>
        <button type="button" className="ap-btn" disabled={clear.isPending} onClick={() => clear.mutate({path: {investigation_id: inv}})}>Make it match the defaults</button>
      </div>
      {clear.isError && <p className="st-problem" role="alert">{errorMessage(clear.error, 'Could not change it.')}</p>}
    </> : !editing ? <>
      <p className="st-hint">Follows the defaults above. A case can differ, for example a source you must not leave traces with.</p>
      <div className="st-acts"><button type="button" className="ap-btn" onClick={() => setEditing(true)}>Set this case’s own</button></div>
    </> : <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="st-form">
        {data.sources.map(s => <div key={s.key} className="st-route">
          <span className="st-route-what"><b>{s.label}</b><small>default {MODE_WORDS[s.default as Mode]}</small></span>
          <Seg label={`${s.label} in this case`} value={draft[s.key]} onPick={m => setDraft(d => ({...d, [s.key]: m}))}/>
        </div>)}
        <FormField control={form.control} name="reason" render={({field}) => <FormItem>
          <FormLabel>Why this case is different</FormLabel>
          <FormControl><input className="st-input" placeholder="Source protection: no outside traces" {...field}/></FormControl>
          <FormMessage/>
        </FormItem>}/>
        <FormRootError/>
        <div className="st-acts">
          <button type="submit" className="ap-btn p" disabled={!Object.keys(differs).length || form.formState.isSubmitting}>Save for this case</button>
          <button type="button" className="ap-btn" onClick={() => { setEditing(false); form.reset(); }}>Cancel</button>
          {!Object.keys(differs).length && <span className="st-hint">Same as the defaults: nothing to save.</span>}
        </div>
      </form>
    </Form>}
  </section>;
}

export function LookupsPane({investigationId, caseName, providers}: {investigationId: string; caseName: string; providers: string[]}): ReactElement {
  const queryClient = useQueryClient();
  const options = getLookupSettingsOptions({query: investigationId ? {investigation_id: investigationId} : {}});
  const settings = useQuery(options);
  const defaults = useMutation({...putLookupDefaultsMutation(), onSuccess: d => queryClient.setQueryData(options.queryKey, d)});
  const clear = useMutation({...clearCaseLookupsMutation(), onSuccess: () => queryClient.invalidateQueries({queryKey: options.queryKey})});

  if (settings.isPending) return <p className="st-wait">Reading the lookups…</p>;
  if (settings.isError) return <p className="st-problem" role="alert">{errorMessage(settings.error, 'Could not read the lookups.')}</p>;
  const d = settings.data;
  const others = d.cases.filter(c => c.investigation_id !== investigationId);

  return <div className="st-stack">
    <section className="ap-pane st-sum" aria-labelledby="lk-sum">
      <div className="ap-pane-head"><h2 id="lk-sum">What leaves this computer, from these settings</h2>{investigationId && <span>{caseName}</span>}</div>
      <p className="st-sentence">{whatLeaves(d.sources)}</p>
    </section>
    <div className="ap-two">
      <section className="ap-pane" aria-labelledby="lk-src">
        <div className="ap-pane-head"><h2 id="lk-src">Each source</h2><span>the mode new cases start with</span></div>
        {d.sources.map(s => {
          const mode = (s.mode ?? s.default) as Mode;
          return <div key={s.key} className="st-src">
            <div className="st-src-top"><b>{s.label}</b><span>{s.kind}</span>
              <Seg label={`${s.label} for new cases`} value={s.default as Mode} disabled={!d.can_change_defaults || defaults.isPending}
                onPick={m => defaults.mutate({body: {defaults: {[s.key]: m}}, query: investigationId ? {investigation_id: investigationId} : {}})}/></div>
            <p className="st-wire" aria-label="What is sent"><i>Your case</i><s aria-hidden="true">──</s><i className="st-wire-what">a party’s name</i><s aria-hidden="true">──▶</s><i>{s.host || s.label}</i></p>
            <dl className="st-dl">
              {investigationId && <><dt>In this case</dt><dd>{MODE_WORDS[mode]}{s.mode !== s.default ? ' (its own choice)' : ''}: {MODE_DOES[mode]}</dd></>}
              <dt>Key</dt><dd>{s.key_saved ? 'Saved' : 'None saved'} · <a href="#keys">Connector keys</a></dd>
              <dt>Last sent</dt><dd>{s.last ? `“${s.last.sent}” · ${s.last.case} · ${when(s.last.at)}${s.last.status === 'refused' ? ' · refused: the key was not accepted' : s.last.status === 'failed' ? ' · did not answer' : ''}` : 'never'}</dd>
            </dl>
          </div>;
        })}
        {!d.can_change_defaults && <p className="st-hint">Only the owner of this computer or an admin changes the defaults.</p>}
        {defaults.isError && <p className="st-problem" role="alert">{errorMessage(defaults.error, 'Could not change the default.')}</p>}
        <p className="st-hint">Each lookup leaves a trace on that site: the name you asked about, from this computer’s address.</p>
      </section>
      <div className="st-col">
        {investigationId ? <ThisCase key={investigationId} inv={investigationId} caseName={caseName} data={d}/> : null}
        <section className="ap-pane" aria-labelledby="lk-diff">
          <div className="ap-pane-head"><h2 id="lk-diff">Other cases that differ</h2><span>only what is different</span></div>
          {!others.length ? <p className="st-hint">None: every other case follows the defaults.</p>
            : <ul className="st-list">{others.map(c => <li key={c.investigation_id} className="st-route">
              <span className="st-route-what"><b>{c.name}</b><small>{Object.entries(c.modes).map(([p, m]) => `${d.sources.find(s => s.key === p)?.label ?? p}: ${MODE_WORDS[m as Mode]}`).join(' · ')}{c.reason ? ` · “${c.reason}”` : ''}</small></span>
              <button type="button" className="ap-btn" disabled={clear.isPending} onClick={() => clear.mutate({path: {investigation_id: c.investigation_id}})}>Make it match</button>
            </li>)}</ul>}
        </section>
        <section className="ap-pane" aria-labelledby="lk-week">
          <div className="ap-pane-head"><h2 id="lk-week">Sent this week</h2><span>{d.week.length} lookup{d.week.length === 1 ? '' : 's'}</span></div>
          {!d.week.length ? <p className="st-hint">Nothing was sent outside this week.</p>
            : <ul className="st-list">{d.week.slice(0, 12).map(r => <li key={r.id} className="st-route">
              <span className="st-route-what"><b className="st-mono">“{r.sent}”</b>
                <small>{d.sources.find(s => s.key === r.provider)?.label ?? r.provider} · {r.case} · {when(r.at)}{r.status === 'refused' ? ' · refused' : r.status === 'failed' ? ' · no answer' : ` · ${r.results} found`}</small></span>
            </li>)}</ul>}
        </section>
      </div>
    </div>
    {investigationId && <section className="ap-pane" aria-labelledby="lk-now">
      <div className="ap-pane-head"><h2 id="lk-now">Look a name up now</h2><span>sent only when you press Search</span></div>
      <ConnectorsPanel investigationId={investigationId} providers={providers}/>
    </section>}
  </div>;
}
