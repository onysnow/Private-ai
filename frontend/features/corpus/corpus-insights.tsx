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

// Asked for when the screen opens (sweep 30 Oct: a heading with only a button showed nothing). The server answers
// "off" and "nothing sent yet" itself; only a case already sent to OpenAleph asks OpenAleph, which holds that corpus.
const STATE_WORD: Record<string, string> = {disabled: 'OpenAleph off', no_collection: 'Nothing sent yet', unavailable: 'Could not ask'};

export function CorpusInsights({investigationId}: {investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const path = {investigation_id: investigationId};
  const [status, setStatus] = useState('');
  const insights = useQuery({...getCorpusInsightsOptions({path}), enabled: Boolean(investigationId)});
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

  const data = insights.data;
  // Nothing to list (OpenAleph off, nothing sent, or no names found): the box takes the rail's free height and says
  // why in a few big words, the sentence on hover (sweep 30 Oct: the rail was empty below three small boxes).
  const quiet = Boolean(data && (data.state !== 'ok' || data.groups.length === 0));
  return <section className={`co-box co-stands${quiet ? ' quiet' : ''}`} aria-label="What stands out in the corpus">
    <h4 className="co-cap"><Reveal detail="The names OpenAleph's analysis found most often across this investigation's documents, and what they are mentioned alongside.">
      <span>What stands out</span></Reveal></h4>
    {data && data.state !== 'ok' && <Reveal className="co-big-state" detail={data.detail}><span className="co-state">{STATE_WORD[data.state] ?? data.state}</span></Reveal>}
    {insights.isPending && <p className="co-quiet">Asking OpenAleph…</p>}
    {insights.isError && <p className="co-alert">{errorMessage(insights.error, 'Could not load what stands out')}</p>}
    {data?.state === 'ok' && data.groups.length === 0 && <p className="co-big-state co-quiet">OpenAleph has not found names in these documents yet.</p>}
    {data?.groups.map(group => <div key={group.kind} className="co-group">
      <h5 className="co-sub">{group.label}</h5>
      <ul aria-label={group.label} className="co-terms">
        {group.terms.map(term => <li key={term.lead_key}>
          {term.alongside.length > 0 ? <Reveal className="co-term" detail={`Alongside: ${term.alongside.map(a => `${a.name} (${a.documents})`).join(', ')}`}><b>{term.name}</b></Reveal>
            : <b className="co-term">{term.name}</b>}
          <Reveal detail={`${term.documents} document(s)`}><span className="co-docs"><b>{term.documents}</b> docs</span></Reveal>
          {term.record_id
            ? <button type="button" className="co-link" onClick={() => openDossier(term.record_id as string)}>Open dossier</button>
            : term.lead_id ? <span className="co-quiet">Already a lead</span>
            : <button type="button" className="co-link" onClick={() => void makeLead(term)} disabled={createLead.isPending}>Add to leads</button>}
        </li>)}
      </ul>
    </div>)}
    {status && <p className="co-status" role="status">{status}</p>}
  </section>;
}
