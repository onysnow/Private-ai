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
import type {KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode} from 'react';

import {errorMessage} from '../../lib/api-client';
import {onScreen, typingInto} from '../../lib/on-screen';
import {
  getAiAnalysisCandidateEndpointOptions, listAiRunEventsOptions, listAiRunEventsQueryKey, listAiRunsOptions, markAiRunThoughtMutation,
  reviewAiAnalysisCandidateEndpointMutation,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {AiRunEventOut} from '../../lib/generated/types.gen';
import {currentAppearance, onAppearanceChange} from '../../lib/theme';
import {apiTime} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {RunBloom} from '../effects/run-bloom';
import type {Flight} from '../effects/run-bloom';
import {webglAvailable} from '../effects/webgl';
import {decisionWords, reviewItems} from './claim-review';
import {ClaimDecision, ClaimText, UnderlineKey} from './claim-review-view';
import {SAMPLE_EVENTS, SAMPLE_RUN} from './run-sample';
import {useRunStream} from './run-stream';
import {thoughtTallies} from './run-tally';

type Ev = AiRunEventOut;
type Status = 'good' | 'partial' | 'bad' | 'neutral';
type Pt = {x: number; y: number};

// Where each node of the record sits on the map (viewBox 1000 × 420) and its half size, for the wires.
const AT: Record<string, Pt> = {
  run: {x: 70, y: 110}, retrieval: {x: 70, y: 215}, controls: {x: 500, y: 28}, router: {x: 185, y: 150}, model: {x: 165, y: 305},
  'gate:schema': {x: 290, y: 130}, 'gate:citation': {x: 290, y: 215}, 'gate:quote': {x: 252, y: 300}, 'gate:chart': {x: 292, y: 300}, 'gate:writing': {x: 332, y: 300},
  'tas/08': {x: 495, y: 122}, 'tas/06': {x: 495, y: 122}, 'app/draft': {x: 290, y: 60}, 'tas/class': {x: 495, y: 158}, 'tas/corroboration': {x: 495, y: 194},
  'boundary:tas→las': {x: 640, y: 322}, 'boundary:las→das': {x: 735, y: 200},
  'cp-01': {x: 495, y: 290}, 'cp-02': {x: 32, y: 318}, 'cp-03': {x: 80, y: 318}, candidate: {x: 905, y: 110}, review: {x: 905, y: 300},
};
const HALF: Record<string, Pt> = {
  run: {x: 50, y: 22}, retrieval: {x: 50, y: 14}, router: {x: 21, y: 21}, model: {x: 26, y: 26}, 'gate:schema': {x: 18, y: 16}, 'gate:citation': {x: 18, y: 16},
  'gate:quote': {x: 18, y: 8}, 'gate:chart': {x: 18, y: 8}, 'gate:writing': {x: 18, y: 8}, 'tas/08': {x: 40, y: 11}, 'tas/06': {x: 40, y: 11}, 'tas/class': {x: 40, y: 11},
  'tas/corroboration': {x: 40, y: 11}, 'cp-01': {x: 14, y: 16}, 'cp-02': {x: 14, y: 16}, 'cp-03': {x: 14, y: 16}, 'boundary:tas→las': {x: 30, y: 9}, 'boundary:las→das': {x: 4, y: 120}, candidate: {x: 50, y: 20}, review: {x: 22, y: 22}, 'app/draft': {x: 40, y: 11},
};
const SYSTEMS: Array<{key: string; name: string; x: number; w: number; trigger: string}> = [
  {key: 'ras', name: 'RAS', x: 390, w: 80, trigger: 'if the answer had relied on published research'},
  {key: 'tas', name: 'TAS', x: 495, w: 100, trigger: 'the answer states facts about real people, firms and documents'},
  {key: 'qas', name: 'QAS', x: 600, w: 80, trigger: 'if the answer had computed or compared numbers'},
  {key: 'las', name: 'LAS', x: 690, w: 80, trigger: 'if the answer had drawn a conclusion beyond a source'},
  {key: 'das', name: 'DAS', x: 780, w: 80, trigger: 'if the answer had recommended an action'},
];
const TAS_MODULES = 10;
// The pipeline in reading order, for the arrow keys (research AI §4 "arrow keys move along the pipeline").
const ORDER = ['run', 'retrieval', 'cp-02', 'cp-03', 'router', 'model', 'gate:schema', 'gate:citation', 'gate:quote', 'gate:chart', 'gate:writing',
  'tas/08', 'tas/06', 'tas/class', 'tas/corroboration', 'cp-01', 'boundary:tas→las', 'boundary:las→das', 'candidate', 'review'];
const NOTES_KEY = 'pai:watch-run-notes';
const LANES: Array<{key: string; label: string; match: (e: Ev) => boolean}> = [
  {key: 'router', label: 'Router', match: e => e.kind === 'ROUTE' || e.kind === 'LOAD' || e.node === 'controls'},
  {key: 'model', label: 'Model', match: e => e.node === 'model'},
  {key: 'checks', label: 'Checks', match: e => e.node.startsWith('gate:') || e.node === 'retrieval'},
  {key: 'tas', label: 'TAS', match: e => e.system === 'tas' && e.kind !== 'ROUTE' && e.kind !== 'LOAD' && !e.node.startsWith('boundary:')},
  {key: 'las', label: 'LAS', match: e => (e.system === 'las' && e.kind !== 'ROUTE') || e.node === 'boundary:tas→las'},
  {key: 'das', label: 'DAS', match: e => (e.system === 'das' && e.kind !== 'ROUTE') || e.node === 'boundary:las→das'},
  {key: 'write', label: 'Write', match: e => e.kind === 'WRITE' || e.kind === 'TURN'},
  {key: 'you', label: 'You', match: e => e.node === 'review'},
];
const WORD: Record<Status, string> = {good: 'verified', partial: 'in between', bad: 'stopped', neutral: 'a finding'};
const STREAM_OVER = 12;
const isProblem = (e: Ev) => e.status === 'bad' || (e.status === 'partial' && !e.self_reported);
// A module of a system the app does not run yet (RAS, QAS, LAS, DAS): drawn as a chip in that system's column when a
// record holds one. B4 (the TAS → LAS crosswalk) and B6 (precedence before DAS) are boundaries (INTEROP §3, §8).
const OTHER_MODULE = /^(ras|qas|las|das)\/./;
const nodeOf = (e: Ev) => (AT[e.node] || OTHER_MODULE.test(e.node) ? e.node : e.node === 'cp-02' || e.node === 'cp-03' ? e.node : e.node.startsWith('gate:') ? 'gate:citation' : e.system === 'tas' ? 'tas/class' : 'run');
const words = (v: string | null | undefined) => (v ? (v.charAt(0) + v.slice(1).toLowerCase()).replace(/_/g, ' ') : '');
const utc = (iso: string) => apiTime(iso).getTime();
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

export function WatchTheRun({investigationId, runId, onBack, onRunAgain, onReview, onPlan, planDrawer, sample: startSample = false}: {
  investigationId: string; runId: string | null; onBack?: () => void; sample?: boolean;
  /** Run again with new instructions: back to the plan with this run's question (research AI §5 "Run again"). */
  onRunAgain?: (r: {question: string; module: string; theory: string | null; from?: {run_id: string; step: number}}) => void;
  /** Step 4 of Ask the case: review this run's answer claim by claim. */
  onReview?: (candidateId: string) => void;
  /** Open (or close) the instructions and plan as a drawer inside this view (research AI §6), for this run's question. */
  onPlan?: (r: {question: string; module: string; theory: string | null}) => void;
  /** The instructions and plan drawer, drawn at the left edge while open. */
  planDrawer?: ReactNode;
}): ReactElement {
  const queryClient = useQueryClient();
  const caseName = useWorkbenchStore(s => s.investigationName);
  const runs = useQuery({...listAiRunsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const [sample, setSample] = useState(startSample);
  const realId = runId ?? runs.data?.runs[0]?.run_id ?? null;
  const id = sample ? 'sample' : realId;
  // While the stream is connected, a slow poll only picks up the run's own status; without it, poll every second.
  const streaming = useRef(false);
  const q = useQuery({
    ...listAiRunEventsOptions({path: {investigation_id: investigationId, run_id: realId ?? ''}, query: {after: 0}}),
    enabled: Boolean(realId) && Boolean(investigationId) && !sample,
    refetchInterval: query => (query.state.data?.run.finished ? false : streaming.current ? 5000 : 1000),
  });
  const run = sample ? SAMPLE_RUN : q.data?.run;
  const events = useMemo(() => (sample ? SAMPLE_EVENTS : q.data?.events ?? []), [sample, q.data]);
  // Compare two runs of the same question: the parts whose verdict changed glow, the rest stay dim (research AI §4).
  const [compareId, setCompareId] = useState<string | null>(null);
  const other = useQuery({...listAiRunEventsOptions({path: {investigation_id: investigationId, run_id: compareId ?? ''}, query: {after: 0}}), enabled: Boolean(compareId) && Boolean(investigationId)});
  const stream = useRunStream(investigationId, sample ? null : realId, Boolean(q.data && !q.data.run.finished));
  streaming.current = stream.mode === 'live';
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
  // Very large live runs: when more than 40 steps wait to be shown, the clock runs 1.6× until it has caught up.
  const catchUp = run && !run.finished && playing && events.length - shown > 40 ? 1.6 : 1;
  const opened = useRef<string | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => { setCalm(calmNow()); }, []);
  useEffect(() => {
    if (!run || opened.current === run.run_id) return;
    opened.current = run.run_id;
    setShown(run.run_id === 'sample' ? 0 : run.finished ? events.length : 0);
    setReplay(run.run_id === 'sample');
    setPlaying(true);
    // A link copied with "Copy cite" opens the run on its step (…&step=n).
    const step = Number(new URLSearchParams(window.location.search).get('step'));
    if (step && events.some(e => e.n === step)) setFocus(step);
  }, [run, events]);
  useEffect(() => {
    if (!playing || shown >= events.length) return;
    // Never faster than about 6 steps a second, so no node changes more than three times a second at normal speed.
    const t = window.setTimeout(() => setShown(s => Math.min(events.length, s + 1)), (calm ? 30 : 160) / (speed * catchUp));
    return () => window.clearTimeout(t);
  }, [playing, shown, events.length, speed, calm, catchUp]);
  useEffect(() => { if (run?.finished && !replay && playing) setShown(events.length); }, [run?.finished, replay, playing, events.length]);

  const visible = useMemo(() => events.slice(0, shown), [events, shown]);
  // Lights in flight: each newly shown step travels for about a second, then only its node keeps the verdict.
  const [flying, setFlying] = useState<number[]>([]);
  const prevShown = useRef(0);
  const flightStart = useRef(new Map<number, number>());
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const fresh = shown > prevShown.current ? events.slice(prevShown.current, shown).map(e => e.n) : [];
    prevShown.current = shown;
    if (!fresh.length || calm) return;
    const at = performance.now();
    for (const n of fresh) flightStart.current.set(n, at);
    setFlying(f => [...f, ...fresh].slice(-80));
    timers.current.push(window.setTimeout(() => setFlying(f => f.filter(n => !fresh.includes(n))), 1100 / speed));
  }, [shown, events, calm, speed]);
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); }, []);
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
  // The latest mark you gave this thought, read back from the run record.
  const marked = thoughtId ? [...events].reverse().map(e => e.node === 'review' ? (e.detail as {thought?: string; mark?: string} | null) : null)
    .find(d => d?.thought === thoughtId)?.mark : undefined;

  const nextProblem = () => {
    const after = problems.find(p => p.n > (focus ?? 0)) ?? problems[0];
    if (after) { setFocus(after.n); setShown(s => Math.max(s, events.indexOf(after) + 1)); }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!onScreen(rootRef.current) || e.defaultPrevented || typingInto(target)) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nextProblem(); }
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setLog(v => !v); }
      else if (e.key === ' ' && target?.closest?.('.wr') && target.tagName !== 'BUTTON' && target.getAttribute('role') !== 'button') { e.preventDefault(); setPlaying(p => !p); }
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
  // Your mark on one thought ("To check"), kept in the run record as a step by you (POST …/thoughts/{id}/mark).
  const mark = useMutation({...markAiRunThoughtMutation(), onSuccess: () => {
    void queryClient.invalidateQueries({queryKey: listAiRunEventsQueryKey({path: {investigation_id: investigationId, run_id: realId ?? ''}, query: {after: 0}})});
  }});
  // Positions: the fixed map plus a chip per module of RAS, QAS, LAS or DAS the record holds (at most 5 a column,
  // the rest folded into "+ n modules", the suite viewer's rule).
  const otherModules = useMemo(() => {
    const by: Record<string, string[]> = {};
    for (const e of events) if (OTHER_MODULE.test(e.node)) { const sys = e.node.split('/')[0]; by[sys] ??= []; if (!by[sys].includes(e.node)) by[sys].push(e.node); }
    return by;
  }, [events]);
  const P = useMemo(() => {
    const out: Record<string, Pt> = {...AT};
    for (const [sys, mods] of Object.entries(otherModules)) {
      const col = SYSTEMS.find(x => x.key === sys);
      if (col) mods.forEach((m, i) => { out[m] = {x: col.x, y: 132 + Math.min(i, 5) * 34}; });
    }
    return out;
  }, [otherModules]);
  const sameQuestion = (runs.data?.runs ?? []).filter(r => run && r.run_id !== run.run_id && r.finished
    && r.question.trim().toLowerCase() === run.question.trim().toLowerCase());
  // A node's verdict in one run: its worst step (stopped, then in between, then verified, then a finding).
  const RANK: Record<string, number> = {bad: 3, partial: 2, good: 1, neutral: 0};
  const verdictAt = (list: Ev[], k: string): Status | null => {
    const at = list.filter(e => e.kind !== 'SETTING' && nodeOf(e) === k);
    return at.length ? at.reduce((w, e) => (RANK[e.status] > RANK[w] ? e.status as Status : w), at[0].status as Status) : null;
  };
  const changes = compareId && other.data ? ORDER.filter(k => P[k]).map(k => ({k, before: verdictAt(other.data.events, k), after: verdictAt(events, k)}))
    .filter(c => c.before !== c.after) : [];
  const changed = new Set(changes.map(c => c.k));
  // Hover: a node's tally in words, or a wire's count and kinds (research AI §4 "Hover").
  const [hover, setHover] = useState<{x: number; y: number; text: string} | null>(null);
  // Ctrl+wheel zooms the map around the pointer; the wheel over the strip zooms the lanes in time. The page never scrolls.
  const [zoom, setZoom] = useState({k: 1, cx: 500, cy: 210});
  const [win, setWin] = useState({from: 0, to: 1});
  const mapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Rain Noir's bloom on the lights (ADR-0013): its own switch in Appearance, never under Calm or reduced motion.
  const [bloom, setBloom] = useState(false);
  useEffect(() => {
    const read = () => {
      const a = currentAppearance();
      setBloom(a.theme === 'rain-noir' && a.effects === 'full' && a.motion !== 'calm' && !a.off.includes('bloom') && webglAvailable());
    };
    read();
    return onAppearanceChange(read);
  }, []);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = map.getBoundingClientRect();
      setZoom(z => {
        const k = Math.min(3, Math.max(1, z.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
        const w = 1000 / z.k, h = 420 / z.k;
        const px = z.cx - w / 2 + fx * w, py = z.cy - h / 2 + fy * h;
        return k === 1 ? {k: 1, cx: 500, cy: 210} : {k, cx: px + (z.cx - px) * (z.k / k), cy: py + (z.cy - py) * (z.k / k)};
      });
    };
    map.addEventListener('wheel', wheel, {passive: false});
    return () => map.removeEventListener('wheel', wheel);
  });
  useEffect(() => {
    const lanes = lanesRef.current;
    if (!lanes) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = lanes.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left - 64) / Math.max(1, r.width - 64)));
      setWin(w => {
        const width = w.to - w.from;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { // sideways: move in time
          const shift = Math.max(-w.from, Math.min(1 - w.to, (e.deltaX / r.width) * width));
          return {from: w.from + shift, to: w.to + shift};
        }
        const next = Math.min(1, Math.max(0.05, width * (e.deltaY < 0 ? 0.8 : 1.25)));
        const at = w.from + f * width;
        const from = Math.max(0, Math.min(1 - next, at - f * next));
        return {from, to: from + next};
      });
    };
    lanes.addEventListener('wheel', wheel, {passive: false});
    return () => lanes.removeEventListener('wheel', wheel);
  });
  // First use: two notes point at the model ring and the chips, until dismissed once.
  const [notes, setNotes] = useState(false);
  useEffect(() => { try { setNotes(!window.localStorage.getItem(NOTES_KEY)); } catch { setNotes(false); } }, []);
  const dismissNotes = () => { setNotes(false); try { window.localStorage.setItem(NOTES_KEY, '1'); } catch { /* the notes come back next time */ } };
  // The trace drawer: steps as a tree or on a time axis, a search over kind, id and rule, focus kept inside while open.
  const [stepsView, setStepsView] = useState<'tree' | 'timeline'>('tree');
  const [stepSearch, setStepSearch] = useState('');
  const drawerRef = useRef<HTMLElement | null>(null);
  const opener = useRef<Element | null>(null);
  const drawerOpen = focus !== null;
  useEffect(() => {
    if (drawerOpen) { opener.current = document.activeElement; drawerRef.current?.focus({preventScroll: true}); }
    else if (opener.current instanceof HTMLElement || opener.current instanceof SVGElement) { (opener.current as HTMLElement).focus?.({preventScroll: true}); opener.current = null; }
  }, [drawerOpen]);

  if (!id) return <section className="wr wr-empty" aria-label="Watch the run">
    <p>{runs.isLoading ? 'Looking for runs…' : 'No run yet. Ask the case a question, check the plan, then Run and watch.'}</p>
    {!runs.isLoading && <button type="button" className="br-quiet" onClick={() => setSample(true)}>Play a sample run</button>}
    {onBack && <button type="button" className="br-quiet" onClick={onBack}>Ask the case</button>}
  </section>;

  // The time axis: real seconds from the first step to the last (or to now while the run is live).
  const t0 = events[0] ? utc(events[0].at) : 0;
  // The run's own steps set the axis; your review, given later, sits at the right edge rather than squeezing the run.
  const own = events.filter(e => e.node !== 'review');
  const tEnd = Math.max(own.length ? utc(own[own.length - 1].at) : 0, run?.finished || !t0 ? 0 : now);
  const span = Math.max(1000, tEnd - t0);
  const xOf = (e: Ev) => (t0 ? Math.min(100, ((utc(e.at) - t0) / span) * 100) : 0);
  // The lanes show the window the wheel has zoomed to (the whole run by default).
  const xIn = (pct: number) => ((pct / 100 - win.from) / (win.to - win.from)) * 100;
  const inWin = (pct: number) => pct / 100 >= win.from - 1e-9 && pct / 100 <= win.to + 1e-9;
  // Steps that land in the same moment keep their order but are spaced a few pixels apart, so each can be clicked.
  const spread = (list: Ev[]): Array<[Ev, number]> => {
    let prev = -1;
    return list.filter(e => inWin(xOf(e))).map(e => { const x = Math.min(99.4, Math.max(xIn(xOf(e)), prev + 0.7)); prev = x; return [e, x]; });
  };
  const settingsIn = events.filter(e => e.kind === 'SETTING' && e.rule !== 'echo' && e.rule !== 'premise');
  const overrides = events.filter(e => e.kind === 'SETTING' && e.rule !== 'echo' && / \(default /.test(e.text)).length;
  const umbrellaFlags = events.filter(e => e.system === 'umbrella' && e.kind !== 'SETTING' && (e.status === 'partial' || e.status === 'bad')).length;
  const claim = thought && Array.isArray((candidate.data?.payload as {claims?: unknown[]} | undefined)?.claims)
    ? ((candidate.data!.payload as {claims: Array<Record<string, unknown>>}).claims.find(c => c.claim_id === thoughtId))
    : undefined;
  const reviewed = candidate.data && candidate.data.review_status !== 'proposed';
  // The answer's claims as a person decides them one by one; the thought in focus, when it is one of them.
  const items = sample ? [] : reviewItems(candidate.data);
  const item = thoughtId ? items.find(i => i.id === thoughtId) : undefined;
  const waitingClaims = items.filter(i => !i.decision).length;
  const afterDecision = () => { void queryClient.invalidateQueries({queryKey: listAiRunEventsQueryKey({path: {investigation_id: investigationId, run_id: realId ?? ''}, query: {after: 0}})}); };
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

  // Only the thoughts shown so far count; their confirmation may come later in the record.
  const counts = thoughtTallies([...visible.filter(e => e.self_reported), ...events.filter(e => e.node === 'gate:citation')]) as Record<Status, number>;

  const wire = (a: string, b: string) => {
    const from = P[a], to = P[b], ha = HALF[a] ?? {x: 20, y: 16}, hb = HALF[b] ?? {x: 20, y: 16};
    if (Math.abs(to.x - from.x) < 70) { // stacked: bottom to top
      const sy = from.y + (to.y > from.y ? ha.y : -ha.y), ty = to.y + (to.y > from.y ? -hb.y : hb.y);
      return `M${from.x} ${sy} L${to.x} ${ty}`;
    }
    const sx = from.x + ha.x, tx = to.x - hb.x, mx = (sx + tx) / 2;
    return `M${sx} ${from.y} C${mx} ${from.y} ${mx} ${to.y} ${tx} ${to.y}`;
  };
  const WIRES: Array<[string, string]> = [['run', 'router'], ['retrieval', 'model'], ['router', 'model'], ['model', 'gate:schema'], ['gate:schema', 'gate:citation'],
    ['router', tasOn ? loadNode : 'app/draft'], ['gate:citation', 'tas/class'], ['tas/class', 'tas/corroboration'], ['tas/class', 'candidate'], ['candidate', 'review']];

  const node = (k: string, label: string, shape: 'diamond' | 'circle' | 'double' | 'hex' | 'person' | 'qtile' | 'chip' | 'mini' | 'cand', sub?: string[], opts: {dim?: boolean; icon?: string; hint?: string} = {}) => {
    const p = P[k];
    const t = tally[k];
    const dim = opts.dim ?? false;
    const name = `${label}${opts.hint ? ` (${opts.hint})` : ''}${t ? `, ${(['good', 'partial', 'bad', 'neutral'] as Status[]).filter(s => t[s]).map(s => `${t[s]} ${WORD[s]}`).join(', ')}` : ''}${dim ? ', not run in the app' : ''}`;
    const onLit = chain.some(e => nodeOf(e) === k);
    const small = shape === 'chip' || shape === 'mini';
    const labelY = shape === 'circle' ? 44 : shape === 'hex' ? 30 : shape === 'person' ? 36 : shape === 'cand' ? -3 : shape === 'double' ? 30 : 32;
    const comparing = Boolean(compareId && other.data);
    return <g key={k} className={`wr-node ${shape}${dim ? ' dim' : ''}${onLit ? ' lit' : ''}${(focus !== null && !onLit) || (comparing && !changed.has(k)) ? ' faded' : ''}${comparing && changed.has(k) ? ' changed' : ''}${k === 'model' && writing ? ' writing' : ''}`}
      transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={name} data-k={k}
      onClick={() => t?.last && setFocus(t.last.n)} onKeyDown={e => { if (e.key === 'Enter' && t?.last) setFocus(t.last.n); else along(e, k); }}
      onMouseEnter={() => showTally(k, opts.hint ? `${label} ${opts.hint}` : label)} onMouseLeave={() => setHover(null)}
      onFocus={() => showTally(k, opts.hint ? `${label} ${opts.hint}` : label)} onBlur={() => setHover(null)}>
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
      {t && t.bad > 0 && <text className="wr-stopmark" x={shape === 'qtile' || shape === 'cand' ? -58 : small ? -48 : shape === 'person' || shape === 'circle' ? -38 : -24}
        y={shape === 'qtile' || shape === 'cand' || small ? 4 : shape === 'person' || shape === 'circle' ? 4 : -10} aria-hidden="true">⊘</text>}
      {!calm && last && last.status === 'bad' && nodeOf(last) === k && <g key={`spark${last.n}`} className="wr-sparks" aria-hidden="true">
        {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy], i) => <path key={i} d={`M${dx * 10} ${dy * 10} l${dx * 7} ${dy * 7}`}>
          <animate attributeName="opacity" values="0;1;0" dur="0.6s" fill="freeze"/></path>)}</g>}
    </g>;
  };
  // Hover words for a node: "TAS · 5 verified · 6 in between · 2 stopped".
  const showTally = (k: string, label: string) => {
    const t = tally[k], p = P[k];
    const parts = t ? (['good', 'partial', 'bad', 'neutral'] as Status[]).filter(st => t[st]).map(st => `${t[st]} ${WORD[st]}`) : [];
    setHover({x: p.x, y: p.y - (HALF[k]?.y ?? 16) - 12, text: [label, ...(parts.length ? parts : ['nothing yet'])].join(' · ')});
  };
  const along = (e: ReactKeyboardEvent, k: string) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const nodes = ORDER.map(o => document.querySelector<SVGGElement>(`.wr-node[data-k="${o}"]`)).filter((x): x is SVGGElement => Boolean(x));
    const at = nodes.findIndex(x => x.dataset.k === k);
    nodes[(at + step + nodes.length) % nodes.length]?.focus();
  };

  const verdictOf = (e: Ev) => words(e.verdict) || WORD[e.status as Status];
  const moduleLabel = (m: string) => {
    const named = events.find(e => e.node === m && (e.detail as {label?: string} | null)?.label);
    const code = m.split('/')[1];
    return named ? `${code} ${(named.detail as {label: string}).label}` : `${m.split('/')[0].toUpperCase()} ${code}`;
  };
  // B4: a PARTIALLY VERIFIED claim splits in two at the crosswalk, one VERIFIED, one UNVERIFIED (INTEROP §3, LAS
  // Module 03 rule 7: never rounded). B6: precedence before DAS; a step it stopped keeps the membrane lit for the run.
  type Split = {verdict: string; status: string};
  const splitOf = (e: Ev) => ((e.detail as {split?: Split[]} | null)?.split ?? []);
  const b4 = visible.filter(e => e.node === 'boundary:tas→las');
  const b6 = visible.filter(e => e.node === 'boundary:las→das');
  const b6Stopped = b6.find(e => e.status === 'bad');
  const lastB4 = b4[b4.length - 1];
  const boundaries = <g className="wr-boundaries">
    <g className={`wr-boundary${b4.length ? '' : ' dim'}${chain.some(e => e.node === 'boundary:tas→las') ? ' lit' : ''}`} role="button" tabIndex={0} data-k="boundary:tas→las"
      aria-label={`B4 crosswalk, TAS to LAS${lastB4 ? `, ${splitOf(lastB4).map(x => words(x.verdict)).join(' and ') || verdictOf(lastB4)}` : ', nothing crossed'}`}
      onClick={() => lastB4 && setFocus(lastB4.n)} onKeyDown={e => { if (e.key === 'Enter' && lastB4) setFocus(lastB4.n); else along(e, 'boundary:tas→las'); }}>
      <title>B4 crosswalk: a verification status crossing from TAS to LAS; PARTIALLY VERIFIED splits, never rounded</title>
      <rect className="wr-hit" x={P['boundary:tas→las'].x - 14} y={P['boundary:tas→las'].y - 18} width={78} height={50}/>
      <path d={`M${P['boundary:tas→las'].x} ${P['boundary:tas→las'].y - 14} v28`}/>
      {lastB4 && splitOf(lastB4).map((x, i) => <g key={i}><Mark status={x.status} x={P['boundary:tas→las'].x + 12} y={P['boundary:tas→las'].y - 7 + i * 14} r={4.5}/>
        <text x={P['boundary:tas→las'].x + 20} y={P['boundary:tas→las'].y - 4 + i * 14} className="wr-sub left">{words(x.verdict).toLowerCase()}</text></g>)}
      <text x={P['boundary:tas→las'].x} y={P['boundary:tas→las'].y + 26} className="wr-sub">B4 crosswalk</text></g>
    <g className={`wr-membrane${b6Stopped ? ' bad' : b6.length ? '' : ' dim'}${chain.some(e => e.node === 'boundary:las→das') ? ' lit' : ''}`} role="button" tabIndex={0} data-k="boundary:las→das"
      aria-label={`B6 precedence, before DAS${b6Stopped ? `, stopped: ${b6Stopped.text}` : ', nothing stopped'}`}
      onClick={() => b6[b6.length - 1] && setFocus((b6Stopped ?? b6[b6.length - 1]).n)} onKeyDown={e => { if (e.key === 'Enter' && b6.length) setFocus((b6Stopped ?? b6[b6.length - 1]).n); else along(e, 'boundary:las→das'); }}>
      <title>B6 precedence: what may not reach a decision (DAS){b6Stopped ? ` · stopped: ${b6Stopped.text}` : ''}</title>
      <rect className="wr-hit" x={P['boundary:las→das'].x - 5} y={90} width={10} height={250}/>
      <path d={`M${P['boundary:las→das'].x} 90 V340`}/>
      {b6Stopped && <Mark status="bad" x={P['boundary:las→das'].x} y={P['boundary:las→das'].y} r={7}/>}
      <text x={P['boundary:las→das'].x} y={352} className="wr-sub">B6 precedence</text></g>
  </g>;

  const lights = calm ? [] : visible.filter(e => flying.includes(e.n)).filter(e => e.parent && byN.get(e.parent) && !isStream(edgeKey(e))).map(e => {
    const from = P[nodeOf(byN.get(e.parent!)!)];
    const to = P[nodeOf(e)];
    if (!from || !to || (from.x === to.x && from.y === to.y)) return null;
    const split = e.node === 'boundary:tas→las' ? splitOf(e) : [];
    if (split.length) {
      const las = SYSTEMS.find(x => x.key === 'las')!;
      return <g key={`l${e.n}`}>{split.map((x, i) => <circle key={i} r={4.5} className={`wr-light ${x.status}`} opacity={0}>
        <animateMotion dur={`${0.5 / speed}s`} fill="freeze" path={`M${to.x} ${to.y} Q${(to.x + las.x) / 2} ${to.y + (i ? 10 : -30)} ${las.x} ${to.y + (i ? 0 : -60)}`}/>
        <animate attributeName="opacity" values="1;1;0" dur={`${1 / speed}s`} fill="freeze"/></circle>)}</g>;
    }
    const mid = {x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 26};
    // A soft dot with a short glowing tail; good steps travel dimmer with a shorter tail, problems at full brightness.
    const path = `M${from.x} ${from.y} Q${mid.x} ${mid.y} ${to.x} ${to.y}`;
    const tail = e.status === 'good' ? [0.03, 0.06] : [0.03, 0.06, 0.09, 0.12];
    const dur = Math.min(0.6, Math.max(0.3, 0.45)) / speed;
    return <g key={`l${e.n}`} className={`wr-light ${e.status}${e.self_reported ? ' self' : ''}`}>
      {[0, ...tail].map((d, i) => <circle key={i} r={(e.status === 'bad' ? 6 : 4.5) * (1 - i * 0.18)} opacity={0}>
        <animateMotion dur={`${dur}s`} begin={`${d / speed}s`} fill="freeze" path={path}/>
        <animate attributeName="opacity" values={`${(e.status === 'good' ? 0.6 : 1) * (1 - i * 0.22)};${(e.status === 'good' ? 0.6 : 1) * (1 - i * 0.22)};0`} begin={`${d / speed}s`} dur={`${(dur * 2)}s`} fill="freeze"/>
      </circle>)}
    </g>;
  });
  const lightsInFlight = lights.filter(Boolean).length;
  const flights: Flight[] = bloom && !calm ? visible.filter(e => flying.includes(e.n) && e.parent && byN.get(e.parent)).flatMap(e => {
    const from = P[nodeOf(byN.get(e.parent!)!)], to = P[nodeOf(e)];
    if (!from || !to || (from.x === to.x && from.y === to.y)) return [];
    return [{n: e.n, from, to, mid: {x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 26}, start: flightStart.current.get(e.n) ?? performance.now(),
      dur: 450 / speed, status: e.self_reported && e.status !== 'bad' ? 'self' : e.status}];
  }) : [];

  const tickLabels = [0, 0.25, 0.5, 0.75, 1].map(f => ({f, text: t0 ? clock(t0 + span * (win.from + f * (win.to - win.from))) : ''}));
  const worst = chain.find(e => e.status === 'bad') ?? chain.find(e => isProblem(e)) ?? thought ?? focused;
  const cap = chain.map(e => (e.detail as {capped_to?: string} | null)?.capped_to).find(Boolean);
  const refsOf = (thought ?? focused)?.refs ?? [];
  const removed = chain.find(e => e.kind === 'BLOCK')
    ?? events.find(e => e.kind === 'BLOCK' && thoughtId && (e.detail as {thought?: string} | null)?.thought === thoughtId)
    ?? events.find(e => e.kind === 'BLOCK' && e.refs.some(r => refsOf.some(x => x.record_id === r.record_id)));
  // The cap may sit on any step about this thought, not only on its own chain.
  const capOf = cap ?? (thoughtId ? events.map(e => (e.detail as {thought?: string; capped_to?: string} | null)).find(d => d?.thought === thoughtId && d.capped_to)?.capped_to : undefined);

  // The drawer's steps: the parent chain, filtered by the search (kind, #n, rule, node or verdict).
  const needle = stepSearch.trim().toLowerCase().replace(/^#/, '');
  const steps = chain.filter(e => full || e.kind !== 'SETTING').filter(e => !needle
    || String(e.n) === needle || [e.kind, e.rule, e.node, e.verdict, e.system].some(v => (v ?? '').toLowerCase().includes(needle)));
  const chainT0 = chain.length ? Math.min(...chain.map(e => utc(e.at))) : 0;
  const chainT1 = chain.length ? Math.max(...chain.map(e => utc(e.at))) : 0;
  const stepX = (e: Ev) => {
    const len = Math.max(1, chainT1 - chainT0);
    const start = ((utc(e.at) - chainT0) / len) * 100;
    // The model's call is drawn as one bar from its start to its answer, as a trace waterfall draws a generation.
    const answer = e.node === 'model' && e.verdict === 'STARTED' ? events.find(x => x.parent === e.n && x.node === 'model') : undefined;
    const width = answer ? ((utc(answer.at) - utc(e.at)) / len) * 100 : 1.5;
    return {left: Math.min(98.5, start), width: Math.max(1.5, Math.min(100 - start, width))};
  };
  // The weakest link: one mark per step that bears on the thought; the worst is named (SUITE §2.5 D2).
  const links = thought ? chain.filter(e => e.n !== thought.n && ['RULE', 'CHECK', 'FLAG', 'BLOCK'].includes(e.kind) && e.node !== 'model' && e.node !== 'retrieval') : [];
  const weakest = links.find(e => e.status === 'bad') ?? links.find(e => e.status === 'partial');
  const citation = () => {
    const link = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?inv=${encodeURIComponent(investigationId)}&run=${encodeURIComponent(id ?? '')}&step=${focused?.n ?? ''}#ai-runs`;
    return `“${(claim?.claim as string | undefined) ?? thought?.text ?? focused?.text ?? ''}” [${thoughtId ?? `step ${focused?.n}`}; ${refsOf.map(r => `${r.record_type}:${r.record_id}`).join(', ') || 'no record cited'}; AI run ${id}${sample ? ' (sample)' : ''}] ${link}`;
  };
  // Inside the drawer: ↑/↓ move through the steps, Enter lights one on the map, Tab stays inside until Esc.
  const drawerKeys = (e: ReactKeyboardEvent<HTMLElement>) => {
    const root = drawerRef.current;
    if (!root) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const rows = [...root.querySelectorAll<HTMLButtonElement>('.wr-steprow')];
      if (!rows.length) return;
      e.preventDefault();
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      rows[at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length].focus();
    } else if (e.key === 'Tab') {
      const items = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')];
      if (!items.length) return;
      const first = items[0], lastItem = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
    }
  };

  return <section className="wr" aria-label="Watch the run" ref={rootRef}>
    <header className="wr-head">
      <h2><span>{caseName || 'Case'}</span> · Act · AI runs · <b>{(words(run?.module) || 'Run').replace(/^./, c => c.toUpperCase())}</b> · {run ? stamp(run.created_at) : ''}</h2>
      {sample ? <span className="wr-pill">sample — not a real run</span>
        : stream.mode === 'reconnecting' ? <span className="wr-pill live" role="status">reconnecting · catching up from event {stream.from}</span>
        : liveRun ? <span className="wr-pill live">● LIVE · {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}{catchUp > 1 ? ` · ${catchUp}× to catch up` : ''}</span>
        : run?.status === 'failed' ? <span className="wr-pill bad" title={run.message ?? undefined}>Stopped · {stamp(run.created_at)}</span>
        : <span className="wr-pill">{replay ? 'Replay of run' : 'Run record'} · {run ? stamp(run.created_at) : ''}</span>}
      {sameQuestion.length > 0 && <select className="wr-pill wr-compare" aria-label="Compare with another run of this question" value={compareId ?? ''}
        onChange={e => setCompareId(e.target.value || null)}>
        <option value="">Compare…</option>
        {sameQuestion.map(r => <option key={r.run_id} value={r.run_id}>with {stamp(r.created_at)}{r.problems ? ` · ${r.problems} problems` : ''}</option>)}
      </select>}
      <button type="button" className="wr-pill" onClick={() => setFull(f => !f)} aria-pressed={full}>Events: {full ? 'full' : 'summary'}</button>
      <button type="button" className={`wr-pill${problems.length ? ' bad' : ''}`} onClick={nextProblem} disabled={!problems.length}>{problems.length} problem{problems.length === 1 ? '' : 's'} <kbd>N</kbd></button>
      <button type="button" className="wr-pill" aria-pressed={calm} onClick={() => setCalm(c => !c)}>Calm</button>
      <button type="button" className="wr-pill" aria-pressed={log} onClick={() => setLog(l => !l)}>Log <kbd>L</kbd></button>
      {onPlan && run && !sample && <button type="button" className="wr-pill" aria-pressed={Boolean(planDrawer)}
        onClick={() => onPlan({question: run.question, module: run.module, theory: run.working_theory ?? null})}>Instructions &amp; plan</button>}
      {onReview && candidateId && items.length > 0 && <button type="button" className={`wr-pill${waitingClaims && !reviewed ? ' ai' : ''}`} onClick={() => onReview(candidateId)}>
        Review{reviewed ? ` · ${words(candidate.data?.review_status)}` : waitingClaims ? ` · ${waitingClaims} wait` : ' · all decided'}</button>}
      {onBack &&<button type="button" className="wr-pill" onClick={onBack}>{sample && !realId ? 'Ask the case' : 'Back to the plan'}</button>}
    </header>
    {q.isError && <p role="alert" className="br-bad">{errorMessage(q.error, 'Could not read the run')}</p>}

    <div className={`wr-body${focus !== null ? ' drawer-open' : ''}${planDrawer ? ' plan-open' : ''}`}>
      {planDrawer && <aside className="wr-plan" aria-label="Instructions and plan" role="region">{planDrawer}</aside>}
      {log ? <ol className="wr-log" aria-label="The run, step by step" aria-live="polite">
        {visible.filter(e => full || e.kind !== 'SETTING').map(e => <li key={e.n} className={`${e.status}${lit.has(e.n) ? ' lit' : ''}`}>
          <button type="button" onClick={() => setFocus(e.n)}><span className="wr-ln">#{e.n}</span><svg width="16" height="16" aria-hidden="true"><Mark status={e.status} self={e.self_reported} x={8} y={8} r={5}/></svg>
            <span>{e.text}</span><small>{who(e)}{e.rule ? ` · ${e.rule}` : ''}</small><b>{words(e.verdict)}</b></button></li>)}
      </ol> : <div className="wr-map" ref={mapRef}>
        {zoom.k > 1 && <button type="button" className="wr-pill wr-fit" onClick={() => setZoom({k: 1, cx: 500, cy: 210})}>Fit · {Math.round(zoom.k * 100)}%</button>}
        {run?.finished && events.length === 0 && <p className="wr-old" role="status">This run was made before steps were recorded. Showing what was stored: question, packet, reply.</p>}
        <svg ref={svgRef} viewBox={`${zoom.cx - 500 / zoom.k} ${zoom.cy - 210 / zoom.k} ${1000 / zoom.k} ${420 / zoom.k}`} role="group" aria-label="The run as a map: input, router and model, app checks, the suite's systems, output" preserveAspectRatio="xMidYMid meet">
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
            const on = s.key === 'tas' ? tasOn : events.some(e => e.system === s.key || (e.kind === 'ROUTE' && e.system === s.key));
            return <g key={s.key} className={`wr-sys${on ? '' : ' dim'}`}><title>{on ? `${s.name}: ${s.trigger}` : `${s.name} not triggered: ${s.trigger}${s.key === 'tas' ? '' : ' · not in the app yet'}`}</title>
              <rect x={s.x - s.w / 2} y={82} width={s.w} height={262} rx={10}/>
              <text x={s.x} y={100} className="wr-label">{s.name}</text>
              {!on && <text x={s.x} y={116} className="wr-sub">not triggered</text>}
              {on && s.key === 'tas' && <text x={s.x} y={232} className="wr-sub">+ {TAS_MODULES - 1} modules</text>}
              {on && s.key === 'tas' && <text x={s.x} y={243} className="wr-sub tiny">not run here</text>}
              {on && (otherModules[s.key]?.length ?? 0) > 5 && <text x={s.x} y={132 + 5 * 34 + 4} className="wr-sub">+ {otherModules[s.key].length - 5} modules</text>}</g>;
          })}
          <g className="wr-wires">
            {WIRES.map(([a, b]) => {
              const k = `${a}>${b}`;
              const onChain = chain.some(e => nodeOf(e) === a) && chain.some(e => nodeOf(e) === b);
              return isStream(k) ? null : <path key={k} className={`${onChain ? 'lit' : ''}${changed.has(a) && changed.has(b) ? ' changed' : ''}`} d={wire(a, b)}/>;
            })}
          </g>
          <g className="wr-wirehits">
            {WIRES.map(([a, b]) => {
              const k = `${a}>${b}`;
              const on = visible.filter(e => edgeKey(e) === k);
              const kinds = [...new Set(on.map(e => e.kind))].join(', ');
              const text = on.length ? `${on.length} step${on.length === 1 ? '' : 's'} · ${kinds}` : 'nothing has passed yet';
              return <path key={k} d={wire(a, b)} onMouseEnter={ev => {
                const svg = (ev.currentTarget.ownerSVGElement as SVGSVGElement), pt = svg.createSVGPoint();
                pt.x = ev.clientX; pt.y = ev.clientY;
                const m = svg.getScreenCTM(); const at = m ? pt.matrixTransform(m.inverse()) : {x: (P[a].x + P[b].x) / 2, y: (P[a].y + P[b].y) / 2};
                setHover({x: at.x, y: at.y - 10, text});
              }} onMouseLeave={() => setHover(null)}><title>{text}</title></path>;
            })}
            {[...streams.entries()].filter(([k]) => isStream(k)).map(([k, n]) => {
              const [a, b] = k.split('>');
              const mx = (P[a].x + P[b].x) / 2, my = (P[a].y + P[b].y) / 2;
              return <g key={`s${k}`}><path className="wr-stream" d={wire(a, b)} style={{strokeWidth: Math.min(16, 3 + n / 3)}}/>
                <text x={mx} y={my - 8} className="wr-streamcount">{n} claims</text></g>;
            })}
          </g>
          {node('run', 'Question', 'qtile', lines(run?.question ?? '', 17, 2))}
          <g className={`wr-packet${packet ? '' : ' dim'}`} transform={`translate(${P.retrieval.x} ${P.retrieval.y - 22})`} role="button" tabIndex={0}
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
          {Object.values(otherModules).flatMap(mods => mods.slice(0, 5)).map(m => node(m, moduleLabel(m), 'chip'))}
          {boundaries}
          {node('cp-01', 'CP-01', 'hex', ['right of reply'], {dim: !events.some(e => e.node === 'cp-01')})}
          {node('candidate', 'Candidate', 'cand', [candidateId ? `AIC ${candidateId.slice(0, 8)}` : 'none saved'])}
          <g className="wr-tally" transform="translate(914 150)">
            {(['good', 'partial', 'bad', 'neutral'] as Status[]).map((s, i) => <g key={s} transform={`translate(0 ${i * 16})`}><Mark status={s} x={6} y={0} r={4.5}/><text x={18} y={4}>{counts[s]} {WORD[s]}</text></g>)}
          </g>
          {node('review', 'Your review', 'person', [reviewed ? words(candidate.data?.review_status) : 'waits for you'])}
          <g className="wr-band support"><rect x={330} y={362} width={340} height={34} rx={17}/>
            <text x={366} y={383} className="dimtext" textAnchor="middle">Support</text>
            {[['EGS', 'gathering', 440], ['EHS', 'ethics', 560]].map(([a, b, x]) => <g key={a as string} className="wr-sys dim" transform={`translate(${x} 379)`}><title>{a} {b}: not triggered, not in the app yet</title><rect x={-44} y={-12} width={88} height={24} rx={12}/><text y={4} className="wr-sub">{a} {b}</text></g>)}</g>
          {node('cp-02', 'CP-02', 'hex', undefined, {dim: !events.some(e => e.node === 'cp-02'), hint: 'source protection'})}
          {node('cp-03', 'CP-03', 'hex', undefined, {dim: !events.some(e => e.node === 'cp-03'), hint: 'publication approval'})}
          {lights}
          {notes && <g className="wr-note" role="note">
            <g transform={`translate(${P.model.x + 34} ${P.model.y - 44})`}><rect width={190} height={34} rx={6}/>
              <text x={8} y={14}>Lights leave the model only</text><text x={8} y={27}>after it has answered.</text></g>
            <g transform={`translate(${P['tas/class'].x + 48} ${P['tas/class'].y + 46})`}><rect width={190} height={46} rx={6}/>
              <text x={8} y={14}>Each light is one thought. Click a</text><text x={8} y={27}>light, a chip or a tally to trace it.</text>
              <text x={8} y={40} className="wr-note-ok" role="button" tabIndex={0} onClick={dismissNotes} onKeyDown={e => { if (e.key === 'Enter') dismissNotes(); }}>Got it</text></g>
          </g>}
          {hover && <g className="wr-hover" transform={`translate(${hover.x} ${hover.y})`} aria-hidden="true">
            <rect x={-hover.text.length * 2.9 - 8} y={-13} width={hover.text.length * 5.8 + 16} height={18} rx={5}/><text y={0}>{hover.text}</text></g>}
        </svg>
        {bloom && !calm && <RunBloom flights={flights} svgRef={svgRef} host={mapRef}/>}
        <div className="wr-under">
          <p className="wr-focus" aria-live="polite"><span className="br-eyebrow">Thought in focus</span>
            {compareId && other.data ? <><b>Compared with the run of {stamp(other.data.run.created_at)} · {changes.length ? `${changes.length} part${changes.length === 1 ? '' : 's'} changed` : 'nothing changed'}</b>
              <small>{changes.map(c => `${c.k.replace(/^gate:|^tas\//, '')}: ${c.before ? WORD[c.before] : 'not reached'} → ${c.after ? WORD[c.after] : 'not reached'}`).join(' · ') || 'Every part ended with the same verdict.'}</small></>
              : thought ? <><b>{thoughtId} · {thought.text}</b><small>Everything else dims to about a third. Esc clears.</small></>
              : run?.status === 'failed' ? <><b className="wr-bad">Stopped</b><small>{(run.message ?? run.error ?? 'The run stopped').replace(/[.\s]*$/, '.')} Press N for the step that stopped it.</small></>
              : <><b>None chosen</b><small>Click a light, a chip or a tally to follow one thought from input to output.</small></>}</p>
          <ul className="wr-legend" aria-label="Key">
            {(['good', 'partial', 'bad', 'neutral'] as Status[]).map(s => <li key={s}><svg width="14" height="14" aria-hidden="true"><Mark status={s} x={7} y={7} r={5}/></svg>{WORD[s]}</li>)}
            <li><svg width="14" height="14" aria-hidden="true"><Mark status="neutral" self x={7} y={7} r={5}/></svg>model says · not checked</li>
            <li><svg width="16" height="14" aria-hidden="true"><rect x={1} y={1} width={14} height={12} rx={2} className="wr-legend-double"/></svg>enforced app check</li>
          </ul>
        </div>
      </div>}

      {focused && <aside className="wr-drawer" role="dialog" aria-label="One thought, input to output" ref={drawerRef} tabIndex={-1} onKeyDown={drawerKeys}>
        <div className="wr-drawer-scroll">
          <header><p className="br-eyebrow">Trace · one thought, input to output</p>
            <h3>{thought?.text || focused.text}</h3>
            <p className="wr-chips">{worst && <span className={`wr-verdict ${worst.status}`}><svg width="12" height="12" aria-hidden="true"><Mark status={worst.status} self={worst.self_reported} x={6} y={6} r={4}/></svg> {verdictOf(worst)}</span>}
              {thoughtId && <span className="br-chip ai">AI · {thoughtId}</span>}</p>
            <button type="button" className="wr-close" aria-label="Close the trace" onClick={() => setFocus(null)}>×</button></header>
          <section aria-label="Input"><h4><b>1</b> Input</h4><p className="wr-q">“{run?.question}”</p>
            <p className="wr-chips">{settingsIn.filter(e => ['source_tier_floor', 'severity_floor', 'devils_advocate', 'live_events'].includes(e.rule ?? '')).map(e => <span key={e.n} className="br-chip">{settingChip(e)}</span>)}</p>
            {refsOf.length > 0 && <ul className="wr-refs">{refsOf.slice(0, 4).map(r => <li key={`${r.record_type}:${r.record_id}`}><b>{r.record_type}:{r.record_id.slice(0, 8)}</b></li>)}</ul>}</section>
          <section aria-label="Steps"><h4><b>2</b> Steps <small>{steps.length} events · parent chain</small></h4>
            <p className="wr-stepbar"><span className="br-seg" role="radiogroup" aria-label="Show the steps as">
              {(['tree', 'timeline'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={stepsView === v} className={stepsView === v ? 'on' : ''} onClick={() => setStepsView(v)}>{v}</button>)}</span>
              <input type="search" aria-label="Search the steps by kind, number or rule" placeholder="kind, #n or rule" value={stepSearch} onChange={e => setStepSearch(e.target.value)}/></p>
            <ol className={`wr-steps${stepsView === 'timeline' ? ' timeline' : ''}`}>{steps.map(e => <li key={e.n} className={e.n === focus ? 'on' : ''}>
              <button type="button" className="wr-steprow" onClick={() => setFocus(e.n)} aria-current={e.n === focus ? 'step' : undefined}
                aria-label={`Step ${e.n}, ${e.text}, ${verdictOf(e)}, by ${who(e)}${e.rule ? `, rule ${e.rule}` : ''}`}>
                <span className="wr-ln">#{e.n}</span><svg width="14" height="14" aria-hidden="true"><Mark status={e.status} self={e.self_reported} x={7} y={7} r={5}/></svg>
                {stepsView === 'tree' ? <span className="wr-step-text" title={`${e.text} · ${who(e)}${e.rule ? ` · ${e.rule}` : ''}`}>{e.text}<small> {who(e)}{e.rule ? ` · ${e.rule}` : ''}</small></span>
                  : <span className="wr-steptime" title={`${e.text} · ${clock(utc(e.at))}`}><i className={e.status} style={{left: `${stepX(e).left}%`, width: `${stepX(e).width}%`}}/></span>}
                <b className={e.status}>{verdictOf(e)}</b></button></li>)}
              {!steps.length && <li className="wr-none">No step matches “{stepSearch}”.</li>}</ol>
            {stepsView === 'timeline' && chain.length > 0 && <p className="wr-stepaxis"><span>{clock(chainT0)}</span><span>{Math.max(0, Math.round((chainT1 - chainT0) / 1000))} s</span><span>{clock(chainT1)}</span></p>}</section>
          <section aria-label="Output"><h4><b>3</b> Output <small>{item ? (item.grounded.length ? 'from a passage · model’s words' : 'model’s words · no passage says it') : refsOf.length ? 'from a passage · model’s words' : 'model’s words'}</small></h4>
            <p className="wr-q">{item ? <ClaimText item={item} reviewStatus={candidate.data?.review_status}/> : (claim?.claim as string | undefined) ?? (thought ?? focused).text}</p>
            {item && <UnderlineKey/>}
            {item && candidate.data && run?.finished && <ClaimDecision candidate={candidate.data} item={item} onSaved={afterDecision} compact/>}
            {candidateId && candidate.isLoading ? <div className="wr-skeleton" aria-label="Loading the answer"><i/><i/><i/></div>
              : <dl className="br-facts">
              {claim && <><dt>Class</dt><dd>{words(String(claim.classification ?? ''))} <span className="br-chip ai">model says</span></dd>
                <dt>Confidence</dt><dd>model: {claim.confidence_term ? words(String(claim.confidence_term)).toLowerCase() : 'not given (old format)'}{capOf ? <> → <b>capped: {capOf}</b></> : null}</dd></>}
              {!claim && capOf && <><dt>Confidence</dt><dd><b>capped: {capOf}</b></dd></>}
              {links.length > 0 && <><dt>Weakest link</dt><dd><span className="wr-links" aria-hidden="true">{links.map(e => <i key={e.n} className={`${e.status}${e === weakest ? ' weak' : ''}`} title={`#${e.n} ${e.text}`}/>)}</span>
                {weakest ? <> {capOf ? 'capped by' : 'weakest:'} step #{weakest.n}: {weakest.text}</> : ' every step held'}</dd></>}
              <dt>Removed</dt><dd>{removed ? removed.text : 'nothing removed'}</dd></dl>}</section>
          <section aria-label="Ledger"><h4><b>4</b> Ledger</h4><p className="wr-chips">
            {thoughtId && <span className="br-chip">{thoughtId} {item?.decision ? decisionWords(item.decision) : marked === 'to_check' ? 'to check · you' : marked === 'reject' ? 'rejected · you' : marked === 'keep' ? 'kept · you' : 'proposed'}</span>}
            {thoughtId && item?.decision && marked === 'to_check' && <span className="br-chip">to check · you</span>}
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
          {thoughtId && run?.finished && !sample && <button type="button" aria-pressed={marked === 'to_check'} disabled={mark.isPending}
            title={marked === 'to_check' ? 'On your list to check; press again to take it off' : 'Put this thought on your list to check; it is kept in the run record'}
            onClick={() => mark.mutate({path: {investigation_id: investigationId, run_id: realId ?? '', thought_id: thoughtId}, body: {mark: marked === 'to_check' ? 'keep' : 'to_check', reason: null}})}>
            {marked === 'to_check' ? '◉ To check' : '○ To check'}</button>}
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(citation()); setCopied(true); }}>{copied ? 'Copied' : 'Copy cite'}</button>
          {onRunAgain && run && !sample && run.finished && <button type="button" title="Back to the plan with this question and the same packet, to change the instructions; the new run is a new record and this one is kept"
            onClick={() => onRunAgain({question: run.question, module: run.module, theory: run.working_theory ?? null, from: focused ? {run_id: run.run_id, step: focused.n} : undefined})}>Run again from this step…</button>}
          {review.isError && <span role="alert" className="br-bad">{errorMessage(review.error, 'Not saved')}</span>}
          {mark.isError && <span role="alert" className="br-bad">{errorMessage(mark.error, 'Not saved')}</span>}
          <small>Accept and reject apply to the whole answer; {item ? 'Keep, Correct and Reject above decide this claim; ' : ''}To check marks this thought only.</small>
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
      <div className="wr-lanes" aria-label="The run, one lane per part" ref={lanesRef}>
        <p className="br-eyebrow">The run, one lane per part{win.to - win.from < 1 && <button type="button" className="wr-lanefit" onClick={() => setWin({from: 0, to: 1})}>whole run</button>}</p>
        <div className="wr-axis" aria-hidden="true"><span/>{tickLabels.map(t => <i key={t.f} style={{left: `${t.f * 100}%`}}>{t.text}</i>)}</div>
        {LANES.map(l => <div key={l.key} className={`wr-lane${l.key === 'las' || l.key === 'das' ? ' dim' : ''}`}><span>{l.label}</span><div>
          {l.key === 'model' && modelStart && (() => {
            const a = Math.max(0, xIn(xOf(modelStart))), b = Math.min(100, xIn(modelEnd ? xOf(modelEnd) : 100));
            return b > a ? <i className="wr-bar" style={{left: `${a}%`, width: `${Math.max(0.5, b - a)}%`}}/> : null;
          })()}
          {spread(visible.filter(l.match)).map(([e, x]) => <button key={e.n} type="button" className={`wr-tick ${e.status}${e.self_reported ? ' self' : ''}${lit.has(e.n) ? ' lit' : ''}`} style={{left: `${x}%`}}
            aria-label={`Step ${e.n}: ${e.text}`} onClick={() => setFocus(e.n)}/>)}
        </div></div>)}
        {last && inWin(xOf(last)) && <i className="wr-playhead" style={{left: `calc(64px + (100% - 64px) * ${xIn(xOf(last)) / 100})`}}/>}
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
