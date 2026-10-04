// @vitest-environment jsdom
// The network drawing (components/entity-graph.tsx). Sigma draws with WebGL,
// which jsdom does not have, so Sigma is replaced here by a fake that keeps
// what the component hands it -- the graphology graph, the settings and the
// event handlers -- and the tests check the component's own part: the graph
// it builds (places, looks), the events it maps to the callers, the camera
// it keeps, and the crossing count it reports. Drawing pixels is Sigma's.
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {EntityGraph, drawnGraph, fitRatio, labelPxAt, labelWidth, nodeTitle, radiusFor, statusStyle, viewSize} from '../components/entity-graph';
import {PICTOGRAMS} from '../lib/network-pictograms';

type Handler = (payload: {node?: string; edge?: string}) => void;
type FakeSigmaInstance = {
  graph: {getNodeAttributes: (id: string) => Record<string, unknown>; getEdgeAttributes: (id: string) => Record<string, unknown>; order: number; size: number};
  settings: Record<string, unknown> & {
    nodeReducer: (id: string, a: Record<string, unknown>) => Record<string, unknown>;
    edgeReducer: (id: string, a: Record<string, unknown>) => Record<string, unknown>;
  };
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
vi.mock('sigma/rendering', () => ({EdgeArrowProgram: class {}, createNodeCompoundProgram: () => class {}}));
vi.mock('@sigma/node-border', () => ({createNodeBorderProgram: () => class {}}));
vi.mock('@sigma/node-image', () => ({createNodeImageProgram: () => class {}}));
// @sigma/edge-curve reads WebGL constants when it loads; its parallel-link
// index is stood in for by the rule its source follows for one link each way
// between two parties (index 1 of 1) and a link alone (null).
vi.mock('@sigma/edge-curve', () => ({
  EdgeCurvedArrowProgram: class {},
  indexParallelEdgesIndex: (graph: import('graphology').default) => graph.forEachEdge((id, _a, from, to) => {
    const both = graph.hasDirectedEdge(to, from);
    graph.mergeEdgeAttributes(id, {parallelIndex: both ? 1 : null, parallelMaxIndex: both ? 1 : null});
  }),
}));

const nodes = [
  {id: 'm', label: 'Meridian Holdings Ltd', schema: 'Company'},
  {id: 'b', label: 'Bellcastle Trading Group', schema: 'Company', status: 'inferred' as const},
  {id: 'j', label: 'Jane Doe', schema: 'Person'},
];
const edges = [{id: 'e1', from: 'm', to: 'b', label: 'Ownership'}, {id: 'e2', from: 'j', to: 'm', label: 'Directorship', status: 'contested' as const}];
const container = () => screen.getByTestId('entity-graph');

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

  it('sizes a dot by its links, marks what the party is, and names each link by its ends', () => {
    const {graph} = drawnGraph(nodes, edges);
    expect(graph.getNodeAttributes('m').size).toBe(radiusFor(2));    // two links
    expect(graph.getNodeAttributes('b').size).toBe(radiusFor(1));
    expect(radiusFor(2)).toBeGreaterThan(radiusFor(1));
    expect(radiusFor(400)).toBe(20);                                 // capped
    expect(graph.getNodeAttributes('j').image).toBe(PICTOGRAMS.person);
    expect(graph.getNodeAttributes('m').image).toBe(PICTOGRAMS.organisation);
    expect(graph.getNodeAttributes('m').pictoColor).toBe(statusStyle(undefined).border);
    expect(graph.getEdgeAttributes('e1').title).toBe('Meridian Holdings Ltd → Bellcastle Trading Group · Ownership');
  });

  it('draws a link each way between two parties as two curves, and a link alone straight', () => {
    const {graph} = drawnGraph(nodes, [...edges, {id: 'e3', from: 'b', to: 'm', label: 'Payment'}]);
    expect(graph.getEdgeAttributes('e1')).toMatchObject({type: 'curved', curvature: 0.25});
    expect(graph.getEdgeAttributes('e3')).toMatchObject({type: 'curved', curvature: 0.25});
    expect(graph.getEdgeAttributes('e2').type).toBe('arrow');
  });

  it('keeps names clear of each other: no two parties closer than their names need', () => {
    const many = Array.from({length: 8}, (_, i) => ({id: `n${i}`, label: `A rather long company name ${i}`, schema: 'Company'}));
    const links = many.slice(1).map((n, i) => ({id: `l${i}`, from: 'n0', to: n.id}));
    const {positions} = drawnGraph(many, links);
    const half = labelWidth('A rather long company name 0') / 2;
    for (let i = 0; i < many.length; i += 1) {
      for (let j = i + 1; j < many.length; j += 1) {
        const [a, b] = [positions[`n${i}`], positions[`n${j}`]];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * half);
      }
    }
  });

  it('says a party\'s name, schema and detail once each', () => {
    expect(nodeTitle({id: 'a', label: 'Jane Doe', schema: 'Person', title: 'Jane Doe · Person'})).toBe('Jane Doe · Person');
    expect(nodeTitle({id: 'a', label: 'Jane Doe', schema: 'Person', title: 'born 1970'})).toBe('Jane Doe · Person · born 1970');
    expect(nodeTitle({id: 'a', label: 'Jane Doe'})).toBe('Jane Doe');
  });

  it('zooms out just enough for every dot and name to fit, writing names smaller by as much, down to 10 px', () => {
    // Two parties 400 px apart, each name 60 px wide.
    const reach = [{dx: 200, dy: 0, radius: 10, halfName: 30}, {dx: 200, dy: 0, radius: 10, halfName: 30}];
    expect(fitRatio(reach, 1000, 400)).toBe(1);                      // fits as laid out
    const ratio = fitRatio(reach, 300, 400);
    expect(ratio).toBeGreaterThan(1);
    expect(viewSize(reach, ratio).width).toBeLessThanOrEqual(300);
    expect(viewSize(reach, ratio * 0.98).width).toBeGreaterThan(300); // and no further
    expect(labelPxAt(1)).toBe(13);
    expect(labelPxAt(1.3)).toBeCloseTo(10);
    expect(labelPxAt(4)).toBe(10);
  });

  it('measures a name at 0.6 em a character where no canvas is to hand', () => {
    expect(labelWidth('abcde')).toBeCloseTo(5 * 13 * 0.6);
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

  it('writes a link\'s kind only while it or one of its parties is pointed at', () => {
    render(<EntityGraph nodes={[...nodes, {id: 'x', label: 'Orrin Ltd'}]} edges={edges}/>);
    const sigma = instances[0];
    const kind = (id: string) => sigma.settings.edgeReducer(id, sigma.graph.getEdgeAttributes(id)).label;
    expect(kind('e1')).toBe('');
    act(() => sigma.handlers.enterEdge({edge: 'e1'}));
    expect(kind('e1')).toBe('Ownership');
    expect(screen.getByText('Meridian Holdings Ltd → Bellcastle Trading Group · Ownership')).toBeInTheDocument();
    act(() => sigma.handlers.leaveEdge({}));
    act(() => sigma.handlers.enterNode({node: 'j'}));
    expect(kind('e2')).toBe('Directorship');                     // Jane's link
    expect(kind('e1')).toBe('');                                  // not Jane's: dimmed, unnamed
  });

  it('keys the pictograms it uses and what a dot\'s size says', () => {
    render(<EntityGraph nodes={nodes} edges={edges}/>);
    const key = screen.getByTestId('graph-key');
    expect(key).toHaveTextContent('Person');
    expect(key).toHaveTextContent('Company or organisation');
    expect(key).not.toHaveTextContent('Vessel');
    expect(key).toHaveTextContent('A bigger dot has more links.');
  });

  it('is drawn at the layout\'s scale and no taller than the drawing needs', () => {
    render(<EntityGraph nodes={nodes} edges={edges} height={480}/>);
    expect(instances[0].settings.autoRescale).toBe(false);
    const height = parseFloat(container().style.height);
    expect(height).toBeGreaterThanOrEqual(200);
    expect(height).toBeLessThan(480);
  });

  it('fits the view anew for new data unless the reporter moved it', () => {
    const {rerender} = render(<EntityGraph nodes={nodes} edges={edges}/>);
    rerender(<EntityGraph nodes={[...nodes, {id: 'x', label: 'Orrin Ltd'}]} edges={edges}/>);
    expect(instances).toHaveLength(2);
    // Not moved: the old view is not carried over (jsdom's box has no size,
    // so each drawing is only zoomed out to fit).
    expect(instances[1].camera.setState).not.toHaveBeenCalledWith(instances[0].camera.state);
    expect(instances[1].camera.setState).toHaveBeenCalledWith({ratio: expect.any(Number)});
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
