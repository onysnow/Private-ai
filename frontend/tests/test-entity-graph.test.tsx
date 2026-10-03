// @vitest-environment jsdom
// The network drawing (components/entity-graph.tsx). Sigma draws with WebGL,
// which jsdom does not have, so Sigma is replaced here by a fake that keeps
// what the component hands it -- the graphology graph, the settings and the
// event handlers -- and the tests check the component's own part: the graph
// it builds (places, looks), the events it maps to the callers, the camera
// it keeps, and the crossing count it reports. Drawing pixels is Sigma's.
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {EntityGraph, drawnGraph, statusStyle} from '../components/entity-graph';

type Handler = (payload: {node?: string; edge?: string}) => void;
type FakeSigmaInstance = {
  graph: {getNodeAttributes: (id: string) => Record<string, unknown>; order: number; size: number};
  settings: Record<string, unknown> & {nodeReducer: (id: string, a: Record<string, unknown>) => Record<string, unknown>};
  handlers: Record<string, Handler>;
  kill: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  camera: {state: Record<string, number>; setState: ReturnType<typeof vi.fn>};
};

const {instances, FakeSigma} = vi.hoisted(() => {
  const instances: FakeSigmaInstance[] = [];
  class FakeSigma {
    handlers: Record<string, Handler> = {};
    kill = vi.fn();
    refresh = vi.fn();
    camera = {state: {x: 0.5, y: 0.5, ratio: 1, angle: 0}, setState: vi.fn(function (this: unknown, s: Record<string, number>) { void s; })};
    constructor(public graph: unknown, public container: unknown, public settings: Record<string, unknown>) {
      instances.push(this as unknown as FakeSigmaInstance);
    }
    on(event: string, handler: Handler) { this.handlers[event] = handler; return this; }
    getCamera() { return {getState: () => this.camera.state, setState: this.camera.setState}; }
  }
  return {instances, FakeSigma};
});

vi.mock('sigma', () => ({default: FakeSigma}));
vi.mock('sigma/rendering', () => ({EdgeArrowProgram: class {}}));
vi.mock('@sigma/node-border', () => ({createNodeBorderProgram: () => class {}}));

const nodes = [
  {id: 'm', label: 'Meridian Holdings Ltd', schema: 'Company'},
  {id: 'b', label: 'Bellcastle Trading Group', schema: 'Company', status: 'inferred' as const},
  {id: 'j', label: 'Jane Doe', schema: 'Person'},
];
const edges = [{id: 'e1', from: 'm', to: 'b', label: 'Ownership'}, {id: 'e2', from: 'j', to: 'm', label: 'Directorship', status: 'contested' as const}];

beforeEach(() => { instances.length = 0; });
afterEach(cleanup);

describe('drawnGraph', () => {
  it('places every party and gives a tentative status a second ring, not only a colour', () => {
    const {graph, positions} = drawnGraph(nodes, edges);
    expect(Object.keys(positions).sort()).toEqual(['b', 'j', 'm']);
    const meridian = graph.getNodeAttributes('m');
    expect(meridian.ringColor).toBe(meridian.color);              // no ring
    const bellcastle = graph.getNodeAttributes('b');
    expect(bellcastle.ringColor).toBe(statusStyle('inferred').border);
    expect(bellcastle.title).toBe('Bellcastle Trading Group · Company');
    expect(graph.getEdgeAttributes('e2').size).toBe(1);           // a tentative link is thinner
    expect(graph.getEdgeAttributes('e1').size).toBe(2);
    expect(graph.source('e2')).toBe('j');
  });
});

describe('EntityGraph', () => {
  it('maps clicks to the callers, reports the crossings, and stops Sigma on unmount', () => {
    const onNodeClick = vi.fn(), onEdgeClick = vi.fn(), onLayout = vi.fn();
    const {unmount} = render(<EntityGraph nodes={nodes} edges={edges} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} onLayout={onLayout}/>);
    expect(instances).toHaveLength(1);
    const sigma = instances[0];
    expect(sigma.graph.order).toBe(3);
    expect(sigma.settings.enableEdgeEvents).toBe(true);
    act(() => sigma.handlers.clickNode({node: 'b'}));
    act(() => sigma.handlers.clickEdge({edge: 'e1'}));
    expect(onNodeClick).toHaveBeenCalledWith('b');
    expect(onEdgeClick).toHaveBeenCalledWith('e1');
    expect(onLayout).toHaveBeenCalledWith(expect.objectContaining({crossings: 0}));
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('3 parties and 2 links');
    unmount();
    expect(sigma.kill).toHaveBeenCalled();
  });

  it('names a hovered party and dims what is not linked to it', () => {
    render(<EntityGraph nodes={[...nodes, {id: 'x', label: 'Orrin Ltd'}]} edges={edges}/>);
    const sigma = instances[0];
    act(() => sigma.handlers.enterNode({node: 'b'}));
    expect(screen.getByText('Bellcastle Trading Group · Company')).toBeInTheDocument();
    const reduce = (id: string) => sigma.settings.nodeReducer(id, sigma.graph.getNodeAttributes(id));
    expect(reduce('m').label).toBe('Meridian Holdings Ltd');      // a neighbour
    expect(reduce('x').label).toBe('');                           // not linked: dimmed
    act(() => sigma.handlers.leaveNode({}));
    expect(reduce('x').label).toBe('Orrin Ltd');
  });

  it('keeps its drawing for equal data and its camera for new data', () => {
    const {rerender} = render(<EntityGraph nodes={nodes} edges={edges}/>);
    rerender(<EntityGraph nodes={nodes.map(n => ({...n}))} edges={edges.map(e => ({...e}))}/>);
    expect(instances).toHaveLength(1);                            // equal arrays anew: not laid out again
    instances[0].camera.state = {x: 0.2, y: 0.7, ratio: 0.5, angle: 0};
    rerender(<EntityGraph nodes={[...nodes, {id: 'x', label: 'Orrin Ltd'}]} edges={edges}/>);
    expect(instances).toHaveLength(2);
    expect(instances[0].kill).toHaveBeenCalled();
    expect(instances[1].camera.setState).toHaveBeenCalledWith({x: 0.2, y: 0.7, ratio: 0.5, angle: 0});
  });
});
