'use client';
// The Wire's detail panel for a link (mockup SEE_1, research §2.2 and §2.6), drawn by React beside the map
// (wire-engine.ts says which link). It holds: the link as a sentence; its status (shape and word) and what its
// sources say; the evidence itself as the page with the quoted words lit (a PDF page drawn by the API, as on Case
// home's decision card), else the quote as a clip; the source lines with mono locators; one primary action, Open the
// source, then Chain of Custody and More; the Red Flag it is part of with its innocent explanation; and the strip
// "How is X linked to Y?": party → verb chip → party, the weak link named, with Add to To check.
// A link the app worked out says so ("worked out by the app"), names the rule and the stored links it came from,
// and is never offered as a reviewed fact.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {getChecksOptions, getChecksQueryKey, howAreTheyConnectedOptions, keepLinkCheckMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {ChainOut, RelationshipOut, WireLinkFlagOut, WireQuoteOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {PagePicture} from '../case-home/decision-card';
import {SURE, drawerSentence, fmtDate} from './wire-engine';
import type {LinkSure, LinkView, WLink, WireApi} from './wire-engine';

type Certainty = ChainOut['weakest'];
const SURE_OF: Record<Certainty, LinkSure> = {supported: 'shown', unsupported: 'unshown', contested: 'disputed'};
const STRENGTH: Record<Certainty, number> = {supported: 0, unsupported: 1, contested: 2};

/** The verb on a chain's step, from the link the map holds (its role first), else its kind. */
export function stepVerb(link: WLink | undefined, schema: string): string {
  if (link?.role) return link.role.slice(0, 28);
  if (schema === 'Ownership') return link?.pct ? `owns ${link.pct.replace(/%$/, '')}%` : 'owns';
  if (schema === 'Directorship') return 'director of';
  if (schema === 'Payment') return 'paid';
  if (schema === 'Employment') return 'works for';
  if (schema === 'Membership') return 'member of';
  if (schema === 'Family' || schema === 'Associate') return schema.toLowerCase();
  return 'linked to';
}

/** A chain's strength in words, from its weakest link up (research §2.6). */
export function chainStrength(chain: ChainOut): string {
  const unshown = chain.links.filter(s => s.certainty === 'unsupported').length;
  if (chain.links.some(s => s.certainty === 'contested')) return 'Includes a disputed link';
  if (unshown) return `Rests on ${unshown} unshown link${unshown > 1 ? 's' : ''}`;
  return 'Every link shown';
}

/** Strongest first, then shortest (research §2.6: a strong long chain ranks above a short weak one). */
export function sortChains(chains: ChainOut[]): ChainOut[] {
  return chains.slice().sort((x, y) => STRENGTH[x.weakest] - STRENGTH[y.weakest]
    || x.links.filter(s => s.certainty !== 'supported').length - y.links.filter(s => s.certainty !== 'supported').length
    || x.links.length - y.links.length);
}

function SureChip({sure}: {sure: LinkSure}): ReactElement {
  return <span className={`tw-sure s-${sure}`}><i aria-hidden="true">{SURE[sure].g}</i> {SURE[sure].n}</span>;
}

/** "How is X linked to Y?": the chains from GET /investigations/{id}/paths as strips; pointing at one lights it on the
 * map, Enter keeps it lit. */
export function HowLinked({investigationId, a, b, api, open = false}: {investigationId: string; a: string; b: string; api: WireApi; open?: boolean}): ReactElement {
  const [maxLen, setMaxLen] = useState(4);
  const [all, setAll] = useState(open);
  const [kept, setKept] = useState<number | null>(null);
  const [added, setAdded] = useState<Record<string, 'sent' | 'done' | string>>({});
  useEffect(() => { setMaxLen(4); setAll(open); setKept(null); }, [a, b, open]);
  const query = useQuery({...howAreTheyConnectedOptions({path: {investigation_id: investigationId}, query: {from: a, to: b, max_len: maxLen}}), retry: false});
  const chains = useMemo(() => sortChains(query.data?.chains ?? []), [query.data]);
  // Kept in To check once (POST /relationships/{id}/to-check); the reply is To check's own list, so that panel shows
  // it at once, and a link already in To check says so here.
  const queryClient = useQueryClient();
  const checksPath = {investigation_id: investigationId};
  const checks = useQuery({...getChecksOptions({path: checksPath}), enabled: Boolean(investigationId)});
  const inToCheck = useMemo(() => new Set((checks.data?.items ?? []).filter(i => i.kind === 'link' && i.relationship_id).map(i => i.relationship_id!)),
    [checks.data]);
  const keep = useMutation({...keepLinkCheckMutation(), onSuccess: data => queryClient.setQueryData(getChecksQueryKey({path: checksPath}), data)});
  const ids = (c: ChainOut) => c.links.map(s => s.id);
  const light = (c: ChainOut | null) => api.lightLinks(c ? ids(c) : kept !== null && chains[kept] ? ids(chains[kept]) : null);
  const toCheck = (id: string) => {
    setAdded(x => ({...x, [id]: 'sent'}));
    keep.mutate({path: {relationship_id: id}}, {
      onSuccess: () => setAdded(x => ({...x, [id]: 'done'})),
      onError: e => setAdded(x => ({...x, [id]: errorMessage(e, 'Could not add it to To check')})),
    });
  };
  const shown = all ? chains : chains.slice(0, 1);
  return <section className="tw-how" aria-label={`How is ${api.name(a)} linked to ${api.name(b)}?`}>
    <h3>How is {api.name(a)} linked to {api.name(b)}?</h3>
    {query.isPending && <p className="tw-ld-quiet" aria-busy="true">Finding the chains…</p>}
    {query.isError && <p className="tw-ld-quiet" role="alert">{errorMessage(query.error, 'The chains could not be found')}</p>}
    {query.data && !chains.length && <p className="tw-ld-quiet">No chain of up to {maxLen} links joins them.{' '}
      {maxLen < 6 ? <><button type="button" className="tw-ld-link" onClick={() => setMaxLen(6)}>Try 6</button>, or look outside the case.</> : 'Look outside the case.'}</p>}
    <ol className="tw-chains" onMouseLeave={() => light(null)}>
      {shown.map((c, n) => {
        const i = chains.indexOf(c);
        const weak = c.links.find(s => s.certainty === 'contested') ?? c.links.find(s => s.certainty === 'unsupported');
        const weakVerb = weak ? stepVerb(api.link(weak.id), weak.schema) : '';
        return <li key={ids(c).join('|')} tabIndex={0} className={kept === i ? 'kept' : undefined} aria-label={`Chain ${n + 1}: ${chainStrength(c)}`}
          onMouseEnter={() => light(c)} onFocus={() => light(c)}
          onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); setKept(kept === i ? null : i); api.lightLinks(kept === i ? null : ids(c)); } }}>
          <div className="tw-strip">
            {c.parties.map((p, j) => {
              const step = c.links[j];
              const fwd = step ? step.from === p.id : true;
              return <span key={`${p.id}-${j}`} className="tw-strip-part">
                <button type="button" className="tw-pt" onClick={() => api.centre(p.id)}>{api.name(p.id) || p.name}</button>
                {step && <span className={`tw-vb s-${SURE_OF[step.certainty]}`} title={SURE[SURE_OF[step.certainty]].n}>
                  {fwd ? '' : '← '}<i aria-hidden="true">{SURE[SURE_OF[step.certainty]].g}</i> {stepVerb(api.link(step.id), step.schema)}{fwd ? ' →' : ''}</span>}
              </span>;
            })}
          </div>
          <p className="tw-strength">{chainStrength(c)}{c.links.length > 1 ? ` · ${c.links.length} links` : ''}</p>
          {weak && <p className="tw-break">
            <span aria-hidden="true">{weak.certainty === 'contested' ? '✕' : '○'}</span> The chain breaks at “{weakVerb}”: {weak.certainty === 'contested' ? 'its sources disagree.' : 'no reviewed source yet.'}{' '}
            {added[weak.id] === 'done' || inToCheck.has(weak.id)
              ? <><span className="tw-ld-ok">Added to To check ✓</span>{' '}<Link className="tw-ld-link" href={caseHref('/check#to-check', investigationId)}>Open To check →</Link></>
              : <button type="button" className="tw-ld-link" disabled={added[weak.id] === 'sent'} onClick={() => toCheck(weak.id)}>Add to To check →</button>}
            {added[weak.id] && !['sent', 'done'].includes(added[weak.id]) && <span role="alert"> {added[weak.id]}</span>}
          </p>}
        </li>;
      })}
    </ol>
    {chains.length > 1 && <button type="button" className="tw-ld-link tw-more-chains" onClick={() => setAll(!all)}>
      {all ? 'Only the strongest chain' : `${chains.length - 1} more chain${chains.length > 2 ? 's' : ''}`}</button>}
    {query.data?.truncated && <p className="tw-ld-quiet">Only the first {query.data.chains.length} of {query.data.total} chains are listed.</p>}
  </section>;
}

function Evidence({q}: {q: WireQuoteOut}): ReactElement {
  // A PDF page the API draws with the quoted words lit; any other source, the quote as a clip with its words lit.
  if (q.document_id && q.pdf && q.page) {
    return <figure className="tw-scan">
      <PagePicture documentId={q.document_id} page={q.page} passage={q.q} width={360} alt={`${q.doc}, page ${q.page}, the quoted words lit`}/>
    </figure>;
  }
  return <figure className="tw-clip">
    <figcaption>{q.doc || 'Source'}</figcaption>
    <p><mark>{q.q}</mark></p>
  </figure>;
}

/** What the sources on the link say, in one line (SEE_1 "2 sources agree · reviewed by you, 6 Oct"). */
export function sourcesLine(edges: (RelationshipOut | undefined)[]): string {
  let supports = 0, against = 0, attached = 0;
  let last: {at: string; by: string} | null = null;
  for (const r of edges) {
    if (!r) continue;
    // An aggregate (reviewed duplicates) advisory carries the same counts when it has them.
    const adv = r.advisory as {relationship_evidence_review_counts?: Record<string, number>; relationship_evidence_attachment_count?: number};
    const counts = adv.relationship_evidence_review_counts ?? {};
    supports += counts.supports ?? 0;
    against += counts.contradicts ?? 0;
    attached += adv.relationship_evidence_attachment_count ?? 0;
    for (const h of r.provenance.evidence_review_history ?? []) if (!last || h.created_at > last.at) last = {at: h.created_at, by: h.reviewer_type ?? ''};
  }
  const parts: string[] = [];
  if (supports) parts.push(`${supports} source${supports > 1 ? 's' : ''} agree${supports > 1 ? '' : 's'}`);
  if (against) parts.push(`${against} disagree${against > 1 ? '' : 's'}`);
  if (!supports && !against) parts.push(attached ? `${attached} source${attached > 1 ? 's' : ''}, not reviewed yet` : 'No source attached yet');
  if (last) parts.push(`reviewed ${last.by === 'HUMAN' ? 'by you' : 'by the app'}, ${fmtDate(last.at.slice(0, 10)).replace(/ \d{4}$/, '')}`);
  return parts.join(' · ');
}

export function LinkDrawer({view, investigationId, api, edges, onClose}: {
  view: LinkView; investigationId: string; api: WireApi; edges: Record<string, RelationshipOut>; onClose: () => void;
}): ReactElement {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const openFlag = useWorkbenchStore(state => state.openFlag);
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const close = <button type="button" className="x" aria-label="Close" onClick={onClose}>✕</button>;

  if (view.kind === 'pair') {
    return <>
      <div className="tw-ld-top"><span className="cap">How are they linked?</span><span className="esc">Esc closes</span>{close}</div>
      <HowLinked investigationId={investigationId} a={view.a} b={view.b} api={api} open/>
      <p className="tw-ld-foot"><span>Shift-click another party to ask again</span></p>
    </>;
  }

  const l0 = view.links[0];
  const worked = l0.derived;
  const {verb, tail} = drawerSentence(view.fam, view.links, '');
  const quotes = view.links.flatMap(l => l.ev);
  const first = quotes.find(q => q.document_id && q.pdf && q.page) ?? quotes[0];
  const flags = [...new Map(view.links.flatMap(l => l.flags ?? []).map(f => [f.flag_id, f] as const)).values()];
  // A worked-out link's Red Flag is carried by the stored links it was worked out from.
  const ringFlag = worked?.flag_id ? worked.inputs.flatMap(id => api.link(id)?.flags ?? []).find(f => f.flag_id === worked.flag_id) : undefined;
  const other = view.s !== view.subject ? view.s : view.t;
  const openSource = () => {
    if (!first) return;
    if (first.document_id) openDocument(first.document_id, first.page ?? null);
    else if (first.evidence_id) openProvenance({title: first.doc || 'Evidence', kind: 'evidence', acceptedRecordType: 'evidence', acceptedRecordId: first.evidence_id});
  };
  const title = `${api.name(view.s)} ${verb} ${api.name(view.t)}`;

  return <>
    <div className="tw-ld-top"><span className="cap">Link · {view.index} of {view.total}</span><span className="esc">Esc closes</span>{close}</div>
    <h2><button type="button" className="tw-pt" onClick={() => api.centre(view.s)}>{api.name(view.s)}</button>{' '}
      <span className="vb">{verb}</span>{' '}
      <button type="button" className="tw-pt" onClick={() => api.centre(view.t)}>{api.name(view.t)}</button>{tail ? `, ${tail}` : ''}</h2>
    <p className="tw-ld-status">{view.sure && <SureChip sure={view.sure}/>}{' '}
      {worked ? <span>never stored as a reviewed fact</span> : <span>{sourcesLine(view.links.map(l => edges[l.id]))}</span>}</p>

    {worked && <section className="tw-worked" aria-label="How the app worked it out">
      <p>Worked out by the app from the rule <b>{worked.rule_name}</b>. {worked.rule_text}</p>
      <p>{worked.pct ? `${worked.pct}% through ${worked.paths} path${worked.paths > 1 ? 's' : ''}.` : `The share is not known: ${worked.share_unknown_because}.`}
        {worked.via.length ? ` Shortest path through ${worked.via.map(api.name).join(', ')}.` : ''}</p>
      <h3>From these stored links</h3>
      <ul>{worked.inputs.map(id => { const l = api.link(id); return <li key={id}>
        <button type="button" className="tw-ld-link" onClick={() => api.openLink(id)}>{l ? `${api.name(l.s)} ${stepVerb(l, l.schema)} ${api.name(l.t)}` : 'A link not on the map'}</button></li>; })}</ul>
    </section>}

    {!worked && (first ? <Evidence q={first}/> : <p className="tw-ld-quiet">No quote shows this link yet.</p>)}
    {!worked && quotes.length > 0 && <ul className="tw-sources">{quotes.map((q, i) => <li key={`${q.evidence_id ?? i}`}>
      <span>{q.doc || 'Source'}</span> · <code>{q.loc}{q.page && !q.loc.includes(`p.${q.page}`) ? ` · p.${q.page}` : ''}</code></li>)}</ul>}

    {!worked && <div className="acts">
      <button type="button" className="pri" disabled={!first} onClick={openSource}>Open the source</button>
      <button type="button" onClick={() => openProvenance({title, kind: 'relationship claims + provenance', traceRecordType: 'relationship', acceptedRecordId: l0.id})}>Chain of Custody</button>
      <details className="tw-more">
        <summary>More ▾</summary>
        <div role="menu">
          <button type="button" role="menuitem" onClick={() => api.openRecords(view.key)}>Every record on this link</button>
          <button type="button" role="menuitem" onClick={() => openDossier(view.s)}>Open {api.name(view.s)}&apos;s dossier</button>
          <button type="button" role="menuitem" onClick={() => openDossier(view.t)}>Open {api.name(view.t)}&apos;s dossier</button>
        </div>
      </details>
    </div>}

    {(ringFlag || (!worked && flags.length > 0)) && <section className="tw-ld-flag">
      <h3>Part of a Red Flag</h3>
      {(ringFlag ? [ringFlag] : flags.slice(0, 2)).map((f: WireLinkFlagOut) => <button type="button" key={f.flag_id} className="tw-flagcard" onClick={() => openFlag(f.flag_id)}>
        <span className={`flagchip ${f.level}`}>{f.level}</span> <b>{f.name}</b>
        {(f.path || f.text) && <span className="m">{f.path || f.text}</span>}
        {f.innocent && <span className="m"><b>Could be innocent:</b> {f.innocent}</span>}
      </button>)}
    </section>}

    {other !== view.subject && view.subject && <HowLinked investigationId={investigationId} a={other} b={view.subject} api={api}/>}
    <p className="tw-ld-foot"><span>J / K next link · Enter opens every record</span></p>
  </>;
}
