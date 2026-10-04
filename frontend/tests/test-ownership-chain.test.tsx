// @vitest-environment jsdom
// The ownership and control chain (lib/ownership-layout.ts,
// components/ownership-diagram.tsx, features/dossier/ownership-chain.tsx;
// backend app/services/ownership_chain.py). React Flow measures the page,
// which jsdom does not lay out, so it is replaced here by a stub that keeps
// the nodes and edges the component hands it; the tests check the
// component's own part: where the parties go, what each link says, and what
// a click opens. Drawing is React Flow's.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {OwnershipDiagram} from '../components/ownership-diagram';
import {OwnershipChain, shareText} from '../features/dossier/ownership-chain';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {OwnershipChainOut} from '../lib/generated/types.gen';
import {formatShare, layoutChain, linkLabel} from '../lib/ownership-layout';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {emptyOwnershipChain} from '../test-support/page-routes';

type Drawn = {nodes: {id: string; position: {x: number; y: number}; ariaLabel?: string}[];
  edges: {id: string; label?: string; style?: {strokeDasharray?: string}; ariaLabel?: string; sourceHandle?: string; type?: string}[];
  onNodeClick?: (event: unknown, node: {id: string}) => void};
const {drawn} = vi.hoisted(() => ({drawn: [] as Drawn[]}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Drawn) => {
    drawn.push(props);
    return <div data-testid="flow">{props.nodes.map(n => <button key={n.id} onClick={() => props.onNodeClick?.({}, n)}>{n.ariaLabel}</button>)}</div>;
  },
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MarkerType: {ArrowClosed: 'arrowclosed'},
  Position: {Top: 'top', Bottom: 'bottom', Right: 'right'},
}));
vi.mock('next/dynamic', async () => {
  const diagram = await import('../components/ownership-diagram');
  return {default: () => diagram.OwnershipDiagram};
});

beforeEach(() => { drawn.length = 0; connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const node = (id: string, caption: string, level: number, schema = 'Company') => ({id, caption, schema, level, is_subject: level === 0});
const link = (id: string, source: string, target: string, overrides: Partial<OwnershipChainOut['links'][number]> = {}) => ({
  id, schema: 'Ownership', source, target, percentage: null, role: null, start_date: null, end_date: null, ended: false, circular: false, ...overrides});

// Voss owns half of Bellcastle, which owns 60% of Meridian; Meridian owns all
// of Meridian Shipping; Jane Doe sits on Meridian's board; Orrin's stake ended.
const CHAIN: OwnershipChainOut = {
  entity_id: 'm',
  nodes: [node('voss', 'Alaric Voss', -2, 'Person'), node('b', 'Bellcastle Ltd', -1), node('o', 'Orrin Ltd', -1), node('j', 'Jane Doe', -1, 'Person'),
    node('m', 'Meridian Holdings Ltd', 0), node('s', 'Meridian Shipping Ltd', 1)],
  links: [link('l1', 'voss', 'b', {percentage: 50}), link('l2', 'b', 'm', {percentage: 60}), link('l3', 'o', 'm', {percentage: 40, ended: true, end_date: '2021'}),
    link('l4', 'j', 'm', {schema: 'Directorship', role: 'director'}), link('l5', 'm', 's', {percentage: 100})],
  owners: [
    {entity_id: 'b', paths: 1, direct: true, effective_percentage: 60, not_known_because: null},
    {entity_id: 'o', paths: 1, direct: true, effective_percentage: null, not_known_because: '1 of 1 path(s) pass through an ownership that has ended'},
    {entity_id: 'voss', paths: 1, direct: false, effective_percentage: 30, not_known_because: null},
  ],
  max_depth: 6, truncated: false,
};

describe('layoutChain', () => {
  it('draws owners above the entity and its holdings below', () => {
    const {parties} = layoutChain(CHAIN);
    const y = Object.fromEntries(parties.map(p => [p.id, p.y]));
    expect(y.voss).toBeLessThan(y.b);
    expect(y.b).toBeLessThan(y.m);
    expect(y.j).toBeLessThan(y.m);
    expect(y.m).toBeLessThan(y.s);
  });

  it('still lays out a circle of ownership', () => {
    const circle = {...CHAIN, nodes: [node('a', 'A Ltd', -1), node('m', 'M Ltd', 0)],
      links: [link('x', 'a', 'm', {percentage: 10, circular: true}), link('y', 'm', 'a', {percentage: 5, circular: true})], owners: []};
    const {parties, links} = layoutChain(circle);
    expect(parties).toHaveLength(2);
    expect(links.map(l => l.label)).toEqual(['10% · circular', '5% · circular']);
    // dagre puts one end of the circle above the other; the link that has to run up is marked so it goes round the side.
    expect(links.map(l => l.upward).sort()).toEqual([false, true]);
  });

  it('words each link: the share or the role, and whether it ended', () => {
    expect(linkLabel(link('a', 'x', 'y', {percentage: 12.5}))).toBe('12.5%');
    expect(linkLabel(link('a', 'x', 'y'))).toBe('share not stated');
    expect(linkLabel(link('a', 'x', 'y', {percentage: 40, ended: true, end_date: '2021'}))).toBe('40% · ended 2021');
    expect(linkLabel(link('a', 'x', 'y', {schema: 'Directorship', role: null}))).toBe('director');
    expect(formatShare(33.333)).toBe('33.33%');
  });
});

describe('OwnershipDiagram', () => {
  it('hands React Flow the parties at their places and the links in words, an ended one dashed', async () => {
    const onParty = vi.fn();
    render(<OwnershipDiagram chain={CHAIN} onParty={onParty}/>);
    const {nodes, edges} = drawn[drawn.length - 1];
    expect(nodes.map(n => n.id).sort()).toEqual(['b', 'j', 'm', 'o', 's', 'voss']);
    expect(nodes.find(n => n.id === 'm')?.ariaLabel).toBe('Meridian Holdings Ltd, Company, the entity this chain is for');
    const ended = edges.find(e => e.id === 'l3');
    expect(ended?.label).toBe('40% · ended 2021');
    expect(ended?.style?.strokeDasharray).toBe('6 5');                              // ended: dashed
    expect(edges.find(e => e.id === 'l2')?.style).toMatchObject({stroke: '#d4a152'}); // owns: amber, as on the network
    expect(edges.find(e => e.id === 'l2')?.style?.strokeDasharray).toBeUndefined();
    expect(edges.find(e => e.id === 'l4')?.style).toMatchObject({stroke: '#baac91'}); // directs: sage, as on the network
    expect(edges.every(e => e.sourceHandle === 'out' && e.type === 'default')).toBe(true);   // no circle here: every link runs down
    expect(edges.find(e => e.id === 'l2')?.ariaLabel).toBe('Bellcastle Ltd to Meridian Holdings Ltd: Ownership, 60%');
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Ownership and control chart: 6 parties and 5 links');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Bellcastle Ltd, Company'}));
    expect(onParty).toHaveBeenCalledWith('b');
  });
});

describe('OwnershipChain', () => {
  const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

  it('lists every owner with the share it holds, or why that is not known', async () => {
    mockApi({'GET /api/entities/m/ownership-chain': CHAIN});
    const onParty = vi.fn();
    wrap(<OwnershipChain entityId="m" onParty={onParty}/>);
    const table = within(await screen.findByRole('table', {name: 'Owners and their shares'}));
    const rows = table.getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toEqual([
      'Bellcastle Ltd60%1 (one direct)',
      'Orrin Ltdnot known: 1 of 1 path(s) pass through an ownership that has ended1 (one direct)',
      'Alaric Voss30%1',
    ]);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Alaric Voss, Person'}));
    expect(onParty).toHaveBeenCalledWith('voss');
  });

  it('says so when no ownership or directorship is recorded', async () => {
    mockApi({'GET /api/entities/m/ownership-chain': emptyOwnershipChain('m')});
    wrap(<OwnershipChain entityId="m" onParty={vi.fn()}/>);
    expect(await screen.findByText('No ownership or directorship links are recorded for this entity.')).toBeInTheDocument();
    expect(screen.queryByTestId('flow')).toBeNull();
  });

  it('words a share', () => {
    expect(shareText(CHAIN.owners[0])).toBe('60%');
    expect(shareText({...CHAIN.owners[0], effective_percentage: null, not_known_because: null})).toBe('not known: no reason given');
  });
});
