'use client';
// Watch the run (mockup AI_1; research AI §4–5; ADR-0012). The run record drawn as a map, left to right: the input,
// the router and the model, the app's enforced checks, the suite's systems, the answer and your review. Each step
// travels as a light from the step it follows (`parent`) to its own node; the node keeps the verdict as a shape
// (✓ circle good, ◆ in between, ✕ square stopped, ○ a finding) and what the model says stays a dashed plum ring until
// the app's check confirms it. No fake thoughts: while the model writes, only its ring breathes. Systems the app does
// not run are drawn dimmed with the sentence that would have triggered them. Under Calm or reduced motion there are no
// travelling lights; the log (L) carries the same steps in order and is the screen-reader view.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {
  getAiAnalysisCandidateEndpointOptions, listAiRunEventsOptions, listAiRunEventsQueryKey, listAiRunsOptions, reviewAiAnalysisCandidateEndpointMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {AiRunEventOut} from '../../lib/generated/types.gen';

type Ev = AiRunEventOut;
type Status = 'good' | 'partial' | 'bad' | 'neutral';
type Pt = {x: number; y: number};

// Where each node of the record sits on the map (viewBox 1000 × 470).
const AT: Record<string, Pt> = {
  run: {x: 70, y: 150}, retrieval: {x: 70, y: 250}, controls: {x: 470, y: 36}, router: {x: 185, y: 150}, model: {x: 185, y: 265},
  'gate:schema': {x: 300, y: 130}, 'gate:citation': {x: 300, y: 200}, 'gate:quote': {x: 300, y: 270}, 'gate:chart': {x: 300, y: 320}, 'gate:writing': {x: 300, y: 370},
  'tas/08': {x: 500, y: 128}, 'tas/06': {x: 500, y: 128}, 'app/draft': {x: 300, y: 70}, 'tas/class': {x: 500, y: 190}, 'tas/corroboration': {x: 500, y: 236},
  'cp-01': {x: 500, y: 330}, candidate: {x: 880, y: 150}, review: {x: 880, y: 270},
};
const SYSTEMS: Array<{key: string; name: string; x: number; trigger: string}> = [
  {key: 'ras', name: 'RAS', x: 400, trigger: 'if the answer had relied on published research'},
  {key: 'tas', name: 'TAS', x: 500, trigger: 'facts about real people, firms and documents'},
  {key: 'qas', name: 'QAS', x: 600, trigger: 'if the answer had computed or compared numbers'},
  {key: 'las', name: 'LAS', x: 700, trigger: 'if the answer had drawn a conclusion beyond a source'},
  {key: 'das', name: 'DAS', x: 790, trigger: 'if the answer had recommended an action'},
];
const LANES: Array<{key: string; label: string; match: (e: Ev) => boolean}> = [
  {key: 'router', label: 'Router', match: e => e.kind === 'ROUTE' || e.kind === 'LOAD' || e.node === 'controls'},
  {key: 'model', label: 'Model', match: e => e.node === 'model'},
  {key: 'checks', label: 'Checks', match: e => e.node.startsWith('gate:') || e.node === 'retrieval'},
  {key: 'tas', label: 'TAS', match: e => e.system === 'tas' && e.kind !== 'ROUTE' && e.kind !== 'LOAD'},
  {key: 'las', label: 'LAS', match: () => false},
  {key: 'write', label: 'Write', match: e => e.kind === 'WRITE' || e.kind === 'TURN'},
  {key: 'you', label: 'You', match: e => e.node === 'review'},
];
const WORD: Record<Status, string> = {good: 'verified', partial: 'in between', bad: 'stopped', neutral: 'a finding'};
const isProblem = (e: Ev) => e.status === 'bad' || (e.status === 'partial' && !e.self_reported);
const nodeOf = (e: Ev) => (AT[e.node] ? e.node : e.node.startsWith('gate:') ? 'gate:citation' : e.system === 'tas' ? 'tas/class' : 'run');
const words = (v: string | null | undefined) => (v ? (v.charAt(0) + v.slice(1).toLowerCase()).replace(/_/g, ' ') : '');
const hhmm = (iso: string) => new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const seconds = (a: string, b: string) => (Date.parse(b.endsWith('Z') ? b : `${b}Z`) - Date.parse(a.endsWith('Z') ? a : `${a}Z`)) / 1000;
const who = (e: Ev) => (e.node === 'review' ? 'you' : e.self_reported ? 'model says' : e.system === 'app' ? 'app · enforced' : e.system);

/** The verdict shape: never colour alone. */
function Mark({status, self, x, y, r = 7}: {status: string; self?: boolean; x: number; y: number; r?: number}): ReactElement {
  if (self) return <circle cx={x} cy={y} r={r} className="wr-mark self"/>;
  if (status === 'good') return <g className="wr-mark good"><circle cx={x} cy={y} r={r}/><path d={`M${x - r / 2} ${y} l${r / 3} ${r / 3} l${r * 0.6} ${-r * 0.7}`}/></g>;
  if (status === 'partial') return <rect className="wr-mark partial" x={x - r * 0.75} y={y - r * 0.75} width={r * 1.5} height={r * 1.5} transform={`rotate(45 ${x} ${y})`}/>;
  if (status === 'bad') return <g className="wr-mark bad"><rect x={x - r} y={y - r} width={r * 2} height={r * 2}/><path d={`M${x - r / 2} ${y - r / 2} l${r} ${r} M${x + r / 2} ${y - r / 2} l${-r} ${r}`}/></g>;
  return <circle cx={x} cy={y} r={r} className="wr-mark neutral"/>;
}

function calmNow(): boolean {
  if (typeof window === 'undefined') return true;
  return document.documentElement.dataset.motion === 'calm' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function WatchTheRun({investigationId, runId, onBack}: {investigationId: string; runId: string | null; onBack?: () => void}): ReactElement {
  const queryClient = useQueryClient();
  const runs = useQuery({...listAiRunsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId) && !runId});
  const id = runId ?? runs.data?.runs[0]?.run_id ?? null;
  const [live, setLive] = useState(true);
  const q = useQuery({
    ...listAiRunEventsOptions({path: {investigation_id: investigationId, run_id: id ?? ''}, query: {after: 0}}),
    enabled: Boolean(id),
    refetchInterval: query => (query.state.data?.run.finished ? false : 1000),
  });
  const run = q.data?.run;
  const events = useMemo(() => q.data?.events ?? [], [q.data]);
  const byN = useMemo(() => new Map(events.map(e => [e.n, e])), [events]);

  // Playback: steps are revealed one at a time, a short beat apart, as lights; a finished run opens complete and can
  // be replayed. Live follows the record as it grows.
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [calm, setCalm] = useState(true);
  const [log, setLog] = useState(false);
  const [full, setFull] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [replay, setReplay] = useState(false);
  const opened = useRef<string | null>(null);
  useEffect(() => { setCalm(calmNow()); }, []);
  useEffect(() => {
    if (!run || opened.current === run.run_id) return;
    opened.current = run.run_id;
    setShown(run.finished ? events.length : 0);
    setReplay(false);
  }, [run, events.length]);
  useEffect(() => {
    if (!playing || shown >= events.length) return;
    const t = window.setTimeout(() => setShown(s => Math.min(events.length, s + 1)), (calm ? 30 : 160) / speed);
    return () => window.clearTimeout(t);
  }, [playing, shown, events.length, speed, calm]);
  useEffect(() => { if (live && run?.finished && !replay) setShown(events.length); }, [live, run?.finished, replay, events.length]);

  const visible = events.slice(0, shown);
  const last = visible[visible.length - 1];
  const problems = events.filter(isProblem);
  const modelStart = visible.find(e => e.node === 'model' && e.verdict === 'STARTED');
  const modelEnd = visible.find(e => e.node === 'model' && e.verdict !== 'STARTED');
  const writing = Boolean(modelStart && !modelEnd);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!writing) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [writing]);
  const writingFor = modelStart ? Math.max(0, Math.round((now - Date.parse(modelStart.at.endsWith('Z') ? modelStart.at : `${modelStart.at}Z`)) / 1000)) : 0;

  // Tallies per node, from what is shown so far.
  const tally = useMemo(() => {
    const t: Record<string, Record<Status, number> & {last?: Ev}> = {};
    for (const e of visible) {
      const k = nodeOf(e);
      t[k] ??= {good: 0, partial: 0, bad: 0, neutral: 0};
      t[k][e.status as Status] += 1;
      t[k].last = e;
    }
    return t;
  }, [visible]);

  // A thought: the chain from the run's start to this step, and every step that follows from it.
  const chain = useMemo(() => {
    if (focus === null) return [] as Ev[];
    const up: Ev[] = [];
    for (let e = byN.get(focus); e; e = e.parent ? byN.get(e.parent) : undefined) up.unshift(e);
    const down = events.filter(e => e.parent === focus);
    return [...up, ...down.flatMap(d => [d, ...events.filter(x => x.parent === d.n)])];
  }, [focus, byN, events]);
  const lit = new Set(chain.map(e => e.n));
  const focused = focus !== null ? byN.get(focus) : undefined;
  const thought = focused && (focused.self_reported ? focused : chain.find(e => e.self_reported));

  const nextProblem = () => {
    const after = problems.find(p => p.n > (focus ?? 0)) ?? problems[0];
    if (after) { setFocus(after.n); setShown(s => Math.max(s, events.indexOf(after) + 1)); }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nextProblem(); }
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setLog(v => !v); }
      else if (e.key === ' ' && target?.closest?.('.wr')) { e.preventDefault(); setPlaying(p => !p); }
      else if (e.key === 'Escape') setFocus(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const candidateId = run?.candidate_id ?? null;
  const candidate = useQuery({...getAiAnalysisCandidateEndpointOptions({path: {candidate_id: candidateId ?? ''}}), enabled: Boolean(candidateId)});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const review = useMutation({...reviewAiAnalysisCandidateEndpointMutation(), onSuccess: () => {
    setRejecting(false);
    void queryClient.invalidateQueries({queryKey: listAiRunEventsQueryKey({path: {investigation_id: investigationId, run_id: id ?? ''}, query: {after: 0}})});
    void candidate.refetch();
  }});
  const [copied, setCopied] = useState(false);

  if (!id) return <section className="wr wr-empty" aria-label="Watch the run">
    <p>{runs.isLoading ? 'Looking for runs…' : 'No run yet. Ask the case a question, check the plan, then Run and watch.'}</p>
    {onBack && <button type="button" className="br-quiet" onClick={onBack}>Ask the case</button>}
  </section>;

  const t0 = events[0]?.at;
  const tEnd = events[events.length - 1]?.at;
  const span = t0 && tEnd ? Math.max(1, seconds(t0, tEnd)) : 1;
  const xOf = (e: Ev) => (t0 ? Math.min(100, (seconds(t0, e.at) / span) * 100) : 0);
  const settingsIn = events.filter(e => e.kind === 'SETTING' && e.rule !== 'echo');
  const claim = thought && Array.isArray((candidate.data?.payload as {claims?: unknown[]} | undefined)?.claims)
    ? ((candidate.data!.payload as {claims: Array<Record<string, unknown>>}).claims.find(c => c.claim_id === (thought.detail as {thought?: string} | null)?.thought))
    : undefined;
  const reviewed = candidate.data && candidate.data.review_status !== 'proposed';

  const node = (k: string, label: string, shape: 'diamond' | 'circle' | 'double' | 'hex' | 'person' | 'tile' | 'chip', sub?: string, dim = false) => {
    const p = AT[k];
    const t = tally[k];
    const name = `${label}${t ? `, ${(['good', 'partial', 'bad', 'neutral'] as Status[]).filter(s => t[s]).map(s => `${t[s]} ${WORD[s]}`).join(', ')}` : ''}${dim ? ', not run in the app' : ''}`;
    const onLit = chain.some(e => nodeOf(e) === k);
    return <g key={k} className={`wr-node ${shape}${dim ? ' dim' : ''}${onLit ? ' lit' : ''}${focus !== null && !onLit ? ' faded' : ''}${k === 'model' && writing ? ' writing' : ''}`}
      transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={name}
      onClick={() => t?.last && setFocus(t.last.n)} onKeyDown={e => { if (e.key === 'Enter' && t?.last) setFocus(t.last.n); }}>
      {shape === 'diamond' && <rect x={-15} y={-15} width={30} height={30} transform="rotate(45)"/>}
      {shape === 'circle' && <><circle r={24} className="ring"/><circle r={17}/></>}
      {shape === 'double' && <><rect x={-17} y={-15} width={34} height={30} rx={3}/><rect x={-13} y={-11} width={26} height={22} rx={2} className="inner"/></>}
      {shape === 'hex' && <polygon points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8"/>}
      {shape === 'person' && <><circle r={20}/><circle r={5} cy={-4} className="inner"/><path d="M-8 10 q8 -10 16 0" className="inner"/></>}
      {shape === 'tile' && <rect x={-46} y={-18} width={92} height={36} rx={6}/>}
      {shape === 'chip' && <rect x={-42} y={-12} width={84} height={24} rx={5}/>}
      <text y={shape === 'tile' || shape === 'chip' ? 4 : shape === 'circle' ? 42 : 30} className="wr-label">{label}</text>
      {sub && <text y={shape === 'tile' || shape === 'chip' ? 16 : shape === 'circle' ? 55 : 43} className="wr-sub">{sub}</text>}
      {t?.last && <Mark status={t.last.status} self={t.last.self_reported} x={shape === 'tile' ? 40 : shape === 'chip' ? 36 : 18} y={shape === 'tile' || shape === 'chip' ? -10 : -16} r={6}/>}
    </g>;
  };

  const lights = calm ? [] : visible.slice(Math.max(0, shown - 6)).filter(e => e.parent && byN.get(e.parent)).map(e => {
    const from = AT[nodeOf(byN.get(e.parent!)!)];
    const to = AT[nodeOf(e)];
    if (!from || !to || (from.x === to.x && from.y === to.y)) return null;
    const mid = {x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 30};
    return <circle key={`l${e.n}`} r={e.status === 'bad' ? 6 : 4} className={`wr-light ${e.status}${e.self_reported ? ' self' : ''}`}>
      <animateMotion dur={`${0.45 / speed}s`} fill="freeze" path={`M${from.x} ${from.y} Q${mid.x} ${mid.y} ${to.x} ${to.y}`}/>
      <animate attributeName="opacity" values="1;1;0" dur={`${0.9 / speed}s`} fill="freeze"/>
    </circle>;
  });

  const tasOn = events.some(e => e.kind === 'ROUTE' && e.system === 'tas');
  const counts = {good: 0, partial: 0, bad: 0, neutral: 0} as Record<Status, number>;
  for (const e of visible) if (e.self_reported) {
    const confirm = events.find(x => x.parent === e.n && x.node === 'gate:citation');
    counts[((confirm?.status === 'bad' ? 'bad' : e.status) as Status)] += 1;
  }

  return <section className="wr" aria-label="Watch the run">
    <header className="wr-head">
      <h2>{words(run?.module) || 'Run'} <small>{run ? hhmm(run.created_at) : ''}</small></h2>
      {run && !run.finished ? <span className="wr-pill live">● Live · {String(Math.floor(seconds(run.created_at, new Date(now).toISOString()) / 60)).padStart(2, '0')}:{String(Math.floor(seconds(run.created_at, new Date(now).toISOString()) % 60)).padStart(2, '0')}</span>
        : <span className="wr-pill">{replay ? 'Replay of run' : 'Run record'} · {run ? hhmm(run.created_at) : ''}</span>}
      <button type="button" className="wr-pill" onClick={() => setFull(f => !f)} aria-pressed={full}>Events: {full ? 'full' : 'summary'}</button>
      <button type="button" className={`wr-pill${problems.length ? ' bad' : ''}`} onClick={nextProblem} disabled={!problems.length}>{problems.length} problem{problems.length === 1 ? '' : 's'} <kbd>N</kbd></button>
      <button type="button" className="wr-pill" aria-pressed={calm} onClick={() => setCalm(c => !c)}>Calm</button>
      <button type="button" className="wr-pill" aria-pressed={log} onClick={() => setLog(l => !l)}>Log <kbd>L</kbd></button>
      {onBack && <button type="button" className="wr-pill" onClick={onBack}>Back to the plan</button>}
    </header>
    {q.isError && <p role="alert" className="br-bad">{errorMessage(q.error, 'Could not read the run')}</p>}

    <div className={`wr-body${focus !== null ? ' drawer-open' : ''}`}>
      {log ? <ol className="wr-log" aria-label="The run, step by step" aria-live="polite">
        {visible.filter(e => full || e.kind !== 'SETTING').map(e => <li key={e.n} className={`${e.status}${lit.has(e.n) ? ' lit' : ''}`}>
          <button type="button" onClick={() => setFocus(e.n)}><span className="wr-ln">#{e.n}</span><svg width="16" height="16" aria-hidden="true"><Mark status={e.status} self={e.self_reported} x={8} y={8} r={5}/></svg>
            <span>{e.text}</span><small>{who(e)}{e.rule ? ` · ${e.rule}` : ''}</small><b>{words(e.verdict)}</b></button></li>)}
      </ol> : <div className="wr-map">
        <svg viewBox="0 0 1000 470" role="group" aria-label="The run as a map: input, router and model, app checks, the suite's systems, output">
          <g className="wr-band"><rect x={250} y={18} width={440} height={36} rx={18}/>
            <text x={290} y={41}>Boundaries</text><text x={470} y={41} textAnchor="middle">Controls · {settingsIn.filter(e => / \(default /.test(e.text)).length} changed</text><text x={640} y={41} textAnchor="end">Protected</text></g>
          {['Input', 'Router', 'App checks'].map((h, i) => <text key={h} className="wr-col" x={[70, 185, 300][i]} y={92}>{h.toUpperCase()}</text>)}
          <text className="wr-col" x={880} y={92}>OUTPUT</text>
          {SYSTEMS.map(s => {
            const on = s.key === 'tas' && tasOn;
            return <g key={s.key} className={`wr-sys${on ? '' : ' dim'}`}><rect x={s.x - 44} y={100} width={88} height={260} rx={10}/>
              <text x={s.x} y={118} className="wr-label">{s.name}</text>
              {!on && <text x={s.x} y={140} className="wr-sub"><title>{s.trigger}</title>{s.key === 'tas' ? 'not routed' : 'not in the app yet'}</text>}
              {!on && <foreignObject x={s.x - 42} y={150} width={84} height={80}><p className="wr-why">{s.trigger}</p></foreignObject>}</g>;
          })}
          {/* wires */}
          <g className="wr-wires">
            {[['run', 'router'], ['retrieval', 'router'], ['router', 'model'], ['model', 'gate:schema'], ['gate:schema', 'gate:citation'], ['gate:citation', 'tas/class'],
              ['tas/class', 'tas/corroboration'], ['tas/class', 'candidate'], ['candidate', 'review'], ['router', tasOn ? 'tas/08' : 'app/draft']].map(([a, b]) =>
              <path key={`${a}-${b}`} className={chain.some(e => nodeOf(e) === a) && chain.some(e => nodeOf(e) === b) ? 'lit' : ''}
                d={`M${AT[a].x} ${AT[a].y} C${(AT[a].x + AT[b].x) / 2} ${AT[a].y} ${(AT[a].x + AT[b].x) / 2} ${AT[b].y} ${AT[b].x} ${AT[b].y}`}/>)}
          </g>
          {node('run', 'Question', 'tile', `${events.find(e => e.node === 'retrieval')?.refs.length ?? 0} records`)}
          {node('retrieval', 'Packet', 'tile', 'from this case')}
          {node('router', 'Router', 'diamond', tasOn ? '1 system routed' : '')}
          {node('model', 'Model call', 'circle', writing ? `writing · ${writingFor}s` : modelEnd ? `${(modelEnd.detail as {seconds?: number} | null)?.seconds ?? ''} s` : '')}
          {node('gate:schema', 'Shape', 'double')}
          {node('gate:citation', 'Citations', 'double', events.filter(e => e.node === 'gate:citation' && e.status === 'good').length + ' pass')}
          {events.some(e => e.node === 'gate:quote') && node('gate:quote', 'Quotes', 'double')}
          {events.some(e => e.node === 'gate:chart') && node('gate:chart', 'Charts', 'double')}
          {events.some(e => e.node === 'gate:writing') && node('gate:writing', 'Writing', 'double')}
          {tasOn && node(events.find(e => e.kind === 'LOAD')?.node ?? 'tas/08', events.find(e => e.kind === 'LOAD')?.node === 'tas/06' ? '06 Hypotheses' : '08 Synthesis', 'chip')}
          {tasOn && node('tas/class', events.some(e => e.node === 'tas/06') ? 'Hypotheses' : 'Classify', 'chip', `${visible.filter(e => e.self_reported).length} thoughts`)}
          {tasOn && events.some(e => e.node === 'tas/corroboration') && node('tas/corroboration', 'Corroboration', 'chip')}
          {events.some(e => e.node === 'cp-01') && node('cp-01', 'CP-01', 'hex', 'right of reply')}
          {node('candidate', 'Candidate', 'tile', run?.review_status ? words(run.review_status) : '')}
          {node('review', 'Your review', 'person', reviewed ? words(candidate.data?.review_status) : 'waits for you')}
          <g className="wr-tally" transform="translate(830 190)">
            {(['good', 'partial', 'bad', 'neutral'] as Status[]).map((s, i) => <g key={s} transform={`translate(0 ${i * 15})`}><Mark status={s} x={6} y={0} r={4.5}/><text x={16} y={4}>{counts[s]} {WORD[s]}</text></g>)}
          </g>
          <g className="wr-band support"><rect x={360} y={380} width={300} height={30} rx={15}/><text x={510} y={400} textAnchor="middle">Support · EGS gathering · EHS ethics · not triggered</text></g>
          {lights}
        </svg>
        {writing && <p className="wr-writing">Nothing is shown while the model writes. Lights leave the model only after it has answered.</p>}
        <p className="wr-legend" aria-hidden="true">
          {(['good', 'partial', 'bad', 'neutral'] as Status[]).map(s => <span key={s}><svg width="14" height="14"><Mark status={s} x={7} y={7} r={5}/></svg>{WORD[s]}</span>)}
          <span><svg width="14" height="14"><Mark status="neutral" self x={7} y={7} r={5}/></svg>model says · not checked</span>
          <span><svg width="16" height="14"><rect x={1} y={1} width={14} height={12} rx={2} className="wr-legend-double"/></svg>enforced app check</span>
        </p>
      </div>}

      {focused && <aside className="wr-drawer" role="dialog" aria-label="One thought, input to output">
        <header><p className="br-eyebrow">Trace · one thought, input to output</p>
          <h3>{thought?.text || focused.text}</h3>
          <p className="wr-chips">{thought && <span className={`wr-verdict ${thought.status}`}>{words(thought.verdict)}</span>}
            {(thought?.detail as {thought?: string} | null)?.thought && <span className="br-chip">AI · {(thought!.detail as {thought: string}).thought}</span>}</p>
          <button type="button" className="wr-close" aria-label="Close the trace" onClick={() => setFocus(null)}>×</button></header>
        <section aria-label="Input"><h4>1 Input</h4><p className="wr-q">“{run?.question}”</p>
          <p className="wr-chips">{settingsIn.slice(0, 8).map(e => <span key={e.n} className="br-chip">{e.text}</span>)}</p>
          {(thought ?? focused).refs.length > 0 && <ul className="wr-refs">{(thought ?? focused).refs.slice(0, 6).map(r => <li key={`${r.record_type}:${r.record_id}`}>{r.record_type}:{r.record_id.slice(0, 8)}</li>)}</ul>}</section>
        <section aria-label="Steps"><h4>2 Steps <small>{chain.length} events · parent chain</small></h4>
          <ol className="wr-steps">{chain.filter(e => full || e.kind !== 'SETTING').map(e => <li key={e.n} className={e.n === focus ? 'on' : ''} aria-label={`Step ${e.n}, ${e.text}, ${words(e.verdict) || WORD[e.status as Status]}, by ${who(e)}${e.rule ? `, rule ${e.rule}` : ''}`}>
            <span className="wr-ln">#{e.n}</span><svg width="14" height="14" aria-hidden="true"><Mark status={e.status} self={e.self_reported} x={7} y={7} r={5}/></svg>
            <span>{e.text}<small> {who(e)}{e.rule ? ` · ${e.rule}` : ''}</small></span><b className={e.status}>{words(e.verdict) || WORD[e.status as Status]}</b></li>)}</ol></section>
        <section aria-label="Output"><h4>3 Output</h4>
          {claim ? <dl className="br-facts"><dt>Class</dt><dd>{words(String(claim.classification ?? ''))} <span className="br-chip">model says</span></dd>
            <dt>Confidence</dt><dd>model: {words(String(claim.confidence_term ?? ''))} ({words(String(claim.confidence ?? ''))})</dd>
            {Array.isArray(claim.limitations) && claim.limitations.length > 0 && <><dt>Limits</dt><dd>{(claim.limitations as string[]).join('; ')}</dd></>}</dl>
            : <p className="wr-q">{focused.text}</p>}</section>
        <section aria-label="Ledger"><h4>4 Ledger</h4><p className="wr-chips">
          {(thought?.detail as {thought?: string} | null)?.thought && <span className="br-chip">{(thought!.detail as {thought: string}).thought} proposed</span>}
          {candidateId && <span className="br-chip">AIC {candidateId.slice(0, 8)} {candidate.data?.review_status ?? ''}</span>}
          <span className="br-chip">Judgement ledger · no outcome yet</span></p></section>
        <footer>
          {candidateId && !reviewed && !rejecting && <>
            <button type="button" className="br-primary" onClick={() => review.mutate({path: {candidate_id: candidateId}, body: {decision: 'accept', note: null}})}>Accept the answer</button>
            <button type="button" onClick={() => setRejecting(true)}>Reject with reason</button></>}
          {rejecting && <form className="br-add" onSubmit={e => { e.preventDefault(); if (candidateId) review.mutate({path: {candidate_id: candidateId}, body: {decision: 'reject', note: reason.trim()}}); }}>
            <input aria-label="Why reject it" value={reason} onChange={e => setReason(e.target.value)} autoFocus/><button type="submit" disabled={!reason.trim()}>Reject</button></form>}
          {reviewed && <span className="br-ok">{words(candidate.data?.review_status)}</span>}
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${thought?.text ?? focused.text} [${(thought?.detail as {thought?: string} | null)?.thought ?? `step ${focused.n}`}; ${(thought ?? focused).refs.map(r => `${r.record_type}:${r.record_id}`).join(', ')}; AI run ${id}]`); setCopied(true); }}>{copied ? 'Copied' : 'Copy cite'}</button>
          {review.isError && <span role="alert" className="br-bad">{errorMessage(review.error, 'Not saved')}</span>}
          <small>Accepting or rejecting applies to the whole answer.</small>
        </footer>
      </aside>}
    </div>

    <footer className="wr-strip">
      <div className="wr-transport" aria-label="Transport">
        <p className="br-eyebrow">Transport</p>
        <span><button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
          {[0.5, 1, 2].map(s => <button key={s} type="button" aria-pressed={speed === s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}</span>
        <span><button type="button" onClick={nextProblem} disabled={!problems.length}>Next problem · N</button>
          {run?.finished ? <button type="button" onClick={() => { setReplay(true); setFocus(null); setShown(0); setPlaying(true); }}>Replay</button>
            : <button type="button" onClick={() => { setLive(true); setShown(events.length); }}>Live</button>}</span>
        <small>Event {shown} of {events.length}{run?.finished ? '' : ' · live'}</small>
      </div>
      <div className="wr-lanes" aria-label="The run, one lane per part">
        {LANES.map(l => <div key={l.key} className={`wr-lane${l.key === 'las' ? ' dim' : ''}`}><span>{l.label}</span><div>
          {l.key === 'model' && modelStart && <i className="wr-bar" style={{left: `${xOf(modelStart)}%`, width: `${Math.max(1, (modelEnd ? xOf(modelEnd) : 100) - xOf(modelStart))}%`}}/>}
          {visible.filter(l.match).map(e => <button key={e.n} type="button" className={`wr-tick ${e.status}${e.self_reported ? ' self' : ''}${lit.has(e.n) ? ' lit' : ''}`} style={{left: `${xOf(e)}%`}}
            aria-label={`Step ${e.n}: ${e.text}`} onClick={() => setFocus(e.n)}/>)}
        </div></div>)}
        {last && <i className="wr-playhead" style={{left: `calc(64px + (100% - 64px) * ${xOf(last) / 100})`}}/>}
      </div>
      <div className="wr-ledgers">
        <p className="br-eyebrow">Ledgers</p>
        <div><b>Run record</b><small>append-only</small><em>{events.length}</em></div>
        <div><b>Judgement ledger</b><small>outcomes come later</small><em>0</em></div>
        <div><b>Final audit</b><small>tas/10 not run here</small><em>—</em></div>
      </div>
    </footer>
  </section>;
}
