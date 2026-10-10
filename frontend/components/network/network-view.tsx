'use client';
// The relationship network drawn as SVG and HTML with React Flow
// (@xyflow/react, MIT), at the places lib/network-arrange.ts gives. React
// Flow is the library the ownership chain already uses; drawing in SVG gives
// what WebGL (Sigma) did not: dashed lines for links not yet supported,
// names that wrap onto two lines, and labels on links. For networks past
// NETWORK_SVG_LIMIT parties (lib/network-rules.ts) the panel keeps Sigma, which draws thousands.
//
// What the marks say (the table and its sources: lib/viz-tokens.ts):
//   dot hue and icon   what the party is (person, company, ...)
//   dot area           how many links it has
//   line hue           what the link is (owns, directs, paid, family)
//   line pattern       how sure: solid when a reviewed claim or evidence
//                      supports it, dashed when none does yet, dashed with a
//                      red "!" when a supporting claim is disputed or rejected
//   line thickness     for payments in one currency, how much (log scale)
//   arrowhead          the direction FollowTheMoney gives the link; none on
//                      family, associate and unknown links, which have none
// The guides drawn behind (bands, rings, columns) are the arrangement's rule.
//
// Pointing at (or tabbing to) a party lights it, its links and the parties
// they reach, dims the rest, and writes each lit link's kind on it; pointing
// at a link writes its kind. Clicking a party or a link opens it.
import {BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, ViewportPortal, useReactFlow} from '@xyflow/react';
import {Maximize2, Minus, Plus} from 'lucide-react';
import type {Edge, EdgeProps, Node, NodeProps} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {arrange} from '@/lib/network-arrange';
import {MAX_RADIUS, dotRadius, partyBox} from '@/lib/network-rules';
import {KIND_ICON} from './party-icons';
import type {Arrangement, Guide, Placed} from '@/lib/network-rules';
import {CERTAINTY, LINK, PARTY, SWATCH, TEXT} from '@/lib/viz-tokens';
import type {Certainty, LinkFamily, PartyKind} from '@/lib/viz-tokens';

export type NetParty = {id: string; label: string; kind: PartyKind; schema: string};
export type NetLink = {
  id: string; from: string; to: string; schema: string; family: LinkFamily; certainty: Certainty;
  directed: boolean; control: boolean;
  /** The link in words: its kind, and its role, share or amount when it has one. */
  label: string;
  /** A payment's amount, when every payment drawn is in one currency. */
  amount?: number;
};

/** A payment line's thickness: 1.5 px for 10,000 or less, growing with the
 * logarithm of the amount (each tenfold adds 1.4 px), at most 6 px; links
 * that are not payments in one currency are 2 px. */
export function lineWidth(link: Pick<NetLink, 'family' | 'amount'>): number {
  if (link.family !== 'money' || !link.amount || link.amount <= 0) return 2;
  return Math.min(6, Math.max(1.5, 1.5 + 1.4 * Math.log10(link.amount / 10_000)));
}

type Hover = {party: string | null; link: string | null};
/** What the overlays add (docs/discovery/README.md, "Overlays"): tag rings,
 * dates on links, the party pointed at in another chart, and a chain to light. */
export type NetOverlays = {
  /** Tag colours per party, drawn as rings outside its dot (at most three). */
  tags?: Record<string, {name: string; colour: string}[]>;
  /** A date to write on each link (its start date or a payment's date). */
  dates?: Record<string, string>;
  /** The party pointed at in another chart. */
  pointed?: string | null;
  /** A chain from "How are these two connected?". */
  chain?: {parties: Set<string>; links: Set<string>} | null;
};
type Ctx = {hover: Hover; setHover: (h: Hover) => void; lit: Set<string> | null; litLinks: Set<string> | null; focusParty: string | null; overlays: NetOverlays};
const HoverContext = createContext<Ctx>({hover: {party: null, link: null}, setHover: () => {}, lit: null, litLinks: null, focusParty: null, overlays: {}});

const HIDDEN_HANDLE = {opacity: 0, pointerEvents: 'none' as const, top: MAX_RADIUS + 2};

type PartyData = {party: NetParty; links: number; lines: string[]; width: number; height: number; onParty?: (id: string) => void};

function PartyNode({data}: NodeProps<Node<PartyData>>): ReactElement {
  const {hover, setHover, lit, focusParty, overlays} = useContext(HoverContext);
  const {party, links, lines, width, onParty} = data;
  const tagRings = (overlays.tags?.[party.id] ?? []).slice(0, 3);
  const look = PARTY[party.kind];
  const r = dotRadius(links);
  const Icon = KIND_ICON[party.kind];
  const dim = lit !== null && !lit.has(party.id);
  const on = hover.party === party.id || (hover.party === null && focusParty === party.id);
  return <button type="button" className="net-party" style={{width, opacity: dim ? 0.22 : 1}}
    aria-label={`${party.label}, ${look.name}, ${links} link${links === 1 ? '' : 's'}${tagRings.length ? `, tagged ${tagRings.map(t => t.name).join(', ')}` : ''}`} title={`${party.label} · ${party.schema}`}
    onMouseEnter={() => setHover({party: party.id, link: null})} onMouseLeave={() => setHover({party: null, link: null})}
    onFocus={() => setHover({party: party.id, link: null})} onBlur={() => setHover({party: null, link: null})}
    onClick={() => onParty?.(party.id)}>
    {/* React Flow draws a link only between handles; these sit hidden at the dot (the link's own path is worked out from the layout). */}
    <Handle type="target" position={Position.Top} isConnectable={false} style={HIDDEN_HANDLE}/>
    <Handle type="source" position={Position.Bottom} isConnectable={false} style={HIDDEN_HANDLE}/>
    <svg width={width} height={2 * MAX_RADIUS + 4} style={{display: 'block'}} aria-hidden>
      {on && <circle cx={width / 2} cy={MAX_RADIUS + 2} r={r + 4} fill="none" stroke={SWATCH.parchment} strokeWidth={1.5}/>}
      {tagRings.map((t, i) => <circle key={t.name} cx={width / 2} cy={MAX_RADIUS + 2} r={r + 3.5 + i * 3.5} fill="none" stroke={t.colour} strokeWidth={3}><title>{t.name}</title></circle>)}
      <circle cx={width / 2} cy={MAX_RADIUS + 2} r={r} fill={look.fill} stroke={look.ring} strokeWidth={2.5}/>
      {Icon && <Icon x={width / 2 - r * 0.55} y={MAX_RADIUS + 2 - r * 0.55} width={r * 1.1} height={r * 1.1} color={look.ring} strokeWidth={2.2}/>}
    </svg>
    <span className="net-name">{lines.map((line, i) => <span key={i}>{line}</span>)}</span>
  </button>;
}

type LinkData = {
  link: NetLink; x1: number; y1: number; x2: number; y2: number; r1: number; r2: number; bend: number;
  onLink?: (id: string) => void;
};

/** Whether the straight line from a to b passes within a dot's reach of
 * another party (one it does not join). Exported for the tests. */
export function passesThrough(a: {x: number; y: number}, b: {x: number; y: number}, from: string, to: string,
  positions: Record<string, {x: number; y: number}>): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy || 1;
  return Object.entries(positions).some(([id, p]) => {
    if (id === from || id === to) return false;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2;
    if (t <= 0.05 || t >= 0.95) return false;
    return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < MAX_RADIUS + 6;
  });
}

/** The link's path between the two dots' edges: straight, or bent sideways
 * by `bend` (a share of its length) when it shares its two parties with
 * another link or runs along a column. Exported for the tests. */
export function linkPath(d: Pick<LinkData, 'x1' | 'y1' | 'x2' | 'y2' | 'r1' | 'r2' | 'bend'>): {path: string; mid: {x: number; y: number}} {
  const dx = d.x2 - d.x1, dy = d.y2 - d.y1, length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const sx = d.x1 + ux * (d.r1 + 3), sy = d.y1 + uy * (d.r1 + 3);
  const tx = d.x2 - ux * (d.r2 + 6), ty = d.y2 - uy * (d.r2 + 6);
  if (!d.bend) return {path: `M${sx},${sy} L${tx},${ty}`, mid: {x: (sx + tx) / 2, y: (sy + ty) / 2}};
  const cx = (sx + tx) / 2 - uy * d.bend * length, cy = (sy + ty) / 2 + ux * d.bend * length;
  return {path: `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`, mid: {x: 0.25 * sx + 0.5 * cx + 0.25 * tx, y: 0.25 * sy + 0.5 * cy + 0.25 * ty}};
}

function LinkEdge({id, data, markerEnd}: EdgeProps<Edge<LinkData>>): ReactElement | null {
  const {hover, setHover, lit, litLinks, focusParty, overlays} = useContext(HoverContext);
  if (!data) return null;
  const {link, onLink} = data;
  const {path, mid} = linkPath(data);
  const colour = LINK[link.family].colour;
  const party = hover.party ?? (hover.link ? null : focusParty);
  const touched = litLinks ? litLinks.has(link.id) : party !== null && (link.from === party || link.to === party);
  const dim = lit !== null && !touched && hover.link !== id;
  const showLabel = hover.link === id || (touched && (hover.party !== null || litLinks !== null));
  const date = overlays.dates?.[link.id];
  return <>
    <BaseEdge id={id} path={path} markerEnd={link.directed ? markerEnd : undefined} interactionWidth={14}
      style={{stroke: colour, strokeWidth: lineWidth(link), strokeDasharray: CERTAINTY[link.certainty].dash, opacity: dim ? 0.12 : 0.95}}/>
    <EdgeLabelRenderer>
      {link.certainty === 'contested' && <div className="net-contested nodrag nopan" style={{transform: `translate(-50%,-50%) translate(${mid.x}px,${mid.y}px)`, opacity: dim ? 0.2 : 1}}
        title="A supporting claim is disputed or rejected, or evidence contradicts this link">!</div>}
      {date && !showLabel && <div className="net-link-date nodrag nopan" style={{transform: `translate(-50%,-50%) translate(${mid.x}px,${mid.y + (link.certainty === 'contested' ? 16 : 0)}px)`, opacity: dim ? 0.2 : 1}}>{date}</div>}
      {showLabel && <div className="net-link-label nodrag nopan" style={{transform: `translate(-50%,${link.certainty === 'contested' ? '-160%' : '-50%'}) translate(${mid.x}px,${mid.y}px)`, borderColor: colour}}>
        {link.label}{link.certainty !== 'supported' ? ` · ${link.certainty === 'contested' ? 'contested' : 'not yet supported'}` : ''}
      </div>}
      {/* A keyboard stop for the link at its middle (the mouse points at the line itself). */}
      <button type="button" className="net-link-hit nodrag nopan" aria-label={`${link.label}${link.certainty === 'supported' ? '' : `, ${CERTAINTY[link.certainty].name.toLowerCase()}`}`}
        style={{transform: `translate(-50%,-50%) translate(${mid.x}px,${mid.y}px)`}}
        onFocus={() => setHover({party: null, link: id})} onBlur={() => setHover({party: null, link: null})}
        onClick={() => onLink?.(link.id)}/>
    </EdgeLabelRenderer>
  </>;
}

/** An empty box over the whole drawing, guides included, so "fit" frames all of it. */
function ExtentNode(): ReactElement { return <div aria-hidden style={{width: '100%', height: '100%', pointerEvents: 'none'}}/>; }

const NODE_TYPES = {party: PartyNode, extent: ExtentNode};
const EDGE_TYPES = {link: LinkEdge};

/** The arrangement's guides, behind everything, in the drawing's own coordinates. */
function Guides({guides, width, height}: {guides: Guide[]; width: number; height: number}): ReactElement {
  // z-index -1: under the links and the parties (the portal is drawn above them otherwise).
  return <svg className="net-guides" width={width} height={height} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: -1}} aria-hidden>
    {guides.map((g, i) => {
      if (g.type === 'band') return <g key={i}>
        <rect x={g.x0} y={g.y0} width={g.x1 - g.x0} height={g.y1 - g.y0} rx={8} fill={i % 2 ? '#1f292e' : '#222d32'}/>
        <text x={g.x0 + 12} y={g.y0 + 18} fontSize={11} letterSpacing=".07em" fill={TEXT.muted} style={{textTransform: 'uppercase'}}>{g.label.toUpperCase()}</text>
      </g>;
      if (g.type === 'ring') return <g key={i}>
        <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke="#33414a" strokeWidth={1.5}/>
        <text x={g.cx} y={g.cy - g.r - 6} textAnchor="middle" fontSize={11} letterSpacing=".07em" fill={TEXT.muted}>{g.label.toUpperCase()}</text>
      </g>;
      return <g key={i}>
        <rect x={g.x0} y={g.y0} width={g.x1 - g.x0} height={g.y1 - g.y0} rx={10} fill={i % 2 ? '#1f292e' : '#222d32'}/>
        <text x={(g.x0 + g.x1) / 2} y={g.y0 + 24} textAnchor="middle" fontSize={11} fontWeight={600} letterSpacing=".08em" fill={g.colour}>{g.label.toUpperCase()}</text>
      </g>;
    })}
  </svg>;
}

type Props = {
  parties: NetParty[];
  links: NetLink[];
  arrangement: Arrangement;
  /** The party at the centre of "Around a party". */
  focus?: string | null;
  /** Told where every party went, once per layout (the footer counts crossings from it). */
  onPlaced?: (placed: Placed) => void;
  onParty?: (id: string) => void;
  onLink?: (id: string) => void;
  maxHeight?: number;
  overlays?: NetOverlays;
  /** Told which party is pointed at (or null), so other charts can light it. */
  onPoint?: (id: string | null) => void;
};

const NO_OVERLAYS: NetOverlays = {};

export function NetworkView({parties, links, arrangement, focus, onPlaced, onParty, onLink, maxHeight = 720, overlays = NO_OVERLAYS, onPoint}: Props): ReactElement {
  const [hover, setHoverState] = useState<Hover>({party: null, link: null});
  const setHover = (h: Hover) => { setHoverState(h); onPoint?.(h.party); };
  const degree = useMemo(() => {
    const out = new Map(parties.map(p => [p.id, 0]));
    for (const l of links) { out.set(l.from, (out.get(l.from) ?? 0) + 1); out.set(l.to, (out.get(l.to) ?? 0) + 1); }
    return out;
  }, [parties, links]);
  const placed = useMemo(() => arrange(arrangement, parties, links, {focus}), [arrangement, parties, links, focus]);
  useEffect(() => { onPlaced?.(placed); }, [placed, onPlaced]);

  const {nodes, edges} = useMemo(() => {
    const extent: Node = {id: '__extent', type: 'extent', position: {x: 0, y: 0}, width: placed.width, height: placed.height, zIndex: -1,
      draggable: false, connectable: false, selectable: false, focusable: false, data: {}, style: {pointerEvents: 'none'}};
    const nodes: Node[] = [extent, ...parties.map(p => {
      const box = partyBox(p.label);
      const at = placed.positions[p.id];
      return {id: p.id, type: 'party', position: {x: at.x - box.width / 2, y: at.y - MAX_RADIUS - 2}, width: box.width, height: box.height,
        draggable: false, connectable: false, selectable: false, focusable: false,
        // React Flow turns pointer events off on a node it cannot drag or select; the party's own button needs them.
        style: {pointerEvents: 'all'},
        data: {party: p, links: degree.get(p.id) ?? 0, lines: box.lines, width: box.width, height: box.height, onParty}} as Node<PartyData>;
    })];
    // Links between the same two parties bend apart; so does a link along a column (both ends at one x).
    const pairs = new Map<string, NetLink[]>();
    for (const l of links) { const key = [l.from, l.to].sort().join('|'); pairs.set(key, [...(pairs.get(key) ?? []), l]); }
    const bentInLane = new Map<number, number>();
    const edges: Edge<LinkData>[] = links.map(l => {
      const a = placed.positions[l.from], b = placed.positions[l.to];
      const siblings = pairs.get([l.from, l.to].sort().join('|')) as NetLink[];
      const index = siblings.indexOf(l);
      // Spread siblings evenly about the straight line; a link that runs the
      // other way already bends to the opposite side, so its sign follows its direction.
      let bend = siblings.length > 1 ? (index - (siblings.length - 1) / 2) * 0.22 * (l.from < l.to ? 1 : -1) : 0;
      // A straight line must not run through a party it does not join (it
      // would read as a link to it): bend it round instead.
      // Several such lines along one column nest instead of lying on each
      // other: each bends out 16 px further than the one before.
      if (!bend && passesThrough(a, b, l.from, l.to, placed.positions)) {
        const lane = Math.round(Math.min(a.x, b.x) / 8);
        const n = bentInLane.get(lane) ?? 0;
        bentInLane.set(lane, n + 1);
        bend = (40 + 16 * n) / (Math.hypot(b.x - a.x, b.y - a.y) || 1) * (a.y < b.y ? -1 : 1);
      }
      const colour = LINK[l.family].colour;
      return {id: l.id, source: l.from, target: l.to, type: 'link', focusable: false, selectable: false,
        // Arrowheads keep one size whatever the line's thickness.
        markerEnd: {type: MarkerType.ArrowClosed, color: colour, width: 14, height: 14, markerUnits: 'userSpaceOnUse'},
        data: {link: l, x1: a.x, y1: a.y, x2: b.x, y2: b.y, r1: dotRadius(degree.get(l.from) ?? 0), r2: dotRadius(degree.get(l.to) ?? 0), bend, onLink}};
    });
    return {nodes, edges};
  }, [parties, links, placed, degree, onParty, onLink]);

  // What is lit while a party or link is pointed at here; else a chain
  // being shown; else the party pointed at in another chart.
  const focusParty = overlays.chain ? null : overlays.pointed && parties.some(p => p.id === overlays.pointed) ? overlays.pointed : null;
  const litLinks = !hover.party && !hover.link && overlays.chain ? overlays.chain.links : null;
  const lit = useMemo(() => {
    const around = (id: string) => {
      const set = new Set([id]);
      for (const l of links) if (l.from === id || l.to === id) { set.add(l.from); set.add(l.to); }
      return set;
    };
    if (hover.party) return around(hover.party);
    if (hover.link) { const l = links.find(x => x.id === hover.link); return l ? new Set([l.from, l.to]) : null; }
    if (overlays.chain) return overlays.chain.parties;
    if (focusParty) return around(focusParty);
    return null;
  }, [hover, links, overlays.chain, focusParty]);

  // As tall as the drawing is when fitted to the box's width (so a narrow
  // screen does not get a tall, mostly empty box), between 260 px and maxHeight.
  const box = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setBoxWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setBoxWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = boxWidth > 0 && placed.width > 0 ? Math.min(1.2, (boxWidth * 0.94) / placed.width) : 1;
  const height = Math.round(Math.min(maxHeight, Math.max(260, placed.height * scale + 48)));
  return <HoverContext.Provider value={{hover, setHover, lit, litLinks, focusParty, overlays}}><ReactFlowProvider>
    <ZoomBar/>
    <FitWhenResized height={height}/>
    <div ref={box} className="net-view" style={{height}} data-testid="network-view" data-arrangement={arrangement}>
      {/* A new arrangement or a new set of links is a new drawing, fitted to the frame anew. */}
      {/* Drawn once the box's width is known, so the first fit is to the box's final height. */}
      {boxWidth > 0 && <ReactFlow key={`${arrangement}|${focus ?? ''}|${parties.length}|${links.length}`} nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} colorMode="dark"
        fitView fitViewOptions={{padding: 0.06, maxZoom: 1.2}} minZoom={0.15} maxZoom={2}
        nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false}
        onEdgeMouseEnter={(_event, edge) => setHover({party: null, link: edge.id})} onEdgeMouseLeave={() => setHover({party: null, link: null})}
        onEdgeClick={(_event, edge) => onLink?.(edge.id)}>
        <ViewportPortal><Guides guides={placed.guides} width={placed.width} height={placed.height}/></ViewportPortal>
      </ReactFlow>}
    </div>
  </ReactFlowProvider></HoverContext.Provider>;
}

/** Fits the drawing again when its box changes height (React Flow fits it
 * once, when it first draws). */
function FitWhenResized({height}: {height: number}): null {
  const flow = useReactFlow();
  useEffect(() => {
    // After React Flow has seen the new size (it measures with its own observer).
    const timer = setTimeout(() => { void flow.fitView({padding: 0.06, maxZoom: 1.2}); }, 80);
    return () => clearTimeout(timer);
  }, [height, flow]);
  return null;
}

/** Zoom in, zoom out, and fit the whole drawing again -- above the drawing,
 * not over it, so the buttons never cover a party. Names too small to read
 * on a narrow screen are read zoomed in (or with two fingers). */
function ZoomBar(): ReactElement {
  const flow = useReactFlow();
  return <div className="net-zoom" role="group" aria-label="Zoom">
    <button type="button" className="cf-tool" onClick={() => void flow.zoomIn({duration: 150})} aria-label="Zoom in"><Plus size={14}/></button>
    <button type="button" className="cf-tool" onClick={() => void flow.zoomOut({duration: 150})} aria-label="Zoom out"><Minus size={14}/></button>
    <button type="button" className="cf-tool" onClick={() => void flow.fitView({padding: 0.06, maxZoom: 1.2, duration: 200})}><Maximize2 size={13}/> Fit</button>
  </div>;
}
