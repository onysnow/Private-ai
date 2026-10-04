'use client';

// The relationship network, drawn with Sigma.js (WebGL) over a graphology
// graph (visuals pass 4; ADR-0005 line 3: Sigma.js replaces vis-network,
// which was two major versions behind). The research doc picked Sigma for
// networks of thousands of nodes; it is used for every network so the app
// has one network library and one look.
//
// Layout: lib/network-layout.ts (each linked group laid out with
// ForceAtlas2 from a circle, deterministic, turned level, spaced with
// Noverlap so names do not meet, the groups packed in rows), in pixels:
// Sigma draws it at that scale (autoRescale off) and zooms out only when it
// does not fit, and the drawing is no taller than it needs. It is computed
// again only when the parties, links or the box's shape change. The camera
// (pan and zoom) is the reporter's and survives a change of data.
//
// Each party's name is written centred under its dot, over a halo of the
// background (the halo cartographers put round map labels) so a link
// passing behind it does not cut through the letters. A dot's area grows
// with the party's number of links (radius by the square root), so the
// parties at the centre of the network stand out. What a party is -- a
// person, a company or organisation, a vessel, an aircraft, a property --
// is a pictogram in the dot (Lucide icons, ISC licence): colour already
// says the evidentiary status, and a second category needs a second
// channel (shape), not a second colour scheme. Two or more links between the
// same two parties are drawn as curves side by side (@sigma/edge-curve)
// rather than on top of each other.
//
// Evidentiary status (TAS-style, from the caller; the graph never infers
// it) is drawn as the node's fill and border, and a tentative status
// (inferred, hypothesized, contested) also as a second ring inside the
// border: WebGL draws no dashed borders, and colour must not be the only
// cue (design rule 12). On a link, a tentative status is a thinner line.
//
// Interaction: click a party or a link (the callers open its dossier or its
// relationship); hovering a party dims everything not linked to it, writes
// the kind of each of its links, and names it with its schema under the
// drawing; hovering a link writes its kind and names it under the drawing.
import * as React from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type Graph from 'graphology';
import Sigma from 'sigma';
import {EdgeArrowProgram, createNodeCompoundProgram} from 'sigma/rendering';
import type {NodeHoverDrawingFunction, NodeLabelDrawingFunction} from 'sigma/rendering';
import {createNodeBorderProgram} from '@sigma/node-border';
import {createNodeImageProgram} from '@sigma/node-image';
import {EdgeCurvedArrowProgram, indexParallelEdgesIndex} from '@sigma/edge-curve';

import type {EntityGraphEdge, EntityGraphNode, EvidenceStatus} from '@/lib/entity-graph-types';
import {countCrossings, layoutNetwork, networkGraph} from '@/lib/network-layout';
import type {Point} from '@/lib/network-layout';
import {PICTOGRAMS, PICTOGRAM_NAMES, pictogramFor} from '@/lib/network-pictograms';
import type {Pictogram} from '@/lib/network-pictograms';
import {Building, House, Plane, Ship, User} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

// The same Lucide shapes as the pictograms in the dots (lib/network-pictograms.ts).
const KEY_ICONS: Record<Pictogram, LucideIcon> = {person: User, organisation: Building, vessel: Ship, aircraft: Plane, property: House};

export type EntityGraphProps = {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  height?: number;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  /** Told the places and how many links cross each time the drawing is laid out (rule 18). */
  onLayout?: (drawn: {positions: Record<string, Point>, crossings: number}) => void;
};

type StatusStyle = {border: string; background: string; tentative?: boolean};

// The app's Dark Academia tokens (app/globals.css), as in the previous
// drawing, written as hex: Sigma's colour parser reads hex and rgb(a), not
// hsl (an hsl colour came out black).
const STATUS_STYLE: Record<EvidenceStatus, StatusStyle> = {
  documented: {border: '#b78b34', background: '#39180e'},     // --primary gold on a --secondary-hue dark
  corroborated: {border: '#34b28c', background: '#152822'},   // brightened --accent forest green
  alleged: {border: '#89352a', background: '#2f120e'},        // --destructive brick red
  inferred: {border: '#d4a154', background: '#2b2112', tentative: true},       // --ring gold
  hypothesized: {border: '#d4a154', background: '#1a2328', tentative: true},   // --ring gold on --card
  contested: {border: '#89352a', background: '#2f120e', tentative: true},      // --destructive
  unknown: {border: '#927e5d', background: '#1a2328'},        // --muted-foreground on --card
};
const LABEL_COLOUR = '#caaf9c';     // --da-parchment
const HALO_COLOUR = '#1a2328';      // --card, the drawing's background
const DIMMED = '#313a3f';
// The app's body font (app/globals.css), so names read as the page does.
const LABEL_FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';
const LABEL_PX = 13;
const EDGE_LABEL_PX = 11;
// The smallest a name is written when the drawing is zoomed out to fit
// (10 px: the smallest text the app uses elsewhere, text-xs is 12).
const MIN_LABEL_PX = 10;
// A dot's radius in pixels: MIN for a party with one link, growing with the
// square root of its links (so its area grows with them), up to MAX.
const MIN_RADIUS = 10;
const MAX_RADIUS = 20;
// The drawing is never shorter than this, in pixels.
const MIN_HEIGHT = 200;

/** How wide a name is written, in pixels: measured with the label's font
 * where a canvas is to hand, else the width of 0.6 em a character (the
 * estimate render/map.mjs uses for place names). */
export function labelWidth(text: string): number {
  if (typeof OffscreenCanvas !== 'undefined') {
    const context = new OffscreenCanvas(1, 1).getContext('2d');
    if (context) { context.font = `${LABEL_PX}px ${LABEL_FONT}`; return context.measureText(text).width; }
  }
  return text.length * LABEL_PX * 0.6;
}

export function radiusFor(links: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + 2.5 * Math.sqrt(Math.max(0, links - 1)));
}

export function statusStyle(status: EvidenceStatus | undefined): StatusStyle {
  return STATUS_STYLE[status ?? 'unknown'];
}

/** The graphology graph Sigma draws: the layout's places plus each party's
 * and link's look. Exported for the tests, which cannot run WebGL. */
export function drawnGraph(nodes: EntityGraphNode[], edges: EntityGraphEdge[], aspect = 16 / 9): {graph: Graph, positions: Record<string, Point>, size: {width: number, height: number}, reach: Reach[]} {
  const graph = networkGraph(nodes.map(n => ({id: n.id, label: n.label})), edges.map(e => ({id: e.id, from: e.from, to: e.to, label: e.label})));
  const radius = new Map(graph.mapNodes(id => [id, radiusFor(graph.degree(id))]));
  // The room a party needs: its dot, and its name centred under it.
  const footprint = new Map(graph.mapNodes((id, a) => {
    const r = radius.get(id) as number;
    return [id, Math.max(r + 4, labelWidth(String(a.label)) / 2 + 4, r + 4 + LABEL_PX * 1.3)];
  }));
  const positions = layoutNetwork(graph, {aspect, footprint: id => footprint.get(id) as number});
  const byNode = new Map(nodes.map(n => [n.id, n]));
  graph.forEachNode(id => {
    const node = byNode.get(id) as EntityGraphNode;
    const style = statusStyle(node.status);
    const pictogram = pictogramFor(node.schema);
    graph.mergeNodeAttributes(id, {
      label: node.label, size: radius.get(id), color: style.background, borderColor: style.border,
      // The inner ring: the border's colour for a tentative status, else the fill (no ring shows).
      ringColor: style.tentative ? style.border : style.background,
      image: pictogram ? PICTOGRAMS[pictogram] : undefined, pictoColor: style.border, kind: pictogram ?? 'other',
      title: nodeTitle(node),
    });
  });
  const byEdge = new Map(edges.map(e => [e.id, e]));
  graph.forEachEdge(id => {
    const edge = byEdge.get(id) as EntityGraphEdge;
    const style = statusStyle(edge.status);
    const ends = `${byNode.get(edge.from)?.label ?? edge.from} → ${byNode.get(edge.to)?.label ?? edge.to}`;
    graph.mergeEdgeAttributes(id, {label: edge.label ?? '', color: style.border, size: style.tentative ? 1 : 2, type: 'arrow',
      title: edge.title ?? [ends, edge.label].filter(Boolean).join(' · ')});
  });
  // Links between the same two parties: curved side by side, as in
  // @sigma/edge-curve's parallel-edges example.
  indexParallelEdgesIndex(graph);
  graph.forEachEdge((id, a) => {
    const index = a.parallelIndex as number | null, max = a.parallelMaxIndex as number | null;
    if (typeof index === 'number' && typeof max === 'number') {
      // Index over its largest: links one way spread to both sides of the
      // straight line; a link each way (index 1 of 1) bends to its own side.
      graph.mergeEdgeAttributes(id, {type: 'curved', curvature: (CURVATURE * index) / (max || 1)});
    }
  });
  // Each party about the centre of the dots, where Sigma centres the view:
  // how far its dot is, and how far its name and dot reach round it.
  const xs = Object.values(positions).map(p => p.x), ys = Object.values(positions).map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach: Reach[] = graph.mapNodes((id, a) => ({
    dx: Math.abs(positions[id].x - cx), dy: Math.abs(positions[id].y - cy),
    radius: radius.get(id) as number, halfName: labelWidth(String(a.label)) / 2,
  }));
  return {graph, positions, reach, size: viewSize(reach, 1)};
}

/** A party's name, schema and any further detail, each said once. */
export function nodeTitle(node: EntityGraphNode): string {
  const parts = [node.label, node.schema].filter(Boolean) as string[];
  const said = parts.join(' · ');
  return node.title && node.title !== node.label && node.title !== said ? `${said} · ${node.title}` : said;
}

const CURVATURE = 0.25;   // @sigma/edge-curve DEFAULT_EDGE_CURVATURE

/** A party about the drawing's centre: its dot's offset and what reaches round it. */
export type Reach = {dx: number; dy: number; radius: number; halfName: number};

/** The names' size when the view is zoomed out by `ratio`: smaller by as
 * much, so they keep the room the layout gave them, down to MIN_LABEL_PX. */
export function labelPxAt(ratio: number): number {
  return Math.max(MIN_LABEL_PX, LABEL_PX / Math.max(1, ratio));
}

/** The drawing's size on screen, zoomed out by `ratio`: each dot with its
 * name, as wide as the wider of the two and as tall as the dot plus the
 * name under it, on either side of the centre. */
export function viewSize(reach: Reach[], ratio: number): {width: number, height: number} {
  const name = labelPxAt(ratio) / LABEL_PX;
  let halfWidth = 0, halfHeight = 0;
  for (const p of reach) {
    halfWidth = Math.max(halfWidth, p.dx / ratio + Math.max(p.radius, p.halfName * name) + 4);
    halfHeight = Math.max(halfHeight, p.dy / ratio + p.radius + 4 + labelPxAt(ratio) * 1.3);
  }
  return {width: 2 * halfWidth, height: 2 * halfHeight};
}

/** How far to zoom out (1: not at all) for the whole drawing, names
 * included, to fit a box: the smallest ratio that fits, found by halving. */
export function fitRatio(reach: Reach[], width: number, height: number): number {
  const fits = (ratio: number) => { const size = viewSize(reach, ratio); return size.width <= width && size.height <= height; };
  if (fits(1)) return 1;
  let low = 1, high = 2;
  while (!fits(high) && high < 1024) { low = high; high *= 2; }
  for (let i = 0; i < 30; i += 1) { const mid = (low + high) / 2; if (fits(mid)) high = mid; else low = mid; }
  return high;
}

/** A party's name, centred under its dot over a halo of the background. */
const drawLabelBelow: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return;
  const size = settings.labelSize;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  const y = data.y + data.size + 4;
  context.lineJoin = 'round';
  context.lineWidth = 4;
  context.strokeStyle = HALO_COLOUR;
  context.strokeText(data.label, data.x, y);
  context.fillStyle = settings.labelColor.color ?? LABEL_COLOUR;
  context.fillText(data.label, data.x, y);
  context.textAlign = 'start';
  context.textBaseline = 'alphabetic';
};

/** A hovered party: a ring round its dot, and its name as at rest. */
const drawHoverBelow: NodeHoverDrawingFunction = (context, data, settings) => {
  context.beginPath();
  context.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  context.lineWidth = 2;
  context.strokeStyle = LABEL_COLOUR;
  context.stroke();
  drawLabelBelow(context, data, settings);
};

const BorderedNode = createNodeBorderProgram({
  borders: [
    {size: {value: 0.2}, color: {attribute: 'borderColor'}},
    {size: {value: 0.1}, color: {attribute: 'color'}},
    {size: {value: 0.14}, color: {attribute: 'ringColor'}},
    {size: {fill: true}, color: {attribute: 'color'}},
  ],
});
// The pictogram drawn in the border colour inside the rings (padding: the
// share of the dot left clear round it).
const Pictogram = createNodeImageProgram({drawingMode: 'color', colorAttribute: 'pictoColor', padding: 0.24, keepWithinCircle: true,
  size: {mode: 'force', value: 96}});
const PartyNode = createNodeCompoundProgram([BorderedNode, Pictogram], drawLabelBelow, drawHoverBelow);

export function EntityGraph({nodes, edges, height = 480, onNodeClick, onEdgeClick, onLayout}: EntityGraphProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  // The reporter's pan and zoom, kept across a new drawing of new data.
  const cameraRef = useRef<ReturnType<ReturnType<Sigma['getCamera']>['getState']> | null>(null);
  const handlers = useRef({onNodeClick, onEdgeClick});
  handlers.current = {onNodeClick, onEdgeClick};
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hovered;
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const hoveredLinkRef = useRef<string | null>(null);
  hoveredLinkRef.current = hoveredLink;

  // Laid out again only when what is drawn changes, not when a caller
  // passes equal arrays anew (the camera and the places stay put).
  const signature = JSON.stringify([nodes, edges]);
  // The shape of the box the drawing has, to the nearest tenth (a few pixels
  // of resizing do not lay it out again).
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    setBoxWidth(box.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setBoxWidth(entries[0].contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const aspect = boxWidth > 0 ? Math.round((boxWidth / height) * 10) / 10 : 16 / 9;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawn = useMemo(() => drawnGraph(nodes, edges, aspect), [signature, aspect]);
  // No taller than the drawing needs, up to the height given -- or twice it
  // in a box taller than it is wide (a phone), where the page scrolls down
  // more easily than the drawing can be shrunk.
  // When the box is narrower than the drawing, the height it needs is the
  // height at the zoom that fits its width.
  const widthRatio = boxWidth > 0 ? fitRatio(drawn.reach, boxWidth, Infinity) : 1;
  const drawnHeight = Math.round(Math.min(aspect < 1 ? height * 2 : height, Math.max(MIN_HEIGHT, viewSize(drawn.reach, widthRatio).height + 24)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const crossings = useMemo(() => countCrossings(edges.map(e => ({id: e.id, from: e.from, to: e.to})), drawn.positions), [drawn]);

  useEffect(() => {
    onLayout?.({positions: drawn.positions, crossings});
    // Told once per layout; a new callback alone is not a new layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, crossings]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // How far the view must zoom out for the whole drawing to show. Names
    // are made smaller by as much, so they keep the room the layout gave
    // them, down to MIN_LABEL_PX; past that the reporter zooms in to read.
    const fit = fitRatio(drawn.reach, Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    const renderer = new Sigma(drawn.graph, container, {
      renderEdgeLabels: true,
      enableEdgeEvents: true,
      defaultNodeType: 'party',
      defaultEdgeType: 'arrow',
      nodeProgramClasses: {party: PartyNode},
      edgeProgramClasses: {arrow: EdgeArrowProgram, curved: EdgeCurvedArrowProgram},
      // The layout is in pixels: drawn at that scale, not stretched to fill.
      autoRescale: false,
      labelFont: LABEL_FONT,
      labelSize: labelPxAt(fit),
      labelWeight: 'normal',
      labelColor: {color: LABEL_COLOUR},
      edgeLabelFont: LABEL_FONT,
      edgeLabelSize: Math.max(MIN_LABEL_PX, EDGE_LABEL_PX / fit),
      edgeLabelColor: {color: LABEL_COLOUR},
      labelRenderedSizeThreshold: 0,
      // Every party's name is written (Sigma otherwise keeps one per crowded patch).
      labelDensity: 1,
      labelGridCellSize: 1,
      zIndex: true,
      nodeReducer: (id, attrs) => {
        const focus = hoveredRef.current;
        if (!focus || focus === id || drawn.graph.areNeighbors(focus, id)) return {...attrs, zIndex: focus === id ? 1 : 0};
        return {...attrs, color: DIMMED, borderColor: DIMMED, ringColor: DIMMED, pictoColor: DIMMED, label: '', zIndex: 0};
      },
      edgeReducer: (id, attrs) => {
        const focus = hoveredRef.current;
        if (focus && drawn.graph.hasExtremity(id, focus)) return attrs;
        if (focus) return {...attrs, color: DIMMED, label: ''};
        // A link's kind is written only while it or one of its parties is
        // pointed at: written on every link, the kinds cover the names.
        return hoveredLinkRef.current === id ? attrs : {...attrs, label: ''};
      },
    });
    if (cameraRef.current) renderer.getCamera().setState(cameraRef.current);
    // Zoomed out only as far as it takes for the whole drawing to show.
    else if (fit > 1) renderer.getCamera().setState({ratio: fit});
    // The view as drawn: kept for the next drawing only if the reporter has
    // moved it since (a drawing laid out anew for a new box shape is fitted anew).
    const shown = JSON.stringify(renderer.getCamera().getState());
    renderer.on('clickNode', ({node}) => handlers.current.onNodeClick?.(node));
    renderer.on('clickEdge', ({edge}) => handlers.current.onEdgeClick?.(edge));
    renderer.on('enterNode', ({node}) => setHovered(node));
    renderer.on('leaveNode', () => setHovered(null));
    renderer.on('enterEdge', ({edge}) => setHoveredLink(edge));
    renderer.on('leaveEdge', () => setHoveredLink(null));
    sigmaRef.current = renderer;
    return () => {
      const state = renderer.getCamera().getState();
      if (cameraRef.current || JSON.stringify(state) !== shown) cameraRef.current = state;
      renderer.kill();
      if (sigmaRef.current === renderer) sigmaRef.current = null;
    };
  }, [drawn]);

  useEffect(() => { sigmaRef.current?.refresh(); }, [hovered, hoveredLink]);

  const title = hovered && drawn.graph.hasNode(hovered) ? String(drawn.graph.getNodeAttribute(hovered, 'title') ?? '')
    : hoveredLink && drawn.graph.hasEdge(hoveredLink) ? String(drawn.graph.getEdgeAttribute(hoveredLink, 'title') ?? '') : '';
  // The key: the pictograms this drawing uses, and what a dot's size says.
  const kinds = (Object.keys(PICTOGRAM_NAMES) as Pictogram[]).filter(kind => drawn.graph.someNode((_id, a) => a.kind === kind));
  return <div ref={boxRef}>
    <div ref={containerRef} className="entity-graph" style={{height: drawnHeight, width: '100%'}} data-testid="entity-graph"
      role="img" aria-label={`Network of ${nodes.length} parties and ${edges.length} links; the connection grid and the relationship list hold the same links as text.`}/>
    <p className="muted text-xs" aria-live="polite" style={{minHeight: '1.25rem'}}>{title}</p>
    <p className="muted text-xs" data-testid="graph-key" style={{display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center'}}>
      {kinds.map(kind => { const Icon = KEY_ICONS[kind]; return <span key={kind} style={{display: 'inline-flex', gap: 4, alignItems: 'center'}}>
        <Icon aria-hidden size={14}/>{PICTOGRAM_NAMES[kind]}</span>; })}
      <span>A bigger dot has more links.</span>
    </p>
  </div>;
}
