'use client';
// What stands out in the investigation's corpus (ADR-0006, Wave C: OpenAleph's
// collection discovery; backend app/services/openaleph_discover.py): the
// people, companies, places and other names its analysis found most often
// across the documents, each with how many documents mention it and what it
// is mentioned alongside. A name the investigation already holds opens its
// dossier; any other can be made a lead, which the reporter then works like
// any lead. Nothing becomes a record or a lead on its own.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {
  createLeadEndpointMutation, getCorpusInsightsOptions, getCorpusInsightsQueryKey, listLeadsQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {CorpusInsightTermOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

/** The lead's own words: what OpenAleph found and where to start. */
export function leadDetail(term: CorpusInsightTermOut): string {
  const where = `OpenAleph's analysis found “${term.name}” in ${term.documents} document(s) of this investigation's corpus`;
  const alongside = term.alongside.slice(0, 3).map(a => a.name);
  return alongside.length ? `${where}, most often alongside ${alongside.join(', ')}.` : `${where}.`;
}

export function CorpusInsights({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const path = {investigation_id: investigationId};
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const insights = useQuery({...getCorpusInsightsOptions({path}), enabled: open && Boolean(investigationId)});
  const createLead = useMutation({...createLeadEndpointMutation()});

  const makeLead = async (term: CorpusInsightTermOut) => {
    try {
      await createLead.mutateAsync({body: {investigation_id: investigationId, title: term.name, detail: leadDetail(term),
        provider: 'openaleph', provider_record_id: term.lead_key}});
      setStatus(`“${term.name}” was added to leads.`);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: getCorpusInsightsQueryKey({path})}),
        queryClient.invalidateQueries({queryKey: listLeadsQueryKey({path})}),
      ]);
    } catch (error) {
      setStatus(errorMessage(error, 'Could not make the lead'));
    }
  };

  return <div className="candidate">
    <Reveal detail="The names OpenAleph's analysis found most often across this investigation's documents, and what they are mentioned alongside."><b>What stands out in the corpus</b></Reveal>
    {!open ? <Button onClick={() => setOpen(true)} disabled={!investigationId}>Show what stands out</Button> : <>
      {insights.isPending && <p className="muted">Asking OpenAleph…</p>}
      {insights.isError && <p className="muted">{errorMessage(insights.error, 'Could not load what stands out')}</p>}
      {insights.data && insights.data.state !== 'ok' && <p className="muted">{insights.data.detail}</p>}
      {insights.data?.state === 'ok' && insights.data.groups.length === 0 && <p className="muted">OpenAleph has not found names in these documents yet.</p>}
      {insights.data?.groups.map(group => <div key={group.kind}>
        <h5>{group.label}</h5>
        <ul aria-label={group.label}>
          {group.terms.map(term => <li key={term.lead_key}>
            {term.alongside.length > 0 ? <Reveal detail={`Alongside: ${term.alongside.map(a => `${a.name} (${a.documents})`).join(', ')}`}><b>{term.name}</b></Reveal> : <b>{term.name}</b>}
            {' '}<Reveal detail={`${term.documents} document(s)`}><small><b>{term.documents}</b></small></Reveal>
            <div className="actions">
              {term.record_id
                ? <Button variant="link" onClick={() => openDossier(term.record_id as string)}>Open dossier</Button>
                : term.lead_id ? <small>Already a lead</small>
                : <Button size="sm" variant="outline" onClick={() => void makeLead(term)} disabled={createLead.isPending}>Add to leads</Button>}
            </div>
          </li>)}
        </ul>
      </div>)}
      {status && <p className="muted" role="status">{status}</p>}
    </>}
  </div>;
}
