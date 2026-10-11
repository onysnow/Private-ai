'use client';
// Load the 1MDB case (backend app/services/demo_1mdb.py): a real, closed
// investigation built from 11 public records, to check every part of the app on
// real material. Downloads the documents, adds the records, then reads the
// documents in the background; this shows how far it has got.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {get1MdbOptions, get1MdbQueryKey, listInvestigationsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {load1Mdb} from '../../lib/generated/sdk.gen';

export function OneMdbLoader({onOpen, compact = false}: {onOpen?: (investigationId: string) => void; compact?: boolean}): ReactElement {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const progress = useQuery({...get1MdbOptions(), refetchInterval: q => (q.state.data?.state === 'reading' || busy ? 3000 : false)});
  const p = progress.data;
  const load = async () => {
    setBusy(true); setProblem('');
    try {
      const reply = (await load1Mdb({throwOnError: true})).data;
      queryClient.setQueryData(get1MdbQueryKey(), reply);
      if (reply.state === 'failed') { setProblem(reply.error ?? 'Could not load the 1MDB case'); return; }
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
      if (reply.investigation_id) onOpen?.(reply.investigation_id);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not load the 1MDB case'));
    } finally { setBusy(false); }
  };
  const loaded = Boolean(p?.investigation_id);
  return <div className={`one-mdb${compact ? ' compact' : ''}`} data-testid="one-mdb">
    {!compact && <p className="one-mdb-what"><b>The 1MDB case.</b> Malaysia’s state fund, about $4.5 billion diverted from 2009 to 2015. Built from public
      records: US Justice Department complaints, the Low and Ng indictment, Leissner’s charges, Goldman Sachs’s admitted statement of facts, a Federal
      Reserve order, Singapore and Swiss regulators’ findings, Malaysian, Singapore and Swiss judgments (some scanned, some in Malay, French or German),
      news articles and posts, photos, video and a podcast, a payments table, and emails rebuilt word for word from the filings. Allegations stay
      allegations; what was admitted or found is Supported.</p>}
    {loaded ? <p className="one-mdb-state">
      {p?.state === 'reading' ? <>Reading the documents: <b>{p.read} of {p.documents}</b> read{p.failed ? `, ${p.failed} could not be read` : ''}. </> : <>Loaded: {p?.documents} documents, {p?.claims} claims, {p?.leads} leads. </>}
      <a href={caseHref('/', p?.investigation_id ?? '')} onClick={e => { if (onOpen && p?.investigation_id) { e.preventDefault(); onOpen(p.investigation_id); } }}>Open the 1MDB case</a>
    </p> : <button type="button" className="one-mdb-load" onClick={() => void load()} disabled={busy}>
      {busy ? 'Downloading the documents and adding the records…' : 'Load the 1MDB case'}
    </button>}
    {loaded && Boolean(p?.not_downloaded?.length) && <p className="one-mdb-links">
      {p!.not_downloaded!.length === 1 ? 'One page' : `${p!.not_downloaded!.length} pages`} did not come back from the publisher when the case was loaded,
      so {p!.not_downloaded!.length === 1 ? 'it is' : 'they are'} kept as a link and not read. The passages quoted from {p!.not_downloaded!.length === 1 ? 'it' : 'them'} still
      stand. Open {p!.not_downloaded!.length === 1 ? 'it' : 'them'} yourself:{' '}
      {p!.not_downloaded!.map((page, i) => <span key={page.url ?? i}>{i ? ', ' : ''}<a href={page.url ?? '#'} target="_blank" rel="noreferrer">{page.title}</a></span>)}.
    </p>}
    {!loaded && !busy && <small className="one-mdb-note">Downloads about 16 MB from justice.gov, courtlistener.com, federalreserve.gov, mas.gov.sg and finma.ch.</small>}
    {problem && <p role="alert">{problem}</p>}
  </div>;
}
