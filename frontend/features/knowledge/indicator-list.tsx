'use client';
// Panel B of the catalogue explorer (mockup KNOWLEDGE_KEEP_1, research Knowledge §3): the chosen area's indicators,
// each with its id, name and how it can be checked (◫ records, ⇄ lookups, ◉ a person: a shape, and the word in the
// key and to screen readers); a fired indicator shows its level inline. Filter chips carry their counts. Pointing
// at a row for a moment previews it in panel C without changing the choice; J / K move the choice. The list scrolls.
import {UserRound} from 'lucide-react';
import {useEffect, useRef} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {LevelChip} from '../../components/status';
import type {FlagLevel} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import type {CatalogueAreaOut, CatalogueIndicatorRowOut} from '../../lib/generated/types.gen';
import type {CaseLayer} from './case-layer';
import {strongest} from './case-layer';
import {HOW_CHECKED, shortAreaName} from './families';

type How = keyof typeof HOW_CHECKED;

/** How an indicator is checked, as its shape alone (◫ records, ⇄ lookups, a person); the word is named beside it by the
 *  caller, in a reveal and for screen readers (Ony, 29 Oct). */
export function HowGlyph({how}: {how: How}): ReactElement {
  return <span className={`kc-how-glyph kc-how-${how}`} aria-hidden="true">{how === 'person' ? <UserRound size={12} strokeWidth={2.2}/> : HOW_CHECKED[how].glyph}</span>;
}

/** The shape with its word in a reveal (and spoken with it). */
export function HowMark({how, tabbable = true}: {how: How; tabbable?: boolean}): ReactElement {
  const long = HOW_CHECKED[how].long;
  return <Reveal tabbable={tabbable} label={`Checked ${long}`} detail={<>Checked <b>{long}</b></>}><HowGlyph how={how}/></Reveal>;
}

/** A Red Flag's level as the shared status grammar draws it (components/status.tsx). */
export function FlagLevelChip({level, showWord = false}: {level: string; showWord?: boolean}): ReactElement {
  return level === 'faint' || level === 'strong' || level === 'textbook' ? <LevelChip level={level as FlagLevel} showWord={showWord}/> : <span>{level}</span>;
}

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
  ];

  const clearTimer = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);
  // The chosen row stays in view when J / K or the map change it.
  // While the list has the keyboard, focus follows the choice, so the ring and a screen reader move with J / K.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    row?.scrollIntoView?.({block: 'nearest'});
    if (row && listRef.current?.contains(document.activeElement) && document.activeElement !== row) row.focus({preventScroll: true});
  }, [selected]);

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
    {/* The area's name is the list's title; its code and full name are on hover or focus (Ony, 29 Oct). */}
    <h2 className="kc-title kc-title-s kc-clip">{area ? <Reveal detail={<><b>{area.name}</b><span className="rv-row rv-mono">{area.key}</span></>}>{shortAreaName(area.name)}</Reveal> : 'Choose an area'}
      {' '}<span className="kc-count">{rows.length} indicators</span></h2>
    <div className="kc-chips" role="group" aria-label="Show">
      {chips.map(c => <button type="button" key={c.key} className={`kc-chip${filter === c.key ? ' on' : ''}`} aria-pressed={filter === c.key}
        onClick={() => onFilter(c.key)}>{c.label}</button>)}
      {/* How it is checked: the shape and the count; the word on hover or focus, and in the button's name. */}
      {(['records', 'lookups', 'person'] as const).map(k => <Reveal key={k} tabbable={false} describe={false} detail={<>Checked <b>{HOW_CHECKED[k].long}</b></>}>
        <button type="button" className={`kc-chip${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => onFilter(k)}>
          <HowGlyph how={k}/><span className="sr-only">{HOW_CHECKED[k].word}</span>{' '}{count(k)}</button></Reveal>)}
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
          {/* The id, "pending" and how it is checked are on hover, and in the option for screen readers (Ony, 29 Oct). */}
          <span className="sr-only">{r.id} </span>
          <span className="kc-row-name"><Reveal tabbable={false} describe={false} detail={<span className="rv-mono">{r.id}</span>}><span>{r.name}</span></Reveal>
            {fired && <> <FlagLevelChip level={fired.level}/></>}
            {r.status === 'pending' && <Reveal tabbable={false} describe={false} detail="Pending checks: not used for Red Flags yet.">
              <span className="kc-pending"> <span aria-hidden="true">○</span><span className="sr-only"> pending</span></span></Reveal>}</span>
          <Reveal tabbable={false} describe={false} detail={<>Checked <b>{how.long}</b></>}>
            <span className="kc-how"><HowGlyph how={r.checkable}/><span className="sr-only">checked {how.long}</span></span></Reveal>
        </li>;
      })}
    </ul>
  </section>;
}
