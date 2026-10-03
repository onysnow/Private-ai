'use client';
// The ownership and control chain drawn with React Flow (@xyflow/react, MIT;
// https://reactflow.dev) at the places dagre gives (lib/ownership-layout.ts).
// React Flow draws nodes as HTML, so names wrap and stay readable at any
// zoom, and it brings pan, zoom and keyboard focus on nodes. The picture is
// read-only: nothing is dragged or connected here, the records change only
// through review. Each link says its share or role in words; an ended stake
// is dashed and a directorship dotted, so neither depends on colour alone.
import {Background, Controls, Handle, MarkerType, Position, ReactFlow} from '@xyflow/react';
import type {Edge, Node, NodeProps} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {useMemo} from 'react';
import type {ReactElement} from 'react';

import type {OwnershipChainOut} from '../lib/generated/types.gen';
import {NODE_HEIGHT, NODE_WIDTH, layoutChain} from '../lib/ownership-layout';

// The palette of the network drawing (components/entity-graph.tsx).
const COLOURS = {
  subject: {border: '#b78b34', background: '#39180e'},   // --primary gold
  party: {border: '#927e5d', background: '#1a2328'},     // --muted-foreground on --card
  link: '#caaf9c',                                       // --da-parchment
  ended: '#927e5d',
  circular: '#d4a154',                                   // --ring gold
};

type PartyData = {caption: string; schema: string};

// Handles are where links meet a box: in at the top, out at the bottom, and a
// pair on the right for a link that has to run upward (a circle of
// ownership), so it goes round the side instead of over the link it answers.
// Nothing is connected by hand, so the handles are not shown.
const HIDDEN = {opacity: 0, pointerEvents: 'none' as const};

function Party({data}: NodeProps<Node<PartyData>>): ReactElement {
  return <>
    <Handle type="target" position={Position.Top} id="in" style={HIDDEN} isConnectable={false}/>
    <span><b>{data.caption}</b><br/><small>{data.schema}</small></span>
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
    const nodes: Node<PartyData>[] = laid.parties.map(p => {
      const look = p.is_subject ? COLOURS.subject : COLOURS.party;
      return {
        id: p.id, type: 'party', position: {x: p.x, y: p.y}, width: NODE_WIDTH, height: NODE_HEIGHT,
        data: {caption: p.caption ?? p.id, schema: p.schema},
        ariaLabel: `${p.caption ?? p.id}, ${p.schema}${p.is_subject ? ', the entity this chain is for' : ''}`,
        draggable: false, connectable: false,
        style: {width: NODE_WIDTH, height: NODE_HEIGHT, background: look.background, border: `${p.is_subject ? 2 : 1}px solid ${look.border}`,
          borderRadius: 3, color: COLOURS.link, fontSize: 12, padding: 6, overflow: 'hidden', textAlign: 'center'},
      };
    });
    const edges: Edge[] = laid.links.map(l => {
      const colour = l.circular ? COLOURS.circular : l.ended ? COLOURS.ended : COLOURS.link;
      return {
        id: l.id, source: l.source, target: l.target, label: l.label,
        sourceHandle: l.upward ? 'side-out' : 'out', targetHandle: l.upward ? 'side-in' : 'in', type: l.upward ? 'smoothstep' : 'default',
        markerEnd: {type: MarkerType.ArrowClosed, color: colour},
        style: {stroke: colour, strokeWidth: l.schema === 'Ownership' ? 1.5 : 1, strokeDasharray: l.ended ? '6 4' : l.schema === 'Directorship' ? '2 3' : undefined},
        labelStyle: {fill: COLOURS.link, fontSize: 11},
        labelBgStyle: {fill: '#1a2328'},
        ariaLabel: `${chain.nodes.find(n => n.id === l.source)?.caption ?? l.source} to ${chain.nodes.find(n => n.id === l.target)?.caption ?? l.target}: ${l.schema}, ${l.label}`,
      };
    });
    return {nodes, edges, height: laid.height};
  }, [chain]);

  return <div style={{height: Math.min(Math.max(height + 40, 220), 560)}}
    role="group" aria-label={`Ownership and control chart: ${chain.nodes.length} parties and ${chain.links.length} links`}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} colorMode="dark" fitView minZoom={0.2}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable
      onNodeClick={(_event, node) => onParty?.(node.id)}>
      <Background/>
      <Controls showInteractive={false}/>
    </ReactFlow>
  </div>;
}
