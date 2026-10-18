/**
 * The performance readout (light-engine architecture §4.3).
 *
 * Off unless asked for: add `?perf=1` to the address (it is remembered in
 * this browser until `?perf=0`). Off, it costs nothing -- no timers, no
 * queries, no panel; every hook below returns at its first line.
 *
 * On, it measures, per frame of the page's one loop (engine/scheduler):
 *
 *   - the frame interval (so frames per second and the worst frames);
 *   - the main-thread time of each task (the scene, each pass, the liquid
 *     render, the cursor ...);
 *   - the GPU time of each WebGL pass, with the browser's timer queries
 *     (EXT_disjoint_timer_query) where the browser offers them; where it does
 *     not, by finishing the GPU's work at the end of the pass and timing that
 *     on the CPU -- slower, and labelled as such;
 *
 * and shows averages and 95th percentiles over the last two seconds in a
 * small panel, and as `window.__perf()` for reading from the console or a
 * test.
 */

import { experimentsAllowed } from "@fx/lib/admin-gate";

const WINDOW = 120; // samples kept per series (about two seconds at 60 fps)

type Series = { values: number[]; next: number };

const series = new Map<string, Series>();
let enabled: boolean | null = null;

/** Whether the readout is on (the `?perf` switch, remembered per browser). */
export function perfEnabled(): boolean {
  if (enabled !== null) return enabled;
  enabled = false;
  if (typeof window === "undefined" || !experimentsAllowed()) return enabled;
  try {
    const flag = new URLSearchParams(window.location.search).get("perf");
    if (flag === "1") window.localStorage.setItem("onysnow:perf", "1");
    if (flag === "0") window.localStorage.removeItem("onysnow:perf");
    enabled = window.localStorage.getItem("onysnow:perf") === "1";
  } catch {
    enabled = new URLSearchParams(window.location.search).get("perf") === "1";
  }
  return enabled;
}

/** Record one sample, in milliseconds, under a name. */
export function record(name: string, ms: number) {
  if (!perfEnabled()) return;
  let s = series.get(name);
  if (!s) {
    s = { values: [], next: 0 };
    series.set(name, s);
  }
  if (s.values.length < WINDOW) s.values.push(ms);
  else s.values[s.next] = ms;
  s.next = (s.next + 1) % WINDOW;
}

export type Stat = { avg: number; p95: number; max: number; n: number };

/** Average, 95th percentile and worst of a list of samples. */
export function summarise(values: readonly number[]): Stat {
  const n = values.length;
  if (!n) return { avg: 0, p95: 0, max: 0, n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p95 = sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)]!;
  return { avg: sum / n, p95, max: sorted[n - 1]!, n };
}

/** Everything measured, summarised. */
export function perfSnapshot(): Record<string, Stat> {
  const out: Record<string, Stat> = {};
  for (const [name, s] of series) out[name] = summarise(s.values);
  return out;
}

/** Forget everything measured so far (e.g. before a comparison). */
export function resetPerf() {
  series.clear();
}

// ---------------------------------------------------------------------------
// GPU time
// ---------------------------------------------------------------------------

type TimerExt = {
  TIME_ELAPSED_EXT: number;
  QUERY_RESULT_EXT: number;
  QUERY_RESULT_AVAILABLE_EXT: number;
  GPU_DISJOINT_EXT: number;
  createQueryEXT(): WebGLQuery | null;
  deleteQueryEXT(q: WebGLQuery): void;
  beginQueryEXT(target: number, q: WebGLQuery): void;
  endQueryEXT(target: number): void;
  getQueryObjectEXT(q: WebGLQuery, pname: number): number | boolean;
};

const timerExt = new WeakMap<WebGLRenderingContext, TimerExt | null>();
const pending: { gl: WebGLRenderingContext; q: WebGLQuery; name: string }[] = [];
const open = new WeakMap<WebGLRenderingContext, { name: string; q?: WebGLQuery; t0: number }>();

function extFor(gl: WebGLRenderingContext): TimerExt | null {
  if (!timerExt.has(gl)) {
    timerExt.set(gl, (gl.getExtension("EXT_disjoint_timer_query") as TimerExt | null) ?? null);
  }
  return timerExt.get(gl) ?? null;
}

/** How GPU time is being measured in this browser, for the panel's label. */
export function gpuTiming(gl: WebGLRenderingContext | null): "timer query" | "finish" | "off" {
  if (!perfEnabled() || !gl) return "off";
  return extFor(gl) ? "timer query" : "finish";
}

/** Start timing a pass's GPU work. Pair with gpuEnd. */
export function gpuBegin(gl: WebGLRenderingContext, name: string) {
  if (!perfEnabled()) return;
  collect();
  const ext = extFor(gl);
  if (ext) {
    const q = ext.createQueryEXT();
    if (q) {
      ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, q);
      open.set(gl, { name, q, t0: 0 });
      return;
    }
  }
  gl.finish();
  open.set(gl, { name, t0: performance.now() });
}

/** Stop timing the pass started with gpuBegin. */
export function gpuEnd(gl: WebGLRenderingContext) {
  if (!perfEnabled()) return;
  const o = open.get(gl);
  if (!o) return;
  open.delete(gl);
  const ext = extFor(gl);
  if (o.q && ext) {
    ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
    pending.push({ gl, q: o.q, name: o.name });
    return;
  }
  gl.finish();
  record(`gpu:${o.name}`, performance.now() - o.t0);
}

/** Read back finished timer queries (results arrive a frame or two later). */
function collect() {
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i]!;
    const ext = extFor(p.gl);
    if (!ext) {
      pending.splice(i, 1);
      continue;
    }
    if (!ext.getQueryObjectEXT(p.q, ext.QUERY_RESULT_AVAILABLE_EXT)) continue;
    const disjoint = p.gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    if (!disjoint) {
      const ns = ext.getQueryObjectEXT(p.q, ext.QUERY_RESULT_EXT) as number;
      record(`gpu:${p.name}`, ns / 1e6);
    }
    ext.deleteQueryEXT(p.q);
    pending.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

let panel: HTMLElement | null = null;
let lastFrameAt = -Infinity;
let lastTick = -Infinity;

/**
 * One tick of the page's loop, at its frame time. The interval to the
 * previous tick is a frame time only when the loop was running; a gap after
 * the page went idle is not a slow frame, so gaps over 250 ms are left out.
 */
export function markFrame(now: number) {
  if (!perfEnabled()) return;
  if (now - lastTick < 250) record("frame", now - lastTick);
  lastTick = now;
  lastFrameAt = performance.now();
}
let gpuMode = "off";

/** Tell the panel how GPU time is measured (set by the shared context). */
export function setGpuMode(mode: string) {
  gpuMode = mode;
}

function fmt(ms: number) {
  return ms < 10 ? ms.toFixed(2) : ms.toFixed(1);
}

function render() {
  if (!panel) return;
  const snap = perfSnapshot();
  const frame = snap["frame"];
  const lines: string[] = [];
  if (frame && frame.n && performance.now() - lastFrameAt < 1000) {
    lines.push(
      `fps ${(1000 / frame.avg).toFixed(0)}   frame ${fmt(frame.avg)} ms · p95 ${fmt(frame.p95)} · worst ${fmt(frame.max)}`,
    );
  } else {
    lines.push("idle — no frames (nothing is moving)");
  }
  const cpu = Object.entries(snap)
    .filter(([k]) => k.startsWith("cpu:"))
    .sort((a, b) => b[1].avg - a[1].avg);
  if (cpu.length) lines.push("main thread (ms, avg · p95)");
  for (const [k, s] of cpu) lines.push(`  ${k.slice(4).padEnd(16)} ${fmt(s.avg)} · ${fmt(s.p95)}`);
  const gpu = Object.entries(snap).filter(([k]) => k.startsWith("gpu:"));
  if (gpu.length) lines.push(`GPU (ms, ${gpuMode})`);
  for (const [k, s] of gpu) lines.push(`  ${k.slice(4).padEnd(16)} ${fmt(s.avg)} · ${fmt(s.p95)}`);
  panel.textContent = lines.join("\n");
}

/** Show the panel and publish window.__perf, if the readout is on. */
export function mountPerfPanel() {
  if (!perfEnabled() || typeof document === "undefined" || panel) return;
  panel = document.createElement("pre");
  panel.setAttribute("data-perf-panel", "");
  panel.setAttribute("aria-hidden", "true");
  Object.assign(panel.style, {
    position: "fixed",
    right: "8px",
    bottom: "8px",
    zIndex: "2147483647",
    margin: "0",
    padding: "8px 10px",
    font: "11px/1.35 ui-monospace, Menlo, Consolas, monospace",
    color: "#e8f3ee",
    background: "rgba(0, 0, 0, 0.72)",
    borderRadius: "6px",
    pointerEvents: "none",
    whiteSpace: "pre",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(panel);
  (window as unknown as { __perf?: () => Record<string, Stat> }).__perf = perfSnapshot;
  // Twice a second, on a timer: the panel must never keep the frame loop awake.
  window.setInterval(render, 500);
  render();
}
