'use client';
// Load one of the small real cases (backend app/services/demo_cases.py): closed
// public cases, each its own investigation, there so the red-flag rules the 1MDB
// case cannot trigger are tried on real records too. Each downloads its public
// documents, adds the records quoted from them, then reads the documents in the
// background; this shows how far each has got.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {caseHref} from '../../lib/case-href';
import {listDemoCasesOptions, listDemoCasesQueryKey, listInvestigationsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {loadDemoCase} from '../../lib/generated/sdk.gen';
import type {DemoCaseOut} from '../../lib/generated/types.gen';

type CaseId = 'us-v-anise-structuring' | 'vekselberg-shell-network' | 'deripaska-en-rusal';

function megabytes(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export function DemoCasesLoader({onOpen}: {onOpen?: (investigationId: string) => void}): ReactElement | null {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState<{id: string; text: string} | null>(null);
  const list = useQuery({...listDemoCasesOptions(),
    refetchInterval: q => (busy || (q.state.data ?? []).some(c => c.progress.state === 'reading') ? 3000 : false)});
  const load = async (item: DemoCaseOut) => {
    setBusy(item.id); setProblem(null);
    try {
      const reply = (await loadDemoCase({path: {case_id: item.id as CaseId}, throwOnError: true})).data;
      await queryClient.invalidateQueries({queryKey: listDemoCasesQueryKey()});
      if (reply.state === 'failed') { setProblem({id: item.id, text: reply.error ?? 'Could not load the case'}); return; }
      await queryClient.invalidateQueries({queryKey: listInvestigationsQueryKey()});
      if (reply.investigation_id) onOpen?.(reply.investigation_id);
    } catch (error) {
      setProblem({id: item.id, text: errorMessage(error, 'Could not load the case')});
    } finally { setBusy(''); }
  };
  if (!list.data?.length) return null;
  return <ul className="mt-3 flex flex-col gap-4" data-testid="demo-cases">
    {list.data.map(item => {
      const p = item.progress;
      const loaded = Boolean(p.investigation_id);
      return <li key={item.id} className="one-mdb">
        <p className="one-mdb-what"><b>{item.title}.</b> {item.description}</p>
        {loaded ? <p className="one-mdb-state">
          {p.state === 'reading' ? <>Reading the documents: <b>{p.read} of {p.documents}</b> read{p.failed ? `, ${p.failed} could not be read` : ''}. </>
            : <>Loaded: {p.documents} document{p.documents === 1 ? '' : 's'}, {p.claims} claims, {p.leads} leads. </>}
          <a href={caseHref('/', p.investigation_id ?? '')} onClick={e => { if (onOpen && p.investigation_id) { e.preventDefault(); onOpen(p.investigation_id); } }}>Open the case</a>
        </p> : <button type="button" className="one-mdb-load" onClick={() => void load(item)} disabled={Boolean(busy)}>
          {busy === item.id ? 'Downloading the documents and adding the records…' : 'Load this case'}
        </button>}
        {!loaded && busy !== item.id && <small className="one-mdb-note">
          Downloads {item.documents} document{item.documents === 1 ? '' : 's'} ({megabytes(item.bytes)}) from {item.publishers.join(', ')}.
        </small>}
        {problem?.id === item.id && <p role="alert">{problem.text}</p>}
      </li>;
    })}
  </ul>;
}
