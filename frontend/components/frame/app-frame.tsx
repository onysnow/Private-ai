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
import {STAGES, hrefOfAnchor} from '../../lib/stages';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {handOffSearch} from '../../lib/search-handoff';
import {applyAppearance, currentAppearance, keepAppearance, THEMES, tryTheme} from '../../lib/theme';
import {singleKeysOn} from '../../lib/shortcuts';
import {getStandingOptions, listInvestigationsOptions} from '../../lib/generated/@tanstack/react-query.gen';

/** Any screen can ask the frame to open the case switcher. */
export const SWITCH_CASE_EVENT = 'pai:switch-case';

const DWELL_MS = 260;
const EDGE_PX = 6;

const PAGES: {label: string; href: string; hint: string}[] = [
  {label: 'Case home', href: '/', hint: 'Where the case stands and what needs you'},
  {label: 'Decide', href: '/decide', hint: 'Everything only you can decide, one at a time'},
  {label: 'Glossary', href: '/glossary', hint: 'Terms and Red Flag indicators'},
  {label: 'Settings', href: '/settings', hint: 'Appearance, access, demo case'},
  {label: 'About', href: '/about', hint: 'What this app is'},
];

const PAGE_NAMES: Record<string, string> = {'/': 'Case home', '/decide': 'Decide', '/glossary': 'Glossary', '/settings': 'Settings', '/about': 'About', '/review': 'Review', '/review/batch': 'Batch review'};

/** A link inside the case keeps the open case (?inv=) so a reload or a shared link opens it again. */
function useCaseHref(): (href: string) => string {
  const inv = useWorkbenchStore(state => state.investigationId);
  return useCallback((href: string) => {
    if (!inv || !(href === '/' || href.startsWith('/#') || href.startsWith('/decide') || STAGES.some(s => href.startsWith(s.route)))) return href;
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
  } else {
    trail.push({label: PAGE_NAMES[pathname] ?? pathname.split('/').filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join(' › '), href: pathname});
  }
  return trail;
}

/** An edge that opens after the pointer rests at it, on its handle, or by key; closes on Escape or when the pointer leaves. */
function useEdge(key: string, atEdge: (e: PointerEvent) => boolean) {
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
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('keydown', onKey); if (timer.current) window.clearTimeout(timer.current); };
  }, [key, atEdge]);
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
function CaseSwitcher({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}): ReactElement {
  const router = useRouter();
  const current = useWorkbenchStore(state => state.investigationId);
  const cases = useQuery({...listInvestigationsOptions(), enabled: open}).data ?? [];
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = cases.filter(c => words.every(w => `${c.name} ${c.question ?? ''}`.toLowerCase().includes(w)));
  const pick = (id?: string) => {
    if (!id) return;
    onOpenChange(false);
    useWorkbenchStore.getState().setInvestigationId(id);
    router.push(`/?inv=${encodeURIComponent(id)}`);
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
          <span>{c.name}{c.id === current ? ' · open now' : ''}</span>{c.question && <small>{c.question}</small>}
        </div>)}
        {!shown.length && <p className="fr-palette-empty">{cases.length ? 'No case matches.' : 'No cases yet.'}</p>}
      </div>
      <div className="fr-palette-foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</div>
    </DialogContent>
  </Dialog>;
}

/** What waits for a person in the open case: the bell's count, linking to Decide. */
function Bell({href}: {href: string}): ReactElement {
  const inv = useWorkbenchStore(state => state.investigationId);
  const waiting = useQuery({...getStandingOptions({path: {investigation_id: inv}}), enabled: Boolean(inv)}).data?.to_decide ?? 0;
  return <Link href={href} className="fr-tool fr-bell" aria-label={`${waiting} waiting for you to decide`}>
    <span aria-hidden="true">🔔</span>{waiting > 0 && <b className="fr-count">{waiting > 99 ? '99+' : waiting}</b>}
  </Link>;
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
  const [left, setLeft] = useEdge('[', leftAt);
  const [top, setTop] = useEdge(']', topAt);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [cases, setCases] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); setCases(c => !c); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); setHidden(true); }
      else if (e.key === '?' && !typing(e.target) && singleKeysOn()) { e.preventDefault(); setHelp(true); }
    };
    const openCases = () => setCases(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SWITCH_CASE_EVENT, openCases);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(SWITCH_CASE_EVENT, openCases); };
  }, []);
  useEffect(() => { setLeft(false); setTop(false); }, [pathname, setLeft, setTop]);
  // Re-apply the kept (or tried) appearance after every navigation, in case anything reset <html>'s attributes.
  useEffect(() => { applyAppearance(); }, [pathname]);

  return <div className="fr">
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
    <aside id="fr-left" className={`fr-left${left ? ' open' : ''}`} aria-label="Steps and pages" aria-hidden={!left} onMouseLeave={() => setLeft(false)} inert={!left ? true : undefined}>
      <div className="fr-left-head"><b>Journalism Workbench</b><button type="button" className="fr-x" onClick={() => setLeft(false)} aria-label="Close">×</button></div>
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
      <Bell href={caseHref('/decide')}/>
      <Link href="/settings" className="fr-tool" aria-label="Settings" title="Settings"><span aria-hidden="true">⚙</span></Link>
      <button type="button" className="fr-tool" onClick={() => { setTop(false); setHelp(true); }}>Keys <kbd>?</kbd></button>
      <button type="button" className="fr-tool" onClick={() => { setTop(false); setHidden(true); }} title="Cover the screen at once (⌘⇧H)">Hide screen</button>
    </div>

    <div id="fr-main" className="fr-main">{children}</div>
    <TryingBar/>
    <CommandPalette open={palette} onOpenChange={setPalette}/>
    <ShortcutsHelp open={help} onOpenChange={setHelp}/>
    <CaseSwitcher open={cases} onOpenChange={setCases}/>
    {hidden && <HiddenCover onShow={() => setHidden(false)}/>}
  </div>;
}
