'use client';
// The ownership and control chain drawn with React Flow (@xyflow/react, MIT;
// https://reactflow.dev) at the places dagre gives (lib/ownership-layout.ts):
// owners and directors above what they own and direct, as company structure
// charts are drawn. React Flow draws nodes as HTML, so names wrap and stay
// readable at any zoom, and it brings pan, zoom and keyboard focus on nodes.
// The picture is read-only: the records change only through review.
//
// It uses the network's codes (lib/viz-tokens.ts), so a colour means the
// same on a dossier as on the network: a party's ring and icon say what it
// is; an ownership link is amber and says its share, a directorship sage and
// says the role; an ended link is dashed, and a link that closes a circle of
// ownership is marked "circular" in its words. The entity the dossier is
// about has a second, parchment ring.
import {Handle, MarkerType, Position, ReactFlow} from '@xyflow/react';
import type {Edge, Node, NodeProps} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {useMemo} from 'react';
import type {ReactElement} from 'react';

import type {OwnershipChainOut} from '../lib/generated/types.gen';
import {NODE_HEIGHT, NODE_WIDTH, layoutChain} from '../lib/ownership-layout';
import {LINK, PARTY, SWATCH, partyKind} from '../lib/viz-tokens';
import {KIND_ICON} from './network/party-icons';

type PartyData = {caption: string; schema: string; subject: boolean};

// Handles are where links meet a box: in at the top, out at the bottom, and a
// pair on the right for a link that has to run upward (a circle of
// ownership), so it goes round the side instead of over the link it answers.
// Nothing is connected by hand, so the handles are not shown.
const HIDDEN = {opacity: 0, pointerEvents: 'none' as const};

function Party({data}: NodeProps<Node<PartyData>>): ReactElement {
  const kind = partyKind(data.schema);
  const look = PARTY[kind];
  const Icon = KIND_ICON[kind];
  return <>
    <Handle type="target" position={Position.Top} id="in" style={HIDDEN} isConnectable={false}/>
    <div className="oc-party" style={{borderColor: data.subject ? SWATCH.parchment : look.ring, boxShadow: data.subject ? `0 0 0 2px ${SWATCH.card}, 0 0 0 4px ${look.ring}` : undefined}}>
      <span className="oc-dot" style={{background: look.fill, borderColor: look.ring}}>{Icon && <Icon size={14} color={look.ring} strokeWidth={2.2}/>}</span>
      <span className="oc-text"><b>{data.caption}</b><small>{data.subject ? `${look.name} · this dossier` : look.name}</small></span>
    </div>
    <Handle type="source" position={Position.Bottom} id="out" style={HIDDEN} isConnectable={false}/>
    <Handle type="source" position={Position.Right} id="side-out" style={{...HIDDEN, top: '35%'}} isConnectable={false}/>
    <Handle type="target" position={Position.Right} id="side-in" style={{...HIDDEN, top: '65%'}} isConnectable={false}/>
  </>;
}

const NODE_TYPES = {party: Party};

type Props = {
  chain: OwnershipChainOut;
  onParty?: (entityId: string) => void;
};

export function OwnershipDiagram({chain, onParty}: Props): ReactElement {
  const {nodes, edges, height} = useMemo(() => {
    const laid = layoutChain(chain);
    const nodes: Node<PartyData>[] = laid.parties.map(p => ({
      id: p.id, type: 'party', position: {x: p.x, y: p.y}, width: NODE_WIDTH, height: NODE_HEIGHT,
      data: {caption: p.caption ?? p.id, schema: p.schema, subject: p.is_subject},
      ariaLabel: `${p.caption ?? p.id}, ${PARTY[partyKind(p.schema)].name}${p.is_subject ? ', the entity this chain is for' : ''}`,
      draggable: false, connectable: false,
      style: {width: NODE_WIDTH, height: NODE_HEIGHT, padding: 0, border: 0, background: 'transparent'},
    }));
    const edges: Edge[] = laid.links.map(l => {
      const colour = l.schema === 'Ownership' ? LINK.owns.colour : LINK.runs.colour;
      return {
        id: l.id, source: l.source, target: l.target, label: l.label,
        sourceHandle: l.upward ? 'side-out' : 'out', targetHandle: l.upward ? 'side-in' : 'in', type: l.upward ? 'smoothstep' : 'default',
        markerEnd: {type: MarkerType.ArrowClosed, color: colour, width: 14, height: 14, markerUnits: 'userSpaceOnUse'},
        style: {stroke: colour, strokeWidth: 2, strokeDasharray: l.ended ? '6 5' : undefined},
        labelStyle: {fill: SWATCH.ink, fontSize: 11.5, fontWeight: 600},
        labelBgStyle: {fill: SWATCH.card, stroke: colour, strokeWidth: 1},
        labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 10,
        ariaLabel: `${chain.nodes.find(n => n.id === l.source)?.caption ?? l.source} to ${chain.nodes.find(n => n.id === l.target)?.caption ?? l.target}: ${l.schema}, ${l.label}`,
      };
    });
    return {nodes, edges, height: laid.height};
  }, [chain]);

  return <div className="net-view" style={{height: Math.min(Math.max(height + 60, 240), 600)}}
    role="group" aria-label={`Ownership and control chart: ${chain.nodes.length} parties and ${chain.links.length} links`}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} colorMode="dark" fitView fitViewOptions={{padding: 0.12, maxZoom: 1.1}} minZoom={0.2}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable
      onNodeClick={(_event, node) => onParty?.(node.id)}/>
  </div>;
}
