'use client';
// Marks for what TYPE a thing is, and for a file's fingerprint (Ony, 29 Oct: a type is inferred through the UI, an icon,
// shape or colour, and named on hover, focus or click; a hash is sub-text). Used by The Drop, Links & captures, the
// Reading and Listen rooms and the old Bring in panels (Library, Search, Connectors and the Dossier, OpenAleph corpus).
// A party's kind reuses the network's icons and ring colours (components/network/party-icons.ts, PARTY).
import {ArrowLeftRight, AtSign, Calendar, Circle, Fingerprint, Quote, User} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {KIND_ICON} from '../../components/network/party-icons';
import {Reveal} from '../../components/ui/reveal';
import {PARTY, partyKind} from '../../lib/viz-tokens';
import type {PartyKind} from '../../lib/viz-tokens';

/** A party's kind as its icon in its ring colour; the kind's name (and the record's schema) on hover. */
export function PartyMark({schema, kind, tabbable = true}: {schema?: string | null; kind?: PartyKind; tabbable?: boolean}): ReactElement {
  const k = kind ?? partyKind(schema);
  const look = PARTY[k];
  const Icon = KIND_ICON[k];
  const name = look.name;
  return <Reveal tabbable={tabbable} label={name} detail={<><b>{name}</b>{schema && schema !== name ? <span className="rv-row rv-mono">{schema}</span> : null}</>}>
    <span className="km-party" style={{color: look.ring, borderColor: look.ring}} aria-hidden="true">
      {Icon ? <Icon size={11} strokeWidth={2.2}/> : <i>·</i>}</span>
  </Reveal>;
}

const PROPOSAL: Record<string, {icon: LucideIcon; name: string; plural: string}> = {
  entity: {icon: User, name: 'Name', plural: 'Names'},
  claim: {icon: Circle, name: 'Claim', plural: 'Claims'},
  evidence: {icon: Quote, name: 'Quote', plural: 'Quotes'},
  relationship: {icon: ArrowLeftRight, name: 'Link', plural: 'Links'},
  event: {icon: Calendar, name: 'Date', plural: 'Dates'},
  identifier: {icon: AtSign, name: 'Email or phone', plural: 'Emails & phones'},
};

/** The name of a proposal kind (entity, claim, evidence…) in words. */
export const proposalKindName = (kind: string, plural = false): string => {
  const p = PROPOSAL[kind];
  return p ? (plural ? p.plural : p.name) : kind;
};

/** A proposal's kind as a bare icon, for a control that names the kind itself and wears the reveal. */
export function ProposalKindIcon({kind}: {kind: string}): ReactElement {
  const Icon = PROPOSAL[kind]?.icon;
  return <span className="km-kind" aria-hidden="true">{Icon ? <Icon size={13} strokeWidth={2}/> : '·'}</span>;
}

export function ProposalKindMark({kind, plural = false, tabbable = true, detail}: {kind: string; plural?: boolean; tabbable?: boolean; detail?: ReactNode}): ReactElement {
  const name = proposalKindName(kind, plural);
  return <Reveal tabbable={tabbable} label={name} detail={<><b>{name}</b>{detail ? <span className="rv-row">{detail}</span> : null}</>}>
    <ProposalKindIcon kind={kind}/>
  </Reveal>;
}

/** A fingerprint (SHA-256) as an icon with a copy button; the hash itself is in the reveal. */
export function FingerprintMark({hash, of, label = 'SHA-256'}: {hash: string; of?: string; label?: string}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(hash).then(() => setCopied(true)); };
  return <span className="km-fp">
    <Reveal label={`Fingerprint (${label})`} detail={<><b>{label}{of ? ` of ${of}` : ''}</b><span className="rv-row rv-mono">{hash}</span></>}>
      <span aria-hidden="true"><Fingerprint size={14} strokeWidth={1.8}/></span>
    </Reveal>
    <button type="button" className="km-copy" onClick={copy} aria-label="Copy the fingerprint">{copied ? '✓' : '⧉'}</button>
  </span>;
}
