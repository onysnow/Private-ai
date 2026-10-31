'use client';
// "Expand in the corpus" on a dossier (ADR-0006, Wave B): asks OpenAleph what surrounds the entity -- under its own
// copy in the investigation's collection and under every OpenAleph entity a reporter decided is the same -- and
// proposes the relationships and the entities at their far ends as OpenAleph findings. They wait in the review queue
// like any connector's findings; nothing becomes a record here. In the dossier's "More" fold: one line with the
// action as an icon, and what came back as rows.
import {useQueryClient} from '@tanstack/react-query';
import {ExternalLink, Telescope} from 'lucide-react';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {expandEntityInCorpus} from '../../lib/generated/sdk.gen';
import type {CorpusExpandOut} from '../../lib/generated/types.gen';
import {invalidateInvestigationData} from '../../lib/investigation-queries';
import {IconAct, IconLink, StateMark} from './dossier-parts';

type Props = {entityId: string};

export function CorpusExpand({entityId}: Props): ReactElement {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CorpusExpandOut | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const expand = async () => {
    setBusy(true);
    setProblem('');
    try {
      const reply = (await expandEntityInCorpus({path: {entity_id: entityId}, throwOnError: true})).data;
      setResult(reply);
      // New findings and leads belong to the case: its lists are read again.
      await invalidateInvestigationData(queryClient);
    } catch (error) {
      setResult(null);
      setProblem(errorMessage(error, 'Could not expand this entity in OpenAleph'));
    } finally {
      setBusy(false);
    }
  };

  return <div className="dsr-group">
    <div className="dsr-line">
      <Reveal detail="Asks OpenAleph what surrounds this party and proposes those links and parties as findings to review. Nothing becomes a record here.">
        <h4 className="dsr-group-title">OpenAleph corpus</h4></Reveal>
      <span className="dsr-acts shown">
        <IconAct icon={Telescope} label={busy ? 'Expanding…' : 'Expand in the corpus'} onClick={() => void expand()} disabled={busy}/>
      </span>
    </div>
    {problem && <p className="dsr-alert" role="alert">{problem}</p>}
    {result && <>
      <Reveal detail={result.skipped_own > 0 ? `${result.skipped_own} already in this investigation. Review them in the review queue.` : 'Review them in the review queue.'}>
        <p className="dsr-quiet">{result.relationships} link(s) and {result.neighbours} part{result.neighbours === 1 ? 'y' : 'ies'} proposed for review</p></Reveal>
      <ul className="dsr-rows">
        {result.findings.map(f => <li className="dsr-row" key={f.id}>
          <div className="dsr-line">
            <StateMark state={f.review_status}/>
            <Reveal className="dsr-grow" detail={`${f.kind === 'relationship' ? 'Link' : 'Party'} · ${f.schema ?? 'unknown type'}${f.collection_label ? ` · ${f.collection_label}` : ''}`}>
              <span className="dsr-text">{f.caption}</span></Reveal>
            {f.source_url && <span className="dsr-acts"><IconLink icon={ExternalLink} label="Open in OpenAleph" href={f.source_url} external/></span>}
          </div>
        </li>)}
      </ul>
    </>}
  </div>;
}
