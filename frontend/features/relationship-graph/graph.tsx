'use client';
// The shown relationships as a network (components/entity-graph.tsx, Sigma.js)
// or, past twenty parties, also as a connection grid (design rule 18:
// "Networks over ~20 nodes offer a grid view; crossings counted"). Nodes are
// the loaded entities that appear as an end of a shown relationship;
// clicking a node opens its dossier, clicking a link (or a grid cell) opens
// the relationship. No evidence status is passed, so every node and link
// uses the neutral "unknown" look -- the graph does not infer evidentiary
// status. Sigma is loaded on demand, client-side only, so it is not part of
// the page's first JavaScript.
import dynamic from 'next/dynamic';
import {useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {ConnectionGrid} from '../../components/connection-grid';
import type {EntityOut, RelationshipEndpointOut, RelationshipOut} from '../../lib/generated/types.gen';
import {GRID_THRESHOLD} from '../../lib/network-layout';

const EntityGraph = dynamic(() => import('../../components/entity-graph').then(m => m.EntityGraph), {ssr: false, loading: () => <p className="muted">Loading graph…</p>});

/** A relationship whose two ends are known: the only kind the graph can draw. */
export type GraphEdge = RelationshipOut & {source: RelationshipEndpointOut; target: RelationshipEndpointOut};

export function withEnds(r: RelationshipOut): r is GraphEdge {
  return Boolean(r.source && r.target);
}

/** The crossing count in plain words (rule 18). */
export function crossingsLine(crossings: number, parties: number): string {
  const lines = crossings === 0 ? 'No links cross in this drawing.'
    : crossings === 1 ? '1 pair of links crosses in this drawing.' : `${crossings} pairs of links cross in this drawing.`;
  return parties > GRID_THRESHOLD && crossings > 0 ? `${lines} The connection grid shows the same links without crossings.` : lines;
}

type Props = {
  relationships: GraphEdge[];
  entities: EntityOut[];
  onNode: (id: string) => void;
  onEdge: (r: GraphEdge) => void;
};

export function Graph({relationships, entities, onNode, onEdge}: Props): ReactElement {
  const [view, setView] = useState<'network' | 'grid'>('network');
  const [crossings, setCrossings] = useState<number | null>(null);
  const {nodes, shown} = useMemo(() => {
    const ids = Array.from(new Set(relationships.flatMap(r => [r.source.id, r.target.id])));
    const found = ids.map(id => entities.find(e => e.id === id)).filter((e): e is EntityOut => Boolean(e));
    const known = new Set(found.map(n => n.id));
    return {nodes: found, shown: relationships.filter(r => known.has(r.source.id) && known.has(r.target.id))};
  }, [relationships, entities]);
  const graphNodes = useMemo(() => nodes.map(n => ({id: n.id, label: n.caption, schema: n.schema, title: `${n.caption} · ${n.schema}`})), [nodes]);
  const graphEdges = useMemo(() => shown.map(r => ({id: r.id, from: r.source.id, to: r.target.id, label: r.schema,
    title: `${r.source.caption} → ${r.target.caption} · ${r.schema}`})), [shown]);
  if (!nodes.length) return <div className="muted">No relationships match the current filter.</div>;
  const openLink = (id: string) => { const edge = shown.find(r => r.id === id); if (edge) onEdge(edge); };
  const offerGrid = nodes.length > GRID_THRESHOLD;
  return <div>
    {offerGrid && <div className="actions" role="group" aria-label="How the links are shown">
      <Button size="sm" variant={view === 'network' ? 'default' : 'outline'} aria-pressed={view === 'network'} onClick={() => setView('network')}>Network</Button>
      <Button size="sm" variant={view === 'grid' ? 'default' : 'outline'} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Connection grid</Button>
    </div>}
    {offerGrid && view === 'grid'
      ? <ConnectionGrid nodes={graphNodes.map(n => ({id: n.id, label: n.label}))} links={graphEdges} onLink={openLink}/>
      : <>
        <EntityGraph height={420} nodes={graphNodes} edges={graphEdges} onNodeClick={onNode} onEdgeClick={openLink}
          onLayout={drawn => setCrossings(drawn.crossings)}/>
        {crossings !== null && <p className="muted text-xs" data-testid="graph-crossings">{crossingsLine(crossings, nodes.length)}</p>}
      </>}
  </div>;
}
