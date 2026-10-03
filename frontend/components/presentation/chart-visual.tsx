'use client';
// A chart the AI ordered and the server cooked and checked
// (backend/app/visuals; docs/visuals/README.md). The drawing is the exact
// ECharts option the checker passed, built for a fixed design size, so the
// preview draws it at that size and scales the whole picture to fit: the
// layout the reporter approves is the layout that was checked. zrender maps
// pointer positions through CSS transforms, so tooltips still land on the
// right bar.
//
// Loaded with next/dynamic by its callers: ECharts stays out of the page's
// first load.
import {useEffect, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import type {EChartsOption} from 'echarts';

import {Chart} from '../charts/chart';
import type {ChartVisual} from '../../lib/api-types';

const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 540;

/** Width and height the option was built for (the backend's defaults when absent). */
export function designSize(visual: ChartVisual): {width: number, height: number} {
  return {width: visual.width || DESIGN_WIDTH, height: visual.height || DESIGN_HEIGHT};
}

/** How far to shrink a design to fit a box without cropping either side. */
export function fitScale(design: {width: number, height: number}, box: {width: number, height?: number}): number {
  if (!box.width) return 1;
  const byWidth = box.width / design.width;
  const byHeight = box.height ? box.height / design.height : byWidth;
  return Math.min(1, byWidth, byHeight);
}

/** Draws the checked option at its design size, scaled to the space it is given. */
export function ScaledChart({visual, fill = false}: {visual: ChartVisual, fill?: boolean}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<{width: number, height: number}>({width: 0, height: 0});
  const design = designSize(visual);

  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setSpace({width: rect.width, height: rect.height});
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = fitScale(design, fill ? space : {width: space.width});
  return <div ref={box} className="relative w-full" style={fill ? {height: '100%'} : {height: design.height * scale || undefined}}>
    <div style={{width: design.width, height: design.height, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
      {/* The option carries the deck theme's colours and fonts, which the
          checker judged for contrast; the app's dark chart theme must not
          repaint it. */}
      <Chart option={visual.option as EChartsOption} height={design.height} ariaLabel={visual.text.alt_text} theme={null}/>
    </div>
  </div>;
}

type TableRow = ChartVisual['text']['data_table']['rows'][number];

/** A data-table row's cells in the order the backend lists its columns
 * (backend/app/visuals/echarts.py): the label, a flow's payer and recipient
 * when the chart shows flows, a scatter plot's second number when the chart
 * has one, the value (a timeline's: when the event happened), a part's
 * share when the chart shows parts of a whole, an event's verification
 * status on a timeline, and the number of records behind the value. */
export function tableCells(rows: TableRow[], row: TableRow): {key: string, text: string, numeric: boolean}[] {
  const cells = [];
  if (rows.some(r => r.source !== undefined)) {
    cells.push({key: 'source', text: row.source ?? '', numeric: false}, {key: 'target', text: row.target ?? '', numeric: false});
  }
  if (rows.some(r => r.x_formatted !== undefined)) cells.push({key: 'x', text: row.x_formatted ?? '', numeric: true});
  const events = rows.some(r => r.status !== undefined);
  cells.push({key: 'value', text: row.formatted, numeric: !events});
  if (rows.some(r => r.share !== undefined)) cells.push({key: 'share', text: row.share === undefined ? '' : `${row.share.toFixed(1)}%`, numeric: true});
  if (events) cells.push({key: 'status', text: row.status ?? '', numeric: false});
  cells.push({key: 'records', text: String(row.record_count), numeric: true});
  return cells;
}

/** The chart with the words rule 13 asks for: its description, its source
 * line, and a data table where each value names how many records hold it up
 * (rule 16) and flags values that rest on a single record (rule 20). */
export function ChartFigure({visual, renderCitations}: {visual: ChartVisual, renderCitations?: (refs: ChartVisual['data']['rows'][number]['record_refs']) => ReactElement | null}): ReactElement {
  const table = visual.text.data_table;
  return <figure className="my-4" data-testid="chart-visual">
    <ScaledChart visual={visual}/>
    <figcaption className="mt-2 text-xs" style={{color: '#7A6950'}}>{visual.text.source_line}</figcaption>
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer select-none">Description and data table</summary>
      <p className="my-2">{visual.text.description}</p>
      <table className="w-full border-collapse text-left">
        <thead><tr>
          {table.columns.map(column => <th key={column} className="border-b py-1 pr-3 font-semibold">{column}</th>)}
          {renderCitations ? <th className="border-b py-1 font-semibold">Sources</th> : null}
        </tr></thead>
        <tbody>{table.rows.map(row => <tr key={row.label}>
          {/* A timeline's event is one record by what it is (rules 16 and 20 do not apply), so it carries no mark. */}
          <td className="border-b py-1 pr-3">{row.label}{row.record_count === 1 && row.status === undefined ? <span title="Rests on a single record"> †</span> : null}</td>
          {tableCells(table.rows, row).map(cell => <td key={cell.key} className="border-b py-1 pr-3 tabular-nums">{cell.text}</td>)}
          {renderCitations ? <td className="border-b py-1">{renderCitations(row.record_refs)}</td> : null}
        </tr>)}</tbody>
      </table>
    </details>
  </figure>;
}
