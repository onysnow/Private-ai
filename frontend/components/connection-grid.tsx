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
// says so. A cell carries the network's own codes (lib/viz-tokens.ts):
// its colour is the kind of link (several kinds share the cell in stripes),
// a dashed inner edge marks a link not yet supported, a red "!" a contested
// one, and a number how many links when there is more than one (in the
// palette's near-black, 4.5:1 or more on every link colour). Each row's
// name has its party's colour dot. The diagonal -- a party and itself -- is
// hatched: no link can sit there. The key is the frame's
// (features/relationship-graph/graph.tsx).
//
// Pointing at (or tabbing to) a cell lights its row and column and both
// names: reading a cell means finding the two names it sits between, which
// in a wide grid are far from it. It is an HTML table rather than a drawing,
// so every name and number is text a screen reader reads and a reporter can
// select. Column names run upwards on one line each.
import {useState} from 'react';
import type {CSSProperties, ReactElement} from 'react';

import {connectionGrid} from '@/lib/network-layout';
import {LINK, LINK_ORDER, PARTY, SWATCH} from '@/lib/viz-tokens';
import type {Certainty, LinkFamily, PartyKind} from '@/lib/viz-tokens';

type GridParty = {id: string; label: string; kind?: PartyKind};
type GridLink = {id: string; from: string; to: string; label?: string; family?: LinkFamily; certainty?: Certainty};
type Props = {nodes: GridParty[]; links: GridLink[]; onLink?: (linkId: string) => void};

const CELL = 30;
const RULE = '1px solid #2e3a40';
const LIT = '#25323a';
const HATCH = 'repeating-linear-gradient(135deg, #2e3a40 0 2px, transparent 2px 6px)';

/** A cell's ground: one family's colour, or the families in equal stripes, in the key's order. */
export function cellBackground(families: LinkFamily[]): string {
  const ordered = LINK_ORDER.filter(f => families.includes(f));
  if (ordered.length <= 1) return LINK[ordered[0] ?? 'other'].colour;
  const step = 100 / ordered.length;
  return `linear-gradient(90deg, ${ordered.map((f, i) => `${LINK[f].colour} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
}

export function ConnectionGrid({nodes, links, onLink}: Props): ReactElement {
  const grid = connectionGrid(nodes, links);
  const at = new Map(grid.cells.map(c => [`${c.row}:${c.column}`, c]));
  const kindOf = new Map(nodes.map(n => [n.id, n.kind]));
  const [lit, setLit] = useState<{row: number; column: number} | null>(null);
  const cellStyle = (r: number, c: number): CSSProperties => ({
    width: CELL, minWidth: CELL, height: CELL, padding: 0, border: RULE, textAlign: 'center', position: 'relative',
    background: r === c ? HATCH : lit && (lit.row === r || lit.column === c) ? LIT : undefined,
  });
  const nameStyle = (on: boolean): CSSProperties => ({fontWeight: on ? 600 : 'normal', color: on ? SWATCH.ink : SWATCH.parchment});
  const dot = (id: string) => { const kind = kindOf.get(id); return kind
    ? <span aria-hidden style={{display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: PARTY[kind].ring, marginRight: 8, verticalAlign: 1}}/> : null; };
  return <div data-testid="connection-grid" style={{overflow: 'auto', maxHeight: 600}} onMouseLeave={() => setLit(null)}>
    <table aria-label="Connection grid" className="text-xs" style={{borderCollapse: 'collapse'}}>
      <thead><tr>
        <th scope="col" style={{verticalAlign: 'bottom', textAlign: 'right', padding: '0 10px 8px 0', fontWeight: 'normal', color: SWATCH.tan, whiteSpace: 'nowrap'}}>
          <span aria-hidden>From ↓ · To →</span><span className="sr-only">Party a link runs from</span>
        </th>
        {grid.parties.map((p, c) => <th key={p.id} scope="col" title={p.label}
          style={{verticalAlign: 'bottom', padding: '0 0 8px', width: CELL, minWidth: CELL, ...nameStyle(lit?.column === c)}}>
          <span style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', display: 'inline-block', maxHeight: 190,
            overflow: 'hidden', textOverflow: 'ellipsis'}}>{p.label}</span>
        </th>)}
      </tr></thead>
      <tbody>{grid.parties.map((row, r) => <tr key={row.id}>
        <th scope="row" style={{textAlign: 'right', paddingRight: 10, whiteSpace: 'nowrap', ...nameStyle(lit?.row === r)}}>{dot(row.id)}{row.label}</th>
        {grid.parties.map((column, c) => {
          const cell = at.get(`${r}:${c}`);
          if (!cell) return <td key={column.id} style={cellStyle(r, c)} onMouseEnter={() => setLit({row: r, column: c})}/>;
          const cellLinks = cell.links as GridLink[];
          const count = cellLinks.length;
          const names = cellLinks.map(l => l.label).filter(Boolean).join(', ');
          const contested = cellLinks.some(l => l.certainty === 'contested');
          const unsure = cellLinks.some(l => l.certainty && l.certainty !== 'supported');
          const label = `${row.label} to ${column.label}: ${count} link${count === 1 ? '' : 's'}${names ? ` (${names})` : ''}`
            + (contested ? ', contested' : unsure ? ', not yet supported' : '');
          return <td key={column.id} style={{...cellStyle(r, c), background: cellBackground(cellLinks.map(l => l.family ?? 'other'))}}
            onMouseEnter={() => setLit({row: r, column: c})}>
            <button type="button" onClick={() => onLink?.(cellLinks[0].id)} onFocus={() => setLit({row: r, column: c})} title={label} aria-label={label}
              style={{width: '100%', height: '100%', color: SWATCH.night, background: 'transparent', border: 0, cursor: 'pointer', fontWeight: 700,
                outline: unsure ? `1.5px dashed ${SWATCH.night}` : undefined, outlineOffset: unsure ? -6 : undefined}}>{count > 1 ? count : ''}</button>
            {contested && <span aria-hidden style={{position: 'absolute', right: -5, top: -5, width: 14, height: 14, borderRadius: '50%', background: SWATCH.brick,
              color: SWATCH.ink, fontSize: 9, fontWeight: 700, lineHeight: '14px', textAlign: 'center', border: `1px solid ${SWATCH.card}`, zIndex: 1}}>!</span>}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
