// @vitest-environment jsdom
// The network and the connection grid (features/relationship-graph/graph.tsx;
// design rule 18: "Networks over ~20 nodes offer a grid view; crossings
// counted"). The Sigma drawing is replaced by a stub that reports a layout,
// as Sigma needs WebGL.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useEffect} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ConnectionGrid, shadeFor} from '../components/connection-grid';
import {Graph, crossingsLine} from '../features/relationship-graph/graph';
import type {GraphEdge} from '../features/relationship-graph/graph';
import type {EntityOut} from '../lib/generated/types.gen';
import {entityFixture, relationshipFixture} from '../test-support/page-routes';

vi.mock('next/dynamic', () => ({
  default: () => function Stub({nodes, onLayout}: {nodes: unknown[]; onLayout?: (d: {positions: object; crossings: number}) => void}) {
    useEffect(() => { onLayout?.({positions: {}, crossings: 3}); }, [onLayout]);
    return <div data-testid="network-stub">{nodes.length} parties</div>;
  },
}));

afterEach(cleanup);

function parties(n: number): {entities: EntityOut[]; links: GraphEdge[]} {
  const entities = Array.from({length: n}, (_, i) => entityFixture(`e${i}`, `Party ${i}`, 'Company') as unknown as EntityOut);
  const links = entities.slice(1).map((e, i) => relationshipFixture({
    id: `r${i}`, schema: 'Ownership',
    source: {id: 'e0', ftm_id: 'f0', caption: 'Party 0', schema: 'Company'},
    target: {id: e.id, ftm_id: `f${e.id}`, caption: e.caption, schema: 'Company'},
  }) as unknown as GraphEdge);
  return {entities, links};
}

describe('Graph', () => {
  it('draws a small network and says how many links cross', async () => {
    const {entities, links} = parties(5);
    render(<Graph relationships={links} entities={entities} onNode={vi.fn()} onEdge={vi.fn()}/>);
    expect(await screen.findByTestId('graph-crossings')).toHaveTextContent('3 pairs of links cross in this drawing.');
    expect(screen.queryByRole('button', {name: 'Connection grid'})).toBeNull();
  });

  it('offers the connection grid past twenty parties, whose cells open the link', async () => {
    const {entities, links} = parties(22);
    const onEdge = vi.fn();
    render(<Graph relationships={links} entities={entities} onNode={vi.fn()} onEdge={onEdge}/>);
    expect(await screen.findByTestId('graph-crossings')).toHaveTextContent('The connection grid shows the same links without crossings.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Connection grid'}));
    const grid = within(screen.getByRole('table', {name: 'Connection grid'}));
    // Party 0 is linked to every other, so it comes first.
    expect(grid.getAllByRole('rowheader')[0]).toHaveTextContent('Party 0');
    await user.click(grid.getByRole('button', {name: 'Party 0 to Party 5: 1 link (Ownership)'}));
    expect(onEdge).toHaveBeenCalledWith(expect.objectContaining({id: 'r4'}));
    expect(screen.queryByTestId('network-stub')).toBeNull();
    await user.click(screen.getByRole('button', {name: 'Network'}));
    expect(screen.getByTestId('network-stub')).toHaveTextContent('22 parties');
  });

  it('words the crossing count', () => {
    expect(crossingsLine(0, 30)).toBe('No links cross in this drawing.');
    expect(crossingsLine(1, 5)).toBe('1 pair of links crosses in this drawing.');
  });
});

describe('ConnectionGrid', () => {
  const people = [{id: 'm', label: 'Meridian'}, {id: 'b', label: 'Bellcastle'}, {id: 'j', label: 'Jane'}];
  const links = [{id: '1', from: 'm', to: 'b', label: 'Ownership'}, {id: '2', from: 'm', to: 'b', label: 'Payment'},
    {id: '3', from: 'b', to: 'm', label: 'Payment'}, {id: '4', from: 'j', to: 'm', label: 'Directorship'}];

  it('reads from the row to the column, says so, and keys its shades', () => {
    render(<ConnectionGrid nodes={people} links={links}/>);
    const grid = within(screen.getByRole('table', {name: 'Connection grid'}));
    expect(grid.getByRole('columnheader', {name: /Party a link runs from/})).toBeInTheDocument();
    expect(grid.getByRole('button', {name: 'Meridian to Bellcastle: 2 links (Ownership, Payment)'})).toHaveTextContent('2');
    expect(grid.getByRole('button', {name: 'Bellcastle to Meridian: 1 link (Payment)'})).toBeInTheDocument();
    expect(grid.queryByRole('button', {name: /^Meridian to Jane/})).toBeNull();
    expect(screen.getByText(/Links from the row's party to the column's/).closest('p')).toHaveTextContent(/column's:\s*1\s*2\s*3 or more$/);
  });

  it('lights the row and column of the cell pointed at, and their names', async () => {
    render(<ConnectionGrid nodes={people} links={links}/>);
    const user = userEvent.setup();
    await user.hover(screen.getByRole('button', {name: /^Jane to Meridian/}));
    expect(screen.getByRole('rowheader', {name: 'Jane'})).toHaveStyle({fontWeight: '600'});
    expect(screen.getByRole('columnheader', {name: 'Meridian'})).toHaveStyle({fontWeight: '600'});
    expect(screen.getByRole('rowheader', {name: 'Bellcastle'})).not.toHaveStyle({fontWeight: '600'});
  });

  it('keeps every count readable on its shade (WCAG 1.4.3, 4.5:1)', () => {
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const hsl = (h: number, s: number, l: number) => {
      const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
    };
    const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    for (const count of [1, 2, 3]) {
      const {background, text} = shadeFor(count);
      const [h, s, l] = (background.match(/[\d.]+/g) as string[]).map(Number);
      const [a, b] = [luminance(hsl(h, s / 100, l / 100)), luminance(hex(text))];
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
