'use client';
// Learn › Glossary (research Knowledge §1): every term the catalogue holds, not the first 200. Left, an A–Z rail with
// counts; centre, one line per term (term, first sentence, its areas) in a windowed list made for scrolling; right,
// the open term as a reading card. Pointing at a row for a moment shows it in the card; a click pins it. One "Area"
// button opens a picker grouped by the catalogue map's families; chosen areas show as removable pills with Clear.
// When several areas word a term themselves the card has a tab per area; an area that lists the term without its
// own wording says "No definition yet" (the wording of every area's definition is Ony's to write, never made up).
// Keys: / search, ↓ from the search box to the terms, ↑ ↓ or J / K move, Enter pins.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement, ReactNode} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {getGlossaryEntryOptions, listAreasOptions, listTermHintsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {CatalogueAreaOut, GlossaryHintOut} from '../../lib/generated/types.gen';
import {setTrailTail} from '../../lib/trail';
import {FAMILIES} from '../knowledge/families';
import {GlossaryText} from './glossary-text';

export const ROW_H = 46;
const OVERSCAN = 8;
const DWELL_MS = 120;
const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export const letterOf = (term: string): string => {
  const c = term.trim()[0]?.toUpperCase() ?? '#';
  return c >= 'A' && c <= 'Z' ? c : '#';
};
const firstSentence = (text: string): string => (text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text);

/** Terms whose name or definition holds every word, only in the chosen areas. The term named exactly comes first, then
 * names that start with the words, then names that hold them, then definitions; each group in the catalogue's order. */
export function filterTerms(hints: GlossaryHintOut[], q: string, areas: string[]): GlossaryHintOut[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = areas.length ? hints.filter(h => h.areas.some(a => areas.includes(a))) : hints;
  if (!words.length) return out;
  const phrase = words.join(' ');
  const rank = (h: GlossaryHintOut) => {
    const name = h.term.toLowerCase();
    return name === phrase ? 0 : name.startsWith(phrase) ? 1 : words.every(w => name.includes(w)) ? 2 : 3;
  };
  return out.filter(h => words.every(w => `${h.term} ${h.definition}`.toLowerCase().includes(w)))
    .map((h, i) => ({h, i, r: rank(h)})).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.h);
}

function readParam(key: string): string {
  return typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get(key) ?? '';
}
function writeParam(key: string, value: string): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
}

export function GlossaryScreen({tabs}: {tabs?: ReactNode}): ReactElement {
  const hintsQuery = useQuery({...listTermHintsOptions(), staleTime: Infinity, gcTime: Infinity});
  const areasQuery = useQuery({...listAreasOptions(), staleTime: Infinity});
  const hints = useMemo(() => hintsQuery.data ?? [], [hintsQuery.data]);
  const areaName = useMemo(() => new Map((areasQuery.data ?? []).map(a => [a.key, a.name])), [areasQuery.data]);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [pinned, setPinned] = useState('');
  const [hover, setHover] = useState('');
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [scroll, setScroll] = useState({top: 0, height: 0});

  useEffect(() => {
    const asked = readParam('q');
    const term = readParam('term');
    setText(asked); setQ(asked);
    setPinned(term || asked);
    const area = readParam('area');
    if (area) setChosen(area.split(',').filter(Boolean));
  }, []);
  // The search waits for a pause in typing before it filters and before it changes the address.
  useEffect(() => { const t = window.setTimeout(() => { setQ(text.trim()); writeParam('q', text.trim()); }, 150); return () => window.clearTimeout(t); }, [text]);
  useEffect(() => { writeParam('area', chosen.join(',')); }, [chosen]);
  useEffect(() => { setTrailTail([{label: 'Learn', href: '/learn'}, {label: 'Glossary'}]); return () => setTrailTail([]); }, []);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === '/' && !(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const read = () => setScroll({top: el.scrollTop, height: el.clientHeight});
    read();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [hintsQuery.isSuccess]);

  const shown = useMemo(() => filterTerms(hints, q, chosen), [hints, q, chosen]);
  useEffect(() => setActive(0), [q, chosen]);
  const pinnedHint = hints.find(h => h.term.toLowerCase() === pinned.toLowerCase());
  const open = hover || pinnedHint?.term || '';
  const firstIndex = useMemo(() => {
    const m = new Map<string, number>();
    shown.forEach((h, i) => { const l = letterOf(h.term); if (!m.has(l)) m.set(l, i); });
    return m;
  }, [shown]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of shown) m.set(letterOf(h.term), (m.get(letterOf(h.term)) ?? 0) + 1);
    return m;
  }, [shown]);

  // A windowed list: only the rows in view (and a few either side) are in the page.
  const height = Math.max(scroll.height, 800);
  const from = Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN);
  const to = Math.min(shown.length, Math.ceil((scroll.top + height) / ROW_H) + OVERSCAN);
  const topLetter = shown[Math.floor(scroll.top / ROW_H)] ? letterOf(shown[Math.floor(scroll.top / ROW_H)].term) : '';

  const scrollTo = (i: number) => {
    const el = listRef.current;
    if (!el) return;
    if (i * ROW_H < el.scrollTop) el.scrollTop = i * ROW_H;
    else if ((i + 1) * ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = (i + 1) * ROW_H - el.clientHeight;
    setScroll({top: el.scrollTop, height: el.clientHeight});
  };
  const jump = (letter: string) => {
    const i = firstIndex.get(letter);
    if (i === undefined || !listRef.current) return;
    listRef.current.scrollTop = i * ROW_H;
    setScroll({top: i * ROW_H, height: listRef.current.clientHeight});
    setActive(i);
  };
  const pin = (term: string) => { setPinned(term); setHover(''); writeParam('term', term); };
  const onListKey = (e: KeyboardEvent) => {
    const move = (by: number) => { e.preventDefault(); const i = Math.max(0, Math.min(shown.length - 1, active + by)); setActive(i); scrollTo(i); };
    if (e.key === 'ArrowDown' || e.key === 'j') move(1);
    else if (e.key === 'ArrowUp' || e.key === 'k') move(-1);
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pin(shown[active].term); }
  };
  const clearTimer = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);

  const families = useMemo(() => groupAreas(areasQuery.data ?? []), [areasQuery.data]);

  return <div className="kg">
    <header className="kg-top">
      {tabs}
      <label className="kg-search"><span className="sr-only">Search the glossary</span>
        <input ref={searchRef} value={text} onChange={e => setText(e.target.value)} placeholder={`Search ${hints.length ? hints.length.toLocaleString('en-GB') : ''} terms and definitions`}
          aria-label="Search the glossary" onKeyDown={e => {
            // ↓ goes from the box to the first term; Enter opens the first term.
            if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); setActive(0); scrollTo(0); listRef.current?.focus(); }
            else if (e.key === 'Enter' && shown[0]) { e.preventDefault(); setActive(0); pin(shown[0].term); }
          }}/><kbd aria-hidden="true">/</kbd></label>
      <AreaPicker families={families} chosen={chosen} onChange={setChosen}/>
      <p className="kg-count" aria-live="polite"><b>{shown.length.toLocaleString('en-GB')}</b> of {hints.length.toLocaleString('en-GB')} terms</p>
    </header>
    {chosen.length > 0 && <div className="kg-pills" aria-label="Active selections">
      {chosen.map(a => <button type="button" key={a} className="kg-pill" onClick={() => setChosen(chosen.filter(x => x !== a))} aria-label={`Remove ${areaName.get(a) ?? a}`}>
        {areaName.get(a) ?? a} <span aria-hidden="true">×</span></button>)}
      <button type="button" className="kc-link" onClick={() => setChosen([])}>Clear</button>
    </div>}
    <div className="kg-body">
      <nav className="kg-rail" aria-label="Letters">
        <ol>{LETTERS.map(l => <li key={l}><button type="button" disabled={!counts.get(l)} aria-current={topLetter === l ? 'true' : undefined} onClick={() => jump(l)}
          aria-label={`${l === '#' ? 'Other characters' : l}, ${counts.get(l) ?? 0} terms`}>{l}<small>{counts.get(l) ?? 0}</small></button></li>)}</ol>
      </nav>
      <div className="kc-panel kg-list-panel">
        {hintsQuery.isError && <p className="kc-error" role="alert">{errorMessage(hintsQuery.error, 'Could not load the glossary')}
          <button type="button" className="kc-link" onClick={() => void hintsQuery.refetch()}>Retry</button></p>}
        {hintsQuery.isPending && <div aria-hidden="true">{Array.from({length: 3}, (_, i) => <div key={i} className="kc-skeleton"/>)}</div>}
        {hintsQuery.isSuccess && shown.length === 0 && <p className="kc-empty">No term matches “{q}”. <Link href={`/learn`}>Search indicators instead</Link></p>}
        <div className="kg-list" ref={listRef} role="listbox" tabIndex={0} aria-label="Terms" onKeyDown={onListKey}
          aria-activedescendant={shown[active] ? `kg-row-${active}` : undefined}
          onScroll={e => setScroll({top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight})}
          onPointerLeave={() => { clearTimer(); setHover(''); }}>
          <div style={{height: shown.length * ROW_H, position: 'relative'}}>
            {shown.slice(from, to).map((h, k) => {
              const i = from + k;
              return <div key={h.term} id={`kg-row-${i}`} role="option" aria-selected={h.term === pinnedHint?.term}
                className={`kg-row${i === active ? ' active' : ''}${h.term === pinnedHint?.term ? ' on' : ''}`} style={{top: i * ROW_H, height: ROW_H}}
                onClick={() => { setActive(i); pin(h.term); }}
                onPointerEnter={() => { clearTimer(); timer.current = window.setTimeout(() => setHover(h.term), DWELL_MS); }}>
                {/* A row is its term; the first sentence opens in the card on point (and is read with the row), and its areas
                    are a dot each, named on hover (Ony, 29 Oct). */}
                <span className="kg-term">{h.term}</span>
                <span className="kg-first sr-only">{firstSentence(h.definition)}</span>
                <Reveal tabbable={false} describe={false} detail={h.areas.map(a => <span key={a} className="rv-row">{areaName.get(a) ?? a}</span>)}>
                  <span className="kg-areas" aria-label={`Areas: ${h.areas.map(a => areaName.get(a) ?? a).join(', ')}`}>
                    {h.areas.slice(0, 4).map(a => <i key={a} aria-hidden="true"/>)}{h.areas.length > 4 && <small aria-hidden="true">+{h.areas.length - 4}</small>}</span></Reveal>
              </div>;
            })}
          </div>
        </div>
      </div>
      <TermCard term={open} hint={hints.find(h => h.term === open)} areaName={areaName} onOpen={pin} known={hints}/>
    </div>
  </div>;
}

type AreaGroup = {name: string; areas: CatalogueAreaOut[]};
function groupAreas(areas: CatalogueAreaOut[]): AreaGroup[] {
  const listed = new Set(FAMILIES.flatMap(f => f.areas));
  const groups = FAMILIES.map(f => ({name: f.name, areas: f.areas.map(k => areas.find(a => a.key === k)).filter((a): a is CatalogueAreaOut => Boolean(a))}));
  const rest = areas.filter(a => !listed.has(a.key));
  return [...groups, ...(rest.length ? [{name: 'Other', areas: rest}] : [])].filter(g => g.areas.length);
}

function AreaPicker({families, chosen, onChange}: {families: AreaGroup[]; chosen: string[]; onChange: (areas: string[]) => void}): ReactElement {
  const [open, setOpen] = useState(false);
  const toggle = (key: string) => onChange(chosen.includes(key) ? chosen.filter(k => k !== key) : [...chosen, key]);
  return <div className="kg-picker" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button type="button" className="kc-btn ghost" aria-expanded={open} onClick={() => setOpen(v => !v)}>Area{chosen.length ? ` · ${chosen.length}` : ''} ▾</button>
    {open && <div className="kg-picker-pop" role="group" aria-label="Areas, in families">
      {families.map(g => <fieldset key={g.name}><legend>{g.name}</legend>
        {g.areas.map(a => <label key={a.key}><input type="checkbox" checked={chosen.includes(a.key)} onChange={() => toggle(a.key)}/> {a.name} <small>{a.terms}</small></label>)}
      </fieldset>)}
      <button type="button" className="kc-btn ghost" onClick={() => setOpen(false)}>Done</button>
    </div>}
  </div>;
}

function TermCard({term, hint, areaName, onOpen, known}: {
  term: string; hint: GlossaryHintOut | undefined; areaName: Map<string, string>; onOpen: (term: string) => void; known: GlossaryHintOut[];
}): ReactElement {
  const entry = useQuery({...getGlossaryEntryOptions({query: {term}}), enabled: Boolean(term), staleTime: Infinity});
  const [tab, setTab] = useState('');
  useEffect(() => setTab(''), [term]);
  if (!term || !hint) return <article className="kc-panel kg-card"><p className="kc-quiet">Point at a term to read it here; click to keep it open.</p></article>;
  const e = entry.data;
  const areas = e?.areas ?? hint.areas;
  const defs = new Map((e?.definitions ?? []).map(d => [d.area, d]));
  const current = tab || areas.find(a => defs.has(a)) || areas[0];
  const knownTerm = (name: string) => known.find(h => h.term.toLowerCase() === name.toLowerCase());
  return <article className="kc-panel kg-card" aria-labelledby="kg-card-title" key={term}>
    <p className="kc-eyebrow">{areas.map(a => areaName.get(a) ?? a).join(' · ')}</p>
    <h2 id="kg-card-title" className="kc-ind-name">{hint.term}</h2>
    {/* How many areas define it is sub-text: on the area tabs, on hover, and read with them (Ony, 29 Oct). */}
    {areas.length > 1 && <Reveal tabbable={false} className="kg-tabs-rv" detail={<>Defined in {defs.size || hint.definitions} {(defs.size || hint.definitions) === 1 ? 'area' : 'areas'}{areas.length > (defs.size || hint.definitions) ? `, listed in ${areas.length}` : ''}</>}>
      <div className="kg-tabs" role="tablist" aria-label="Each area's definition">
        {areas.map(a => <button type="button" key={a} role="tab" aria-selected={a === current} className={a === current ? 'on' : ''} onClick={() => setTab(a)}>
          {areaName.get(a) ?? a}{defs.has(a) || !e ? '' : ' ○'}</button>)}
      </div></Reveal>}
    <div role={areas.length > 1 ? 'tabpanel' : undefined} className="kg-def">
      {e && !defs.has(current) ? <p className="kc-dashed-box">No definition yet in {areaName.get(current) ?? current}.</p>
        : <p className="kc-def"><GlossaryText text={defs.get(current)?.definition ?? hint.definition} skip={hint.term}/></p>}
      {defs.get(current)?.source_url && <p className="kc-small">{current === 'APP' ? <a href={defs.get(current)!.source_url}>Where it is in the app</a>
        : <a href={defs.get(current)!.source_url} target="_blank" rel="noreferrer">Source</a>}</p>}
    </div>
    {entry.isError && <p className="kc-error">{errorMessage(entry.error, 'Could not load the full entry')}</p>}
    {e && e.examples.length > 0 && <section><h3 className="kc-eyebrow">Examples</h3><ul className="kg-ul">{e.examples.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
    {e && e.related.length > 0 && <section><h3 className="kc-eyebrow">Related</h3><p className="kg-chips">{e.related.map(r => knownTerm(r)
      ? <button type="button" key={r} className="kc-chip" onClick={() => onOpen(knownTerm(r)!.term)}>{r}</button>
      : <span key={r} className="kc-chip static">{r}</span>)}</p></section>}
    {e && e.cases.length > 0 && <section><h3 className="kc-eyebrow">Cases to look up</h3><ul className="kg-ul">{e.cases.map((c, i) => <li key={i}>{c}</li>)}</ul></section>}
    {e && e.indicators.length > 0 && <section><h3 className="kc-eyebrow">Used by</h3><p className="kg-chips">{e.indicators.map(id =>
      <Link key={id} className="kc-chip" href={`/learn?indicator=${encodeURIComponent(id)}`}>{id}</Link>)}</p></section>}
  </article>;
}
