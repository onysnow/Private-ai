// @vitest-environment jsdom
// Issue #39: EntityGraph wiring coverage. vis-network draws to a real
// <canvas> 2D context, which jsdom doesn't implement (getContext('2d')
// returns null without the native `canvas` package) -- so vis-network and
// vis-data are mocked here with lightweight fakes that let these tests
// assert on the actual contract this component owns: DataSet
// construction/sync, Network wiring (options, physics-disable-after-
// stabilization), and click-event -> onNodeClick/onEdgeClick mapping.
// Rendering pixels to a canvas is vis-network's own tested responsibility,
// not this component's.
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {EntityGraph} from '../components/entity-graph';

type FakeDataSetInstance = {
  items: Map<string, unknown>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  getIds: ReturnType<typeof vi.fn>;
};

type StabilizationHandler = () => void;
type ClickHandler = (event: {nodes: string[]; edges: string[]}) => void;

type FakeNetworkInstance = {
  destroy: ReturnType<typeof vi.fn>;
  setOptions: ReturnType<typeof vi.fn>;
  constructorArgs: [unknown, unknown, unknown];
  emitStabilizationDone: StabilizationHandler;
  emitClick: ClickHandler;
};

// vi.mock factories are hoisted above the rest of the module, so the fake
// classes they reference must be defined through vi.hoisted() rather than
// as ordinary top-level `class` declarations (which are in the TDZ at the
// point the hoisted factory runs).
const {dataSetInstances, networkInstances, FakeDataSet, FakeNetwork} = vi.hoisted(() => {
  const dataSetInstances: FakeDataSetInstance[] = [];
  const networkInstances: FakeNetworkInstance[] = [];

  class FakeDataSet {
    items = new Map<string, unknown>();
    add = vi.fn((rows: Array<{id: string}>) => {
      for (const row of rows) this.items.set(String(row.id), row);
    });
    update = vi.fn((rows: Array<{id: string}>) => {
      for (const row of rows) this.items.set(String(row.id), row);
    });
    remove = vi.fn((ids: string[]) => {
      for (const id of ids) this.items.delete(String(id));
    });
    getIds = vi.fn(() => Array.from(this.items.keys()));

    constructor(initial: Array<{id: string}> = []) {
      this.add(initial);
      dataSetInstances.push(this as unknown as FakeDataSetInstance);
    }
  }

  class FakeNetwork {
    destroy = vi.fn();
    setOptions = vi.fn();
    constructorArgs: [unknown, unknown, unknown];
    private stabilizationHandler: StabilizationHandler = () => {};
    private clickHandler: ClickHandler = () => {};

    constructor(container: unknown, data: unknown, options: unknown) {
      this.constructorArgs = [container, data, options];
      networkInstances.push(this as unknown as FakeNetworkInstance);
    }

    once(event: string, handler: StabilizationHandler): void {
      if (event === 'stabilizationIterationsDone') this.stabilizationHandler = handler;
    }

    on(event: string, handler: ClickHandler): void {
      if (event === 'click') this.clickHandler = handler;
    }

    emitStabilizationDone(): void {
      this.stabilizationHandler();
    }

    emitClick(event: {nodes: string[]; edges: string[]}): void {
      this.clickHandler(event);
    }
  }

  return {dataSetInstances, networkInstances, FakeDataSet, FakeNetwork};
});

vi.mock('vis-data', () => ({DataSet: FakeDataSet}));
vi.mock('vis-network', () => ({Network: FakeNetwork}));

beforeEach(() => {
  dataSetInstances.length = 0;
  networkInstances.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const nodeA = {id: 'ent-1', label: 'Kestrelwood Holdings Ltd', schema: 'Company', status: 'documented' as const};
const nodeB = {id: 'ent-2', label: 'Jordan Vale', schema: 'Person', status: 'alleged' as const};
const edgeAB = {id: 'rel-1', from: 'ent-1', to: 'ent-2', label: 'EMPLOYED_BY', status: 'inferred' as const};

describe('EntityGraph', () => {
  it('renders a container and initializes one Network with the given nodes/edges', () => {
    render(<EntityGraph nodes={[nodeA, nodeB]} edges={[edgeAB]} />);

    expect(screen.getByTestId('entity-graph')).toBeInTheDocument();
    expect(networkInstances).toHaveLength(1);
    expect(dataSetInstances).toHaveLength(2);
    const [nodesDataSet, edgesDataSet] = dataSetInstances;
    expect(nodesDataSet.items.size).toBe(2);
    expect(edgesDataSet.items.size).toBe(1);
  });

  it('disables physics once stabilization finishes, without destroying the network', () => {
    render(<EntityGraph nodes={[nodeA]} edges={[]} />);
    const network = networkInstances[0];

    network.emitStabilizationDone();

    expect(network.setOptions).toHaveBeenCalledWith({physics: {enabled: false}});
    expect(network.destroy).not.toHaveBeenCalled();
  });

  it('calls onNodeClick when a node is clicked, and onEdgeClick when only an edge is', () => {
    const onNodeClick = vi.fn();
    const onEdgeClick = vi.fn();
    render(<EntityGraph nodes={[nodeA, nodeB]} edges={[edgeAB]} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} />);
    const network = networkInstances[0];

    network.emitClick({nodes: ['ent-1'], edges: []});
    expect(onNodeClick).toHaveBeenCalledWith('ent-1');
    expect(onEdgeClick).not.toHaveBeenCalled();

    network.emitClick({nodes: [], edges: ['rel-1']});
    expect(onEdgeClick).toHaveBeenCalledWith('rel-1');
  });

  it('syncs the nodes DataSet on prop changes (upsert + remove stale) without recreating the Network', () => {
    const {rerender} = render(<EntityGraph nodes={[nodeA, nodeB]} edges={[edgeAB]} />);
    expect(networkInstances).toHaveLength(1);
    const [nodesDataSet] = dataSetInstances;
    nodesDataSet.update.mockClear();
    nodesDataSet.remove.mockClear();

    const nodeC = {id: 'ent-3', label: 'New Entity', status: 'unknown' as const};
    rerender(<EntityGraph nodes={[nodeA, nodeC]} edges={[edgeAB]} />);

    // ent-2 dropped, ent-3 added, ent-1 re-upserted; still one Network.
    expect(nodesDataSet.remove).toHaveBeenCalledWith(['ent-2']);
    expect(nodesDataSet.update).toHaveBeenCalled();
    expect(networkInstances).toHaveLength(1);
  });

  it('destroys the network on unmount', () => {
    const {unmount} = render(<EntityGraph nodes={[nodeA]} edges={[]} />);
    const network = networkInstances[0];

    unmount();

    expect(network.destroy).toHaveBeenCalledTimes(1);
  });
});
