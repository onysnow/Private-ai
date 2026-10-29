'use client';
// The catalogue as a table (mockup KNOWLEDGE_KEEP_1's "Table"; research Knowledge §3: an ATT&CK-style matrix, one
// column per family, counts in brackets). It is also the map's list view (UX C7: every canvas has a list view):
// each family a small table of its areas with how many indicators each holds, how they are checked and how many
// fire in the open case. Opening an area lays its indicators out as cells under it; a cell opens in panel C.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement, ReactNode} from 'react';

import {listIndicatorsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {Reveal} from '../../components/ui/reveal';
import type {CatalogueAreaOut, CatalogueMapOut} from '../../lib/generated/types.gen';
import type {CaseLayer} from './case-layer';
import {strongest} from './case-layer';
import {FAMILIES, HOW_CHECKED} from './families';
import {FlagLevelChip, HowGlyph} from './indicator-list';

/** A column head that is a mark: the word for screen readers, and on hover or focus (Ony, 29 Oct). */
function MarkHead({mark, word}: {mark: ReactNode; word: string}): ReactElement {
  return <th scope="col"><Reveal describe={false} detail={word}><span aria-hidden="true">{mark}</span><span className="sr-only">{word}</span></Reveal></th>;
}

export function CatalogueTable({areas, map, layer, selected, onSelect, indicator, onOpenIndicator}: {
  areas: CatalogueAreaOut[]; map: CatalogueMapOut | undefined; layer: CaseLayer; selected: string; onSelect: (key: string) => void;
  indicator: string; onOpenIndicator: (id: string) => void;
}): ReactElement {
  const byKey = new Map(areas.map(a => [a.key, a]));
  const counts = new Map((map?.areas ?? []).map(a => [a.key, a]));
  const listed = new Set(FAMILIES.flatMap(f => f.areas));
  const families = [...FAMILIES, {key: 'other', name: 'Other', areas: areas.map(a => a.key).filter(k => !listed.has(k))}].filter(f => f.areas.some(k => byKey.has(k)));
  return <section className="kc-panel kc-table" aria-label="The catalogue as a table">
    <p className="kc-eyebrow">Catalogue table</p>
    <div className="kc-matrix">
      {families.map(f => <section key={f.key} className={`kc-fam-col${f.key === 'safety' ? ' safety' : ''}`} aria-label={f.name}>
        <h3>{f.name} <span className="kc-mono">[{f.areas.reduce((n, k) => n + (byKey.get(k)?.indicators ?? 0), 0)}]</span></h3>
        <table>
          <thead><tr><th scope="col">Area</th><MarkHead mark="n" word="Indicators"/>
            {(['records', 'lookups', 'person'] as const).map(k => <MarkHead key={k} mark={<HowGlyph how={k}/>} word={`Checked ${HOW_CHECKED[k].long}`}/>)}
            {layer.investigationId && <th scope="col">Fire</th>}</tr></thead>
          <tbody>{f.areas.filter(k => byKey.has(k)).map(k => {
            const a = byKey.get(k)!;
            const c = counts.get(k);
            return [
              <tr key={k} className={k === selected ? 'on' : ''}>
                <th scope="row"><button type="button" className="kc-link" aria-expanded={k === selected} onClick={() => onSelect(k)}>
                  <span className="kc-mono">{k}</span> {a.name}</button></th>
                <td>[{a.indicators}]</td><td>{c?.records ?? '–'}</td><td>{c?.lookups ?? '–'}</td><td>{c?.person ?? '–'}</td>
                {layer.investigationId && <td>{layer.firesByArea.get(k) ?? 0}</td>}
              </tr>,
              k === selected && <tr key={`${k}-cells`} className="kc-cells-row"><td colSpan={layer.investigationId ? 6 : 5}>
                <AreaCells area={k} layer={layer} indicator={indicator} onOpenIndicator={onOpenIndicator}/></td></tr>,
            ];
          })}</tbody>
        </table>
      </section>)}
    </div>
  </section>;
}

function AreaCells({area, layer, indicator, onOpenIndicator}: {area: string; layer: CaseLayer; indicator: string; onOpenIndicator: (id: string) => void}): ReactElement {
  const query = useQuery({...listIndicatorsOptions({query: {area, limit: 3000}}), staleTime: Infinity});
  if (query.isPending) return <p className="kc-quiet">Loading the indicators…</p>;
  if (query.isError) return <p className="kc-error">Could not load the indicators.</p>;
  return <ul className="kc-cells">{query.data.indicators.map(r => {
    const fired = strongest(layer.flags.get(r.id));
    return <li key={r.id}><button type="button" className={`kc-cell${r.id === indicator ? ' on' : ''}`} onClick={() => onOpenIndicator(r.id)}>
      <span className="kc-mono">{r.id}</span> <HowGlyph how={r.checkable}/><span className="sr-only">checked {HOW_CHECKED[r.checkable].long}</span> {r.name}{fired && <> <FlagLevelChip level={fired.level}/></>}
    </button></li>;
  })}</ul>;
}
