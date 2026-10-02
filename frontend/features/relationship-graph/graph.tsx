'use client';
// The vis-network drawing of the shown relationships (issue #39 wiring).
// Nodes are the loaded entities that appear as an endpoint of a shown
// relationship; clicking a node opens its dossier, clicking an edge opens
// the relationship detail. No evidence status is passed, so every node and
// edge uses the component's neutral "unknown" styling -- the graph does not
// infer evidentiary status. vis-network is loaded on demand, client-side
// only, so it is not part of the page's initial JavaScript bundle.
import dynamic from 'next/dynamic';
import type {ReactElement} from 'react';

import type {EntityOut, RelationshipEndpointOut, RelationshipOut} from '../../lib/generated/types.gen';

const EntityGraph = dynamic(() => import('../../components/entity-graph').then(m => m.EntityGraph), {ssr: false, loading: () => <p className="muted">Loading graph…</p>});

/** A relationship whose two ends are known: the only kind the graph can draw. */
export type GraphEdge = RelationshipOut & {source: RelationshipEndpointOut; target: RelationshipEndpointOut};

export function withEnds(r: RelationshipOut): r is GraphEdge {
  return Boolean(r.source && r.target);
}

type Props = {
  relationships: GraphEdge[];
  entities: EntityOut[];
  onNode: (id: string) => void;
  onEdge: (r: GraphEdge) => void;
};

export function Graph({relationships, entities, onNode, onEdge}: Props): ReactElement {
  const ids = Array.from(new Set(relationships.flatMap(r => [r.source.id, r.target.id])));
  const nodes = ids.map(id => entities.find(e => e.id === id)).filter((e): e is EntityOut => Boolean(e));
  if (!nodes.length) return <div className="muted">No relationships match the current filter.</div>;
  const known = new Set(nodes.map(n => n.id));
  const shown = relationships.filter(r => known.has(r.source.id) && known.has(r.target.id));
  return <EntityGraph height={420}
    nodes={nodes.map(n => ({id: n.id, label: n.caption, schema: n.schema, title: `${n.caption} · ${n.schema}`}))}
    edges={shown.map(r => ({id: r.id, from: r.source.id, to: r.target.id, label: r.schema, title: `${r.source.caption} → ${r.target.caption} · ${r.schema}`}))}
    onNodeClick={onNode}
    onEdgeClick={id => { const edge = shown.find(r => r.id === id); if (edge) onEdge(edge); }}/>;
}
