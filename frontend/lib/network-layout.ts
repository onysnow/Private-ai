// Where a relationship network's people and companies sit, and what can be
// said about the drawing (visuals pass 4, networks; ADR-0005 line 3).
//
// The layout is graphology's ForceAtlas2 (Jacomy et al. 2014, the layout
// Gephi and Sigma.js use), started from a circle so the same records always
// give the same picture: ForceAtlas2 run synchronously is deterministic from
// its starting positions. Its settings come from its own `inferSettings`,
// which turns on the Barnes-Hut approximation for large graphs.
//
// Design rule 18 ("Networks over ~20 nodes offer a grid view; crossings
// counted", design doc "How every chart gets checked"): `countCrossings`
// counts the pairs of links whose straight lines cross in the drawing, and
// `connectionGrid` is the same links as a matrix -- one row and one column
// per party, ordered so that parties linked to many others come first --
// which never crosses (Ghoniem, Fekete and Castagliola 2004 found matrices
// read better than node-link drawings past about twenty nodes).
import Graph from 'graphology';
import circular from 'graphology-layout/circular';
import forceAtlas2 from 'graphology-layout-forceatlas2';

export type NetworkNode = {id: string; label: string};
export type NetworkLink = {id: string; from: string; to: string; label?: string};
export type Point = {x: number; y: number};

/** Past this many parties the drawing offers the connection grid (rule 18). */
export const GRID_THRESHOLD = 20;
const ITERATIONS = 300;

/** The network as a graphology graph: one node per party, one edge per link
 * (a link to a party not in the list is left out, as a drawing could not
 * place it). Parallel links between the same two parties are kept. */
export function networkGraph(nodes: NetworkNode[], links: NetworkLink[]): Graph {
  const graph = new Graph({multi: true, type: 'directed', allowSelfLoops: false});
  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!graph.hasNode(node.id)) graph.addNode(node.id, {label: node.label});
  }
  for (const link of [...links].sort((a, b) => a.id.localeCompare(b.id))) {
    if (link.from !== link.to && graph.hasNode(link.from) && graph.hasNode(link.to) && !graph.hasEdge(link.id)) {
      graph.addDirectedEdgeWithKey(link.id, link.from, link.to, {label: link.label ?? ''});
    }
  }
  return graph;
}

/** Each party's place: a circle in id order, then ForceAtlas2. */
export function layoutNetwork(graph: Graph): Record<string, Point> {
  circular.assign(graph, {scale: 100});
  if (graph.order > 1) {
    forceAtlas2.assign(graph, {iterations: ITERATIONS, settings: forceAtlas2.inferSettings(graph)});
  }
  const out: Record<string, Point> = {};
  graph.forEachNode((id, attrs) => { out[id] = {x: attrs.x as number, y: attrs.y as number}; });
  return out;
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(value) < 1e-9 ? 0 : value > 0 ? 1 : 2;
}

/** Whether segments ab and cd cross at a point inside both (sharing an end
 * is not a crossing: links that meet at a party do not cross). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** How many pairs of links cross in the drawing, as straight lines between
 * their parties (rule 18). Links that share a party never count. */
export function countCrossings(links: NetworkLink[], positions: Record<string, Point>): number {
  const drawn = links.filter(l => positions[l.from] && positions[l.to] && l.from !== l.to);
  let crossings = 0;
  for (let i = 0; i < drawn.length; i += 1) {
    for (let j = i + 1; j < drawn.length; j += 1) {
      const a = drawn[i], b = drawn[j];
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
      if (segmentsCross(positions[a.from], positions[a.to], positions[b.from], positions[b.to])) crossings += 1;
    }
  }
  return crossings;
}

export type GridCell = {row: number; column: number; links: NetworkLink[]};
export type ConnectionGrid = {parties: NetworkNode[]; cells: GridCell[]};

/** The links as a matrix: a row and a column per party, most-linked first
 * (then by name), and one cell per pair that has links, holding every link
 * between the two whichever way it runs, so the grid is symmetric. */
export function connectionGrid(nodes: NetworkNode[], links: NetworkLink[]): ConnectionGrid {
  const known = new Map(nodes.map(n => [n.id, n]));
  const kept = links.filter(l => l.from !== l.to && known.has(l.from) && known.has(l.to));
  const degree = new Map<string, number>();
  for (const l of kept) {
    degree.set(l.from, (degree.get(l.from) ?? 0) + 1);
    degree.set(l.to, (degree.get(l.to) ?? 0) + 1);
  }
  const parties = [...known.values()].sort((a, b) =>
    (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const index = new Map(parties.map((p, i) => [p.id, i]));
  const pairs = new Map<string, NetworkLink[]>();
  for (const l of kept) {
    const [a, b] = [index.get(l.from) as number, index.get(l.to) as number].sort((x, y) => x - y);
    const key = `${a}:${b}`;
    pairs.set(key, [...(pairs.get(key) ?? []), l]);
  }
  const cells: GridCell[] = [];
  for (const [key, between] of pairs) {
    const [a, b] = key.split(':').map(Number);
    cells.push({row: a, column: b, links: between}, {row: b, column: a, links: between});
  }
  cells.sort((x, y) => x.row - y.row || x.column - y.column);
  return {parties, cells};
}
