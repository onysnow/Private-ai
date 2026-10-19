'use client';
// Panel B of the catalogue explorer (mockup KNOWLEDGE_KEEP_1, research Knowledge §3): the chosen area's indicators,
// each with its id, name and how it can be checked (◫ records, ⇄ lookups, ◉ a person: a shape, and the word in the
// key and to screen readers); a fired indicator shows its level inline. Filter chips carry their counts. Pointing
// at a row for a moment previews it in panel C without changing the choice; J / K move the choice. The list scrolls.
import {useEffect, useRef} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import type {CatalogueAreaOut, CatalogueIndicatorRowOut} from '../../lib/generated/types.gen';
import {LevelMark} from '../act/red-flags-board';
import type {CaseLayer} from './case-layer';
import {strongest} from './case-layer';
import {HOW_CHECKED, shortAreaName} from './families';

export type ListFilter = 'all' | 'fires' | 'records' | 'lookups' | 'person';
const PREVIEW_MS = 300;

export function filterRows(rows: CatalogueIndicatorRowOut[], filter: ListFilter, layer: Pick<CaseLayer, 'flags'>): CatalogueIndicatorRowOut[] {
  if (filter === 'all') return rows;
  if (filter === 'fires') return rows.filter(r => layer.flags.has(r.id));
  return rows.filter(r => r.checkable === filter);
}

const EMPTY: Record<ListFilter, string> = {
  all: 'holds no indicator yet', fires: 'fires in this case', records: 'is checked from your records',
  lookups: 'is checked after outside lookups', person: 'is checked only by a person',
};

export function IndicatorList({area, rows, loading, error, layer, filter, onFilter, selected, onSelect, onPreview}: {
  area: CatalogueAreaOut | undefined; rows: CatalogueIndicatorRowOut[]; loading: boolean; error: string; layer: CaseLayer;
  filter: ListFilter; onFilter: (f: ListFilter) => void; selected: string; onSelect: (id: string) => void; onPreview: (id: string | null) => void;
}): ReactElement {
  const timer = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const shown = filterRows(rows, filter, layer);
  const count = (f: ListFilter) => filterRows(rows, f, layer).length;
  const chips: {key: ListFilter; label: string}[] = [
    {key: 'all', label: `All ${rows.length}`},
    ...(layer.investigationId ? [{key: 'fires' as const, label: `Fire here ${count('fires')}`}] : []),
    ...(['records', 'lookups', 'person'] as const).map(k => ({key: k, label: `${HOW_CHECKED[k].glyph} ${HOW_CHECKED[k].word} ${count(k)}`})),
  ];

  const clearTimer = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);
  // The chosen row stays in view when J / K or the map change it.
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block: 'nearest'}); }, [selected]);

  const move = (by: number) => {
    const at = shown.findIndex(r => r.id === selected);
    const next = shown[Math.max(0, Math.min(shown.length - 1, at + by))];
    if (next) onSelect(next.id);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  };

  return <section className="kc-panel kc-list-panel" aria-label="Indicators of the area">
    <p className="kc-eyebrow kc-clip" title={area?.name}>{area ? `${area.key} · ${shortAreaName(area.name)}` : 'Choose an area'}</p>
    <h2 className="kc-title kc-title-s">{rows.length} indicators</h2>
    <div className="kc-chips" role="group" aria-label="Show">
      {chips.map(c => <button type="button" key={c.key} className={`kc-chip${filter === c.key ? ' on' : ''}`} aria-pressed={filter === c.key}
        onClick={() => onFilter(c.key)}>{c.label}</button>)}
    </div>
    {error && <p className="kc-error" role="alert">{error}</p>}
    <ul className="kc-list" ref={listRef} role="listbox" aria-label={area ? `Indicators in ${area.name}` : 'Indicators'} onKeyDown={onKey}
      onPointerLeave={() => { clearTimer(); onPreview(null); }}>
      {loading && rows.length === 0 && Array.from({length: 6}, (_, i) => <li key={i} className="kc-skeleton" aria-hidden="true"/>)}
      {!loading && shown.length === 0 && area && <li className="kc-empty">No indicator in {area.name} {EMPTY[filter]}.
        {filter !== 'all' && <button type="button" className="kc-link" onClick={() => onFilter('all')}>Clear</button>}</li>}
      {shown.map((r, i) => {
        const fired = strongest(layer.flags.get(r.id));
        const how = HOW_CHECKED[r.checkable];
        return <li key={r.id} role="option" id={`kc-ind-${r.id}`} aria-selected={r.id === selected} tabIndex={r.id === selected || (!selected && i === 0) ? 0 : -1}
          className={`kc-row${r.id === selected ? ' on' : ''}`} style={{['--i' as string]: Math.min(i, 8)}}
          onClick={() => { clearTimer(); onSelect(r.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }}
          onPointerEnter={() => { clearTimer(); timer.current = window.setTimeout(() => onPreview(r.id), PREVIEW_MS); }}>
          <span className="kc-mono kc-row-id">{r.id}</span>
          <span className="kc-row-name">{r.name}{fired && <> <LevelMark level={fired.level}/></>}
            {r.status === 'pending' && <span className="kc-pending"> ○ pending</span>}</span>
          <span className="kc-how" title={`Checked ${how.long}`}><span aria-hidden="true">{how.glyph}</span><span className="sr-only">checked {how.long}</span></span>
        </li>;
      })}
    </ul>
    <p className="kc-foot">◫ from your records · ⇄ after outside lookups · ◉ only a person · J / K to move</p>
  </section>;
}
