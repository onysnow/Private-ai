'use client';
// Act › AI runs (mockups AI_2 "Before you run"; research AI §6). Ask a question, then see before anything is sent:
// the operating instructions in plain words (suite names in the tooltip), the plan the settings make, the systems the
// answer will need, any instruction found inside the evidence, where the model runs and what leaves the computer,
// every change echoed as it is made, and what cannot be turned off. Run and watch, or run in the background.
// The plan comes from the server (backend app/services/run_plan.py); nothing is sent to a model until Run.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {describeJob, waitForJob} from '../../lib/jobs';
import {
  investigationRunPlanMutation, investigationRunProfileOptions, investigationRunProfileQueryKey, saveInvestigationRunProfileMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import {investigationCaseSynthesis, investigationHypothesisTest} from '../../lib/generated/sdk.gen';
import type {RunOptionsIn, RunPlanOut, RunSettingOut} from '../../lib/generated/types.gen';
import {listAiRunsOptions, listAiRunsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {WatchTheRun} from './watch-the-run';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Module = 'case_synthesis' | 'hypothesis_test';
type Values = Record<string, string>;
type Echo = {at: string; kind: 'SETTING' | 'FLAG'; text: string};
type Step = 1 | 2 | 3 | 4;

const TYPE_WORDS: Record<string, [string, string]> = {
  evidence: ['passage', 'passages'], claim: ['claim', 'claims'], relationship: ['link', 'links'], timeline_event: ['event', 'events'],
  document: ['document', 'documents'], document_chunk: ['passage of a document', 'passages of documents'], source: ['source', 'sources'],
  entity: ['person or firm', 'people and firms'], statement: ['statement', 'statements'], lead: ['lead', 'leads'],
  reporting_task: ['task', 'tasks'], extraction_candidate: ['proposal', 'proposals'],
};
const typeWords = (t: string, n: number) => `${n} ${(TYPE_WORDS[t] ?? [t, t])[n === 1 ? 0 : 1]}`;
const FLAGS = new Set(['severity_floor', 'source_tier_floor']);
const GROUPS = ['How strict', 'Extra passes', 'What you see', 'Doing things on its own'];
const SWITCHES = new Set(['devils_advocate', 'show_reasoning_chain']);
const clock = () => new Date().toTimeString().slice(0, 8);
const STATE_WORDS: Record<string, string> = {runs: 'runs', not_in_app: 'would apply · not in the app yet', not_expected: 'not expected'};

/** A segmented control: a radio group, arrows move, the name says the default and whether it changed. */
function Segments({row, value, onChange}: {row: RunSettingOut; value: string; onChange: (v: string) => void}): ReactElement {
  const at = row.allowed.findIndex(a => a.value === value);
  const changed = value !== row.case_default;
  const named = `${row.label}, ${row.allowed[at]?.label ?? value}${changed ? `, changed from ${row.allowed.find(a => a.value === row.case_default)?.label ?? row.case_default}` : ''}`;
  const key = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    onChange(row.allowed[(at + step + row.allowed.length) % row.allowed.length].value);
  };
  return <span className="br-seg" role="radiogroup" aria-label={named} onKeyDown={key}>
    {row.allowed.map(a => {
      const never = row.key === 'source_tier_floor' && a.value === 'C';
      return <button key={a.value} type="button" role="radio" aria-checked={a.value === value} tabIndex={a.value === value ? 0 : -1}
        className={`${a.value === value ? 'on' : ''}${never ? ' never' : ''}`} title={never ? 'Tier C never counts toward a fact: it defines methods and terms' : undefined}
        onClick={() => onChange(a.value)}>{a.label}{a.value === row.suite_default && <small> default</small>}</button>;
    })}
  </span>;
}

function Switch({row, value, onChange}: {row: RunSettingOut; value: string; onChange: (v: string) => void}): ReactElement {
  const on = value === 'ON';
  const changed = value !== row.case_default;
  return <button type="button" role="switch" aria-checked={on} className={`br-switch${on ? ' on' : ''}`}
    aria-label={`${row.label}, ${on ? 'on' : 'off'}${changed ? `, changed from ${row.case_default === 'ON' ? 'on' : 'off'}` : ''}`}
    onClick={() => onChange(on ? 'OFF' : 'ON')}><span/></button>;
}

export function BeforeYouRun({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const queryClient = useQueryClient();
  const profile = useQuery({...investigationRunProfileOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const [step, setStep] = useState<Step>(1);
  const [module, setModule] = useState<Module>('case_synthesis');
  const [question, setQuestion] = useState('');
  const [theory, setTheory] = useState('');
  const [values, setValues] = useState<Values | null>(null);
  const [premises, setPremises] = useState<string[]>([]);
  const [premise, setPremise] = useState('');
  const [echo, setEcho] = useState<Echo[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  // Asked to watch a run from elsewhere (a Chain of Custody AI step): open it in step 3.
  const asked = useWorkbenchStore(s => s.aiRun);
  useEffect(() => { if (asked) { setRunId(asked.runId); setStep(3); } }, [asked]);
  const earlier = useQuery({...listAiRunsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId) && step === 1});
  const [outcome, setOutcome] = useState<{ok: boolean; text: string} | null>(null);
  const flagged = useRef(new Set<string>());

  const caseDefaults: Values | null = profile.data ? {...profile.data.flags, ...profile.data.options} : null;
  useEffect(() => {
    if (!profile.data || values) return;
    setValues({...profile.data.flags, ...profile.data.options});
    setPremises(profile.data.premises);
  }, [profile.data, values]);

  const plan = useMutation({...investigationRunPlanMutation()});
  const body = useMemo(() => values && {
    module, question: question.trim(), working_theory: module === 'hypothesis_test' ? theory.trim() || null : null,
    severity_floor: values.severity_floor as 'ALL', source_tier_floor: values.source_tier_floor as 'D',
    options: Object.fromEntries(Object.entries(values).filter(([k]) => !FLAGS.has(k))) as RunOptionsIn, premises,
  }, [values, module, question, theory, premises]);
  const planKey = JSON.stringify(body);
  useEffect(() => {
    if (step !== 2 || !body || !body.question) return;
    const t = window.setTimeout(() => plan.mutate({path: {investigation_id: investigationId}, body}), 250);
    return () => window.clearTimeout(t);
  }, [step, planKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const p: RunPlanOut | undefined = plan.data;

  // An instruction found inside the evidence is echoed once, as the run record will keep it.
  useEffect(() => {
    for (const i of p?.injections ?? []) {
      const key = `${i.record_type}:${i.record_id}`;
      if (flagged.current.has(key)) continue;
      flagged.current.add(key);
      setEcho(e => [...e, {at: clock(), kind: 'FLAG', text: `${i.record_type}:${i.record_id.slice(0, 8)} · material · ignored`}]);
    }
  }, [p]);

  const change = (key: string, next: string) => {
    if (!values || values[key] === next) return;
    setEcho(e => [...e, {at: clock(), kind: 'SETTING', text: `${key} ${values[key].toLowerCase()} → ${next.toLowerCase()}`}]);
    setValues({...values, [key]: next});
  };
  const addPremise = () => {
    const text = premise.trim();
    if (!text || premises.includes(text) || premises.length >= 10) return;
    setPremises([...premises, text]);
    setPremise('');
    setEcho(e => [...e, {at: clock(), kind: 'SETTING', text: 'premise + USER_STIPULATED'}]);
  };

  const save = useMutation({...saveInvestigationRunProfileMutation(), onSuccess: data => {
    queryClient.setQueryData(investigationRunProfileQueryKey({path: {investigation_id: investigationId}}), data);
    setSaving(false); setReason('');
  }});
  const saveDefault = () => body && save.mutate({path: {investigation_id: investigationId}, body: {
    severity_floor: body.severity_floor, source_tier_floor: body.source_tier_floor, options: body.options, premises, reason: reason.trim()}});

  const [running, setRunning] = useState(false);
  const run = async (watch: boolean) => {
    if (!body || !p?.where.callable || running) return;
    setRunning(true); setOutcome(null);
    const runBody = {question: body.question, max_results: 30, include_external_leads: true, severity_floor: body.severity_floor,
      source_tier_floor: body.source_tier_floor, options: body.options, premises, changes: echo};
    try {
      const reply = module === 'hypothesis_test'
        ? (await investigationHypothesisTest({path: {investigation_id: investigationId}, body: {...runBody, working_theory: theory.trim()}, throwOnError: true})).data
        : (await investigationCaseSynthesis({path: {investigation_id: investigationId}, body: runBody, throwOnError: true})).data;
      setRunId(reply.job.id);
      if (watch) setStep(3);
      if (!reply.candidate_id && reply.job) {
        const done = await waitForJob(api, reply.job.id, undefined, {intervalMs: 2000});
        const result = (done.result ?? {}) as {candidate_id?: string; detail?: unknown};
        if (done.status !== 'succeeded' || !result.candidate_id) throw new Error(typeof result.detail === 'string' ? result.detail : describeJob(done));
      }
      setOutcome({ok: true, text: 'The answer is waiting for you as a proposal. Nothing has joined the case.'});
    } catch (error) {
      setOutcome({ok: false, text: errorMessage(error, 'The run did not finish')});
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries({queryKey: listAiRunsQueryKey({path: {investigation_id: investigationId}})});
    }
  };
  useEffect(() => {
    if (!active || step !== 2) return;
    const key = (e: globalThis.KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void run(true); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const changed = values && caseDefaults ? Object.keys(values).filter(k => values[k] !== caseDefaults[k]) : [];
  const rows = p?.settings ?? [];
  const cancel = () => { if (caseDefaults) setValues(caseDefaults); setPremises(profile.data?.premises ?? []); setEcho([]); flagged.current.clear(); setStep(1); };

  const stepper = <ol className="br-steps" aria-label="Steps">
    {(['Ask', 'Instructions & plan', 'Watch', 'Review'] as const).map((label, i) => <li key={label} aria-current={step === i + 1 ? 'step' : undefined}
      className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}><b>{i + 1}</b> {label}</li>)}
  </ol>;

  if (step === 1) return <section className="br" aria-label="AI runs">
    <header className="br-head"><h2>Ask the case</h2>{stepper}</header>
    <form className="br-ask" onSubmit={e => { e.preventDefault(); if (question.trim() && (module === 'case_synthesis' || theory.trim())) setStep(2); }}>
      <span className="br-seg" role="radiogroup" aria-label="What to run">
        {([['case_synthesis', 'Case synthesis'], ['hypothesis_test', 'Test a theory']] as const).map(([m, l]) =>
          <button key={m} type="button" role="radio" aria-checked={module === m} className={module === m ? 'on' : ''} onClick={() => setModule(m)}>{l}</button>)}
      </span>
      <label>Your question<textarea rows={3} value={question} onChange={e => setQuestion(e.target.value)} className="br-question"
        placeholder="Who controlled Fernhill Ltd between 2016 and 2023, and how was the harbour land moved?"/></label>
      {module === 'hypothesis_test' && <label>The theory to test<textarea rows={2} value={theory} onChange={e => setTheory(e.target.value)}/></label>}
      <button type="submit" className="br-primary" disabled={!question.trim() || (module === 'hypothesis_test' && !theory.trim())}>Next: instructions and plan</button>
    </form>
    {(earlier.data?.runs.length ?? 0) > 0 && <div className="br-earlier"><p className="br-eyebrow">Earlier runs</p><ul>
      {earlier.data!.runs.slice(0, 6).map(r => <li key={r.run_id}><span>{r.question}</span>
        <small>{new Date(r.created_at.endsWith('Z') ? r.created_at : `${r.created_at}Z`).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})} · {r.events} steps{r.problems ? ` · ${r.problems} problem${r.problems === 1 ? '' : 's'}` : ''}{r.review_status ? ` · ${r.review_status}` : ''}</small>
        <button type="button" className="br-quiet" onClick={() => { setRunId(r.run_id); setStep(3); }}>Watch it again</button></li>)}
    </ul></div>}
  </section>;

  if (step === 3 || step === 4) return <section className="br br-live" aria-label="AI runs">
    {outcome && !outcome.ok && <p role="alert" className="br-bad">{outcome.text}</p>}
    {!runId && running && <p role="status">Sending the run…</p>}
    {runId && <WatchTheRun investigationId={investigationId} runId={runId} onBack={() => setStep(2)}/>}
  </section>;

  return <section className="br" aria-label="AI runs">
    <header className="br-head"><h2>Before you run <small>{p?.module_label ?? ''} · how strict, what it may use, what leaves this computer</small></h2>{stepper}</header>
    <div className="br-cols">
      <div className="br-col br-left" aria-label="Operating instructions" role="region">
        <p className="br-title">Operating instructions <small>Profile <b>{profile.data?.name ?? '…'}</b>{changed.length ? <> · <em>{changed.length} changed</em></> : null}</small></p>
        {values && GROUPS.map(g => <fieldset key={g} className="br-group"><legend>{g}</legend>
          {rows.filter(r => r.group === g).map(r => <div key={r.key} className={`br-row${values[r.key] !== caseDefaults?.[r.key] ? ' changed' : ''}`}
            onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)} title={`${r.key} · ${r.source}`}>
            <span className="br-label">{r.label}<small>{r.help}</small></span>
            {SWITCHES.has(r.key) ? <Switch row={r} value={values[r.key]} onChange={v => change(r.key, v)}/> : <Segments row={r} value={values[r.key]} onChange={v => change(r.key, v)}/>}
          </div>)}
        </fieldset>)}
        <fieldset className="br-group"><legend>Take as given</legend>
          <ul className="br-premises">{premises.map(x => <li key={x}><q>{x}</q><span className="br-chip">You said</span>
            <button type="button" aria-label={`Stop taking as given: ${x}`} onClick={() => setPremises(premises.filter(y => y !== x))}>×</button></li>)}</ul>
          <form className="br-add" onSubmit={e => { e.preventDefault(); addPremise(); }}>
            <input aria-label="Something to take as given" value={premise} onChange={e => setPremise(e.target.value)} placeholder="Printed on the result as you said it. Not evidence."/>
            <button type="submit" disabled={!premise.trim()}>Add</button>
          </form>
        </fieldset>
        <fieldset className="br-group br-planned"><legend>Overlays</legend><span>Legal · Journalism · Values (labour)</span><span className="br-chip">Planned</span></fieldset>
      </div>

      <div className="br-col br-mid" role="region" aria-label="The plan">
        <p className="br-title">The plan <small>Edit any step before it runs</small><button type="button" className="br-quiet" onClick={() => setStep(1)}>Edit plan</button></p>
        <div className="br-qcard"><p className="br-eyebrow">Your question</p><p className="br-q">{question}</p>
          {module === 'hypothesis_test' && theory && <p className="br-theory">Theory: {theory}</p>}
          {p && <p className="br-tray"><b>{p.packet.records} records go in</b> · {p.packet.by_type.map(t => typeWords(t.record_type, t.count)).join(', ') || 'none found'}
            {p.packet.leads_only > 0 && <><br/>{p.packet.leads_only} outside lead{p.packet.leads_only === 1 ? '' : 's'} count as leads only</>}</p>}
        </div>
        {plan.isError && <p role="alert" className="br-bad">{errorMessage(plan.error, 'Could not work out the plan')}</p>}
        <ol className="br-plan">{p?.steps.map(s => <li key={s.key} className={`${s.changed ? 'changed' : ''}${hover === s.key ? ' lit' : ''}`}>
          <span className="br-n">{s.n}</span><span><b>{s.title}</b>{s.system && s.system !== 'app' && <span className="br-sys">{s.system}</span>}<small>{s.detail}</small></span>
          <span className="br-who">{s.who}</span></li>)}</ol>
        {p && <div className="br-systems"><p className="br-eyebrow">Likely to run · decided by what the answer will contain</p>
          <p>{p.systems.map(s => <span key={s.system} className={`br-sysrow ${s.state}`} title={STATE_WORDS[s.state]}><b>{s.system}</b> · {s.state === 'not_expected' ? 'not expected' : s.why}{s.state === 'not_in_app' ? ' · not in the app yet' : ''}</span>)}</p>
          <small>You cannot switch a system off: it runs when the answer would need it. Today only TAS runs inside the app.</small></div>}
        {p?.injections.map(i => <p key={i.record_id} className="br-inject" role="note"><b>Ignored an instruction inside the evidence.</b> {i.title || i.record_type} reads “{i.quote}”.
          Material can never change a setting; it is quoted as evidence and logged.</p>)}
      </div>

      <div className="br-col br-right" role="region" aria-label="Where it runs, what it costs">
        <p className="br-title">Where it runs, what it costs</p>
        {p && <>
          <div className={`br-leaves${p.where.nothing_leaves ? ' none' : ''}`}><p className="br-eyebrow">What leaves this computer</p>
            <p className="br-leaves-line">{p.where.nothing_leaves ? '✓ ' : ''}{p.where.leaves}</p>
            <div className="br-boxes" aria-hidden="true"><span>Your case<small>{p.packet.records} records</small></span><i>→</i>
              <span className={p.where.runs_on_this_computer ? '' : 'out'}>Model<small>{p.where.model ?? 'none chosen'}</small></span><i>→</i>
              <span className="never">Outside<small>never called</small></span></div>
            {!p.where.enabled && <p className="br-bad">AI is off. Turn it on in <a href="/settings">Settings</a>.</p>}
            {p.where.enabled && !p.where.provider && <p className="br-bad">No model chosen. Choose one in <a href="/settings">Settings</a>.</p>}
          </div>
          <dl className="br-facts">
            <dt>Model</dt><dd>{p.where.model ?? 'none chosen'}{p.where.runs_on_this_computer ? ' · on this computer' : p.where.provider ? ` · ${p.where.provider}` : ''}</dd>
            <dt>Size</dt><dd>≈ {p.where.words_in.toLocaleString()} words in · up to ≈ {p.where.words_out_max.toLocaleString()} out</dd>
            <dt>Time</dt><dd>{p.where.minutes.length ? `about ${Math.min(...p.where.minutes)}–${Math.max(...p.where.minutes)} min on this machine` : 'not measured yet: no run has finished here'}</dd>
            <dt>Money</dt><dd>{p.where.money}</dd>
            <dt>Limit</dt><dd>{p.where.limits.concurrent} runs at once · {p.where.limits.per_minute} a minute</dd>
          </dl>
        </>}
        <p className="br-eyebrow">Changes echoed to the run record</p>
        <ol className="br-echo" aria-live="polite">{echo.length ? echo.map((e, i) => <li key={i}><time>{e.at}</time> <b>{e.kind}</b> {e.text}</li>) : <li className="br-quietline">No change yet</li>}</ol>
        <p className="br-eyebrow">Cannot be turned off</p>
        <ul className="br-locked">{p?.locked.map(l => <li key={l.text} title={l.by}><span aria-hidden="true">🔒</span> {l.text}</li>)}</ul>
      </div>
    </div>
    <footer className="br-foot">
      <button type="button" className="br-primary" onClick={() => void run(true)} disabled={!p?.where.callable || running}>Run and watch <kbd>⌘↵</kbd></button>
      <button type="button" onClick={() => void run(false)} disabled={!p?.where.callable || running}>Run in the background</button>
      {saving ? <form className="br-add br-why" onSubmit={e => { e.preventDefault(); saveDefault(); }}>
        <input aria-label="Why this case runs with these settings" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why, in one line (kept with the profile)" autoFocus/>
        <button type="submit" disabled={!reason.trim() || save.isPending}>Save</button>
      </form> : <button type="button" className="br-save" onClick={() => setSaving(true)}>Save as this case’s default</button>}
      {save.isError && <span role="alert" className="br-bad">{errorMessage(save.error, 'Not saved')}</span>}
      {!running && outcome && step === 2 && <span role="status" className={outcome.ok ? 'br-ok' : 'br-bad'}>{outcome.text}</span>}
      {running && step === 2 && <span role="status">Running in the background. The answer will wait for you in AI drafts.{runId && <> <button type="button" className="br-quiet" onClick={() => setStep(3)}>Watch it</button></>}</span>}
      <span className="br-note">AI can be wrong. Every result waits for you.</span>
      <button type="button" className="br-cancel" onClick={cancel}>Cancel</button>
    </footer>
  </section>;
}
