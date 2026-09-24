'use client';

// Issue #39: reusable interactive entity-relationship graph on vis-network.
// Not wired into any existing page -- per the issue's own "out of scope"
// note, that integration is separate follow-on work.
//
// DataSet reactivity: nodes/edges DataSets are created once (in a ref) and
// kept in sync with the `nodes`/`edges` props via diff-and-update on every
// change, rather than tearing down and recreating the vis Network -- that
// preserves the user's current pan/zoom/drag layout across data refreshes.
//
// Physics: runs only long enough to stabilize the initial layout, then is
// turned off (`stabilizationIterationsDone`) so the graph stops jittering,
// while drag/zoom/pan interaction stays enabled throughout.
import * as React from 'react';
import {useEffect, useRef} from 'react';
import {DataSet} from 'vis-data';
import {Network} from 'vis-network';
import type {Edge as VisEdge, Node as VisNode, Options as VisOptions} from 'vis-network';

import type {EntityGraphEdge, EntityGraphNode, EvidenceStatus} from '@/lib/entity-graph-types';

export type EntityGraphProps = {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  height?: number;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
};

// Color encoding for TAS-style evidentiary status. Keyed off the existing
// shadcn HSL design tokens (app/globals.css) where one maps cleanly;
// statuses with no existing token get an explicit, clearly-labeled color
// here rather than inventing new global CSS variables for a single
// standalone component.
const STATUS_COLOR: Record<EvidenceStatus, {border: string; background: string; dashed?: boolean}> = {
  documented: {border: 'hsl(228 100% 76%)', background: 'hsl(224 39% 18%)'}, // --primary / --secondary
  corroborated: {border: '#3fbf7f', background: '#173322'}, // verified-green: independently supported
  alleged: {border: 'hsl(0 72% 51%)', background: '#3a1414'}, // --destructive
  inferred: {border: '#c9a227', background: '#332c11', dashed: true}, // amber, dashed: not directly stated
  hypothesized: {border: '#c9a227', background: '#241f33', dashed: true},
  contested: {border: 'hsl(0 72% 51%)', background: '#3a1414', dashed: true}, // destructive + dashed: disputed
  unknown: {border: 'hsl(223 28% 74%)', background: 'hsl(222 43% 12%)'}, // --muted-foreground / --card
};

function statusColor(status: EvidenceStatus | undefined): {border: string; background: string; dashed?: boolean} {
  return STATUS_COLOR[status ?? 'unknown'];
}

function toVisNode(node: EntityGraphNode): VisNode {
  const color = statusColor(node.status);
  return {
    id: node.id,
    label: node.schema ? `${node.label}\n${node.schema}` : node.label,
    title: node.title ?? node.label,
    shape: 'box',
    color: {border: color.border, background: color.background, highlight: color},
    font: {color: '#e7ecff'},
  };
}

function toVisEdge(edge: EntityGraphEdge): VisEdge {
  const color = statusColor(edge.status);
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edge.label,
    title: edge.title ?? edge.label,
    color: {color: color.border, highlight: color.border},
    dashes: Boolean(color.dashed),
    arrows: 'to',
    font: {color: '#aebcf3', strokeWidth: 0},
  };
}

/** Upserts every incoming item and removes any DataSet item whose id is no
 * longer present, without ever clearing the whole DataSet (which would
 * flash/reset vis-network's internal state for unchanged items). Two
 * concrete (non-generic) helpers rather than one generic<T>: vis-data's
 * DataSet<T>.update() wants DeepPartial<T>[] and IdType (string|number),
 * which a shared `T extends {id: string}` constraint can't satisfy for
 * both vis-network's Node and Edge types at once. */
function syncNodeDataSet(dataset: DataSet<VisNode>, items: VisNode[]): void {
  const incomingIds = new Set(items.map((item) => String(item.id)));
  const staleIds = dataset.getIds().filter((id) => !incomingIds.has(String(id)));
  if (staleIds.length > 0) {
    dataset.remove(staleIds);
  }
  if (items.length > 0) {
    dataset.update(items);
  }
}

function syncEdgeDataSet(dataset: DataSet<VisEdge>, items: VisEdge[]): void {
  const incomingIds = new Set(items.map((item) => String(item.id)));
  const staleIds = dataset.getIds().filter((id) => !incomingIds.has(String(id)));
  if (staleIds.length > 0) {
    dataset.remove(staleIds);
  }
  if (items.length > 0) {
    dataset.update(items);
  }
}

const BASE_OPTIONS: VisOptions = {
  autoResize: true,
  interaction: {dragNodes: true, dragView: true, zoomView: true, hover: true},
  physics: {
    enabled: true,
    stabilization: {iterations: 200},
    barnesHut: {gravitationalConstant: -8000, springLength: 140, springConstant: 0.04},
  },
  edges: {smooth: {enabled: true, type: 'dynamic', roundness: 0.5}},
};

export function EntityGraph({nodes, edges, height = 480, onNodeClick, onEdgeClick}: EntityGraphProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDataSetRef = useRef<DataSet<VisNode> | null>(null);
  const edgesDataSetRef = useRef<DataSet<VisEdge> | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  onNodeClickRef.current = onNodeClick;
  onEdgeClickRef.current = onEdgeClick;

  useEffect(() => {
    if (!containerRef.current) return;
    const nodesDataSet = new DataSet<VisNode>(nodes.map(toVisNode));
    const edgesDataSet = new DataSet<VisEdge>(edges.map(toVisEdge));
    nodesDataSetRef.current = nodesDataSet;
    edgesDataSetRef.current = edgesDataSet;

    const network = new Network(containerRef.current, {nodes: nodesDataSet, edges: edgesDataSet}, BASE_OPTIONS);
    networkRef.current = network;

    network.once('stabilizationIterationsDone', () => {
      network.setOptions({physics: {enabled: false}});
    });
    network.on('click', (event: {nodes: string[]; edges: string[]}) => {
      if (event.nodes.length > 0) {
        onNodeClickRef.current?.(String(event.nodes[0]));
      } else if (event.edges.length > 0) {
        onEdgeClickRef.current?.(String(event.edges[0]));
      }
    });

    return () => {
      network.destroy();
      networkRef.current = null;
      nodesDataSetRef.current = null;
      edgesDataSetRef.current = null;
    };
    // Only re-initialize the Network on mount/unmount; node/edge updates
    // flow through the DataSet-sync effects below instead of a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!nodesDataSetRef.current) return;
    syncNodeDataSet(nodesDataSetRef.current, nodes.map(toVisNode));
  }, [nodes]);

  useEffect(() => {
    if (!edgesDataSetRef.current) return;
    syncEdgeDataSet(edgesDataSetRef.current, edges.map(toVisEdge));
  }, [edges]);

  return <div ref={containerRef} className="entity-graph" style={{height, width: '100%'}} data-testid="entity-graph" />;
}
