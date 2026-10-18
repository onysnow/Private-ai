'use client';
// Watch the run (mockup AI_1; research AI §4–5; ADR-0012). The run record drawn as a map, left to right: the input,
// the router and the model, the app's enforced checks, the suite's systems, the answer and your review. Each step
// travels as a light from the step it follows (`parent`) to its own node; the node keeps the verdict as a shape
// (✓ circle good, ◆ in between, ✕ square stopped, ○ a finding) and what the model says stays a dashed plum ring until
// the app's check confirms it. No fake thoughts: while the model writes, only its ring breathes. Systems the app does
// not run are drawn dimmed, with the sentence that would have triggered them on hover. Under Calm or reduced motion there are no
// travelling lights; the log (L) carries the same steps in order and is the screen-reader view.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {
  getAiAnalysisCandidateEndpointOptions, listAiRunEventsOptions, listAiRunEventsQueryKey, listAiRunsOptions, reviewAiAnalysisCandidateEndpointMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {AiRunEventOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

type Ev = AiRunEventOut;
type Status = 'good' | 'partial' | 'bad' | 'neutral';
type Pt = {x: number; y: number};

// Where each node of the record sits on the map (viewBox 1000 × 420) and its half size, for the wires.
const AT: Record<string, Pt> = {
  run: {x: 70, y: 110}, retrieval: {x: 70, y: 215}, controls: {x: 500, y: 28}, router: {x: 185, y: 150}, model: {x: 165, y: 305},
  'gate:schema': {x: 290, y: 130}, 'gate:citation': {x: 290, y: 215}, 'gate:quote': {x: 252, y: 300}, 'gate:chart': {x: 292, y: 300}, 'gate:writing': {x: 332, y: 300},
  'tas/08': {x: 495, y: 122}, 'tas/06': {x: 495, y: 122}, 'app/draft': {x: 290, y: 60}, 'tas/class': {x: 495, y: 158}, 'tas/corroboration': {x: 495, y: 194},
  'cp-01': {x: 495, y: 290}, candidate: {x: 905, y: 110}, review: {x: 905, y: 300},
};
const HALF: Record<string, Pt> = {
  run: {x: 50, y: 22}, retrieval: {x: 50, y: 14}, router: {x: 21, y: 21}, model: {x: 26, y: 26}, 'gate:schema': {x: 18, y: 16}, 'gate:citation': {x: 18, y: 16},
  'gate:quote': {x: 18, y: 8}, 'gate:chart': {x: 18, y: 8}, 'gate:writing': {x: 18, y: 8}, 'tas/08': {x: 40, y: 11}, 'tas/06': {x: 40, y: 11}, 'tas/class': {x: 40, y: 11},
  'tas/corroboration': {x: 40, y: 11}, 'cp-01': {x: 14, y: 16}, candidate: {x: 50, y: 20}, review: {x: 22, y: 22}, 'app/draft': {x: 40, y: 11},
};
const SYSTEMS: Array<{key: string; name: string; x: number; w: number; trigger: string}> = [
  {key: 'ras', name: 'RAS', x: 390, w: 80, trigger: 'if the answer had relied on published research'},
  {key: 'tas', name: 'TAS', x: 495, w: 100, trigger: 'the answer states facts about real people, firms and documents'},
  {key: 'qas', name: 'QAS', x: 600, w: 80, trigger: 'if the answer had computed or compared numbers'},
  {key: 'las', name: 'LAS', x: 690, w: 80, trigger: 'if the answer had drawn a conclusion beyond a source'},
  {key: 'das', name: 'DAS', x: 780, w: 80, trigger: 'if the answer had recommended an action'},
];
const TAS_MODULES = 10;
const LANES: Array<{key: string; label: string; match: (e: Ev) => boolean}> = [
  {key: 'router', label: 'Router', match: e => e.kind === 'ROUTE' || e.kind === 'LOAD' || e.node === 'controls'},
  {key: 'model', label: 'Model', match: e => e.node === 'model'},
  {key: 'checks', label: 'Checks', match: e => e.node.startsWith('gate:') || e.node === 'retrieval'},
  {key: 'tas', label: 'TAS', match: e => e.system === 'tas' && e.kind !== 'ROUTE' && e.kind !== 'LOAD'},
  {key: 'las', label: 'LAS', match: () => false},
  {key: 'das', label: 'DAS', match: () => false},
  {key: 'write', label: 'Write', match: e => e.kind === 'WRITE' || e.kind === 'TURN'},
  {key: 'you', label: 'You', match: e => e.node === 'review'},
];
const WORD: Record<Status, string> = {good: 'verified', partial: 'in between', bad: 'stopped', neutral: 'a finding'};
const STREAM_OVER = 12;
const isProblem = (e: Ev) => e.status === 'bad' || (e.status === 'partial' && !e.self_reported);
const nodeOf = (e: Ev) => (AT[e.node] ? e.node : e.node.startsWith('gate:') ? 'gate:citation' : e.system === 'tas' ? 'tas/class' : 'run');
const words = (v: string | null | undefined) => (v ? (v.charAt(0) + v.slice(1).toLowerCase()).replace(/_/g, ' ') : '');
const utc = (iso: string) => Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
const stamp = (iso: string) => new Date(utc(iso)).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false}).replace(',', '');
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', {hour12: false});
const who = (e: Ev) => (e.node === 'review' ? 'you' : e.self_reported ? 'model says' : e.system === 'app' ? 'app · enforced' : e.system);
const lines = (text: string, width: number, max: number): string[] => {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if ((`${line} ${w}`).trim().length > width && line) { out.push(line); line = w; } else line = `${line} ${w}`.trim();
    if (out.length === max) break;
  }
  if (out.length < max && line) out.push(line);
  const cut = out.join(' ').length < text.trim().length;
  if (cut && out.length) out[out.length - 1] = `${out[out.length - 1].slice(0, Math.max(1, width - 1))}…`;
  return out;
};
/** A setting the run was started with, as the mockup's instruction chips word it. */
const settingChip = (e: Ev): string => {
  const v = (e.verdict ?? '').toLowerCase();
  switch (e.rule) {
    case 'source_tier_floor': return `tier floor ${(e.verdict ?? '').toUpperCase()}`;
    case 'severity_floor': return `severity ${(e.verdict ?? '').toUpperCase()}`;
    case 'devils_advocate': return `devil's advocate ${v}`;
    case 'live_events': return `events ${v}`;
    default: return `${(e.rule ?? '').replace(/_/g, ' ')} ${v}`.trim();
  }
};

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
  const caseName = useWorkbenchStore(s => s.investigationName);
  const runs = useQuery({...listAiRunsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId) && !runId});
  const id = runId ?? runs.data?.runs[0]?.run_id ?? null;
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
    // Never faster than about 6 steps a second, so no node changes more than three times a second at normal speed.
    const t = window.setTimeout(() => setShown(s => Math.min(events.length, s + 1)), (calm ? 30 : 160) / speed);
    return () => window.clearTimeout(t);
  }, [playing, shown, events.length, speed, calm]);
  useEffect(() => { if (run?.finished && !replay && playing) setShown(events.length); }, [run?.finished, replay, playing, events.length]);

  const visible = useMemo(() => events.slice(0, shown), [events, shown]);
  const last = visible[visible.length - 1];
  const problems = events.filter(isProblem);
  const modelStart = visible.find(e => e.node === 'model' && e.verdict === 'STARTED');
  const modelEnd = visible.find(e => e.node === 'model' && e.verdict !== 'STARTED');
  const writing = Boolean(modelStart && !modelEnd);
  const [now, setNow] = useState(() => Date.now());
  const liveRun = Boolean(run && !run.finished);
  useEffect(() => { if (!writing && !liveRun) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [writing, liveRun]);
  const writingFor = modelStart ? Math.max(0, Math.round((now - utc(modelStart.at)) / 1000)) : 0;
  const elapsed = run ? Math.max(0, Math.round((now - utc(run.created_at)) / 1000)) : 0;

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
  const thoughtId = (thought?.detail as {thought?: string} | null)?.thought;

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

  useEffect(() => { document.querySelector('.wr-steps li.on')?.scrollIntoView?.({block: 'nearest'}); }, [focus]);

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

  // The time axis: real seconds from the first step to the last (or to now while the run is live).
  const t0 = events[0] ? utc(events[0].at) : 0;
  const tEnd = Math.max(events.length ? utc(events[events.length - 1].at) : 0, run?.finished || !t0 ? 0 : now);
  const span = Math.max(1000, tEnd - t0);
  const xOf = (e: Ev) => (t0 ? Math.min(100, ((utc(e.at) - t0) / span) * 100) : 0);
  // Steps that land in the same moment keep their order but are spaced a few pixels apart, so each can be clicked.
  const spread = (list: Ev[]): Array<[Ev, number]> => {
    let prev = -1;
    return list.map(e => { const x = Math.min(99.4, Math.max(xOf(e), prev + 0.7)); prev = x; return [e, x]; });
  };
  const settingsIn = events.filter(e => e.kind === 'SETTING' && e.rule !== 'echo' && e.rule !== 'premise');
  const overrides = events.filter(e => e.kind === 'SETTING' && e.rule !== 'echo' && / \(default /.test(e.text)).length;
  const umbrellaFlags = events.filter(e => e.system === 'umbrella' && e.kind !== 'SETTING' && (e.status === 'partial' || e.status === 'bad')).length;
  const claim = thought && Array.isArray((candidate.data?.payload as {claims?: unknown[]} | undefined)?.claims)
    ? ((candidate.data!.payload as {claims: Array<Record<string, unknown>>}).claims.find(c => c.claim_id === thoughtId))
    : undefined;
  const reviewed = candidate.data && candidate.data.review_status !== 'proposed';
  const tasOn = events.some(e => e.kind === 'ROUTE' && e.system === 'tas');
  const routed = new Set(events.filter(e => e.kind === 'ROUTE').map(e => e.system)).size;
  const loadNode = events.find(e => e.kind === 'LOAD')?.node ?? 'tas/08';
  const packet = events.find(e => e.node === 'retrieval');
  const local = /ollama/i.test(events.find(e => e.node === 'model')?.text ?? '');
  const gateUsed = (g: string) => events.some(e => e.node === g);
  const classified = events.filter(e => e.node === 'tas/class' && e.self_reported).length;

  // Streams: when more than a dozen thoughts share one wire, one thick band with a count replaces the lights.
  const edgeKey = (e: Ev) => (e.parent && byN.get(e.parent) ? `${nodeOf(byN.get(e.parent)!)}>${nodeOf(e)}` : '');
  const streams = new Map<string, number>();
  for (const e of visible) if (e.self_reported && edgeKey(e)) streams.set(edgeKey(e), (streams.get(edgeKey(e)) ?? 0) + 1);
  const isStream = (k: string) => (streams.get(k) ?? 0) > STREAM_OVER;

  const counts = {good: 0, partial: 0, bad: 0, neutral: 0} as Record<Status, number>;
  for (const e of visible) if (e.self_reported) {
    const confirm = events.find(x => x.parent === e.n && x.node === 'gate:citation');
    counts[((confirm?.status === 'bad' ? 'bad' : e.status) as Status)] += 1;
  }

  const wire = (a: string, b: string) => {
    const from = AT[a], to = AT[b], ha = HALF[a] ?? {x: 20, y: 16}, hb = HALF[b] ?? {x: 20, y: 16};
    if (Math.abs(to.x - from.x) < 70) { // stacked: bottom to top
      const sy = from.y + (to.y > from.y ? ha.y : -ha.y), ty = to.y + (to.y > from.y ? -hb.y : hb.y);
      return `M${from.x} ${sy} L${to.x} ${ty}`;
    }
    const sx = from.x + ha.x, tx = to.x - hb.x, mx = (sx + tx) / 2;
    return `M${sx} ${from.y} C${mx} ${from.y} ${mx} ${to.y} ${tx} ${to.y}`;
  };
  const WIRES: Array<[string, string]> = [['run', 'router'], ['retrieval', 'model'], ['router', 'model'], ['model', 'gate:schema'], ['gate:schema', 'gate:citation'],
    ['router', tasOn ? loadNode : 'app/draft'], ['gate:citation', 'tas/class'], ['tas/class', 'tas/corroboration'], ['tas/class', 'candidate'], ['candidate', 'review']];

  const node = (k: string, label: string, shape: 'diamond' | 'circle' | 'double' | 'hex' | 'person' | 'qtile' | 'chip' | 'mini' | 'cand', sub?: string[], opts: {dim?: boolean; icon?: string} = {}) => {
    const p = AT[k];
    const t = tally[k];
    const dim = opts.dim ?? false;
    const name = `${label}${t ? `, ${(['good', 'partial', 'bad', 'neutral'] as Status[]).filter(s => t[s]).map(s => `${t[s]} ${WORD[s]}`).join(', ')}` : ''}${dim ? ', not run in the app' : ''}`;
    const onLit = chain.some(e => nodeOf(e) === k);
    const small = shape === 'chip' || shape === 'mini';
    const labelY = shape === 'circle' ? 44 : shape === 'hex' ? 30 : shape === 'person' ? 36 : shape === 'cand' ? -3 : shape === 'double' ? 30 : 32;
    return <g key={k} className={`wr-node ${shape}${dim ? ' dim' : ''}${onLit ? ' lit' : ''}${focus !== null && !onLit ? ' faded' : ''}${k === 'model' && writing ? ' writing' : ''}`}
      transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={name}
      onClick={() => t?.last && setFocus(t.last.n)} onKeyDown={e => { if (e.key === 'Enter' && t?.last) setFocus(t.last.n); }}>
      <title>{name}</title>
      {shape === 'diamond' && <rect x={-15} y={-15} width={30} height={30} transform="rotate(45)"/>}
      {shape === 'circle' && <><circle r={27} className="ring"/><circle r={19}/><circle r={6} className="inner"/></>}
      {shape === 'double' && <><rect x={-18} y={-16} width={36} height={32} rx={4}/><rect x={-14} y={-12} width={28} height={24} rx={2.5} className="inner"/><text className="wr-icon" y={4}>{opts.icon}</text></>}
      {shape === 'hex' && <polygon points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8"/>}
      {shape === 'person' && <><circle r={21}/><circle r={5} cy={-4} className="inner"/><path d="M-8 10 q8 -10 16 0" className="inner"/></>}
      {shape === 'qtile' && <rect x={-50} y={-22} width={100} height={44} rx={6}/>}
      {shape === 'cand' && <rect x={-50} y={-20} width={100} height={40} rx={6}/>}
      {shape === 'chip' && <rect x={-40} y={-11} width={80} height={22} rx={5}/>}
      {shape === 'mini' && <rect x={-18} y={-8} width={36} height={16} rx={4}/>}
      {shape === 'qtile' ? <><text y={-9} className="wr-label left" x={-44}>{label}</text>{(sub ?? []).map((l, i) => <text key={i} x={-44} y={4 + i * 11} className="wr-sub left">{l}</text>)}</>
        : small ? <text y={shape === 'mini' ? 3 : 4} className={shape === 'mini' ? 'wr-sub' : 'wr-label chip'}>{label}</text>
        : <><text y={labelY} className="wr-label">{label}</text>{(sub ?? []).map((l, i) => <text key={i} y={labelY + 12 + i * 11} className="wr-sub">{l}</text>)}</>}
      {t?.last && shape !== 'mini' && <Mark status={t.last.status} self={t.last.self_reported} x={shape === 'qtile' || shape === 'cand' ? 48 : small ? 38 : 18} y={shape === 'qtile' ? -20 : shape === 'cand' ? -18 : small ? -9 : -16} r={5.5}/>}
    </g>;
  };

  const lights = calm ? [] : visible.slice(Math.max(0, shown - 6)).filter(e => e.parent && byN.get(e.parent) && !isStream(edgeKey(e))).map(e => {
    const from = AT[nodeOf(byN.get(e.parent!)!)];
    const to = AT[nodeOf(e)];
    if (!from || !to || (from.x === to.x && from.y === to.y)) return null;
    const mid = {x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 26};
    return <circle key={`l${e.n}`} r={e.status === 'bad' ? 6 : 4} className={`wr-light ${e.status}${e.self_reported ? ' self' : ''}`}>
      <animateMotion dur={`${0.45 / speed}s`} fill="freeze" path={`M${from.x} ${from.y} Q${mid.x} ${mid.y} ${to.x} ${to.y}`}/>
      <animate attributeName="opacity" values="1;1;0" dur={`${0.9 / speed}s`} fill="freeze"/>
    </circle>;
  });
  const lightsInFlight = lights.filter(Boolean).length;

  const tickLabels = [0, 0.25, 0.5, 0.75, 1].map(f => ({f, text: t0 ? clock(t0 + span * f) : ''}));
  const verdictOf = (e: Ev) => words(e.verdict) || WORD[e.status as Status];
  const worst = chain.find(e => e.status === 'bad') ?? chain.find(e => isProblem(e)) ?? thought ?? focused;
  const cap = chain.map(e => (e.detail as {capped_to?: string} | null)?.capped_to).find(Boolean);
  const refsOf = (thought ?? focused)?.refs ?? [];
  const removed = chain.find(e => e.kind === 'BLOCK') ?? events.find(e => e.kind === 'BLOCK' && e.refs.some(r => refsOf.some(x => x.record_id === r.record_id)));

  return <section className="wr" aria-label="Watch the run">
    <header className="wr-head">
      <h2><span>{caseName || 'Case'}</span> · Act · AI runs · <b>{(words(run?.module) || 'Run').replace(/^./, c => c.toUpperCase())}</b> · {run ? stamp(run.created_at) : ''}</h2>
      {liveRun ? <span className="wr-pill live">● LIVE · {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>
        : <span className="wr-pill">{replay ? 'Replay of run' : 'Run record'} · {run ? stamp(run.created_at) : ''}</span>}
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
        <svg viewBox="0 0 1000 420" role="group" aria-label="The run as a map: input, router and model, app checks, the suite's systems, output" preserveAspectRatio="xMidYMid meet">
          <g className="wr-band"><rect x={200} y={8} width={600} height={40} rx={20}/>
            <text x={262} y={32} textAnchor="middle" className="dimtext"><title>Boundaries between the suite’s systems: not in the app yet</title>Boundaries</text>
            <g className="wr-controls" transform="translate(500 28)" role="button" tabIndex={0} aria-label={`Controls, ${overrides} override${overrides === 1 ? '' : 's'}`}
              onClick={() => { const c = events.find(e => e.kind === 'SETTING'); if (c) setFocus(c.n); }}>
              <rect x={-76} y={-14} width={152} height={28} rx={14}/><text y={4}>Controls · {overrides} override{overrides === 1 ? '' : 's'}</text>
              {umbrellaFlags > 0 && <g><circle cx={72} cy={-12} r={8} className="badge"/><text x={72} y={-9} className="badge-n">{umbrellaFlags}</text></g>}</g>
            <text x={738} y={32} textAnchor="middle" className="dimtext"><title>Protected layers: checkpoints and fabrication controls</title>Protected · checkpoints</text></g>
          {[['Input', 70], ['Router', 185], ['App checks', 290]].map(([h, x]) => <text key={h} className="wr-col" x={x as number} y={72}>{String(h).toUpperCase()}</text>)}
          <text className="wr-col" x={905} y={72}>OUTPUT</text>
          {SYSTEMS.map(s => {
            const on = s.key === 'tas' && tasOn;
            return <g key={s.key} className={`wr-sys${on ? '' : ' dim'}`}><title>{on ? `${s.name}: ${s.trigger}` : `${s.name} not triggered: ${s.trigger}${s.key === 'tas' ? '' : ' · not in the app yet'}`}</title>
              <rect x={s.x - s.w / 2} y={82} width={s.w} height={262} rx={10}/>
              <text x={s.x} y={100} className="wr-label">{s.name}</text>
              {!on && <text x={s.x} y={116} className="wr-sub">not triggered</text>}
              {on && <text x={s.x} y={232} className="wr-sub">+ {TAS_MODULES - 1} modules</text>}
              {on && <text x={s.x} y={243} className="wr-sub tiny">not run here</text>}</g>;
          })}
          <g className="wr-wires">
            {WIRES.map(([a, b]) => {
              const k = `${a}>${b}`;
              const onChain = chain.some(e => nodeOf(e) === a) && chain.some(e => nodeOf(e) === b);
              return isStream(k) ? null : <path key={k} className={onChain ? 'lit' : ''} d={wire(a, b)}/>;
            })}
            {[...streams.entries()].filter(([k]) => isStream(k)).map(([k, n]) => {
              const [a, b] = k.split('>');
              const mx = (AT[a].x + AT[b].x) / 2, my = (AT[a].y + AT[b].y) / 2;
              return <g key={`s${k}`}><path className="wr-stream" d={wire(a, b)} style={{strokeWidth: Math.min(16, 3 + n / 3)}}/>
                <text x={mx} y={my - 8} className="wr-streamcount">{n} claims</text></g>;
            })}
          </g>
          {node('run', 'Question', 'qtile', lines(run?.question ?? '', 17, 2))}
          <g className={`wr-packet${packet ? '' : ' dim'}`} transform={`translate(${AT.retrieval.x} ${AT.retrieval.y - 22})`} role="button" tabIndex={0}
            aria-label={`Packet, ${packet?.refs.length ?? 0} records`} onClick={() => tally.retrieval?.last && setFocus(tally.retrieval.last.n)}
            onKeyDown={e => { if (e.key === 'Enter' && tally.retrieval?.last) setFocus(tally.retrieval.last.n); }}>
            {(packet?.refs ?? []).slice(0, 3).map((r, i) => <g key={i} transform={`translate(0 ${i * 26})`}><rect x={-50} y={-11} width={100} height={22} rx={5}/>
              <text x={-44} y={4} className="wr-sub left">{`${r.record_type}:${r.record_id.slice(0, 7)}`}</text></g>)}
            {(packet?.refs.length ?? 0) > 3 && <text y={72} className="wr-sub">+ {(packet?.refs.length ?? 0) - 3} records</text>}
            {tally.retrieval?.last && <Mark status={tally.retrieval.last.status} x={46} y={-9} r={5}/>}</g>
          {node('router', 'Router', 'diamond', [`${routed} of 5 routed`])}
          {node('model', 'Model call', 'circle', writing ? [`writing · ${writingFor}s`, 'nothing is shown while it writes'] : modelEnd ? [`${(modelEnd.detail as {seconds?: number} | null)?.seconds ?? ''} s · ${local ? 'on this computer' : 'sent out'}`] : [local ? 'on this computer' : 'not run yet', 'nothing is shown while it writes'])}
          {node('gate:schema', 'Shape', 'double', [events.some(e => e.node === 'gate:schema' && e.status === 'good') ? 'pass' : ''], {icon: '{ }'})}
          {node('gate:citation', 'Citations', 'double', [`${events.filter(e => e.node === 'gate:citation' && e.status === 'good').length} of ${events.filter(e => e.node === 'gate:citation' && e.kind === 'CHECK').length}`], {icon: '99'})}
          {(['gate:quote', 'gate:chart', 'gate:writing'] as const).map(g => node(g, g.slice(5), 'mini', undefined, {dim: !gateUsed(g)}))}
          {tasOn && node(loadNode, loadNode === 'tas/06' ? '06 Hypotheses' : '08 Synthesis', 'chip')}
          {tasOn && node('tas/class', `Classify ×${classified}`, 'chip')}
          {tasOn && events.some(e => e.node === 'tas/corroboration') && node('tas/corroboration', 'Corroboration', 'chip')}
          {node('cp-01', 'CP-01', 'hex', ['right of reply'], {dim: !events.some(e => e.node === 'cp-01')})}
          {node('candidate', 'Candidate', 'cand', [candidateId ? `AIC ${candidateId.slice(0, 8)}` : 'none saved'])}
          <g className="wr-tally" transform="translate(858 150)">
            {(['good', 'partial', 'bad', 'neutral'] as Status[]).map((s, i) => <g key={s} transform={`translate(0 ${i * 16})`}><Mark status={s} x={6} y={0} r={4.5}/><text x={18} y={4}>{counts[s]} {WORD[s]}</text></g>)}
          </g>
          {node('review', 'Your review', 'person', [reviewed ? words(candidate.data?.review_status) : 'waits for you'])}
          <g className="wr-band support"><rect x={330} y={362} width={340} height={34} rx={17}/>
            <text x={366} y={383} className="dimtext" textAnchor="middle">Support</text>
            {[['EGS', 'gathering', 440], ['EHS', 'ethics', 560]].map(([a, b, x]) => <g key={a as string} className="wr-sys dim" transform={`translate(${x} 379)`}><title>{a} {b}: not triggered, not in the app yet</title><rect x={-44} y={-12} width={88} height={24} rx={12}/><text y={4} className="wr-sub">{a} {b}</text></g>)}</g>
          {lights}
        </svg>
        <div className="wr-under">
          <p className="wr-focus" aria-live="polite"><span className="br-eyebrow">Thought in focus</span>
            {thought ? <><b>{thoughtId} · {thought.text}</b><small>Everything else dims to about a third. Esc clears.</small></>
              : <><b>None chosen</b><small>Click a light, a chip or a tally to follow one thought from input to output.</small></>}</p>
          <ul className="wr-legend" aria-label="Key">
            {(['good', 'partial', 'bad', 'neutral'] as Status[]).map(s => <li key={s}><svg width="14" height="14" aria-hidden="true"><Mark status={s} x={7} y={7} r={5}/></svg>{WORD[s].replace('a finding', 'a finding')}</li>)}
            <li><svg width="14" height="14" aria-hidden="true"><Mark status="neutral" self x={7} y={7} r={5}/></svg>model says · not checked</li>
            <li><svg width="16" height="14" aria-hidden="true"><rect x={1} y={1} width={14} height={12} rx={2} className="wr-legend-double"/></svg>enforced app check</li>
          </ul>
        </div>
      </div>}

      {focused && <aside className="wr-drawer" role="dialog" aria-label="One thought, input to output">
        <div className="wr-drawer-scroll">
          <header><p className="br-eyebrow">Trace · one thought, input to output</p>
            <h3>{thought?.text || focused.text}</h3>
            <p className="wr-chips">{worst && <span className={`wr-verdict ${worst.status}`}><svg width="12" height="12" aria-hidden="true"><Mark status={worst.status} self={worst.self_reported} x={6} y={6} r={4}/></svg> {verdictOf(worst)}</span>}
              {thoughtId && <span className="br-chip ai">AI · {thoughtId}</span>}</p>
            <button type="button" className="wr-close" aria-label="Close the trace" onClick={() => setFocus(null)}>×</button></header>
          <section aria-label="Input"><h4><b>1</b> Input</h4><p className="wr-q">“{run?.question}”</p>
            <p className="wr-chips">{settingsIn.filter(e => ['source_tier_floor', 'severity_floor', 'devils_advocate', 'live_events'].includes(e.rule ?? '')).map(e => <span key={e.n} className="br-chip">{settingChip(e)}</span>)}</p>
            {refsOf.length > 0 && <ul className="wr-refs">{refsOf.slice(0, 4).map(r => <li key={`${r.record_type}:${r.record_id}`}><b>{r.record_type}:{r.record_id.slice(0, 8)}</b></li>)}</ul>}</section>
          <section aria-label="Steps"><h4><b>2</b> Steps <small>{chain.filter(e => full || e.kind !== 'SETTING').length} events · parent chain</small></h4>
            <ol className="wr-steps">{chain.filter(e => full || e.kind !== 'SETTING').map(e => <li key={e.n} className={e.n === focus ? 'on' : ''}
              aria-label={`Step ${e.n}, ${e.text}, ${verdictOf(e)}, by ${who(e)}${e.rule ? `, rule ${e.rule}` : ''}`}>
              <span className="wr-ln">#{e.n}</span><svg width="14" height="14" aria-hidden="true"><Mark status={e.status} self={e.self_reported} x={7} y={7} r={5}/></svg>
              <span className="wr-step-text" title={`${e.text} · ${who(e)}${e.rule ? ` · ${e.rule}` : ''}`}>{e.text}<small> {who(e)}{e.rule ? ` · ${e.rule}` : ''}</small></span><b className={e.status}>{verdictOf(e)}</b></li>)}</ol></section>
          <section aria-label="Output"><h4><b>3</b> Output <small>{refsOf.length ? 'from a passage · model’s words' : 'model’s words'}</small></h4>
            <p className="wr-q">{(claim?.claim as string | undefined) ?? (thought ?? focused).text}</p>
            <dl className="br-facts">
              {claim && <><dt>Class</dt><dd>{words(String(claim.classification ?? ''))} <span className="br-chip ai">model says</span></dd>
                <dt>Confidence</dt><dd>model: {words(String(claim.confidence_term ?? '')).toLowerCase()}{cap ? <> → <b>capped: {cap}</b></> : null}</dd></>}
              <dt>Removed</dt><dd>{removed ? removed.text : 'nothing removed'}</dd></dl></section>
          <section aria-label="Ledger"><h4><b>4</b> Ledger</h4><p className="wr-chips">
            {thoughtId && <span className="br-chip">{thoughtId} proposed</span>}
            {candidateId && <span className="br-chip">AIC {candidateId.slice(0, 8)} {reviewed ? words(candidate.data?.review_status) : 'sent for you'}</span>}
            <span className="br-chip">Judgement ledger · no outcome yet</span></p></section>
        </div>
        <footer>
          {candidateId && !reviewed && !rejecting && <>
            <button type="button" className="br-primary" onClick={() => review.mutate({path: {candidate_id: candidateId}, body: {decision: 'accept', note: null}})}>✓ Accept</button>
            <button type="button" onClick={() => setRejecting(true)}>✕ Reject with reason</button></>}
          {rejecting && <form className="br-add" onSubmit={e => { e.preventDefault(); if (candidateId) review.mutate({path: {candidate_id: candidateId}, body: {decision: 'reject', note: reason.trim()}}); }}>
            <input aria-label="Why reject it" value={reason} onChange={e => setReason(e.target.value)} autoFocus/><button type="submit" disabled={!reason.trim()}>Reject</button></form>}
          {reviewed && <span className="br-ok">{words(candidate.data?.review_status)}</span>}
          <button type="button" disabled title="Review applies to the whole answer; marking one claim to check is not built yet">○ To check</button>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${thought?.text ?? focused.text} [${thoughtId ?? `step ${focused.n}`}; ${refsOf.map(r => `${r.record_type}:${r.record_id}`).join(', ')}; AI run ${id}]`); setCopied(true); }}>{copied ? 'Copied' : 'Copy cite'}</button>
          {review.isError && <span role="alert" className="br-bad">{errorMessage(review.error, 'Not saved')}</span>}
          <small>Accept and reject apply to the whole answer.</small>
        </footer>
      </aside>}
    </div>

    <footer className="wr-strip">
      <div className="wr-transport" aria-label="Transport">
        <p className="br-eyebrow">Transport</p>
        <span><button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
          {[0.5, 1, 2].map(s => <button key={s} type="button" aria-pressed={speed === s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}</span>
        <span><button type="button" onClick={nextProblem} disabled={!problems.length}>Next problem · N</button>
          <button type="button" className={liveRun && playing ? 'on' : ''} onClick={() => { setReplay(false); setPlaying(true); setShown(events.length); }}>Live</button>
          {run?.finished && <button type="button" onClick={() => { setReplay(true); setFocus(null); setShown(0); setPlaying(true); }}>Replay</button>}</span>
        <small>Event {shown} of {events.length} · {lightsInFlight} light{lightsInFlight === 1 ? '' : 's'} in flight{!playing && liveRun && events.length > shown ? ` · ${events.length - shown} new` : ''}</small>
        <small>Model: {(events.find(e => e.node === 'model' && e.verdict !== 'STARTED')?.detail as {model?: string} | null)?.model ?? '—'}{local ? ' · this computer' : ''}</small>
      </div>
      <div className="wr-lanes" aria-label="The run, one lane per part">
        <p className="br-eyebrow">The run, one lane per part</p>
        <div className="wr-axis" aria-hidden="true"><span/>{tickLabels.map(t => <i key={t.f} style={{left: `${t.f * 100}%`}}>{t.text}</i>)}</div>
        {LANES.map(l => <div key={l.key} className={`wr-lane${l.key === 'las' || l.key === 'das' ? ' dim' : ''}`}><span>{l.label}</span><div>
          {l.key === 'model' && modelStart && <i className="wr-bar" style={{left: `${xOf(modelStart)}%`, width: `${Math.max(1, (modelEnd ? xOf(modelEnd) : 100) - xOf(modelStart))}%`}}/>}
          {spread(visible.filter(l.match)).map(([e, x]) => <button key={e.n} type="button" className={`wr-tick ${e.status}${e.self_reported ? ' self' : ''}${lit.has(e.n) ? ' lit' : ''}`} style={{left: `${x}%`}}
            aria-label={`Step ${e.n}: ${e.text}`} onClick={() => setFocus(e.n)}/>)}
        </div></div>)}
        {last && <i className="wr-playhead" style={{left: `calc(64px + (100% - 64px) * ${xOf(last) / 100})`}}/>}
      </div>
      <div className="wr-ledgers">
        <p className="br-eyebrow">Ledgers</p>
        <div><b>Run record</b><small>append-only, hashed</small><em>{events.length}</em></div>
        <div><b>Judgement ledger</b><small>outcomes come later</small><em>0</em></div>
        <div><b>Final audit</b><small>tas/{TAS_MODULES} not run here</small><em>—</em></div>
      </div>
    </footer>
  </section>;
}
