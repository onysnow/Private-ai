// Where a relationship network's people and companies sit, and what can be
// said about the drawing (visuals pass 4, networks; ADR-0005 line 3).
//
// The layout is graphology's ForceAtlas2 (Jacomy et al. 2014, the layout
// Gephi and Sigma.js use), started from a circle so the same records always
// give the same picture: ForceAtlas2 run synchronously is deterministic from
// its starting positions. Its settings come from its own `inferSettings`,
// which turns on the Barnes-Hut approximation for large graphs. Each linked
// group is laid out on its own, turned level, spaced so names do not meet
// (Noverlap) and packed in rows (`layoutNetwork` says how). Noverlap moves
// two parties at random only when they sit on the very same spot, which a
// layout started from a circle does not give.
//
// Design rule 18 ("Networks over ~20 nodes offer a grid view; crossings
// counted", design doc "How every chart gets checked"): `countCrossings`
// counts the pairs of links whose straight lines cross in the drawing, and
// `connectionGrid` is the same links as a matrix -- one row per party a link
// runs from and one column per party it runs to, ordered so that parties
// linked to many others come first --
// which never crosses (Ghoniem, Fekete and Castagliola 2004 found matrices
// read better than node-link drawings past about twenty nodes).
import Graph from 'graphology';
import circular from 'graphology-layout/circular';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
import {connectedComponents} from 'graphology-components';

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

/** How a drawing is laid out: the shape of the box it is drawn in, and how
 * much room each party needs around its centre (its dot and its name). */
export type LayoutOptions = {
  /** Width over height of the box the drawing is shown in. */
  aspect?: number;
  /** The radius, in pixels, a party needs kept clear around its centre. */
  footprint?: (id: string) => number;
};

/** The typical length of a link, in pixels, before parties are pushed apart. */
export const LINK_PX = 130;
/** Pixels kept clear between two parties' footprints, and between two groups. */
export const GAP_PX = 14;
const DEFAULT_FOOTPRINT = 40;

/** Each party's place, in pixels of the drawing.
 *
 * 1. The network is split into its connected groups (graphology-components):
 *    laid out together, ForceAtlas2 pushes unlinked groups far apart and
 *    leaves the drawing mostly empty.
 * 2. Each group: a circle in id order, then ForceAtlas2 (deterministic from
 *    the circle), scaled so a typical link is LINK_PX long.
 * 3. Each group is turned so its longest spread (its principal axis) runs
 *    along the box's longer side: left to right in a box wider than it is
 *    tall, top to bottom in a taller one. ForceAtlas2's forces do not depend
 *    on the drawing's rotation, so turning it changes nothing it shows.
 * 4. Noverlap (graphology-layout-noverlap; the Noverlap of Gephi) pushes
 *    apart parties whose footprints -- the dot and the name under it -- meet.
 * 5. The groups are packed in rows, largest first, the rows about as wide as
 *    the box's shape asks (shelf packing, as in Freivalds, Dogrusoz and
 *    Kikusts, "Disconnected graph layout and the polyomino packing
 *    approach", Graph Drawing 2001).
 */
export function layoutNetwork(graph: Graph, options: LayoutOptions = {}): Record<string, Point> {
  const aspect = options.aspect ?? 16 / 9;
  const footprint = options.footprint ?? (() => DEFAULT_FOOTPRINT);
  const groups = connectedComponents(graph).map(ids => [...ids].sort());
  groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const placed = groups.map(ids => layoutGroup(graph, ids, footprint, aspect));
  const offsets = packRows(placed.map(g => g.box), aspect);
  const out: Record<string, Point> = {};
  placed.forEach((group, i) => {
    for (const [id, p] of Object.entries(group.positions)) {
      const point = {x: p.x - group.box.minX + offsets[i].x, y: p.y - group.box.minY + offsets[i].y};
      out[id] = point;
      graph.mergeNodeAttributes(id, point);
    }
  });
  return out;
}

type Box = {minX: number; minY: number; width: number; height: number};

function layoutGroup(graph: Graph, ids: string[], footprint: (id: string) => number, aspect: number): {positions: Record<string, Point>; box: Box} {
  const group = new Graph({multi: true, type: 'directed'});
  for (const id of ids) group.addNode(id);
  for (const id of ids) {
    graph.forEachOutEdge(id, (edge, _attrs, from, to) => { if (!group.hasEdge(edge)) group.addDirectedEdgeWithKey(edge, from, to); });
  }
  let positions: Record<string, Point> = {[ids[0]]: {x: 0, y: 0}};
  if (group.order > 1) {
    circular.assign(group, {scale: 100});
    forceAtlas2.assign(group, {iterations: ITERATIONS, settings: forceAtlas2.inferSettings(group)});
    positions = Object.fromEntries(group.mapNodes((id, a) => [id, {x: a.x as number, y: a.y as number}]));
    positions = turnLevel(positions);
    // In a box taller than it is wide (a phone), the longest spread runs down instead.
    if (aspect < 1) positions = Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, {x: -p.y, y: p.x}]));
    positions = scaleToLinks(positions, group);
    group.forEachNode(id => group.mergeNodeAttributes(id, positions[id]));
    noverlap.assign(group, {
      maxIterations: 300,
      inputReducer: (id, a) => ({x: a.x as number, y: a.y as number, size: footprint(id)}),
      // gridSize 1: every pair is compared; groups here are small, and the
      // README notes it can be faster with few nodes.
      settings: {margin: GAP_PX, ratio: 1, gridSize: 1, expansion: 1.1, speed: 3},
    });
    positions = Object.fromEntries(group.mapNodes((id, a) => [id, {x: a.x as number, y: a.y as number}]));
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [id, p] of Object.entries(positions)) {
    const r = footprint(id);
    minX = Math.min(minX, p.x - r); maxX = Math.max(maxX, p.x + r);
    minY = Math.min(minY, p.y - r); maxY = Math.max(maxY, p.y + r);
  }
  return {positions, box: {minX, minY, width: maxX - minX, height: maxY - minY}};
}

/** The places turned about their centre so their principal axis is level. */
export function turnLevel(positions: Record<string, Point>): Record<string, Point> {
  const points = Object.values(positions);
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const p of points) { xx += (p.x - cx) ** 2; yy += (p.y - cy) ** 2; xy += (p.x - cx) * (p.y - cy); }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  return Object.fromEntries(Object.entries(positions).map(([id, p]) => {
    const x = p.x - cx, y = p.y - cy;
    return [id, {x: x * cos - y * sin, y: x * sin + y * cos}];
  }));
}

/** The places scaled so the median link is LINK_PX long. */
function scaleToLinks(positions: Record<string, Point>, group: Graph): Record<string, Point> {
  const lengths = group.mapEdges((_e, _a, from, to) => Math.hypot(positions[from].x - positions[to].x, positions[from].y - positions[to].y))
    .filter(l => l > 0).sort((a, b) => a - b);
  if (!lengths.length) return positions;
  const factor = LINK_PX / lengths[Math.floor(lengths.length / 2)];
  return Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, {x: p.x * factor, y: p.y * factor}]));
}

/** Where each box goes: left to right in rows about sqrt(area x aspect) wide. */
export function packRows(boxes: {width: number; height: number}[], aspect: number): Point[] {
  const area = boxes.reduce((s, b) => s + (b.width + GAP_PX) * (b.height + GAP_PX), 0);
  const rowWidth = Math.max(...boxes.map(b => b.width), Math.sqrt(area * aspect));
  const out: Point[] = [];
  let x = 0, y = 0, rowHeight = 0;
  for (const box of boxes) {
    if (x > 0 && x + box.width > rowWidth) { x = 0; y += rowHeight + GAP_PX; rowHeight = 0; }
    out.push({x, y});
    x += box.width + GAP_PX;
    rowHeight = Math.max(rowHeight, box.height);
  }
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
 * (then by name). A link sits in the row of the party it runs from and the
 * column of the party it runs to, as in a directed graph's adjacency matrix,
 * so the grid keeps each link's direction (who owns, who paid); links
 * between the same two parties the same way share a cell. */
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
  const pairs = new Map<string, GridCell>();
  for (const l of kept) {
    const row = index.get(l.from) as number, column = index.get(l.to) as number;
    const key = `${row}:${column}`;
    const cell = pairs.get(key) ?? {row, column, links: []};
    cell.links.push(l);
    pairs.set(key, cell);
  }
  const cells = [...pairs.values()].sort((x, y) => x.row - y.row || x.column - y.column);
  return {parties, cells};
}
