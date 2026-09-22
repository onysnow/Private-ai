/* opsconsole UI — vanilla ES module, no build step.
 * Layout of this file:
 *   1. utils        esc(), DOM helpers, formatting, fuzzy match
 *   2. api          fetch wrapper: prefix + error envelope
 *   3. events       SSE client with polling fallback
 *   4. state        manifest, capabilities, nav badges
 *   5. components   toast, modal/confirm, drawer, grid, kv, diff, editor, tree, tabs, json
 *   6. router       hash router + section registry
 *   7. sections     overview, data, schema, query, api, users, backups, tests, logs, checks, config, activity
 *   8. shell        top bar, nav, palette, boot
 */

const CFG = Object.assign({prefix: "/api/console", ui: "/console", app: "App"}, window.OPSCONSOLE || {});

// ============================================================================
// 1. utils
// ============================================================================

const ESC = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"};
export function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}
const escAttr = esc;

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function frag(html) { const t = document.createElement("template"); t.innerHTML = html; return t.content; }
function setHTML(el, html) { el.innerHTML = html; return el; }
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isObj(v) { return v !== null && typeof v === "object"; }
function jsonStr(v, indent = 2) { try { return JSON.stringify(v, null, indent); } catch { return String(v); } }
function tryJSON(s) { try { return [JSON.parse(s), null]; } catch (e) { return [null, e.message]; } }
function fmtNum(n) { return typeof n === "number" ? n.toLocaleString() : (n ?? "—"); }
function fmtMs(ms) { if (ms === null || ms === undefined) return "—"; return ms < 1000 ? `${Math.round(ms * 10) / 10} ms` : `${(ms / 1000).toFixed(2)} s`; }
function fmtBytes(b) { if (b === null || b === undefined) return "—"; const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let n = b; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`; }
function fmtDur(s) { if (s === null || s === undefined) return "—"; s = Math.floor(s); const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return (d ? `${d}d ` : "") + `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; }
function fmtTs(v) {
  if (!v) return "—";
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function ago(v) {
  if (!v) return "—";
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (isNaN(s)) return String(v);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function truncate(s, n = 120) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function pkKey(pk) { return jsonStr(pk, 0); }
function pkParam(pk) { const vals = Object.values(pk || {}); return encodeURIComponent(vals.length === 1 ? String(vals[0]) : jsonStr(pk, 0)); }
function stateOf(s) { return ({ok: "ok", pass: "ok", passed: "ok", warn: "warn", warning: "warn", info: "info", fail: "fail", failed: "fail", error: "error", running: "warn", cancelled: "warn", pending: "warn"})[s] || "muted"; }
function chip(text, kind) { return `<span class="chip chip-${esc(kind || stateOf(text))}">${esc(text)}</span>`; }
function fuzzy(q, s) {
  // subsequence match; returns score (higher = better) or -1
  q = q.toLowerCase(); s = String(s).toLowerCase();
  if (!q) return 0;
  const idx = s.indexOf(q);
  if (idx >= 0) return 100 - idx - (s.length - q.length) * 0.1;
  let si = 0, score = 0, streak = 0;
  for (const ch of q) {
    const j = s.indexOf(ch, si);
    if (j < 0) return -1;
    streak = j === si ? streak + 1 : 0;
    score += 1 + streak * 2 - (j - si) * 0.2;
    si = j + 1;
  }
  return score;
}
function copyText(t) {
  try { return navigator.clipboard.writeText(t).then(() => true, () => false); } catch { return Promise.resolve(false); }
}
function download(name, text, mime = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type: mime}));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function toCSV(columns, rows) {
  const cell = (v) => { if (v === null || v === undefined) return ""; const s = isObj(v) ? jsonStr(v, 0) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map(cell).join(",")].concat(rows.map((r) => (Array.isArray(r) ? r : columns.map((c) => r[c])).map(cell).join(","))).join("\n");
}
function store(key, val) {
  try { if (val === undefined) return localStorage.getItem("opsconsole." + key); localStorage.setItem("opsconsole." + key, val); } catch { return null; }
  return val;
}

// ============================================================================
// 2. api
// ============================================================================

export class ApiError extends Error {
  constructor(status, code, message, requestId, detail) { super(message); this.status = status; this.code = code; this.requestId = requestId; this.detail = detail; }
}

function qs(query) {
  if (!query) return "";
  const p = new URLSearchParams();
  const add = (k, v) => { if (v === null || v === undefined || v === "") return; p.append(k, String(v)); };
  if (query instanceof URLSearchParams) query.forEach((v, k) => add(k, v));
  else for (const [k, v] of Object.entries(query)) { if (Array.isArray(v)) v.forEach((x) => add(k, x)); else add(k, v); }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  url(path, query) { return CFG.prefix + path + qs(query); },
  async request(method, path, {body, query, raw} = {}) {
    const headers = {Accept: "application/json"};
    let payload;
    if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(this.url(path, query), {method, headers, body: payload, credentials: "same-origin"});
    } catch (e) {
      throw new ApiError(0, "network", `network error: ${e.message}`, null);
    }
    const ctype = res.headers.get("content-type") || "";
    let data = null;
    if (raw) data = await res.text();
    else if (ctype.includes("json")) { try { data = await res.json(); } catch { data = null; } }
    else data = await res.text();
    if (!res.ok) {
      const env = isObj(data) && isObj(data.error) ? data.error : null;
      let message = env ? env.message : (isObj(data) ? (typeof data.detail === "string" ? data.detail : jsonStr(data.detail ?? data, 0)) : (data || res.statusText));
      const code = env ? env.code : `http_${res.status}`;
      throw new ApiError(res.status, code, truncate(message || `HTTP ${res.status}`, 600), env ? env.request_id : res.headers.get("x-request-id"), data);
    }
    return data;
  },
  get(path, query) { return this.request("GET", path, {query}); },
  post(path, body, query) { return this.request("POST", path, {body: body === undefined ? {} : body, query}); },
  put(path, body) { return this.request("PUT", path, {body}); },
  del(path) { return this.request("DELETE", path); },
};

// ============================================================================
// 3. events (SSE with polling fallback)
// ============================================================================

const KNOWN_EVENTS = ["hello", "gap", "activity", "changesets", "data", "checks", "config", "run:tests", "run:checks", "run:probes", "run:backup", "run:restore", "run:migration"];

export const events = {
  listeners: new Map(),
  es: null, failures: 0, mode: "off", pollTimer: null, extraTopics: new Set(), onMode: null,
  on(topic, fn) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic).add(fn);
    return () => this.listeners.get(topic)?.delete(fn);
  },
  emit(topic, data) {
    for (const fn of this.listeners.get(topic) || []) { try { fn(data, topic); } catch (e) { console.error("event handler", topic, e); } }
    for (const fn of this.listeners.get("*") || []) { try { fn(data, topic); } catch (e) { console.error("event handler *", e); } }
  },
  topics(extra = []) { extra.forEach((t) => this.extraTopics.add(t)); },
  connect() {
    if (typeof EventSource === "undefined") { this.setMode("poll"); return; }
    this.close();
    const es = new EventSource(api.url("/events", {topics: "*"}), {withCredentials: true});
    this.es = es;
    const names = KNOWN_EVENTS.concat(Array.from(this.extraTopics));
    for (const name of names) {
      es.addEventListener(name, (ev) => {
        let data = {}; try { data = JSON.parse(ev.data); } catch { data = {raw: ev.data}; }
        if (name === "hello") { this.failures = 0; this.setMode("live"); }
        this.emit(name, data);
      });
    }
    es.onopen = () => { this.failures = 0; this.setMode("live"); };
    es.onerror = () => {
      this.failures += 1;
      if (this.failures >= 3) { this.close(); this.setMode("poll"); setTimeout(() => this.retry(), 60000); }
    };
  },
  retry() { if (this.mode === "poll") { this.failures = 0; this.connect(); } },
  close() { if (this.es) { try { this.es.close(); } catch {} this.es = null; } },
  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    clearInterval(this.pollTimer); this.pollTimer = null;
    if (mode === "poll") this.pollTimer = setInterval(() => this.emit("poll", {}), 5000);
    if (this.onMode) this.onMode(mode);
  },
  get live() { return this.mode === "live"; },
};

// ============================================================================
// 4. state
// ============================================================================

const WRITE_CAPS = new Set(["changesets", "bulk", "write", "migrations.upgrade", "flags", "undo", "set_roles", "disable", "revoke", "issue_token", "create", "restore"]);

export const state = {
  manifest: null,
  badges: {running: new Set(), pending: 0, failing: 0},
  section(id) { return (this.manifest?.sections || []).find((s) => s.id === id) || null; },
  has(id) { return !!this.section(id); },
  caps(id) { return new Set(this.section(id)?.capabilities || []); },
  can(id, cap) {
    const s = this.section(id);
    if (!s || !s.capabilities.includes(cap)) return false;
    if (WRITE_CAPS.has(cap) && !this.manifest?.principal?.can_write) return false;
    return true;
  },
  get canWrite() { return !!this.manifest?.principal?.can_write; },
};

// ============================================================================
// 5. components
// ============================================================================

// ---- toast -----------------------------------------------------------------
let toastHost = null;
export function toast(message, {kind = "info", requestId = null, ms = 6000} = {}) {
  if (!toastHost) { toastHost = h("div", {class: "toasts"}); document.body.append(toastHost); }
  const el = h("div", {class: `toast toast-${kind}`}, message);
  if (requestId) el.append(h("span", {class: "rid", text: `request ${requestId}`}));
  el.addEventListener("click", () => el.remove());
  toastHost.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
export function toastError(err, prefix = "") {
  if (err instanceof ApiError) toast(`${prefix}${err.code}: ${err.message}`, {kind: err.status >= 500 ? "error" : "fail", requestId: err.requestId, ms: 9000});
  else toast(`${prefix}${err?.message || err}`, {kind: "error", ms: 9000});
  console.error(err);
}
// run an async action; errors go to a toast, never crash the section
export async function guard(fn, prefix = "") { try { return await fn(); } catch (e) { toastError(e, prefix); return undefined; } }

// ---- modal / confirm ---------------------------------------------------------
export function modal({title, body, buttons = [], wide = false, onClose}) {
  const back = h("div", {class: "modal-backdrop"});
  const box = h("div", {class: `modal${wide ? " modal-wide" : ""}`, role: "dialog", "aria-modal": "true"});
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey);
  const head = h("div", {class: "modal-head"}, h("span", {text: title}), h("button", {class: "btn btn-sm btn-ghost x", onclick: close, "aria-label": "close"}, "✕"));
  const bodyEl = h("div", {class: "modal-body"});
  if (typeof body === "string") bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  const foot = h("div", {class: "modal-foot"});
  for (const b of buttons) foot.append(h("button", {class: `btn ${b.class || ""}`, onclick: () => b.onClick && b.onClick(close), disabled: b.disabled}, b.label));
  box.append(head, bodyEl, foot);
  back.append(box);
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return {close, body: bodyEl, foot, box};
}

/** Confirm dialog that requires typing `expect` (the API's `confirm` value). Resolves true/false. */
export function confirmTyped({title = "Confirm", message = "", expect, verb = "Confirm", danger = true, extra = null}) {
  return new Promise((resolve) => {
    const input = h("input", {class: "input mono", placeholder: expect, autocomplete: "off", spellcheck: "false", style: "width:100%"});
    const okBtn = h("button", {class: `btn ${danger ? "btn-danger" : "btn-primary"}`, disabled: true}, verb);
    const body = h("div", {class: "col"},
      message ? h("div", {html: message}) : null,
      extra,
      h("div", {class: "field"}, h("label", {}, "Type ", h("code", {text: expect}), " to confirm"), input));
    const m = modal({title, body, onClose: () => resolve(false)});
    m.foot.append(h("button", {class: "btn", onclick: () => m.close()}, "Cancel"), okBtn);
    input.addEventListener("input", () => { okBtn.disabled = input.value.trim() !== expect; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !okBtn.disabled) okBtn.click(); });
    okBtn.addEventListener("click", () => { resolve(true); m.close(); });
    setTimeout(() => input.focus(), 30);
  });
}

// ---- loading / empty ---------------------------------------------------------
export function loading(text = "Loading…") { return h("div", {class: "loading"}, h("span", {class: "spinner"}), text); }
export function empty(text = "Nothing here.") { return h("div", {class: "empty", text}); }
export function errorBox(err) { return h("div", {class: "callout callout-fail"}, err instanceof ApiError ? `${err.code}: ${err.message}` : String(err?.message || err), err?.requestId ? h("div", {class: "small mono muted", text: `request ${err.requestId}`}) : null); }
/** Renders `fn()` (async, returns Node) into `el` with a loading state; API errors render inline + toast. */
export async function load(el, fn, {label} = {}) {
  clear(el).append(loading(label));
  try { const node = await fn(); clear(el); if (node) el.append(node); }
  catch (e) { clear(el).append(errorBox(e)); toastError(e); }
}
export function refreshBtn(fn, label = "Refresh") { return h("button", {class: "btn btn-sm", onclick: fn, title: "Refresh"}, "⟳ " + label); }

// ---- drawer (streaming run output) ------------------------------------------
export const drawer = {
  el: null, body: null, title: null, status: null, cancelBtn: null, meta: null,
  run: null, lines: new Map(), unsub: null, pollTimer: null, follow: true,
  init() {
    this.el = $("#drawer");
    this.body = $(".drawer-body", this.el);
    this.title = $(".drawer-title", this.el);
    this.status = $(".drawer-status", this.el);
    this.meta = $(".drawer-meta", this.el);
    this.cancelBtn = $(".drawer-cancel", this.el);
    $(".drawer-close", this.el).addEventListener("click", () => this.close());
    $(".drawer-clear", this.el).addEventListener("click", () => { this.lines.clear(); this.render(); });
    $(".drawer-copy", this.el).addEventListener("click", () => copyText(this.text()).then((ok) => toast(ok ? "Copied" : "Copy failed", {kind: ok ? "ok" : "warn"})));
    this.body.addEventListener("scroll", () => { this.follow = this.body.scrollTop + this.body.clientHeight >= this.body.scrollHeight - 8; });
    const grip = $(".drawer-resize", this.el);
    grip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startY = e.clientY, startH = this.el.getBoundingClientRect().height;
      const move = (ev) => { const hgt = Math.max(120, Math.min(window.innerHeight * 0.8, startH + (startY - ev.clientY))); this.el.style.height = hgt + "px"; };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    });
  },
  /** Track a supervised run. `run` is the status object returned by the start endpoint ({id, kind, status, tail, lines, ...}).
   *  opts: {title, statusUrl (polled every 1s while running), cancelUrl, onFinish(status, summary), onLine(line)} */
  track(run, opts = {}) {
    this.detach();
    this.run = run; this.opts = opts; this.lines.clear(); this.follow = true;
    this.title.textContent = opts.title || `${run.kind} ${run.id}`;
    this.meta.textContent = run.id;
    this.setStatus(run.status || "running");
    if (Array.isArray(run.tail)) { const total = run.lines || run.tail.length; run.tail.forEach((l, i) => this.lines.set(total - run.tail.length + i + 1, l)); }
    this.cancelBtn.classList.toggle("hidden", !opts.cancelUrl);
    this.cancelBtn.disabled = false;
    this.cancelBtn.onclick = () => guard(async () => { this.cancelBtn.disabled = true; await api.post(opts.cancelUrl); this.append(null, "[console] cancel requested"); });
    this.open();
    this.render();
    const topic = `run:${run.kind}`;
    this.unsub = events.on(topic, (d) => {
      if (!d || d.run_id !== run.id) return;
      if (d.line !== undefined) { this.append(d.n, d.line); if (opts.onLine) opts.onLine(d.line, d); }
      if (d.event === "finished") this.finish(d.status, d.summary);
    });
    if (opts.statusUrl) this.startPolling();
    else if (!events.live) this.append(null, "[console] live stream unavailable (SSE disconnected); this run has no status endpoint to poll");
  },
  startPolling() {
    clearInterval(this.pollTimer);
    const tick = async () => {
      if (!this.run || !this.opts?.statusUrl) return;
      try {
        const st = await api.get(this.opts.statusUrl, {tail: 400});
        if (Array.isArray(st.tail)) { const total = st.lines || st.tail.length; st.tail.forEach((l, i) => this.lines.set(total - st.tail.length + i + 1, l)); this.render(); }
        if (st.status && st.status !== "running") this.finish(st.status, st.summary, st);
      } catch (e) { /* transient; keep polling */ }
    };
    this.pollTimer = setInterval(tick, 1000);
    tick();
  },
  append(n, line) {
    if (n === null || n === undefined) n = (this.lines.size ? Math.max(...this.lines.keys()) : 0) + 0.5;
    this.lines.set(n, line);
    if (this.lines.size > 6000) { const keys = Array.from(this.lines.keys()).sort((a, b) => a - b).slice(0, 1000); keys.forEach((k) => this.lines.delete(k)); }
    this.renderLine(line);
  },
  lineClass(l) { const s = String(l); if (/^(FAIL|ERROR|Traceback|fail |error)/i.test(s) || /\bFAILED\b/.test(s)) return "fail"; if (/^(ok |PASSED|pass |passed)/i.test(s)) return "pass"; if (s.startsWith("[console]")) return "sys"; return ""; },
  renderLine(l) { this.body.append(h("div", {class: `ln ${this.lineClass(l)}`, text: l})); if (this.follow) this.body.scrollTop = this.body.scrollHeight; },
  render() { clear(this.body); const keys = Array.from(this.lines.keys()).sort((a, b) => a - b); for (const k of keys) this.body.append(h("div", {class: `ln ${this.lineClass(this.lines.get(k))}`, text: this.lines.get(k)})); if (this.follow) this.body.scrollTop = this.body.scrollHeight; },
  text() { return Array.from(this.lines.keys()).sort((a, b) => a - b).map((k) => this.lines.get(k)).join("\n"); },
  setStatus(s) { this.status.className = `chip chip-${esc(s)} drawer-status`; this.status.textContent = s; },
  finish(status, summary, full) {
    if (!this.run || this.run._done) return;
    this.run._done = true; this.run.status = status;
    clearInterval(this.pollTimer); this.pollTimer = null;
    this.setStatus(status);
    this.cancelBtn.classList.add("hidden");
    if (summary && (summary.line || summary.error)) this.append(null, `[console] ${summary.line || summary.error}`);
    state.badges.running.delete(this.run.kind); renderBadges();
    if (this.opts?.onFinish) { try { this.opts.onFinish(status, summary, full); } catch (e) { console.error(e); } }
  },
  detach() { if (this.unsub) this.unsub(); this.unsub = null; clearInterval(this.pollTimer); this.pollTimer = null; },
  open() { this.el.classList.add("open"); },
  close() { this.el.classList.remove("open"); },
  get isOpen() { return this.el.classList.contains("open"); },
};

// ---- grid (data table) --------------------------------------------------------
/** columns: [{key, label, kind, render(value,row)->string(html), sortable, num, mono, wrap, editable}]
 *  rows: array of objects or arrays (when `arrays` true, key = index).
 *  opts: {sort, order, onSort(key, order), onRow(row, i), selectable, isSelected(row), onSelect(row, checked, all?), onCellDblClick(row, col, td), rowClass(row), rowKey(row), pendingCell(row,col)} */
export function grid(columns, rows, opts = {}) {
  const table = h("table", {class: "grid"});
  const thead = h("thead"); const trh = h("tr");
  if (opts.selectable) {
    const all = h("input", {type: "checkbox", title: "select all on page"});
    all.addEventListener("change", () => opts.onSelect && opts.onSelect(null, all.checked, rows));
    trh.append(h("th", {class: "sel"}, all));
  }
  for (const c of columns) {
    const th = h("th", {class: c.sortable === false || !opts.onSort ? "" : "sortable", title: c.title || c.key});
    th.append(c.label ?? c.key);
    if (opts.sort === c.key) th.append(h("span", {class: "sort", text: opts.order === "asc" ? "▲" : "▼"}));
    if (c.sortable !== false && opts.onSort) th.addEventListener("click", () => opts.onSort(c.key, opts.sort === c.key && opts.order === "desc" ? "asc" : "desc"));
    trh.append(th);
  }
  thead.append(trh); table.append(thead);
  const tbody = h("tbody");
  rows.forEach((row, i) => {
    const tr = h("tr", {class: `${opts.onRow ? "clickable " : ""}${opts.rowClass ? opts.rowClass(row) : ""}${opts.isSelected && opts.isSelected(row) ? " selected" : ""}`});
    if (opts.selectable) {
      const cb = h("input", {type: "checkbox"});
      cb.checked = !!(opts.isSelected && opts.isSelected(row));
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => opts.onSelect && opts.onSelect(row, cb.checked));
      tr.append(h("td", {class: "sel"}, cb));
    }
    for (const c of columns) {
      const v = Array.isArray(row) ? row[c.key] : row[c.key];
      const td = h("td", {class: `${c.num ? "num " : ""}${c.mono ? "mono " : ""}${c.wrap ? "wrapcell " : ""}${c.editable ? "editable " : ""}${opts.pendingCell && opts.pendingCell(row, c) ? "pending" : ""}`});
      td.innerHTML = c.render ? c.render(v, row, i) : renderCell(v, c);
      if (!c.wrap && td.textContent.length > 0 && !c.render) td.title = td.textContent.slice(0, 500);
      if (opts.onCellDblClick && c.editable) td.addEventListener("dblclick", (e) => { e.stopPropagation(); opts.onCellDblClick(row, c, td); });
      tr.append(td);
    }
    if (opts.onRow) tr.addEventListener("click", (e) => { if (e.target.closest("a, button, input, select, textarea")) return; opts.onRow(row, i); });
    tbody.append(tr);
  });
  table.append(tbody);
  return table;
}

/** Cell renderer by column kind. Returns HTML (escaped). col: {kind, masked, ref:{table,column}, enum} */
export function renderCell(v, col = {}) {
  if (col.masked || v === "••••") return `<span class="masked">••••</span>`;
  if (v === null || v === undefined) return `<span class="null">null</span>`;
  const kind = col.kind || (typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : isObj(v) ? "json" : "text");
  if (col.ref && v !== "" && !isObj(v)) return `<a class="mono" href="#/data/${encodeURIComponent(col.ref.table)}/row/${encodeURIComponent(String(v))}" title="${escAttr(col.ref.table)}.${escAttr(col.ref.column)}">${esc(v)}</a>`;
  switch (kind) {
    case "boolean": return v ? `<span class="bool-t">✓ true</span>` : `<span class="bool-f">✗ false</span>`;
    case "json": return `<span class="mono" title="${escAttr(truncate(jsonStr(v, 0), 800))}">${esc(truncate(jsonStr(v, 0), 140))}</span>`;
    case "datetime": case "date": return `<span class="mono" title="${escAttr(v)}">${esc(String(v).replace("T", " ").replace(/\.\d+/, "").replace("+00:00", "Z"))}</span>`;
    case "integer": case "number": return `<span class="mono">${esc(v)}</span>`;
    case "binary": return `<span class="muted mono">${esc(truncate(String(v), 40))}</span>`;
    default: {
      if (isObj(v)) return `<span class="mono">${esc(truncate(jsonStr(v, 0), 140))}</span>`;
      const s = String(v);
      if (s === "") return `<span class="null">empty</span>`;
      return esc(truncate(s, 200));
    }
  }
}

// ---- key/value list ------------------------------------------------------------
export function kv(obj, {render, cls} = {}) {
  const dl = h("dl", {class: `kv ${cls || ""}`});
  for (const [k, v] of Object.entries(obj || {})) {
    dl.append(h("dt", {text: k}));
    const dd = h("dd");
    if (render) { const out = render(k, v, dd); if (out instanceof Node) dd.append(out); else if (typeof out === "string") dd.innerHTML = out; }
    else if (isObj(v)) dd.append(h("pre", {text: jsonStr(v)}));
    else dd.innerHTML = renderCell(v);
    dl.append(dd);
  }
  return dl;
}

// ---- diff viewer -----------------------------------------------------------------
export function diffView(before, after, changed) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  const box = h("div", {class: "diff"});
  box.append(h("div", {class: "diff-row diff-head"}, h("div", {class: "k", text: "column"}), h("div", {text: "before"}), h("div", {text: "after"})));
  const fmt = (v) => v === undefined ? "" : v === null ? "null" : isObj(v) ? jsonStr(v, 0) : String(v);
  for (const k of keys) {
    const b = before ? before[k] : undefined, a = after ? after[k] : undefined;
    const isChanged = changed ? changed.includes(k) : (!before || !after || jsonStr(b, 0) !== jsonStr(a, 0));
    const row = h("div", {class: `diff-row${isChanged ? " changed" : ""}`}, h("div", {class: "k", text: k}), h("div", {class: "b", text: fmt(b)}), h("div", {class: "a", text: fmt(a)}));
    box.append(row);
  }
  return box;
}

// ---- code editor (textarea + gutter + highlight overlay) -----------------------
const SQL_KW = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|INDEX|WITH|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|LIKE|ILIKE|BETWEEN|EXISTS|COUNT|SUM|AVG|MIN|MAX|ASC|DESC|EXPLAIN|ANALYZE|TRUE|FALSE|CAST|COALESCE|RETURNING|BEGIN|COMMIT|ROLLBACK|PRIMARY|KEY|REFERENCES|DEFAULT|VIEW|TRUNCATE)\b/gi;
function highlightSQL(src) {
  let out = "";
  const re = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'?)|("(?:[^"\\]|\\.)*"?)|(\b\d+(?:\.\d+)?\b)/g;
  let last = 0, m;
  const plain = (s) => esc(s).replace(SQL_KW, (w) => `<span class="kw">${w}</span>`);
  while ((m = re.exec(src))) {
    out += plain(src.slice(last, m.index));
    if (m[1]) out += `<span class="cmt">${esc(m[0])}</span>`;
    else if (m[2] || m[3]) out += `<span class="str">${esc(m[0])}</span>`;
    else out += `<span class="num">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += plain(src.slice(last));
  return out + "\n";
}
export function codeEditor({value = "", onRun, onChange, rows = 8, placeholder = ""} = {}) {
  const gutter = h("div", {class: "editor-gutter"});
  const hl = h("pre", {class: "editor-hl", "aria-hidden": "true"});
  const ta = h("textarea", {class: "editor-ta", spellcheck: "false", rows: String(rows), placeholder});
  ta.value = value;
  const area = h("div", {class: "editor-area"}, hl, ta);
  const el = h("div", {class: "editor"}, gutter, area);
  const sync = () => {
    hl.innerHTML = highlightSQL(ta.value);
    const n = ta.value.split("\n").length;
    gutter.textContent = Array.from({length: n}, (_, i) => i + 1).join("\n");
    hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop;
  };
  ta.addEventListener("input", () => { sync(); if (onChange) onChange(ta.value); });
  ta.addEventListener("scroll", () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; });
  ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (onRun) onRun(ta.value); }
    if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart, t = ta.selectionEnd; ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(t); ta.selectionStart = ta.selectionEnd = s + 2; sync(); }
  });
  sync();
  return {el, get: () => ta.value, set: (v) => { ta.value = v; sync(); }, focus: () => ta.focus(), textarea: ta};
}

// ---- tree ------------------------------------------------------------------------
/** items: [{id, kind, parent, title}] ; opts: {checked:Set, onChange(), status: Map(id->'passed'|'failed')} */
export function tree(items, opts = {}) {
  const byParent = new Map();
  for (const it of items) { const p = it.parent || null; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(it); }
  const checked = opts.checked || new Set();
  const collapsed = opts.collapsed || new Set();
  const root = h("div", {class: "tree"});
  const descendants = (id) => { const out = []; const walk = (x) => { for (const c of byParent.get(x) || []) { out.push(c); walk(c.id); } }; walk(id); return out; };
  const build = (parentId, container) => {
    for (const it of byParent.get(parentId) || []) {
      const kids = byParent.get(it.id) || [];
      const cb = h("input", {type: "checkbox"});
      cb.checked = checked.has(it.id);
      cb.addEventListener("change", () => {
        const all = [it, ...descendants(it.id)];
        for (const x of all) { if (cb.checked) checked.add(x.id); else checked.delete(x.id); }
        render();
        if (opts.onChange) opts.onChange(checked);
      });
      const tw = h("span", {class: "tw", text: kids.length ? (collapsed.has(it.id) ? "▸" : "▾") : ""});
      tw.addEventListener("click", () => { if (collapsed.has(it.id)) collapsed.delete(it.id); else collapsed.add(it.id); render(); });
      const st = opts.status?.get(it.id);
      const node = h("div", {class: `tree-node kind-${it.kind}`}, tw, cb, h("span", {class: st ? `st-${st}` : "", text: it.title || it.id, title: it.id}), st ? h("span", {class: `chip chip-${st}`, text: st}) : null);
      container.append(node);
      if (kids.length && !collapsed.has(it.id)) { const ch = h("div", {class: "tree-children"}); build(it.id, ch); container.append(ch); }
    }
  };
  const render = () => { clear(root); build(null, root); };
  render();
  return {el: root, checked, render, collapsed};
}

// ---- tabs ------------------------------------------------------------------------
export function tabs(items, active, onChange) {
  const el = h("div", {class: "tabs", role: "tablist"});
  for (const it of items) {
    const b = h("button", {class: `tab${it.id === active ? " active" : ""}`, role: "tab", onclick: () => onChange(it.id)}, it.label);
    if (it.badge) b.append(" ", h("span", {class: "badge", text: it.badge}));
    el.append(b);
  }
  return el;
}

// ---- json / misc -------------------------------------------------------------------
export function jsonView(v, {maxHeight} = {}) { const pre = h("pre", {class: "json-view mono", text: typeof v === "string" ? v : jsonStr(v)}); if (maxHeight) pre.style.maxHeight = maxHeight; return pre; }
export function detailsBlock(summary, node, open = false) { const d = h("details", {open}); d.append(h("summary", {text: summary}), node); return d; }
export function badgeCount(n, cls) { return n ? `<span class="badge ${cls || ""}">${esc(n)}</span>` : ""; }

// ============================================================================
// 6. router
// ============================================================================

const SECTIONS = {};   // id -> factory() -> {mount(el, route), update?(route), unmount?(), refresh?()}
const router = {
  current: null, currentId: null, el: null,
  parse() {
    const raw = location.hash.replace(/^#\/?/, "");
    const qi = raw.indexOf("?");
    const path = qi >= 0 ? raw.slice(0, qi) : raw;
    const query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : "");
    const parts = path.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
    return {section: parts[0] || "overview", parts: parts.slice(1), query, raw};
  },
  go(hash) { if (!hash.startsWith("#")) hash = "#" + hash; if (location.hash === hash) this.dispatch(); else location.hash = hash; },
  async dispatch() {
    const r = this.parse();
    if (!state.has(r.section) || !SECTIONS[r.section]) {
      const first = state.manifest.sections[0]?.id || "overview";
      if (r.section !== first) { location.replace(`#/${first}`); return; }
    }
    $$(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.id === r.section));
    if (this.currentId === r.section && this.current?.update) { try { this.current.update(r); } catch (e) { toastError(e); } return; }
    if (this.current?.unmount) { try { this.current.unmount(); } catch (e) { console.error(e); } }
    this.current = SECTIONS[r.section] ? SECTIONS[r.section]() : null; this.currentId = r.section;
    clear(this.el);
    const el = h("div", {class: `section section-${r.section}`});
    this.el.append(el);
    this.el.scrollTop = 0;
    if (this.current) { try { await this.current.mount(el, r); } catch (e) { clear(el).append(errorBox(e)); toastError(e); } }
  },
  refresh() { if (this.current?.refresh) { try { this.current.refresh(); } catch (e) { toastError(e); } } else this.dispatch(); },
  setQuery(patch) {
    const r = this.parse();
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === "") r.query.delete(k); else r.query.set(k, v); }
    const q = r.query.toString();
    this.go(`#/${[r.section, ...r.parts].map(encodeURIComponent).join("/")}${q ? "?" + q : ""}`);
  },
};

function sectionHead(title, ...extra) {
  const head = h("div", {class: "section-head"});
  head.append(typeof title === "string" ? h("h1", {text: title}) : title);
  head.append(...extra.filter(Boolean));
  return head;
}
function crumbs(...items) {
  const el = h("h1", {class: "row"});
  items.forEach((it, i) => { if (i) el.append(h("span", {class: "faint", text: "/"})); el.append(it.href ? h("a", {href: it.href, text: it.text}) : h("span", {text: it.text})); });
  return el;
}

// ============================================================================
// 7. sections
// ============================================================================

// ---- Overview ----------------------------------------------------------------
SECTIONS.overview = function overviewSection() {
  let root, tilesEl, overallEl, serverEl, timer, unsubs = [], tiles = [], openDetails = new Set(), lastFetch = new Map();
  const canChecks = state.has("checks"), canTests = state.has("tests");
  function tileNode(t) {
    const el = h("div", {class: `tile tile-${t.state}`, dataset: {id: t.id}});
    el.innerHTML = `<div class="tile-head"><span class="dot dot-${esc(t.state)}"></span><a href="#/${esc(t.section || "overview")}">${esc(t.title)}</a><span class="grow"></span>${chip(t.state)}<span class="faint small">${esc(t.ms)}ms</span></div><div class="tile-headline">${esc(t.headline)}</div>`;
    if (t.details && Object.keys(t.details).length) {
      const d = h("details", {open: openDetails.has(t.id)}); d.append(h("summary", {text: "details"}), h("pre", {text: jsonStr(t.details)}));
      d.addEventListener("toggle", () => { if (d.open) openDetails.add(t.id); else openDetails.delete(t.id); });
      el.append(d);
    }
    return el;
  }
  function renderTiles() {
    clear(tilesEl);
    if (!tiles.length) tilesEl.append(empty("No health tiles."));
    tiles.forEach((t) => tilesEl.append(tileNode(t)));
  }
  async function loadBoard(only) {
    try {
      const board = await api.get("/health", only ? {tiles: only.join(",")} : undefined);
      const now = Date.now();
      if (only) { for (const t of board.tiles) { const i = tiles.findIndex((x) => x.id === t.id); if (i >= 0) tiles[i] = t; else tiles.push(t); lastFetch.set(t.id, now); } }
      else { tiles = board.tiles; tiles.forEach((t) => lastFetch.set(t.id, now)); }
      const worst = tiles.reduce((w, t) => (({ok: 0, warn: 1, fail: 2, error: 3})[t.state] ?? 3) > (({ok: 0, warn: 1, fail: 2, error: 3})[w] ?? 0) ? t.state : w, "ok");
      overallEl.innerHTML = `${chip(worst)} <span class="muted small">at ${esc(fmtTs(board.at))}</span>`;
      renderTiles();
    } catch (e) { clear(tilesEl).append(errorBox(e)); }
  }
  async function loadServer() {
    await load(serverEl, async () => {
      const m = await api.get("/health/server");
      const wrap = h("div", {class: "split"});
      const disks = h("div");
      for (const [label, d] of Object.entries(m.disks || {})) {
        disks.append(h("div", {class: "small"}, h("b", {text: label}), ` ${d.path || ""} — `, d.error ? h("span", {class: "chip chip-fail", text: d.error}) : `${d.free_gb} GB free of ${d.total_gb} GB (${d.used_pct}% used)`));
        if (!d.error) { const p = h("div", {class: "progress"}); p.append(h("div", {style: `width:${Math.min(100, d.used_pct || 0)}%`})); disks.append(p); }
      }
      wrap.append(kv({uptime: fmtDur(m.uptime_seconds), started: fmtTs(m.started_at), pid: m.pid, "RSS MB": m.rss_mb ?? "—", "CPU %": m.cpu_percent ?? "— (psutil missing)", load: (m.load_average || []).join(" / ") || "—", threads: m.threads, "cpu count": m.cpu_count}),
        h("div", {class: "col"}, kv({python: m.python, platform: m.platform, docker: m.in_docker ? "yes" : "no"}), h("h3", {text: "Disks"}), disks));
      return wrap;
    });
  }
  function tick() { const due = tiles.filter((t) => Date.now() - (lastFetch.get(t.id) || 0) >= Math.max(5, t.refresh_seconds || 30) * 1000).map((t) => t.id); if (due.length) loadBoard(due); }
  return {
    async mount(el) {
      root = el;
      overallEl = h("span");
      const btns = [];
      if (canChecks) btns.push(h("button", {class: "btn", onclick: () => guard(async () => { const run = await api.post("/checks/run", {}); startRunUI(run, {title: "Checks", statusUrl: `/checks/runs/${run.id}`}); })}, "▶ Run all checks"));
      if (canTests) btns.push(h("button", {class: "btn", onclick: () => guard(async () => { const run = await api.post("/tests/run", {selection: null}); startRunUI(run, {title: "Tests", statusUrl: `/tests/runs/${run.id}`, cancelUrl: `/tests/runs/${run.id}/cancel`}); })}, "▶ Run tests"));
      root.append(sectionHead("Overview", overallEl, ...btns, refreshBtn(() => { loadBoard(); loadServer(); })));
      tilesEl = h("div", {class: "tiles"}); root.append(tilesEl);
      const links = Object.entries(state.manifest.links || {});
      serverEl = h("div", {class: "card-body"});
      root.append(h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Server"})), serverEl));
      if (links.length) root.append(h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Links"})), h("div", {class: "card-body row"}, ...links.map(([k, v]) => h("a", {href: v, target: "_blank", rel: "noopener", class: "btn btn-sm"}, `${k} ↗`)))));
      const m = state.manifest;
      root.append(h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Console"})), h("div", {class: "card-body"}, kv({app: `${m.app_name} ${m.app_version || ""}`, console: m.console_version, writes: m.writes, store: m.store, principal: `${m.principal.label} (${m.principal.id})${m.principal.is_local ? " · local" : ""}`, roles: (m.principal.roles || []).join(", ") || "—", "can write": m.principal.can_write ? "yes" : "no", database: m.database_label || "—", events: events.mode}))));
      clear(tilesEl).append(loading("Loading health…"));
      loadBoard(); loadServer();
      timer = setInterval(tick, 5000);
      const soft = debounce(() => loadBoard(), 800);
      ["run:checks", "run:tests", "run:migration", "run:backup", "run:restore", "changesets", "data", "poll"].forEach((t) => unsubs.push(events.on(t, (d) => { if (t.startsWith("run:") && d?.event !== "finished") return; soft(); })));
    },
    unmount() { clearInterval(timer); unsubs.forEach((u) => u()); },
    refresh() { loadBoard(); loadServer(); },
  };
};

/** Common: start a supervised run in the drawer and mark the nav badge. */
function startRunUI(run, opts) {
  state.badges.running.add(run.kind); renderBadges();
  drawer.track(run, {...opts, onFinish: (status, summary, full) => { state.badges.running.delete(run.kind); renderBadges(); toast(`${opts.title || run.kind}: ${status}${summary?.line ? " — " + summary.line : ""}`, {kind: stateOf(status)}); if (opts.onFinish) opts.onFinish(status, summary, full); }});
}

// ---- Data ----------------------------------------------------------------------
const dataPending = new Map();   // table -> Map(key -> op) ; survives navigation
function pendingOps(table) { if (!dataPending.has(table)) dataPending.set(table, new Map()); return dataPending.get(table); }
const dataCache = {tables: null, detail: new Map()};
async function getTables(force) { if (!dataCache.tables || force) dataCache.tables = await api.get("/data/tables"); return dataCache.tables; }
async function getDetail(name, force) { if (!dataCache.detail.has(name) || force) dataCache.detail.set(name, await api.get(`/data/tables/${encodeURIComponent(name)}`)); return dataCache.detail.get(name); }
const FILTER_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "like", "in", "null", "notnull"];
function filterHref(f) { const i = String(f).indexOf("="); return i < 0 ? "" : `${encodeURIComponent(f.slice(0, i))}=${encodeURIComponent(f.slice(i + 1))}`; }
function decodeCursor(c) { try { return JSON.parse(atob(c.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; } }

/** Editor input for a column kind; returns {el, value()} — value() returns [ok, value]. */
function cellInput(col, current) {
  const kind = col.kind;
  let el;
  if (kind === "boolean") { el = h("select", {class: "select input-sm cell-edit"}, h("option", {value: "true", text: "true"}), h("option", {value: "false", text: "false"}), h("option", {value: "", text: "null"})); el.value = current === null || current === undefined ? "" : String(!!current); }
  else if (kind === "enum" && col.enum?.length) { el = h("select", {class: "select input-sm cell-edit"}, ...col.enum.map((e) => h("option", {value: e, text: e})), h("option", {value: "\u0000null", text: "null"})); el.value = current === null ? "\u0000null" : String(current); }
  else if (kind === "json" || (typeof current === "string" && current.length > 60)) { el = h("textarea", {class: "input input-sm cell-edit", rows: "3"}); el.value = current === null || current === undefined ? "" : (isObj(current) ? jsonStr(current, 0) : String(current)); }
  else { el = h("input", {class: "input input-sm cell-edit", type: kind === "integer" || kind === "number" ? "text" : "text"}); el.value = current === null || current === undefined ? "" : (isObj(current) ? jsonStr(current, 0) : String(current)); }
  const value = () => {
    const raw = el.value;
    if (kind === "boolean") return [true, raw === "" ? null : raw === "true"];
    if (kind === "enum" && col.enum?.length) return [true, raw === "\u0000null" ? null : raw];
    if (raw === "") return [true, col.nullable ? null : ""];
    if (kind === "integer") { const n = Number(raw); return Number.isInteger(n) ? [true, n] : [false, `${col.name}: expected an integer`]; }
    if (kind === "number") { const n = Number(raw); return Number.isFinite(n) ? [true, n] : [false, `${col.name}: expected a number`]; }
    if (kind === "json") { const [v, err] = tryJSON(raw); return err ? [false, `${col.name}: invalid JSON (${err})`] : [true, v]; }
    return [true, raw];
  };
  return {el, value};
}

SECTIONS.data = function dataSection() {
  let root, route, unsubs = [], liveTimer = null, cursorStacks = new Map(), selected = new Map(), view = null;
  const canCS = state.can("data", "changesets"), canBulk = state.can("data", "bulk");

  // --- list of tables ---
  async function renderList() {
    clear(root);
    const search = h("input", {class: "input", placeholder: "filter tables…", value: route.query.get("q") || ""});
    const body = h("div");
    const pendingLink = canCS ? h("a", {class: "btn btn-sm", href: "#/data/changesets"}, "Pending change-sets ", h("span", {class: "badge badge-pending", text: String(state.badges.pending || 0)})) : null;
    root.append(sectionHead("Data", search, pendingLink, refreshBtn(() => draw(true))), body);
    let data;
    const draw = async (force) => {
      await load(body, async () => {
        data = await getTables(force);
        const q = search.value.trim().toLowerCase();
        const items = data.items.filter((t) => !q || t.name.toLowerCase().includes(q) || (t.domain || "").toLowerCase().includes(q));
        if (!items.length) return empty(data.items.length ? "No tables match." : "No tables are modeled.");
        const groups = new Map();
        for (const t of items) { const d = t.domain || "(no domain)"; if (!groups.has(d)) groups.set(d, []); groups.get(d).push(t); }
        const wrap = h("div", {class: "grid-wrap"});
        const table = h("table", {class: "grid"});
        table.append(h("thead", {}, h("tr", {}, ...["table", "rows", "columns", "primary key", "references", "referenced by", ""].map((x) => h("th", {text: x})))));
        const tb = h("tbody");
        for (const [domain, ts] of Array.from(groups.entries()).sort()) {
          tb.append(h("tr", {class: "group"}, h("td", {colspan: "7", text: `${domain} · ${ts.length}`})));
          for (const t of ts.sort((a, b) => a.name.localeCompare(b.name))) {
            const tr = h("tr", {class: "clickable", onclick: (e) => { if (!e.target.closest("a")) router.go(`#/data/${encodeURIComponent(t.name)}`); }});
            tr.innerHTML = `<td class="mono"><a href="#/data/${encodeURIComponent(t.name)}">${esc(t.name)}</a> ${t.readonly ? chip("readonly", "muted") : ""}${t.live ? "" : chip("missing in db", "fail")}</td><td class="num">${esc(fmtNum(t.rows))}${t.estimated ? '<span class="faint" title="estimated">~</span>' : ""}</td><td class="num">${esc(t.columns)}</td><td class="mono">${esc((t.primary_key || []).join(", "))}</td><td class="mono muted">${esc((t.references || []).join(", "))}</td><td class="mono muted">${esc((t.referenced_by || []).join(", "))}</td><td><a href="#/schema/${encodeURIComponent(t.name)}" class="small">schema</a></td>`;
            tb.append(tr);
          }
        }
        table.append(tb); wrap.append(table);
        const out = h("div", {}, wrap);
        if (data.extra_tables?.length) out.append(h("div", {class: "callout callout-warn", style: "margin-top:12px"}, `Tables in the database but not in the models: `, h("span", {class: "mono", text: data.extra_tables.join(", ")})));
        return out;
      });
    };
    search.addEventListener("input", debounce(() => draw(false), 150));
    await draw(false);
  }

  // --- change-set list ---
  async function renderChangesets() {
    clear(root);
    const status = h("select", {class: "select"}, ...["pending", "applied", "rejected", "discarded", "expired", ""].map((s) => h("option", {value: s, text: s || "all"})));
    status.value = route.query.get("status") ?? "pending";
    const body = h("div");
    root.append(sectionHead(crumbs({text: "Data", href: "#/data"}, {text: "Change-sets"}), status, refreshBtn(() => draw())), body);
    const draw = () => load(body, async () => {
      const r = await api.get("/data/changesets", {status: status.value || undefined, limit: 200});
      if (!r.items.length) return empty(`No ${status.value || ""} change-sets.`);
      const wrap = h("div", {class: "grid-wrap"});
      wrap.append(grid([
        {key: "id", label: "id", render: (v, row) => `<a class="mono" href="#/data/${encodeURIComponent(row.target_table)}/changeset/${encodeURIComponent(v)}">${esc(v)}</a>`},
        {key: "status", render: (v) => chip(v)}, {key: "target_table", label: "table", mono: true}, {key: "ops", label: "ops", render: (v) => esc(v?.length ?? 0), num: true},
        {key: "origin"}, {key: "principal_id", label: "by", mono: true}, {key: "created_at", label: "created", render: (v) => esc(fmtTs(v))}, {key: "expires_at", label: "expires", render: (v) => esc(fmtTs(v))}, {key: "error", render: (v) => v ? `<span class="chip chip-fail">${esc(truncate(v, 80))}</span>` : ""},
      ], r.items));
      return wrap;
    });
    status.addEventListener("change", () => { router.setQuery({status: status.value}); });
    await draw();
  }

  // --- pending panel + change-set preview ---
  function pendingPanel(table, detail, onChanged) {
    const ops = pendingOps(table);
    const panel = h("div", {class: "cs-panel"});
    const render = () => {
      clear(panel);
      if (!ops.size) { panel.classList.add("hidden"); return; }
      panel.classList.remove("hidden");
      const head = h("div", {class: "card-head"}, h("b", {text: `${ops.size} pending operation${ops.size > 1 ? "s" : ""} on ${table}`}), h("span", {class: "muted small", text: "not yet sent — preview to see before/after"}), h("span", {class: "grow"}),
        h("button", {class: "btn btn-primary btn-sm", onclick: () => preview()}, "Preview change-set"),
        h("button", {class: "btn btn-sm", onclick: () => { ops.clear(); render(); onChanged && onChanged(); }}, "Discard all"));
      panel.append(head);
      const list = h("div", {class: "list-scroll"});
      for (const [key, op] of ops) {
        const desc = op.op === "insert" ? `insert ${truncate(jsonStr(op.set, 0), 160)}` : op.op === "delete" ? `delete ${pkKey(op.pk)}` : `update ${pkKey(op.pk)} set ${truncate(jsonStr(op.set, 0), 160)}`;
        list.append(h("div", {class: "cs-op row"}, h("span", {html: chip(op.op, op.op === "delete" ? "fail" : op.op === "insert" ? "ok" : "warn")}), h("span", {class: "mono grow truncate", text: desc, title: desc}), h("button", {class: "btn btn-sm btn-ghost", onclick: () => { ops.delete(key); render(); onChanged && onChanged(); }}, "✕")));
      }
      panel.append(list);
    };
    const preview = () => guard(async () => {
      const cs = await api.post("/data/changesets", {table, ops: Array.from(ops.values())});
      showChangeset(cs, table, {onApplied: () => { ops.clear(); render(); onChanged && onChanged(true); }});
    });
    render();
    return {el: panel, render};
  }

  function showChangeset(cs, table, {onApplied, onDiscard} = {}) {
    const body = h("div", {class: "col"});
    const errs = cs.errors ?? cs.ops.filter((o) => o.error).length, warns = cs.warnings ?? cs.ops.reduce((n, o) => n + (o.warnings || []).length, 0);
    body.append(h("div", {class: "row"}, h("span", {html: chip(cs.status)}), h("code", {text: cs.id}), h("span", {class: "muted", text: `${cs.ops.length} op(s) on ${cs.target_table} · origin ${cs.origin} · by ${cs.principal_id}`}), cs.undoes ? h("span", {class: "chip chip-info", text: `undoes ${cs.undoes}`}) : null,
      errs ? h("span", {class: "chip chip-fail", text: `${errs} error(s)`}) : null, warns ? h("span", {class: "chip chip-warn", text: `${warns} warning(s)`}) : null, cs.expires_at ? h("span", {class: "faint small", text: `expires ${fmtTs(cs.expires_at)}`}) : null));
    if (cs.error) body.append(h("div", {class: "callout callout-fail", text: cs.error}));
    const list = h("div", {class: "list-scroll", style: "max-height:55vh"});
    for (const op of cs.ops) {
      const box = h("div", {class: "cs-op"});
      box.append(h("div", {class: "row"}, h("span", {html: chip(op.op, op.op === "delete" ? "fail" : op.op === "insert" ? "ok" : "warn")}), h("code", {text: op.pk ? pkKey(op.pk) : "(new row)"}), op.changed?.length ? h("span", {class: "muted small", text: `changed: ${op.changed.join(", ")}`}) : null));
      if (op.error) box.append(h("div", {class: "err", text: `✗ ${op.error}`}));
      for (const w of op.warnings || []) box.append(h("div", {class: "wrn", text: `⚠ ${w}`}));
      if (op.op === "update" && op.before) box.append(diffView(op.before, op.after, op.changed));
      else if (op.op === "insert") box.append(diffView(null, op.after || op.set));
      else if (op.op === "delete" && op.before) box.append(diffView(op.before, null));
      list.append(box);
    }
    body.append(list);
    const buttons = [];
    const m = modal({title: `Change-set ${cs.id}`, body, wide: true});
    const applyBtn = h("button", {class: "btn btn-primary", disabled: cs.status !== "pending" || errs > 0 || !canCS}, "Apply…");
    applyBtn.addEventListener("click", async () => {
      const ok = await confirmTyped({title: "Apply change-set", message: `Apply <b>${esc(cs.ops.length)}</b> operation(s) to <code>${esc(cs.target_table)}</code>. Rows are guarded against concurrent change.`, expect: cs.id, verb: "Apply"});
      if (!ok) return;
      await guard(async () => {
        const r = await api.post(`/data/changesets/${encodeURIComponent(cs.id)}/apply`, {confirm: cs.id});
        toast(`Applied ${r.applied} operation(s) to ${cs.target_table}`, {kind: "ok"});
        m.close(); onApplied && onApplied(r);
      });
    });
    const discardBtn = h("button", {class: "btn", disabled: !["pending", "rejected", "expired"].includes(cs.status) || !canCS}, "Discard");
    discardBtn.addEventListener("click", () => guard(async () => { await api.post(`/data/changesets/${encodeURIComponent(cs.id)}/discard`); toast("Change-set discarded", {kind: "info"}); m.close(); onDiscard && onDiscard(); }));
    m.foot.append(h("button", {class: "btn", onclick: () => m.close()}, "Close"), discardBtn, applyBtn);
    return m;
  }

  // --- table view ---
  async function renderTable(name, opts = {}) {
    clear(root);
    const q = route.query;
    const filters = []; q.forEach((v, k) => { const m = /^filter\[(.+)\]$/.exec(k); if (m) { const i = v.indexOf(":"); const op = i >= 0 ? v.slice(0, i) : "eq"; filters.push(FILTER_OPS.includes(op) ? {column: m[1], op, value: i >= 0 ? v.slice(i + 1) : v} : {column: m[1], op: "eq", value: v}); } });
    const params = {limit: Number(q.get("limit")) || 50, sort: q.get("sort") || undefined, order: q.get("order") || undefined, cursor: q.get("cursor") || undefined, offset: Number(q.get("offset")) || undefined, q: q.get("q") || undefined};
    const filterQuery = {}; filters.forEach((f) => { filterQuery[`filter[${f.column}]`] = ["null", "notnull"].includes(f.op) ? f.op : `${f.op}:${f.value}`; });
    const viewKey = jsonStr([name, params.sort, params.order, params.q, filterQuery, params.limit], 0);
    if (!cursorStacks.has(viewKey)) cursorStacks.set(viewKey, []);
    const stack = cursorStacks.get(viewKey);
    if (!selected.has(name)) selected.set(name, new Map());
    const sel = selected.get(name);

    const head = h("div"); const bar = h("div", {class: "card"}); const gridEl = h("div"); const pager = h("div", {class: "pager"}); const panelHost = h("div");
    root.append(head, bar, gridEl, pager, panelHost);
    clear(gridEl).append(loading());
    let detail;
    try { detail = await getDetail(name); } catch (e) { clear(gridEl).append(errorBox(e)); toastError(e); return; }
    const editable = canCS && !detail.readonly;
    const pkCols = detail.primary_key || [];
    const colByName = Object.fromEntries(detail.columns.map((c) => [c.name, c]));

    // head
    const liveBtn = h("button", {class: `btn btn-sm${route.query.get("live") ? " on" : ""}`, title: "poll every 5 s"}, "● Live");
    liveBtn.addEventListener("click", () => { router.setQuery({live: route.query.get("live") ? "" : "1"}); });
    const exportQ = {...filterQuery, q: params.q};
    head.append(sectionHead(crumbs({text: "Data", href: "#/data"}, {text: name}),
      h("span", {html: `${detail.readonly ? chip("readonly", "muted") : ""}${detail.live ? "" : chip("missing in db", "fail")}${detail.domain ? `<span class="muted small">${esc(detail.domain)}</span>` : ""}`}),
      h("a", {class: "btn btn-sm", href: `#/schema/${encodeURIComponent(name)}`}, "Schema"),
      h("a", {class: "btn btn-sm", href: api.url(`/data/tables/${encodeURIComponent(name)}/export`, {...exportQ, fmt: "csv"}), target: "_blank"}, "⇩ CSV"),
      h("a", {class: "btn btn-sm", href: api.url(`/data/tables/${encodeURIComponent(name)}/export`, {...exportQ, fmt: "json"}), target: "_blank"}, "⇩ JSON"),
      editable ? h("button", {class: "btn btn-sm btn-primary", onclick: () => newRowForm()}, "+ New row") : null,
      liveBtn, refreshBtn(() => loadRows())));
    if (detail.doc) head.append(h("div", {class: "muted", style: "margin:-6px 0 10px", text: detail.doc}));

    // filter bar
    const qInput = h("input", {class: "input", placeholder: "search text columns…", value: params.q || ""});
    qInput.addEventListener("keydown", (e) => { if (e.key === "Enter") router.setQuery({q: qInput.value, cursor: "", offset: ""}); });
    const colSel = h("select", {class: "select input-sm"}, ...detail.columns.filter((c) => !c.masked).map((c) => h("option", {value: c.name, text: c.name})));
    const opSel = h("select", {class: "select input-sm"}, ...FILTER_OPS.map((o) => h("option", {value: o, text: o})));
    const valIn = h("input", {class: "input input-sm", placeholder: "value (comma-separated for in)"});
    const addF = () => { const op = opSel.value; if (!["null", "notnull"].includes(op) && valIn.value === "") { valIn.focus(); return; } router.setQuery({[`filter[${colSel.value}]`]: ["null", "notnull"].includes(op) ? op : `${op}:${valIn.value}`, cursor: "", offset: ""}); };
    valIn.addEventListener("keydown", (e) => { if (e.key === "Enter") addF(); });
    opSel.addEventListener("change", () => { valIn.disabled = ["null", "notnull"].includes(opSel.value); });
    const chips = h("div", {class: "filter-bar"});
    for (const f of filters) chips.append(h("span", {class: "filter-chip"}, `${f.column} ${f.op}${["null", "notnull"].includes(f.op) ? "" : " " + f.value}`, h("button", {title: "remove", onclick: () => router.setQuery({[`filter[${f.column}]`]: "", cursor: "", offset: ""})}, "✕")));
    if (params.q) chips.append(h("span", {class: "filter-chip"}, `q: ${params.q}`, h("button", {onclick: () => router.setQuery({q: "", cursor: "", offset: ""})}, "✕")));
    const selBar = h("div", {class: "row hidden"});
    bar.append(h("div", {class: "card-body row"}, qInput, h("span", {class: "sep"}), colSel, opSel, valIn, h("button", {class: "btn btn-sm", onclick: addF}, "+ filter"), chips, h("span", {class: "grow"}), selBar));

    // selection bar
    const renderSelBar = () => {
      clear(selBar);
      const n = sel.size;
      const byFilter = !n && (filters.length || params.q);
      selBar.classList.toggle("hidden", !(canBulk && !detail.readonly && (n || byFilter)));
      if (selBar.classList.contains("hidden")) return;
      selBar.append(h("span", {class: "muted small", text: n ? `${n} selected` : "matching rows"}));
      const target = () => n ? {pks: Array.from(sel.values())} : {filters: Object.fromEntries(filters.map((f) => [f.column, ["null", "notnull"].includes(f.op) ? f.op : `${f.op}:${f.value}`])), q: params.q || null};
      selBar.append(h("button", {class: "btn btn-sm", onclick: () => bulkUpdate(target())}, n ? "Update selected…" : "Update all matching…"));
      selBar.append(h("button", {class: "btn btn-sm btn-danger", onclick: () => bulk({op: "delete", ...target()})}, n ? "Delete selected" : "Delete all matching"));
      if (n) selBar.append(h("button", {class: "btn btn-sm btn-ghost", onclick: () => { sel.clear(); loadRows(); }}, "clear"));
    };
    const bulk = (body) => guard(async () => { const cs = await api.post(`/data/tables/${encodeURIComponent(name)}/bulk`, body); showChangeset(cs, name, {onApplied: () => { sel.clear(); loadRows(); }}); });
    const bulkUpdate = (target) => {
      const cols = detail.columns.filter((c) => !c.masked && !c.primary_key);
      const cSel = h("select", {class: "select"}, ...cols.map((c) => h("option", {value: c.name, text: `${c.name} (${c.kind})`})));
      let inp = cellInput(cols[0], null);
      const holder = h("div", {}, inp.el);
      cSel.addEventListener("change", () => { inp = cellInput(colByName[cSel.value], null); clear(holder).append(inp.el); });
      const m = modal({title: "Bulk update", body: h("div", {class: "col"}, h("div", {class: "field"}, h("label", {text: "column"}), cSel), h("div", {class: "field"}, h("label", {text: "new value (empty = null)"}), holder)),
        buttons: [{label: "Cancel", onClick: (c) => c()}, {label: "Preview change-set", class: "btn-primary", onClick: (c) => { const [ok, v] = inp.value(); if (!ok) { toast(v, {kind: "fail"}); return; } c(); bulk({op: "update", set: {[cSel.value]: v}, ...target}); }}]});
    };

    // pending
    const pend = pendingOps(name);
    const panel = pendingPanel(name, detail, (applied) => { renderGrid(); if (applied) loadRows(); });
    panelHost.append(panel.el);

    // rows
    let page = null;
    const pendingFor = (row) => { const key = pkKey(Object.fromEntries(pkCols.map((c) => [c, row[c]]))); return pend.get(key); };
    const columns = detail.columns.map((c) => ({
      key: c.name, label: c.name, kind: c.kind, masked: c.masked, ref: c.references?.[0], num: ["integer", "number"].includes(c.kind), title: `${c.name} · ${c.type}${c.nullable ? "" : " · not null"}`,
      editable: editable && !c.primary_key && !c.masked && c.kind !== "binary",
      render: (v, row) => {
        const po = pendingFor(row);
        if (po && po.op === "update" && c.name in po.set) v = po.set[c.name];
        let html = renderCell(v, {kind: c.kind, masked: c.masked, ref: c.references?.[0]});
        if (c.primary_key) html = `<a class="mono" href="#/data/${encodeURIComponent(name)}/row/${pkParam(Object.fromEntries(pkCols.map((k) => [k, row[k]])))}" title="open row">${html}</a>`;
        return html;
      },
    }));
    const renderGrid = () => {
      clear(gridEl);
      if (!page) return;
      if (!page.items.length) { gridEl.append(empty(filters.length || params.q ? "No rows match the filters." : "The table is empty.")); return; }
      const wrap = h("div", {class: "grid-wrap tall"});
      wrap.append(grid(columns, page.items, {
        sort: page.sort, order: page.order, onSort: (k, o) => router.setQuery({sort: k, order: o, cursor: "", offset: ""}),
        selectable: canBulk && !detail.readonly, isSelected: (row) => sel.has(pkKey(pkOf(row))),
        onSelect: (row, checked, all) => { for (const r of all || [row]) { const k = pkKey(pkOf(r)); if (checked) sel.set(k, pkOf(r)); else sel.delete(k); } renderGrid(); renderSelBar(); },
        onCellDblClick: (row, col, td) => editCell(row, col, td),
        rowClass: (row) => { const po = pendingFor(row); return po ? (po.op === "delete" ? "del" : "") : ""; },
        pendingCell: (row, col) => { const po = pendingFor(row); return !!(po && po.op === "update" && col.key in po.set); },
      }));
      gridEl.append(wrap);
      renderSelBar();
    };
    const pkOf = (row) => Object.fromEntries(pkCols.map((c) => [c, row[c]]));
    const editCell = (row, col, td) => {
      const c = colByName[col.key];
      const po = pendingFor(row);
      const cur = po && po.op === "update" && c.name in po.set ? po.set[c.name] : row[c.name];
      const inp = cellInput(c, cur);
      const prev = td.innerHTML;
      const finish = (commit) => {
        if (commit) {
          const [ok, v] = inp.value();
          if (!ok) { toast(v, {kind: "fail"}); return; }
          const key = pkKey(pkOf(row));
          const op = pend.get(key) && pend.get(key).op === "update" ? pend.get(key) : {op: "update", pk: pkOf(row), set: {}};
          if (jsonStr(v, 0) === jsonStr(row[c.name], 0)) delete op.set[c.name]; else op.set[c.name] = v;
          if (Object.keys(op.set).length) pend.set(key, op); else pend.delete(key);
          panel.render(); renderGrid();
        } else td.innerHTML = prev;
      };
      const wrap = h("div", {class: "row nowrap"}, inp.el, h("button", {class: "btn btn-sm", title: "set null", onclick: () => { inp.el.value = c.kind === "enum" ? "\u0000null" : ""; finish(true); }}, "∅"));
      inp.el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !(inp.el.tagName === "TEXTAREA" && !e.ctrlKey)) { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); });
      inp.el.addEventListener("blur", () => setTimeout(() => { if (td.contains(inp.el)) finish(false); }, 150));
      clear(td).append(wrap); inp.el.focus();
    };
    const loadRows = async () => {
      clear(gridEl).append(loading("Loading rows…"));
      try { page = await api.get(`/data/tables/${encodeURIComponent(name)}/rows`, {...params, ...filterQuery}); }
      catch (e) { clear(gridEl).append(errorBox(e)); toastError(e); return; }
      renderGrid();
      clear(pager);
      pager.append(h("span", {text: `${page.items.length} row(s) on this page`}), h("span", {class: "faint", text: "·"}),
        h("span", {text: page.total !== null && page.total !== undefined ? `${page.estimated ? "~" : ""}${fmtNum(page.total)} total${page.estimated ? " (estimated)" : ""}` : "total unknown"}),
        h("span", {class: "faint", text: "·"}), h("span", {class: "small", text: `${page.keyset ? "keyset" : "offset"} paging · sort ${page.sort} ${page.order}`}), h("span", {class: "grow"}));
      const limitSel = h("select", {class: "select input-sm"}, ...[25, 50, 100, 250, 500].map((n) => h("option", {value: String(n), text: `${n}/page`}))); limitSel.value = String(params.limit); limitSel.addEventListener("change", () => router.setQuery({limit: limitSel.value, cursor: "", offset: ""}));
      const prev = h("button", {class: "btn btn-sm", disabled: !stack.length, onclick: () => { const c = stack.pop(); router.setQuery(c || {cursor: "", offset: ""}); }}, "← Prev");
      const next = h("button", {class: "btn btn-sm", disabled: !page.next, onclick: () => { stack.push({cursor: params.cursor || "", offset: params.offset || ""}); const dec = decodeCursor(page.next); if (dec && "o" in dec) router.setQuery({offset: String(dec.o), cursor: ""}); else router.setQuery({cursor: page.next, offset: ""}); }}, "Next →");
      pager.append(limitSel, prev, next);
    };

    // new row
    const newRowForm = () => {
      const fields = detail.columns.filter((c) => !c.masked && c.kind !== "binary").map((c) => ({c, inp: cellInput(c, null)}));
      const body = h("div", {class: "col"}, h("div", {class: "muted small", text: "Leave a field empty to omit it (defaults apply)."}), ...fields.map(({c, inp}) => h("div", {class: "field"}, h("label", {}, c.name, h("span", {class: "faint", text: ` ${c.type}${c.nullable ? "" : " · required"}${c.default !== null && c.default !== undefined ? " · default " + c.default : ""}`})), inp.el)));
      modal({title: `New row in ${name}`, body, buttons: [{label: "Cancel", onClick: (c) => c()}, {label: "Add to pending", class: "btn-primary", onClick: (c) => {
        const set = {};
        for (const {c: col, inp} of fields) { if (inp.el.value === "" && !(col.kind === "boolean")) continue; const [ok, v] = inp.value(); if (!ok) { toast(v, {kind: "fail"}); return; } if (v === null && inp.el.value === "") continue; set[col.name] = v; }
        pend.set(`insert:${Date.now()}:${Math.random()}`, {op: "insert", set}); panel.render(); c();
      }}]});
    };

    // live + events
    clearInterval(liveTimer);
    if (route.query.get("live")) liveTimer = setInterval(() => loadRows(), 5000);
    view = {table: name, reload: loadRows};
    await loadRows();
    if (opts.changeset) guard(async () => { const cs = await api.get(`/data/changesets/${encodeURIComponent(opts.changeset)}`); showChangeset(cs, name, {onApplied: () => loadRows()}); });
  }

  // --- row detail ---
  async function renderRow(name, pkRaw) {
    clear(root);
    const body = h("div");
    root.append(sectionHead(crumbs({text: "Data", href: "#/data"}, {text: name, href: `#/data/${encodeURIComponent(name)}`}, {text: pkRaw}), refreshBtn(() => draw())), body);
    const draw = () => load(body, async () => {
      const [detail, r] = await Promise.all([getDetail(name), api.get(`/data/tables/${encodeURIComponent(name)}/rows/${encodeURIComponent(pkRaw)}`)]);
      const editable = canCS && !detail.readonly;
      const colByName = Object.fromEntries(detail.columns.map((c) => [c.name, c]));
      const pend = pendingOps(name);
      const key = pkKey(r.pk);
      const wrap = h("div", {class: "split split-narrow"});
      const left = h("div", {class: "card"});
      const panel = pendingPanel(name, detail, () => draw());
      const list = kv(r.row, {render: (k, v, dd) => {
        const c = colByName[k] || {};
        const po = pend.get(key);
        if (po && po.op === "update" && k in po.set) { v = po.set[k]; dd.classList.add("pending"); }
        if (editable && !c.primary_key && !c.masked && c.kind !== "binary") {
          dd.classList.add("editable"); dd.title = "double-click to edit";
          dd.addEventListener("dblclick", () => {
            const inp = cellInput(c, v);
            const done = (commit) => { if (commit) { const [ok, nv] = inp.value(); if (!ok) { toast(nv, {kind: "fail"}); return; } const op = po && po.op === "update" ? po : {op: "update", pk: r.pk, set: {}}; if (jsonStr(nv, 0) === jsonStr(r.row[k], 0)) delete op.set[k]; else op.set[k] = nv; if (Object.keys(op.set).length) pend.set(key, op); else pend.delete(key); } draw(); };
            inp.el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !(inp.el.tagName === "TEXTAREA" && !e.ctrlKey)) { e.preventDefault(); done(true); } if (e.key === "Escape") done(false); });
            clear(dd).append(h("div", {class: "row nowrap"}, inp.el, h("button", {class: "btn btn-sm", onclick: () => done(true)}, "OK"), h("button", {class: "btn btn-sm", onclick: () => { inp.el.value = c.kind === "enum" ? "\u0000null" : ""; done(true); }}, "∅"), h("button", {class: "btn btn-sm btn-ghost", onclick: () => done(false)}, "Esc")));
            inp.el.focus();
          });
        }
        if (c.kind === "json" && isObj(v)) return h("pre", {text: jsonStr(v)});
        return renderCell(v, {kind: c.kind, masked: c.masked, ref: (r.references?.[k] || [])[0]});
      }});
      left.append(h("div", {class: "card-head"}, h("h2", {text: "Row"}), h("code", {text: key}), h("span", {class: "grow"}),
        editable ? h("button", {class: "btn btn-sm btn-danger", onclick: () => { pend.set(key, {op: "delete", pk: r.pk}); draw(); }}, "Delete row…") : null),
        h("div", {class: "card-body"}, editable ? h("div", {class: "muted small", style: "margin-bottom:6px", text: "Double-click a value to edit; changes queue into a change-set below."}) : null, list));
      const right = h("div", {class: "card"});
      right.append(h("div", {class: "card-head"}, h("h2", {text: "Related rows"})));
      const rb = h("div", {class: "card-body"});
      if (!r.related?.length) rb.append(h("div", {class: "muted", text: "No table references this one."}));
      for (const rel of r.related || []) rb.append(h("div", {class: "row", style: "padding:2px 0"}, h("a", {class: "mono", href: `#/data/${encodeURIComponent(rel.table)}?${filterHref(rel.filter)}`, text: `${rel.table}.${rel.column}`}), h("span", {class: "grow"}), h("b", {text: fmtNum(rel.count)})));
      right.append(rb);
      const refs = detail.references || [];
      if (refs.length) { right.append(h("div", {class: "card-head"}, h("h3", {text: "References"}))); const rr = h("div", {class: "card-body"}); for (const f of refs) { const v = r.row[f.column]; rr.append(h("div", {class: "row small"}, h("span", {class: "mono muted", text: f.column}), "→", v === null || v === undefined ? h("span", {class: "null", text: "null"}) : h("a", {class: "mono", href: `#/data/${encodeURIComponent(f.table)}/row/${encodeURIComponent(String(v))}`, text: `${f.table}.${f.target_column} = ${v}`}))); } right.append(rr); }
      wrap.append(left, right);
      const out = h("div", {}, wrap, panel.el);
      return out;
    });
    await draw();
  }

  function render() {
    const [table, sub, arg] = route.parts;
    clearInterval(liveTimer); liveTimer = null; view = null;
    if (!table) return renderList();
    if (table === "changesets") return renderChangesets();
    if (sub === "row") return renderRow(table, arg);
    if (sub === "changeset") return renderTable(table, {changeset: arg});
    return renderTable(table);
  }
  return {
    async mount(el, r) {
      root = el; route = r;
      const soft = debounce(() => { if (view?.reload) view.reload(); }, 600);
      unsubs.push(events.on("data", (d) => { if (view && (!d?.table || d.table === view.table)) soft(); }));
      unsubs.push(events.on("poll", () => { if (view?.reload && route.query.get("live")) view.reload(); }));
      unsubs.push(events.on("gap", () => render()));
      await render();
    },
    update(r) { route = r; return render(); },
    unmount() { clearInterval(liveTimer); unsubs.forEach((u) => u()); },
    refresh() { return render(); },
  };
};

// ---- Schema ------------------------------------------------------------------
const schemaCache = {map: null, dict: null};
const DOMAIN_HUES = [215, 150, 25, 285, 0, 190, 60, 330, 110, 250];
function domainColor(domains, d) { const i = Math.max(0, domains.indexOf(d)); return `hsl(${DOMAIN_HUES[i % DOMAIN_HUES.length]}, 50%, 42%)`; }

function erDiagram(map, dict, selectedName, onSelect) {
  const domains = map.domains?.length ? [...map.domains] : [];
  if (map.tables.some((t) => !t.domain)) domains.push("");
  const dictBy = Object.fromEntries((dict?.tables || []).map((t) => [t.name, t]));
  const W = 220, COLGAP = 300, ROWGAP = 22, LINE = 14, MAXC = 8;
  const boxes = new Map();
  domains.forEach((d, ci) => {
    let y = 40;
    const ts = map.tables.filter((t) => (t.domain || "") === d).sort((a, b) => a.name.localeCompare(b.name));
    for (const t of ts) {
      const cols = dictBy[t.name]?.columns || [];
      const shown = cols.slice(0, MAXC);
      const hgt = 24 + shown.length * LINE + (cols.length > MAXC ? LINE : 0) + 8;
      boxes.set(t.name, {t, x: 40 + ci * COLGAP, y, w: W, h: hgt, cols: shown, more: cols.length - shown.length, domain: d});
      y += hgt + ROWGAP;
    }
  });
  const totalW = 40 + domains.length * COLGAP + 40, totalH = Math.max(...Array.from(boxes.values()).map((b) => b.y + b.h), 200) + 40;
  const svgNS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => { const n = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = el("svg", {class: "er-svg", viewBox: `0 0 ${totalW} ${totalH}`});
  const defs = el("defs");
  const marker = el("marker", {id: "er-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse"});
  marker.append(el("path", {d: "M 0 0 L 10 5 L 0 10 z", fill: "currentColor"}));
  defs.append(marker); svg.append(defs);
  const g = el("g", {class: "er-root"});
  svg.append(g);
  const edgesG = el("g"); g.append(edgesG);
  for (const e of map.edges) {
    const a = boxes.get(e.from_table), b = boxes.get(e.to_table);
    if (!a || !b) continue;
    const ay = a.y + 12 + Math.max(0, a.cols.findIndex((c) => c.name === e.from_column)) * LINE + 18, by = b.y + 12;
    let d;
    if (b.x > a.x + a.w) d = `M ${a.x + a.w} ${ay} C ${a.x + a.w + 70} ${ay}, ${b.x - 70} ${by}, ${b.x} ${by}`;
    else if (b.x + b.w < a.x) d = `M ${a.x} ${ay} C ${a.x - 70} ${ay}, ${b.x + b.w + 70} ${by}, ${b.x + b.w} ${by}`;
    else d = `M ${a.x + a.w} ${ay} C ${a.x + a.w + 90} ${ay}, ${b.x + b.w + 90} ${by}, ${b.x + b.w} ${by}`;
    const hl = selectedName && (e.from_table === selectedName || e.to_table === selectedName);
    const p = el("path", {d, class: `er-edge${hl ? " hl" : ""}`, "marker-end": "url(#er-arrow)", style: hl ? "color: var(--accent)" : "color: var(--border-strong)"});
    p.append(el("title")); p.firstChild.textContent = `${e.from_table}.${e.from_column} → ${e.to_table}.${e.to_column}`;
    edgesG.append(p);
  }
  for (const b of boxes.values()) {
    const gb = el("g", {class: `er-box${b.t.name === selectedName ? " selected" : ""}`, transform: `translate(${b.x}, ${b.y})`});
    gb.append(el("rect", {class: "body", width: b.w, height: b.h, rx: 4}));
    gb.append(el("rect", {width: b.w, height: 20, rx: 4, fill: domainColor(domains, b.domain)}));
    const title = el("text", {x: 8, y: 14, class: "title"}); title.textContent = `${b.t.name}${b.t.readonly ? " (ro)" : ""}`; gb.append(title);
    const cnt = el("text", {x: b.w - 8, y: 14, class: "title", "text-anchor": "end", "font-weight": "400"}); cnt.textContent = `${b.t.estimated ? "~" : ""}${fmtNum(b.t.rows)}`; gb.append(cnt);
    b.cols.forEach((c, i) => {
      const tx = el("text", {x: 8, y: 34 + i * LINE, class: "colname"});
      tx.textContent = `${c.primary_key ? "🔑 " : c.references?.length ? "↗ " : "  "}${c.name}`;
      const ty = el("text", {x: b.w - 8, y: 34 + i * LINE, class: "colname", "text-anchor": "end", "font-size": "9.5"}); ty.textContent = truncate(c.type, 14);
      gb.append(tx, ty);
    });
    if (b.more > 0) { const m = el("text", {x: 8, y: 34 + b.cols.length * LINE, class: "colname", "font-style": "italic"}); m.textContent = `+${b.more} more`; gb.append(m); }
    gb.addEventListener("click", (e) => { e.stopPropagation(); onSelect(b.t.name); });
    g.append(gb);
  }
  // pan / zoom
  const wrap = h("div", {class: "er-wrap"});
  wrap.append(svg);
  let tx = 0, ty = 0, s = 1, drag = null;
  const apply = () => g.setAttribute("transform", `translate(${tx}, ${ty}) scale(${s})`);
  wrap.addEventListener("mousedown", (e) => { drag = {x: e.clientX, y: e.clientY, tx, ty}; e.preventDefault(); });
  window.addEventListener("mousemove", (e) => { if (!drag) return; const r = svg.getBoundingClientRect(); const k = totalW / r.width; tx = drag.tx + (e.clientX - drag.x) * k; ty = drag.ty + (e.clientY - drag.y) * k; apply(); });
  window.addEventListener("mouseup", () => { drag = null; });
  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect(); const k = totalW / r.width;
    const mx = (e.clientX - r.left) * k, my = (e.clientY - r.top) * k;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1; const ns = Math.min(4, Math.max(0.2, s * factor));
    tx = mx - (mx - tx) * (ns / s); ty = my - (my - ty) * (ns / s); s = ns; apply();
  }, {passive: false});
  const legend = h("div", {class: "er-legend"}, ...domains.map((d) => h("span", {}, h("span", {class: "sw", style: `background:${domainColor(domains, d)}`}), d || "(no domain)")));
  wrap.append(legend, h("div", {class: "er-hint", text: `${map.tables.length} tables · ${map.edges.length} FKs · drag to pan, wheel to zoom`}));
  return wrap;
}

SECTIONS.schema = function schemaSection() {
  let root, route;
  const hasMig = state.has("schema") && state.caps("schema").has("migrations");
  const canUpgrade = state.can("schema", "migrations.upgrade");
  async function loadAll(force) {
    if (!schemaCache.map || force) [schemaCache.map, schemaCache.dict] = await Promise.all([api.get("/schema/map"), api.get("/schema/dictionary")]);
    return schemaCache;
  }
  function dictionaryPanel(t) {
    const card = h("div", {class: "card"});
    card.append(h("div", {class: "card-head"}, h("h2", {}, h("code", {text: t.name})), h("span", {html: `${t.readonly ? chip("readonly", "muted") : ""}${t.live ? "" : chip("missing in db", "fail")}${t.domain ? `<span class="muted small">${esc(t.domain)}</span>` : ""}`}), h("a", {class: "btn btn-sm", href: `#/data/${encodeURIComponent(t.name)}`}, "Browse data"), h("a", {class: "btn btn-sm btn-ghost", href: "#/schema"}, "✕")));
    const body = h("div", {class: "card-body col"});
    if (t.doc) body.append(h("div", {class: "muted", text: t.doc}));
    if (t.drift && (t.drift.missing_in_db.length || t.drift.extra_in_db.length)) body.append(h("div", {class: "callout callout-warn"}, "Drift: ", t.drift.missing_in_db.length ? `missing in db: ${t.drift.missing_in_db.join(", ")} ` : "", t.drift.extra_in_db.length ? `extra in db: ${t.drift.extra_in_db.join(", ")}` : ""));
    const wrap = h("div", {class: "grid-wrap"});
    wrap.append(grid([
      {key: "name", mono: true, render: (v, c) => `${c.primary_key ? "🔑 " : ""}<b>${esc(v)}</b>`}, {key: "type", mono: true}, {key: "kind"},
      {key: "nullable", render: (v) => v ? "" : "not null"}, {key: "indexed", render: (v) => v ? "✓" : ""}, {key: "unique", render: (v) => v ? "✓" : ""},
      {key: "default", render: (v) => v === null || v === undefined ? "" : `<code>${esc(v)}</code>`},
      {key: "references", render: (v) => (v || []).map((r) => `<a href="#/schema/${encodeURIComponent(r.table)}" class="mono">${esc(r.table)}.${esc(r.column)}</a>`).join(", ")},
      {key: "enum", render: (v) => v ? `<span class="mono small">${esc(v.join(" | "))}</span>` : ""},
      {key: "masked", render: (v) => v ? chip("masked", "warn") : ""}, {key: "live", render: (v) => v === false ? chip("missing", "fail") : ""},
    ], t.columns));
    body.append(h("h3", {text: `Columns (${t.columns.length})`}), wrap);
    const idx = h("div", {class: "split"});
    const list = (title, items) => { const d = h("div"); d.append(h("h3", {text: title})); if (!items.length) d.append(h("div", {class: "muted small", text: "none"})); for (const ix of items) d.append(h("div", {class: "mono small"}, `${ix.unique ? "UNIQUE " : ""}${ix.name || "(unnamed)"} (${(ix.columns || []).join(", ")})`)); return d; };
    const modelKeys = new Set(t.indexes.map((i) => (i.columns || []).join(","))), liveKeys = new Set(t.live_indexes.map((i) => (i.columns || []).join(",")));
    idx.append(list("Indexes in model", t.indexes.map((i) => ({...i, name: i.name + (liveKeys.has((i.columns || []).join(",")) ? "" : " ⚠ not live")}))), list("Indexes in database", t.live_indexes.map((i) => ({...i, name: i.name + (modelKeys.has((i.columns || []).join(",")) ? "" : " ⚠ not modeled")}))));
    body.append(idx);
    if (t.unique_constraints?.length) body.append(h("div", {}, h("h3", {text: "Unique constraints"}), ...t.unique_constraints.map((u) => h("div", {class: "mono small", text: `${u.name || "(unnamed)"} (${u.columns.join(", ")})`}))));
    if (t.referenced_by?.length) body.append(h("div", {}, h("h3", {text: "Referenced by"}), h("div", {class: "row"}, ...t.referenced_by.map((r) => h("a", {class: "mono small", href: `#/schema/${encodeURIComponent(r.table)}`, text: `${r.table}.${r.column}`})))));
    card.append(body);
    return card;
  }
  async function renderMap() {
    const body = h("div"); root.append(body);
    await load(body, async () => {
      const {map, dict} = await loadAll();
      const sel = route.parts[0] && route.parts[0] !== "migrations" ? route.parts[0] : null;
      const out = h("div");
      if (!map.tables.length) { out.append(empty("No tables modeled.")); return out; }
      out.append(erDiagram(map, dict, sel, (name) => router.go(`#/schema/${encodeURIComponent(name)}`)));
      const t = sel ? dict.tables.find((x) => x.name === sel) : null;
      if (sel && !t) out.append(h("div", {class: "callout callout-warn", text: `Unknown table ${sel}`}));
      if (t) out.append(h("div", {style: "margin-top:12px"}, dictionaryPanel(t)));
      const d = map.drift || {};
      const driftCard = h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Drift"})));
      const db = h("div", {class: "card-body"});
      const hasDrift = d.missing_tables?.length || d.extra_tables?.length || Object.keys(d.columns || {}).length;
      if (!hasDrift) db.append(h("div", {class: "chip chip-ok", text: "models and database agree"}));
      if (d.missing_tables?.length) db.append(h("div", {}, h("b", {text: "Missing tables: "}), h("span", {class: "mono", text: d.missing_tables.join(", ")})));
      if (d.extra_tables?.length) db.append(h("div", {}, h("b", {text: "Extra tables in db: "}), h("span", {class: "mono", text: d.extra_tables.join(", ")})));
      for (const [tn, c] of Object.entries(d.columns || {})) db.append(h("div", {class: "small"}, h("a", {class: "mono", href: `#/schema/${encodeURIComponent(tn)}`, text: tn}), `: -${c.missing_in_db.join(", ") || "∅"} +${c.extra_in_db.join(", ") || "∅"}`));
      driftCard.append(db);
      const fkCard = h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Unindexed foreign keys"})));
      const fb = h("div", {class: "card-body"});
      if (!dict.unindexed_foreign_keys?.length) fb.append(h("div", {class: "chip chip-ok", text: "all foreign keys indexed"}));
      for (const f of dict.unindexed_foreign_keys || []) { const [tn] = f.split("."); fb.append(h("div", {}, h("a", {class: "mono", href: `#/schema/${encodeURIComponent(tn)}`, text: f}))); }
      fkCard.append(fb);
      out.append(h("div", {class: "split", style: "margin-top:12px"}, driftCard, fkCard));
      return out;
    });
  }
  async function renderMigrations() {
    const body = h("div"); root.append(body);
    await load(body, async () => {
      const st = await api.get("/schema/migrations");
      const out = h("div", {class: "col"});
      if (st.error) out.append(h("div", {class: "callout callout-fail", text: st.error}));
      const card = h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "State"}), h("span", {html: st.at_head ? chip("at head", "ok") : chip(`${st.behind_by ?? "?"} behind`, "fail")})));
      card.append(h("div", {class: "card-body"}, kv({current: st.current || "(none)", heads: (st.heads || []).join(", ") || "—", behind_by: st.behind_by ?? "—"})));
      out.append(card);
      const planCard = h("div", {class: "card"});
      const target = h("input", {class: "input mono", value: "head", placeholder: "head or revision"});
      const sqlOut = h("div");
      const planBtn = h("button", {class: "btn", onclick: () => guard(async () => { clear(sqlOut).append(loading("Planning…")); const p = await api.post("/schema/migrations/plan", {target: target.value.trim() || "head"}); clear(sqlOut).append(h("div", {class: "muted small", text: `${p.from} → ${p.to}`}), h("pre", {class: "json-view mono", text: p.sql || "(no SQL — nothing to do)"})); }, "plan: ")}, "Plan upgrade (SQL)");
      const upBtn = canUpgrade ? h("button", {class: "btn btn-danger", onclick: async () => {
        const ok = await confirmTyped({title: "Run migration", message: `Run <code>alembic upgrade ${esc(target.value.trim() || "head")}</code> against <b>${esc(state.manifest.database_label || "the database")}</b>. Refused while tests, backups or restores run.`, expect: "upgrade", verb: "Upgrade"});
        if (!ok) return;
        guard(async () => { const run = await api.post("/schema/migrations/upgrade", {target: target.value.trim() || "head", confirm: "upgrade"}); startRunUI(run, {title: `Migration → ${target.value}`, onFinish: () => { schemaCache.map = null; router.refresh(); }}); });
      }}, "Upgrade…") : null;
      planCard.append(h("div", {class: "card-head"}, h("h2", {text: "Plan / upgrade"}), h("span", {class: "muted small", text: "target"}), target, planBtn, upBtn), h("div", {class: "card-body"}, sqlOut));
      out.append(planCard);
      const hist = h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: `History (${(st.history || []).length})`})));
      const wrap = h("div", {class: "grid-wrap"});
      wrap.append(grid([{key: "revision", mono: true}, {key: "down_revision", label: "down", mono: true, render: (v) => esc(Array.isArray(v) ? v.join(", ") : v || "(base)")}, {key: "message"}, {key: "applied", render: (v, r) => r.revision === st.current ? chip("current", "info") : v ? chip("applied", "ok") : chip("pending", "warn")}], st.history || []));
      hist.append(h("div", {class: "card-body flush"}, (st.history || []).length ? wrap : empty("No revisions.")));
      out.append(hist);
      return out;
    });
  }
  async function render() {
    clear(root);
    const tab = route.parts[0] === "migrations" ? "migrations" : "map";
    root.append(sectionHead("Schema", refreshBtn(() => { schemaCache.map = null; render(); })));
    if (hasMig) root.append(tabs([{id: "map", label: "ER map & dictionary"}, {id: "migrations", label: "Migrations"}], tab, (id) => router.go(id === "map" ? "#/schema" : "#/schema/migrations")));
    if (tab === "migrations") await renderMigrations(); else await renderMap();
  }
  return {mount(el, r) { root = el; route = r; return render(); }, update(r) { route = r; return render(); }, refresh() { schemaCache.map = null; return render(); }};
};

// ---- Query -------------------------------------------------------------------
SECTIONS.query = function querySection() {
  let root, editor, result = null, mode = "read", loadedSaved = null;
  const canWrite = state.can("query", "write"), hasExplain = state.caps("query").has("explain"), hasSaved = state.caps("query").has("saved"), hasHistory = state.caps("query").has("history");
  const maxRows = h("input", {class: "input input-sm mono", type: "number", min: "1", max: "10000", value: store("query.max_rows") || "200", style: "width:80px", title: "max rows"});
  const analyze = h("input", {type: "checkbox"});
  const resultsEl = h("div"); const sideEl = h("div"); const metaEl = h("div", {class: "row muted small", style: "margin:8px 0"});
  const modeBtn = h("button", {class: "btn btn-sm", title: "toggle read / write mode"}, "mode: read");
  function setMode(m) { mode = m; modeBtn.textContent = `mode: ${m}`; modeBtn.classList.toggle("btn-danger", m === "write"); modeBtn.classList.toggle("on", m === "write"); }
  async function run() {
    const sql = editor.get().trim(); if (!sql) return;
    store("query.sql", sql); store("query.max_rows", maxRows.value);
    const body = {sql, max_rows: Number(maxRows.value) || 200, mode};
    if (mode === "write") { const ok = await confirmTyped({title: "Run write statement", message: `<pre class="json-view mono">${esc(truncate(sql, 2000))}</pre>This runs in one transaction and is audited with the SQL text.`, expect: "write", verb: "Run"}); if (!ok) return; body.confirm = "write"; }
    clear(resultsEl).append(loading("Running…")); clear(metaEl);
    try {
      const t0 = performance.now();
      const r = await api.post("/query/run", body);
      result = r;
      const cols = (r.columns || []).map((c, i) => ({key: i, label: c, sortable: false}));
      clear(metaEl);
      if (r.mode === "write") metaEl.append(h("span", {html: chip("write", "warn")}), h("b", {text: `${r.rowcount} row(s) affected`}), h("span", {text: `· ${fmtMs(r.ms)}`}));
      else metaEl.append(h("span", {text: `${r.returned} row(s)`}), r.truncated ? h("span", {class: "chip chip-warn", text: r.byte_capped ? "byte-capped" : "truncated"}) : null, h("span", {text: `· ${fmtMs(r.ms)} server · ${fmtMs(performance.now() - t0)} total`}));
      metaEl.append(h("span", {class: "grow"}), r.rows?.length ? h("button", {class: "btn btn-sm", onclick: () => download(`query-${Date.now()}.csv`, toCSV(r.columns, r.rows), "text/csv")}, "⇩ CSV") : null);
      clear(resultsEl);
      if (!r.rows?.length) resultsEl.append(empty(r.mode === "write" ? "No rows returned." : "Empty result."));
      else { const wrap = h("div", {class: "grid-wrap tall"}); wrap.append(grid(cols.map((c) => ({...c, render: (v) => renderCell(v)})), r.rows)); resultsEl.append(wrap); }
      if (hasHistory) loadHistory();
    } catch (e) { clear(resultsEl).append(errorBox(e)); toastError(e); if (hasHistory) loadHistory(); }
  }
  async function explain() {
    const sql = editor.get().trim(); if (!sql) return;
    clear(resultsEl).append(loading("Explaining…")); clear(metaEl);
    try {
      const r = await api.post("/query/explain", {sql, analyze: analyze.checked});
      clear(resultsEl).append(h("div", {class: "muted small", text: `EXPLAIN${analyze.checked ? " ANALYZE" : ""} · ${r.dialect}`}), r.text ? h("pre", {class: "json-view mono", text: r.text}) : jsonView(r.plan, {maxHeight: "60vh"}));
    } catch (e) { clear(resultsEl).append(errorBox(e)); toastError(e); }
  }
  let sideTab = store("query.tab") || (hasHistory ? "history" : "saved");
  async function loadHistory() {
    if (sideTab !== "history") return;
    const list = $(".side-list", sideEl); if (!list) return;
    await load(list, async () => {
      const r = await api.get("/query/history", {limit: 100});
      if (!r.items.length) return empty("No history yet.");
      const out = h("div", {class: "list-scroll", style: "max-height:calc(100vh - 220px)"});
      for (const it of r.items) out.append(h("div", {class: "list-item", title: it.sql, onclick: () => editor.set(it.sql)}, h("span", {html: chip(it.error ? "error" : it.mode, it.error ? "fail" : it.mode === "write" ? "warn" : "info")}), h("span", {class: "t mono", text: truncate(it.sql.replace(/\s+/g, " "), 80)}), h("span", {class: "faint small nowrap", text: `${it.rows ?? "—"} · ${fmtMs(it.ms)} · ${ago(it.at)}`})));
      return out;
    });
  }
  async function loadSaved() {
    if (sideTab !== "saved") return;
    const list = $(".side-list", sideEl); if (!list) return;
    await load(list, async () => {
      const r = await api.get("/query/saved");
      const out = h("div", {class: "list-scroll", style: "max-height:calc(100vh - 220px)"});
      if (!r.items.length) out.append(empty("No saved queries. Use “Save…” above."));
      for (const it of r.items) {
        const pin = h("button", {class: "btn btn-sm btn-ghost", title: it.pinned ? "unpin" : "pin", onclick: (e) => { e.stopPropagation(); guard(async () => { await api.put(`/query/saved/${encodeURIComponent(it.id)}`, {name: it.name, sql: it.sql, params: it.params || [], pinned: !it.pinned}); loadSaved(); }); }}, it.pinned ? "★" : "☆");
        const del = h("button", {class: "btn btn-sm btn-ghost", title: "delete", onclick: (e) => { e.stopPropagation(); modal({title: "Delete saved query", body: `Delete <b>${esc(it.name)}</b>?`, buttons: [{label: "Cancel", onClick: (c) => c()}, {label: "Delete", class: "btn-danger", onClick: (c) => { c(); guard(async () => { await api.del(`/query/saved/${encodeURIComponent(it.id)}`); toast("Deleted", {kind: "info"}); loadSaved(); }); }}]}); }}, "🗑");
        out.append(h("div", {class: `list-item${loadedSaved?.id === it.id ? " active" : ""}`, title: it.sql, onclick: () => { editor.set(it.sql); loadedSaved = it; loadSaved(); }}, pin, h("span", {class: "t"}, h("b", {text: it.name}), " ", h("span", {class: "mono muted small", text: truncate(it.sql.replace(/\s+/g, " "), 60)})), del));
      }
      return out;
    });
  }
  function renderSide() {
    clear(sideEl);
    const items = []; if (hasHistory) items.push({id: "history", label: "History"}); if (hasSaved) items.push({id: "saved", label: "Saved"});
    if (!items.length) return;
    sideEl.append(tabs(items, sideTab, (id) => { sideTab = id; store("query.tab", id); renderSide(); }), h("div", {class: "side-list"}));
    if (sideTab === "history") loadHistory(); else loadSaved();
  }
  function saveDialog() {
    const sql = editor.get().trim(); if (!sql) { toast("Nothing to save", {kind: "warn"}); return; }
    const name = h("input", {class: "input", value: loadedSaved?.name || "", placeholder: "name"}); const pinned = h("input", {type: "checkbox"}); pinned.checked = !!loadedSaved?.pinned;
    modal({title: loadedSaved ? `Update “${loadedSaved.name}”` : "Save query", body: h("div", {class: "col"}, h("div", {class: "field"}, h("label", {text: "name"}), name), h("label", {class: "switch"}, pinned, " pinned")),
      buttons: [{label: "Cancel", onClick: (c) => c()}, loadedSaved ? {label: "Save as new", onClick: (c) => { c(); doSave(name.value, pinned.checked, null); }} : null, {label: "Save", class: "btn-primary", onClick: (c) => { if (!name.value.trim()) { name.focus(); return; } c(); doSave(name.value, pinned.checked, loadedSaved?.id || null); }}].filter(Boolean)});
    setTimeout(() => name.focus(), 30);
  }
  const doSave = (name, pinned, id) => guard(async () => {
    const body = {name: name.trim(), sql: editor.get().trim(), params: [], pinned};
    loadedSaved = id ? await api.put(`/query/saved/${encodeURIComponent(id)}`, body) : await api.post("/query/saved", body);
    toast(`Saved “${loadedSaved.name}”`, {kind: "ok"}); sideTab = "saved"; renderSide();
  });
  return {
    mount(el, r) {
      root = el;
      editor = codeEditor({value: store("query.sql") || "SELECT 1", rows: 8, onRun: run, placeholder: "SELECT … (Ctrl/Cmd+Enter to run)"});
      modeBtn.addEventListener("click", () => setMode(mode === "read" ? "write" : "read"));
      const bar = h("div", {class: "toolbar"},
        h("button", {class: "btn btn-primary", onclick: run, title: "Ctrl/Cmd+Enter"}, "▶ Run"),
        hasExplain ? h("button", {class: "btn", onclick: explain}, "Explain") : null, hasExplain ? h("label", {class: "switch small"}, analyze, "analyze") : null,
        h("span", {class: "sep"}), h("span", {class: "muted small", text: "max rows"}), maxRows,
        canWrite ? h("span", {class: "sep"}) : null, canWrite ? modeBtn : null,
        h("span", {class: "grow"}), hasSaved ? h("button", {class: "btn btn-sm", onclick: saveDialog}, "Save…") : null,
        h("button", {class: "btn btn-sm btn-ghost", onclick: () => { editor.set(""); loadedSaved = null; editor.focus(); }}, "Clear"));
      const main = h("div", {}, bar, editor.el, metaEl, resultsEl);
      const layout = h("div", {class: "split split-side"}, sideEl, main);
      root.append(sectionHead("Query", h("span", {class: "muted small", text: canWrite ? "read mode rolls back; write mode commits and needs confirmation" : "read-only: SELECT / WITH / EXPLAIN, rolled back"})), layout);
      renderSide();
      if (r.query.get("sql")) editor.set(r.query.get("sql"));
      setTimeout(() => editor.focus(), 50);
    },
    refresh() { renderSide(); },
  };
};

// ---- API playground ------------------------------------------------------------
const apiCache = {routes: null};
let pendingApiRoute = null;   // set by the palette, consumed by the API section's request builder
async function getRoutes(force) { if (!apiCache.routes || force) apiCache.routes = (await api.get("/api/routes")).items; return apiCache.routes; }

SECTIONS.api = function apiSection() {
  let root, route, builderEl, req = {method: "GET", path: "/", query: [], headers: [], body: "", act_as: ""};
  const hasTraffic = state.caps("api").has("traffic"), hasProbes = state.caps("api").has("probes"), hasColl = state.caps("api").has("collections");
  const logsSource = state.section("logs")?.sources?.[0];

  function kvRows(items, placeholderK, placeholderV) {
    const box = h("div", {class: "col"});
    const render = () => {
      clear(box);
      items.forEach((it, i) => box.append(h("div", {class: "row nowrap"}, h("input", {class: "input input-sm mono grow", placeholder: placeholderK, value: it.k, oninput: (e) => { it.k = e.target.value; }}), h("input", {class: "input input-sm mono grow", placeholder: placeholderV, value: it.v, oninput: (e) => { it.v = e.target.value; }}), h("button", {class: "btn btn-sm btn-ghost", onclick: () => { items.splice(i, 1); render(); }}, "✕"))));
      box.append(h("button", {class: "btn btn-sm btn-ghost", style: "align-self:flex-start", onclick: () => { items.push({k: "", v: ""}); render(); }}, "+ add"));
    };
    render();
    return box;
  }
  function renderBuilder() {
    clear(builderEl);
    const methodSel = h("select", {class: "select mono"}, ...["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => h("option", {value: m, text: m}))); methodSel.value = req.method;
    const pathIn = h("input", {class: "input mono grow", value: req.path, placeholder: "/path/{param}"});
    const paramsBox = h("div", {class: "col"});
    const renderParams = () => {
      clear(paramsBox);
      const names = Array.from(new Set(Array.from(pathIn.value.matchAll(/\{([^}]+)\}/g)).map((m) => m[1])));
      req.pathParams = req.pathParams || {};
      for (const n of names) paramsBox.append(h("div", {class: "row nowrap"}, h("span", {class: "mono small muted", style: "width:120px", text: `{${n}}`}), h("input", {class: "input input-sm mono grow", value: req.pathParams[n] || "", placeholder: "value", oninput: (e) => { req.pathParams[n] = e.target.value; }})));
    };
    pathIn.addEventListener("input", () => { req.path = pathIn.value; renderParams(); });
    renderParams();
    const bodyTa = h("textarea", {class: "input mono", rows: "6", placeholder: '{"json": true} or raw text', spellcheck: "false"}); bodyTa.value = req.body || "";
    const actAs = h("input", {class: "input input-sm", placeholder: "act as (user id) — if the host supports it", value: req.act_as || ""});
    const timeout = h("input", {class: "input input-sm", type: "number", min: "0.5", max: "60", step: "0.5", value: "10", style: "width:70px", title: "timeout seconds"});
    const respEl = h("div");
    const send = () => guard(async () => {
      req.method = methodSel.value; req.body = bodyTa.value; req.act_as = actAs.value.trim();
      let path = pathIn.value.trim();
      for (const [k, v] of Object.entries(req.pathParams || {})) path = path.replace(new RegExp(`\\{${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`, "g"), encodeURIComponent(v));
      const query = Object.fromEntries(req.query.filter((x) => x.k).map((x) => [x.k, x.v]));
      const headers = Object.fromEntries(req.headers.filter((x) => x.k).map((x) => [x.k, x.v]));
      let body = null;
      if (bodyTa.value.trim() && !["GET", "HEAD"].includes(req.method)) { const [j, err] = tryJSON(bodyTa.value); body = err ? bodyTa.value : j; if (!headers["Content-Type"] && !headers["content-type"] && err) headers["Content-Type"] = "text/plain"; }
      clear(respEl).append(loading("Sending…"));
      let r;
      try { r = await api.post("/api/send", {method: req.method, path, query: Object.keys(query).length ? query : null, headers: Object.keys(headers).length ? headers : null, body, act_as: req.act_as || null, timeout_seconds: Number(timeout.value) || 10}); }
      catch (e) { clear(respEl).append(errorBox(e)); throw e; }
      clear(respEl);
      const kind = r.status < 300 ? "ok" : r.status < 500 ? "warn" : "fail";
      respEl.append(h("div", {class: "row"}, h("span", {class: `chip chip-${kind}`, text: String(r.status)}), h("span", {class: "muted small", text: `${fmtMs(r.ms)} · ${fmtBytes(r.bytes)}${r.truncated ? " (truncated)" : ""}`}), r.request_id ? (logsSource ? h("a", {class: "mono small", href: `#/logs/${encodeURIComponent(logsSource)}?request_id=${encodeURIComponent(r.request_id)}`, text: r.request_id, title: "open in logs"}) : h("code", {text: r.request_id})) : null));
      respEl.append(detailsBlock(`headers (${Object.keys(r.headers || {}).length})`, kv(r.headers || {})));
      respEl.append(isObj(r.body) ? jsonView(r.body, {maxHeight: "50vh"}) : h("pre", {class: "json-view mono", text: String(r.body ?? "")}));
    });
    const saveToColl = () => guard(async () => {
      const cols = hasColl ? (await api.get("/api/collections")).items : [];
      const sel = h("select", {class: "select"}, h("option", {value: "", text: "(new collection)"}), ...cols.map((c) => h("option", {value: c.name, text: `${c.name} (${c.requests.length})`})));
      const name = h("input", {class: "input", placeholder: "new collection name"}); const title = h("input", {class: "input", placeholder: "request title (optional)"});
      modal({title: "Save request to collection", body: h("div", {class: "col"}, h("div", {class: "field"}, h("label", {text: "collection"}), sel), h("div", {class: "field"}, h("label", {text: "or new name"}), name), h("div", {class: "field"}, h("label", {text: "title"}), title)),
        buttons: [{label: "Cancel", onClick: (c) => c()}, {label: "Save", class: "btn-primary", onClick: (c) => {
          const n = sel.value || name.value.trim(); if (!n) { name.focus(); return; }
          const existing = cols.find((x) => x.name === n);
          const entry = {title: title.value.trim() || `${methodSel.value} ${pathIn.value}`, method: methodSel.value, path: pathIn.value, path_params: req.pathParams || {}, query: Object.fromEntries(req.query.filter((x) => x.k).map((x) => [x.k, x.v])), headers: Object.fromEntries(req.headers.filter((x) => x.k).map((x) => [x.k, x.v])), body: bodyTa.value || null};
          c(); guard(async () => { await api.post("/api/collections", {name: n, requests: [...(existing?.requests || []), entry]}); toast(`Saved to “${n}”`, {kind: "ok"}); });
        }}]});
    });
    builderEl.append(h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Request"}), h("span", {class: "muted small", text: "sent server-side to this app only"})),
      h("div", {class: "card-body col"},
        h("div", {class: "row nowrap"}, methodSel, pathIn, h("button", {class: "btn btn-primary", onclick: send}, "Send")),
        paramsBox,
        h("div", {class: "split"}, h("div", {}, h("h3", {text: "Query"}), kvRows(req.query, "key", "value")), h("div", {}, h("h3", {text: "Headers"}), kvRows(req.headers, "Header", "value"))),
        h("div", {}, h("h3", {text: "Body"}), bodyTa),
        h("div", {class: "row"}, actAs, h("span", {class: "muted small", text: "timeout s"}), timeout, h("span", {class: "grow"}), hasColl ? h("button", {class: "btn btn-sm", onclick: saveToColl}, "Save to collection…") : null),
        h("h3", {text: "Response"}), respEl)));
    bodyTa.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") send(); });
  }
  function loadRoute(rt) {
    if (!builderEl || !builderEl.isConnected) { pendingApiRoute = rt; router.go("#/api"); return; }
    req = {method: rt.method, path: rt.path, pathParams: {}, query: (rt.params || []).filter((p) => p.in === "query").map((p) => ({k: p.name, v: ""})), headers: (rt.params || []).filter((p) => p.in === "header").map((p) => ({k: p.name, v: ""})), body: rt.body ? (rt.body.includes("json") ? "{}" : "") : "", act_as: ""};
    renderBuilder();
    builderEl.scrollIntoView({behavior: "smooth", block: "start"});
  }
  function loadSavedReq(r) {
    req = {method: r.method || "GET", path: r.path || "/", pathParams: r.path_params || {}, query: Object.entries(r.query || {}).map(([k, v]) => ({k, v: String(v)})), headers: Object.entries(r.headers || {}).map(([k, v]) => ({k, v: String(v)})), body: typeof r.body === "string" ? r.body : r.body ? jsonStr(r.body) : "", act_as: ""};
    router.go("#/api"); setTimeout(() => { renderBuilder(); builderEl.scrollIntoView({behavior: "smooth"}); }, 50);
  }
  async function renderRoutes(body) {
    const filter = h("input", {class: "input", placeholder: "filter routes (path, method, summary, tag)…", value: route.query.get("f") || ""});
    const listEl = h("div");
    builderEl = h("div");
    body.append(h("div", {class: "toolbar"}, filter, h("label", {class: "switch small"}, h("input", {type: "checkbox", id: "api-console-toggle"}), "include console routes"), refreshBtn(() => draw(true))), h("div", {class: "split split-narrow"}, listEl, builderEl));
    renderBuilder();
    if (pendingApiRoute) { const rt = pendingApiRoute; pendingApiRoute = null; setTimeout(() => loadRoute(rt), 0); }
    let routes = [];
    const draw = async (force) => {
      await load(listEl, async () => {
        routes = await getRoutes(force);
        const q = filter.value.trim().toLowerCase(); const inclConsole = $("#api-console-toggle", body)?.checked;
        const items = routes.filter((r) => (inclConsole || !r.console) && (!q || `${r.method} ${r.path} ${r.summary} ${(r.tags || []).join(" ")} ${r.auth}`.toLowerCase().includes(q)));
        if (!items.length) return empty("No routes match.");
        const wrap = h("div", {class: "grid-wrap tall"});
        wrap.append(grid([
          {key: "method", render: (v) => `<span class="chip chip-m chip-${esc(v)}">${esc(v)}</span>`, sortable: false},
          {key: "path", mono: true, render: (v) => `<b>${esc(v)}</b>`},
          {key: "summary", render: (v, r) => `${esc(v || "")}${(r.tags || []).length ? ` <span class="faint small">${esc(r.tags.join(", "))}</span>` : ""}${r.notes ? `<div class="faint small">${esc(r.notes)}</div>` : ""}`, wrap: true},
          {key: "auth", render: (v, r) => `${esc(v || "")}${(r.roles || []).length ? ` <span class="chip chip-info">${esc(r.roles.join(","))}</span>` : ""}`},
          {key: "traffic", label: "traffic", render: (t) => t ? `<span class="mono">${esc(t.count)}</span> <span class="muted small">p95 ${esc(t.p95_ms)}ms</span>${t.status_4xx ? ` <span class="chip chip-warn">${esc(t.status_4xx)} 4xx</span>` : ""}${t.status_5xx ? ` <span class="chip chip-fail">${esc(t.status_5xx)} 5xx</span>` : ""}` : `<span class="faint">—</span>`},
        ], items, {onRow: (r) => loadRoute(r)}));
        return wrap;
      });
    };
    filter.addEventListener("input", debounce(() => draw(false), 150));
    $("#api-console-toggle", body).addEventListener("change", () => draw(false));
    await draw(false);
  }
  async function renderTraffic(body) {
    const since = h("select", {class: "select input-sm"}, ...[["", "all (buffer)"], ["300", "5 min"], ["3600", "1 hour"], ["86400", "24 hours"]].map(([v, t]) => h("option", {value: v, text: t})));
    const routeFilter = h("input", {class: "input input-sm mono", placeholder: "route filter for recent"});
    const summaryEl = h("div"), recentEl = h("div");
    body.append(h("div", {class: "toolbar"}, h("span", {class: "muted small", text: "window"}), since, refreshBtn(() => draw())), h("div", {class: "split"}, h("div", {}, h("h3", {text: "Per route"}), summaryEl), h("div", {}, h("div", {class: "row"}, h("h3", {text: "Recent requests"}), routeFilter), recentEl)));
    let sort = {key: "count", order: "desc"};
    const draw = async () => {
      load(summaryEl, async () => {
        const t = await api.get("/api/traffic", {since_seconds: since.value || undefined});
        const out = h("div");
        out.append(h("div", {class: "muted small", style: "margin-bottom:6px", text: `buffer ${t.buffer.fill}/${t.buffer.capacity} · ${fmtNum(t.buffer.total)} total requests seen · ${t.history?.length || 0} snapshots stored`}));
        if (!t.items.length) { out.append(empty("No traffic recorded yet.")); return out; }
        const items = [...t.items].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : -1) * (sort.order === "asc" ? 1 : -1));
        const wrap = h("div", {class: "grid-wrap", style: "max-height:60vh"});
        wrap.append(grid([{key: "method", render: (v) => `<span class="chip chip-m chip-${esc(v)}">${esc(v)}</span>`}, {key: "route", mono: true}, {key: "count", num: true}, {key: "p50_ms", label: "p50", num: true}, {key: "p95_ms", label: "p95", num: true}, {key: "max_ms", label: "max", num: true}, {key: "status_4xx", label: "4xx", num: true, render: (v) => v ? `<span class="chip chip-warn">${esc(v)}</span>` : ""}, {key: "status_5xx", label: "5xx", num: true, render: (v) => v ? `<span class="chip chip-fail">${esc(v)}</span>` : ""}, {key: "last_seen", render: (v) => esc(ago(v))}], items, {sort: sort.key, order: sort.order, onSort: (k, o) => { sort = {key: k, order: o}; draw(); }, onRow: (r) => { routeFilter.value = r.route; drawRecent(); }}));
        out.append(wrap);
        return out;
      });
      drawRecent();
    };
    const drawRecent = () => load(recentEl, async () => {
      const r = await api.get("/api/traffic/recent", {limit: 200, route: routeFilter.value.trim() || undefined});
      if (!r.items.length) return empty("No recent requests.");
      const wrap = h("div", {class: "grid-wrap", style: "max-height:60vh"});
      wrap.append(grid([{key: "t", label: "at", render: (v) => `<span class="mono">${esc(fmtTs(v))}</span>`}, {key: "method", render: (v) => `<span class="chip chip-m chip-${esc(v)}">${esc(v)}</span>`}, {key: "path", mono: true}, {key: "status", render: (v) => `<span class="chip chip-${v < 300 ? "ok" : v < 500 ? "warn" : "fail"}">${esc(v)}</span>`}, {key: "ms", num: true}, {key: "request_id", label: "request", render: (v) => v ? (logsSource ? `<a class="mono" href="#/logs/${encodeURIComponent(logsSource)}?request_id=${encodeURIComponent(v)}">${esc(v)}</a>` : `<code>${esc(v)}</code>`) : ""}, {key: "principal"}], r.items));
      return wrap;
    });
    since.addEventListener("change", draw); routeFilter.addEventListener("keydown", (e) => { if (e.key === "Enter") drawRecent(); });
    await draw();
  }
  async function renderCollections(body) {
    const el = h("div"); body.append(h("div", {class: "toolbar"}, refreshBtn(() => draw())), el);
    const draw = () => load(el, async () => {
      const r = await api.get("/api/collections");
      if (!r.items.length) return empty("No collections. Build a request and “Save to collection…”.");
      const out = h("div");
      for (const c of r.items) {
        const card = h("div", {class: "card"});
        card.append(h("div", {class: "card-head"}, h("h2", {text: c.name}), h("span", {class: "muted small", text: `${c.requests.length} request(s) · ${ago(c.updated_at)}`}), h("button", {class: "btn btn-sm btn-danger", onclick: () => modal({title: "Delete collection", body: `Delete <b>${esc(c.name)}</b>?`, buttons: [{label: "Cancel", onClick: (x) => x()}, {label: "Delete", class: "btn-danger", onClick: (x) => { x(); guard(async () => { await api.del(`/api/collections/${encodeURIComponent(c.id)}`); draw(); }); }}]})}, "Delete")));
        const list = h("div");
        c.requests.forEach((rq, i) => list.append(h("div", {class: "list-item", onclick: () => loadSavedReq(rq)}, h("span", {html: `<span class="chip chip-m chip-${esc(rq.method || "GET")}">${esc(rq.method || "GET")}</span>`}), h("span", {class: "t mono", text: `${rq.path || ""}${rq.title ? "  — " + rq.title : ""}`}), h("button", {class: "btn btn-sm btn-ghost", title: "remove", onclick: (e) => { e.stopPropagation(); guard(async () => { await api.post("/api/collections", {name: c.name, requests: c.requests.filter((_, j) => j !== i)}); draw(); }); }}, "✕"))));
        card.append(list); out.append(card);
      }
      return out;
    });
    await draw();
  }
  async function runProbes() {
    guard(async () => {
      const run = await api.post("/api/probes/run");
      startRunUI(run, {title: "API probes", onFinish: (status, summary) => {
        if (!summary?.results) return;
        const wrap = h("div", {class: "grid-wrap"});
        wrap.append(grid([{key: "ok", render: (v) => v ? chip("ok") : chip("fail")}, {key: "method", render: (v) => `<span class="chip chip-m chip-${esc(v)}">${esc(v)}</span>`}, {key: "path", mono: true}, {key: "title"}, {key: "status", render: (v) => v === null ? "—" : esc(v)}, {key: "ms", num: true}, {key: "error", wrap: true}], summary.results));
        modal({title: `Probes: ${summary.ok}/${summary.checked} ok`, body: wrap, wide: true, buttons: [{label: "Close", onClick: (c) => c()}]});
      }});
      if (!events.live) toast("Live stream unavailable — open the drawer log to watch the probes", {kind: "warn"});
    });
  }
  async function render() {
    clear(root);
    const tab = route.parts[0] || "routes";
    root.append(sectionHead("API", hasProbes ? h("button", {class: "btn", onclick: runProbes}, "▶ Run probes") : null));
    const items = [{id: "routes", label: "Routes & request builder"}]; if (hasTraffic) items.push({id: "traffic", label: "Traffic"}); if (hasColl) items.push({id: "collections", label: "Collections"});
    root.append(tabs(items, tab, (id) => router.go(id === "routes" ? "#/api" : `#/api/${id}`)));
    const body = h("div"); root.append(body);
    if (tab === "traffic" && hasTraffic) await renderTraffic(body); else if (tab === "collections" && hasColl) await renderCollections(body); else await renderRoutes(body);
  }
  return {mount(el, r) { root = el; route = r; return render(); }, update(r) { const prev = route.parts[0] || "routes"; route = r; if ((r.parts[0] || "routes") !== prev) return render(); }, refresh() { apiCache.routes = null; return render(); }, loadRoute};
};

// ---- Users & Roles ---------------------------------------------------------------
SECTIONS.users = function usersSection() {
  let root, route;
  const can = (c) => state.can("users", c);
  async function renderUsers(body) {
    const el = h("div"); body.append(h("div", {class: "toolbar"}, refreshBtn(() => draw())), el);
    const draw = () => load(el, async () => {
      const [u, r] = await Promise.all([api.get("/users"), api.get("/users/roles")]);
      const known = r.items.map((x) => x.name);
      if (!u.items.length) return empty("No users.");
      const out = h("div");
      for (const user of u.items) {
        const card = h("div", {class: "card"});
        const head = h("div", {class: "card-head"}, h("h2", {}, h("code", {text: user.id})), h("span", {text: user.label}), h("span", {html: (user.roles || []).map((x) => chip(x, "info")).join(" ") + (user.disabled ? " " + chip("disabled", "fail") : "")}), h("span", {class: "muted small", text: `last seen ${user.last_seen_at ? ago(user.last_seen_at) : "never"}`}), h("span", {class: "grow"}));
        if (can("set_roles")) head.append(h("button", {class: "btn btn-sm", onclick: () => editRoles(user, known, draw)}, "Roles…"));
        if (can("disable")) head.append(h("button", {class: `btn btn-sm${user.disabled ? "" : " btn-danger"}`, onclick: async () => {
          const ok = await confirmTyped({title: user.disabled ? "Enable user" : "Disable user", message: `${user.disabled ? "Enable" : "Disable"} <b>${esc(user.label)}</b> (<code>${esc(user.id)}</code>).`, expect: user.id, verb: user.disabled ? "Enable" : "Disable", danger: !user.disabled});
          if (ok) guard(async () => { await api.post(`/users/${encodeURIComponent(user.id)}/disabled`, {disabled: !user.disabled, confirm: user.id}); toast(`${user.id} ${user.disabled ? "enabled" : "disabled"}`, {kind: "ok"}); draw(); });
        }}, user.disabled ? "Enable…" : "Disable…"));
        if (can("issue_token")) head.append(h("button", {class: "btn btn-sm", onclick: () => issueToken(user, draw)}, "Issue token…"));
        card.append(head);
        const cb = h("div", {class: "card-body"});
        if (user.extra && Object.keys(user.extra).length) cb.append(detailsBlock("extra", kv(user.extra)));
        const toks = user.tokens || [];
        cb.append(h("h3", {text: `Tokens (${toks.length})`}));
        if (!toks.length) cb.append(h("div", {class: "muted small", text: "none"}));
        else { const wrap = h("div", {class: "grid-wrap"}); wrap.append(grid([{key: "id", mono: true}, {key: "issued_at", label: "issued", render: (v) => esc(fmtTs(v))}, {key: "expires_at", label: "expires", render: (v) => esc(fmtTs(v))}, {key: "last_used_at", label: "last used", render: (v) => v ? esc(ago(v)) : "never"}, {key: "revoked_at", label: "status", render: (v) => v ? chip("revoked", "fail") : chip("active", "ok")}, {key: "_", label: "", render: (v, t) => can("revoke") && !t.revoked_at ? `<button class="btn btn-sm btn-danger" data-revoke="${escAttr(t.id)}">Revoke…</button>` : ""}], toks)); cb.append(wrap);
          $$("[data-revoke]", wrap).forEach((b) => b.addEventListener("click", async () => { const tid = b.dataset.revoke; const ok = await confirmTyped({title: "Revoke token", message: `Revoke token <code>${esc(tid)}</code> of ${esc(user.label)}.`, expect: tid, verb: "Revoke"}); if (ok) guard(async () => { await api.post(`/users/tokens/${encodeURIComponent(tid)}/revoke`, {confirm: tid}); toast("Token revoked", {kind: "ok"}); draw(); }); })); }
        card.append(cb); out.append(card);
      }
      return out;
    });
    await draw();
  }
  function editRoles(user, known, done) {
    const boxes = known.map((n) => { const cb = h("input", {type: "checkbox", value: n}); cb.checked = (user.roles || []).includes(n); return cb; });
    const extra = h("input", {class: "input mono", placeholder: "additional roles, comma-separated", value: (user.roles || []).filter((x) => !known.includes(x)).join(", ")});
    const body = h("div", {class: "col"}, h("div", {class: "muted small", text: "Known roles"}), ...boxes.map((cb) => h("label", {class: "switch"}, cb, " ", cb.value)), h("div", {class: "field"}, h("label", {text: "other"}), extra));
    modal({title: `Roles for ${user.label}`, body, buttons: [{label: "Cancel", onClick: (c) => c()}, {label: "Continue…", class: "btn-primary", onClick: async (c) => {
      const roles = Array.from(new Set([...boxes.filter((b) => b.checked).map((b) => b.value), ...extra.value.split(",").map((s) => s.trim()).filter(Boolean)]));
      c();
      const ok = await confirmTyped({title: "Set roles", message: `Set roles of <b>${esc(user.label)}</b> to: ${roles.map((x) => chip(x, "info")).join(" ") || "<i>none</i>"}`, expect: user.id, verb: "Set roles", danger: false});
      if (ok) guard(async () => { await api.post(`/users/${encodeURIComponent(user.id)}/roles`, {roles, confirm: user.id}); toast("Roles updated", {kind: "ok"}); done(); });
    }}]});
  }
  function issueToken(user, done) {
    const ttl = h("select", {class: "select"}, ...[[3600, "1 hour"], [86400, "1 day"], [7 * 86400, "7 days"], [30 * 86400, "30 days"], [90 * 86400, "90 days"], [365 * 86400, "1 year"]].map(([v, t]) => h("option", {value: String(v), text: t}))); ttl.value = String(30 * 86400);
    modal({title: `Issue token for ${user.label}`, body: h("div", {class: "field"}, h("label", {text: "time to live"}), ttl), buttons: [{label: "Cancel", onClick: (c) => c()}, {label: "Continue…", class: "btn-primary", onClick: async (c) => {
      c();
      const ok = await confirmTyped({title: "Issue token", message: `Issue a new API token for <b>${esc(user.label)}</b>. The plaintext is shown once.`, expect: user.id, verb: "Issue", danger: false});
      if (!ok) return;
      guard(async () => {
        const r = await api.post(`/users/${encodeURIComponent(user.id)}/tokens`, {ttl_seconds: Number(ttl.value), confirm: user.id});
        const box = h("div", {class: "token-box", text: r.plaintext});
        modal({title: "Token issued — copy it now", body: h("div", {class: "col"}, h("div", {class: "callout callout-warn", text: r.note || "Shown once; the console does not store it."}), box, kv({token_id: r.token_id, expires_at: fmtTs(r.expires_at)})), buttons: [{label: "Copy", class: "btn-primary", onClick: () => copyText(r.plaintext).then((ok) => toast(ok ? "Copied to clipboard" : "Copy failed — select the text", {kind: ok ? "ok" : "warn"}))}, {label: "Close", onClick: (c) => c()}]});
        done();
      });
    }}]});
  }
  async function renderRoles(body) {
    const el = h("div"); body.append(h("div", {class: "toolbar"}, refreshBtn(() => draw())), el);
    const draw = () => load(el, async () => {
      const r = await api.get("/users/roles");
      if (!r.items.length) return empty("No roles defined.");
      const grants = Array.from(new Set(r.items.flatMap((x) => x.grants || []))).sort();
      const out = h("div", {class: "col"});
      const wrap = h("div", {class: "grid-wrap"});
      wrap.append(grid([{key: "name", render: (v) => chip(v, "info")}, {key: "description", wrap: true}, {key: "grants", render: (v) => (v || []).map((g) => `<code>${esc(g)}</code>`).join(" ")}], r.items));
      out.append(wrap);
      if (grants.length) {
        const m = h("table", {class: "grid matrix"});
        m.append(h("thead", {}, h("tr", {}, h("th", {text: "grant \\ role"}), ...r.items.map((x) => h("th", {text: x.name})))));
        const tb = h("tbody");
        for (const g of grants) tb.append(h("tr", {}, h("td", {class: "mono", text: g}), ...r.items.map((x) => h("td", {class: (x.grants || []).includes(g) ? "y" : "n", text: (x.grants || []).includes(g) ? "✓" : "·"}))));
        m.append(tb);
        const w2 = h("div", {class: "grid-wrap"}); w2.append(m); out.append(h("h3", {text: "Matrix"}), w2);
      }
      return out;
    });
    await draw();
  }
  async function render() {
    clear(root);
    const tab = route.parts[0] === "roles" ? "roles" : "users";
    root.append(sectionHead("Users & Roles"), tabs([{id: "users", label: "Users"}, {id: "roles", label: "Roles"}], tab, (id) => router.go(id === "users" ? "#/users" : "#/users/roles")));
    const body = h("div"); root.append(body);
    if (tab === "roles") await renderRoles(body); else await renderUsers(body);
  }
  return {mount(el, r) { root = el; route = r; return render(); }, update(r) { route = r; return render(); }, refresh: () => render()};
};

// ---- Backups -------------------------------------------------------------------
SECTIONS.backups = function backupsSection() {
  let root, unsubs = [];
  const canCreate = state.can("backups", "create"), canRestore = state.can("backups", "restore"), canDl = state.caps("backups").has("download");
  let listEl, runsEl;
  async function drawList() {
    await load(listEl, async () => {
      const r = await api.get("/backups");
      const out = h("div");
      if (r.running?.backup || r.running?.restore) out.append(h("div", {class: "callout callout-info", text: `${r.running.backup ? "A backup is running. " : ""}${r.running.restore ? "A restore is running." : ""}`}));
      for (const p of r.providers) {
        const card = h("div", {class: "card"});
        const selIn = h("input", {class: "input input-sm", placeholder: "selection (optional)"});
        const head = h("div", {class: "card-head"}, h("h2", {text: p.kind}), h("span", {class: "muted small", text: `${p.items.length} backup(s)`}), h("span", {class: "grow"}));
        if (canCreate) head.append(selIn, h("button", {class: "btn btn-sm btn-primary", disabled: !!r.running?.backup, onclick: () => guard(async () => { const run = await api.post("/backups", {kind: p.kind, selection: selIn.value.trim() || null}); startRunUI(run, {title: `Backup ${p.kind}`, onFinish: () => refresh()}); })}, "Create backup"));
        card.append(head);
        const cb = h("div", {class: "card-body flush"});
        if (p.error) cb.append(h("div", {class: "callout callout-fail", text: p.error}));
        if (!p.items.length) cb.append(empty("No backups yet."));
        else {
          const wrap = h("div", {class: "grid-wrap"});
          wrap.append(grid([{key: "id", mono: true}, {key: "label"}, {key: "created_at", label: "created", render: (v) => `${esc(fmtTs(v))} <span class="faint">${esc(ago(v))}</span>`}, {key: "bytes", label: "size", num: true, render: (v) => esc(fmtBytes(v))}, {key: "verified", render: (v) => v === null || v === undefined ? "" : v ? chip("verified", "ok") : chip("unverified", "warn")},
            {key: "_", label: "", render: (v, b) => `${canDl ? `<a class="btn btn-sm" href="${escAttr(api.url(`/backups/${encodeURIComponent(p.kind)}/${encodeURIComponent(b.id)}/download`))}" target="_blank">⇩ Download</a> ` : ""}${canRestore ? `<button class="btn btn-sm btn-danger" data-restore="${escAttr(b.id)}">Restore…</button>` : ""}`}], p.items));
          $$("[data-restore]", wrap).forEach((btn) => btn.addEventListener("click", () => restore(p.kind, btn.dataset.restore)));
          cb.append(wrap);
        }
        card.append(cb); out.append(card);
      }
      if (!r.providers.length) out.append(empty("No backup providers configured."));
      return out;
    });
  }
  function restore(kind, bid) {
    guard(async () => {
      const plan = await api.post(`/backups/${encodeURIComponent(bid)}/restore/plan`, undefined, {kind});
      const body = h("div", {class: "col"}, h("div", {text: plan.summary}),
        plan.will_replace?.length ? h("div", {}, h("h3", {text: "Will replace"}), h("div", {class: "mono small wrap", text: plan.will_replace.join("\n")})) : null,
        ...(plan.warnings || []).map((w) => h("div", {class: "callout callout-warn", text: w})));
      const ok = await confirmTyped({title: `Restore ${kind} backup`, message: "", extra: body, expect: bid, verb: "Restore"});
      if (!ok) return;
      const run = await api.post(`/backups/${encodeURIComponent(bid)}/restore`, {kind, confirm: bid});
      startRunUI(run, {title: `Restore ${kind} ${bid}`, onFinish: () => { dataCache.tables = null; schemaCache.map = null; refresh(); }});
    });
  }
  async function drawRuns() {
    await load(runsEl, async () => {
      const r = await api.get("/backups/runs", {limit: 30});
      if (!r.items.length) return empty("No backup or restore runs yet.");
      const wrap = h("div", {class: "grid-wrap"});
      wrap.append(grid([{key: "id", mono: true}, {key: "kind"}, {key: "status", render: (v) => chip(v)}, {key: "selection", mono: true}, {key: "started_at", label: "started", render: (v) => esc(fmtTs(v))}, {key: "finished_at", label: "duration", render: (v, x) => v ? esc(fmtDur((new Date(v) - new Date(x.started_at)) / 1000)) : "…"}, {key: "summary", render: (v) => v ? `<span class="mono small">${esc(truncate(jsonStr(v, 0), 120))}</span>` : ""}], r.items, {onRow: (run) => guard(async () => { if (run.status === "running") { drawer.track({...run, tail: []}, {title: `${run.kind} ${run.id}`}); } else modal({title: `${run.kind} ${run.id}`, body: jsonView(run), buttons: [{label: "Close", onClick: (c) => c()}]}); })}));
      return wrap;
    });
  }
  function refresh() { drawList(); drawRuns(); }
  return {
    mount(el) {
      root = el;
      listEl = h("div"); runsEl = h("div");
      root.append(sectionHead("Backups", refreshBtn(refresh)), listEl, h("h3", {style: "margin:12px 0 6px", text: "Runs"}), runsEl);
      refresh();
      ["run:backup", "run:restore"].forEach((t) => unsubs.push(events.on(t, (d) => { if (d?.event === "finished" || d?.event === "started") setTimeout(refresh, 300); })));
      unsubs.push(events.on("poll", refresh));
    },
    unmount() { unsubs.forEach((u) => u()); }, refresh,
  };
};

// ---- Tests --------------------------------------------------------------------
SECTIONS.tests = function testsSection() {
  let root, route, unsubs = [], treeObj = null, treeItems = [], treeEl, histEl, running = null, lastFailed = new Set();
  const caps = state.caps("tests");
  const selectionOf = (items, checked) => { const ids = items.filter((n) => checked.has(n.id) && !(n.parent && checked.has(n.parent))).map((n) => n.id); return ids; };
  async function startRun(body) {
    guard(async () => {
      const run = await api.post("/tests/run", body);
      running = run.id; drawHistory();
      startRunUI(run, {title: `Tests${body.selection ? ": " + truncate(body.selection, 60) : ""}`, statusUrl: `/tests/runs/${run.id}`, cancelUrl: caps.has("cancel") ? `/tests/runs/${run.id}/cancel` : null, onFinish: () => { running = null; drawHistory(); drawTree(false); }});
    });
  }
  async function drawTree(refresh) {
    await load(treeEl, async () => {
      const r = await api.get("/tests/tree", refresh ? {refresh: true} : undefined);
      treeItems = r.items;
      const status = new Map(); lastFailed.forEach((id) => status.set(id, "failed"));
      const prev = treeObj?.checked || new Set();
      treeObj = tree(r.items, {checked: new Set(Array.from(prev).filter((id) => r.items.some((n) => n.id === id))), status, collapsed: treeObj?.collapsed || new Set(r.items.filter((n) => n.kind === "class").map((n) => n.id))});
      const wrap = h("div", {class: "list-scroll", style: "max-height:calc(100vh - 300px)"}, treeObj.el);
      return h("div", {}, h("div", {class: "muted small", style: "margin-bottom:6px", text: `${r.count} test(s) collected`}), wrap);
    });
  }
  async function drawHistory() {
    await load(histEl, async () => {
      const r = await api.get("/tests/runs", {limit: 30});
      running = r.running;
      if (r.items[0]?.summary?.failed_ids) lastFailed = new Set(r.items[0].summary.failed_ids);
      if (!r.items.length) return empty("No test runs yet.");
      const wrap = h("div", {class: "grid-wrap"});
      wrap.append(grid([{key: "status", render: (v) => chip(v)}, {key: "id", mono: true}, {key: "selection", mono: true, render: (v) => esc(v || "(all)")}, {key: "started_at", label: "started", render: (v) => `${esc(fmtTs(v))} <span class="faint">${esc(ago(v))}</span>`}, {key: "finished_at", label: "duration", render: (v, x) => v ? esc(fmtDur((new Date(v) - new Date(x.started_at)) / 1000)) : "…"},
        {key: "summary", render: (s) => s ? `${s.passed !== undefined ? `<span class="chip chip-ok">${esc(s.passed)} passed</span> ` : ""}${s.failed ? `<span class="chip chip-fail">${esc(s.failed)} failed</span> ` : ""}${s.errors ? `<span class="chip chip-error">${esc(s.errors)} errors</span> ` : ""}${s.skipped ? `<span class="chip">${esc(s.skipped)} skipped</span> ` : ""}${s.line ? `<span class="muted small">${esc(truncate(s.line, 80))}</span>` : ""}${s.error ? `<span class="chip chip-error">${esc(truncate(s.error, 80))}</span>` : ""}` : ""}], r.items, {onRow: (run) => router.go(`#/tests/runs/${encodeURIComponent(run.id)}`)}));
      return wrap;
    });
  }
  async function renderRun(rid) {
    clear(root);
    const body = h("div");
    root.append(sectionHead(crumbs({text: "Tests", href: "#/tests"}, {text: rid}), refreshBtn(() => draw())), body);
    const draw = () => load(body, async () => {
      const [st, log] = await Promise.all([api.get(`/tests/runs/${encodeURIComponent(rid)}`, {tail: 1}), api.get(`/tests/runs/${encodeURIComponent(rid)}/log`)]);
      const out = h("div", {class: "col"});
      const s = st.summary || {};
      out.append(h("div", {class: "row"}, h("span", {html: chip(st.status)}), h("span", {class: "muted", text: `selection: ${st.selection || "(all)"} · started ${fmtTs(st.started_at)}${st.finished_at ? " · finished " + fmtTs(st.finished_at) : ""} · exit ${st.exit_code ?? "—"}`}), h("span", {class: "grow"}),
        st.status === "running" ? h("button", {class: "btn btn-sm", onclick: () => drawer.track(st, {title: `Tests ${rid}`, statusUrl: `/tests/runs/${rid}`, cancelUrl: caps.has("cancel") ? `/tests/runs/${rid}/cancel` : null})}, "Watch in drawer") : null,
        h("button", {class: "btn btn-sm", onclick: () => startRun({selection: st.selection || null})}, "▶ Re-run this selection"),
        s.failed_ids?.length ? h("button", {class: "btn btn-sm btn-danger", onclick: () => startRun({selection: s.failed_ids.slice(0, 100).join(" ")})}, `▶ Re-run ${s.failed_ids.length} failed`) : null));
      if (Object.keys(s).length) out.append(kv({passed: s.passed, failed: s.failed, errors: s.errors, skipped: s.skipped, line: s.line, error: s.error}));
      if (s.failed_ids?.length) out.append(h("div", {}, h("h3", {text: "Failed"}), ...s.failed_ids.map((id) => h("div", {class: "mono small", style: "color:var(--fail)", text: id}))));
      out.append(h("h3", {text: `Log (${log.count} lines)`}), h("div", {class: "drawer-body", style: "max-height:60vh;border:1px solid var(--border);border-radius:4px"}, ...log.lines.map((l) => h("div", {class: `ln ${drawer.lineClass(l)}`, text: l}))));
      return out;
    });
    await draw();
  }
  async function render() {
    clear(root);
    if (route.parts[0] === "runs" && route.parts[1]) return renderRun(route.parts[1]);
    const kIn = h("input", {class: "input mono", placeholder: "or type a selection / -k expression"});
    const runBtn = h("button", {class: "btn btn-primary", onclick: () => { const sel = kIn.value.trim() || (treeObj ? selectionOf(treeItems, treeObj.checked).join(" ") : ""); startRun({selection: sel || null}); }}, "▶ Run");
    const rerunBtn = caps.has("rerun_failed") ? h("button", {class: "btn", onclick: () => guard(async () => { const run = await api.post("/tests/rerun-failed"); running = run.id; drawHistory(); startRunUI(run, {title: "Re-run failed", statusUrl: `/tests/runs/${run.id}`, cancelUrl: `/tests/runs/${run.id}/cancel`, onFinish: () => { running = null; drawHistory(); drawTree(false); }}); })}, "▶ Re-run failed") : null;
    const cancelBtn = caps.has("cancel") ? h("button", {class: "btn btn-danger", onclick: () => guard(async () => { const r = await api.get("/tests/runs", {limit: 1}); if (!r.running) { toast("No run in progress", {kind: "info"}); return; } await api.post(`/tests/runs/${encodeURIComponent(r.running)}/cancel`); toast("Cancel requested", {kind: "warn"}); })}, "■ Cancel running") : null;
    treeEl = h("div"); histEl = h("div");
    root.append(sectionHead("Tests", kIn, runBtn, rerunBtn, cancelBtn, refreshBtn(() => { drawTree(true); drawHistory(); }, "Recollect")));
    root.append(h("div", {class: "split split-narrow"},
      h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Tests"}), h("span", {class: "muted small", text: "tick files/classes/tests to build a selection"}), h("button", {class: "btn btn-sm btn-ghost", onclick: () => { treeObj?.checked.clear(); treeObj?.render(); }}, "clear")), h("div", {class: "card-body"}, treeEl)),
      h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "History"})), h("div", {class: "card-body flush"}, histEl))));
    await drawHistory();
    await drawTree(false);
  }
  return {
    mount(el, r) { root = el; route = r; unsubs.push(events.on("run:tests", (d) => { if (d?.event === "finished" || d?.event === "started") setTimeout(() => { if (histEl) drawHistory(); }, 300); })); return render(); },
    update(r) { route = r; return render(); }, unmount() { unsubs.forEach((u) => u()); }, refresh: () => render(),
  };
};

// ---- Logs ----------------------------------------------------------------------
SECTIONS.logs = function logsSection() {
  let root, route, unsubs = [], linesEl, paused = false, buffered = [], groupBy = false, source = null, filters = {}, expanded = new Set(), live = [];
  const LEVELS = ["", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];
  function matches(line) {
    if (filters.level && String(line.level || "").toUpperCase() !== filters.level && !(filters.level === "WARNING" && String(line.level).toUpperCase() === "WARN")) {
      const order = {DEBUG: 0, INFO: 1, WARN: 2, WARNING: 2, ERROR: 3, CRITICAL: 4}; if ((order[String(line.level).toUpperCase()] ?? 0) < (order[filters.level] ?? 0)) return false;
    }
    if (filters.request_id && line.request_id !== filters.request_id) return false;
    if (filters.logger && !String(line.logger || "").includes(filters.logger)) return false;
    if (filters.contains && !jsonStr(line, 0).toLowerCase().includes(filters.contains.toLowerCase())) return false;
    return true;
  }
  function lineNode(l, i) {
    const extra = Object.fromEntries(Object.entries(l).filter(([k]) => !["ts", "level", "message", "logger", "request_id"].includes(k)));
    const key = `${l.ts}|${i}`;
    const row = h("div", {class: "log-line"}, h("span", {class: "mono faint", text: fmtTs(l.ts)}), h("span", {class: `lv lv-${esc(String(l.level || "").toUpperCase())}`, text: l.level || ""}),
      h("span", {class: "msg"}, l.logger ? h("span", {class: "muted", text: `${l.logger} `}) : null, String(l.message ?? ""), l.request_id ? h("span", {}, " ", h("span", {class: "rid", title: "filter by request", text: l.request_id, onclick: (e) => { e.stopPropagation(); router.setQuery({request_id: l.request_id}); }})) : null));
    const out = h("div", {}, row);
    const exc = extra.exc_text || extra.exception || extra.traceback || extra.exc_info;
    const detail = h("div", {class: `log-extra${expanded.has(key) ? "" : " hidden"}`});
    if (Object.keys(extra).length) detail.append(kv(extra, {render: (k, v) => (typeof v === "string" && v.includes("\n")) ? h("pre", {text: v}) : renderCell(v)}));
    else detail.append(h("div", {class: "muted small", text: "no extra fields"}));
    if (exc && typeof exc === "string") detail.append(h("pre", {style: "color:var(--fail)", text: exc}));
    row.addEventListener("click", () => { if (expanded.has(key)) expanded.delete(key); else expanded.add(key); detail.classList.toggle("hidden"); });
    out.append(detail);
    return out;
  }
  function renderLines(items) {
    clear(linesEl);
    if (!items.length) { linesEl.append(empty("No log lines match.")); return; }
    if (groupBy) {
      const groups = new Map();
      for (const l of items) { const k = l.request_id || "(no request)"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
      let i = 0;
      for (const [k, ls] of groups) { linesEl.append(h("div", {class: "log-group"}, h("span", {class: "rid", text: k, onclick: () => k !== "(no request)" && router.setQuery({request_id: k})}), ` · ${ls.length} line(s)`)); ls.forEach((l) => linesEl.append(lineNode(l, i++))); }
    } else items.forEach((l, i) => linesEl.append(lineNode(l, i)));
    linesEl.scrollTop = linesEl.scrollHeight;
  }
  let current = [];
  async function fetchTail() {
    clear(linesEl).append(loading("Loading log…"));
    try {
      const r = await api.get(`/logs/${encodeURIComponent(source)}`, {...filters, limit: filters.limit || 200, follow: source !== "activity" ? true : undefined});
      if (r.available === false) { clear(linesEl).append(h("div", {class: "callout callout-warn", text: `Source unavailable: ${r.reason || "unknown"}`})); return; }
      current = [...r.items].reverse();   // API returns newest first; show oldest → newest
      live = [];
      renderLines(current);
    } catch (e) { clear(linesEl).append(errorBox(e)); toastError(e); }
  }
  async function render() {
    clear(root);
    const sources = await guard(() => api.get("/logs/sources")) || {items: []};
    source = route.parts[0] || sources.items.find((s) => s.available)?.id || sources.items[0]?.id;
    filters = {level: route.query.get("level") || "", request_id: route.query.get("request_id") || "", logger: route.query.get("logger") || "", contains: route.query.get("contains") || "", since: route.query.get("since") || "", limit: route.query.get("limit") || "200"};
    const lvl = h("select", {class: "select input-sm"}, ...LEVELS.map((l) => h("option", {value: l, text: l || "any level"}))); lvl.value = filters.level;
    const rid = h("input", {class: "input input-sm mono", placeholder: "request_id", value: filters.request_id, style: "width:150px"});
    const lg = h("input", {class: "input input-sm mono", placeholder: "logger", value: filters.logger, style: "width:130px"});
    const ct = h("input", {class: "input input-sm", placeholder: "contains…", value: filters.contains});
    const since = h("input", {class: "input input-sm mono", placeholder: "since (ISO)", value: filters.since, style: "width:170px"});
    const lim = h("select", {class: "select input-sm"}, ...["100", "200", "500", "1000", "2000"].map((n) => h("option", {value: n, text: `${n} lines`}))); lim.value = filters.limit;
    const apply = () => router.setQuery({level: lvl.value, request_id: rid.value.trim(), logger: lg.value.trim(), contains: ct.value.trim(), since: since.value.trim(), limit: lim.value});
    [rid, lg, ct, since].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); }));
    [lvl, lim].forEach((i) => i.addEventListener("change", apply));
    const pauseBtn = h("button", {class: "btn btn-sm", onclick: () => { paused = !paused; pauseBtn.textContent = paused ? `▶ Resume (${buffered.length})` : "❚❚ Pause"; pauseBtn.classList.toggle("on", paused); if (!paused) { buffered.forEach((l) => append(l)); buffered = []; } }}, "❚❚ Pause");
    const groupBtn = h("button", {class: `btn btn-sm${groupBy ? " on" : ""}`, onclick: () => { groupBy = !groupBy; groupBtn.classList.toggle("on", groupBy); renderLines(current.concat(live)); }}, "group by request");
    const liveDot = h("span", {class: `sse-dot ${events.live ? "live" : "poll"}`, title: events.live ? "live via SSE" : "SSE unavailable — refresh to poll"});
    root.append(sectionHead("Logs", liveDot, pauseBtn, groupBtn, refreshBtn(fetchTail)));
    root.append(tabs(sources.items.map((s) => ({id: s.id, label: s.available ? s.title : `${s.title} (unavailable)`})), source, (id) => router.go(`#/logs/${encodeURIComponent(id)}`)));
    const unavailable = sources.items.find((s) => s.id === source && !s.available);
    root.append(h("div", {class: "toolbar"}, lvl, rid, lg, ct, since, lim, h("button", {class: "btn btn-sm", onclick: apply}, "Apply"), h("button", {class: "btn btn-sm btn-ghost", onclick: () => router.go(`#/logs/${encodeURIComponent(source)}`)}, "clear")));
    if (unavailable) root.append(h("div", {class: "callout callout-warn", text: `Source unavailable: ${unavailable.reason || "unknown"}`}));
    linesEl = h("div", {class: "log-lines"}); root.append(linesEl);
    if (source) await fetchTail();
  }
  function append(l) { if (!matches(l)) return; live.push(l); if (live.length > 2000) live.shift(); if (groupBy) renderLines(current.concat(live)); else { if (linesEl.querySelector(".empty")) clear(linesEl); const atBottom = linesEl.scrollTop + linesEl.clientHeight >= linesEl.scrollHeight - 10; linesEl.append(lineNode(l, current.length + live.length)); if (atBottom) linesEl.scrollTop = linesEl.scrollHeight; } }
  return {
    mount(el, r) {
      root = el; route = r;
      unsubs.push(events.on("*", (d, topic) => { if (topic === `logs:${source}`) { if (paused) buffered.push(d); else append(d); } }));
      unsubs.push(events.on("activity", () => { if (source === "activity" && !paused) fetchTail(); }));
      return render();
    },
    update(r) { route = r; return render(); }, unmount() { unsubs.forEach((u) => u()); }, refresh: () => fetchTail(),
  };
};

// ---- Checks ------------------------------------------------------------------------
const checkLive = new Map();   // `${run_id}:${check_id}` -> entry from SSE (has table/section/title)
function sampleLink(sample, entry) {
  const s = String(sample);
  if (entry?.table && /^[A-Za-z0-9_-]{1,64}$/.test(s)) return `<a class="mono" href="#/data/${encodeURIComponent(entry.table)}/row/${encodeURIComponent(s)}">${esc(s)}</a>`;
  let m = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+) -> ([A-Za-z0-9_]+): (\d+)$/.exec(s);
  if (m) return `<a class="mono" href="#/data/${encodeURIComponent(m[1])}?${encodeURIComponent(`filter[${m[2]}]`)}=notnull">${esc(s)}</a>`;
  m = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/.exec(s);
  if (m) return `<a class="mono" href="#/schema/${encodeURIComponent(m[1])}">${esc(s)}</a>`;
  m = /^extra table ([A-Za-z0-9_]+)$/.exec(s);
  if (m) return esc(s);
  return `<span class="mono">${esc(s)}</span>`;
}
SECTIONS.checks = function checksSection() {
  let root, route, unsubs = [], regEl, histEl, registry = [], selected = new Set();
  async function drawRegistry() {
    await load(regEl, async () => {
      const r = await api.get("/checks");
      registry = r.items;
      state.badges.failing = registry.filter((c) => ["fail", "error"].includes(c.last?.status)).length; renderBadges();
      if (!registry.length) return empty("No checks registered.");
      const wrap = h("div", {class: "grid-wrap"});
      wrap.append(grid([
        {key: "id", mono: true, render: (v, c) => `<b>${esc(v)}</b>${c.builtin ? ' <span class="faint small">builtin</span>' : ""}`}, {key: "title", wrap: true}, {key: "severity", render: (v) => chip(v)}, {key: "section", render: (v) => `<a href="#/${esc(v)}">${esc(v)}</a>`},
        {key: "last", label: "last status", render: (l) => l ? `${chip(l.status)} <span class="mono">${esc(l.count ?? "")}</span>` : '<span class="faint">never run</span>'},
        {key: "last", label: "last run", render: (l) => l ? `<a class="mono small" href="#/checks/runs/${encodeURIComponent(l.run_id)}">${esc(ago(l.at))}</a>` : ""},
      ], registry, {selectable: true, isSelected: (c) => selected.has(c.id), onSelect: (c, checked, all) => { for (const x of all || [c]) { if (checked) selected.add(x.id); else selected.delete(x.id); } drawRegistry(); }, rowKey: (c) => c.id}));
      return h("div", {}, r.last_run ? h("div", {class: "muted small", style: "margin-bottom:6px"}, "last run ", h("a", {href: `#/checks/runs/${encodeURIComponent(r.last_run.id)}`, class: "mono", text: r.last_run.id}), ` ${ago(r.last_run.finished_at || r.last_run.started_at)} · `, h("span", {html: chip(r.last_run.status)})) : null, wrap);
    });
  }
  async function drawHistory() {
    await load(histEl, async () => {
      const r = await api.get("/checks/runs", {limit: 30});
      if (!r.items.length) return empty("No check runs yet.");
      const wrap = h("div", {class: "grid-wrap"});
      wrap.append(grid([{key: "status", render: (v) => chip(v)}, {key: "id", mono: true}, {key: "selection", mono: true, render: (v) => esc(v ? truncate(v, 60) : "(all)")}, {key: "started_at", label: "started", render: (v) => `${esc(fmtTs(v))} <span class="faint">${esc(ago(v))}</span>`},
        {key: "summary", render: (s) => { const x = s?.summary || {}; return `${x.pass ? `<span class="chip chip-ok">${esc(x.pass)} pass</span> ` : ""}${x.info ? `<span class="chip chip-info">${esc(x.info)} info</span> ` : ""}${x.warn ? `<span class="chip chip-warn">${esc(x.warn)} warn</span> ` : ""}${x.fail ? `<span class="chip chip-fail">${esc(x.fail)} fail</span> ` : ""}${x.error ? `<span class="chip chip-error">${esc(x.error)} error</span>` : ""}${s?.error ? `<span class="chip chip-error">${esc(truncate(s.error, 80))}</span>` : ""}`; }}], r.items, {onRow: (run) => router.go(`#/checks/runs/${encodeURIComponent(run.id)}`)}));
      return wrap;
    });
  }
  function run(only) {
    guard(async () => {
      const r = await api.post("/checks/run", only?.length ? {only} : {});
      startRunUI(r, {title: only?.length ? `Checks (${only.length})` : "All checks", statusUrl: `/checks/runs/${r.id}`, onFinish: () => { drawRegistry(); drawHistory(); if (route.parts[0] !== "runs") router.go(`#/checks/runs/${encodeURIComponent(r.id)}`); }});
    });
  }
  async function renderRun(rid) {
    clear(root);
    const body = h("div");
    root.append(sectionHead(crumbs({text: "Checks", href: "#/checks"}, {text: rid}), refreshBtn(() => draw())), body);
    const draw = () => load(body, async () => {
      const [d, reg] = await Promise.all([api.get(`/checks/runs/${encodeURIComponent(rid)}`), registry.length ? Promise.resolve({items: registry}) : api.get("/checks")]);
      registry = reg.items;
      const byId = Object.fromEntries(registry.map((c) => [c.id, c]));
      const out = h("div", {class: "col"});
      const x = d.summary?.summary || {};
      out.append(h("div", {class: "row"}, h("span", {html: chip(d.status)}), h("span", {class: "muted", text: `${d.summary?.checked ?? d.results.length} check(s) · started ${fmtTs(d.started_at)}${d.finished_at ? " · " + fmtDur((new Date(d.finished_at) - new Date(d.started_at)) / 1000) : ""}`}), h("span", {html: ["pass", "info", "warn", "fail", "error"].filter((k) => x[k]).map((k) => chip(`${x[k]} ${k}`, k === "pass" ? "ok" : k)).join(" ")}), h("span", {class: "grow"}),
        d.status === "running" ? h("button", {class: "btn btn-sm", onclick: () => drawer.track(d, {title: `Checks ${rid}`, statusUrl: `/checks/runs/${rid}`})}, "Watch in drawer") : null,
        h("button", {class: "btn btn-sm", onclick: () => run(d.selection ? d.selection.split(",") : null)}, "▶ Run again")));
      if (!d.results.length) out.append(d.status === "running" ? loading("Running…") : empty("No results recorded."));
      const order = {error: 0, fail: 1, warn: 2, info: 3, pass: 4};
      for (const res of [...d.results].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))) {
        const c = byId[res.check_id] || {}; const liveEntry = checkLive.get(`${rid}:${res.check_id}`);
        const card = h("div", {class: "card"});
        card.append(h("div", {class: "card-head"}, h("span", {html: chip(res.status)}), h("b", {text: c.title || res.check_id}), h("code", {class: "muted", text: res.check_id}), h("span", {class: "muted small", text: `count ${res.count ?? "—"} · ${res.ms ?? "?"} ms`}), c.section ? h("a", {class: "small", href: `#/${c.section}`, text: c.section}) : null));
        const cb = h("div", {class: "card-body"});
        if (res.hint) cb.append(h("div", {class: "muted", text: res.hint}));
        if (res.samples?.length) cb.append(h("div", {style: "margin-top:4px"}, h("h3", {text: `Samples (${res.samples.length})`}), ...res.samples.map((s) => h("div", {class: "small", html: sampleLink(s, liveEntry || c)}))));
        card.append(cb); out.append(card);
      }
      return out;
    });
    await draw();
  }
  async function render() {
    clear(root);
    if (route.parts[0] === "runs" && route.parts[1]) return renderRun(route.parts[1]);
    regEl = h("div"); histEl = h("div");
    root.append(sectionHead("Checks", h("button", {class: "btn", onclick: () => run(Array.from(selected))}, "▶ Run selected"), h("button", {class: "btn btn-primary", onclick: () => run(null)}, "▶ Run all"), refreshBtn(() => { drawRegistry(); drawHistory(); })));
    root.append(h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "Registry"}), h("span", {class: "muted small", text: "tick checks to run a subset"})), h("div", {class: "card-body flush"}, regEl)));
    root.append(h("div", {class: "card"}, h("div", {class: "card-head"}, h("h2", {text: "History"})), h("div", {class: "card-body flush"}, histEl)));
    await Promise.all([drawRegistry(), drawHistory()]);
  }
  return {
    mount(el, r) {
      root = el; route = r;
      unsubs.push(events.on("checks", (d) => { if (d?.check) { checkLive.set(`${d.run_id}:${d.check.id}`, d.check); const c = registry.find((x) => x.id === d.check.id); if (c) c.last = {status: d.check.status, count: d.check.count, run_id: d.run_id, at: new Date().toISOString()}; if (route.parts[0] === "runs" && route.parts[1] === d.run_id) render(); } }));
      unsubs.push(events.on("run:checks", (d) => { if (d?.event === "finished" && regEl) { drawRegistry(); drawHistory(); } }));
      unsubs.push(events.on("poll", () => { if (regEl) drawRegistry(); }));
      return render();
    },
    update(r) { route = r; return render(); }, unmount() { unsubs.forEach((u) => u()); }, refresh: () => render(),
  };
};

// ---- Config -------------------------------------------------------------------------
SECTIONS.config = function configSection() {
  let root, unsubs = [], body, search;
  const canFlags = state.can("config", "flags");
  let cfg = null;
  function editFlag(row) {
    let inp;
    const t = String(row.type || "").toLowerCase();
    if (t === "bool") { inp = h("select", {class: "select"}, h("option", {value: "true", text: "true"}), h("option", {value: "false", text: "false"})); inp.value = String(row.value); }
    else inp = h("input", {class: "input mono", value: row.secret ? "" : (isObj(row.value) ? jsonStr(row.value, 0) : String(row.value ?? "")), type: ["int", "float"].includes(t) ? "number" : "text", step: t === "float" ? "any" : undefined, placeholder: row.secret ? "new secret value" : ""});
    modal({title: `Set ${row.name}`, body: h("div", {class: "col"}, row.description ? h("div", {class: "muted", text: row.description}) : null, h("div", {class: "callout callout-warn small", text: "Runtime only: the change applies to the live settings object and is not persisted."}), h("div", {class: "field"}, h("label", {text: `${row.field} (${row.type})`}), inp)),
      buttons: [{label: "Cancel", onClick: (c) => c()}, {label: "Continue…", class: "btn-primary", onClick: async (c) => {
        let value = inp.value; if (t === "bool") value = value === "true"; else if (t === "int") value = Number(value); else if (t === "float") value = Number(value);
        c();
        const ok = await confirmTyped({title: "Change setting", message: `Set <code>${esc(row.name)}</code> to <code>${esc(row.secret ? "••••" : String(value))}</code>.`, expect: row.field, verb: "Set", danger: false});
        if (ok) guard(async () => { const r = await api.post(`/config/flags/${encodeURIComponent(row.field)}`, {value, confirm: row.field}); toast(`${r.name}: ${jsonStr(r.before, 0)} → ${jsonStr(r.after, 0)}`, {kind: "ok"}); draw(); });
      }}]});
  }
  function renderRows() {
    const q = search.value.trim().toLowerCase();
    const rows = cfg.rows.filter((r) => !q || `${r.name} ${r.field} ${r.description || ""} ${r.source}`.toLowerCase().includes(q));
    const wrap = h("div", {class: "grid-wrap tall"});
    wrap.append(grid([
      {key: "name", mono: true, render: (v, r) => `<b>${esc(v)}</b>${r.description ? `<div class="faint small">${esc(r.description)}</div>` : ""}`, wrap: true},
      {key: "value", render: (v, r) => r.secret ? `<span class="masked mono" title="secret">${esc(v || "••••••")}</span>` : `<span class="mono">${esc(isObj(v) ? jsonStr(v, 0) : String(v ?? "null"))}</span>`},
      {key: "source", render: (v, r) => chip(v, v === "environment" ? "info" : v === "env_file" ? "warn" : "muted") + (r.is_default ? "" : "")},
      {key: "default", render: (v) => `<span class="mono muted">${esc(isObj(v) ? jsonStr(v, 0) : String(v ?? "null"))}</span>`},
      {key: "type", mono: true},
      {key: "documented", render: (v) => v === null || v === undefined ? '<span class="faint">—</span>' : v ? '<span class="bool-t">✓</span>' : chip("undocumented", "warn")},
      {key: "mutable", label: "", render: (v, r) => v ? (canFlags ? `<button class="btn btn-sm" data-edit="${escAttr(r.field)}">Edit…</button>` : chip("mutable", "info")) : ""},
    ], rows));
    $$("[data-edit]", wrap).forEach((b) => b.addEventListener("click", () => editFlag(cfg.rows.find((r) => r.field === b.dataset.edit))));
    return rows.length ? wrap : empty("No settings match.");
  }
  const draw = () => load(body, async () => {
    cfg = await api.get("/config");
    const out = h("div", {class: "col"});
    out.append(h("div", {class: "muted small", text: `env file: ${cfg.env_file || "(none)"} · example: ${cfg.example_file || "(none)"} · ${cfg.rows.length} settings`}));
    if (cfg.undocumented?.length) out.append(h("div", {class: "callout callout-warn"}, h("b", {text: "Undocumented settings (not in the example file): "}), h("span", {class: "mono", text: cfg.undocumented.join(", ")})));
    if (cfg.unknown_in_env_file?.length) out.append(h("div", {class: "callout callout-warn"}, h("b", {text: "Keys in the env file the app does not know: "}), h("span", {class: "mono", text: cfg.unknown_in_env_file.join(", ")})));
    const holder = h("div", {}, renderRows());
    search.oninput = debounce(() => clear(holder).append(renderRows()), 120);
    out.append(holder);
    return out;
  });
  return {
    mount(el) {
      root = el; body = h("div");
      search = h("input", {class: "input", placeholder: "filter settings…"});
      root.append(sectionHead("Config", search, refreshBtn(draw)), body);
      unsubs.push(events.on("config", () => draw())); unsubs.push(events.on("poll", () => {}));
      return draw();
    },
    unmount() { unsubs.forEach((u) => u()); }, refresh: draw,
  };
};

// ---- Activity ------------------------------------------------------------------------
SECTIONS.activity = function activitySection() {
  let root, route, unsubs = [], body;
  const canUndo = state.can("activity", "undo");
  const logsSource = state.section("logs")?.sources?.[0];
  const UNDOABLE = new Set(["row.update", "row.delete", "row.insert"]);
  function undo(a) {
    guard(async () => {
      const cs = await api.post(`/activity/${encodeURIComponent(a.id)}/undo`);
      toast(`Undo change-set ${cs.id} prepared — review and apply`, {kind: "info"});
      router.go(`#/data/${encodeURIComponent(cs.target_table)}/changeset/${encodeURIComponent(cs.id)}`);
    });
  }
  const draw = () => load(body, async () => {
    const q = route.query;
    const r = await api.get("/activity", {limit: q.get("limit") || 200, principal: q.get("principal") || undefined, section: q.get("section") || undefined, table: q.get("table") || undefined, since: q.get("since") || undefined, changeset_id: q.get("changeset_id") || undefined});
    if (!r.items.length) return empty("No activity matches.");
    const out = h("div", {class: "grid-wrap"});
    const table = h("table", {class: "grid"});
    table.append(h("thead", {}, h("tr", {}, ...["at", "who", "section", "action", "target", "state", "change-set", "request", ""].map((x) => h("th", {text: x})))));
    const tb = h("tbody");
    for (const a of r.items) {
      const pk = a.target_pk && isObj(a.target_pk) ? a.target_pk : null;
      const targetHtml = a.target_table ? `<a class="mono" href="#/data/${encodeURIComponent(a.target_table)}${pk ? "/row/" + pkParam(pk) : ""}">${esc(a.target_table)}${pk ? " " + esc(pkKey(pk)) : ""}</a>` : (pk ? `<span class="mono">${esc(jsonStr(pk, 0))}</span>` : "");
      const tr = h("tr", {class: "clickable"});
      tr.innerHTML = `<td class="mono">${esc(fmtTs(a.at))}</td><td>${esc(a.principal_label)}</td><td><a href="#/${esc(a.section)}">${esc(a.section)}</a></td><td class="mono">${esc(a.action)}</td><td>${targetHtml}</td><td>${chip(a.state)}${a.undone_by ? " " + chip("undone", "info") : ""}</td><td>${a.changeset_id && a.target_table ? `<a class="mono small" href="#/data/${encodeURIComponent(a.target_table)}/changeset/${encodeURIComponent(a.changeset_id)}">${esc(a.changeset_id)}</a>` : ""}</td><td>${a.request_id ? (logsSource ? `<a class="mono small" href="#/logs/${encodeURIComponent(logsSource)}?request_id=${encodeURIComponent(a.request_id)}">${esc(a.request_id)}</a>` : `<code>${esc(a.request_id)}</code>`) : ""}</td><td></td>`;
      if (canUndo && UNDOABLE.has(a.action) && a.state === "committed" && !a.undone_by) tr.lastElementChild.append(h("button", {class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); undo(a); }}, "Undo…"));
      const det = h("tr", {class: "hidden"});
      const td = h("td", {colspan: "9", class: "wrapcell"});
      const box = h("div", {class: "col"});
      if (a.note) box.append(h("div", {}, h("b", {text: "note: "}), h("span", {class: "mono wrap", text: a.note})));
      if (a.run_id) box.append(h("div", {}, h("b", {text: "run: "}), h("code", {text: a.run_id})));
      if (a.before || a.after) box.append(isObj(a.before) || isObj(a.after) ? diffView(isObj(a.before) ? a.before : null, isObj(a.after) ? a.after : null) : kv({before: a.before, after: a.after}));
      if (!box.children.length) box.append(h("span", {class: "muted small", text: "no details"}));
      box.append(h("div", {class: "faint small mono", text: `id ${a.id} · principal ${a.principal_id}`}));
      td.append(box); det.append(td);
      tr.addEventListener("click", () => det.classList.toggle("hidden"));
      tb.append(tr, det);
    }
    table.append(tb); out.append(table);
    return out;
  });
  function render() {
    clear(root);
    const q = route.query;
    const principal = h("input", {class: "input input-sm", placeholder: "principal id", value: q.get("principal") || ""});
    const section = h("select", {class: "select input-sm"}, h("option", {value: "", text: "any section"}), ...state.manifest.sections.map((s) => h("option", {value: s.id, text: s.title}))); section.value = q.get("section") || "";
    const table = h("input", {class: "input input-sm mono", placeholder: "table", value: q.get("table") || ""});
    const since = h("input", {class: "input input-sm", type: "datetime-local", value: q.get("since") ? q.get("since").slice(0, 16) : ""});
    const limit = h("select", {class: "select input-sm"}, ...["100", "200", "500", "1000"].map((n) => h("option", {value: n, text: n}))); limit.value = q.get("limit") || "200";
    const apply = () => router.setQuery({principal: principal.value.trim(), section: section.value, table: table.value.trim(), since: since.value ? new Date(since.value).toISOString() : "", limit: limit.value, changeset_id: ""});
    [principal, table].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); }));
    [section, since, limit].forEach((i) => i.addEventListener("change", apply));
    body = h("div");
    root.append(sectionHead("Activity", refreshBtn(draw)), h("div", {class: "toolbar"}, principal, section, table, since, limit, h("button", {class: "btn btn-sm", onclick: apply}, "Apply"), q.get("changeset_id") ? h("span", {class: "filter-chip"}, `changeset ${q.get("changeset_id")}`, h("button", {onclick: () => router.setQuery({changeset_id: ""})}, "✕")) : null), body);
    return draw();
  }
  return {
    mount(el, r) { root = el; route = r; const soft = debounce(draw, 800); unsubs.push(events.on("activity", soft)); unsubs.push(events.on("poll", soft)); return render(); },
    update(r) { route = r; return render(); }, unmount() { unsubs.forEach((u) => u()); }, refresh: () => draw(),
  };
};

// ============================================================================
// 8. shell: top bar, nav, badges, palette, theme, boot
// ============================================================================

const RUN_SECTION = {tests: "tests", checks: "checks", probes: "api", backup: "backups", restore: "backups", migration: "schema"};

function renderBadges() {
  for (const a of $$(".nav-item")) {
    const id = a.dataset.id; const box = $(".badges", a); if (!box) continue;
    clear(box);
    const running = Array.from(state.badges.running).filter((k) => RUN_SECTION[k] === id);
    if (running.length) box.append(h("span", {class: "badge badge-run", title: `running: ${running.join(", ")}`, text: "▶"}));
    if (id === "data" && state.badges.pending) box.append(h("span", {class: "badge badge-pending", title: "pending change-sets", text: String(state.badges.pending)}));
    if (id === "checks" && state.badges.failing) box.append(h("span", {class: "badge badge-fail", title: "failing checks", text: String(state.badges.failing)}));
  }
}
async function loadBadges() {
  if (state.caps("data").has("changesets")) { try { state.badges.pending = (await api.get("/data/changesets", {status: "pending", limit: 100})).items.length; } catch { /* ignore */ } }
  if (state.has("checks")) { try { const r = await api.get("/checks"); state.badges.failing = r.items.filter((c) => ["fail", "error"].includes(c.last?.status)).length; } catch { /* ignore */ } }
  renderBadges();
}

// ---- theme -------------------------------------------------------------------------
const THEMES = ["", "dark", "light"];
function applyTheme(t) { document.documentElement.setAttribute("data-theme", t || ""); store("theme", t || ""); const b = $("#theme-btn"); if (b) { b.textContent = t === "dark" ? "☾" : t === "light" ? "☀" : "◐"; b.title = `theme: ${t || "auto"} (click to change)`; } }
function cycleTheme() { const cur = document.documentElement.getAttribute("data-theme") || ""; applyTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]); }

// ---- command palette ----------------------------------------------------------------
const palette = {
  el: null, input: null, list: null, items: [], results: [], active: 0, loaded: false,
  async sources() {
    const items = [];
    for (const s of state.manifest.sections) items.push({kind: "section", label: s.title, sub: `#/${s.id}`, go: `#/${s.id}`});
    if (state.has("data")) { try { for (const t of (await getTables()).items) items.push({kind: "table", label: t.name, sub: t.domain || "", go: `#/data/${encodeURIComponent(t.name)}`}); } catch { /* ignore */ } }
    if (state.has("api")) { try { for (const r of await getRoutes()) items.push({kind: "route", label: `${r.method} ${r.path}`, sub: r.summary || "", go: "#/api", route: r}); } catch { /* ignore */ } }
    if (state.caps("query").has("saved")) { try { for (const q of (await api.get("/query/saved")).items) items.push({kind: "query", label: q.name, sub: truncate(q.sql, 60), go: `#/query?sql=${encodeURIComponent(q.sql)}`}); } catch { /* ignore */ } }
    return items;
  },
  init() {
    this.el = h("div", {class: "palette hidden", role: "dialog"});
    this.input = h("input", {class: "palette-input", placeholder: "Jump to a section, table, route or saved query…", autocomplete: "off", spellcheck: "false"});
    this.list = h("div", {class: "palette-list"});
    this.el.append(this.input, this.list);
    document.body.append(this.el);
    this.input.addEventListener("input", () => this.render());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); this.active = Math.min(this.results.length - 1, this.active + 1); this.render(false); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.active = Math.max(0, this.active - 1); this.render(false); }
      else if (e.key === "Enter") { e.preventDefault(); this.pick(this.results[this.active]); }
      else if (e.key === "Escape") { this.close(); }
    });
    document.addEventListener("mousedown", (e) => { if (!this.el.classList.contains("hidden") && !this.el.contains(e.target) && !e.target.closest("#search-btn")) this.close(); });
  },
  async open(q = "") {
    this.el.classList.remove("hidden"); this.input.value = q; this.input.focus();
    if (!this.loaded) { this.list.innerHTML = '<div class="palette-empty">Loading…</div>'; this.items = await this.sources(); this.loaded = true; }
    this.render();
  },
  close() { this.el.classList.add("hidden"); },
  refresh() { this.loaded = false; },
  render(reset = true) {
    const q = this.input.value.trim();
    if (reset) { this.active = 0; this.results = this.items.map((it) => ({it, s: fuzzy(q, it.label) + (q ? Math.max(-1, fuzzy(q, it.sub) * 0.5) : 0)})).filter((x) => !q || x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.it); }
    clear(this.list);
    if (!this.results.length) { this.list.append(h("div", {class: "palette-empty", text: q ? "No matches." : "Type to search."})); return; }
    this.results.forEach((it, i) => {
      const row = h("div", {class: `palette-item${i === this.active ? " active" : ""}`}, h("span", {class: `chip kind chip-${it.kind === "route" ? "info" : it.kind === "table" ? "ok" : it.kind === "query" ? "warn" : "muted"}`, text: it.kind}), h("span", {class: "truncate", text: it.label}), h("span", {class: "sub truncate", text: it.sub}));
      row.addEventListener("mouseenter", () => { this.active = i; $$(".palette-item", this.list).forEach((x, j) => x.classList.toggle("active", j === i)); });
      row.addEventListener("click", () => this.pick(it));
      this.list.append(row);
    });
    const act = $(".palette-item.active", this.list); if (act) act.scrollIntoView({block: "nearest"});
  },
  pick(it) {
    if (!it) return;
    this.close();
    if (it.kind === "route") { if (router.currentId === "api" && router.current?.loadRoute) router.current.loadRoute(it.route); else { pendingApiRoute = it.route; router.go("#/api"); } return; }
    router.go(it.go);
  },
};

// ---- shell -------------------------------------------------------------------------
function renderShell(app) {
  const m = state.manifest;
  clear(app);
  const top = h("div", {class: "topbar"},
    h("span", {class: "brand"}, m.app_name || CFG.app, h("small", {text: `console${m.app_version ? " · " + m.app_version : ""}`})),
    h("button", {class: "search-btn", id: "search-btn", onclick: () => palette.open("")}, h("span", {text: "Search…"}), h("kbd", {text: navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K"})),
    h("div", {class: "topbar-meta"}, h("span", {title: `principal ${m.principal.id} · roles ${(m.principal.roles || []).join(", ") || "—"}`, text: `${m.principal.label}${m.principal.can_write ? "" : " (read-only)"}`}), m.database_label ? h("span", {title: "database", text: m.database_label}) : null, h("span", {class: "mono", title: "API prefix", text: CFG.prefix})),
    h("span", {class: "sse-dot", id: "sse-dot", title: "events: connecting"}),
    h("button", {class: "btn btn-sm btn-ghost", id: "theme-btn", onclick: cycleTheme}, "◐"));
  const nav = h("nav", {class: "nav", id: "nav"});
  for (const s of m.sections) nav.append(h("a", {class: "nav-item", href: `#/${s.id}`, dataset: {id: s.id}}, h("span", {text: s.title}), h("span", {class: "badges"})));
  const main = h("main", {class: "main", id: "main"});
  const dr = h("div", {class: "drawer", id: "drawer"},
    h("div", {class: "drawer-resize", title: "drag to resize"}),
    h("div", {class: "drawer-head"}, h("b", {class: "drawer-title", text: "Run"}), h("span", {class: "chip drawer-status"}), h("code", {class: "drawer-meta faint small"}), h("span", {class: "grow"}),
      h("button", {class: "btn btn-sm btn-danger drawer-cancel hidden"}, "■ Cancel"), h("button", {class: "btn btn-sm drawer-copy"}, "Copy"), h("button", {class: "btn btn-sm drawer-clear"}, "Clear"), h("button", {class: "btn btn-sm drawer-close", title: "close (Esc)"}, "✕")),
    h("div", {class: "drawer-body"}));
  app.append(top, nav, main, dr);
  applyTheme(document.documentElement.getAttribute("data-theme") || "");
}

function setSseDot(mode) {
  const d = $("#sse-dot"); if (!d) return;
  d.className = `sse-dot ${mode === "live" ? "live" : mode === "poll" ? "poll" : ""}`;
  d.title = mode === "live" ? "events: live (SSE)" : mode === "poll" ? "events: SSE unavailable, polling every 5 s (click to retry)" : "events: connecting";
  d.onclick = () => events.retry();
}

function installKeys() {
  document.addEventListener("keydown", (e) => {
    const inField = e.target.closest("input, textarea, select, [contenteditable]");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.open(""); return; }
    if (e.key === "/" && !inField) { e.preventDefault(); palette.open(""); return; }
    if (e.key === "Escape") {
      if (!palette.el.classList.contains("hidden")) { palette.close(); return; }
      if (!$(".modal-backdrop") && drawer.isOpen) drawer.close();
    }
  });
}

async function boot() {
  const app = $("#app");
  let manifest;
  try { manifest = await api.get("/manifest"); }
  catch (e) {
    clear(app).append(h("div", {class: "boot"}, h("div", {class: "boot-card"}, h("div", {class: "boot-title", text: `${CFG.app} · Console`}), errorBox(e), h("div", {class: "muted small mono", text: `${CFG.prefix}/manifest`}), h("button", {class: "btn btn-primary", style: "margin-top:8px", onclick: boot}, "Retry"))));
    return;
  }
  state.manifest = manifest;
  document.title = `${manifest.app_name || CFG.app} · Console`;
  const logs = state.section("logs");
  if (logs?.sources) events.topics(logs.sources.map((s) => `logs:${s}`));
  renderShell(app);
  drawer.init();
  palette.init();
  router.el = $("#main");
  events.onMode = setSseDot;
  events.connect();
  installKeys();
  loadBadges();
  // badges from the event stream
  events.on("*", (d, topic) => {
    if (topic.startsWith("run:")) {
      const kind = topic.slice(4);
      if (d?.event === "started") state.badges.running.add(kind);
      if (d?.event === "finished") state.badges.running.delete(kind);
      renderBadges();
    }
  });
  events.on("changesets", debounce(loadBadges, 500));
  events.on("run:checks", (d) => { if (d?.event === "finished") setTimeout(loadBadges, 500); });
  events.on("gap", () => { toast("Event stream fell behind; re-syncing", {kind: "warn", ms: 3000}); router.refresh(); loadBadges(); });
  let hellos = 0;
  events.on("hello", () => { if (hellos++ > 0 && router.current) { router.refresh(); loadBadges(); } });   // reconnect → re-sync
  window.addEventListener("hashchange", () => router.dispatch());
  if (!location.hash) location.replace(`#/${manifest.sections[0]?.id || "overview"}`);
  await router.dispatch();
}

boot();
