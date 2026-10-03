// The ownership and control chain laid out as a corporate structure chart
// (backend app/services/ownership_chain.py; visuals pass 4, "Ownership and
// control chain"). Owners are drawn above what they own and directors above
// the company they sit on, the way company structure charts are drawn (owner
// at the top, arrows down to the holdings). dagre (MIT, the layered layout
// React Flow's own examples use: https://reactflow.dev/examples/layout/dagre)
// places the parties in ranks and orders each rank to cut the crossings;
// every link points down, so the ranks follow ownership. A circle of
// ownership is still drawn: dagre turns one of its links round to lay the
// rest out, and the chain marks those links "circular".
import dagre from '@dagrejs/dagre';

import type {OwnershipChainLinkOut, OwnershipChainNodeOut, OwnershipChainOut} from './generated/types.gen';

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 56;

export type PlacedParty = OwnershipChainNodeOut & {x: number; y: number};
/** `upward`: dagre had to place the owner at or below what it owns (a circle);
 * such a link is drawn round the side so it does not run over the link it answers. */
export type DrawnLink = OwnershipChainLinkOut & {label: string; upward: boolean};

/** What a link says, in words: the share or the role, and whether it ended or runs in a circle. */
export function linkLabel(link: OwnershipChainLinkOut): string {
  const parts: string[] = [];
  if (link.schema === 'Ownership') parts.push(link.percentage === null || link.percentage === undefined ? 'share not stated' : `${formatShare(link.percentage)}`);
  else parts.push(link.role || 'director');
  if (link.ended) parts.push(link.end_date ? `ended ${link.end_date}` : 'ended');
  if (link.circular) parts.push('circular');
  return parts.join(' · ');
}

/** 40 -> "40%", 12.5 -> "12.5%". */
export function formatShare(percentage: number): string {
  return `${Number.isInteger(percentage) ? percentage : percentage.toFixed(2).replace(/0+$/, '')}%`;
}

/** Top-left positions for every party, owners above holdings. */
export function layoutChain(chain: OwnershipChainOut): {parties: PlacedParty[]; links: DrawnLink[]; width: number; height: number} {
  const g = new dagre.graphlib.Graph({multigraph: true});
  // ranksep leaves room for the link labels between ranks; nodesep for the boxes beside each other.
  g.setGraph({rankdir: 'TB', ranksep: 70, nodesep: 30, marginx: 10, marginy: 10});
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of chain.nodes) g.setNode(node.id, {width: NODE_WIDTH, height: NODE_HEIGHT});
  const known = new Set(chain.nodes.map(n => n.id));
  const links = chain.links.filter(l => known.has(l.source) && known.has(l.target));
  for (const link of links) g.setEdge(link.source, link.target, {}, link.id);
  dagre.layout(g);
  const parties = chain.nodes.map(node => {
    const at = g.node(node.id);
    // dagre gives the centre; React Flow places a node by its top-left corner.
    return {...node, x: at.x - NODE_WIDTH / 2, y: at.y - NODE_HEIGHT / 2};
  });
  const y = new Map(parties.map(p => [p.id, p.y]));
  const graph = g.graph();
  return {parties, links: links.map(l => ({...l, label: linkLabel(l), upward: (y.get(l.source) ?? 0) >= (y.get(l.target) ?? 0)})),
    width: graph.width ?? 0, height: graph.height ?? 0};
}
