'use client';
// The link panel (SEE_1's right column), opened with The Wire's "One link" altitude: the link as a sentence with
// how sure it is, the page its first quote stands on drawn with the words lit, each source with its place and
// review, Open the source and Trace, and the Red Flag it is part of.
// The wire across the middle keeps every record on its line of dates; this panel is the record in focus.
import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getRelationshipSourcesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {WireLinkOut} from '../../lib/generated/types.gen';
import {PagePicture} from '../case-home/decision-card';
import {SURE, fmtDate, linkSentence} from './wire-engine';
import type {LinkInfo, OpenLink} from './wire-engine';

const STANCE: Record<string, string> = {supports: 'supports it', contradicts: 'says otherwise', context: 'context only', superseded: 'superseded'};

export function LinkPanel({link, info, onClose, openDocument, openFlag, traceEvidence}: {
  link: OpenLink;
  info: LinkInfo;
  onClose: () => void;
  openDocument: (documentId: string, page: number) => void;
  openFlag: (flagId: string) => void;
  traceEvidence: (evidenceId: string, title: string) => void;
}): ReactElement {
  const [at, setAt] = useState(0);
  useEffect(() => { setAt(0); }, [link.key]);
  const record: WireLinkOut | undefined = link.records[Math.min(at, link.records.length - 1)];
  const sources = useQuery({...getRelationshipSourcesOptions({path: {relationship_id: record?.id ?? ''}}), enabled: Boolean(record)});
  if (!record) return <aside className="tw-drawer tw-glass tw-linkpanel open" aria-label="The link"/>;
  const meta = info[record.id];
  const sure = meta ? SURE[meta.sure] : null;
  // A record can run from one of a party's accounts: the account is drawn on its holder.
  const [from, to] = link.aSide.includes(record.s) ? [link.a, link.b] : [link.b, link.a];
  const sentence = linkSentence(record.fam, [record], meta?.end ?? '');
  const evidence = sources.data?.evidence ?? [];
  const drawn = evidence.find(e => e.document_id && e.page);
  const n = link.records.length;

  return <aside className="tw-drawer tw-glass tw-linkpanel open" aria-label="The link">
    <button type="button" className="x" aria-label="Close" onClick={onClose}>✕</button>
    <div className="kind">Link{n > 1 ? ` · ${at + 1} of ${n}` : ''}</div>
    <h2><span>{from.name}</span> <i>{sentence}</i> <span>{to.name}</span></h2>
    <p className="tw-lp-status">
      {sure ? <span className={`sure s-${meta!.sure}`}><b aria-hidden="true">{sure.g}</b> {sure.n}</span> : null}
      <span>{evidence.length ? `${evidence.length} source${evidence.length === 1 ? '' : 's'}${evidence.filter(e => e.stance === 'supports').length > 1 ? ` · ${evidence.filter(e => e.stance === 'supports').length} agree` : ''}` : sources.isPending ? 'Reading its sources…' : 'No source attached yet'}</span>
    </p>
    {n > 1 ? <div className="tw-lp-step">
      <button type="button" onClick={() => setAt((at - 1 + n) % n)} aria-label="Previous record">‹</button>
      <span>{record.date ? fmtDate(record.date) : 'No date'}</span>
      <button type="button" onClick={() => setAt((at + 1) % n)} aria-label="Next record">›</button>
    </div> : null}
    {sources.isError ? <p role="alert">{errorMessage(sources.error, 'Its sources could not be read')}</p> : null}
    {drawn ? <figure className="tw-lp-scan">
      <PagePicture documentId={drawn.document_id!} page={drawn.page!} passage={drawn.quote} width={680} crop alt={`Page ${drawn.page} of ${drawn.filename}, the words marked`}/>
      <figcaption>{drawn.source_title || drawn.filename} · p.{drawn.page}</figcaption>
    </figure> : evidence.length ? <p className="tw-lp-noscan">No page to draw: {evidence.some(e => e.document_id) ? 'the quote was not found on a page of its file' : 'the sources were typed in, not read from a file'}.</p> : null}
    {evidence.length ? <ul className="tw-lp-sources">
      {evidence.map(e => <li key={e.evidence_id}>
        <b>{e.source_title || e.filename || 'Source'}</b>{e.locator ? ` · ${e.locator}` : e.page ? ` · p.${e.page}` : ''}
        {e.stance ? <span className="tw-lp-stance"> · {STANCE[e.stance] ?? e.stance}{e.reviewed_at ? `, reviewed ${fmtDate(e.reviewed_at.slice(0, 10))}` : ''}</span> : <span className="tw-lp-stance"> · not reviewed yet</span>}
        {e.quote ? <q>{e.quote.length > 140 ? `${e.quote.slice(0, 140)}…` : e.quote}</q> : null}
      </li>)}
    </ul> : null}
    <div className="acts">
      {drawn ? <button type="button" className="pri" onClick={() => openDocument(drawn.document_id!, drawn.page!)}>Open the source</button> : null}
      {evidence[0] ? <button type="button" onClick={() => traceEvidence(evidence[0].evidence_id, evidence[0].source_title || 'Evidence')}>Trace</button> : null}
    </div>
    {sources.data?.flags.length ? <>
      <h3>Part of a Red Flag</h3>
      <ul>{sources.data.flags.map(f => <li key={f.flag_id}><button type="button" className="flagrow" onClick={() => openFlag(f.flag_id)}>
        <span className={`flagchip ${f.level}`}>{f.level}</span> {f.text || f.id}</button></li>)}</ul>
    </> : null}
  </aside>;
}
