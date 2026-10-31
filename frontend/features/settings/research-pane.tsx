'use client';
// Settings › AI and research (Settings panes mockup, board 3): the model (set on the
// server), what the AI may start on its own, the run settings new cases start with (saved
// with a reason, like a case's own in Before you run), what no setting can turn off, and
// the cases that run differently (GET/PUT /settings/research).
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {z} from 'zod';

import {AiNotice} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError} from '../../components/ui/form';
import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {submitWith, useZodForm} from '../../lib/forms';
import {getResearchSettingsOptions, getResearchSettingsQueryKey, putResearchSettingsMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {RunSettingOut} from '../../lib/generated/types.gen';

const MODES = [
  {id: 'off', label: 'Off', text: 'The AI runs only when you press Run in Act › AI runs.'},
  {id: 'ask', label: 'Ask first', text: 'When documents arrive after a case’s last run, Needs you asks whether to run it again. Nothing runs until you say so.'},
  {id: 'automatic', label: 'Without approval', text: 'When an import finishes, the case’s saved questions run again by themselves, under the case’s run settings. A case with no saved question runs nothing.'},
] as const;

const FLAG_KEYS = new Set(['source_tier_floor', 'severity_floor']);
const reasonSchema = z.object({reason: z.string().trim().min(1, 'Say in one line why new cases start with these settings.').max(300, 'Keep it to one line (300 characters).')});
type ReasonValues = z.infer<typeof reasonSchema>;

export function ResearchPane({model, rules}: {model: ReactNode; rules: ReactNode}): ReactElement {
  const queryClient = useQueryClient();
  const settings = useQuery(getResearchSettingsOptions());
  const save = useMutation({...putResearchSettingsMutation(), onSuccess: d => queryClient.setQueryData(getResearchSettingsQueryKey(), d)});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const form = useZodForm<ReasonValues>(reasonSchema, {defaultValues: {reason: ''}});

  if (settings.isPending) return <p className="st-wait">Reading the AI settings…</p>;
  if (settings.isError) return <p className="st-problem" role="alert">{errorMessage(settings.error, 'Could not read the AI settings.')}</p>;
  const d = settings.data;
  const value = (s: RunSettingOut) => draft[s.key] ?? s.case_default;
  const changed = d.settings.filter(s => value(s) !== s.case_default);
  const groups = [...new Set(d.settings.map(s => s.group))];
  const onSave = submitWith(form, async v => {
    const all = Object.fromEntries(d.settings.map(s => [s.key, value(s)]));
    await save.mutateAsync({body: {
      flags: Object.fromEntries(Object.entries(all).filter(([k]) => FLAG_KEYS.has(k))),
      options: Object.fromEntries(Object.entries(all).filter(([k]) => !FLAG_KEYS.has(k))),
      reason: v.reason,
    }});
    setDraft({});
    form.reset();
  }, 'Could not save the defaults.');

  return <div className="st-stack">
    {/* The model and what the AI may start on its own, side by side, so the pane fits the window. */}
    <div className="ap-two st-ai-top">
    <section className="ap-pane" aria-labelledby="ai-model">
      <div className="ap-pane-head"><h2 id="ai-model"><Reveal detail="Set on the server."><span>The model</span></Reveal></h2></div>
      {model}
      <details className="st-details"><summary>Change it</summary>
        <p className="st-hint">The model is set in the server’s environment file, not here: <code>AI_PROVIDER</code>, then <code>OLLAMA_MODEL</code> and <code>OLLAMA_BASE_URL</code> for a model on this computer. A remote model also needs <code>AI_ALLOW_REMOTE_ENDPOINT</code>.</p>
      </details>
    </section>

    <section className="ap-pane" aria-labelledby="ai-auto">
      <div className="ap-pane-head"><h2 id="ai-auto"><Reveal detail="What the AI may start on its own. A question is saved from Before you run, and a case can choose differently there.">
        <span>Research without asking</span></Reveal></h2>
        <AiNotice>Whatever is chosen, every result is a proposal: nothing joins the case until you accept it in Decide.</AiNotice></div>
      <div className="st-big" role="radiogroup" aria-label="Research without asking">
        {/* What each mode does is revealed on it. */}
        {MODES.map(m => <Reveal key={m.id} tabbable={false} detail={m.text}><button type="button" role="radio" aria-checked={d.mode === m.id} className={d.mode === m.id ? 'on' : ''}
          disabled={!d.can_change_defaults || save.isPending} onClick={() => d.mode !== m.id && save.mutate({body: {mode: m.id}})}>
          <b>{m.label}</b></button></Reveal>)}
      </div>
      {!d.ai_enabled && <p className="st-hint">No model is set up, so nothing is asked or run either way.</p>}
    </section>
    </div>

    <div className="ap-two">
      <section className="ap-pane" aria-labelledby="ai-def">
        <div className="ap-pane-head"><h2 id="ai-def"><Reveal detail="A case that has saved its own settings in Before you run keeps them."><span>How a run works, for new cases</span></Reveal></h2>
          <span>{d.defaults_reason ? `“${d.defaults_reason}”` : 'as the suite ships'}</span>
          {changed.length > 0 && <em>{changed.length} changed · save asks why</em>}</div>
        {groups.map(g => <div key={g} className="st-group">
          <p className="st-lab">{g}</p>
          {d.settings.filter(s => s.group === g).map(s => <div key={s.key} className={`st-route${value(s) !== s.case_default ? ' st-changed' : ''}`}>
            <span className="st-route-what"><Reveal detail={s.help}><b>{s.label}</b></Reveal></span>
            <span className="ap-seg" role="radiogroup" aria-label={s.label}>
              {s.allowed.map(a => <button key={a.value} type="button" role="radio" aria-checked={value(s) === a.value} className={value(s) === a.value ? 'on' : ''}
                disabled={!d.can_change_defaults} onClick={() => setDraft(x => ({...x, [s.key]: a.value}))}>
                {a.label}{a.value === s.suite_default && <em className="st-default">suite</em>}</button>)}
            </span>
          </div>)}
        </div>)}
        {changed.length > 0 && <Form {...form}>
          <form onSubmit={onSave} noValidate className="st-form">
            <FormField control={form.control} name="reason" render={({field}) => <FormItem>
              <FormLabel>Why new cases start this way</FormLabel>
              <FormControl><input className="st-input" placeholder="Our cases are contested: every answer must survive a search for the opposite" {...field}/></FormControl>
              <FormMessage className="field-msg"/>
            </FormItem>}/>
            <FormRootError/>
            <div className="st-acts">
              <button type="submit" className="ap-btn p" disabled={form.formState.isSubmitting}>Save as the default for new cases</button>
              <button type="button" className="ap-btn" onClick={() => { setDraft({}); form.reset(); }}>Undo the changes</button>
            </div>
          </form>
        </Form>}
        {!d.can_change_defaults && <p className="st-hint">Only the owner of this computer or an admin changes these.</p>}
        {save.isError && !changed.length && <p className="st-problem" role="alert">{errorMessage(save.error, 'Could not save that.')}</p>}
      </section>

      <div className="st-col">
        <section className="ap-pane" aria-labelledby="ai-lock">
          <div className="ap-pane-head"><h2 id="ai-lock">Cannot be turned off</h2></div>
          <ul className="st-list">{d.locked.map(l => <li key={l.text} className="st-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><Reveal detail={l.by}><span>{l.text}</span></Reveal></li>)}</ul>
        </section>
        <section className="ap-pane" aria-labelledby="ai-diff">
          <div className="ap-pane-head"><h2 id="ai-diff"><Reveal detail="Only what is different."><span>Cases that run differently</span></Reveal></h2></div>
          {!d.cases.length ? <p className="st-hint">None: every case runs with the defaults.</p>
            : <ul className="st-list">{d.cases.map(c => <li key={c.investigation_id} className="st-route">
              <span className="st-route-what"><b>{c.name}</b><small>{c.differs.join(' · ')}{c.reason ? ` · “${c.reason}”` : ''}</small></span>
              <a className="ap-btn" href={caseHref('/act#ai-reasoning-panel', c.investigation_id)}>Open its Before you run</a>
            </li>)}</ul>}
        </section>
        <details className="ap-pane st-details"><summary>The rules the AI works under</summary>{rules}</details>
      </div>
    </div>
  </div>;
}
