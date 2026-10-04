'use client';
// The connection grid (design rule 18: "Networks over ~20 nodes offer a grid
// view"): the same links as the network, as a matrix with a row and a column
// per party, the most-linked first (lib/network-layout.ts connectionGrid).
// A matrix never crosses its own lines; Ghoniem, Fekete and Castagliola
// (InfoVis 2004) found it read better than a node-link drawing for most
// tasks once a graph passes about twenty nodes.
//
// Reading it: a link sits in the row of the party it runs from and the
// column of the party it runs to, as in a directed graph's adjacency
// matrix, so who owns, who paid and who directs stays readable; the corner
// says so. A cell's number is how many such links there are, and its shade
// says the same again (one, two, three or more), with a key under the grid.
// The diagonal -- a party and itself -- is hatched: no link can sit there.
// Pointing at (or tabbing to) a cell lights its row and column and both
// names: reading a cell means finding the two names it sits between, which
// in a wide grid are far from it.
//
// It is an HTML table rather than a drawing, so every name and number is
// text a screen reader reads and a reporter can select. Column names run
// upwards on one line each (no wrapping, so every column is one cell wide);
// the full name is also in the cell's label and title.
import {useState} from 'react';
import type {CSSProperties, ReactElement} from 'react';

import {connectionGrid} from '@/lib/network-layout';
import type {NetworkLink, NetworkNode} from '@/lib/network-layout';

type Props = {nodes: NetworkNode[]; links: NetworkLink[]; onLink?: (linkId: string) => void};

// One, two, three or more links, from the app's gold (hue 40, saturation
// 56%) at three lightnesses far enough apart to tell. The number written
// on each keeps 4.5:1 or more against it (WCAG 1.4.3): parchment on the
// darkest (5.8:1), the card's dark on the two lighter (4.7:1 and 7.4:1).
const SHADES: {background: string; text: string}[] = [
  {background: 'hsl(40, 56%, 28%)', text: '#f3e9d7'},
  {background: 'hsl(40, 56%, 44%)', text: '#1a2328'},
  {background: 'hsl(40, 56%, 60%)', text: '#1a2328'},
];
const CELL = 28;
const RULE = '1px solid hsl(202, 12%, 22%)';
const LIT = 'hsl(202, 14%, 18%)';
const HATCH = 'repeating-linear-gradient(135deg, hsl(202, 12%, 20%) 0 2px, transparent 2px 6px)';

export function shadeFor(count: number): {background: string; text: string} {
  return SHADES[Math.min(count, SHADES.length) - 1];
}

export function ConnectionGrid({nodes, links, onLink}: Props): ReactElement {
  const grid = connectionGrid(nodes, links);
  const at = new Map(grid.cells.map(c => [`${c.row}:${c.column}`, c]));
  const [lit, setLit] = useState<{row: number; column: number} | null>(null);
  const cellStyle = (r: number, c: number): CSSProperties => ({
    width: CELL, minWidth: CELL, height: CELL, padding: 0, border: RULE, textAlign: 'center',
    background: r === c ? HATCH : lit && (lit.row === r || lit.column === c) ? LIT : undefined,
  });
  const nameStyle = (on: boolean): CSSProperties => ({fontWeight: on ? 600 : 'normal', color: on ? '#f3e9d7' : undefined});
  return <div data-testid="connection-grid">
    <div style={{overflow: 'auto', maxHeight: 560}} onMouseLeave={() => setLit(null)}>
      <table aria-label="Connection grid" className="text-xs" style={{borderCollapse: 'collapse'}}>
        <thead><tr>
          <th scope="col" style={{verticalAlign: 'bottom', textAlign: 'right', padding: '0 8px 6px 0', fontWeight: 'normal'}} className="muted">
            <span aria-hidden>From ↓ · To →</span><span className="sr-only">Party a link runs from</span>
          </th>
          {grid.parties.map((p, c) => <th key={p.id} scope="col" title={p.label}
            style={{verticalAlign: 'bottom', padding: '0 0 6px', width: CELL, minWidth: CELL, ...nameStyle(lit?.column === c)}}>
            <span style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', display: 'inline-block', maxHeight: 180,
              overflow: 'hidden', textOverflow: 'ellipsis'}}>{p.label}</span>
          </th>)}
        </tr></thead>
        <tbody>{grid.parties.map((row, r) => <tr key={row.id}>
          <th scope="row" style={{textAlign: 'right', paddingRight: 8, whiteSpace: 'nowrap', ...nameStyle(lit?.row === r)}}>{row.label}</th>
          {grid.parties.map((column, c) => {
            const cell = at.get(`${r}:${c}`);
            if (!cell) return <td key={column.id} style={cellStyle(r, c)} onMouseEnter={() => setLit({row: r, column: c})}/>;
            const count = cell.links.length;
            const names = cell.links.map(l => l.label).filter(Boolean).join(', ');
            const shade = shadeFor(count);
            const label = `${row.label} to ${column.label}: ${count} link${count === 1 ? '' : 's'}${names ? ` (${names})` : ''}`;
            return <td key={column.id} style={{...cellStyle(r, c), background: shade.background}} onMouseEnter={() => setLit({row: r, column: c})}>
              <button type="button" onClick={() => onLink?.(cell.links[0].id)} onFocus={() => setLit({row: r, column: c})} title={label} aria-label={label}
                style={{width: '100%', height: '100%', color: shade.text, background: 'transparent', border: 0, cursor: 'pointer', fontWeight: 600}}>{count}</button>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="muted text-xs" style={{display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 8}}>
      <span>Links from the row&apos;s party to the column&apos;s:</span>
      {SHADES.map((shade, i) => <span key={i} style={{display: 'inline-flex', gap: 6, alignItems: 'center'}}>
        <span aria-hidden style={{width: 14, height: 14, background: shade.background, display: 'inline-block', border: RULE}}/>
        {i === SHADES.length - 1 ? `${i + 1} or more` : `${i + 1}`}
      </span>)}
    </p>
  </div>;
}
