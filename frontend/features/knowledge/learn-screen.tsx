'use client';
// Learn (mockup KNOWLEDGE_KEEP_1, research Knowledge §1–4): one whole-screen feature with two tabs, the Red Flags
// catalogue and the Glossary. The catalogue is three panels on the board: the map of the areas in their families,
// the chosen area's indicators, and the indicator page; Map / Table / Cards switch the first two. The open case
// (?inv=, or the case the workbench has open) is a layer over all of it: what fires, at which level.
// The address keeps the place: ?area=BO&indicator=BO-007&view=map, so a reload or a shared link opens it again.
import {useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
// Connects the generated client to the shared ApiClient, as every page that calls the API does.
import '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {getCatalogueMapOptions, listAreasOptions, listIndicatorsOptions, searchGlossaryOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {setTrailTail} from '../../lib/trail';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {GlossaryScreen} from '../glossary/glossary-screen';
import {CatalogueCards} from './catalogue-cards';
import {CatalogueMap} from './catalogue-map';
import {CatalogueTable} from './catalogue-table';
import {strongest, useCaseLayer} from './case-layer';
import {readingOrder, shortAreaName} from './families';
import {IndicatorList} from './indicator-list';
import type {ListFilter} from './indicator-list';
import {IndicatorPage} from './indicator-page';
import {LearnTabs} from './learn-tabs';
import type {LearnTab as Tab} from './learn-tabs';

type View = 'map' | 'table' | 'cards';

function readParams(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
}
function writeParams(values: Record<string, string | null>): void {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(values)) { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
}

/** The case to lay over the catalogue: the one in the address, or the one the workbench has open. */
function useCaseId(): string {
  const stored = useWorkbenchStore(state => state.investigationId);
  const [fromUrl, setFromUrl] = useState('');
  useEffect(() => { setFromUrl(readParams().get('inv') ?? ''); }, []);
  return fromUrl || stored || '';
}

export function LearnScreen({tab}: {tab: Tab}): ReactElement {
  const inv = useCaseId();
  const layer = useCaseLayer(inv);
  // The frame's breadcrumb and its links keep the case this screen is laid over.
  useEffect(() => {
    if (!inv || !layer.caseName) return;
    const store = useWorkbenchStore.getState();
    if (store.investigationId !== inv) store.setInvestigationId(inv);
    store.setInvestigationName(layer.caseName);
  }, [inv, layer.caseName]);
  return <div className="kc" data-tab={tab}>
    {tab === 'catalogue' ? <Catalogue layer={layer}/> : <GlossaryScreen tabs={<LearnTabs tab="glossary" inv={inv}/>}/>}
  </div>;
}

function Catalogue({layer}: {layer: ReturnType<typeof useCaseLayer>}): ReactElement {
  const areasQuery = useQuery({...listAreasOptions(), staleTime: Infinity});
  const mapQuery = useQuery({...getCatalogueMapOptions(), staleTime: Infinity});
  const areas = useMemo(() => (areasQuery.data ?? []).filter(a => a.indicators > 0), [areasQuery.data]);
  const order = useMemo(() => readingOrder(areas.map(a => a.key)), [areas]);
  const [view, setView] = useState<View>('map');
  const [area, setArea] = useState('');
  const [indicator, setIndicator] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>('all');
  const asked = useRef<{area: string; indicator: string} | null>(null);

  useEffect(() => {
    const p = readParams();
    const v = p.get('view');
    if (v === 'table' || v === 'cards') setView(v);
    const ind = (p.get('indicator') ?? '').toUpperCase();
    asked.current = {area: (p.get('area') ?? '').toUpperCase() || ind.split('-')[0] || '', indicator: ind};
  }, []);

  // The area to open: the one asked for, else the area with most flags in the case, else the first on the map.
  useEffect(() => {
    if (area || !order.length || !asked.current) return;
    if (layer.investigationId && layer.loading) return;
    const wanted = asked.current.area;
    const busiest = [...layer.firesByArea.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    setArea(order.includes(wanted) ? wanted : busiest && order.includes(busiest) ? busiest : order[0]);
  }, [order, area, layer.loading, layer.firesByArea, layer.investigationId]);

  const rowsQuery = useQuery({...listIndicatorsOptions({query: {area, limit: 3000}}), enabled: Boolean(area), staleTime: Infinity});
  const rows = useMemo(() => rowsQuery.data?.indicators ?? [], [rowsQuery.data]);

  // The indicator to open in a newly chosen area: the one asked for, else the strongest flag here, else the first.
  useEffect(() => {
    if (!rows.length || rows[0].area !== area || rows.some(r => r.id === indicator)) return;
    const wanted = asked.current?.indicator;
    asked.current = asked.current ? {...asked.current, indicator: ''} : null;
    const fired = rows.filter(r => layer.flags.has(r.id)).sort((a, b) => {
      const rank = (id: string) => ({textbook: 3, strong: 2, faint: 1} as Record<string, number>)[strongest(layer.flags.get(id))?.level ?? ''] ?? 0;
      return rank(b.id) - rank(a.id);
    })[0];
    setIndicator(wanted && rows.some(r => r.id === wanted) ? wanted : fired?.id ?? rows[0].id);
  }, [rows, area, indicator, layer.flags]);

  useEffect(() => { if (area) writeParams({area, indicator: indicator || null, view: view === 'map' ? null : view}); }, [area, indicator, view]);

  const areaRow = areas.find(a => a.key === area);
  useEffect(() => {
    setTrailTail([{label: 'Learn', href: '/learn'}, {label: 'Red Flags catalogue', href: '/learn'},
      ...(areaRow ? [{label: shortAreaName(areaRow.name)}] : []), ...(indicator ? [{label: indicator}] : [])]);
    return () => setTrailTail([]);
  }, [areaRow, indicator]);

  const chooseArea = (key: string) => { if (key !== area) { setArea(key); setFilter('all'); setPreview(null); } };
  const openIndicator = (id: string) => { const key = id.split('-')[0]; if (key !== area) { chooseArea(key); asked.current = {area: key, indicator: id}; } setIndicator(id); setPreview(null); };
  const totalIndicators = areas.reduce((n, a) => n + a.indicators, 0);
  const problem = areasQuery.isError ? errorMessage(areasQuery.error, 'Could not load the catalogue') : '';
  const shownId = preview ?? indicator;

  return <>
    <header className="kc-top">
      <LearnTabs tab="catalogue" inv={layer.investigationId}/>
      <CatalogueSearch total={totalIndicators} onIndicator={openIndicator}/>
      <div className="kc-switch" role="group" aria-label="Show the catalogue as">
        {(['map', 'table', 'cards'] as const).map(v => <button type="button" key={v} aria-pressed={view === v} className={view === v ? 'on' : ''}
          onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
      </div>
      {/* Why Practise is off is on the button, on hover, as well as for screen readers (Ony, 29 Oct). */}
      <Reveal tabbable={false} describe={false} detail="Practise (spaced review of flip cards) is not built yet.">
        <button type="button" className="kc-practise" disabled aria-describedby="kc-practise-why">⟲ Practise</button></Reveal>
      <span id="kc-practise-why" className="sr-only">Practise (spaced review of flip cards) is not built yet.</span>
    </header>
    {problem && <p className="kc-error" role="alert">{problem}</p>}
    <div className={`kc-board view-${view}`}>
      {view === 'map' && <>
        <CatalogueMap areas={areas} map={mapQuery.data} layer={layer} selected={area} onSelect={chooseArea} onOpenIndicator={openIndicator} onShowTable={() => setView('table')}/>
        <IndicatorList area={areaRow} rows={rows} loading={rowsQuery.isPending && Boolean(area)} error={rowsQuery.isError ? errorMessage(rowsQuery.error, 'Could not load the indicators') : ''}
          layer={layer} filter={filter} onFilter={setFilter} selected={indicator} onSelect={id => { setIndicator(id); setPreview(null); }} onPreview={setPreview}/>
      </>}
      {view === 'table' && <CatalogueTable areas={areas} map={mapQuery.data} layer={layer} selected={area} onSelect={chooseArea} indicator={indicator} onOpenIndicator={openIndicator}/>}
      {view === 'cards' && <CatalogueCards area={areaRow} rows={rows} indicator={indicator} onOpenIndicator={openIndicator}/>}
      {/* Cards hide the indicator page: it would show the answer side of the card. */}
      {view !== 'cards' && <IndicatorPage id={shownId} row={rows.find(r => r.id === shownId)} layer={layer} preview={Boolean(preview && preview !== indicator)}/>}
    </div>
  </>;
}

/** One box over indicators and terms: indicators open here, terms open in the Glossary tab. "/" focuses it. */
function CatalogueSearch({total, onIndicator}: {total: number; onIndicator: (id: string) => void}): ReactElement {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = window.setTimeout(() => setQ(text.trim()), 200); return () => window.clearTimeout(t); }, [text]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === '/' && !(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const terms = useQuery({...searchGlossaryOptions({query: {q, limit: 5}}), enabled: q.length > 1});
  const inds = useQuery({...listIndicatorsOptions({query: {q, limit: 8}}), enabled: q.length > 1});
  const glossaryTotal = useQuery({...searchGlossaryOptions({query: {limit: 1}}), staleTime: Infinity}).data?.total;
  const pick = (id: string) => { onIndicator(id); setOpen(false); setText(''); };
  // ↓ / ↑ move from the box through the results (indicators, then terms) and back; Esc returns to the box.
  const resultsRef = useRef<HTMLDivElement>(null);
  const step = (by: number) => {
    const items = [...(resultsRef.current?.querySelectorAll<HTMLElement>('button, a') ?? [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = at + by;
    if (next < 0) ref.current?.focus(); else items[Math.min(items.length - 1, next)].focus();
  };
  const resultKeys = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Escape') { e.preventDefault(); ref.current?.focus(); }
  };
  return <div className="kc-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
    <input ref={ref} value={text} onChange={e => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      onKeyDown={e => {
        if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Enter' && inds.data?.indicators[0]) pick(inds.data.indicators[0].id);
        if (e.key === 'ArrowDown' && open && q.length > 1) { e.preventDefault(); step(1); }
      }}
      placeholder={`Search ${total ? total.toLocaleString('en-GB') : ''} indicators${glossaryTotal ? ` and ${glossaryTotal.toLocaleString('en-GB')} terms` : ' and terms'}`}
      role="combobox" aria-autocomplete="list" aria-label="Search indicators and terms" aria-expanded={open && q.length > 1} aria-controls="kc-search-results"/>
    <kbd aria-hidden="true">/</kbd>
    {open && q.length > 1 && <div className="kc-results" id="kc-search-results" ref={resultsRef} onKeyDown={resultKeys}>
      <p className="kc-eyebrow">Indicators</p>
      {inds.data?.indicators.length ? <ul>{inds.data.indicators.map(r => <li key={r.id}><button type="button" onClick={() => pick(r.id)}>
        <span className="kc-mono">{r.id}</span> {r.name}</button></li>)}</ul> : <p className="kc-quiet">{inds.isFetching ? 'Searching…' : 'No indicator matches.'}</p>}
      <p className="kc-eyebrow">Terms</p>
      {terms.data?.terms.length ? <ul>{terms.data.terms.map(t => <li key={t.term}><Link href={`/glossary?q=${encodeURIComponent(t.term)}`}>{t.term}</Link></li>)}</ul>
        : <p className="kc-quiet">{terms.isFetching ? 'Searching…' : 'No term matches.'}</p>}
    </div>}
  </div>;
}
