// @vitest-environment jsdom
// The relationship network in its frame (features/relationship-graph/graph.tsx)
// and the connection grid (components/connection-grid.tsx). The SVG drawing
// (React Flow) is replaced by a stub that lists what it is handed and
// reports where it put each party, as React Flow measures the DOM jsdom does
// not lay out.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useEffect} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ConnectionGrid, cellBackground} from '../components/connection-grid';
import {Graph, crossingsLine, linkWords, networkData} from '../features/relationship-graph/graph';
import type {GraphEdge} from '../features/relationship-graph/graph';
import type {EntityOut} from '../lib/generated/types.gen';
import {LINK} from '../lib/viz-tokens';
import {entityFixture, relationshipFixture} from '../test-support/page-routes';

vi.mock('../components/network/network-view', () => ({
  NetworkView: function Stub({parties, links, arrangement, focus, onPlaced}: {
    parties: Array<{id: string; label: string}>; links: Array<{id: string; family: string; certainty: string}>; arrangement: string; focus?: string;
    onPlaced?: (p: {positions: Record<string, {x: number; y: number}>; guides: unknown[]; width: number; height: number}) => void;
  }) {
    // The first four parties at fixed places (a cross: 0 and 1 level, 2 and 3 upright between them), the rest in a row below.
    useEffect(() => {
      const places = [{x: 0, y: 0}, {x: 200, y: 0}, {x: 100, y: -50}, {x: 100, y: 50}];
      const positions = Object.fromEntries(parties.map((p, i) => [p.id, places[i] ?? {x: i * 100, y: 300}]));
      onPlaced?.({positions, guides: [], width: 1, height: 1});
    }, [parties, onPlaced]);
    return <div data-testid="network-stub" data-arrangement={arrangement} data-focus={focus ?? ''}>
      {parties.length} parties · {links.map(l => `${l.id}:${l.family}:${l.certainty}`).join(' ')}
    </div>;
  },
}));

afterEach(cleanup);

const company = (id: string, caption: string) => entityFixture(id, caption, 'Company') as unknown as EntityOut;
const person = (id: string, caption: string) => entityFixture(id, caption, 'Person') as unknown as EntityOut;
const ends = (from: EntityOut, to: EntityOut) => ({
  source: {id: from.id, ftm_id: `f-${from.id}`, caption: from.caption, schema: from.schema},
  target: {id: to.id, ftm_id: `f-${to.id}`, caption: to.caption, schema: to.schema},
});
const rel = (id: string, schema: string, from: EntityOut, to: EntityOut, extra: Record<string, unknown> = {}) =>
  relationshipFixture({id, schema, ...ends(from, to), ...extra}) as unknown as GraphEdge;

const meridian = company('m', 'Meridian Holdings Ltd'), bellcastle = company('b', 'Bellcastle Trading Group'), jane = person('j', 'Jane Doe');
const entities = [meridian, bellcastle, jane];

describe('the network frame', () => {
  it('arranges by control when owners and directors are linked, and says so and why', async () => {
    render(<Graph relationships={[rel('r1', 'Ownership', bellcastle, meridian), rel('r2', 'Directorship', jane, meridian)]}
      entities={entities} onNode={vi.fn()} onEdge={vi.fn()}/>);
    expect(await screen.findByTestId('network-stub')).toHaveAttribute('data-arrangement', 'control');
    const rule = screen.getByTestId('chart-rule');
    expect(rule).toHaveTextContent('Arranged by control: each owner or director sits above what it owns or directs.');
    expect(rule).toHaveTextContent('Chosen because 2 of the 2 links here say who owns or directs whom.');
  });

  it('arranges by kind when no link says who controls whom, and switches arrangement on request', async () => {
    const user = userEvent.setup();
    render(<Graph relationships={[rel('r1', 'Payment', meridian, bellcastle), rel('r2', 'Family', jane, meridian)]}
      entities={entities} onNode={vi.fn()} onEdge={vi.fn()}/>);
    expect(await screen.findByTestId('network-stub')).toHaveAttribute('data-arrangement', 'kind');
    await user.click(screen.getByRole('radio', {name: 'Around a party'}));
    // The most-linked party is the centre until another is picked.
    expect(screen.getByTestId('network-stub')).toHaveAttribute('data-focus', 'm');
    expect(screen.getByTestId('chart-rule')).toHaveTextContent('Arranged around Meridian Holdings Ltd: each ring holds the parties one more link away from it.');
    await user.selectOptions(screen.getByLabelText('Party at the centre'), 'j');
    expect(screen.getByTestId('network-stub')).toHaveAttribute('data-focus', 'j');
    // A picked arrangement says no "chosen because".
    expect(screen.getByTestId('chart-rule')).not.toHaveTextContent('Chosen because');
  });

  it('keys only the kinds, links and certainties drawn, and counts them', async () => {
    const contested = {...relationshipFixture().advisory as object, needs_review: true};
    render(<Graph relationships={[rel('r1', 'Ownership', bellcastle, meridian, {advisory: {...contested, needs_review: false, has_independent_support: true}}),
      rel('r2', 'Payment', meridian, bellcastle, {advisory: contested})]} entities={entities} onNode={vi.fn()} onEdge={vi.fn()}/>);
    const key = within(await screen.findByRole('complementary', {name: 'Key'}));
    expect(key.getByText('Company')).toBeInTheDocument();
    expect(key.queryByText('Person')).toBeNull();
    expect(key.getByText('Owns')).toBeInTheDocument();
    expect(key.getByText('Paid or owes')).toBeInTheDocument();
    expect(key.queryByText('Family or associate')).toBeNull();
    expect(key.getByText(/A supporting claim is disputed or rejected/)).toBeInTheDocument();
    expect(key.queryByText(/Not yet supported/)).toBeNull();
    expect(screen.getByTestId('network-stub')).toHaveTextContent('r1:owns:supported r2:money:contested');
    const footer = screen.getByText('contested').parentElement as HTMLElement;
    expect(footer).toHaveTextContent('2 parties');
    expect(footer).toHaveTextContent('1 contested');
  });

  it('hides a kind of link with one press on its chip, and the parties only it linked', async () => {
    const user = userEvent.setup();
    render(<Graph relationships={[rel('r1', 'Ownership', bellcastle, meridian), rel('r2', 'Family', jane, meridian)]}
      entities={entities} onNode={vi.fn()} onEdge={vi.fn()}/>);
    expect(await screen.findByTestId('network-stub')).toHaveTextContent('3 parties');
    const chip = screen.getByRole('button', {name: 'Family or associate · 1'});
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('network-stub')).toHaveTextContent('2 parties');
    expect(screen.getByTestId('network-stub')).not.toHaveTextContent('r2');
  });

  it('counts the crossings in the drawing as placed, and words them', async () => {
    const c = company('c', 'Cobalt Freight'), d = company('d', 'Dunmore Ltd');
    // Placed by the stub: Meridian (0,0), Cobalt (200,0), Bellcastle (100,-50), Dunmore (100,50): the two links cross.
    render(<Graph relationships={[rel('r1', 'Payment', meridian, c), rel('r2', 'Payment', bellcastle, d)]}
      entities={[meridian, bellcastle, c, d]} onNode={vi.fn()} onEdge={vi.fn()}/>);
    expect(await screen.findByTestId('graph-crossings')).toHaveTextContent('1 pair of links crosses in this drawing.');
    expect(crossingsLine(0, 30)).toBe('No links cross in this drawing.');
    expect(crossingsLine(3, 25)).toBe('3 pairs of links cross in this drawing. The connection grid shows the same links without crossings.');
  });

  it('shows the grid on request, whose cells open the link', async () => {
    const onEdge = vi.fn();
    const user = userEvent.setup();
    render(<Graph relationships={[rel('r1', 'Ownership', bellcastle, meridian)]} entities={entities} onNode={vi.fn()} onEdge={onEdge}/>);
    await user.click(await screen.findByRole('radio', {name: 'Grid'}));
    const grid = within(screen.getByRole('table', {name: 'Connection grid'}));
    await user.click(grid.getByRole('button', {name: /^Bellcastle Trading Group to Meridian Holdings Ltd: 1 link \(Ownership\)/}));
    expect(onEdge).toHaveBeenCalledWith(expect.objectContaining({id: 'r1'}));
    expect(screen.getByTestId('chart-rule')).toHaveTextContent('Ordered by links');
  });

  it('words each link with its share, role or amount', () => {
    expect(linkWords({schema: 'Ownership', properties: {percentage: ['60']}})).toBe('Ownership · 60%');
    expect(linkWords({schema: 'Directorship', properties: {role: ['Chair']}})).toBe('Directorship · Chair');
    expect(linkWords({schema: 'Payment', properties: {amount: ['2400000'], currency: ['USD']}})).toBe('Payment · 2,400,000 USD');
    expect(linkWords({schema: 'Family', properties: {}})).toBe('Family');
  });

  it('weighs payments by amount only when every payment drawn is in one currency', () => {
    const c = company('c', 'Cobalt Freight');
    const same = networkData([rel('r1', 'Payment', meridian, bellcastle, {properties: {amount: ['100'], currency: ['USD']}}),
      rel('r2', 'Payment', meridian, c, {properties: {amount: ['200'], currency: ['usd']}})], [meridian, bellcastle, c]);
    expect(same.links.map(l => l.amount)).toEqual([100, 200]);
    const mixed = networkData([rel('r1', 'Payment', meridian, bellcastle, {properties: {amount: ['100'], currency: ['USD']}}),
      rel('r2', 'Payment', meridian, c, {properties: {amount: ['200'], currency: ['EUR']}})], [meridian, bellcastle, c]);
    expect(mixed.links.map(l => l.amount)).toEqual([undefined, undefined]);
  });
});

describe('ConnectionGrid', () => {
  const people = [{id: 'm', label: 'Meridian', kind: 'company' as const}, {id: 'b', label: 'Bellcastle', kind: 'company' as const},
    {id: 'j', label: 'Jane', kind: 'person' as const}];
  const links = [{id: '1', from: 'm', to: 'b', label: 'Ownership', family: 'owns' as const, certainty: 'supported' as const},
    {id: '2', from: 'm', to: 'b', label: 'Payment', family: 'money' as const, certainty: 'contested' as const},
    {id: '3', from: 'b', to: 'm', label: 'Payment', family: 'money' as const, certainty: 'unsupported' as const},
    {id: '4', from: 'j', to: 'm', label: 'Directorship', family: 'runs' as const, certainty: 'supported' as const}];

  it('reads from the row to the column and says how sure each cell is', () => {
    render(<ConnectionGrid nodes={people} links={links}/>);
    const grid = within(screen.getByRole('table', {name: 'Connection grid'}));
    expect(grid.getByRole('columnheader', {name: /Party a link runs from/})).toBeInTheDocument();
    expect(grid.getByRole('button', {name: 'Meridian to Bellcastle: 2 links (Ownership, Payment), contested'})).toHaveTextContent('2');
    expect(grid.getByRole('button', {name: 'Bellcastle to Meridian: 1 link (Payment), not yet supported'})).toHaveTextContent('');
    expect(grid.queryByRole('button', {name: /^Meridian to Jane/})).toBeNull();
  });

  it('colours a cell by its kinds of link, in stripes when there are several', () => {
    expect(cellBackground(['money'])).toBe(LINK.money.colour);
    expect(cellBackground(['money', 'owns'])).toBe(`linear-gradient(90deg, ${LINK.owns.colour} 0% 50%, ${LINK.money.colour} 50% 100%)`);
  });

  it('lights the row and column of the cell pointed at, and their names', async () => {
    render(<ConnectionGrid nodes={people} links={links}/>);
    const user = userEvent.setup();
    await user.hover(screen.getByRole('button', {name: /^Jane to Meridian/}));
    expect(screen.getByRole('rowheader', {name: 'Jane'})).toHaveStyle({fontWeight: '600'});
    expect(screen.getByRole('columnheader', {name: 'Meridian'})).toHaveStyle({fontWeight: '600'});
    expect(screen.getByRole('rowheader', {name: 'Bellcastle'})).not.toHaveStyle({fontWeight: '600'});
  });
});
