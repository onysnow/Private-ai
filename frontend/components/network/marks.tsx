'use client';
// The marks a screen uses to show what TYPE of thing something is, without writing the word (Ony, 29 Oct: categorical
// facts are inferred through the UI and named on hover, focus or click). One vocabulary for the whole app:
// - a party's kind: its Lucide icon in the kind's ring colour (party-icons.ts + PARTY, as the network draws it);
// - a link's family: a short line in the family's colour, with an arrowhead when the link has a direction (LINK);
// - evidence's stance on a claim: Chain of Custody's line styles (solid in the supported colour for, red dash-dot
//   against, dotted grey context only).
// Each mark is a Reveal, so its name is read with it and shown on hover, focus or click.
import type {ReactElement, ReactNode} from 'react';

import {LINK, PARTY, isDirected, linkFamily, partyKind} from '@/lib/viz-tokens';
import type {PartyKind} from '@/lib/viz-tokens';

import {Reveal} from '../ui/reveal';
import {KIND_ICON} from './party-icons';

/** The icon of a party's kind, drawn alone (for a mark inside a control that carries its own reveal). */
export function PartyGlyph({kind, size = 16}: {kind: PartyKind; size?: number}): ReactElement {
  const Icon = KIND_ICON[kind];
  const ring = PARTY[kind].ring;
  return <span aria-hidden="true" className="nm-party" style={{display: 'inline-grid', placeItems: 'center', width: size + 6, height: size + 6, borderRadius: '50%',
    boxShadow: `inset 0 0 0 1.5px ${ring}`, color: ring, flex: '0 0 auto', verticalAlign: 'middle'}}>
    {Icon ? <Icon size={size - 4} strokeWidth={2}/> : <span style={{width: size / 3, height: size / 3, borderRadius: '50%', background: ring}}/>}
  </span>;
}

/** A party's kind as its icon; the kind (and the record's own schema) named on reveal. */
export function PartyMark({schema, kind, size = 16, tabbable = true, extra}: {schema?: string | null; kind?: PartyKind; size?: number; tabbable?: boolean;
  extra?: ReactNode}): ReactElement {
  const k = kind ?? partyKind(schema);
  const name = PARTY[k].name;
  const word = schema && schema !== name ? `${name} (${schema})` : name;
  return <Reveal tabbable={tabbable} label={word} detail={<><b>{name}</b>{schema && schema !== name ? <span className="rv-row rv-mono">{schema}</span> : null}{extra}</>}>
    <PartyGlyph kind={k} size={size}/></Reveal>;
}

/** A link's family as the line the network draws for it. */
export function FamilyGlyph({schema, width = 26}: {schema?: string | null; width?: number}): ReactElement {
  const look = LINK[linkFamily(schema)];
  const arrow = isDirected(schema);
  return <svg aria-hidden="true" className="nm-family" width={width} height="10" viewBox={`0 0 ${width} 10`} style={{verticalAlign: 'middle', flex: '0 0 auto'}}>
    <line x1="1" y1="5" x2={arrow ? width - 7 : width - 1} y2="5" stroke={look.colour} strokeWidth="2.5" strokeLinecap="round"/>
    {arrow && <path d={`M${width - 8},1.5 L${width - 1},5 L${width - 8},8.5 z`} fill={look.colour}/>}
  </svg>;
}

/** A link's family as its line; the family and the record's schema named on reveal. */
export function FamilyMark({schema, tabbable = true, extra}: {schema?: string | null; tabbable?: boolean; extra?: ReactNode}): ReactElement {
  const look = LINK[linkFamily(schema)];
  const word = schema ? `${schema}: ${look.name}` : look.name;
  return <Reveal tabbable={tabbable} label={word} detail={<><b>{schema || look.name}</b>{schema ? <span className="rv-row">{look.name}</span> : null}{extra}</>}>
    <FamilyGlyph schema={schema}/></Reveal>;
}

export type Stance = 'supports' | 'contradicts' | 'context' | 'superseded' | 'unresolved';

export const STANCE: Record<Stance, {word: string; meaning: string; stroke: string; dash?: string}> = {
  supports: {word: 'Supports', meaning: 'This evidence supports the claim.', stroke: 'var(--status-supported)'},
  contradicts: {word: 'Contradicts', meaning: 'This evidence is against the claim.', stroke: 'var(--status-disputed)', dash: '6 3 2 3'},
  context: {word: 'Context only', meaning: 'This evidence gives context; it neither supports nor contradicts the claim.', stroke: 'var(--text-muted)', dash: '1.5 3.5'},
  superseded: {word: 'Superseded', meaning: 'Later evidence replaces this one.', stroke: 'var(--text-muted)', dash: '6 4'},
  unresolved: {word: 'Unresolved', meaning: 'Assessed, but not settled either way.', stroke: 'var(--status-unshown)', dash: '2 2 6 2'},
};

const stanceOf = (s: string): Stance => (s in STANCE ? s as Stance : 'unresolved');

/** Evidence's stance as Chain of Custody's line, drawn alone. */
export function StanceGlyph({stance, width = 22}: {stance: string; width?: number}): ReactElement {
  const s = STANCE[stanceOf(stance)];
  return <svg aria-hidden="true" className="nm-stance" width={width} height="10" viewBox={`0 0 ${width} 10`} style={{verticalAlign: 'middle', flex: '0 0 auto'}}>
    <line x1="1" y1="5" x2={width - 1} y2="5" style={{stroke: s.stroke}} strokeWidth="2.5" strokeDasharray={s.dash} strokeLinecap="round"/>
  </svg>;
}

/** Evidence's stance as its line; the word on reveal. */
export function StanceMark({stance, tabbable = true, extra}: {stance: string; tabbable?: boolean; extra?: ReactNode}): ReactElement {
  const s = STANCE[stanceOf(stance)];
  return <Reveal tabbable={tabbable} label={s.word} detail={<><b>{s.word}</b><span className="rv-row">{s.meaning}</span>{extra}</>}>
    <StanceGlyph stance={stance}/></Reveal>;
}
