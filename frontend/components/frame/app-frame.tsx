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

import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {TryingBar} from '../../features/appearance/appearance-panel';
import {STAGES} from '../../lib/stages';
import {handOffSearch} from '../../lib/search-handoff';
import {applyAppearance, currentAppearance, keepAppearance, THEMES, tryTheme} from '../../lib/theme';
import {singleKeysOn} from '../../lib/shortcuts';

const DWELL_MS = 260;
const EDGE_PX = 6;

const PAGES: {label: string; href: string; hint: string}[] = [
  {label: 'Case at a glance', href: '/dashboard', hint: 'The quick look at a case'},
  {label: 'Workbench', href: '/', hint: 'Every step of the case'},
  {label: 'Glossary', href: '/glossary', hint: 'Terms and Red Flag indicators'},
  {label: 'Settings', href: '/settings', hint: 'Appearance, access, demo case'},
  {label: 'About', href: '/about', hint: 'What this app is'},
];

const PAGE_NAMES: Record<string, string> = {'/': 'Workbench', '/dashboard': 'Case at a glance', '/glossary': 'Glossary', '/settings': 'Settings', '/about': 'About', '/review': 'Review', '/review/batch': 'Batch review'};

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Where you are: the page, and on the workbench the step and part you jumped to. */
function useTrail(): {label: string; href?: string}[] {
  const pathname = usePathname() ?? '/';
  const [hash, setHash] = useState('');
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace('#', ''));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [pathname]);
  const trail: {label: string; href?: string}[] = [{label: PAGE_NAMES[pathname] ?? pathname.split('/').filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join(' › '), href: pathname}];
  if (pathname === '/' && hash) {
    const stage = STAGES.find(s => s.parts.some(p => p.anchor === hash));
    const part = stage?.parts.find(p => p.anchor === hash);
    if (stage) trail.push({label: stage.name, href: `/#stage-${stage.key}`});
    if (part) trail.push({label: part.label});
    else {
      const byStage = STAGES.find(s => `stage-${s.key}` === hash);
      if (byStage) trail.push({label: byStage.name});
    }
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

  const go = useCallback((href: string) => { onOpenChange(false); router.push(href); }, [onOpenChange, router]);
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    PAGES.forEach(p => list.push({id: `page-${p.href}`, group: 'Go to', label: p.label, hint: p.hint, run: () => go(p.href)}));
    STAGES.forEach(s => s.parts.forEach(part => list.push({id: `part-${part.anchor}`, group: 'Go to', label: `${s.name} › ${part.label}`, run: () => go(`/#${part.anchor}`)})));
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
        if (handOffSearch(q.trim()) === 'navigate' || pathname !== '/') router.push('/#investigation-search');
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
  const rows: [string, string][] = [['⌘K / Ctrl K', 'Search the case, or go anywhere'], ['[', 'Open or close the steps (left edge)'], [']', 'Open or close the tools (top edge)'],
    ['?', 'This list'], ['Esc', 'Close what is open']];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="fr-help">
      <DialogTitle>Keys</DialogTitle>
      <DialogDescription>Single keys never fire while you type, and can be switched off in Settings › Appearance.</DialogDescription>
      <table><tbody>{rows.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
    </DialogContent>
  </Dialog>;
}

export function AppFrame({children}: {children: ReactNode}): ReactElement {
  const pathname = usePathname();
  const trail = useTrail();
  const leftAt = useCallback((e: PointerEvent) => e.clientX <= EDGE_PX, []);
  const topAt = useCallback((e: PointerEvent) => e.clientY <= EDGE_PX, []);
  const [left, setLeft] = useEdge('[', leftAt);
  const [top, setTop] = useEdge(']', topAt);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      else if (e.key === '?' && !typing(e.target) && singleKeysOn()) { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      <ol>{trail.map((t, i) => <li key={i}>{t.href && i < trail.length - 1 ? <Link href={t.href}>{t.label}</Link> : <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{t.label}</span>}</li>)}</ol>
    </nav>

    {/* Left edge: where to go. */}
    <button type="button" className={`fr-handle fr-handle-left${left ? ' on' : ''}`} aria-label="Open steps and pages" aria-expanded={left} aria-controls="fr-left" onClick={() => setLeft(o => !o)}/>
    <aside id="fr-left" className={`fr-left${left ? ' open' : ''}`} aria-label="Steps and pages" aria-hidden={!left} onMouseLeave={() => setLeft(false)} inert={!left ? true : undefined}>
      <div className="fr-left-head"><b>Journalism Workbench</b><button type="button" className="fr-x" onClick={() => setLeft(false)} aria-label="Close">×</button></div>
      <ul className="fr-pages">{PAGES.map(p => <li key={p.href}><Link href={p.href} className={pathname === p.href ? 'on' : ''}>{p.label}</Link></li>)}</ul>
      <div className="fr-steps">
        {STAGES.map(s => <div key={s.key} className="fr-step">
          <Link href={`/#stage-${s.key}`} className="fr-step-name" style={{['--stage' as string]: s.colour}}><span>{s.n}</span>{s.name}</Link>
          <ul>{s.parts.map(p => <li key={p.anchor}><Link href={`/#${p.anchor}`}>{p.label}</Link></li>)}</ul>
        </div>)}
      </div>
      <a href="/console/" className="fr-console">Backend console</a>
    </aside>

    {/* Top edge: tools. */}
    <button type="button" className={`fr-handle fr-handle-top${top ? ' on' : ''}`} aria-label="Open tools" aria-expanded={top} aria-controls="fr-top" onClick={() => setTop(o => !o)}/>
    <div id="fr-top" className={`fr-top${top ? ' open' : ''}`} role="toolbar" aria-label="Tools" aria-hidden={!top} onMouseLeave={() => setTop(false)} inert={!top ? true : undefined}>
      <button type="button" className="fr-tool wide" onClick={() => { setTop(false); setPalette(true); }}>Search the case, or type a command… <kbd>⌘K</kbd></button>
      <Link href="/#document-ingestion" className="fr-tool">Add documents</Link>
      <Link href="/settings" className="fr-tool">Settings</Link>
      <button type="button" className="fr-tool" onClick={() => { setTop(false); setHelp(true); }}>Keys <kbd>?</kbd></button>
    </div>

    <div id="fr-main" className="fr-main">{children}</div>
    <TryingBar/>
    <CommandPalette open={palette} onOpenChange={setPalette}/>
    <ShortcutsHelp open={help} onOpenChange={setHelp}/>
  </div>;
}
