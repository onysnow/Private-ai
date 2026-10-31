#!/usr/bin/env node
// The screen check (docs/project-notes/DECISIONS_LOG.md 59). Walks every screen of
// the running app in a real browser and fails on the bug classes that kept coming back:
//   overlap   two visible text boxes on top of each other (HTML text and SVG <text>);
//   cutoff    text cut off with no ellipsis, or an ellipsis with nothing that reveals the rest;
//   spill     text running outside its own box (a word wider than its chip);
//   scroll    the page itself scrolling, down or sideways;
//   console   console errors, hydration and React key warnings, uncaught page errors;
//   empty     (reported only) a panel whose content fills under 40% of its height.
// Usage (the app must already be running; this starts nothing):
//   npm run check:screens -- --base http://localhost:3000 --case <investigation id | auto>
//     [--api http://localhost:8000] [--only /see#places] [--width 1440,390] [--theme default|all|rain-noir,...]
//     [--out screen-check] [--allowlist scripts/check-screens.allow.json] [--settle 1200] [--max-wait 45000]
//   npm run check:screens -- --self-test   (no app needed: proves each check catches its bug and passes its look-alike)
// Allowlist (scripts/check-screens.allow.json): [{"class": "overlap", "screen": "/see#*", "width": 390, "theme": "archive",
//   "match": "text or CSS path of either element", "reason": "why this is accepted"}]; class and reason are required.
// Exit code: 0 when nothing failing is left after the allowlist, 1 when something is, 2 when the run could not start.
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Playwright is not one of the app's dependencies: it is found the way `require` finds it (this folder's
// node_modules, then NODE_PATH), so a machine or CI job that has it installed anywhere can run the check.
const {chromium} = createRequire(import.meta.url)('playwright');
const FRONTEND = resolve(HERE, '..');
const THEMES = ['case-night', 'rain-noir', 'archive', 'forest-ledger', 'indigo-clarity'];
const FAILING = new Set(['overlap', 'cutoff', 'spill', 'scroll', 'console']);

// ---- arguments ----
function args(argv) {
  const o = {base: 'http://localhost:3000', api: 'http://localhost:8000', case: 'auto', only: [], width: '1440,390', theme: 'default',
    out: 'screen-check', allowlist: join(HERE, 'check-screens.allow.json'), settle: 1200, maxWait: 45000, name: 'Ony'};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, ''); const v = argv[i + 1];
    if (k === 'help' || k === 'h') { o.help = true; continue; }
    if (k === 'self-test') { o.selfTest = true; continue; }
    if (k === 'only') { o.only.push(v); i++; continue; }
    if (k === 'max-wait') { o.maxWait = +v; i++; continue; }
    if (k in o) { o[k] = typeof o[k] === 'number' ? +v : v; i++; continue; }
    throw new Error(`Unknown argument ${argv[i]}`);
  }
  return o;
}

// ---- the screens: read from the app's own lists, so a new stage part or settings pane is checked at once ----
function screens() {
  const stages = readFileSync(join(FRONTEND, 'lib/stages.ts'), 'utf8');
  const list = ['/'];
  for (const block of stages.split(/\{key: '/).slice(1)) {
    const route = /route: '([^']+)'/.exec(block)?.[1];
    if (!route) continue;
    for (const m of block.matchAll(/anchor: '([^']+)'/g)) list.push(`${route}#${m[1]}`);
  }
  list.push('/decide', '/learn', '/glossary');
  const settings = readFileSync(join(FRONTEND, 'app/settings/page.tsx'), 'utf8');
  for (const m of settings.matchAll(/\{group: '[^']+', id: '([^']+)'([^\n]*)/g)) if (!/href:/.test(m[2])) list.push(`/settings#${m[1]}`);
  return list;
}

async function findCase(o) {
  if (o.case !== 'auto') return o.case;
  const res = await fetch(`${o.api}/api/investigations`);
  if (!res.ok) throw new Error(`GET ${o.api}/api/investigations answered ${res.status}`);
  const all = await res.json();
  const demo = all.find(i => i.is_demo && /1MDB/i.test(i.name)) ?? all.find(i => i.is_demo) ?? all[0];
  if (!demo) throw new Error('No case to open: load the 1MDB demo case first, or pass --case <id>');
  return demo.id;
}

// ---- the allowlist: known, accepted exceptions, each with its reason ----
function loadAllow(path) {
  if (!existsSync(path)) return [];
  const list = JSON.parse(readFileSync(path, 'utf8'));
  for (const e of list) if (!e.reason || !e.class) throw new Error(`Allowlist entry without a class and a reason: ${JSON.stringify(e)}`);
  return list;
}
const glob = (pat, s) => new RegExp('^' + pat.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(s);
function allowed(p, allow) {
  return allow.find(e => e.class === p.class && glob(e.screen ?? '*', p.screen) && (!e.width || +e.width === p.width) && (!e.theme || e.theme === p.theme)
    && (!e.match || [p.a?.text, p.a?.path, p.b?.text, p.b?.path, p.message].some(s => s && s.includes(e.match)))
    && (!e.match2 || [p.a?.text, p.a?.path, p.b?.text, p.b?.path].some(s => s && s.includes(e.match2))));
}

// ---- what runs in the page ----
/* eslint-disable */
function inspect() {
  const MAX_EL = 6000;
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const de = document.documentElement;
  // 3. The page itself scrolling.
  const sh = Math.max(de.scrollHeight, document.body.scrollHeight), sw = Math.max(de.scrollWidth, document.body.scrollWidth);
  if (sh > vh + 2) out.push({class: 'scroll', message: `the page scrolls down: ${sh}px tall in a ${vh}px window`});
  if (sw > vw + 2) {
    // Name what sticks out furthest, so the fix has somewhere to start.
    let widest = null;
    for (const el of document.body.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.right > vw + 2 && (!widest || r.right > widest.r)) widest = {el, r: r.right}; }
    out.push({class: 'scroll', message: `the page scrolls sideways: ${sw}px wide in a ${vw}px window`, a: widest ? desc(widest.el) : undefined});
  }

  function path(el) {
    const parts = [];
    for (let e = el, n = 0; e && e !== document.body && n < 4; e = e.parentElement, n++) {
      if (e.id && !/^[:«r]/.test(e.id) && !/^radix-/.test(e.id)) { parts.unshift('#' + e.id); break; }
      const cls = typeof e.className === 'string' ? e.className : e.className?.baseVal ?? '';
      const c = cls.split(/\s+/).filter(x => x && !/^(rv-open|on|active|hover)$/.test(x) && x.length < 30).slice(0, 2);
      parts.unshift(e.tagName.toLowerCase() + (c.length ? '.' + c.join('.') : ''));
    }
    return parts.join(' > ');
  }
  function box(r) { return {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.right - r.left), h: Math.round(r.bottom - r.top)}; }
  function desc(el, r) { return {text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80), path: path(el), box: box(r || el.getBoundingClientRect())}; }

  // Which elements clip: overflow other than visible, and an <svg>'s own viewport.
  const csCache = new Map();
  const cs = el => { let s = csCache.get(el); if (!s) { s = getComputedStyle(el); csCache.set(el, s); } return s; };
  const clips = el => { const s = cs(el); return s.overflowX !== 'visible' || s.overflowY !== 'visible' || (el instanceof SVGSVGElement && s.overflow !== 'visible'); };
  const scrolls = el => { const s = cs(el); return /auto|scroll/.test(s.overflowX + s.overflowY); };

  function seen(el) {
    let op = 1;
    for (let e = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.contentVisibility === 'hidden') return false;
      op *= +s.opacity;
      if (op < 0.1) return false;
      if (e.hasAttribute && (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true' && e.classList.contains('sr-only'))) return false;
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
    }
    return true;
  }

  // The text boxes: each element's own text (its direct text nodes), measured with a Range, so a block that is
  // wider than its words counts only as wide as the words.
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {acceptNode: n => n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
  const byEl = new Map();
  for (let n = walker.nextNode(); n && byEl.size < MAX_EL; n = walker.nextNode()) {
    let el = n.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION|TITLE|DESC)$/.test(el.tagName)) continue;
    if (el.closest('[data-sonner-toaster], #rv-card, [data-check-screens-skip], .maplibregl-ctrl-attrib, .maplibregl-map canvas')) continue;
    // SVG: a <tspan> belongs to its <text>.
    if (el instanceof SVGElement) { const t = el.closest('text'); if (t) el = t; else continue; }
    if (!byEl.has(el)) byEl.set(el, []);
    byEl.get(el).push(n);
  }
  for (const [el, nodes] of byEl) {
    if (!seen(el)) continue;
    let r;
    if (el instanceof SVGElement) {
      const b = el.getBoundingClientRect(); r = {left: b.left, top: b.top, right: b.right, bottom: b.bottom};
    } else {
      r = null;
      for (const n of nodes) {
        const range = document.createRange(); range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
          if (q.width < 0.5 || q.height < 0.5) continue;
          r = r ? {left: Math.min(r.left, q.left), top: Math.min(r.top, q.top), right: Math.max(r.right, q.right), bottom: Math.max(r.bottom, q.bottom)} : {left: q.left, top: q.top, right: q.right, bottom: q.bottom};
        }
      }
    }
    if (!r || r.right - r.left < 2 || r.bottom - r.top < 2) continue;
    // What of it can be seen: cut by every clipping ancestor, and by the window.
    let vis = {...r}; let cutBy = null; let cutX = 0, cutY = 0; let inScroller = false;
    for (let e = el.parentElement === null ? null : (el instanceof SVGElement ? el.ownerSVGElement ?? el.parentElement : el); e && e !== de; e = e.parentElement) {
      if (!clips(e)) continue;
      const b = e.getBoundingClientRect();
      const s = cs(e);
      const cx = s.overflowX !== 'visible' || e instanceof SVGSVGElement, cy = s.overflowY !== 'visible' || e instanceof SVGSVGElement;
      // A scroller shows the rest when scrolled: what it hides is not cut off, but it is not seen either.
      const sc = scrolls(e);
      if (sc) inScroller = true;
      const L = cx ? b.left + (e === el ? 0 : e.clientLeft) : -1e9, R = cx ? (e === el ? b.right : b.left + e.clientLeft + (e.clientWidth || b.width)) : 1e9;
      const T = cy ? b.top + (e === el ? 0 : e.clientTop) : -1e9, B = cy ? (e === el ? b.bottom : b.top + e.clientTop + (e.clientHeight || b.height)) : 1e9;
      const dx = Math.max(0, L - vis.left, vis.right - R), dy = Math.max(0, T - vis.top, vis.bottom - B);
      if (!sc && !cutBy && (dx > 2 || dy > 2)) { cutBy = e; cutX = dx; cutY = dy; }
      vis = {left: Math.max(vis.left, L), top: Math.max(vis.top, T), right: Math.min(vis.right, R), bottom: Math.min(vis.bottom, B)};
    }
    vis = {left: Math.max(vis.left, 0), top: Math.max(vis.top, 0), right: Math.min(vis.right, vw), bottom: Math.min(vis.bottom, vh)};
    const shown = vis.right - vis.left > 1 && vis.bottom - vis.top > 1;
    texts.push({el, r, vis, shown, cutBy, cutX, cutY, inScroller});
  }

  // 2. Cut off. The clipping box hides part of the words: fine only with an ellipsis (or a line clamp) and something
  // that reveals the rest (the Reveal mark, a title, an accessible name).
  const reveals = el => !!el.closest('.rv, [title], [aria-label], [aria-describedby], [data-full]');
  const reported = new Set();
  for (const t of texts) {
    if (!t.shown || !t.cutBy) continue;
    // Wholly outside the clip is not "cut": it is a hidden part (a slid-away pane), not a clipped word.
    const c = t.cutBy; const s = cs(c);
    const ell = (s.textOverflow === 'ellipsis' && t.cutX > 2 && t.cutY <= 2) || (s.webkitLineClamp && s.webkitLineClamp !== 'none');
    // An ellipsis on an inner element whose clip is its own.
    const ownEll = cs(t.el).textOverflow === 'ellipsis' || (cs(t.el).webkitLineClamp && cs(t.el).webkitLineClamp !== 'none');
    const key = c;
    if (ell || ownEll) {
      if (reveals(t.el) || reveals(c)) continue;
      if (reported.has(key)) continue; reported.add(key);
      out.push({class: 'cutoff', kind: 'ellipsis without a reveal', a: desc(t.el, t.r), clip: desc(c), message: `ends in “…” but nothing shows the rest`});
    } else {
      if (reported.has(key)) continue; reported.add(key);
      out.push({class: 'cutoff', kind: t.cutX > 2 ? 'cut sideways, no ellipsis' : 'cut at the bottom', a: desc(t.el, t.r), clip: desc(c),
        message: `${Math.round(Math.max(t.cutX, t.cutY))}px of the text is hidden by ${c === t.el ? 'its own box' : 'its container'} (${t.cutX > 2 ? 'sideways' : 'top or bottom'})`});
    }
  }

  // Spill: an HTML element's own words run outside its own box, with nothing clipping them (a chip or a fixed-size
  // box whose word is wider than it). Inline elements are their words, so only boxes with a size of their own count.
  for (const t of texts) {
    if (!t.shown || t.cutBy || t.el instanceof SVGElement) continue;
    const s = cs(t.el);
    if (s.display === 'inline' || s.display === 'contents') continue;
    const b = t.el.getBoundingClientRect();
    const dx = Math.max(0, b.left - t.r.left, t.r.right - b.right), dy = Math.max(0, b.top - t.r.top, t.r.bottom - b.bottom);
    // Line boxes can stick out a little when line-height is below 1; only real spills count.
    if (dx > 4 || dy > Math.max(6, (t.r.bottom - t.r.top) * 0.35)) out.push({class: 'spill', a: desc(t.el, t.r), clip: desc(t.el, b),
      message: `the words run ${Math.round(Math.max(dx, dy))}px outside their own box (${dx > 4 ? 'sideways' : 'top or bottom'})`});
  }

  // 1. Overlap. Two seen text boxes cross by more than a sliver. Not counted: the same words drawn twice in one place
  // (an SVG halo under its label), and a pair where something opaque that belongs to neither lies over the place they
  // cross (a dialog, a sticky header) — then neither is seen there.
  const shown = texts.filter(t => t.shown);
  shown.sort((p, q) => p.vis.left - q.vis.left);
  const hide = document.createElement('style');
  hide.textContent = '*{pointer-events:auto!important}';
  document.head.appendChild(hide);
  const opaque = e => {
    const s = cs(e);
    if (/^(IMG|CANVAS|VIDEO|IFRAME)$/.test(e.tagName)) return true;
    const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor); const alpha = m ? (m[1].split(',')[3] ?? '1') : '0';
    return +alpha > 0.6 || (s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) || (e instanceof SVGGraphicsElement && e.tagName !== 'text' && e.tagName !== 'g' && e.tagName !== 'svg' && cs(e).fill !== 'none' && +cs(e).fillOpacity > 0.6);
  };
  let pairs = 0;
  for (let i = 0; i < shown.length && pairs < 400; i++) {
    const A = shown[i];
    for (let j = i + 1; j < shown.length; j++) {
      const B = shown[j];
      if (B.vis.left >= A.vis.right) break;
      const ix = Math.min(A.vis.right, B.vis.right) - Math.max(A.vis.left, B.vis.left);
      const iy = Math.min(A.vis.bottom, B.vis.bottom) - Math.max(A.vis.top, B.vis.top);
      if (ix <= 3 || iy <= 3) continue;
      const hA = A.vis.bottom - A.vis.top, hB = B.vis.bottom - B.vis.top;
      // Lines of one paragraph touch by a pixel or two when line-height is tight: a quarter of the shorter line is real.
      if (iy < Math.max(3, 0.25 * Math.min(hA, hB))) continue;
      if (A.el.contains(B.el) || B.el.contains(A.el)) {
        // A parent's words and its child's words only cross when one is placed over the other.
      }
      const tA = (A.el.textContent || '').trim(), tB = (B.el.textContent || '').trim();
      if (tA === tB && Math.abs(A.vis.left - B.vis.left) < 3 && Math.abs(A.vis.top - B.vis.top) < 3) continue;
      // Who is on top where they cross.
      const cx = (Math.max(A.vis.left, B.vis.left) + Math.min(A.vis.right, B.vis.right)) / 2;
      const cy = (Math.max(A.vis.top, B.vis.top) + Math.min(A.vis.bottom, B.vis.bottom)) / 2;
      const stack = document.elementsFromPoint(cx, cy);
      const at = t => stack.findIndex(e => e === t.el || t.el.contains(e));
      const ia = at(A), ib = at(B);
      if (ia < 0 && ib < 0) continue;
      const [U, iu, L, il] = ia >= 0 && (ib < 0 || ia <= ib) ? [A, ia, B, ib] : [B, ib, A, ia];
      let covered = false;
      const end = il < 0 ? stack.length : il;
      for (let k = 0; k < end; k++) {
        const e = stack[k];
        if ((e !== U.el && U.el.contains(e)) || e.contains(L.el)) continue;
        if (!opaque(e)) continue;
        // Something opaque of neither covers them there; or the upper text's own layer (a dialog, a card) covers the
        // lower words whole, so they are under it, not beside it. A chip that half-covers a name is still reported.
        if (!e.contains(U.el)) { covered = true; break; }
        const eb = e.getBoundingClientRect();
        if (eb.left <= L.vis.left + 1 && eb.right >= L.vis.right - 1 && eb.top <= L.vis.top + 1 && eb.bottom >= L.vis.bottom - 1) { covered = true; break; }
      }
      if (covered) continue;
      pairs++;
      out.push({class: 'overlap', a: desc(A.el, A.r), b: desc(B.el, B.r),
        message: `“${tA.slice(0, 40)}” and “${tB.slice(0, 40)}” cross by ${Math.round(ix)}×${Math.round(iy)}px`});
    }
  }
  hide.remove();

  // 5. Empty areas (reported only): a panel (a box with a background or a border, at least 220px tall) whose
  // contents cover under 40% of its height.
  const panels = [...document.querySelectorAll('section, article, aside, div, main, li')].filter(e => {
    const r = e.getBoundingClientRect();
    if (r.height < 220 || r.width < 220 || r.bottom < 0 || r.top > vh) return false;
    const s = cs(e);
    if (!seen(e)) return false;
    const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor); const alpha = m ? +(m[1].split(',')[3] ?? '1') : 0;
    return alpha > 0.15 || (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderBottomWidth) > 0 && s.borderTopStyle !== 'none');
  }).slice(0, 400);
  for (const p of panels) {
    const r = p.getBoundingClientRect();
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, vh), height = bottom - top;
    if (height < 220) continue;
    if (p.querySelector('canvas, svg[width], video, iframe, textarea, .maplibregl-map')) {
      const big = [...p.querySelectorAll('canvas, svg, video, iframe, textarea, .maplibregl-map')].some(e => e.getBoundingClientRect().height > height * 0.4);
      if (big) continue;
    }
    const spans = [];
    for (const t of shown) if (p.contains(t.el)) spans.push([Math.max(t.vis.top, top), Math.min(t.vis.bottom, bottom)]);
    for (const e of p.querySelectorAll('img, svg, canvas, input, button, select, textarea, video, hr')) {
      const b = e.getBoundingClientRect(); if (b.width > 1 && b.height > 1) spans.push([Math.max(b.top, top), Math.min(b.bottom, bottom)]);
    }
    if (!spans.length) continue; // An empty box with nothing in it is a placeholder, not a layout gap.
    spans.sort((a, b) => a[0] - b[0]);
    let used = 0, s0 = -1, s1 = -1;
    for (const [a, b] of spans) { if (b <= a) continue; if (a > s1) { if (s1 > s0) used += s1 - s0; s0 = a; s1 = b; } else s1 = Math.max(s1, b); }
    if (s1 > s0) used += s1 - s0;
    const share = used / height;
    if (share < 0.4) {
      // Report the innermost such panel only.
      out.push({class: 'empty', a: desc(p), message: `content covers ${Math.round(share * 100)}% of a ${Math.round(height)}px-tall panel`, _el: p});
    }
  }
  const empties = out.filter(x => x.class === 'empty');
  const keep = empties.filter(x => !empties.some(y => y !== x && x._el.contains(y._el)));
  for (const x of empties) delete x._el;
  return out.filter(x => x.class !== 'empty' || keep.includes(x));
}
/* eslint-enable */

// Outline what was found, for the screenshot.
function mark(boxes) {
  const layer = document.createElement('div');
  layer.id = 'check-screens-marks';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  for (const [i, b] of boxes.entries()) {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${b.x - 2}px;top:${b.y - 2}px;width:${b.w + 4}px;height:${b.h + 4}px;outline:2px solid ${b.c};`;
    const n = document.createElement('span');
    n.textContent = String(b.n ?? i + 1);
    n.style.cssText = `position:absolute;left:-2px;top:-16px;font:700 11px monospace;color:#fff;background:${b.c};padding:0 3px`;
    d.appendChild(n); layer.appendChild(d);
  }
  document.body.appendChild(layer);
}

// ---- running ----
async function settle(page, o) {
  const t0 = Date.now();
  await page.waitForLoadState('networkidle', {timeout: o.maxWait}).catch(() => {});
  // Quiet: no change to the page for `settle` ms (charts and lists drawn, data arrived), at most maxWait in all.
  await page.evaluate(({quiet, cap}) => new Promise(done => {
    let last = performance.now();
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'width', 'height', 'x', 'y', 'transform']});
    const start = performance.now();
    const tick = () => { const now = performance.now(); if (now - last >= quiet || now - start > cap) { mo.disconnect(); done(); } else setTimeout(tick, 100); };
    tick();
  }), {quiet: o.settle, cap: Math.max(1000, o.maxWait - (Date.now() - t0))}).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(300);
}

const slug = s => s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_') || 'home';

async function main() {
  const o = args(process.argv.slice(2));
  if (o.help) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n').replace(/^\/\/ ?/gm, '')); return 0; }
  if (o.selfTest) return selfTest();
  const caseId = await findCase(o);
  const widths = String(o.width).split(',').map(Number);
  const themes = o.theme === 'all' ? THEMES : o.theme === 'default' ? ['case-night'] : o.theme.split(',');
  for (const t of themes) if (!THEMES.includes(t)) throw new Error(`Unknown theme ${t}; one of ${THEMES.join(', ')}`);
  let list = screens();
  if (o.only.length) list = list.filter(s => o.only.some(f => s === f || s.startsWith(f) || glob(f, s)));
  if (!list.length) throw new Error('No screen matches --only');
  const outDir = resolve(o.out);
  mkdirSync(join(outDir, 'shots'), {recursive: true});
  const allow = loadAllow(o.allowlist);
  const started = Date.now();
  const problems = [];
  const visited = [];

  const browser = await chromium.launch();
  try {
    for (const theme of themes) for (const width of widths) {
      const height = width < 600 ? 844 : 900;
      const ctx = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce', deviceScaleFactor: 1,
        isMobile: width < 600, hasTouch: width < 600});
      ctx.setDefaultNavigationTimeout(120000);
      // The theme lives in localStorage (lib/theme.ts, key pai:appearance); set it before any page script runs.
      await ctx.addInitScript(t => {
        try {
          const a = JSON.parse(localStorage.getItem('pai:appearance') || '{}');
          localStorage.setItem('pai:appearance', JSON.stringify({...a, theme: t, custom: null}));
          sessionStorage.removeItem('pai:appearance-trying');
        } catch { /* storage blocked: the default theme */ }
      }, theme);
      const page = await ctx.newPage();
      let current = null;
      const heard = [];
      page.on('console', m => {
        const text = m.text();
        const t = m.type();
        if (t === 'error' || (t === 'warning' && /hydrat|did not match|unique "key"|Each child in a list|Encountered two children with the same key/i.test(text))) heard.push({screen: current, kind: t === 'error' ? 'console error' : 'warning', text});
      });
      page.on('pageerror', e => heard.push({screen: current, kind: 'pageerror', text: String(e.message || e)}));

      // First open: the name on the byline.
      current = '(first open)';
      await page.goto(`${o.base}/?inv=${caseId}`, {waitUntil: 'domcontentloaded'});
      await settle(page, o);
      const by = page.locator('input[placeholder="The name on your byline"]');
      if (await by.count()) { await by.fill(o.name); await page.getByRole('button', {name: 'Continue'}).click(); await settle(page, o); }
      heard.length = 0;

      for (const screen of list) {
        current = screen;
        const t0 = Date.now();
        const [pathPart, hash] = screen.split('#');
        const url = `${o.base}${pathPart}?inv=${caseId}${hash ? '#' + hash : ''}`;
        const found = [];
        try {
          await page.goto('about:blank');
          await page.goto(url, {waitUntil: 'domcontentloaded'});
          await settle(page, o);
          found.push(...await page.evaluate(inspect));
        } catch (e) {
          found.push({class: 'console', kind: 'check failed', message: `the screen could not be checked: ${String(e.message).split('\n')[0]}`});
        }
        for (const h of heard.splice(0)) {
          if (h.screen !== screen) continue;
          found.push({class: 'console', kind: h.kind, message: h.text.replace(/\s+/g, ' ').slice(0, 400)});
        }
        // One console line said again on every screen is one problem per screen, not twenty.
        const seenMsg = new Set();
        const mine = [];
        for (const p of found) {
          const k = p.class + '|' + p.message + '|' + (p.a?.path ?? '');
          if (seenMsg.has(k)) continue; seenMsg.add(k);
          const full = {screen, theme, width, ...p};
          const a = allowed(full, allow);
          full.status = !FAILING.has(p.class) ? 'report' : a ? 'allowed' : 'fail';
          if (a) full.allowedBecause = a.reason;
          mine.push(full);
        }
        problems.push(...mine);
        const failing = mine.filter(p => p.status === 'fail');
        let shot = null;
        if (failing.length || mine.some(p => p.class === 'empty')) {
          const colour = {overlap: '#ff2d55', cutoff: '#ff9500', spill: '#af52de', empty: '#00c7be', scroll: '#ffcc00', console: '#ff3b30'};
          const boxes = [];
          mine.filter(p => p.status !== 'allowed').forEach((p, i) => { for (const e of [p.a, p.b]) if (e?.box) boxes.push({...e.box, c: colour[p.class], n: i + 1}); });
          shot = join('shots', `${width}-${theme}-${slug(screen)}.png`);
          await page.evaluate(mark, boxes).catch(() => {});
          await page.screenshot({path: join(outDir, shot)}).catch(() => { shot = null; });
          for (const p of mine) p.shot = shot;
        }
        visited.push({screen, theme, width, ms: Date.now() - t0, fail: failing.length, shot});
        console.log(`${failing.length ? 'FAIL' : 'ok  '} ${width} ${theme} ${screen} (${((Date.now() - t0) / 1000).toFixed(1)}s)` +
          (failing.length ? ` — ${Object.entries(count(failing)).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''));
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  const report = {base: o.base, case: caseId, themes, widths, seconds, screens: visited, problems,
    counts: {fail: count(problems.filter(p => p.status === 'fail')), allowed: count(problems.filter(p => p.status === 'allowed')), report: count(problems.filter(p => p.status === 'report'))}};
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'report.md'), readable(report));
  const fails = problems.filter(p => p.status === 'fail').length;
  console.log(`\n${visited.length} screen checks in ${seconds}s: ${fails} failing (${JSON.stringify(report.counts.fail)}), ` +
    `${problems.filter(p => p.status === 'allowed').length} allowed, ${problems.filter(p => p.status === 'report').length} reported only.\nReport: ${join(outDir, 'report.md')}`);
  return fails ? 1 : 0;
}

// ---- the self-test: one page with each bug once, and next to it the look-alike that is fine ----
const FIXTURE = `<!doctype html><html><head><style>
body { margin: 0; font: 14px/1.4 sans-serif; height: 1400px; }
.chip { display: inline-block; width: 40px; height: 20px; overflow: visible; white-space: nowrap; background: #ddd; }
.cut { width: 60px; overflow: hidden; white-space: nowrap; }
.ell { width: 60px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.abs { position: absolute; white-space: nowrap; }
.panel { position: absolute; left: 600px; top: 40px; width: 300px; height: 400px; background: #eee; }
.para { position: absolute; left: 600px; top: 500px; width: 120px; line-height: 1.05; }
</style></head><body>
<div class="abs" id="o1" style="left:20px;top:20px">Najib Razak</div><div class="abs" id="o2" style="left:40px;top:24px">Jho Low</div>
<div class="abs" style="left:20px;top:60px">Goldman</div><div class="abs" style="left:20px;top:80px">Sachs</div>
<svg width="300" height="80" style="position:absolute;left:20px;top:120px"><text x="10" y="30">Aabar Investments</text><text x="40" y="34">Tanore Finance</text>
  <text x="10" y="70" stroke="#fff" stroke-width="3">Halo</text><text x="10" y="70">Halo</text></svg>
<div class="cut" id="c1" style="position:absolute;left:20px;top:220px">Good Star Limited</div>
<div class="ell" id="c2" style="position:absolute;left:20px;top:250px">1MDB Global Investments</div>
<span class="rv" style="position:absolute;left:20px;top:280px"><div class="ell">SRC International</div></span>
<div class="chip" id="s1" style="position:absolute;left:20px;top:320px">Blackstone Asia</div>
<div class="para">One paragraph whose lines sit tight, as tight text does, without overlapping at all.</div>
<div class="panel"><b>Mostly empty</b></div>
<dialog open style="position:absolute;z-index:10;left:300px;top:20px;width:200px;height:60px;background:#fff;margin:0">Over the top</dialog>
<div class="abs" style="left:310px;top:30px">Hidden under the dialog</div>
<script>console.error('a test error'); setTimeout(() => { throw new Error('a test page error'); });</script>
</body></html>`;

async function selfTest() {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({viewport: {width: 1000, height: 700}})).newPage();
    const heard = [];
    page.on('console', m => { if (m.type() === 'error') heard.push(m.text()); });
    page.on('pageerror', e => heard.push(e.message));
    await page.setContent(FIXTURE);
    await page.waitForTimeout(200);
    const found = await page.evaluate(inspect);
    const has = (cls, test) => found.some(p => p.class === cls && test(p));
    const txt = (p, s) => [p.a?.text, p.b?.text].some(t => t && t.includes(s));
    const expect = [
      ['overlap: two HTML names', has('overlap', p => txt(p, 'Najib') && txt(p, 'Jho'))],
      ['overlap: two SVG labels', has('overlap', p => txt(p, 'Aabar') && txt(p, 'Tanore'))],
      ['no overlap: stacked lines', !has('overlap', p => txt(p, 'Goldman') || txt(p, 'Sachs'))],
      ['no overlap: an SVG halo under its label', !has('overlap', p => txt(p, 'Halo'))],
      ['no overlap: a paragraph with tight lines', !has('overlap', p => txt(p, 'paragraph'))],
      ['no overlap: words under an opaque dialog', !has('overlap', p => txt(p, 'Hidden under'))],
      ['cutoff: cut with no ellipsis', has('cutoff', p => txt(p, 'Good Star') && /no ellipsis/.test(p.kind))],
      ['cutoff: an ellipsis with no reveal', has('cutoff', p => txt(p, '1MDB Global') && /without a reveal/.test(p.kind))],
      ['no cutoff: an ellipsis inside a Reveal', !has('cutoff', p => txt(p, 'SRC International'))],
      ['spill: a name wider than its chip', has('spill', p => txt(p, 'Blackstone'))],
      ['scroll: the page scrolls down', has('scroll', p => /scrolls down/.test(p.message))],
      ['empty: a panel with one line in it', has('empty', p => txt(p, 'Mostly empty'))],
      ['console: an error and a page error', heard.some(h => /a test error/.test(h)) && heard.some(h => /a test page error/.test(h))],
    ];
    for (const [what, ok] of expect) console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`);
    const bad = expect.filter(e => !e[1]).length;
    if (bad) console.log(JSON.stringify(found, null, 1));
    console.log(bad ? `${bad} of ${expect.length} self-test checks failed` : `all ${expect.length} self-test checks pass`);
    return bad ? 1 : 0;
  } finally { await browser.close(); }
}

function count(list) { const c = {}; for (const p of list) c[p.class] = (c[p.class] ?? 0) + 1; return c; }

function readable(r) {
  const order = ['overlap', 'cutoff', 'spill', 'scroll', 'console', 'empty'];
  const name = {overlap: 'Text boxes overlapping', cutoff: 'Text cut off', spill: 'Text running outside its box', scroll: 'The page scrolls',
    console: 'Console errors and warnings', empty: 'Large empty areas (reported only)'};
  const b = x => x ? `${x.w}×${x.h} at ${x.x},${x.y}` : '';
  const el = x => x ? `“${x.text}” \`${x.path}\` (${b(x.box)})` : '';
  let s = `# Screen check\n\n${r.screens.length} screen checks (${r.widths.join(', ')} px; ${r.themes.join(', ')}) in ${r.seconds}s against ${r.base}, case ${r.case}.\n\n`;
  s += `| Class | Failing | Allowed | Reported |\n|---|---|---|---|\n`;
  for (const c of order) s += `| ${name[c]} | ${r.counts.fail[c] ?? 0} | ${r.counts.allowed[c] ?? 0} | ${r.counts.report[c] ?? 0} |\n`;
  for (const c of order) {
    const list = r.problems.filter(p => p.class === c && p.status !== 'allowed');
    if (!list.length) continue;
    s += `\n## ${name[c]} (${list.length})\n\n`;
    for (const p of list) {
      s += `- **${p.screen}** · ${p.width} · ${p.theme}${p.kind ? ` · ${p.kind}` : ''}: ${p.message}`;
      if (p.a) s += `\n  - ${el(p.a)}`;
      if (p.b) s += `\n  - ${el(p.b)}`;
      if (p.clip && p.clip.path !== p.a?.path) s += `\n  - clipped by \`${p.clip.path}\` (${b(p.clip.box)})`;
      if (p.shot) s += `\n  - screenshot: ${p.shot}`;
      s += '\n';
    }
  }
  const al = r.problems.filter(p => p.status === 'allowed');
  if (al.length) {
    s += `\n## Allowed (${al.length})\n\n`;
    for (const p of al) s += `- ${p.screen} · ${p.width} · ${p.class}: ${p.message} — ${p.allowedBecause}\n`;
  }
  return s;
}

main().then(code => process.exit(code), e => { console.error(`check-screens: ${e.message}`); process.exit(2); });
