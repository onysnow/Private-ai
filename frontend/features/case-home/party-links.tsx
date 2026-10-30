'use client';
// What the records hold between a decision's parties, for a decision with no passage of its own (a Red Flag's "records
// cannot show" part): Case home's Next up draws it beside the question, Decide in its evidence pane.
import type {ReactElement} from 'react';

import {PartyGlyph} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import type {DecisionItemOut, RelationshipOut} from '../../lib/generated/types.gen';
import {partyKind} from '../../lib/viz-tokens';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {Excerpt, pageOf} from './decision-card';
import {linkWord, linkYear} from './mini-network';

/** One link between two of a decision's parties: who, what (a word or two), when, and the passage that shows it. */
export type PartyLink = {key: string; from: {id: string; name: string; schema: string}; to: {id: string; name: string; schema: string}; word: string; year: string | null;
  quote: string | null; where: string; documentId: string | null; page: number | null};

/** The links the records hold between a decision's parties, a pair a row (each way apart), the ones with a passage first. */
export function partyLinks(edges: RelationshipOut[], parties: {id: string}[]): PartyLink[] {
  const ids = new Set(parties.map(p => p.id));
  const pairs = new Map<string, RelationshipOut[]>();
  for (const e of edges) {
    if (!e.source || !e.target || e.source.id === e.target.id || !ids.has(e.source.id) || !ids.has(e.target.id)) continue;
    const key = `${e.source.id}>${e.target.id}`;
    pairs.set(key, [...(pairs.get(key) ?? []), e]);
  }
  const rows = [...pairs.entries()].map(([key, list]): PartyLink => {
    // Both ends are present: the loop above kept only edges that have them.
    const source = list[0].source as NonNullable<RelationshipOut['source']>;
    const target = list[0].target as NonNullable<RelationshipOut['target']>;
    const attached = list.flatMap(e => e.provenance.evidence_attachments ?? []).map(a => a.evidence).find(ev => ev?.quote);
    // A source names its document as "document:<id>#page 94" (backend provenance).
    const cited = list.flatMap(e => e.provenance.sources).map(x => /document:([0-9a-f-]{36})(?:#page (\d+))?/i.exec(x)).find(Boolean);
    const years = list.map(linkYear).filter((y): y is string => Boolean(y)).sort();
    return {key, from: {id: source.id, name: source.caption, schema: source.schema}, to: {id: target.id, name: target.caption, schema: target.schema},
      word: linkWord(list) || 'linked', year: years[0] ?? null, quote: attached?.quote ?? null,
      where: [attached?.source?.title, attached?.locator].filter(Boolean).join(' · '),
      documentId: cited?.[1] ?? null, page: cited?.[2] ? Number(cited[2]) : pageOf(attached?.locator)};
  });
  return rows.sort((a, b) => Number(Boolean(b.quote)) - Number(Boolean(a.quote)));
}

/** Words of a party's name worth marking in a passage: the name, and a company's first word ("Tanore"). */
function nameTerms(names: string[]): string[] {
  return names.flatMap(n => [n, n.replace(/\s*\(.*\)$/, ''), ...(/^\S{5,}/.test(n) ? [n.split(/\s/)[0]] : [])]);
}

/** For a decision with no passage of its own (a Red Flag's "records cannot show" part): what the records do show
 *  between its parties, the first link's passage beside the question as a document's would be (mockup HOME_1). */
export function LinkEvidence({links, parties, limit = 4}: {links: PartyLink[]; parties: DecisionItemOut['parties']; limit?: number}): ReactElement {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const point = useWorkbenchStore(state => state.setPointedParty);
  const lead = links.find(l => l.quote);
  const shown = links.slice(0, limit);
  const end = (p: PartyLink['from']) => <span className="ch-link-end" onMouseEnter={() => point(p.id)}>
    <PartyGlyph kind={partyKind(p.schema)} size={14}/><span title={p.name}>{p.name}</span></span>;
  const open = (l: PartyLink) => { if (l.documentId) openDocument(l.documentId, l.page); };
  return <div className="ch-links-wrap">
    {lead?.quote && <blockquote className="ch-excerpt ch-link-quote">
      <Reveal detail={<span className="rv-mono">{lead.where || 'Source'}</span>}><Excerpt text={`“${lead.quote.trim()}”`} terms={nameTerms(parties.map(p => p.name))}/></Reveal>
      {lead.documentId && <button type="button" className="ch-link-page" onClick={() => open(lead)}>{lead.page ? `Page ${lead.page}` : 'Open'} <span aria-hidden="true">↗</span></button>}
    </blockquote>}
    <ul className="ch-links" aria-label="What the records show between them">
      {shown.map(l => <li key={l.key}><Reveal tabbable={false} describe={Boolean(l.quote)} className="ch-link-rv"
        detail={l.quote ? <><b>{l.where || 'Source'}</b><span className="rv-row">“{l.quote.trim()}”</span></> : <b>No passage attached yet</b>}>
        {/* A link with a document behind it opens it at the page; one without is words only. */}
        {l.documentId
          ? <button type="button" className="ch-link" onClick={() => open(l)}>{end(l.from)}<span className="ch-link-word">{l.word}{l.year ? ` · ${l.year}` : ''} <span aria-hidden="true">→</span></span>{end(l.to)}</button>
          : <span className="ch-link">{end(l.from)}<span className="ch-link-word">{l.word}{l.year ? ` · ${l.year}` : ''} <span aria-hidden="true">→</span></span>{end(l.to)}</span>}
      </Reveal></li>)}
    </ul>
    {links.length > shown.length && <p className="ch-quiet ch-links-more">{links.length - shown.length} more link{links.length - shown.length === 1 ? '' : 's'} between them</p>}
  </div>;
}
