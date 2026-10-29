'use client';
// The relationship network in its frame: who is linked to whom, arranged by
// a rule the reporter can read (lib/network-arrange.ts), with the key to
// every colour and line beside it and the counts under it.
//
// What a reporter needs from it decides how it opens:
// - the arrangement is chosen from the links themselves (chooseArrangement:
//   ownership and directorship links -> "who controls whom"; none -> "by
//   kind"), and the header says why; the reporter can switch to any other;
// - "Around a party" centres on the most-linked party until another is
//   picked;
// - link filters are the link families of the key, each with its count, so
//   hiding payments or family links is one press on the colour it hides;
// - the grid view is always one press away (design rule 18 asks for it past
//   twenty parties; a grid reads exact counts at any size).
// Past NETWORK_SVG_LIMIT parties the drawing is Sigma's WebGL one, in linked
// groups only. Nodes are the loaded entities at either end of a shown
// relationship; clicking a party opens its dossier, a link its relationship.
import dynamic from 'next/dynamic';
import {useCallback, useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {ChartFrame, ContestedMark, FootStat, KeyRow, KeySection, LineSwatch, Segmented} from '../../components/charts/chart-frame';
import {ConnectionGrid} from '../../components/connection-grid';
import {KIND_ICON} from '../../components/network/party-icons';
import type {NetLink, NetOverlays, NetParty} from '../../components/network/network-view';
import {isDated, linkSpan, shownAsOf} from '../../lib/as-of';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {Connections} from './connections';
import type {Chain} from './connections';
import type {EntityOut, RelationshipEndpointOut, RelationshipOut} from '../../lib/generated/types.gen';
import {NETWORK_SVG_LIMIT, chooseArrangement, dotRadius, mostLinked, ruleOf} from '../../lib/network-rules';
import type {Arrangement, Placed} from '../../lib/network-rules';
import {GRID_THRESHOLD, countCrossings} from '../../lib/network-layout';
import {CERTAINTY, LINK, LINK_ORDER, PARTY, PARTY_ORDER, SWATCH, certaintyOf, isControl, isDirected, linkFamily, partyKind} from '../../lib/viz-tokens';
import type {Certainty, LinkFamily} from '../../lib/viz-tokens';

const NetworkView = dynamic(() => import('../../components/network/network-view').then(m => m.NetworkView), {ssr: false, loading: () => <p className="muted p-4">Loading the network…</p>});
const EntityGraph = dynamic(() => import('../../components/entity-graph').then(m => m.EntityGraph), {ssr: false, loading: () => <p className="muted p-4">Loading the network…</p>});

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

/** A link in words: its kind, then its role, share or amount when the record gives one. */
export function linkWords(r: Pick<RelationshipOut, 'schema' | 'properties'>): string {
  const first = (key: string) => r.properties[key]?.[0];
  const detail = r.schema === 'Payment' || r.schema === 'Debt'
    ? (first('amount') ? `${Number(first('amount')).toLocaleString('en-GB')} ${first('currency') ?? ''}`.trim() : undefined)
    : r.schema === 'Ownership' ? (first('percentage') ? `${first('percentage')}%` : first('role'))
      : first('role');
  return detail ? `${r.schema} · ${detail}` : r.schema;
}

/** The parties and links the drawing shows, with what the key needs to know of each. */
export function networkData(relationships: GraphEdge[], entities: EntityOut[]): {parties: NetParty[]; links: NetLink[]} {
  const byId = new Map(entities.map(e => [e.id, e]));
  const ids = Array.from(new Set(relationships.flatMap(r => [r.source.id, r.target.id]))).filter(id => byId.has(id));
  const parties = ids.map(id => { const e = byId.get(id) as EntityOut; return {id, label: e.caption, kind: partyKind(e.schema), schema: e.schema}; });
  const known = new Set(ids);
  const shown = relationships.filter(r => known.has(r.source.id) && known.has(r.target.id) && r.source.id !== r.target.id);
  // Line thickness says how much only when every payment drawn is in one currency.
  const payments = shown.filter(r => linkFamily(r.schema) === 'money' && r.properties.amount?.[0]);
  const currencies = new Set(payments.map(r => (r.properties.currency?.[0] ?? '').toUpperCase()));
  const oneCurrency = currencies.size === 1 && !currencies.has('');
  const links = shown.map(r => {
    const amount = Number(r.properties.amount?.[0]);
    return {
      id: r.id, from: r.source.id, to: r.target.id, schema: r.schema, family: linkFamily(r.schema), certainty: certaintyOf(r.advisory),
      directed: isDirected(r.schema), control: isControl(r.schema), label: linkWords(r),
      amount: oneCurrency && linkFamily(r.schema) === 'money' && Number.isFinite(amount) ? amount : undefined,
    };
  });
  return {parties, links};
}

type Props = {
  relationships: GraphEdge[];
  entities: EntityOut[];
  onNode: (id: string) => void;
  onEdge: (r: GraphEdge) => void;
  /** Controls the panel adds to the frame's tools (e.g. showing reviewed duplicate copies). */
  extraTools?: ReactElement;
  /** A line the panel adds to the footer. */
  footnote?: string;
  /** The investigation, for "How are these two connected?". */
  investigationId?: string;
  /** The reporter's tags on parties, by party id, for the tag layer (the panel reads them). */
  partyTags?: Record<string, {name: string; colour: string}[]>;
  /** Open Red Flags per party (the panel reads them). */
  partyFlags?: Record<string, number>;
};

type Layer = 'tags' | 'dates';

const ARRANGEMENTS: {value: Arrangement; label: string; title: string}[] = [
  {value: 'control', label: 'Who controls whom', title: 'Each owner or director above what it owns or directs'},
  {value: 'around', label: 'Around a party', title: 'One party at the centre; rings by links away'},
  {value: 'kind', label: 'By kind', title: 'One column per kind of party'},
  {value: 'clusters', label: 'Linked groups', title: 'Parties that share links pulled together'},
];

export function Graph({relationships: allRelationships, entities, onNode, onEdge, extraTools, footnote, investigationId = '', partyTags, partyFlags}: Props): ReactElement {
  // The year slider (lib/as-of.ts): links that did not hold by then are left out; undated ones stay.
  const asOf = useWorkbenchStore(state => state.asOf);
  const pointed = useWorkbenchStore(state => state.pointedParty);
  const setPointed = useWorkbenchStore(state => state.setPointedParty);
  const relationships = useMemo(() => allRelationships.filter(r => shownAsOf(linkSpan(r.properties), asOf)), [allRelationships, asOf]);
  const undated = useMemo(() => allRelationships.filter(r => !isDated(linkSpan(r.properties))).length, [allRelationships]);
  const [layers, setLayers] = useState<Set<Layer>>(new Set(['tags']));
  const [chain, setChain] = useState<Chain | null>(null);
  const overlays: NetOverlays = useMemo(() => {
    const tags = layers.has('tags') ? partyTags ?? {} : {};
    const dates: Record<string, string> = {};
    if (layers.has('dates')) for (const r of relationships) { const start = linkSpan(r.properties).start; if (start) dates[r.id] = start; }
    return {tags, dates, pointed, flags: partyFlags, chain: chain ? {parties: new Set(chain.parties.map(p => p.id)), links: new Set(chain.links.map(l => l.id))} : null};
  }, [layers, partyTags, partyFlags, relationships, pointed, chain]);
  const [view, setView] = useState<'network' | 'grid'>('network');
  const [picked, setPicked] = useState<Arrangement | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<LinkFamily>>(new Set());
  const all = useMemo(() => networkData(relationships, entities), [relationships, entities]);
  const familiesPresent = LINK_ORDER.filter(f => all.links.some(l => l.family === f));
  // Hiding a family of links hides the parties only it linked.
  const {parties, links} = useMemo(() => {
    const links = all.links.filter(l => !hidden.has(l.family));
    const used = new Set(links.flatMap(l => [l.from, l.to]));
    return {parties: all.parties.filter(p => used.has(p.id)), links};
  }, [all, hidden]);

  const chosen = useMemo(() => chooseArrangement(parties, links), [parties, links]);
  const large = parties.length > NETWORK_SVG_LIMIT;
  const arrangement: Arrangement = large ? 'clusters' : picked ?? chosen.arrangement;
  const centre = focus && parties.some(p => p.id === focus) ? focus : parties.length ? mostLinked(parties, links) : null;
  // Where the drawing put each party, as it reports it: the crossing count is worked out from it.
  const [placed, setPlaced] = useState<Placed | null>(null);
  const onPlaced = useCallback((p: Placed) => setPlaced(p), []);
  const crossings = useMemo(() => (placed && view === 'network' && !large && links.every(l => placed.positions[l.from] && placed.positions[l.to])
    ? countCrossings(links, placed.positions) : null), [placed, links, view, large]);

  if (!all.parties.length) return <div className="muted">{asOf !== null && allRelationships.length
    ? `No link had started by ${asOf}. Move the year slider later, or choose “All time”.` : 'No relationships match the current filter.'}</div>;
  const openLink = (id: string) => { const edge = relationships.find(r => r.id === id); if (edge) onEdge(edge); };
  const centreName = all.parties.find(p => p.id === centre)?.label;
  const rule = view === 'grid'
    ? {label: 'Ordered by links:', text: 'the most-linked parties come first. Read across: the row’s party owns, directs, paid or is linked to the column’s.'}
    : large ? {...ruleOf('clusters'), why: `Drawn in linked groups only: ${parties.length} parties are more than this drawing lays out by rule.`}
      : {...ruleOf(arrangement, centreName), why: picked ? undefined : chosen.why};
  const certainties = (Object.keys(CERTAINTY) as Certainty[]).filter(c => links.some(l => l.certainty === c));
  const kinds = PARTY_ORDER.filter(k => parties.some(p => p.kind === k));
  const contested = links.filter(l => l.certainty === 'contested').length;
  const unsupported = links.filter(l => l.certainty === 'unsupported').length;
  const weighted = links.some(l => l.amount !== undefined);

  const tools = <>
    <Segmented label="View" value={view} onChange={setView} options={[{value: 'network', label: 'Network'}, {value: 'grid', label: 'Grid'}]}/>
    {view === 'network' && !large && <Segmented label="Arrangement" value={arrangement} onChange={setPicked} options={ARRANGEMENTS}/>}
    {view === 'network' && arrangement === 'around' && !large && <label className="text-xs" style={{color: SWATCH.tan}}>Centre on{' '}
      <select className="cf-tool" value={centre ?? ''} onChange={e => setFocus(e.target.value)} aria-label="Party at the centre">
        {[...all.parties].sort((a, b) => a.label.localeCompare(b.label)).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select></label>}
    {familiesPresent.length > 1 && <div role="group" aria-label="Show links" title="Each kind of link: ✓ drawn, struck through hidden. Click to hide or show it." style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
      {familiesPresent.map(f => <button key={f} type="button" className="cf-chip" aria-pressed={!hidden.has(f)}
        onClick={() => setHidden(cur => { const next = new Set(cur); if (next.has(f)) next.delete(f); else next.add(f); return next; })}>
        <span className="cf-chip-line" style={{width: 14, height: 3, background: LINK[f].colour, display: 'inline-block', borderRadius: 2}}/>
        {LINK[f].name} · {all.links.filter(l => l.family === f).length}</button>)}
    </div>}
    <div role="group" aria-label="Layers" style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
      {([['tags', 'Your tags'], ['dates', 'Link dates']] as [Layer, string][]).map(([layer, name]) => <button key={layer} type="button" className="cf-chip"
        aria-pressed={layers.has(layer)} onClick={() => setLayers(cur => { const next = new Set(cur); if (next.has(layer)) next.delete(layer); else next.add(layer); return next; })}>{name}</button>)}
    </div>
    {extraTools}
  </>;

  const legend = <>
    <KeySection title="Parties" channel="colour and icon: what it is">
      {kinds.map(k => { const Icon = KIND_ICON[k]; return <KeyRow key={k} swatch={<svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill={PARTY[k].fill} stroke={PARTY[k].ring} strokeWidth="2"/>
        {Icon && <Icon x={6} y={6} width={12} height={12} color={PARTY[k].ring} strokeWidth={2.4}/>}</svg>}>{PARTY[k].name}</KeyRow>; })}
    </KeySection>
    <KeySection title="Links" channel="colour: what the link is · arrow: its direction">
      {LINK_ORDER.filter(f => links.some(l => l.family === f)).map(f => <KeyRow key={f} swatch={<LineSwatch colour={LINK[f].colour} arrow/>}>{LINK[f].name}</KeyRow>)}
    </KeySection>
    <KeySection title="How sure" channel="line pattern">
      {certainties.map(c => <KeyRow key={c} swatch={c === 'contested'
        ? <span style={{display: 'inline-flex', alignItems: 'center', gap: 2}}><LineSwatch colour={SWATCH.sage} dash="6 5"/><ContestedMark size={14}/></span>
        : <LineSwatch colour={SWATCH.sage} dash={CERTAINTY[c].dash}/>}>{CERTAINTY[c].name}</KeyRow>)}
    </KeySection>
    {view === 'network' && layers.has('tags') && Object.keys(overlays.tags ?? {}).length > 0 && <KeySection title="Your tags" channel="a ring outside the dot">
      {Array.from(new Map(Object.values(overlays.tags ?? {}).flat().map(t => [t.name, t.colour])).entries()).map(([name, colour]) =>
        <KeyRow key={name} swatch={<svg width="24" height="24"><circle cx="12" cy="12" r="7" fill="none" stroke={SWATCH.tan} strokeWidth="2"/><circle cx="12" cy="12" r="10" fill="none" stroke={colour} strokeWidth="3"/></svg>}>{name}</KeyRow>)}
    </KeySection>}
    {view === 'network' && <KeySection title="Size">
      <KeyRow swatch={<svg width="36" height="26"><circle cx="9" cy="13" r={dotRadius(1) / 2} fill="none" stroke={SWATCH.tan}/><circle cx="25" cy="13" r={dotRadius(6) / 2} fill="none" stroke={SWATCH.tan}/></svg>}>
        A bigger dot has more links</KeyRow>
      {weighted && <KeyRow swatch={<svg width="36" height="16"><line x1="2" y1="4" x2="34" y2="4" stroke={LINK.money.colour} strokeWidth="1.5"/>
        <line x1="2" y1="12" x2="34" y2="12" stroke={LINK.money.colour} strokeWidth="5"/></svg>}>A thicker payment moved more money</KeyRow>}
    </KeySection>}
  </>;

  const footer = <>
    <FootStat value={parties.length}>parties</FootStat>
    <FootStat value={links.length}>links</FootStat>
    {contested > 0 && <FootStat value={contested}>contested</FootStat>}
    {unsupported > 0 && <FootStat value={unsupported}>not yet supported</FootStat>}
    {crossings !== null && <span data-testid="graph-crossings">{crossingsLine(crossings, parties.length)}</span>}
    {asOf !== null && <span>As of {asOf}: {allRelationships.length - relationships.length} of {allRelationships.length} links had not started or had ended{undated ? `; ${undated} undated always shown` : ''}.</span>}
    {footnote && <span>{footnote}</span>}
    <span>Point at a party or link for its details; click to open it.</span>
  </>;

  return <ChartFrame kind="network" title="Who is linked to whom" testId="relationship-network"
    question="Reviewed relationships between the parties in this investigation." rule={rule} tools={tools} legend={legend} footer={footer}>
    {!parties.length ? <p className="muted p-4">Every link here is hidden by the filters above.</p>
      : view === 'grid' ? <div style={{padding: '12px 16px'}}><ConnectionGrid nodes={parties} links={links} onLink={openLink}/></div>
        : large ? <EntityGraph height={560} nodes={parties.map(p => ({id: p.id, label: p.label, schema: p.schema}))}
          edges={links.map(l => ({id: l.id, from: l.from, to: l.to, label: l.label, family: l.family}))} onNodeClick={onNode} onEdgeClick={openLink}/>
          : <NetworkView parties={parties} links={links} arrangement={arrangement} focus={centre} onPlaced={onPlaced} onParty={onNode} onLink={openLink}
            overlays={overlays} onPoint={setPointed}/>}
    {investigationId && view === 'network' && !large && <Connections investigationId={investigationId} parties={all.parties} chain={chain} onChain={setChain}/>}
  </ChartFrame>;
}
