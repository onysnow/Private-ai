'use client';
// The app frame (Workbench-redesign-2026.pdf, "The case home, navigation and settings" §2–4; Ony, 10 Oct 2026:
// "the side nav/top nav just would be hidden until you move your mouse to the top or side").
// - Each edge has one job and a thin, always-visible handle. The left edge holds where to go (the case's steps and
//   their parts, and the app's pages); the top edge holds tools. An edge opens when the pointer rests at it for a
//   moment (a pointer passing by does not open it), on its handle, or by key: [ for the left, ] for the top.
// - The breadcrumb top left never hides, so you always know where you are with the edges closed.
// - ⌘K / Ctrl+K opens the command palette on every screen; ? lists the keys. Single-key shortcuts can be switched
//   off in Settings › Appearance and never fire while typing (WCAG 2.1.4).
import type {ReactElement, ReactNode} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';

import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {TryingBar} from '../../features/appearance/appearance-panel';
import {BoardEffects} from '../../features/effects/board-effects';
import {STAGES, hrefOfAnchor} from '../../lib/stages';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {handOffSearch} from '../../lib/search-handoff';
import {TRAIL_TAIL_EVENT, currentTrailTail} from '../../lib/trail';
import type {TrailTail} from '../../lib/trail';
import {customThemes} from '../../lib/custom-theme';
import {applyAppearance, currentAppearance, keepAppearance, THEMES, tryTheme} from '../../lib/theme';
import {singleKeysOn} from '../../lib/shortcuts';
import {listInvestigationsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {Inbox, useNeedsYouCount} from '../../features/inbox/inbox';
import {NewCaseSetup} from '../../features/new-case/new-case-setup';

/** Any screen can ask the frame to open the case switcher. */
export const SWITCH_CASE_EVENT = 'pai:switch-case';
/** Any screen can open the command palette, the inbox, or cover the screen. */
export const OPEN_PALETTE_EVENT = 'pai:open-palette';
export const OPEN_INBOX_EVENT = 'pai:open-inbox';
export const HIDE_SCREEN_EVENT = 'pai:hide-screen';
export const NEW_CASE_EVENT = 'pai:new-case';

const DWELL_MS = 250;
const PIN_KEY = 'pai:edge-pins';
const LEARNED_KEY = 'pai:edges-learned';
const TRAIL_KEY = 'pai:trail';

type Pins = {left: boolean; top: boolean};
function readPins(): Pins {
  try { const v = JSON.parse(window.localStorage.getItem(PIN_KEY) ?? '{}') as Partial<Pins>; return {left: v.left === true, top: v.top === true}; }
  catch { return {left: false, top: false}; }
}
function writePins(p: Pins): void { try { window.localStorage.setItem(PIN_KEY, JSON.stringify(p)); } catch { /* private window */ } }
function learned(): boolean { try { return window.localStorage.getItem(LEARNED_KEY) === '1'; } catch { return true; } }
function markLearned(): void { try { window.localStorage.setItem(LEARNED_KEY, '1'); } catch { /* private window */ } }

/** Where you last were in each case, so opening it again goes back there. */
const CASE_PLACE_KEY = 'pai:case-places';
function readCasePlaces(): Record<string, Place> {
  try { const v = JSON.parse(window.localStorage.getItem(CASE_PLACE_KEY) ?? '{}') as Record<string, Place>; return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, p]) => p && isAppPath(p.href))) : {}; }
  catch { return {}; }
}
function rememberCasePlace(inv: string, place: Place): void {
  try { window.localStorage.setItem(CASE_PLACE_KEY, JSON.stringify({...readCasePlaces(), [inv]: place})); } catch { /* private window */ }
}

/** The last five places, newest first: a place is its address and the trail's words for it. */
type Place = {href: string; label: string};
/** An address kept in the browser's storage is followed only when it is a path in this app (not `//host`, not `javascript:`). */
const isAppPath = (href: unknown): href is string => typeof href === 'string' && /^\/(?![/\\])\S*$/.test(href);
function readPlaces(): Place[] {
  try { const v = JSON.parse(window.localStorage.getItem(TRAIL_KEY) ?? '[]') as Place[]; return Array.isArray(v) ? v.filter(p => p && isAppPath(p.href) && typeof p.label === 'string').slice(0, 5) : []; }
  catch { return []; }
}
function rememberPlace(place: Place): Place[] {
  const next = [place, ...readPlaces().filter(p => p.href !== place.href)].slice(0, 5);
  try { window.localStorage.setItem(TRAIL_KEY, JSON.stringify(next)); } catch { /* private window */ }
  return next;
}
const EDGE_PX = 6;

const PAGES: {label: string; href: string; hint: string}[] = [
  {label: 'Case home', href: '/', hint: 'Where the case stands and what needs you'},
  {label: 'Decide', href: '/decide', hint: 'Everything only you can decide, one at a time'},
  {label: 'Learn', href: '/learn', hint: 'The Red Flags catalogue and the glossary'},
  {label: 'Settings', href: '/settings', hint: 'Appearance, access, demo case'},
  {label: 'About', href: '/about', hint: 'What this app is'},
];

const PAGE_NAMES: Record<string, string> = {'/': 'Case home', '/decide': 'Decide', '/learn': 'Learn', '/glossary': 'Glossary', '/settings': 'Settings', '/about': 'About', '/review': 'Review', '/review/batch': 'Batch review'};

/** A link inside the case keeps the open case (?inv=) so a reload or a shared link opens it again. */
function useCaseHref(): (href: string) => string {
  const inv = useWorkbenchStore(state => state.investigationId);
  return useCallback((href: string) => {
    if (!inv || !(href === '/' || href.startsWith('/#') || href.startsWith('/decide') || href.startsWith('/learn') || href.startsWith('/glossary')
      || STAGES.some(s => href.startsWith(s.route)))) return href;
    const [path, hash] = href.split('#');
    return `${path}${path.includes('?') ? '&' : '?'}inv=${encodeURIComponent(inv)}${hash ? `#${hash}` : ''}`;
  }, [inv]);
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Where you are: the page, and on the workbench the step and part you jumped to. */
function useTrail(): {label: string; href?: string}[] {
  const pathname = (usePathname() ?? '/').replace(/(.)\/+$/, '$1');
  const caseName = useWorkbenchStore(state => state.investigationName);
  const [hash, setHash] = useState('');
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace('#', ''));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [pathname]);
  // A screen outside the stages (Learn) names its own places after the page (lib/trail.ts).
  const [tail, setTail] = useState<TrailTail>([]);
  useEffect(() => {
    setTail(currentTrailTail());
    const read = (e: Event) => setTail((e as CustomEvent<TrailTail>).detail ?? []);
    window.addEventListener(TRAIL_TAIL_EVENT, read);
    return () => window.removeEventListener(TRAIL_TAIL_EVENT, read);
  }, [pathname]);
  const stage = STAGES.find(s => s.route === pathname);
  const inCase = pathname === '/' || pathname === '/decide' || Boolean(stage);
  const trail: {label: string; href?: string}[] = [];
  if (inCase) trail.push({label: 'Cases'});
  if (inCase && caseName) trail.push({label: caseName, href: '/'});
  if (stage) {
    trail.push({label: stage.name, href: stage.route});
    const part = stage.parts.find(p => p.anchor === hash);
    if (part) trail.push({label: part.label});
  } else if (pathname === '/decide') {
    trail.push({label: 'Check', href: '/check'}, {label: 'Decide'});
  } else if (pathname === '/') {
    trail.push({label: 'Home'});
  } else if (tail.length && (pathname === '/learn' || pathname === '/glossary')) {
    if (caseName) trail.push({label: caseName, href: '/'});
    trail.push(...tail);
  } else {
    trail.push({label: PAGE_NAMES[pathname] ?? pathname.split('/').filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join(' › '), href: pathname});
  }
  return trail;
}

/** An edge that opens after the pointer rests at it, on its handle, or by key; closes on Escape or when the pointer leaves. */
function useEdge(key: string, atEdge: (e: PointerEvent) => boolean, altOpen: string, altClose: string) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (atEdge(e)) {
        if (timer.current === null) timer.current = window.setTimeout(() => setOpen(true), DWELL_MS);
      } else if (timer.current !== null) {
        window.clearTimeout(timer.current); timer.current = null;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === key && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && singleKeysOn()) { e.preventDefault(); setOpen(o => !o); }
      // Alt and an arrow: towards the middle opens the edge, towards the edge closes it.
      if (e.altKey && !e.metaKey && !e.ctrlKey && !typing(e.target) && (e.key === altOpen || e.key === altClose)) { e.preventDefault(); setOpen(e.key === altOpen); }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('keydown', onKey); if (timer.current) window.clearTimeout(timer.current); };
  }, [key, atEdge, altOpen, altClose]);
  return [open, setOpen] as const;
}

type Command = {id: string; group: string; label: string; hint?: string; run: () => void};

function CommandPalette({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);

  const caseHref = useCaseHref();
  const go = useCallback((href: string) => { onOpenChange(false); router.push(caseHref(href)); }, [onOpenChange, router, caseHref]);
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    PAGES.forEach(p => list.push({id: `page-${p.href}`, group: 'Go to', label: p.label, hint: p.hint, run: () => go(p.href)}));
    STAGES.forEach(s => s.parts.forEach(part => list.push({id: `part-${part.anchor}`, group: 'Go to', label: `${s.name} › ${part.label}`, run: () => go(hrefOfAnchor(part.anchor))})));
    STAGES.forEach(s => list.push({id: `stage-${s.key}`, group: 'Go to', label: s.name, hint: s.line, run: () => go(s.route)}));
    THEMES.forEach(t => list.push({id: `try-${t.id}`, group: 'Appearance', label: `Try the ${t.name} theme`, hint: 'For this session; keep it from the bar', run: () => { tryTheme(t.id); onOpenChange(false); }}));
    customThemes().forEach(t => list.push({id: `try-own-${t.id}`, group: 'Appearance', label: `Try ${t.name} (your own theme)`, hint: 'For this session; keep it from the bar', run: () => { tryTheme(t.base, t.id); onOpenChange(false); }}));
    list.push({id: 'calm', group: 'Appearance', label: currentAppearance().motion === 'calm' ? 'Turn calm motion off' : 'Turn calm motion on', run: () => { keepAppearance({motion: currentAppearance().motion === 'calm' ? 'normal' : 'calm'}); onOpenChange(false); }});
    list.push({id: 'console', group: 'Go to', label: 'Backend console', run: () => { onOpenChange(false); window.location.href = '/console/'; }});
    return list;
  }, [go, onOpenChange]);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = commands.filter(c => words.every(w => `${c.group} ${c.label} ${c.hint ?? ''}`.toLowerCase().includes(w)));
  const items: Command[] = q.trim()
    ? [{id: 'search', group: 'Search', label: `Search the case for “${q.trim()}”`, hint: 'Names, documents, claims, dates', run: () => {
        onOpenChange(false);
        if (handOffSearch(q.trim()) === 'navigate' || !/^\/bring-in\/?$/.test(pathname ?? '')) router.push(caseHref('/bring-in#investigation-search'));
      }}, ...shown]
    : shown;
  const groups = Array.from(new Set(items.map(i => i.group)));
  const pick = (i: number) => items[i]?.run();

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="fr-palette" aria-describedby="fr-palette-help">
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <DialogDescription id="fr-palette-help" className="sr-only">Type to search the case or find a place or command. Arrow keys move, Enter opens.</DialogDescription>
      <input autoFocus className="fr-palette-input" placeholder="Search the case, or type a place or command…" value={q}
        aria-label="Search or command" aria-controls="fr-palette-list" aria-activedescendant={items[active] ? `fr-cmd-${items[active].id}` : undefined}
        role="combobox" aria-expanded="true"
        onChange={e => { setQ(e.target.value); setActive(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
          if (e.key === 'Enter') { e.preventDefault(); pick(active); }
        }}/>
      <div id="fr-palette-list" role="listbox" className="fr-palette-list" aria-label="Results">
        {groups.map(g => <div key={g} role="group" aria-label={g}>
          <div className="fr-palette-group">{g}</div>
          {items.map((c, i) => c.group !== g ? null : <div key={c.id} id={`fr-cmd-${c.id}`} role="option" aria-selected={i === active}
            className={`fr-cmd${i === active ? ' on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}>
            <span>{c.label}</span>{c.hint && <small>{c.hint}</small>}
          </div>)}
        </div>)}
        {!items.length && <p className="fr-palette-empty">Nothing matches. Type words from a place, a command or a record.</p>}
      </div>
      <div className="fr-palette-foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</div>
    </DialogContent>
  </Dialog>;
}

function ShortcutsHelp({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}): ReactElement {
  const rows: [string, string][] = [['⌘K / Ctrl K', 'Search the case, or go anywhere'], ['⌘O / Ctrl O', 'Switch case'], ['⌘⇧H / Ctrl Shift H', 'Hide the screen'], ['[', 'Open or close the steps (left edge)'], [']', 'Open or close the tools (top edge)'],
    ['Alt →  /  Alt ←', 'Open or close the steps'], ['Alt ↓  /  Alt ↑', 'Open or close the tools'],
    ['?', 'This list'], ['Esc', 'Close what is open']];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="fr-help">
      <DialogTitle>Keys</DialogTitle>
      <DialogDescription>Single keys never fire while you type, and can be switched off in Settings › Appearance.</DialogDescription>
      <table><tbody>{rows.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
    </DialogContent>
  </Dialog>;
}

/** Open another case (⌘O / Ctrl O): type to narrow, Enter opens its home. */
function CaseSwitcher({open, onOpenChange, onNewCase}: {open: boolean; onOpenChange: (open: boolean) => void; onNewCase: () => void}): ReactElement {
  const router = useRouter();
  const current = useWorkbenchStore(state => state.investigationId);
  const cases = useQuery({...listInvestigationsOptions(), enabled: open}).data ?? [];
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = cases.filter(c => words.every(w => `${c.name} ${c.question ?? ''}`.toLowerCase().includes(w)));
  const [placeOf, setPlaceOf] = useState<Record<string, Place>>({});
  useEffect(() => { if (open) setPlaceOf(readCasePlaces()); }, [open]);
  const pick = (id?: string) => {
    if (!id) return;
    onOpenChange(false);
    useWorkbenchStore.getState().setInvestigationId(id);
    router.push(placeOf[id]?.href ?? `/?inv=${encodeURIComponent(id)}`);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="fr-palette" aria-describedby="fr-cases-help">
      <DialogTitle className="sr-only">Switch case</DialogTitle>
      <DialogDescription id="fr-cases-help" className="sr-only">Type part of a case’s name or question. Arrow keys move, Enter opens it.</DialogDescription>
      <input autoFocus className="fr-palette-input" placeholder="Open a case…" value={q} aria-label="Find a case" role="combobox" aria-expanded="true"
        aria-controls="fr-cases-list" aria-activedescendant={shown[active] ? `fr-case-${shown[active].id}` : undefined}
        onChange={e => { setQ(e.target.value); setActive(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(shown.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
          if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]?.id); }
        }}/>
      <div id="fr-cases-list" role="listbox" className="fr-palette-list" aria-label="Cases">
        {shown.map((c, i) => <div key={c.id} id={`fr-case-${c.id}`} role="option" aria-selected={i === active} className={`fr-cmd${i === active ? ' on' : ''}`}
          onMouseEnter={() => setActive(i)} onClick={() => pick(c.id)}>
          <span>{c.name}{c.id === current ? ' · open now' : ''}</span>
          {(c.question || placeOf[c.id]) && <small>{[c.question, placeOf[c.id] && `last at ${placeOf[c.id].label.split(' › ').slice(2).join(' › ') || 'Home'}`].filter(Boolean).join(' · ')}</small>}
        </div>)}
        {!shown.length && <p className="fr-palette-empty">{cases.length ? 'No case matches.' : 'No cases yet.'}</p>}
      </div>
      <button type="button" className="fr-new-case" onClick={() => { onOpenChange(false); onNewCase(); }}>+ Start a new case</button>
      <div className="fr-palette-foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</div>
    </DialogContent>
  </Dialog>;
}

/** The bell: how many need you (less what is snoozed here); it opens the inbox. */
function Bell({onOpen}: {onOpen: () => void}): ReactElement {
  const waiting = useNeedsYouCount();
  return <button type="button" className="fr-tool fr-bell" aria-label={`Inbox: ${waiting} need${waiting === 1 ? 's' : ''} you`} onClick={onOpen}>
    <span aria-hidden="true">🔔</span>{waiting > 0 && <b className="fr-count">{waiting > 99 ? '99+' : waiting}</b>}
  </button>;
}

/** Hide screen: covers everything at once (someone at your shoulder); a click or Enter brings it back. */
function HiddenCover({onShow}: {onShow: () => void}): ReactElement {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { button.current?.focus(); }, []);
  return <div className="fr-hidden" role="dialog" aria-modal="true" aria-label="Screen hidden">
    <button ref={button} type="button" onClick={onShow}>Show the screen</button>
  </div>;
}

export function AppFrame({children}: {children: ReactNode}): ReactElement {
  const pathname = (usePathname() ?? '/').replace(/(.)\/+$/, '$1');
  const caseHref = useCaseHref();
  const trail = useTrail();
  const leftAt = useCallback((e: PointerEvent) => e.clientX <= EDGE_PX, []);
  const topAt = useCallback((e: PointerEvent) => e.clientY <= EDGE_PX, []);
  const [leftOpen, setLeft] = useEdge('[', leftAt, 'ArrowRight', 'ArrowLeft');
  const [topOpen, setTop] = useEdge(']', topAt, 'ArrowDown', 'ArrowUp');
  const [pins, setPins] = useState<Pins>({left: false, top: false});
  const [fresh, setFresh] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => { setPins(readPins()); setFresh(!learned()); setPlaces(readPlaces()); }, []);
  const left = leftOpen || pins.left;
  const top = topOpen || pins.top;
  useEffect(() => { if ((leftOpen || topOpen) && fresh) { markLearned(); setFresh(false); } }, [leftOpen, topOpen, fresh]);
  const pin = (edge: keyof Pins) => setPins(p => { const next = {...p, [edge]: !p[edge]}; writePins(next); return next; });
  // Where you have been: every place the breadcrumb names, newest first.
  const trailLabel = trail.map(t => t.label).join(' › ');
  useEffect(() => {
    if (!trailLabel || typeof window === 'undefined') return;
    const place = {href: `${window.location.pathname}${window.location.search}${window.location.hash}`, label: trailLabel};
    setPlaces(rememberPlace(place));
    const inv = new URLSearchParams(window.location.search).get('inv');
    if (inv && trail[0]?.label === 'Cases') rememberCasePlace(inv, place);
  }, [trailLabel]); // eslint-disable-line react-hooks/exhaustive-deps -- a new place is a new trail
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [cases, setCases] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [newCase, setNewCase] = useState(false);
  const closeInbox = useCallback(() => setInbox(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); setCases(c => !c); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); setHidden(true); }
      else if (e.key === '?' && !typing(e.target) && singleKeysOn()) { e.preventDefault(); setHelp(true); }
    };
    const openCases = () => setCases(true);
    const openPalette = () => setPalette(true);
    const openInbox = () => setInbox(true);
    const hide = () => setHidden(true);
    const openNewCase = () => setNewCase(true);
    const events: [string, () => void][] = [[SWITCH_CASE_EVENT, openCases], [OPEN_PALETTE_EVENT, openPalette], [OPEN_INBOX_EVENT, openInbox], [HIDE_SCREEN_EVENT, hide], [NEW_CASE_EVENT, openNewCase]];
    window.addEventListener('keydown', onKey);
    for (const [name, fn] of events) window.addEventListener(name, fn);
    return () => { window.removeEventListener('keydown', onKey); for (const [name, fn] of events) window.removeEventListener(name, fn); };
  }, []);
  useEffect(() => { setLeft(false); setTop(false); }, [pathname, setLeft, setTop]);
  // Re-apply the kept (or tried) appearance after every navigation, in case anything reset <html>'s attributes.
  useEffect(() => { applyAppearance(); }, [pathname]);

  return <div className={`fr${pins.left ? ' pin-left' : ''}${pins.top ? ' pin-top' : ''}`}>
    <a href="#fr-main" className="fr-skip">Skip to the content</a>
    <nav className="fr-crumbs" aria-label="You are here">
      <button type="button" className="fr-crumb-home" onClick={() => setLeft(o => !o)} aria-expanded={left} aria-controls="fr-left" title="Steps and pages ( [ )">
        <span aria-hidden="true">≡</span><span className="sr-only">Steps and pages</span>
      </button>
      <ol>{trail.map((t, i) => <li key={i}>{t.label === 'Cases' && i === 0 ? <button type="button" className="fr-crumb-cases" onClick={() => setCases(true)} title="Switch case (⌘O)">Cases</button>
        : t.href && i < trail.length - 1 ? <Link href={caseHref(t.href)}>{t.label}</Link> : <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{t.label}</span>}</li>)}</ol>
    </nav>

    {/* Left edge: where to go. */}
    <button type="button" className={`fr-handle fr-handle-left${left ? ' on' : ''}`} aria-label="Open steps and pages" aria-expanded={left} aria-controls="fr-left" onClick={() => setLeft(o => !o)}/>
    {!left && <span className="fr-edge-label" aria-hidden="true">▸ Case · Steps</span>}
    {fresh && !left && <span className="fr-hint fr-hint-left" aria-hidden="true">Steps and pages <kbd>[</kbd></span>}
    {fresh && !top && <span className="fr-hint fr-hint-top" aria-hidden="true">Tools <kbd>]</kbd></span>}
    <aside id="fr-left" className={`fr-left${left ? ' open' : ''}`} aria-label="Steps and pages" aria-hidden={!left} onMouseLeave={() => setLeft(false)} inert={!left ? true : undefined}>
      <div className="fr-left-head"><b>Journalism Workbench</b>
        <span><button type="button" className={`fr-pin${pins.left ? ' on' : ''}`} aria-pressed={pins.left} onClick={() => pin('left')}
          title={pins.left ? 'Let it hide again' : 'Keep it open on this computer'}>{pins.left ? 'Pinned' : 'Pin'}</button>
        <button type="button" className="fr-x" onClick={() => { setLeft(false); if (pins.left) pin('left'); }} aria-label="Close">×</button></span></div>
      {places.length > 1 && <div className="fr-places"><p>Where you have been</p>
        <ul>{places.slice(1).map(p => <li key={p.href}><Link href={p.href}>{p.label}</Link></li>)}</ul></div>}
      <ul className="fr-pages">{PAGES.map(p => <li key={p.href}><Link href={caseHref(p.href)} className={pathname === p.href ? 'on' : ''} aria-current={pathname === p.href ? 'page' : undefined}>{p.label}</Link></li>)}</ul>
      <div className="fr-steps">
        {STAGES.map(s => <div key={s.key} className="fr-step">
          <Link href={caseHref(s.route)} className={`fr-step-name${pathname === s.route ? ' on' : ''}`} style={{['--stage' as string]: s.colour}}><span>{s.n}</span>{s.name}</Link>
          <ul>{s.parts.map(p => <li key={p.anchor}><Link href={caseHref(`${s.route}#${p.anchor}`)}>{p.label}</Link></li>)}</ul>
        </div>)}
      </div>
      <a href="/console/" className="fr-console">Backend console</a>
    </aside>

    {/* Top edge: tools. */}
    <button type="button" className={`fr-handle fr-handle-top${top ? ' on' : ''}`} aria-label="Open tools" aria-expanded={top} aria-controls="fr-top" onClick={() => setTop(o => !o)}/>
    <div id="fr-top" className={`fr-top${top ? ' open' : ''}`} role="toolbar" aria-label="Tools" aria-hidden={!top} onMouseLeave={() => setTop(false)} inert={!top ? true : undefined}>
      <button type="button" className="fr-tool" onClick={() => { setTop(false); setCases(true); }}>Switch case <kbd>⌘O</kbd></button>
      <button type="button" className="fr-tool wide" onClick={() => { setTop(false); setPalette(true); }}>Search the case, or type a command… <kbd>⌘K</kbd></button>
      <Bell onOpen={() => { setTop(false); setInbox(true); }}/>
      <Link href="/settings" className="fr-tool" aria-label="Settings" title="Settings"><span aria-hidden="true">⚙</span></Link>
      <button type="button" className="fr-tool" onClick={() => { setTop(false); setHelp(true); }}>Keys <kbd>?</kbd></button>
      <button type="button" className="fr-tool" onClick={() => { setTop(false); setHidden(true); }} title="Cover the screen at once (⌘⇧H)">Hide screen</button>
      <button type="button" className={`fr-tool fr-pin${pins.top ? ' on' : ''}`} aria-pressed={pins.top} onClick={() => pin('top')}
        title={pins.top ? 'Let it hide again' : 'Keep it open on this computer'}>{pins.top ? 'Pinned' : 'Pin'}</button>
    </div>

    <div id="fr-main" className="fr-main">{children}</div>
    <TryingBar/>
    <BoardEffects/>
    <CommandPalette open={palette} onOpenChange={setPalette}/>
    <ShortcutsHelp open={help} onOpenChange={setHelp}/>
    <CaseSwitcher open={cases} onOpenChange={setCases} onNewCase={() => setNewCase(true)}/>
    <Dialog open={newCase} onOpenChange={setNewCase}>
      <DialogContent className="fr-new">
        <DialogTitle>Start a case</DialogTitle>
        <DialogDescription>Its name and question, what kind of case it is, and what you have so far.</DialogDescription>
        <NewCaseSetup onCreated={() => setNewCase(false)}/>
      </DialogContent>
    </Dialog>
    <Inbox open={inbox} onClose={closeInbox}/>
    {hidden && <HiddenCover onShow={() => setHidden(false)}/>}
  </div>;
}
