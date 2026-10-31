'use client';
// Panel A of the catalogue explorer (mockup KNOWLEDGE_KEEP_1, research Knowledge §3): the 42 areas as circles sized
// by their indicators, in six families; Your safety set apart, dashed. An area that fires in the open case carries a
// dashed ring and says so in words in its hover card. Choosing an area draws its "may also point to" lines with the
// count on each and dims the rest. The wheel over the map steps through the areas in reading order; so do the arrow
// keys (the map is a listbox). Under the map, the area card: what the area covers, how its indicators can be
// checked, and this case's flags in it.
import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import type {CatalogueAreaOut, CatalogueMapOut} from '../../lib/generated/types.gen';
import type {CaseLayer} from './case-layer';
import {strongest} from './case-layer';
import {HOW_CHECKED, readingOrder} from './families';
import {FlagLevelChip, HowGlyph} from './indicator-list';
import {MAP_H, MAP_W, layoutMap} from './map-layout';

const WHEEL_STEP_MS = 140;

export function CatalogueMap({loading = false, areas, map, layer, selected, onSelect, onOpenIndicator, onShowTable}: {
  loading?: boolean; areas: CatalogueAreaOut[]; map: CatalogueMapOut | undefined; layer: CaseLayer; selected: string;
  onSelect: (key: string) => void; onOpenIndicator: (id: string) => void; onShowTable: () => void;
}): ReactElement {
  const counts = useMemo(() => Object.fromEntries(areas.map(a => [a.key, a.indicators])), [areas]);
  const {bubbles, labels} = useMemo(() => layoutMap(counts), [counts]);
  const byKey = useMemo(() => new Map(areas.map(a => [a.key, a])), [areas]);
  const order = useMemo(() => readingOrder(areas.map(a => a.key)), [areas]);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverAt, setHoverAt] = useState<{left: number; top: number; right: boolean; w: number}>({left: 0, top: 0, right: false, w: 0});
  const boxRef = useRef<HTMLDivElement>(null);
  const last = useRef(0);

  const lines = useMemo(() => (map?.cross_hints ?? []).filter(h => h.source === selected), [map, selected]);
  const linked = new Set(lines.map(l => l.target));
  const pointsHere = (target: string) => (map?.cross_hints ?? []).find(h => h.source === selected && h.target === target)?.count ?? 0;
  const step = (by: number) => {
    const at = order.indexOf(selected);
    const next = order[(at + by + order.length) % order.length];
    if (next) onSelect(next);
  };

  // The wheel over the map steps through the areas (VIZ B: "grids and matrices: the wheel moves the lit row"). A
  // non-passive listener, so the page under it does not scroll at the same time.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - last.current < WHEEL_STEP_MS || Math.abs(e.deltaY) < 1) return;
      last.current = now;
      step(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); onSelect(order[0]); }
    else if (e.key === 'End') { e.preventDefault(); onSelect(order[order.length - 1]); }
    else if (e.key === 'Enter') { e.preventDefault(); document.querySelector<HTMLElement>('.kc-list [aria-selected="true"], .kc-list [role="option"]')?.focus(); }
  };

  const total = areas.reduce((n, a) => n + a.indicators, 0);
  const at = bubbles.find(b => b.key === selected);
  const hovered = hover ? bubbles.find(b => b.key === hover) : undefined;
  const hoveredArea = hover ? byKey.get(hover) : undefined;
  const optionLabel = (key: string) => {
    const a = byKey.get(key);
    const fires = layer.firesByArea.get(key) ?? 0;
    return `${a?.name ?? key}, ${a?.indicators ?? 0} indicators${layer.investigationId ? `, ${fires} fire in this case` : ''}`;
  };

  return <section className="kc-panel kc-map" aria-label="Catalogue map">
    <p className="kc-eyebrow">Catalogue map</p>
    {/* How to use the map is on its title, on hover or focus (Ony, 29 Oct). */}
    {loading && !areas.length ? <><h2 className="kc-title">Reading the catalogue…</h2><div className="kc-skeleton tall" aria-hidden="true"/></> : <>
    <h2 className="kc-title"><Reveal detail="Scroll over the map to step through the areas, or use the arrow keys; click to open one. Lines show “may also point to”.">
      {areas.length} areas · {total.toLocaleString('en-GB')} indicators</Reveal></h2>
    <ul className="kc-legend" aria-label="Key">
      <li><i className="kc-key-size" aria-hidden="true"/>size = indicators</li>
      <li><i className="kc-key-fires" aria-hidden="true"/>fires in this case</li>
      <li><i className="kc-key-line" aria-hidden="true"/>may also point to (n)</li>
      <li><i className="kc-key-safety" aria-hidden="true"/>your safety (shown apart)</li>
    </ul>
    <div className="kc-map-box" ref={boxRef} role="listbox" tabIndex={0} aria-label="Areas, in families"
      aria-activedescendant={selected ? `kc-area-${selected}` : undefined} onKeyDown={onKey}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="kc-svg" preserveAspectRatio="xMidYMin meet" focusable="false">
        {labels.map(l => <text key={l.family} x={l.x} y={l.y} className={`kc-fam${l.safety ? ' safety' : ''}`} textAnchor="middle" aria-hidden="true">{l.name.toUpperCase()}</text>)}
        {bubbles.map(b => {
          const fires = layer.firesByArea.get(b.key) ?? 0;
          const safety = b.family === 'safety';
          const on = b.key === selected;
          const dim = Boolean(selected) && !on && !linked.has(b.key);
          return <g key={b.key} id={`kc-area-${b.key}`} role="option" aria-selected={on} aria-label={optionLabel(b.key)}
            className={`kc-area${on ? ' on' : ''}${dim ? ' dim' : ''}${safety ? ' safety' : ''}`}
            onClick={() => onSelect(b.key)} onPointerEnter={e => {
              const box = boxRef.current?.getBoundingClientRect();
              const dot = (e.currentTarget as SVGGElement).getBoundingClientRect();
              if (box) setHoverAt({left: dot.right - box.left + 6, top: dot.top - box.top, right: dot.left - box.left > box.width * 0.6, w: dot.width});
              setHover(b.key);
            }} onPointerLeave={() => setHover(h => (h === b.key ? null : h))}>
            {fires > 0 && <circle cx={b.x} cy={b.y} r={b.r + 4.5} className="kc-fires"/>}
            <circle cx={b.x} cy={b.y} r={b.r} className="kc-dot"/>
            <text x={b.x} y={b.y - (b.r > 15 ? 2 : -3)} textAnchor="middle" className="kc-key">{b.key}</text>
            {b.r > 15 && <text x={b.x} y={b.y + 10} textAnchor="middle" className="kc-n">{b.count}</text>}
          </g>;
        })}
        {/* The lines go over the circles and run edge to edge: neighbours in a family touch, so lines drawn under the
            circles were hidden by them. */}
        <g className="kc-lines" key={selected} aria-hidden="true">
          {at && lines.map(l => {
            const to = bubbles.find(b => b.key === l.target);
            if (!to) return null;
            const d = Math.hypot(to.x - at.x, to.y - at.y) || 1;
            const ux = (to.x - at.x) / d, uy = (to.y - at.y) / d;
            const a = {x: at.x + ux * (at.r + 2), y: at.y + uy * (at.r + 2)};
            const z = {x: to.x - ux * (to.r + 2), y: to.y - uy * (to.r + 2)};
            const mx = (a.x + z.x) / 2;
            const my = (a.y + z.y) / 2 - Math.min(40, Math.hypot(z.x - a.x, z.y - a.y) / 5);
            return <g key={l.target}>
              <path d={`M${a.x},${a.y} Q${mx},${my} ${z.x},${z.y}`} pathLength={1} className="kc-line" style={{strokeWidth: Math.min(4, 1 + l.count / 4)}}/>
              {/* A line too short to carry its count leaves it to the hover card ("BO points here 7 times"). */}
              {Math.hypot(z.x - a.x, z.y - a.y) >= 36 && <text x={(a.x + 2 * mx + z.x) / 4} y={(a.y + 2 * my + z.y) / 4 - 3} className="kc-line-n" textAnchor="middle">{l.count}</text>}
            </g>;
          })}
        </g>
      </svg>
      {hovered && hoveredArea && <div className="kc-hover" role="presentation"
        style={{left: hoverAt.left, top: hoverAt.top, transform: hoverAt.right ? `translateX(calc(-100% - ${hoverAt.w + 12}px))` : undefined}}>
        <b>{hoveredArea.key} · {hoveredArea.name}</b>
        <span>{hoveredArea.indicators} indicators{layer.investigationId ? ` · ${layer.firesByArea.get(hoveredArea.key) ?? 0} fire${(layer.firesByArea.get(hoveredArea.key) ?? 0) === 1 ? 's' : ''} here` : ''}</span>
        {selected && hover !== selected && pointsHere(hover!) > 0 && <em>{selected} points here {pointsHere(hover!)} {pointsHere(hover!) === 1 ? 'time' : 'times'}</em>}
      </div>}
    </div>
    <button type="button" className="kc-link kc-aslist" onClick={onShowTable}>Show as list</button>
    <AreaCard area={byKey.get(selected)} counts={map?.areas.find(a => a.key === selected)} layer={layer} onOpenIndicator={onOpenIndicator}/>
    </>}
  </section>;
}

function AreaCard({area, counts, layer, onOpenIndicator}: {
  area: CatalogueAreaOut | undefined; counts: CatalogueMapOut['areas'][number] | undefined; layer: CaseLayer; onOpenIndicator: (id: string) => void;
}): ReactElement | null {
  if (!area) return null;
  const here = [...layer.flags.entries()].filter(([id]) => id.startsWith(`${area.key}-`)).map(([id, fl]) => ({id, flag: strongest(fl)!}));
  // The area's summary is on its name; how its indicators are checked shows as shapes and counts (Ony, 29 Oct).
  return <article className="kc-area-card" aria-label={`${area.name}, the area`}>
    <header><h3><Reveal detail={area.summary}>{area.name}</Reveal></h3><span className="kc-mono">{area.key} · {area.indicators}</span></header>
    {counts && <ul className="kc-how-counts" aria-label="How its indicators are checked">
      {(['records', 'lookups', 'person'] as const).map(k => <li key={k}>
        <Reveal label={`${counts[k]} checked ${HOW_CHECKED[k].long}`} detail={<>{counts[k]} checked <b>{HOW_CHECKED[k].long}</b></>}>
          <span className="kc-how-count"><HowGlyph how={k}/><b>{counts[k]}</b></span></Reveal></li>)}
    </ul>}
    {layer.error ? <p className="kc-error">Could not read this case’s Red Flags, so its flags are not shown here.</p> : layer.investigationId ? (here.length > 0
      ? <div className="kc-incase"><span className="kc-eyebrow">In this case</span>
        {here.map(h => <button type="button" key={h.id} className="kc-flag" onClick={() => onOpenIndicator(h.id)}><FlagLevelChip level={h.flag.level}/> <span className="kc-mono">{h.id}</span></button>)}</div>
      // A flag is never a finding, and no flag is not a clean bill: this stays on screen, shorter (floor 2 and 11).
      : <p className="kc-quiet">None fires in this case; that is not the same as nothing wrong.{counts ? <> <Reveal detail={`${counts.rules} of ${area.indicators} indicators here have a rule that runs on records; the rest need lookups or a person.`}>
        <b>{counts.rules} of {area.indicators}</b> run on records.</Reveal></> : null}</p>)
      : <p className="kc-quiet">Open a case to see its flags in this area.</p>}
  </article>;
}
