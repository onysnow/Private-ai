'use client';
// The connection grid (design rule 18: "Networks over ~20 nodes offer a grid
// view"): the same links as the network, as a matrix with a row and a column
// per party, the most-linked first (lib/network-layout.ts connectionGrid).
// A matrix never crosses its own lines; Ghoniem, Fekete and Castagliola
// (InfoVis 2004) found it read better than a node-link drawing for most
// tasks once a graph passes about twenty nodes. It is an HTML table rather
// than a drawing, so every name and number is text a screen reader reads
// and a reporter can select; a cell's shade and number say how many links
// join the two parties, and clicking it opens the first of them.
import type {ReactElement} from 'react';

import {connectionGrid} from '@/lib/network-layout';
import type {NetworkLink, NetworkNode} from '@/lib/network-layout';

type Props = {nodes: NetworkNode[]; links: NetworkLink[]; onLink?: (linkId: string) => void};

// One, two, three or more links: each shade keeps the count written on it at 4.5:1 or more (WCAG 1.4.3).
const SHADES = ['hsl(40, 56%, 16%)', 'hsl(40, 56%, 24%)', 'hsl(40, 56%, 32%)'];

export function ConnectionGrid({nodes, links, onLink}: Props): ReactElement {
  const grid = connectionGrid(nodes, links);
  const at = new Map(grid.cells.map(c => [`${c.row}:${c.column}`, c]));
  return <div style={{overflow: 'auto', maxHeight: 520}} data-testid="connection-grid">
    <table aria-label="Connection grid" className="text-xs" style={{borderCollapse: 'collapse'}}>
      <thead><tr>
        <th scope="col"><span className="sr-only">Party</span></th>
        {grid.parties.map(p => <th key={p.id} scope="col" title={p.label}
          style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 140, padding: '2px', fontWeight: 'normal'}}>{p.label}</th>)}
      </tr></thead>
      <tbody>{grid.parties.map((row, r) => <tr key={row.id}>
        <th scope="row" style={{textAlign: 'right', paddingRight: 6, whiteSpace: 'nowrap', fontWeight: 'normal'}}>{row.label}</th>
        {grid.parties.map((column, c) => {
          const cell = at.get(`${r}:${c}`);
          if (!cell) return <td key={column.id} style={{width: 22, height: 22, border: '1px solid hsl(202, 12%, 22%)'}}/>;
          const count = cell.links.length;
          const names = cell.links.map(l => l.label).filter(Boolean).join(', ');
          return <td key={column.id} style={{width: 22, height: 22, border: '1px solid hsl(202, 12%, 22%)', padding: 0,
            background: SHADES[Math.min(count, SHADES.length) - 1], textAlign: 'center'}}>
            <button type="button" onClick={() => onLink?.(cell.links[0].id)} title={`${row.label} and ${column.label}: ${names}`}
              aria-label={`${row.label} and ${column.label}: ${count} link${count === 1 ? '' : 's'}${names ? ` (${names})` : ''}`}
              style={{width: '100%', height: '100%', color: '#f3e9d7', background: 'transparent', border: 0, cursor: 'pointer'}}>{count}</button>
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
