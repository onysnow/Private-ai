// @vitest-environment jsdom
// The network and the connection grid (features/relationship-graph/graph.tsx;
// design rule 18: "Networks over ~20 nodes offer a grid view; crossings
// counted"). The Sigma drawing is replaced by a stub that reports a layout,
// as Sigma needs WebGL.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useEffect} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

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
    await user.click(grid.getByRole('button', {name: 'Party 0 and Party 5: 1 link (Ownership)'}));
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
