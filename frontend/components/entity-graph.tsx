'use client';

// The relationship network, drawn with Sigma.js (WebGL) over a graphology
// graph (visuals pass 4; ADR-0005 line 3: Sigma.js replaces vis-network,
// which was two major versions behind). The research doc picked Sigma for
// networks of thousands of nodes; it is used for every network so the app
// has one network library and one look.
//
// Layout: lib/network-layout.ts (ForceAtlas2 from a circle, deterministic),
// computed again only when the parties or links change. The camera (pan
// and zoom) is the reporter's and survives a change of data.
//
// Evidentiary status (TAS-style, from the caller; the graph never infers
// it) is drawn as the node's fill and border, and a tentative status
// (inferred, hypothesized, contested) also as a second ring inside the
// border: WebGL draws no dashed borders, and colour must not be the only
// cue (design rule 12). On a link, a tentative status is a thinner line.
//
// Interaction: click a party or a link (the callers open its dossier or its
// relationship); hovering a party dims everything not linked to it, and
// names it with its schema under the drawing.
import * as React from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type Graph from 'graphology';
import Sigma from 'sigma';
import {EdgeArrowProgram} from 'sigma/rendering';
import {createNodeBorderProgram} from '@sigma/node-border';

import type {EntityGraphEdge, EntityGraphNode, EvidenceStatus} from '@/lib/entity-graph-types';
import {countCrossings, layoutNetwork, networkGraph} from '@/lib/network-layout';
import type {Point} from '@/lib/network-layout';

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
const DIMMED = '#313a3f';
const NODE_SIZE = 10;
// Past this many links their names are written only beside the hovered
// party's links: more, and they cover each other.
const EDGE_LABEL_LIMIT = 8;

export function statusStyle(status: EvidenceStatus | undefined): StatusStyle {
  return STATUS_STYLE[status ?? 'unknown'];
}

/** The graphology graph Sigma draws: the layout's places plus each party's
 * and link's look. Exported for the tests, which cannot run WebGL. */
export function drawnGraph(nodes: EntityGraphNode[], edges: EntityGraphEdge[]): {graph: Graph, positions: Record<string, Point>} {
  const graph = networkGraph(nodes.map(n => ({id: n.id, label: n.label})), edges.map(e => ({id: e.id, from: e.from, to: e.to, label: e.label})));
  const positions = layoutNetwork(graph);
  const byNode = new Map(nodes.map(n => [n.id, n]));
  graph.forEachNode(id => {
    const node = byNode.get(id) as EntityGraphNode;
    const style = statusStyle(node.status);
    graph.mergeNodeAttributes(id, {
      label: node.label, size: NODE_SIZE, color: style.background, borderColor: style.border,
      // The inner ring: the border's colour for a tentative status, else the fill (no ring shows).
      ringColor: style.tentative ? style.border : style.background,
      title: [node.label, node.schema, node.title && node.title !== node.label ? node.title : null].filter(Boolean).join(' · '),
    });
  });
  const byEdge = new Map(edges.map(e => [e.id, e]));
  graph.forEachEdge(id => {
    const edge = byEdge.get(id) as EntityGraphEdge;
    const style = statusStyle(edge.status);
    graph.mergeEdgeAttributes(id, {label: edge.label ?? '', color: style.border, size: style.tentative ? 1 : 2, type: 'arrow'});
  });
  return {graph, positions};
}

const BorderedNode = createNodeBorderProgram({
  borders: [
    {size: {value: 0.2}, color: {attribute: 'borderColor'}},
    {size: {value: 0.1}, color: {attribute: 'color'}},
    {size: {value: 0.14}, color: {attribute: 'ringColor'}},
    {size: {fill: true}, color: {attribute: 'color'}},
  ],
});

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

  // Laid out again only when what is drawn changes, not when a caller
  // passes equal arrays anew (the camera and the places stay put).
  const signature = JSON.stringify([nodes, edges]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawn = useMemo(() => drawnGraph(nodes, edges), [signature]);
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
    const renderer = new Sigma(drawn.graph, container, {
      renderEdgeLabels: true,
      enableEdgeEvents: true,
      defaultNodeType: 'bordered',
      defaultEdgeType: 'arrow',
      nodeProgramClasses: {bordered: BorderedNode},
      edgeProgramClasses: {arrow: EdgeArrowProgram},
      labelColor: {color: LABEL_COLOUR},
      edgeLabelColor: {color: LABEL_COLOUR},
      labelRenderedSizeThreshold: 0,
      // Every party's name is written (Sigma otherwise keeps one per crowded patch).
      labelDensity: 1,
      labelGridCellSize: 1,
      zIndex: true,
      nodeReducer: (id, attrs) => {
        const focus = hoveredRef.current;
        if (!focus || focus === id || drawn.graph.areNeighbors(focus, id)) return {...attrs, zIndex: focus === id ? 1 : 0};
        return {...attrs, color: DIMMED, borderColor: DIMMED, ringColor: DIMMED, label: '', zIndex: 0};
      },
      edgeReducer: (id, attrs) => {
        const focus = hoveredRef.current;
        if (focus && drawn.graph.hasExtremity(id, focus)) return attrs;
        if (focus) return {...attrs, color: DIMMED, label: ''};
        return drawn.graph.size > EDGE_LABEL_LIMIT ? {...attrs, label: ''} : attrs;
      },
    });
    if (cameraRef.current) renderer.getCamera().setState(cameraRef.current);
    renderer.on('clickNode', ({node}) => handlers.current.onNodeClick?.(node));
    renderer.on('clickEdge', ({edge}) => handlers.current.onEdgeClick?.(edge));
    renderer.on('enterNode', ({node}) => setHovered(node));
    renderer.on('leaveNode', () => setHovered(null));
    sigmaRef.current = renderer;
    return () => {
      cameraRef.current = renderer.getCamera().getState();
      renderer.kill();
      if (sigmaRef.current === renderer) sigmaRef.current = null;
    };
  }, [drawn]);

  useEffect(() => { sigmaRef.current?.refresh(); }, [hovered]);

  const title = hovered && drawn.graph.hasNode(hovered) ? String(drawn.graph.getNodeAttribute(hovered, 'title') ?? '') : '';
  return <div>
    <div ref={containerRef} className="entity-graph" style={{height, width: '100%'}} data-testid="entity-graph"
      role="img" aria-label={`Network of ${nodes.length} parties and ${edges.length} links; the connection grid and the relationship list hold the same links as text.`}/>
    <p className="muted text-xs" aria-live="polite" style={{minHeight: '1.25rem'}}>{title}</p>
  </div>;
}
